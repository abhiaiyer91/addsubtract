import * as zlib from 'zlib';
import { ObjectType } from '../types';
import {
  PackObjectType,
  objectTypeToPackType,
  ProgressCallback,
} from './types';
import {
  writePackHeader,
  writePackObjectHeader,
  writeOfsOffset,
  calculatePackChecksum,
  createDelta,
} from './pack';

/**
 * Object to be packed
 */
export interface PackableObject {
  type: ObjectType;
  data: Buffer;
  hash: string;
}

/**
 * Options for pack file creation
 */
export interface PackWriterOptions {
  /**
   * Enable delta compression
   * @default true
   */
  useDelta?: boolean;

  /**
   * Maximum chain length for delta objects
   * @default 50
   */
  maxDeltaChain?: number;

  /**
   * Minimum object size to consider for delta compression
   * @default 50
   */
  minDeltaSize?: number;

  /**
   * Progress callback
   */
  progress?: ProgressCallback;

  /**
   * Pack file version
   * @default 2
   */
  version?: number;
}

/**
 * Intermediate representation of packed object
 */
interface PackedObject {
  type: PackObjectType;
  data: Buffer;
  offset: number;
  hash: string;
  // For delta objects
  baseOffset?: number;
  deltaDepth?: number;
}

/**
 * Create pack files from objects
 */
export class PackfileWriter {
  private objects: PackableObject[];
  private options: Required<PackWriterOptions>;
  private packedObjects: PackedObject[] = [];
  private hashToPackedIndex: Map<string, number> = new Map();

  constructor(objects: PackableObject[], options: PackWriterOptions = {}) {
    this.objects = objects;
    this.options = {
      useDelta: options.useDelta ?? true,
      maxDeltaChain: options.maxDeltaChain ?? 50,
      minDeltaSize: options.minDeltaSize ?? 50,
      progress: options.progress ?? (() => {}),
      version: options.version ?? 2,
    };
  }

  /**
   * Create a pack file from the objects
   */
  write(): Buffer {
    const total = this.objects.length;
    this.options.progress({ phase: 'counting', current: 0, total });

    // Sort objects for better delta compression
    const sortedObjects = this.sortObjects();

    // Group objects by type for delta compression
    const groupedByType = this.groupByType(sortedObjects);

    // Process each group
    let processed = 0;
    for (const [, objects] of groupedByType) {
      for (const obj of objects) {
        this.packObject(obj);
        processed++;
        this.options.progress({ phase: 'compressing', current: processed, total });
      }
    }

    // Build the pack file
    return this.buildPackFile();
  }

  /**
   * Sort objects for optimal packing
   * Similar types and sizes should be near each other for delta compression
   */
  private sortObjects(): PackableObject[] {
    return [...this.objects].sort((a, b) => {
      // First by type
      const typeOrder: Record<ObjectType, number> = {
        commit: 0,
        tree: 1,
        blob: 2,
        tag: 3,
      };

      const typeCompare = typeOrder[a.type] - typeOrder[b.type];
      if (typeCompare !== 0) return typeCompare;

      // Then by size (descending - larger objects first as better delta bases)
      return b.data.length - a.data.length;
    });
  }

  /**
   * Group objects by type
   */
  private groupByType(objects: PackableObject[]): Map<ObjectType, PackableObject[]> {
    const groups = new Map<ObjectType, PackableObject[]>();

    for (const obj of objects) {
      const group = groups.get(obj.type) || [];
      group.push(obj);
      groups.set(obj.type, group);
    }

    return groups;
  }

  /**
   * Pack a single object, possibly as a delta
   */
  private packObject(obj: PackableObject): void {
    const packType = objectTypeToPackType(obj.type);
    
    // Try to create a delta if enabled
    let deltaData: Buffer | null = null;
    let baseIndex: number | undefined;

    if (this.options.useDelta && obj.data.length >= this.options.minDeltaSize) {
      const deltaResult = this.findBestDelta(obj);
      if (deltaResult) {
        deltaData = deltaResult.delta;
        baseIndex = deltaResult.baseIndex;
      }
    }

    // Current offset in the pack file
    // This is calculated as the sum of all previous packed objects
    const offset = this.calculateCurrentOffset();

    if (deltaData && baseIndex !== undefined) {
      // Pack as OFS_DELTA
      const baseObject = this.packedObjects[baseIndex];
      const deltaDepth = (baseObject.deltaDepth || 0) + 1;

      // Check delta chain limit
      if (deltaDepth <= this.options.maxDeltaChain) {
        this.packedObjects.push({
          type: PackObjectType.OFS_DELTA,
          data: deltaData,
          offset,
          hash: obj.hash,
          baseOffset: baseObject.offset,
          deltaDepth,
        });
        this.hashToPackedIndex.set(obj.hash, this.packedObjects.length - 1);
        return;
      }
    }

    // Pack as full object
    this.packedObjects.push({
      type: packType,
      data: obj.data,
      offset,
      hash: obj.hash,
      deltaDepth: 0,
    });
    this.hashToPackedIndex.set(obj.hash, this.packedObjects.length - 1);
  }

