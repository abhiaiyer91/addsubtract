/**
 * Mastra-based CI/CD Workflow Tests
 * 
 * Tests for the CI execution workflow built on Mastra.
 * These tests verify the workflow structure, step definitions,
 * and helper functions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ciExecutionWorkflow,
  CIExecutionInputSchema,
  CIExecutionOutputSchema,
  StepResultSchema,
  JobResultSchema,
  type CIExecutionInput,
  type CIExecutionOutput,
  type StepResult,
  type JobResult,
} from '../workflows/index';
import type { Workflow } from '../types';

describe('Mastra CI/CD Workflow', () => {
  describe('Schema Validation', () => {
    it('should validate CIExecutionInputSchema', () => {
      const validInput = {
        repoId: 'repo-123',
        repoDiskPath: '/path/to/repo',
        commitSha: 'abc123def456',
        branch: 'main',
        event: 'push',
        eventPayload: { ref: 'refs/heads/main' },
        triggeredById: 'user-123',
        workflowPath: '.wit/workflows/ci.yml',
        inputs: {},
        env: { CI: 'true' },
        secrets: {},
        workflow: {
          name: 'CI',
          on: { push: {} },
          jobs: {
            build: {
              'runs-on': 'ubuntu-latest',
              steps: [{ run: 'echo hello' }],
            },
          },
        } as Workflow,
      };

      const result = CIExecutionInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid CIExecutionInput', () => {
      const invalidInput = {
        // Missing required fields
        repoId: 'repo-123',
      };

      const result = CIExecutionInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should validate StepResultSchema', () => {
      const validStepResult: StepResult = {
        stepId: 'step-123',
        stepName: 'Build',
        success: true,
        exitCode: 0,
        output: 'Build succeeded',
        outputs: { artifact_path: '/dist' },
        duration: 5000,
        skipped: false,
      };

      const result = StepResultSchema.safeParse(validStepResult);
      expect(result.success).toBe(true);
    });

    it('should validate JobResultSchema', () => {
      const validJobResult: JobResult = {
        jobId: 'job-123',
        jobName: 'Build',
        success: true,
        steps: [
          {
            stepId: 'step-1',
            stepName: 'Checkout',
            success: true,
            exitCode: 0,
            output: 'Checked out',
            outputs: {},
            duration: 1000,
            skipped: false,
          },
        ],
        outputs: {},
        duration: 10000,
        skipped: false,
      };

      const result = JobResultSchema.safeParse(validJobResult);
      expect(result.success).toBe(true);
    });

    it('should validate CIExecutionOutputSchema', () => {
      const validOutput: CIExecutionOutput = {
        success: true,
        runId: 'run-123',
        conclusion: 'success',
        jobs: {
          build: {
            jobId: 'job-123',
            jobName: 'Build',
            success: true,
            steps: [],
            outputs: {},
            duration: 10000,
            skipped: false,
          },
        },
        totalDuration: 10000,
        summary: 'Workflow completed successfully',
      };

      const result = CIExecutionOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });

    it('should accept all valid conclusion values', () => {
      const conclusions = ['success', 'failure', 'cancelled', 'skipped'] as const;

      for (const conclusion of conclusions) {
        const output: CIExecutionOutput = {
          success: conclusion === 'success',
          runId: 'run-123',
          conclusion,
          jobs: {},
          totalDuration: 0,
          summary: 'Test',
        };

        const result = CIExecutionOutputSchema.safeParse(output);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Workflow Structure', () => {
    it('should have ciExecutionWorkflow defined', () => {
      expect(ciExecutionWorkflow).toBeDefined();
    });

    it('should have correct workflow id', () => {
      expect(ciExecutionWorkflow.id).toBe('ci-execution');
    });
  });

  describe('Workflow Types', () => {
    it('should export all required types', () => {
      // Type imports should work (compile-time check)
      const input: CIExecutionInput = {
        repoId: 'repo-123',
        repoDiskPath: '/path/to/repo',
        commitSha: 'abc123',
        event: 'push',
        workflowPath: '.wit/workflows/ci.yml',
        workflow: {
          name: 'Test',
          on: { push: {} },
          jobs: {
            build: {
              'runs-on': 'ubuntu-latest',
              steps: [{ run: 'echo test' }],
            },
          },
        } as Workflow,
      };

      expect(input.repoId).toBe('repo-123');
    });

    it('should handle optional fields in CIExecutionInput', () => {
      const minimalInput = {
        repoId: 'repo-123',
        repoDiskPath: '/path/to/repo',
        commitSha: 'abc123',
        event: 'push',
        workflowPath: '.wit/workflows/ci.yml',
        workflow: {
          name: 'Test',
          on: { push: {} },
          jobs: {
            build: {
              'runs-on': 'ubuntu-latest',
              steps: [{ run: 'echo test' }],
            },
          },
        } as Workflow,
      };

      const result = CIExecutionInputSchema.safeParse(minimalInput);
      expect(result.success).toBe(true);
    });
  });

  describe('Step Result Validation', () => {
    it('should allow error field in StepResult', () => {
      const stepWithError: StepResult = {
        stepId: 'step-123',
        stepName: 'Failed Step',
        success: false,
        exitCode: 1,
        output: 'Command failed',
        error: 'Exit code 1',
        outputs: {},
        duration: 1000,
        skipped: false,
      };

      const result = StepResultSchema.safeParse(stepWithError);
      expect(result.success).toBe(true);
    });

    it('should default skipped to false', () => {
      const stepWithoutSkipped = {
        stepId: 'step-123',
        stepName: 'Step',
        success: true,
        exitCode: 0,
        output: 'Done',
        outputs: {},
        duration: 1000,
      };

      const result = StepResultSchema.parse(stepWithoutSkipped);
      expect(result.skipped).toBe(false);
    });
  });

  describe('Job Result Validation', () => {
    it('should validate job with multiple steps', () => {
      const jobWithSteps: JobResult = {
        jobId: 'job-123',
        jobName: 'Test Suite',
        success: true,
        steps: [
          {
            stepId: 'step-1',
            stepName: 'Setup',
            success: true,
            exitCode: 0,
            output: 'Setup complete',
            outputs: {},
            duration: 500,
            skipped: false,
          },
          {
            stepId: 'step-2',
            stepName: 'Run Tests',
            success: true,
            exitCode: 0,
            output: 'All tests passed',
            outputs: { coverage: '85%' },
            duration: 5000,
            skipped: false,
          },
          {
            stepId: 'step-3',
            stepName: 'Cleanup',
            success: true,
            exitCode: 0,
            output: 'Cleaned up',
            outputs: {},
            duration: 200,
            skipped: false,
          },
        ],
        outputs: { test_result: 'passed' },
        duration: 5700,
        skipped: false,
      };

      const result = JobResultSchema.safeParse(jobWithSteps);
      expect(result.success).toBe(true);
    });

    it('should validate skipped job', () => {
      const skippedJob: JobResult = {
        jobId: 'job-123',
        jobName: 'Deploy',
        success: true, // Skipped jobs are still "successful"
        steps: [],
        outputs: {},
        duration: 0,
        skipped: true,
      };

      const result = JobResultSchema.safeParse(skippedJob);
      expect(result.success).toBe(true);
    });
  });

  describe('Output Schema Validation', () => {
    it('should validate output with multiple jobs', () => {
      const output: CIExecutionOutput = {
        success: true,
        runId: 'run-123',
        conclusion: 'success',
        jobs: {
          build: {
            jobId: 'job-1',
            jobName: 'Build',
            success: true,
            steps: [],
            outputs: { artifact: 'dist.tar.gz' },
            duration: 5000,
            skipped: false,
          },
          test: {
            jobId: 'job-2',
            jobName: 'Test',
            success: true,
            steps: [],
            outputs: {},
            duration: 10000,
            skipped: false,
          },
          deploy: {
            jobId: 'job-3',
            jobName: 'Deploy',
            success: true,
            steps: [],
            outputs: { url: 'https://example.com' },
            duration: 3000,
            skipped: false,
          },
        },
        totalDuration: 18000,
        summary: '✅ Workflow completed successfully. 3/3 jobs passed.',
      };

      const result = CIExecutionOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should validate failed output with error', () => {
      const failedOutput: CIExecutionOutput = {
        success: false,
        runId: 'run-456',
        conclusion: 'failure',
        jobs: {
          build: {
            jobId: 'job-1',
            jobName: 'Build',
            success: false,
            steps: [
              {
                stepId: 'step-1',
                stepName: 'Compile',
                success: false,
                exitCode: 1,
                output: 'Compilation failed',
                error: 'TypeScript error',
                outputs: {},
                duration: 2000,
                skipped: false,
              },
            ],
            outputs: {},
            duration: 2000,
            skipped: false,
          },
        },
        totalDuration: 2000,
        summary: '❌ Workflow failed. 1 job(s) failed, 0 skipped. Failed: build',
        error: 'Build job failed',
      };

      const result = CIExecutionOutputSchema.safeParse(failedOutput);
      expect(result.success).toBe(true);
    });

    it('should allow optional runId', () => {
      const outputWithoutRunId: CIExecutionOutput = {
        success: false,
        conclusion: 'failure',
        jobs: {},
        totalDuration: 0,
        summary: 'Failed to start',
        error: 'No database connection',
      };

      const result = CIExecutionOutputSchema.safeParse(outputWithoutRunId);
      expect(result.success).toBe(true);
    });
  });
});

describe('CI Workflow Integration Patterns', () => {
  describe('Workflow Definition Pattern', () => {
    it('should support typical CI workflow with build, test, deploy', () => {
      const typicalWorkflow: Workflow = {
        name: 'CI/CD Pipeline',
        on: {
          push: {
            branches: ['main', 'develop'],
          },
          pull_request: {
            branches: ['main'],
          },
        },
        env: {
          NODE_VERSION: '20',
        },
        jobs: {
          build: {
            'runs-on': 'ubuntu-latest',
            steps: [
              { uses: 'actions/checkout@v4' },
              { name: 'Install', run: 'npm ci' },
              { name: 'Build', run: 'npm run build' },
            ],
          },
          test: {
            'runs-on': 'ubuntu-latest',
            needs: ['build'],
            steps: [
              { uses: 'actions/checkout@v4' },
              { name: 'Install', run: 'npm ci' },
              { name: 'Test', run: 'npm test' },
            ],
          },
          deploy: {
            'runs-on': 'ubuntu-latest',
            needs: ['build', 'test'],
            if: "github.ref == 'refs/heads/main'",
            steps: [
              { name: 'Deploy', run: 'npm run deploy' },
            ],
          },
        },
      };

      expect(typicalWorkflow.jobs.build).toBeDefined();
      expect(typicalWorkflow.jobs.test.needs).toContain('build');
      expect(typicalWorkflow.jobs.deploy.needs).toContain('test');
      expect(typicalWorkflow.jobs.deploy.if).toBeDefined();
    });
  });

  describe('Input Construction Pattern', () => {
    it('should construct valid input from parsed workflow', () => {
      const workflow: Workflow = {
        name: 'Test',
        on: { push: {} },
        jobs: {
          test: {
            'runs-on': 'ubuntu-latest',
            steps: [{ run: 'npm test' }],
          },
        },
      };

      const input: CIExecutionInput = {
        repoId: 'repo-123',
        repoDiskPath: '/repos/my-project',
        commitSha: 'abc123def456789',
        branch: 'feature/new-feature',
        event: 'push',
        eventPayload: {
          ref: 'refs/heads/feature/new-feature',
          before: '000000000',
          after: 'abc123def456789',
        },
        triggeredById: 'user-456',
        workflowPath: '.wit/workflows/test.yml',
        workflow,
        env: {
          CUSTOM_VAR: 'value',
        },
      };

      const result = CIExecutionInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('Output Processing Pattern', () => {
    it('should extract job-level information from output', () => {
      const output: CIExecutionOutput = {
        success: true,
        runId: 'run-123',
        conclusion: 'success',
        jobs: {
          build: {
            jobId: 'job-1',
            jobName: 'Build',
            success: true,
            steps: [],
            outputs: { version: '1.0.0' },
            duration: 5000,
            skipped: false,
          },
          test: {
            jobId: 'job-2',
            jobName: 'Test',
            success: true,
            steps: [],
            outputs: { coverage: '90%' },
            duration: 10000,
            skipped: false,
          },
        },
        totalDuration: 15000,
        summary: 'All jobs passed',
      };

      // Extract job outputs
      const buildVersion = output.jobs['build']?.outputs['version'];
      const testCoverage = output.jobs['test']?.outputs['coverage'];

      expect(buildVersion).toBe('1.0.0');
      expect(testCoverage).toBe('90%');

      // Calculate job statistics
      const jobCount = Object.keys(output.jobs).length;
      const passedJobs = Object.values(output.jobs).filter(j => j.success).length;
      const skippedJobs = Object.values(output.jobs).filter(j => j.skipped).length;

      expect(jobCount).toBe(2);
      expect(passedJobs).toBe(2);
      expect(skippedJobs).toBe(0);
    });

    it('should identify failed steps in output', () => {
      const output: CIExecutionOutput = {
        success: false,
        runId: 'run-123',
        conclusion: 'failure',
        jobs: {
          test: {
            jobId: 'job-1',
            jobName: 'Test',
            success: false,
            steps: [
              {
                stepId: 'step-1',
                stepName: 'Install',
                success: true,
                exitCode: 0,
                output: 'Installed',
                outputs: {},
                duration: 1000,
                skipped: false,
              },
              {
                stepId: 'step-2',
                stepName: 'Run Tests',
                success: false,
                exitCode: 1,
                output: 'Test failed: expected 1 but got 2',
                error: 'Assertion error',
                outputs: {},
                duration: 5000,
                skipped: false,
              },
            ],
            outputs: {},
            duration: 6000,
            skipped: false,
          },
        },
        totalDuration: 6000,
        summary: 'Tests failed',
      };

      // Find failed steps
      const failedSteps = Object.values(output.jobs)
        .flatMap(job => job.steps)
        .filter(step => !step.success && !step.skipped);

      expect(failedSteps).toHaveLength(1);
      expect(failedSteps[0].stepName).toBe('Run Tests');
      expect(failedSteps[0].error).toBe('Assertion error');
    });
  });
});
