/**
 * Unit Tests for Planning Workflow Utilities
 * 
 * Tests for utility functions in src/ai/workflows/utils.ts:
 * - getRepoStatus
 * - createBranch
 * - stageFiles
 * - createCommit
 * - getDefaultBranch
 * - resolveRef
 * - writeRepoFile
 * - readRepoFile
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  createRepoWithCommit,
  cleanupTempDir,
  createTestFile,
  readTestFile,
  suppressConsole,
  restoreCwd,
} from './test-utils';
import { Repository } from '../core/repository';
import {
  getRepoStatus,
  createBranch,
  stageFiles,
  createCommit,
  getDefaultBranch,
  resolveRef,
  writeRepoFile,
  readRepoFile,
} from '../ai/workflows/utils';

describe('Planning Workflow Utilities', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const result = createRepoWithCommit();
    testDir = result.dir;
    repo = result.repo;
    process.chdir(testDir);
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
    testDir = undefined;
  });

  // ===========================================
  // getRepoStatus TESTS
  // ===========================================
  describe('getRepoStatus', () => {
    it('should return repository status', () => {
      const status = getRepoStatus(testDir!);

      expect(status).toHaveProperty('staged');
      expect(status).toHaveProperty('modified');
      expect(status).toHaveProperty('untracked');
      expect(status).toHaveProperty('deleted');
      expect(status).toHaveProperty('branch');
      expect(status.branch).toBe('main');
    });

    it('should detect untracked files', () => {
      createTestFile(testDir!, 'untracked.txt', 'untracked content');

      const status = getRepoStatus(testDir!);

      expect(status.untracked).toContain('untracked.txt');
    });

    it('should detect modified files', () => {
      // Modify an existing file
      fs.writeFileSync(path.join(testDir!, 'README.md'), 'Modified content');

      const status = getRepoStatus(testDir!);

      expect(status.modified).toContain('README.md');
    });

    it('should detect staged files', () => {
      createTestFile(testDir!, 'staged.txt', 'staged content');
      repo.add(path.join(testDir!, 'staged.txt'));

      const status = getRepoStatus(testDir!);

      expect(status.staged).toContain('staged.txt');
    });
  });

  // ===========================================
  // createBranch TESTS
  // ===========================================
  describe('createBranch', () => {
    it('should create a new branch', () => {
      const result = createBranch(testDir!, 'feature/new-branch', false);

      expect(result.success).toBe(true);
      expect(result.commitHash).toBeDefined();
      
      // Verify branch exists
      expect(repo.refs.listBranches()).toContain('feature/new-branch');
    });

    it('should create and checkout a branch', () => {
      const result = createBranch(testDir!, 'feature/checkout-branch', true);

      expect(result.success).toBe(true);

      // Verify we're on the new branch
      expect(repo.refs.getCurrentBranch()).toBe('feature/checkout-branch');
    });

    it('should fail for existing branch', () => {
      // Create a branch first
      createBranch(testDir!, 'existing-branch', false);

      // Try to create it again
      const result = createBranch(testDir!, 'existing-branch', false);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ===========================================
  // stageFiles TESTS
  // ===========================================
  describe('stageFiles', () => {
    it('should stage files', () => {
      createTestFile(testDir!, 'file1.txt', 'content1');
      createTestFile(testDir!, 'file2.txt', 'content2');

      const result = stageFiles(testDir!, ['file1.txt', 'file2.txt']);

      expect(result.success).toBe(true);
      expect(result.stagedFiles).toContain('file1.txt');
      expect(result.stagedFiles).toContain('file2.txt');

      // Verify files are staged
      const status = getRepoStatus(testDir!);
      expect(status.staged).toContain('file1.txt');
      expect(status.staged).toContain('file2.txt');
    });

    it('should handle non-existent files gracefully', () => {
      const result = stageFiles(testDir!, ['nonexistent.txt']);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  // ===========================================
  // createCommit TESTS
  // ===========================================
  describe('createCommit', () => {
    it('should create a commit', () => {
      createTestFile(testDir!, 'new-file.txt', 'content');
      repo.add(path.join(testDir!, 'new-file.txt'));

      const result = createCommit(testDir!, 'Test commit message');

      expect(result.success).toBe(true);
      expect(result.commitHash).toBeDefined();
      // SHA-1 hash is 40 chars, SHA-256 is 64 chars
      expect(result.commitHash?.length).toBeGreaterThanOrEqual(40);
    });

    it('should create commit with custom author', () => {
      createTestFile(testDir!, 'authored-file.txt', 'content');
      repo.add(path.join(testDir!, 'authored-file.txt'));

      const result = createCommit(testDir!, 'Authored commit', {
        name: 'AI Agent',
        email: 'agent@wit.dev',
      });

      expect(result.success).toBe(true);
      expect(result.commitHash).toBeDefined();

      // Verify author
      const commit = repo.objects.readCommit(result.commitHash!);
      expect(commit.author.name).toBe('AI Agent');
      expect(commit.author.email).toBe('agent@wit.dev');
    });

    it('should handle commit with nothing staged', () => {
      // Nothing staged - wit may create empty commit or fail
      const result = createCommit(testDir!, 'Empty commit');

      // Either behavior is acceptable - document what actually happens
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });

  // ===========================================
  // getDefaultBranch TESTS
  // ===========================================
  describe('getDefaultBranch', () => {
    it('should return main as default branch', () => {
      const defaultBranch = getDefaultBranch(testDir!);

      expect(defaultBranch).toBe('main');
    });

    it('should return a valid branch', () => {
      const defaultBranch = getDefaultBranch(testDir!);
      expect(['main', 'master']).toContain(defaultBranch);
    });
  });

  // ===========================================
  // resolveRef TESTS
  // ===========================================
  describe('resolveRef', () => {
    it('should resolve HEAD', () => {
      const hash = resolveRef(testDir!, 'HEAD');

      expect(hash).toBeDefined();
      // SHA-1 is 40 chars, SHA-256 is 64 chars
      expect(hash?.length).toBeGreaterThanOrEqual(40);
    });

    it('should resolve branch name', () => {
      const hash = resolveRef(testDir!, 'main');

      expect(hash).toBeDefined();
      expect(hash?.length).toBeGreaterThanOrEqual(40);
    });

    it('should return null for non-existent ref', () => {
      const hash = resolveRef(testDir!, 'nonexistent-branch');

      expect(hash).toBeNull();
    });

    it('should resolve HEAD to same as main branch', () => {
      const headHash = resolveRef(testDir!, 'HEAD');
      const mainHash = resolveRef(testDir!, 'main');
      
      expect(headHash).toBe(mainHash);
    });
  });

  // ===========================================
  // writeRepoFile and readRepoFile TESTS
  // ===========================================
  describe('writeRepoFile and readRepoFile', () => {
    it('should write a file to the repository', () => {
      const result = writeRepoFile(testDir!, 'new-file.txt', 'file content');

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(testDir!, 'new-file.txt'))).toBe(true);
      expect(readTestFile(testDir!, 'new-file.txt')).toBe('file content');
    });

    it('should create parent directories when writing', () => {
      const result = writeRepoFile(testDir!, 'deep/nested/path/file.txt', 'nested content');

      expect(result.success).toBe(true);
      expect(fs.existsSync(path.join(testDir!, 'deep/nested/path/file.txt'))).toBe(true);
    });

    it('should overwrite existing file', () => {
      writeRepoFile(testDir!, 'overwrite.txt', 'original');
      writeRepoFile(testDir!, 'overwrite.txt', 'updated');

      const content = readRepoFile(testDir!, 'overwrite.txt');
      expect(content).toBe('updated');
    });

    it('should read an existing file', () => {
      createTestFile(testDir!, 'read-test.txt', 'read me');

      const content = readRepoFile(testDir!, 'read-test.txt');

      expect(content).toBe('read me');
    });

    it('should return null for non-existent file', () => {
      const content = readRepoFile(testDir!, 'nonexistent.txt');

      expect(content).toBeNull();
    });

    it('should handle Unicode content', () => {
      const unicodeContent = 'Hello 世界 🌍 مرحبا';
      
      writeRepoFile(testDir!, 'unicode.txt', unicodeContent);
      const content = readRepoFile(testDir!, 'unicode.txt');

      expect(content).toBe(unicodeContent);
    });
  });

  // ===========================================
  // EDGE CASES
  // ===========================================
  describe('Edge Cases', () => {
    it('should handle empty files', () => {
      createTestFile(testDir!, 'empty.txt', '');

      const content = readRepoFile(testDir!, 'empty.txt');

      expect(content).toBe('');
    });

    it('should handle large files', () => {
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB
      
      const writeResult = writeRepoFile(testDir!, 'large.txt', largeContent);
      expect(writeResult.success).toBe(true);

      const content = readRepoFile(testDir!, 'large.txt');
      expect(content?.length).toBe(1024 * 1024);
    });

    it('should handle file paths with special characters', () => {
      // Write files with special chars in names
      const result1 = writeRepoFile(testDir!, 'file-with-dash.txt', 'content1');
      const result2 = writeRepoFile(testDir!, 'file_with_underscore.txt', 'content2');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      expect(readRepoFile(testDir!, 'file-with-dash.txt')).toBe('content1');
      expect(readRepoFile(testDir!, 'file_with_underscore.txt')).toBe('content2');
    });

    it('should handle deeply nested paths', () => {
      const deepPath = 'a/b/c/d/e/f/g/h/i/j/deep.txt';
      const result = writeRepoFile(testDir!, deepPath, 'deep content');

      expect(result.success).toBe(true);
      expect(readRepoFile(testDir!, deepPath)).toBe('deep content');
    });

    it('should handle invalid repository path gracefully', () => {
      const invalidPath = '/nonexistent/path/repo';
      
      // These should fail gracefully without throwing
      const result = createBranch(invalidPath, 'test-branch');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
