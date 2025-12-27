/**
 * SSH Keys tRPC Router
 *
 * Provides API endpoints for SSH key management.
 * Users can add, list, and remove their SSH public keys
 * for authentication when pushing/pulling over SSH.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { sshKeyModel } from '../../../db/models';
import { SSHKeyManager } from '../../../server/ssh/keys';

/**
 * Maximum number of SSH keys per user
 */
const MAX_KEYS_PER_USER = 50;

/**
 * Valid SSH key types (for reference - validation is done by SSHKeyManager)
 */
export const VALID_KEY_TYPES = [
  'ssh-rsa',
  'ssh-ed25519',
  'ecdsa-sha2-nistp256',
  'ecdsa-sha2-nistp384',
  'ecdsa-sha2-nistp521',
] as const;

export type SSHKeyType = (typeof VALID_KEY_TYPES)[number];

export const sshKeysRouter = router({
  /**
   * List all SSH keys for the authenticated user
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const keys = await sshKeyModel.findByUserId(ctx.user.id);

    // Return keys without full public key content for security
    return keys.map((key) => ({
      id: key.id,
      title: key.title,
      fingerprint: key.fingerprint,
      keyType: key.keyType,
      // Show first 20 and last 20 chars of public key
      publicKeyPreview: truncateKey(key.publicKey),
      lastUsedAt: key.lastUsedAt,
      createdAt: key.createdAt,
    }));
  }),

  /**
   * Get a specific SSH key by ID
   */
  get: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid SSH key ID'),
      })
    )
    .query(async ({ input, ctx }) => {
      const key = await sshKeyModel.findById(input.id);

      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'SSH key not found',
        });
      }

      // Verify ownership
      if (key.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this SSH key',
        });
      }

      return {
        id: key.id,
        title: key.title,
        fingerprint: key.fingerprint,
        keyType: key.keyType,
        publicKey: key.publicKey,
        lastUsedAt: key.lastUsedAt,
        createdAt: key.createdAt,
      };
    }),

  /**
   * Add a new SSH key
   */
  add: protectedProcedure
    .input(
      z.object({
        title: z
          .string()
          .min(1, 'Title is required')
          .max(100, 'Title must be 100 characters or less'),
        publicKey: z
          .string()
          .min(1, 'Public key is required')
          .max(10000, 'Public key is too long'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check key limit
      const keyCount = await sshKeyModel.countByUserId(ctx.user.id);
      if (keyCount >= MAX_KEYS_PER_USER) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Maximum of ${MAX_KEYS_PER_USER} SSH keys allowed per user`,
        });
      }

      // Parse and validate the SSH key
      let parsed: {
        type: string;
        data: Buffer;
        comment?: string;
        fingerprint: string;
      };

      try {
        parsed = SSHKeyManager.parsePublicKey(input.publicKey);
      } catch (err) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid SSH key: ${(err as Error).message}`,
        });
      }

      // Check for duplicate fingerprint
      const existing = await sshKeyModel.findByFingerprint(parsed.fingerprint);
      if (existing) {
        if (existing.userId === ctx.user.id) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'This SSH key has already been added to your account',
          });
        } else {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'This SSH key is already in use by another account',
          });
        }
      }

      // Create the key
      const key = await sshKeyModel.create({
        userId: ctx.user.id,
        title: input.title,
        publicKey: input.publicKey.trim(),
        fingerprint: parsed.fingerprint,
        keyType: parsed.type,
      });

      return {
        id: key.id,
        title: key.title,
        fingerprint: key.fingerprint,
        keyType: key.keyType,
        publicKeyPreview: truncateKey(key.publicKey),
        createdAt: key.createdAt,
      };
    }),

  /**
   * Update an SSH key's title
   */
  updateTitle: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid SSH key ID'),
        title: z
          .string()
          .min(1, 'Title is required')
          .max(100, 'Title must be 100 characters or less'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify ownership
      const isOwner = await sshKeyModel.isOwnedByUser(input.id, ctx.user.id);
      if (!isOwner) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'SSH key not found',
        });
      }

      const key = await sshKeyModel.updateTitle(input.id, input.title);
      if (!key) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'SSH key not found',
        });
      }

      return {
        id: key.id,
        title: key.title,
        fingerprint: key.fingerprint,
        keyType: key.keyType,
        publicKeyPreview: truncateKey(key.publicKey),
        lastUsedAt: key.lastUsedAt,
        createdAt: key.createdAt,
      };
    }),

  /**
   * Delete an SSH key
   */
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid SSH key ID'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Verify ownership
      const isOwner = await sshKeyModel.isOwnedByUser(input.id, ctx.user.id);
      if (!isOwner) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'SSH key not found',
        });
      }

      const deleted = await sshKeyModel.delete(input.id);
      return { success: deleted };
    }),

  /**
   * Verify an SSH key by checking its fingerprint
   * This can be used to check if a key is valid and what user it belongs to
   * (Used internally by SSH server, but exposed for testing)
   */
  verify: protectedProcedure
    .input(
      z.object({
        fingerprint: z.string().min(1, 'Fingerprint is required'),
      })
    )
    .query(async ({ input }) => {
      const key = await sshKeyModel.findByFingerprint(input.fingerprint);

      if (!key) {
        return { valid: false, userId: null };
      }

      return {
        valid: true,
        userId: key.userId,
        keyId: key.id,
        keyType: key.keyType,
      };
    }),
});

/**
 * Truncate a public key for display
 * Shows key type + first 12 chars of data + ... + last 12 chars
 */
function truncateKey(publicKey: string): string {
  const parts = publicKey.trim().split(/\s+/);
  if (parts.length < 2) return publicKey;

  const keyType = parts[0];
  const keyData = parts[1];
  const comment = parts.length > 2 ? parts.slice(2).join(' ') : '';

  if (keyData.length <= 30) {
    return publicKey;
  }

  const truncatedData = `${keyData.substring(0, 12)}...${keyData.substring(keyData.length - 12)}`;
  return comment
    ? `${keyType} ${truncatedData} ${comment}`
    : `${keyType} ${truncatedData}`;
}
