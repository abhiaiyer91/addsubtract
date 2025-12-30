/**
 * Git to wit repository migration
 * 
 * This module handles the migration of existing Git repositories to wit format.
 * It reads all Git objects (commits, trees, blobs, tags), re-hashes them using
 * SHA-256, and stores them in the .wit directory while maintaining the full
 * history and structure.
 */

import * as path from 'path';
import * as zlib from 'zlib';
import * as crypto from 'crypto';
import { exists, readFile, writeFile, mkdirp, readDir, isDirectory, readFileText } from '../utils/fs';
import { compress } from '../utils/compression';
import { ObjectType } from './types';
import { setHashAlgorithm, HashAlgorithm } from '../utils/hash';

/**
 * Migration options
 */
export interface MigrationOptions {
  gitDir: string;
  witDir: string;
  hashAlgorithm?: HashAlgorithm;
  onProgress?: (status: MigrationProgress) => void;
}

/**
 * Progress callback data
 */
export interface MigrationProgress {
  phase: 'scanning' | 'objects' | 'refs' | 'head' | 'complete';
  current: number;
  total: number;
  currentItem?: string;
  message?: string;
}

/**
 * Migration result
 */
export interface MigrationResult {
  commits: number;
  trees: number;
  blobs: number;
  tags: number;
  branches: number;
  tagRefs: number;
  hashMap: Map<string, string>; // SHA-1 -> SHA-256 (or identity if sha1 mode)
  errors: string[];
}

// PackIndexEntry and PackHeader interfaces defined for pack file parsing
// interface PackIndexEntry { offset: number; crc: number; }
// interface PackHeader { version: number; numObjects: number; }

/**
 * Git object types (as stored in pack files)
 */
const OBJ_COMMIT = 1;
const OBJ_TREE = 2;
const OBJ_BLOB = 3;
const OBJ_TAG = 4;
const OBJ_OFS_DELTA = 6;
const OBJ_REF_DELTA = 7;

/**
 * Migrate a Git repository to wit format
 */
