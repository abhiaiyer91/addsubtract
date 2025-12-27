/**
 * Webhooks tRPC Router
 * Provides API endpoints for webhook management
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import {
  webhookModel,
  webhookDelivery,
  collaboratorModel,
  repoModel,
  type WebhookEvent,
} from '../../../db/models';

/**
 * Valid webhook events
 */
const VALID_WEBHOOK_EVENTS: WebhookEvent[] = [
  'push',
  'pull_request',
  'pull_request_review',
  'issue',
  'issue_comment',
  'create',
  'delete',
  'fork',
  'star',
];

/**
 * Validate events array
 */
function validateEvents(events: string[]): events is WebhookEvent[] {
  return events.every((event) =>
    VALID_WEBHOOK_EVENTS.includes(event as WebhookEvent)
  );
}

/**
 * Check if user has required permission on a repository
 */
async function assertRepoPermission(
  userId: string,
  repoId: string,
  requiredPermission: 'read' | 'write' | 'admin'
): Promise<void> {
  // First check if repo exists
  const repo = await repoModel.findById(repoId);
  if (!repo) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Repository not found',
    });
  }

  // Check if user is the owner
  if (repo.ownerId === userId) {
    return; // Owner has all permissions
  }

  // Check collaborator permission
  const hasPermission = await collaboratorModel.hasPermission(
    repoId,
    userId,
    requiredPermission
  );

  if (!hasPermission) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `${requiredPermission} permission required for this repository`,
    });
  }
}

export const webhooksRouter = router({
  /**
   * List all webhooks for a repository
   * Requires: write permission
   */
  list: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid('Invalid repository ID'),
      })
    )
    .query(async ({ input, ctx }) => {
      await assertRepoPermission(ctx.user.id, input.repoId, 'write');

      const webhooks = await webhookModel.listByRepo(input.repoId);

      // Hide secrets in response
      return webhooks.map((webhook) => ({
        ...webhook,
        secret: webhook.secret ? '********' : null,
      }));
    }),

  /**
   * Get a webhook by ID
   * Requires: write permission
   */
  get: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid webhook ID'),
        repoId: z.string().uuid('Invalid repository ID'),
      })
    )
    .query(async ({ input, ctx }) => {
      await assertRepoPermission(ctx.user.id, input.repoId, 'write');

      const webhook = await webhookModel.findById(input.id);

      if (!webhook) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Webhook not found',
        });
      }

      // Verify webhook belongs to the specified repo
      if (webhook.repoId !== input.repoId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Webhook not found',
        });
      }

      // Hide secret in response
      return {
        ...webhook,
        secret: webhook.secret ? '********' : null,
      };
    }),

  /**
   * Create a new webhook
   * Requires: admin permission
   */
  create: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid('Invalid repository ID'),
        url: z.string().url('Invalid webhook URL'),
        secret: z.string().optional(),
        events: z.array(z.string()).min(1, 'At least one event is required'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertRepoPermission(ctx.user.id, input.repoId, 'admin');

      // Validate events
      if (!validateEvents(input.events)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid events. Valid events are: ${VALID_WEBHOOK_EVENTS.join(', ')}`,
        });
      }

      const webhook = await webhookModel.create({
        repoId: input.repoId,
        url: input.url,
        secret: input.secret,
        events: input.events as WebhookEvent[],
      });

      // Hide secret in response
      return {
        ...webhook,
        secret: webhook.secret ? '********' : null,
      };
    }),

  /**
   * Update an existing webhook
   * Requires: admin permission
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid webhook ID'),
        repoId: z.string().uuid('Invalid repository ID'),
        url: z.string().url('Invalid webhook URL').optional(),
        secret: z.string().nullable().optional(),
        events: z
          .array(z.string())
          .min(1, 'At least one event is required')
          .optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertRepoPermission(ctx.user.id, input.repoId, 'admin');

      // Check webhook exists and belongs to repo
      const existing = await webhookModel.findById(input.id);
      if (!existing || existing.repoId !== input.repoId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Webhook not found',
        });
      }

      // Validate events if provided
      if (input.events && !validateEvents(input.events)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid events. Valid events are: ${VALID_WEBHOOK_EVENTS.join(', ')}`,
        });
      }

      const webhook = await webhookModel.update(input.id, {
        url: input.url,
        secret: input.secret === null ? null : input.secret,
        events: input.events as WebhookEvent[] | undefined,
        isActive: input.isActive,
      });

      if (!webhook) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Webhook not found',
        });
      }

      // Hide secret in response (only mask if secret exists)
      return {
        ...webhook,
        secret: webhook.secret ? '********' : null,
      };
    }),

  /**
   * Delete a webhook
   * Requires: admin permission
   */
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid webhook ID'),
        repoId: z.string().uuid('Invalid repository ID'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertRepoPermission(ctx.user.id, input.repoId, 'admin');

      // Check webhook exists and belongs to repo
      const existing = await webhookModel.findById(input.id);
      if (!existing || existing.repoId !== input.repoId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Webhook not found',
        });
      }

      const deleted = await webhookModel.delete(input.id);
      return { success: deleted };
    }),

  /**
   * Test a webhook by sending a ping event
   * Requires: admin permission
   */
  test: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid('Invalid webhook ID'),
        repoId: z.string().uuid('Invalid repository ID'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertRepoPermission(ctx.user.id, input.repoId, 'admin');

      // Get the webhook
      const webhook = await webhookModel.findById(input.id);
      if (!webhook || webhook.repoId !== input.repoId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Webhook not found',
        });
      }

      if (!webhook.isActive) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot test inactive webhook',
        });
      }

      // Send ping event
      const payload = {
        action: 'ping',
        webhook_id: webhook.id,
        repository: {
          id: webhook.repoId,
        },
        sender: {
          id: ctx.user.id,
          username: ctx.user.username,
        },
        timestamp: new Date().toISOString(),
      };

      const result = await webhookDelivery.deliver(webhook, 'push', payload);

      return {
        success: result.success,
        statusCode: result.statusCode ?? null,
        message: result.success
          ? 'Webhook test successful'
          : `Webhook test failed${result.error ? `: ${result.error}` : result.statusCode ? ` with status ${result.statusCode}` : ''}`,
      };
    }),
});
