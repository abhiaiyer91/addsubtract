/**
 * Multi-Agent Planning Workflow
 * 
 * A sophisticated workflow system for iterative task planning and parallel execution.
 * The workflow uses three specialized agents:
 * 
 * 1. **Planner Agent**: Analyzes complex tasks, breaks them into subtasks, identifies
 *    dependencies, and creates an optimized execution plan with parallel groups.
 * 
 * 2. **Executor Agents**: Run subtasks in parallel within each group, using the full
 *    code agent capabilities (file operations, commands, git).
 * 
 * 3. **Reviewer Agent**: Validates completed tasks, checks for errors, and determines
 *    if re-planning is needed for failed or incomplete tasks.
 * 
 * The workflow supports iterative refinement through multiple planning cycles,
 * allowing it to adapt to failures and changing requirements.
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Priority levels for subtasks
 */
export const TaskPriority = z.enum(['critical', 'high', 'medium', 'low']);
export type TaskPriority = z.infer<typeof TaskPriority>;

/**
 * Status of a subtask
 */
export const TaskStatus = z.enum(['pending', 'in_progress', 'completed', 'failed', 'skipped']);
export type TaskStatus = z.infer<typeof TaskStatus>;

/**
 * A subtask within the execution plan
 */
export const SubtaskSchema = z.object({
  id: z.string().describe('Unique identifier for the subtask'),
  title: z.string().describe('Short title for the subtask'),
  description: z.string().describe('Detailed description of what needs to be done'),
  priority: TaskPriority,
  estimatedEffort: z.enum(['trivial', 'small', 'medium', 'large']).describe('Estimated effort'),
  dependencies: z.array(z.string()).describe('IDs of subtasks that must complete first'),
  targetFiles: z.array(z.string()).optional().describe('Files this subtask will modify'),
  acceptanceCriteria: z.array(z.string()).describe('Criteria to verify task completion'),
  status: TaskStatus.default('pending'),
  result: z.string().optional().describe('Result or output of the task'),
  error: z.string().optional().describe('Error message if failed'),
});
export type Subtask = z.infer<typeof SubtaskSchema>;

/**
 * A group of subtasks that can be executed in parallel
 */
export const ParallelGroupSchema = z.object({
  id: z.string().describe('Group identifier'),
  name: z.string().describe('Group name'),
  subtasks: z.array(SubtaskSchema).describe('Subtasks in this group'),
  executionOrder: z.number().describe('Order in which this group should execute'),
});
export type ParallelGroup = z.infer<typeof ParallelGroupSchema>;

/**
 * The complete execution plan
 */
export const ExecutionPlanSchema = z.object({
  id: z.string().describe('Plan identifier'),
  version: z.number().describe('Plan version (increments on re-planning)'),
  originalTask: z.string().describe('The original task description'),
  summary: z.string().describe('Summary of the execution strategy'),
  parallelGroups: z.array(ParallelGroupSchema).describe('Groups of parallel subtasks'),
  estimatedTotalEffort: z.string().describe('Estimated total effort'),
  riskAssessment: z.string().optional().describe('Potential risks and mitigations'),
  createdAt: z.string().describe('Timestamp when plan was created'),
});
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

/**
 * Result of executing a subtask
 */
export const SubtaskResultSchema = z.object({
  subtaskId: z.string(),
  status: TaskStatus,
  result: z.string().optional(),
  error: z.string().optional(),
  filesModified: z.array(z.string()).optional(),
  duration: z.number().describe('Duration in milliseconds'),
});
export type SubtaskResult = z.infer<typeof SubtaskResultSchema>;

/**
 * Result of executing a parallel group
 */
export const GroupResultSchema = z.object({
  groupId: z.string(),
  subtaskResults: z.array(SubtaskResultSchema),
  allSucceeded: z.boolean(),
  duration: z.number(),
});
export type GroupResult = z.infer<typeof GroupResultSchema>;

/**
 * Review result from the reviewer agent
 */
export const ReviewResultSchema = z.object({
  overallSuccess: z.boolean(),
  completedTasks: z.number(),
  failedTasks: z.number(),
  skippedTasks: z.number(),
  issues: z.array(z.object({
    subtaskId: z.string(),
    issue: z.string(),
    severity: z.enum(['error', 'warning', 'info']),
    suggestion: z.string().optional(),
  })),
  needsReplanning: z.boolean(),
  replanningReason: z.string().optional(),
  summary: z.string(),
});
export type ReviewResult = z.infer<typeof ReviewResultSchema>;

