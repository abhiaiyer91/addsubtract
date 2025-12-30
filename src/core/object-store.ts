import * as path from 'path';
import * as zlib from 'zlib';
import { ObjectType } from './types';
import { GitObject, Blob, Tree, Commit, Tag } from './object';
import { createObjectBuffer, parseObjectBuffer, hashObject } from '../utils/hash';
import { compress, decompress } from '../utils/compression';
import { exists, readFile, writeFile, mkdirp, readDir } from '../utils/fs';
import { packTypeToObjectType } from './protocol/types';
import { applyDelta } from './protocol/pack';

/**
 * Packfile index entry - maps hash to offset in packfile
 */
interface PackIndex {
  idxPath: string;
  packPath: string;
  hashes: Map<string, number>; // hash -> offset
}

/**
 * Object store manages reading and writing Git objects to disk
 */
export class ObjectStore {
  private objectsDir: string;
  private packIndexes: PackIndex[] | null = null;
  private packIndexesLoaded = false;

  constructor(private gitDir: string) {
    this.objectsDir = path.join(gitDir, 'objects');
  }

  /**
   * Load pack indexes (not the full packfiles)
   * The .idx file contains a mapping of object hashes to offsets
   */
  private loadPackIndexes(): void {
    if (this.packIndexesLoaded) return;
    this.packIndexesLoaded = true;
    this.packIndexes = [];

    const packDir = path.join(this.objectsDir, 'pack');
    if (!exists(packDir)) return;

    const idxFiles = readDir(packDir).filter(f => f.endsWith('.idx'));
    
    for (const idxFile of idxFiles) {
      try {
        const idxPath = path.join(packDir, idxFile);
        const packPath = idxPath.replace(/\.idx$/, '.pack');
        
        if (!exists(packPath)) continue;
        
        const hashes = this.parsePackIndex(idxPath);
        this.packIndexes.push({ idxPath, packPath, hashes });
      } catch (error) {
        console.error(`[ObjectStore] Failed to parse pack index ${idxFile}:`, error);
      }
    }
  }

  /**
   * Parse a v2 pack index file to get hash -> offset mapping
   */
  private parsePackIndex(idxPath: string): Map<string, number> {
    const data = readFile(idxPath);
    const hashes = new Map<string, number>();
    
    // Check for v2 index magic number
    const magic = data.readUInt32BE(0);
    if (magic !== 0xff744f63) {
      // v1 index - simpler format but rare
      console.warn(`[ObjectStore] v1 pack index not supported: ${idxPath}`);
      return hashes;
    }
    
    const version = data.readUInt32BE(4);
    if (version !== 2) {
      console.warn(`[ObjectStore] Unknown pack index version ${version}: ${idxPath}`);
      return hashes;
    }
    
    // v2 index format:
    // - 4 bytes: magic (0xff744f63)
    // - 4 bytes: version (2)
    // - 256 * 4 bytes: fanout table (cumulative count of objects for each first byte)
    // - N * 20 bytes: sorted SHA-1 hashes
    // - N * 4 bytes: CRC32 checksums
    // - N * 4 bytes: 32-bit offsets (or index into 64-bit table if MSB set)
    // - variable: 64-bit offset table (if any offsets > 2GB)
    // - 20 bytes: packfile SHA-1
    // - 20 bytes: index SHA-1
    
    // Read fanout table to get object count
    const fanoutOffset = 8;
    const objectCount = data.readUInt32BE(fanoutOffset + 255 * 4);
    
    // Hash table starts after fanout
    const hashTableOffset = fanoutOffset + 256 * 4;
    
    // Offset table starts after hashes and CRCs
    const offsetTableOffset = hashTableOffset + objectCount * 20 + objectCount * 4;
    
    // Read all hashes and their offsets
    for (let i = 0; i < objectCount; i++) {
      const hashOffset = hashTableOffset + i * 20;
      const hash = data.slice(hashOffset, hashOffset + 20).toString('hex');
      
      const offsetPos = offsetTableOffset + i * 4;
      let offset = data.readUInt32BE(offsetPos);
      
      // Check if MSB is set (indicating 64-bit offset)
      if (offset & 0x80000000) {
        // 64-bit offset - not commonly needed but handle it
        const largeOffsetIndex = offset & 0x7fffffff;
        const largeOffsetTableOffset = offsetTableOffset + objectCount * 4;
        offset = Number(data.readBigUInt64BE(largeOffsetTableOffset + largeOffsetIndex * 8));
      }
      
      hashes.set(hash, offset);
    }
    
    return hashes;
  }