export async function migrateFromGit(options: MigrationOptions): Promise<MigrationResult> {
  const { gitDir, witDir, onProgress } = options;
  const hashAlgorithm = options.hashAlgorithm || 'sha256';
  
  // Set hash algorithm for the migration
  setHashAlgorithm(hashAlgorithm);
  
  const result: MigrationResult = {
    commits: 0,
    trees: 0,
    blobs: 0,
    tags: 0,
    branches: 0,
    tagRefs: 0,
    hashMap: new Map(),
    errors: [],
  };

  // Validate git directory
  if (!exists(gitDir)) {
    throw new Error(`Git directory not found: ${gitDir}`);
  }

  if (!exists(path.join(gitDir, 'objects'))) {
    throw new Error(`Invalid Git directory (no objects): ${gitDir}`);
  }

  // Phase 1: Scan for objects
  onProgress?.({
    phase: 'scanning',
    current: 0,
    total: 0,
    message: 'Scanning Git objects...',
  });

  // Collect all objects (from loose objects and pack files)
  const allObjects = await collectAllGitObjects(gitDir, onProgress);
  
  // Phase 2: Migrate objects
  onProgress?.({
    phase: 'objects',
    current: 0,
    total: allObjects.size,
    message: 'Migrating objects...',
  });

  let objectCount = 0;
  const objectsDir = path.join(witDir, 'objects');
  mkdirp(objectsDir);

  // We need to process objects in dependency order:
  // 1. Blobs first (no dependencies)
  // 2. Trees (depend on blobs and other trees)
  // 3. Commits (depend on trees and parent commits)
  // 4. Tags (depend on commits)
  
  // First pass: categorize objects by type
  const blobs: Array<{ oldHash: string; type: ObjectType; content: Buffer }> = [];
  const trees: Array<{ oldHash: string; type: ObjectType; content: Buffer }> = [];
  const commits: Array<{ oldHash: string; type: ObjectType; content: Buffer }> = [];
  const tags: Array<{ oldHash: string; type: ObjectType; content: Buffer }> = [];

  for (const [oldHash, { type, content }] of allObjects) {
    switch (type) {
      case 'blob':
        blobs.push({ oldHash, type, content });
        break;
      case 'tree':
        trees.push({ oldHash, type, content });
        break;
      case 'commit':
        commits.push({ oldHash, type, content });
        break;
      case 'tag':
        tags.push({ oldHash, type, content });
        break;
    }
  }

  // Process blobs (no transformation needed)
  for (const { oldHash, type, content } of blobs) {
    objectCount++;
    onProgress?.({
      phase: 'objects',
      current: objectCount,
      total: allObjects.size,
      currentItem: `blob ${oldHash.slice(0, 8)}`,
    });

    const newHash = writeWitObject(witDir, type, content, hashAlgorithm);
    result.hashMap.set(oldHash, newHash);
    result.blobs++;
  }

  // Process trees (need to update hash references)
  // Trees may reference other trees, so we need multiple passes
  let treesProcessed = 0;
  let lastTreesProcessed = -1;
  
  while (treesProcessed < trees.length && treesProcessed !== lastTreesProcessed) {
    lastTreesProcessed = treesProcessed;
    
    for (const treeInfo of trees) {
      if (result.hashMap.has(treeInfo.oldHash)) continue;
      
      // Try to transform the tree - will fail if dependencies not ready
      const transformed = transformTreeContent(treeInfo.content, result.hashMap, hashAlgorithm);
      if (transformed === null) continue; // Dependencies not ready
      
      objectCount++;
      onProgress?.({
        phase: 'objects',
        current: objectCount,
        total: allObjects.size,
        currentItem: `tree ${treeInfo.oldHash.slice(0, 8)}`,
      });

      const newHash = writeWitObject(witDir, 'tree', transformed, hashAlgorithm);
      result.hashMap.set(treeInfo.oldHash, newHash);
      result.trees++;
      treesProcessed++;
    }
  }

  // Check for unprocessed trees (circular dependencies or missing objects)
  if (treesProcessed < trees.length) {
    for (const treeInfo of trees) {
      if (!result.hashMap.has(treeInfo.oldHash)) {
        result.errors.push(`Could not process tree ${treeInfo.oldHash}: missing dependencies`);
      }
    }
  }

  // Process commits (need to update tree and parent references)
  // Commits may reference parent commits, so we need multiple passes
  let commitsProcessed = 0;
  let lastCommitsProcessed = -1;
  
  while (commitsProcessed < commits.length && commitsProcessed !== lastCommitsProcessed) {
    lastCommitsProcessed = commitsProcessed;
    
    for (const commitInfo of commits) {
      if (result.hashMap.has(commitInfo.oldHash)) continue;
      
      // Try to transform the commit - will fail if dependencies not ready
      const transformed = transformCommitContent(commitInfo.content, result.hashMap);
      if (transformed === null) continue; // Dependencies not ready
      
      objectCount++;
      onProgress?.({
        phase: 'objects',
        current: objectCount,
        total: allObjects.size,
        currentItem: `commit ${commitInfo.oldHash.slice(0, 8)}`,
      });

      const newHash = writeWitObject(witDir, 'commit', transformed, hashAlgorithm);
      result.hashMap.set(commitInfo.oldHash, newHash);
      result.commits++;
      commitsProcessed++;
    }
  }

  // Check for unprocessed commits
  if (commitsProcessed < commits.length) {
    for (const commitInfo of commits) {
      if (!result.hashMap.has(commitInfo.oldHash)) {
        result.errors.push(`Could not process commit ${commitInfo.oldHash}: missing dependencies`);
      }
    }
  }

  // Process tags (need to update object reference)
  for (const tagInfo of tags) {
    objectCount++;
    onProgress?.({
      phase: 'objects',
      current: objectCount,
      total: allObjects.size,
      currentItem: `tag ${tagInfo.oldHash.slice(0, 8)}`,
    });

    const transformed = transformTagContent(tagInfo.content, result.hashMap);
    if (transformed === null) {
      result.errors.push(`Could not process tag ${tagInfo.oldHash}: missing target object`);
      continue;
    }

    const newHash = writeWitObject(witDir, 'tag', transformed, hashAlgorithm);
    result.hashMap.set(tagInfo.oldHash, newHash);
    result.tags++;
  }

  // Phase 3: Migrate refs (branches and tags)
  onProgress?.({
    phase: 'refs',
    current: 0,
    total: 0,
    message: 'Migrating refs...',
  });

  // Migrate branches
  const headsDir = path.join(gitDir, 'refs', 'heads');
  if (exists(headsDir)) {
    const branches = collectRefs(headsDir, '');
    for (const { name, hash } of branches) {
      const newHash = result.hashMap.get(hash);
      if (newHash) {
        const branchPath = path.join(witDir, 'refs', 'heads', name);
        mkdirp(path.dirname(branchPath));
        writeFile(branchPath, newHash + '\n');
        result.branches++;
      } else {
        result.errors.push(`Could not migrate branch ${name}: commit ${hash} not found`);
      }
    }
  }

  // Migrate tags
  const tagsDir = path.join(gitDir, 'refs', 'tags');
  if (exists(tagsDir)) {
    const tagRefs = collectRefs(tagsDir, '');
    for (const { name, hash } of tagRefs) {
      const newHash = result.hashMap.get(hash);
      if (newHash) {
        const tagPath = path.join(witDir, 'refs', 'tags', name);
        mkdirp(path.dirname(tagPath));
        writeFile(tagPath, newHash + '\n');
        result.tagRefs++;
      } else {
        result.errors.push(`Could not migrate tag ${name}: object ${hash} not found`);
      }
    }
  }

  // Migrate packed-refs if present
  const packedRefsPath = path.join(gitDir, 'packed-refs');
  if (exists(packedRefsPath)) {
    const packedRefs = readPackedRefs(packedRefsPath);
    for (const { name, hash } of packedRefs) {
      // Skip if already migrated via loose refs
      let refPath: string;
      if (name.startsWith('refs/heads/')) {
        refPath = path.join(witDir, name);
        if (!exists(refPath)) {
          const newHash = result.hashMap.get(hash);
          if (newHash) {
            mkdirp(path.dirname(refPath));
            writeFile(refPath, newHash + '\n');
            result.branches++;
          }
        }
      } else if (name.startsWith('refs/tags/')) {
        refPath = path.join(witDir, name);
        if (!exists(refPath)) {
          const newHash = result.hashMap.get(hash);
          if (newHash) {
            mkdirp(path.dirname(refPath));
            writeFile(refPath, newHash + '\n');
            result.tagRefs++;
          }
        }
      }
    }
  }

  // Phase 4: Migrate HEAD
  onProgress?.({
    phase: 'head',
    current: 0,
    total: 1,
    message: 'Migrating HEAD...',
  });

  const gitHeadPath = path.join(gitDir, 'HEAD');
  if (exists(gitHeadPath)) {
    const headContent = readFileText(gitHeadPath).trim();
    
    if (headContent.startsWith('ref: ')) {
      // Symbolic reference - copy as-is
      writeFile(path.join(witDir, 'HEAD'), headContent + '\n');
    } else {
      // Detached HEAD - update hash
      const newHash = result.hashMap.get(headContent);
      if (newHash) {
        writeFile(path.join(witDir, 'HEAD'), newHash + '\n');
      } else {
        // Fall back to default main branch
        writeFile(path.join(witDir, 'HEAD'), 'ref: refs/heads/main\n');
        result.errors.push(`Could not migrate detached HEAD ${headContent}: commit not found`);
      }
    }
  }

  // Save the hash mapping for future reference
  saveMigrationMap(witDir, result.hashMap);

  onProgress?.({
    phase: 'complete',
    current: objectCount,
    total: objectCount,
    message: 'Migration complete',
  });

  return result;
}

