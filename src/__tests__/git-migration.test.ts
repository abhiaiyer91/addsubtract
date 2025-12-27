/**
 * Tests for Git to wit migration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { Repository } from '../core/repository';
import {
  migrateFromGit,
  canMigrateGitRepo,
  getMigrationStats,
  loadMigrationMap,
  MigrationProgress,
} from '../core/git-migration';
import {
  createTempDir,
  cleanupTempDir,
  createTestFile,
  suppressConsole,
  restoreCwd,
} from './test-utils';

describe('Git Migration', () => {
  let testDir: string | undefined;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
    testDir = undefined;
  });

  /**
   * Helper to create a minimal Git repository structure
   */
  function createMinimalGitRepo(dir: string): void {
    const gitDir = path.join(dir, '.git');
    fs.mkdirSync(path.join(gitDir, 'objects'), { recursive: true });
    fs.mkdirSync(path.join(gitDir, 'refs', 'heads'), { recursive: true });
    fs.mkdirSync(path.join(gitDir, 'refs', 'tags'), { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
  }

  /**
   * Helper to write a Git object (SHA-1)
   */
  function writeGitObject(gitDir: string, type: string, content: Buffer): string {
    const header = Buffer.from(`${type} ${content.length}\0`);
    const store = Buffer.concat([header, content]);
    const hash = crypto.createHash('sha1').update(store).digest('hex');
    
    const objectPath = path.join(gitDir, 'objects', hash.slice(0, 2), hash.slice(2));
    fs.mkdirSync(path.dirname(objectPath), { recursive: true });
    fs.writeFileSync(objectPath, zlib.deflateSync(store));
    
    return hash;
  }

  /**
   * Helper to create a Git blob
   */
  function createGitBlob(gitDir: string, content: string): string {
    return writeGitObject(gitDir, 'blob', Buffer.from(content));
  }

  /**
   * Helper to create a Git tree
   */
  function createGitTree(gitDir: string, entries: Array<{ mode: string; name: string; hash: string }>): string {
    const parts: Buffer[] = [];
    for (const entry of entries) {
      const modeAndName = Buffer.from(`${entry.mode} ${entry.name}\0`);
      const hashBytes = Buffer.from(entry.hash, 'hex');
      parts.push(modeAndName, hashBytes);
    }
    return writeGitObject(gitDir, 'tree', Buffer.concat(parts));
  }

  /**
   * Helper to create a Git commit
   */
  function createGitCommit(
    gitDir: string,
    treeHash: string,
    parentHashes: string[],
    message: string
  ): string {
    const lines: string[] = [];
    lines.push(`tree ${treeHash}`);
    for (const parent of parentHashes) {
      lines.push(`parent ${parent}`);
    }
    lines.push('author Test User <test@example.com> 1700000000 +0000');
    lines.push('committer Test User <test@example.com> 1700000000 +0000');
    lines.push('');
    lines.push(message);
    
    return writeGitObject(gitDir, 'commit', Buffer.from(lines.join('\n')));
  }

  /**
   * Helper to set a Git branch ref
   */
  function setGitBranch(gitDir: string, name: string, hash: string): void {
    const branchPath = path.join(gitDir, 'refs', 'heads', name);
    fs.mkdirSync(path.dirname(branchPath), { recursive: true });
    fs.writeFileSync(branchPath, hash + '\n');
  }

  /**
   * Helper to set a Git tag ref
   */
  function setGitTag(gitDir: string, name: string, hash: string): void {
    const tagPath = path.join(gitDir, 'refs', 'tags', name);
    fs.mkdirSync(path.dirname(tagPath), { recursive: true });
    fs.writeFileSync(tagPath, hash + '\n');
  }

  // ===========================================
  // VALIDATION TESTS
  // ===========================================
  describe('canMigrateGitRepo', () => {
    it('should detect valid Git repository', () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      
      const { canMigrate, issues } = canMigrateGitRepo(path.join(testDir, '.git'));
      
      expect(canMigrate).toBe(true);
    });

    it('should detect missing Git directory', () => {
      testDir = createTempDir();
      
      const { canMigrate, issues } = canMigrateGitRepo(path.join(testDir, '.git'));
      
      expect(canMigrate).toBe(false);
      expect(issues.some(i => i.includes('does not exist'))).toBe(true);
    });

    it('should detect invalid Git directory (no objects)', () => {
      testDir = createTempDir();
      const gitDir = path.join(testDir, '.git');
      fs.mkdirSync(gitDir);
      fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
      
      const { canMigrate, issues } = canMigrateGitRepo(gitDir);
      
      expect(canMigrate).toBe(false);
      expect(issues.some(i => i.includes('No objects directory'))).toBe(true);
    });

    it('should warn about shallow clone', () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      fs.writeFileSync(path.join(testDir, '.git', 'shallow'), 'abc123\n');
      
      const { canMigrate, issues } = canMigrateGitRepo(path.join(testDir, '.git'));
      
      expect(canMigrate).toBe(true); // Can still migrate, just incomplete
      expect(issues.some(i => i.includes('Shallow clone'))).toBe(true);
    });

    it('should warn about submodules', () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      fs.writeFileSync(path.join(testDir, '.gitmodules'), '[submodule "lib"]\n');
      
      const { canMigrate, issues } = canMigrateGitRepo(path.join(testDir, '.git'));
      
      expect(canMigrate).toBe(true);
      expect(issues.some(i => i.includes('Submodules'))).toBe(true);
    });
  });

  // ===========================================
  // STATS TESTS
  // ===========================================
  describe('getMigrationStats', () => {
    it('should count objects', async () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      const gitDir = path.join(testDir, '.git');
      
      // Create some objects
      const blob1 = createGitBlob(gitDir, 'content 1');
      const blob2 = createGitBlob(gitDir, 'content 2');
      
      const stats = await getMigrationStats(gitDir);
      
      expect(stats.objectCount).toBeGreaterThanOrEqual(2);
    });

    it('should count branches', async () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      const gitDir = path.join(testDir, '.git');
      
      // Create objects for a commit
      const blobHash = createGitBlob(gitDir, 'hello');
      const treeHash = createGitTree(gitDir, [
        { mode: '100644', name: 'hello.txt', hash: blobHash }
      ]);
      const commitHash = createGitCommit(gitDir, treeHash, [], 'Initial commit');
      
      // Set branches
      setGitBranch(gitDir, 'main', commitHash);
      setGitBranch(gitDir, 'feature', commitHash);
      
      const stats = await getMigrationStats(gitDir);
      
      expect(stats.branches).toBe(2);
    });

    it('should count tags', async () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      const gitDir = path.join(testDir, '.git');
      
      // Create objects for a commit
      const blobHash = createGitBlob(gitDir, 'hello');
      const treeHash = createGitTree(gitDir, [
        { mode: '100644', name: 'hello.txt', hash: blobHash }
      ]);
      const commitHash = createGitCommit(gitDir, treeHash, [], 'Initial commit');
      
      // Set tags
      setGitTag(gitDir, 'v1.0', commitHash);
      setGitTag(gitDir, 'v2.0', commitHash);
      
      const stats = await getMigrationStats(gitDir);
      
      expect(stats.tags).toBe(2);
    });
  });

  // ===========================================
  // MIGRATION TESTS
  // ===========================================
  describe('migrateFromGit', () => {
    it('should migrate a simple Git repository', async () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      // Create objects for a commit
      const blobHash = createGitBlob(gitDir, 'hello world\n');
      const treeHash = createGitTree(gitDir, [
        { mode: '100644', name: 'hello.txt', hash: blobHash }
      ]);
      const commitHash = createGitCommit(gitDir, treeHash, [], 'Initial commit');
      
      // Set main branch
      setGitBranch(gitDir, 'main', commitHash);
      
      // Create wit directory
      fs.mkdirSync(witDir, { recursive: true });
      
      const result = await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
      });
      
      expect(result.blobs).toBe(1);
      expect(result.trees).toBe(1);
      expect(result.commits).toBe(1);
      expect(result.branches).toBe(1);
      expect(result.errors.length).toBe(0);
      
      // Verify hash map was created
      expect(result.hashMap.has(blobHash)).toBe(true);
      expect(result.hashMap.has(treeHash)).toBe(true);
      expect(result.hashMap.has(commitHash)).toBe(true);
      
      // Verify wit objects exist
      const newBlobHash = result.hashMap.get(blobHash)!;
      const blobPath = path.join(witDir, 'objects', newBlobHash.slice(0, 2), newBlobHash.slice(2));
      expect(fs.existsSync(blobPath)).toBe(true);
      
      // Verify branch ref was migrated
      const mainPath = path.join(witDir, 'refs', 'heads', 'main');
      expect(fs.existsSync(mainPath)).toBe(true);
      const mainHash = fs.readFileSync(mainPath, 'utf8').trim();
      expect(mainHash).toBe(result.hashMap.get(commitHash));
    });

    it('should migrate repository with multiple commits', async () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      // First commit
      const blob1 = createGitBlob(gitDir, 'version 1\n');
      const tree1 = createGitTree(gitDir, [
        { mode: '100644', name: 'file.txt', hash: blob1 }
      ]);
      const commit1 = createGitCommit(gitDir, tree1, [], 'First commit');
      
      // Second commit
      const blob2 = createGitBlob(gitDir, 'version 2\n');
      const tree2 = createGitTree(gitDir, [
        { mode: '100644', name: 'file.txt', hash: blob2 }
      ]);
      const commit2 = createGitCommit(gitDir, tree2, [commit1], 'Second commit');
      
      // Set main branch
      setGitBranch(gitDir, 'main', commit2);
      
      fs.mkdirSync(witDir, { recursive: true });
      
      const result = await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
      });
      
      expect(result.commits).toBe(2);
      expect(result.blobs).toBe(2);
      expect(result.trees).toBe(2);
      expect(result.errors.length).toBe(0);
      
      // Verify parent relationship is preserved
      const witCommit2Path = path.join(
        witDir, 'objects',
        result.hashMap.get(commit2)!.slice(0, 2),
        result.hashMap.get(commit2)!.slice(2)
      );
      expect(fs.existsSync(witCommit2Path)).toBe(true);
    });

    it('should migrate tags', async () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      // Create commit
      const blobHash = createGitBlob(gitDir, 'content\n');
      const treeHash = createGitTree(gitDir, [
        { mode: '100644', name: 'file.txt', hash: blobHash }
      ]);
      const commitHash = createGitCommit(gitDir, treeHash, [], 'Initial');
      
      // Set branch and tag
      setGitBranch(gitDir, 'main', commitHash);
      setGitTag(gitDir, 'v1.0', commitHash);
      
      fs.mkdirSync(witDir, { recursive: true });
      
      const result = await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
      });
      
      expect(result.tagRefs).toBe(1);
      
      // Verify tag ref exists
      const tagPath = path.join(witDir, 'refs', 'tags', 'v1.0');
      expect(fs.existsSync(tagPath)).toBe(true);
      const tagHash = fs.readFileSync(tagPath, 'utf8').trim();
      expect(tagHash).toBe(result.hashMap.get(commitHash));
    });

    it('should migrate nested directories', async () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      // Create nested structure
      const blob1 = createGitBlob(gitDir, 'root file\n');
      const blob2 = createGitBlob(gitDir, 'nested file\n');
      
      // Nested tree (src/)
      const subTree = createGitTree(gitDir, [
        { mode: '100644', name: 'nested.txt', hash: blob2 }
      ]);
      
      // Root tree
      const rootTree = createGitTree(gitDir, [
        { mode: '100644', name: 'root.txt', hash: blob1 },
        { mode: '40000', name: 'src', hash: subTree }
      ]);
      
      const commitHash = createGitCommit(gitDir, rootTree, [], 'Nested structure');
      setGitBranch(gitDir, 'main', commitHash);
      
      fs.mkdirSync(witDir, { recursive: true });
      
      const result = await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
      });
      
      expect(result.trees).toBe(2); // root and src
      expect(result.blobs).toBe(2);
      expect(result.errors.length).toBe(0);
    });

    it('should preserve HEAD reference', async () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      const blobHash = createGitBlob(gitDir, 'content\n');
      const treeHash = createGitTree(gitDir, [
        { mode: '100644', name: 'file.txt', hash: blobHash }
      ]);
      const commitHash = createGitCommit(gitDir, treeHash, [], 'Initial');
      setGitBranch(gitDir, 'main', commitHash);
      
      // Ensure HEAD points to main
      fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
      
      fs.mkdirSync(witDir, { recursive: true });
      
      await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
      });
      
      const headPath = path.join(witDir, 'HEAD');
      expect(fs.existsSync(headPath)).toBe(true);
      const headContent = fs.readFileSync(headPath, 'utf8').trim();
      expect(headContent).toBe('ref: refs/heads/main');
    });

    it('should call progress callback', async () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      const blobHash = createGitBlob(gitDir, 'content\n');
      const treeHash = createGitTree(gitDir, [
        { mode: '100644', name: 'file.txt', hash: blobHash }
      ]);
      const commitHash = createGitCommit(gitDir, treeHash, [], 'Initial');
      setGitBranch(gitDir, 'main', commitHash);
      
      fs.mkdirSync(witDir, { recursive: true });
      
      const progressCalls: MigrationProgress[] = [];
      
      await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
        onProgress: (progress) => progressCalls.push({ ...progress }),
      });
      
      // Should have phases: scanning, objects, refs, head, complete
      const phases = progressCalls.map(p => p.phase);
      expect(phases).toContain('scanning');
      expect(phases).toContain('objects');
      expect(phases).toContain('complete');
    });

    it('should save migration map', async () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      const blobHash = createGitBlob(gitDir, 'content\n');
      const treeHash = createGitTree(gitDir, [
        { mode: '100644', name: 'file.txt', hash: blobHash }
      ]);
      const commitHash = createGitCommit(gitDir, treeHash, [], 'Initial');
      setGitBranch(gitDir, 'main', commitHash);
      
      fs.mkdirSync(witDir, { recursive: true });
      
      const result = await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
      });
      
      // Load migration map and verify
      const loadedMap = loadMigrationMap(witDir);
      
      expect(loadedMap.get(blobHash)).toBe(result.hashMap.get(blobHash));
      expect(loadedMap.get(commitHash)).toBe(result.hashMap.get(commitHash));
    });

    it('should work with sha1 algorithm', async () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      const blobHash = createGitBlob(gitDir, 'content\n');
      const treeHash = createGitTree(gitDir, [
        { mode: '100644', name: 'file.txt', hash: blobHash }
      ]);
      const commitHash = createGitCommit(gitDir, treeHash, [], 'Initial');
      setGitBranch(gitDir, 'main', commitHash);
      
      fs.mkdirSync(witDir, { recursive: true });
      
      const result = await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha1',
      });
      
      // With SHA-1, hashes should be the same (40 chars)
      expect(result.hashMap.get(blobHash)!.length).toBe(40);
      // When using same algorithm, the hash of the same content should match
      // (blobs don't reference other hashes, so they stay identical)
      expect(result.hashMap.get(blobHash)).toBe(blobHash);
    });
  });

  // ===========================================
  // EDGE CASE TESTS
  // ===========================================
  describe('edge cases', () => {
    it('should handle merge commits (multiple parents)', async () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      // Create base commit
      const blob1 = createGitBlob(gitDir, 'base\n');
      const tree1 = createGitTree(gitDir, [
        { mode: '100644', name: 'file.txt', hash: blob1 }
      ]);
      const baseCommit = createGitCommit(gitDir, tree1, [], 'Base commit');
      
      // Create feature commit
      const blob2 = createGitBlob(gitDir, 'feature\n');
      const tree2 = createGitTree(gitDir, [
        { mode: '100644', name: 'file.txt', hash: blob2 }
      ]);
      const featureCommit = createGitCommit(gitDir, tree2, [baseCommit], 'Feature commit');
      
      // Create merge commit with two parents
      const blob3 = createGitBlob(gitDir, 'merged\n');
      const tree3 = createGitTree(gitDir, [
        { mode: '100644', name: 'file.txt', hash: blob3 }
      ]);
      const mergeCommit = createGitCommit(gitDir, tree3, [baseCommit, featureCommit], 'Merge commit');
      
      setGitBranch(gitDir, 'main', mergeCommit);
      
      fs.mkdirSync(witDir, { recursive: true });
      
      const result = await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
      });
      
      expect(result.commits).toBe(3);
      expect(result.errors.length).toBe(0);
    });

    it('should handle empty tree', async () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      // Create empty tree
      const emptyTree = writeGitObject(gitDir, 'tree', Buffer.alloc(0));
      const commitHash = createGitCommit(gitDir, emptyTree, [], 'Empty tree commit');
      setGitBranch(gitDir, 'main', commitHash);
      
      fs.mkdirSync(witDir, { recursive: true });
      
      const result = await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
      });
      
      expect(result.commits).toBe(1);
      expect(result.trees).toBe(1);
    });

    it('should handle binary files', async () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      // Create binary blob
      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE, 0xFD]);
      const blobHash = writeGitObject(gitDir, 'blob', binaryContent);
      const treeHash = createGitTree(gitDir, [
        { mode: '100644', name: 'binary.bin', hash: blobHash }
      ]);
      const commitHash = createGitCommit(gitDir, treeHash, [], 'Binary file');
      setGitBranch(gitDir, 'main', commitHash);
      
      fs.mkdirSync(witDir, { recursive: true });
      
      const result = await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
      });
      
      expect(result.blobs).toBe(1);
      expect(result.errors.length).toBe(0);
    });

    it('should handle executable files', async () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      const blobHash = createGitBlob(gitDir, '#!/bin/bash\necho hello\n');
      const treeHash = createGitTree(gitDir, [
        { mode: '100755', name: 'script.sh', hash: blobHash }
      ]);
      const commitHash = createGitCommit(gitDir, treeHash, [], 'Executable file');
      setGitBranch(gitDir, 'main', commitHash);
      
      fs.mkdirSync(witDir, { recursive: true });
      
      const result = await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
      });
      
      expect(result.blobs).toBe(1);
      expect(result.errors.length).toBe(0);
    });

    it('should handle symlinks', async () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      // Symlink content is the target path
      const symlinkBlob = createGitBlob(gitDir, 'target.txt');
      const treeHash = createGitTree(gitDir, [
        { mode: '120000', name: 'link.txt', hash: symlinkBlob }
      ]);
      const commitHash = createGitCommit(gitDir, treeHash, [], 'Symlink');
      setGitBranch(gitDir, 'main', commitHash);
      
      fs.mkdirSync(witDir, { recursive: true });
      
      const result = await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
      });
      
      expect(result.blobs).toBe(1);
      expect(result.errors.length).toBe(0);
    });

    it('should handle nested branches', async () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      const blobHash = createGitBlob(gitDir, 'content\n');
      const treeHash = createGitTree(gitDir, [
        { mode: '100644', name: 'file.txt', hash: blobHash }
      ]);
      const commitHash = createGitCommit(gitDir, treeHash, [], 'Initial');
      
      // Create nested branch: feature/foo/bar
      const nestedBranchPath = path.join(gitDir, 'refs', 'heads', 'feature', 'foo');
      fs.mkdirSync(nestedBranchPath, { recursive: true });
      fs.writeFileSync(path.join(nestedBranchPath, 'bar'), commitHash + '\n');
      
      setGitBranch(gitDir, 'main', commitHash);
      
      fs.mkdirSync(witDir, { recursive: true });
      
      const result = await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
      });
      
      expect(result.branches).toBe(2); // main and feature/foo/bar
      
      // Verify nested branch exists
      const nestedRefPath = path.join(witDir, 'refs', 'heads', 'feature', 'foo', 'bar');
      expect(fs.existsSync(nestedRefPath)).toBe(true);
    });
  });

  // ===========================================
  // INTEGRATION WITH REPOSITORY
  // ===========================================
  describe('integration with Repository', () => {
    it('should create valid wit repository after migration', async () => {
      testDir = createTempDir();
      createMinimalGitRepo(testDir);
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      // Create a simple repo
      const blobHash = createGitBlob(gitDir, 'hello world\n');
      const treeHash = createGitTree(gitDir, [
        { mode: '100644', name: 'hello.txt', hash: blobHash }
      ]);
      const commitHash = createGitCommit(gitDir, treeHash, [], 'Initial commit');
      setGitBranch(gitDir, 'main', commitHash);
      
      // Set up wit directory structure
      fs.mkdirSync(path.join(witDir, 'objects'), { recursive: true });
      fs.mkdirSync(path.join(witDir, 'refs', 'heads'), { recursive: true });
      fs.mkdirSync(path.join(witDir, 'refs', 'tags'), { recursive: true });
      
      await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
      });
      
      // Create config file needed by Repository
      const config = `[core]
    repositoryformatversion = 1
[wit]
    hashAlgorithm = sha256
`;
      fs.writeFileSync(path.join(witDir, 'config'), config);
      
      // Verify Repository can read the migrated repo
      process.chdir(testDir);
      const repo = Repository.find(testDir);
      
      expect(repo.isValid()).toBe(true);
      
      // Verify we can read the commit log
      const commits = repo.log('HEAD', 10);
      expect(commits.length).toBe(1);
      expect(commits[0].message).toBe('Initial commit');
    });
  });
});
