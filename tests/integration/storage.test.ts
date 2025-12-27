/**
 * Storage Backend Integration Tests
 * 
 * Tests the storage abstraction with disk backend.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DiskStorage } from '../../src/core/storage/disk';
import { createVirtualRepository, VirtualRepository } from '../../src/primitives/virtual-repository';
import { createStorage, initStorage, clearStorage } from '../../src/core/storage';
import { clone } from '../../src/commands/clone';

describe('Storage Backend', () => {
  let testDir: string;
  let storage: DiskStorage;

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-test-'));
    storage = new DiskStorage({ projectsDir: testDir });
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
    clearStorage();
  });

  describe('DiskStorage', () => {
    it('should create a repository', async () => {
      const repo = await storage.createRepo('testuser', 'myrepo');

      expect(repo.owner).toBe('testuser');
      expect(repo.name).toBe('myrepo');
      expect(repo.bare).toBe(true);
      expect(repo.defaultBranch).toBe('main');

      // Verify directory structure
      const repoPath = storage.getRepoPath('testuser', 'myrepo');
      expect(fs.existsSync(path.join(repoPath!, 'objects'))).toBe(true);
      expect(fs.existsSync(path.join(repoPath!, 'refs', 'heads'))).toBe(true);
      expect(fs.existsSync(path.join(repoPath!, 'HEAD'))).toBe(true);
    });

    it('should check if repository exists', async () => {
      expect(await storage.repoExists('testuser', 'myrepo')).toBe(false);

      await storage.createRepo('testuser', 'myrepo');

      expect(await storage.repoExists('testuser', 'myrepo')).toBe(true);
    });

    it('should get repository info', async () => {
      await storage.createRepo('testuser', 'myrepo', {
        defaultBranch: 'develop',
        description: 'Test repository',
      });

      const repo = await storage.getRepo('testuser', 'myrepo');

      expect(repo).not.toBeNull();
      expect(repo!.defaultBranch).toBe('develop');
    });

    it('should list repositories for owner', async () => {
      await storage.createRepo('testuser', 'repo1');
      await storage.createRepo('testuser', 'repo2');
      await storage.createRepo('otheruser', 'repo3');

      const repos = await storage.listRepos('testuser');

      expect(repos.length).toBe(2);
      expect(repos.map(r => r.name).sort()).toEqual(['repo1', 'repo2']);
    });

    it('should delete a repository', async () => {
      await storage.createRepo('testuser', 'myrepo');
      expect(await storage.repoExists('testuser', 'myrepo')).toBe(true);

      await storage.deleteRepo('testuser', 'myrepo');
      expect(await storage.repoExists('testuser', 'myrepo')).toBe(false);
    });

    it('should fork a repository', async () => {
      // Create source with some content
      await storage.createRepo('alice', 'original');
      
      // Add a commit to source
      const repoPath = storage.getRepoPath('alice', 'original')!;
      const vrepo = new VirtualRepository(repoPath);
      vrepo.write('README.md', '# Original');
      vrepo.commit('Initial commit');

      // Fork it
      const forked = await storage.forkRepo('alice', 'original', 'bob', 'forked');

      expect(forked.owner).toBe('bob');
      expect(forked.name).toBe('forked');

      // Verify forked repo has the content
      const forkedPath = storage.getRepoPath('bob', 'forked')!;
      const forkedVrepo = new VirtualRepository(forkedPath);
      forkedVrepo.checkout('main');
      expect(forkedVrepo.read('README.md')).toBe('# Original');
    });

    it('should write and read objects', async () => {
      await storage.createRepo('testuser', 'myrepo');

      const testData = Buffer.from('Hello, World!');
      const hash = await storage.writeObject('testuser', 'myrepo', {
        type: 'blob',
        data: testData,
        hash: 'abc123def456', // Note: in real use, hash would be computed
      });

      expect(hash).toBe('abc123def456');

      const obj = await storage.readObject('testuser', 'myrepo', hash);
      expect(obj).not.toBeNull();
      expect(obj!.type).toBe('blob');
      expect(obj!.data.toString()).toBe('Hello, World!');
    });

    it('should manage refs', async () => {
      await storage.createRepo('testuser', 'myrepo');

      // Set a ref
      await storage.setRef('testuser', 'myrepo', 'refs/heads/main', 'abc123');

      // Get the ref
      const ref = await storage.getRef('testuser', 'myrepo', 'refs/heads/main');
      expect(ref).not.toBeNull();
      expect(ref!.hash).toBe('abc123');

      // List branches
      const branches = await storage.listBranches('testuser', 'myrepo');
      expect(branches).toContain('main');

      // Delete ref
      await storage.deleteRef('testuser', 'myrepo', 'refs/heads/main');
      const deletedRef = await storage.getRef('testuser', 'myrepo', 'refs/heads/main');
      expect(deletedRef).toBeNull();
    });

    it('should pass health check', async () => {
      const healthy = await storage.healthCheck();
      expect(healthy).toBe(true);
    });
  });

  describe('Integration with VirtualRepository', () => {
    it('should create repo via storage and use with VirtualRepository', async () => {
      // Initialize storage
      initStorage({
        type: 'disk',
        disk: { projectsDir: testDir },
      });

      // Create repo via storage abstraction
      const vrepo = await createVirtualRepository('testuser', 'myproject');

      // Write some code
      vrepo.write('src/index.ts', 'console.log("hello");');
      vrepo.write('package.json', '{"name": "myproject"}');

      // Commit
      const hash = vrepo.commit('Initial commit');
      expect(hash).toMatch(/^[a-f0-9]{40}$/);

      // Clone to verify
      const cloneDir = path.join(testDir, 'cloned');
      clone(vrepo.repoPath, cloneDir);

      expect(fs.existsSync(path.join(cloneDir, 'src', 'index.ts'))).toBe(true);
      expect(fs.readFileSync(path.join(cloneDir, 'src', 'index.ts'), 'utf-8')).toBe('console.log("hello");');
    });

    it('should handle multiple repos in same storage', async () => {
      initStorage({
        type: 'disk',
        disk: { projectsDir: testDir },
      });

      // Create multiple repos
      const repo1 = await createVirtualRepository('alice', 'project-a');
      const repo2 = await createVirtualRepository('alice', 'project-b');
      const repo3 = await createVirtualRepository('bob', 'project-c');

      // Write to each
      repo1.write('file.txt', 'Repo 1');
      repo2.write('file.txt', 'Repo 2');
      repo3.write('file.txt', 'Repo 3');

      repo1.commit('Commit 1');
      repo2.commit('Commit 2');
      repo3.commit('Commit 3');

      // Verify isolation
      expect(repo1.read('file.txt')).toBe('Repo 1');
      expect(repo2.read('file.txt')).toBe('Repo 2');
      expect(repo3.read('file.txt')).toBe('Repo 3');

      // List alice's repos
      const aliceRepos = await storage.listRepos('alice');
      expect(aliceRepos.length).toBe(2);
    });
  });

  describe('Full Flow: Create -> Edit -> Commit -> Clone', () => {
    it('should complete the full workflow', async () => {
      console.log('\n=== Full Storage Flow Test ===\n');

      // 1. Configure storage
      console.log('1. Configuring storage backend...');
      initStorage({
        type: 'disk',
        disk: { projectsDir: testDir },
      });

      // 2. Create repository
      console.log('2. Creating repository via storage...');
      const vrepo = await createVirtualRepository('developer', 'my-app');

      // 3. Write code (simulating IDE/agent)
      console.log('3. Writing code...');
      vrepo.write('src/app.ts', `
export class App {
  private name: string;
  
  constructor(name: string) {
    this.name = name;
  }
  
  greet(): string {
    return \`Hello from \${this.name}!\`;
  }
}
`);

      vrepo.write('src/index.ts', `
import { App } from './app';

const app = new App('MyApp');
console.log(app.greet());
`);

      vrepo.write('package.json', JSON.stringify({
        name: 'my-app',
        version: '1.0.0',
        main: 'src/index.ts',
      }, null, 2));

      // 4. Commit
      console.log('4. Committing changes...');
      const commitHash = vrepo.commit('Initial app setup');
      console.log(`   Commit: ${commitHash.slice(0, 7)}`);

      // 5. Clone
      console.log('5. Cloning to verify...');
      const cloneDir = path.join(testDir, 'cloned-app');
      clone(vrepo.repoPath, cloneDir);

      // Verify
      const appContent = fs.readFileSync(path.join(cloneDir, 'src', 'app.ts'), 'utf-8');
      expect(appContent).toContain('export class App');
      expect(appContent).toContain('greet()');

      console.log('   Files cloned successfully!');
      console.log('\n=== Test Passed ===\n');
    });
  });
});