// =============================================================================
// Input/Output Schemas
// =============================================================================

export const MultiAgentPlanningInputSchema = z.object({
  // Repository context
  repoId: z.string().describe('Repository ID'),
  repoPath: z.string().describe('Path to repository on disk'),
  owner: z.string().describe('Repository owner'),
  repoName: z.string().describe('Repository name'),
  userId: z.string().describe('User requesting the task'),
  
  // Task description
  task: z.string().describe('The main task to accomplish'),
  context: z.string().optional().describe('Additional context or requirements'),
  
  // Configuration
  maxIterations: z.number().default(3).describe('Maximum planning iterations'),
  maxParallelTasks: z.number().default(5).describe('Maximum parallel subtasks'),
  dryRun: z.boolean().default(false).describe('Preview plan without executing'),
  verbose: z.boolean().default(false).describe('Enable verbose logging'),
  
  // Git options
  createBranch: z.boolean().default(true).describe('Create a feature branch'),
  branchName: z.string().optional().describe('Custom branch name'),
  autoCommit: z.boolean().default(true).describe('Auto-commit changes'),
});

export type MultiAgentPlanningInput = z.infer<typeof MultiAgentPlanningInputSchema>;

export const MultiAgentPlanningOutputSchema = z.object({
  success: z.boolean(),
  
  // Plan information
  finalPlan: ExecutionPlanSchema.optional(),
  totalIterations: z.number(),
  
  // Execution results
  groupResults: z.array(GroupResultSchema),
  
  // Review summary
  review: ReviewResultSchema.optional(),
  
  // Git results
  branchName: z.string().optional(),
  commits: z.array(z.object({
    hash: z.string(),
    message: z.string(),
  })).optional(),
  
  // Summary
  summary: z.string(),
  filesModified: z.array(z.string()),
  totalDuration: z.number(),
  
  // Error info
  error: z.string().optional(),
});

export type MultiAgentPlanningOutput = z.infer<typeof MultiAgentPlanningOutputSchema>;

// =============================================================================
// Agent Instructions
// =============================================================================

const PLANNER_AGENT_INSTRUCTIONS = `You are the Planner Agent - an expert at breaking down complex coding tasks into well-organized, executable subtasks.

## Your Role
Analyze the given task and create an optimal execution plan that:
1. Breaks the task into clear, atomic subtasks
2. Identifies dependencies between subtasks
3. Groups independent subtasks for parallel execution
4. Estimates effort and risk for each subtask

## Planning Principles

### Task Decomposition
- Each subtask should be small enough to complete in one focused session
- Subtasks should have clear acceptance criteria
- Avoid subtasks that are too vague ("improve code") or too large ("refactor entire codebase")

### Dependency Management
- Identify which subtasks depend on others
- Minimize dependencies to maximize parallelism
- If A depends on B's file output, A should list B as a dependency

### Parallel Grouping
- Group independent subtasks that can run simultaneously
- Earlier groups should contain foundational work (types, interfaces, utilities)
- Later groups should contain integration work (connecting components)

### Effort Estimation
- trivial: < 5 minutes, simple change
- small: 5-15 minutes, straightforward implementation
- medium: 15-45 minutes, requires some thought
- large: 45+ minutes, complex implementation

## Output Format
You must output a valid JSON execution plan with this structure:
{
  "id": "plan-<timestamp>",
  "version": 1,
  "originalTask": "<the original task>",
  "summary": "<1-2 sentence strategy summary>",
  "parallelGroups": [
    {
      "id": "group-1",
      "name": "Foundation",
      "executionOrder": 1,
      "subtasks": [
        {
          "id": "task-1",
          "title": "Create types",
          "description": "Detailed description...",
          "priority": "high",
          "estimatedEffort": "small",
          "dependencies": [],
          "targetFiles": ["src/types.ts"],
          "acceptanceCriteria": ["Types are defined", "Types are exported"],
          "status": "pending"
        }
      ]
    }
  ],
  "estimatedTotalEffort": "2-3 hours",
  "riskAssessment": "Potential risks...",
  "createdAt": "<ISO timestamp>"
}`;

