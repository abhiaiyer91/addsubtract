/**
 * User AI Keys Model
 * 
 * Handles storage and retrieval of encrypted AI API keys per user.
 * Users can set their own keys to use AI features across all repositories.
 */

import { eq, and } from 'drizzle-orm';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { getDb } from '../index';
import {
  userAiKeys,
  type AiProvider,
} from '../schema';

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;

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

export interface UserAiKeyInfo {
  id: string;
  provider: AiProvider;
  keyHint: string;
  createdAt: Date;
  updatedAt: Date;
}

export const userAiKeyModel = {
  /**
   * Set an AI API key for a user
   * Creates or updates the key for the specified provider
   */
  async setKey(
    userId: string,
    provider: AiProvider,
    apiKey: string
  ): Promise<UserAiKeyInfo> {
    const db = getDb();
    
    const encryptedKey = encryptApiKey(apiKey);
    const keyHint = getKeyHint(apiKey);
    
    // Check if key already exists for this provider
    const existing = await db
      .select()
      .from(userAiKeys)
      .where(
        and(
          eq(userAiKeys.userId, userId),
          eq(userAiKeys.provider, provider)
        )
      )
      .limit(1);
    
    if (existing.length > 0) {
      // Update existing key
      const [updated] = await db
        .update(userAiKeys)
        .set({
          encryptedKey,
          keyHint,
          updatedAt: new Date(),
        })
        .where(eq(userAiKeys.id, existing[0].id))
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
      .insert(userAiKeys)
      .values({
        userId,
        provider,
        encryptedKey,
        keyHint,
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
   * Get all AI keys for a user (without decrypting)
   * Returns key metadata only - safe to display to users
   */
  async listKeys(userId: string): Promise<UserAiKeyInfo[]> {
    const db = getDb();
    
    const keys = await db
      .select({
        id: userAiKeys.id,
        provider: userAiKeys.provider,
        keyHint: userAiKeys.keyHint,
        createdAt: userAiKeys.createdAt,
        updatedAt: userAiKeys.updatedAt,
      })
      .from(userAiKeys)
      .where(eq(userAiKeys.userId, userId));
    
    return keys;
  },

  /**
   * Get a decrypted API key for a specific provider
   * Used internally when making AI API calls
   */
  async getDecryptedKey(userId: string, provider: AiProvider): Promise<string | null> {
    const db = getDb();
    
    const [key] = await db
      .select()
      .from(userAiKeys)
      .where(
        and(
          eq(userAiKeys.userId, userId),
          eq(userAiKeys.provider, provider)
        )
      )
      .limit(1);
    
    if (!key) {
      return null;
    }
    
    try {
      return decryptApiKey(key.encryptedKey);
    } catch (error) {
      console.error(`Failed to decrypt AI key for user ${userId}, provider ${provider}:`, error);
      return null;
    }
  },

  /**
   * Get any available LLM API key for a user
   * Prefers Anthropic, then OpenAI
   * Note: Does not return CodeRabbit keys as they are not LLM providers
   */
  async getAnyKey(userId: string): Promise<{ provider: 'openai' | 'anthropic'; key: string } | null> {
    // Try Anthropic first
    const anthropicKey = await this.getDecryptedKey(userId, 'anthropic');
    if (anthropicKey) {
      return { provider: 'anthropic', key: anthropicKey };
    }
    
    // Fall back to OpenAI
    const openaiKey = await this.getDecryptedKey(userId, 'openai');
    if (openaiKey) {
      return { provider: 'openai', key: openaiKey };
    }
    
    return null;
  },

  /**
   * Delete an AI key
   */
  async deleteKey(userId: string, provider: AiProvider): Promise<boolean> {
    const db = getDb();
    
    const result = await db
      .delete(userAiKeys)
      .where(
        and(
          eq(userAiKeys.userId, userId),
          eq(userAiKeys.provider, provider)
        )
      )
      .returning();
    
    return result.length > 0;
  },

  /**
   * Delete all AI keys for a user
   */
  async deleteAllKeys(userId: string): Promise<number> {
    const db = getDb();
    
    const result = await db
      .delete(userAiKeys)
      .where(eq(userAiKeys.userId, userId))
      .returning();
    
    return result.length;
  },

  /**
   * Check if a user has any AI keys configured
   */
  async hasKeys(userId: string): Promise<boolean> {
    const db = getDb();
    
    const [key] = await db
      .select({ id: userAiKeys.id })
      .from(userAiKeys)
      .where(eq(userAiKeys.userId, userId))
      .limit(1);
    
    return !!key;
  },

  /**
   * Check AI availability for a user
   * Returns whether AI features can be used (user keys or server keys)
   */
  async checkAvailability(userId: string): Promise<{
    available: boolean;
    source: 'user' | 'server' | null;
    hasUserKeys: boolean;
    hasServerKeys: boolean;
  }> {
    // Check if user has their own keys
    const hasUserKeys = await this.hasKeys(userId);
    
    // Check if server has global keys
    const hasServerKeys = !!(
      process.env.OPENAI_API_KEY || 
      process.env.ANTHROPIC_API_KEY
    );
    
    return {
      available: hasUserKeys || hasServerKeys,
      source: hasUserKeys ? 'user' : hasServerKeys ? 'server' : null,
      hasUserKeys,
      hasServerKeys,
    };
  },
};
