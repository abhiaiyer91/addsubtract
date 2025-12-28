/**
 * Packages tRPC Router
 *
 * Provides type-safe API endpoints for the package registry web UI.
 * Used for browsing, managing, and publishing packages.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import {
  packageModel,
  packageVersionModel,
  distTagModel,
  maintainerModel,
  getFullPackageName,
  parsePackageName,
  generatePackageMetadata,
} from '../../../db/models/packages';
import { userModel } from '../../../db/models/user';

/**
 * Input validation schemas
 */
const packageNameSchema = z.object({
  scope: z.string().nullable(),
  name: z.string().min(1).max(214), // npm limit
});

const fullPackageNameSchema = z.object({
  fullName: z.string().min(1).max(214),
});

const createPackageSchema = z.object({
  name: z.string().min(1).max(214),
  scope: z.string().nullable().optional(),
  description: z.string().optional(),
  visibility: z.enum(['public', 'private']).default('public'),
  repoId: z.string().uuid().optional(),
  keywords: z.array(z.string()).optional(),
  license: z.string().optional(),
  homepage: z.string().url().optional(),
  repositoryUrl: z.string().optional(),
});

const updatePackageSchema = z.object({
  id: z.string().uuid(),
  description: z.string().optional(),
  visibility: z.enum(['public', 'private']).optional(),
  keywords: z.array(z.string()).optional(),
  license: z.string().optional(),
  homepage: z.string().url().optional().nullable(),
  repositoryUrl: z.string().optional().nullable(),
  readme: z.string().optional(),
});