/**
 * Collect all Git objects from loose objects and pack files
 */
async function collectAllGitObjects(
  gitDir: string,
  onProgress?: (status: MigrationProgress) => void
): Promise<Map<string, { type: ObjectType; content: Buffer }>> {
  const objects = new Map<string, { type: ObjectType; content: Buffer }>();

  // Collect loose objects
  const objectsDir = path.join(gitDir, 'objects');
  const objectDirs = readDir(objectsDir).filter(d => /^[0-9a-f]{2}$/.test(d));
  
  for (const dir of objectDirs) {
    const dirPath = path.join(objectsDir, dir);
    if (!isDirectory(dirPath)) continue;
    
    const files = readDir(dirPath);
    for (const file of files) {
      const hash = dir + file;
      if (!/^[0-9a-f]{40}$/.test(hash)) continue;
      
      try {
        const objectPath = path.join(dirPath, file);
        const compressed = readFile(objectPath);
        const data = zlib.inflateSync(compressed);
        const { type, content } = parseGitObject(data);
        objects.set(hash, { type, content });
      } catch {
        // Skip corrupted objects
      }
    }
  }

  // Collect objects from pack files
  const packDir = path.join(objectsDir, 'pack');
  if (exists(packDir)) {
    const packFiles = readDir(packDir).filter(f => f.endsWith('.pack'));
    
    for (const packFile of packFiles) {
      const packPath = path.join(packDir, packFile);
      const indexPath = packPath.replace('.pack', '.idx');
      
      onProgress?.({
        phase: 'scanning',
        current: 0,
        total: 0,
        message: `Scanning pack file: ${packFile}`,
      });
      
      try {
        const packObjects = await readPackFile(packPath, indexPath, objects);
        for (const [hash, obj] of packObjects) {
          if (!objects.has(hash)) {
            objects.set(hash, obj);
          }
        }
      } catch {
        // Skip corrupted pack files
      }
    }
  }

  return objects;
}

