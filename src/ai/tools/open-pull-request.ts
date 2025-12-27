/**
 * Open Pull Request Tool
 * Creates a pull request from the current branch
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Repository } from '../../core/repository.js';
import { getApiClient, ApiError } from '../../api/client.js';
import { parseRemoteUrl } from '../../core/protocol/index.js';

export const openPullRequestTool = createTool({
  id: 'wit-open-pull-request',
  description: `Create a pull request from the current branch to a target branch.
Use this after making and committing changes to open a PR for review.
Requires the repository to have a remote origin configured.
The PR will be created on the wit server (requires authentication).`,
  inputSchema: z.object({
    title: z.string().describe('Title for the pull request'),
    body: z.string().optional().describe('Description/body of the pull request (supports markdown)'),
    targetBranch: z.string().optional().default('main').describe('Target branch to merge into (default: main)'),
    draft: z.boolean().optional().default(false).describe('Create as a draft pull request'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    prNumber: z.number().optional().describe('The PR number'),
    prUrl: z.string().optional().describe('URL to view the PR'),
    sourceBranch: z.string().optional(),
    targetBranch: z.string().optional(),
    message: z.string(),
  }),
  execute: async ({ title, body, targetBranch = 'main', draft = false }) => {
    try {
      const repo = Repository.find();

      // Get current branch
      const currentBranch = repo.refs.getCurrentBranch();
      if (!currentBranch) {
        return {
          success: false,
          message: 'Not on a branch (detached HEAD). Switch to a branch first.',
        };
      }

      if (currentBranch === 'main' || currentBranch === 'master') {
        return {
          success: false,
          message: `Cannot create PR from ${currentBranch} branch. Create a feature branch first.`,
        };
      }

      // Get remote origin
      const remote = repo.remotes.get('origin');
      if (!remote) {
        return {
          success: false,
          message: 'No remote origin configured. Add a remote with: wit remote add origin <url>',
        };
      }

      // Parse owner/repo from remote URL
      const { owner, repoName } = parseOwnerRepo(remote.url);

      // Get SHA values
      const headSha = repo.refs.resolve(currentBranch);
      const baseSha = repo.refs.resolve(targetBranch) ||
        repo.refs.resolve(`origin/${targetBranch}`) ||
        repo.refs.resolve(`refs/remotes/origin/${targetBranch}`);

      if (!headSha) {
        return {
          success: false,
          message: `Cannot resolve current branch: ${currentBranch}`,
        };
      }

      if (!baseSha) {
        return {
          success: false,
          message: `Cannot resolve target branch: ${targetBranch}. Make sure it exists.`,
        };
      }

      // Create the PR via API
      const api = getApiClient();

      const pr = await api.pulls.create(owner, repoName, {
        title,
        body,
        sourceBranch: currentBranch,
        targetBranch,
        headSha,
        baseSha,
      });

      // Construct PR URL
      const serverUrl = process.env.WIT_SERVER_URL || 'http://localhost:3000';
      const prUrl = `${serverUrl}/${owner}/${repoName}/pull/${pr.number}`;

      return {
        success: true,
        prNumber: pr.number,
        prUrl,
        sourceBranch: currentBranch,
        targetBranch,
        message: `Created pull request #${pr.number}: ${title}`,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 0) {
          return {
            success: false,
            message: 'Cannot connect to wit server. Is it running? Start with: wit serve',
          };
        }
        return {
          success: false,
          message: `API error: ${error.message}`,
        };
      }
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to create pull request',
      };
    }
  },
});

/**
 * Parse owner and repo from remote URL
 */
function parseOwnerRepo(url: string): { owner: string; repoName: string } {
  const parsed = parseRemoteUrl(url);

  // Extract owner/repo from path
  // Path could be: /user/repo.git, user/repo.git, /user/repo, user/repo
  let path = parsed.path;
  if (path.startsWith('/')) {
    path = path.slice(1);
  }
  if (path.endsWith('.git')) {
    path = path.slice(0, -4);
  }

  const parts = path.split('/');
  if (parts.length < 2) {
    throw new Error(`Invalid remote URL: cannot parse owner/repo from ${url}`);
  }

  return {
    owner: parts[parts.length - 2],
    repoName: parts[parts.length - 1],
  };
}