  /**
   * Read a single object from a packfile at the given offset
   */
  private readPackObject(packPath: string, offset: number): { type: ObjectType; content: Buffer } {
    const packData = readFile(packPath);
    return this.readPackObjectAtOffset(packData, offset, new Map());
  }

  /**
   * Read object at offset, handling delta objects recursively
   */
  private readPackObjectAtOffset(
    packData: Buffer, 
    offset: number,
    cache: Map<number, { type: ObjectType; content: Buffer }>
  ): { type: ObjectType; content: Buffer } {
    // Check cache first (for delta base resolution)
    const cached = cache.get(offset);
    if (cached) return cached;

    let pos = offset;
    
    // Read object header (variable-length encoding)
    let byte = packData[pos++];
    const type = (byte >> 4) & 0x07;
    let size = byte & 0x0f;
    let shift = 4;
    
    while (byte & 0x80) {
      byte = packData[pos++];
      size |= (byte & 0x7f) << shift;
      shift += 7;
    }

    let result: { type: ObjectType; content: Buffer };

    if (type === 6) {
      // OFS_DELTA - offset delta
      byte = packData[pos++];
      let baseOffset = byte & 0x7f;
      while (byte & 0x80) {
        byte = packData[pos++];
        baseOffset = ((baseOffset + 1) << 7) | (byte & 0x7f);
      }
      
      const absoluteBaseOffset = offset - baseOffset;
      const base = this.readPackObjectAtOffset(packData, absoluteBaseOffset, cache);
      
      // Decompress delta data
      const deltaData = zlib.inflateSync(packData.slice(pos));
      const content = applyDelta(base.content, deltaData);
      
      result = { type: base.type, content };
    } else if (type === 7) {
      // REF_DELTA - reference delta (by hash)
      const baseHash = packData.slice(pos, pos + 20).toString('hex');
      pos += 20;
      
      // Need to find and read the base object
      const base = this.readFromPackByHash(baseHash);
      if (!base) {
        throw new Error(`Delta base not found: ${baseHash}`);
      }
      
      const deltaData = zlib.inflateSync(packData.slice(pos));
      const content = applyDelta(base.content, deltaData);
      
      result = { type: base.type, content };
    } else {
      // Regular object (commit, tree, blob, tag)
      const content = zlib.inflateSync(packData.slice(pos));
      const objectType = packTypeToObjectType(type);
      if (!objectType) {
        throw new Error(`Unknown pack object type: ${type}`);
      }
      result = { type: objectType, content };
    }

    cache.set(offset, result);
    return result;
  }

  /**
   * Find and read an object from packfiles by hash
   */
  private readFromPackByHash(hash: string): { type: ObjectType; content: Buffer } | null {
    this.loadPackIndexes();
    
    for (const index of this.packIndexes || []) {
      const offset = index.hashes.get(hash);
      if (offset !== undefined) {
        return this.readPackObject(index.packPath, offset);
      }
    }
    
    return null;
  }

  /**
   * Try to read an object from packfiles
   */
  private readFromPack(hash: string): { type: ObjectType; content: Buffer } | null {
    return this.readFromPackByHash(hash);
  }

  /**
   * Get the path for an object by its hash
   */
  private getObjectPath(hash: string): string {
    const dir = hash.slice(0, 2);
    const file = hash.slice(2);
    return path.join(this.objectsDir, dir, file);
  }

  /**
   * Check if an object exists (in loose objects or packfiles)
   */
  hasObject(hash: string): boolean {
    if (exists(this.getObjectPath(hash))) return true;
    
    // Check packfile indexes
    this.loadPackIndexes();
    for (const index of this.packIndexes || []) {
      if (index.hashes.has(hash)) return true;
    }
    return false;
  }

  /**
   * Write a Git object to the store
   */
  writeObject(obj: GitObject): string {
    const content = obj.serialize();
    const hash = hashObject(obj.type, content);
    const objectPath = this.getObjectPath(hash);

    if (!exists(objectPath)) {
      const buffer = createObjectBuffer(obj.type, content);
      const compressed = compress(buffer);
      writeFile(objectPath, compressed);
    }

    return hash;
  }

