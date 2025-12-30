/**
 * npm-compatible Package Registry REST API
 *
 * Implements the npm registry API for:
 * - Package metadata retrieval
 * - Version publishing
 * - Tarball downloads
 * - Dist-tag management
 * - Search
 *
 * Reference: https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md
 */

import { Hono } from 'hono';
import { stream } from 'hono/streaming';
import {
  packageModel,
  packageVersionModel,
  distTagModel,
  maintainerModel,
  parsePackageName,
  getFullPackageName,
  generatePackageMetadata,
} from '../../db/models/packages';
import { tokenModel, hasScope } from '../../db/models/tokens';
import { userModel } from '../../db/models/user';
import { PackageStorage, createPackageStorage } from '../storage/packages';
import { authMiddleware } from '../middleware/auth';
import { eventBus } from '../../events';
import { repoModel } from '../../db/models/repository';

// Types for npm publish payload
interface NpmPublishPayload {
  name: string;
  description?: string;
  readme?: string;
  versions: Record<string, {
    name: string;
    version: string;
    description?: string;
    main?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    engines?: Record<string, string>;
    bin?: Record<string, string> | string;
    keywords?: string[];
    license?: string;
    homepage?: string;
    repository?: { type: string; url: string } | string;
    dist?: {
      tarball: string;
      shasum: string;
      integrity?: string;
    };
  }>;
  'dist-tags'?: Record<string, string>;
  _attachments?: Record<string, {
    content_type: string;
    data: string; // base64 encoded
    length: number;
  }>;
}

/**
 * Create npm-compatible package registry routes
 */
