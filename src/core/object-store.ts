import * as path from 'path';
import { ObjectType } from './types';
import { GitObject, Blob, Tree, Commit, Tag } from './object';
import { createObjectBuffer, parseObjectBuffer, hashObject } from '../utils/hash';
import { compress, decompress } from '../utils/compression';
import { exists, readFile, writeFile, mkdirp, readDir } from '../utils/fs';

/**
 * Object store manages reading and writing Git objects to disk
 */
export class ObjectStore {
  private objectsDir: string;

  constructor(private gitDir: string) {
    this.objectsDir = path.join(gitDir, 'objects');
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
   * Check if an object exists
   */
  hasObject(hash: string): boolean {
    return exists(this.getObjectPath(hash));
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
   * Write raw object data with type
   */
  writeRaw(type: ObjectType, content: Buffer): string {
    const hash = hashObject(type, content);
    const objectPath = this.getObjectPath(hash);

    if (!exists(objectPath)) {
      const buffer = createObjectBuffer(type, content);
      const compressed = compress(buffer);
      writeFile(objectPath, compressed);
    }

    return hash;
  }

  /**
   * Read a Git object from the store
   */
  readObject(hash: string): GitObject {
    const objectPath = this.getObjectPath(hash);

    if (!exists(objectPath)) {
      throw new Error(`Object not found: ${hash}`);
    }

    const compressed = readFile(objectPath);
    const data = decompress(compressed);
    const { type, content } = parseObjectBuffer(data);

    return this.deserialize(type as ObjectType, content);
  }

  /**
   * Read raw object data (type and content)
   */
  readRawObject(hash: string): { type: ObjectType; content: Buffer } {
    const objectPath = this.getObjectPath(hash);

    if (!exists(objectPath)) {
      throw new Error(`Object not found: ${hash}`);
    }

    const compressed = readFile(objectPath);
    const data = decompress(compressed);
    const { type, content } = parseObjectBuffer(data);

    return { type: type as ObjectType, content };
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
