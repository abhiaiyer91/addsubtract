/**
 * Sandbox Model
 *
 * Handles storage and retrieval of sandbox configuration per repository.
 * Includes encrypted API keys for sandbox providers (E2B, Daytona).
 * Only repository owners can manage these settings.
 */

import { eq, and, desc } from 'drizzle-orm';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { getDb } from '../index';
import {
  repoSandboxConfig,
  repoSandboxKeys,
  sandboxSessions,
  repositories,
} from '../schema';

// Types inferred from schema
export type SandboxProvider = 'e2b' | 'daytona' | 'docker' | 'vercel';
export type SandboxNetworkMode = 'none' | 'restricted' | 'full';

export interface SandboxConfig {
  id: string;
  repoId: string;
  enabled: boolean;
  provider: SandboxProvider;
  networkMode: SandboxNetworkMode;
  defaultLanguage: string;
  memoryMB: number;
  cpuCores: number;
  timeoutMinutes: number;
  e2bTemplateId: string | null;
  daytonaSnapshot: string | null;
  daytonaAutoStop: number;
  dockerImage: string;
  vercelProjectId: string | null;
  vercelTeamId: string | null;
  vercelRuntime: string | null;
  updatedById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SandboxKeyInfo {
  id: string;
  provider: SandboxProvider;
  keyHint: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SandboxSession {
  id: string;
  repoId: string;
  userId: string;
  provider: SandboxProvider;
  providerId: string;
  branch: string | null;
  state: string;
  metadata: string | null;
  startedAt: Date;
  endedAt: Date | null;
  exitCode: number | null;
}

// Encryption configuration (same as repo-ai-keys)
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

/**
 * Get encryption key from environment
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET;

  if (!secret) {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      throw new Error('ENCRYPTION_KEY or BETTER_AUTH_SECRET is required in production');
    }
    console.warn('WARNING: Using default encryption key. Set ENCRYPTION_KEY in production.');
    return scryptSync('dev-only-insecure-key', 'wit-sandbox-keys-salt', KEY_LENGTH);
  }

  return scryptSync(secret, 'wit-sandbox-keys-salt', KEY_LENGTH);
}

/**
 * Encrypt an API key for storage
 */
function encryptApiKey(plainKey: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encryptedData (all hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an API key from storage
 */
function decryptApiKey(encryptedData: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Get key hint for display
 */
function getKeyHint(apiKey: string): string {
  if (apiKey.length > 12) {
    return `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`;
  }
  return '****';
}

/**
 * Default sandbox configuration
 */
export function getDefaultConfig(repoId: string, userId: string): Omit<SandboxConfig, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    repoId,
    enabled: false,
    provider: 'e2b',
    networkMode: 'none',
    defaultLanguage: 'typescript',
    memoryMB: 2048,
    cpuCores: 1,
    timeoutMinutes: 60,
    e2bTemplateId: null,
    daytonaSnapshot: null,
    daytonaAutoStop: 15,
    dockerImage: 'wit-sandbox:latest',
    vercelProjectId: null,
    vercelTeamId: null,
    vercelRuntime: 'node22',
    updatedById: userId,
  };
}

export const sandboxConfigModel = {
  /**
   * Get sandbox configuration for a repository
   */
  async getConfig(repoId: string): Promise<SandboxConfig | null> {
    const db = getDb();

    const [config] = await db
      .select()
      .from(repoSandboxConfig)
      .where(eq(repoSandboxConfig.repoId, repoId))
      .limit(1);

    if (!config) {
      return null;
    }

    return {
      id: config.id,
      repoId: config.repoId,
      enabled: config.enabled,
      provider: config.provider,
      networkMode: config.networkMode,
      defaultLanguage: config.defaultLanguage,
      memoryMB: config.memoryMB,
      cpuCores: config.cpuCores,
      timeoutMinutes: config.timeoutMinutes,
      e2bTemplateId: config.e2bTemplateId,
      daytonaSnapshot: config.daytonaSnapshot,
      daytonaAutoStop: config.daytonaAutoStop,
      dockerImage: config.dockerImage,
      vercelProjectId: config.vercelProjectId,
      vercelTeamId: config.vercelTeamId,
      vercelRuntime: config.vercelRuntime,
      updatedById: config.updatedById,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  },

  /**
   * Create or update sandbox configuration
   */
  async upsertConfig(
    repoId: string,
    userId: string,
    settings: Partial<Omit<SandboxConfig, 'id' | 'repoId' | 'createdAt' | 'updatedAt' | 'updatedById'>>
  ): Promise<SandboxConfig> {
    const db = getDb();

    // Check if config exists
    const existing = await this.getConfig(repoId);

    if (existing) {
      // Update existing config
      const [updated] = await db
        .update(repoSandboxConfig)
        .set({
          ...settings,
          updatedById: userId,
          updatedAt: new Date(),
        })
        .where(eq(repoSandboxConfig.repoId, repoId))
        .returning();

      return {
        id: updated.id,
        repoId: updated.repoId,
        enabled: updated.enabled,
        provider: updated.provider,
        networkMode: updated.networkMode,
        defaultLanguage: updated.defaultLanguage,
        memoryMB: updated.memoryMB,
        cpuCores: updated.cpuCores,
        timeoutMinutes: updated.timeoutMinutes,
        e2bTemplateId: updated.e2bTemplateId,
        daytonaSnapshot: updated.daytonaSnapshot,
        daytonaAutoStop: updated.daytonaAutoStop,
        dockerImage: updated.dockerImage,
        vercelProjectId: updated.vercelProjectId,
        vercelTeamId: updated.vercelTeamId,
        vercelRuntime: updated.vercelRuntime,
        updatedById: updated.updatedById,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    }

    // Create new config with defaults
    const defaults = getDefaultConfig(repoId, userId);
    const [created] = await db
      .insert(repoSandboxConfig)
      .values({
        ...defaults,
        ...settings,
        updatedById: userId,
      })
      .returning();

    return {
      id: created.id,
      repoId: created.repoId,
      enabled: created.enabled,
      provider: created.provider,
      networkMode: created.networkMode,
      defaultLanguage: created.defaultLanguage,
      memoryMB: created.memoryMB,
      cpuCores: created.cpuCores,
      timeoutMinutes: created.timeoutMinutes,
      e2bTemplateId: created.e2bTemplateId,
      daytonaSnapshot: created.daytonaSnapshot,
      daytonaAutoStop: created.daytonaAutoStop,
      dockerImage: created.dockerImage,
      vercelProjectId: created.vercelProjectId,
      vercelTeamId: created.vercelTeamId,
      vercelRuntime: created.vercelRuntime,
      updatedById: created.updatedById,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  },

  /**
   * Enable or disable sandbox for a repository
   */
  async setEnabled(repoId: string, userId: string, enabled: boolean): Promise<SandboxConfig> {
    return this.upsertConfig(repoId, userId, { enabled });
  },

  /**
   * Delete sandbox configuration
   */
  async deleteConfig(repoId: string): Promise<boolean> {
    const db = getDb();

    const result = await db
      .delete(repoSandboxConfig)
      .where(eq(repoSandboxConfig.repoId, repoId))
      .returning();

    return result.length > 0;
  },

  /**
   * Check if sandbox is configured and ready for a repository
   */
  async getStatus(repoId: string): Promise<{
    configured: boolean;
    enabled: boolean;
    provider: SandboxProvider | null;
    hasApiKey: boolean;
    ready: boolean;
    dockerAvailable?: boolean;
    vercelOidcAvailable?: boolean;
  }> {
    const config = await this.getConfig(repoId);

    if (!config) {
      return {
        configured: false,
        enabled: false,
        provider: null,
        hasApiKey: false,
        ready: false,
      };
    }

    // Docker doesn't need an API key but needs Docker to be available
    let hasApiKey = config.provider === 'docker';
    let dockerAvailable: boolean | undefined;
    let vercelOidcAvailable: boolean | undefined;
    
    if (config.provider === 'docker') {
      // Check if Docker is available
      try {
        const { execSync } = await import('child_process');
        execSync('docker version', { stdio: 'ignore', timeout: 5000 });
        dockerAvailable = true;
      } catch {
        dockerAvailable = false;
      }
    }

    // Vercel can use OIDC tokens (auto-managed by Vercel) or access tokens
    if (config.provider === 'vercel') {
      // Check if we have environment variables for OIDC or access token
      const hasVercelEnv = !!(
        process.env.VERCEL_PROJECT_ID &&
        (process.env.VERCEL_TOKEN || process.env.VERCEL_OIDC_TOKEN)
      );
      if (hasVercelEnv) {
        hasApiKey = true;
        vercelOidcAvailable = !!process.env.VERCEL_OIDC_TOKEN;
      }
    }
    
    if (!hasApiKey) {
      hasApiKey = await sandboxKeyModel.hasKey(repoId, config.provider);
    }

    // For Docker, also require Docker to be available
    const isReady = config.enabled && hasApiKey && (config.provider !== 'docker' || dockerAvailable === true);

    return {
      configured: true,
      enabled: config.enabled,
      provider: config.provider,
      hasApiKey,
      ready: isReady,
      dockerAvailable,
      vercelOidcAvailable,
    };
  },
};

export const sandboxKeyModel = {
  /**
   * Set a sandbox provider API key
   */
  async setKey(
    repoId: string,
    provider: SandboxProvider,
    apiKey: string,
    userId: string
  ): Promise<SandboxKeyInfo> {
    const db = getDb();

    const encryptedKey = encryptApiKey(apiKey);
    const keyHint = getKeyHint(apiKey);

    // Check if key already exists
    const existing = await db
      .select()
      .from(repoSandboxKeys)
      .where(
        and(
          eq(repoSandboxKeys.repoId, repoId),
          eq(repoSandboxKeys.provider, provider)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      // Update existing key
      const [updated] = await db
        .update(repoSandboxKeys)
        .set({
          encryptedKey,
          keyHint,
          updatedAt: new Date(),
        })
        .where(eq(repoSandboxKeys.id, existing[0].id))
        .returning();

      return {
        id: updated.id,
        provider: updated.provider,
        keyHint: updated.keyHint,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    }

    // Create new key
    const [created] = await db
      .insert(repoSandboxKeys)
      .values({
        repoId,
        provider,
        encryptedKey,
        keyHint,
        createdById: userId,
      })
      .returning();

    return {
      id: created.id,
      provider: created.provider,
      keyHint: created.keyHint,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  },

  /**
   * Get all sandbox keys for a repository (metadata only)
   */
  async listKeys(repoId: string): Promise<SandboxKeyInfo[]> {
    const db = getDb();

    const keys = await db
      .select({
        id: repoSandboxKeys.id,
        provider: repoSandboxKeys.provider,
        keyHint: repoSandboxKeys.keyHint,
        createdAt: repoSandboxKeys.createdAt,
        updatedAt: repoSandboxKeys.updatedAt,
      })
      .from(repoSandboxKeys)
      .where(eq(repoSandboxKeys.repoId, repoId));

    return keys;
  },

  /**
   * Get decrypted API key for a provider
   */
  async getDecryptedKey(repoId: string, provider: SandboxProvider): Promise<string | null> {
    const db = getDb();

    const [key] = await db
      .select()
      .from(repoSandboxKeys)
      .where(
        and(
          eq(repoSandboxKeys.repoId, repoId),
          eq(repoSandboxKeys.provider, provider)
        )
      )
      .limit(1);

    if (!key) {
      return null;
    }

    try {
      return decryptApiKey(key.encryptedKey);
    } catch (error) {
      console.error(`Failed to decrypt sandbox key for repo ${repoId}, provider ${provider}:`, error);
      return null;
    }
  },

  /**
   * Check if a key exists for a provider
   */
  async hasKey(repoId: string, provider: SandboxProvider): Promise<boolean> {
    const db = getDb();

    const [key] = await db
      .select({ id: repoSandboxKeys.id })
      .from(repoSandboxKeys)
      .where(
        and(
          eq(repoSandboxKeys.repoId, repoId),
          eq(repoSandboxKeys.provider, provider)
        )
      )
      .limit(1);

    return !!key;
  },

  /**
   * Delete a sandbox API key
   */
  async deleteKey(repoId: string, provider: SandboxProvider): Promise<boolean> {
    const db = getDb();

    const result = await db
      .delete(repoSandboxKeys)
      .where(
        and(
          eq(repoSandboxKeys.repoId, repoId),
          eq(repoSandboxKeys.provider, provider)
        )
      )
      .returning();

    return result.length > 0;
  },

  /**
   * Delete all sandbox keys for a repository
   */
  async deleteAllKeys(repoId: string): Promise<number> {
    const db = getDb();

    const result = await db
      .delete(repoSandboxKeys)
      .where(eq(repoSandboxKeys.repoId, repoId))
      .returning();

    return result.length;
  },
};

export const sandboxSessionModel = {
  /**
   * Create a new sandbox session
   */
  async createSession(data: {
    repoId: string;
    userId: string;
    provider: SandboxProvider;
    providerId: string;
    branch?: string;
    metadata?: Record<string, unknown>;
  }): Promise<SandboxSession> {
    const db = getDb();

    const [session] = await db
      .insert(sandboxSessions)
      .values({
        repoId: data.repoId,
        userId: data.userId,
        provider: data.provider,
        providerId: data.providerId,
        branch: data.branch ?? null,
        state: 'running',
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      })
      .returning();

    return {
      id: session.id,
      repoId: session.repoId,
      userId: session.userId,
      provider: session.provider,
      providerId: session.providerId,
      branch: session.branch,
      state: session.state,
      metadata: session.metadata,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      exitCode: session.exitCode,
    };
  },

  /**
   * End a sandbox session
   */
  async endSession(sessionId: string, exitCode?: number): Promise<SandboxSession | null> {
    const db = getDb();

    const [updated] = await db
      .update(sandboxSessions)
      .set({
        state: exitCode === 0 ? 'completed' : 'failed',
        endedAt: new Date(),
        exitCode: exitCode ?? null,
      })
      .where(eq(sandboxSessions.id, sessionId))
      .returning();

    if (!updated) {
      return null;
    }

    return {
      id: updated.id,
      repoId: updated.repoId,
      userId: updated.userId,
      provider: updated.provider,
      providerId: updated.providerId,
      branch: updated.branch,
      state: updated.state,
      metadata: updated.metadata,
      startedAt: updated.startedAt,
      endedAt: updated.endedAt,
      exitCode: updated.exitCode,
    };
  },

  /**
   * Get a session by ID
   */
  async getSession(sessionId: string): Promise<SandboxSession | null> {
    const db = getDb();

    const [session] = await db
      .select()
      .from(sandboxSessions)
      .where(eq(sandboxSessions.id, sessionId))
      .limit(1);

    if (!session) {
      return null;
    }

    return {
      id: session.id,
      repoId: session.repoId,
      userId: session.userId,
      provider: session.provider,
      providerId: session.providerId,
      branch: session.branch,
      state: session.state,
      metadata: session.metadata,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      exitCode: session.exitCode,
    };
  },

  /**
   * Get active sessions for a repository
   */
  async getActiveSessions(repoId: string): Promise<SandboxSession[]> {
    const db = getDb();

    const sessions = await db
      .select()
      .from(sandboxSessions)
      .where(
        and(
          eq(sandboxSessions.repoId, repoId),
          eq(sandboxSessions.state, 'running')
        )
      )
      .orderBy(desc(sandboxSessions.startedAt));

    return sessions.map((s) => ({
      id: s.id,
      repoId: s.repoId,
      userId: s.userId,
      provider: s.provider,
      providerId: s.providerId,
      branch: s.branch,
      state: s.state,
      metadata: s.metadata,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      exitCode: s.exitCode,
    }));
  },

  /**
   * Get session history for a repository
   */
  async getSessionHistory(
    repoId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<SandboxSession[]> {
    const db = getDb();
    const { limit = 50, offset = 0 } = options;

    const sessions = await db
      .select()
      .from(sandboxSessions)
      .where(eq(sandboxSessions.repoId, repoId))
      .orderBy(desc(sandboxSessions.startedAt))
      .limit(limit)
      .offset(offset);

    return sessions.map((s) => ({
      id: s.id,
      repoId: s.repoId,
      userId: s.userId,
      provider: s.provider,
      providerId: s.providerId,
      branch: s.branch,
      state: s.state,
      metadata: s.metadata,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      exitCode: s.exitCode,
    }));
  },

  /**
   * Get active sessions for a user
   */
  async getUserActiveSessions(userId: string): Promise<SandboxSession[]> {
    const db = getDb();

    const sessions = await db
      .select()
      .from(sandboxSessions)
      .where(
        and(
          eq(sandboxSessions.userId, userId),
          eq(sandboxSessions.state, 'running')
        )
      )
      .orderBy(desc(sandboxSessions.startedAt));

    return sessions.map((s) => ({
      id: s.id,
      repoId: s.repoId,
      userId: s.userId,
      provider: s.provider,
      providerId: s.providerId,
      branch: s.branch,
      state: s.state,
      metadata: s.metadata,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      exitCode: s.exitCode,
    }));
  },

  /**
   * Cleanup stale sessions (running for too long)
   */
  async cleanupStaleSessions(maxAgeMinutes: number = 120): Promise<number> {
    const db = getDb();
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000);

    // This would need a more complex query with drizzle
    // For now, we'll do a simple approach
    const staleSessions = await db
      .select({ id: sandboxSessions.id })
      .from(sandboxSessions)
      .where(eq(sandboxSessions.state, 'running'));

    let count = 0;
    for (const session of staleSessions) {
      const fullSession = await this.getSession(session.id);
      if (fullSession && fullSession.startedAt < cutoff) {
        await this.endSession(session.id, -1);
        count++;
      }
    }

    return count;
  },
};

/**
 * Helper to check if user is repo owner
 */
export async function isRepoOwner(repoId: string, userId: string): Promise<boolean> {
  const db = getDb();

  const [repo] = await db
    .select({ ownerId: repositories.ownerId })
    .from(repositories)
    .where(eq(repositories.id, repoId))
    .limit(1);

  return repo?.ownerId === userId;
}
