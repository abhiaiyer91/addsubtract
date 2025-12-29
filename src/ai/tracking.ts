/**
 * AI Action Tracking
 * 
 * Utilities for tracking AI actions with attribution.
 * Used by agents to record their actions for provenance tracking.
 */

import type { AiActionType } from '../db/ai-collaboration-schema';

// Track the current session context
let currentSessionId: string | null = null;
let currentAgentType: string = 'code';
let trackingEnabled: boolean = false;

// In-memory action log for CLI mode (when DB not available)
interface ActionLogEntry {
  id: string;
  sessionId: string | null;
  actionType: AiActionType;
  inputPrompt?: string;
  outputResult?: unknown;
  confidenceScore?: number;
  filePath?: string;
  commitSha?: string;
  createdAt: Date;
}

const inMemoryLog: ActionLogEntry[] = [];

/**
 * Initialize tracking for an AI session
 */
export function initTracking(options: {
  sessionId?: string;
  agentType?: string;
  enabled?: boolean;
}) {
  currentSessionId = options.sessionId || null;
  currentAgentType = options.agentType || 'code';
  trackingEnabled = options.enabled ?? true;
}

/**
 * Get the current session ID
 */
export function getCurrentSessionId(): string | null {
  return currentSessionId;
}

/**
 * Get the current agent type
 */
export function getCurrentAgentType(): string {
  return currentAgentType;
}

/**
 * Track an AI action
 */
export async function trackAction(action: {
  actionType: AiActionType;
  inputPrompt?: string;
  outputResult?: unknown;
  confidenceScore?: number;
  filePath?: string;
  commitSha?: string;
  prId?: string;
  promptTokens?: number;
  completionTokens?: number;
}): Promise<string | null> {
  if (!trackingEnabled) {
    return null;
  }

  const entry: ActionLogEntry = {
    id: crypto.randomUUID(),
    sessionId: currentSessionId,
    actionType: action.actionType,
    inputPrompt: action.inputPrompt,
    outputResult: action.outputResult,
    confidenceScore: action.confidenceScore,
    filePath: action.filePath,
    commitSha: action.commitSha,
    createdAt: new Date(),
  };

  // Always log to in-memory store
  inMemoryLog.push(entry);
  
  // Limit in-memory log size
  if (inMemoryLog.length > 1000) {
    inMemoryLog.shift();
  }

  // Try to persist to database if available
  try {
    if (currentSessionId) {
      const { aiActionModel } = await import('../db/models/ai-collaboration');
      await aiActionModel.create({
        sessionId: currentSessionId,
        actionType: action.actionType,
        inputPrompt: action.inputPrompt,
        outputResult: action.outputResult,
        confidenceScore: action.confidenceScore,
        filePath: action.filePath,
        commitSha: action.commitSha,
        prId: action.prId,
        promptTokens: action.promptTokens,
        completionTokens: action.completionTokens,
      });
    }
  } catch {
    // Database not available (CLI mode) - that's okay, we have in-memory log
  }

  return entry.id;
}

/**
 * Track a commit made by AI with full attribution
 */
export async function trackCommitAttribution(options: {
  repoId: string;
  commitSha: string;
  inputPrompt?: string;
  confidenceScore?: number;
  authorizedByUserId?: string;
}): Promise<void> {
  try {
    const { commitAiAttributionModel } = await import('../db/models/ai-collaboration');
    await commitAiAttributionModel.create({
      repoId: options.repoId,
      commitSha: options.commitSha,
      aiSessionId: currentSessionId,
      inputPrompt: options.inputPrompt,
      confidenceScore: options.confidenceScore,
      agentType: currentAgentType,
      authorizedByUserId: options.authorizedByUserId,
    });
  } catch {
    // Database not available - skip persistent tracking
  }
}

/**
 * Get the in-memory action log (for debugging/CLI)
 */
export function getActionLog(): ActionLogEntry[] {
  return [...inMemoryLog];
}

/**
 * Clear the in-memory action log
 */
export function clearActionLog(): void {
  inMemoryLog.length = 0;
}

/**
 * Get action statistics
 */
export function getActionStats(): {
  total: number;
  byType: Record<string, number>;
  lastAction: ActionLogEntry | null;
} {
  const byType: Record<string, number> = {};
  
  for (const entry of inMemoryLog) {
    byType[entry.actionType] = (byType[entry.actionType] || 0) + 1;
  }

  return {
    total: inMemoryLog.length,
    byType,
    lastAction: inMemoryLog[inMemoryLog.length - 1] || null,
  };
}

/**
 * Format commit message with AI attribution
 * This helps with later detection of AI commits
 */
export function formatAiCommitMessage(
  message: string,
  options: {
    agentType?: string;
    includeTag?: boolean;
  } = {}
): string {
  const agentType = options.agentType || currentAgentType;
  const includeTag = options.includeTag ?? true;
  
  if (includeTag) {
    // Add agent tag to commit message for easy detection
    return `${message}\n\n[agent:${agentType}]`;
  }
  
  return message;
}

/**
 * Create author object for AI commits
 * Used to ensure consistent AI author info across all agents
 */
export function getAiAuthor(): {
  name: string;
  email: string;
  timestamp: number;
  timezone: string;
} {
  return {
    name: 'wit AI',
    email: 'ai@wit.dev',
    timestamp: Math.floor(Date.now() / 1000),
    timezone: '+0000',
  };
}
