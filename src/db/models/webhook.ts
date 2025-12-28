import { eq, and } from 'drizzle-orm';
import { getDb } from '../index';
import {
  webhooks,
  type Webhook,
  type NewWebhook,
} from '../schema';

export type WebhookEvent =
  | 'push'
  | 'pull_request'
  | 'pull_request_review'
  | 'issue'
  | 'issue_comment'
  | 'create'
  | 'delete'
  | 'fork'
  | 'star';

export const webhookModel = {
  /**
   * Find a webhook by ID
   */
  async findById(id: string): Promise<Webhook | undefined> {
    const db = getDb();
    const [webhook] = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, id));
    if (!webhook) return undefined;
    return { ...webhook, events: this.parseEvents(webhook) as any };
  },

  /**
   * List webhooks for a repository
   */
  async listByRepo(repoId: string): Promise<Webhook[]> {
    const db = getDb();
    const results = await db.select().from(webhooks).where(eq(webhooks.repoId, repoId));
    return results.map(w => ({ ...w, events: this.parseEvents(w) as any }));
  },

  /**
   * List active webhooks for a repository
   */
  async listActiveByRepo(repoId: string): Promise<Webhook[]> {
    const db = getDb();
    return db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.repoId, repoId), eq(webhooks.isActive, true)));
  },

  /**
   * List webhooks that subscribe to a specific event
   */
  async listByEvent(
    repoId: string,
    event: WebhookEvent
  ): Promise<Webhook[]> {
    const allWebhooks = await this.listActiveByRepo(repoId);
    return allWebhooks.filter((w) => {
      const events = this.parseEvents(w);
      // Check for the specific event or wildcard '*'
      return events.includes(event) || (events as string[]).includes('*');
    });
  },

  /**
   * Create a webhook
   */
  async create(data: {
    repoId: string;
    url: string;
    secret?: string;
    events: WebhookEvent[];
    isActive?: boolean;
  }): Promise<Webhook> {
    const db = getDb();
    const [webhook] = await db
      .insert(webhooks)
      .values({
        repoId: data.repoId,
        url: data.url,
        secret: data.secret,
        events: JSON.stringify(data.events),
        isActive: data.isActive ?? true,
      })
      .returning();
    return { ...webhook, events: data.events as any };
  },

  /**
   * Update a webhook
   */
  async update(
    id: string,
    data: {
      url?: string;
      secret?: string | null;
      events?: WebhookEvent[];
      isActive?: boolean;
    }
  ): Promise<Webhook | undefined> {
    const db = getDb();
    
    const updateData: Partial<NewWebhook> = {
      updatedAt: new Date(),
    };

    if (data.url !== undefined) updateData.url = data.url;
    if (data.secret !== undefined) updateData.secret = data.secret === null ? null : data.secret;
    if (data.events !== undefined) updateData.events = JSON.stringify(data.events);
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    const [webhook] = await db
      .update(webhooks)
      .set(updateData)
      .where(eq(webhooks.id, id))
      .returning();
    if (!webhook) return undefined;
    return { ...webhook, events: this.parseEvents(webhook) as any };
  },

  /**
   * Delete a webhook
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(webhooks)
      .where(eq(webhooks.id, id))
      .returning();
    return result.length > 0;
  },

  /**
   * Enable a webhook
   */
  async enable(id: string): Promise<Webhook | undefined> {
    return this.update(id, { isActive: true });
  },

  /**
   * Disable a webhook
   */
  async disable(id: string): Promise<Webhook | undefined> {
    return this.update(id, { isActive: false });
  },

  /**
   * Parse webhook events from JSON string
   */
  parseEvents(webhook: Webhook): WebhookEvent[] {
    try {
      return JSON.parse(webhook.events) as WebhookEvent[];
    } catch {
      return [];
    }
  },

  /**
   * Check if webhook subscribes to an event
   */
  hasEvent(webhook: Webhook, event: WebhookEvent): boolean {
    const events = this.parseEvents(webhook);
    // Check for the specific event or wildcard '*'
    return events.includes(event) || (events as string[]).includes('*');
  },
};

/**
 * Webhook delivery helper
 */
export const webhookDelivery = {
  /**
   * Generate HMAC signature for webhook payload
   */
  async generateSignature(
    payload: string,
    secret: string
  ): Promise<string> {
    const crypto = await import('crypto');
    return `sha256=${crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')}`;
  },

  /**
   * Verify HMAC signature
   */
  async verifySignature(
    payload: string,
    signature: string,
    secret: string
  ): Promise<boolean> {
    const expectedSignature = await this.generateSignature(payload, secret);
    const crypto = await import('crypto');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  },

  /**
   * Deliver a webhook
   */
  async deliver(
    webhook: Webhook,
    event: WebhookEvent,
    payload: Record<string, unknown>
  ): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const body = JSON.stringify(payload);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Wit-Event': event,
      'X-Wit-Delivery': crypto.randomUUID(),
    };

    if (webhook.secret) {
      headers['X-Wit-Signature-256'] = await this.generateSignature(
        body,
        webhook.secret
      );
    }

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body,
      });

      return {
        success: response.ok,
        statusCode: response.status,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
};
