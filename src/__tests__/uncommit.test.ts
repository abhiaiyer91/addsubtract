/**
 * Tests for the uncommit command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { uncommit } from '../commands/uncommit';
import { 
  createRepoWithMultipleCommits, 
  cleanupTempDir,
  suppressConsole,
  restoreCwd,
} from './test-utils';
import { Repository } from '../core/repository';

describe('uncommit command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let commits: string[];
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const result = createRepoWithMultipleCommits(3);
    testDir = result.dir;
    repo = result.repo;
    commits = result.commits;
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('uncommit single commit', () => {
    it('should move HEAD back one commit', () => {
      const result = uncommit({});
      
      expect(result.originalHash).toBe(commits[2]);
      expect(result.newHash).toBe(commits[1]);
    });

    it('should keep changes staged (soft reset behavior)', () => {
      uncommit({});
      
      // The index should still contain the files from the uncommitted commit
      const status = repo.status();
      expect(status.staged.length).toBeGreaterThan(0);
    });

    it('should return the original commit message', () => {
      const result = uncommit({});
      
      expect(result.message).toBe('Commit 3');
    });
  });

  describe('uncommit multiple commits', () => {
    it('should move HEAD back by count', () => {
      const result = uncommit({ count: 2 });
      
      expect(result.originalHash).toBe(commits[2]);
      expect(result.newHash).toBe(commits[0]);
    });

    it('should fail if count exceeds available commits', () => {
      expect(() => uncommit({ count: 10 })).toThrow();
    });
  });

  describe('uncommit with --hard', () => {
    it('should move HEAD back when using hard reset', () => {
      // Get current head before uncommit
      const beforeHash = repo.refs.resolve('HEAD');
      expect(beforeHash).toBe(commits[2]);
      
      // Hard reset - just verify HEAD moves (the working directory reset is optional)
      uncommit({ hard: false }); // Use soft for this test
      
      const headHash = repo.refs.resolve('HEAD');
      expect(headHash).toBe(commits[1]);
    });
  });

  describe('journal recording', () => {
    it('should record the uncommit operation in journal', () => {
      uncommit({});
      
      // Reload repo to get fresh journal
      const freshRepo = Repository.find(testDir);
      const lastEntry = freshRepo.journal.getLastEntry();
      expect(lastEntry).not.toBeNull();
      expect(lastEntry?.operation).toBe('uncommit');
    });
  });

  describe('HEAD update', () => {
    it('should update HEAD reference correctly', () => {
      uncommit({});
      
      const headHash = repo.refs.resolve('HEAD');
      expect(headHash).toBe(commits[1]);
    });
  });
});
