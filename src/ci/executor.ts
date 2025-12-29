/**
 * CI/CD Job Executor
 * 
 * Executes workflow jobs by running shell commands and capturing output.
 * This is a local executor - jobs run on the same machine as the server.
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import type { Workflow, Job, Step } from './types';
import {
  workflowRunModel,
  jobRunModel,
  stepRunModel,
} from '../db/models/workflow';
import type { JobRun } from '../db/schema';
import { CIEngine } from './index';
import { eventBus } from '../events';

/**
 * Context available during expression evaluation
 */
export interface ExecutionContext {
  github: {
    event_name: string;
    event: Record<string, unknown>;
    sha: string;
    ref: string;
    ref_name: string;
    ref_type: 'branch' | 'tag';
    repository: string;
    repository_owner: string;
    actor: string;
    workflow: string;
    job: string;
    run_id: string;
    run_number: number;
    workspace: string;
    action?: string;
    action_path?: string;
  };
  env: Record<string, string>;
  vars: Record<string, string>;
  secrets: Record<string, string>;
  inputs: Record<string, string>;
  matrix: Record<string, unknown>;
  needs: Record<string, {
    result: 'success' | 'failure' | 'cancelled' | 'skipped';
    outputs: Record<string, string>;
  }>;
  steps: Record<string, {
    outcome: 'success' | 'failure' | 'cancelled' | 'skipped';
    conclusion: 'success' | 'failure' | 'cancelled' | 'skipped';
    outputs: Record<string, string>;
  }>;
  runner: {
    name: string;
    os: 'Linux' | 'Windows' | 'macOS';
    arch: string;
    temp: string;
    tool_cache: string;
  };
  job: {
    status: 'success' | 'failure' | 'cancelled';
  };
}

/**
 * Result of executing a step
 */
export interface StepResult {
  success: boolean;
  exitCode: number;
  output: string;
  error?: string;
  outputs: Record<string, string>;
  duration: number;
}

/**
 * Result of executing a job
 */
export interface JobResult {
  success: boolean;
  steps: StepResult[];
  outputs: Record<string, string>;
  duration: number;
}

/**
 * Result of executing a workflow
 */
export interface WorkflowResult {
  success: boolean;
  jobs: Record<string, JobResult>;
  duration: number;
}

/**
 * Options for executing a workflow
 */
export interface ExecuteOptions {
  /** Repository ID */
  repoId: string;
  /** Repository disk path */
  repoDiskPath: string;
  /** Commit SHA */
  commitSha: string;
  /** Branch name */
  branch?: string;
  /** Event that triggered the workflow */
  event: string;
  /** Event payload */
  eventPayload?: Record<string, unknown>;
  /** User who triggered the workflow */
  triggeredById?: string;
  /** Input values for workflow_dispatch */
  inputs?: Record<string, string>;
  /** Environment variables */
  env?: Record<string, string>;
  /** Secrets (not logged) */
  secrets?: Record<string, string>;
}

/**
 * Expression evaluator for ${{ }} syntax
 */
export function evaluateExpression(
  expression: string,
  context: ExecutionContext
): string {
  // Remove ${{ and }}
  const inner = expression.replace(/^\$\{\{\s*|\s*\}\}$/g, '').trim();
  
  // Simple expression evaluation
  // Supports: github.*, env.*, secrets.*, inputs.*, matrix.*, needs.*, steps.*
  try {
    // Handle string literals
    if (inner.startsWith("'") && inner.endsWith("'")) {
      return inner.slice(1, -1);
    }
    
    // Handle boolean/null
    if (inner === 'true') return 'true';
    if (inner === 'false') return 'false';
    if (inner === 'null') return '';
    
    // Handle property access (e.g., github.sha, env.NODE_ENV)
    const parts = inner.split('.');
    let value: unknown = context;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return '';
      }
    }
    
    return String(value ?? '');
  } catch {
    return '';
  }
}

/**
 * Replace all expressions in a string
 */
export function replaceExpressions(
  text: string,
  context: ExecutionContext
): string {
  return text.replace(/\$\{\{[\s\S]*?\}\}/g, (match) => {
    return evaluateExpression(match, context);
  });
}

/**
 * Evaluate a condition expression
 */
