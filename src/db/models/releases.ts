import { eq, desc, and, sql } from 'drizzle-orm';
import { getDb } from '../index';
import {
  releases,
  releaseAssets,
  type Release,
  type NewRelease,
  type ReleaseAsset,
  type NewReleaseAsset,
} from '../schema';

/**
 * Release model - CRUD operations for releases
 */
export const releaseModel = {
  /**
   * Create a new release
   */
  async create(data: NewRelease): Promise<Release> {
    const db = getDb();
    const [release] = await db.insert(releases).values(data).returning();
    return release;
  },

  /**
   * Get a release by ID
   */
  async getById(id: string): Promise<Release | null> {
    const db = getDb();
    const [release] = await db
      .select()
      .from(releases)
      .where(eq(releases.id, id))
      .limit(1);
    return release ?? null;
  },

  /**
   * Get a release by ID with assets
   */
  async getByIdWithAssets(id: string): Promise<(Release & { assets: ReleaseAsset[] }) | null> {
    const db = getDb();
    const release = await this.getById(id);
    if (!release) return null;
    
    const assets = await db
      .select()
      .from(releaseAssets)
      .where(eq(releaseAssets.releaseId, id));
    
    return { ...release, assets };
  },

  /**
   * Get a release by tag name and repo
   */
  async getByTag(repoId: string, tagName: string): Promise<Release | null> {
    const db = getDb();
    const [release] = await db
      .select()
      .from(releases)
      .where(and(eq(releases.repoId, repoId), eq(releases.tagName, tagName)))
      .limit(1);
    return release ?? null;
  },

  /**
   * Get the latest release for a repository (non-draft, non-prerelease)
   */
  async getLatest(repoId: string): Promise<Release | null> {
    const db = getDb();
    const [release] = await db
      .select()
      .from(releases)
      .where(
        and(
          eq(releases.repoId, repoId),
          eq(releases.isDraft, false),
          eq(releases.isPrerelease, false)
        )
      )
      .orderBy(desc(releases.publishedAt))
      .limit(1);
    return release ?? null;
  },

  /**
   * Get the latest release for a repository including prereleases
   */
  async getLatestIncludingPrerelease(repoId: string): Promise<Release | null> {
    const db = getDb();
    const [release] = await db
      .select()
      .from(releases)
      .where(and(eq(releases.repoId, repoId), eq(releases.isDraft, false)))
      .orderBy(desc(releases.publishedAt))
      .limit(1);
    return release ?? null;
  },

  /**
   * List all releases for a repository
   */
  async listByRepo(
    repoId: string,
    options: {
      includeDrafts?: boolean;
      includePrereleases?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Release[]> {
    const db = getDb();
    const { includeDrafts = false, includePrereleases = true, limit = 30, offset = 0 } = options;

    const conditions = [eq(releases.repoId, repoId)];

    if (!includeDrafts) {
      conditions.push(eq(releases.isDraft, false));
    }

    if (!includePrereleases) {
      conditions.push(eq(releases.isPrerelease, false));
    }

    return db
      .select()
      .from(releases)
      .where(and(...conditions))
      .orderBy(desc(releases.createdAt))
      .limit(limit)
      .offset(offset);
  },

  /**
   * List releases with assets
   */
  async listByRepoWithAssets(
    repoId: string,
    options: {
      includeDrafts?: boolean;
      includePrereleases?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<(Release & { assets: ReleaseAsset[] })[]> {
    const db = getDb();
    const { includeDrafts = false, includePrereleases = true, limit = 30, offset = 0 } = options;

    const conditions = [eq(releases.repoId, repoId)];

    if (!includeDrafts) {
      conditions.push(eq(releases.isDraft, false));
    }

    if (!includePrereleases) {
      conditions.push(eq(releases.isPrerelease, false));
    }

    const releasesList = await db
      .select()
      .from(releases)
      .where(and(...conditions))
      .orderBy(desc(releases.createdAt))
      .limit(limit)
      .offset(offset);

    // Fetch assets for each release
    const releasesWithAssets = await Promise.all(
      releasesList.map(async (release) => {
        const assets = await db
          .select()
          .from(releaseAssets)
          .where(eq(releaseAssets.releaseId, release.id));
        return { ...release, assets };
      })
    );

    return releasesWithAssets;
  },

  /**
   * Update a release
   */
  async update(
    id: string,
    data: Partial<Omit<NewRelease, 'id' | 'createdAt'>>
  ): Promise<Release | null> {
    const db = getDb();
    const [release] = await db
      .update(releases)
      .set(data)
      .where(eq(releases.id, id))
      .returning();
    return release ?? null;
  },

  /**
   * Publish a draft release
   */
  async publish(id: string): Promise<Release | null> {
    const db = getDb();
    const [release] = await db
      .update(releases)
      .set({
        isDraft: false,
        publishedAt: new Date(),
      })
      .where(eq(releases.id, id))
      .returning();
    return release ?? null;
  },

  /**
   * Delete a release
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.delete(releases).where(eq(releases.id, id)).returning();
    return result.length > 0;
  },

  /**
   * Count releases for a repository
   */
  async countByRepo(repoId: string, includeDrafts = false): Promise<number> {
    const db = getDb();
    const conditions = [eq(releases.repoId, repoId)];
    if (!includeDrafts) {
      conditions.push(eq(releases.isDraft, false));
    }

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(releases)
      .where(and(...conditions));
    return Number(result?.count ?? 0);
  },
};

/**
 * Release asset model - CRUD operations for release assets
 */
export const releaseAssetModel = {
  /**
   * Create a new asset
   */
  async create(data: NewReleaseAsset): Promise<ReleaseAsset> {
    const db = getDb();
    const [asset] = await db.insert(releaseAssets).values(data).returning();
    return asset;
  },

  /**
   * Create multiple assets
   */
  async createMany(data: NewReleaseAsset[]): Promise<ReleaseAsset[]> {
    const db = getDb();
    if (data.length === 0) return [];
    return db.insert(releaseAssets).values(data).returning();
  },

  /**
   * Get an asset by ID
   */
  async getById(id: string): Promise<ReleaseAsset | null> {
    const db = getDb();
    const [asset] = await db
      .select()
      .from(releaseAssets)
      .where(eq(releaseAssets.id, id))
      .limit(1);
    return asset ?? null;
  },

  /**
   * Get an asset by name within a release
   */
  async getByName(releaseId: string, name: string): Promise<ReleaseAsset | null> {
    const db = getDb();
    const [asset] = await db
      .select()
      .from(releaseAssets)
      .where(and(eq(releaseAssets.releaseId, releaseId), eq(releaseAssets.name, name)))
      .limit(1);
    return asset ?? null;
  },

  /**
   * List all assets for a release
   */
  async listByRelease(releaseId: string): Promise<ReleaseAsset[]> {
    const db = getDb();
    return db
      .select()
      .from(releaseAssets)
      .where(eq(releaseAssets.releaseId, releaseId))
      .orderBy(releaseAssets.name);
  },

  /**
   * Update an asset
   */
  async update(
    id: string,
    data: Partial<Omit<NewReleaseAsset, 'id' | 'releaseId' | 'createdAt'>>
  ): Promise<ReleaseAsset | null> {
    const db = getDb();
    const [asset] = await db
      .update(releaseAssets)
      .set(data)
      .where(eq(releaseAssets.id, id))
      .returning();
    return asset ?? null;
  },

  /**
   * Increment download count
   */
  async incrementDownloadCount(id: string): Promise<ReleaseAsset | null> {
    const db = getDb();
    const [asset] = await db
      .update(releaseAssets)
      .set({
        downloadCount: sql`${releaseAssets.downloadCount} + 1`,
      })
      .where(eq(releaseAssets.id, id))
      .returning();
    return asset ?? null;
  },

  /**
   * Delete an asset
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.delete(releaseAssets).where(eq(releaseAssets.id, id)).returning();
    return result.length > 0;
  },

  /**
   * Delete all assets for a release
   */
  async deleteByRelease(releaseId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .delete(releaseAssets)
      .where(eq(releaseAssets.releaseId, releaseId))
      .returning();
    return result.length;
  },

  /**
   * Get total download count for a release
   */
  async getTotalDownloads(releaseId: string): Promise<number> {
    const db = getDb();
    const [result] = await db
      .select({ total: sql<number>`COALESCE(SUM(${releaseAssets.downloadCount}), 0)` })
      .from(releaseAssets)
      .where(eq(releaseAssets.releaseId, releaseId));
    return Number(result?.total ?? 0);
  },
};