/**
 * Parse a Git object buffer
 */
function parseGitObject(data: Buffer): { type: ObjectType; content: Buffer } {
  const nullIndex = data.indexOf(0);
  if (nullIndex === -1) {
    throw new Error('Invalid object format: no null byte found');
  }

  const header = data.slice(0, nullIndex).toString('utf8');
  const spaceIndex = header.indexOf(' ');
  if (spaceIndex === -1) {
    throw new Error('Invalid object header: no space found');
  }

  const type = header.slice(0, spaceIndex) as ObjectType;
  const content = data.slice(nullIndex + 1);

  return { type, content };
}

/**
 * Read a Git pack file and extract all objects
 */
async function readPackFile(
  packPath: string,
  indexPath: string,
  existingObjects: Map<string, { type: ObjectType; content: Buffer }>
): Promise<Map<string, { type: ObjectType; content: Buffer }>> {
  const result = new Map<string, { type: ObjectType; content: Buffer }>();
  
  if (!exists(packPath)) {
    return result;
  }

  const packData = readFile(packPath);
  
  // Verify pack header
  const signature = packData.slice(0, 4).toString('ascii');
  if (signature !== 'PACK') {
    throw new Error('Invalid pack file signature');
  }

  const version = packData.readUInt32BE(4);
  const numObjects = packData.readUInt32BE(8);

  if (version !== 2 && version !== 3) {
    throw new Error(`Unsupported pack version: ${version}`);
  }

  // Read pack index for hash -> offset mapping
  let hashToOffset: Map<string, number> | null = null;
  if (exists(indexPath)) {
    hashToOffset = readPackIndex(indexPath);
  }

  // Parse pack objects
  let offset = 12; // After header
  const deltaQueue: Array<{
    hash: string;
    baseHash?: string;
    baseOffset?: number;
    deltaData: Buffer;
    offset: number;
  }> = [];

  // First pass: collect non-delta objects and queue deltas
  for (let i = 0; i < numObjects; i++) {
    const startOffset = offset;
    
    // Read object header (variable length encoding)
    let byte = packData[offset++];
    const objType = (byte >> 4) & 7;
    // size and shift track variable-length encoding
    let shift = 4;

    while (byte & 0x80) {
      byte = packData[offset++];
      size |= (byte & 0x7f) << shift;
      shift += 7;
    }

    // Find the hash for this object (if we have an index)
    let objectHash: string | undefined;
    if (hashToOffset) {
      for (const [hash, off] of hashToOffset) {
        if (off === startOffset) {
          objectHash = hash;
          break;
        }
      }
    }

    if (objType === OBJ_OFS_DELTA) {
      // Offset delta - base object is at a relative offset
      let baseOffset = 0;
      byte = packData[offset++];
      baseOffset = byte & 0x7f;
      while (byte & 0x80) {
        byte = packData[offset++];
        baseOffset = ((baseOffset + 1) << 7) | (byte & 0x7f);
      }
      baseOffset = startOffset - baseOffset;

      // Decompress delta data
      const { data: deltaData, bytesRead } = decompressAt(packData, offset);
      offset += bytesRead;

      if (objectHash) {
        deltaQueue.push({
          hash: objectHash,
          baseOffset,
          deltaData,
          offset: startOffset,
        });
      }
    } else if (objType === OBJ_REF_DELTA) {
      // Reference delta - base object identified by hash
      const baseHash = packData.slice(offset, offset + 20).toString('hex');
      offset += 20;

      // Decompress delta data
      const { data: deltaData, bytesRead } = decompressAt(packData, offset);
      offset += bytesRead;

      if (objectHash) {
        deltaQueue.push({
          hash: objectHash,
          baseHash,
          deltaData,
          offset: startOffset,
        });
      }
    } else {
      // Regular object
      const { data: content, bytesRead } = decompressAt(packData, offset);
      offset += bytesRead;

      const type = packObjectTypeToString(objType);
      if (type && objectHash) {
        result.set(objectHash, { type, content });
      }
    }
  }

  // Build offset -> hash map for delta resolution
  const offsetToHash = new Map<number, string>();
  for (const [hash] of result) {
    if (hashToOffset) {
      const off = hashToOffset.get(hash);
      if (off !== undefined) {
        offsetToHash.set(off, hash);
      }
    }
  }

  // Second pass: resolve deltas
  let resolved = true;
  while (resolved && deltaQueue.length > 0) {
    resolved = false;
    
    for (let i = deltaQueue.length - 1; i >= 0; i--) {
      const delta = deltaQueue[i];
      
      // Find base object
      let base: { type: ObjectType; content: Buffer } | undefined;
      
      if (delta.baseHash) {
        base = result.get(delta.baseHash) || existingObjects.get(delta.baseHash);
      } else if (delta.baseOffset !== undefined) {
        const baseHash = offsetToHash.get(delta.baseOffset);
        if (baseHash) {
          base = result.get(baseHash) || existingObjects.get(baseHash);
        }
      }

      if (base) {
        // Apply delta
        const content = applyDelta(base.content, delta.deltaData);
        result.set(delta.hash, { type: base.type, content });
        offsetToHash.set(delta.offset, delta.hash);
        deltaQueue.splice(i, 1);
        resolved = true;
      }
    }
  }

  return result;
}