export function evaluateCondition(
  condition: string | undefined,
  context: ExecutionContext
): boolean {
  if (!condition) return true;
  
  const evaluated = replaceExpressions(condition, context);
  
  // Simple boolean evaluation
  if (evaluated === 'true' || evaluated === '1') return true;
  if (evaluated === 'false' || evaluated === '0' || evaluated === '') return false;
  
  // For more complex conditions, default to true (run the step)
  return true;
}

/**
 * Execute a shell command
 */
async function executeCommand(
  command: string,
  options: {
    cwd: string;
    env: Record<string, string>;
    shell?: string;
    timeout?: number;
  }
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const shell = options.shell || (os.platform() === 'win32' ? 'cmd.exe' : '/bin/bash');
    const shellArgs = os.platform() === 'win32' ? ['/c', command] : ['-c', command];
    
    let stdout = '';
    let stderr = '';
    let killed = false;
    
    const child: ChildProcess = spawn(shell, shellArgs, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    // Set timeout if specified
    let timeoutHandle: NodeJS.Timeout | undefined;
    if (options.timeout) {
      timeoutHandle = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000);
      }, options.timeout * 60 * 1000);
    }
    
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve({
        exitCode: killed ? 124 : (code ?? 1),
        stdout,
        stderr,
      });
    });
    
    child.on('error', (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      resolve({
        exitCode: 1,
        stdout,
        stderr: stderr + '\n' + err.message,
      });
    });
  });
}

/**
 * Parse output commands from step output (::set-output, ::set-env, etc.)
 */
function parseOutputCommands(
  output: string
): { outputs: Record<string, string>; env: Record<string, string> } {
  const outputs: Record<string, string> = {};
  const env: Record<string, string> = {};
  
  // Parse ::set-output name=value
  const setOutputRegex = /::set-output name=([^:]+)::(.+)/g;
  let match;
  while ((match = setOutputRegex.exec(output)) !== null) {
    outputs[match[1]] = match[2];
  }
  
  // Parse GITHUB_OUTPUT file format (name=value)
  const githubOutputRegex = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/gm;
  while ((match = githubOutputRegex.exec(output)) !== null) {
    outputs[match[1]] = match[2];
  }
  
  // Parse ::set-env name=value (deprecated but still used)
  const setEnvRegex = /::set-env name=([^:]+)::(.+)/g;
  while ((match = setEnvRegex.exec(output)) !== null) {
    env[match[1]] = match[2];
  }
  
  return { outputs, env };
}

/**
 * Execute a single step
 */
async function executeStep(
  step: Step,
  _stepNumber: number,
  context: ExecutionContext,
  workDir: string,
  stepRunId: string
): Promise<StepResult> {
  const startTime = Date.now();
  
  // Mark step as started
  await stepRunModel.start(stepRunId);
  
  // Check condition
  if (!evaluateCondition(step.if, context)) {
    await stepRunModel.complete(stepRunId, 'success', 'Step skipped due to condition');
    return {
      success: true,
      exitCode: 0,
      output: 'Step skipped due to condition',
      outputs: {},
      duration: Date.now() - startTime,
    };
  }
  
  // Build environment
  const stepEnv: Record<string, string> = {
    ...context.env,
    ...step.env,
  };
  
  // Replace expressions in env values
  for (const [key, value] of Object.entries(stepEnv)) {
    stepEnv[key] = replaceExpressions(String(value), context);
  }
  
  let result: StepResult;
  
  if (step.run) {
    // Execute shell command
    const command = replaceExpressions(step.run, context);
    const cwd = step['working-directory']
      ? path.resolve(workDir, replaceExpressions(step['working-directory'], context))
      : workDir;
    
    const { exitCode, stdout, stderr } = await executeCommand(command, {
      cwd,
      env: stepEnv,
      shell: step.shell,
      timeout: step['timeout-minutes'],
    });
    
    const output = stdout + (stderr ? '\n[stderr]\n' + stderr : '');
    const { outputs } = parseOutputCommands(output);
    
    const success = exitCode === 0 || step['continue-on-error'] === true;
    
    result = {
      success,
      exitCode,
      output,
      outputs,
      duration: Date.now() - startTime,
    };
  } else if (step.uses) {
    // For now, handle a few built-in "actions"
    const actionRef = replaceExpressions(step.uses, context);
    
    if (actionRef.startsWith('./')) {
      // Local action - not supported yet
      result = {
        success: false,
        exitCode: 1,
        output: `Local actions (${actionRef}) not yet supported`,
        error: 'Local actions not supported',
        outputs: {},
        duration: Date.now() - startTime,
      };
    } else if (actionRef.startsWith('actions/checkout')) {
      // Built-in checkout - workspace is already checked out
      result = {
        success: true,
        exitCode: 0,
        output: `Checked out repository at ${context.github.sha}`,
        outputs: {},
        duration: Date.now() - startTime,
      };
    } else if (actionRef.startsWith('actions/setup-node')) {
      // Setup Node.js - just verify node is available
      const { exitCode, stdout } = await executeCommand('node --version', {
        cwd: workDir,
        env: stepEnv,
      });
      result = {
        success: exitCode === 0,
        exitCode,
        output: exitCode === 0 ? `Node.js ${stdout.trim()} available` : 'Node.js not found',
        outputs: {},
        duration: Date.now() - startTime,
      };
    } else {
      // Unknown action - skip with warning
      result = {
        success: true, // Don't fail on unknown actions
        exitCode: 0,
        output: `Action ${actionRef} not implemented - skipping`,
        outputs: {},
        duration: Date.now() - startTime,
      };
    }
  } else {
    result = {
      success: false,
      exitCode: 1,
      output: 'Step must have either "run" or "uses"',
      error: 'Invalid step configuration',
      outputs: {},
      duration: Date.now() - startTime,
    };
  }
  
  // Update step record
  if (result.success) {
    await stepRunModel.complete(stepRunId, 'success', result.output);
  } else {
    await stepRunModel.fail(stepRunId, result.output);
  }
  
  return result;
}

