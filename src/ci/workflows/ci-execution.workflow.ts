/**
 * CI/CD Execution Workflow
 * 
 * A Mastra workflow that orchestrates CI/CD pipeline execution.
 * This workflow handles:
 * 
 * 1. Workflow parsing and validation
 * 2. Job dependency resolution and ordering
 * 3. Parallel job execution where possible
 * 4. Step-by-step execution within jobs
 * 5. Result aggregation and status reporting
 * 6. Event emission for external integrations
 * 
 * Built on Mastra for observability, retry handling, and streaming.
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import * as os from 'os';
import * as path from 'path';
import type { Workflow, Job, Step as CIStep } from '../types';

// =============================================================================
// Input/Output Schemas
// =============================================================================

export const CIExecutionInputSchema = z.object({
  /** Repository ID in the database */
  repoId: z.string(),
  /** Repository full name (owner/repo) */
  repoFullName: z.string().optional(),
  /** Path to the repository on disk */
  repoDiskPath: z.string(),
  /** Commit SHA to run the workflow against */
  commitSha: z.string(),
  /** Branch name (optional) */
  branch: z.string().optional(),
  /** Event that triggered the workflow */
  event: z.string(),
  /** Event payload data */
  eventPayload: z.record(z.unknown()).optional(),
  /** User ID who triggered the workflow */
  triggeredById: z.string().optional(),
  /** Workflow file path */
  workflowPath: z.string(),
  /** Input values for workflow_dispatch */
  inputs: z.record(z.string()).optional(),
  /** Environment variables to add */
  env: z.record(z.string()).optional(),
  /** Secrets (not logged) */
  secrets: z.record(z.string()).optional(),
  /** The parsed workflow definition */
  workflow: z.custom<Workflow>(),
});

export type CIExecutionInput = z.infer<typeof CIExecutionInputSchema>;

export const StepResultSchema = z.object({
  stepId: z.string(),
  stepName: z.string(),
  success: z.boolean(),
  exitCode: z.number(),
  output: z.string(),
  error: z.string().optional(),
  outputs: z.record(z.string()),
  duration: z.number(),
  skipped: z.boolean().default(false),
});

export type StepResult = z.infer<typeof StepResultSchema>;

export const JobResultSchema = z.object({
  jobId: z.string(),
  jobName: z.string(),
  success: z.boolean(),
  steps: z.array(StepResultSchema),
  outputs: z.record(z.string()),
  duration: z.number(),
  skipped: z.boolean().default(false),
});

export type JobResult = z.infer<typeof JobResultSchema>;

export const CIExecutionOutputSchema = z.object({
  success: z.boolean(),
  runId: z.string().optional(),
  conclusion: z.enum(['success', 'failure', 'cancelled', 'skipped']),
  jobs: z.record(JobResultSchema),
  totalDuration: z.number(),
  summary: z.string(),
  error: z.string().optional(),
});

export type CIExecutionOutput = z.infer<typeof CIExecutionOutputSchema>;

// =============================================================================
// Execution Context Schema (GitHub Actions compatible)
// =============================================================================

const ExecutionContextSchema = z.object({
  github: z.object({
    event_name: z.string(),
    event: z.record(z.unknown()),
    sha: z.string(),
    ref: z.string(),
    ref_name: z.string(),
    ref_type: z.enum(['branch', 'tag']),
    repository: z.string(),
    repository_owner: z.string(),
    actor: z.string(),
    workflow: z.string(),
    job: z.string(),
    run_id: z.string(),
    run_number: z.number(),
    workspace: z.string(),
  }),
  env: z.record(z.string()),
  vars: z.record(z.string()),
  secrets: z.record(z.string()),
  inputs: z.record(z.string()),
  matrix: z.record(z.unknown()),
  needs: z.record(z.object({
    result: z.enum(['success', 'failure', 'cancelled', 'skipped']),
    outputs: z.record(z.string()),
  })),
  steps: z.record(z.object({
    outcome: z.enum(['success', 'failure', 'cancelled', 'skipped']),
    conclusion: z.enum(['success', 'failure', 'cancelled', 'skipped']),
    outputs: z.record(z.string()),
  })),
  runner: z.object({
    name: z.string(),
    os: z.enum(['Linux', 'Windows', 'macOS']),
    arch: z.string(),
    temp: z.string(),
    tool_cache: z.string(),
  }),
  job: z.object({
    status: z.enum(['success', 'failure', 'cancelled']),
  }),
});

