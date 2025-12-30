/**
 * Repository AI Keys Model
 * 
 * Handles storage and retrieval of encrypted AI API keys per repository.
 * Only repository owners can manage these keys.
 */

import { eq, and } from 'drizzle-orm';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { getDb } from '../index';
import {
  repoAiKeys,
  repositories,
  type AiProvider,
} from '../schema';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
// AUTH_TAG_LENGTH = 16 used implicitly by GCM mode

/**
 * Get encryption key from environment
 * In production, this must be set via ENCRYPTION_KEY or BETTER_AUTH_SECRET env var
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET;
  
  if (!secret) {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      throw new Error('ENCRYPTION_KEY or BETTER_AUTH_SECRET is required in production');
    }
    // Only allow default in development
    console.warn('WARNING: Using default encryption key. Set ENCRYPTION_KEY in production.');
    return scryptSync('dev-only-insecure-key', 'wit-ai-keys-salt', KEY_LENGTH);
  }
  
  return scryptSync(secret, 'wit-ai-keys-salt', KEY_LENGTH);
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
 * Get key hint (last 4 characters) for display
 */
function getKeyHint(apiKey: string): string {
  return `...${apiKey.slice(-4)}`;
}

export interface RepoAiKeyInfo {
  id: string;
  provider: AiProvider;
  keyHint: string;
  createdAt: Date;
  updatedAt: Date;
}