const EXECUTOR_AGENT_INSTRUCTIONS = `You are an Executor Agent - a skilled developer that implements specific subtasks.

## Your Role
You receive a subtask with clear requirements and must implement it completely.

## Execution Guidelines

### Before Starting
1. Read relevant existing files to understand the codebase
2. Identify the exact changes needed
3. Plan your approach

### During Execution
1. Make changes incrementally
2. Follow existing code patterns and conventions
3. Add appropriate comments and documentation
4. Handle edge cases and errors

### After Completing
1. Verify all acceptance criteria are met
2. Ensure code compiles/passes basic validation
3. Report what you accomplished

## Output Format
Report your results as:
{
  "status": "completed" | "failed",
  "result": "What was accomplished",
  "filesModified": ["list", "of", "files"],
  "error": "Error message if failed"
}`;

const REVIEWER_AGENT_INSTRUCTIONS = `You are the Reviewer Agent - an expert at validating completed work and identifying issues.

## Your Role
Review the results of executed subtasks and determine:
1. Were all tasks completed successfully?
2. Are there any issues or inconsistencies?
3. Is re-planning needed?

## Review Criteria

### Success Validation
- Check if each subtask met its acceptance criteria
- Verify files were created/modified as expected
- Look for potential integration issues between subtasks

### Issue Identification
- Error: Critical problem that blocks progress
- Warning: Issue that should be fixed but doesn't block
- Info: Suggestion for improvement

### Re-planning Decision
Recommend re-planning if:
- Critical tasks failed
- Dependencies are broken
- Scope needs adjustment based on discoveries
- Better approach was identified during execution

## Output Format
{
  "overallSuccess": true/false,
  "completedTasks": N,
  "failedTasks": N,
  "skippedTasks": N,
  "issues": [
    {
      "subtaskId": "task-1",
      "issue": "Description",
      "severity": "error|warning|info",
      "suggestion": "How to fix"
    }
  ],
  "needsReplanning": true/false,
  "replanningReason": "Why re-planning is needed",
  "summary": "Overall summary"
}`;

// =============================================================================
// Step 1: Analyze Task and Gather Context
// =============================================================================

const analyzeTaskStep = createStep({
  id: 'analyze-task',
  inputSchema: MultiAgentPlanningInputSchema,
  outputSchema: z.object({
    // Pass through input
    repoId: z.string(),
    repoPath: z.string(),
    owner: z.string(),
    repoName: z.string(),
    userId: z.string(),
    task: z.string(),
    context: z.string().optional(),
    maxIterations: z.number(),
    maxParallelTasks: z.number(),
    dryRun: z.boolean(),
    verbose: z.boolean(),
    createBranch: z.boolean(),
    branchName: z.string().optional(),
    autoCommit: z.boolean(),
    // Analysis results
    projectInfo: z.object({
      type: z.string(),
      language: z.string(),
      hasTests: z.boolean(),
      hasLinting: z.boolean(),
      structure: z.array(z.string()),
    }),
    relevantFiles: z.array(z.string()),
    codebaseContext: z.string(),
  }),
  execute: async ({ inputData }) => {
    const { findFilesInRepo, readRepoFile } = await import('./utils.js');
    
    // Analyze project structure
    let projectType = 'unknown';
    let language = 'unknown';
    let hasTests = false;
    let hasLinting = false;
    
    try {
      const packageJson = readRepoFile(inputData.repoPath, 'package.json');
      if (packageJson) {
        const pkg = JSON.parse(packageJson);
        language = 'javascript';
        
        if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) {
          language = 'typescript';
        }
        
        if (pkg.dependencies?.react || pkg.devDependencies?.react) {
          projectType = 'react';
        } else if (pkg.dependencies?.next) {
          projectType = 'nextjs';
        } else if (pkg.dependencies?.express || pkg.dependencies?.hono) {
          projectType = 'node-server';
        }
        
        hasTests = !!(pkg.devDependencies?.vitest || pkg.devDependencies?.jest);
        hasLinting = !!(pkg.devDependencies?.eslint || pkg.devDependencies?.biome);
      }
    } catch {
      // Not a JS/TS project
    }
    
    // Get project structure
    const allFiles = await findFilesInRepo(inputData.repoPath);
    const structure = new Set<string>();
    for (const file of allFiles.slice(0, 100)) {
      const parts = file.split('/');
      if (parts.length > 1) {
        structure.add(parts[0] + '/');
      }
    }
    
    // Find relevant files based on task keywords
    const taskKeywords = inputData.task.toLowerCase().split(/\s+/);
    const relevantFiles = allFiles.filter(f => {
      const fileName = f.toLowerCase();
      return taskKeywords.some(kw => 
        kw.length > 3 && fileName.includes(kw)
      );
    }).slice(0, 20);
    
    // Build context from relevant files
    let codebaseContext = '';
    for (const file of relevantFiles.slice(0, 5)) {
      const content = readRepoFile(inputData.repoPath, file);
      if (content) {
        codebaseContext += `\n### ${file}\n\`\`\`\n${content.slice(0, 1000)}\n\`\`\`\n`;
      }
    }
    
    return {
      ...inputData,
      projectInfo: {
        type: projectType,
        language,
        hasTests,
        hasLinting,
        structure: Array.from(structure),
      },
      relevantFiles,
      codebaseContext: codebaseContext || 'No relevant files found.',
    };
  },
});

