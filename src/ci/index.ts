/**
 * CI/CD Engine Entry Point
 * 
 * A GitHub Actions-compatible CI/CD engine for wit repositories.
 * Workflows are defined in .wit/workflows/*.yml
 * 
 * **Built on Mastra Workflows**
 * 
 * The CI/CD engine is built on top of Mastra workflows, providing:
 * - Observability and tracing for each step
 * - Retry handling for transient failures
 * - Real-time streaming of execution events
 * - Integration with the wit AI agent ecosystem
 * 
 * **Runner System**
 * 
 * The CI/CD engine supports distributed execution via runners:
 * - Self-hosted runners for custom environments
 * - Cloud runners for scalability
 * - Job queue for work distribution
 * - Real-time log streaming
 */

// Export types
export type {
  Workflow,
  WorkflowTrigger,
  Job,
  Step,
  Service,
  Container,
  Strategy,
  Concurrency,
  Defaults,
  Permissions,
  PermissionLevel,
  InputDef,
  PushTrigger,
  PullRequestTrigger,
  ScheduleTrigger,
  WorkflowDispatchTrigger,
  WorkflowCallTrigger,
  ParsedWorkflow,
  ValidationError,
  ValidationResult,
  TriggerEvent,
  ShellType,
} from './types';

export {
  TRIGGER_EVENTS,
  SHELL_TYPES,
  EXPRESSION_PATTERN,
  ACTION_REFERENCE_PATTERN,
  CRON_PATTERN,
} from './types';

// Export parser functions
export {
  parseWorkflow,
  parseYAML,
  validateWorkflow,
  loadWorkflows,
  loadWorkflowFile,
  validateWorkflowFile,
  validateExpression,
  WorkflowValidationError,
  WorkflowLoadError,
} from './parser';

// Export Mastra-based CI workflow
export {
  ciExecutionWorkflow,
  type CIExecutionInput,
  type CIExecutionOutput,
  type StepResult,
  type JobResult,
  type ExecutionContext,
  CIExecutionInputSchema,
  CIExecutionOutputSchema,
  StepResultSchema,
  JobResultSchema,
} from './workflows/index';

// Export runner system
export {
  // Queue service
  JobQueueService,
  getJobQueueService,
  startJobQueueService,
  stopJobQueueService,
  type QueueConfig,
  // Runner client
  RunnerClient,
  registerRunner,
  type RunnerClientConfig,
  // Types
  type RunnerStatus,
  type RunnerType,
  type RunnerOS,
  type RunnerConfig,
  type RunnerCapabilities,
  type QueuedJob,
  type JobPayload,
  type JobExecutionResult,
  type StepExecutionResult,
  type LogEntry,
  type RunnerHeartbeat,
} from './runner';

import * as path from 'path';
import * as fs from 'fs';
import {
  Workflow,
  ParsedWorkflow,
  ValidationResult,
  TriggerEvent,
  PushTrigger,
  PullRequestTrigger,
} from './types';
import { loadWorkflows, loadWorkflowFile, validateWorkflowFile, WorkflowLoadError } from './parser';

/**
 * CI Engine configuration
 */
export interface CIEngineConfig {
  /** Repository root path */
  repoPath: string;
  /** Custom workflows directory (default: .wit/workflows) */
  workflowsDir?: string;
  /** Enable verbose logging */
  verbose?: boolean;
}

/**
 * Trigger context for matching workflows
 */
export interface TriggerContext {
  /** Event type */
  event: TriggerEvent;
  /** Branch name (for push/pull_request) */
  branch?: string;
  /** Tag name (for push) */
  tag?: string;
  /** Changed file paths */
  paths?: string[];
  /** Pull request type (for pull_request) */
  prType?: string;
  /** Workflow dispatch inputs */
  inputs?: Record<string, string>;
}

/**
 * CI Engine for managing and running workflows
 */
export class CIEngine {
  private config: CIEngineConfig;
  private workflows: ParsedWorkflow[] = [];
  private loaded = false;
  
