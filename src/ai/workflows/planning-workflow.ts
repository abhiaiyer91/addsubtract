/**
 * Planning Workflow
 * 
 * Orchestrates the planning workflow system:
 * 1. Planning Phase: User iterates with AI on a plan
 * 2. Task Generation: Plan is converted to discrete tasks
 * 3. Execution Phase: Tasks are executed by parallel coding agents
 * 
 * This is the main coordination layer that manages:
 * - The planning loop (iterate until user is satisfied)
 * - Task scheduling (respecting dependencies and concurrency limits)
 * - Parallel agent execution
 * - Result aggregation
 */

import { z } from 'zod';
import {
  planningSessionModel,
  planningMessageModel,
  agentTaskModel,
  agentSessionModel,
  repoModel,
  getPlanningSessionFull,
} from '../../db/models/index.js';
import type {
  PlanningSession,
  AgentTask,
  AgentTaskStatus,
  AgentTaskPriority,
} from '../../db/schema.js';
import { createPlanningAgent, parseTasksFromResponse, type TaskGeneration } from '../agents/planning-agent.js';
import { createCodeAgent } from '../agents/code-agent.js';
import type { AgentContext, AgentMode } from '../types.js';

// ============ INPUT/OUTPUT SCHEMAS ============

export const StartPlanningInputSchema = z.object({
  userId: z.string(),
  repoId: z.string().uuid(),
  planningPrompt: z.string().min(1).max(50000),
  title: z.string().optional(),
  baseBranch: z.string().optional().default('main'),
  maxConcurrency: z.number().min(1).max(10).optional().default(3),
});

export type StartPlanningInput = z.infer<typeof StartPlanningInputSchema>;

export const PlanningIterationInputSchema = z.object({
  sessionId: z.string().uuid(),
  userMessage: z.string().min(1).max(50000),
});

export type PlanningIterationInput = z.infer<typeof PlanningIterationInputSchema>;

export const FinalizeTasksInputSchema = z.object({
  sessionId: z.string().uuid(),
  tasks: z.array(z.object({
    title: z.string(),
    description: z.string(),
    targetFiles: z.array(z.string()).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    dependsOn: z.array(z.number()).optional(),
  })),
});

export type FinalizeTasksInput = z.infer<typeof FinalizeTasksInputSchema>;

export const ExecuteTasksInputSchema = z.object({
  sessionId: z.string().uuid(),
});

export type ExecuteTasksInput = z.infer<typeof ExecuteTasksInputSchema>;

// ============ HELPER FUNCTIONS ============

/**
 * Get repository disk path
 */
function getRepoDiskPath(ownerUsername: string, repoName: string): string {
  const reposDir = process.env.REPOS_DIR || './repos';
  return `${reposDir}/${ownerUsername}/${repoName}.git`;
}

/**
 * Create agent context for a repository
 */
async function createAgentContext(
  repoId: string,
  userId: string,
  mode: AgentMode = 'code'
): Promise<AgentContext | null> {
  const repoWithOwner = await repoModel.findByIdWithOwner(repoId);
  if (!repoWithOwner) return null;

  const ownerUsername = 'username' in repoWithOwner.owner
    ? (repoWithOwner.owner.username || repoWithOwner.owner.name)
    : repoWithOwner.owner.name;

  return {
    repoId,
    owner: ownerUsername,
    repoName: repoWithOwner.name,
    repoPath: getRepoDiskPath(ownerUsername, repoWithOwner.name),
    userId,
    mode,
  };
}

// ============ PLANNING PHASE ============

/**
 * Start a new planning session
 */
