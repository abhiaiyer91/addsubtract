/**
 * MCP Server Model
 * 
 * Handles database operations for MCP (Model Context Protocol) servers
 * that are enabled for a repository's AI agent.
 */

import { eq, and, desc } from 'drizzle-orm';
import { getDb } from '../index';
import {
  repoMcpServers,
  type RepoMcpServer,
  type NewRepoMcpServer,
} from '../schema';
import crypto from 'crypto';

// Encryption key from environment (must be 32 bytes for AES-256)
const ENCRYPTION_KEY = process.env.MCP_ENCRYPTION_KEY || process.env.AI_KEY_ENCRYPTION_KEY || 'default-dev-key-change-in-prod!!';

/**
 * Encrypt sensitive config data
 */
function encryptConfig(config: Record<string, unknown>): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(JSON.stringify(config), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt sensitive config data
 */
function decryptConfig(encryptedData: string): Record<string, unknown> {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(':');
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return JSON.parse(decrypted);
}

/**
 * MCP Server info returned to the client (without sensitive config)
 */
export interface McpServerInfo {
  id: string;
  repoId: string;
  mcpSlug: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  category: string | null;
  enabled: boolean;
  hasConfig: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const mcpServerModel = {
  /**
   * Enable an MCP server for a repository
   */
  async enable(data: {
    repoId: string;
    mcpSlug: string;
    name: string;
    description?: string;
    iconUrl?: string;
    category?: string;
    config?: Record<string, unknown>;
    enabledById: string;
  }): Promise<RepoMcpServer> {
    const db = getDb();
    
    const insertData: NewRepoMcpServer = {
      repoId: data.repoId,
      mcpSlug: data.mcpSlug,
      name: data.name,
      description: data.description,
      iconUrl: data.iconUrl,
      category: data.category,
      enabled: true,
      enabledById: data.enabledById,
      configEncrypted: data.config ? encryptConfig(data.config) : null,
    };
    
    const [server] = await db
      .insert(repoMcpServers)
      .values(insertData)
      .onConflictDoUpdate({
        target: [repoMcpServers.repoId, repoMcpServers.mcpSlug],
        set: {
          name: data.name,
          description: data.description,
          iconUrl: data.iconUrl,
          category: data.category,
          enabled: true,
          configEncrypted: data.config ? encryptConfig(data.config) : undefined,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    return server;
  },

  /**
   * Disable an MCP server for a repository
   */
  async disable(repoId: string, mcpSlug: string): Promise<RepoMcpServer | undefined> {
    const db = getDb();
    
    const [server] = await db
      .update(repoMcpServers)
      .set({ enabled: false, updatedAt: new Date() })
      .where(
        and(
          eq(repoMcpServers.repoId, repoId),
          eq(repoMcpServers.mcpSlug, mcpSlug)
        )
      )
      .returning();
    
    return server;
  },

  /**
   * Remove an MCP server from a repository
   */
  async remove(repoId: string, mcpSlug: string): Promise<boolean> {
    const db = getDb();
    
    const result = await db
      .delete(repoMcpServers)
      .where(
        and(
          eq(repoMcpServers.repoId, repoId),
          eq(repoMcpServers.mcpSlug, mcpSlug)
        )
      )
      .returning();
    
    return result.length > 0;
  },

  /**
   * Get all enabled MCP servers for a repository
   */
  async listEnabled(repoId: string): Promise<RepoMcpServer[]> {
    const db = getDb();
    
    return db
      .select()
      .from(repoMcpServers)
      .where(
        and(
          eq(repoMcpServers.repoId, repoId),
          eq(repoMcpServers.enabled, true)
        )
      )
      .orderBy(desc(repoMcpServers.createdAt));
  },

  /**
   * Get all MCP servers for a repository (enabled and disabled)
   */
  async listAll(repoId: string): Promise<McpServerInfo[]> {
    const db = getDb();
    
    const servers = await db
      .select()
      .from(repoMcpServers)
      .where(eq(repoMcpServers.repoId, repoId))
      .orderBy(desc(repoMcpServers.createdAt));
    
    return servers.map(s => ({
      id: s.id,
      repoId: s.repoId,
      mcpSlug: s.mcpSlug,
      name: s.name,
      description: s.description,
      iconUrl: s.iconUrl,
      category: s.category,
      enabled: s.enabled,
      hasConfig: !!s.configEncrypted,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  },

  /**
   * Get a specific MCP server for a repository
   */
  async findBySlug(repoId: string, mcpSlug: string): Promise<RepoMcpServer | undefined> {
    const db = getDb();
    
    const [server] = await db
      .select()
      .from(repoMcpServers)
      .where(
        and(
          eq(repoMcpServers.repoId, repoId),
          eq(repoMcpServers.mcpSlug, mcpSlug)
        )
      );
    
    return server;
  },

  /**
   * Get decrypted config for an MCP server
   */
  async getConfig(repoId: string, mcpSlug: string): Promise<Record<string, unknown> | null> {
    const server = await this.findBySlug(repoId, mcpSlug);
    
    if (!server || !server.configEncrypted) {
      return null;
    }
    
    try {
      return decryptConfig(server.configEncrypted);
    } catch (error) {
      console.error('[mcpServerModel] Failed to decrypt config:', error);
      return null;
    }
  },

  /**
   * Update config for an MCP server
   */
  async updateConfig(
    repoId: string,
    mcpSlug: string,
    config: Record<string, unknown>
  ): Promise<RepoMcpServer | undefined> {
    const db = getDb();
    
    const [server] = await db
      .update(repoMcpServers)
      .set({
        configEncrypted: encryptConfig(config),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(repoMcpServers.repoId, repoId),
          eq(repoMcpServers.mcpSlug, mcpSlug)
        )
      )
      .returning();
    
    return server;
  },

  /**
   * Toggle enabled status
   */
  async setEnabled(repoId: string, mcpSlug: string, enabled: boolean): Promise<RepoMcpServer | undefined> {
    const db = getDb();
    
    const [server] = await db
      .update(repoMcpServers)
      .set({ enabled, updatedAt: new Date() })
      .where(
        and(
          eq(repoMcpServers.repoId, repoId),
          eq(repoMcpServers.mcpSlug, mcpSlug)
        )
      )
      .returning();
    
    return server;
  },
};
