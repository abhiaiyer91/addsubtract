/**
 * Virtual Commit Tool
 * 
 * Commits changes from the VirtualFS to the repository.
 * Used by the IDE and AI agents to persist code changes.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getVirtualRepo } from './virtual-write-file.js';

export const virtualCommitTool = createTool({
  id: 'vfs-commit',
  description: `Commit all changes in the virtual filesystem to the repository.
This persists all file changes to the git object store, creating a new commit.
After committing, the changes are permanent and the repository can be cloned.`,
  inputSchema: z.object({
    sessionId: z.string().describe('The session ID for the virtual repository'),
    message: z.string().describe('Commit message describing the changes'),
    authorName: z.string().optional().describe('Name of the commit author'),
    authorEmail: z.string().optional().describe('Email of the commit author'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    commitHash: z.string().optional().describe('The hash of the created commit'),
    changedFiles: z.number().optional().describe('Number of files changed'),
    message: z.string(),
  }),
  execute: async ({ sessionId, message, authorName, authorEmail }) => {
    try {
      const vrepo = getVirtualRepo(sessionId);
      if (!vrepo) {
        return {
          success: false,
          message: `Virtual repository session not found: ${sessionId}`,
        };
      }

      // Check for changes
      const status = vrepo.status();
      if (status.length === 0) {
        return {
          success: false,
          message: 'Nothing to commit - no changes detected',
        };
      }

      // Prepare author info
      const author = (authorName || authorEmail) ? {
        name: authorName || 'Anonymous',
        email: authorEmail || 'anonymous@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        timezone: getTimezone(),
      } : undefined;

      // Create commit
      const commitHash = vrepo.commit(message, author);

      return {
        success: true,
        commitHash,
        changedFiles: status.length,
        message: `Created commit ${commitHash.slice(0, 7)}: ${message}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to commit',
      };
    }
  },
});

/**
 * Get current timezone offset string
 */
function getTimezone(): string {
  const offset = new Date().getTimezoneOffset();
  const sign = offset <= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
  const minutes = (Math.abs(offset) % 60).toString().padStart(2, '0');
  return `${sign}${hours}${minutes}`;
}
