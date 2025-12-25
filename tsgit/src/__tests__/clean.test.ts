/**
 * Tests for the clean command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { clean, getUntrackedItems } from '../commands/clean';
import { 
  createRepoWithCommit, 
  createTestFile,
  fileExists,
  cleanupTempDir,
  suppressConsole,
  restoreCwd,
} from './test-utils';
import { Repository } from '../core/repository';

describe('clean command', () => {
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

  describe('getUntrackedItems', () => {
    it('should find untracked files', () => {
      createTestFile(testDir!, 'untracked.txt', 'untracked content');
      
      const { files } = getUntrackedItems(repo);
      
      expect(files).toContain('untracked.txt');
    });

    it('should not include tracked files', () => {
      const { files } = getUntrackedItems(repo);
      
      expect(files).not.toContain('README.md');
    });

    it('should find untracked directories when option is set', () => {
      const untrackedDir = path.join(testDir!, 'untracked-dir');
      fs.mkdirSync(untrackedDir);
      createTestFile(testDir!, 'untracked-dir/file.txt', 'content');
      
      const { directories } = getUntrackedItems(repo, { directories: true });
      
      expect(directories).toContain('untracked-dir');
    });

    it('should filter by path when specified', () => {
      createTestFile(testDir!, 'keep.txt', 'keep');
      createTestFile(testDir!, 'subdir/remove.txt', 'remove');
      
      const { files } = getUntrackedItems(repo, { paths: ['subdir'] });
      
      expect(files).toContain('subdir/remove.txt');
      expect(files).not.toContain('keep.txt');
    });
  });

  describe('clean with dry run', () => {
    it('should list files that would be deleted without actually deleting', () => {
      createTestFile(testDir!, 'untracked.txt', 'content');
      
      const result = clean(repo, { dryRun: true });
      
      expect(result.deletedFiles).toContain('untracked.txt');
      expect(fileExists(testDir!, 'untracked.txt')).toBe(true);
    });

    it('should list directories in dry run when -d is set', () => {
      const untrackedDir = path.join(testDir!, 'untracked-dir');
      fs.mkdirSync(untrackedDir);
      createTestFile(testDir!, 'untracked-dir/file.txt', 'content');
      
      const result = clean(repo, { dryRun: true, directories: true });
      
      expect(result.deletedDirs).toContain('untracked-dir');
      expect(fs.existsSync(untrackedDir)).toBe(true);
    });
  });

  describe('clean with force', () => {
    it('should delete untracked files when forced', () => {
      createTestFile(testDir!, 'untracked.txt', 'content');
      
      const result = clean(repo, { force: true });
      
      expect(result.deletedFiles).toContain('untracked.txt');
      expect(fileExists(testDir!, 'untracked.txt')).toBe(false);
    });

    it('should delete untracked directories when -fd is set', () => {
      const untrackedDir = path.join(testDir!, 'untracked-dir');
      fs.mkdirSync(untrackedDir);
      createTestFile(testDir!, 'untracked-dir/file.txt', 'content');
      
      const result = clean(repo, { force: true, directories: true });
      
      expect(result.deletedDirs).toContain('untracked-dir');
      expect(fs.existsSync(untrackedDir)).toBe(false);
    });

    it('should not delete tracked files', () => {
      clean(repo, { force: true });
      
      expect(fileExists(testDir!, 'README.md')).toBe(true);
    });
  });

  describe('safety checks', () => {
    it('should throw without -f or -n flag', () => {
      createTestFile(testDir!, 'untracked.txt', 'content');
      
      expect(() => clean(repo, {})).toThrow('Clean requires -f (force) or -n (dry-run)');
    });
  });

  describe('exclude patterns', () => {
    it('should exclude files matching pattern', () => {
      createTestFile(testDir!, 'keep.txt', 'keep');
      createTestFile(testDir!, 'remove.txt', 'remove');
      
      const result = clean(repo, { 
        force: true, 
        excludePattern: ['keep.txt'] 
      });
      
      expect(result.deletedFiles).not.toContain('keep.txt');
      expect(result.deletedFiles).toContain('remove.txt');
      expect(fileExists(testDir!, 'keep.txt')).toBe(true);
    });
  });

  describe('multiple untracked files', () => {
    it('should delete all untracked files', () => {
      createTestFile(testDir!, 'file1.txt', 'content1');
      createTestFile(testDir!, 'file2.txt', 'content2');
      createTestFile(testDir!, 'file3.txt', 'content3');
      
      const result = clean(repo, { force: true });
      
      expect(result.deletedFiles).toHaveLength(3);
      expect(fileExists(testDir!, 'file1.txt')).toBe(false);
      expect(fileExists(testDir!, 'file2.txt')).toBe(false);
      expect(fileExists(testDir!, 'file3.txt')).toBe(false);
    });
  });

  describe('nested directories', () => {
    it('should delete nested untracked directories', () => {
      fs.mkdirSync(path.join(testDir!, 'a/b/c'), { recursive: true });
      createTestFile(testDir!, 'a/b/c/file.txt', 'content');
      
      const result = clean(repo, { force: true, directories: true });
      
      expect(result.deletedDirs).toContain('a');
      expect(fs.existsSync(path.join(testDir!, 'a'))).toBe(false);
    });
  });
});
