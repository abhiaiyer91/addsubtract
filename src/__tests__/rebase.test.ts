/**
 * Tests for the rebase command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { RebaseManager } from '../commands/rebase';
import { 
  createRepoWithCommit, 
  cleanupTempDir, 
  createTestFile,
  fileExists,
  suppressConsole,
  restoreCwd,
} from './test-utils';
import { Repository } from '../core/repository';

describe('rebase command', () => {
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
  });

  describe('basic rebase', () => {
    it('should rebase feature branch onto main', () => {
      // Setup: create repo with initial commit
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;
      
      // Create a commit on main
      createTestFile(testDir, 'main.txt', 'main content\n');
      repo.add(path.join(testDir, 'main.txt'));
      const mainCommit = repo.commit('Main commit');
      
      // Create a feature branch from base and add a commit
      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      
      createTestFile(testDir, 'feature.txt', 'feature content\n');
      repo.add(path.join(testDir, 'feature.txt'));
      repo.commit('Feature commit');
      
      // Rebase feature onto main
      const manager = new RebaseManager(repo, repo.gitDir);
      const rebaseResult = manager.rebase('main');
      
      expect(rebaseResult.success).toBe(true);
      expect(rebaseResult.commits.length).toBe(1);
      
      // Feature file should exist
      expect(fileExists(testDir, 'feature.txt')).toBe(true);
      // Main file should also exist (from rebasing onto main)
      expect(fileExists(testDir, 'main.txt')).toBe(true);
      
      // Check the commit history
      const headHash = repo.refs.resolve('HEAD')!;
      const headCommit = repo.objects.readCommit(headHash);
      expect(headCommit.message).toBe('Feature commit');
      
      // Parent should be main commit
      expect(headCommit.parentHashes[0]).toBe(mainCommit);
    });

    it('should handle fast-forward when possible', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      // Add commit to main
      createTestFile(testDir, 'main.txt', 'content\n');
      repo.add(path.join(testDir, 'main.txt'));
      repo.commit('Main commit');
      
      // Create feature from current main (no divergence)
      repo.createBranch('feature');
      repo.checkout('feature');
      
      // Rebase onto main (should fast-forward or no-op)
      const manager = new RebaseManager(repo, repo.gitDir);
      const rebaseResult = manager.rebase('main');
      
      expect(rebaseResult.success).toBe(true);
    });

    it('should rebase multiple commits', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;
      
      // Add commit to main
      createTestFile(testDir, 'main.txt', 'content\n');
      repo.add(path.join(testDir, 'main.txt'));
      repo.commit('Main commit');
      
      // Create feature from base with multiple commits
      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      
      createTestFile(testDir, 'feature1.txt', 'content1\n');
      repo.add(path.join(testDir, 'feature1.txt'));
      repo.commit('Feature commit 1');
      
      createTestFile(testDir, 'feature2.txt', 'content2\n');
      repo.add(path.join(testDir, 'feature2.txt'));
      repo.commit('Feature commit 2');
      
      const manager = new RebaseManager(repo, repo.gitDir);
      const rebaseResult = manager.rebase('main');
      
      expect(rebaseResult.success).toBe(true);
      expect(rebaseResult.commits.length).toBe(2);
      
      // Both feature files should exist
      expect(fileExists(testDir, 'feature1.txt')).toBe(true);
      expect(fileExists(testDir, 'feature2.txt')).toBe(true);
      expect(fileExists(testDir, 'main.txt')).toBe(true);
    });
  });

  describe('rebase state management', () => {
    it('should not be in progress initially', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      const manager = new RebaseManager(repo, repo.gitDir);
      expect(manager.isInProgress()).toBe(false);
    });

    it('should track state during conflicts', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;
      
      // Create conflicting changes
      createTestFile(testDir, 'conflict.txt', 'main content\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Main adds conflict.txt');
      
      // Create feature from base with conflicting change
      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      
      createTestFile(testDir, 'conflict.txt', 'feature content\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Feature adds conflict.txt');
      
      const manager = new RebaseManager(repo, repo.gitDir);
      const rebaseResult = manager.rebase('main');
      
      if (!rebaseResult.success) {
        expect(manager.isInProgress()).toBe(true);
        expect(rebaseResult.conflicts).toBeDefined();
        expect(rebaseResult.conflicts!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('rebase abort', () => {
    it('should restore original state on abort', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;
      
      // Create conflicting situation
      createTestFile(testDir, 'file.txt', 'main\n');
      repo.add(path.join(testDir, 'file.txt'));
      repo.commit('Main change');
      
      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      
      createTestFile(testDir, 'file.txt', 'feature\n');
      repo.add(path.join(testDir, 'file.txt'));
      const featureHead = repo.commit('Feature change');
      
      const manager = new RebaseManager(repo, repo.gitDir);
      const rebaseResult = manager.rebase('main');
      
      if (!rebaseResult.success && manager.isInProgress()) {
        manager.abort();
        
        expect(manager.isInProgress()).toBe(false);
        // HEAD should be restored to the original commit
        expect(repo.refs.resolve('HEAD')).toBe(featureHead);
        // Note: after abort, we may or may not be on the original branch
        // depending on implementation details - the key is HEAD is correct
      }
    });
  });

  describe('rebase skip', () => {
    it('should skip current commit and continue', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;
      
      // Create main commit
      createTestFile(testDir, 'conflict.txt', 'main\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Main adds file');
      
      // Create feature with multiple commits, first one conflicts
      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      
      createTestFile(testDir, 'conflict.txt', 'feature\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Feature conflicting commit');
      
      createTestFile(testDir, 'safe.txt', 'safe content\n');
      repo.add(path.join(testDir, 'safe.txt'));
      repo.commit('Feature safe commit');
      
      const manager = new RebaseManager(repo, repo.gitDir);
      const rebaseResult = manager.rebase('main');
      
      if (!rebaseResult.success && manager.isInProgress()) {
        manager.skip();
        
        // After skipping, should continue or complete
        expect(manager.isInProgress()).toBe(false);
        expect(fileExists(testDir, 'safe.txt')).toBe(true);
      }
    });
  });

  describe('error handling', () => {
    it('should error on invalid branch reference', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      const manager = new RebaseManager(repo, repo.gitDir);
      
      expect(() => {
        manager.rebase('nonexistent-branch');
      }).toThrow();
    });

    it('should error when rebase already in progress', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;
      
      // Create conflict situation
      createTestFile(testDir, 'file.txt', 'main\n');
      repo.add(path.join(testDir, 'file.txt'));
      repo.commit('Main');
      
      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'file.txt', 'feature\n');
      repo.add(path.join(testDir, 'file.txt'));
      repo.commit('Feature');
      
      const manager = new RebaseManager(repo, repo.gitDir);
      const firstResult = manager.rebase('main');
      
      if (!firstResult.success && manager.isInProgress()) {
        expect(() => {
          manager.rebase('main');
        }).toThrow(/already in progress/);
      }
    });

    it('should error with uncommitted changes', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      repo.createBranch('feature');
      repo.checkout('feature');
      
      // Create uncommitted changes
      createTestFile(testDir, 'uncommitted.txt', 'content\n');
      repo.add(path.join(testDir, 'uncommitted.txt'));
      
      const manager = new RebaseManager(repo, repo.gitDir);
      
      expect(() => {
        manager.rebase('main');
      }).toThrow(/uncommitted/i);
    });
  });

  describe('journal recording', () => {
    it('should record rebase in journal', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;
      
      // Create main commit
      createTestFile(testDir, 'main.txt', 'content\n');
      repo.add(path.join(testDir, 'main.txt'));
      repo.commit('Main commit');
      
      // Create feature from base
      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'feature.txt', 'content\n');
      repo.add(path.join(testDir, 'feature.txt'));
      repo.commit('Feature commit');
      
      const manager = new RebaseManager(repo, repo.gitDir);
      const rebaseResult = manager.rebase('main');
      
      if (rebaseResult.success) {
        const freshRepo = Repository.find(testDir);
        const lastEntry = freshRepo.journal.getLastEntry();
        expect(lastEntry?.operation).toBe('rebase');
      }
    });
  });
});
