import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { createApp } from '../index';
import { RepoManager, BareRepository } from '../storage/repos';

describe('Git Server', () => {
  let tempDir: string;
  let repoManager: RepoManager;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    // Create temporary directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wit-server-test-'));
    repoManager = new RepoManager(tempDir);
    app = createApp(repoManager, { verbose: false });
  });

  afterEach(() => {
    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const res = await app.request('/health');
      expect(res.status).toBe(200);
      
      const data = await res.json();
      // Status is 'ok' when database is connected, 'degraded' otherwise
      expect(['ok', 'degraded']).toContain(data.status);
      expect(data.version).toBe('2.0.0');
      expect(data.timestamp).toBeDefined();
      // Should include database status
      expect(data.database).toBeDefined();
      expect(typeof data.database.connected).toBe('boolean');
      expect(typeof data.database.latency).toBe('number');
    });
  });

  describe('Repository List', () => {
    it('should return empty list for new server', async () => {
      const res = await app.request('/repos');
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.count).toBe(0);
      expect(data.repositories).toEqual([]);
    });

    it('should list created repositories', async () => {
      // Create a repository
      repoManager.initBareRepo('testuser', 'testrepo');
      
      const res = await app.request('/repos');
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.count).toBe(1);
      expect(data.repositories[0]).toEqual({
        owner: 'testuser',
        name: 'testrepo',
        url: '/testuser/testrepo.git',
      });
    });
  });

  describe('Info/Refs Endpoint', () => {
    it('should return 400 without service parameter', async () => {
      const res = await app.request('/owner/repo/info/refs');
      expect(res.status).toBe(400);
    });

    it('should return 400 for unknown service', async () => {
      const res = await app.request('/owner/repo/info/refs?service=unknown');
      expect(res.status).toBe(400);
    });

    it('should return refs for git-upload-pack', async () => {
      const res = await app.request('/owner/repo/info/refs?service=git-upload-pack');
      expect(res.status).toBe(200);
      
      const contentType = res.headers.get('Content-Type');
      expect(contentType).toBe('application/x-git-upload-pack-advertisement');
      
      const body = await res.arrayBuffer();
      const text = Buffer.from(body).toString('utf8');
      expect(text).toContain('# service=git-upload-pack');
    });

    it('should return refs for git-receive-pack', async () => {
      const res = await app.request('/owner/repo/info/refs?service=git-receive-pack');
      expect(res.status).toBe(200);
      
      const contentType = res.headers.get('Content-Type');
      expect(contentType).toBe('application/x-git-receive-pack-advertisement');
      
      const body = await res.arrayBuffer();
      const text = Buffer.from(body).toString('utf8');
      expect(text).toContain('# service=git-receive-pack');
    });

    it('should auto-create repository on info/refs', async () => {
      // Before request, repo should not exist
      expect(repoManager.exists('newowner', 'newrepo')).toBe(false);
      
      // Make request
      await app.request('/newowner/newrepo/info/refs?service=git-upload-pack');
      
      // After request, repo should exist
      expect(repoManager.exists('newowner', 'newrepo')).toBe(true);
    });
  });

  describe('Repository Manager', () => {
    it('should create bare repository', () => {
      const repo = repoManager.initBareRepo('user', 'project');
      expect(repo).toBeInstanceOf(BareRepository);
      expect(repoManager.exists('user', 'project')).toBe(true);
    });

    it('should get existing repository', () => {
      repoManager.initBareRepo('user', 'project');
      const repo = repoManager.getRepo('user', 'project', false);
      expect(repo).not.toBeNull();
    });

    it('should return null for non-existent repository when autoCreate is false', () => {
      const repo = repoManager.getRepo('nonexistent', 'repo', false);
      expect(repo).toBeNull();
    });

    it('should auto-create repository when autoCreate is true', () => {
      expect(repoManager.exists('auto', 'created')).toBe(false);
      const repo = repoManager.getRepo('auto', 'created', true);
      expect(repo).not.toBeNull();
      expect(repoManager.exists('auto', 'created')).toBe(true);
    });

    it('should list all repositories', () => {
      repoManager.initBareRepo('user1', 'repo1');
      repoManager.initBareRepo('user1', 'repo2');
      repoManager.initBareRepo('user2', 'repo1');
      
      const repos = repoManager.listRepos();
      expect(repos.length).toBe(3);
      
      const names = repos.map(r => `${r.owner}/${r.name}`);
      expect(names).toContain('user1/repo1');
      expect(names).toContain('user1/repo2');
      expect(names).toContain('user2/repo1');
    });

    it('should delete repository', () => {
      repoManager.initBareRepo('user', 'todelete');
      expect(repoManager.exists('user', 'todelete')).toBe(true);
      
      repoManager.deleteRepo('user', 'todelete');
      expect(repoManager.exists('user', 'todelete')).toBe(false);
    });
  });

  describe('Upload-Pack Endpoint', () => {
    it('should return 404 for non-existent repo', async () => {
      const res = await app.request('/nonexistent/repo/git-upload-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-git-upload-pack-request' },
        body: Buffer.from(''),
      });
      expect(res.status).toBe(404);
    });

    it('should return 400 for empty wants', async () => {
      // Create a repo first via info/refs (which auto-creates)
      await app.request('/owner/repo/info/refs?service=git-upload-pack');
      
      // Verify repo was created
      expect(repoManager.exists('owner', 'repo')).toBe(true);
      
      // Send empty request
      const res = await app.request('/owner/repo/git-upload-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-git-upload-pack-request' },
        body: Buffer.from('0000'), // Just a flush packet
      });
      expect(res.status).toBe(400);
    });
  });

  describe('Receive-Pack Endpoint', () => {
    it('should create repository on push to new repo', async () => {
      expect(repoManager.exists('newpush', 'repo')).toBe(false);
      
      // Send a minimal receive-pack request (will fail but should create repo)
      const res = await app.request('/newpush/repo/git-receive-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-git-receive-pack-request' },
        body: Buffer.from('0000'), // Just a flush packet
      });
      
      expect(res.status).toBe(200);
      expect(repoManager.exists('newpush', 'repo')).toBe(true);
    });
  });

  describe('CORS Headers', () => {
    it('should include CORS headers in response', async () => {
      const res = await app.request('/health');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });
  });

  describe('Not Found', () => {
    it('should return 404 for unknown routes', async () => {
      const res = await app.request('/unknown/path');
      expect(res.status).toBe(404);
    });
  });
});
