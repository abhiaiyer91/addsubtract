/**
 * Unit Tests for the Package Registry
 *
 * Tests the package model, storage, and helper functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============ PACKAGE NAME PARSING TESTS ============

describe('Package Name Parsing', () => {
  let parsePackageName: typeof import('../db/models/packages').parsePackageName;
  let getFullPackageName: typeof import('../db/models/packages').getFullPackageName;

  beforeEach(async () => {
    // Dynamic import to avoid hoisting issues with mocks
    vi.resetModules();
    const module = await import('../db/models/packages');
    parsePackageName = module.parsePackageName;
    getFullPackageName = module.getFullPackageName;
  });

  describe('parsePackageName', () => {
    it('should parse scoped package names', () => {
      const result = parsePackageName('@wit/cli');
      expect(result).toEqual({ scope: 'wit', name: 'cli' });
    });

    it('should parse unscoped package names', () => {
      const result = parsePackageName('lodash');
      expect(result).toEqual({ scope: null, name: 'lodash' });
    });

    it('should handle @types scoped packages', () => {
      const result = parsePackageName('@types/node');
      expect(result).toEqual({ scope: 'types', name: 'node' });
    });

    it('should handle @babel scoped packages', () => {
      const result = parsePackageName('@babel/core');
      expect(result).toEqual({ scope: 'babel', name: 'core' });
    });

    it('should handle packages with hyphens', () => {
      const result = parsePackageName('@my-org/my-package');
      expect(result).toEqual({ scope: 'my-org', name: 'my-package' });
    });

    it('should handle packages with numbers', () => {
      const result = parsePackageName('@org123/pkg456');
      expect(result).toEqual({ scope: 'org123', name: 'pkg456' });
    });

    it('should handle single character names', () => {
      const result = parsePackageName('a');
      expect(result).toEqual({ scope: null, name: 'a' });
    });

    it('should handle packages with dots', () => {
      const result = parsePackageName('socket.io');
      expect(result).toEqual({ scope: null, name: 'socket.io' });
    });
  });

  describe('getFullPackageName', () => {
    it('should reconstruct full scoped name', () => {
      const result = getFullPackageName('wit', 'cli');
      expect(result).toBe('@wit/cli');
    });

    it('should reconstruct full unscoped name', () => {
      const result = getFullPackageName(null, 'lodash');
      expect(result).toBe('lodash');
    });

    it('should handle empty scope as null', () => {
      const result = getFullPackageName(null, 'express');
      expect(result).toBe('express');
    });

    it('should handle complex scope names', () => {
      const result = getFullPackageName('my-awesome-org', 'super-package');
      expect(result).toBe('@my-awesome-org/super-package');
    });
  });

  describe('roundtrip parsing', () => {
    const testCases = [
      '@wit/cli',
      '@types/node',
      '@babel/core',
      'lodash',
      'express',
      'socket.io',
      '@my-org/my-pkg',
    ];

    testCases.forEach((name) => {
      it(`should roundtrip: ${name}`, () => {
        const parsed = parsePackageName(name);
        const reconstructed = getFullPackageName(parsed.scope, parsed.name);
        expect(reconstructed).toBe(name);
      });
    });
  });
});

// ============ PACKAGE STORAGE TESTS ============

describe('Package Storage', () => {
  let PackageStorage: typeof import('../server/storage/packages').PackageStorage;
  let tempDir: string;
  let storage: InstanceType<typeof PackageStorage>;

  beforeEach(async () => {
    vi.resetModules();
    const module = await import('../server/storage/packages');
    PackageStorage = module.PackageStorage;

    // Create temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wit-pkg-test-'));
    storage = new PackageStorage({
      storageDir: tempDir,
      baseUrl: 'http://localhost:3000/api/packages',
    });
  });

  afterEach(() => {
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('store and retrieve', () => {
    it('should store and retrieve a tarball', async () => {
      const testData = Buffer.from('test tarball content');

      const stored = await storage.store(null, 'test-package', '1.0.0', testData);

      expect(stored.size).toBe(testData.length);
      expect(stored.sha512).toBeDefined();
      expect(stored.sha512.length).toBeGreaterThan(0);
      expect(stored.url).toBe(
        'http://localhost:3000/api/packages/test-package/-/test-package-1.0.0.tgz'
      );

      const retrieved = await storage.retrieve(null, 'test-package', '1.0.0');
      expect(retrieved).toEqual(testData);
    });

    it('should store scoped packages in correct directory', async () => {
      const testData = Buffer.from('scoped package content');

      await storage.store('myorg', 'mypackage', '2.0.0', testData);

      const expectedPath = path.join(tempDir, '@myorg', 'mypackage', '2.0.0.tgz');
      expect(fs.existsSync(expectedPath)).toBe(true);
    });

    it('should generate correct URLs for scoped packages', async () => {
      const testData = Buffer.from('test');

      const stored = await storage.store('myorg', 'mypackage', '1.0.0', testData);

      expect(stored.url).toBe(
        'http://localhost:3000/api/packages/@myorg/mypackage/-/mypackage-1.0.0.tgz'
      );
    });

    it('should store multiple versions of the same package', async () => {
      await storage.store(null, 'multi-version', '1.0.0', Buffer.from('v1'));
      await storage.store(null, 'multi-version', '1.1.0', Buffer.from('v1.1'));
      await storage.store(null, 'multi-version', '2.0.0', Buffer.from('v2'));

      const v1 = await storage.retrieve(null, 'multi-version', '1.0.0');
      const v11 = await storage.retrieve(null, 'multi-version', '1.1.0');
      const v2 = await storage.retrieve(null, 'multi-version', '2.0.0');

      expect(v1?.toString()).toBe('v1');
      expect(v11?.toString()).toBe('v1.1');
      expect(v2?.toString()).toBe('v2');
    });

    it('should return null for nonexistent package', async () => {
      const result = await storage.retrieve(null, 'nonexistent', '1.0.0');
      expect(result).toBeNull();
    });

    it('should calculate correct SHA512 hash', async () => {
      const testData = Buffer.from('hello world');
      const stored = await storage.store(null, 'hash-test', '1.0.0', testData);

      // Verify hash is base64 encoded SHA512
      expect(stored.sha512).toBeDefined();
      expect(Buffer.from(stored.sha512, 'base64').length).toBe(64); // SHA512 = 512 bits = 64 bytes
    });
  });

  describe('storeBase64', () => {
    it('should store from base64 data', async () => {
      const originalData = Buffer.from('base64 test content');
      const base64Data = originalData.toString('base64');

      const stored = await storage.storeBase64(null, 'base64pkg', '1.0.0', base64Data);

      expect(stored.size).toBe(originalData.length);

      const retrieved = await storage.retrieve(null, 'base64pkg', '1.0.0');
      expect(retrieved).toEqual(originalData);
    });

    it('should handle binary data in base64', async () => {
      // Create some binary data
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);
      const base64Data = binaryData.toString('base64');

      const stored = await storage.storeBase64(null, 'binary-pkg', '1.0.0', base64Data);

      const retrieved = await storage.retrieve(null, 'binary-pkg', '1.0.0');
      expect(retrieved).toEqual(binaryData);
    });
  });

  describe('exists', () => {
    it('should return false for nonexistent tarball', () => {
      expect(storage.exists(null, 'nonexistent', '1.0.0')).toBe(false);
    });

    it('should return true for existing tarball', async () => {
      await storage.store(null, 'exists-test', '1.0.0', Buffer.from('test'));
      expect(storage.exists(null, 'exists-test', '1.0.0')).toBe(true);
    });

    it('should differentiate between versions', async () => {
      await storage.store(null, 'version-test', '1.0.0', Buffer.from('test'));

      expect(storage.exists(null, 'version-test', '1.0.0')).toBe(true);
      expect(storage.exists(null, 'version-test', '2.0.0')).toBe(false);
    });

    it('should handle scoped packages', async () => {
      await storage.store('scope', 'pkg', '1.0.0', Buffer.from('test'));

      expect(storage.exists('scope', 'pkg', '1.0.0')).toBe(true);
      expect(storage.exists(null, 'pkg', '1.0.0')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete a tarball', async () => {
      await storage.store(null, 'deleteme', '1.0.0', Buffer.from('test'));
      expect(storage.exists(null, 'deleteme', '1.0.0')).toBe(true);

      const deleted = await storage.delete(null, 'deleteme', '1.0.0');

      expect(deleted).toBe(true);
      expect(storage.exists(null, 'deleteme', '1.0.0')).toBe(false);
    });

    it('should return false for nonexistent tarball', async () => {
      const deleted = await storage.delete(null, 'nonexistent', '1.0.0');
      expect(deleted).toBe(false);
    });

    it('should not affect other versions', async () => {
      await storage.store(null, 'multi', '1.0.0', Buffer.from('v1'));
      await storage.store(null, 'multi', '2.0.0', Buffer.from('v2'));

      await storage.delete(null, 'multi', '1.0.0');

      expect(storage.exists(null, 'multi', '1.0.0')).toBe(false);
      expect(storage.exists(null, 'multi', '2.0.0')).toBe(true);
    });

    it('should clean up empty directories', async () => {
      await storage.store('cleanup-scope', 'cleanup-pkg', '1.0.0', Buffer.from('test'));

      await storage.delete('cleanup-scope', 'cleanup-pkg', '1.0.0');

      // The package directory should be cleaned up
      const pkgDir = path.join(tempDir, '@cleanup-scope', 'cleanup-pkg');
      expect(fs.existsSync(pkgDir)).toBe(false);
    });
  });

  describe('deleteAll', () => {
    it('should delete all versions of a package', async () => {
      await storage.store(null, 'todelete', '1.0.0', Buffer.from('v1'));
      await storage.store(null, 'todelete', '2.0.0', Buffer.from('v2'));
      await storage.store(null, 'todelete', '3.0.0', Buffer.from('v3'));

      const count = await storage.deleteAll(null, 'todelete');

      expect(count).toBe(3);
      expect(storage.listVersions(null, 'todelete')).toHaveLength(0);
    });

    it('should return 0 for nonexistent package', async () => {
      const count = await storage.deleteAll(null, 'nonexistent');
      expect(count).toBe(0);
    });

    it('should not affect other packages', async () => {
      await storage.store(null, 'keep', '1.0.0', Buffer.from('keep'));
      await storage.store(null, 'remove', '1.0.0', Buffer.from('remove'));

      await storage.deleteAll(null, 'remove');

      expect(storage.exists(null, 'keep', '1.0.0')).toBe(true);
      expect(storage.exists(null, 'remove', '1.0.0')).toBe(false);
    });
  });

  describe('listVersions', () => {
    it('should list all versions for a package', async () => {
      await storage.store(null, 'multi', '1.0.0', Buffer.from('v1'));
      await storage.store(null, 'multi', '1.1.0', Buffer.from('v1.1'));
      await storage.store(null, 'multi', '2.0.0', Buffer.from('v2'));

      const versions = storage.listVersions(null, 'multi');

      expect(versions).toHaveLength(3);
      expect(versions).toContain('1.0.0');
      expect(versions).toContain('1.1.0');
      expect(versions).toContain('2.0.0');
    });

    it('should return empty array for nonexistent package', () => {
      const versions = storage.listVersions(null, 'nonexistent');
      expect(versions).toHaveLength(0);
    });

    it('should handle scoped packages', async () => {
      await storage.store('scope', 'pkg', '1.0.0', Buffer.from('test'));
      await storage.store('scope', 'pkg', '2.0.0', Buffer.from('test'));

      const versions = storage.listVersions('scope', 'pkg');

      expect(versions).toHaveLength(2);
      expect(versions).toContain('1.0.0');
      expect(versions).toContain('2.0.0');
    });
  });

  describe('createReadStream', () => {
    it('should create readable stream', async () => {
      const testData = Buffer.from('stream test data');
      await storage.store(null, 'streamtest', '1.0.0', testData);

      const stream = storage.createReadStream(null, 'streamtest', '1.0.0');

      expect(stream).not.toBeNull();

      const chunks: Buffer[] = [];
      for await (const chunk of stream!) {
        chunks.push(Buffer.from(chunk));
      }
      expect(Buffer.concat(chunks)).toEqual(testData);
    });

    it('should return null for nonexistent stream', () => {
      const stream = storage.createReadStream(null, 'nonexistent', '1.0.0');
      expect(stream).toBeNull();
    });
  });

  describe('getMetadata', () => {
    it('should return metadata for existing tarball', async () => {
      const testData = Buffer.from('metadata test');
      await storage.store(null, 'metadata-pkg', '1.0.0', testData);

      const metadata = storage.getMetadata(null, 'metadata-pkg', '1.0.0');

      expect(metadata).not.toBeNull();
      expect(metadata?.size).toBe(testData.length);
      expect(metadata?.sha512).toBeDefined();
    });

    it('should return null for nonexistent tarball', () => {
      const metadata = storage.getMetadata(null, 'nonexistent', '1.0.0');
      expect(metadata).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return storage statistics', async () => {
      await storage.store(null, 'pkg1', '1.0.0', Buffer.from('content1'));
      await storage.store(null, 'pkg2', '1.0.0', Buffer.from('content2'));
      await storage.store('scope', 'pkg3', '1.0.0', Buffer.from('content3'));

      const stats = storage.getStats();

      expect(stats.totalPackages).toBe(3);
      expect(stats.totalSize).toBeGreaterThan(0);
    });

    it('should return zero for empty storage', () => {
      const stats = storage.getStats();

      expect(stats.totalPackages).toBe(0);
      expect(stats.totalSize).toBe(0);
    });
  });

  describe('getTarballPath', () => {
    it('should return correct path for unscoped package', () => {
      const tarballPath = storage.getTarballPath(null, 'mypackage', '1.0.0');
      expect(tarballPath).toBe(path.join(tempDir, 'mypackage', '1.0.0.tgz'));
    });

    it('should return correct path for scoped package', () => {
      const tarballPath = storage.getTarballPath('myorg', 'mypackage', '1.0.0');
      expect(tarballPath).toBe(path.join(tempDir, '@myorg', 'mypackage', '1.0.0.tgz'));
    });
  });
});

// ============ GENERATE PACKAGE METADATA TESTS ============

describe('Generate Package Metadata', () => {
  let generatePackageMetadata: typeof import('../db/models/packages').generatePackageMetadata;
  let getFullPackageName: typeof import('../db/models/packages').getFullPackageName;

  beforeEach(async () => {
    vi.resetModules();
    const module = await import('../db/models/packages');
    generatePackageMetadata = module.generatePackageMetadata;
    getFullPackageName = module.getFullPackageName;
  });

  it('should generate npm-compatible metadata', async () => {
    const pkg = {
      id: 'pkg-123',
      name: 'test-pkg',
      scope: null,
      ownerId: 'user-123',
      description: 'A test package',
      visibility: 'public' as const,
      keywords: '["test", "example"]',
      license: 'MIT',
      homepage: 'https://example.com',
      repositoryUrl: 'https://github.com/test/test-pkg',
      readme: '# Test Package\n\nThis is a test.',
      downloadCount: 100,
      deprecated: null,
      repoId: null,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      updatedAt: new Date('2024-01-02T00:00:00Z'),
    };

    const versions = [
      {
        id: 'ver-123',
        packageId: 'pkg-123',
        version: '1.0.0',
        tagName: null,
        tarballUrl: 'http://localhost/test-pkg-1.0.0.tgz',
        tarballSha512: 'abc123',
        tarballSize: 1024,
        manifest: JSON.stringify({ name: 'test-pkg', version: '1.0.0' }),
        dependencies: null,
        devDependencies: null,
        peerDependencies: null,
        optionalDependencies: null,
        engines: null,
        bin: null,
        publishedBy: 'user-123',
        deprecated: null,
        downloadCount: 50,
        publishedAt: new Date('2024-01-01T00:00:00Z'),
      },
    ];

    const distTags = [{ tag: 'latest', version: '1.0.0' }];

    const metadata = await generatePackageMetadata(pkg, versions, distTags);

    expect(metadata._id).toBe('test-pkg');
    expect(metadata.name).toBe('test-pkg');
    expect(metadata.description).toBe('A test package');
    expect(metadata['dist-tags']).toEqual({ latest: '1.0.0' });
    expect(metadata.versions).toHaveProperty('1.0.0');
    expect(metadata.readme).toBe('# Test Package\n\nThis is a test.');
    expect(metadata.license).toBe('MIT');
    expect(metadata.keywords).toEqual(['test', 'example']);
    expect(metadata.homepage).toBe('https://example.com');
    expect(metadata.time).toBeDefined();
    expect((metadata.time as Record<string, string>)['1.0.0']).toBeDefined();
  });

  it('should handle scoped packages', async () => {
    const pkg = {
      id: 'pkg-456',
      name: 'cli',
      scope: 'wit',
      ownerId: 'user-123',
      description: 'Wit CLI',
      visibility: 'public' as const,
      keywords: null,
      license: null,
      homepage: null,
      repositoryUrl: null,
      readme: null,
      downloadCount: 0,
      deprecated: null,
      repoId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const metadata = await generatePackageMetadata(pkg, [], []);

    expect(metadata._id).toBe('@wit/cli');
    expect(metadata.name).toBe('@wit/cli');
  });

  it('should include version dist info', async () => {
    const pkg = {
      id: 'pkg-789',
      name: 'dist-test',
      scope: null,
      ownerId: 'user-123',
      description: null,
      visibility: 'public' as const,
      keywords: null,
      license: null,
      homepage: null,
      repositoryUrl: null,
      readme: null,
      downloadCount: 0,
      deprecated: null,
      repoId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const versions = [
      {
        id: 'ver-789',
        packageId: 'pkg-789',
        version: '2.0.0',
        tagName: null,
        tarballUrl: 'http://localhost/dist-test-2.0.0.tgz',
        tarballSha512: 'sha512hash',
        tarballSize: 2048,
        manifest: JSON.stringify({ name: 'dist-test', version: '2.0.0' }),
        dependencies: null,
        devDependencies: null,
        peerDependencies: null,
        optionalDependencies: null,
        engines: null,
        bin: null,
        publishedBy: 'user-123',
        deprecated: null,
        downloadCount: 10,
        publishedAt: new Date(),
      },
    ];

    const metadata = await generatePackageMetadata(pkg, versions, []);

    const versionData = (metadata.versions as Record<string, any>)['2.0.0'];
    expect(versionData.dist).toBeDefined();
    expect(versionData.dist.tarball).toBe('http://localhost/dist-test-2.0.0.tgz');
    expect(versionData.dist.shasum).toBe('sha512hash');
    expect(versionData.dist.integrity).toBe('sha512-sha512hash');
  });

  it('should handle multiple versions and dist-tags', async () => {
    const pkg = {
      id: 'pkg-multi',
      name: 'multi-version',
      scope: null,
      ownerId: 'user-123',
      description: 'Multi-version package',
      visibility: 'public' as const,
      keywords: null,
      license: null,
      homepage: null,
      repositoryUrl: null,
      readme: null,
      downloadCount: 0,
      deprecated: null,
      repoId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const versions = [
      {
        id: 'ver-1',
        packageId: 'pkg-multi',
        version: '1.0.0',
        tagName: null,
        tarballUrl: 'http://localhost/1.0.0.tgz',
        tarballSha512: 'hash1',
        tarballSize: 1000,
        manifest: JSON.stringify({ name: 'multi-version', version: '1.0.0' }),
        dependencies: null,
        devDependencies: null,
        peerDependencies: null,
        optionalDependencies: null,
        engines: null,
        bin: null,
        publishedBy: 'user-123',
        deprecated: null,
        downloadCount: 0,
        publishedAt: new Date('2024-01-01'),
      },
      {
        id: 'ver-2',
        packageId: 'pkg-multi',
        version: '2.0.0',
        tagName: null,
        tarballUrl: 'http://localhost/2.0.0.tgz',
        tarballSha512: 'hash2',
        tarballSize: 2000,
        manifest: JSON.stringify({ name: 'multi-version', version: '2.0.0' }),
        dependencies: null,
        devDependencies: null,
        peerDependencies: null,
        optionalDependencies: null,
        engines: null,
        bin: null,
        publishedBy: 'user-123',
        deprecated: null,
        downloadCount: 0,
        publishedAt: new Date('2024-02-01'),
      },
      {
        id: 'ver-3',
        packageId: 'pkg-multi',
        version: '3.0.0-beta.1',
        tagName: null,
        tarballUrl: 'http://localhost/3.0.0-beta.1.tgz',
        tarballSha512: 'hash3',
        tarballSize: 3000,
        manifest: JSON.stringify({ name: 'multi-version', version: '3.0.0-beta.1' }),
        dependencies: null,
        devDependencies: null,
        peerDependencies: null,
        optionalDependencies: null,
        engines: null,
        bin: null,
        publishedBy: 'user-123',
        deprecated: null,
        downloadCount: 0,
        publishedAt: new Date('2024-03-01'),
      },
    ];

    const distTags = [
      { tag: 'latest', version: '2.0.0' },
      { tag: 'beta', version: '3.0.0-beta.1' },
    ];

    const metadata = await generatePackageMetadata(pkg, versions, distTags);

    expect(Object.keys(metadata.versions as object)).toHaveLength(3);
    expect(metadata['dist-tags']).toEqual({
      latest: '2.0.0',
      beta: '3.0.0-beta.1',
    });
  });

  it('should handle deprecated versions', async () => {
    const pkg = {
      id: 'pkg-deprecated',
      name: 'deprecated-test',
      scope: null,
      ownerId: 'user-123',
      description: null,
      visibility: 'public' as const,
      keywords: null,
      license: null,
      homepage: null,
      repositoryUrl: null,
      readme: null,
      downloadCount: 0,
      deprecated: null,
      repoId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const versions = [
      {
        id: 'ver-dep',
        packageId: 'pkg-deprecated',
        version: '1.0.0',
        tagName: null,
        tarballUrl: 'http://localhost/1.0.0.tgz',
        tarballSha512: 'hash',
        tarballSize: 1000,
        manifest: JSON.stringify({ name: 'deprecated-test', version: '1.0.0' }),
        dependencies: null,
        devDependencies: null,
        peerDependencies: null,
        optionalDependencies: null,
        engines: null,
        bin: null,
        publishedBy: 'user-123',
        deprecated: 'This version has a security vulnerability',
        downloadCount: 0,
        publishedAt: new Date(),
      },
    ];

    const metadata = await generatePackageMetadata(pkg, versions, []);

    const versionData = (metadata.versions as Record<string, any>)['1.0.0'];
    expect(versionData.deprecated).toBe('This version has a security vulnerability');
  });
});
