/**
 * Webhooks data model
 * Provides CRUD operations for webhook management
 */

import { randomBytes } from 'crypto';
import { Webhook } from '../schema';

// In-memory storage for webhooks (in production, this would be a database)
const webhooksStore = new Map<string, Webhook>();

/**
 * Generate a unique ID for a webhook
 */
function generateId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Find a webhook by its ID
 */
export async function findById(id: string): Promise<Webhook | null> {
  return webhooksStore.get(id) ?? null;
}

/**
 * List all webhooks for a repository
 */
export async function listByRepo(repoId: string): Promise<Webhook[]> {
  const webhooks: Webhook[] = [];
  for (const webhook of webhooksStore.values()) {
    if (webhook.repoId === repoId) {
      webhooks.push(webhook);
    }
  }
  return webhooks;
}

/**
 * Create a new webhook
 */
export async function create(data: {
  repoId: string;
  url: string;
  secret?: string;
  events: string[];
}): Promise<Webhook> {
  const now = new Date();
  const webhook: Webhook = {
    id: generateId(),
    repoId: data.repoId,
    url: data.url,
    secret: data.secret ?? null,
    events: data.events,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  webhooksStore.set(webhook.id, webhook);
  return webhook;
}

/**
 * Update an existing webhook
 */
export async function update(
  id: string,
  data: {
    url?: string;
    secret?: string | null;
    events?: string[];
    isActive?: boolean;
  }
): Promise<Webhook | null> {
  const existing = webhooksStore.get(id);
  if (!existing) {
    return null;
  }

  const updated: Webhook = {
    ...existing,
    url: data.url ?? existing.url,
    secret: data.secret !== undefined ? data.secret : existing.secret,
    events: data.events ?? existing.events,
    isActive: data.isActive ?? existing.isActive,
    updatedAt: new Date(),
  };

  webhooksStore.set(id, updated);
  return updated;
}

/**
 * Delete a webhook by ID
 */
export async function deleteWebhook(id: string): Promise<boolean> {
  return webhooksStore.delete(id);
}

// Re-export as 'delete' using an object (since 'delete' is a reserved word)
export { deleteWebhook as remove };

/**
 * Clear all webhooks (useful for testing)
 */
export async function clear(): Promise<void> {
  webhooksStore.clear();
}

/**
 * Get the count of webhooks for a repository
 */
export async function countByRepo(repoId: string): Promise<number> {
  let count = 0;
  for (const webhook of webhooksStore.values()) {
    if (webhook.repoId === repoId) {
      count++;
    }
  }
  return count;
}
