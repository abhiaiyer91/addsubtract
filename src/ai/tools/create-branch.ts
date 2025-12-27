/**
 * Create Branch Tool
 * Creates a new branch and optionally switches to it
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Repository } from '../../core/repository.js';
import { Journal, StateSnapshot } from '../../core/journal.js';

export const createBranchTool = createTool({
  id: 'wit-create-branch',
  description: `Create a new branch in the repository.
Use this when starting work on a new feature or fix.
The branch will be created from the current HEAD by default.
Optionally switch to the new branch immediately.`,
  inputSchema: z.object({
    name: z.string().describe('Name for the new branch (e.g., "feature/add-auth", "fix/login-bug")'),
    switchTo: z.boolean().optional().default(true).describe('Switch to the new branch after creating it'),
    startPoint: z.string().optional().describe('Create branch from this ref instead of HEAD (e.g., "main", a commit hash)'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    branch: z.string().optional().describe('The name of the created branch'),
    commitHash: z.string().optional().describe('The commit the branch points to'),
    previousBranch: z.string().nullable().optional().describe('The branch we were on before (if switched)'),
    message: z.string(),
  }),
  execute: async ({ name, switchTo = true, startPoint }) => {
    try {
      const repo = Repository.find();
      const journal = new Journal(repo.gitDir);

      // Validate branch name
      if (!isValidBranchName(name)) {
        return {
          success: false,
          message: `Invalid branch name: '${name}'. Branch names cannot contain spaces, ~, ^, :, \\, or consecutive dots.`,
        };
      }

      // Check if branch already exists
      const existingBranches = repo.refs.listBranches();
      if (existingBranches.includes(name)) {
        return {
          success: false,
          message: `Branch '${name}' already exists. Use switchBranch to switch to it.`,
        };
      }

      // Get the commit to branch from
      let commitHash: string | null;
      if (startPoint) {
        commitHash = repo.refs.resolve(startPoint);
        if (!commitHash) {
          return {
            success: false,
            message: `Could not resolve start point: '${startPoint}'`,
          };
        }
      } else {
        commitHash = repo.refs.resolve('HEAD');
        if (!commitHash) {
          return {
            success: false,
            message: 'Cannot create branch: no commits in repository yet. Make an initial commit first.',
          };
        }
      }

      // Capture state before
      const beforeState: StateSnapshot = {
        head: commitHash,
        branch: repo.refs.getCurrentBranch(),
        indexHash: '',
      };

      // Create the branch
      repo.refs.createBranch(name, commitHash);

      const previousBranch = repo.refs.getCurrentBranch();

      // Switch to the new branch if requested
      if (switchTo) {
        repo.refs.setHeadSymbolic(`refs/heads/${name}`);
      }

      // Capture state after
      const afterState: StateSnapshot = {
        head: commitHash,
        branch: switchTo ? name : previousBranch,
        indexHash: '',
      };

      // Record in journal
      journal.record(
        'branch',
        [name, switchTo ? '--switch' : ''],
        `Created branch: ${name}`,
        beforeState,
        afterState,
        { commitHash }
      );

      return {
        success: true,
        branch: name,
        commitHash,
        previousBranch: switchTo ? previousBranch : undefined,
        message: switchTo
          ? `Created and switched to new branch '${name}'`
          : `Created branch '${name}'`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create branch',
      };
    }
  },
});

/**
 * Validate git branch name
 */
function isValidBranchName(name: string): boolean {
  // Check for invalid characters and patterns
  const invalidPatterns = [
    /\s/, // No spaces
    /~/, // No tilde
    /\^/, // No caret
    /:/, // No colon
    /\\/, // No backslash
    /\.\./, // No consecutive dots
    /^\./, // Can't start with dot
    /\.$/, // Can't end with dot
    /^-/, // Can't start with dash
    /@{/, // No @{
    /\.lock$/, // Can't end with .lock
  ];

  for (const pattern of invalidPatterns) {
    if (pattern.test(name)) {
      return false;
    }
  }

  // Must have at least one character
  if (name.length === 0) {
    return false;
  }

  return true;
}