  constructor(config: CIEngineConfig) {
    this.config = {
      ...config,
      workflowsDir: config.workflowsDir ?? path.join(config.repoPath, '.wit', 'workflows'),
    };
  }
  
  /**
   * Load all workflows from the repository
   */
  load(): ParsedWorkflow[] {
    this.workflows = loadWorkflows(this.config.repoPath);
    this.loaded = true;
    return this.workflows;
  }
  
  /**
   * Get all loaded workflows
   */
  getWorkflows(): ParsedWorkflow[] {
    if (!this.loaded) {
      this.load();
    }
    return this.workflows;
  }
  
  /**
   * Get a workflow by name
   */
  getWorkflow(name: string): ParsedWorkflow | undefined {
    return this.getWorkflows().find(w => w.workflow.name === name);
  }
  
  /**
   * Find workflows that match a trigger context
   */
  findMatchingWorkflows(context: TriggerContext): ParsedWorkflow[] {
    return this.getWorkflows().filter(pw => this.matchesTrigger(pw.workflow, context));
  }
  
  /**
   * Check if a workflow matches a trigger context
   */
  private matchesTrigger(workflow: Workflow, context: TriggerContext): boolean {
    const trigger = workflow.on;
    
    // Handle string/array triggers (already normalized to object in parser)
    const triggerObj = trigger as Record<string, unknown>;
    
    if (!(context.event in triggerObj)) {
      return false;
    }
    
    const eventConfig = triggerObj[context.event];
    
    // Empty config means match all
    if (!eventConfig || (typeof eventConfig === 'object' && Object.keys(eventConfig).length === 0)) {
      return true;
    }
    
    // Match based on event type
    switch (context.event) {
      case 'push':
        return this.matchesPush(eventConfig as PushTrigger, context);
      case 'pull_request':
      case 'pull_request_target':
        return this.matchesPullRequest(eventConfig as PullRequestTrigger, context);
      case 'workflow_dispatch':
        return true; // Always match if event is in trigger
      case 'schedule':
        return true; // Schedule matching is handled by scheduler
      default:
        return true;
    }
  }
  
  /**
   * Check if push trigger matches
   */
  private matchesPush(config: PushTrigger, context: TriggerContext): boolean {
    // Check branches
    if (context.branch) {
      if (config.branches && !this.matchesPattern(context.branch, config.branches)) {
        return false;
      }
      if (config['branches-ignore'] && this.matchesPattern(context.branch, config['branches-ignore'])) {
        return false;
      }
    }
    
    // Check tags
    if (context.tag) {
      if (config.tags && !this.matchesPattern(context.tag, config.tags)) {
        return false;
      }
      if (config['tags-ignore'] && this.matchesPattern(context.tag, config['tags-ignore'])) {
        return false;
      }
    }
    
    // Check paths
    if (context.paths && context.paths.length > 0) {
      if (config.paths) {
        const anyMatch = context.paths.some(p => this.matchesPattern(p, config.paths!));
        if (!anyMatch) return false;
      }
      if (config['paths-ignore']) {
        const allIgnored = context.paths.every(p => this.matchesPattern(p, config['paths-ignore']!));
        if (allIgnored) return false;
      }
    }
    
    return true;
  }
  
