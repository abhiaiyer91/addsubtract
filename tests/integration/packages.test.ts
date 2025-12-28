/**
 * Integration Tests for the Package Registry
 *
 * Tests the full package registry flow including:
 * - Publishing packages
 * - Downloading packages
 * - Managing dist-tags
 * - Access control
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  startTestServer,
  stopTestServer,
  createTestClient,
  API_URL,
  uniqueUsername,
  uniqueEmail,
} from './setup';

describe('Package Registry Integration', () => {
  let sessionToken: string;
  let userId: string;
  let testUsername: string;

  beforeAll(async () => {
    await startTestServer();

    // Create a test user
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
  }, 30000);

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
    const packageName = `test-pkg-${Date.now()}`;

    it('should publish a new package', async () => {
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

    it('should get package metadata after publish', async () => {
      const response = await fetch(`${API_URL}/api/packages/${packageName}`);

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.name).toBe(packageName);
      expect(data.description).toBe('A test package');
      expect(data['dist-tags'].latest).toBe('1.0.0');
      expect(data.versions['1.0.0']).toBeDefined();
    });

    it('should publish a new version', async () => {
      const tarballContent = Buffer.from('fake tarball v2');
      const base64Tarball = tarballContent.toString('base64');

      const publishPayload = {
        name: packageName,
        versions: {
          '2.0.0': {
            name: packageName,
            version: '2.0.0',
            description: 'A test package v2',
          },
        },
        'dist-tags': {
          latest: '2.0.0',
        },
        _attachments: {
          [`${packageName}-2.0.0.tgz`]: {
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
      expect(data.versions).toContain('2.0.0');
    });

    it('should get specific version metadata', async () => {
      const response = await fetch(`${API_URL}/api/packages/${packageName}/1.0.0`);

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.name).toBe(packageName);
      expect(data.version).toBe('1.0.0');
    });

    it('should reject publish without auth', async () => {
      const publishPayload = {
        name: 'unauthorized-pkg',
        versions: {
          '1.0.0': { name: 'unauthorized-pkg', version: '1.0.0' },
        },
        _attachments: {
          'unauthorized-pkg-1.0.0.tgz': {
            content_type: 'application/octet-stream',
            data: Buffer.from('test').toString('base64'),
            length: 4,
          },
        },
      };

      const response = await fetch(`${API_URL}/api/packages/unauthorized-pkg`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(publishPayload),
      });

      expect(response.status).toBe(401);
    });
  });

  describe('Scoped Packages', () => {
    const scopedPackageName = `@${uniqueUsername('scope')}/test-pkg`;

    it('should publish a scoped package', async () => {
      const tarballContent = Buffer.from('scoped package content');
      const base64Tarball = tarballContent.toString('base64');
      const pkgNameOnly = scopedPackageName.split('/')[1];

      const publishPayload = {
        name: scopedPackageName,
        description: 'A scoped test package',
        versions: {
          '1.0.0': {
            name: scopedPackageName,
            version: '1.0.0',
          },
        },
        'dist-tags': {
          latest: '1.0.0',
        },
        _attachments: {
          [`${pkgNameOnly}-1.0.0.tgz`]: {
            content_type: 'application/octet-stream',
            data: base64Tarball,
            length: tarballContent.length,
          },
        },
      };

      // URL encode the scoped package name
      const encodedName = encodeURIComponent(scopedPackageName);

      const response = await fetch(`${API_URL}/api/packages/${encodedName}`, {
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
    });

    it('should get scoped package metadata', async () => {
      const encodedName = encodeURIComponent(scopedPackageName);
      const response = await fetch(`${API_URL}/api/packages/${encodedName}`);

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.name).toBe(scopedPackageName);
    });
  });

  describe('Dist Tags', () => {
    const packageName = `dist-tag-pkg-${Date.now()}`;

    beforeAll(async () => {
      // Publish a package with multiple versions
      for (const version of ['1.0.0', '2.0.0', '3.0.0-beta.1']) {
        const tarballContent = Buffer.from(`content for ${version}`);
        const publishPayload = {
          name: packageName,
          versions: {
            [version]: {
              name: packageName,
              version,
            },
          },
          'dist-tags': version.includes('beta') ? { beta: version } : { latest: version },
          _attachments: {
            [`${packageName}-${version}.tgz`]: {
              content_type: 'application/octet-stream',
              data: tarballContent.toString('base64'),
              length: tarballContent.length,
            },
          },
        };

        await fetch(`${API_URL}/api/packages/${packageName}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify(publishPayload),
        });
      }
    });

    it('should list dist-tags', async () => {
      const response = await fetch(
        `${API_URL}/api/packages/-/package/${packageName}/dist-tags`
      );

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.latest).toBeDefined();
    });

    it('should set a new dist-tag', async () => {
      const response = await fetch(
        `${API_URL}/api/packages/-/package/${packageName}/dist-tags/next`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: '"2.0.0"',
        }
      );

      expect(response.ok).toBe(true);

      // Verify the tag was set
      const tagsResponse = await fetch(
        `${API_URL}/api/packages/-/package/${packageName}/dist-tags`
      );
      const tags = await tagsResponse.json();
      expect(tags.next).toBe('2.0.0');
    });

    it('should delete a dist-tag', async () => {
      // First set a tag
      await fetch(
        `${API_URL}/api/packages/-/package/${packageName}/dist-tags/temp`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: '"1.0.0"',
        }
      );

      // Then delete it
      const response = await fetch(
        `${API_URL}/api/packages/-/package/${packageName}/dist-tags/temp`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
        }
      );

      expect(response.ok).toBe(true);

      // Verify it was deleted
      const tagsResponse = await fetch(
        `${API_URL}/api/packages/-/package/${packageName}/dist-tags`
      );
      const tags = await tagsResponse.json();
      expect(tags.temp).toBeUndefined();
    });

    it('should not allow deleting latest tag', async () => {
      const response = await fetch(
        `${API_URL}/api/packages/-/package/${packageName}/dist-tags/latest`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
        }
      );

      expect(response.status).toBe(400);
    });
  });

  describe('Search', () => {
    it('should search for packages', async () => {
      const response = await fetch(
        `${API_URL}/api/packages/-/v1/search?text=test&size=10`
      );

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data.objects).toBeDefined();
      expect(Array.isArray(data.objects)).toBe(true);
      expect(data.total).toBeDefined();
    });
  });

  describe('Tarball Download', () => {
    const packageName = `download-test-${Date.now()}`;
    const tarballContent = Buffer.from('test tarball for download');

    beforeAll(async () => {
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
            data: tarballContent.toString('base64'),
            length: tarballContent.length,
          },
        },
      };

      await fetch(`${API_URL}/api/packages/${packageName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(publishPayload),
      });
    });

    it('should download tarball', async () => {
      const response = await fetch(
        `${API_URL}/api/packages/${packageName}/-/${packageName}-1.0.0.tgz`
      );

      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toBe('application/octet-stream');

      const data = await response.arrayBuffer();
      expect(Buffer.from(data)).toEqual(tarballContent);
    });

    it('should return 404 for nonexistent version', async () => {
      const response = await fetch(
        `${API_URL}/api/packages/${packageName}/-/${packageName}-99.0.0.tgz`
      );

      expect(response.status).toBe(404);
    });
  });

  describe('tRPC API', () => {
    const packageName = `trpc-test-${Date.now()}`;

    beforeAll(async () => {
      // Publish a test package first
      const tarballContent = Buffer.from('trpc test content');
      const publishPayload = {
        name: packageName,
        description: 'Package for tRPC tests',
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
            data: tarballContent.toString('base64'),
            length: tarballContent.length,
          },
        },
      };

      await fetch(`${API_URL}/api/packages/${packageName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(publishPayload),
      });
    });

    it('should get package by full name via tRPC', async () => {
      const api = createTestClient(sessionToken);
      const pkg = await api.packages.getByFullName.query({ fullName: packageName });

      expect(pkg.name).toBe(packageName);
      expect(pkg.fullName).toBe(packageName);
    });

    it('should search packages via tRPC', async () => {
      const api = createTestClient(sessionToken);
      const results = await api.packages.search.query({ query: 'trpc' });

      expect(Array.isArray(results)).toBe(true);
    });

    it('should list versions via tRPC', async () => {
      const api = createTestClient(sessionToken);
      const pkg = await api.packages.getByFullName.query({ fullName: packageName });
      const versions = await api.packages.listVersions.query({ packageId: pkg.id });

      expect(versions.length).toBeGreaterThan(0);
      expect(versions[0].version).toBe('1.0.0');
    });

    it('should check canPublish via tRPC', async () => {
      const api = createTestClient(sessionToken);
      const pkg = await api.packages.getByFullName.query({ fullName: packageName });
      const canPublish = await api.packages.canPublish.query({ packageId: pkg.id });

      expect(canPublish).toBe(true);
    });

    it('should list my packages via tRPC', async () => {
      const api = createTestClient(sessionToken);
      const packages = await api.packages.myPackages.query({});

      expect(Array.isArray(packages)).toBe(true);
      expect(packages.length).toBeGreaterThan(0);
    });
  });

  describe('Unpublish', () => {
    it('should unpublish a specific version', async () => {
      const packageName = `unpublish-version-${Date.now()}`;

      // Publish two versions
      for (const version of ['1.0.0', '2.0.0']) {
        const tarballContent = Buffer.from(`content ${version}`);
        const publishPayload = {
          name: packageName,
          versions: {
            [version]: { name: packageName, version },
          },
          'dist-tags': { latest: version },
          _attachments: {
            [`${packageName}-${version}.tgz`]: {
              content_type: 'application/octet-stream',
              data: tarballContent.toString('base64'),
              length: tarballContent.length,
            },
          },
        };

        await fetch(`${API_URL}/api/packages/${packageName}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify(publishPayload),
        });
      }

      // Unpublish version 1.0.0
      const response = await fetch(
        `${API_URL}/api/packages/${packageName}/-/${packageName}-1.0.0.tgz/-rev/1`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
        }
      );

      expect(response.ok).toBe(true);

      // Verify 1.0.0 is gone but 2.0.0 remains
      const metadataResponse = await fetch(`${API_URL}/api/packages/${packageName}`);
      const metadata = await metadataResponse.json();

      expect(metadata.versions['1.0.0']).toBeUndefined();
      expect(metadata.versions['2.0.0']).toBeDefined();
    });

    it('should unpublish entire package', async () => {
      const packageName = `unpublish-all-${Date.now()}`;

      // Publish a package
      const tarballContent = Buffer.from('content');
      const publishPayload = {
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
      };

      await fetch(`${API_URL}/api/packages/${packageName}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify(publishPayload),
      });

      // Unpublish the package
      const response = await fetch(`${API_URL}/api/packages/${packageName}/-rev/1`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      expect(response.ok).toBe(true);

      // Verify package is gone
      const metadataResponse = await fetch(`${API_URL}/api/packages/${packageName}`);
      expect(metadataResponse.status).toBe(404);
    });
  });
});