/**
 * Read a pack index file (version 2)
 */
function readPackIndex(indexPath: string): Map<string, number> {
  const data = readFile(indexPath);
  const result = new Map<string, number>();

  // Check for v2 index magic
  const magic = data.readUInt32BE(0);
  if (magic === 0xff744f63) {
    // Version 2 index
    const version = data.readUInt32BE(4);
    if (version !== 2) {
      return result; // Unsupported version
    }

    // Fan-out table (256 * 4 bytes)
    const fanoutOffset = 8;
    const numObjects = data.readUInt32BE(fanoutOffset + 255 * 4);

    // SHA-1 table
    const sha1Offset = fanoutOffset + 256 * 4;
    
    // CRC32 table (we skip this)
    const crcOffset = sha1Offset + numObjects * 20;
    
    // Offset table (32-bit)
    const offsetOffset = crcOffset + numObjects * 4;

    for (let i = 0; i < numObjects; i++) {
      const hash = data.slice(sha1Offset + i * 20, sha1Offset + (i + 1) * 20).toString('hex');
      const offset = data.readUInt32BE(offsetOffset + i * 4);
      
      // Handle large offsets (MSB set means use 64-bit offset table)
      if (offset & 0x80000000) {
        // Large offset - we'd need to read from the 64-bit table
        // For simplicity, skip these for now
        continue;
      }
      
      result.set(hash, offset);
    }
  } else {
    // Version 1 index (older format)
    const numObjects = data.readUInt32BE(255 * 4);
    
    for (let i = 0; i < numObjects; i++) {
      const entryOffset = 256 * 4 + i * 24;
      const offset = data.readUInt32BE(entryOffset);
      const hash = data.slice(entryOffset + 4, entryOffset + 24).toString('hex');
      result.set(hash, offset);
    }
  }

  return result;
}

/**
 * Decompress zlib data at a specific offset
 */
