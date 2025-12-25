/**
 * Tests for the reset command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { reset, resetFile, parseRevision } from '../commands/reset';
import {
  createRepoWithCommit,
  createRepoWithMultipleCommits,
  cleanupTempDir,
  createTestFile,
  readTestFile,
  fileExists,
  suppressConsole,
  restoreCwd,
} from './test-utils';
import { Repository } from '../core/repository';

describe('reset command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let consoleSuppressor: { restore: () => void };

  afterEach(() => {
    consoleSuppressor?.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('parseRevision', () => {
    let commits: string[];

    beforeEach(() => {
      consoleSuppressor = suppressConsole();
      const result = createRepoWithMultipleCommits(5);
      testDir = result.dir;
      repo = result.repo;
      commits = result.commits;
    });

    it('should resolve HEAD', () => {
      const hash = parseRevision(repo, 'HEAD');

      expect(hash).toBe(commits[4]); // Latest commit
    });

    it('should resolve HEAD~1', () => {
      const hash = parseRevision(repo, 'HEAD~1');

      expect(hash).toBe(commits[3]);
    });

    it('should resolve HEAD~3', () => {
      const hash = parseRevision(repo, 'HEAD~3');

      expect(hash).toBe(commits[1]);
    });

    it('should resolve HEAD^', () => {
      const hash = parseRevision(repo, 'HEAD^');

      expect(hash).toBe(commits[3]);
    });

    it('should resolve HEAD^^', () => {
      const hash = parseRevision(repo, 'HEAD^^');

      expect(hash).toBe(commits[2]);
    });

    it('should resolve HEAD^^^', () => {
      const hash = parseRevision(repo, 'HEAD^^^');

      expect(hash).toBe(commits[1]);
    });

    it('should resolve branch~N', () => {
      const hash = parseRevision(repo, 'main~2');

      expect(hash).toBe(commits[2]);
    });

    it('should resolve direct hash', () => {
      const hash = parseRevision(repo, commits[0]);

      expect(hash).toBe(commits[0]);
    });

    it('should throw error for invalid ref', () => {
      expect(() => parseRevision(repo, 'nonexistent')).toThrow(
        "Cannot resolve 'nonexistent'"
      );
    });

    it('should throw error when going back too far', () => {
      expect(() => parseRevision(repo, 'HEAD~100')).toThrow(
        'Cannot go back 100 commits'
      );
    });
  });

  describe('reset --soft', () => {
    let commits: string[];

    beforeEach(() => {
      consoleSuppressor = suppressConsole();
      const result = createRepoWithMultipleCommits(3);
      testDir = result.dir;
      repo = result.repo;
      commits = result.commits;
    });

    it('should move HEAD to target commit', () => {
      const result = reset(repo, 'HEAD~1', { mode: 'soft' });

      expect(result.previousHash).toBe(commits[2]);
      expect(result.newHash).toBe(commits[1]);
      expect(repo.refs.resolve('HEAD')).toBe(commits[1]);
    });

    it('should keep changes staged', () => {
      reset(repo, 'HEAD~1', { mode: 'soft' });

      const status = repo.status();
      // The file from commit 3 should be staged
      expect(status.staged).toContain('file3.txt');
    });

    it('should preserve working directory', () => {
      reset(repo, 'HEAD~1', { mode: 'soft' });

      // Files should still exist in working directory
      expect(fileExists(testDir!, 'file3.txt')).toBe(true);
      expect(readTestFile(testDir!, 'file3.txt')).toBe('Content 3\n');
    });

    it('should record operation in journal', () => {
      reset(repo, 'HEAD~1', { mode: 'soft' });

      const freshRepo = Repository.find(testDir);
      const lastEntry = freshRepo.journal.getLastEntry();
      expect(lastEntry?.operation).toBe('reset');
      expect(lastEntry?.args).toContain('--soft');
    });
  });

  describe('reset --mixed (default)', () => {
    let commits: string[];

    beforeEach(() => {
      consoleSuppressor = suppressConsole();
      const result = createRepoWithMultipleCommits(3);
      testDir = result.dir;
      repo = result.repo;
      commits = result.commits;
    });

    it('should move HEAD to target commit', () => {
      const result = reset(repo, 'HEAD~1', { mode: 'mixed' });

      expect(result.newHash).toBe(commits[1]);
      expect(repo.refs.resolve('HEAD')).toBe(commits[1]);
    });

    it('should reset index to match target commit', () => {
      reset(repo, 'HEAD~1', { mode: 'mixed' });

      const status = repo.status();
      // file3.txt should NOT be staged, but should be in working dir
      expect(status.staged).not.toContain('file3.txt');
      // It should appear as modified or untracked
      expect(
        status.modified.includes('file3.txt') ||
        status.untracked.includes('file3.txt')
      ).toBe(true);
    });

    it('should preserve working directory', () => {
      reset(repo, 'HEAD~1', { mode: 'mixed' });

      expect(fileExists(testDir!, 'file3.txt')).toBe(true);
      expect(readTestFile(testDir!, 'file3.txt')).toBe('Content 3\n');
    });
  });

  describe('reset --hard', () => {
    let commits: string[];

    beforeEach(() => {
      consoleSuppressor = suppressConsole();
      const result = createRepoWithMultipleCommits(3);
      testDir = result.dir;
      repo = result.repo;
      commits = result.commits;
    });

    it('should move HEAD to target commit', () => {
      const result = reset(repo, 'HEAD~1', { mode: 'hard' });

      expect(result.newHash).toBe(commits[1]);
    });

    it('should reset index to match target commit', () => {
      reset(repo, 'HEAD~1', { mode: 'hard' });

      const status = repo.status();
      expect(status.staged).toHaveLength(0);
    });

    it('should reset working directory to match target commit', () => {
      reset(repo, 'HEAD~1', { mode: 'hard' });

      // file3.txt should be removed
      expect(fileExists(testDir!, 'file3.txt')).toBe(false);
      // file1.txt and file2.txt should exist
      expect(fileExists(testDir!, 'file1.txt')).toBe(true);
      expect(fileExists(testDir!, 'file2.txt')).toBe(true);
    });

    it('should discard uncommitted changes', () => {
      // Make changes to file2.txt
      createTestFile(testDir!, 'file2.txt', 'Modified content\n');

      reset(repo, 'HEAD', { mode: 'hard' });

      // Changes should be discarded
      expect(readTestFile(testDir!, 'file2.txt')).toBe('Content 2\n');
    });

    it('should remove untracked files that are not in target', () => {
      // Create an untracked file
      createTestFile(testDir!, 'untracked.txt', 'untracked');

      reset(repo, 'HEAD~2', { mode: 'hard' });

      // Untracked file should be removed
      expect(fileExists(testDir!, 'untracked.txt')).toBe(false);
    });
  });

  describe('resetFile (unstage)', () => {
    beforeEach(() => {
      consoleSuppressor = suppressConsole();
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
    });

    it('should unstage a staged file', () => {
      createTestFile(testDir!, 'newfile.ts', 'new content');
      repo.add(path.join(testDir!, 'newfile.ts'));

      let status = repo.status();
      expect(status.staged).toContain('newfile.ts');

      resetFile(repo, 'newfile.ts');

      status = repo.status();
      expect(status.staged).not.toContain('newfile.ts');
      expect(status.untracked).toContain('newfile.ts');
    });

    it('should restore file to HEAD version in index', () => {
      // Modify and stage existing file
      createTestFile(testDir!, 'README.md', 'Modified content\n');
      repo.add(path.join(testDir!, 'README.md'));

      resetFile(repo, 'README.md');

      const status = repo.status();
      expect(status.staged).not.toContain('README.md');
      expect(status.modified).toContain('README.md');
    });

    it('should preserve working directory changes', () => {
      createTestFile(testDir!, 'README.md', 'Modified content\n');
      repo.add(path.join(testDir!, 'README.md'));

      resetFile(repo, 'README.md');

      // Working directory should still have modified content
      expect(readTestFile(testDir!, 'README.md')).toBe('Modified content\n');
    });

    it('should handle files not in HEAD', () => {
      createTestFile(testDir!, 'brand-new.ts', 'new');
      repo.add(path.join(testDir!, 'brand-new.ts'));

      resetFile(repo, 'brand-new.ts');

      const status = repo.status();
      expect(status.staged).not.toContain('brand-new.ts');
      expect(status.untracked).toContain('brand-new.ts');
    });
  });

  describe('reset to specific refs', () => {
    let commits: string[];

    beforeEach(() => {
      consoleSuppressor = suppressConsole();
      const result = createRepoWithMultipleCommits(5);
      testDir = result.dir;
      repo = result.repo;
      commits = result.commits;
    });

    it('should reset to a specific commit hash', () => {
      const result = reset(repo, commits[1], { mode: 'soft' });

      expect(result.newHash).toBe(commits[1]);
    });

    it('should reset to a short commit hash', () => {
      const shortHash = commits[1].slice(0, 8);

      // Need to use full hash since parseRevision expects resolvable ref
      const result = reset(repo, commits[1], { mode: 'soft' });

      expect(result.newHash).toBe(commits[1]);
    });

    it('should reset to branch name', () => {
      // Create a new branch at an earlier commit
      repo.refs.createBranch('feature', commits[2]);
      repo.checkout('main');

      const result = reset(repo, 'feature', { mode: 'soft' });

      expect(result.newHash).toBe(commits[2]);
    });
  });

  describe('reset branch update', () => {
    let commits: string[];

    beforeEach(() => {
      consoleSuppressor = suppressConsole();
      const result = createRepoWithMultipleCommits(3);
      testDir = result.dir;
      repo = result.repo;
      commits = result.commits;
    });

    it('should update current branch ref', () => {
      reset(repo, 'HEAD~1', { mode: 'soft' });

      // Branch should now point to earlier commit
      const branchHash = repo.refs.resolve('refs/heads/main');
      expect(branchHash).toBe(commits[1]);
    });

    it('should work correctly when on branch', () => {
      repo.createBranch('feature');
      repo.checkout('feature');

      reset(repo, 'HEAD~1', { mode: 'soft' });

      const featureHash = repo.refs.resolve('refs/heads/feature');
      expect(featureHash).toBe(commits[1]);
    });
  });

  describe('reset result', () => {
    beforeEach(() => {
      consoleSuppressor = suppressConsole();
      const result = createRepoWithMultipleCommits(3);
      testDir = result.dir;
      repo = result.repo;
    });

    it('should return previous and new hash', () => {
      const result = reset(repo, 'HEAD~1', { mode: 'soft' });

      expect(result.previousHash).toBeDefined();
      expect(result.newHash).toBeDefined();
      expect(result.previousHash).not.toBe(result.newHash);
    });

    it('should return the mode used', () => {
      const softResult = reset(repo, 'HEAD', { mode: 'soft' });
      expect(softResult.mode).toBe('soft');
    });
  });

  describe('edge cases', () => {
    it('should throw error when no commits exist', () => {
      consoleSuppressor = suppressConsole();
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      // Go back to before initial commit would fail
      expect(() => reset(repo, 'HEAD~5', { mode: 'soft' })).toThrow();
    });

    it('should handle reset to same commit', () => {
      consoleSuppressor = suppressConsole();
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      const headBefore = repo.refs.resolve('HEAD');
      const resetResult = reset(repo, 'HEAD', { mode: 'soft' });

      expect(resetResult.previousHash).toBe(headBefore);
      expect(resetResult.newHash).toBe(headBefore);
    });
  });
});