export async function startPlanningSession(
  input: StartPlanningInput
): Promise<PlanningSession> {
  // Create the planning session
  const session = await planningSessionModel.create({
    userId: input.userId,
    repoId: input.repoId,
    planningPrompt: input.planningPrompt,
    title: input.title,
    baseBranch: input.baseBranch,
    maxConcurrency: input.maxConcurrency,
    status: 'planning',
    iterationCount: 0,
  });

  // Create agent context
  const context = await createAgentContext(input.repoId, input.userId, 'code');
  if (!context) {
    throw new Error('Repository not found');
  }

  // Create planning agent and get initial response
  const agent = createPlanningAgent(context);

  // Save the initial user message
  await planningMessageModel.create({
    sessionId: session.id,
    role: 'user',
    content: input.planningPrompt,
    iteration: 0,
  });

  // Get initial plan from AI
  const prompt = `I need help planning the following task:

${input.planningPrompt}

Please analyze this request and:
1. Ask any clarifying questions you have
2. Explore the codebase to understand the current structure
3. Propose an initial plan with discrete tasks

Start by understanding the codebase structure and then propose your plan.`;

  try {
    const result = await agent.generate(prompt);

    // Save AI response
    await planningMessageModel.create({
      sessionId: session.id,
      role: 'assistant',
      content: result.text,
      iteration: 0,
    });

    // Update session with initial plan
    await planningSessionModel.update(session.id, {
      currentPlan: result.text,
    });
  } catch (error) {
    console.error('[Planning Workflow] Initial planning failed:', error);
    
    // Save error message
    await planningMessageModel.create({
      sessionId: session.id,
      role: 'system',
      content: `Error during initial planning: ${error instanceof Error ? error.message : 'Unknown error'}`,
      iteration: 0,
    });
  }

  return planningSessionModel.findById(session.id) as Promise<PlanningSession>;
}

/**
 * Continue the planning loop with user feedback
 */
export async function iteratePlan(
  input: PlanningIterationInput
): Promise<{ session: PlanningSession; response: string }> {
  const session = await planningSessionModel.findById(input.sessionId);
  if (!session) {
    throw new Error('Planning session not found');
  }

  if (session.status !== 'planning') {
    throw new Error(`Cannot iterate on session in status: ${session.status}`);
  }

  // Increment iteration
  const newIteration = session.iterationCount + 1;
  await planningSessionModel.update(session.id, {
    iterationCount: newIteration,
  });

  // Create agent context
  const context = await createAgentContext(session.repoId, session.userId, 'code');
  if (!context) {
    throw new Error('Repository not found');
  }

  // Create planning agent
  const agent = createPlanningAgent(context);

  // Get conversation history
  const messages = await planningMessageModel.getRecentMessages(session.id, 20);
  
  // Build context prompt
  let contextPrompt = 'Previous planning conversation:\n\n';
  for (const msg of messages) {
    const role = msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Planning Agent' : 'System';
    contextPrompt += `${role}:\n${msg.content}\n\n`;
  }

  // Save user message
  await planningMessageModel.create({
    sessionId: session.id,
    role: 'user',
    content: input.userMessage,
    iteration: newIteration,
  });

  // Build prompt
  const prompt = `${contextPrompt}---

User's new message:
${input.userMessage}

Please respond to the user's feedback and refine the plan accordingly. If the user seems satisfied, you can finalize the plan by outputting a JSON task list.`;

  try {
    const result = await agent.generate(prompt);

    // Save AI response
    await planningMessageModel.create({
      sessionId: session.id,
      role: 'assistant',
      content: result.text,
      iteration: newIteration,
    });

    // Update session with refined plan
    await planningSessionModel.update(session.id, {
      currentPlan: result.text,
    });

    const updatedSession = await planningSessionModel.findById(session.id);
    return {
      session: updatedSession!,
      response: result.text,
    };
  } catch (error) {
    const errorMessage = `Error during planning iteration: ${error instanceof Error ? error.message : 'Unknown error'}`;
    
    // Save error message
    await planningMessageModel.create({
      sessionId: session.id,
      role: 'system',
      content: errorMessage,
      iteration: newIteration,
    });

    throw new Error(errorMessage);
  }
}

/**
 * Generate tasks from the current plan using AI
 */