function decompressAt(data: Buffer, offset: number): { data: Buffer; bytesRead: number } {
  // We need to find where the compressed data ends
  // Try decompressing with increasing amounts of data
  for (let size = 1; size <= data.length - offset; size++) {
    try {
      const chunk = data.slice(offset, offset + size);
      const result = zlib.inflateSync(chunk);
      return { data: result, bytesRead: size };
    } catch {
      // Need more data
    }
  }
  
  throw new Error('Could not decompress data');
}

/**
 * Apply a git delta to a base object
 */
function applyDelta(base: Buffer, delta: Buffer): Buffer {
  let offset = 0;

  // Read source size (variable length) - used for validation
  let shift = 0;
  let byte: number;
  do {
    byte = delta[offset++];
    sourceSize |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);

  // Read target size (variable length)
  let targetSize = 0;
  shift = 0;
  do {
    byte = delta[offset++];
    targetSize |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);

  // Apply delta instructions
  const result: Buffer[] = [];
  let resultSize = 0;

  while (offset < delta.length) {
    const cmd = delta[offset++];
    
    if (cmd & 0x80) {
      // Copy from base
      let copyOffset = 0;
      let copySize = 0;

      if (cmd & 0x01) copyOffset = delta[offset++];
      if (cmd & 0x02) copyOffset |= delta[offset++] << 8;
      if (cmd & 0x04) copyOffset |= delta[offset++] << 16;
      if (cmd & 0x08) copyOffset |= delta[offset++] << 24;

      if (cmd & 0x10) copySize = delta[offset++];
      if (cmd & 0x20) copySize |= delta[offset++] << 8;
      if (cmd & 0x40) copySize |= delta[offset++] << 16;

      if (copySize === 0) copySize = 0x10000;

      result.push(base.slice(copyOffset, copyOffset + copySize));
      resultSize += copySize;
    } else if (cmd > 0) {
      // Insert new data
      result.push(delta.slice(offset, offset + cmd));
      offset += cmd;
      resultSize += cmd;
    } else {
      throw new Error('Invalid delta instruction');
    }
  }

  if (resultSize !== targetSize) {
    throw new Error(`Delta result size mismatch: ${resultSize} != ${targetSize}`);
  }

  return Buffer.concat(result);
}

/**
 * Convert pack object type number to string
 */
function packObjectTypeToString(type: number): ObjectType | null {
  switch (type) {
    case OBJ_COMMIT: return 'commit';
    case OBJ_TREE: return 'tree';
    case OBJ_BLOB: return 'blob';
    case OBJ_TAG: return 'tag';
    default: return null;
  }
}

/**
 * Transform tree content to update hash references
 */
function transformTreeContent(
  content: Buffer,
  hashMap: Map<string, string>,
  _hashAlgorithm: HashAlgorithm
): Buffer | null {
  const entries: Array<{ mode: string; name: string; hash: string }> = [];
  let offset = 0;
  const oldHashBytes = 20; // SHA-1 is always 20 bytes in Git

  while (offset < content.length) {
    // Find the space after mode
    const spaceIndex = content.indexOf(0x20, offset);
    if (spaceIndex === -1) break;

    const mode = content.slice(offset, spaceIndex).toString('utf8');

    // Find the null byte after name
    const nullIndex = content.indexOf(0, spaceIndex + 1);
    if (nullIndex === -1) break;

    const name = content.slice(spaceIndex + 1, nullIndex).toString('utf8');

    // Read the hash bytes (20 for SHA-1)
    const hashBytes = content.slice(nullIndex + 1, nullIndex + 1 + oldHashBytes);
    const oldHash = hashBytes.toString('hex');

    // Look up the new hash
    const newHash = hashMap.get(oldHash);
    if (!newHash) {
      return null; // Dependency not ready
    }

    entries.push({ mode, name, hash: newHash });
    offset = nullIndex + 1 + oldHashBytes;
  }

  // Rebuild tree content with new hashes (newHashBytes for reference: sha256=32, sha1=20)
  const parts: Buffer[] = [];
  
  for (const entry of entries) {
    const modeAndName = Buffer.from(`${entry.mode} ${entry.name}\0`);
    const hashBuf = Buffer.from(entry.hash, 'hex');
    parts.push(modeAndName, hashBuf);
  }

  return Buffer.concat(parts);
}

/**
 * Transform commit content to update hash references
 */
