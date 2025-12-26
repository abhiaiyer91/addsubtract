import * as zlib from 'zlib';
import * as crypto from 'crypto';
import { ObjectType } from '../types';
import {
  PackObject,
  PackHeader,
  PackObjectType,
  packTypeToObjectType,
  ProgressCallback,
} from './types';
import {
  parsePackHeader,
  readPackObjectHeader,
  readOfsOffset,
  verifyPackChecksum,
  applyDelta,
} from './pack';

/**
 * Hash a Git object using SHA-1 (Git's native format)
 * Pack files from Git servers always use SHA-1
 */
function hashObjectSha1(type: string, content: Buffer): string {
  const header = Buffer.from(`${type} ${content.length}\0`);
  const store = Buffer.concat([header, content]);
  return crypto.createHash('sha1').update(store).digest('hex');
}

/**
 * Result of parsing a pack file
 */
export interface ParsedPack {
  header: PackHeader;
  objects: ParsedObject[];
}

/**
 * Parsed object from pack file
 */
export interface ParsedObject {
  type: ObjectType;
  data: Buffer;
  hash: string;
  offset: number;
}

/**
 * Intermediate object during parsing (before delta resolution)
 */
interface IntermediateObject {
  type: PackObjectType;
  data: Buffer;
  offset: number;
  // For delta objects
  baseOffset?: number;
  baseHash?: string;
}

/**
 * Parse a pack file and extract all objects
 */
export class PackfileParser {
  private data: Buffer;
  private offset: number = 0;
  private objects: IntermediateObject[] = [];
  private resolvedObjects: Map<number, ParsedObject> = new Map();
  private hashToOffset: Map<string, number> = new Map();
  private progress?: ProgressCallback;

  constructor(data: Buffer, progress?: ProgressCallback) {
    this.data = data;
    this.progress = progress;
  }

  /**
   * Parse the pack file and return all objects
   */
  parse(): ParsedPack {
    // Verify checksum
    if (!verifyPackChecksum(this.data)) {
      throw new Error('Pack file checksum verification failed');
    }

    // Parse header
    const header = parsePackHeader(this.data);
    this.offset = 12; // Skip header

    // Parse all objects
    this.reportProgress('counting', 0, header.objectCount);
    
    for (let i = 0; i < header.objectCount; i++) {
      this.parseObject();
      this.reportProgress('receiving', i + 1, header.objectCount);
    }

    // Resolve deltas
    this.reportProgress('resolving', 0, this.objects.length);
    this.resolveDeltas();

    // Build result
    const parsedObjects: ParsedObject[] = [];
    for (const obj of this.resolvedObjects.values()) {
      parsedObjects.push(obj);
    }

    return { header, objects: parsedObjects };
  }

  /**
   * Parse a single object from the pack
   */
  private parseObject(): void {
    const objectOffset = this.offset;

    // Read object header
    const { type, size, bytesRead } = readPackObjectHeader(this.data, this.offset);
    this.offset += bytesRead;

    const obj: IntermediateObject = {
      type,
      data: Buffer.alloc(0),
      offset: objectOffset,
    };

    // Handle delta objects
    if (type === PackObjectType.OFS_DELTA) {
      const { value: baseOffset, bytesRead: ofsBytes } = readOfsOffset(this.data, this.offset);
      this.offset += ofsBytes;
      obj.baseOffset = objectOffset - baseOffset;
    } else if (type === PackObjectType.REF_DELTA) {
      // Read 20-byte base object hash
      const baseHash = this.data.slice(this.offset, this.offset + 20).toString('hex');
      this.offset += 20;
      obj.baseHash = baseHash;
    }

    // Decompress object data
    obj.data = this.decompressObject(size);

    this.objects.push(obj);
  }

  /**
   * Decompress zlib-compressed data from current position
   * Git pack files use zlib with header (not raw deflate)
   */
  private decompressObject(expectedSize: number): Buffer {
    // We need to find the end of the compressed data
    // zlib.inflateSync will consume exactly what it needs

    // Try to decompress with increasing window sizes
    let windowSize = Math.max(expectedSize * 2, 128);
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      try {
        const compressed = this.data.slice(this.offset, this.offset + windowSize);
        
        // Git pack files use zlib with header (starts with 0x78)
        // Use inflateSync (not inflateRawSync) for proper decompression
        let result: Buffer;

        try {
          result = zlib.inflateSync(compressed);
        } catch {
          // Fallback to raw deflate in case data doesn't have zlib header
          result = zlib.inflateRawSync(compressed);
        }

        // Calculate how many bytes were consumed
        // This is tricky with zlib - we need to find where the compressed data ends
        const consumed = this.findCompressedEnd(compressed, result.length);
        
        this.offset += consumed;
        return result;
      } catch (e: unknown) {
        if (e instanceof Error && (e.message.includes('unexpected end') || e.message.includes('need dictionary'))) {
          windowSize *= 2;
          attempts++;
          continue;
        }
        throw e;
      }
    }

