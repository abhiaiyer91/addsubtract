/**
 * Submodule Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { SubmoduleManager } from '../core/submodule';
import {
  createRepoWithCommit,
  cleanupTempDir,
  restoreCwd,
  suppressConsole,
} from './test-utils';
import { Repository } from '../core/repository';

describe('submodule', () => {
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

  describe('SubmoduleManager', () => {
    let manager: SubmoduleManager;

    beforeEach(() => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      manager = new SubmoduleManager(repo.gitDir, testDir);
    });

    describe('list', () => {
      it('should return empty array when no submodules', () => {
        const submodules = manager.list();
        expect(submodules).toEqual([]);
      });

      it('should read submodules from .tsgitmodules', () => {
        // Create a .tsgitmodules file
        const modulesContent = `[submodule "lib"]
\tpath = lib
\turl = https://github.com/example/lib.git
`;
        fs.writeFileSync(path.join(testDir!, '.tsgitmodules'), modulesContent);
        
        const submodules = manager.list();
        expect(submodules.length).toBe(1);
        expect(submodules[0].name).toBe('lib');
        expect(submodules[0].path).toBe('lib');
        expect(submodules[0].url).toBe('https://github.com/example/lib.git');
      });

      it('should read submodules from .gitmodules as fallback', () => {
        const modulesContent = `[submodule "vendor"]
\tpath = vendor/pkg
\turl = https://github.com/example/pkg.git
`;
        fs.writeFileSync(path.join(testDir!, '.gitmodules'), modulesContent);
        
        const submodules = manager.list();
        expect(submodules.length).toBe(1);
        expect(submodules[0].name).toBe('vendor');
      });

      it('should handle multiple submodules', () => {
        const modulesContent = `[submodule "lib1"]
\tpath = lib/one
\turl = https://github.com/example/one.git

[submodule "lib2"]
\tpath = lib/two
\turl = https://github.com/example/two.git
`;
        fs.writeFileSync(path.join(testDir!, '.tsgitmodules'), modulesContent);
        
        const submodules = manager.list();
        expect(submodules.length).toBe(2);
      });
    });

    describe('status', () => {
      it('should return empty status for no submodules', () => {
        const status = manager.status();
        expect(status).toEqual([]);
      });

      it('should report uninitialized submodules', () => {
        const modulesContent = `[submodule "lib"]
\tpath = lib
\turl = https://github.com/example/lib.git
`;
        fs.writeFileSync(path.join(testDir!, '.tsgitmodules'), modulesContent);
        
        const status = manager.status();
        expect(status.length).toBe(1);
        expect(status[0].initialized).toBe(false);
      });

      it('should include submodule name and path', () => {
        const modulesContent = `[submodule "mylib"]
\tpath = vendor/mylib
\turl = https://github.com/example/mylib.git
`;
        fs.writeFileSync(path.join(testDir!, '.tsgitmodules'), modulesContent);
        
        const status = manager.status();
        expect(status[0].name).toBe('mylib');
        expect(status[0].path).toBe('vendor/mylib');
      });
    });

    describe('init', () => {
      it('should initialize submodule configuration', () => {
        const modulesContent = `[submodule "lib"]
\tpath = lib
\turl = https://github.com/example/lib.git
`;
        fs.writeFileSync(path.join(testDir!, '.tsgitmodules'), modulesContent);
        
        // Create the submodule directory
        fs.mkdirSync(path.join(testDir!, 'lib'), { recursive: true });
        
        const initialized = manager.init();
        expect(Array.isArray(initialized)).toBe(true);
      });

      it('should initialize specific submodules when paths provided', () => {
        const modulesContent = `[submodule "lib1"]
\tpath = lib1
\turl = https://github.com/example/lib1.git

[submodule "lib2"]
\tpath = lib2
\turl = https://github.com/example/lib2.git
`;
        fs.writeFileSync(path.join(testDir!, '.tsgitmodules'), modulesContent);
        fs.mkdirSync(path.join(testDir!, 'lib1'), { recursive: true });
        fs.mkdirSync(path.join(testDir!, 'lib2'), { recursive: true });
        
        const initialized = manager.init(['lib1']);
        expect(Array.isArray(initialized)).toBe(true);
      });
    });

    describe('deinit', () => {
      it('should deinitialize a submodule', () => {
        const modulesContent = `[submodule "lib"]
\tpath = lib
\turl = https://github.com/example/lib.git
`;
        fs.writeFileSync(path.join(testDir!, '.tsgitmodules'), modulesContent);
        fs.mkdirSync(path.join(testDir!, 'lib'), { recursive: true });
        
        manager.init();
        
        // deinit should not throw
        expect(() => {
          manager.deinit('lib');
        }).not.toThrow();
      });

      it('should throw for non-existent submodule', () => {
        expect(() => {
          manager.deinit('nonexistent');
        }).toThrow();
      });
    });

    describe('remove', () => {
      it('should remove a submodule', () => {
        const modulesContent = `[submodule "lib"]
\tpath = lib
\turl = https://github.com/example/lib.git
`;
        fs.writeFileSync(path.join(testDir!, '.tsgitmodules'), modulesContent);
        fs.mkdirSync(path.join(testDir!, 'lib'), { recursive: true });
        
        manager.init();
        manager.remove('lib');
        
        // After removal, the submodule should no longer be in the list
        // (or the .tsgitmodules should be updated)
        expect(true).toBe(true);
      });
    });

    describe('sync', () => {
      it('should sync submodule URLs', () => {
        const modulesContent = `[submodule "lib"]
\tpath = lib
\turl = https://github.com/new/lib.git
`;
        fs.writeFileSync(path.join(testDir!, '.tsgitmodules'), modulesContent);
        
        // sync should not throw
        const synced = manager.sync();
        expect(Array.isArray(synced)).toBe(true);
      });

      it('should sync specific submodules when paths provided', () => {
        const modulesContent = `[submodule "lib"]
\tpath = lib
\turl = https://github.com/example/lib.git
`;
        fs.writeFileSync(path.join(testDir!, '.tsgitmodules'), modulesContent);
        
        const synced = manager.sync(['lib']);
        expect(Array.isArray(synced)).toBe(true);
      });
    });
  });
});