export async function generateTasks(
  sessionId: string
): Promise<TaskGeneration | null> {
  const session = await planningSessionModel.findById(sessionId);
  if (!session) {
    throw new Error('Planning session not found');
  }

  if (!session.currentPlan) {
    throw new Error('No plan to generate tasks from');
  }

  // Create agent context
  const context = await createAgentContext(session.repoId, session.userId, 'code');
  if (!context) {
    throw new Error('Repository not found');
  }

  // Create planning agent
  const agent = createPlanningAgent(context);

  const prompt = `Based on our planning discussion, please generate a final structured task list.

Current Plan:
${session.currentPlan}

Please output the tasks as a JSON object with this exact structure:

\`\`\`json
{
  "tasks": [
    {
      "title": "Brief task title",
      "description": "Detailed instructions for the coding agent",
      "targetFiles": ["file1.ts"],
      "priority": "high|medium|low",
      "dependsOn": []
    }
  ],
  "summary": "Brief summary of the overall plan"
}
\`\`\`

Requirements:
- Each task should be self-contained and executable by an independent agent
- Include clear, detailed descriptions
- List target files when known
- Set appropriate priorities (critical for blockers, high for important, medium for standard, low for nice-to-have)
- Use dependsOn to specify which tasks must complete first (use 1-indexed task numbers)
- Minimize dependencies to maximize parallelism`;

  const result = await agent.generate(prompt);
  return parseTasksFromResponse(result.text);
}

// ============ TASK FINALIZATION ============

/**
 * Finalize tasks and prepare for execution
 */
export async function finalizeTasks(
  input: FinalizeTasksInput
): Promise<AgentTask[]> {
  const session = await planningSessionModel.findById(input.sessionId);
  if (!session) {
    throw new Error('Planning session not found');
  }

  if (session.status !== 'planning') {
    throw new Error(`Cannot finalize tasks for session in status: ${session.status}`);
  }

  // Delete any existing tasks
  await agentTaskModel.deleteBySession(input.sessionId);

  // Create new tasks
  const tasksToCreate = input.tasks.map((task, index) => ({
    sessionId: input.sessionId,
    taskNumber: index + 1,
    title: task.title,
    description: task.description,
    targetFiles: task.targetFiles ? JSON.stringify(task.targetFiles) : null,
    priority: (task.priority || 'medium') as AgentTaskPriority,
    dependsOn: task.dependsOn?.length
      ? JSON.stringify(task.dependsOn.map(n => input.tasks[n - 1]?.title))
      : null,
    status: 'pending' as AgentTaskStatus,
  }));

  const createdTasks = await agentTaskModel.createBatch(tasksToCreate);

  // Update dependencies to use actual task IDs
  for (const task of createdTasks) {
    if (!task.dependsOn) continue;
    
    const depTitles: string[] = JSON.parse(task.dependsOn);
    const depIds = createdTasks
      .filter(t => depTitles.includes(t.title))
      .map(t => t.id);
    
    if (depIds.length > 0) {
      await agentTaskModel.update(task.id, {
        // Store as JSON array of IDs
      });
    }
  }

  // Update session status to ready
  await planningSessionModel.update(input.sessionId, {
    status: 'ready',
  });

  return agentTaskModel.listBySession(input.sessionId);
}

// ============ EXECUTION PHASE ============

/**
 * Task execution result
 */
export interface TaskExecutionResult {
  taskId: string;
  success: boolean;
  summary?: string;
  filesChanged?: Array<{ path: string; action: string }>;
  commitSha?: string;
  error?: string;
}

/**
 * Execute a single task using a coding agent
 */
