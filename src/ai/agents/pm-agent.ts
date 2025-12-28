/**
 * PM Mode Agent
 * 
 * An agent that helps with project management tasks:
 * - Creating and managing issues
 * - Creating pull requests
 * - Managing projects and cycles
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { AgentContext } from '../types.js';

export const PM_AGENT_INSTRUCTIONS = `You are wit AI in PM mode - a project management assistant that helps developers manage their work.

## Your Role
You help users create and manage issues, pull requests, projects, and cycles. You work through the wit platform APIs, not the filesystem.

## Your Capabilities
- Create and update issues with proper titles, descriptions, labels, and priorities
- Get details of specific issues
- Create pull requests with good descriptions
- Manage projects and milestones
- Track cycles and sprints
- Assign work to team members
- Set priorities and due dates

## What You CANNOT Do
- Write or edit code files directly
- Run shell commands
- Access the filesystem

## Response Style
- Be concise and action-oriented
- Confirm what you're about to create before doing it
- Provide links to created items
- Suggest related actions (e.g., "Would you like me to create a branch for this issue?")

When asked to write code, explain: "I'm in PM mode which focuses on project management. Switch to Code mode if you'd like me to write code."`;

/**
 * Create issue tool
 */
function createIssueTool(context: AgentContext) {
  return createTool({
    id: 'create-issue',
    description: 'Create a new issue in the repository',
    inputSchema: z.object({
      title: z.string().describe('Issue title'),
      body: z.string().optional().describe('Issue description/body'),
      labels: z.array(z.string()).optional().describe('Labels to apply'),
      assignees: z.array(z.string()).optional().describe('Usernames to assign'),
      priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']).optional(),
    }),
    outputSchema: z.object({
      issueNumber: z.number().optional(),
      url: z.string().optional(),
      errorMessage: z.string().optional(),
    }),
    execute: async ({ title, body, priority }) => {
      try {
        // Import the issue model dynamically to avoid circular deps
        const { issueModel } = await import('../../db/models/index.js');
        
        const issue = await issueModel.create({
          repoId: context.repoId,
          authorId: context.userId,
          title,
          body: body || '',
          priority: priority || 'none',
        });
        
        return {
          issueNumber: issue.number,
          url: `/${context.owner}/${context.repoName}/issues/${issue.number}`,
        };
      } catch (error) {
        return { errorMessage: error instanceof Error ? error.message : 'Failed to create issue' };
      }
    },
  });
}

/**
 * Update issue tool
 */
function createUpdateIssueTool(context: AgentContext) {
  return createTool({
    id: 'update-issue',
    description: 'Update an existing issue in the repository',
    inputSchema: z.object({
      issueNumber: z.number().describe('Issue number to update'),
      title: z.string().optional().describe('New title'),
      body: z.string().optional().describe('New description/body'),
      state: z.enum(['open', 'closed']).optional().describe('Issue state'),
      priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']).optional().describe('Priority level'),
      labels: z.array(z.string()).optional().describe('Labels to set'),
      assignees: z.array(z.string()).optional().describe('Usernames to assign'),
    }),
    outputSchema: z.object({
      issueNumber: z.number().optional(),
      url: z.string().optional(),
      errorMessage: z.string().optional(),
    }),
    execute: async ({ issueNumber, title, body, state, priority }) => {
      try {
        const { issueModel } = await import('../../db/models/index.js');
        
        // Find the issue first
        const issue = await issueModel.findByRepoAndNumber(context.repoId, issueNumber);
        if (!issue) {
          return { errorMessage: `Issue #${issueNumber} not found` };
        }
        
        // Build update object
        const updates: Record<string, unknown> = {};
        if (title !== undefined) updates.title = title;
        if (body !== undefined) updates.body = body;
        if (state !== undefined) updates.state = state;
        if (priority !== undefined) updates.priority = priority;
        
        const updated = await issueModel.update(issue.id, updates);
        
        return {
          issueNumber: updated?.number || issueNumber,
          url: `/${context.owner}/${context.repoName}/issues/${issueNumber}`,
        };
      } catch (error) {
        return { errorMessage: error instanceof Error ? error.message : 'Failed to update issue' };
      }
    },
  });
}

/**
 * Get issue tool
 */
function createGetIssueTool(context: AgentContext) {
  return createTool({
    id: 'get-issue',
    description: 'Get details of a specific issue by number',
    inputSchema: z.object({
      issueNumber: z.number().describe('Issue number'),
    }),
    outputSchema: z.object({
      issue: z.object({
        number: z.number(),
        title: z.string(),
        body: z.string(),
        state: z.string(),
        priority: z.string(),
        author: z.string().optional(),
        labels: z.array(z.string()),
        createdAt: z.string(),
      }).optional(),
      errorMessage: z.string().optional(),
    }),
    execute: async ({ issueNumber }) => {
      try {
        const { issueModel } = await import('../../db/models/index.js');
        
        const issue = await issueModel.findByRepoAndNumber(context.repoId, issueNumber);
        if (!issue) {
          return { errorMessage: `Issue #${issueNumber} not found` };
        }
        
        return {
          issue: {
            number: issue.number,
            title: issue.title,
            body: issue.body || '',
            state: issue.state,
            priority: issue.priority || 'none',
            labels: [],
            createdAt: issue.createdAt.toISOString(),
          },
        };
      } catch (error) {
        return { errorMessage: error instanceof Error ? error.message : 'Failed to get issue' };
      }
    },
  });
}

