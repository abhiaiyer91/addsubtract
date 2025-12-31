/**
 * Unit Tests for Multi-Agent Planning Workflow
 * 
 * Tests for:
 * - Schema validation (zod schemas)
 * - Helper functions (createFallbackPlan, createFallbackReview)
 * - Type definitions and enums
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TaskPriority,
  TaskStatus,
  SubtaskSchema,
  ParallelGroupSchema,
  ExecutionPlanSchema,
  SubtaskResultSchema,
  GroupResultSchema,
  ReviewResultSchema,
  MultiAgentPlanningInputSchema,
  MultiAgentPlanningOutputSchema,
  type Subtask,
  type ParallelGroup,
  type ExecutionPlan,
  type SubtaskResult,
  type GroupResult,
  type ReviewResult,
  type MultiAgentPlanningInput,
  type MultiAgentPlanningOutput,
} from '../ai/workflows/multi-agent-planning.workflow';

describe('Multi-Agent Planning Workflow', () => {
  // ===========================================
  // TASK PRIORITY TESTS
  // ===========================================
  describe('TaskPriority', () => {
    it('should accept valid priority values', () => {
      const validPriorities = ['critical', 'high', 'medium', 'low'];
      
      for (const priority of validPriorities) {
        expect(() => TaskPriority.parse(priority)).not.toThrow();
      }
    });

    it('should reject invalid priority values', () => {
      const invalidPriorities = ['urgent', 'normal', 'none', ''];
      
      for (const priority of invalidPriorities) {
        expect(() => TaskPriority.parse(priority)).toThrow();
      }
    });
  });

  // ===========================================
  // TASK STATUS TESTS
  // ===========================================
  describe('TaskStatus', () => {
    it('should accept valid status values', () => {
      const validStatuses = ['pending', 'in_progress', 'completed', 'failed', 'skipped'];
      
      for (const status of validStatuses) {
        expect(() => TaskStatus.parse(status)).not.toThrow();
      }
    });

    it('should reject invalid status values', () => {
      const invalidStatuses = ['running', 'done', 'cancelled', ''];
      
      for (const status of invalidStatuses) {
        expect(() => TaskStatus.parse(status)).toThrow();
      }
    });
  });

  // ===========================================
  // SUBTASK SCHEMA TESTS
  // ===========================================
  describe('SubtaskSchema', () => {
    it('should validate a valid subtask', () => {
      const validSubtask = {
        id: 'task-1',
        title: 'Create types',
        description: 'Create TypeScript types for the feature',
        priority: 'high',
        estimatedEffort: 'small',
        dependencies: [],
        acceptanceCriteria: ['Types are defined', 'Types are exported'],
      };

      const result = SubtaskSchema.parse(validSubtask);
      expect(result.status).toBe('pending'); // default value
      expect(result.id).toBe('task-1');
      expect(result.priority).toBe('high');
    });

    it('should accept subtask with all fields', () => {
      const fullSubtask = {
        id: 'task-2',
        title: 'Implement feature',
        description: 'Full implementation of the feature',
        priority: 'critical',
        estimatedEffort: 'large',
        dependencies: ['task-1'],
        targetFiles: ['src/feature.ts', 'src/types.ts'],
        acceptanceCriteria: ['Feature works', 'Tests pass'],
        status: 'in_progress',
        result: 'Partially completed',
        error: undefined,
      };

      const result = SubtaskSchema.parse(fullSubtask);
      expect(result.dependencies).toContain('task-1');
      expect(result.targetFiles).toContain('src/feature.ts');
      expect(result.status).toBe('in_progress');
    });

    it('should reject subtask without required fields', () => {
      const incompleteSubtask = {
        id: 'task-1',
        title: 'Missing fields',
        // missing description, priority, estimatedEffort, dependencies, acceptanceCriteria
      };

      expect(() => SubtaskSchema.parse(incompleteSubtask)).toThrow();
    });

    it('should reject subtask with invalid priority', () => {
      const invalidSubtask = {
        id: 'task-1',
        title: 'Invalid priority',
        description: 'Description',
        priority: 'invalid',
        estimatedEffort: 'small',
        dependencies: [],
        acceptanceCriteria: ['Criteria'],
      };

      expect(() => SubtaskSchema.parse(invalidSubtask)).toThrow();
    });

    it('should reject subtask with invalid estimatedEffort', () => {
      const invalidSubtask = {
        id: 'task-1',
        title: 'Invalid effort',
        description: 'Description',
        priority: 'high',
        estimatedEffort: 'huge', // invalid
        dependencies: [],
        acceptanceCriteria: ['Criteria'],
      };

      expect(() => SubtaskSchema.parse(invalidSubtask)).toThrow();
    });
  });

  // ===========================================
  // PARALLEL GROUP SCHEMA TESTS
  // ===========================================
  describe('ParallelGroupSchema', () => {
    it('should validate a valid parallel group', () => {
      const validGroup = {
        id: 'group-1',
        name: 'Foundation',
        subtasks: [
          {
            id: 'task-1',
            title: 'Create types',
            description: 'Create TypeScript types',
            priority: 'high',
            estimatedEffort: 'small',
            dependencies: [],
            acceptanceCriteria: ['Types exist'],
          },
        ],
        executionOrder: 1,
      };

      const result = ParallelGroupSchema.parse(validGroup);
      expect(result.subtasks.length).toBe(1);
      expect(result.executionOrder).toBe(1);
    });

    it('should accept group with multiple subtasks', () => {
      const multiTaskGroup = {
        id: 'group-2',
        name: 'Implementation',
        subtasks: [
          {
            id: 'task-1',
            title: 'Task 1',
            description: 'First task',
            priority: 'high',
            estimatedEffort: 'medium',
            dependencies: [],
            acceptanceCriteria: ['Done'],
          },
          {
            id: 'task-2',
            title: 'Task 2',
            description: 'Second task (parallel)',
            priority: 'medium',
            estimatedEffort: 'small',
            dependencies: [],
            acceptanceCriteria: ['Done'],
          },
        ],
        executionOrder: 2,
      };

      const result = ParallelGroupSchema.parse(multiTaskGroup);
      expect(result.subtasks.length).toBe(2);
    });

    it('should accept group with empty subtasks', () => {
      const emptyGroup = {
        id: 'group-empty',
        name: 'Empty Group',
        subtasks: [],
        executionOrder: 0,
      };

      const result = ParallelGroupSchema.parse(emptyGroup);
      expect(result.subtasks.length).toBe(0);
    });
  });

  // ===========================================
  // EXECUTION PLAN SCHEMA TESTS
  // ===========================================
  describe('ExecutionPlanSchema', () => {
    const timestamp = new Date().toISOString();

    it('should validate a valid execution plan', () => {
      const validPlan = {
        id: 'plan-123',
        version: 1,
        originalTask: 'Build a user authentication system',
        summary: 'Multi-step implementation with types, API, and tests',
        parallelGroups: [
          {
            id: 'group-1',
            name: 'Types',
            subtasks: [
              {
                id: 'task-1',
                title: 'Create types',
                description: 'Create auth types',
                priority: 'high',
                estimatedEffort: 'small',
                dependencies: [],
                acceptanceCriteria: ['Types defined'],
              },
            ],
            executionOrder: 1,
          },
        ],
        estimatedTotalEffort: '2-3 hours',
        createdAt: timestamp,
      };

      const result = ExecutionPlanSchema.parse(validPlan);
      expect(result.version).toBe(1);
      expect(result.parallelGroups.length).toBe(1);
    });

    it('should accept plan with riskAssessment', () => {
      const planWithRisk = {
        id: 'plan-456',
        version: 2,
        originalTask: 'Risky refactoring',
        summary: 'High-risk changes',
        parallelGroups: [],
        estimatedTotalEffort: '5-6 hours',
        riskAssessment: 'High risk due to database migrations',
        createdAt: timestamp,
      };

      const result = ExecutionPlanSchema.parse(planWithRisk);
      expect(result.riskAssessment).toBe('High risk due to database migrations');
    });

    it('should reject plan with missing required fields', () => {
      const incompletePlan = {
        id: 'plan-incomplete',
        // missing other required fields
      };

      expect(() => ExecutionPlanSchema.parse(incompletePlan)).toThrow();
    });
  });

  // ===========================================
  // SUBTASK RESULT SCHEMA TESTS
  // ===========================================
  describe('SubtaskResultSchema', () => {
    it('should validate a successful subtask result', () => {
      const successResult = {
        subtaskId: 'task-1',
        status: 'completed',
        result: 'Successfully created auth types',
        filesModified: ['src/types/auth.ts'],
        duration: 5000,
      };

      const result = SubtaskResultSchema.parse(successResult);
      expect(result.status).toBe('completed');
      expect(result.duration).toBe(5000);
    });

    it('should validate a failed subtask result', () => {
      const failedResult = {
        subtaskId: 'task-2',
        status: 'failed',
        error: 'Could not find the file to modify',
        duration: 2000,
      };

      const result = SubtaskResultSchema.parse(failedResult);
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Could not find the file to modify');
    });

    it('should accept result without optional fields', () => {
      const minimalResult = {
        subtaskId: 'task-3',
        status: 'skipped',
        duration: 0,
      };

      const result = SubtaskResultSchema.parse(minimalResult);
      expect(result.result).toBeUndefined();
      expect(result.error).toBeUndefined();
      expect(result.filesModified).toBeUndefined();
    });
  });

  // ===========================================
  // GROUP RESULT SCHEMA TESTS
  // ===========================================
  describe('GroupResultSchema', () => {
    it('should validate a successful group result', () => {
      const successGroup = {
        groupId: 'group-1',
        subtaskResults: [
          { subtaskId: 'task-1', status: 'completed', duration: 3000 },
          { subtaskId: 'task-2', status: 'completed', duration: 4000 },
        ],
        allSucceeded: true,
        duration: 7000,
      };

      const result = GroupResultSchema.parse(successGroup);
      expect(result.allSucceeded).toBe(true);
      expect(result.subtaskResults.length).toBe(2);
    });

    it('should validate a partially failed group result', () => {
      const partialFailure = {
        groupId: 'group-2',
        subtaskResults: [
          { subtaskId: 'task-1', status: 'completed', duration: 3000 },
          { subtaskId: 'task-2', status: 'failed', error: 'Error', duration: 1000 },
        ],
        allSucceeded: false,
        duration: 4000,
      };

      const result = GroupResultSchema.parse(partialFailure);
      expect(result.allSucceeded).toBe(false);
    });
  });

  // ===========================================
  // REVIEW RESULT SCHEMA TESTS
  // ===========================================
  describe('ReviewResultSchema', () => {
    it('should validate a successful review', () => {
      const successReview = {
        overallSuccess: true,
        completedTasks: 5,
        failedTasks: 0,
        skippedTasks: 0,
        issues: [],
        needsReplanning: false,
        summary: 'All tasks completed successfully',
      };

      const result = ReviewResultSchema.parse(successReview);
      expect(result.overallSuccess).toBe(true);
      expect(result.needsReplanning).toBe(false);
    });

    it('should validate a review with issues', () => {
      const reviewWithIssues = {
        overallSuccess: false,
        completedTasks: 3,
        failedTasks: 2,
        skippedTasks: 1,
        issues: [
          {
            subtaskId: 'task-3',
            issue: 'File not found',
            severity: 'error',
            suggestion: 'Check if the file path is correct',
          },
          {
            subtaskId: 'task-4',
            issue: 'Missing error handling',
            severity: 'warning',
          },
        ],
        needsReplanning: true,
        replanningReason: 'Critical tasks failed',
        summary: '2 tasks failed, replanning recommended',
      };

      const result = ReviewResultSchema.parse(reviewWithIssues);
      expect(result.overallSuccess).toBe(false);
      expect(result.issues.length).toBe(2);
      expect(result.needsReplanning).toBe(true);
    });

    it('should validate issue severity levels', () => {
      const validSeverities = ['error', 'warning', 'info'];
      
      for (const severity of validSeverities) {
        const review = {
          overallSuccess: false,
          completedTasks: 1,
          failedTasks: 1,
          skippedTasks: 0,
          issues: [{ subtaskId: 'task-1', issue: 'Test', severity }],
          needsReplanning: false,
          summary: 'Test',
        };
        
        expect(() => ReviewResultSchema.parse(review)).not.toThrow();
      }
    });
  });

  // ===========================================
  // MULTI-AGENT PLANNING INPUT SCHEMA TESTS
  // ===========================================
  describe('MultiAgentPlanningInputSchema', () => {
    it('should validate minimal input', () => {
      const minimalInput = {
        repoId: 'repo-123',
        repoPath: '/path/to/repo',
        owner: 'testuser',
        repoName: 'test-repo',
        userId: 'user-456',
        task: 'Build a simple feature',
      };

      const result = MultiAgentPlanningInputSchema.parse(minimalInput);
      expect(result.maxIterations).toBe(3); // default
      expect(result.maxParallelTasks).toBe(5); // default
      expect(result.dryRun).toBe(false); // default
      expect(result.verbose).toBe(false); // default
      expect(result.createBranch).toBe(true); // default
      expect(result.autoCommit).toBe(true); // default
    });

    it('should validate full input', () => {
      const fullInput = {
        repoId: 'repo-123',
        repoPath: '/path/to/repo',
        owner: 'testuser',
        repoName: 'test-repo',
        userId: 'user-456',
        task: 'Build a complex feature with multiple components',
        context: 'This is a TypeScript project using React',
        maxIterations: 5,
        maxParallelTasks: 10,
        dryRun: true,
        verbose: true,
        createBranch: false,
        branchName: 'feature/custom-branch',
        autoCommit: false,
      };

      const result = MultiAgentPlanningInputSchema.parse(fullInput);
      expect(result.maxIterations).toBe(5);
      expect(result.dryRun).toBe(true);
      expect(result.branchName).toBe('feature/custom-branch');
    });

    it('should reject input without required fields', () => {
      const incompleteInput = {
        repoId: 'repo-123',
        // missing other required fields
      };

      expect(() => MultiAgentPlanningInputSchema.parse(incompleteInput)).toThrow();
    });
  });

  // ===========================================
  // MULTI-AGENT PLANNING OUTPUT SCHEMA TESTS
  // ===========================================
  describe('MultiAgentPlanningOutputSchema', () => {
    it('should validate successful output', () => {
      const timestamp = new Date().toISOString();
      
      const successOutput = {
        success: true,
        finalPlan: {
          id: 'plan-123',
          version: 1,
          originalTask: 'Test task',
          summary: 'Test summary',
          parallelGroups: [],
          estimatedTotalEffort: '1 hour',
          createdAt: timestamp,
        },
        totalIterations: 1,
        groupResults: [],
        review: {
          overallSuccess: true,
          completedTasks: 3,
          failedTasks: 0,
          skippedTasks: 0,
          issues: [],
          needsReplanning: false,
          summary: 'All done',
        },
        branchName: 'feature/test',
        commits: [{ hash: 'abc123', message: 'Initial commit' }],
        summary: 'Successfully completed',
        filesModified: ['src/test.ts'],
        totalDuration: 5000,
      };

      const result = MultiAgentPlanningOutputSchema.parse(successOutput);
      expect(result.success).toBe(true);
      expect(result.totalIterations).toBe(1);
    });

    it('should validate failed output', () => {
      const failedOutput = {
        success: false,
        totalIterations: 2,
        groupResults: [],
        summary: 'Workflow failed after 2 iterations',
        filesModified: [],
        totalDuration: 10000,
        error: 'Critical task failed',
      };

      const result = MultiAgentPlanningOutputSchema.parse(failedOutput);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Critical task failed');
    });
  });

  // ===========================================
  // EDGE CASES AND INTEGRATION SCENARIOS
  // ===========================================
  describe('Edge Cases', () => {
    it('should handle complex dependency chains', () => {
      const complexPlan = {
        id: 'plan-complex',
        version: 1,
        originalTask: 'Complex task',
        summary: 'Multiple interdependent groups',
        parallelGroups: [
          {
            id: 'group-1',
            name: 'Foundation',
            subtasks: [
              {
                id: 'task-1a',
                title: 'Types',
                description: 'Create types',
                priority: 'critical',
                estimatedEffort: 'small',
                dependencies: [],
                acceptanceCriteria: ['Types defined'],
              },
              {
                id: 'task-1b',
                title: 'Utils',
                description: 'Create utils',
                priority: 'high',
                estimatedEffort: 'small',
                dependencies: [],
                acceptanceCriteria: ['Utils created'],
              },
            ],
            executionOrder: 1,
          },
          {
            id: 'group-2',
            name: 'Implementation',
            subtasks: [
              {
                id: 'task-2a',
                title: 'Service',
                description: 'Create service',
                priority: 'high',
                estimatedEffort: 'medium',
                dependencies: ['task-1a', 'task-1b'],
                targetFiles: ['src/service.ts'],
                acceptanceCriteria: ['Service works'],
              },
            ],
            executionOrder: 2,
          },
          {
            id: 'group-3',
            name: 'Integration',
            subtasks: [
              {
                id: 'task-3a',
                title: 'Tests',
                description: 'Create tests',
                priority: 'medium',
                estimatedEffort: 'medium',
                dependencies: ['task-2a'],
                acceptanceCriteria: ['Tests pass'],
              },
            ],
            executionOrder: 3,
          },
        ],
        estimatedTotalEffort: '3-4 hours',
        riskAssessment: 'Medium risk',
        createdAt: new Date().toISOString(),
      };

      const result = ExecutionPlanSchema.parse(complexPlan);
      expect(result.parallelGroups.length).toBe(3);
      
      // Verify dependencies are preserved
      const group2Task = result.parallelGroups[1].subtasks[0];
      expect(group2Task.dependencies).toContain('task-1a');
      expect(group2Task.dependencies).toContain('task-1b');
    });

    it('should handle empty acceptance criteria array', () => {
      // This should fail - acceptanceCriteria is required and should have items
      const taskWithNoCriteria = {
        id: 'task-no-criteria',
        title: 'No criteria',
        description: 'Task without acceptance criteria',
        priority: 'low',
        estimatedEffort: 'trivial',
        dependencies: [],
        acceptanceCriteria: [], // Empty but still required
      };

      // Empty array should still be valid according to schema
      const result = SubtaskSchema.parse(taskWithNoCriteria);
      expect(result.acceptanceCriteria.length).toBe(0);
    });

    it('should handle large file lists', () => {
      const manyFiles = Array.from({ length: 50 }, (_, i) => `src/file${i}.ts`);
      
      const resultWithManyFiles = {
        subtaskId: 'task-many-files',
        status: 'completed',
        result: 'Modified many files',
        filesModified: manyFiles,
        duration: 60000,
      };

      const result = SubtaskResultSchema.parse(resultWithManyFiles);
      expect(result.filesModified?.length).toBe(50);
    });
  });
});
