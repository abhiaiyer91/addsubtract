/**
 * Tests for the stash command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { StashManager } from '../commands/stash';
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

describe('stash command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let stashManager: StashManager;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const result = createRepoWithCommit();
    testDir = result.dir;
    repo = result.repo;
    stashManager = new StashManager(repo);
    stashManager.init();
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('stash save', () => {
    it('should save modified files to stash', () => {
      // Modify a tracked file
      createTestFile(testDir!, 'README.md', '# Modified Content\n');

      const entry = stashManager.stash();

      expect(entry).toBeDefined();
      expect(entry.id).toBeDefined();
      expect(entry.files.length).toBeGreaterThan(0);
      expect(entry.message).toContain('WIP:');
    });

    it('should save with custom message', () => {
      createTestFile(testDir!, 'README.md', '# Modified\n');

      const entry = stashManager.stash('my custom stash message');

      expect(entry.message).toBe('my custom stash message');
    });

    it('should reset working directory after stash', () => {
      // Modify file
      createTestFile(testDir!, 'README.md', '# Changed!\n');

      stashManager.stash();

      // Working directory should be restored to HEAD
      const content = readTestFile(testDir!, 'README.md');
      expect(content).toBe('# Test Project\n');
    });

    it('should throw error when nothing to stash', () => {
      expect(() => stashManager.stash()).toThrow('No local changes to save');
    });

    it('should record branch name in stash', () => {
      createTestFile(testDir!, 'README.md', '# Modified\n');

      const entry = stashManager.stash();

      expect(entry.branch).toBe('main');
    });

    it('should save staged files', () => {
      createTestFile(testDir!, 'newfile.ts', 'export const x = 1;');
      repo.add(path.join(testDir!, 'newfile.ts'));

      const entry = stashManager.stash();

      expect(entry.stagedPaths).toContain('newfile.ts');
      const stagedFile = entry.files.find(f => f.path === 'newfile.ts');
      expect(stagedFile?.isStaged).toBe(true);
    });
  });

  describe('stash list', () => {
    it('should return empty list when no stashes', () => {
      const list = stashManager.list();

      expect(list).toHaveLength(0);
    });

    it('should list stashes in order (newest first)', () => {
      createTestFile(testDir!, 'README.md', 'v1');
      stashManager.stash('first stash');

      createTestFile(testDir!, 'README.md', 'v2');
      stashManager.stash('second stash');

      const list = stashManager.list();

      expect(list).toHaveLength(2);
      expect(list[0].index).toBe(0);
      expect(list[0].message).toBe('second stash');
      expect(list[1].index).toBe(1);
      expect(list[1].message).toBe('first stash');
    });
  });

  describe('stash get', () => {
    it('should get stash by index', () => {
      createTestFile(testDir!, 'README.md', 'modified');
      stashManager.stash('test stash');

      const entry = stashManager.get(0);

      expect(entry).not.toBeNull();
      expect(entry?.message).toBe('test stash');
    });

    it('should return null for non-existent index', () => {
      const entry = stashManager.get(99);

      expect(entry).toBeNull();
    });
  });

  describe('stash apply', () => {
    it('should restore stashed files', () => {
      createTestFile(testDir!, 'README.md', '# Stashed Content\n');
      stashManager.stash();

      // Verify working directory was reset
      expect(readTestFile(testDir!, 'README.md')).toBe('# Test Project\n');

      // Apply stash
      stashManager.apply(0);

      // Verify files are restored
      expect(readTestFile(testDir!, 'README.md')).toBe('# Stashed Content\n');
    });

    it('should keep stash after apply', () => {
      createTestFile(testDir!, 'README.md', 'modified');
      stashManager.stash();

      stashManager.apply(0);

      expect(stashManager.list()).toHaveLength(1);
    });

    it('should throw error for non-existent stash', () => {
      expect(() => stashManager.apply(99)).toThrow('stash@{99} does not exist');
    });

    it('should re-stage files that were staged', () => {
      createTestFile(testDir!, 'newfile.ts', 'staged content');
      repo.add(path.join(testDir!, 'newfile.ts'));
      stashManager.stash();

      stashManager.apply(0);

      const status = repo.status();
      expect(status.staged).toContain('newfile.ts');
    });
  });

  describe('stash pop', () => {
    it('should apply and remove stash', () => {
      createTestFile(testDir!, 'README.md', '# Popped\n');
      stashManager.stash();

      stashManager.pop(0);

      // Files restored
      expect(readTestFile(testDir!, 'README.md')).toBe('# Popped\n');
      // Stash removed
      expect(stashManager.list()).toHaveLength(0);
    });

    it('should update indices after pop', () => {
      createTestFile(testDir!, 'README.md', 'v1');
      stashManager.stash('first');

      createTestFile(testDir!, 'README.md', 'v2');
      stashManager.stash('second');

      stashManager.pop(0); // Pop 'second'

      const list = stashManager.list();
      expect(list).toHaveLength(1);
      expect(list[0].index).toBe(0);
      expect(list[0].message).toBe('first');
    });
  });

  describe('stash drop', () => {
    it('should remove stash without applying', () => {
      createTestFile(testDir!, 'README.md', 'modified');
      stashManager.stash();

      stashManager.drop(0);

      expect(stashManager.list()).toHaveLength(0);
      // Working directory should NOT be affected
      expect(readTestFile(testDir!, 'README.md')).toBe('# Test Project\n');
    });

    it('should throw error for non-existent stash', () => {
      expect(() => stashManager.drop(99)).toThrow('stash@{99} does not exist');
    });

    it('should re-index remaining stashes', () => {
      createTestFile(testDir!, 'README.md', 'v1');
      stashManager.stash('first');

      createTestFile(testDir!, 'README.md', 'v2');
      stashManager.stash('second');

      createTestFile(testDir!, 'README.md', 'v3');
      stashManager.stash('third');

      stashManager.drop(1); // Drop 'second'

      const list = stashManager.list();
      expect(list).toHaveLength(2);
      expect(list[0].message).toBe('third');
      expect(list[0].index).toBe(0);
      expect(list[1].message).toBe('first');
      expect(list[1].index).toBe(1);
    });
  });

  describe('stash clear', () => {
    it('should remove all stashes', () => {
      createTestFile(testDir!, 'README.md', 'v1');
      stashManager.stash('first');

      createTestFile(testDir!, 'README.md', 'v2');
      stashManager.stash('second');

      const count = stashManager.clear();

      expect(count).toBe(2);
      expect(stashManager.list()).toHaveLength(0);
    });

    it('should return 0 when no stashes to clear', () => {
      const count = stashManager.clear();

      expect(count).toBe(0);
    });
  });

  describe('stash show', () => {
    it('should show stash contents', () => {
      createTestFile(testDir!, 'README.md', 'modified');
      createTestFile(testDir!, 'newfile.ts', 'new content');
      repo.add(path.join(testDir!, 'newfile.ts'));
      stashManager.stash();

      const { entry, summary } = stashManager.show(0);

      expect(entry).toBeDefined();
      expect(summary).toContain('newfile.ts');
    });

    it('should throw error for non-existent stash', () => {
      expect(() => stashManager.show(99)).toThrow('stash@{99} does not exist');
    });

    it('should categorize staged and modified files', () => {
      createTestFile(testDir!, 'staged.ts', 'staged');
      repo.add(path.join(testDir!, 'staged.ts'));
      createTestFile(testDir!, 'README.md', 'modified but not staged');
      stashManager.stash();

      const { summary } = stashManager.show(0);

      expect(summary).toContain('Staged changes:');
      expect(summary).toContain('staged.ts');
    });
  });

  describe('stash with new files', () => {
    it('should stash untracked files along with modified files', () => {
      // Need a modified tracked file to trigger stash (untracked alone isn't enough)
      createTestFile(testDir!, 'README.md', '# Modified\n');
      createTestFile(testDir!, 'brand-new.ts', 'brand new file');

      const entry = stashManager.stash();

      const newFile = entry.files.find(f => f.path === 'brand-new.ts');
      expect(newFile).toBeDefined();
    });

    it('should restore untracked files on apply', () => {
      // Need a modified tracked file to trigger stash
      createTestFile(testDir!, 'README.md', '# Modified\n');
      createTestFile(testDir!, 'untracked.ts', 'untracked content');
      stashManager.stash();

      expect(fileExists(testDir!, 'untracked.ts')).toBe(false);

      stashManager.apply(0);

      expect(fileExists(testDir!, 'untracked.ts')).toBe(true);
      expect(readTestFile(testDir!, 'untracked.ts')).toBe('untracked content');
    });
  });

  describe('stash persistence', () => {
    it('should persist stashes across repository instances', () => {
      createTestFile(testDir!, 'README.md', 'modified');
      stashManager.stash('persistent stash');

      // Create new manager instance
      const newRepo = Repository.find(testDir);
      const newManager = new StashManager(newRepo);

      const list = newManager.list();
      expect(list).toHaveLength(1);
      expect(list[0].message).toBe('persistent stash');
    });
  });
});

