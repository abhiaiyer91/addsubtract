/**
 * Package Registry Model
 *
 * CRUD operations for npm-compatible package registry.
 * Handles packages, versions, dist-tags, and maintainers.
 */

import { eq, and, desc, sql, or, ilike, isNull } from 'drizzle-orm';
import { getDb } from '../index';
import {
  packages,
  packageVersions,
  packageDistTags,
  packageMaintainers,
  type Package,
  type NewPackage,
  type PackageVersion,
  type NewPackageVersion,
  type PackageDistTag,
  type NewPackageDistTag,
  type PackageMaintainer,
  type NewPackageMaintainer,
  type PackageVisibility,
} from '../schema';

/**
 * Parse a full package name into scope and name
 * @example "@wit/cli" -> { scope: "wit", name: "cli" }
 * @example "lodash" -> { scope: null, name: "lodash" }
 */
export function parsePackageName(fullName: string): { scope: string | null; name: string } {
  if (fullName.startsWith('@')) {
    const [scopePart, name] = fullName.slice(1).split('/');
    return { scope: scopePart, name };
  }
  return { scope: null, name: fullName };
}

/**
 * Get the full package name from scope and name
 * @example { scope: "wit", name: "cli" } -> "@wit/cli"
 * @example { scope: null, name: "lodash" } -> "lodash"
 */
export function getFullPackageName(scope: string | null, name: string): string {
  return scope ? `@${scope}/${name}` : name;
}

/**
 * Package model - CRUD operations for packages
 */
