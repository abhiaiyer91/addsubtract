/**
 * Tests for the snapshot command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SnapshotManager } from '../commands/snapshot';
import { 
  createRepoWithCommit, 
  cleanupTempDir,
  createTestFile,
  readTestFile,
  suppressConsole,
  restoreCwd,
} from './test-utils';
import { Repository } from '../core/repository';

describe('snapshot command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let snapshotManager: SnapshotManager;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const result = createRepoWithCommit();
    testDir = result.dir;
    repo = result.repo;
    snapshotManager = new SnapshotManager(repo.gitDir, repo.workDir);
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('create snapshot', () => {
    it('should create a snapshot with auto-generated name', () => {
      const snapshot = snapshotManager.create();
      
      expect(snapshot.id).toBeDefined();
      expect(snapshot.name).toContain('snapshot-');
      expect(snapshot.timestamp).toBeDefined();
    });

    it('should create a snapshot with custom name', () => {
      const snapshot = snapshotManager.create('before-refactor');
      
      expect(snapshot.name).toBe('before-refactor');
    });

    it('should create a snapshot with description', () => {
      const snapshot = snapshotManager.create('my-snapshot', 'Before big changes');
      
      expect(snapshot.description).toBe('Before big changes');
    });

    it('should capture current files', () => {
      createTestFile(testDir!, 'extra.txt', 'extra content');
      
      const snapshot = snapshotManager.create();
      
      expect(snapshot.files.size).toBeGreaterThan(0);
      expect(snapshot.files.has('extra.txt')).toBe(true);
    });

    it('should capture current branch', () => {
      const snapshot = snapshotManager.create();
      
      expect(snapshot.branch).toBe('main');
    });

    it('should capture current HEAD', () => {
      const snapshot = snapshotManager.create();
      
      expect(snapshot.head).toBeDefined();
      expect(snapshot.head).toBe(repo.refs.resolve('HEAD'));
    });
  });

  describe('list snapshots', () => {
    it('should return empty list when no snapshots', () => {
      const snapshots = snapshotManager.list();
      
      expect(snapshots).toEqual([]);
    });

    it('should return all snapshots', () => {
      snapshotManager.create('snap1');
      snapshotManager.create('snap2');
      snapshotManager.create('snap3');
      
      const snapshots = snapshotManager.list();
      
      expect(snapshots.length).toBe(3);
    });

    it('should sort snapshots by timestamp (newest first)', async () => {
      snapshotManager.create('older');
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      snapshotManager.create('newer');
      
      const snapshots = snapshotManager.list();
      
      expect(snapshots[0].name).toBe('newer');
      expect(snapshots[1].name).toBe('older');
    });
  });

  describe('get snapshot', () => {
    it('should get snapshot by id', () => {
      const created = snapshotManager.create('test-snap');
      
      const retrieved = snapshotManager.get(created.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should get snapshot by name', () => {
      snapshotManager.create('my-named-snapshot');
      
      const retrieved = snapshotManager.get('my-named-snapshot');
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('my-named-snapshot');
    });

    it('should return undefined for non-existent snapshot', () => {
      const retrieved = snapshotManager.get('nonexistent');
      
      expect(retrieved).toBeUndefined();
    });
  });

  describe('restore snapshot', () => {
    it('should restore files from snapshot', () => {
      // Create some files
      createTestFile(testDir!, 'file1.txt', 'original content 1');
      createTestFile(testDir!, 'file2.txt', 'original content 2');
      
      // Create snapshot
      const snapshot = snapshotManager.create('before-changes');
      
      // Modify files
      createTestFile(testDir!, 'file1.txt', 'modified content');
      createTestFile(testDir!, 'file2.txt', 'also modified');
      
      // Restore snapshot
      snapshotManager.restore(snapshot.id);
      
      // Check files are restored
      expect(readTestFile(testDir!, 'file1.txt')).toBe('original content 1');
      expect(readTestFile(testDir!, 'file2.txt')).toBe('original content 2');
    });

    it('should throw error for non-existent snapshot', () => {
      expect(() => snapshotManager.restore('nonexistent-id')).toThrow();
    });
  });

  describe('delete snapshot', () => {
    it('should delete snapshot by id', () => {
      const snapshot = snapshotManager.create('to-delete');
      
      snapshotManager.delete(snapshot.id);
      
      const retrieved = snapshotManager.get(snapshot.id);
      expect(retrieved).toBeUndefined();
    });

    it('should throw error for non-existent snapshot', () => {
      expect(() => snapshotManager.delete('nonexistent-id')).toThrow();
    });
  });

  describe('persistence', () => {
    it('should persist snapshots across manager instances', () => {
      snapshotManager.create('persistent-snap');
      
      // Create new manager instance
      const newManager = new SnapshotManager(repo.gitDir, repo.workDir);
      
      const snapshots = newManager.list();
      expect(snapshots.length).toBe(1);
      expect(snapshots[0].name).toBe('persistent-snap');
    });
  });
});
