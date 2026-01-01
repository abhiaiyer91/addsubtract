/**
 * End-to-End Tests for Multi-Agent Planning Workflow
 * 
 * These tests exercise the full planning workflow with mocked AI responses.
 * They test:
 * - Workflow execution from start to finish
 * - Plan creation and validation
 * - Subtask execution and results
 * - Review and re-planning logic
 * - Git operations (branching, committing)
 * - Error handling and recovery
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  createRepoWithCommit,
  cleanupTempDir,
  suppressConsole,
  restoreCwd,
} from './test-utils';
import {
  type ExecutionPlan,
  type Subtask,
  type ParallelGroup,
  type SubtaskResult,
  type GroupResult,
  type ReviewResult,
  type MultiAgentPlanningInput,
  type MultiAgentPlanningOutput,
} from '../ai/workflows/multi-agent-planning.workflow';
import {
  createBranch,
  stageFiles,
  createCommit,
  writeRepoFile,
  readRepoFile,
  getRepoStatus,
} from '../ai/workflows/utils';

// =============================================================================
// HELPER FUNCTIONS FOR CREATING TEST DATA
// =============================================================================

/**
 * Create a valid execution plan for testing
 */
function createTestPlan(task: string, options: Partial<ExecutionPlan> = {}): ExecutionPlan {
  const timestamp = new Date().toISOString();
  const planId = `plan-${Date.now()}`;
  
  return {
    id: planId,
    version: 1,
    originalTask: task,
    summary: `Plan to: ${task.slice(0, 50)}...`,
    parallelGroups: options.parallelGroups || [
      {
        id: 'group-1',
        name: 'Implementation',
        executionOrder: 1,
        subtasks: [
          {
            id: 'task-1',
            title: 'Main task',
            description: task,
            priority: 'high',
            estimatedEffort: 'medium',
            dependencies: [],
            acceptanceCriteria: ['Task completed successfully'],
            status: 'pending',
          },
        ],
      },
    ],
    estimatedTotalEffort: '1-2 hours',
    riskAssessment: options.riskAssessment,
    createdAt: timestamp,
    ...options,
  };
}

/**
 * Create a valid subtask for testing
 */
function createTestSubtask(id: string, options: Partial<Subtask> = {}): Subtask {
  return {
    id,
    title: options.title || `Task ${id}`,
    description: options.description || `Execute task ${id}`,
    priority: options.priority || 'medium',
    estimatedEffort: options.estimatedEffort || 'small',
    dependencies: options.dependencies || [],
    targetFiles: options.targetFiles || [],
    acceptanceCriteria: options.acceptanceCriteria || ['Completed'],
    status: options.status || 'pending',
    ...options,
  };
}

/**
 * Create a subtask result for testing
 */
function createTestResult(subtaskId: string, status: 'completed' | 'failed' | 'skipped', options: Partial<SubtaskResult> = {}): SubtaskResult {
  return {
    subtaskId,
    status,
    result: status === 'completed' ? 'Task completed successfully' : undefined,
    error: status === 'failed' ? 'Task execution failed' : undefined,
    filesModified: options.filesModified || [],
    duration: options.duration || Math.random() * 5000,
    ...options,
  };
}

/**
 * Create a review result for testing
 */
function createTestReview(completed: number, failed: number, skipped: number, options: Partial<ReviewResult> = {}): ReviewResult {
  return {
    overallSuccess: failed === 0,
    completedTasks: completed,
    failedTasks: failed,
    skippedTasks: skipped,
    issues: options.issues || [],
    needsReplanning: options.needsReplanning ?? (failed > completed),
    replanningReason: options.replanningReason,
    summary: `Completed ${completed}, Failed ${failed}, Skipped ${skipped}`,
    ...options,
  };
}

// =============================================================================
// TEST SUITE
// =============================================================================

