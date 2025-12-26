/**
 * Packed Refs Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import {
  createRepoWithCommit,
  createRepoWithMultipleCommits,
  createRepoWithBranches,
  createTestFile,
  cleanupTempDir,
  restoreCwd,
  suppressConsole,
} from './test-utils';
import { Repository } from '../core/repository';
import { Refs, PackedRef } from '../core/refs';

describe('packed-refs', () => {
  let testDir: string | undefined;
  let repo: Repository;
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

  describe('readPackedRefs', () => {
    beforeEach(() => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
    });

    it('should return empty map when no packed-refs file exists', () => {
      const packedRefs = repo.refs.readPackedRefs();
      expect(packedRefs.size).toBe(0);
    });

    it('should parse packed-refs file correctly', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      
      // Create a packed-refs file manually
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      const content = `# pack-refs with: peeled fully-peeled sorted
${commitHash} refs/heads/main
${commitHash} refs/tags/v1.0.0
`;
      fs.writeFileSync(packedRefsPath, content);
      
      // Invalidate cache to force re-read
      repo.refs.invalidatePackedRefsCache();
      
      const packedRefs = repo.refs.readPackedRefs();
      expect(packedRefs.size).toBe(2);
      expect(packedRefs.get('refs/heads/main')?.sha).toBe(commitHash);
      expect(packedRefs.get('refs/tags/v1.0.0')?.sha).toBe(commitHash);
    });

    it('should handle peeled refs for annotated tags', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      const tagObjHash = 'abcd1234abcd1234abcd1234abcd1234abcd1234';
      
      // Create a packed-refs file with peeled tag
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      const content = `# pack-refs with: peeled fully-peeled sorted
${tagObjHash} refs/tags/v1.0.0
^${commitHash}
`;
      fs.writeFileSync(packedRefsPath, content);
      
      repo.refs.invalidatePackedRefsCache();
      
      const packedRefs = repo.refs.readPackedRefs();
      const tagRef = packedRefs.get('refs/tags/v1.0.0');
      
      expect(tagRef).toBeDefined();
      expect(tagRef?.sha).toBe(tagObjHash);
      expect(tagRef?.peeled).toBe(commitHash);
    });

    it('should skip comments and empty lines', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      const content = `# pack-refs with: peeled fully-peeled sorted
# This is a comment

${commitHash} refs/heads/main
   
# Another comment
`;
      fs.writeFileSync(packedRefsPath, content);
      
      repo.refs.invalidatePackedRefsCache();
      
      const packedRefs = repo.refs.readPackedRefs();
      expect(packedRefs.size).toBe(1);
    });

    it('should cache packed refs', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      const content = `${commitHash} refs/heads/main\n`;
      fs.writeFileSync(packedRefsPath, content);
      
      repo.refs.invalidatePackedRefsCache();
      
      // First read
      const packedRefs1 = repo.refs.readPackedRefs();
      
      // Modify the file (but cache should still be used)
      fs.writeFileSync(packedRefsPath, `${commitHash} refs/heads/feature\n`);
      
      // Second read should return cached value
      const packedRefs2 = repo.refs.readPackedRefs();
      
      expect(packedRefs1).toBe(packedRefs2);
      expect(packedRefs2.has('refs/heads/main')).toBe(true);
    });
  });

  describe('resolve with packed refs', () => {
    beforeEach(() => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
    });

    it('should resolve refs from packed-refs file', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      
      // Pack refs and remove loose ref
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      fs.writeFileSync(packedRefsPath, `${commitHash} refs/heads/packed-branch\n`);
      repo.refs.invalidatePackedRefsCache();
      
      // Resolve the packed ref
      const resolved = repo.refs.resolve('refs/heads/packed-branch');
      expect(resolved).toBe(commitHash);
    });

    it('should prioritize loose refs over packed refs', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      const oldHash = '1111111111111111111111111111111111111111';
      
      // Create packed ref with old hash
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      fs.writeFileSync(packedRefsPath, `${oldHash} refs/heads/main\n`);
      repo.refs.invalidatePackedRefsCache();
      
      // Loose ref should take priority
      const resolved = repo.refs.resolve('main');
      expect(resolved).toBe(commitHash);
    });

    it('should resolve short branch names from packed refs', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      
      // Remove loose ref and add to packed refs
      const looseRef = path.join(repo.gitDir, 'refs', 'heads', 'main');
      fs.unlinkSync(looseRef);
      
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      fs.writeFileSync(packedRefsPath, `${commitHash} refs/heads/main\n`);
      repo.refs.invalidatePackedRefsCache();
      
      // Should resolve short name
      const resolved = repo.refs.resolve('main');
      expect(resolved).toBe(commitHash);
    });

    it('should resolve short tag names from packed refs', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      fs.writeFileSync(packedRefsPath, `${commitHash} refs/tags/v1.0.0\n`);
      repo.refs.invalidatePackedRefsCache();
      
      const resolved = repo.refs.resolve('v1.0.0');
      expect(resolved).toBe(commitHash);
    });
  });

  describe('listBranches with packed refs', () => {
    beforeEach(() => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
    });

    it('should list branches from both loose and packed refs', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      
      // Add packed branch
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      fs.writeFileSync(packedRefsPath, `${commitHash} refs/heads/packed-branch\n`);
      repo.refs.invalidatePackedRefsCache();
      
      const branches = repo.refs.listBranches();
      expect(branches).toContain('main');
      expect(branches).toContain('packed-branch');
    });

    it('should not duplicate branches present in both', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      
      // Add main to packed refs (it also exists as loose)
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      fs.writeFileSync(packedRefsPath, `${commitHash} refs/heads/main\n`);
      repo.refs.invalidatePackedRefsCache();
      
      const branches = repo.refs.listBranches();
      const mainCount = branches.filter(b => b === 'main').length;
      expect(mainCount).toBe(1);
    });

    it('should return sorted branches', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      fs.writeFileSync(packedRefsPath, 
        `${commitHash} refs/heads/zebra\n${commitHash} refs/heads/alpha\n`
      );
      repo.refs.invalidatePackedRefsCache();
      
      const branches = repo.refs.listBranches();
      const expectedOrder = ['alpha', 'main', 'zebra'];
      expect(branches).toEqual(expectedOrder);
    });
  });

  describe('listTags with packed refs', () => {
    beforeEach(() => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
    });

    it('should list tags from packed refs', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      fs.writeFileSync(packedRefsPath, 
        `${commitHash} refs/tags/v1.0.0\n${commitHash} refs/tags/v2.0.0\n`
      );
      repo.refs.invalidatePackedRefsCache();
      
      const tags = repo.refs.listTags();
      expect(tags).toContain('v1.0.0');
      expect(tags).toContain('v2.0.0');
    });
  });

  describe('branchExists with packed refs', () => {
    beforeEach(() => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
    });

    it('should find branch in packed refs', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      fs.writeFileSync(packedRefsPath, `${commitHash} refs/heads/packed-branch\n`);
      repo.refs.invalidatePackedRefsCache();
      
      expect(repo.refs.branchExists('packed-branch')).toBe(true);
    });

    it('should return false for non-existent branch', () => {
      expect(repo.refs.branchExists('non-existent')).toBe(false);
    });
  });

  describe('tagExists with packed refs', () => {
    beforeEach(() => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
    });

    it('should find tag in packed refs', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      fs.writeFileSync(packedRefsPath, `${commitHash} refs/tags/v1.0.0\n`);
      repo.refs.invalidatePackedRefsCache();
      
      expect(repo.refs.tagExists('v1.0.0')).toBe(true);
    });
  });

  describe('packRefs', () => {
    beforeEach(() => {
      const result = createRepoWithBranches(['feature', 'bugfix']);
      testDir = result.dir;
      repo = result.repo;
    });

    it('should pack loose refs into packed-refs file', () => {
      const result = repo.refs.packRefs();
      
      expect(result.packed).toBeGreaterThan(0);
      expect(result.errors.length).toBe(0);
      
      // Check packed-refs file was created
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      expect(fs.existsSync(packedRefsPath)).toBe(true);
      
      // Read and verify content
      const content = fs.readFileSync(packedRefsPath, 'utf-8');
      expect(content).toContain('refs/heads/main');
      expect(content).toContain('refs/heads/feature');
      expect(content).toContain('refs/heads/bugfix');
    });

    it('should prune loose refs when prune option is set', () => {
      const featurePath = path.join(repo.gitDir, 'refs', 'heads', 'feature');
      expect(fs.existsSync(featurePath)).toBe(true);
      
      const result = repo.refs.packRefs({ prune: true });
      
      expect(result.pruned).toBeGreaterThan(0);
      
      // Loose refs should be removed
      expect(fs.existsSync(featurePath)).toBe(false);
    });

    it('should not prune loose refs by default', () => {
      const mainPath = path.join(repo.gitDir, 'refs', 'heads', 'main');
      expect(fs.existsSync(mainPath)).toBe(true);
      
      repo.refs.packRefs();
      
      // Loose ref should still exist
      expect(fs.existsSync(mainPath)).toBe(true);
    });

    it('should include header comment in packed-refs file', () => {
      repo.refs.packRefs();
      
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      const content = fs.readFileSync(packedRefsPath, 'utf-8');
      
      expect(content.startsWith('# pack-refs')).toBe(true);
    });

    it('should sort refs in packed-refs file', () => {
      repo.refs.packRefs();
      
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      const content = fs.readFileSync(packedRefsPath, 'utf-8');
      const lines = content.split('\n').filter(l => l && !l.startsWith('#'));
      
      // Extract ref names
      const refNames = lines.map(l => l.split(' ')[1]);
      const sortedNames = [...refNames].sort();
      
      expect(refNames).toEqual(sortedNames);
    });

    it('should merge with existing packed refs', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      
      // Create initial packed-refs with a tag
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      fs.writeFileSync(packedRefsPath, `${commitHash} refs/tags/v1.0.0\n`);
      repo.refs.invalidatePackedRefsCache();
      
      // Pack current refs
      repo.refs.packRefs();
      
      // Both old and new refs should be present
      const content = fs.readFileSync(packedRefsPath, 'utf-8');
      expect(content).toContain('refs/tags/v1.0.0');
      expect(content).toContain('refs/heads/main');
    });
  });

  describe('removeFromPackedRefs', () => {
    beforeEach(() => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
    });

    it('should remove a ref from packed-refs', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      
      // Create packed-refs with multiple entries
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      fs.writeFileSync(packedRefsPath, 
        `${commitHash} refs/heads/main\n${commitHash} refs/heads/feature\n`
      );
      repo.refs.invalidatePackedRefsCache();
      
      // Remove one ref
      const removed = repo.refs.removeFromPackedRefs('refs/heads/feature');
      expect(removed).toBe(true);
      
      // Verify it's gone
      const content = fs.readFileSync(packedRefsPath, 'utf-8');
      expect(content).not.toContain('refs/heads/feature');
      expect(content).toContain('refs/heads/main');
    });

    it('should return false when ref does not exist', () => {
      const removed = repo.refs.removeFromPackedRefs('refs/heads/non-existent');
      expect(removed).toBe(false);
    });

    it('should delete packed-refs file when empty', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      fs.writeFileSync(packedRefsPath, `${commitHash} refs/heads/only-one\n`);
      repo.refs.invalidatePackedRefsCache();
      
      repo.refs.removeFromPackedRefs('refs/heads/only-one');
      
      expect(fs.existsSync(packedRefsPath)).toBe(false);
    });
  });

  describe('getPeeledRef', () => {
    beforeEach(() => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
    });

    it('should return peeled value for annotated tag', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      const tagObjHash = 'abcd1234abcd1234abcd1234abcd1234abcd1234';
      
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      fs.writeFileSync(packedRefsPath, 
        `${tagObjHash} refs/tags/v1.0.0\n^${commitHash}\n`
      );
      repo.refs.invalidatePackedRefsCache();
      
      const peeled = repo.refs.getPeeledRef('refs/tags/v1.0.0');
      expect(peeled).toBe(commitHash);
    });

    it('should return null for non-peeled ref', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      fs.writeFileSync(packedRefsPath, `${commitHash} refs/heads/main\n`);
      repo.refs.invalidatePackedRefsCache();
      
      const peeled = repo.refs.getPeeledRef('refs/heads/main');
      expect(peeled).toBeNull();
    });

    it('should return null for non-existent ref', () => {
      const peeled = repo.refs.getPeeledRef('refs/tags/non-existent');
      expect(peeled).toBeNull();
    });
  });

  describe('getAllRefs', () => {
    beforeEach(() => {
      const result = createRepoWithBranches(['feature']);
      testDir = result.dir;
      repo = result.repo;
    });

    it('should return all refs', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      
      // Add a packed tag
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      fs.writeFileSync(packedRefsPath, `${commitHash} refs/tags/v1.0.0\n`);
      repo.refs.invalidatePackedRefsCache();
      
      const allRefs = repo.refs.getAllRefs();
      
      expect(allRefs.has('refs/heads/main')).toBe(true);
      expect(allRefs.has('refs/heads/feature')).toBe(true);
      expect(allRefs.has('refs/tags/v1.0.0')).toBe(true);
    });

    it('should filter by prefix', () => {
      const allRefs = repo.refs.getAllRefs('refs/heads/');
      
      expect(allRefs.has('refs/heads/main')).toBe(true);
      expect(allRefs.has('refs/heads/feature')).toBe(true);
      
      // Tags should not be included
      for (const [key] of allRefs) {
        expect(key.startsWith('refs/heads/')).toBe(true);
      }
    });

    it('should prioritize loose refs over packed refs', () => {
      const commitHash = repo.refs.resolve('HEAD')!;
      const oldHash = '1111111111111111111111111111111111111111';
      
      // Add packed ref with old hash
      const packedRefsPath = path.join(repo.gitDir, 'packed-refs');
      fs.writeFileSync(packedRefsPath, `${oldHash} refs/heads/main\n`);
      repo.refs.invalidatePackedRefsCache();
      
      const allRefs = repo.refs.getAllRefs();
      
      // Loose ref value should be used
      expect(allRefs.get('refs/heads/main')).toBe(commitHash);
    });
  });
});
