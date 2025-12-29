/**
 * Orchestrator Agent
 * 
 * The meta-agent that understands user intent and delegates to specialized agents.
 * This is the main entry point for complex AI interactions.
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { AgentContext } from '../types.js';
import { createCodeAgent } from './code-agent.js';
import { createPMAgent } from './pm-agent.js';
import { createReviewAgent } from './review-agent.js';
import { createSearchAgent } from './search-agent.js';
import { buildContext, formatContextForPrompt } from '../knowledge/context-builder.js';

export const ORCHESTRATOR_INSTRUCTIONS = `You are the wit AI Orchestrator - the central intelligence that coordinates specialized agents to help developers.

## Your Role

You understand user intent and delegate tasks to the right specialized agents. For simple questions, answer directly. For complex tasks, break them down and coordinate multiple agents.

## Available Agents

### 1. Code Agent
**Use for:** Writing code, editing files, implementing features, fixing bugs, refactoring
**Capabilities:** Read/write files, run commands, create commits, manage branches

### 2. PM Agent  
**Use for:** Project management tasks
**Capabilities:** Create/update issues, create PRs, manage labels, track progress

### 3. Review Agent
**Use for:** Code quality and review
**Capabilities:** Review PRs, security analysis, performance review, suggest improvements

### 4. Search Agent
**Use for:** Finding and understanding code
**Capabilities:** Semantic search, find patterns, analyze dependencies, answer questions about code

## Decision Framework

1. **Understand Intent**: What is the user really trying to accomplish?
2. **Assess Complexity**: Is this a single-agent task or multi-agent?
3. **Choose Strategy**:
   - Simple question about code → Search Agent
   - Write/edit code → Code Agent
   - Create issue/PR → PM Agent
   - Review changes → Review Agent
   - Complex feature → Coordinate multiple agents

## Multi-Agent Workflows

For complex tasks, coordinate agents in sequence:

**"Implement feature X":**
1. Search Agent: Understand existing patterns
2. Code Agent: Write the implementation
3. Review Agent: Check quality
4. PM Agent: Create PR

**"Fix bug Y":**
1. Search Agent: Find relevant code
2. Code Agent: Fix the bug
3. Review Agent: Verify fix is correct

**"Review this PR":**
1. Review Agent: Comprehensive review
2. Search Agent: Find similar past issues (if needed)

## Response Guidelines

- Be concise but informative
- Explain your delegation decisions briefly
- Synthesize results from multiple agents into a coherent response
- If agents disagree, present both views
- Suggest next steps when appropriate`;

/**
 * Create a delegation tool for an agent
 */
function createDelegationTool(
  agentType: string,
  agentFactory: () => Agent,
  description: string
) {
  return createTool({
    id: `delegate-to-${agentType}`,
    description: `Delegate a task to the ${agentType} agent. ${description}`,
    inputSchema: z.object({
      task: z.string().describe('The task to delegate, be specific'),
      context: z.string().optional().describe('Additional context from previous agents'),
      priority: z.enum(['low', 'normal', 'high']).optional().default('normal'),
    }),
    outputSchema: z.object({
      result: z.string(),
      success: z.boolean(),
      suggestions: z.array(z.string()).optional(),
    }),
    execute: async ({ task, context }) => {
      try {
        const agent = agentFactory();
        const prompt = context 
          ? `${task}\n\nContext from previous analysis:\n${context}`
          : task;
        
        const response = await agent.generate(prompt);
        
        return {
          result: response.text,
          success: true,
        };
      } catch (error) {
        return {
          result: error instanceof Error ? error.message : 'Agent failed',
          success: false,
        };
      }
    },
  });
}

/**
 * Tool to get knowledge context
 */
function createGetContextTool(repoId: string) {
  return createTool({
    id: 'get-codebase-context',
    description: 'Get relevant context from the codebase knowledge base for a query',
    inputSchema: z.object({
      query: z.string().describe('The question or topic to find context for'),
    }),
    outputSchema: z.object({
      context: z.string(),
      summary: z.string(),
    }),
    execute: async ({ query }) => {
      try {
        const aiContext = await buildContext(query, repoId);
        const formatted = formatContextForPrompt(aiContext);
        
        return {
          context: formatted,
          summary: `Found ${aiContext.relevantCode.length} code snippets, ${aiContext.relevantDocs.length} docs, ${aiContext.relevantHistory.length} history items`,
        };
      } catch (error) {
        return {
          context: '',
          summary: 'Failed to retrieve context',
        };
      }
    },
  });
}

/**
 * Tool to plan a complex task
 */
const planTaskTool = createTool({
  id: 'plan-task',
  description: 'Break down a complex task into steps with agent assignments',
  inputSchema: z.object({
    task: z.string().describe('The complex task to plan'),
  }),
  outputSchema: z.object({
    steps: z.array(z.object({
      order: z.number(),
      description: z.string(),
      agent: z.enum(['code', 'pm', 'review', 'search']),
      dependsOn: z.array(z.number()).optional(),
    })),
    reasoning: z.string(),
  }),
  execute: async ({ task }) => {
    // This is a planning tool - the AI will fill in the actual plan
    // We just provide the structure
    return {
      steps: [
        { order: 1, description: 'Analyze task requirements', agent: 'search' as const },
        { order: 2, description: 'Execute main task', agent: 'code' as const, dependsOn: [1] },
        { order: 3, description: 'Verify results', agent: 'review' as const, dependsOn: [2] },
      ],
      reasoning: 'Default plan - AI should override with specific steps',
    };
  },
});

/**
 * Create the orchestrator agent for a repository
 */
export function createOrchestratorAgent(context: AgentContext, model: string = 'anthropic/claude-opus-4-5'): Agent {
  // Create lazy agent factories
  const codeAgentFactory = () => createCodeAgent(context, 'anthropic/claude-sonnet-4-20250514');
  const pmAgentFactory = () => createPMAgent(context, 'anthropic/claude-sonnet-4-20250514');
  const reviewAgentFactory = () => createReviewAgent(context, 'anthropic/claude-sonnet-4-20250514');
  const searchAgentFactory = () => createSearchAgent(context, 'anthropic/claude-sonnet-4-20250514');

  return new Agent({
    id: `wit-orchestrator-${context.repoId}`,
    name: 'wit Orchestrator',
    description: 'Coordinates specialized agents to accomplish complex tasks',
    instructions: ORCHESTRATOR_INSTRUCTIONS,
    model,
    tools: {
      // Delegation tools
      delegateToCode: createDelegationTool(
        'code',
        codeAgentFactory,
        'For writing, editing, and managing code files.'
      ),
      delegateToPM: createDelegationTool(
        'pm',
        pmAgentFactory,
        'For creating issues, PRs, and project management.'
      ),
      delegateToReview: createDelegationTool(
        'review',
        reviewAgentFactory,
        'For code review, security analysis, and quality checks.'
      ),
      delegateToSearch: createDelegationTool(
        'search',
        searchAgentFactory,
        'For finding and understanding code in the codebase.'
      ),
      // Context and planning
      getContext: createGetContextTool(context.repoId),
      planTask: planTaskTool,
    },
  });
}
