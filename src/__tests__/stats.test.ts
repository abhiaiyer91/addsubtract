/**
 * Tests for the stats command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { collectStats } from '../commands/stats';
import { 
  createRepoWithMultipleCommits, 
  cleanupTempDir,
  createTestFile,
  suppressConsole,
  restoreCwd,
} from './test-utils';
import { Repository } from '../core/repository';

describe('stats command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const result = createRepoWithMultipleCommits(5);
    testDir = result.dir;
    repo = result.repo;
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('basic stats', () => {
    it('should count total commits', () => {
      const stats = collectStats();
      
      expect(stats.totalCommits).toBe(5);
    });

    it('should count branches', () => {
      const stats = collectStats();
      
      expect(stats.branches).toBeGreaterThanOrEqual(1);
    });

    it('should count contributors', () => {
      const stats = collectStats();
      
      expect(stats.contributors.length).toBeGreaterThan(0);
    });
  });

  describe('contributor stats', () => {
    it('should include commit count per contributor', () => {
      const stats = collectStats();
      const contributor = stats.contributors[0];
      
      expect(contributor).toHaveProperty('name');
      expect(contributor).toHaveProperty('email');
      expect(contributor).toHaveProperty('commits');
      expect(contributor).toHaveProperty('percentage');
      expect(contributor).toHaveProperty('firstCommit');
      expect(contributor).toHaveProperty('lastCommit');
    });

    it('should calculate correct percentages', () => {
      const stats = collectStats();
      
      const totalPercentage = stats.contributors.reduce(
        (sum, c) => sum + c.percentage, 
        0
      );
      
      expect(totalPercentage).toBeCloseTo(100, 1);
    });
  });

  describe('language stats', () => {
    it('should detect languages by file extension', () => {
      // Add some TypeScript files
      createTestFile(testDir!, 'app.ts', 'const x = 1;');
      createTestFile(testDir!, 'utils.ts', 'export const y = 2;');
      repo.add(path.join(testDir!, 'app.ts'));
      repo.add(path.join(testDir!, 'utils.ts'));
      repo.commit('Add TypeScript files');
      
      const stats = collectStats();
      
      // Should detect TypeScript
      const tsLang = stats.languages.find(l => l.language === 'TypeScript');
      expect(tsLang).toBeDefined();
      if (tsLang) {
        expect(tsLang.files).toBeGreaterThanOrEqual(2);
      }
    });

    it('should count lines per language', () => {
      createTestFile(testDir!, 'code.ts', 'line1\nline2\nline3');
      repo.add(path.join(testDir!, 'code.ts'));
      repo.commit('Add code');
      
      const stats = collectStats();
      
      const tsLang = stats.languages.find(l => l.language === 'TypeScript');
      if (tsLang) {
        expect(tsLang.lines).toBeGreaterThan(0);
      }
    });
  });

  describe('activity stats', () => {
    it('should track commits by day of week', () => {
      const stats = collectStats();
      
      expect(stats.commitsByDay.size).toBeGreaterThan(0);
    });

    it('should track commits by hour', () => {
      const stats = collectStats();
      
      expect(stats.commitsByHour.size).toBeGreaterThan(0);
    });

    it('should identify most active day', () => {
      const stats = collectStats();
      
      expect(stats.mostActiveDay).toBeDefined();
      expect(typeof stats.mostActiveDay).toBe('string');
    });

    it('should identify most active hour', () => {
      const stats = collectStats();
      
      expect(stats.mostActiveHour).toBeDefined();
      expect(stats.mostActiveHour).toBeGreaterThanOrEqual(0);
      expect(stats.mostActiveHour).toBeLessThan(24);
    });
  });

  describe('date range', () => {
    it('should track first and last commit dates', () => {
      const stats = collectStats();
      
      expect(stats.firstCommit).toBeInstanceOf(Date);
      expect(stats.lastCommit).toBeInstanceOf(Date);
    });

    it('should calculate average commits per day', () => {
      const stats = collectStats();
      
      expect(stats.averageCommitsPerDay).toBeGreaterThan(0);
    });
  });

  describe('file stats', () => {
    it('should count total files', () => {
      const stats = collectStats();
      
      expect(stats.totalFiles).toBeGreaterThanOrEqual(0);
    });

    it('should count total lines', () => {
      const stats = collectStats();
      
      expect(stats.totalLines).toBeGreaterThanOrEqual(0);
    });
  });
});