/**
 * Execute a job
 */
async function executeJob(
  jobName: string,
  job: Job,
  context: ExecutionContext,
  workDir: string,
  jobRunId: string
): Promise<JobResult> {
  const startTime = Date.now();
  const results: StepResult[] = [];
  const outputs: Record<string, string> = {};
  
  // Mark job as started
  await jobRunModel.start(jobRunId, `local-${os.hostname()}`);
  
  // Check condition
  if (!evaluateCondition(job.if, context)) {
    await jobRunModel.complete(jobRunId, 'success', JSON.stringify({ skipped: true }));
    return {
      success: true,
      steps: [],
      outputs: {},
      duration: Date.now() - startTime,
    };
  }
  
  // Update context for this job
  const jobContext: ExecutionContext = {
    ...context,
    github: {
      ...context.github,
      job: jobName,
    },
    env: {
      ...context.env,
      ...job.env,
    },
    steps: {},
  };
  
  // Create step runs in database
  const stepRuns = await stepRunModel.createBatch(
    job.steps.map((step, index) => ({
      jobRunId,
      stepName: step.name || step.id || `Step ${index + 1}`,
      stepNumber: index + 1,
      state: 'queued' as const,
    }))
  );
  
  // Execute steps sequentially
  let jobSuccess = true;
  for (let i = 0; i < job.steps.length; i++) {
    const step = job.steps[i];
    const stepRun = stepRuns[i];
    
    const result = await executeStep(step, i + 1, jobContext, workDir, stepRun.id);
    results.push(result);
    
    // Update step context
    const stepId = step.id || `step_${i + 1}`;
    jobContext.steps[stepId] = {
      outcome: result.success ? 'success' : 'failure',
      conclusion: result.success ? 'success' : 'failure',
      outputs: result.outputs,
    };
    
    // Merge outputs
    Object.assign(outputs, result.outputs);
    
    if (!result.success && !step['continue-on-error']) {
      jobSuccess = false;
      break;
    }
  }
  
  // Build job logs
  const logs = results
    .map((r, i) => `=== Step ${i + 1} ===\n${r.output}`)
    .join('\n\n');
  
  // Update job record
  if (jobSuccess) {
    await jobRunModel.complete(jobRunId, 'success', JSON.stringify(outputs));
  } else {
    await jobRunModel.fail(jobRunId, logs);
  }
  
  await jobRunModel.update(jobRunId, { logs });
  
  return {
    success: jobSuccess,
    steps: results,
    outputs,
    duration: Date.now() - startTime,
  };
}

/**
 * Main workflow executor
 */
export class WorkflowExecutor {
  private ciEngine: CIEngine;
  
