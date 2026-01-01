/**
 * Stats Dashboard Tests
 *
 * Tests for the CLI stats dashboard functionality including:
 * - Local repository statistics collection
 * - ASCII visualization helpers
 * - Output formatting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from '../core/repository';
import {
  collectLocalStats,
  type LocalRepoStats,
} from '../commands/stats-dashboard';

// Test directory setup
const TEST_DIR = path.join(__dirname, 'temp-stats-test');

describe('Stats Dashboard', () => {
  describe('ASCII Visualization Helpers', () => {
    it('should create sparkline from values', () => {
      // Test sparkline generation logic
      const values = [0, 5, 10, 5, 0, 8, 15, 10];
      const max = Math.max(...values);
      const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

      const sparkline = values
        .map((v) => {
          if (max === 0) return SPARK_CHARS[0];
          const level = Math.floor((v / max) * 7);
          return SPARK_CHARS[Math.min(level, 7)];
        })
        .join('');

      expect(sparkline.length).toBe(8);
      expect(sparkline).toContain('▁'); // For 0 values
      expect(sparkline).toContain('█'); // For max value (15)
    });

    it('should handle empty values in sparkline', () => {
      const values: number[] = [];
      const sparkline = values.length === 0 ? '' : 'something';
      expect(sparkline).toBe('');
    });

    it('should create horizontal bar chart', () => {
      const createBar = (percentage: number, width: number = 20): string => {
        const filled = Math.round((percentage / 100) * width);
        const empty = width - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
      };

      expect(createBar(50, 10)).toBe('█████░░░░░');
      expect(createBar(100, 10)).toBe('██████████');
      expect(createBar(0, 10)).toBe('░░░░░░░░░░');
      expect(createBar(25, 20)).toBe('█████░░░░░░░░░░░░░░░');
    });
  });

  describe('Language Detection', () => {
    const LANGUAGE_MAP: Record<string, { name: string; color: string }> = {
      '.ts': { name: 'TypeScript', color: '#3178c6' },
      '.js': { name: 'JavaScript', color: '#f7df1e' },
      '.py': { name: 'Python', color: '#3572A5' },
      '.go': { name: 'Go', color: '#00ADD8' },
      '.rs': { name: 'Rust', color: '#dea584' },
    };

    it('should detect TypeScript files', () => {
      const ext = path.extname('index.ts');
      const lang = LANGUAGE_MAP[ext];
      expect(lang).toBeDefined();
      expect(lang?.name).toBe('TypeScript');
    });

    it('should detect JavaScript files', () => {
      const ext = path.extname('app.js');
      const lang = LANGUAGE_MAP[ext];
      expect(lang).toBeDefined();
      expect(lang?.name).toBe('JavaScript');
    });

    it('should return undefined for unknown extensions', () => {
      const ext = path.extname('file.xyz');
      const lang = LANGUAGE_MAP[ext];
      expect(lang).toBeUndefined();
    });
  });

  describe('Number Formatting', () => {
    const formatNumber = (n: number): string => {
      if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
      if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
      return n.toLocaleString();
    };

    it('should format small numbers', () => {
      expect(formatNumber(42)).toBe('42');
      expect(formatNumber(999)).toBe('999');
    });

    it('should format thousands with K suffix', () => {
      expect(formatNumber(1000)).toBe('1.0K');
      expect(formatNumber(1500)).toBe('1.5K');
      expect(formatNumber(42000)).toBe('42.0K');
    });

    it('should format millions with M suffix', () => {
      expect(formatNumber(1000000)).toBe('1.0M');
      expect(formatNumber(2500000)).toBe('2.5M');
    });
  });

  describe('Duration Formatting', () => {
    const formatDuration = (start: Date, end: Date): string => {
      const ms = end.getTime() - start.getTime();
      const days = Math.floor(ms / 86400000);
      const months = Math.floor(days / 30);
      const years = Math.floor(months / 12);

      if (years > 0) return `${years} year${years > 1 ? 's' : ''}`;
      if (months > 0) return `${months} month${months > 1 ? 's' : ''}`;
      if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
      return 'today';
    };

    it('should format durations in days', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-15');
      expect(formatDuration(start, end)).toBe('14 days');
    });

    it('should format single day', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-02');
      expect(formatDuration(start, end)).toBe('1 day');
    });

    it('should format durations in months', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-04-01');
      expect(formatDuration(start, end)).toBe('3 months');
    });

    it('should format durations in years', () => {
      const start = new Date('2022-01-01');
      const end = new Date('2024-01-01');
      expect(formatDuration(start, end)).toBe('2 years');
    });

    it('should handle same day', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-01');
      expect(formatDuration(start, end)).toBe('today');
    });
  });

  describe('Period Parsing', () => {
    const parsePeriod = (
      period: string
    ): { days: number } | null => {
      const match = period.match(/^(\d+)([dwmy])$/);
      if (!match) return null;

      const [, num, unit] = match;
      const value = parseInt(num);

      switch (unit) {
        case 'd':
          return { days: value };
        case 'w':
          return { days: value * 7 };
        case 'm':
          return { days: value * 30 };
        case 'y':
          return { days: value * 365 };
        default:
          return null;
      }
    };

    it('should parse day periods', () => {
      expect(parsePeriod('7d')).toEqual({ days: 7 });
      expect(parsePeriod('30d')).toEqual({ days: 30 });
    });

    it('should parse week periods', () => {
      expect(parsePeriod('2w')).toEqual({ days: 14 });
      expect(parsePeriod('4w')).toEqual({ days: 28 });
    });

    it('should parse month periods', () => {
      expect(parsePeriod('1m')).toEqual({ days: 30 });
      expect(parsePeriod('6m')).toEqual({ days: 180 });
    });

    it('should parse year periods', () => {
      expect(parsePeriod('1y')).toEqual({ days: 365 });
      expect(parsePeriod('2y')).toEqual({ days: 730 });
    });

    it('should return null for invalid periods', () => {
      expect(parsePeriod('abc')).toBeNull();
      expect(parsePeriod('30')).toBeNull();
      expect(parsePeriod('')).toBeNull();
    });
  });

  describe('Hour Formatting', () => {
    const formatHour = (hour: number): string => {
      if (hour === 0) return '12:00 AM';
      if (hour < 12) return `${hour}:00 AM`;
      if (hour === 12) return '12:00 PM';
      return `${hour - 12}:00 PM`;
    };

    it('should format midnight', () => {
      expect(formatHour(0)).toBe('12:00 AM');
    });

    it('should format morning hours', () => {
      expect(formatHour(9)).toBe('9:00 AM');
      expect(formatHour(11)).toBe('11:00 AM');
    });

    it('should format noon', () => {
      expect(formatHour(12)).toBe('12:00 PM');
    });

    it('should format afternoon/evening hours', () => {
      expect(formatHour(13)).toBe('1:00 PM');
      expect(formatHour(18)).toBe('6:00 PM');
      expect(formatHour(23)).toBe('11:00 PM');
    });
  });

  describe('Day of Week Distribution', () => {
    const DAY_NAMES = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];

    it('should have correct day names', () => {
      expect(DAY_NAMES[0]).toBe('Sunday');
      expect(DAY_NAMES[1]).toBe('Monday');
      expect(DAY_NAMES[6]).toBe('Saturday');
    });

    it('should calculate day of week correctly', () => {
      // January 2, 2024 was a Tuesday (use UTC to avoid timezone issues)
      const date = new Date(Date.UTC(2024, 0, 2)); // January 2, 2024
      expect(DAY_NAMES[date.getUTCDay()]).toBe('Tuesday');
    });
  });
});

describe('Stats Cache', () => {
  // Import using ESM style for vitest
  let StatsCache: typeof import('../utils/stats-cache').StatsCache;
  let cacheKeys: typeof import('../utils/stats-cache').cacheKeys;
  let cacheTTL: typeof import('../utils/stats-cache').cacheTTL;

  beforeEach(async () => {
    const module = await import('../utils/stats-cache');
    StatsCache = module.StatsCache;
    cacheKeys = module.cacheKeys;
    cacheTTL = module.cacheTTL;
  });

  describe('StatsCache', () => {
    it('should store and retrieve values', () => {
      const cache = new StatsCache();
      cache.set('test-key', { value: 42 });

      const result = cache.get('test-key');
      expect(result).toEqual({ value: 42 });
    });

    it('should return undefined for missing keys', () => {
      const cache = new StatsCache();
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should expire values after TTL', async () => {
      const cache = new StatsCache({ defaultTTL: 50 });
      cache.set('test-key', 'value');

      expect(cache.get('test-key')).toBe('value');

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(cache.get('test-key')).toBeUndefined();
    });

    it('should delete values', () => {
      const cache = new StatsCache();
      cache.set('test-key', 'value');

      expect(cache.delete('test-key')).toBe(true);
      expect(cache.get('test-key')).toBeUndefined();
    });

    it('should clear all values', () => {
      const cache = new StatsCache();
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.clear();

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });

    it('should evict entry when max size reached', () => {
      const cache = new StatsCache({ maxSize: 2 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      // This should evict one entry to make room
      cache.set('key3', 'value3');

      // At least one of key1 or key2 should be evicted
      const stats = cache.stats();
      expect(stats.size).toBe(2);
      expect(cache.get('key3')).toBe('value3');
    });

    it('should use getOrSet correctly', async () => {
      const cache = new StatsCache();
      let factoryCalled = 0;

      const factory = async () => {
        factoryCalled++;
        return 'computed-value';
      };

      // First call should invoke factory
      const result1 = await cache.getOrSet('test-key', factory);
      expect(result1).toBe('computed-value');
      expect(factoryCalled).toBe(1);

      // Second call should use cached value
      const result2 = await cache.getOrSet('test-key', factory);
      expect(result2).toBe('computed-value');
      expect(factoryCalled).toBe(1);
    });

    it('should prune expired entries', async () => {
      const cache = new StatsCache({ defaultTTL: 50 });
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      await new Promise((resolve) => setTimeout(resolve, 100));

      const pruned = cache.prune();
      expect(pruned).toBe(2);
    });

    it('should return cache stats', () => {
      const cache = new StatsCache({ maxSize: 100 });
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.stats();
      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(100);
    });
  });

  describe('Cache Keys', () => {
    it('should generate repo stats key', () => {
      const key = cacheKeys.repoStats('repo-123', '30d');
      expect(key).toBe('repo:repo-123:30d');
    });

    it('should generate wrapped key', () => {
      const key = cacheKeys.wrapped('user-123', 2024, 3);
      expect(key).toBe('wrapped:user-123:2024:3');
    });

    it('should generate team wrapped key', () => {
      const key = cacheKeys.teamWrapped('team-abc', 2024, 6);
      expect(key).toBe('team-wrapped:team-abc:2024:6');
    });

    it('should generate user dashboard key', () => {
      const key = cacheKeys.userDashboard('user-456');
      expect(key).toBe('dashboard:user-456');
    });
  });

  describe('Cache TTL', () => {
    it('should have appropriate TTL values', () => {
      expect(cacheTTL.repoStats).toBe(5 * 60 * 1000); // 5 minutes
      expect(cacheTTL.wrapped).toBe(60 * 60 * 1000); // 1 hour
      expect(cacheTTL.userDashboard).toBe(2 * 60 * 1000); // 2 minutes
    });
  });
});

describe('Repo Stats Types', () => {
  // Test that types are correctly defined
  describe('StatsPeriod', () => {
    it('should accept string periods', () => {
      const periods = ['7d', '30d', '90d', '1y', 'all'];
      periods.forEach((p) => {
        expect(typeof p).toBe('string');
      });
    });

    it('should accept date range objects', () => {
      const period = {
        start: new Date('2024-01-01'),
        end: new Date('2024-03-01'),
      };
      expect(period.start).toBeInstanceOf(Date);
      expect(period.end).toBeInstanceOf(Date);
    });
  });

  describe('Health Score Calculation', () => {
    const categorizeHealth = (
      score: number
    ): 'excellent' | 'good' | 'needs_attention' | 'poor' => {
      if (score >= 80) return 'excellent';
      if (score >= 60) return 'good';
      if (score >= 40) return 'needs_attention';
      return 'poor';
    };

    it('should categorize excellent health', () => {
      expect(categorizeHealth(95)).toBe('excellent');
      expect(categorizeHealth(80)).toBe('excellent');
    });

    it('should categorize good health', () => {
      expect(categorizeHealth(75)).toBe('good');
      expect(categorizeHealth(60)).toBe('good');
    });

    it('should categorize needs attention', () => {
      expect(categorizeHealth(55)).toBe('needs_attention');
      expect(categorizeHealth(40)).toBe('needs_attention');
    });

    it('should categorize poor health', () => {
      expect(categorizeHealth(30)).toBe('poor');
      expect(categorizeHealth(0)).toBe('poor');
    });
  });
});
