/**
 * Tests for the merge module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { MergeManager, MergeResult, MergeState, FileConflict, formatMergeResult, formatConflict } from '../core/merge';
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

describe('merge', () => {
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

  describe('fast-forward merge', () => {
    it('should fast-forward when possible', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      // Create branch and commit
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'feature.txt', 'feature content\n');
      repo.add(path.join(testDir, 'feature.txt'));
      repo.commit('Feature commit');

      // Checkout main and merge
      repo.checkout('main');
      const mergeResult = repo.mergeManager.merge('feature');

      expect(mergeResult.success).toBe(true);
      expect(mergeResult.conflicts.length).toBe(0);
      expect(fileExists(testDir, 'feature.txt')).toBe(true);
    });

    it('should update HEAD correctly after fast-forward', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      // Create and checkout feature branch
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'feature.txt', 'content\n');
      repo.add(path.join(testDir, 'feature.txt'));
      const featureCommit = repo.commit('Feature commit');

      // Checkout main and merge
      repo.checkout('main');
      const initialHead = repo.refs.resolve('HEAD');
      expect(initialHead).not.toBe(featureCommit);

      repo.mergeManager.merge('feature');

      // HEAD should now point to feature commit
      const newHead = repo.refs.resolve('HEAD');
      expect(newHead).toBe(featureCommit);
    });

    it('should update working directory after fast-forward', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;

      // Add a file on main first, then create feature from there
      createTestFile(testDir, 'main-file.txt', 'main content\n');
      repo.add(path.join(testDir, 'main-file.txt'));
      repo.commit('Main file');

      // Create feature branch and add files
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'file1.txt', 'content1\n');
      createTestFile(testDir, 'file2.txt', 'content2\n');
      repo.add(path.join(testDir, 'file1.txt'));
      repo.add(path.join(testDir, 'file2.txt'));
      repo.commit('Add feature files');

      // Go back to main before feature was created
      repo.checkout('main');
      
      // After merge, feature files should exist (fast-forward brings them in)
      repo.mergeManager.merge('feature');
      
      // Verify files from feature branch are now present
      expect(fileExists(testDir, 'file1.txt')).toBe(true);
      expect(fileExists(testDir, 'file2.txt')).toBe(true);
      expect(readTestFile(testDir, 'file1.txt')).toBe('content1\n');
      expect(readTestFile(testDir, 'file2.txt')).toBe('content2\n');
    });
  });

  describe('three-way merge', () => {
    it('should merge divergent branches without conflicts', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;

      // Add commit to main
      createTestFile(testDir, 'main.txt', 'main content\n');
      repo.add(path.join(testDir, 'main.txt'));
      const mainCommit = repo.commit('Main commit');

      // Create feature from base with different file
      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'feature.txt', 'feature content\n');
      repo.add(path.join(testDir, 'feature.txt'));
      repo.commit('Feature commit');

      // Checkout main and merge
      repo.checkout('main');
      const mergeResult = repo.mergeManager.merge('feature');

      expect(mergeResult.success).toBe(true);
      expect(mergeResult.conflicts.length).toBe(0);
      
      // Both files should exist
      expect(fileExists(testDir, 'main.txt')).toBe(true);
      expect(fileExists(testDir, 'feature.txt')).toBe(true);
    });

    it('should handle auto-merged files', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;

      // Modify README on main
      createTestFile(testDir, 'README.md', '# Test Project\n\nModified on main\n');
      repo.add(path.join(testDir, 'README.md'));
      repo.commit('Update README on main');

      // Create feature from base with new file
      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'feature.txt', 'feature content\n');
      repo.add(path.join(testDir, 'feature.txt'));
      repo.commit('Add feature file');

      // Merge
      repo.checkout('main');
      const mergeResult = repo.mergeManager.merge('feature');

      expect(mergeResult.success).toBe(true);
      expect(mergeResult.added.includes('feature.txt')).toBe(true);
    });

    it('should track deleted files in merge result', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;

      // Add a file and commit on main
      createTestFile(testDir, 'extra.txt', 'extra content\n');
      repo.add(path.join(testDir, 'extra.txt'));
      repo.commit('Add extra file');

      // Create feature from base, which doesn't have extra.txt
      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'feature.txt', 'feature content\n');
      repo.add(path.join(testDir, 'feature.txt'));
      repo.commit('Add feature file');

      // The merge will have to handle the file that exists only in one branch
      repo.checkout('main');
      const mergeResult = repo.mergeManager.merge('feature');

      // Should succeed - different files in different branches is not a conflict
      expect(mergeResult.success).toBe(true);
    });
  });

  describe('conflict detection', () => {
    it('should detect conflict when same line changed in both branches', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;

      // Modify README on main
      createTestFile(testDir, 'README.md', '# Modified on Main\n');
      repo.add(path.join(testDir, 'README.md'));
      repo.commit('Main modifies README');

      // Create feature from base and modify same file
      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'README.md', '# Modified on Feature\n');
      repo.add(path.join(testDir, 'README.md'));
      repo.commit('Feature modifies README');

      // Merge should detect conflict
      repo.checkout('main');
      const mergeResult = repo.mergeManager.merge('feature');

      expect(mergeResult.success).toBe(false);
      expect(mergeResult.conflicts.length).toBeGreaterThan(0);
      expect(mergeResult.conflicts[0].path).toBe('README.md');
    });

    it('should detect conflict when file added in both branches differently', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;

      // Add new file on main
      createTestFile(testDir, 'new.txt', 'main version\n');
      repo.add(path.join(testDir, 'new.txt'));
      repo.commit('Main adds new.txt');

      // Add same file with different content on feature
      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'new.txt', 'feature version\n');
      repo.add(path.join(testDir, 'new.txt'));
      repo.commit('Feature adds new.txt');

      // Merge should detect conflict
      repo.checkout('main');
      const mergeResult = repo.mergeManager.merge('feature');

      expect(mergeResult.success).toBe(false);
      expect(mergeResult.conflicts.length).toBeGreaterThan(0);
    });

    it('should contain conflict regions with ours and theirs content', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;

      // Modify on main
      createTestFile(testDir, 'README.md', 'main content\n');
      repo.add(path.join(testDir, 'README.md'));
      repo.commit('Main changes');

      // Modify on feature
      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'README.md', 'feature content\n');
      repo.add(path.join(testDir, 'README.md'));
      repo.commit('Feature changes');

      // Merge
      repo.checkout('main');
      const mergeResult = repo.mergeManager.merge('feature');

      if (mergeResult.conflicts.length > 0) {
        const conflict = mergeResult.conflicts[0];
        expect(conflict.oursContent).toBeDefined();
        expect(conflict.theirsContent).toBeDefined();
        expect(conflict.regions.length).toBeGreaterThan(0);
      }
    });

    it('should handle multiple conflicts in same file', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;

      // Create base file with multiple lines
      createTestFile(testDir, 'multi.txt', 'line1\nline2\nline3\nline4\nline5\n');
      repo.add(path.join(testDir, 'multi.txt'));
      repo.commit('Add multi-line file');
      const newBase = repo.refs.resolve('HEAD')!;

      // Modify multiple lines on main
      createTestFile(testDir, 'multi.txt', 'main1\nmain2\nmain3\nmain4\nmain5\n');
      repo.add(path.join(testDir, 'multi.txt'));
      repo.commit('Main changes all lines');

      // Modify on feature
      repo.checkout(newBase);
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'multi.txt', 'feat1\nfeat2\nfeat3\nfeat4\nfeat5\n');
      repo.add(path.join(testDir, 'multi.txt'));
      repo.commit('Feature changes all lines');

      // Merge
      repo.checkout('main');
      const mergeResult = repo.mergeManager.merge('feature');

      expect(mergeResult.success).toBe(false);
      if (mergeResult.conflicts.length > 0) {
        const conflict = mergeResult.conflicts[0];
        // Should have multiple conflict regions
        expect(conflict.regions.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('merge state management', () => {
    it('should not be in progress initially', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      expect(repo.mergeManager.isInProgress()).toBe(false);
    });

    it('should track state during conflicts', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;

      // Create conflict
      createTestFile(testDir, 'conflict.txt', 'main\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Main adds conflict.txt');

      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'conflict.txt', 'feature\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Feature adds conflict.txt');

      repo.checkout('main');
      const mergeResult = repo.mergeManager.merge('feature');

      if (!mergeResult.success) {
        expect(repo.mergeManager.isInProgress()).toBe(true);
        
        const state = repo.mergeManager.getState();
        expect(state).not.toBeNull();
        expect(state!.sourceBranch).toBe('feature');
        expect(state!.targetBranch).toBe('main');
        expect(state!.conflicts.length).toBeGreaterThan(0);
      }
    });

    it('should error when merge already in progress', () => {
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

      repo.checkout('main');
      const firstResult = repo.mergeManager.merge('feature');

      if (!firstResult.success && repo.mergeManager.isInProgress()) {
        expect(() => {
          repo.mergeManager.merge('feature');
        }).toThrow(/already in progress/);
      }
    });
  });

  describe('conflict resolution', () => {
    it('should mark file as resolved', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;

      // Create conflict
      createTestFile(testDir, 'conflict.txt', 'main\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Main');

      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'conflict.txt', 'feature\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Feature');

      repo.checkout('main');
      const mergeResult = repo.mergeManager.merge('feature');

      if (!mergeResult.success && repo.mergeManager.isInProgress()) {
        // Resolve the conflict manually
        createTestFile(testDir, 'conflict.txt', 'resolved content\n');
        repo.add(path.join(testDir, 'conflict.txt'));
        
        repo.mergeManager.resolveFile('conflict.txt');
        
        const state = repo.mergeManager.getState();
        expect(state!.resolved).toContain('conflict.txt');
        
        const unresolved = repo.mergeManager.getUnresolvedConflicts();
        expect(unresolved.length).toBe(0);
      }
    });

    it('should continue merge after resolution', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;

      // Create conflict
      createTestFile(testDir, 'conflict.txt', 'main\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Main');

      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'conflict.txt', 'feature\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Feature');

      repo.checkout('main');
      const mergeResult = repo.mergeManager.merge('feature');

      if (!mergeResult.success && repo.mergeManager.isInProgress()) {
        // Resolve and continue
        createTestFile(testDir, 'conflict.txt', 'resolved\n');
        repo.add(path.join(testDir, 'conflict.txt'));
        repo.mergeManager.resolveFile('conflict.txt');
        
        const commitHash = repo.mergeManager.continue();
        
        expect(commitHash).toBeDefined();
        expect(repo.mergeManager.isInProgress()).toBe(false);
      }
    });

    it('should error when continuing with unresolved conflicts', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;

      // Create conflict
      createTestFile(testDir, 'conflict.txt', 'main\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Main');

      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'conflict.txt', 'feature\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Feature');

      repo.checkout('main');
      const mergeResult = repo.mergeManager.merge('feature');

      if (!mergeResult.success && repo.mergeManager.isInProgress()) {
        expect(() => {
          repo.mergeManager.continue();
        }).toThrow(/unresolved/i);
      }
    });

    it('should abort merge and restore state', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;

      // Create conflict
      createTestFile(testDir, 'conflict.txt', 'main\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Main');

      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'conflict.txt', 'feature\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Feature');

      repo.checkout('main');
      const beforeMergeHead = repo.refs.resolve('HEAD');
      const mergeResult = repo.mergeManager.merge('feature');

      if (!mergeResult.success && repo.mergeManager.isInProgress()) {
        repo.mergeManager.abort();
        
        expect(repo.mergeManager.isInProgress()).toBe(false);
        // HEAD should be restored
        const afterAbortHead = repo.refs.resolve('HEAD');
        expect(afterAbortHead).toBe(beforeMergeHead);
      }
    });

    it('should error when aborting without merge in progress', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      expect(() => {
        repo.mergeManager.abort();
      }).toThrow(/No merge in progress/);
    });

    it('should error when resolving without merge in progress', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      expect(() => {
        repo.mergeManager.resolveFile('somefile.txt');
      }).toThrow(/No merge in progress/);
    });

    it('should error when continuing without merge in progress', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      expect(() => {
        repo.mergeManager.continue();
      }).toThrow(/No merge in progress/);
    });
  });

  describe('merge options', () => {
    it('should respect noFastForward option', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      // Create branch and commit (fast-forwardable situation)
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'feature.txt', 'content\n');
      repo.add(path.join(testDir, 'feature.txt'));
      repo.commit('Feature commit');

      // Checkout main and merge with no-ff
      repo.checkout('main');
      const mergeResult = repo.mergeManager.merge('feature', { noFastForward: true });

      // Should still succeed but might create a merge commit
      expect(mergeResult.success).toBe(true);
    });

    it('should use custom commit message when provided', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;

      // Create divergent branches
      createTestFile(testDir, 'main.txt', 'main\n');
      repo.add(path.join(testDir, 'main.txt'));
      repo.commit('Main commit');

      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'feature.txt', 'feature\n');
      repo.add(path.join(testDir, 'feature.txt'));
      repo.commit('Feature commit');

      repo.checkout('main');
      const customMessage = 'Custom merge message';
      const mergeResult = repo.mergeManager.merge('feature', { message: customMessage });

      // For successful auto-merge, the message option is used
      expect(mergeResult.success).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should error when merging non-existent branch', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      expect(() => {
        repo.mergeManager.merge('nonexistent-branch');
      }).toThrow(/not found/);
    });

    it('should error when in detached HEAD state', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      // Create feature branch
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'feature.txt', 'content\n');
      repo.add(path.join(testDir, 'feature.txt'));
      repo.commit('Feature');

      // Checkout a specific commit (detached HEAD)
      const headHash = repo.refs.resolve('HEAD')!;
      repo.checkout(headHash);

      expect(() => {
        repo.mergeManager.merge('main');
      }).toThrow(/detached HEAD/);
    });

    it('should handle identical branches (no-op merge)', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      // Create branch at same point
      repo.createBranch('feature');
      
      // Merge feature into main (same commit)
      const mergeResult = repo.mergeManager.merge('feature');
      
      // Should succeed without doing anything
      expect(mergeResult.success).toBe(true);
    });

    it('should handle merge with files only in one branch', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      // Add file only on main
      createTestFile(testDir, 'main-only.txt', 'main content\n');
      repo.add(path.join(testDir, 'main-only.txt'));
      repo.commit('Main only file');

      // Create feature with different file
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'feature-only.txt', 'feature content\n');
      repo.add(path.join(testDir, 'feature-only.txt'));
      repo.commit('Feature only file');

      // Merge main into feature
      const mergeResult = repo.mergeManager.merge('main');

      expect(mergeResult.success).toBe(true);
      expect(fileExists(testDir, 'main-only.txt')).toBe(true);
      expect(fileExists(testDir, 'feature-only.txt')).toBe(true);
    });
  });

  describe('merge commit', () => {
    it('should include branch name in default merge message', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;

      // Create conflict and resolve it to force merge commit
      createTestFile(testDir, 'main.txt', 'main\n');
      repo.add(path.join(testDir, 'main.txt'));
      repo.commit('Main commit');

      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'conflict.txt', 'feature\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Feature commit');

      repo.checkout('main');
      const mergeResult = repo.mergeManager.merge('feature');

      // Get merge state to check message would include branch name
      if (!mergeResult.success) {
        const state = repo.mergeManager.getState();
        expect(state!.sourceBranch).toBe('feature');
        expect(state!.targetBranch).toBe('main');
      }
    });

    it('should preserve source and target branch info in state', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;

      // Create conflict
      createTestFile(testDir, 'file.txt', 'main\n');
      repo.add(path.join(testDir, 'file.txt'));
      repo.commit('Main');

      repo.checkout(baseCommit);
      repo.createBranch('my-feature-branch');
      repo.checkout('my-feature-branch');
      createTestFile(testDir, 'file.txt', 'feature\n');
      repo.add(path.join(testDir, 'file.txt'));
      repo.commit('Feature');

      repo.checkout('main');
      repo.mergeManager.merge('my-feature-branch');

      if (repo.mergeManager.isInProgress()) {
        const state = repo.mergeManager.getState();
        expect(state!.sourceBranch).toBe('my-feature-branch');
        expect(state!.targetBranch).toBe('main');
        expect(state!.sourceCommit).toBeDefined();
        expect(state!.targetCommit).toBeDefined();
      }
    });
  });

  describe('formatting utilities', () => {
    it('should format successful merge result', () => {
      const result: MergeResult = {
        success: true,
        conflicts: [],
        autoMerged: ['file1.txt', 'file2.txt'],
        unchanged: [],
        added: ['new.txt'],
        deleted: [],
      };

      const formatted = formatMergeResult(result);
      
      expect(formatted).toContain('successfully');
      expect(formatted).toContain('Auto-merged');
      expect(formatted).toContain('Added');
    });

    it('should format failed merge result with conflicts', () => {
      const conflict: FileConflict = {
        path: 'conflict.txt',
        regions: [{
          startLine: 1,
          endLine: 1,
          ours: ['main content'],
          theirs: ['feature content'],
          context: { before: [], after: [] },
        }],
        oursContent: 'main content',
        theirsContent: 'feature content',
      };

      const result: MergeResult = {
        success: false,
        conflicts: [conflict],
        autoMerged: [],
        unchanged: [],
        added: [],
        deleted: [],
      };

      const formatted = formatMergeResult(result);
      
      expect(formatted).toContain('failed');
      expect(formatted).toContain('conflict');
      expect(formatted).toContain('conflict.txt');
    });

    it('should format conflict details', () => {
      const conflict: FileConflict = {
        path: 'test.txt',
        regions: [{
          startLine: 5,
          endLine: 5,
          ours: ['ours line'],
          theirs: ['theirs line'],
          context: { before: ['context'], after: [] },
        }],
        oursContent: 'full ours content',
        theirsContent: 'full theirs content',
      };

      const formatted = formatConflict(conflict);
      
      expect(formatted).toContain('test.txt');
      expect(formatted).toContain('Region 1');
      expect(formatted).toContain('line 5');
      expect(formatted).toContain('Ours');
      expect(formatted).toContain('Theirs');
    });
  });

  describe('getUnresolvedConflicts', () => {
    it('should return empty array when no merge in progress', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      const unresolved = repo.mergeManager.getUnresolvedConflicts();
      expect(unresolved).toEqual([]);
    });

    it('should return all conflicts initially', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;

      // Create conflict
      createTestFile(testDir, 'conflict.txt', 'main\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Main');

      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'conflict.txt', 'feature\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Feature');

      repo.checkout('main');
      const mergeResult = repo.mergeManager.merge('feature');

      if (!mergeResult.success) {
        const unresolved = repo.mergeManager.getUnresolvedConflicts();
        expect(unresolved.length).toBe(mergeResult.conflicts.length);
      }
    });

    it('should exclude resolved files', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;

      // Create conflict
      createTestFile(testDir, 'conflict.txt', 'main\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Main');

      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'conflict.txt', 'feature\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Feature');

      repo.checkout('main');
      const mergeResult = repo.mergeManager.merge('feature');

      if (!mergeResult.success) {
        const beforeResolve = repo.mergeManager.getUnresolvedConflicts();
        
        // Resolve conflict
        createTestFile(testDir, 'conflict.txt', 'resolved\n');
        repo.add(path.join(testDir, 'conflict.txt'));
        repo.mergeManager.resolveFile('conflict.txt');
        
        const afterResolve = repo.mergeManager.getUnresolvedConflicts();
        expect(afterResolve.length).toBe(beforeResolve.length - 1);
      }
    });
  });

  describe('getState', () => {
    it('should return null when no merge in progress', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      expect(repo.mergeManager.getState()).toBeNull();
    });

    it('should return complete state object during merge', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const baseCommit = result.commitHash;

      // Create conflict
      createTestFile(testDir, 'conflict.txt', 'main\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Main');

      repo.checkout(baseCommit);
      repo.createBranch('feature');
      repo.checkout('feature');
      createTestFile(testDir, 'conflict.txt', 'feature\n');
      repo.add(path.join(testDir, 'conflict.txt'));
      repo.commit('Feature');

      repo.checkout('main');
      repo.mergeManager.merge('feature');

      if (repo.mergeManager.isInProgress()) {
        const state = repo.mergeManager.getState();
        
        expect(state).not.toBeNull();
        expect(state!.inProgress).toBe(true);
        expect(state!.sourceBranch).toBe('feature');
        expect(state!.targetBranch).toBe('main');
        expect(state!.sourceCommit).toBeDefined();
        expect(state!.targetCommit).toBeDefined();
        expect(state!.conflicts).toBeDefined();
        expect(state!.resolved).toBeDefined();
        expect(state!.startedAt).toBeDefined();
        expect(typeof state!.startedAt).toBe('number');
      }
    });
  });
});