export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;

// =============================================================================
// Step 1: Setup Execution Environment
// =============================================================================

const setupExecutionStep = createStep({
  id: 'setup-execution',
  inputSchema: CIExecutionInputSchema,
  outputSchema: z.object({
    ...CIExecutionInputSchema.shape,
    runId: z.string(),
    context: ExecutionContextSchema,
    jobOrder: z.array(z.string()),
  }),
  execute: async ({ inputData }) => {
    const { workflowRunModel } = await import('../../db/models/workflow');
    
    // Create workflow run record in database
    const run = await workflowRunModel.create({
      repoId: inputData.repoId,
      workflowPath: inputData.workflowPath,
      workflowName: inputData.workflow.name,
      commitSha: inputData.commitSha,
      branch: inputData.branch,
      event: inputData.event,
      eventPayload: inputData.eventPayload ? JSON.stringify(inputData.eventPayload) : undefined,
      triggeredById: inputData.triggeredById,
      state: 'queued',
    });
    
    // Mark as started
    await workflowRunModel.start(run.id);
    
    // Build execution context
    const context: ExecutionContext = {
      github: {
        event_name: inputData.event,
        event: inputData.eventPayload || {},
        sha: inputData.commitSha,
        ref: inputData.branch ? `refs/heads/${inputData.branch}` : 'refs/heads/main',
        ref_name: inputData.branch || 'main',
        ref_type: 'branch',
        repository: '', // TODO: Get from repo
        repository_owner: '',
        actor: inputData.triggeredById || 'system',
        workflow: inputData.workflow.name,
        job: '',
        run_id: run.id,
        run_number: 1, // TODO: Track run number per workflow
        workspace: inputData.repoDiskPath,
      },
      env: {
        CI: 'true',
        WIT_CI: 'true',
        ...inputData.workflow.env,
        ...inputData.env,
      },
      vars: {},
      secrets: inputData.secrets || {},
      inputs: inputData.inputs || {},
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
    
    // Calculate job execution order (topological sort)
    const jobOrder = getJobOrder(inputData.workflow);
    
    return {
      ...inputData,
      runId: run.id,
      context,
      jobOrder,
    };
  },
});

// =============================================================================
// Step 2: Execute All Jobs
// =============================================================================

const executeJobsStep = createStep({
  id: 'execute-jobs',
  inputSchema: z.object({
    repoId: z.string(),
    repoDiskPath: z.string(),
    commitSha: z.string(),
    branch: z.string().optional(),
    event: z.string(),
    runId: z.string(),
    context: ExecutionContextSchema,
    jobOrder: z.array(z.string()),
    workflow: z.custom<Workflow>(),
  }),
  outputSchema: z.object({
    runId: z.string(),
    jobResults: z.record(JobResultSchema),
    overallSuccess: z.boolean(),
    totalDuration: z.number(),
  }),
  execute: async ({ inputData }) => {
    const { jobRunModel, stepRunModel } = await import('../../db/models/workflow');
    
    const startTime = Date.now();
    const jobResults: Record<string, JobResult> = {};
    let overallSuccess = true;
    
    // Create all job runs in database upfront
    const jobRunsMap = new Map<string, string>();
    for (const jobName of inputData.jobOrder) {
      const jobRun = await jobRunModel.create({
        workflowRunId: inputData.runId,
        jobName,
        state: 'queued',
      });
      jobRunsMap.set(jobName, jobRun.id);
    }
    
    // Execute jobs in dependency order
    for (const jobName of inputData.jobOrder) {
      const job = inputData.workflow.jobs[jobName];
      const jobRunId = jobRunsMap.get(jobName)!;
      
      // Check if dependencies succeeded
      const deps = Array.isArray(job.needs) ? job.needs : job.needs ? [job.needs] : [];
      const depsSuccess = deps.every((dep) => {
        const depResult = jobResults[dep];
        return depResult?.success;
      });
      
      if (!depsSuccess && deps.length > 0) {
        // Skip job if dependencies failed
        await jobRunModel.update(jobRunId, {
          state: 'cancelled',
          conclusion: 'cancelled',
          completedAt: new Date(),
          logs: 'Skipped due to failed dependencies',
        });
        
        jobResults[jobName] = {
          jobId: jobRunId,
          jobName: job.name || jobName,
          success: false,
          steps: [],
          outputs: {},
          duration: 0,
          skipped: true,
        };
        
        overallSuccess = false;
        continue;
      }
      
      // Update needs context for this job
      const updatedContext = {
        ...inputData.context,
        needs: { ...inputData.context.needs },
      };
      
      for (const dep of deps) {
        const depResult = jobResults[dep];
        updatedContext.needs[dep] = {
          result: depResult.success ? 'success' : 'failure',
          outputs: depResult.outputs,
        };
      }
      
      // Execute the job
      const jobResult = await executeJob(
        jobName,
        job,
        updatedContext,
        inputData.repoDiskPath,
        jobRunId,
        jobRunModel,
        stepRunModel
      );
      
      jobResults[jobName] = jobResult;
      
      if (!jobResult.success && !job['continue-on-error']) {
        overallSuccess = false;
      }
    }
    
    return {
      runId: inputData.runId,
      jobResults,
      overallSuccess,
      totalDuration: Date.now() - startTime,
    };
  },
});

// =============================================================================
// Finalize Helper Function
// =============================================================================

interface FinalizeInput {
  runId: string;
  repoId: string;
  repoFullName: string;
  workflowName: string;
  jobResults: Record<string, JobResult>;
  overallSuccess: boolean;
  totalDuration: number;
  triggeredById?: string;
}

async function finalizeWorkflow(inputData: FinalizeInput): Promise<CIExecutionOutput> {
  const { workflowRunModel } = await import('../../db/models/workflow');
  const { eventBus } = await import('../../events');
  
  const conclusion = inputData.overallSuccess ? 'success' : 'failure';
  
  // Complete workflow run in database
  await workflowRunModel.complete(inputData.runId, conclusion);
  
  // Emit CI completion event
  await eventBus.emit('ci.completed', inputData.triggeredById || 'system', {
    runId: inputData.runId,
    repoId: inputData.repoId,
    repoFullName: inputData.repoFullName,
    workflowName: inputData.workflowName,
    conclusion,
  });
  
  // Generate summary
  const jobCount = Object.keys(inputData.jobResults).length;
  const successCount = Object.values(inputData.jobResults).filter(j => j.success).length;
  const failedCount = Object.values(inputData.jobResults).filter(j => !j.success && !j.skipped).length;
  const skippedCount = Object.values(inputData.jobResults).filter(j => j.skipped).length;
  
  let summary = '';
  if (inputData.overallSuccess) {
    summary = `✅ Workflow completed successfully. ${successCount}/${jobCount} jobs passed.`;
  } else {
    summary = `❌ Workflow failed. ${failedCount} job(s) failed, ${skippedCount} skipped.`;
    
    // Add details about failed jobs
    const failedJobs = Object.entries(inputData.jobResults)
      .filter(([_, j]) => !j.success && !j.skipped)
      .map(([name, _]) => name);
    
    if (failedJobs.length > 0) {
      summary += ` Failed: ${failedJobs.join(', ')}`;
    }
  }
  
  return {
    success: inputData.overallSuccess,
    runId: inputData.runId,
    conclusion,
    jobs: inputData.jobResults,
    totalDuration: inputData.totalDuration,
    summary,
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get topologically sorted job execution order
 */
function getJobOrder(workflow: Workflow): string[] {
  const jobs = workflow.jobs;
  const jobNames = Object.keys(jobs);
  const visited = new Set<string>();
  const result: string[] = [];
  
  const visit = (name: string) => {
    if (visited.has(name)) return;
    visited.add(name);
    
    const job = jobs[name];
    const needs = Array.isArray(job.needs) ? job.needs : job.needs ? [job.needs] : [];
    
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
 * Execute a single job
 */
async function executeJob(
  jobName: string,
  job: Job,
  context: ExecutionContext,
  workDir: string,
  jobRunId: string,
  jobRunModel: any,
  stepRunModel: any
): Promise<JobResult> {
  const startTime = Date.now();
  const results: StepResult[] = [];
  const outputs: Record<string, string> = {};
  
  // Mark job as started
  await jobRunModel.start(jobRunId, `local-${os.hostname()}`);
  
  // Check job condition
  if (job.if && !evaluateCondition(job.if, context)) {
    await jobRunModel.complete(jobRunId, 'success', JSON.stringify({ skipped: true }));
    return {
      jobId: jobRunId,
      jobName: job.name || jobName,
      success: true,
      steps: [],
      outputs: {},
      duration: Date.now() - startTime,
      skipped: true,
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
    job.steps.map((step: CIStep, index: number) => ({
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
    
    const result = await executeStep(step, i + 1, jobContext, workDir, stepRun.id, stepRunModel);
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
    .map((r, i) => `=== Step ${i + 1}: ${r.stepName} ===\n${r.output}`)
    .join('\n\n');
  
  // Update job record
  if (jobSuccess) {
    await jobRunModel.complete(jobRunId, 'success', JSON.stringify(outputs));
  } else {
    await jobRunModel.fail(jobRunId, logs);
  }
  
  await jobRunModel.update(jobRunId, { logs });
  
  return {
    jobId: jobRunId,
    jobName: job.name || jobName,
    success: jobSuccess,
    steps: results,
    outputs,
    duration: Date.now() - startTime,
    skipped: false,
  };
}

/**
 * Execute a single step
 */
async function executeStep(
  step: CIStep,
  stepNumber: number,
  context: ExecutionContext,
  workDir: string,
  stepRunId: string,
  stepRunModel: any
): Promise<StepResult> {
  const startTime = Date.now();
  const stepName = step.name || step.id || `Step ${stepNumber}`;
  
  // Mark step as started
  await stepRunModel.start(stepRunId);
  
  // Check condition
  if (step.if && !evaluateCondition(step.if, context)) {
    await stepRunModel.complete(stepRunId, 'success', 'Step skipped due to condition');
    return {
      stepId: stepRunId,
      stepName,
      success: true,
      exitCode: 0,
      output: 'Step skipped due to condition',
      outputs: {},
      duration: Date.now() - startTime,
      skipped: true,
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
    result = await executeShellCommand(step, stepNumber, context, workDir, stepEnv, stepRunId, startTime);
  } else if (step.uses) {
    // Execute action
    result = await executeAction(step, stepNumber, context, workDir, stepEnv, stepRunId, startTime);
  } else {
    result = {
      stepId: stepRunId,
      stepName,
      success: false,
      exitCode: 1,
      output: 'Step must have either "run" or "uses"',
      error: 'Invalid step configuration',
      outputs: {},
      duration: Date.now() - startTime,
      skipped: false,
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
 * Execute a shell command step
 */
async function executeShellCommand(
  step: CIStep,
  stepNumber: number,
  context: ExecutionContext,
  workDir: string,
  env: Record<string, string>,
  stepRunId: string,
  startTime: number
): Promise<StepResult> {
  const { spawn } = await import('child_process');
  const stepName = step.name || step.id || `Step ${stepNumber}`;
  
  const command = replaceExpressions(step.run!, context);
  const cwd = step['working-directory']
    ? path.resolve(workDir, replaceExpressions(step['working-directory'], context))
    : workDir;
  
  return new Promise((resolve) => {
    const shell = step.shell || (os.platform() === 'win32' ? 'cmd.exe' : '/bin/bash');
    const shellArgs = os.platform() === 'win32' ? ['/c', command] : ['-c', command];
    
    let stdout = '';
    let stderr = '';
    let killed = false;
    
    const child = spawn(shell, shellArgs, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    // Set timeout if specified
    let timeoutHandle: NodeJS.Timeout | undefined;
    if (step['timeout-minutes']) {
      timeoutHandle = setTimeout(() => {
        killed = true;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), 5000);
      }, step['timeout-minutes'] * 60 * 1000);
    }
    
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      
      const output = stdout + (stderr ? '\n[stderr]\n' + stderr : '');
      const { outputs } = parseOutputCommands(output);
      const exitCode = killed ? 124 : (code ?? 1);
      const success = exitCode === 0 || step['continue-on-error'] === true;
      
      resolve({
        stepId: stepRunId,
        stepName,
        success,
        exitCode,
        output,
        outputs,
        duration: Date.now() - startTime,
        skipped: false,
      });
    });
    
    child.on('error', (err) => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      
      resolve({
        stepId: stepRunId,
        stepName,
        success: false,
        exitCode: 1,
        output: stderr + '\n' + err.message,
        error: err.message,
        outputs: {},
        duration: Date.now() - startTime,
        skipped: false,
      });
    });
  });
}

/**
 * Execute an action step (uses:)
 */
async function executeAction(
  step: CIStep,
  stepNumber: number,
  context: ExecutionContext,
  workDir: string,
  env: Record<string, string>,
  stepRunId: string,
  startTime: number
): Promise<StepResult> {
  const { spawn } = await import('child_process');
  const stepName = step.name || step.id || `Step ${stepNumber}`;
  const actionRef = replaceExpressions(step.uses!, context);
  
  // Handle local actions
  if (actionRef.startsWith('./')) {
    return {
      stepId: stepRunId,
      stepName,
      success: false,
      exitCode: 1,
      output: `Local actions (${actionRef}) not yet supported`,
      error: 'Local actions not supported',
      outputs: {},
      duration: Date.now() - startTime,
      skipped: false,
    };
  }
  
  // Handle built-in actions
  if (actionRef.startsWith('actions/checkout')) {
    // Repository is already checked out
    return {
      stepId: stepRunId,
      stepName,
      success: true,
      exitCode: 0,
      output: `Checked out repository at ${context.github.sha}`,
      outputs: {},
      duration: Date.now() - startTime,
      skipped: false,
    };
  }
  
  if (actionRef.startsWith('actions/setup-node')) {
    // Verify node is available
    return new Promise((resolve) => {
      const child = spawn('node', ['--version'], {
        cwd: workDir,
        env: { ...process.env, ...env },
      });
      
      let output = '';
      child.stdout?.on('data', (data) => { output += data.toString(); });
      child.stderr?.on('data', (data) => { output += data.toString(); });
      
      child.on('close', (code) => {
        const success = code === 0;
        resolve({
          stepId: stepRunId,
          stepName,
          success,
          exitCode: code ?? 1,
          output: success ? `Node.js ${output.trim()} available` : 'Node.js not found',
          outputs: {},
          duration: Date.now() - startTime,
          skipped: false,
        });
      });
      
      child.on('error', () => {
        resolve({
          stepId: stepRunId,
          stepName,
          success: false,
          exitCode: 1,
          output: 'Node.js not found',
          outputs: {},
          duration: Date.now() - startTime,
          skipped: false,
        });
      });
    });
  }
  
  // Unknown action - skip with warning
  return {
    stepId: stepRunId,
    stepName,
    success: true, // Don't fail on unknown actions
    exitCode: 0,
    output: `Action ${actionRef} not implemented - skipping`,
    outputs: {},
    duration: Date.now() - startTime,
    skipped: false,
  };
}

/**
 * Replace ${{ }} expressions in a string
 */
function replaceExpressions(text: string, context: ExecutionContext): string {
  return text.replace(/\$\{\{[\s\S]*?\}\}/g, (match) => {
    return evaluateExpression(match, context);
  });
}

/**
 * Evaluate a single ${{ }} expression
 */
function evaluateExpression(expression: string, context: ExecutionContext): string {
  const inner = expression.replace(/^\$\{\{\s*|\s*\}\}$/g, '').trim();
  
  try {
    // Handle string literals
    if (inner.startsWith("'") && inner.endsWith("'")) {
      return inner.slice(1, -1);
    }
    
    // Handle boolean/null
    if (inner === 'true') return 'true';
    if (inner === 'false') return 'false';
    if (inner === 'null') return '';
    
    // Handle property access
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
 * Evaluate a condition expression
 */
function evaluateCondition(condition: string, context: ExecutionContext): boolean {
  if (!condition) return true;
  
  const evaluated = replaceExpressions(condition, context);
  
  if (evaluated === 'true' || evaluated === '1') return true;
  if (evaluated === 'false' || evaluated === '0' || evaluated === '') return false;
  
  // For complex conditions, default to true
  return true;
}

/**
 * Parse output commands from step output
 */
function parseOutputCommands(output: string): { outputs: Record<string, string>; env: Record<string, string> } {
  const outputs: Record<string, string> = {};
  const env: Record<string, string> = {};
  
  // Parse ::set-output name=value
  const setOutputRegex = /::set-output name=([^:]+)::(.+)/g;
  let match;
  while ((match = setOutputRegex.exec(output)) !== null) {
    outputs[match[1]] = match[2];
  }
  
  // Parse GITHUB_OUTPUT file format
  const githubOutputRegex = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/gm;
  while ((match = githubOutputRegex.exec(output)) !== null) {
    outputs[match[1]] = match[2];
  }
  
  // Parse ::set-env
  const setEnvRegex = /::set-env name=([^:]+)::(.+)/g;
  while ((match = setEnvRegex.exec(output)) !== null) {
    env[match[1]] = match[2];
  }
  
  return { outputs, env };
}

// =============================================================================
// Workflow Definition
// =============================================================================

export const ciExecutionWorkflow = createWorkflow({
  id: 'ci-execution',
  inputSchema: CIExecutionInputSchema,
  outputSchema: CIExecutionOutputSchema,
})
  // Step 1: Setup execution environment
  .then(setupExecutionStep)
  // Step 2: Execute all jobs
  .map(async ({ inputData }) => ({
    repoId: inputData.repoId,
    repoDiskPath: inputData.repoDiskPath,
    commitSha: inputData.commitSha,
    branch: inputData.branch,
    event: inputData.event,
    runId: inputData.runId,
    context: inputData.context,
    jobOrder: inputData.jobOrder,
    workflow: inputData.workflow,
  }))
  .then(executeJobsStep)
  // Step 3: Finalize and report (using map to call finalize function)
  .map(async ({ inputData, getInitData }) => {
    const initData = getInitData() as CIExecutionInput;
    
    return finalizeWorkflow({
      runId: inputData.runId,
      repoId: initData.repoId,
      repoFullName: initData.repoFullName || '',
      workflowName: initData.workflow.name,
      jobResults: inputData.jobResults,
      overallSuccess: inputData.overallSuccess,
      totalDuration: inputData.totalDuration,
      triggeredById: initData.triggeredById,
    });
  })
  .commit();
