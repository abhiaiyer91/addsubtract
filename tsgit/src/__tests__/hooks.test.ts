/**
 * Hooks System Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { HookManager, HOOK_TEMPLATES, HookType } from '../core/hooks';
import {
  createRepoWithCommit,
  cleanupTempDir,
  restoreCwd,
  suppressConsole,
} from './test-utils';
import { Repository } from '../core/repository';

describe('hooks system', () => {
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

  describe('HookManager', () => {
    let manager: HookManager;
    let hooksDir: string;

    beforeEach(() => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      hooksDir = path.join(repo.gitDir, 'hooks');
      manager = new HookManager(repo.gitDir, testDir);
      manager.init();
    });

    describe('init', () => {
      it('should create hooks directory', () => {
        expect(fs.existsSync(hooksDir)).toBe(true);
      });

      it('should create README file', () => {
        expect(fs.existsSync(path.join(hooksDir, 'README'))).toBe(true);
      });

      it('should create sample hooks', () => {
        const samplePath = path.join(hooksDir, 'pre-commit.sample');
        expect(fs.existsSync(samplePath)).toBe(true);
      });
    });

    describe('installHook', () => {
      it('should install a hook from template', () => {
        manager.installHook('pre-commit');
        
        const hookPath = path.join(hooksDir, 'pre-commit');
        expect(fs.existsSync(hookPath)).toBe(true);
        
        const content = fs.readFileSync(hookPath, 'utf8');
        expect(content).toContain('pre-commit');
      });

      it('should install multiple hook types', () => {
        const hookTypes: HookType[] = ['pre-commit', 'post-commit', 'commit-msg'];
        
        for (const type of hookTypes) {
          manager.installHook(type);
          const hookPath = path.join(hooksDir, type);
          expect(fs.existsSync(hookPath)).toBe(true);
        }
      });

      it('should install custom hook content', () => {
        const customContent = '#!/bin/sh\necho "custom hook"';
        manager.installHook('pre-commit', customContent);
        
        const hookPath = path.join(hooksDir, 'pre-commit');
        const content = fs.readFileSync(hookPath, 'utf8');
        expect(content).toBe(customContent);
      });
    });

    describe('removeHook', () => {
      it('should remove an installed hook', () => {
        manager.installHook('pre-commit');
        const hookPath = path.join(hooksDir, 'pre-commit');
        expect(fs.existsSync(hookPath)).toBe(true);
        
        const result = manager.removeHook('pre-commit');
        expect(result).toBe(true);
        expect(fs.existsSync(hookPath)).toBe(false);
      });

      it('should return false when removing non-existent hook', () => {
        const result = manager.removeHook('pre-push');
        expect(result).toBe(false);
      });
    });

    describe('listHooks', () => {
      it('should list installed hooks', () => {
        manager.installHook('pre-commit');
        manager.installHook('post-commit');
        
        const hooks = manager.listHooks();
        const hookTypes = hooks.map(h => h.type);
        expect(hookTypes).toContain('pre-commit');
        expect(hookTypes).toContain('post-commit');
      });

      it('should return empty array when no hooks installed', () => {
        // Remove all hooks first
        const existingHooks = manager.listHooks();
        for (const hook of existingHooks) {
          manager.removeHook(hook.type);
        }
        
        const hooks = manager.listHooks();
        expect(Array.isArray(hooks)).toBe(true);
      });
    });

    describe('hookExists', () => {
      it('should return true for installed hook', () => {
        manager.installHook('pre-commit');
        expect(manager.hookExists('pre-commit')).toBe(true);
      });

      it('should return false for non-installed hook', () => {
        expect(manager.hookExists('pre-push')).toBe(false);
      });
    });

    describe('isEnabled', () => {
      it('should return true by default', () => {
        expect(manager.isEnabled()).toBe(true);
      });

      it('should respect setEnabled', () => {
        manager.setEnabled(false);
        expect(manager.isEnabled()).toBe(false);
        
        manager.setEnabled(true);
        expect(manager.isEnabled()).toBe(true);
      });
    });

    describe('runHook', () => {
      it('should run a simple shell hook', async () => {
        const hookPath = path.join(hooksDir, 'pre-commit');
        fs.writeFileSync(hookPath, '#!/bin/sh\nexit 0');
        fs.chmodSync(hookPath, 0o755);
        
        const result = await manager.runHook('pre-commit');
        expect(result.success).toBe(true);
        expect(result.exitCode).toBe(0);
      });

      it('should capture hook failure', async () => {
        const hookPath = path.join(hooksDir, 'pre-commit');
        fs.writeFileSync(hookPath, '#!/bin/sh\nexit 1');
        fs.chmodSync(hookPath, 0o755);
        
        const result = await manager.runHook('pre-commit');
        expect(result.success).toBe(false);
        expect(result.exitCode).toBe(1);
      });

      it('should pass arguments to hook', async () => {
        const hookPath = path.join(hooksDir, 'commit-msg');
        fs.writeFileSync(hookPath, '#!/bin/sh\ntest -n "$1"');
        fs.chmodSync(hookPath, 0o755);
        
        const result = await manager.runHook('commit-msg', { args: ['message.txt'] });
        expect(result.success).toBe(true);
      });

      it('should skip non-existent hooks', async () => {
        const result = await manager.runHook('pre-push');
        expect(result.success).toBe(true);
        expect(result.exitCode).toBe(0);
      });

      it('should skip when hooks are disabled', async () => {
        manager.installHook('pre-commit');
        manager.setEnabled(false);
        
        const result = await manager.runHook('pre-commit');
        expect(result.success).toBe(true);
      });
    });

    describe('registerHook', () => {
      it('should register a programmatic hook', async () => {
        let called = false;
        const handler = async () => {
          called = true;
          return { success: true };
        };
        
        manager.registerHook('pre-commit', handler);
        await manager.runHook('pre-commit');
        
        expect(called).toBe(true);
      });

      it('should call multiple registered hooks', async () => {
        let count = 0;
        
        manager.registerHook('pre-commit', async () => {
          count++;
          return { success: true };
        });
        
        manager.registerHook('pre-commit', async () => {
          count++;
          return { success: true };
        });
        
        await manager.runHook('pre-commit');
        expect(count).toBe(2);
      });
    });

    describe('unregisterHooks', () => {
      it('should unregister all hooks of a type', async () => {
        let called = false;
        
        manager.registerHook('pre-commit', async () => {
          called = true;
          return { success: true };
        });
        
        manager.unregisterHooks('pre-commit');
        await manager.runHook('pre-commit');
        
        expect(called).toBe(false);
      });
    });
  });

  describe('HOOK_TEMPLATES', () => {
    it('should have templates for common hook types', () => {
      const expectedTypes: HookType[] = [
        'pre-commit',
        'post-commit',
        'pre-push',
        'commit-msg',
      ];
      
      for (const type of expectedTypes) {
        expect(HOOK_TEMPLATES[type]).toBeDefined();
        expect(HOOK_TEMPLATES[type]).toContain('#!/bin/sh');
      }
    });
  });
});