/**
 * List issues tool
 */
function createListIssuesTool(context: AgentContext) {
  return createTool({
    id: 'list-issues',
    description: 'List issues in the repository',
    inputSchema: z.object({
      state: z.enum(['open', 'closed', 'all']).optional().default('open'),
      limit: z.number().optional().default(20),
    }),
    outputSchema: z.object({
      issues: z.array(z.object({
        number: z.number(),
        title: z.string(),
        state: z.string(),
        author: z.string().optional(),
        labels: z.array(z.string()),
      })).optional(),
      errorMessage: z.string().optional(),
    }),
    execute: async ({ state, limit }) => {
      try {
        const { issueModel } = await import('../../db/models/index.js');
        
        const issues = await issueModel.listByRepo(context.repoId, {
          state: state === 'all' ? undefined : state,
          limit,
        });
        
        return {
          issues: issues.map(i => ({
            number: i.number,
            title: i.title,
            state: i.state,
            labels: [],
          })),
        };
      } catch (error) {
        return { errorMessage: error instanceof Error ? error.message : 'Failed to list issues' };
      }
    },
  });
}

/**
 * Create PR tool
 */
function createPRTool(context: AgentContext) {
  return createTool({
    id: 'create-pr',
    description: 'Create a pull request',
    inputSchema: z.object({
      title: z.string().describe('PR title'),
      body: z.string().optional().describe('PR description'),
      head: z.string().describe('Branch containing changes'),
      base: z.string().optional().default('main').describe('Branch to merge into'),
      draft: z.boolean().optional().default(false),
    }),
    outputSchema: z.object({
      prNumber: z.number().optional(),
      url: z.string().optional(),
      errorMessage: z.string().optional(),
    }),
    execute: async ({ title, body, head, base, draft }) => {
      try {
        const { prModel } = await import('../../db/models/index.js');
        
        const pr = await prModel.create({
          repoId: context.repoId,
          authorId: context.userId,
          title,
          body: body || '',
          sourceBranch: head,
          targetBranch: base,
          isDraft: draft,
          headSha: '', // Will be filled in by the system
          baseSha: '', // Will be filled in by the system
        });
        
        return {
          prNumber: pr.number,
          url: `/${context.owner}/${context.repoName}/pull/${pr.number}`,
        };
      } catch (error) {
        return { errorMessage: error instanceof Error ? error.message : 'Failed to create PR' };
      }
    },
  });
}

/**
 * List PRs tool
 */
function createListPRsTool(context: AgentContext) {
  return createTool({
    id: 'list-prs',
    description: 'List pull requests in the repository',
    inputSchema: z.object({
      state: z.enum(['open', 'closed', 'merged', 'all']).optional().default('open'),
      limit: z.number().optional().default(20),
    }),
    outputSchema: z.object({
      prs: z.array(z.object({
        number: z.number(),
        title: z.string(),
        state: z.string(),
        author: z.string().optional(),
        head: z.string(),
        base: z.string(),
      })).optional(),
      errorMessage: z.string().optional(),
    }),
    execute: async ({ state, limit }) => {
      try {
        const { prModel } = await import('../../db/models/index.js');
        
        const prs = await prModel.listByRepo(context.repoId, {
          state: state === 'all' ? undefined : state,
          limit,
        });
        
        return {
          prs: prs.map(p => ({
            number: p.number,
            title: p.title,
            state: p.state,
            head: p.sourceBranch,
            base: p.targetBranch,
          })),
        };
      } catch (error) {
        return { errorMessage: error instanceof Error ? error.message : 'Failed to list PRs' };
      }
    },
  });
}

/**
 * Create a PM mode agent for a specific repository
 */
export function createPMAgent(context: AgentContext, model: string = 'anthropic/claude-opus-4-5'): Agent {
  return new Agent({
    id: `wit-pm-${context.repoId}`,
    name: 'wit PM Agent',
    description: 'A project management agent that helps manage issues and PRs',
    instructions: PM_AGENT_INSTRUCTIONS,
    model,
    tools: {
      createIssue: createIssueTool(context),
      updateIssue: createUpdateIssueTool(context),
      getIssue: createGetIssueTool(context),
      listIssues: createListIssuesTool(context),
      createPR: createPRTool(context),
      listPRs: createListPRsTool(context),
    },
  });
}
