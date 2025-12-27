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
- Create issues with proper titles, descriptions, and labels
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
      error: z.string().optional(),
    }),
    execute: async ({ title, body, labels, priority }) => {
      try {
        // Import the issue model dynamically to avoid circular deps
        const { issueModel } = await import('../../db/models/index.js');
        
        const issue = await issueModel.create({
          repoId: context.repoId,
          authorId: context.userId,
          title,
          body: body || '',
          labels: labels || [],
          priority: priority || 'none',
        });
        
        return {
          issueNumber: issue.number,
          url: `/${context.owner}/${context.repoName}/issues/${issue.number}`,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to create issue' };
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
      error: z.string().optional(),
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
            labels: i.labels || [],
          })),
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to list issues' };
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
      error: z.string().optional(),
    }),
    execute: async ({ title, body, head, base, draft }) => {
      try {
        const { pullRequestModel } = await import('../../db/models/index.js');
        
        const pr = await pullRequestModel.create({
          repoId: context.repoId,
          authorId: context.userId,
          title,
          body: body || '',
          headBranch: head,
          baseBranch: base,
          isDraft: draft,
        });
        
        return {
          prNumber: pr.number,
          url: `/${context.owner}/${context.repoName}/pull/${pr.number}`,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to create PR' };
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
      error: z.string().optional(),
    }),
    execute: async ({ state, limit }) => {
      try {
        const { pullRequestModel } = await import('../../db/models/index.js');
        
        const prs = await pullRequestModel.listByRepo(context.repoId, {
          state: state === 'all' ? undefined : state,
          limit,
        });
        
        return {
          prs: prs.map(p => ({
            number: p.number,
            title: p.title,
            state: p.state,
            head: p.headBranch,
            base: p.baseBranch,
          })),
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Failed to list PRs' };
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
      listIssues: createListIssuesTool(context),
      createPR: createPRTool(context),
      listPRs: createListPRsTool(context),
    },
  });
}
