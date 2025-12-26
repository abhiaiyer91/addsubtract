/**
 * Webhooks tRPC Router
 * Provides API endpoints for webhook management
 */

import { z } from 'zod';
import { webhooks } from '../../../db/models';
import { validateWebhookEvents, VALID_WEBHOOK_EVENTS } from '../../../db/schema';
import {
  Context,
  getRepoPermission,
  hasPermission,
  Permission,
} from '../context';

/**
 * Error classes for webhook operations
 */
export class WebhookError extends Error {
  constructor(
    message: string,
    public code: string
  ) {
    super(message);
    this.name = 'WebhookError';
  }
}

export class UnauthorizedError extends WebhookError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends WebhookError {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN');
  }
}

export class NotFoundError extends WebhookError {
  constructor(message = 'Not found') {
    super(message, 'NOT_FOUND');
  }
}

export class ValidationError extends WebhookError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
  }
}

/**
 * Check if user is authenticated
 */
function assertAuthenticated(ctx: Context): asserts ctx is Context & { user: NonNullable<Context['user']> } {
  if (!ctx.user) {
    throw new UnauthorizedError('Authentication required');
  }
}

/**
 * Check user has required permission for a repository
 */
async function assertRepoPermission(
  ctx: Context,
  repoId: string,
  required: Permission
): Promise<void> {
  assertAuthenticated(ctx);
  const permission = await getRepoPermission(ctx.user.id, repoId);
  if (!hasPermission(permission, required)) {
    throw new ForbiddenError(
      `${required} permission required for this repository`
    );
  }
}

/**
 * Input validation schemas
 */
const listInputSchema = z.object({
  repoId: z.string().min(1, 'Repository ID is required'),
});

const getInputSchema = z.object({
  id: z.string().min(1, 'Webhook ID is required'),
  repoId: z.string().min(1, 'Repository ID is required'),
});

const createInputSchema = z.object({
  repoId: z.string().min(1, 'Repository ID is required'),
  url: z.string().url('Invalid webhook URL'),
  secret: z.string().optional(),
  events: z.array(z.string()).min(1, 'At least one event is required'),
});

const updateInputSchema = z.object({
  id: z.string().min(1, 'Webhook ID is required'),
  repoId: z.string().min(1, 'Repository ID is required'),
  url: z.string().url('Invalid webhook URL').optional(),
  secret: z.string().nullable().optional(),
  events: z.array(z.string()).min(1, 'At least one event is required').optional(),
  isActive: z.boolean().optional(),
});

const deleteInputSchema = z.object({
  id: z.string().min(1, 'Webhook ID is required'),
  repoId: z.string().min(1, 'Repository ID is required'),
});

const testInputSchema = z.object({
  id: z.string().min(1, 'Webhook ID is required'),
  repoId: z.string().min(1, 'Repository ID is required'),
});

/**
 * Webhook router procedures
 */