function transformCommitContent(
  content: Buffer,
  hashMap: Map<string, string>
): Buffer | null {
  const text = content.toString('utf8');
  const lines = text.split('\n');
  const newLines: string[] = [];
  let inMessage = false;

  for (const line of lines) {
    if (inMessage) {
      newLines.push(line);
      continue;
    }

    if (line === '') {
      inMessage = true;
      newLines.push(line);
      continue;
    }

    if (line.startsWith('tree ')) {
      const oldHash = line.slice(5);
      const newHash = hashMap.get(oldHash);
      if (!newHash) return null;
      newLines.push(`tree ${newHash}`);
    } else if (line.startsWith('parent ')) {
      const oldHash = line.slice(7);
      const newHash = hashMap.get(oldHash);
      if (!newHash) return null;
      newLines.push(`parent ${newHash}`);
    } else {
      newLines.push(line);
    }
  }

  return Buffer.from(newLines.join('\n'));
}

/**
 * Transform tag content to update hash references
 */
function transformTagContent(
  content: Buffer,
  hashMap: Map<string, string>
): Buffer | null {
  const text = content.toString('utf8');
  const lines = text.split('\n');
  const newLines: string[] = [];
  let inMessage = false;

  for (const line of lines) {
    if (inMessage) {
      newLines.push(line);
      continue;
    }

    if (line === '') {
      inMessage = true;
      newLines.push(line);
      continue;
    }

    if (line.startsWith('object ')) {
      const oldHash = line.slice(7);
      const newHash = hashMap.get(oldHash);
      if (!newHash) return null;
      newLines.push(`object ${newHash}`);
    } else {
      newLines.push(line);
    }
  }

  return Buffer.from(newLines.join('\n'));
}

/**
 * Write a wit object to the object store
 */
function writeWitObject(
  witDir: string,
  type: ObjectType,
  content: Buffer,
  hashAlgorithm: HashAlgorithm
): string {
  // Create the object buffer
  const header = Buffer.from(`${type} ${content.length}\0`);
  const store = Buffer.concat([header, content]);
  
  // Compute hash
  const hash = crypto.createHash(hashAlgorithm).update(store).digest('hex');
  
  // Write to object store
  const objectPath = path.join(witDir, 'objects', hash.slice(0, 2), hash.slice(2));
  
  if (!exists(objectPath)) {
    mkdirp(path.dirname(objectPath));
    const compressed = compress(store);
    writeFile(objectPath, compressed);
  }

  return hash;
}

/**
 * Collect refs from a directory
 */
function collectRefs(dir: string, prefix: string): Array<{ name: string; hash: string }> {
  const refs: Array<{ name: string; hash: string }> = [];
  
  if (!exists(dir)) return refs;
  
  const entries = readDir(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const refName = prefix ? `${prefix}/${entry}` : entry;
    
    if (isDirectory(fullPath)) {
      refs.push(...collectRefs(fullPath, refName));
    } else {
      try {
        const hash = readFileText(fullPath).trim();
        if (/^[0-9a-f]{40}$/.test(hash)) {
          refs.push({ name: refName, hash });
        }
      } catch {
        // Skip invalid refs
      }
    }
  }
  
  return refs;
}

/**
 * Read packed-refs file
 */
function readPackedRefs(filePath: string): Array<{ name: string; hash: string }> {
  const refs: Array<{ name: string; hash: string }> = [];
  
  try {
    const content = readFileText(filePath);
    for (const line of content.split('\n')) {
      if (line.startsWith('#') || !line.trim() || line.startsWith('^')) {
        continue;
      }
      
      const parts = line.split(' ');
      if (parts.length >= 2 && /^[0-9a-f]{40}$/.test(parts[0])) {
        refs.push({ name: parts[1], hash: parts[0] });
      }
    }
  } catch {
    // Ignore errors
  }
  
  return refs;
}

/**
 * Save migration hash map for future reference
 */
function saveMigrationMap(witDir: string, hashMap: Map<string, string>): void {
  const mapPath = path.join(witDir, 'git-migration-map');
  const lines: string[] = ['# Git SHA-1 to wit hash mapping'];
  
  for (const [oldHash, newHash] of hashMap) {
    lines.push(`${oldHash} ${newHash}`);
  }
  
  writeFile(mapPath, lines.join('\n') + '\n');
}

/**
 * Load migration hash map
 */
