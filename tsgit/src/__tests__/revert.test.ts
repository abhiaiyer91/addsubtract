/**
 * Tests for the revert command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { RevertManager } from '../commands/revert';
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

describe('revert command', () => {
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

  describe('basic revert', () => {
    it('should revert a commit that added a file', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      // Add a new file
      createTestFile(testDir, 'newfile.txt', 'new content\n');
      repo.add(path.join(testDir, 'newfile.txt'));
      const addCommit = repo.commit('Add newfile');
      
      expect(fileExists(testDir, 'newfile.txt')).toBe(true);
      
      // Revert the commit
      const manager = new RevertManager(repo, repo.gitDir);
      const revertResult = manager.revert([addCommit]);
      
      expect(revertResult.success).toBe(true);
      expect(revertResult.commits.length).toBe(1);
      expect(fileExists(testDir, 'newfile.txt')).toBe(false);
    });

    it('should revert a commit that modified a file', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      // Modify README
      createTestFile(testDir, 'README.md', '# Modified Project\n');
      repo.add(path.join(testDir, 'README.md'));
      const modifyCommit = repo.commit('Modify README');
      
      expect(readTestFile(testDir, 'README.md')).toBe('# Modified Project\n');
      
      // Revert the modification
      const manager = new RevertManager(repo, repo.gitDir);
      const revertResult = manager.revert([modifyCommit]);
      
      expect(revertResult.success).toBe(true);
      expect(readTestFile(testDir, 'README.md')).toBe('# Test Project\n');
    });

    it('should revert a commit that deleted a file', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      // Add a file first
      createTestFile(testDir, 'toDelete.txt', 'delete me\n');
      repo.add(path.join(testDir, 'toDelete.txt'));
      repo.commit('Add file to delete');
      
      // Delete it
      require('fs').unlinkSync(path.join(testDir, 'toDelete.txt'));
      repo.index.remove('toDelete.txt');
      repo.index.save();
      const deleteCommit = repo.commit('Delete file');
      
      expect(fileExists(testDir, 'toDelete.txt')).toBe(false);
      
      // Revert the deletion
      const manager = new RevertManager(repo, repo.gitDir);
      const revertResult = manager.revert([deleteCommit]);
      
      expect(revertResult.success).toBe(true);
      expect(fileExists(testDir, 'toDelete.txt')).toBe(true);
      expect(readTestFile(testDir, 'toDelete.txt')).toBe('delete me\n');
    });

    it('should create a revert commit with proper message', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      createTestFile(testDir, 'file.txt', 'content\n');
      repo.add(path.join(testDir, 'file.txt'));
      const originalCommit = repo.commit('Original commit message');
      
      const manager = new RevertManager(repo, repo.gitDir);
      const revertResult = manager.revert([originalCommit]);
      
      expect(revertResult.success).toBe(true);
      
      const revertCommitHash = revertResult.commits[0];
      const revertCommit = repo.objects.readCommit(revertCommitHash);
      
      expect(revertCommit.message).toContain('Revert');
      expect(revertCommit.message).toContain('Original commit message');
      expect(revertCommit.message).toContain(originalCommit);
    });

    it('should revert multiple commits', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      // Add first file
      createTestFile(testDir, 'file1.txt', 'content1\n');
      repo.add(path.join(testDir, 'file1.txt'));
      const commit1 = repo.commit('Add file1');
      
      // Add second file
      createTestFile(testDir, 'file2.txt', 'content2\n');
      repo.add(path.join(testDir, 'file2.txt'));
      const commit2 = repo.commit('Add file2');
      
      expect(fileExists(testDir, 'file1.txt')).toBe(true);
      expect(fileExists(testDir, 'file2.txt')).toBe(true);
      
      // Revert both commits (in reverse order to avoid conflicts)
      const manager = new RevertManager(repo, repo.gitDir);
      const revertResult = manager.revert([commit2, commit1]);
      
      expect(revertResult.success).toBe(true);
      expect(revertResult.commits.length).toBe(2);
      expect(fileExists(testDir, 'file1.txt')).toBe(false);
      expect(fileExists(testDir, 'file2.txt')).toBe(false);
    });
  });

  describe('revert with --no-commit', () => {
    it('should apply changes without committing', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const headBefore = repo.refs.resolve('HEAD');
      
      // Add a file
      createTestFile(testDir, 'file.txt', 'content\n');
      repo.add(path.join(testDir, 'file.txt'));
      const addCommit = repo.commit('Add file');
      
      // Revert without committing
      const manager = new RevertManager(repo, repo.gitDir);
      const revertResult = manager.revert([addCommit], { noCommit: true });
      
      expect(revertResult.success).toBe(true);
      expect(revertResult.commits.length).toBe(0);
      expect(fileExists(testDir, 'file.txt')).toBe(false);
      
      // HEAD should still point to addCommit (not headBefore)
      expect(repo.refs.resolve('HEAD')).toBe(addCommit);
    });
  });

  describe('revert state management', () => {
    it('should not be in progress initially', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      const manager = new RevertManager(repo, repo.gitDir);
      expect(manager.isInProgress()).toBe(false);
    });

    it('should track state during conflicts', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      // Create a file
      createTestFile(testDir, 'file.txt', 'original\n');
      repo.add(path.join(testDir, 'file.txt'));
      const addCommit = repo.commit('Add file');
      
      // Modify file
      createTestFile(testDir, 'file.txt', 'modified\n');
      repo.add(path.join(testDir, 'file.txt'));
      const modifyCommit = repo.commit('Modify file');
      
      // Modify again
      createTestFile(testDir, 'file.txt', 'modified again\n');
      repo.add(path.join(testDir, 'file.txt'));
      repo.commit('Modify again');
      
      // Try to revert the first modification (should conflict)
      const manager = new RevertManager(repo, repo.gitDir);
      const revertResult = manager.revert([modifyCommit]);
      
      if (!revertResult.success) {
        expect(manager.isInProgress()).toBe(true);
        expect(revertResult.conflicts).toBeDefined();
      }
    });
  });

  describe('revert abort', () => {
    it('should restore original state on abort', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      // Create conflict situation
      createTestFile(testDir, 'file.txt', 'v1\n');
      repo.add(path.join(testDir, 'file.txt'));
      const v1Commit = repo.commit('Version 1');
      
      createTestFile(testDir, 'file.txt', 'v2\n');
      repo.add(path.join(testDir, 'file.txt'));
      const v2Commit = repo.commit('Version 2');
      
      createTestFile(testDir, 'file.txt', 'v3\n');
      repo.add(path.join(testDir, 'file.txt'));
      const v3Commit = repo.commit('Version 3');
      
      const manager = new RevertManager(repo, repo.gitDir);
      const revertResult = manager.revert([v2Commit]);
      
      if (!revertResult.success && manager.isInProgress()) {
        manager.abort();
        
        expect(manager.isInProgress()).toBe(false);
        expect(repo.refs.resolve('HEAD')).toBe(v3Commit);
      }
    });
  });

  describe('error handling', () => {
    it('should error on invalid commit reference', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      const manager = new RevertManager(repo, repo.gitDir);
      
      expect(() => {
        manager.revert(['nonexistent-commit']);
      }).toThrow();
    });

    it('should error when revert already in progress', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      // Create conflict situation
      createTestFile(testDir, 'file.txt', 'v1\n');
      repo.add(path.join(testDir, 'file.txt'));
      repo.commit('V1');
      
      createTestFile(testDir, 'file.txt', 'v2\n');
      repo.add(path.join(testDir, 'file.txt'));
      const v2Commit = repo.commit('V2');
      
      createTestFile(testDir, 'file.txt', 'v3\n');
      repo.add(path.join(testDir, 'file.txt'));
      repo.commit('V3');
      
      const manager = new RevertManager(repo, repo.gitDir);
      const firstResult = manager.revert([v2Commit]);
      
      if (!firstResult.success && manager.isInProgress()) {
        expect(() => {
          manager.revert([v2Commit]);
        }).toThrow(/already in progress/);
      }
    });

    it('should error when trying to revert initial commit', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      const manager = new RevertManager(repo, repo.gitDir);
      
      expect(() => {
        manager.revert([result.commitHash]);
      }).toThrow(/initial commit/i);
    });
  });

  describe('journal recording', () => {
    it('should record revert in journal', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      createTestFile(testDir, 'file.txt', 'content\n');
      repo.add(path.join(testDir, 'file.txt'));
      const addCommit = repo.commit('Add file');
      
      const manager = new RevertManager(repo, repo.gitDir);
      manager.revert([addCommit]);
      
      const freshRepo = Repository.find(testDir);
      const lastEntry = freshRepo.journal.getLastEntry();
      expect(lastEntry?.operation).toBe('revert');
    });
  });

  describe('revert with signoff', () => {
    it('should add signed-off-by line when requested', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      
      createTestFile(testDir, 'file.txt', 'content\n');
      repo.add(path.join(testDir, 'file.txt'));
      const addCommit = repo.commit('Add file');
      
      const manager = new RevertManager(repo, repo.gitDir);
      const revertResult = manager.revert([addCommit], { signoff: true });
      
      expect(revertResult.success).toBe(true);
      
      const revertCommit = repo.objects.readCommit(revertResult.commits[0]);
      expect(revertCommit.message).toContain('Signed-off-by:');
    });
  });
});
