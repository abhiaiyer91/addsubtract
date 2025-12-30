/**
 * Event Bus
 * 
 * A simple in-process event bus for publishing and subscribing to events.
 * Events are processed asynchronously and handlers are called in parallel.
 */

import { randomUUID } from 'crypto';
import type { AppEvent, EventType } from './types';

type EventHandler<T extends AppEvent = AppEvent> = (event: T) => Promise<void>;

interface Subscription {
  id: string;
  eventType: EventType | '*';
  handler: EventHandler;
}

class EventBus {
  private subscriptions: Subscription[] = [];
  private eventLog: AppEvent[] = [];
  private maxLogSize = 1000;

  /**
   * Subscribe to a specific event type
   */
  on<T extends EventType>(
    eventType: T,
    handler: EventHandler<Extract<AppEvent, { type: T }>>
  ): string {
    const id = randomUUID();
    this.subscriptions.push({
      id,
      eventType,
      handler: handler as EventHandler,
    });
    return id;
  }

  /**
   * Subscribe to all events
   */
  onAll(handler: EventHandler): string {
    const id = randomUUID();
    this.subscriptions.push({
      id,
      eventType: '*',
      handler,
    });
    return id;
  }

  /**
   * Unsubscribe from events
   */
  off(subscriptionId: string): boolean {
    const index = this.subscriptions.findIndex((s) => s.id === subscriptionId);
    if (index !== -1) {
      this.subscriptions.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Publish an event
   */
  async emit<T extends EventType>(
    type: T,
    actorId: string,
    payload: Extract<AppEvent, { type: T }>['payload']
  ): Promise<void> {
    const event = {
      id: randomUUID(),
      type,
      timestamp: new Date(),
      actorId,
      payload,
    } as AppEvent;

    // Add to event log
    this.eventLog.push(event);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift();
    }

    // Find matching handlers
    const handlers = this.subscriptions.filter(
      (s) => s.eventType === '*' || s.eventType === type
    );

    // Execute handlers in parallel
    const results = await Promise.allSettled(
      handlers.map((s) => s.handler(event))
    );

    // Log any errors
    results.forEach((result) => {
      if (result.status === 'rejected') {
        console.error(
          `[EventBus] Handler error for ${type}:`,
          result.reason
        );
      }
    });
  }

  /**
   * Get recent events (for debugging)
   */
  getRecentEvents(limit = 100): AppEvent[] {
    return this.eventLog.slice(-limit);
  }

  /**
   * Clear all subscriptions (for testing)
   */
  clear(): void {
    this.subscriptions = [];
    this.eventLog = [];
  }
}

// Singleton instance
export const eventBus = new EventBus();

// Helper function to create an event with proper typing
export function createEvent<T extends EventType>(
  type: T,
  actorId: string,
  payload: Extract<AppEvent, { type: T }>['payload']
): Extract<AppEvent, { type: T }> {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date(),
    actorId,
    payload,
  } as Extract<AppEvent, { type: T }>;
}
