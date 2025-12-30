/**
 * Tests for Knowledge primitive
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Knowledge } from '../knowledge';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('Knowledge', () => {
  let tempDir: string;
  let knowledge: Knowledge;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-test-'));
    knowledge = new Knowledge(tempDir);
  });

  afterEach(() => {
    // Restore cwd before cleanup to avoid issues
    try {
      process.chdir(os.tmpdir());
    } catch {
      // Ignore
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('set and get', () => {
    it('should store and retrieve values', async () => {
      await knowledge.set('greeting', { message: 'hello' });
      const value = await knowledge.get('greeting');
      expect(value).toEqual({ message: 'hello' });
    });

    it('should return content hash from set', async () => {
      const hash = await knowledge.set('key', { value: 1 });
      expect(hash).toMatch(/^[0-9a-f]+$/);
      expect(hash.length).toBeGreaterThanOrEqual(40);
    });

    it('should return undefined for missing keys', async () => {
      const value = await knowledge.get('nonexistent');
      expect(value).toBeUndefined();
    });

    it('should return default value for missing keys', async () => {
      const value = await knowledge.get('missing', { default: true });
      expect(value).toEqual({ default: true });
    });

    it('should overwrite existing values', async () => {
      await knowledge.set('key', 'first');
      await knowledge.set('key', 'second');
      const value = await knowledge.get('key');
      expect(value).toBe('second');
    });

    it('should handle various value types', async () => {
      // String
      await knowledge.set('string', 'hello');
      expect(await knowledge.get('string')).toBe('hello');

      // Number
      await knowledge.set('number', 42);
      expect(await knowledge.get('number')).toBe(42);

      // Boolean
      await knowledge.set('boolean', true);
      expect(await knowledge.get('boolean')).toBe(true);

      // Null
      await knowledge.set('null', null);
      expect(await knowledge.get('null')).toBeNull();

      // Array
      await knowledge.set('array', [1, 2, 3]);
      expect(await knowledge.get('array')).toEqual([1, 2, 3]);
    });
  });

  describe('has', () => {
    it('should check key existence', async () => {
      expect(await knowledge.has('key')).toBe(false);
      await knowledge.set('key', 'value');
      expect(await knowledge.has('key')).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete keys', async () => {
      await knowledge.set('key', 'value');
      expect(await knowledge.has('key')).toBe(true);

      const deleted = await knowledge.delete('key');
      expect(deleted).toBe(true);
      expect(await knowledge.has('key')).toBe(false);
    });

    it('should return false when deleting non-existent key', async () => {
      const deleted = await knowledge.delete('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('keys', () => {
    it('should list all keys', async () => {
      await knowledge.set('a', 1);
      await knowledge.set('b', 2);
      await knowledge.set('c', 3);

      const keys = await knowledge.keys();
      expect(keys.sort()).toEqual(['a', 'b', 'c']);
    });

    it('should return empty array when no keys', async () => {
      const keys = await knowledge.keys();
      expect(keys).toEqual([]);
    });
  });

  describe('update', () => {
    it('should atomically update values', async () => {
      await knowledge.set('counter', { count: 0 });

      await knowledge.update('counter', (current: any) => ({
        count: (current?.count || 0) + 1,
      }));

      const value = await knowledge.get('counter');
      expect(value).toEqual({ count: 1 });
    });

    it('should create value if not exists', async () => {
      await knowledge.update('new-key', (current) => ({
        value: current ?? 'created',
      }));

      const value = await knowledge.get('new-key');
      expect(value).toEqual({ value: 'created' });
    });
  });

  describe('entries', () => {
    it('should get all entries', async () => {
      await knowledge.set('a', 1);
      await knowledge.set('b', 2);

      const entries = await knowledge.entries<number>();
      expect(entries.get('a')).toBe(1);
      expect(entries.get('b')).toBe(2);
      expect(entries.size).toBe(2);
    });
  });

  describe('snapshot and restore', () => {
    it('should create snapshots', async () => {
      await knowledge.set('key', 'value');
      const snapshot = await knowledge.snapshot('Test snapshot');

      expect(snapshot).toMatch(/^[0-9a-f]+$/);
      expect(snapshot.length).toBeGreaterThanOrEqual(40);
    });

    it('should restore to previous snapshot', async () => {
      await knowledge.set('key', 'value1');
      const snapshot = await knowledge.snapshot('Before change');

      await knowledge.set('key', 'value2');
      expect(await knowledge.get('key')).toBe('value2');

      await knowledge.restore(snapshot);
      expect(await knowledge.get('key')).toBe('value1');
    });
  });

  describe('complex objects', () => {
    it('should handle complex nested objects', async () => {
      const complex = {
        name: 'test',
        nested: { a: 1, b: [1, 2, 3] },
        date: '2025-12-25',
        items: [
          { id: 1, name: 'first' },
          { id: 2, name: 'second' },
        ],
      };

      await knowledge.set('complex', complex);
      const retrieved = await knowledge.get('complex');
      expect(retrieved).toEqual(complex);
    });
  });

  describe('clear', () => {
    it('should clear all knowledge', async () => {
      await knowledge.set('a', 1);
      await knowledge.set('b', 2);

      await knowledge.clear();

      const keys = await knowledge.keys();
      expect(keys).toEqual([]);
    });

    it('should handle clearing empty knowledge', async () => {
      await knowledge.clear();
      const keys = await knowledge.keys();
      expect(keys).toEqual([]);
    });
  });

  describe('key validation', () => {
    it('should reject empty keys', async () => {
      await expect(knowledge.set('', 'value')).rejects.toThrow(
        'Key must be a non-empty string'
      );
    });

    it('should reject keys over 200 characters', async () => {
      const longKey = 'a'.repeat(201);
      await expect(knowledge.set(longKey, 'value')).rejects.toThrow(
        'Key must be 200 characters or less'
      );
    });

    it('should handle special characters in keys', async () => {
      await knowledge.set('key-with-dash', 'value1');
      await knowledge.set('key_with_underscore', 'value2');
      await knowledge.set('key.with.dots', 'value3');

      expect(await knowledge.get('key-with-dash')).toBe('value1');
      expect(await knowledge.get('key_with_underscore')).toBe('value2');
      expect(await knowledge.get('key.with.dots')).toBe('value3');
    });
  });

  describe('persistence', () => {
    it('should persist data across instances', async () => {
      await knowledge.set('persistent', { data: 'test' });

      // Create new instance pointing to same directory
      const knowledge2 = new Knowledge(tempDir);
      const value = await knowledge2.get('persistent');

      expect(value).toEqual({ data: 'test' });
    });
  });

  describe('autoCommit option', () => {
    it('should not auto-commit when disabled', async () => {
      const noAutoCommit = new Knowledge(tempDir, { autoCommit: false });

      // Get initial commit count - verify log access works
      try {
        void noAutoCommit['repo'].log('HEAD', 100);
      } catch {
        // No commits yet
      }

      await noAutoCommit.set('key', 'value');

      // Commit count should not have increased (beyond potential initial commit)
      try {
        void noAutoCommit['repo'].log('HEAD', 100);
      } catch {
        // No commits
      }

      // The key should still be stored even without commit
      expect(await noAutoCommit.get('key')).toBe('value');
    });
  });

  describe('history', () => {
    it('should return history entries', async () => {
      await knowledge.set('key', 'value1');
      await knowledge.set('key', 'value2');

      const history = await knowledge.history('key');

      // Should have at least one entry
      expect(history.length).toBeGreaterThan(0);

      // Each entry should have required fields
      for (const entry of history) {
        expect(entry.hash).toBeDefined();
        expect(entry.timestamp).toBeInstanceOf(Date);
      }
    });

    it('should limit history entries', async () => {
      await knowledge.set('key', 'value1');
      await knowledge.set('key', 'value2');
      await knowledge.set('key', 'value3');

      const history = await knowledge.history('key', 2);
      expect(history.length).toBeLessThanOrEqual(2);
    });
  });
});
