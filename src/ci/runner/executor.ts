/**
 * CI Runner Executor
 * 
 * Runs on the runner machine to execute CI jobs. This module handles:
 * - Polling the server for available jobs
 * - Executing job steps
 * - Streaming logs back to the server
 * - Reporting job completion
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import type {
  JobPayload,
  JobExecutionResult,
  StepExecutionResult,
  LogEntry,
  RunnerHeartbeat,
  RunnerCapabilities,
} from './types';

// =============================================================================
// Runner Client Configuration
// =============================================================================

export interface RunnerClientConfig {
  /** Server URL to connect to */
  serverUrl: string;
  /** Runner authentication token */
  authToken: string;
  /** Runner ID (assigned during registration) */
  runnerId: string;
  /** Work directory for job execution */
  workDir: string;
  /** Polling interval in seconds */
  pollInterval: number;
  /** Labels for job matching */
  labels: string[];
  /** Runner capabilities */
  capabilities: RunnerCapabilities;
  /** Whether to run as a daemon */
  daemon: boolean;
  /** Verbose logging */
  verbose: boolean;
}

// =============================================================================
// API Client
// =============================================================================

/**
 * Simple HTTP client for runner API calls
 */
class RunnerApiClient {
  private serverUrl: string;
  private authToken: string;

  constructor(serverUrl: string, authToken: string) {
    this.serverUrl = serverUrl.replace(/\/$/, '');
    this.authToken = authToken;
  }

  /**
   * Make an API request
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.serverUrl);
      const isHttps = url.protocol === 'https:';
      const options = {
        method,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`,
        },
      };

      const req = (isHttps ? https : http).request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`API error ${res.statusCode}: ${data}`));
            } else {
              resolve(data ? JSON.parse(data) : null);
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }

  /**
   * Get the next available job
   */
  async getNextJob(runnerId: string, labels: string[]): Promise<JobPayload | null> {
    const result = await this.request<{ job?: JobPayload; waitSeconds: number }>(
      'POST',
      '/api/runner/jobs/next',
      { runnerId, labels }
    );
    return result.job || null;
  }

  /**
   * Report job start
   */
  async reportJobStart(queueId: string): Promise<void> {
    await this.request('POST', `/api/runner/jobs/${queueId}/start`, {});
  }

  /**
   * Report job completion
   */
  async reportJobComplete(result: JobExecutionResult): Promise<void> {
    await this.request('POST', `/api/runner/jobs/${result.id}/complete`, result);
  }

  /**
   * Send a heartbeat
   */
  async heartbeat(heartbeat: RunnerHeartbeat): Promise<void> {
    await this.request('POST', '/api/runner/heartbeat', heartbeat);
  }

  /**
   * Stream a log entry
   */
  async streamLog(log: LogEntry): Promise<void> {
    await this.request('POST', '/api/runner/logs', log);
  }
}

// =============================================================================
// Step Executor
// =============================================================================

/**
 * Context available during step execution
 */
interface ExecutionContext {
  env: Record<string, string>;
  github: {
    event_name: string;
    sha: string;
    ref: string;
    ref_name: string;
    repository: string;
    workflow: string;
    job: string;
    run_id: string;
    workspace: string;
  };
  inputs: Record<string, string>;
  steps: Record<string, {
    outcome: 'success' | 'failure' | 'cancelled' | 'skipped';
    conclusion: 'success' | 'failure' | 'cancelled' | 'skipped';
    outputs: Record<string, string>;
  }>;
  needs: Record<string, {
    result: 'success' | 'failure' | 'cancelled' | 'skipped';
    outputs: Record<string, string>;
  }>;
}

/**
 * Replace ${{ }} expressions in a string
 */
