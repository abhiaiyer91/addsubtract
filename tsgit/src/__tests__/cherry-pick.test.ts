/**
 * Tests for the cherry-pick command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cherryPick, cherryPickAbort, isCherryPickInProgress } from '../commands/cherry-pick';
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

describe('cherry-pick command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let consoleSuppressor: { restore: () => void };

  afterEach(() => {
    consoleSuppressor?.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('basic cherry-pick', () => {
    beforeEach(() => {
      consoleSuppressor = suppressConsole();
      
      // Create a repo with initial commit
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      // Create a branch with some commits
      repo.createBranch('feature');
      repo.checkout('feature');
      
      // Add commit on feature branch
      createTestFile(testDir, 'feature-file.txt', 'Feature content\n');
      repo.add(path.join(testDir, 'feature-file.txt'));
      repo.commit('Add feature file');
      
      // Go back to main
      repo.checkout('main');
    });

    it('should apply changes from a commit to current branch', () => {
      // Get the feature branch commit
      const featureHead = repo.refs.resolve('feature');
      expect(featureHead).not.toBeNull();
      
      // Cherry-pick the commit
      const result = cherryPick(featureHead!);
      
      expect(result.hasConflicts).toBe(false);
      expect(result.commitHash).not.toBe('');
      expect(fileExists(testDir!, 'feature-file.txt')).toBe(true);
    });

    it('should preserve the original commit message', () => {
      const featureHead = repo.refs.resolve('feature');
      const result = cherryPick(featureHead!);
      
      expect(result.message).toBe('Add feature file');
    });

    it('should create a new commit on current branch', () => {
      const mainHeadBefore = repo.refs.resolve('HEAD');
      const featureHead = repo.refs.resolve('feature');
      const result = cherryPick(featureHead!);
      
      // HEAD should have moved forward
      const mainHeadAfter = repo.refs.resolve('HEAD');
      expect(mainHeadAfter).not.toBe(mainHeadBefore);
      expect(mainHeadAfter).toBe(result.commitHash);
    });
  });

  describe('cherry-pick with --no-commit', () => {
    beforeEach(() => {
      consoleSuppressor = suppressConsole();
      
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      repo.createBranch('feature');
      repo.checkout('feature');
      
      createTestFile(testDir, 'feature-file.txt', 'Feature content\n');
      repo.add(path.join(testDir, 'feature-file.txt'));
      repo.commit('Add feature file');
      
      repo.checkout('main');
    });

    it('should apply changes without creating a commit', () => {
      const featureHead = repo.refs.resolve('feature');
      const mainHeadBefore = repo.refs.resolve('HEAD');
      
      const result = cherryPick(featureHead!, { noCommit: true });
      
      const mainHeadAfter = repo.refs.resolve('HEAD');
      
      // HEAD should not have changed
      expect(mainHeadAfter).toBe(mainHeadBefore);
      
      // But the file should exist
      expect(fileExists(testDir!, 'feature-file.txt')).toBe(true);
      
      // And no commit hash should be returned
      expect(result.commitHash).toBe('');
    });
  });

  describe('cherry-pick with conflicts', () => {
    beforeEach(() => {
      consoleSuppressor = suppressConsole();
      
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      // Create feature branch
      repo.createBranch('feature');
      repo.checkout('feature');
      
      // Add a file with content
      createTestFile(testDir, 'shared-file.txt', 'Feature content\n');
      repo.add(path.join(testDir, 'shared-file.txt'));
      repo.commit('Add shared file on feature');
      
      // Go to main and add same file with different content
      repo.checkout('main');
      createTestFile(testDir, 'shared-file.txt', 'Main content\n');
      repo.add(path.join(testDir, 'shared-file.txt'));
      repo.commit('Add shared file on main');
    });

    it('should detect conflicts', () => {
      const featureHead = repo.refs.resolve('feature');
      const result = cherryPick(featureHead!);
      
      expect(result.hasConflicts).toBe(true);
      expect(result.conflictFiles).toContain('shared-file.txt');
    });

    it('should set cherry-pick in progress state', () => {
      const featureHead = repo.refs.resolve('feature');
      cherryPick(featureHead!);
      
      const freshRepo = Repository.find(testDir);
      expect(isCherryPickInProgress(freshRepo)).toBe(true);
    });
  });

  describe('cherry-pick abort', () => {
    beforeEach(() => {
      consoleSuppressor = suppressConsole();
      
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      repo.createBranch('feature');
      repo.checkout('feature');
      
      createTestFile(testDir, 'shared-file.txt', 'Feature content\n');
      repo.add(path.join(testDir, 'shared-file.txt'));
      repo.commit('Add shared file on feature');
      
      repo.checkout('main');
      createTestFile(testDir, 'shared-file.txt', 'Main content\n');
      repo.add(path.join(testDir, 'shared-file.txt'));
      repo.commit('Add shared file on main');
    });

    it('should abort cherry-pick in progress', () => {
      const featureHead = repo.refs.resolve('feature');
      cherryPick(featureHead!);
      
      cherryPickAbort();
      
      const freshRepo = Repository.find(testDir);
      expect(isCherryPickInProgress(freshRepo)).toBe(false);
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
      
      createTestFile(testDir, 'feature-file.txt', 'Feature content\n');
      repo.add(path.join(testDir, 'feature-file.txt'));
      repo.commit('Add feature file');
      
      repo.checkout('main');
    });

    it('should record the cherry-pick operation in journal', () => {
      const featureHead = repo.refs.resolve('feature');
      cherryPick(featureHead!);
      
      const freshRepo = Repository.find(testDir);
      const lastEntry = freshRepo.journal.getLastEntry();
      expect(lastEntry).not.toBeNull();
      expect(lastEntry?.operation).toBe('cherry-pick');
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      consoleSuppressor = suppressConsole();
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
    });

    it('should throw error for invalid commit ref', () => {
      expect(() => cherryPick('nonexistent')).toThrow();
    });

    it('should throw error for initial commit', () => {
      const headHash = repo.refs.resolve('HEAD');
      // The first commit has no parent, so cherry-picking it should fail
      expect(() => cherryPick(headHash!)).toThrow();
    });
  });
});
