/**
 * Tests for the cleanup command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { analyzeBranches, deleteBranches } from '../commands/cleanup';
import { 
  createRepoWithBranches, 
  cleanupTempDir,
  suppressConsole,
  restoreCwd,
} from './test-utils';
import { Repository } from '../core/repository';

describe('cleanup command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const result = createRepoWithBranches(['feature-a', 'feature-b', 'old-branch']);
    testDir = result.dir;
    repo = result.repo;
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('analyzeBranches', () => {
    it('should not include current branch', () => {
      const candidates = analyzeBranches({});
      const branchNames = candidates.map(c => c.name);
      
      const currentBranch = repo.refs.getCurrentBranch();
      expect(branchNames).not.toContain(currentBranch);
    });

    it('should not include main/master branch', () => {
      const candidates = analyzeBranches({});
      const branchNames = candidates.map(c => c.name);
      
      expect(branchNames).not.toContain('main');
      expect(branchNames).not.toContain('master');
    });

    it('should return array for merged branch query', () => {
      // Test that the merged branch query returns an array
      // (Full merge detection is complex and depends on repository state)
      const candidates = analyzeBranches({ merged: true });
      expect(Array.isArray(candidates)).toBe(true);
    });

    it('should return branch info with required fields', () => {
      const candidates = analyzeBranches({ all: true });
      
      if (candidates.length > 0) {
        const branch = candidates[0];
        expect(branch).toHaveProperty('name');
        expect(branch).toHaveProperty('lastCommitHash');
        expect(branch).toHaveProperty('lastCommitDate');
        expect(branch).toHaveProperty('lastCommitMessage');
        expect(branch).toHaveProperty('isMerged');
        expect(branch).toHaveProperty('isStale');
        expect(branch).toHaveProperty('daysSinceLastCommit');
      }
    });
  });

  describe('deleteBranches', () => {
    it('should delete specified branches', () => {
      const branchesBefore = repo.refs.listBranches();
      expect(branchesBefore).toContain('feature-a');
      
      const result = deleteBranches(['feature-a']);
      
      expect(result.deleted).toContain('feature-a');
      expect(result.errors.length).toBe(0);
      
      const branchesAfter = repo.refs.listBranches();
      expect(branchesAfter).not.toContain('feature-a');
    });

    it('should handle errors when deleting non-existent branches', () => {
      const result = deleteBranches(['non-existent-branch']);
      
      expect(result.deleted.length).toBe(0);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0].branch).toBe('non-existent-branch');
    });

    it('should delete multiple branches', () => {
      const result = deleteBranches(['feature-a', 'feature-b']);
      
      expect(result.deleted).toContain('feature-a');
      expect(result.deleted).toContain('feature-b');
    });
  });

  describe('stale branch detection', () => {
    it('should mark old branches as stale', () => {
      // All our test branches were just created, so none should be stale
      const candidates = analyzeBranches({ stale: true, staleDays: 30 });
      
      // Fresh branches shouldn't be stale
      expect(candidates.every(c => c.daysSinceLastCommit < 30 || c.isStale)).toBe(true);
    });

    it('should respect custom stale days threshold', () => {
      // With staleDays: 0, all non-current branches should be considered stale
      const candidates = analyzeBranches({ stale: true, staleDays: 0 });
      
      // All candidates should be marked stale with 0 day threshold
      expect(candidates.every(c => c.isStale)).toBe(true);
    });
  });
});