const listPackagesSchema = z.object({
  ownerId: z.string().uuid().optional(),
  scope: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

const searchPackagesSchema = z.object({
  query: z.string().min(1).max(100),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

const setDistTagSchema = z.object({
  packageId: z.string().uuid(),
  tag: z.string().min(1).max(100),
  version: z.string().min(1),
});

const addMaintainerSchema = z.object({
  packageId: z.string().uuid(),
  username: z.string().min(1),
});

/**
 * Packages tRPC router
 */
export const packagesRouter = router({
  // ============ PACKAGE QUERIES ============

  /**
   * Get a package by ID
   */
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const pkg = await packageModel.getWithVersions(input.id);
      if (!pkg) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Package not found',
        });
      }
      return {
        ...pkg,
        fullName: getFullPackageName(pkg.scope, pkg.name),
      };
    }),

  /**
   * Get a package by name
   */
  getByName: publicProcedure
    .input(packageNameSchema)
    .query(async ({ input }) => {
      const pkg = await packageModel.getByName(input.scope, input.name);
      if (!pkg) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Package not found',
        });
      }

      const pkgWithVersions = await packageModel.getWithVersions(pkg.id);
      return {
        ...pkgWithVersions,
        fullName: getFullPackageName(input.scope, input.name),
      };
    }),

  /**
   * Get a package by full name (e.g., "@scope/name" or "name")
   */
  getByFullName: publicProcedure
    .input(fullPackageNameSchema)
    .query(async ({ input }) => {
      const { scope, name } = parsePackageName(input.fullName);
      const pkg = await packageModel.getByName(scope, name);
      if (!pkg) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Package not found',
        });
      }

      const pkgWithVersions = await packageModel.getWithVersions(pkg.id);
      return {
        ...pkgWithVersions,
        fullName: input.fullName,
      };
    }),

  /**
   * Get npm-compatible metadata for a package
   */
  getMetadata: publicProcedure
    .input(packageNameSchema)
    .query(async ({ input }) => {
      const pkg = await packageModel.getByName(input.scope, input.name);
      if (!pkg) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Package not found',
        });
      }

      const pkgWithVersions = await packageModel.getWithVersions(pkg.id);
      if (!pkgWithVersions) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Package not found',
        });
      }

      const distTags = pkgWithVersions.distTags.map((dt) => ({
        tag: dt.tag,
        version: dt.version,
      }));

      return generatePackageMetadata(pkgWithVersions, pkgWithVersions.versions, distTags);
    }),

  /**
   * List packages with filters
   */
  list: publicProcedure
    .input(listPackagesSchema)
    .query(async ({ input }) => {
      let packages;

      if (input.ownerId) {
        packages = await packageModel.listByOwner(input.ownerId, {
          limit: input.limit,
          offset: input.offset,
        });
      } else if (input.scope) {
        packages = await packageModel.listByScope(input.scope, {
          limit: input.limit,
          offset: input.offset,
        });
      } else {
        // Default: search for public packages
        packages = await packageModel.search('', {
          limit: input.limit,
          offset: input.offset,
        });
      }

      return packages.map((pkg) => ({
        ...pkg,
        fullName: getFullPackageName(pkg.scope, pkg.name),
      }));
    }),

  /**
   * Search packages
   */
  search: publicProcedure
    .input(searchPackagesSchema)
    .query(async ({ input }) => {
      const packages = await packageModel.search(input.query, {
        limit: input.limit,
        offset: input.offset,
      });

      return packages.map((pkg) => ({
        ...pkg,
        fullName: getFullPackageName(pkg.scope, pkg.name),
      }));
    }),

  /**
   * Get packages owned by the current user
   */
  myPackages: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const packages = await packageModel.listByOwner(ctx.user.id, {
        limit: input.limit,
        offset: input.offset,
      });

      return packages.map((pkg) => ({
        ...pkg,
        fullName: getFullPackageName(pkg.scope, pkg.name),
      }));
    }),

  // ============ VERSION QUERIES ============

  /**
   * Get a specific version
   */
  getVersion: publicProcedure
    .input(
      z.object({
        packageId: z.string().uuid(),
        version: z.string(),
      })
    )
    .query(async ({ input }) => {
      const version = await packageVersionModel.getByVersion(input.packageId, input.version);
      if (!version) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Version not found',
        });
      }
      return version;
    }),

  /**
   * List all versions of a package
   */
  listVersions: publicProcedure
    .input(z.object({ packageId: z.string().uuid() }))
    .query(async ({ input }) => {
      return packageVersionModel.listByPackage(input.packageId);
    }),

  /**
   * Get the latest version of a package
   */
  getLatestVersion: publicProcedure
    .input(z.object({ packageId: z.string().uuid() }))
    .query(async ({ input }) => {
      const version = await packageVersionModel.getLatest(input.packageId);
      if (!version) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No versions found',
        });
      }
      return version;
    }),

  // ============ PACKAGE MUTATIONS ============

  /**
   * Create a new package (reserves the name)
   */
  create: protectedProcedure.input(createPackageSchema).mutation(async ({ input, ctx }) => {
    // Check if package already exists
    const existing = await packageModel.getByName(input.scope ?? null, input.name);
    if (existing) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Package already exists',
      });
    }

    const pkg = await packageModel.create({
      name: input.name,
      scope: input.scope ?? null,
      ownerId: ctx.user.id,
      description: input.description,
      visibility: input.visibility,
      repoId: input.repoId,
      keywords: input.keywords ? JSON.stringify(input.keywords) : null,
      license: input.license,
      homepage: input.homepage,
      repositoryUrl: input.repositoryUrl,
    });

    // Add creator as maintainer
    await maintainerModel.add(pkg.id, ctx.user.id);

    return {
      ...pkg,
      fullName: getFullPackageName(pkg.scope, pkg.name),
    };
  }),

  /**
   * Update package metadata
   */
  update: protectedProcedure.input(updatePackageSchema).mutation(async ({ input, ctx }) => {
    const pkg = await packageModel.getById(input.id);
    if (!pkg) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Package not found',
      });
    }

    // Check if user can manage this package
    const canManage = await maintainerModel.canPublish(pkg.id, ctx.user.id);
    if (!canManage) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Not authorized to manage this package',
      });
    }

    const { id, keywords, ...updateData } = input;
    const updated = await packageModel.update(id, {
      ...updateData,
      keywords: keywords ? JSON.stringify(keywords) : undefined,
    });

    return updated;
  }),

  /**
   * Deprecate a package
   */
  deprecate: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        message: z.string().min(1).max(1000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pkg = await packageModel.getById(input.id);
      if (!pkg) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Package not found',
        });
      }

      const canManage = await maintainerModel.canPublish(pkg.id, ctx.user.id);
      if (!canManage) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Not authorized to manage this package',
        });
      }

      return packageModel.deprecate(input.id, input.message);
    }),

  /**
   * Undeprecate a package
   */
  undeprecate: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const pkg = await packageModel.getById(input.id);
      if (!pkg) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Package not found',
        });
      }

      const canManage = await maintainerModel.canPublish(pkg.id, ctx.user.id);
      if (!canManage) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Not authorized to manage this package',
        });
      }

      return packageModel.undeprecate(input.id);
    }),

  /**
   * Delete a package (owner only)
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const pkg = await packageModel.getById(input.id);
      if (!pkg) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Package not found',
        });
      }

      // Only owner can delete
      if (pkg.ownerId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only the owner can delete a package',
        });
      }

      await packageModel.delete(input.id);
      return { success: true };
    }),

  // ============ DIST-TAG MUTATIONS ============

  /**
   * Set a dist-tag
   */
  setDistTag: protectedProcedure.input(setDistTagSchema).mutation(async ({ input, ctx }) => {
    const pkg = await packageModel.getById(input.packageId);
    if (!pkg) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Package not found',
      });
    }

    const canManage = await maintainerModel.canPublish(pkg.id, ctx.user.id);
    if (!canManage) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Not authorized to manage this package',
      });
    }

    const version = await packageVersionModel.getByVersion(input.packageId, input.version);
    if (!version) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Version not found',
      });
    }

    return distTagModel.set(input.packageId, input.tag, version.id);
  }),

  /**
   * Delete a dist-tag
   */
  deleteDistTag: protectedProcedure
    .input(
      z.object({
        packageId: z.string().uuid(),
        tag: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (input.tag === 'latest') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot delete the latest tag',
        });
      }

      const pkg = await packageModel.getById(input.packageId);
      if (!pkg) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Package not found',
        });
      }

      const canManage = await maintainerModel.canPublish(pkg.id, ctx.user.id);
      if (!canManage) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Not authorized to manage this package',
        });
      }

      await distTagModel.delete(input.packageId, input.tag);
      return { success: true };
    }),

  /**
   * List dist-tags for a package
   */
  listDistTags: publicProcedure
    .input(z.object({ packageId: z.string().uuid() }))
    .query(async ({ input }) => {
      return distTagModel.list(input.packageId);
    }),

  // ============ MAINTAINER MUTATIONS ============

  /**
   * Add a maintainer
   */
  addMaintainer: protectedProcedure.input(addMaintainerSchema).mutation(async ({ input, ctx }) => {
    const pkg = await packageModel.getById(input.packageId);
    if (!pkg) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Package not found',
      });
    }

    // Only owner can add maintainers
    if (pkg.ownerId !== ctx.user.id) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only the owner can add maintainers',
      });
    }

    const user = await userModel.findByUsername(input.username);
    if (!user) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    await maintainerModel.add(input.packageId, user.id, ctx.user.id);
    return { success: true };
  }),

  /**
   * Remove a maintainer
   */
  removeMaintainer: protectedProcedure
    .input(
      z.object({
        packageId: z.string().uuid(),
        userId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pkg = await packageModel.getById(input.packageId);
      if (!pkg) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Package not found',
        });
      }

      // Only owner can remove maintainers
      if (pkg.ownerId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only the owner can remove maintainers',
        });
      }

      // Cannot remove the owner
      if (input.userId === pkg.ownerId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot remove the owner from maintainers',
        });
      }

      await maintainerModel.remove(input.packageId, input.userId);
      return { success: true };
    }),

  /**
   * List maintainers for a package
   */
  listMaintainers: publicProcedure
    .input(z.object({ packageId: z.string().uuid() }))
    .query(async ({ input }) => {
      const maintainers = await maintainerModel.list(input.packageId);
      
      // Fetch user info for each maintainer
      const maintainersWithUsers = await Promise.all(
        maintainers.map(async (m) => {
          const user = await userModel.findById(m.userId);
          return {
            ...m,
            username: user?.username,
            avatarUrl: user?.avatarUrl,
          };
        })
      );

      return maintainersWithUsers;
    }),

  /**
   * Check if current user can publish to a package
   */
  canPublish: protectedProcedure
    .input(z.object({ packageId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      return maintainerModel.canPublish(input.packageId, ctx.user.id);
    }),

  // ============ VERSION MUTATIONS ============

  /**
   * Deprecate a specific version
   */
  deprecateVersion: protectedProcedure
    .input(
      z.object({
        packageId: z.string().uuid(),
        version: z.string(),
        message: z.string().min(1).max(1000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const pkg = await packageModel.getById(input.packageId);
      if (!pkg) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Package not found',
        });
      }

      const canManage = await maintainerModel.canPublish(pkg.id, ctx.user.id);
      if (!canManage) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Not authorized to manage this package',
        });
      }

      const version = await packageVersionModel.getByVersion(input.packageId, input.version);
      if (!version) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Version not found',
        });
      }

      return packageVersionModel.deprecate(version.id, input.message);
    }),
});
