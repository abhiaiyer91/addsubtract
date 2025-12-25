/**
 * Tests for the reset command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { reset } from '../commands/reset';
import { 
  createRepoWithMultipleCommits, 
  cleanupTempDir,
  suppressConsole,
  restoreCwd,
  createTestFile,
  readTestFile,
  fileExists,
} from './test-utils';
import { Repository } from '../core/repository';
import * as path from 'path';

describe('reset command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let commits: string[];
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const result = createRepoWithMultipleCommits(4);
    testDir = result.dir;
    repo = result.repo;
    commits = result.commits;
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('reset --soft', () => {
    it('should move HEAD to specified commit', () => {
      const result = reset({ mode: 'soft', target: 'HEAD~1' });
      
      expect(result.previousHash).toBe(commits[3]);
      expect(result.targetHash).toBe(commits[2]);
      expect(result.mode).toBe('soft');
    });

    it('should keep changes staged after soft reset', () => {
      reset({ mode: 'soft', target: 'HEAD~1' });
      
      // Reload repo to get fresh state
      const freshRepo = Repository.find(testDir);
      const status = freshRepo.status();
      
      // The file from the uncommitted commit should still be staged
      expect(status.staged.length).toBeGreaterThan(0);
    });

    it('should support HEAD~N syntax', () => {
      const result = reset({ mode: 'soft', target: 'HEAD~2' });
      
      expect(result.targetHash).toBe(commits[1]);
    });

    it('should support HEAD^ syntax', () => {
      const result = reset({ mode: 'soft', target: 'HEAD^' });
      
      expect(result.targetHash).toBe(commits[2]);
    });
  });

  describe('reset --mixed', () => {
    it('should move HEAD and reset index', () => {
      const result = reset({ mode: 'mixed', target: 'HEAD~1' });
      
      expect(result.previousHash).toBe(commits[3]);
      expect(result.targetHash).toBe(commits[2]);
      expect(result.mode).toBe('mixed');
    });

    it('should be the default mode', () => {
      const result = reset({ target: 'HEAD~1' });
      
      expect(result.mode).toBe('mixed');
    });
  });

  describe('reset --hard', () => {
    it('should move HEAD and reset working tree', () => {
      const result = reset({ mode: 'hard', target: 'HEAD~1' });
      
      expect(result.previousHash).toBe(commits[3]);
      expect(result.targetHash).toBe(commits[2]);
      expect(result.mode).toBe('hard');
    });

    it('should remove files not in target commit', () => {
      // file4.txt was added in commit 4
      expect(fileExists(testDir!, 'file4.txt')).toBe(true);
      
      reset({ mode: 'hard', target: 'HEAD~1' });
      
      // After hard reset to HEAD~1, file4.txt should be gone
      expect(fileExists(testDir!, 'file4.txt')).toBe(false);
    });

    it('should restore file contents to target commit state', () => {
      // First modify a file
      createTestFile(testDir!, 'file1.txt', 'Modified content\n');
      
      reset({ mode: 'hard', target: 'HEAD' });
      
      // File should be restored to original content
      const content = readTestFile(testDir!, 'file1.txt');
      expect(content).toBe('Content 1\n');
    });
  });

  describe('reset to commit hash', () => {
    it('should work with full commit hash', () => {
      const result = reset({ mode: 'soft', target: commits[1] });
      
      expect(result.targetHash).toBe(commits[1]);
    });
  });

  describe('journal recording', () => {
    it('should record the reset operation in journal', () => {
      reset({ mode: 'hard', target: 'HEAD~1' });
      
      const freshRepo = Repository.find(testDir);
      const lastEntry = freshRepo.journal.getLastEntry();
      expect(lastEntry).not.toBeNull();
      expect(lastEntry?.operation).toBe('reset');
    });
  });

  describe('error handling', () => {
    it('should throw error for invalid ref', () => {
      expect(() => reset({ target: 'nonexistent' })).toThrow();
    });

    it('should throw error when going back too many commits', () => {
      // We have 4 commits, trying to go back 10 should fail
      expect(() => reset({ target: 'HEAD~10' })).toThrow();
    });
  });
});
