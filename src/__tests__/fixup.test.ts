/**
 * Tests for the fixup command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { fixup } from '../commands/fixup';
import { 
  createRepoWithMultipleCommits, 
  cleanupTempDir,
  createTestFile,
  suppressConsole,
  restoreCwd,
} from './test-utils';
import { Repository } from '../core/repository';
import * as path from 'path';

describe('fixup command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const result = createRepoWithMultipleCommits(3);
    testDir = result.dir;
    repo = result.repo;
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('basic fixup', () => {
    it('should create a fixup commit for HEAD', () => {
      createTestFile(testDir!, 'fix.txt', 'fix content');
      repo.add(path.join(testDir!, 'fix.txt'));
      
      const hash = fixup({});
      
      const commit = repo.objects.readCommit(hash);
      expect(commit.message).toContain('fixup!');
    });

    it('should include target commit message in fixup message', () => {
      createTestFile(testDir!, 'fix.txt', 'fix content');
      repo.add(path.join(testDir!, 'fix.txt'));
      
      const hash = fixup({});
      
      const commit = repo.objects.readCommit(hash);
      expect(commit.message).toContain('Commit 3');
    });
  });

  describe('fixup with target commit', () => {
    it('should create fixup for specific commit using HEAD~n', () => {
      createTestFile(testDir!, 'fix.txt', 'fix content');
      repo.add(path.join(testDir!, 'fix.txt'));
      
      const hash = fixup({ targetCommit: 'HEAD~1' });
      
      const commit = repo.objects.readCommit(hash);
      expect(commit.message).toContain('fixup!');
      expect(commit.message).toContain('Commit 2');
    });

    it('should create fixup for specific commit using relative ref', () => {
      createTestFile(testDir!, 'fix.txt', 'fix content');
      repo.add(path.join(testDir!, 'fix.txt'));
      
      // Use HEAD~2 to target the first commit (Commit 1)
      const hash = fixup({ targetCommit: 'HEAD~2' });
      
      const commit = repo.objects.readCommit(hash);
      expect(commit.message).toContain('fixup!');
      expect(commit.message).toContain('Commit 1');
    });
  });

  describe('amend-style fixup', () => {
    it('should create amend! prefix when --amend is used', () => {
      createTestFile(testDir!, 'fix.txt', 'fix content');
      repo.add(path.join(testDir!, 'fix.txt'));
      
      const hash = fixup({ amend: true });
      
      const commit = repo.objects.readCommit(hash);
      expect(commit.message).toContain('amend!');
      expect(commit.message).not.toContain('fixup!');
    });
  });

  describe('fixup with -a flag', () => {
    it('should stage all tracked files before creating fixup', () => {
      // Modify an existing file
      createTestFile(testDir!, 'file1.txt', 'modified content');
      
      const hash = fixup({ all: true });
      
      expect(hash).toBeDefined();
      const commit = repo.objects.readCommit(hash);
      expect(commit.message).toContain('fixup!');
    });
  });

  describe('error cases', () => {
    it('should throw error for invalid commit reference', () => {
      createTestFile(testDir!, 'fix.txt', 'fix content');
      repo.add(path.join(testDir!, 'fix.txt'));
      
      expect(() => fixup({ targetCommit: 'invalid-ref' })).toThrow();
    });

    it('should throw error for HEAD~n beyond history', () => {
      createTestFile(testDir!, 'fix2.txt', 'fix content 2');
      repo.add(path.join(testDir!, 'fix2.txt'));
      
      expect(() => fixup({ targetCommit: 'HEAD~100' })).toThrow();
    });
  });

  describe('journal recording', () => {
    it('should record the fixup operation in journal', () => {
      createTestFile(testDir!, 'fixjournal.txt', 'fix journal content');
      repo.add(path.join(testDir!, 'fixjournal.txt'));
      
      fixup({});
      
      // Reload repo to get fresh journal
      const freshRepo = Repository.find(testDir);
      const lastEntry = freshRepo.journal.getLastEntry();
      expect(lastEntry).not.toBeNull();
      expect(lastEntry?.operation).toBe('fixup');
    });
  });
});