  /**
   * Check if pull request trigger matches
   */
  private matchesPullRequest(config: PullRequestTrigger, context: TriggerContext): boolean {
    // Check branches (target branch for PRs)
    if (context.branch) {
      if (config.branches && !this.matchesPattern(context.branch, config.branches)) {
        return false;
      }
      if (config['branches-ignore'] && this.matchesPattern(context.branch, config['branches-ignore'])) {
        return false;
      }
    }
    
    // Check paths
    if (context.paths && context.paths.length > 0) {
      if (config.paths) {
        const anyMatch = context.paths.some(p => this.matchesPattern(p, config.paths!));
        if (!anyMatch) return false;
      }
      if (config['paths-ignore']) {
        const allIgnored = context.paths.every(p => this.matchesPattern(p, config['paths-ignore']!));
        if (allIgnored) return false;
      }
    }
    
    // Check PR types
    if (context.prType && config.types) {
      const types = config.types as string[];
      if (!types.includes(context.prType)) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Check if a value matches any of the patterns
   */
  private matchesPattern(value: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      // Handle glob patterns
      if (pattern.includes('*')) {
        // Convert glob pattern to regex
        // ** matches any characters including /
        // * matches any characters except /
        // ? matches single character
        let regexStr = '^';
        let i = 0;
        while (i < pattern.length) {
          const char = pattern[i];
          if (char === '*') {
            if (pattern[i + 1] === '*') {
              // ** matches anything including slashes
              regexStr += '.*';
              i += 2;
            } else {
              // * matches anything except slashes
              regexStr += '[^/]*';
              i++;
            }
          } else if (char === '?') {
            regexStr += '.';
            i++;
          } else if ('/^$.|+[]{}()\\'.includes(char)) {
            // Escape regex special characters
            regexStr += '\\' + char;
            i++;
          } else {
            regexStr += char;
            i++;
          }
        }
        regexStr += '$';
        
        const regex = new RegExp(regexStr);
        return regex.test(value);
      }
      return value === pattern;
    });
  }
  
  /**
   * Validate a workflow YAML content
   */
  validate(content: string): ValidationResult {
    return validateWorkflowFile(content);
  }
  
  /**
   * Initialize the workflows directory
   */
  init(): void {
    const workflowsDir = this.config.workflowsDir!;
    
    if (!fs.existsSync(workflowsDir)) {
      fs.mkdirSync(workflowsDir, { recursive: true });
    }
    
    // Create a sample workflow file
    const samplePath = path.join(workflowsDir, 'ci.yml.sample');
    if (!fs.existsSync(samplePath)) {
      fs.writeFileSync(samplePath, SAMPLE_WORKFLOW);
    }
  }
  
  /**
   * Get topologically sorted jobs for a workflow
   */
  getJobOrder(workflow: Workflow): string[] {
    const jobs = workflow.jobs;
    const jobNames = Object.keys(jobs);
    const visited = new Set<string>();
    const result: string[] = [];
    
    const visit = (name: string) => {
      if (visited.has(name)) return;
      visited.add(name);
      
      const job = jobs[name];
      const needs = job.needs ?? [];
      
      for (const dep of needs) {
        visit(dep);
      }
      
      result.push(name);
    };
    
    for (const name of jobNames) {
      visit(name);
    }
    
    return result;
  }
  
  /**
   * Get jobs that can run in parallel (no unmet dependencies)
   */
  getParallelJobs(workflow: Workflow, completedJobs: Set<string>): string[] {
    const jobs = workflow.jobs;
    const result: string[] = [];
    
    for (const [name, job] of Object.entries(jobs)) {
      if (completedJobs.has(name)) continue;
      
      const needs: string[] = Array.isArray(job.needs) ? job.needs : (job.needs ? [job.needs] : []);
      const allDepsCompleted = needs.every((dep: string) => completedJobs.has(dep));
      
      if (allDepsCompleted) {
        result.push(name);
      }
    }
    
    return result;
  }
}

/**
 * Sample workflow for new repositories
 */
const SAMPLE_WORKFLOW = `# Sample CI workflow
# Rename this file to ci.yml to enable

name: CI

on:
  push:
    branches:
      - main
      - develop
  pull_request:
    branches:
      - main

env:
  NODE_VERSION: '20'

jobs:
  build:
    name: Build
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

  test:
    name: Test
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint
`;

/**
 * Create a new CI engine for a repository
 */
export function createCIEngine(repoPath: string): CIEngine {
  return new CIEngine({ repoPath });
}

// =============================================================================
// Mastra-based Workflow Execution
// =============================================================================

/**
 * Options for running a CI workflow using Mastra
 */