  constructor(ciEngine: CIEngine) {
    this.ciEngine = ciEngine;
  }
  
  /**
   * Execute a workflow
   */
  async execute(
    workflow: Workflow,
    workflowPath: string,
    options: ExecuteOptions
  ): Promise<{ runId: string; result: WorkflowResult }> {
    const startTime = Date.now();
    
    // Create workflow run record
    const run = await workflowRunModel.create({
      repoId: options.repoId,
      workflowPath,
      workflowName: workflow.name,
      commitSha: options.commitSha,
      branch: options.branch,
      event: options.event,
      eventPayload: options.eventPayload ? JSON.stringify(options.eventPayload) : undefined,
      triggeredById: options.triggeredById,
      state: 'queued',
    });
    
    // Create workspace directory
    const workDir = options.repoDiskPath;
    
    // Build initial context
    const context: ExecutionContext = {
      github: {
        event_name: options.event,
        event: options.eventPayload || {},
        sha: options.commitSha,
        ref: options.branch ? `refs/heads/${options.branch}` : `refs/heads/main`,
        ref_name: options.branch || 'main',
        ref_type: 'branch',
        repository: '', // Will be filled from repo
        repository_owner: '',
        actor: options.triggeredById || 'system',
        workflow: workflow.name,
        job: '',
        run_id: run.id,
        run_number: 1, // TODO: Track run number per workflow
        workspace: workDir,
      },
      env: {
        CI: 'true',
        WIT_CI: 'true',
        ...workflow.env,
        ...options.env,
      },
      vars: {},
      secrets: options.secrets || {},
      inputs: options.inputs || {},
      matrix: {},
      needs: {},
      steps: {},
      runner: {
        name: `local-${os.hostname()}`,
        os: os.platform() === 'darwin' ? 'macOS' : os.platform() === 'win32' ? 'Windows' : 'Linux',
        arch: os.arch(),
        temp: os.tmpdir(),
        tool_cache: path.join(os.homedir(), '.wit', 'tool-cache'),
      },
      job: {
        status: 'success',
      },
    };
    
    // Start workflow
    await workflowRunModel.start(run.id);
    
    // Get job execution order (topological sort)
    const jobOrder = this.ciEngine.getJobOrder(workflow);
    
    // Create job runs in database
    const jobRunsMap = new Map<string, JobRun>();
    for (const jobName of jobOrder) {
      const jobRun = await jobRunModel.create({
        workflowRunId: run.id,
        jobName,
        state: 'queued',
      });
      jobRunsMap.set(jobName, jobRun);
    }
    
    // Execute jobs
    const jobResults: Record<string, JobResult> = {};
    let workflowSuccess = true;
    
    for (const jobName of jobOrder) {
      const job = workflow.jobs[jobName];
      const jobRun = jobRunsMap.get(jobName)!;
      
      // Check if dependencies succeeded
      const deps = Array.isArray(job.needs) ? job.needs : job.needs ? [job.needs] : [];
      const depsSuccess = deps.every((dep) => {
        const depResult = jobResults[dep];
        return depResult?.success;
      });
      
      if (!depsSuccess) {
        // Skip job if dependencies failed
        await jobRunModel.update(jobRun.id, {
          state: 'cancelled',
          conclusion: 'cancelled',
          completedAt: new Date(),
          logs: 'Skipped due to failed dependencies',
        });
        
        jobResults[jobName] = {
          success: false,
          steps: [],
          outputs: {},
          duration: 0,
        };
        workflowSuccess = false;
        continue;
      }
      
      // Update needs context
      for (const dep of deps) {
        const depResult = jobResults[dep];
        context.needs[dep] = {
          result: depResult.success ? 'success' : 'failure',
          outputs: depResult.outputs,
        };
      }
      
      // Execute job
      const result = await executeJob(jobName, job, context, workDir, jobRun.id);
      jobResults[jobName] = result;
      
      if (!result.success && !job['continue-on-error']) {
        workflowSuccess = false;
      }
    }
    
    // Complete workflow
    const conclusion = workflowSuccess ? 'success' : 'failure';
    await workflowRunModel.complete(run.id, conclusion);
    
    // Emit CI completion event
    await eventBus.emit('ci.completed', options.triggeredById || 'system', {
      runId: run.id,
      repoId: options.repoId,
      repoFullName: context.github.repository,
      workflowName: workflow.name,
      conclusion,
    });
    
    return {
      runId: run.id,
      result: {
        success: workflowSuccess,
        jobs: jobResults,
        duration: Date.now() - startTime,
      },
    };
  }
  
