/**
 * Database schema definitions
 * Uses a simple in-memory/file-based storage approach for webhook management
 */

export interface Webhook {
  id: string;
  repoId: string;
  url: string;
  secret: string | null;
  events: string[]; // JSON array of event types (e.g., ['push', 'pull_request'])
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RepoCollaborator {
  id: string;
  repoId: string;
  userId: string;
  permission: 'read' | 'write' | 'admin';
  createdAt: Date;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  statusCode: number | null;
  response: string | null;
  deliveredAt: Date;
  success: boolean;
}

// Valid webhook events
export const VALID_WEBHOOK_EVENTS = [
  'push',
  'pull_request',
  'pull_request_review',
  'issues',
  'issue_comment',
  'create',
  'delete',
  'fork',
  'release',
  'star',
  'watch',
  'ping',
] as const;

export type WebhookEvent = (typeof VALID_WEBHOOK_EVENTS)[number];

// Type guard for webhook events
export function isValidWebhookEvent(event: string): event is WebhookEvent {
  return VALID_WEBHOOK_EVENTS.includes(event as WebhookEvent);
}

// Validate events array
export function validateWebhookEvents(events: unknown): events is string[] {
  if (!Array.isArray(events)) {
    return false;
  }
  return events.every(
    (event) => typeof event === 'string' && isValidWebhookEvent(event)
  );
}