  /**
   * Find the best delta base for an object
   */
  private findBestDelta(obj: PackableObject): { delta: Buffer; baseIndex: number } | null {
    let bestDelta: Buffer | null = null;
    let bestBaseIndex: number | undefined;
    let bestSaving = 0;

    // Look for potential bases among recently packed objects of the same type
    const packType = objectTypeToPackType(obj.type);
    
    // Check last N objects of the same type
    const maxCandidates = 10;
    let candidatesChecked = 0;

    for (let i = this.packedObjects.length - 1; i >= 0 && candidatesChecked < maxCandidates; i--) {
      const candidate = this.packedObjects[i];

      // Only consider same type (or base objects for delta chains)
      if (candidate.type !== packType && 
          candidate.type !== PackObjectType.OFS_DELTA && 
          candidate.type !== PackObjectType.REF_DELTA) {
        continue;
      }

      // Skip if already at max delta depth
      if ((candidate.deltaDepth || 0) >= this.options.maxDeltaChain) {
        continue;
      }

      candidatesChecked++;

      // Try to create delta
      const delta = createDelta(candidate.data, obj.data);
      if (delta) {
        const saving = obj.data.length - delta.length;
        if (saving > bestSaving) {
          bestDelta = delta;
          bestBaseIndex = i;
          bestSaving = saving;
        }
      }
    }

    if (bestDelta && bestBaseIndex !== undefined) {
      return { delta: bestDelta, baseIndex: bestBaseIndex };
    }

    return null;
  }

  /**
   * Calculate the current offset in the pack file
   */
  private calculateCurrentOffset(): number {
    // Start after header (12 bytes)
    let offset = 12;

    for (const obj of this.packedObjects) {
      offset += this.calculatePackedSize(obj);
    }

    return offset;
  }

  /**
   * Calculate the size of a packed object
   */
  private calculatePackedSize(obj: PackedObject): number {
    let size = 0;

    // Object header size (variable)
    size += this.calculateHeaderSize(obj.type, obj.data.length);

    // OFS_DELTA base offset
    if (obj.type === PackObjectType.OFS_DELTA && obj.baseOffset !== undefined) {
      const currentOffset = 12 + this.getPackedSizeUpTo(obj);
      const relativeOffset = currentOffset - obj.baseOffset;
      size += writeOfsOffset(relativeOffset).length;
    }

    // Compressed data
    const compressed = zlib.deflateSync(obj.data);
    size += compressed.length;

    return size;
  }

  /**
   * Get total packed size up to (but not including) an object
   */
  private getPackedSizeUpTo(targetObj: PackedObject): number {
    let size = 0;
    for (const obj of this.packedObjects) {
      if (obj === targetObj) break;
      size += this.calculatePackedSize(obj);
    }
    return size;
  }

  /**
   * Calculate header size for an object
   */
  private calculateHeaderSize(type: PackObjectType, size: number): number {
    let headerSize = 1; // First byte always present
    let remaining = size >> 4;

    while (remaining > 0) {
      headerSize++;
      remaining >>= 7;
    }

    return headerSize;
  }

  /**
   * Build the final pack file
   */
  private buildPackFile(): Buffer {
    const parts: Buffer[] = [];

    // Header
    parts.push(writePackHeader(this.packedObjects.length, this.options.version));

    // Objects
    let currentOffset = 12;
    for (const obj of this.packedObjects) {
      // Object header
      if (obj.type === PackObjectType.OFS_DELTA && obj.baseOffset !== undefined) {
        // Write OFS_DELTA header
        const header = writePackObjectHeader(obj.type, obj.data.length);
        parts.push(header);

        // Write base offset
        const relativeOffset = currentOffset - obj.baseOffset;
        const ofsOffset = writeOfsOffset(relativeOffset);
        parts.push(ofsOffset);

        currentOffset += header.length + ofsOffset.length;
      } else {
        const header = writePackObjectHeader(obj.type, obj.data.length);
        parts.push(header);
        currentOffset += header.length;
      }

      // Compressed data
      const compressed = zlib.deflateSync(obj.data);
      parts.push(compressed);
      currentOffset += compressed.length;

      this.options.progress({ 
        phase: 'writing', 
        current: parts.length, 
        total: this.packedObjects.length * 2 + 2 
      });
    }

    // Combine all parts
    const packContent = Buffer.concat(parts);

    // Calculate and append checksum
    const checksum = calculatePackChecksum(packContent);
    
    return Buffer.concat([packContent, checksum]);
  }
}

/**
 * Create a pack file from objects
 */
export function createPackfile(
  objects: PackableObject[],
  options?: PackWriterOptions
): Buffer {
  const writer = new PackfileWriter(objects, options);
  return writer.write();
}

/**
 * Create a thin pack (for network transfer)
 * Thin packs can reference base objects not in the pack
 */
export function createThinPackfile(
  objects: PackableObject[],
  baseObjects: Map<string, { type: ObjectType; data: Buffer }>,
  options?: PackWriterOptions
): Buffer {
  // For thin packs, we allow REF_DELTA to reference objects not in the pack
  // This is more complex and typically used for push operations
  
  // For now, create a regular pack
  // A full implementation would use REF_DELTA for objects whose base is in baseObjects
  return createPackfile(objects, options);
}

/**
 * Count objects that would be in a pack
 */
export function countPackObjects(hashes: string[]): number {
  return hashes.length;
}
