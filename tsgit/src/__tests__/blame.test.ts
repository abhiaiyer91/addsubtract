/**
 * Tests for the blame command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { blame } from '../commands/blame';
import { 
  createRepoWithCommit, 
  cleanupTempDir,
  createTestFile,
  suppressConsole,
  restoreCwd,
} from './test-utils';
import { Repository } from '../core/repository';

describe('blame command', () => {
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

  describe('basic blame', () => {
    it('should return blame info for a file', () => {
      const result = blame('README.md');
      
      expect(result.file).toBe('README.md');
      expect(result.lines.length).toBeGreaterThan(0);
    });

    it('should include line numbers', () => {
      const result = blame('README.md');
      
      expect(result.lines[0].lineNumber).toBe(1);
    });

    it('should include commit info for each line', () => {
      const result = blame('README.md');
      const line = result.lines[0];
      
      expect(line.commitHash).toBeDefined();
      expect(line.shortHash).toBeDefined();
      expect(line.author).toBeDefined();
      expect(line.date).toBeInstanceOf(Date);
      expect(line.message).toBeDefined();
    });

    it('should include line content', () => {
      const result = blame('README.md');
      
      expect(result.lines[0].content).toContain('Test Project');
    });
  });

  describe('blame with line range', () => {
    it('should only return lines in range', () => {
      // Create a file with multiple lines
      createTestFile(testDir!, 'multiline.txt', 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');
      repo.add(path.join(testDir!, 'multiline.txt'));
      repo.commit('Add multiline file');
      
      const result = blame('multiline.txt', { startLine: 2, endLine: 4 });
      
      expect(result.lines.length).toBe(3);
      expect(result.lines[0].lineNumber).toBe(2);
      expect(result.lines[2].lineNumber).toBe(4);
    });
  });

  describe('author statistics', () => {
    it('should count lines per author', () => {
      const result = blame('README.md');
      
      expect(result.authors.size).toBeGreaterThan(0);
      
      let totalLines = 0;
      for (const count of result.authors.values()) {
        totalLines += count;
      }
      expect(totalLines).toBe(result.lines.length);
    });
  });

  describe('commit statistics', () => {
    it('should count lines per commit', () => {
      const result = blame('README.md');
      
      expect(result.commits.size).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should throw error for non-existent file', () => {
      expect(() => blame('nonexistent.txt')).toThrow();
    });
  });

  describe('uncommitted files', () => {
    it('should handle uncommitted files', () => {
      createTestFile(testDir!, 'uncommitted.txt', 'Not committed yet');
      
      const result = blame('uncommitted.txt');
      
      expect(result.lines[0].author).toBe('Not Committed Yet');
    });
  });
});