// =============================================================================
// Step 2: Create Execution Plan
// =============================================================================

const createPlanStep = createStep({
  id: 'create-plan',
  inputSchema: z.object({
    task: z.string(),
    context: z.string().optional(),
    maxParallelTasks: z.number(),
    projectInfo: z.object({
      type: z.string(),
      language: z.string(),
      hasTests: z.boolean(),
      hasLinting: z.boolean(),
      structure: z.array(z.string()),
    }),
    relevantFiles: z.array(z.string()),
    codebaseContext: z.string(),
    previousPlan: ExecutionPlanSchema.optional(),
    previousResults: z.array(GroupResultSchema).optional(),
    iteration: z.number().default(1),
  }),
  outputSchema: z.object({
    plan: ExecutionPlanSchema,
    planningNotes: z.string(),
  }),
  execute: async ({ inputData, mastra }) => {
    const timestamp = new Date().toISOString();
    const planId = `plan-${Date.now()}`;
    
    // Build the planning prompt
    let prompt = `Create an execution plan for this task:

## Task
${inputData.task}

${inputData.context ? `## Additional Context\n${inputData.context}\n` : ''}

## Project Information
- Type: ${inputData.projectInfo.type}
- Language: ${inputData.projectInfo.language}
- Has Tests: ${inputData.projectInfo.hasTests}
- Has Linting: ${inputData.projectInfo.hasLinting}
- Structure: ${inputData.projectInfo.structure.join(', ')}

## Relevant Files
${inputData.relevantFiles.join('\n')}

## Codebase Context
${inputData.codebaseContext}

## Constraints
- Maximum ${inputData.maxParallelTasks} parallel tasks per group
- Focus on incremental, testable changes
- Each subtask should be completable by a single agent`;

    if (inputData.previousPlan && inputData.previousResults) {
      const failedTasks = inputData.previousResults
        .flatMap(g => g.subtaskResults)
        .filter(r => r.status === 'failed');
      
      prompt += `\n\n## Previous Plan (Iteration ${inputData.iteration - 1})
The previous plan had ${failedTasks.length} failed tasks. Please revise the plan to address these failures:
${failedTasks.map(t => `- ${t.subtaskId}: ${t.error}`).join('\n')}

Previous plan summary: ${inputData.previousPlan.summary}`;
    }

    prompt += `\n\n## Output
Return a valid JSON execution plan. Use plan ID "${planId}", version ${inputData.iteration}, and timestamp "${timestamp}".`;

    let plan: ExecutionPlan;
    let planningNotes = '';

    if (mastra) {
      try {
        const agent = mastra.getAgent('wit');
        if (agent) {
          const response = await agent.generate(PLANNER_AGENT_INSTRUCTIONS + '\n\n' + prompt);
          
          // Extract JSON from response
          const jsonMatch = response.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            plan = JSON.parse(jsonMatch[0]) as ExecutionPlan;
            planningNotes = 'Plan created by AI planner agent';
          } else {
            throw new Error('No JSON found in planner response');
          }
        } else {
          throw new Error('Agent not available');
        }
      } catch (error) {
        console.error('[Planning] AI planning failed:', error);
        planningNotes = `AI planning failed: ${error instanceof Error ? error.message : 'Unknown error'}. Using fallback plan.`;
        plan = createFallbackPlan(inputData.task, planId, inputData.iteration, timestamp);
      }
    } else {
      planningNotes = 'No AI available, using fallback plan';
      plan = createFallbackPlan(inputData.task, planId, inputData.iteration, timestamp);
    }

    return { plan, planningNotes };
  },
});

/**
 * Create a simple fallback plan when AI is not available
 */
function createFallbackPlan(task: string, planId: string, version: number, timestamp: string): ExecutionPlan {
  return {
    id: planId,
    version,
    originalTask: task,
    summary: 'Fallback plan: Execute task as a single subtask',
    parallelGroups: [
      {
        id: 'group-1',
        name: 'Main Task',
        executionOrder: 1,
        subtasks: [
          {
            id: 'task-1',
            title: 'Execute main task',
            description: task,
            priority: 'high',
            estimatedEffort: 'medium',
            dependencies: [],
            targetFiles: [],
            acceptanceCriteria: ['Task completed successfully'],
            status: 'pending',
          },
        ],
      },
    ],
    estimatedTotalEffort: 'Unknown',
    createdAt: timestamp,
  };
}

// =============================================================================
// Step 3: Execute Plan (Parallel Groups)
// =============================================================================

const executePlanStep = createStep({
  id: 'execute-plan',
  inputSchema: z.object({
    plan: ExecutionPlanSchema,
    repoPath: z.string(),
    repoId: z.string(),
    owner: z.string(),
    repoName: z.string(),
    userId: z.string(),
    dryRun: z.boolean(),
    verbose: z.boolean(),
    createBranch: z.boolean(),
    branchName: z.string().optional(),
    autoCommit: z.boolean(),
  }),
  outputSchema: z.object({
    groupResults: z.array(GroupResultSchema),
    branchName: z.string().optional(),
    commits: z.array(z.object({
      hash: z.string(),
      message: z.string(),
    })),
    filesModified: z.array(z.string()),
    totalDuration: z.number(),
  }),
  execute: async ({ inputData, mastra }) => {
    const startTime = Date.now();
    const groupResults: GroupResult[] = [];
    const commits: { hash: string; message: string }[] = [];
    const allFilesModified = new Set<string>();
    let branchName = inputData.branchName;

    // Create branch if needed
    if (inputData.createBranch && !inputData.dryRun) {
      const { createBranch } = await import('./utils.js');
      
      if (!branchName) {
        const taskSlug = inputData.plan.originalTask
          .slice(0, 30)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-');
        branchName = `ai-planning/${taskSlug}-${Date.now().toString(36)}`;
      }
      
      const branchResult = createBranch(inputData.repoPath, branchName, true);
      if (!branchResult.success) {
        console.error('[Execute] Failed to create branch:', branchResult.error);
      }
    }

    // Execute each parallel group in order
    for (const group of inputData.plan.parallelGroups.sort((a, b) => a.executionOrder - b.executionOrder)) {
      const groupStart = Date.now();
      const subtaskResults: SubtaskResult[] = [];

      if (inputData.dryRun) {
        // In dry run, just mark tasks as would-be-executed
        for (const subtask of group.subtasks) {
          subtaskResults.push({
            subtaskId: subtask.id,
            status: 'completed',
            result: `[DRY RUN] Would execute: ${subtask.title}`,
            filesModified: subtask.targetFiles,
            duration: 0,
          });
        }
      } else {
        // Execute subtasks in parallel
        const execPromises = group.subtasks.map(async (subtask) => {
          return executeSubtask(subtask, inputData, mastra);
        });

        const results = await Promise.all(execPromises);
        
        for (const result of results) {
          subtaskResults.push(result);
          if (result.filesModified) {
            result.filesModified.forEach(f => allFilesModified.add(f));
          }
        }

        // Auto-commit after group if there were changes
        if (inputData.autoCommit && subtaskResults.some(r => r.status === 'completed')) {
          const { createCommit, stageFiles } = await import('./utils.js');
          
          const filesToStage = Array.from(allFilesModified);
          if (filesToStage.length > 0) {
            stageFiles(inputData.repoPath, filesToStage);
            
            const commitMessage = `[${group.name}] ${group.subtasks
              .filter(s => subtaskResults.find(r => r.subtaskId === s.id && r.status === 'completed'))
              .map(s => s.title)
              .join(', ')}`;
            
            const commitResult = createCommit(inputData.repoPath, commitMessage, {
              name: 'wit AI Planner',
              email: 'ai-planner@wit.dev',
            });
            
            if (commitResult.success && commitResult.commitHash) {
              commits.push({
                hash: commitResult.commitHash,
                message: commitMessage,
              });
            }
          }
        }
      }

      groupResults.push({
        groupId: group.id,
        subtaskResults,
        allSucceeded: subtaskResults.every(r => r.status === 'completed'),
        duration: Date.now() - groupStart,
      });

      // If critical tasks failed, we might want to stop early
      const criticalFailures = group.subtasks
        .filter(s => s.priority === 'critical')
        .some(s => subtaskResults.find(r => r.subtaskId === s.id && r.status === 'failed'));
      
      if (criticalFailures) {
        console.log('[Execute] Critical task failed, stopping execution');
        break;
      }
    }

    return {
      groupResults,
      branchName,
      commits,
      filesModified: Array.from(allFilesModified),
      totalDuration: Date.now() - startTime,
    };
  },
});

/**
 * Execute a single subtask using the executor agent
 */
async function executeSubtask(
  subtask: Subtask,
  context: {
    repoPath: string;
    repoId: string;
    userId: string;
    verbose: boolean;
  },
  mastra: any
): Promise<SubtaskResult> {
  const startTime = Date.now();

  try {
    if (!mastra) {
      return {
        subtaskId: subtask.id,
        status: 'failed',
        error: 'No AI agent available',
        duration: Date.now() - startTime,
      };
    }

    const agent = mastra.getAgent('wit');
    if (!agent) {
      return {
        subtaskId: subtask.id,
        status: 'failed',
        error: 'Agent not found',
        duration: Date.now() - startTime,
      };
    }

    const prompt = `${EXECUTOR_AGENT_INSTRUCTIONS}

## Your Subtask
**ID**: ${subtask.id}
**Title**: ${subtask.title}
**Description**: ${subtask.description}
**Priority**: ${subtask.priority}
**Target Files**: ${subtask.targetFiles?.join(', ') || 'Not specified'}

## Acceptance Criteria
${subtask.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Instructions
1. Use the available tools to read files, understand the codebase, and make changes
2. Implement the subtask according to the description and acceptance criteria
3. Report your results in the specified JSON format

Begin implementation now.`;

    const response = await agent.generate(prompt);

    // Parse the result
    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        subtaskId: subtask.id,
        status: result.status === 'completed' ? 'completed' : 'failed',
        result: result.result,
        error: result.error,
        filesModified: result.filesModified || [],
        duration: Date.now() - startTime,
      };
    }

    // If no JSON, assume success if no error indicators
    return {
      subtaskId: subtask.id,
      status: 'completed',
      result: response.text.slice(0, 500),
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      subtaskId: subtask.id,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Execution failed',
      duration: Date.now() - startTime,
    };
  }
}

// =============================================================================
// Step 4: Review Results
// =============================================================================

const reviewResultsStep = createStep({
  id: 'review-results',
  inputSchema: z.object({
    plan: ExecutionPlanSchema,
    groupResults: z.array(GroupResultSchema),
    iteration: z.number(),
    maxIterations: z.number(),
  }),
  outputSchema: z.object({
    review: ReviewResultSchema,
    shouldReplan: z.boolean(),
  }),
  execute: async ({ inputData, mastra }) => {
    const allResults = inputData.groupResults.flatMap(g => g.subtaskResults);
    const completedCount = allResults.filter(r => r.status === 'completed').length;
    const failedCount = allResults.filter(r => r.status === 'failed').length;
    const skippedCount = allResults.filter(r => r.status === 'skipped').length;
    
    // Build review prompt
    const prompt = `${REVIEWER_AGENT_INSTRUCTIONS}

## Execution Plan
${inputData.plan.summary}

## Results by Group
${inputData.groupResults.map(g => `
### ${g.groupId}
${g.subtaskResults.map(r => `- ${r.subtaskId}: ${r.status}${r.error ? ` (Error: ${r.error})` : ''}`).join('\n')}
`).join('\n')}

## Statistics
- Completed: ${completedCount}
- Failed: ${failedCount}
- Skipped: ${skippedCount}
- Current Iteration: ${inputData.iteration}/${inputData.maxIterations}

## Task
Review these results and provide your assessment in the specified JSON format.`;

    let review: ReviewResult;

    if (mastra) {
      try {
        const agent = mastra.getAgent('wit');
        if (agent) {
          const response = await agent.generate(prompt);
          
          const jsonMatch = response.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            review = JSON.parse(jsonMatch[0]) as ReviewResult;
          } else {
            throw new Error('No JSON in reviewer response');
          }
        } else {
          throw new Error('Agent not available');
        }
      } catch (error) {
        console.error('[Review] AI review failed:', error);
        review = createFallbackReview(completedCount, failedCount, skippedCount, allResults);
      }
    } else {
      review = createFallbackReview(completedCount, failedCount, skippedCount, allResults);
    }

    // Determine if we should replan
    const shouldReplan = review.needsReplanning && inputData.iteration < inputData.maxIterations;

    return { review, shouldReplan };
  },
});

/**
 * Create a fallback review when AI is not available
 */
function createFallbackReview(
  completedCount: number,
  failedCount: number,
  skippedCount: number,
  results: SubtaskResult[]
): ReviewResult {
  const issues = results
    .filter(r => r.status === 'failed')
    .map(r => ({
      subtaskId: r.subtaskId,
      issue: r.error || 'Task failed',
      severity: 'error' as const,
    }));

  return {
    overallSuccess: failedCount === 0,
    completedTasks: completedCount,
    failedTasks: failedCount,
    skippedTasks: skippedCount,
    issues,
    needsReplanning: failedCount > 0 && completedCount < failedCount,
    replanningReason: failedCount > 0 ? `${failedCount} tasks failed` : undefined,
    summary: `Completed ${completedCount} tasks, ${failedCount} failed, ${skippedCount} skipped`,
  };
}

// =============================================================================
// Step 5: Aggregate Final Results
// =============================================================================

const aggregateResultsStep = createStep({
  id: 'aggregate-results',
  inputSchema: z.object({
    plan: ExecutionPlanSchema,
    groupResults: z.array(GroupResultSchema),
    review: ReviewResultSchema,
    branchName: z.string().optional(),
    commits: z.array(z.object({
      hash: z.string(),
      message: z.string(),
    })),
    filesModified: z.array(z.string()),
    totalDuration: z.number(),
    totalIterations: z.number(),
    dryRun: z.boolean(),
  }),
  outputSchema: MultiAgentPlanningOutputSchema,
  execute: async ({ inputData }) => {
    const allResults = inputData.groupResults.flatMap(g => g.subtaskResults);
    const success = inputData.review.overallSuccess;

    let summary = inputData.dryRun
      ? `[DRY RUN] Would execute ${allResults.length} subtasks in ${inputData.plan.parallelGroups.length} groups`
      : `Executed ${allResults.length} subtasks in ${inputData.totalIterations} iteration(s). ${inputData.review.summary}`;

    if (inputData.branchName) {
      summary += ` Branch: ${inputData.branchName}`;
    }

    return {
      success,
      finalPlan: inputData.plan,
      totalIterations: inputData.totalIterations,
      groupResults: inputData.groupResults,
      review: inputData.review,
      branchName: inputData.branchName,
      commits: inputData.commits,
      summary,
      filesModified: inputData.filesModified,
      totalDuration: inputData.totalDuration,
    };
  },
});

// =============================================================================
// Workflow Definition
// =============================================================================

export const multiAgentPlanningWorkflow = createWorkflow({
  id: 'multi-agent-planning',
  inputSchema: MultiAgentPlanningInputSchema,
  outputSchema: MultiAgentPlanningOutputSchema,
})
  // Step 1: Analyze task and gather context
  .then(analyzeTaskStep)
  // Step 2: Create initial plan
  .map(async ({ inputData }) => ({
    task: inputData.task,
    context: inputData.context,
    maxParallelTasks: inputData.maxParallelTasks,
    projectInfo: inputData.projectInfo,
    relevantFiles: inputData.relevantFiles,
    codebaseContext: inputData.codebaseContext,
    iteration: 1,
  }))
  .then(createPlanStep)
  // Step 3: Execute the plan
  .map(async ({ inputData, getStepResult }) => {
    const analysis = getStepResult('analyze-task') as {
      repoPath: string;
      repoId: string;
      owner: string;
      repoName: string;
      userId: string;
      dryRun: boolean;
      verbose: boolean;
      createBranch: boolean;
      branchName?: string;
      autoCommit: boolean;
    };
    
    return {
      plan: inputData.plan,
      repoPath: analysis.repoPath,
      repoId: analysis.repoId,
      owner: analysis.owner,
      repoName: analysis.repoName,
      userId: analysis.userId,
      dryRun: analysis.dryRun,
      verbose: analysis.verbose,
      createBranch: analysis.createBranch,
      branchName: analysis.branchName,
      autoCommit: analysis.autoCommit,
    };
  })
  .then(executePlanStep)
  // Step 4: Review results
  .map(async ({ inputData, getStepResult }) => {
    const planResult = getStepResult('create-plan') as { plan: ExecutionPlan };
    const analysis = getStepResult('analyze-task') as { maxIterations: number };
    
    return {
      plan: planResult.plan,
      groupResults: inputData.groupResults,
      iteration: 1,
      maxIterations: analysis.maxIterations,
    };
  })
  .then(reviewResultsStep)
  // Step 5: Aggregate final results
  .map(async ({ inputData, getStepResult }) => {
    const planResult = getStepResult('create-plan') as { plan: ExecutionPlan };
    const execResult = getStepResult('execute-plan') as {
      groupResults: GroupResult[];
      branchName?: string;
      commits: { hash: string; message: string }[];
      filesModified: string[];
      totalDuration: number;
    };
    const analysis = getStepResult('analyze-task') as { dryRun: boolean };
    
    return {
      plan: planResult.plan,
      groupResults: execResult.groupResults,
      review: inputData.review,
      branchName: execResult.branchName,
      commits: execResult.commits,
      filesModified: execResult.filesModified,
      totalDuration: execResult.totalDuration,
      totalIterations: 1, // TODO: Support multiple iterations in workflow
      dryRun: analysis.dryRun,
    };
  })
  .then(aggregateResultsStep)
  .commit();

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Run the multi-agent planning workflow
 */
export async function runMultiAgentPlanningWorkflow(
  input: MultiAgentPlanningInput
): Promise<MultiAgentPlanningOutput> {
  const { getTsgitMastra } = await import('../mastra.js');
  const mastra = getTsgitMastra();
  const workflow = mastra.getWorkflow('multiAgentPlanning');
  
  if (!workflow) {
    return {
      success: false,
      totalIterations: 0,
      groupResults: [],
      summary: 'Multi-agent planning workflow not found',
      filesModified: [],
      totalDuration: 0,
      error: 'Workflow not registered with Mastra',
    };
  }
  
  const run = await workflow.createRun();
  const result = await run.start({ inputData: input });
  
  if (result.status === 'failed') {
    return {
      success: false,
      totalIterations: 0,
      groupResults: [],
      summary: 'Workflow execution failed',
      filesModified: [],
      totalDuration: 0,
      error: 'Workflow execution failed',
    };
  }
  
  return (result as any).result as MultiAgentPlanningOutput;
}

/**
 * Stream the multi-agent planning workflow execution
 */
export async function* streamMultiAgentPlanningWorkflow(input: MultiAgentPlanningInput): AsyncGenerator<unknown> {
  const { getTsgitMastra } = await import('../mastra.js');
  const mastra = getTsgitMastra();
  const workflow = mastra.getWorkflow('multiAgentPlanning');
  
  if (!workflow) {
    yield { type: 'error', message: 'Workflow not found' };
    return;
  }
  
  const run = await workflow.createRun();
  const result = await run.stream({ inputData: input });
  
  for await (const chunk of result.fullStream) {
    yield chunk;
  }
}