export const webhooksRouter = {
  /**
   * List all webhooks for a repository
   * Requires: write permission
   */
  list: async (ctx: Context, input: z.infer<typeof listInputSchema>) => {
    const validated = listInputSchema.parse(input);
    await assertRepoPermission(ctx, validated.repoId, 'write');

    const result = await webhooks.listByRepo(validated.repoId);
    // Hide secrets in response
    return result.map((webhook) => ({
      ...webhook,
      secret: webhook.secret ? '********' : null,
    }));
  },

  /**
   * Get a webhook by ID
   * Requires: write permission
   */
  get: async (ctx: Context, input: z.infer<typeof getInputSchema>) => {
    const validated = getInputSchema.parse(input);
    await assertRepoPermission(ctx, validated.repoId, 'write');

    const webhook = await webhooks.findById(validated.id);
    if (!webhook) {
      throw new NotFoundError('Webhook not found');
    }

    // Verify webhook belongs to the specified repo
    if (webhook.repoId !== validated.repoId) {
      throw new NotFoundError('Webhook not found');
    }

    // Hide secret in response
    return {
      ...webhook,
      secret: webhook.secret ? '********' : null,
    };
  },

  /**
   * Create a new webhook
   * Requires: admin permission
   */
  create: async (ctx: Context, input: z.infer<typeof createInputSchema>) => {
    const validated = createInputSchema.parse(input);
    await assertRepoPermission(ctx, validated.repoId, 'admin');

    // Validate events
    if (!validateWebhookEvents(validated.events)) {
      throw new ValidationError(
        `Invalid events. Valid events are: ${VALID_WEBHOOK_EVENTS.join(', ')}`
      );
    }

    const webhook = await webhooks.create({
      repoId: validated.repoId,
      url: validated.url,
      secret: validated.secret,
      events: validated.events,
    });

    // Hide secret in response
    return {
      ...webhook,
      secret: webhook.secret ? '********' : null,
    };
  },

  /**
   * Update an existing webhook
   * Requires: admin permission
   */
  update: async (ctx: Context, input: z.infer<typeof updateInputSchema>) => {
    const validated = updateInputSchema.parse(input);
    await assertRepoPermission(ctx, validated.repoId, 'admin');

    // Check webhook exists and belongs to repo
    const existing = await webhooks.findById(validated.id);
    if (!existing || existing.repoId !== validated.repoId) {
      throw new NotFoundError('Webhook not found');
    }

    // Validate events if provided
    if (validated.events && !validateWebhookEvents(validated.events)) {
      throw new ValidationError(
        `Invalid events. Valid events are: ${VALID_WEBHOOK_EVENTS.join(', ')}`
      );
    }

    const webhook = await webhooks.update(validated.id, {
      url: validated.url,
      secret: validated.secret,
      events: validated.events,
      isActive: validated.isActive,
    });

    if (!webhook) {
      throw new NotFoundError('Webhook not found');
    }

    // Hide secret in response
    return {
      ...webhook,
      secret: webhook.secret ? '********' : null,
    };
  },

  /**
   * Delete a webhook
   * Requires: admin permission
   */
  delete: async (ctx: Context, input: z.infer<typeof deleteInputSchema>) => {
    const validated = deleteInputSchema.parse(input);
    await assertRepoPermission(ctx, validated.repoId, 'admin');

    // Check webhook exists and belongs to repo
    const existing = await webhooks.findById(validated.id);
    if (!existing || existing.repoId !== validated.repoId) {
      throw new NotFoundError('Webhook not found');
    }

    const deleted = await webhooks.remove(validated.id);
    return { success: deleted };
  },

  /**
   * Test a webhook by sending a ping event
   * Requires: admin permission
   */
  test: async (ctx: Context, input: z.infer<typeof testInputSchema>) => {
    const validated = testInputSchema.parse(input);
    await assertRepoPermission(ctx, validated.repoId, 'admin');

    // Get the webhook
    const webhook = await webhooks.findById(validated.id);
    if (!webhook || webhook.repoId !== validated.repoId) {
      throw new NotFoundError('Webhook not found');
    }

    if (!webhook.isActive) {
      throw new ValidationError('Cannot test inactive webhook');
    }

    // Prepare ping payload
    const payload = {
      event: 'ping',
      webhook_id: webhook.id,
      repository: {
        id: webhook.repoId,
      },
      timestamp: new Date().toISOString(),
    };

    // Prepare headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': 'ping',
      'X-Webhook-Delivery': generateDeliveryId(),
    };

    // Add signature if secret is configured
    if (webhook.secret) {
      const signature = await computeSignature(
        JSON.stringify(payload),
        webhook.secret
      );
      headers['X-Webhook-Signature'] = signature;
      headers['X-Webhook-Signature-256'] = `sha256=${signature}`;
    }

    // Send the webhook request
    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      return {
        success: response.ok,
        statusCode: response.status,
        message: response.ok
          ? 'Webhook test successful'
          : `Webhook test failed with status ${response.status}`,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        statusCode: null,
        message: `Webhook test failed: ${message}`,
      };
    }
  },
};

/**
 * Generate a unique delivery ID
 */
function generateDeliveryId(): string {
  const { randomBytes } = require('crypto');
  return randomBytes(16).toString('hex');
}

/**
 * Compute HMAC-SHA256 signature for webhook payload
 */
async function computeSignature(payload: string, secret: string): Promise<string> {
  const { createHmac } = require('crypto');
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Export input schemas for external use
 */
export const webhooksSchemas = {
  list: listInputSchema,
  get: getInputSchema,
  create: createInputSchema,
  update: updateInputSchema,
  delete: deleteInputSchema,
  test: testInputSchema,
};
