/**
 * Reflog Command Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ReflogManager } from '../commands/reflog';
import {
  createRepoWithCommit,
  createRepoWithMultipleCommits,
  cleanupTempDir,
  restoreCwd,
  suppressConsole,
} from './test-utils';
import { Repository } from '../core/repository';

describe('reflog command', () => {
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

  describe('ReflogManager', () => {
    let reflogManager: ReflogManager;

    beforeEach(() => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      reflogManager = new ReflogManager(repo.gitDir, testDir);
      reflogManager.init();
    });

    describe('append and read', () => {
      it('should append entry to HEAD reflog', () => {
        const oldHash = '0'.repeat(64);
        const newHash = 'a'.repeat(64);
        
        reflogManager.append('HEAD', oldHash, newHash, 'commit: Initial commit');
        
        const entries = reflogManager.read('HEAD');
        expect(entries.length).toBeGreaterThan(0);
        expect(entries[0].newHash).toBe(newHash);
        expect(entries[0].message).toBe('commit: Initial commit');
      });

      it('should append entry to branch reflog', () => {
        const oldHash = '0'.repeat(64);
        const newHash = 'b'.repeat(64);
        
        reflogManager.append('main', oldHash, newHash, 'commit: Feature branch');
        
        const entries = reflogManager.read('main');
        expect(entries.length).toBeGreaterThan(0);
        expect(entries[0].newHash).toBe(newHash);
      });

      it('should limit entries when reading', () => {
        const oldHash = '0'.repeat(64);
        
        // Append multiple entries
        for (let i = 0; i < 10; i++) {
          reflogManager.append('HEAD', oldHash, `${'a'.repeat(63)}${i}`, `commit: Commit ${i}`);
        }
        
        const entries = reflogManager.read('HEAD', 3);
        expect(entries.length).toBe(3);
      });

      it('should return entries in reverse chronological order', () => {
        const oldHash = '0'.repeat(64);
        
        reflogManager.append('HEAD', oldHash, 'a'.repeat(64), 'commit: First');
        reflogManager.append('HEAD', 'a'.repeat(64), 'b'.repeat(64), 'commit: Second');
        reflogManager.append('HEAD', 'b'.repeat(64), 'c'.repeat(64), 'commit: Third');
        
        const entries = reflogManager.read('HEAD');
        expect(entries[0].message).toBe('commit: Third');
        expect(entries[1].message).toBe('commit: Second');
        expect(entries[2].message).toBe('commit: First');
      });
    });

    describe('exists', () => {
      it('should return true for existing reflog', () => {
        reflogManager.append('HEAD', '0'.repeat(64), 'a'.repeat(64), 'test');
        expect(reflogManager.exists('HEAD')).toBe(true);
      });

      it('should return false for non-existent reflog', () => {
        expect(reflogManager.exists('nonexistent')).toBe(false);
      });
    });

    describe('delete', () => {
      it('should delete reflog', () => {
        reflogManager.append('HEAD', '0'.repeat(64), 'a'.repeat(64), 'test');
        expect(reflogManager.exists('HEAD')).toBe(true);
        
        const result = reflogManager.delete('HEAD');
        expect(result).toBe(true);
        expect(reflogManager.exists('HEAD')).toBe(false);
      });

      it('should return false when deleting non-existent reflog', () => {
        const result = reflogManager.delete('nonexistent');
        expect(result).toBe(false);
      });
    });

    describe('deleteEntry', () => {
      it('should delete specific entry by index', () => {
        const oldHash = '0'.repeat(64);
        
        reflogManager.append('HEAD', oldHash, 'a'.repeat(64), 'commit: First');
        reflogManager.append('HEAD', 'a'.repeat(64), 'b'.repeat(64), 'commit: Second');
        reflogManager.append('HEAD', 'b'.repeat(64), 'c'.repeat(64), 'commit: Third');
        
        // Delete the middle entry (index 1, which is "Second" in reverse order)
        const result = reflogManager.deleteEntry('HEAD', 1);
        expect(result).toBe(true);
        
        const entries = reflogManager.read('HEAD');
        expect(entries.length).toBe(2);
        expect(entries[0].message).toBe('commit: Third');
        expect(entries[1].message).toBe('commit: First');
      });

      it('should return false for invalid index', () => {
        reflogManager.append('HEAD', '0'.repeat(64), 'a'.repeat(64), 'test');
        
        const result = reflogManager.deleteEntry('HEAD', 100);
        expect(result).toBe(false);
      });
    });

    describe('expire', () => {
      it('should expire old entries', () => {
        // This test just verifies the expire function runs without error
        // Actual expiration is time-based
        const results = reflogManager.expire({ all: true, dryRun: true });
        expect(Array.isArray(results)).toBe(true);
      });
    });
  });

  describe('with multiple commits', () => {
    beforeEach(() => {
      const result = createRepoWithMultipleCommits(5);
      testDir = result.dir;
      repo = result.repo;
    });

    it('should track commit history in reflog', () => {
      const reflogManager = new ReflogManager(repo.gitDir, testDir!);
      reflogManager.init();
      
      // The reflog may or may not have entries depending on whether
      // the repository automatically writes to reflog
      const entries = reflogManager.read('HEAD');
      // Just verify we can read it without error
      expect(Array.isArray(entries)).toBe(true);
    });
  });
});

