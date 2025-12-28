/**
 * Triage Agent
 * 
 * An automated agent that analyzes new issues and:
 * - Assigns appropriate labels based on content
 * - Suggests or assigns to the right person
 * - Sets priority based on urgency/impact
 * - Optionally adds a comment explaining the triage
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { AgentContext } from '../types.js';

/**
 * Context for triage agent execution
 */
export interface TriageContext extends AgentContext {
  issueId: string;
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  customPrompt?: string;
  autoAssignLabels: boolean;
  autoAssignUsers: boolean;
  autoSetPriority: boolean;
  addTriageComment: boolean;
}

/**
 * Result of triage agent execution
 */
export interface TriageResult {
  success: boolean;
  labels?: string[];
  assigneeId?: string;
  assigneeUsername?: string;
  priority?: 'none' | 'low' | 'medium' | 'high' | 'urgent';
  reasoning?: string;
  errorMessage?: string;
  tokensUsed?: number;
}

export const TRIAGE_AGENT_INSTRUCTIONS = `You are wit AI Triage Agent - an intelligent assistant that helps categorize and prioritize new issues.

## Your Role
When a new issue is created, you analyze its content and help organize it by:
1. Suggesting or applying appropriate labels based on the issue content
2. Identifying who should work on this issue (if user assignment is enabled)
3. Setting the priority based on urgency and impact
4. Providing a brief explanation of your triage decisions

## How to Analyze Issues
1. Read the issue title and body carefully
2. Identify the type of issue (bug, feature request, documentation, question, etc.)
3. Look for keywords that indicate urgency or impact
4. Consider who in the team would be best suited to handle this

## Priority Guidelines
- **urgent**: Security issues, data loss, production outages, critical bugs affecting many users
- **high**: Important bugs, blocking issues, high-impact features
- **medium**: Regular bugs, standard feature requests, improvements
- **low**: Minor improvements, nice-to-haves, cosmetic issues
- **none**: Questions, discussions, or unclear issues needing more info

## Response Style
- Be concise and actionable
- Explain your reasoning briefly
- If the issue lacks information, note what's missing
- Be objective and consistent in your categorization`;

/**
 * Create a tool to get available labels for the repository
 */
function createGetLabelsTool(context: TriageContext) {
  return createTool({
    id: 'get-labels',
    description: 'Get the list of available labels in this repository',
    inputSchema: z.object({}),
    outputSchema: z.object({
      labels: z.array(z.object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
        color: z.string(),
      })),
      errorMessage: z.string().optional(),
    }),
    execute: async () => {
      try {
        const { labelModel } = await import('../../db/models/index.js');
        const labels = await labelModel.listByRepo(context.repoId);
        return {
          labels: labels.map(l => ({
            id: l.id,
            name: l.name,
            description: l.description || undefined,
            color: l.color,
          })),
        };
      } catch (error) {
        return { labels: [], errorMessage: error instanceof Error ? error.message : 'Failed to get labels' };
      }
    },
  });
}

/**
 * Create a tool to get repository collaborators for assignment suggestions
 */
function createGetCollaboratorsTool(context: TriageContext) {
  return createTool({
    id: 'get-collaborators',
    description: 'Get the list of collaborators who can be assigned to issues',
    inputSchema: z.object({}),
    outputSchema: z.object({
      collaborators: z.array(z.object({
        id: z.string(),
        username: z.string(),
        name: z.string().optional(),
        permission: z.string(),
      })),
      errorMessage: z.string().optional(),
    }),
    execute: async (): Promise<{ collaborators: Array<{ id: string; username: string; name?: string; permission: string }>; errorMessage?: string }> => {
      try {
        const { collaboratorModel } = await import('../../db/models/index.js');
        const collaborators = await collaboratorModel.listByRepo(context.repoId);
        return {
          collaborators: collaborators.map(c => ({
            id: c.userId,
            username: c.user.username || '',
            name: c.user.name || undefined,
            permission: c.permission,
          })),
        };
      } catch (error) {
        return { collaborators: [], errorMessage: error instanceof Error ? error.message : 'Failed to get collaborators' };
      }
    },
  });
}

/**
 * Create a tool to apply labels to the issue
 */