    throw new Error('Failed to decompress pack object after multiple attempts');
  }

  /**
   * Find where compressed data ends by trying different lengths
   */
  private findCompressedEnd(compressed: Buffer, expectedOutputSize: number): number {
    // Binary search for the end of compressed data
    let low = 1;
    let high = compressed.length;
    let lastGood = high;
    
    // Determine if we should use inflateSync or inflateRawSync
    const useZlibHeader = compressed.length > 0 && compressed[0] === 0x78;
    const inflate = useZlibHeader ? zlib.inflateSync : zlib.inflateRawSync;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      
      try {
        const result = inflate(compressed.slice(0, mid));
        if (result.length === expectedOutputSize) {
          lastGood = mid;
          high = mid - 1;
        } else if (result.length < expectedOutputSize) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      } catch {
        low = mid + 1;
      }
    }

    return lastGood;
  }

  /**
   * Resolve all delta objects
   */
  private resolveDeltas(): void {
    let resolved = 0;
    const total = this.objects.length;

    // First pass: resolve non-delta objects
    for (const obj of this.objects) {
      if (obj.type !== PackObjectType.OFS_DELTA && obj.type !== PackObjectType.REF_DELTA) {
        const objectType = packTypeToObjectType(obj.type);
        if (!objectType) {
          throw new Error(`Unknown pack object type: ${obj.type}`);
        }

        const hash = hashObjectSha1(objectType, obj.data);
        const parsed: ParsedObject = {
          type: objectType,
          data: obj.data,
          hash,
          offset: obj.offset,
        };

        this.resolvedObjects.set(obj.offset, parsed);
        this.hashToOffset.set(hash, obj.offset);
        resolved++;
        this.reportProgress('resolving', resolved, total);
      }
    }

    // Second pass: resolve delta objects (may need multiple passes)
    let unresolvedCount = this.objects.length - resolved;
    let lastUnresolvedCount = unresolvedCount + 1;

    while (unresolvedCount > 0 && unresolvedCount < lastUnresolvedCount) {
      lastUnresolvedCount = unresolvedCount;

      for (const obj of this.objects) {
        if (this.resolvedObjects.has(obj.offset)) {
          continue;
        }

        const base = this.findBase(obj);
        if (!base) {
          continue;
        }

        // Apply delta
        const resolvedData = applyDelta(base.data, obj.data);
        const hash = hashObjectSha1(base.type, resolvedData);

        const parsed: ParsedObject = {
          type: base.type,
          data: resolvedData,
          hash,
          offset: obj.offset,
        };

        this.resolvedObjects.set(obj.offset, parsed);
        this.hashToOffset.set(hash, obj.offset);
        resolved++;
        unresolvedCount--;
        this.reportProgress('resolving', resolved, total);
      }
    }

    if (unresolvedCount > 0) {
      throw new Error(`Failed to resolve ${unresolvedCount} delta objects`);
    }
  }

  /**
   * Find the base object for a delta
   */
  private findBase(obj: IntermediateObject): ParsedObject | null {
    if (obj.baseOffset !== undefined) {
      return this.resolvedObjects.get(obj.baseOffset) || null;
    }

    if (obj.baseHash !== undefined) {
      const offset = this.hashToOffset.get(obj.baseHash);
      if (offset !== undefined) {
        return this.resolvedObjects.get(offset) || null;
      }
    }

    return null;
  }

  /**
   * Report progress
   */
  private reportProgress(phase: string, current: number, total: number): void {
    if (this.progress) {
      this.progress({
        phase: phase as 'counting' | 'receiving' | 'resolving',
        current,
        total,
      });
    }
  }
}

/**
 * Parse a pack file buffer
 */
export function parsePackfile(data: Buffer, progress?: ProgressCallback): ParsedPack {
  const parser = new PackfileParser(data, progress);
  return parser.parse();
}

/**
 * Extract objects from a pack without full parsing
 * Useful for streaming scenarios
 */
export function* iteratePackObjects(data: Buffer): Generator<{
  type: PackObjectType;
  size: number;
  offset: number;
}> {
  const header = parsePackHeader(data);
  let offset = 12;

  for (let i = 0; i < header.objectCount; i++) {
    const { type, size, bytesRead } = readPackObjectHeader(data, offset);
    const objectOffset = offset;
    offset += bytesRead;

    // Skip delta base reference
    if (type === PackObjectType.OFS_DELTA) {
      const { bytesRead: ofsBytes } = readOfsOffset(data, offset);
      offset += ofsBytes;
    } else if (type === PackObjectType.REF_DELTA) {
      offset += 20;
    }

    yield { type, size, offset: objectOffset };

    // Skip compressed data (we need to decompress to find the end)
    // This is expensive but necessary for iteration
    let windowSize = Math.max(size * 2, 128);
    let found = false;

    while (!found && offset + windowSize <= data.length) {
      try {
        const compressed = data.slice(offset, offset + windowSize);
        
        // Determine if we should use inflateSync or inflateRawSync
        const useZlibHeader = compressed.length > 0 && compressed[0] === 0x78;
        const inflate = useZlibHeader ? zlib.inflateSync : zlib.inflateRawSync;
        
        inflate(compressed);
        
        // Find actual end
        let low = 1;
        let high = windowSize;
        let lastGood = high;

        while (low <= high) {
          const mid = Math.floor((low + high) / 2);
          try {
            inflate(compressed.slice(0, mid));
            lastGood = mid;
            high = mid - 1;
          } catch {
            low = mid + 1;
          }
        }

        offset += lastGood;
        found = true;
      } catch {
        windowSize *= 2;
      }
    }

    if (!found) {
      throw new Error('Failed to find end of compressed object');
    }
  }
}
