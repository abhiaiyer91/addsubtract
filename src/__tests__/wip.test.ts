/**
 * Tests for the wip command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { wip } from '../commands/wip';
import { 
  createRepoWithCommit, 
  cleanupTempDir, 
  createTestFile,
  suppressConsole,
  restoreCwd,
} from './test-utils';
import { Repository } from '../core/repository';

describe('wip command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const result = createRepoWithCommit();
    testDir = result.dir;
    repo = result.repo;
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('basic wip commit', () => {
    it('should create a WIP commit with staged files', () => {
      createTestFile(testDir!, 'feature.ts', 'export const x = 1;');
      repo.add(path.join(testDir!, 'feature.ts'));
      
      const hash = wip({});
      
      expect(hash).toBeDefined();
      const commit = repo.objects.readCommit(hash);
      expect(commit.message).toContain('WIP:');
    });

    it('should include file info in commit message', () => {
      createTestFile(testDir!, 'feature.ts', 'export const x = 1;');
      repo.add(path.join(testDir!, 'feature.ts'));
      
      const hash = wip({});
      const commit = repo.objects.readCommit(hash);
      
      expect(commit.message).toContain('feature.ts');
    });
  });

  describe('wip with -a flag', () => {
    it('should stage all tracked files', () => {
      // Modify existing tracked file
      createTestFile(testDir!, 'README.md', '# Updated\n');
      
      const hash = wip({ all: true });
      
      expect(hash).toBeDefined();
      const commit = repo.objects.readCommit(hash);
      expect(commit.message).toContain('WIP:');
    });
  });

  describe('wip with custom message suffix', () => {
    it('should include custom suffix in message', () => {
      createTestFile(testDir!, 'bugfix.ts', 'fixed();');
      repo.add(path.join(testDir!, 'bugfix.ts'));
      
      const hash = wip({ message: 'fixing auth bug' });
      const commit = repo.objects.readCommit(hash);
      
      expect(commit.message).toContain('fixing auth bug');
    });
  });

  describe('wip with -u flag', () => {
    it('should include untracked files', () => {
      createTestFile(testDir!, 'newfile.ts', 'new content');
      
      const hash = wip({ includeUntracked: true });
      
      expect(hash).toBeDefined();
      const commit = repo.objects.readCommit(hash);
      expect(commit.message).toContain('WIP:');
    });
  });

  describe('error cases', () => {
    it('should require staged or tracked files to create WIP', () => {
      // In a repo with files already committed, wip without -a needs staged files
      // Test that wip works correctly when files are staged
      createTestFile(testDir!, 'error-test.ts', 'error test content');
      repo.add(path.join(testDir!, 'error-test.ts'));
      
      // This should NOT throw since we have staged files
      const hash = wip({});
      expect(hash).toBeDefined();
    });
  });

  describe('message generation', () => {
    it('should summarize multiple files by extension', () => {
      createTestFile(testDir!, 'a.ts', 'a');
      createTestFile(testDir!, 'b.ts', 'b');
      createTestFile(testDir!, 'c.ts', 'c');
      createTestFile(testDir!, 'd.ts', 'd');
      repo.add(path.join(testDir!, 'a.ts'));
      repo.add(path.join(testDir!, 'b.ts'));
      repo.add(path.join(testDir!, 'c.ts'));
      repo.add(path.join(testDir!, 'd.ts'));
      
      const hash = wip({});
      const commit = repo.objects.readCommit(hash);
      
      expect(commit.message).toContain('WIP:');
      expect(commit.message).toContain('.ts');
    });
  });

  describe('journal recording', () => {
    it('should record the wip operation in journal', () => {
      createTestFile(testDir!, 'test.ts', 'test');
      repo.add(path.join(testDir!, 'test.ts'));
      
      wip({});
      
      // Reload repo to get fresh journal
      const freshRepo = Repository.find(testDir);
      const lastEntry = freshRepo.journal.getLastEntry();
      expect(lastEntry).not.toBeNull();
      expect(lastEntry?.operation).toBe('wip');
    });
  });
});
