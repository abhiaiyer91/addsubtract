/**
 * Virtual Write File Tool
 * 
 * Creates or overwrites files in a VirtualFS (in-memory filesystem).
 * Used by the IDE and AI agents for server-side code generation.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { VirtualRepository } from '../../primitives/virtual-repository.js';

// Store for virtual repos - in production this would be managed by a session manager
const virtualRepos = new Map<string, VirtualRepository>();

/**
 * Get or create a virtual repository for a session
 */
export function getVirtualRepo(sessionId: string, repoPath?: string): VirtualRepository | null {
  if (virtualRepos.has(sessionId)) {
    return virtualRepos.get(sessionId)!;
  }
  
  if (repoPath) {
    const vrepo = new VirtualRepository(repoPath);
    virtualRepos.set(sessionId, vrepo);
    return vrepo;
  }
  
  return null;
}

/**
 * Set a virtual repository for a session
 */
export function setVirtualRepo(sessionId: string, vrepo: VirtualRepository): void {
  virtualRepos.set(sessionId, vrepo);
}

/**
 * Clear a virtual repository session
 */
export function clearVirtualRepo(sessionId: string): boolean {
  return virtualRepos.delete(sessionId);
}

export const virtualWriteFileTool = createTool({
  id: 'vfs-write-file',
  description: `Create a new file or overwrite an existing file in the virtual filesystem.
This writes to an in-memory filesystem that can be committed to the repository.
Use this when you need to create a completely new file or completely replace file contents.
For small targeted changes to existing files, prefer the vfs-edit-file tool instead.`,
  inputSchema: z.object({
    sessionId: z.string().describe('The session ID for the virtual repository'),
    filePath: z.string().describe('Path to the file relative to the repository root'),
    content: z.string().describe('The content to write to the file'),
    createDirectories: z.boolean().optional().default(true).describe('Create parent directories if they do not exist'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    filePath: z.string().optional().describe('The path where the file was written'),
    created: z.boolean().optional().describe('Whether this was a new file (vs overwrite)'),
    size: z.number().optional().describe('Size of the written file in bytes'),
    message: z.string(),
    previousContent: z.string().optional().describe('Previous content if file was overwritten (for undo)'),
  }),
  execute: async ({ sessionId, filePath, content, createDirectories = true }) => {
    try {
      const vrepo = getVirtualRepo(sessionId);
      if (!vrepo) {
        return {
          success: false,
          message: `Virtual repository session not found: ${sessionId}`,
        };
      }

      // Security: Prevent writing to .wit or .git directories
      if (filePath.startsWith('.wit') || filePath.startsWith('.git') ||
          filePath.includes('/.wit/') || filePath.includes('/.git/')) {
        return {
          success: false,
          message: 'Access denied: Cannot write to .wit or .git directories',
        };
      }

      // Check if file exists for created flag
      const fileExisted = vrepo.exists(filePath);
      let previousContent: string | undefined;

      if (fileExisted) {
        previousContent = vrepo.read(filePath) || undefined;
      }

      // Create parent directories if needed
      if (createDirectories) {
        const parts = filePath.split('/');
        if (parts.length > 1) {
          const parentDir = parts.slice(0, -1).join('/');
          vrepo.mkdir(parentDir);
        }
      }

      // Write the file
      vrepo.write(filePath, content);

      return {
        success: true,
        filePath,
        created: !fileExisted,
        size: Buffer.byteLength(content, 'utf-8'),
        message: fileExisted
          ? `Updated file: ${filePath} (${Buffer.byteLength(content, 'utf-8')} bytes)`
          : `Created file: ${filePath} (${Buffer.byteLength(content, 'utf-8')} bytes)`,
        previousContent: fileExisted ? previousContent : undefined,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to write file',
      };
    }
  },
});
