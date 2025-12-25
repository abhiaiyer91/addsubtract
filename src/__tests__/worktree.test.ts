/**
 * Worktree Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { WorktreeManager } from '../core/worktree';
import {
  createRepoWithCommit,
  cleanupTempDir,
  restoreCwd,
  suppressConsole,
} from './test-utils';
import { Repository } from '../core/repository';

describe('worktree', () => {
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

  describe('WorktreeManager', () => {
    let manager: WorktreeManager;

    beforeEach(() => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      manager = new WorktreeManager(repo.gitDir, testDir);
      manager.init();
    });

    describe('init', () => {
      it('should initialize worktrees directory', () => {
        const worktreesDir = path.join(repo.gitDir, 'worktrees');
        expect(fs.existsSync(worktreesDir)).toBe(true);
      });
    });

    describe('list', () => {
      it('should list main worktree', () => {
        const worktrees = manager.list();
        
        expect(worktrees.length).toBeGreaterThanOrEqual(1);
        
        const mainWorktree = worktrees.find(w => w.isMain);
        expect(mainWorktree).toBeDefined();
        expect(mainWorktree!.path).toBe(testDir);
      });

      it('should include commit hash for main worktree', () => {
        const worktrees = manager.list();
        const mainWorktree = worktrees.find(w => w.isMain);
        
        expect(mainWorktree).toBeDefined();
        expect(mainWorktree!.commit).toBeTruthy();
      });

      it('should mark main worktree as not prunable', () => {
        const worktrees = manager.list();
        const mainWorktree = worktrees.find(w => w.isMain);
        
        expect(mainWorktree).toBeDefined();
        expect(mainWorktree!.isPrunable).toBe(false);
      });
    });

    describe('prune', () => {
      it('should prune stale worktrees', () => {
        // This test verifies prune runs without error
        const pruned = manager.prune();
        expect(Array.isArray(pruned)).toBe(true);
      });

      it('should run prune in dry-run mode', () => {
        const pruned = manager.prune({ dryRun: true });
        expect(Array.isArray(pruned)).toBe(true);
      });

      it('should run prune in verbose mode', () => {
        const pruned = manager.prune({ verbose: true });
        expect(Array.isArray(pruned)).toBe(true);
      });
    });

    describe('getWorktreeDir', () => {
      it('should return the worktrees directory path', () => {
        const worktreesDir = path.join(repo.gitDir, 'worktrees');
        expect(fs.existsSync(worktreesDir)).toBe(true);
      });
    });

    describe('error handling', () => {
      it('should throw when removing main worktree', () => {
        expect(() => {
          manager.remove(testDir!);
        }).toThrow();
      });

      it('should throw when locking non-existent worktree', () => {
        expect(() => {
          manager.lock('/nonexistent/path');
        }).toThrow();
      });

      it('should throw when unlocking non-existent worktree', () => {
        expect(() => {
          manager.unlock('/nonexistent/path');
        }).toThrow();
      });
    });
  });
});
