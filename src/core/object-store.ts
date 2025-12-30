import * as path from 'path';
import { ObjectType } from './types';
import { GitObject, Blob, Tree, Commit, Tag } from './object';
import { createObjectBuffer, parseObjectBuffer, hashObject } from '../utils/hash';
import { compress, decompress } from '../utils/compression';
import { exists, readFile, writeFile, mkdirp, readDir } from '../utils/fs';
import { PackfileParser, ParsedObject } from './protocol/packfile-parser';

/**
 * Object store manages reading and writing Git objects to disk
 */
export class ObjectStore {
  private objectsDir: string;
  private packCache: Map<string, ParsedObject> | null = null;
  private packCacheLoaded = false;

  constructor(private gitDir: string) {
    this.objectsDir = path.join(gitDir, 'objects');
  }

  /**
   * Load all objects from packfiles into cache
   */
  private loadPackfiles(): void {
    if (this.packCacheLoaded) return;
    this.packCacheLoaded = true;
    this.packCache = new Map();

    const packDir = path.join(this.objectsDir, 'pack');
    if (!exists(packDir)) return;

    const packFiles = readDir(packDir).filter(f => f.endsWith('.pack'));
    
    for (const packFile of packFiles) {
      try {
        const packPath = path.join(packDir, packFile);
        const packData = readFile(packPath);
        const parser = new PackfileParser(packData);
        const parsed = parser.parse();
        
        for (const obj of parsed.objects) {
          this.packCache.set(obj.hash, obj);
        }
      } catch (error) {
        console.error(`[ObjectStore] Failed to parse packfile ${packFile}:`, error);
      }
    }
  }

  /**
   * Try to read an object from packfiles
   */
  private readFromPack(hash: string): { type: ObjectType; content: Buffer } | null {
    this.loadPackfiles();
    
    const obj = this.packCache?.get(hash);
    if (!obj) return null;
    
    return { type: obj.type, content: obj.data };
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
    
    // Check packfiles
    this.loadPackfiles();
    return this.packCache?.has(hash) ?? false;
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