export const packageModel = {
  /**
   * Create a new package
   */
  async create(data: NewPackage): Promise<Package> {
    const db = getDb();
    const [pkg] = await db.insert(packages).values(data).returning();
    return pkg;
  },

  /**
   * Get a package by ID
   */
  async getById(id: string): Promise<Package | null> {
    const db = getDb();
    const [pkg] = await db
      .select()
      .from(packages)
      .where(eq(packages.id, id))
      .limit(1);
    return pkg ?? null;
  },

  /**
   * Get a package by scope and name
   */
  async getByName(scope: string | null, name: string): Promise<Package | null> {
    const db = getDb();
    const condition = scope
      ? and(eq(packages.scope, scope), eq(packages.name, name))
      : and(isNull(packages.scope), eq(packages.name, name));
    
    const [pkg] = await db
      .select()
      .from(packages)
      .where(condition)
      .limit(1);
    return pkg ?? null;
  },

  /**
   * Get a package by full name (e.g., "@wit/cli" or "lodash")
   */
  async getByFullName(fullName: string): Promise<Package | null> {
    const { scope, name } = parsePackageName(fullName);
    return this.getByName(scope, name);
  },

  /**
   * Get package with all versions and dist-tags
   */
  async getWithVersions(id: string): Promise<(Package & { 
    versions: PackageVersion[]; 
    distTags: (PackageDistTag & { version: string })[];
  }) | null> {
    const db = getDb();
    const pkg = await this.getById(id);
    if (!pkg) return null;

    const versions = await db
      .select()
      .from(packageVersions)
      .where(eq(packageVersions.packageId, id))
      .orderBy(desc(packageVersions.publishedAt));

    const tags = await db
      .select({
        id: packageDistTags.id,
        packageId: packageDistTags.packageId,
        tag: packageDistTags.tag,
        versionId: packageDistTags.versionId,
        updatedAt: packageDistTags.updatedAt,
        version: packageVersions.version,
      })
      .from(packageDistTags)
      .innerJoin(packageVersions, eq(packageDistTags.versionId, packageVersions.id))
      .where(eq(packageDistTags.packageId, id));

    return { ...pkg, versions, distTags: tags };
  },

  /**
   * List packages by owner
   */
  async listByOwner(ownerId: string, options: {
    limit?: number;
    offset?: number;
  } = {}): Promise<Package[]> {
    const db = getDb();
    const { limit = 50, offset = 0 } = options;

    return db
      .select()
      .from(packages)
      .where(eq(packages.ownerId, ownerId))
      .orderBy(desc(packages.updatedAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * List packages by scope
   */
  async listByScope(scope: string, options: {
    limit?: number;
    offset?: number;
  } = {}): Promise<Package[]> {
    const db = getDb();
    const { limit = 50, offset = 0 } = options;

    return db
      .select()
      .from(packages)
      .where(eq(packages.scope, scope))
      .orderBy(desc(packages.updatedAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Search packages by name/description
   */
  async search(query: string, options: {
    limit?: number;
    offset?: number;
  } = {}): Promise<Package[]> {
    const db = getDb();
    const { limit = 20, offset = 0 } = options;
    const searchPattern = `%${query}%`;

    return db
      .select()
      .from(packages)
      .where(
        and(
          eq(packages.visibility, 'public'),
          or(
            ilike(packages.name, searchPattern),
            ilike(packages.description, searchPattern)
          )
        )
      )
      .orderBy(desc(packages.downloadCount))
      .limit(limit)
      .offset(offset);
  },

  /**
   * Update a package
   */
  async update(id: string, data: Partial<Omit<NewPackage, 'id' | 'createdAt'>>): Promise<Package | null> {
    const db = getDb();
    const [pkg] = await db
      .update(packages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(packages.id, id))
      .returning();
    return pkg ?? null;
  },

  /**
   * Increment download count
   */
  async incrementDownloads(id: string): Promise<void> {
    const db = getDb();
    await db
      .update(packages)
      .set({
        downloadCount: sql`${packages.downloadCount} + 1`,
      })
      .where(eq(packages.id, id));
  },

  /**
   * Deprecate a package
   */
  async deprecate(id: string, message: string): Promise<Package | null> {
    return this.update(id, { deprecated: message });
  },

  /**
   * Undeprecate a package
   */
  async undeprecate(id: string): Promise<Package | null> {
    const db = getDb();
    const [pkg] = await db
      .update(packages)
      .set({ deprecated: null, updatedAt: new Date() })
      .where(eq(packages.id, id))
      .returning();
    return pkg ?? null;
  },

  /**
   * Delete a package (and all versions)
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.delete(packages).where(eq(packages.id, id)).returning();
    return result.length > 0;
  },
};

/**
 * Package version model - CRUD operations for versions
 */
export const packageVersionModel = {
  /**
   * Create a new version
   */
  async create(data: NewPackageVersion): Promise<PackageVersion> {
    const db = getDb();
    const [version] = await db.insert(packageVersions).values(data).returning();
    return version;
  },

  /**
   * Get a version by ID
   */
  async getById(id: string): Promise<PackageVersion | null> {
    const db = getDb();
    const [version] = await db
      .select()
      .from(packageVersions)
      .where(eq(packageVersions.id, id))
      .limit(1);
    return version ?? null;
  },

  /**
   * Get a specific version of a package
   */
  async getByVersion(packageId: string, version: string): Promise<PackageVersion | null> {
    const db = getDb();
    const [v] = await db
      .select()
      .from(packageVersions)
      .where(and(
        eq(packageVersions.packageId, packageId),
        eq(packageVersions.version, version)
      ))
      .limit(1);
    return v ?? null;
  },

  /**
   * Get the latest version of a package
   */
  async getLatest(packageId: string): Promise<PackageVersion | null> {
    const db = getDb();
    
    // First try to get the version tagged as "latest"
    const [taggedLatest] = await db
      .select({
        version: packageVersions,
      })
      .from(packageDistTags)
      .innerJoin(packageVersions, eq(packageDistTags.versionId, packageVersions.id))
      .where(and(
        eq(packageDistTags.packageId, packageId),
        eq(packageDistTags.tag, 'latest')
      ))
      .limit(1);

    if (taggedLatest) {
      return taggedLatest.version;
    }

    // Fall back to most recently published
    const [latest] = await db
      .select()
      .from(packageVersions)
      .where(eq(packageVersions.packageId, packageId))
      .orderBy(desc(packageVersions.publishedAt))
      .limit(1);

    return latest ?? null;
  },

  /**
   * List all versions of a package
   */
  async listByPackage(packageId: string): Promise<PackageVersion[]> {
    const db = getDb();
    return db
      .select()
      .from(packageVersions)
      .where(eq(packageVersions.packageId, packageId))
      .orderBy(desc(packageVersions.publishedAt));
  },

  /**
   * Increment download count for a version
   */
  async incrementDownloads(id: string): Promise<void> {
    const db = getDb();
    await db
      .update(packageVersions)
      .set({
        downloadCount: sql`${packageVersions.downloadCount} + 1`,
      })
      .where(eq(packageVersions.id, id));
  },

  /**
   * Deprecate a version
   */
  async deprecate(id: string, message: string): Promise<PackageVersion | null> {
    const db = getDb();
    const [version] = await db
      .update(packageVersions)
      .set({ deprecated: message })
      .where(eq(packageVersions.id, id))
      .returning();
    return version ?? null;
  },

  /**
   * Delete a version
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.delete(packageVersions).where(eq(packageVersions.id, id)).returning();
    return result.length > 0;
  },

  /**
   * Check if a version exists
   */
  async exists(packageId: string, version: string): Promise<boolean> {
    const v = await this.getByVersion(packageId, version);
    return v !== null;
  },
};

/**
 * Dist-tag model - manage package tags like "latest", "beta", etc.
 */
export const distTagModel = {
  /**
   * Set a dist-tag (create or update)
   */
  async set(packageId: string, tag: string, versionId: string): Promise<PackageDistTag> {
    const db = getDb();
    
    // Upsert the tag
    const [distTag] = await db
      .insert(packageDistTags)
      .values({ packageId, tag, versionId })
      .onConflictDoUpdate({
        target: [packageDistTags.packageId, packageDistTags.tag],
        set: { versionId, updatedAt: new Date() },
      })
      .returning();

    return distTag;
  },

  /**
   * Get a dist-tag
   */
  async get(packageId: string, tag: string): Promise<PackageDistTag | null> {
    const db = getDb();
    const [distTag] = await db
      .select()
      .from(packageDistTags)
      .where(and(
        eq(packageDistTags.packageId, packageId),
        eq(packageDistTags.tag, tag)
      ))
      .limit(1);
    return distTag ?? null;
  },

  /**
   * Get version for a dist-tag
   */
  async getVersion(packageId: string, tag: string): Promise<PackageVersion | null> {
    const db = getDb();
    const [result] = await db
      .select({ version: packageVersions })
      .from(packageDistTags)
      .innerJoin(packageVersions, eq(packageDistTags.versionId, packageVersions.id))
      .where(and(
        eq(packageDistTags.packageId, packageId),
        eq(packageDistTags.tag, tag)
      ))
      .limit(1);
    return result?.version ?? null;
  },

  /**
   * List all dist-tags for a package
   */
  async list(packageId: string): Promise<{ tag: string; version: string }[]> {
    const db = getDb();
    const tags = await db
      .select({
        tag: packageDistTags.tag,
        version: packageVersions.version,
      })
      .from(packageDistTags)
      .innerJoin(packageVersions, eq(packageDistTags.versionId, packageVersions.id))
      .where(eq(packageDistTags.packageId, packageId));
    return tags;
  },

  /**
   * Delete a dist-tag
   */
  async delete(packageId: string, tag: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(packageDistTags)
      .where(and(
        eq(packageDistTags.packageId, packageId),
        eq(packageDistTags.tag, tag)
      ))
      .returning();
    return result.length > 0;
  },
};

/**
 * Maintainer model - manage package maintainers
 */
export const maintainerModel = {
  /**
   * Add a maintainer
   */
  async add(packageId: string, userId: string, addedBy?: string): Promise<PackageMaintainer> {
    const db = getDb();
    const [maintainer] = await db
      .insert(packageMaintainers)
      .values({ packageId, userId, addedBy })
      .onConflictDoNothing()
      .returning();
    return maintainer;
  },

  /**
   * Remove a maintainer
   */
  async remove(packageId: string, userId: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(packageMaintainers)
      .where(and(
        eq(packageMaintainers.packageId, packageId),
        eq(packageMaintainers.userId, userId)
      ))
      .returning();
    return result.length > 0;
  },

  /**
   * List all maintainers for a package
   */
  async list(packageId: string): Promise<PackageMaintainer[]> {
    const db = getDb();
    return db
      .select()
      .from(packageMaintainers)
      .where(eq(packageMaintainers.packageId, packageId));
  },

  /**
   * Check if a user is a maintainer
   */
  async isMaintainer(packageId: string, userId: string): Promise<boolean> {
    const db = getDb();
    const [maintainer] = await db
      .select()
      .from(packageMaintainers)
      .where(and(
        eq(packageMaintainers.packageId, packageId),
        eq(packageMaintainers.userId, userId)
      ))
      .limit(1);
    return maintainer !== undefined;
  },

  /**
   * Check if user can publish (is maintainer or owner)
   */
  async canPublish(packageId: string, userId: string): Promise<boolean> {
    const db = getDb();
    
    // Check if user is owner
    const [pkg] = await db
      .select()
      .from(packages)
      .where(and(
        eq(packages.id, packageId),
        eq(packages.ownerId, userId)
      ))
      .limit(1);
    
    if (pkg) return true;

    // Check if user is maintainer
    return this.isMaintainer(packageId, userId);
  },
};

/**
 * Helper to generate npm-compatible package metadata
 */
export async function generatePackageMetadata(
  pkg: Package,
  versions: PackageVersion[],
  distTags: { tag: string; version: string }[]
): Promise<Record<string, unknown>> {
  const fullName = getFullPackageName(pkg.scope, pkg.name);
  
  // Build versions object
  const versionsObj: Record<string, unknown> = {};
  for (const v of versions) {
    const manifest = JSON.parse(v.manifest);
    versionsObj[v.version] = {
      ...manifest,
      name: fullName,
      version: v.version,
      dist: {
        tarball: v.tarballUrl,
        shasum: v.tarballSha512, // npm uses shasum, we store sha512
        integrity: `sha512-${v.tarballSha512}`,
      },
      _id: `${fullName}@${v.version}`,
      _npmVersion: '10.0.0', // Compatibility
      deprecated: v.deprecated,
    };
  }

  // Build dist-tags object
  const distTagsObj: Record<string, string> = {};
  for (const dt of distTags) {
    distTagsObj[dt.tag] = dt.version;
  }

  // Build time object
  const time: Record<string, string> = {
    created: pkg.createdAt.toISOString(),
    modified: pkg.updatedAt.toISOString(),
  };
  for (const v of versions) {
    time[v.version] = v.publishedAt.toISOString();
  }

  return {
    _id: fullName,
    _rev: `1-${pkg.id}`, // Fake revision for npm compatibility
    name: fullName,
    description: pkg.description,
    'dist-tags': distTagsObj,
    versions: versionsObj,
    time,
    maintainers: [], // TODO: Populate from maintainerModel
    readme: pkg.readme || '',
    readmeFilename: 'README.md',
    homepage: pkg.homepage,
    keywords: pkg.keywords ? JSON.parse(pkg.keywords) : [],
    repository: pkg.repositoryUrl ? { type: 'git', url: pkg.repositoryUrl } : undefined,
    license: pkg.license,
  };
}
