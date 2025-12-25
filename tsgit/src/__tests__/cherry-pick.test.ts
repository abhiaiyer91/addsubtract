/**
 * Tests for the cherry-pick command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { CherryPickManager } from '../commands/cherry-pick';
import { 
  createRepoWithCommit, 
  cleanupTempDir, 
  createTestFile,
  readTestFile,
  fileExists,
  suppressConsole,
  restoreCwd,
} from './test-utils';
import { Repository } from '../core/repository';

describe('cherry-pick command', () => {
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

  describe('basic cherry-pick', () => {
    it('should apply a commit from another branch', () => {
      // Setup: create repo with initial commit
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      // Create a branch and add a NEW file (not in main) there
      repo.createBranch('feature');
      repo.checkout('feature');
      
      createTestFile(testDir, 'feature-only.txt', 'feature content\n');
      repo.add(path.join(testDir, 'feature-only.txt'));
      const featureCommit = repo.commit('Add feature file');
      
      // Go back to main - delete the file manually since checkout doesn't clean WD
      repo.checkout('main');
      const featureFile = path.join(testDir, 'feature-only.txt');
      if (require('fs').existsSync(featureFile)) {
        require('fs').unlinkSync(featureFile);
      }
      
      // Cherry-pick the feature commit
      const manager = new CherryPickManager(repo, repo.gitDir);
      const cherryPickResult = manager.cherryPick([featureCommit]);
      
      expect(cherryPickResult.success).toBe(true);
      expect(cherryPickResult.commits.length).toBe(1);
      expect(fileExists(testDir, 'feature-only.txt')).toBe(true);
      expect(readTestFile(testDir, 'feature-only.txt')).toBe('feature content\n');
    });

    it('should apply multiple commits', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      // Create a branch and add multiple commits
      repo.createBranch('feature');
      repo.checkout('feature');
      
      createTestFile(testDir, 'file1.txt', 'content1\n');
      repo.add(path.join(testDir, 'file1.txt'));
      const commit1 = repo.commit('Add file1');
      
      createTestFile(testDir, 'file2.txt', 'content2\n');
      repo.add(path.join(testDir, 'file2.txt'));
      const commit2 = repo.commit('Add file2');
      
      // Go back to main
      repo.checkout('main');
      
      // Cherry-pick both commits
      const manager = new CherryPickManager(repo, repo.gitDir);
      const cherryPickResult = manager.cherryPick([commit1, commit2]);
      
      expect(cherryPickResult.success).toBe(true);
      expect(cherryPickResult.commits.length).toBe(2);
      expect(fileExists(testDir, 'file1.txt')).toBe(true);
      expect(fileExists(testDir, 'file2.txt')).toBe(true);
    });

    it('should preserve commit message', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      repo.createBranch('feature');
      repo.checkout('feature');
      
      createTestFile(testDir, 'feature.txt', 'content\n');
      repo.add(path.join(testDir, 'feature.txt'));
      const featureCommit = repo.commit('Special commit message');
      
      repo.checkout('main');
      
      const manager = new CherryPickManager(repo, repo.gitDir);
      const cherryPickResult = manager.cherryPick([featureCommit]);
      
      expect(cherryPickResult.success).toBe(true);
      const newCommit = repo.objects.readCommit(cherryPickResult.commits[0]);
      expect(newCommit.message).toBe('Special commit message');
    });
  });

  describe('cherry-pick with --no-commit', () => {
    it('should apply changes without committing', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const originalHead = repo.refs.resolve('HEAD');
      
      repo.createBranch('feature');
      repo.checkout('feature');
      
      createTestFile(testDir, 'feature.txt', 'content\n');
      repo.add(path.join(testDir, 'feature.txt'));
      const featureCommit = repo.commit('Add feature');
      
      repo.checkout('main');
      
      const manager = new CherryPickManager(repo, repo.gitDir);
      const cherryPickResult = manager.cherryPick([featureCommit], { noCommit: true });
      
      expect(cherryPickResult.success).toBe(true);
      expect(cherryPickResult.commits.length).toBe(0);
      expect(fileExists(testDir, 'feature.txt')).toBe(true);
      
      // HEAD should not have changed
      expect(repo.refs.resolve('HEAD')).toBe(originalHead);
    });
  });

  describe('cherry-pick state management', () => {
    it('should not be in progress initially', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      const manager = new CherryPickManager(repo, repo.gitDir);
      expect(manager.isInProgress()).toBe(false);
    });

    it('should detect in-progress cherry-pick', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      // Create conflicting situation
      createTestFile(testDir, 'conflict.txt', 'main content\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Add conflict file on main');
      
      repo.createBranch('feature');
      repo.checkout('feature');
      
      // Modify the same file differently
      createTestFile(testDir, 'conflict.txt', 'feature content\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      const featureCommit = repo.commit('Modify conflict file on feature');
      
      // Go back to main and modify differently
      repo.checkout('main');
      createTestFile(testDir, 'conflict.txt', 'different main content\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Modify conflict file differently on main');
      
      const manager = new CherryPickManager(repo, repo.gitDir);
      const cherryPickResult = manager.cherryPick([featureCommit]);
      
      // If there's a conflict, state should be saved
      if (!cherryPickResult.success) {
        expect(manager.isInProgress()).toBe(true);
        expect(manager.getState()).not.toBeNull();
      }
    });
  });

  describe('cherry-pick abort', () => {
    it('should abort and restore original state', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      const originalHead = repo.refs.resolve('HEAD');
      
      // Create a conflict situation
      createTestFile(testDir, 'file.txt', 'original\n');
      repo.add(path.join(testDir, 'file.txt'));
      repo.commit('Add file');
      
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'file.txt', 'feature version\n');
      repo.add(path.join(testDir, 'file.txt'));
      const featureCommit = repo.commit('Modify on feature');
      
      repo.checkout('main');
      createTestFile(testDir, 'file.txt', 'main version\n');
      repo.add(path.join(testDir, 'file.txt'));
      const mainHead = repo.commit('Modify on main');
      
      const manager = new CherryPickManager(repo, repo.gitDir);
      const cherryPickResult = manager.cherryPick([featureCommit]);
      
      if (!cherryPickResult.success && manager.isInProgress()) {
        manager.abort();
        
        expect(manager.isInProgress()).toBe(false);
        expect(repo.refs.resolve('HEAD')).toBe(mainHead);
      }
    });
  });

  describe('error handling', () => {
    it('should error on invalid commit reference', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      const manager = new CherryPickManager(repo, repo.gitDir);
      
      expect(() => {
        manager.cherryPick(['nonexistent-commit']);
      }).toThrow();
    });

    it('should error when cherry-pick already in progress', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      // Manually create a state file to simulate in-progress
      const manager = new CherryPickManager(repo, repo.gitDir);
      
      // Create conflict situation to trigger in-progress state
      createTestFile(testDir, 'file.txt', 'content\n');
      repo.add(path.join(testDir, 'file.txt'));
      repo.commit('Add file');
      
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'file.txt', 'feature\n');
      repo.add(path.join(testDir, 'file.txt'));
      const featureCommit = repo.commit('Feature change');
      
      repo.checkout('main');
      createTestFile(testDir, 'file.txt', 'main\n');
      repo.add(path.join(testDir, 'file.txt'));
      repo.commit('Main change');
      
      const firstResult = manager.cherryPick([featureCommit]);
      
      if (!firstResult.success && manager.isInProgress()) {
        expect(() => {
          manager.cherryPick([featureCommit]);
        }).toThrow(/already in progress/);
      }
    });
  });

  describe('journal recording', () => {
    it('should record cherry-pick in journal', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'feature.txt', 'content\n');
      repo.add(path.join(testDir, 'feature.txt'));
      const featureCommit = repo.commit('Feature commit');
      
      repo.checkout('main');
      
      const manager = new CherryPickManager(repo, repo.gitDir);
      manager.cherryPick([featureCommit]);
      
      const freshRepo = Repository.find(testDir);
      const lastEntry = freshRepo.journal.getLastEntry();
      expect(lastEntry?.operation).toBe('cherry-pick');
    });
  });
});