export function createPackageRoutes(baseUrl: string): Hono {
  const app = new Hono();
  
  // Apply auth middleware to set c.get('user') for session tokens
  app.use('*', authMiddleware);
  
  // Initialize package storage
  const storage = createPackageStorage(`${baseUrl}/api/packages`);

  /**
   * Helper to parse package name from URL
   * Handles both scoped (@scope/name) and unscoped packages
   */
  function parsePackageFromUrl(packageParam: string): { scope: string | null; name: string } {
    // URL decoding: @scope%2Fname -> @scope/name
    const decoded = decodeURIComponent(packageParam);
    return parsePackageName(decoded);
  }

  /**
   * Helper to get authenticated user
   */
  async function getAuthUser(c: any): Promise<{ id: string; username: string } | null> {
    const user = c.get('user');
    if (user) return user;

    // Check for Bearer token
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const tokenRecord = await tokenModel.verify(token);
      if (tokenRecord) {
        const user = await userModel.findById(tokenRecord.userId);
        if (user && user.username) {
          return { id: user.id, username: user.username };
        }
      }
    }

    return null;
  }

  /**
   * Check if user has required scope
   * For session tokens (full user auth), always returns true
   * For personal access tokens, checks if the token has the required scope
   */
  async function checkScope(c: any, requiredScope: 'packages:read' | 'packages:write'): Promise<boolean> {
    // If user is set via session auth middleware, they have full access
    const user = c.get('user');
    if (user) {
      // Check if this is a session-based auth (not a PAT)
      const authHeader = c.req.header('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        // Try to verify as a personal access token
        const tokenRecord = await tokenModel.verify(token);
        if (tokenRecord) {
          // It's a PAT, check scopes
          return hasScope(JSON.parse(tokenRecord.scopes), requiredScope);
        }
      }
      // User is authenticated via session, has full access
      return true;
    }

    return false;
  }

  // ============ SPECIAL ROUTES (must come before wildcard routes) ============

  /**
   * GET /-/ping - Health check
   */
  app.get('/-/ping', (c) => {
    return c.json({ ok: true });
  });

  /**
   * GET /-/whoami - Get current user
   */
  app.get('/-/whoami', async (c) => {
    const user = await getAuthUser(c);
    
    if (!user) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    return c.json({ username: user.username });
  });

  /**
   * PUT /-/user/org.couchdb.user::username - npm login
   * Creates or validates a user session
   */
  app.put('/-/user/org.couchdb.user::username', async (c) => {
    // For now, just validate existing tokens
    // Full npm login would create new tokens here
    const user = await getAuthUser(c);
    
    if (user) {
      return c.json({
        ok: true,
        id: `org.couchdb.user:${user.username}`,
        token: c.req.header('Authorization')?.slice(7), // Return same token
      });
    }

    return c.json({ error: 'Invalid credentials' }, 401);
  });

  /**
   * GET /-/v1/search - Search packages
   */
  app.get('/-/v1/search', async (c) => {
    const text = c.req.query('text') || '';
    const size = parseInt(c.req.query('size') || '20', 10);
    const from = parseInt(c.req.query('from') || '0', 10);

    const packages = await packageModel.search(text, {
      limit: Math.min(size, 100),
      offset: from,
    });

    const objects = packages.map(pkg => ({
      package: {
        name: getFullPackageName(pkg.scope, pkg.name),
        scope: pkg.scope ? `@${pkg.scope}` : 'unscoped',
        version: '0.0.0', // Would need to fetch latest version
        description: pkg.description,
        keywords: pkg.keywords ? JSON.parse(pkg.keywords) : [],
        date: pkg.updatedAt.toISOString(),
        links: {
          npm: `${baseUrl}/package/${getFullPackageName(pkg.scope, pkg.name)}`,
          homepage: pkg.homepage,
          // Repository URL is derived from linked repo, not stored on package
          repository: undefined,
        },
      },
      score: {
        final: 1,
        detail: {
          quality: 1,
          popularity: Math.min(pkg.downloadCount / 1000, 1),
          maintenance: 1,
        },
      },
      searchScore: 1,
    }));

    return c.json({
      objects,
      total: packages.length,
      time: new Date().toISOString(),
    });
  });

  /**
   * GET /-/package/:package/dist-tags - Get all dist-tags
   */
  app.get('/-/package/:package{.+}/dist-tags', async (c) => {
    const packageParam = c.req.param('package');
    const { scope, name } = parsePackageFromUrl(packageParam);
    const pkg = await packageModel.getByName(scope, name);

    if (!pkg) {
      return c.json({ error: 'Not found' }, 404);
    }

    const tags = await distTagModel.list(pkg.id);
    const result: Record<string, string> = {};
    for (const tag of tags) {
      result[tag.tag] = tag.version;
    }

    return c.json(result);
  });

  /**
   * PUT /-/package/:package/dist-tags/:tag - Add/update dist-tag
   */
  app.put('/-/package/:package{.+}/dist-tags/:tag', async (c) => {
    const packageParam = c.req.param('package');
    const tag = c.req.param('tag');
    const { scope, name } = parsePackageFromUrl(packageParam);
    
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const pkg = await packageModel.getByName(scope, name);
    if (!pkg) {
      return c.json({ error: 'Package not found' }, 404);
    }

    // Check write access
    const canPublish = await maintainerModel.canPublish(pkg.id, user.id);
    if (!canPublish) {
      return c.json({ error: 'Not authorized' }, 403);
    }

    // Get version string from body
    const version = await c.req.text();
    const cleanVersion = version.replace(/^"|"$/g, ''); // Remove quotes if present
    
    // Find the version
    const versionRecord = await packageVersionModel.getByVersion(pkg.id, cleanVersion);
    if (!versionRecord) {
      return c.json({ error: `Version ${cleanVersion} not found` }, 404);
    }

    // Set the tag
    await distTagModel.set(pkg.id, tag, versionRecord.id);

    return c.json({ ok: true });
  });

  /**
   * DELETE /-/package/:package/dist-tags/:tag - Remove dist-tag
   */
  app.delete('/-/package/:package{.+}/dist-tags/:tag', async (c) => {
    const packageParam = c.req.param('package');
    const tag = c.req.param('tag');
    const { scope, name } = parsePackageFromUrl(packageParam);
    
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const pkg = await packageModel.getByName(scope, name);
    if (!pkg) {
      return c.json({ error: 'Package not found' }, 404);
    }

    // Check write access
    const canPublish = await maintainerModel.canPublish(pkg.id, user.id);
    if (!canPublish) {
      return c.json({ error: 'Not authorized' }, 403);
    }

    // Can't delete 'latest' tag
    if (tag === 'latest') {
      return c.json({ error: 'Cannot delete latest tag' }, 400);
    }

    const deleted = await distTagModel.delete(pkg.id, tag);
    if (!deleted) {
      return c.json({ error: 'Tag not found' }, 404);
    }

    return c.json({ ok: true });
  });

  // ============ TARBALL DOWNLOAD ============
  // NOTE: Must come before other /:package routes to match /-/ in the middle

  /**
   * GET /:package/-/:tarball - Download package tarball
   * Format: @scope/name/-/name-1.0.0.tgz or name/-/name-1.0.0.tgz
   */
  app.get('/:package{.+}/-/:tarball', async (c) => {
    const packageParam = c.req.param('package');
    const tarball = c.req.param('tarball');

    const { scope, name } = parsePackageFromUrl(packageParam);

    // Parse version from tarball name (name-1.0.0.tgz -> 1.0.0)
    const versionMatch = tarball.match(/^.+-(.+)\.tgz$/);
    if (!versionMatch) {
      return c.json({ error: 'Invalid tarball name' }, 400);
    }
    const version = versionMatch[1];

    const pkg = await packageModel.getByName(scope, name);
    if (!pkg) {
      return c.json({ error: 'Not found' }, 404);
    }

    // Check access for private packages
    if (pkg.visibility === 'private') {
      const user = await getAuthUser(c);
      if (!user) {
        return c.json({ error: 'Authentication required' }, 401);
      }

      const canAccess = await maintainerModel.canPublish(pkg.id, user.id);
      if (!canAccess) {
        return c.json({ error: 'Not authorized' }, 403);
      }
    }

    const pkgVersion = await packageVersionModel.getByVersion(pkg.id, version);
    if (!pkgVersion) {
      return c.json({ error: 'Version not found' }, 404);
    }

    // Get tarball from storage
    const readStream = storage.createReadStream(scope, name, version);
    if (!readStream) {
      return c.json({ error: 'Tarball not found' }, 404);
    }

    // Increment download counts
    await Promise.all([
      packageModel.incrementDownloads(pkg.id),
      packageVersionModel.incrementDownloads(pkgVersion.id),
    ]);

    // Stream the tarball
    c.header('Content-Type', 'application/octet-stream');
    c.header('Content-Disposition', `attachment; filename="${tarball}"`);
    c.header('Content-Length', String(pkgVersion.tarballSize));

    return stream(c, async (stream) => {
      for await (const chunk of readStream) {
        await stream.write(chunk);
      }
    });
  });

  // ============ PACKAGE METADATA ============

  /**
   * GET /:package - Get package metadata (all versions)
   * This is the main endpoint npm uses to resolve packages
   */
  app.get('/:package{.+}', async (c) => {
    const packageParam = c.req.param('package');
    
    // Skip if this looks like a tarball request
    if (packageParam.includes('/-/')) {
      return c.notFound();
    }

    const { scope, name } = parsePackageFromUrl(packageParam);
    const pkg = await packageModel.getByName(scope, name);

    if (!pkg) {
      return c.json({ error: 'Not found' }, 404);
    }

    // Check access for private packages
    if (pkg.visibility === 'private') {
      const user = await getAuthUser(c);
      if (!user) {
        return c.json({ error: 'Authentication required' }, 401);
      }

      const canAccess = await maintainerModel.canPublish(pkg.id, user.id);
      if (!canAccess) {
        return c.json({ error: 'Not authorized' }, 403);
      }
    }

    // Get full package data with versions
    const pkgWithVersions = await packageModel.getWithVersions(pkg.id);
    if (!pkgWithVersions) {
      return c.json({ error: 'Not found' }, 404);
    }

    // Generate npm-compatible metadata
    const distTags = pkgWithVersions.distTags.map(dt => ({
      tag: dt.tag,
      version: dt.version,
    }));

    const metadata = await generatePackageMetadata(
      pkgWithVersions,
      pkgWithVersions.versions,
      distTags
    );

    return c.json(metadata);
  });

  // ============ VERSION METADATA ============

  /**
   * GET /:package/:version - Get specific version metadata
   */
  app.get('/:package{.+}/:version', async (c) => {
    const packageParam = c.req.param('package');
    const version = c.req.param('version');

    // Skip tarball requests
    if (packageParam.includes('/-/') || version.endsWith('.tgz')) {
      return c.notFound();
    }

    const { scope, name } = parsePackageFromUrl(packageParam);
    const pkg = await packageModel.getByName(scope, name);

    if (!pkg) {
      return c.json({ error: 'Not found' }, 404);
    }

    // Check access for private packages
    if (pkg.visibility === 'private') {
      const user = await getAuthUser(c);
      if (!user) {
        return c.json({ error: 'Authentication required' }, 401);
      }

      const canAccess = await maintainerModel.canPublish(pkg.id, user.id);
      if (!canAccess) {
        return c.json({ error: 'Not authorized' }, 403);
      }
    }

    const pkgVersion = await packageVersionModel.getByVersion(pkg.id, version);
    if (!pkgVersion) {
      return c.json({ error: 'Version not found' }, 404);
    }

    const fullName = getFullPackageName(scope, name);
    const manifest = JSON.parse(pkgVersion.manifest);

    return c.json({
      ...manifest,
      name: fullName,
      version: pkgVersion.version,
      dist: {
        tarball: pkgVersion.tarballUrl,
        shasum: pkgVersion.tarballSha512,
        integrity: `sha512-${pkgVersion.tarballSha512}`,
      },
      _id: `${fullName}@${pkgVersion.version}`,
      deprecated: pkgVersion.deprecated,
    });
  });

  // ============ PUBLISH ============

  /**
   * PUT /:package - Publish a new package version
   * This is the main publish endpoint used by npm publish
   */
  app.put('/:package{.+}', async (c) => {
    const packageParam = c.req.param('package');
    const { scope, name } = parsePackageFromUrl(packageParam);
    const fullName = getFullPackageName(scope, name);

    // Require authentication
    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    // Check packages:write scope
    const hasWriteScope = await checkScope(c, 'packages:write');
    if (!hasWriteScope) {
      return c.json({ error: 'Token requires packages:write scope' }, 403);
    }

    // Parse the publish payload
    const payload: NpmPublishPayload = await c.req.json();

    // Validate package name matches
    if (payload.name !== fullName) {
      return c.json({ error: 'Package name mismatch' }, 400);
    }

    // Get or create the package
    const pkg = await packageModel.getByName(scope, name);
    const isNewPackage = !pkg;

    if (pkg) {
      // Check if user can publish to existing package
      const canPublish = await maintainerModel.canPublish(pkg.id, user.id);
      if (!canPublish) {
        return c.json({ error: 'Not authorized to publish to this package' }, 403);
      }
    } else {
      // Package doesn't exist - users must enable package registry via the UI first
      return c.json({ 
        error: 'Package not found. Please enable package registry for your repository first via the web UI.' 
      }, 404);
    }

    // Process each version in the payload
    const versions = Object.entries(payload.versions);
    const publishedVersions: string[] = [];

    for (const [version, versionData] of versions) {
      // Check if version already exists
      const existingVersion = await packageVersionModel.getByVersion(pkg.id, version);
      if (existingVersion) {
        // Version already exists - npm allows this for idempotency
        continue;
      }

      // Get the attachment (tarball data)
      const attachmentKey = `${name}-${version}.tgz`;
      const attachment = payload._attachments?.[attachmentKey];
      
      if (!attachment) {
        return c.json({ error: `Missing attachment for ${version}` }, 400);
      }

      // Store the tarball
      const stored = await storage.storeBase64(scope, name, version, attachment.data);

      // Create the version record
      await packageVersionModel.create({
        packageId: pkg.id,
        version,
        tagName: null, // Could link to git tag if published from repo
        tarballUrl: stored.url,
        tarballSha512: stored.sha512,
        tarballSize: stored.size,
        manifest: JSON.stringify(versionData),
        dependencies: versionData.dependencies ? JSON.stringify(versionData.dependencies) : null,
        devDependencies: versionData.devDependencies ? JSON.stringify(versionData.devDependencies) : null,
        peerDependencies: versionData.peerDependencies ? JSON.stringify(versionData.peerDependencies) : null,
        optionalDependencies: versionData.optionalDependencies ? JSON.stringify(versionData.optionalDependencies) : null,
        engines: versionData.engines ? JSON.stringify(versionData.engines) : null,
        bin: versionData.bin ? JSON.stringify(versionData.bin) : null,
        publishedBy: user.id,
      });

      publishedVersions.push(version);
    }

    // Update dist-tags
    if (payload['dist-tags']) {
      for (const [tag, tagVersion] of Object.entries(payload['dist-tags'])) {
        const pkgVersion = await packageVersionModel.getByVersion(pkg.id, tagVersion);
        if (pkgVersion) {
          await distTagModel.set(pkg.id, tag, pkgVersion.id);
        }
      }
    }

    // Update package metadata
    await packageModel.update(pkg.id, {
      description: payload.description || pkg.description,
      readme: payload.readme || pkg.readme,
    });

    // Emit events for each published version
    for (const version of publishedVersions) {
      await eventBus.emit('package.published', user.id, {
        packageId: pkg.id,
        packageName: fullName,
        version,
        repoId: pkg.repoId ?? undefined,
      });
    }

    return c.json({
      ok: true,
      id: fullName,
      rev: `1-${pkg.id}`,
      versions: publishedVersions,
    });
  });

  // ============ UNPUBLISH ============

  /**
   * DELETE /:package/-rev/:rev - Unpublish a package
   */
  app.delete('/:package{.+}/-rev/:rev', async (c) => {
    const packageParam = c.req.param('package');
    const { scope, name } = parsePackageFromUrl(packageParam);

    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const pkg = await packageModel.getByName(scope, name);
    if (!pkg) {
      return c.json({ error: 'Not found' }, 404);
    }

    // Get repo to check ownership
    const repo = await repoModel.findById(pkg.repoId);
    if (!repo || repo.ownerId !== user.id) {
      return c.json({ error: 'Only the repository owner can unpublish' }, 403);
    }

    const fullName = getFullPackageName(scope, name);

    // Delete all tarballs
    await storage.deleteAll(scope, name);

    // Emit unpublished event
    await eventBus.emit('package.unpublished', user.id, {
      packageId: pkg.id,
      packageName: fullName,
    });

    // Delete package (cascades to versions, dist-tags, maintainers)
    await packageModel.delete(pkg.id);

    return c.json({ ok: true });
  });

  /**
   * DELETE /:package/-/:tarball/-rev/:rev - Unpublish a specific version
   */
  app.delete('/:package{.+}/-/:tarball/-rev/:rev', async (c) => {
    const packageParam = c.req.param('package');
    const tarball = c.req.param('tarball');
    const { scope, name } = parsePackageFromUrl(packageParam);

    // Parse version from tarball
    const versionMatch = tarball.match(/^.+-(.+)\.tgz$/);
    if (!versionMatch) {
      return c.json({ error: 'Invalid tarball name' }, 400);
    }
    const version = versionMatch[1];

    const user = await getAuthUser(c);
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const pkg = await packageModel.getByName(scope, name);
    if (!pkg) {
      return c.json({ error: 'Not found' }, 404);
    }

    const canPublish = await maintainerModel.canPublish(pkg.id, user.id);
    if (!canPublish) {
      return c.json({ error: 'Not authorized' }, 403);
    }

    const pkgVersion = await packageVersionModel.getByVersion(pkg.id, version);
    if (!pkgVersion) {
      return c.json({ error: 'Version not found' }, 404);
    }

    const fullName = getFullPackageName(scope, name);

    // Delete tarball
    await storage.delete(scope, name, version);

    // Emit unpublished event for specific version
    await eventBus.emit('package.unpublished', user.id, {
      packageId: pkg.id,
      packageName: fullName,
      version,
    });

    // Delete version record
    await packageVersionModel.delete(pkgVersion.id);

    return c.json({ ok: true });
  });

  return app;
}