export const repoAiKeyModel = {
  /**
   * Set an AI API key for a repository
   * Creates or updates the key for the specified provider
   */
  async setKey(
    repoId: string,
    provider: AiProvider,
    apiKey: string,
    userId: string
  ): Promise<RepoAiKeyInfo> {
    const db = getDb();
    
    const encryptedKey = encryptApiKey(apiKey);
    const keyHint = getKeyHint(apiKey);
    
    // Check if key already exists for this provider
    const existing = await db
      .select()
      .from(repoAiKeys)
      .where(
        and(
          eq(repoAiKeys.repoId, repoId),
          eq(repoAiKeys.provider, provider)
        )
      )
      .limit(1);
    
    if (existing.length > 0) {
      // Update existing key
      const [updated] = await db
        .update(repoAiKeys)
        .set({
          encryptedKey,
          keyHint,
          updatedAt: new Date(),
        })
        .where(eq(repoAiKeys.id, existing[0].id))
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
      .insert(repoAiKeys)
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
   * Get all AI keys for a repository (without decrypting)
   * Returns key metadata only - safe to display to users
   */
  async listKeys(repoId: string): Promise<RepoAiKeyInfo[]> {
    const db = getDb();
    
    const keys = await db
      .select({
        id: repoAiKeys.id,
        provider: repoAiKeys.provider,
        keyHint: repoAiKeys.keyHint,
        createdAt: repoAiKeys.createdAt,
        updatedAt: repoAiKeys.updatedAt,
      })
      .from(repoAiKeys)
      .where(eq(repoAiKeys.repoId, repoId));
    
    return keys;
  },

  /**
   * Get a decrypted API key for a specific provider
   * Used internally when making AI API calls
   */
  async getDecryptedKey(repoId: string, provider: AiProvider): Promise<string | null> {
    const db = getDb();
    
    const [key] = await db
      .select()
      .from(repoAiKeys)
      .where(
        and(
          eq(repoAiKeys.repoId, repoId),
          eq(repoAiKeys.provider, provider)
        )
      )
      .limit(1);
    
    if (!key) {
      return null;
    }
    
    try {
      return decryptApiKey(key.encryptedKey);
    } catch (error) {
      console.error(`Failed to decrypt AI key for repo ${repoId}, provider ${provider}:`, error);
      return null;
    }
  },

  /**
   * Get any available LLM API key for a repository
   * Prefers Anthropic, then OpenRouter (any model), then OpenAI
   * Note: Does not return CodeRabbit keys as they are not LLM providers
   */
  async getAnyKey(repoId: string): Promise<{ provider: 'openai' | 'anthropic' | 'openrouter'; key: string } | null> {
    // Try Anthropic first (recommended - Claude)
    const anthropicKey = await this.getDecryptedKey(repoId, 'anthropic');
    if (anthropicKey) {
      return { provider: 'anthropic', key: anthropicKey };
    }
    
    // Try OpenRouter (supports any model)
    const openrouterKey = await this.getDecryptedKey(repoId, 'openrouter');
    if (openrouterKey) {
      return { provider: 'openrouter', key: openrouterKey };
    }
    
    // Fall back to OpenAI
    const openaiKey = await this.getDecryptedKey(repoId, 'openai');
    if (openaiKey) {
      return { provider: 'openai', key: openaiKey };
    }
    
    return null;
  },

  /**
   * Delete an AI key
   */
  async deleteKey(repoId: string, provider: AiProvider): Promise<boolean> {
    const db = getDb();
    
    const result = await db
      .delete(repoAiKeys)
      .where(
        and(
          eq(repoAiKeys.repoId, repoId),
          eq(repoAiKeys.provider, provider)
        )
      )
      .returning();
    
    return result.length > 0;
  },

  /**
   * Delete all AI keys for a repository
   */
  async deleteAllKeys(repoId: string): Promise<number> {
    const db = getDb();
    
    const result = await db
      .delete(repoAiKeys)
      .where(eq(repoAiKeys.repoId, repoId))
      .returning();
    
    return result.length;
  },

  /**
   * Check if a repository has any AI keys configured
   */
  async hasKeys(repoId: string): Promise<boolean> {
    const db = getDb();
    
    const [key] = await db
      .select({ id: repoAiKeys.id })
      .from(repoAiKeys)
      .where(eq(repoAiKeys.repoId, repoId))
      .limit(1);
    
    return !!key;
  },

  /**
   * Check if repository owner
   * Only owners can manage AI keys
   */
  async isRepoOwner(repoId: string, userId: string): Promise<boolean> {
    const db = getDb();
    
    const [repo] = await db
      .select({ ownerId: repositories.ownerId })
      .from(repositories)
      .where(eq(repositories.id, repoId))
      .limit(1);
    
    return repo?.ownerId === userId;
  },

  /**
   * Check AI availability for a repository
   * Returns whether AI features can be used (either repo keys or server keys)
   */
  async checkAvailability(repoId: string): Promise<{
    available: boolean;
    source: 'repository' | 'server' | null;
    hasRepoKeys: boolean;
    hasServerKeys: boolean;
  }> {
    // Check if repo has its own keys
    const hasRepoKeys = await this.hasKeys(repoId);
    
    // Check if server has global keys
    const hasServerKeys = !!(
      process.env.OPENAI_API_KEY || 
      process.env.ANTHROPIC_API_KEY ||
      process.env.OPENROUTER_API_KEY
    );
    
    return {
      available: hasRepoKeys || hasServerKeys,
      source: hasRepoKeys ? 'repository' : hasServerKeys ? 'server' : null,
      hasRepoKeys,
      hasServerKeys,
    };
  },

  /**
   * Get CodeRabbit API key for a repository
   * Checks repo-level key first, then falls back to server-level env var
   */
  async getCodeRabbitKey(repoId: string): Promise<string | null> {
    // Check repo-level key first
    const repoKey = await this.getDecryptedKey(repoId, 'coderabbit');
    if (repoKey) {
      return repoKey;
    }
    
    // Fall back to server-level key
    return process.env.CODERABBIT_API_KEY || null;
  },

  /**
   * Check CodeRabbit availability for a repository
   */
  async checkCodeRabbitAvailability(repoId: string): Promise<{
    available: boolean;
    source: 'repository' | 'server' | null;
    hasRepoKey: boolean;
    hasServerKey: boolean;
  }> {
    const repoKey = await this.getDecryptedKey(repoId, 'coderabbit');
    const hasRepoKey = !!repoKey;
    const hasServerKey = !!process.env.CODERABBIT_API_KEY;
    
    return {
      available: hasRepoKey || hasServerKey,
      source: hasRepoKey ? 'repository' : hasServerKey ? 'server' : null,
      hasRepoKey,
      hasServerKey,
    };
  },
};
