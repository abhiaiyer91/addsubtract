/**
 * Planning Workflow (Mastra-based)
 * 
 * A multi-step Mastra workflow that orchestrates the planning and execution
 * of parallel coding agent tasks.
 * 
 * Workflow Phases:
 * 1. Planning: Iterate with AI to create implementation plan
 * 2. Task Generation: Convert plan to structured tasks
 * 3. Execution: Run parallel coding agents
 * 
 * Uses Mastra's workflow primitives for:
 * - Step-based execution with proper data flow
 * - Built-in error handling and observability
 * - Agent integration
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  planningSessionModel,
  planningMessageModel,
  agentTaskModel,
  agentSessionModel,
  repoModel,
} from '../../db/models/index.js';
import type {
  AgentTaskStatus,
  AgentTaskPriority,
} from '../../db/schema.js';

// =============================================================================
// Input/Output Schemas
// =============================================================================

export const PlanningWorkflowInputSchema = z.object({
  userId: z.string().describe('User ID'),
  repoId: z.string().uuid().describe('Repository ID'),
  planningPrompt: z.string().min(1).describe('Initial planning prompt'),
  title: z.string().optional().describe('Session title'),
  baseBranch: z.string().default('main').describe('Base branch for tasks'),
  maxConcurrency: z.number().min(1).max(10).default(3).describe('Max parallel agents'),
});

export type PlanningWorkflowInput = z.infer<typeof PlanningWorkflowInputSchema>;

export const TaskSchema = z.object({
  title: z.string(),
  description: z.string(),
  targetFiles: z.array(z.string()).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  dependsOn: z.array(z.number()).optional(),
});

export const PlanningWorkflowOutputSchema = z.object({
  success: z.boolean(),
  sessionId: z.string().uuid(),
  status: z.enum(['planning', 'ready', 'executing', 'completed', 'failed', 'cancelled']),
  plan: z.string().optional(),
  tasks: z.array(z.object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
    resultSummary: z.string().optional(),
  })).optional(),
  taskCounts: z.object({
    total: z.number(),
    completed: z.number(),
    failed: z.number(),
    running: z.number(),
  }).optional(),
  summary: z.string().optional(),
  error: z.string().optional(),
});

export type PlanningWorkflowOutput = z.infer<typeof PlanningWorkflowOutputSchema>;

// =============================================================================
// Helper Functions
// =============================================================================

function getRepoDiskPath(ownerUsername: string, repoName: string): string {
  const reposDir = process.env.REPOS_DIR || './repos';
  return `${reposDir}/${ownerUsername}/${repoName}.git`;
}

async function getRepoContext(repoId: string): Promise<{
  owner: string;
  repoName: string;
  repoPath: string;
} | null> {
  const repoWithOwner = await repoModel.findByIdWithOwner(repoId);
  if (!repoWithOwner) return null;

  const ownerUsername = 'username' in repoWithOwner.owner
    ? (repoWithOwner.owner.username || repoWithOwner.owner.name)
    : repoWithOwner.owner.name;

  return {
    owner: ownerUsername,
    repoName: repoWithOwner.name,
    repoPath: getRepoDiskPath(ownerUsername, repoWithOwner.name),
  };
}

// =============================================================================
// Step 1: Initialize Planning Session
// =============================================================================

const initializePlanningStep = createStep({
  id: 'initialize-planning',
  inputSchema: PlanningWorkflowInputSchema,
  outputSchema: z.object({
    sessionId: z.string().uuid(),
    repoContext: z.object({
      owner: z.string(),
      repoName: z.string(),
      repoPath: z.string(),
    }),
    ...PlanningWorkflowInputSchema.shape,
  }),
  execute: async ({ inputData }) => {
    // Get repository context
    const repoContext = await getRepoContext(inputData.repoId);
    if (!repoContext) {
      throw new Error('Repository not found');
    }

    // Create planning session
    const session = await planningSessionModel.create({
      userId: inputData.userId,
      repoId: inputData.repoId,
      planningPrompt: inputData.planningPrompt,
      title: inputData.title,
      baseBranch: inputData.baseBranch,
      maxConcurrency: inputData.maxConcurrency,
      status: 'planning',
      iterationCount: 0,
    });

    // Save initial user message
    await planningMessageModel.create({
      sessionId: session.id,
      role: 'user',
      content: inputData.planningPrompt,
      iteration: 0,
    });

    return {
      sessionId: session.id,
      repoContext,
      ...inputData,
    };
  },
});

// =============================================================================
// Step 2: Generate Initial Plan with AI
// =============================================================================

const generateInitialPlanStep = createStep({
  id: 'generate-initial-plan',
  inputSchema: z.object({
    sessionId: z.string().uuid(),
    planningPrompt: z.string(),
    repoContext: z.object({
      owner: z.string(),
      repoName: z.string(),
      repoPath: z.string(),
    }),
    userId: z.string(),
    repoId: z.string(),
  }),
  outputSchema: z.object({
    sessionId: z.string().uuid(),
    plan: z.string(),
    repoContext: z.object({
      owner: z.string(),
      repoName: z.string(),
      repoPath: z.string(),
    }),
    userId: z.string(),
    repoId: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const { createPlanningAgent } = await import('../agents/planning-agent.js');

    // Create planning agent context
    const agentContext = {
      repoId: inputData.repoId,
      owner: inputData.repoContext.owner,
      repoName: inputData.repoContext.repoName,
      repoPath: inputData.repoContext.repoPath,
      userId: inputData.userId,
      mode: 'code' as const,
    };

    const agent = createPlanningAgent(agentContext);

    const prompt = `I need help planning the following task:

${inputData.planningPrompt}

Please:
1. Analyze the codebase structure using the available tools
2. Identify relevant patterns and conventions
3. Propose a structured implementation plan with discrete tasks
4. Each task should be self-contained and executable by an independent coding agent

Start by exploring the codebase, then propose your plan.`;

    const result = await agent.generate(prompt);

    // Save AI response
    await planningMessageModel.create({
      sessionId: inputData.sessionId,
      role: 'assistant',
      content: result.text,
      iteration: 0,
    });

    // Update session with plan
    await planningSessionModel.update(inputData.sessionId, {
      currentPlan: result.text,
    });

    return {
      sessionId: inputData.sessionId,
      plan: result.text,
      repoContext: inputData.repoContext,
      userId: inputData.userId,
      repoId: inputData.repoId,
    };
  },
});

// =============================================================================
// Step 3: Parse Tasks from Plan
// =============================================================================

const parseTasksStep = createStep({
  id: 'parse-tasks',
  inputSchema: z.object({
    sessionId: z.string().uuid(),
    plan: z.string(),
    repoContext: z.object({
      owner: z.string(),
      repoName: z.string(),
      repoPath: z.string(),
    }),
    userId: z.string(),
    repoId: z.string(),
  }),
  outputSchema: z.object({
    sessionId: z.string().uuid(),
    tasks: z.array(TaskSchema),
    repoContext: z.object({
      owner: z.string(),
      repoName: z.string(),
      repoPath: z.string(),
    }),
    userId: z.string(),
    repoId: z.string(),
    maxConcurrency: z.number(),
  }),
  execute: async ({ inputData, mastra }) => {
    const { createPlanningAgent, parseTasksFromResponse } = await import('../agents/planning-agent.js');

    const agentContext = {
      repoId: inputData.repoId,
      owner: inputData.repoContext.owner,
      repoName: inputData.repoContext.repoName,
      repoPath: inputData.repoContext.repoPath,
      userId: inputData.userId,
      mode: 'code' as const,
    };

    const agent = createPlanningAgent(agentContext);

    const prompt = `Based on this plan, generate a structured task list in JSON format:

${inputData.plan}

Output ONLY a JSON object with this exact structure:
\`\`\`json
{
  "tasks": [
    {
      "title": "Task title",
      "description": "Detailed instructions",
      "targetFiles": ["file1.ts"],
      "priority": "high",
      "dependsOn": []
    }
  ],
  "summary": "Brief plan summary"
}
\`\`\`

Requirements:
- Each task should be self-contained
- Include detailed descriptions
- Set appropriate priorities
- Use dependsOn for task ordering (1-indexed task numbers)`;

    const result = await agent.generate(prompt);
    const parsed = parseTasksFromResponse(result.text);

    if (!parsed || parsed.tasks.length === 0) {
      throw new Error('Failed to parse tasks from plan');
    }

    // Get session for maxConcurrency
    const session = await planningSessionModel.findById(inputData.sessionId);

    return {
      sessionId: inputData.sessionId,
      tasks: parsed.tasks,
      repoContext: inputData.repoContext,
      userId: inputData.userId,
      repoId: inputData.repoId,
      maxConcurrency: session?.maxConcurrency || 3,
    };
  },
});

// =============================================================================
// Step 4: Create Task Records
// =============================================================================

const createTaskRecordsStep = createStep({
  id: 'create-task-records',
  inputSchema: z.object({
    sessionId: z.string().uuid(),
    tasks: z.array(TaskSchema),
    repoContext: z.object({
      owner: z.string(),
      repoName: z.string(),
      repoPath: z.string(),
    }),
    userId: z.string(),
    repoId: z.string(),
    maxConcurrency: z.number(),
  }),
  outputSchema: z.object({
    sessionId: z.string().uuid(),
    taskIds: z.array(z.string().uuid()),
    repoContext: z.object({
      owner: z.string(),
      repoName: z.string(),
      repoPath: z.string(),
    }),
    userId: z.string(),
    repoId: z.string(),
    maxConcurrency: z.number(),
  }),
  execute: async ({ inputData }) => {
    // Delete any existing tasks
    await agentTaskModel.deleteBySession(inputData.sessionId);

    // Create task records
    const tasksToCreate = inputData.tasks.map((task, index) => ({
      sessionId: inputData.sessionId,
      taskNumber: index + 1,
      title: task.title,
      description: task.description,
      targetFiles: task.targetFiles ? JSON.stringify(task.targetFiles) : null,
      priority: (task.priority || 'medium') as AgentTaskPriority,
      dependsOn: task.dependsOn?.length
        ? JSON.stringify(task.dependsOn)
        : null,
      status: 'pending' as AgentTaskStatus,
    }));

    const createdTasks = await agentTaskModel.createBatch(tasksToCreate);

    // Update session status to ready
    await planningSessionModel.update(inputData.sessionId, {
      status: 'ready',
    });

    return {
      sessionId: inputData.sessionId,
      taskIds: createdTasks.map(t => t.id),
      repoContext: inputData.repoContext,
      userId: inputData.userId,
      repoId: inputData.repoId,
      maxConcurrency: inputData.maxConcurrency,
    };
  },
});

// =============================================================================
// Step 5: Execute Tasks in Parallel
// =============================================================================

const executeTasksStep = createStep({
  id: 'execute-tasks',
  inputSchema: z.object({
    sessionId: z.string().uuid(),
    taskIds: z.array(z.string().uuid()),
    repoContext: z.object({
      owner: z.string(),
      repoName: z.string(),
      repoPath: z.string(),
    }),
    userId: z.string(),
    repoId: z.string(),
    maxConcurrency: z.number(),
  }),
  outputSchema: z.object({
    sessionId: z.string().uuid(),
    results: z.array(z.object({
      taskId: z.string(),
      success: z.boolean(),
      summary: z.string().optional(),
      error: z.string().optional(),
    })),
    totalCompleted: z.number(),
    totalFailed: z.number(),
  }),
  execute: async ({ inputData }) => {
    const { createCodeAgent } = await import('../agents/code-agent.js');

    // Start execution
    await planningSessionModel.update(inputData.sessionId, {
      status: 'executing',
      startedAt: new Date(),
    });

    const results: Array<{ taskId: string; success: boolean; summary?: string; error?: string }> = [];
    const maxConcurrency = inputData.maxConcurrency;

    // Execute tasks respecting dependencies and concurrency
    while (true) {
      const readyTasks = await agentTaskModel.getReadyTasks(inputData.sessionId);
      const runningTasks = await agentTaskModel.getRunningTasks(inputData.sessionId);

      if (readyTasks.length === 0 && runningTasks.length === 0) {
        break;
      }

      const slotsAvailable = maxConcurrency - runningTasks.length;
      if (slotsAvailable <= 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      const tasksToStart = readyTasks.slice(0, slotsAvailable);

      // Execute tasks in parallel
      const taskPromises = tasksToStart.map(async (task) => {
        try {
          // Create agent session
          const agentSession = await agentSessionModel.create({
            userId: inputData.userId,
            repoId: inputData.repoId,
            title: `Task: ${task.title}`,
            status: 'active',
            mode: 'code',
          });

          // Mark task as running
          await agentTaskModel.start(
            task.id,
            agentSession.id,
            `task-${task.taskNumber}-${Date.now().toString(36)}`
          );

          // Create code agent
          const agentContext = {
            repoId: inputData.repoId,
            owner: inputData.repoContext.owner,
            repoName: inputData.repoContext.repoName,
            repoPath: inputData.repoContext.repoPath,
            userId: inputData.userId,
            mode: 'code' as const,
          };

          const codeAgent = createCodeAgent(agentContext);

          // Build execution prompt
          const targetFiles = task.targetFiles ? JSON.parse(task.targetFiles) : [];
          const prompt = `Execute this task:

## Task: ${task.title}

${task.description}

${targetFiles.length > 0 ? `Target files: ${targetFiles.join(', ')}` : ''}

Instructions:
1. Read relevant files first
2. Implement the required changes
3. Changes are auto-committed

Complete this task now.`;

          const result = await codeAgent.generate(prompt);

          // Mark task as completed
          await agentTaskModel.complete(task.id, {
            summary: result.text.slice(0, 1000),
          });

          await agentSessionModel.update(agentSession.id, { status: 'completed' });

          return {
            taskId: task.id,
            success: true,
            summary: result.text.slice(0, 500),
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          await agentTaskModel.fail(task.id, errorMessage);

          return {
            taskId: task.id,
            success: false,
            error: errorMessage,
          };
        }
      });

      const batchResults = await Promise.all(taskPromises);
      results.push(...batchResults);

      // Check for critical task failures
      const failedCritical = batchResults.some(r => {
        const task = tasksToStart.find(t => t.id === r.taskId);
        return !r.success && task?.priority === 'critical';
      });

      if (failedCritical) {
        await agentTaskModel.cancelAllPending(inputData.sessionId);
        break;
      }
    }

    const totalCompleted = results.filter(r => r.success).length;
    const totalFailed = results.filter(r => !r.success).length;

    return {
      sessionId: inputData.sessionId,
      results,
      totalCompleted,
      totalFailed,
    };
  },
});

// =============================================================================
// Step 6: Finalize Session
// =============================================================================

const finalizeSessionStep = createStep({
  id: 'finalize-session',
  inputSchema: z.object({
    sessionId: z.string().uuid(),
    results: z.array(z.object({
      taskId: z.string(),
      success: z.boolean(),
      summary: z.string().optional(),
      error: z.string().optional(),
    })),
    totalCompleted: z.number(),
    totalFailed: z.number(),
  }),
  outputSchema: PlanningWorkflowOutputSchema,
  execute: async ({ inputData }) => {
    const session = await planningSessionModel.findById(inputData.sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const taskCounts = await agentTaskModel.countByStatus(inputData.sessionId);
    const tasks = await agentTaskModel.listBySession(inputData.sessionId);

    const summary = `Execution complete. ${inputData.totalCompleted} task(s) completed, ${inputData.totalFailed} failed.`;

    // Determine final status
    const hasFailures = inputData.totalFailed > 0;
    const allFailed = inputData.totalCompleted === 0 && inputData.totalFailed > 0;

    if (allFailed) {
      await planningSessionModel.fail(inputData.sessionId, summary);
    } else {
      await planningSessionModel.complete(inputData.sessionId, summary);
    }

    const updatedSession = await planningSessionModel.findById(inputData.sessionId);

    return {
      success: !allFailed,
      sessionId: inputData.sessionId,
      status: updatedSession?.status || 'completed',
      plan: session.currentPlan || undefined,
      tasks: tasks.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        resultSummary: t.resultSummary || undefined,
      })),
      taskCounts: {
        total: Object.values(taskCounts).reduce((a, b) => a + b, 0),
        completed: taskCounts.completed || 0,
        failed: taskCounts.failed || 0,
        running: taskCounts.running || 0,
      },
      summary,
    };
  },
});

// =============================================================================
// Workflow Definition
// =============================================================================

export const planningWorkflow = createWorkflow({
  id: 'planning-workflow',
  inputSchema: PlanningWorkflowInputSchema,
  outputSchema: PlanningWorkflowOutputSchema,
})
  .then(initializePlanningStep)
  .then(generateInitialPlanStep)
  .then(parseTasksStep)
  .then(createTaskRecordsStep)
  .then(executeTasksStep)
  .then(finalizeSessionStep)
  .commit();

// =============================================================================
// Iteration Workflow (for refining plans)
// =============================================================================

export const PlanningIterationInputSchema = z.object({
  sessionId: z.string().uuid(),
  userMessage: z.string().min(1),
});

export type PlanningIterationInput = z.infer<typeof PlanningIterationInputSchema>;

export const PlanningIterationOutputSchema = z.object({
  sessionId: z.string().uuid(),
  response: z.string(),
  iteration: z.number(),
  hasTasks: z.boolean(),
});

export type PlanningIterationOutput = z.infer<typeof PlanningIterationOutputSchema>;

const iteratePlanStep = createStep({
  id: 'iterate-plan',
  inputSchema: PlanningIterationInputSchema,
  outputSchema: PlanningIterationOutputSchema,
  execute: async ({ inputData }) => {
    const { createPlanningAgent, parseTasksFromResponse } = await import('../agents/planning-agent.js');

    const session = await planningSessionModel.findById(inputData.sessionId);
    if (!session) {
      throw new Error('Planning session not found');
    }

    if (session.status !== 'planning') {
      throw new Error(`Cannot iterate on session in status: ${session.status}`);
    }

    const repoContext = await getRepoContext(session.repoId);
    if (!repoContext) {
      throw new Error('Repository not found');
    }

    // Increment iteration
    const newIteration = session.iterationCount + 1;
    await planningSessionModel.update(session.id, {
      iterationCount: newIteration,
    });

    // Get conversation history
    const messages = await planningMessageModel.getRecentMessages(session.id, 20);

    // Save user message
    await planningMessageModel.create({
      sessionId: session.id,
      role: 'user',
      content: inputData.userMessage,
      iteration: newIteration,
    });

    // Build context
    let contextPrompt = 'Previous planning conversation:\n\n';
    for (const msg of messages) {
      const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Planning Agent' : 'System';
      contextPrompt += `${role}:\n${msg.content}\n\n`;
    }

    const agentContext = {
      repoId: session.repoId,
      owner: repoContext.owner,
      repoName: repoContext.repoName,
      repoPath: repoContext.repoPath,
      userId: session.userId,
      mode: 'code' as const,
    };

    const agent = createPlanningAgent(agentContext);

    const prompt = `${contextPrompt}---

User's feedback:
${inputData.userMessage}

Respond to the feedback and refine the plan. If the user is satisfied, output a JSON task list.`;

    const result = await agent.generate(prompt);

    // Save AI response
    await planningMessageModel.create({
      sessionId: session.id,
      role: 'assistant',
      content: result.text,
      iteration: newIteration,
    });

    // Update session plan
    await planningSessionModel.update(session.id, {
      currentPlan: result.text,
    });

    // Check if response contains tasks
    const parsed = parseTasksFromResponse(result.text);
    const hasTasks = parsed !== null && parsed.tasks.length > 0;

    return {
      sessionId: session.id,
      response: result.text,
      iteration: newIteration,
      hasTasks,
    };
  },
});

export const planningIterationWorkflow = createWorkflow({
  id: 'planning-iteration',
  inputSchema: PlanningIterationInputSchema,
  outputSchema: PlanningIterationOutputSchema,
})
  .then(iteratePlanStep)
  .commit();
