/**
 * Integration Tests for the Package Registry
 *
 * Tests the full package registry flow including:
 * - Publishing packages
 * - Downloading packages
 * - Managing dist-tags
 * - Access control
 * 
 * Note: Packages must be created via enableForRepo before publishing.
 * Each test that needs to publish creates a repo and enables the package first.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupIntegrationTest,
  stopTestServer,
  createTestClient,
  API_URL,
  uniqueUsername,
  uniqueEmail,
} from './setup';

describe('Package Registry Integration', () => {
  setupIntegrationTest();

  let sessionToken: string;
  let userId: string;
  let testUsername: string;
  let authApi: ReturnType<typeof createTestClient>;

  // Helper to create a repo and enable package registry
  async function createPackageForRepo(packageName: string, scope?: string): Promise<{ repoId: string; packageId: string }> {
    // Create a repository first
    const repoName = `pkg-repo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const repo = await authApi.repos.create.mutate({
      name: repoName,
      description: `Repo for package ${packageName}`,
      isPrivate: false,
    });

    // Enable package registry for this repo
    const pkg = await authApi.packages.enableForRepo.mutate({
      repoId: repo.id,
      name: packageName,
      scope: scope || null,
      description: `Test package ${packageName}`,
      publishOnRelease: false,
    });

    return { repoId: repo.id, packageId: pkg.id };
  }

  beforeAll(async () => {

    // Create a test user and authenticated client
    const api = createTestClient();
    testUsername = uniqueUsername('pkguser');
    const result = await api.auth.register.mutate({
      username: testUsername,
      email: uniqueEmail('pkguser'),
      password: 'password123',
      name: 'Package Test User',
    });
    sessionToken = result.sessionId;
    userId = result.user.id;

    // Create authenticated client
    authApi = createTestClient(sessionToken);
  });

  afterAll(async () => {
    await stopTestServer();
  });

  describe('Registry Health', () => {
    it('should respond to ping', async () => {
      const response = await fetch(`${API_URL}/api/packages/-/ping`);
      expect(response.ok).toBe(true);

      const data = await response.json();
      expect(data.ok).toBe(true);
    });
  });

  describe('Authentication', () => {
    it('should return whoami for authenticated user', async () => {
      const response = await fetch(`${API_URL}/api/packages/-/whoami`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.username).toBe(testUsername);
    });

    it('should reject unauthenticated whoami', async () => {
      const response = await fetch(`${API_URL}/api/packages/-/whoami`);

      expect(response.status).toBe(401);
    });
  });

  describe('Package Publishing', () => {
    it('should publish a new package after enabling via tRPC', async () => {
      const packageName = `test-pkg-${Date.now()}`;
      
      // First create repo and enable package registry
      await createPackageForRepo(packageName);

      // Now publish via npm-compatible API
      const tarballContent = Buffer.from('fake tarball content');
      const base64Tarball = tarballContent.toString('base64');

      const publishPayload = {
        name: packageName,
        description: 'A test package',
        readme: '# Test Package',
        versions: {
          '1.0.0': {
            name: packageName,
            version: '1.0.0',
            description: 'A test package',
            main: 'index.js',
            dependencies: {},
          },
        },
        'dist-tags': {
          latest: '1.0.0',
        },
        _attachments: {
          [`${packageName}-1.0.0.tgz`]: {
            content_type: 'application/octet-stream',
            data: base64Tarball,
            length: tarballContent.length,
          },
        },
      };

      const response = await fetch(`${API_URL}/api/packages/${packageName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(publishPayload),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.ok).toBe(true);
      expect(data.id).toBe(packageName);
      expect(data.versions).toContain('1.0.0');
    });

    it('should reject publishing to non-existent package', async () => {
      const packageName = `nonexistent-pkg-${Date.now()}`;
      const tarballContent = Buffer.from('fake tarball content');
      const base64Tarball = tarballContent.toString('base64');

      const publishPayload = {
        name: packageName,
        versions: {
          '1.0.0': {
            name: packageName,
            version: '1.0.0',
          },
        },
        'dist-tags': {
          latest: '1.0.0',
        },
        _attachments: {
          [`${packageName}-1.0.0.tgz`]: {
            content_type: 'application/octet-stream',
            data: base64Tarball,
            length: tarballContent.length,
          },
        },
      };

      const response = await fetch(`${API_URL}/api/packages/${packageName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(publishPayload),
      });

      expect(response.status).toBe(404);
    });

    it('should get package metadata after publish', async () => {
      const packageName = `metadata-test-${Date.now()}`;
      await createPackageForRepo(packageName);

      const tarballContent = Buffer.from('fake tarball content');
      const base64Tarball = tarballContent.toString('base64');

      await fetch(`${API_URL}/api/packages/${packageName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          name: packageName,
          description: 'A metadata test package',
          versions: {
            '1.0.0': {
              name: packageName,
              version: '1.0.0',
              description: 'A metadata test package',
            },
          },
          'dist-tags': { latest: '1.0.0' },
          _attachments: {
            [`${packageName}-1.0.0.tgz`]: {
              content_type: 'application/octet-stream',
              data: base64Tarball,
              length: tarballContent.length,
            },
          },
        }),
      });

      const response = await fetch(`${API_URL}/api/packages/${packageName}`);

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.name).toBe(packageName);
      expect(data['dist-tags'].latest).toBe('1.0.0');
      expect(data.versions['1.0.0']).toBeDefined();
    });

    it('should publish multiple versions', async () => {
      const packageName = `multi-version-${Date.now()}`;
      await createPackageForRepo(packageName);

      // Publish v1.0.0
      const tarball1 = Buffer.from('v1 content');
      await fetch(`${API_URL}/api/packages/${packageName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          name: packageName,
          versions: {
            '1.0.0': { name: packageName, version: '1.0.0' },
          },
          'dist-tags': { latest: '1.0.0' },
          _attachments: {
            [`${packageName}-1.0.0.tgz`]: {
              content_type: 'application/octet-stream',
              data: tarball1.toString('base64'),
              length: tarball1.length,
            },
          },
        }),
      });

      // Publish v2.0.0
      const tarball2 = Buffer.from('v2 content');
      const response = await fetch(`${API_URL}/api/packages/${packageName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          name: packageName,
          versions: {
            '2.0.0': { name: packageName, version: '2.0.0' },
          },
          'dist-tags': { latest: '2.0.0' },
          _attachments: {
            [`${packageName}-2.0.0.tgz`]: {
              content_type: 'application/octet-stream',
              data: tarball2.toString('base64'),
              length: tarball2.length,
            },
          },
        }),
      });

      expect(response.ok).toBe(true);

      // Check both versions exist
      const metadataResponse = await fetch(`${API_URL}/api/packages/${packageName}`);
      const metadata = await metadataResponse.json();
      expect(metadata.versions['1.0.0']).toBeDefined();
      expect(metadata.versions['2.0.0']).toBeDefined();
      expect(metadata['dist-tags'].latest).toBe('2.0.0');
    });

    it('should reject unauthenticated publish', async () => {
      const packageName = `unauth-test-${Date.now()}`;

      const response = await fetch(`${API_URL}/api/packages/${packageName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: packageName,
          versions: { '1.0.0': { name: packageName, version: '1.0.0' } },
          'dist-tags': { latest: '1.0.0' },
          _attachments: {
            [`${packageName}-1.0.0.tgz`]: {
              content_type: 'application/octet-stream',
              data: Buffer.from('test').toString('base64'),
              length: 4,
            },
          },
        }),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Tarball Download', () => {
    it('should download tarball', async () => {
      const packageName = `download-test-${Date.now()}`;
      await createPackageForRepo(packageName);

      const tarballContent = Buffer.from('test tarball for download');

      // Publish first
      await fetch(`${API_URL}/api/packages/${packageName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          name: packageName,
          versions: {
            '1.0.0': { name: packageName, version: '1.0.0' },
          },
          'dist-tags': { latest: '1.0.0' },
          _attachments: {
            [`${packageName}-1.0.0.tgz`]: {
              content_type: 'application/octet-stream',
              data: tarballContent.toString('base64'),
              length: tarballContent.length,
            },
          },
        }),
      });

      // Now download
      const response = await fetch(
        `${API_URL}/api/packages/${packageName}/-/${packageName}-1.0.0.tgz`
      );

      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toBe('application/octet-stream');

      const data = await response.arrayBuffer();
      expect(Buffer.from(data)).toEqual(tarballContent);
    });

    it('should return 404 for nonexistent version', async () => {
      const packageName = `download-404-${Date.now()}`;
      await createPackageForRepo(packageName);

      const response = await fetch(
        `${API_URL}/api/packages/${packageName}/-/${packageName}-99.0.0.tgz`
      );

      expect(response.status).toBe(404);
    });
  });

  describe('Dist Tags', () => {
    it('should manage dist tags', async () => {
      const packageName = `dist-tag-test-${Date.now()}`;
      await createPackageForRepo(packageName);

      // Publish v1.0.0
      const tarball = Buffer.from('content');
      await fetch(`${API_URL}/api/packages/${packageName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          name: packageName,
          versions: {
            '1.0.0': { name: packageName, version: '1.0.0' },
          },
          'dist-tags': { latest: '1.0.0' },
          _attachments: {
            [`${packageName}-1.0.0.tgz`]: {
              content_type: 'application/octet-stream',
              data: tarball.toString('base64'),
              length: tarball.length,
            },
          },
        }),
      });

      // Add a beta tag
      const addTagResponse = await fetch(
        `${API_URL}/api/packages/-/package/${packageName}/dist-tags/beta`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify('1.0.0'),
        }
      );

      expect(addTagResponse.ok).toBe(true);

      // Get tags
      const getTagsResponse = await fetch(
        `${API_URL}/api/packages/-/package/${packageName}/dist-tags`
      );
      expect(getTagsResponse.ok).toBe(true);
      const tags = await getTagsResponse.json();
      expect(tags.latest).toBe('1.0.0');
      expect(tags.beta).toBe('1.0.0');
    });
  });

  describe('Search', () => {
    it('should search packages', async () => {
      const packageName = `searchable-pkg-${Date.now()}`;
      await createPackageForRepo(packageName);

      // Publish a package
      const tarball = Buffer.from('content');
      await fetch(`${API_URL}/api/packages/${packageName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          name: packageName,
          description: 'A searchable package',
          versions: {
            '1.0.0': { name: packageName, version: '1.0.0' },
          },
          'dist-tags': { latest: '1.0.0' },
          _attachments: {
            [`${packageName}-1.0.0.tgz`]: {
              content_type: 'application/octet-stream',
              data: tarball.toString('base64'),
              length: tarball.length,
            },
          },
        }),
      });

      // Search for it
      const response = await fetch(
        `${API_URL}/api/packages/-/v1/search?text=searchable`
      );

      expect(response.ok).toBe(true);
      const data = await response.json();
      expect(data.objects).toBeDefined();
      expect(Array.isArray(data.objects)).toBe(true);
    });
  });

  describe('tRPC API', () => {
    it('should get package by full name via tRPC', async () => {
      const packageName = `trpc-get-${Date.now()}`;
      await createPackageForRepo(packageName);

      // Publish a version first
      const tarball = Buffer.from('content');
      await fetch(`${API_URL}/api/packages/${packageName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          name: packageName,
          versions: {
            '1.0.0': { name: packageName, version: '1.0.0' },
          },
          'dist-tags': { latest: '1.0.0' },
          _attachments: {
            [`${packageName}-1.0.0.tgz`]: {
              content_type: 'application/octet-stream',
              data: tarball.toString('base64'),
              length: tarball.length,
            },
          },
        }),
      });

      const pkg = await authApi.packages.getByFullName.query({
        fullName: packageName,
      });

      expect(pkg).toBeDefined();
      expect(pkg?.name).toBe(packageName);
    });

    it('should list versions via tRPC', async () => {
      const packageName = `trpc-versions-${Date.now()}`;
      const { packageId } = await createPackageForRepo(packageName);

      // Publish a version
      const tarball = Buffer.from('content');
      await fetch(`${API_URL}/api/packages/${packageName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({
          name: packageName,
          versions: {
            '1.0.0': { name: packageName, version: '1.0.0' },
          },
          'dist-tags': { latest: '1.0.0' },
          _attachments: {
            [`${packageName}-1.0.0.tgz`]: {
              content_type: 'application/octet-stream',
              data: tarball.toString('base64'),
              length: tarball.length,
            },
          },
        }),
      });

      const versions = await authApi.packages.listVersions.query({
        packageId,
      });

      expect(versions).toBeDefined();
      expect(versions.length).toBeGreaterThan(0);
      expect(versions[0].version).toBe('1.0.0');
    });

    it('should check canPublish via tRPC', async () => {
      const packageName = `trpc-canpublish-${Date.now()}`;
      const { packageId } = await createPackageForRepo(packageName);

      const canPublish = await authApi.packages.canPublish.query({
        packageId,
      });

      expect(canPublish).toBe(true);
    });

    it('should list my packages via tRPC', async () => {
      // Create a package for this test
      const packageName = `my-pkg-${Date.now()}`;
      await createPackageForRepo(packageName);

      const packages = await authApi.packages.myPackages.query({
        limit: 10,
      });

      expect(packages).toBeDefined();
      expect(Array.isArray(packages)).toBe(true);
      expect(packages.some((p: any) => p.name === packageName)).toBe(true);
    });
  });

  describe('Enable/Disable via tRPC', () => {
    it('should enable package registry for a repo', async () => {
      const repoName = `enable-pkg-repo-${Date.now()}`;
      const packageName = `enable-test-${Date.now()}`;

      // Create repo
      const repo = await authApi.repos.create.mutate({
        name: repoName,
        description: 'Test repo for enabling package',
        isPrivate: false,
      });

      // Enable package registry
      const pkg = await authApi.packages.enableForRepo.mutate({
        repoId: repo.id,
        name: packageName,
        scope: null,
        description: 'Test package',
        publishOnRelease: false,
      });

      expect(pkg).toBeDefined();
      expect(pkg.name).toBe(packageName);
      expect(pkg.repoId).toBe(repo.id);
    });

    it('should disable package registry for a repo', async () => {
      const repoName = `disable-pkg-repo-${Date.now()}`;
      const packageName = `disable-test-${Date.now()}`;

      // Create repo and enable package
      const repo = await authApi.repos.create.mutate({
        name: repoName,
        description: 'Test repo for disabling package',
        isPrivate: false,
      });

      await authApi.packages.enableForRepo.mutate({
        repoId: repo.id,
        name: packageName,
        scope: null,
      });

      // Disable package registry
      const result = await authApi.packages.disableForRepo.mutate({
        repoId: repo.id,
      });

      expect(result.success).toBe(true);

      // Verify package is gone
      const pkg = await authApi.packages.getByRepoId.query({
        repoId: repo.id,
      });

      expect(pkg).toBeNull();
    });

    it('should get package by repo ID', async () => {
      const packageName = `get-by-repo-${Date.now()}`;
      const { repoId } = await createPackageForRepo(packageName);

      const pkg = await authApi.packages.getByRepoId.query({
        repoId,
      });

      expect(pkg).toBeDefined();
      expect(pkg?.name).toBe(packageName);
    });
  });
});