  /**
   * Write raw content as a blob
   */
  writeBlob(content: Buffer): string {
    const blob = new Blob(content);
    return this.writeObject(blob);
  }

  /**
   * Write a raw object (type + data) directly to the store
   * Used when importing objects from pack files (Git interop uses SHA-1)
   */
  writeRawObject(type: ObjectType, data: Buffer, expectedHash?: string): string {
    // When expectedHash is provided (from Git packfile), use it directly
    // This enables Git interop where remote objects use SHA-1
    const hash = expectedHash || hashObject(type, data);
    
    const objectPath = this.getObjectPath(hash);

    if (!exists(objectPath)) {
      const buffer = createObjectBuffer(type, data);
      const compressed = compress(buffer);
      writeFile(objectPath, compressed);
    }

    return hash;
  }

  /**
   * Alias for writeRawObject for backwards compatibility
   */
  writeRaw(type: ObjectType, content: Buffer): string {
    return this.writeRawObject(type, content);
  }

  /**
   * Read a Git object from the store (loose objects or packfiles)
   */
  readObject(hash: string): GitObject {
    const objectPath = this.getObjectPath(hash);

    // Try loose object first
    if (exists(objectPath)) {
      const compressed = readFile(objectPath);
      const data = decompress(compressed);
      const { type, content } = parseObjectBuffer(data);
      return this.deserialize(type as ObjectType, content);
    }

    // Fall back to packfiles
    const packed = this.readFromPack(hash);
    if (packed) {
      return this.deserialize(packed.type, packed.content);
    }

    throw new Error(`Object not found: ${hash}`);
  }

  /**
   * Read raw object data (type and content) from loose objects or packfiles
   */
  readRawObject(hash: string): { type: ObjectType; content: Buffer } {
    const objectPath = this.getObjectPath(hash);

    // Try loose object first
    if (exists(objectPath)) {
      const compressed = readFile(objectPath);
      const data = decompress(compressed);
      const { type, content } = parseObjectBuffer(data);
      return { type: type as ObjectType, content };
    }

    // Fall back to packfiles
    const packed = this.readFromPack(hash);
    if (packed) {
      return packed;
    }

    throw new Error(`Object not found: ${hash}`);
  }

  /**
   * Deserialize raw content into the appropriate object type
   */
  private deserialize(type: ObjectType, content: Buffer): GitObject {
    switch (type) {
      case 'blob':
        return Blob.deserialize(content);
      case 'tree':
        return Tree.deserialize(content);
      case 'commit':
        return Commit.deserialize(content);
      case 'tag':
        return Tag.deserialize(content);
      default:
        throw new Error(`Unknown object type: ${type}`);
    }
  }

  /**
   * Read object as specific type
   */
  readBlob(hash: string): Blob {
    const obj = this.readObject(hash);
    if (!(obj instanceof Blob)) {
      throw new Error(`Object ${hash} is not a blob`);
    }
    return obj;
  }

  readTree(hash: string): Tree {
    const obj = this.readObject(hash);
    if (!(obj instanceof Tree)) {
      throw new Error(`Object ${hash} is not a tree`);
    }
    return obj;
  }

  readCommit(hash: string): Commit {
    const obj = this.readObject(hash);
    if (!(obj instanceof Commit)) {
      throw new Error(`Object ${hash} is not a commit`);
    }
    return obj;
  }

  readTag(hash: string): Tag {
    const obj = this.readObject(hash);
    if (!(obj instanceof Tag)) {
      throw new Error(`Object ${hash} is not a tag`);
    }
    return obj;
  }

  /**
   * List all objects in the store
   */
  listObjects(): string[] {
    const objects: string[] = [];

    if (!exists(this.objectsDir)) {
      return objects;
    }

    const dirs = readDir(this.objectsDir);
    for (const dir of dirs) {
      if (dir.length !== 2) continue; // Skip non-object directories

      const dirPath = path.join(this.objectsDir, dir);
      const files = readDir(dirPath);
      for (const file of files) {
        objects.push(dir + file);
      }
    }

    return objects;
  }
}