export function loadMigrationMap(witDir: string): Map<string, string> {
  const mapPath = path.join(witDir, 'git-migration-map');
  const hashMap = new Map<string, string>();
  
  if (!exists(mapPath)) {
    return hashMap;
  }
  
  try {
    const content = readFileText(mapPath);
    for (const line of content.split('\n')) {
      if (line.startsWith('#') || !line.trim()) {
        continue;
      }
      
      const parts = line.split(' ');
      if (parts.length === 2) {
        hashMap.set(parts[0], parts[1]);
      }
    }
  } catch {
    // Ignore errors
  }
  
  return hashMap;
}

/**
 * Check if a Git repository can be migrated
 */
export function canMigrateGitRepo(gitDir: string): { canMigrate: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // Check if directory exists
  if (!exists(gitDir)) {
    issues.push('Git directory does not exist');
    return { canMigrate: false, issues };
  }
  
  // Check for objects directory
  if (!exists(path.join(gitDir, 'objects'))) {
    issues.push('No objects directory found (invalid Git repository)');
    return { canMigrate: false, issues };
  }
  
  // Check for HEAD
  if (!exists(path.join(gitDir, 'HEAD'))) {
    issues.push('No HEAD file found (invalid Git repository)');
    return { canMigrate: false, issues };
  }
  
  // Check for shallow clone
  if (exists(path.join(gitDir, 'shallow'))) {
    issues.push('Shallow clone detected - migration will be incomplete');
  }
  
  // Check for submodules
  const modulesPath = path.join(path.dirname(gitDir), '.gitmodules');
  if (exists(modulesPath)) {
    issues.push('Submodules detected - nested repositories will not be migrated');
  }
  
  // Check for LFS
  const lfsDir = path.join(gitDir, 'lfs');
  if (exists(lfsDir)) {
    issues.push('Git LFS detected - large files may need manual migration');
  }
  
  return {
    canMigrate: !issues.some(i => i.includes('invalid Git repository')),
    issues,
  };
}

/**
 * Get migration statistics without performing migration
 */
export async function getMigrationStats(gitDir: string): Promise<{
  objectCount: number;
  hasPackFiles: boolean;
  branches: number;
  tags: number;
}> {
  let objectCount = 0;
  let hasPackFiles = false;
  let branches = 0;
  let tags = 0;
  
  // Count loose objects
  const objectsDir = path.join(gitDir, 'objects');
  if (exists(objectsDir)) {
    const objectDirs = readDir(objectsDir).filter(d => /^[0-9a-f]{2}$/.test(d));
    for (const dir of objectDirs) {
      const dirPath = path.join(objectsDir, dir);
      if (isDirectory(dirPath)) {
        const files = readDir(dirPath);
        objectCount += files.filter(f => /^[0-9a-f]{38}$/.test(f)).length;
      }
    }
  }
  
  // Check for pack files
  const packDir = path.join(objectsDir, 'pack');
  if (exists(packDir)) {
    const packFiles = readDir(packDir).filter(f => f.endsWith('.pack'));
    hasPackFiles = packFiles.length > 0;
    
    // Estimate object count from pack files
    for (const packFile of packFiles) {
      const packPath = path.join(packDir, packFile);
      try {
        const packData = readFile(packPath);
        if (packData.slice(0, 4).toString('ascii') === 'PACK') {
          objectCount += packData.readUInt32BE(8);
        }
      } catch {
        // Ignore errors
      }
    }
  }
  
  // Count branches
  const headsDir = path.join(gitDir, 'refs', 'heads');
  if (exists(headsDir)) {
    branches = collectRefs(headsDir, '').length;
  }
  
  // Count tags
  const tagsDir = path.join(gitDir, 'refs', 'tags');
  if (exists(tagsDir)) {
    tags = collectRefs(tagsDir, '').length;
  }
  
  // Also count packed refs
  const packedRefsPath = path.join(gitDir, 'packed-refs');
  if (exists(packedRefsPath)) {
    const packedRefs = readPackedRefs(packedRefsPath);
    for (const ref of packedRefs) {
      if (ref.name.startsWith('refs/heads/')) branches++;
      else if (ref.name.startsWith('refs/tags/')) tags++;
    }
  }
  
  return { objectCount, hasPackFiles, branches, tags };
}