  /**
   * Queue a workflow for execution on runners
   * 
   * Unlike execute(), this method queues jobs to be picked up by runners
   * instead of running them locally. Use this for distributed CI execution.
   * 
   * @returns The workflow run ID (jobs will be executed asynchronously by runners)
   */
  async queue(
    workflow: Workflow,
    workflowPath: string,
    options: ExecuteOptions & {
      /** Repository info for cloning */
      repository: {
        id: string;
        fullName: string;
        cloneUrl: string;
        defaultBranch: string;
      };
    }
  ): Promise<{ runId: string }> {
    // Import the queue service dynamically to avoid circular dependencies
    const { getJobQueueService } = await import('./runner/queue');
    const queueService = getJobQueueService();
    
    // Create workflow run record
    const run = await workflowRunModel.create({
      repoId: options.repoId,
      workflowPath,
      workflowName: workflow.name,
      commitSha: options.commitSha,
      branch: options.branch,
      event: options.event,
      eventPayload: options.eventPayload ? JSON.stringify(options.eventPayload) : undefined,
      triggeredById: options.triggeredById,
      state: 'queued',
    });
    
    // Start workflow
    await workflowRunModel.start(run.id);
    
    // Get job execution order
    const jobOrder = this.ciEngine.getJobOrder(workflow);
    
    // Track job results for dependency checking
    const jobResults: Record<string, { success: boolean; outputs: Record<string, string> }> = {};
    
    // Queue jobs in dependency order
    // Jobs with dependencies will be queued after their dependencies complete
    // (the queue service handles this, but we need to set up the initial queue)
    for (const jobName of jobOrder) {
      const job = workflow.jobs[jobName];
      
      // Create job run record
      const jobRun = await jobRunModel.create({
        workflowRunId: run.id,
        jobName,
        state: 'queued',
      });
      
      // Build needs context from completed jobs
      const needs: Record<string, { result: 'success' | 'failure' | 'cancelled' | 'skipped'; outputs: Record<string, string> }> = {};
      const deps = Array.isArray(job.needs) ? job.needs : job.needs ? [job.needs] : [];
      
      for (const dep of deps) {
        if (jobResults[dep]) {
          needs[dep] = {
            result: jobResults[dep].success ? 'success' : 'failure',
            outputs: jobResults[dep].outputs,
          };
        }
      }
      
      // Enqueue the job
      await queueService.enqueueJob({
        jobRunId: jobRun.id,
        repoId: options.repoId,
        workflowRunId: run.id,
        workflow,
        job,
        jobName,
        repository: options.repository,
        commitSha: options.commitSha,
        branch: options.branch,
        needs,
        inputs: options.inputs,
      });
    }
    
    return { runId: run.id };
  }
  
  /**
   * Cancel a running workflow
   */
  async cancel(runId: string): Promise<boolean> {
    const run = await workflowRunModel.findById(runId);
    if (!run) return false;
    
    if (run.state === 'completed' || run.state === 'failed' || run.state === 'cancelled') {
      return false; // Already finished
    }
    
    // Cancel all queued/in-progress jobs
    const jobs = await jobRunModel.listByWorkflowRun(runId);
    for (const job of jobs) {
      if (job.state === 'queued' || job.state === 'in_progress') {
        await jobRunModel.update(job.id, {
          state: 'cancelled',
          conclusion: 'cancelled',
          completedAt: new Date(),
        });
        
        // Cancel all steps
        const steps = await stepRunModel.listByJobRun(job.id);
        for (const step of steps) {
          if (step.state === 'queued' || step.state === 'in_progress') {
            await stepRunModel.update(step.id, {
              state: 'cancelled',
              conclusion: 'cancelled',
              completedAt: new Date(),
            });
          }
        }
      }
    }
    
    await workflowRunModel.cancel(runId);
    return true;
  }
}

/**
 * Create a workflow executor instance
 */
export function createExecutor(ciEngine: CIEngine): WorkflowExecutor {
  return new WorkflowExecutor(ciEngine);
}
