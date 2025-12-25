/**
 * Tests for the bisect command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BisectManager } from '../commands/bisect';
import { 
  createRepoWithMultipleCommits, 
  cleanupTempDir,
  suppressConsole,
  restoreCwd,
} from './test-utils';
import { Repository } from '../core/repository';

describe('bisect command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let commits: string[];
  let consoleSuppressor: { restore: () => void };
  let bisect: BisectManager;

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const result = createRepoWithMultipleCommits(5);
    testDir = result.dir;
    repo = result.repo;
    commits = result.commits;
    bisect = new BisectManager(repo);
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('bisect start', () => {
    it('should start a new bisect session', () => {
      const state = bisect.start();
      
      expect(state.active).toBe(true);
      expect(state.good).toHaveLength(0);
      expect(state.bad).toHaveLength(0);
      expect(state.skipped).toHaveLength(0);
    });

    it('should record original HEAD', () => {
      const headBefore = repo.refs.resolve('HEAD');
      const state = bisect.start();
      
      expect(state.originalHead).toBe(headBefore);
    });

    it('should throw if bisect already in progress', () => {
      bisect.start();
      
      expect(() => bisect.start()).toThrow('Bisect session already in progress');
    });

    it('should add start entry to log', () => {
      bisect.start();
      const log = bisect.getLog();
      
      expect(log).toHaveLength(1);
      expect(log[0].action).toBe('start');
    });
  });

  describe('bisect good/bad marking', () => {
    beforeEach(() => {
      bisect.start();
    });

    it('should mark commit as bad', () => {
      bisect.markBad(commits[4]); // Latest commit
      const state = bisect.getState();
      
      expect(state?.bad).toContain(commits[4]);
    });

    it('should mark commit as good', () => {
      bisect.markGood(commits[0]); // First commit
      const state = bisect.getState();
      
      expect(state?.good).toContain(commits[0]);
    });

    it('should throw when marking same commit as bad twice', () => {
      bisect.markBad(commits[4]);
      
      expect(() => bisect.markBad(commits[4])).toThrow('already marked as bad');
    });

    it('should throw when marking same commit as good twice', () => {
      bisect.markGood(commits[0]);
      
      expect(() => bisect.markGood(commits[0])).toThrow('already marked as good');
    });
  });

  describe('bisect binary search', () => {
    beforeEach(() => {
      bisect.start();
    });

    it('should start binary search when both good and bad are marked', () => {
      bisect.markBad(commits[4]); // Latest as bad
      const { nextCommit } = bisect.markGood(commits[0]); // First as good
      
      // Should pick a commit in the middle
      expect(nextCommit).not.toBeNull();
      expect(nextCommit).not.toBe(commits[0]);
      expect(nextCommit).not.toBe(commits[4]);
    });

    it('should narrow down to find the culprit', () => {
      // Mark first commit as good, last as bad
      bisect.markBad(commits[4]);
      bisect.markGood(commits[0]);
      
      // Keep marking commits until we find the culprit
      let found = false;
      let iterations = 0;
      const maxIterations = 10;
      
      while (!found && iterations < maxIterations) {
        const state = bisect.getState();
        if (!state) break;
        
        const currentCommit = state.currentCommit;
        
        // Simulate: commits 0-2 are good, commits 3-4 are bad
        const commitIndex = commits.indexOf(currentCommit);
        
        if (commitIndex >= 0) {
          if (commitIndex <= 2) {
            const result = bisect.markGood();
            found = result.found;
          } else {
            const result = bisect.markBad();
            found = result.found;
          }
        }
        
        iterations++;
      }
      
      expect(found).toBe(true);
      const finalState = bisect.getState();
      expect(finalState?.currentCommit).toBe(commits[3]); // First bad commit
    });
  });

  describe('bisect skip', () => {
    beforeEach(() => {
      bisect.start();
      bisect.markBad(commits[4]);
      bisect.markGood(commits[0]);
    });

    it('should skip current commit and move to next', () => {
      const stateBefore = bisect.getState();
      const commitBefore = stateBefore?.currentCommit;
      
      bisect.skip();
      
      const stateAfter = bisect.getState();
      expect(stateAfter?.skipped).toContain(commitBefore);
    });

    it('should add skip entry to log', () => {
      bisect.skip();
      const log = bisect.getLog();
      
      const skipEntries = log.filter(e => e.action === 'skip');
      expect(skipEntries).toHaveLength(1);
    });
  });

  describe('bisect reset', () => {
    it('should end bisect session and restore original state', () => {
      const originalBranch = repo.refs.getCurrentBranch();
      
      bisect.start();
      bisect.markBad(commits[4]);
      bisect.markGood(commits[0]);
      
      const result = bisect.reset();
      
      expect(result.originalBranch).toBe(originalBranch);
      expect(bisect.isActive()).toBe(false);
    });

    it('should throw if no bisect in progress', () => {
      expect(() => bisect.reset()).toThrow('No bisect session in progress');
    });
  });

  describe('bisect status', () => {
    it('should return null when no session in progress', () => {
      const state = bisect.getState();
      expect(state).toBeNull();
    });

    it('should return active state when session is in progress', () => {
      bisect.start();
      const state = bisect.getState();
      
      expect(state).not.toBeNull();
      expect(state?.active).toBe(true);
    });
  });

  describe('remaining count estimation', () => {
    beforeEach(() => {
      bisect.start();
      bisect.markBad(commits[4]);
      bisect.markGood(commits[0]);
    });

    it('should estimate remaining steps correctly', () => {
      const remaining = bisect.getRemainingCount();
      const steps = bisect.estimateSteps();
      
      expect(remaining).toBeGreaterThan(0);
      expect(steps).toBeGreaterThanOrEqual(0);
    });
  });
});
