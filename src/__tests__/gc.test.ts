/**
 * Garbage Collection Command Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { GarbageCollector } from '../commands/gc';
import {
  createRepoWithCommit,
  createRepoWithMultipleCommits,
  cleanupTempDir,
  restoreCwd,
  suppressConsole,
} from './test-utils';
import { Repository } from '../core/repository';

describe('gc command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
    testDir = undefined;
  });

  describe('GarbageCollector', () => {
    let gc: GarbageCollector;

    beforeEach(() => {
      const result = createRepoWithMultipleCommits(3);
      testDir = result.dir;
      repo = result.repo;
      gc = new GarbageCollector(repo);
    });

    describe('run', () => {
      it('should run garbage collection successfully', async () => {
        const stats = await gc.run({ quiet: true });
        
        expect(stats).toBeDefined();
        expect(typeof stats.looseObjectsFound).toBe('number');
        expect(typeof stats.looseObjectsRemoved).toBe('number');
        expect(typeof stats.duration).toBe('number');
      });

      it('should run with dry-run mode', async () => {
        const stats = await gc.run({ dryRun: true, quiet: true });
        
        expect(stats).toBeDefined();
        // In dry-run mode, nothing should actually be removed
        expect(stats.looseObjectsRemoved).toBe(0);
      });

      it('should run with aggressive option', async () => {
        const stats = await gc.run({ aggressive: true, quiet: true });
        
        expect(stats).toBeDefined();
        expect(typeof stats.duration).toBe('number');
      });

      it('should run with prune=now option', async () => {
        const stats = await gc.run({ prune: 'now', quiet: true });
        
        expect(stats).toBeDefined();
      });

      it('should run with noPrune option', async () => {
        const stats = await gc.run({ noPrune: true, quiet: true });
        
        expect(stats).toBeDefined();
      });

      it('should run in auto mode', async () => {
        const stats = await gc.run({ auto: true, quiet: true });
        
        expect(stats).toBeDefined();
      });

      it('should verify objects when requested', async () => {
        const stats = await gc.run({ verify: true, quiet: true });
        
        expect(stats).toBeDefined();
        expect(typeof stats.corruptObjectsFound).toBe('number');
      });
    });

    describe('cleanup operations', () => {
      it('should handle temp files in objects directory', async () => {
        // Create a temp file in objects directory (these are typical gc cleanup targets)
        const tempDir = path.join(repo.gitDir, 'objects', 'pack');
        fs.mkdirSync(tempDir, { recursive: true });
        const tempFile = path.join(tempDir, 'tmp_pack_test');
        fs.writeFileSync(tempFile, 'temp content');
        expect(fs.existsSync(tempFile)).toBe(true);
        
        const stats = await gc.run({ quiet: true });
        
        // GC should complete without error
        expect(stats).toBeDefined();
        expect(typeof stats.tempFilesRemoved).toBe('number');
      });

      it('should handle empty objects directory', async () => {
        // Create an empty objects subdirectory
        const emptyDir = path.join(repo.gitDir, 'objects', 'zz');
        fs.mkdirSync(emptyDir, { recursive: true });
        
        const stats = await gc.run({ quiet: true });
        expect(stats).toBeDefined();
      });
    });

    describe('with custom config', () => {
      it('should use custom prune days', async () => {
        const stats = await gc.run({
          quiet: true,
          config: { pruneDays: 1 }
        });
        
        expect(stats).toBeDefined();
      });

      it('should use custom reflog expire days', async () => {
        const stats = await gc.run({
          quiet: true,
          config: { reflogExpireDays: 7 }
        });
        
        expect(stats).toBeDefined();
      });
    });
  });

  describe('with unreachable objects', () => {
    beforeEach(() => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
    });

    it('should handle repository with minimal objects', async () => {
      const gc = new GarbageCollector(repo);
      const stats = await gc.run({ quiet: true });
      
      expect(stats).toBeDefined();
      expect(stats.looseObjectsFound).toBeGreaterThanOrEqual(0);
    });
  });
});