function replaceExpressions(text: string, context: ExecutionContext): string {
  return text.replace(/\$\{\{[\s\S]*?\}\}/g, (match) => {
    const inner = match.replace(/^\$\{\{\s*|\s*\}\}$/g, '').trim();
    
    try {
      // Handle string literals
      if (inner.startsWith("'") && inner.endsWith("'")) {
        return inner.slice(1, -1);
      }
      
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
  });
}

/**
 * Evaluate a condition expression
 */
function evaluateCondition(condition: string | undefined, context: ExecutionContext): boolean {
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
function parseOutputCommands(output: string): Record<string, string> {
  const outputs: Record<string, string> = {};
  
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
  
  return outputs;
}

/**
 * Execute a shell command
 */
async function executeCommand(
  command: string,
  options: {
    cwd: string;
    env: Record<string, string | undefined>;
    shell?: string;
    timeout?: number;
    onOutput?: (line: string, isError: boolean) => void;
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
      const text = data.toString();
      stdout += text;
      if (options.onOutput) {
        text.split('\n').filter(Boolean).forEach((line: string) => options.onOutput!(line, false));
      }
    });
    
    child.stderr?.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      if (options.onOutput) {
        text.split('\n').filter(Boolean).forEach((line: string) => options.onOutput!(line, true));
      }
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

// =============================================================================
// Runner Client
// =============================================================================

/**
 * Runner client that executes CI jobs
 */
export class RunnerClient {
  private config: RunnerClientConfig;
  private api: RunnerApiClient;
  private running = false;
  private activeJobs: Set<string> = new Set();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(config: RunnerClientConfig) {
    this.config = config;
    this.api = new RunnerApiClient(config.serverUrl, config.authToken);
  }

  /**
   * Start the runner
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    this.log('Starting runner...');
    this.log(`Server: ${this.config.serverUrl}`);
    this.log(`Work directory: ${this.config.workDir}`);
    this.log(`Labels: ${this.config.labels.join(', ')}`);

    // Ensure work directory exists
    if (!fs.existsSync(this.config.workDir)) {
      fs.mkdirSync(this.config.workDir, { recursive: true });
    }

    // Start heartbeat
    this.startHeartbeat();

    // Start polling for jobs
    await this.pollLoop();
  }

  /**
   * Stop the runner
   */
  stop(): void {
    this.running = false;
    this.log('Stopping runner...');

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Main polling loop
   */
  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        // Get next job
        const job = await this.api.getNextJob(this.config.runnerId, this.config.labels);

        if (job) {
          this.log(`Received job: ${job.job.name}`);
          await this.executeJob(job);
        } else {
          // No job available, wait before polling again
          await this.sleep(this.config.pollInterval * 1000);
        }
      } catch (error) {
        this.log(`Error polling for jobs: ${error}`, 'error');
        await this.sleep(this.config.pollInterval * 1000);
      }
    }
  }

  /**
   * Execute a job
   */
  private async executeJob(payload: JobPayload): Promise<void> {
    const startTime = Date.now();
    this.activeJobs.add(payload.id);

    try {
      // Report job start
      await this.api.reportJobStart(payload.id);

      // Set up workspace
      const workspaceDir = await this.setupWorkspace(payload);

      // Build execution context
      const context: ExecutionContext = {
        env: {
          CI: 'true',
          WIT_CI: 'true',
          GITHUB_WORKSPACE: workspaceDir,
          GITHUB_JOB: payload.job.name,
          GITHUB_RUN_ID: payload.workflowRunId,
          GITHUB_SHA: payload.commitSha,
          GITHUB_REF: payload.branch ? `refs/heads/${payload.branch}` : 'refs/heads/main',
          GITHUB_REPOSITORY: payload.repository.fullName,
          ...payload.workflow.env,
          ...payload.job.env,
        },
        github: {
          event_name: 'push', // TODO: Get from payload
          sha: payload.commitSha,
          ref: payload.branch ? `refs/heads/${payload.branch}` : 'refs/heads/main',
          ref_name: payload.branch || 'main',
          repository: payload.repository.fullName,
          workflow: payload.workflow.name,
          job: payload.job.name,
          run_id: payload.workflowRunId,
          workspace: workspaceDir,
        },
        inputs: payload.inputs || {},
        steps: {},
        needs: payload.needs || {},
      };

      // Execute steps
      const stepResults: StepExecutionResult[] = [];
      let jobSuccess = true;

      for (let i = 0; i < payload.job.steps.length; i++) {
        const step = payload.job.steps[i];
        const stepNumber = i + 1;
        const stepName = step.name || step.id || `Step ${stepNumber}`;

        this.log(`Step ${stepNumber}: ${stepName}`);

        // Check condition
        if (step.if && !evaluateCondition(step.if, context)) {
          this.log(`  Skipped (condition not met)`);
          stepResults.push({
            stepNumber,
            stepName,
            success: true,
            exitCode: 0,
            outputs: {},
            durationMs: 0,
            skipped: true,
          });
          continue;
        }

        const stepStartTime = Date.now();
        let stepResult: StepExecutionResult;

        // Build step environment
        const stepEnv: Record<string, string> = {
          ...context.env,
          ...step.env,
        };

        // Replace expressions in env values
        for (const [key, value] of Object.entries(stepEnv)) {
          if (typeof value === 'string') {
            stepEnv[key] = replaceExpressions(value, context);
          }
        }

        if (step.run) {
          // Execute shell command
          const command = replaceExpressions(step.run, context);
          const cwd = step.workingDirectory
            ? path.resolve(workspaceDir, replaceExpressions(step.workingDirectory, context))
            : workspaceDir;

          const { exitCode, stdout, stderr } = await executeCommand(command, {
            cwd,
            env: stepEnv,
            shell: step.shell,
            timeout: step.timeoutMinutes,
            onOutput: (line, isError) => {
              this.log(`  ${line}`, isError ? 'error' : 'info');
            },
          });

          const outputs = parseOutputCommands(stdout);
          const success = exitCode === 0 || step.continueOnError === true;

          stepResult = {
            stepNumber,
            stepName,
            success,
            exitCode,
            outputs,
            durationMs: Date.now() - stepStartTime,
            skipped: false,
          };

          if (!success) {
            this.log(`  Failed with exit code ${exitCode}`, 'error');
          }
        } else if (step.uses) {
          // Handle actions
          stepResult = await this.executeAction(step, stepNumber, stepName, context, workspaceDir, stepEnv, stepStartTime);
        } else {
          stepResult = {
            stepNumber,
            stepName,
            success: false,
            exitCode: 1,
            outputs: {},
            durationMs: Date.now() - stepStartTime,
            skipped: false,
          };
        }

        stepResults.push(stepResult);

        // Update context with step result
        const stepId = step.id || `step_${stepNumber}`;
        context.steps[stepId] = {
          outcome: stepResult.success ? 'success' : 'failure',
          conclusion: stepResult.success ? 'success' : 'failure',
          outputs: stepResult.outputs,
        };

        // Stop on failure unless continue-on-error
        if (!stepResult.success && !step.continueOnError) {
          jobSuccess = false;
          this.log(`Job failed at step ${stepNumber}`, 'error');
          break;
        }
      }

      // Collect outputs from steps
      const jobOutputs: Record<string, string> = {};
      for (const result of stepResults) {
        Object.assign(jobOutputs, result.outputs);
      }

      // Report completion
      const result: JobExecutionResult = {
        id: payload.id,
        jobRunId: payload.jobRunId,
        success: jobSuccess,
        conclusion: jobSuccess ? 'success' : 'failure',
        steps: stepResults,
        outputs: jobOutputs,
        durationMs: Date.now() - startTime,
      };

      await this.api.reportJobComplete(result);

      this.log(`Job completed: ${result.conclusion} (${(result.durationMs / 1000).toFixed(2)}s)`);

      // Cleanup workspace
      await this.cleanupWorkspace(workspaceDir);

    } catch (error) {
      this.log(`Job execution error: ${error}`, 'error');

      // Report failure
      const result: JobExecutionResult = {
        id: payload.id,
        jobRunId: payload.jobRunId,
        success: false,
        conclusion: 'failure',
        steps: [],
        outputs: {},
        durationMs: Date.now() - startTime,
      };

      try {
        await this.api.reportJobComplete(result);
      } catch (reportError) {
        this.log(`Failed to report job completion: ${reportError}`, 'error');
      }
    } finally {
      this.activeJobs.delete(payload.id);
    }
  }

  /**
   * Execute an action step
   */
  private async executeAction(
    step: JobPayload['job']['steps'][0],
    stepNumber: number,
    stepName: string,
    context: ExecutionContext,
    workspaceDir: string,
    env: Record<string, string>,
    startTime: number
  ): Promise<StepExecutionResult> {
    const actionRef = step.uses!;

    // Handle built-in actions
    if (actionRef.startsWith('actions/checkout')) {
      // Repository is already checked out in workspace setup
      return {
        stepNumber,
        stepName,
        success: true,
        exitCode: 0,
        outputs: {},
        durationMs: Date.now() - startTime,
        skipped: false,
      };
    }

    if (actionRef.startsWith('actions/setup-node')) {
      // Verify node is available
      const { exitCode, stdout } = await executeCommand('node --version', {
        cwd: workspaceDir,
        env,
      });

      return {
        stepNumber,
        stepName,
        success: exitCode === 0,
        exitCode,
        outputs: exitCode === 0 ? { 'node-version': stdout.trim() } : {},
        durationMs: Date.now() - startTime,
        skipped: false,
      };
    }

    if (actionRef.startsWith('actions/setup-python')) {
      const { exitCode, stdout } = await executeCommand('python3 --version', {
        cwd: workspaceDir,
        env,
      });

      return {
        stepNumber,
        stepName,
        success: exitCode === 0,
        exitCode,
        outputs: exitCode === 0 ? { 'python-version': stdout.trim() } : {},
        durationMs: Date.now() - startTime,
        skipped: false,
      };
    }

    // Unknown action - skip with warning
    this.log(`  Action ${actionRef} not implemented - skipping`, 'warn');
    return {
      stepNumber,
      stepName,
      success: true,
      exitCode: 0,
      outputs: {},
      durationMs: Date.now() - startTime,
      skipped: false,
    };
  }

  /**
   * Set up the job workspace
   */
  private async setupWorkspace(payload: JobPayload): Promise<string> {
    const workspaceDir = path.join(
      this.config.workDir,
      `job-${payload.id.slice(0, 8)}`
    );

    // Create workspace directory
    if (fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true });
    }
    fs.mkdirSync(workspaceDir, { recursive: true });

    // Clone the repository
    this.log(`Cloning repository: ${payload.repository.cloneUrl}`);
    
    const { exitCode, stderr } = await executeCommand(
      `git clone --depth 1 --branch ${payload.branch || payload.repository.defaultBranch} ${payload.repository.cloneUrl} .`,
      {
        cwd: workspaceDir,
        env: { ...process.env },
      }
    );

    if (exitCode !== 0) {
      // Try without branch specification
      const { exitCode: exitCode2, stderr: stderr2 } = await executeCommand(
        `git clone --depth 1 ${payload.repository.cloneUrl} .`,
        {
          cwd: workspaceDir,
          env: { ...process.env },
        }
      );

      if (exitCode2 !== 0) {
        throw new Error(`Failed to clone repository: ${stderr2}`);
      }
    }

    // Checkout specific commit if specified
    if (payload.commitSha && payload.commitSha !== 'HEAD') {
      const { exitCode } = await executeCommand(
        `git fetch origin ${payload.commitSha} && git checkout ${payload.commitSha}`,
        {
          cwd: workspaceDir,
          env: { ...process.env },
        }
      );

      if (exitCode !== 0) {
        this.log(`Could not checkout specific commit ${payload.commitSha}, using latest`, 'warn');
      }
    }

    return workspaceDir;
  }

  /**
   * Clean up the job workspace
   */
  private async cleanupWorkspace(workspaceDir: string): Promise<void> {
    try {
      if (fs.existsSync(workspaceDir)) {
        fs.rmSync(workspaceDir, { recursive: true });
      }
    } catch (error) {
      this.log(`Failed to cleanup workspace: ${error}`, 'warn');
    }
  }

  /**
   * Start sending heartbeats
   */
  private startHeartbeat(): void {
    const sendHeartbeat = async () => {
      try {
        const heartbeat: RunnerHeartbeat = {
          runnerId: this.config.runnerId,
          status: this.activeJobs.size > 0 ? 'busy' : 'online',
          activeJobs: Array.from(this.activeJobs),
          resources: {
            cpuPercent: os.loadavg()[0] / os.cpus().length * 100,
            memoryPercent: (1 - os.freemem() / os.totalmem()) * 100,
          },
          version: '1.0.0',
        };

        await this.api.heartbeat(heartbeat);
      } catch (error) {
        this.log(`Heartbeat failed: ${error}`, 'error');
      }
    };

    // Send initial heartbeat
    sendHeartbeat();

    // Send heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(sendHeartbeat, 30000);
  }

  /**
   * Log a message
   */
  private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const timestamp = new Date().toISOString();
    const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '📋';
    console.log(`[${timestamp}] ${prefix} ${message}`);
  }

  /**
   * Sleep for a duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Runner Registration
// =============================================================================

/**
 * Register a new runner with the server
 */
export async function registerRunner(
  serverUrl: string,
  registrationToken: string,
  config: {
    name: string;
    labels?: string[];
    workDir?: string;
  }
): Promise<{
  runnerId: string;
  authToken: string;
}> {
  const client = new RunnerApiClient(serverUrl, registrationToken);
  
  const capabilities: RunnerCapabilities = {
    os: os.platform() === 'darwin' ? 'macos' : os.platform() === 'win32' ? 'windows' : 'linux',
    arch: os.arch(),
    cpuCores: os.cpus().length,
    memoryGB: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
    hasDocker: false, // TODO: Check for Docker
    labels: config.labels || [],
  };

  // The API client will make the registration request
  // For now, this is a placeholder that would be implemented with the actual API endpoint
  throw new Error('Runner registration requires server API endpoint');
}
