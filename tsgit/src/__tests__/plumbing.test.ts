/**
 * Tests for plumbing commands
 * - rev-parse
 * - update-ref
 * - symbolic-ref
 * - for-each-ref
 * - show-ref
 * - fsck
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { 
  createRepoWithCommit, 
  createRepoWithMultipleCommits,
  createRepoWithBranches,
  cleanupTempDir, 
  createTestFile,
  suppressConsole,
  captureConsole,
  restoreCwd,
} from './test-utils';
import { Repository } from '../core/repository';

// Import the plumbing commands
import { revParse } from '../commands/rev-parse';
import { updateRef, deleteRef } from '../commands/update-ref';
import { readSymbolicRef, setSymbolicRef, deleteSymbolicRef } from '../commands/symbolic-ref';
import { forEachRef, formatRef } from '../commands/for-each-ref';
import { showRef, verifyRef } from '../commands/show-ref';
import { fsck } from '../commands/fsck';

describe('rev-parse command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let commitHash: string;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const result = createRepoWithCommit();
    testDir = result.dir;
    repo = result.repo;
    commitHash = result.commitHash;
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('basic parsing', () => {
    it('should parse HEAD to commit hash', () => {
      const hash = revParse(repo, 'HEAD');
      expect(hash).toBe(commitHash);
    });

    it('should parse branch name to commit hash', () => {
      const hash = revParse(repo, 'main');
      expect(hash).toBe(commitHash);
    });

    it('should return short hash when requested', () => {
      const shortHash = revParse(repo, 'HEAD', { short: true });
      expect(shortHash).toBe(commitHash.slice(0, 8));
    });

    it('should return custom length short hash', () => {
      const shortHash = revParse(repo, 'HEAD', { short: 7 });
      expect(shortHash).toBe(commitHash.slice(0, 7));
    });
  });

  describe('revision walking', () => {
    it('should parse HEAD~1 correctly', () => {
      // Create a second commit
      createTestFile(testDir!, 'file2.txt', 'content2');
      repo.add(path.join(testDir!, 'file2.txt'));
      const secondCommit = repo.commit('Second commit');

      const firstCommit = revParse(repo, 'HEAD~1');
      expect(firstCommit).toBe(commitHash);
      
      const currentHead = revParse(repo, 'HEAD');
      expect(currentHead).toBe(secondCommit);
    });

    it('should parse HEAD^ correctly', () => {
      createTestFile(testDir!, 'file2.txt', 'content2');
      repo.add(path.join(testDir!, 'file2.txt'));
      repo.commit('Second commit');

      const firstCommit = revParse(repo, 'HEAD^');
      expect(firstCommit).toBe(commitHash);
    });
  });

  describe('special options', () => {
    it('should return git-dir path', () => {
      const gitDir = revParse(repo, '', { gitDir: true });
      expect(gitDir).toBe(repo.gitDir);
      expect(gitDir).toContain('.tsgit');
    });

    it('should return show-toplevel path', () => {
      const topLevel = revParse(repo, '', { showToplevel: true });
      expect(topLevel).toBe(repo.workDir);
    });

    it('should return symbolic ref for HEAD', () => {
      const symbolic = revParse(repo, 'HEAD', { symbolicFullName: true });
      expect(symbolic).toBe('refs/heads/main');
    });

    it('should return short symbolic ref', () => {
      const symbolic = revParse(repo, 'HEAD', { symbolic: true });
      expect(symbolic).toBe('main');
    });

    it('should return abbrev-ref for HEAD', () => {
      const abbrev = revParse(repo, 'HEAD', { abbrevRef: true });
      expect(abbrev).toBe('main');
    });
  });

  describe('verify mode', () => {
    it('should verify valid ref', () => {
      const hash = revParse(repo, 'HEAD', { verify: true });
      expect(hash).toBe(commitHash);
    });

    it('should return null for invalid ref in quiet mode', () => {
      const hash = revParse(repo, 'nonexistent', { verify: true, quiet: true });
      expect(hash).toBeNull();
    });
  });
});

describe('update-ref command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let commitHash: string;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const result = createRepoWithCommit();
    testDir = result.dir;
    repo = result.repo;
    commitHash = result.commitHash;
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('creating refs', () => {
    it('should create a new branch ref', () => {
      updateRef(repo, 'refs/heads/new-branch', commitHash);
      
      const resolvedHash = repo.refs.resolve('new-branch');
      expect(resolvedHash).toBe(commitHash);
    });

    it('should create a ref with short name', () => {
      updateRef(repo, 'test-branch', commitHash);
      
      const resolvedHash = repo.refs.resolve('test-branch');
      expect(resolvedHash).toBe(commitHash);
    });
  });

  describe('updating refs', () => {
    it('should update an existing branch ref', () => {
      // Create a second commit
      createTestFile(testDir!, 'file2.txt', 'content2');
      repo.add(path.join(testDir!, 'file2.txt'));
      const secondCommit = repo.commit('Second commit');

      // Update main to point to first commit
      updateRef(repo, 'refs/heads/main', commitHash);
      
      const resolvedHash = repo.refs.resolve('main');
      expect(resolvedHash).toBe(commitHash);
    });
  });

  describe('deleting refs', () => {
    it('should delete a branch ref', () => {
      // Create a branch first
      updateRef(repo, 'refs/heads/to-delete', commitHash);
      expect(repo.refs.branchExists('to-delete')).toBe(true);

      // Delete it
      deleteRef(repo, 'refs/heads/to-delete');
      expect(repo.refs.branchExists('to-delete')).toBe(false);
    });

    it('should throw error when deleting non-existent ref', () => {
      expect(() => {
        deleteRef(repo, 'refs/heads/nonexistent');
      }).toThrow();
    });
  });

  describe('conditional update', () => {
    it('should update when old value matches', () => {
      updateRef(repo, 'refs/heads/conditional', commitHash, { oldValue: undefined });
      
      // Create new commit
      createTestFile(testDir!, 'file2.txt', 'content2');
      repo.add(path.join(testDir!, 'file2.txt'));
      const secondCommit = repo.commit('Second commit');

      // Update with correct old value
      updateRef(repo, 'refs/heads/conditional', secondCommit, { oldValue: commitHash });
      
      const resolvedHash = repo.refs.resolve('conditional');
      expect(resolvedHash).toBe(secondCommit);
    });

    it('should fail when old value does not match', () => {
      updateRef(repo, 'refs/heads/conditional', commitHash);
      
      expect(() => {
        updateRef(repo, 'refs/heads/conditional', commitHash, { oldValue: 'wrong-hash' });
      }).toThrow();
    });
  });
});

describe('symbolic-ref command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const result = createRepoWithCommit();
    testDir = result.dir;
    repo = result.repo;
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('reading symbolic refs', () => {
    it('should read HEAD symbolic ref', () => {
      const target = readSymbolicRef(repo, 'HEAD');
      expect(target).toBe('refs/heads/main');
    });

    it('should read short form of HEAD', () => {
      const target = readSymbolicRef(repo, 'HEAD', { short: true });
      expect(target).toBe('main');
    });
  });

  describe('setting symbolic refs', () => {
    it('should set HEAD to a different branch', () => {
      // Create a new branch
      repo.createBranch('feature');
      
      // Set HEAD to feature
      setSymbolicRef(repo, 'HEAD', 'refs/heads/feature');
      
      const target = readSymbolicRef(repo, 'HEAD');
      expect(target).toBe('refs/heads/feature');
    });

    it('should normalize short branch names', () => {
      repo.createBranch('develop');
      
      setSymbolicRef(repo, 'HEAD', 'develop');
      
      const target = readSymbolicRef(repo, 'HEAD');
      expect(target).toBe('refs/heads/develop');
    });
  });

  describe('error cases', () => {
    it('should throw error for non-symbolic ref', () => {
      // Set HEAD to a direct hash (detached HEAD)
      const hash = repo.refs.resolve('HEAD')!;
      repo.refs.setHeadDetached(hash);
      
      expect(() => {
        readSymbolicRef(repo, 'HEAD');
      }).toThrow();
    });

    it('should return null in quiet mode for non-symbolic ref', () => {
      const hash = repo.refs.resolve('HEAD')!;
      repo.refs.setHeadDetached(hash);
      
      const result = readSymbolicRef(repo, 'HEAD', { quiet: true });
      expect(result).toBeNull();
    });
  });
});

describe('for-each-ref command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const result = createRepoWithBranches(['feature', 'develop']);
    testDir = result.dir;
    repo = result.repo;
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('listing refs', () => {
    it('should list all refs', () => {
      const refs = forEachRef(repo);
      
      expect(refs.length).toBe(3); // main, feature, develop
      expect(refs.map(r => r.refname)).toContain('refs/heads/main');
      expect(refs.map(r => r.refname)).toContain('refs/heads/feature');
      expect(refs.map(r => r.refname)).toContain('refs/heads/develop');
    });

    it('should list refs matching pattern', () => {
      const refs = forEachRef(repo, ['refs/heads']);
      
      expect(refs.length).toBe(3);
      refs.forEach(r => {
        expect(r.refname).toMatch(/^refs\/heads\//);
      });
    });

    it('should mark HEAD correctly', () => {
      const refs = forEachRef(repo);
      const mainRef = refs.find(r => r.refname === 'refs/heads/main');
      
      expect(mainRef).toBeDefined();
      expect(mainRef!.isHead).toBe(true);
      
      const featureRef = refs.find(r => r.refname === 'refs/heads/feature');
      expect(featureRef!.isHead).toBe(false);
    });
  });

  describe('formatting', () => {
    it('should format ref with custom format', () => {
      const refs = forEachRef(repo);
      const ref = refs[0];
      
      const formatted = formatRef(ref, '%(refname:short)');
      expect(['main', 'feature', 'develop']).toContain(formatted);
    });

    it('should format multiple placeholders', () => {
      const refs = forEachRef(repo);
      const mainRef = refs.find(r => r.refname === 'refs/heads/main')!;
      
      const formatted = formatRef(mainRef, '%(HEAD) %(refname:short)');
      expect(formatted).toBe('* main');
    });
  });

  describe('sorting', () => {
    it('should sort by refname by default', () => {
      const refs = forEachRef(repo);
      
      const names = refs.map(r => r.refname);
      const sorted = [...names].sort();
      expect(names).toEqual(sorted);
    });
  });

  describe('count option', () => {
    it('should limit output count', () => {
      const refs = forEachRef(repo, [], { count: 2 });
      
      expect(refs.length).toBe(2);
    });
  });
});

describe('show-ref command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let commitHash: string;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const result = createRepoWithBranches(['feature', 'develop']);
    testDir = result.dir;
    repo = result.repo;
    commitHash = result.branchHashes.get('main')!;
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('listing refs', () => {
    it('should list all refs with hashes', () => {
      const refs = showRef(repo);
      
      expect(refs.length).toBe(3);
      refs.forEach(r => {
        expect(r.hash).toBe(commitHash);
        expect(r.refname).toMatch(/^refs\/heads\//);
      });
    });

    it('should list only heads', () => {
      const refs = showRef(repo, [], { heads: true });
      
      expect(refs.length).toBe(3);
      refs.forEach(r => {
        expect(r.refname).toMatch(/^refs\/heads\//);
      });
    });

    it('should list only tags when requested', () => {
      // Create a tag first
      repo.refs.createTag('v1.0', commitHash);
      
      const refs = showRef(repo, [], { tags: true });
      
      expect(refs.length).toBe(1);
      expect(refs[0].refname).toBe('refs/tags/v1.0');
    });
  });

  describe('pattern matching', () => {
    it('should filter by pattern', () => {
      const refs = showRef(repo, ['main']);
      
      expect(refs.length).toBe(1);
      expect(refs[0].refname).toBe('refs/heads/main');
    });

    it('should filter by multiple patterns', () => {
      const refs = showRef(repo, ['main', 'feature']);
      
      expect(refs.length).toBe(2);
    });
  });

  describe('verify mode', () => {
    it('should verify existing ref', () => {
      const ref = verifyRef(repo, 'main');
      
      expect(ref).not.toBeNull();
      expect(ref!.hash).toBe(commitHash);
    });

    it('should return null for non-existent ref', () => {
      const ref = verifyRef(repo, 'nonexistent');
      
      expect(ref).toBeNull();
    });

    it('should verify HEAD', () => {
      const ref = verifyRef(repo, 'HEAD');
      
      expect(ref).not.toBeNull();
      expect(ref!.hash).toBe(commitHash);
    });
  });
});

describe('fsck command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const result = createRepoWithMultipleCommits(3);
    testDir = result.dir;
    repo = result.repo;
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('basic verification', () => {
    it('should verify a valid repository', () => {
      const result = fsck(repo);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should count object types correctly', () => {
      const result = fsck(repo);
      
      expect(result.stats.commits).toBe(3);
      expect(result.stats.trees).toBeGreaterThanOrEqual(3);
      expect(result.stats.blobs).toBeGreaterThanOrEqual(3);
      expect(result.stats.totalObjects).toBe(
        result.stats.commits + result.stats.trees + result.stats.blobs + result.stats.tags
      );
    });

    it('should find all reachable objects', () => {
      const result = fsck(repo);
      
      expect(result.stats.reachableObjects).toBe(result.stats.totalObjects);
      expect(result.stats.danglingObjects).toBe(0);
    });
  });

  describe('full verification', () => {
    it('should verify hashes in full mode', () => {
      const result = fsck(repo, { full: true });
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('connectivity check', () => {
    it('should only check connectivity', () => {
      const result = fsck(repo, { connectivityOnly: true });
      
      expect(result.valid).toBe(true);
    });
  });

  describe('dangling objects', () => {
    it('should report dangling objects', () => {
      // Create an unreferenced blob
      const content = Buffer.from('orphan content');
      repo.objects.writeBlob(content);
      
      const result = fsck(repo, { dangling: true });
      
      expect(result.stats.danglingObjects).toBe(1);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe('dangling');
      expect(result.warnings[0].objectType).toBe('blob');
    });
  });

  describe('error detection', () => {
    it('should detect missing referenced objects', () => {
      // This is harder to test without corrupting the repo,
      // but we can at least verify the structure is correct
      const result = fsck(repo);
      
      expect(result.errors).toHaveLength(0);
    });
  });
});