async function executeTask(
  task: AgentTask,
  session: PlanningSession,
  context: AgentContext
): Promise<TaskExecutionResult> {
  try {
    // Create agent session for this task
    const agentSession = await agentSessionModel.create({
      userId: session.userId,
      repoId: session.repoId,
      branch: session.baseBranch,
      title: `Task: ${task.title}`,
      status: 'active',
      mode: 'code',
    });

    // Update task with agent session ID and mark as running
    await agentTaskModel.start(task.id, agentSession.id, `task-${task.taskNumber}-${Date.now().toString(36)}`);

    // Create coding agent
    const codeAgent = createCodeAgent(context);

    // Build execution prompt
    const targetFiles = task.targetFiles ? JSON.parse(task.targetFiles) : [];
    const prompt = `You are executing a task as part of a larger plan.

## Task: ${task.title}

${task.description}

${targetFiles.length > 0 ? `Target files: ${targetFiles.join(', ')}` : ''}

## Instructions:
1. Read any relevant files first to understand the context
2. Implement the required changes
3. All changes are auto-committed

Please complete this task now.`;

    const result = await codeAgent.generate(prompt);

    // Mark task as completed
    await agentTaskModel.complete(task.id, {
      summary: result.text.slice(0, 1000),
    });

    // Mark agent session as completed
    await agentSessionModel.update(agentSession.id, {
      status: 'completed',
    });

    return {
      taskId: task.id,
      success: true,
      summary: result.text.slice(0, 500),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Mark task as failed
    await agentTaskModel.fail(task.id, errorMessage);

    return {
      taskId: task.id,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Execute all tasks for a planning session
 */
export async function executeTasks(
  input: ExecuteTasksInput
): Promise<{
  session: PlanningSession;
  results: TaskExecutionResult[];
}> {
  const session = await planningSessionModel.findById(input.sessionId);
  if (!session) {
    throw new Error('Planning session not found');
  }

  if (session.status !== 'ready') {
    throw new Error(`Cannot execute tasks for session in status: ${session.status}`);
  }

  // Start execution
  await planningSessionModel.startExecution(input.sessionId);

  // Create agent context
  const context = await createAgentContext(session.repoId, session.userId, 'code');
  if (!context) {
    throw new Error('Repository not found');
  }

  const results: TaskExecutionResult[] = [];
  const maxConcurrency = session.maxConcurrency || 3;

  // Execute tasks respecting dependencies and concurrency
  while (true) {
    // Get ready tasks
    const readyTasks = await agentTaskModel.getReadyTasks(input.sessionId);
    const runningTasks = await agentTaskModel.getRunningTasks(input.sessionId);

    // Check if we're done
    if (readyTasks.length === 0 && runningTasks.length === 0) {
      break;
    }

    // Calculate how many more tasks we can start
    const slotsAvailable = maxConcurrency - runningTasks.length;
    if (slotsAvailable <= 0) {
      // Wait a bit for running tasks to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      continue;
    }

    // Start tasks up to concurrency limit
    const tasksToStart = readyTasks.slice(0, slotsAvailable);
    
    // Execute tasks in parallel
    const taskPromises = tasksToStart.map(task => 
      executeTask(task, session, context)
    );

    const batchResults = await Promise.all(taskPromises);
    results.push(...batchResults);

    // Check if any critical tasks failed
    const failedCritical = batchResults.some(r => {
      const task = tasksToStart.find(t => t.id === r.taskId);
      return !r.success && task?.priority === 'critical';
    });

    if (failedCritical) {
      // Cancel remaining tasks and fail the session
      await agentTaskModel.cancelAllPending(input.sessionId);
      await planningSessionModel.fail(
        input.sessionId,
        'Execution stopped due to critical task failure'
      );
      
      const finalSession = await planningSessionModel.findById(input.sessionId);
      return { session: finalSession!, results };
    }
  }

  // Generate execution summary
  const taskCounts = await agentTaskModel.countByStatus(input.sessionId);
  const summary = `Completed ${taskCounts.completed} task(s), ${taskCounts.failed} failed, ${taskCounts.cancelled} cancelled.`;

  // Complete the session
  await planningSessionModel.complete(input.sessionId, summary);

  const finalSession = await planningSessionModel.findById(input.sessionId);
  return { session: finalSession!, results };
}

// ============ SESSION MANAGEMENT ============

/**
 * Cancel a planning session
 */
export async function cancelSession(sessionId: string): Promise<PlanningSession> {
  const session = await planningSessionModel.findById(sessionId);
  if (!session) {
    throw new Error('Planning session not found');
  }

  // Cancel any pending/running tasks
  await agentTaskModel.cancelAllPending(sessionId);

  // Cancel the session
  await planningSessionModel.cancel(sessionId);

  return planningSessionModel.findById(sessionId) as Promise<PlanningSession>;
}

/**
 * Get full session details
 */
export async function getSessionDetails(sessionId: string) {
  return getPlanningSessionFull(sessionId);
}

// ============ EXPORTS ============

export {
  type PlanningSession,
  type AgentTask,
  type TaskGeneration,
};
