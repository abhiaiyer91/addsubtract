import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { releaseModel, releaseAssetModel } from '../../../db/models/releases';
import { generateReleaseNotesTool } from '../../../ai/tools/generate-release-notes.js';

/**
 * Input validation schemas
 */
const createReleaseSchema = z.object({
  repoId: z.string().uuid(),
  tagName: z.string().min(1).max(255),
  name: z.string().min(1).max(255),
  body: z.string().optional(),
  isDraft: z.boolean().default(false),
  isPrerelease: z.boolean().default(false),
});

const updateReleaseSchema = z.object({
  id: z.string().uuid(),
  tagName: z.string().min(1).max(255).optional(),
  name: z.string().min(1).max(255).optional(),
  body: z.string().optional(),
  isDraft: z.boolean().optional(),
  isPrerelease: z.boolean().optional(),
});

const createAssetSchema = z.object({
  releaseId: z.string().uuid(),
  name: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  size: z.number().int().positive(),
  downloadUrl: z.string().url(),
});

const listReleasesSchema = z.object({
  repoId: z.string().uuid(),
  includeDrafts: z.boolean().default(false),
  includePrereleases: z.boolean().default(true),
  limit: z.number().int().min(1).max(100).default(30),
  offset: z.number().int().min(0).default(0),
});

/**
 * Releases tRPC router
 */
export const releasesRouter = router({
  /**
   * Create a new release
   */
  create: protectedProcedure
    .input(createReleaseSchema)
    .mutation(async ({ input, ctx }) => {
      const release = await releaseModel.create({
        ...input,
        authorId: ctx.user.id,
        publishedAt: input.isDraft ? null : new Date(),
      });
      return release;
    }),

  /**
   * Get a release by ID
   */
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const release = await releaseModel.getByIdWithAssets(input.id);
      if (!release) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Release not found',
        });
      }
      return release;
    }),

  /**
   * Get a release by tag name
   */
  getByTag: publicProcedure
    .input(z.object({ repoId: z.string().uuid(), tagName: z.string() }))
    .query(async ({ input }) => {
      const release = await releaseModel.getByTag(input.repoId, input.tagName);
      if (!release) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Release not found',
        });
      }
      return release;
    }),

  /**
   * Get the latest release for a repository
   */
  getLatest: publicProcedure
    .input(z.object({ repoId: z.string().uuid(), includePrerelease: z.boolean().default(false) }))
    .query(async ({ input }) => {
      const release = input.includePrerelease
        ? await releaseModel.getLatestIncludingPrerelease(input.repoId)
        : await releaseModel.getLatest(input.repoId);

      if (!release) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No releases found for this repository',
        });
      }
      return release;
    }),

  /**
   * List releases for a repository
   */
  list: publicProcedure
    .input(listReleasesSchema)
    .query(async ({ input }) => {
      const { repoId, ...options } = input;
      const releases = await releaseModel.listByRepoWithAssets(repoId, options);
      const total = await releaseModel.countByRepo(repoId, options.includeDrafts);
      return {
        releases,
        total,
        hasMore: options.offset + releases.length < total,
      };
    }),

  /**
   * Update a release
   */
  update: protectedProcedure
    .input(updateReleaseSchema)
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const release = await releaseModel.update(id, data);
      if (!release) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Release not found',
        });
      }
      return release;
    }),

  /**
   * Publish a draft release
   */
  publish: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const existing = await releaseModel.getById(input.id);
      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Release not found',
        });
      }
      if (!existing.isDraft) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Release is already published',
        });
      }
      const release = await releaseModel.publish(input.id);
      return release;
    }),

  /**
   * Delete a release
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const deleted = await releaseModel.delete(input.id);
      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Release not found',
        });
      }
      return { success: true };
    }),

  /**
   * Generate AI release notes from commits
   * 
   * This endpoint generates release notes using AI based on commit history.
   * It categorizes changes into features, fixes, improvements, etc.
   */
  generateNotes: protectedProcedure
    .input(z.object({
      version: z.string().min(1).max(255).describe('The version/tag being released'),
      previousVersion: z.string().optional().describe('Previous version for comparison'),
      commits: z.array(z.object({
        sha: z.string(),
        shortSha: z.string(),
        message: z.string(),
        author: z.string(),
        email: z.string(),
        date: z.string(),
      })).describe('Array of commits to generate notes from'),
      filesSummary: z.object({
        totalFiles: z.number(),
        additions: z.number(),
        deletions: z.number(),
        files: z.array(z.object({
          path: z.string(),
          additions: z.number(),
          deletions: z.number(),
        })).optional(),
      }).optional().describe('File change statistics'),
      repoUrl: z.string().optional().describe('Repository URL for generating links'),
      style: z.enum(['standard', 'detailed', 'minimal', 'changelog']).default('standard'),
      includeStats: z.boolean().default(true),
      includeContributors: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      try {
        const result = await generateReleaseNotesTool.execute({
          version: input.version,
          previousVersion: input.previousVersion,
          commits: input.commits,
          filesSummary: input.filesSummary,
          repoUrl: input.repoUrl,
          style: input.style,
          includeStats: input.includeStats,
          includeContributors: input.includeContributors,
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Failed to generate release notes',
        });
      }
    }),

  /**
   * Asset operations
   */
  assets: router({
    /**
     * Add an asset to a release
     */
    create: protectedProcedure
      .input(createAssetSchema)
      .mutation(async ({ input }) => {
        // Verify release exists
        const release = await releaseModel.getById(input.releaseId);
        if (!release) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Release not found',
          });
        }

        // Check for duplicate asset name
        const existing = await releaseAssetModel.getByName(input.releaseId, input.name);
        if (existing) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'An asset with this name already exists',
          });
        }

        const asset = await releaseAssetModel.create(input);
        return asset;
      }),

    /**
     * Get an asset by ID
     */
    getById: publicProcedure
      .input(z.object({ id: z.string().uuid() }))
      .query(async ({ input }) => {
        const asset = await releaseAssetModel.getById(input.id);
        if (!asset) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Asset not found',
          });
        }
        return asset;
      }),

    /**
     * List assets for a release
     */
    list: publicProcedure
      .input(z.object({ releaseId: z.string().uuid() }))
      .query(async ({ input }) => {
        return releaseAssetModel.listByRelease(input.releaseId);
      }),

    /**
     * Update an asset
     */
    update: protectedProcedure
      .input(
        z.object({
          id: z.string().uuid(),
          name: z.string().min(1).max(255).optional(),
          contentType: z.string().min(1).max(255).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { id, ...data } = input;
        const asset = await releaseAssetModel.update(id, data);
        if (!asset) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Asset not found',
          });
        }
        return asset;
      }),

    /**
     * Record a download (increments download count)
     */
    recordDownload: publicProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input }) => {
        const asset = await releaseAssetModel.incrementDownloadCount(input.id);
        if (!asset) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Asset not found',
          });
        }
        return asset;
      }),

    /**
     * Delete an asset
     */
    delete: protectedProcedure
      .input(z.object({ id: z.string().uuid() }))
      .mutation(async ({ input }) => {
        const deleted = await releaseAssetModel.delete(input.id);
        if (!deleted) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Asset not found',
          });
        }
        return { success: true };
      }),

    /**
     * Get total downloads for a release
     */
    getTotalDownloads: publicProcedure
      .input(z.object({ releaseId: z.string().uuid() }))
      .query(async ({ input }) => {
        const total = await releaseAssetModel.getTotalDownloads(input.releaseId);
        return { total };
      }),
  }),
});

export type ReleasesRouter = typeof releasesRouter;