function createApplyLabelsTool(context: TriageContext) {
  return createTool({
    id: 'apply-labels',
    description: 'Apply labels to the issue. Only use this if auto-assign labels is enabled.',
    inputSchema: z.object({
      labelNames: z.array(z.string()).describe('Names of the labels to apply'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      appliedLabels: z.array(z.string()).optional(),
      errorMessage: z.string().optional(),
    }),
    execute: async ({ labelNames }): Promise<{ success: boolean; appliedLabels?: string[]; errorMessage?: string }> => {
      if (!context.autoAssignLabels) {
        return { success: false, appliedLabels: undefined, errorMessage: 'Auto-assign labels is not enabled' };
      }

      try {
        const { labelModel, issueLabelModel } = await import('../../db/models/index.js');
        const appliedLabels: string[] = [];

        for (const name of labelNames) {
          const label = await labelModel.findByName(context.repoId, name);
          if (label) {
            await issueLabelModel.add(context.issueId, label.id);
            appliedLabels.push(name);
          }
        }

        return { success: true, appliedLabels, errorMessage: undefined };
      } catch (error) {
        return { success: false, appliedLabels: undefined, errorMessage: error instanceof Error ? error.message : 'Failed to apply labels' };
      }
    },
  });
}

/**
 * Create a tool to set issue priority
 */
function createSetPriorityTool(context: TriageContext) {
  return createTool({
    id: 'set-priority',
    description: 'Set the priority of the issue. Only use this if auto-set priority is enabled.',
    inputSchema: z.object({
      priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']).describe('Priority level'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      errorMessage: z.string().optional(),
    }),
    execute: async ({ priority }) => {
      if (!context.autoSetPriority) {
        return { success: false, errorMessage: 'Auto-set priority is not enabled' };
      }

      try {
        const { issueModel } = await import('../../db/models/index.js');
        await issueModel.updatePriority(context.issueId, priority);
        return { success: true, errorMessage: undefined };
      } catch (error) {
        return { success: false, errorMessage: error instanceof Error ? error.message : 'Failed to set priority' };
      }
    },
  });
}

/**
 * Create a tool to assign the issue to a user
 */
function createAssignUserTool(context: TriageContext) {
  return createTool({
    id: 'assign-user',
    description: 'Assign the issue to a user. Only use this if auto-assign users is enabled.',
    inputSchema: z.object({
      userId: z.string().describe('ID of the user to assign'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      errorMessage: z.string().optional(),
    }),
    execute: async ({ userId }) => {
      if (!context.autoAssignUsers) {
        return { success: false, errorMessage: 'Auto-assign users is not enabled' };
      }

      try {
        const { issueModel } = await import('../../db/models/index.js');
        await issueModel.assign(context.issueId, userId);
        return { success: true, errorMessage: undefined };
      } catch (error) {
        return { success: false, errorMessage: error instanceof Error ? error.message : 'Failed to assign user' };
      }
    },
  });
}

/**
 * Create a tool to add a triage comment to the issue
 */
function createAddCommentTool(context: TriageContext) {
  return createTool({
    id: 'add-triage-comment',
    description: 'Add a comment explaining the triage decisions. Only use this if add triage comment is enabled.',
    inputSchema: z.object({
      comment: z.string().describe('The triage explanation comment'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      errorMessage: z.string().optional(),
    }),
    execute: async ({ comment }) => {
      if (!context.addTriageComment) {
        return { success: false, errorMessage: 'Add triage comment is not enabled' };
      }

      try {
        const { issueCommentModel } = await import('../../db/models/index.js');
        // Use a system user ID for triage comments or the repo owner
        await issueCommentModel.create({
          issueId: context.issueId,
          userId: context.userId, // This will be set to a bot user or repo owner
          body: `**Triage Agent Analysis**\n\n${comment}`,
        });
        return { success: true, errorMessage: undefined };
      } catch (error) {
        return { success: false, errorMessage: error instanceof Error ? error.message : 'Failed to add comment' };
      }
    },
  });
}

/**
 * Create a Triage Agent for analyzing and categorizing issues
 */
export function createTriageAgent(context: TriageContext, model: string = 'anthropic/claude-sonnet-4-20250514'): Agent {
  const customInstructions = context.customPrompt
    ? `${TRIAGE_AGENT_INSTRUCTIONS}\n\n## Custom Instructions from Repository Owner\n${context.customPrompt}`
    : TRIAGE_AGENT_INSTRUCTIONS;

  return new Agent({
    id: `wit-triage-${context.repoId}-${context.issueId}`,
    name: 'wit Triage Agent',
    description: 'An agent that automatically triages new issues',
    instructions: customInstructions,
    model,
    tools: {
      getLabels: createGetLabelsTool(context),
      getCollaborators: createGetCollaboratorsTool(context),
      applyLabels: createApplyLabelsTool(context),
      setPriority: createSetPriorityTool(context),
      assignUser: createAssignUserTool(context),
      addTriageComment: createAddCommentTool(context),
    },
  });
}

/**
 * Run the triage agent on an issue
 */
export async function runTriageAgent(context: TriageContext, model?: string): Promise<TriageResult> {
  try {
    const agent = createTriageAgent(context, model);

    const enabledActions: string[] = [];
    if (context.autoAssignLabels) enabledActions.push('apply labels');
    if (context.autoSetPriority) enabledActions.push('set priority');
    if (context.autoAssignUsers) enabledActions.push('assign to a team member');
    if (context.addTriageComment) enabledActions.push('add a comment explaining your decisions');

    const prompt = `Please triage this new issue:

**Issue #${context.issueNumber}: ${context.issueTitle}**

${context.issueBody || '(No description provided)'}

---

You are allowed to: ${enabledActions.join(', ')}.

First, get the available labels${context.autoAssignUsers ? ' and collaborators' : ''} for this repository.
Then analyze the issue and take appropriate actions based on what you find.`;

    const response = await agent.generate(prompt);

    // Parse the result - the agent will have called tools to apply labels, etc.
    // The response text contains the reasoning
    return {
      success: true,
      reasoning: response.text,
      // Note: The actual labels, assignee, priority are set via tools
      // We could track them by enhancing the tool implementations
    };
  } catch (error) {
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error during triage',
    };
  }
}