export interface RunCIWorkflowOptions {
  /** Repository ID */
  repoId: string;
  /** Repository disk path */
  repoDiskPath: string;
  /** Commit SHA */
  commitSha: string;
  /** Branch name (optional) */
  branch?: string;
  /** Event that triggered the workflow */
  event: string;
  /** Event payload */
  eventPayload?: Record<string, unknown>;
  /** User who triggered the workflow */
  triggeredById?: string;
  /** Workflow file path */
  workflowPath: string;
  /** Input values for workflow_dispatch */
  inputs?: Record<string, string>;
  /** Environment variables */
  env?: Record<string, string>;
  /** Secrets (not logged) */
  secrets?: Record<string, string>;
}

/**
 * Run a CI workflow using the Mastra-based execution engine
 * 
 * This is the recommended way to execute CI workflows. It provides:
 * - Observability and tracing
 * - Retry handling for transient failures  
 * - Real-time streaming support
 * - Integration with the Mastra ecosystem
 * 
 * @param workflow - The parsed workflow definition
 * @param options - Execution options
 * @returns CI execution results
 * 
 * @example
 * ```typescript
 * import { runCIWorkflow, loadWorkflowFile } from './ci';
 * 
 * const parsed = loadWorkflowFile('/path/to/.wit/workflows/ci.yml');
 * const result = await runCIWorkflow(parsed.workflow, {
 *   repoId: 'repo-123',
 *   repoDiskPath: '/path/to/repo',
 *   commitSha: 'abc123',
 *   event: 'push',
 *   workflowPath: '.wit/workflows/ci.yml',
 * });
 * 
 * console.log(`Workflow ${result.success ? 'passed' : 'failed'}: ${result.summary}`);
 * ```
 */
export async function runCIWorkflow(
  workflow: Workflow,
  options: RunCIWorkflowOptions
): Promise<import('./workflows/index').CIExecutionOutput> {
  const { runCIExecutionWorkflow } = await import('../ai/mastra.js');
  
  return runCIExecutionWorkflow({
    ...options,
    workflow,
  });
}

/**
 * Stream a CI workflow execution using Mastra
 * 
 * Provides real-time streaming of workflow execution events.
 * Useful for showing live progress in the UI.
 * 
 * @param workflow - The parsed workflow definition
 * @param options - Execution options
 * @returns AsyncIterator of workflow events
 * 
 * @example
 * ```typescript
 * import { streamCIWorkflow, loadWorkflowFile } from './ci';
 * 
 * const parsed = loadWorkflowFile('/path/to/.wit/workflows/ci.yml');
 * 
 * for await (const event of streamCIWorkflow(parsed.workflow, options)) {
 *   if (event.type === 'step-start') {
 *     console.log(`Starting step: ${event.stepName}`);
 *   } else if (event.type === 'step-complete') {
 *     console.log(`Step completed: ${event.success ? '✅' : '❌'}`);
 *   }
 * }
 * ```
 */
export async function* streamCIWorkflow(
  workflow: Workflow,
  options: RunCIWorkflowOptions
) {
  const { streamCIExecutionWorkflow } = await import('../ai/mastra.js');
  
  yield* streamCIExecutionWorkflow({
    ...options,
    workflow,
  });
}

/**
 * Run a CI workflow from a file path
 * 
 * Convenience function that loads and executes a workflow in one call.
 * 
 * @param workflowFilePath - Path to the workflow YAML file
 * @param options - Execution options (workflowPath will be auto-filled)
 * @returns CI execution results
 */
export async function runCIWorkflowFromFile(
  workflowFilePath: string,
  options: Omit<RunCIWorkflowOptions, 'workflowPath'>
): Promise<import('./workflows/index').CIExecutionOutput> {
  const parsed = loadWorkflowFile(workflowFilePath);
  
  return runCIWorkflow(parsed.workflow, {
    ...options,
    workflowPath: parsed.filePath,
  });
}
