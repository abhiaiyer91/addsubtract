/**
 * Tests for the rebase command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rebase, rebaseAbort, isRebaseInProgress } from '../commands/rebase';
import { 
  createTestRepo,
  createRepoWithCommit, 
  cleanupTempDir,
  suppressConsole,
  restoreCwd,
  createTestFile,
  readTestFile,
  fileExists,
} from './test-utils';
import { Repository } from '../core/repository';
import * as path from 'path';

describe('rebase command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let consoleSuppressor: { restore: () => void };

  afterEach(() => {
    consoleSuppressor?.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('basic rebase', () => {
    beforeEach(() => {
      consoleSuppressor = suppressConsole();
      
      // Create a repo with initial commit
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      // Add another commit on main
      createTestFile(testDir, 'main-file.txt', 'Main content\n');
      repo.add(path.join(testDir, 'main-file.txt'));
      repo.commit('Add main file');
      
      const mainHead = repo.refs.resolve('HEAD');
      
      // Create and switch to feature branch from first commit
      repo.checkout(result.commitHash, false);
      repo.refs.createBranch('feature', result.commitHash);
      repo.refs.setHeadSymbolic('refs/heads/feature');
      
      // Add commits on feature branch
      createTestFile(testDir, 'feature1.txt', 'Feature 1\n');
      repo.add(path.join(testDir, 'feature1.txt'));
      repo.commit('Add feature 1');
      
      createTestFile(testDir, 'feature2.txt', 'Feature 2\n');
      repo.add(path.join(testDir, 'feature2.txt'));
      repo.commit('Add feature 2');
    });

    it('should rebase commits onto another branch', () => {
      const featureHeadBefore = repo.refs.resolve('HEAD');
      
      const result = rebase('main');
      
      expect(result.success).toBe(true);
      expect(result.commitsRebased).toBe(2);
      
      // Feature branch should have new commits
      const featureHeadAfter = repo.refs.resolve('HEAD');
      expect(featureHeadAfter).not.toBe(featureHeadBefore);
      
      // Both feature files should still exist
      expect(fileExists(testDir!, 'feature1.txt')).toBe(true);
      expect(fileExists(testDir!, 'feature2.txt')).toBe(true);
      
      // Main file should now be present too
      expect(fileExists(testDir!, 'main-file.txt')).toBe(true);
    });

    it('should update the branch ref', () => {
      const mainHead = repo.refs.resolve('main');
      
      rebase('main');
      
      // The new HEAD should be a descendant of main
      const newHead = repo.refs.resolve('HEAD');
      const commit = repo.objects.readCommit(newHead!);
      
      // Walk back to find main as ancestor
      let current = newHead;
      let foundMain = false;
      let maxDepth = 10;
      
      while (current && maxDepth > 0) {
        if (current === mainHead) {
          foundMain = true;
          break;
        }
        const c = repo.objects.readCommit(current);
        current = c.parentHashes[0] || null;
        maxDepth--;
      }
      
      expect(foundMain).toBe(true);
    });
  });

  describe('rebase with no commits to rebase', () => {
    beforeEach(() => {
      consoleSuppressor = suppressConsole();
      
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      // Feature is already at main, no commits to rebase
      repo.createBranch('feature');
      repo.checkout('feature');
    });

    it('should succeed with 0 commits rebased', () => {
      const result = rebase('main');
      
      expect(result.success).toBe(true);
      expect(result.commitsRebased).toBe(0);
    });
  });

  describe('rebase with conflicts', () => {
    beforeEach(() => {
      consoleSuppressor = suppressConsole();
      
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const initialCommit = result.commitHash;
      
      // Add commit on main that modifies a file
      createTestFile(testDir, 'shared.txt', 'Main version\n');
      repo.add(path.join(testDir, 'shared.txt'));
      repo.commit('Add shared file on main');
      
      // Create feature from initial commit
      repo.checkout(initialCommit, false);
      repo.refs.createBranch('feature', initialCommit);
      repo.refs.setHeadSymbolic('refs/heads/feature');
      
      // Add same file with different content on feature
      createTestFile(testDir, 'shared.txt', 'Feature version\n');
      repo.add(path.join(testDir, 'shared.txt'));
      repo.commit('Add shared file on feature');
    });

    it('should detect conflicts during rebase', () => {
      const result = rebase('main');
      
      expect(result.success).toBe(false);
      expect(result.conflicts).toBeDefined();
      expect(result.conflicts!.length).toBeGreaterThan(0);
    });

    it('should set rebase in progress state', () => {
      rebase('main');
      
      const freshRepo = Repository.find(testDir);
      expect(isRebaseInProgress(freshRepo)).toBe(true);
    });
  });

  describe('rebase abort', () => {
    beforeEach(() => {
      consoleSuppressor = suppressConsole();
      
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const initialCommit = result.commitHash;
      
      createTestFile(testDir, 'shared.txt', 'Main version\n');
      repo.add(path.join(testDir, 'shared.txt'));
      repo.commit('Add shared file on main');
      
      repo.checkout(initialCommit, false);
      repo.refs.createBranch('feature', initialCommit);
      repo.refs.setHeadSymbolic('refs/heads/feature');
      
      createTestFile(testDir, 'shared.txt', 'Feature version\n');
      repo.add(path.join(testDir, 'shared.txt'));
      repo.commit('Add shared file on feature');
    });

    it('should abort rebase in progress', () => {
      const headBefore = repo.refs.resolve('HEAD');
      
      rebase('main');
      rebaseAbort();
      
      const freshRepo = Repository.find(testDir);
      expect(isRebaseInProgress(freshRepo)).toBe(false);
      
      // HEAD should be restored
      const headAfter = freshRepo.refs.resolve('HEAD');
      expect(headAfter).toBe(headBefore);
    });

    it('should restore working tree to original state', () => {
      rebase('main');
      rebaseAbort();
      
      // The file should be back to feature version
      const content = readTestFile(testDir!, 'shared.txt');
      expect(content).toBe('Feature version\n');
    });
  });

  describe('interactive rebase', () => {
    beforeEach(() => {
      consoleSuppressor = suppressConsole();
      
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      createTestFile(testDir, 'main-file.txt', 'Main content\n');
      repo.add(path.join(testDir, 'main-file.txt'));
      repo.commit('Add main file');
      
      const mainHead = repo.refs.resolve('HEAD');
      
      repo.checkout(result.commitHash, false);
      repo.refs.createBranch('feature', result.commitHash);
      repo.refs.setHeadSymbolic('refs/heads/feature');
      
      createTestFile(testDir, 'feature1.txt', 'Feature 1\n');
      repo.add(path.join(testDir, 'feature1.txt'));
      repo.commit('Add feature 1');
    });

    it('should save state for interactive rebase', () => {
      const result = rebase('main', { interactive: true });
      
      // Interactive rebase saves state but doesn't apply yet
      expect(result.success).toBe(true);
      expect(result.commitsRebased).toBe(0);
      
      const freshRepo = Repository.find(testDir);
      expect(isRebaseInProgress(freshRepo)).toBe(true);
    });
  });

  describe('journal recording', () => {
    beforeEach(() => {
      consoleSuppressor = suppressConsole();
      
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      repo.createBranch('feature');
      repo.checkout('feature');
      
      createTestFile(testDir, 'feature.txt', 'Feature\n');
      repo.add(path.join(testDir, 'feature.txt'));
      repo.commit('Add feature');
    });

    it('should record the rebase operation in journal', () => {
      rebase('main');
      
      const freshRepo = Repository.find(testDir);
      const lastEntry = freshRepo.journal.getLastEntry();
      expect(lastEntry).not.toBeNull();
      expect(lastEntry?.operation).toBe('rebase');
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      consoleSuppressor = suppressConsole();
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
    });

    it('should throw error for invalid upstream ref', () => {
      expect(() => rebase('nonexistent')).toThrow();
    });

    it('should throw error when there are uncommitted changes', () => {
      // Make changes without committing
      createTestFile(testDir!, 'uncommitted.txt', 'Uncommitted\n');
      repo.add(path.join(testDir!, 'uncommitted.txt'));
      
      expect(() => rebase('main')).toThrow();
    });
  });
});