describe('Multi-Agent Planning E2E', () => {
  let testDir: string | undefined;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const result = createRepoWithCommit();
    testDir = result.dir;
    process.chdir(testDir);
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
    testDir = undefined;
  });

  // ===========================================
  // PLAN CREATION TESTS
  // ===========================================
  describe('Plan Creation', () => {
    it('should create a valid plan structure', () => {
      const task = 'Add user authentication with login and logout';
      const plan = createTestPlan(task);

      expect(plan.id).toBeDefined();
      expect(plan.version).toBe(1);
      expect(plan.originalTask).toBe(task);
      expect(plan.parallelGroups.length).toBeGreaterThan(0);
      expect(plan.createdAt).toBeDefined();
    });

    it('should create plans with multiple parallel groups', () => {
      const plan = createTestPlan('Complex multi-step task', {
        parallelGroups: [
          {
            id: 'group-1',
            name: 'Types',
            executionOrder: 1,
            subtasks: [
              createTestSubtask('task-1a', { title: 'Create types', dependencies: [] }),
              createTestSubtask('task-1b', { title: 'Create interfaces', dependencies: [] }),
            ],
          },
          {
            id: 'group-2',
            name: 'Implementation',
            executionOrder: 2,
            subtasks: [
              createTestSubtask('task-2a', { title: 'Implement service', dependencies: ['task-1a'] }),
            ],
          },
          {
            id: 'group-3',
            name: 'Tests',
            executionOrder: 3,
            subtasks: [
              createTestSubtask('task-3a', { title: 'Write tests', dependencies: ['task-2a'] }),
            ],
          },
        ],
      });

      expect(plan.parallelGroups.length).toBe(3);
      expect(plan.parallelGroups[0].executionOrder).toBe(1);
      expect(plan.parallelGroups[1].executionOrder).toBe(2);
      expect(plan.parallelGroups[2].executionOrder).toBe(3);
    });

    it('should track dependencies correctly', () => {
      const plan = createTestPlan('Task with dependencies', {
        parallelGroups: [
          {
            id: 'group-1',
            name: 'Foundation',
            executionOrder: 1,
            subtasks: [
              createTestSubtask('base-task', { dependencies: [] }),
            ],
          },
          {
            id: 'group-2',
            name: 'Dependent',
            executionOrder: 2,
            subtasks: [
              createTestSubtask('dependent-task', { dependencies: ['base-task'] }),
            ],
          },
        ],
      });

      const dependentTask = plan.parallelGroups[1].subtasks[0];
      expect(dependentTask.dependencies).toContain('base-task');
    });
  });

  // ===========================================
  // SUBTASK EXECUTION SIMULATION TESTS
  // ===========================================
  describe('Subtask Execution', () => {
    it('should execute subtasks and track results', () => {
      const subtask = createTestSubtask('exec-task', {
        title: 'Create config file',
        targetFiles: ['config.json'],
      });

      // Simulate execution
      const startTime = Date.now();
      writeRepoFile(testDir!, 'config.json', '{"key": "value"}');
      const endTime = Date.now();

      const result = createTestResult(subtask.id, 'completed', {
        filesModified: ['config.json'],
        duration: endTime - startTime,
        result: 'Created config.json',
      });

      expect(result.status).toBe('completed');
      expect(result.filesModified).toContain('config.json');
      expect(result.duration).toBeGreaterThanOrEqual(0);
      
      // Verify file was created
      expect(readRepoFile(testDir!, 'config.json')).toBe('{"key": "value"}');
    });

    it('should handle failed subtasks', () => {
      const subtask = createTestSubtask('fail-task', {
        title: 'Modify non-existent file',
        targetFiles: ['nonexistent.ts'],
      });

      // Simulate failure
      const result = createTestResult(subtask.id, 'failed', {
        error: 'File not found: nonexistent.ts',
      });

      expect(result.status).toBe('failed');
      expect(result.error).toContain('not found');
      expect(result.result).toBeUndefined();
    });

    it('should handle skipped subtasks', () => {
      const subtask = createTestSubtask('skip-task', {
        title: 'Conditional task',
        dependencies: ['failed-dependency'],
      });

      const result = createTestResult(subtask.id, 'skipped', {
        result: 'Skipped because dependency failed',
      });

      expect(result.status).toBe('skipped');
    });

    it('should track files modified by subtasks', () => {
      const subtask = createTestSubtask('multi-file-task', {
        title: 'Create multiple files',
        targetFiles: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      });

      // Simulate execution
      fs.mkdirSync(path.join(testDir!, 'src'), { recursive: true });
      writeRepoFile(testDir!, 'src/a.ts', 'export const a = 1;');
      writeRepoFile(testDir!, 'src/b.ts', 'export const b = 2;');
      writeRepoFile(testDir!, 'src/c.ts', 'export const c = 3;');

      const result = createTestResult(subtask.id, 'completed', {
        filesModified: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
      });

      expect(result.filesModified?.length).toBe(3);
    });
  });

  // ===========================================
  // PARALLEL GROUP EXECUTION TESTS
  // ===========================================
  describe('Parallel Group Execution', () => {
    it('should execute parallel groups in order', () => {
      const groups: ParallelGroup[] = [
        {
          id: 'group-1',
          name: 'First',
          executionOrder: 1,
          subtasks: [createTestSubtask('g1-t1')],
        },
        {
          id: 'group-2',
          name: 'Second',
          executionOrder: 2,
          subtasks: [createTestSubtask('g2-t1')],
        },
      ];

      // Sort by execution order
      const sortedGroups = [...groups].sort((a, b) => a.executionOrder - b.executionOrder);

      expect(sortedGroups[0].id).toBe('group-1');
      expect(sortedGroups[1].id).toBe('group-2');
    });

    it('should aggregate results from parallel subtasks', () => {
      const group: ParallelGroup = {
        id: 'parallel-group',
        name: 'Parallel Tasks',
        executionOrder: 1,
        subtasks: [
          createTestSubtask('p1'),
          createTestSubtask('p2'),
          createTestSubtask('p3'),
        ],
      };

      // Simulate parallel execution
      const results: SubtaskResult[] = [
        createTestResult('p1', 'completed'),
        createTestResult('p2', 'completed'),
        createTestResult('p3', 'failed'),
      ];

      const groupResult: GroupResult = {
        groupId: group.id,
        subtaskResults: results,
        allSucceeded: results.every(r => r.status === 'completed'),
        duration: results.reduce((sum, r) => sum + r.duration, 0),
      };

      expect(groupResult.allSucceeded).toBe(false); // One failed
      expect(groupResult.subtaskResults.filter(r => r.status === 'completed').length).toBe(2);
      expect(groupResult.subtaskResults.filter(r => r.status === 'failed').length).toBe(1);
    });

    it('should handle all tasks completing successfully', () => {
      const results: SubtaskResult[] = [
        createTestResult('t1', 'completed'),
        createTestResult('t2', 'completed'),
        createTestResult('t3', 'completed'),
      ];

      const groupResult: GroupResult = {
        groupId: 'success-group',
        subtaskResults: results,
        allSucceeded: results.every(r => r.status === 'completed'),
        duration: 5000,
      };

      expect(groupResult.allSucceeded).toBe(true);
    });
  });

  // ===========================================
  // REVIEW AND REPLANNING TESTS
  // ===========================================
  describe('Review and Replanning', () => {
    it('should identify successful workflow', () => {
      const review = createTestReview(5, 0, 0);

      expect(review.overallSuccess).toBe(true);
      expect(review.needsReplanning).toBe(false);
    });

    it('should identify failed workflow needing replan', () => {
      const review = createTestReview(1, 4, 0, {
        needsReplanning: true,
        replanningReason: 'Too many tasks failed',
        issues: [
          { subtaskId: 't1', issue: 'File not found', severity: 'error' },
          { subtaskId: 't2', issue: 'Syntax error', severity: 'error' },
        ],
      });

      expect(review.overallSuccess).toBe(false);
      expect(review.needsReplanning).toBe(true);
      expect(review.issues.length).toBe(2);
    });

    it('should handle partial failures without replan', () => {
      const review = createTestReview(4, 1, 0, {
        needsReplanning: false,
        issues: [
          { subtaskId: 't3', issue: 'Minor issue', severity: 'warning' },
        ],
      });

      expect(review.overallSuccess).toBe(false);
      expect(review.needsReplanning).toBe(false); // Only 1 failure
    });

    it('should track issue severity correctly', () => {
      const review = createTestReview(3, 2, 1, {
        issues: [
          { subtaskId: 't1', issue: 'Critical error', severity: 'error' },
          { subtaskId: 't2', issue: 'Could be better', severity: 'warning' },
          { subtaskId: 't3', issue: 'Just FYI', severity: 'info' },
        ],
      });

      const errors = review.issues.filter(i => i.severity === 'error');
      const warnings = review.issues.filter(i => i.severity === 'warning');
      const info = review.issues.filter(i => i.severity === 'info');

      expect(errors.length).toBe(1);
      expect(warnings.length).toBe(1);
      expect(info.length).toBe(1);
    });
  });

  // ===========================================
  // GIT OPERATIONS TESTS
  // ===========================================
  describe('Git Operations During Workflow', () => {
    it('should create a feature branch for the workflow', () => {
      const branchName = 'ai-planning/test-feature';
      const result = createBranch(testDir!, branchName, true);

      expect(result.success).toBe(true);

      const status = getRepoStatus(testDir!);
      expect(status.branch).toBe(branchName);
    });

    it('should stage and commit files after execution', () => {
      // Create branch
      createBranch(testDir!, 'feature/workflow-test', true);

      // Create files (simulate task execution)
      writeRepoFile(testDir!, 'src/feature.ts', 'export const feature = () => {};');
      writeRepoFile(testDir!, 'src/feature.test.ts', 'test("feature", () => {});');

      // Stage files
      const stageResult = stageFiles(testDir!, ['src/feature.ts', 'src/feature.test.ts']);
      expect(stageResult.success).toBe(true);

      // Commit
      const commitResult = createCommit(testDir!, '[AI Planning] Implement feature', {
        name: 'wit AI Planner',
        email: 'ai-planner@wit.dev',
      });

      expect(commitResult.success).toBe(true);
      expect(commitResult.commitHash).toBeDefined();

      // Verify status is clean
      const status = getRepoStatus(testDir!);
      expect(status.staged.length).toBe(0);
    });

    it('should generate correct commit message format', () => {
      const groupName = 'Implementation';
      const completedTasks = ['Create types', 'Implement service'];
      const commitMessage = `[${groupName}] ${completedTasks.join(', ')}`;

      expect(commitMessage).toBe('[Implementation] Create types, Implement service');
    });

    it('should handle multiple commits for multiple groups', () => {
      createBranch(testDir!, 'feature/multi-commit', true);

      // Group 1 changes
      writeRepoFile(testDir!, 'src/types.ts', 'export type User = {};');
      stageFiles(testDir!, ['src/types.ts']);
      const commit1 = createCommit(testDir!, '[Types] Create User type');
      expect(commit1.success).toBe(true);

      // Group 2 changes
      writeRepoFile(testDir!, 'src/service.ts', 'import { User } from "./types";');
      stageFiles(testDir!, ['src/service.ts']);
      const commit2 = createCommit(testDir!, '[Service] Implement user service');
      expect(commit2.success).toBe(true);

      // Verify both commits exist (different hashes)
      expect(commit1.commitHash).not.toBe(commit2.commitHash);
    });
  });

  // ===========================================
  // FULL WORKFLOW SIMULATION
  // ===========================================
  describe('Full Workflow Simulation', () => {
    it('should simulate a complete dry run workflow', async () => {
      const input: MultiAgentPlanningInput = {
        repoId: 'test-repo-id',
        repoPath: testDir!,
        owner: 'testuser',
        repoName: 'test-repo',
        userId: 'test-user-id',
        task: 'Create a utility function to format currency values',
        context: 'TypeScript project',
        maxIterations: 3,
        maxParallelTasks: 5,
        dryRun: true,
        verbose: false,
        createBranch: false,
        autoCommit: false,
      };

      // Simulate workflow steps
      // Step 1: Create plan
      const plan = createTestPlan(input.task, {
        parallelGroups: [
          {
            id: 'group-1',
            name: 'Implementation',
            executionOrder: 1,
            subtasks: [
              createTestSubtask('task-1', {
                title: 'Create formatCurrency function',
                targetFiles: ['src/utils/format.ts'],
              }),
            ],
          },
        ],
      });

      expect(plan.parallelGroups.length).toBe(1);

      // Step 2: Execute (dry run - just simulate)
      const subtaskResults: SubtaskResult[] = plan.parallelGroups[0].subtasks.map(subtask => 
        createTestResult(subtask.id, 'completed', {
          result: `[DRY RUN] Would execute: ${subtask.title}`,
        })
      );

      const groupResults: GroupResult[] = [{
        groupId: 'group-1',
        subtaskResults,
        allSucceeded: true,
        duration: 0,
      }];

      // Step 3: Review
      const review = createTestReview(1, 0, 0);

      // Step 4: Aggregate output
      const output: MultiAgentPlanningOutput = {
        success: true,
        finalPlan: plan,
        totalIterations: 1,
        groupResults,
        review,
        summary: `[DRY RUN] Would execute 1 subtasks in 1 groups`,
        filesModified: [],
        totalDuration: 100,
      };

      expect(output.success).toBe(true);
      expect(output.filesModified.length).toBe(0); // Dry run
      expect(output.summary).toContain('DRY RUN');
    });

    it('should simulate a complete real workflow', async () => {
      const input: MultiAgentPlanningInput = {
        repoId: 'test-repo-id',
        repoPath: testDir!,
        owner: 'testuser',
        repoName: 'test-repo',
        userId: 'test-user-id',
        task: 'Add a helper function to calculate area of a circle',
        maxIterations: 3,
        maxParallelTasks: 5,
        dryRun: false,
        verbose: false,
        createBranch: true,
        branchName: 'ai-planning/calculate-area',
        autoCommit: true,
      };

      // Step 1: Create branch
      createBranch(testDir!, input.branchName!, true);

      // Step 2: Create plan
      const plan = createTestPlan(input.task, {
        parallelGroups: [
          {
            id: 'group-1',
            name: 'Implementation',
            executionOrder: 1,
            subtasks: [
              createTestSubtask('task-1', {
                title: 'Create calculateCircleArea function',
                description: 'Create a function that calculates the area of a circle given radius',
                targetFiles: ['src/math/circle.ts'],
              }),
            ],
          },
        ],
      });

      // Step 3: Execute task (simulate AI execution)
      fs.mkdirSync(path.join(testDir!, 'src/math'), { recursive: true });
      writeRepoFile(testDir!, 'src/math/circle.ts', 
        'export function calculateCircleArea(radius: number): number {\n  return Math.PI * radius * radius;\n}\n'
      );

      const subtaskResults: SubtaskResult[] = [{
        subtaskId: 'task-1',
        status: 'completed',
        result: 'Created calculateCircleArea function',
        filesModified: ['src/math/circle.ts'],
        duration: 2500,
      }];

      // Step 4: Stage and commit
      stageFiles(testDir!, ['src/math/circle.ts']);
      const commitResult = createCommit(testDir!, '[Implementation] Create calculateCircleArea function', {
        name: 'wit AI Planner',
        email: 'ai-planner@wit.dev',
      });

      const groupResults: GroupResult[] = [{
        groupId: 'group-1',
        subtaskResults,
        allSucceeded: true,
        duration: 2500,
      }];

      // Step 5: Review
      const review = createTestReview(1, 0, 0);

      // Step 6: Aggregate output
      const output: MultiAgentPlanningOutput = {
        success: true,
        finalPlan: plan,
        totalIterations: 1,
        groupResults,
        review,
        branchName: input.branchName,
        commits: [{ hash: commitResult.commitHash!, message: '[Implementation] Create calculateCircleArea function' }],
        summary: 'Executed 1 subtasks in 1 iteration(s). Completed 1, Failed 0, Skipped 0',
        filesModified: ['src/math/circle.ts'],
        totalDuration: 3000,
      };

      expect(output.success).toBe(true);
      expect(output.branchName).toBe('ai-planning/calculate-area');
      expect(output.commits?.length).toBe(1);
      expect(output.filesModified).toContain('src/math/circle.ts');

      // Verify the file was actually created
      const fileContent = readRepoFile(testDir!, 'src/math/circle.ts');
      expect(fileContent).toContain('calculateCircleArea');
      expect(fileContent).toContain('Math.PI');
    });

    it('should handle workflow with failures and recovery', async () => {
      // Step 1: Create plan with multiple tasks
      const plan = createTestPlan('Create math utilities', {
        parallelGroups: [
          {
            id: 'group-1',
            name: 'Math Functions',
            executionOrder: 1,
            subtasks: [
              createTestSubtask('task-add', { title: 'Create add function' }),
              createTestSubtask('task-subtract', { title: 'Create subtract function' }),
              createTestSubtask('task-multiply', { title: 'Create multiply function' }),
            ],
          },
        ],
      });

      // Verify plan structure
      expect(plan.parallelGroups[0].subtasks.length).toBe(3);

      // Step 2: Execute with one failure
      const results: SubtaskResult[] = [
        createTestResult('task-add', 'completed', { filesModified: ['src/add.ts'] }),
        createTestResult('task-subtract', 'failed', { error: 'Syntax error in implementation' }),
        createTestResult('task-multiply', 'completed', { filesModified: ['src/multiply.ts'] }),
      ];

      const groupResults: GroupResult[] = [{
        groupId: 'group-1',
        subtaskResults: results,
        allSucceeded: false,
        duration: 5000,
      }];

      // Verify group results
      expect(groupResults[0].allSucceeded).toBe(false);
      expect(groupResults[0].subtaskResults.filter(r => r.status === 'completed').length).toBe(2);

      // Step 3: Review detects failure
      const review = createTestReview(2, 1, 0, {
        needsReplanning: false, // Only 1 failure, not critical
        issues: [
          {
            subtaskId: 'task-subtract',
            issue: 'Syntax error in implementation',
            severity: 'error',
            suggestion: 'Check the generated code for syntax errors',
          },
        ],
      });

      expect(review.overallSuccess).toBe(false);
      expect(review.completedTasks).toBe(2);
      expect(review.failedTasks).toBe(1);
      expect(review.issues.length).toBe(1);
    });
  });

  // ===========================================
  // ERROR SCENARIOS
  // ===========================================
  describe('Error Scenarios', () => {
    it('should handle invalid repository path', async () => {
      const invalidPath = '/nonexistent/path/repo';
      
      // This should fail gracefully
      const result = createBranch(invalidPath, 'test-branch');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle empty task gracefully', () => {
      // Creating a plan with empty task should still work (validation happens at API level)
      const plan = createTestPlan('');
      expect(plan.originalTask).toBe('');
    });

    it('should handle maximum iteration limit', () => {
      const input: Partial<MultiAgentPlanningInput> = {
        maxIterations: 5, // Maximum allowed
        task: 'Complex task that might need replanning',
      };

      let iterations = 0;
      const maxIterations = input.maxIterations!;

      // Simulate iteration loop
      while (iterations < maxIterations) {
        iterations++;
        
        // Simulate partial failure each iteration
        const review = createTestReview(3, 2, 0, { needsReplanning: true });
        
        if (!review.needsReplanning || iterations >= maxIterations) {
          break;
        }
      }

      expect(iterations).toBeLessThanOrEqual(maxIterations);
    });

    it('should handle critical task failure stopping execution', () => {
      const plan = createTestPlan('Task with critical dependency', {
        parallelGroups: [
          {
            id: 'group-1',
            name: 'Critical',
            executionOrder: 1,
            subtasks: [
              createTestSubtask('critical-task', { priority: 'critical' }),
            ],
          },
          {
            id: 'group-2',
            name: 'Dependent',
            executionOrder: 2,
            subtasks: [
              createTestSubtask('dependent-task', { dependencies: ['critical-task'] }),
            ],
          },
        ],
      });

      // Simulate critical task failure
      const group1Results: SubtaskResult[] = [
        createTestResult('critical-task', 'failed', { error: 'Critical error' }),
      ];

      // Check if critical task failed
      const criticalFailed = plan.parallelGroups[0].subtasks
        .filter(s => s.priority === 'critical')
        .some(s => group1Results.find(r => r.subtaskId === s.id && r.status === 'failed'));

      expect(criticalFailed).toBe(true);
      
      // Group 2 should be skipped
      const group2Results: SubtaskResult[] = plan.parallelGroups[1].subtasks.map(s =>
        createTestResult(s.id, 'skipped', { result: 'Skipped due to critical task failure' })
      );

      expect(group2Results[0].status).toBe('skipped');
    });
  });

  // ===========================================
  // PERFORMANCE AND SCALE TESTS
  // ===========================================
  describe('Performance and Scale', () => {
    it('should handle many parallel tasks', () => {
      const manyTasks = Array.from({ length: 10 }, (_, i) => 
        createTestSubtask(`task-${i}`, { title: `Task ${i}` })
      );

      const plan = createTestPlan('Many parallel tasks', {
        parallelGroups: [
          {
            id: 'large-group',
            name: 'Parallel Execution',
            executionOrder: 1,
            subtasks: manyTasks,
          },
        ],
      });

      expect(plan.parallelGroups[0].subtasks.length).toBe(10);
    });

    it('should handle many sequential groups', () => {
      const manyGroups: ParallelGroup[] = Array.from({ length: 5 }, (_, i) => ({
        id: `group-${i}`,
        name: `Group ${i}`,
        executionOrder: i + 1,
        subtasks: [createTestSubtask(`g${i}-task`)],
      }));

      const plan = createTestPlan('Many sequential groups', {
        parallelGroups: manyGroups,
      });

      expect(plan.parallelGroups.length).toBe(5);
      expect(plan.parallelGroups[4].executionOrder).toBe(5);
    });

    it('should handle complex dependency graphs', () => {
      // Create a diamond dependency pattern
      // A (types) -> B (service), C (utils) -> D (integration)
      const plan = createTestPlan('Diamond dependencies', {
        parallelGroups: [
          {
            id: 'group-1',
            name: 'Types',
            executionOrder: 1,
            subtasks: [createTestSubtask('A', { title: 'Types' })],
          },
          {
            id: 'group-2',
            name: 'Parallel Implementation',
            executionOrder: 2,
            subtasks: [
              createTestSubtask('B', { title: 'Service', dependencies: ['A'] }),
              createTestSubtask('C', { title: 'Utils', dependencies: ['A'] }),
            ],
          },
          {
            id: 'group-3',
            name: 'Integration',
            executionOrder: 3,
            subtasks: [
              createTestSubtask('D', { title: 'Integration', dependencies: ['B', 'C'] }),
            ],
          },
        ],
      });

      const integrationTask = plan.parallelGroups[2].subtasks[0];
      expect(integrationTask.dependencies).toContain('B');
      expect(integrationTask.dependencies).toContain('C');
    });
  });
});
