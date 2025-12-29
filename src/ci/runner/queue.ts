/**
 * CI Job Queue Service
 * 
 * Manages the queue of CI jobs waiting to be executed by runners.
 * Handles job enqueueing, assignment, and lifecycle management.
 */

import { 
  runnerModel, 
  jobQueueModel, 
  runnerJobHistoryModel,
  jobRunModel,
  workflowRunModel,
} from '../../db/models';
import { eventBus } from '../../events';
import type { Workflow, Job } from '../types';
import type { JobPayload, JobExecutionResult } from './types';

// =============================================================================
// Queue Configuration
// =============================================================================

export interface QueueConfig {
  /** How often to check for stuck jobs (ms) */
  stuckJobCheckInterval: number;
  /** How long before a job is considered stuck (minutes) */
  stuckJobThresholdMinutes: number;
  /** How often to check for stale runners (ms) */
  staleRunnerCheckInterval: number;
  /** How long before a runner is considered stale (minutes) */
  staleRunnerThresholdMinutes: number;
  /** Default job timeout in minutes */
  defaultTimeoutMinutes: number;
  /** Maximum job retries */
  maxRetries: number;
}

const DEFAULT_CONFIG: QueueConfig = {
  stuckJobCheckInterval: 60000, // 1 minute
  stuckJobThresholdMinutes: 30,
  staleRunnerCheckInterval: 60000, // 1 minute
  staleRunnerThresholdMinutes: 5,
  defaultTimeoutMinutes: 360, // 6 hours
  maxRetries: 2,
};

// =============================================================================
// Job Queue Service
// =============================================================================

/**
 * Job queue service singleton
 */
class JobQueueService {
  private config: QueueConfig;
  private stuckJobInterval: NodeJS.Timeout | null = null;
  private staleRunnerInterval: NodeJS.Timeout | null = null;
  private started = false;

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the queue service background tasks
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    console.log('[JobQueue] Starting job queue service');

    // Start background cleanup tasks
    this.stuckJobInterval = setInterval(
      () => this.checkStuckJobs(),
      this.config.stuckJobCheckInterval
    );

    this.staleRunnerInterval = setInterval(
      () => this.checkStaleRunners(),
      this.config.staleRunnerCheckInterval
    );
  }

  /**
   * Stop the queue service
   */
  stop(): void {
    if (!this.started) return;
    this.started = false;

    console.log('[JobQueue] Stopping job queue service');

    if (this.stuckJobInterval) {
      clearInterval(this.stuckJobInterval);
      this.stuckJobInterval = null;
    }
    if (this.staleRunnerInterval) {
      clearInterval(this.staleRunnerInterval);
      this.staleRunnerInterval = null;
    }
  }

  /**
   * Enqueue a job for execution
   */
  async enqueueJob(options: {
    jobRunId: string;
    repoId: string;
    workflowRunId: string;
    workflow: Workflow;
    job: Job;
    jobName: string;
    repository: {
      id: string;
      fullName: string;
      cloneUrl: string;
      defaultBranch: string;
    };
    commitSha: string;
    branch?: string;
    needs?: Record<string, { result: 'success' | 'failure' | 'cancelled' | 'skipped'; outputs: Record<string, string> }>;
    inputs?: Record<string, string>;
    priority?: number;
  }): Promise<string> {
    const { jobRunId, repoId, workflowRunId, workflow, job, jobName, repository, commitSha, branch, needs, inputs, priority } = options;

    // Build the job payload
    const payload: JobPayload = {
      id: '', // Will be set after queue entry is created
      jobRunId,
      workflowRunId,
      repository,
      commitSha,
      branch,
      workflow: {
        name: workflow.name,
        env: workflow.env,
      },
      job: {
        name: job.name || jobName,
        runsOn: job['runs-on'],
        env: job.env,
        steps: job.steps.map(step => ({
          name: step.name,
          id: step.id,
          uses: step.uses,
          run: step.run,
          with: step.with as Record<string, unknown>,
          env: step.env,
          if: step.if,
          workingDirectory: step['working-directory'],
          shell: step.shell,
          continueOnError: step['continue-on-error'],
          timeoutMinutes: step['timeout-minutes'],
        })),
        services: job.services as any,
        container: job.container as any,
        timeoutMinutes: job['timeout-minutes'],
      },
      needs,
      inputs,
    };

    // Parse runs-on to get required labels
    const runsOn = Array.isArray(job['runs-on']) ? job['runs-on'] : [job['runs-on']];
    const labels = this.normalizeLabels(runsOn);

    // Create queue entry
    const queueEntry = await jobQueueModel.enqueue({
      jobRunId,
      repoId,
      workflowRunId,
      jobName,
      labels: JSON.stringify(labels),
      status: 'queued',
      priority: priority ?? 100,
      payload: JSON.stringify({ ...payload, id: 'pending' }),
      timeoutMinutes: job['timeout-minutes'] ?? this.config.defaultTimeoutMinutes,
      maxRetries: this.config.maxRetries,
    });

    // Update payload with actual ID
    payload.id = queueEntry.id;
    await jobQueueModel.update(queueEntry.id, {
      // Can't update payload directly, but ID is now known
    });

    console.log(`[JobQueue] Job ${jobName} queued with ID ${queueEntry.id}`);

    // Emit event
    await eventBus.emit('ci.job.queued', 'system', {
      queueId: queueEntry.id,
      jobRunId,
      workflowRunId,
      repoId,
      jobName,
    });

    return queueEntry.id;
  }

  /**
   * Normalize runs-on labels to standard format
   */
  private normalizeLabels(runsOn: string[]): string[] {
    const labels: string[] = [];

    for (const label of runsOn) {
      // GitHub-hosted runners
      if (label === 'ubuntu-latest' || label === 'ubuntu-22.04' || label === 'ubuntu-20.04') {
        labels.push('linux', 'x64');
      } else if (label === 'macos-latest' || label === 'macos-14' || label === 'macos-13') {
        labels.push('macos');
      } else if (label === 'windows-latest' || label === 'windows-2022' || label === 'windows-2019') {
        labels.push('windows', 'x64');
      } else {
        // Self-hosted labels
        labels.push(label);
      }
    }

    return [...new Set(labels)]; // Deduplicate
  }

  /**
   * Get the next job for a runner
   */
  async getNextJob(runnerId: string): Promise<JobPayload | null> {
    const runner = await runnerModel.findById(runnerId);
    if (!runner) {
      console.error(`[JobQueue] Runner ${runnerId} not found`);
      return null;
    }

    if (runner.status === 'offline' || runner.status === 'draining') {
      return null;
    }

    if (runner.activeJobCount >= runner.maxConcurrentJobs) {
      return null;
    }

    // Parse runner labels
    let runnerLabels: string[];
    try {
      runnerLabels = JSON.parse(runner.labels);
    } catch {
      runnerLabels = [];
    }

    // Add system labels based on runner properties
    runnerLabels.push(runner.os);
    runnerLabels.push(runner.arch);
    if (runner.type === 'self_hosted') {
      runnerLabels.push('self-hosted');
    }

    // Get next matching job
    const job = await jobQueueModel.getNextJob(runnerId, runnerLabels);
    if (!job) {
      return null;
    }

    // Increment runner's active job count
    await runnerModel.incrementActiveJobs(runnerId);

    // Update job run status
    await jobRunModel.start(job.jobRunId, runner.name);

    // Record in history
    await runnerJobHistoryModel.record({
      runnerId,
      jobQueueId: job.id,
      jobRunId: job.jobRunId,
      workflowRunId: job.workflowRunId,
      repoId: job.repoId,
      startedAt: new Date(),
    });

    console.log(`[JobQueue] Assigned job ${job.jobName} to runner ${runner.name}`);

    // Parse and return payload
    try {
      const payload = JSON.parse(job.payload) as JobPayload;
      payload.id = job.id;
      return payload;
    } catch (error) {
      console.error(`[JobQueue] Failed to parse job payload:`, error);
      await this.failJob(job.id, 'Failed to parse job payload');
      return null;
    }
  }

  /**
   * Mark a job as started (runner has begun execution)
   */
  async startJob(queueId: string): Promise<boolean> {
    const job = await jobQueueModel.findById(queueId);
    if (!job) return false;

    await jobQueueModel.start(queueId);
    
    console.log(`[JobQueue] Job ${job.jobName} started`);
    
    return true;
  }

  /**
   * Complete a job with results
   */
  async completeJob(queueId: string, result: JobExecutionResult): Promise<void> {
    const job = await jobQueueModel.findById(queueId);
    if (!job) {
      console.error(`[JobQueue] Job ${queueId} not found for completion`);
      return;
    }

    // Update queue entry
    await jobQueueModel.complete(queueId, result.success);

    // Update job run
    if (result.success) {
      await jobRunModel.complete(job.jobRunId, 'success', JSON.stringify(result.outputs));
    } else {
      await jobRunModel.fail(job.jobRunId, result.conclusion);
    }

    // Decrement runner's active job count
    if (job.runnerId) {
      await runnerModel.decrementActiveJobs(job.runnerId);

      // Update history
      const history = await runnerJobHistoryModel.listByRunner(job.runnerId, 1);
      if (history.length > 0 && history[0].jobQueueId === queueId) {
        await runnerJobHistoryModel.complete(
          history[0].id,
          result.success,
          result.conclusion,
          result.durationMs
        );
      }
    }

    console.log(`[JobQueue] Job ${job.jobName} completed: ${result.conclusion}`);

    // Emit event
    await eventBus.emit('ci.job.completed', 'system', {
      queueId,
      jobRunId: job.jobRunId,
      workflowRunId: job.workflowRunId,
      repoId: job.repoId,
      success: result.success,
      conclusion: result.conclusion,
    });

    // Check if all jobs in workflow are complete
    await this.checkWorkflowCompletion(job.workflowRunId);
  }

  /**
   * Fail a job with an error
   */
  async failJob(queueId: string, errorMessage: string): Promise<void> {
    const job = await jobQueueModel.findById(queueId);
    if (!job) return;

    await jobQueueModel.fail(queueId, errorMessage);
    await jobRunModel.fail(job.jobRunId, errorMessage);

    if (job.runnerId) {
      await runnerModel.decrementActiveJobs(job.runnerId);
    }

    console.log(`[JobQueue] Job ${job.jobName} failed: ${errorMessage}`);

    await eventBus.emit('ci.job.failed', 'system', {
      queueId,
      jobRunId: job.jobRunId,
      workflowRunId: job.workflowRunId,
      repoId: job.repoId,
      error: errorMessage,
    });

    await this.checkWorkflowCompletion(job.workflowRunId);
  }

  /**
   * Cancel a job
   */
  async cancelJob(queueId: string): Promise<void> {
    const job = await jobQueueModel.findById(queueId);
    if (!job) return;

    await jobQueueModel.cancel(queueId);
    await jobRunModel.update(job.jobRunId, {
      state: 'cancelled',
      conclusion: 'cancelled',
      completedAt: new Date(),
    });

    if (job.runnerId) {
      await runnerModel.decrementActiveJobs(job.runnerId);
    }

    console.log(`[JobQueue] Job ${job.jobName} cancelled`);
  }

  /**
   * Check if a workflow is complete and update its status
   */
  private async checkWorkflowCompletion(workflowRunId: string): Promise<void> {
    const jobs = await jobQueueModel.list({ workflowRunId });
    
    const allComplete = jobs.every(j => 
      j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled'
    );

    if (!allComplete) return;

    const anyFailed = jobs.some(j => j.status === 'failed');
    const anyCancelled = jobs.some(j => j.status === 'cancelled');

    let conclusion: 'success' | 'failure' | 'cancelled';
    if (anyFailed) {
      conclusion = 'failure';
    } else if (anyCancelled) {
      conclusion = 'cancelled';
    } else {
      conclusion = 'success';
    }

    await workflowRunModel.complete(workflowRunId, conclusion);

    console.log(`[JobQueue] Workflow ${workflowRunId} completed: ${conclusion}`);
  }

  /**
   * Check for and reset stuck jobs
   */
  private async checkStuckJobs(): Promise<void> {
    try {
      const count = await jobQueueModel.resetStuckJobs(this.config.stuckJobThresholdMinutes);
      if (count > 0) {
        console.log(`[JobQueue] Reset ${count} stuck jobs`);
      }
    } catch (error) {
      console.error('[JobQueue] Error checking stuck jobs:', error);
    }
  }

  /**
   * Check for and mark stale runners as offline
   */
  private async checkStaleRunners(): Promise<void> {
    try {
      const count = await runnerModel.markStaleAsOffline(this.config.staleRunnerThresholdMinutes);
      if (count > 0) {
        console.log(`[JobQueue] Marked ${count} stale runners as offline`);
      }
    } catch (error) {
      console.error('[JobQueue] Error checking stale runners:', error);
    }
  }

  /**
   * Get queue statistics
   */
  async getStats(repoId?: string): Promise<{
    queue: {
      queued: number;
      assigned: number;
      inProgress: number;
      completed: number;
      failed: number;
      cancelled: number;
    };
    runners: {
      total: number;
      online: number;
      busy: number;
      offline: number;
      draining: number;
    };
  }> {
    const [queueStats, runnerStats] = await Promise.all([
      jobQueueModel.getStats(repoId),
      runnerModel.getStats(),
    ]);

    return {
      queue: queueStats,
      runners: runnerStats,
    };
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let queueService: JobQueueService | null = null;

/**
 * Get or create the job queue service singleton
 */
export function getJobQueueService(config?: Partial<QueueConfig>): JobQueueService {
  if (!queueService) {
    queueService = new JobQueueService(config);
  }
  return queueService;
}

/**
 * Start the job queue service
 */
export function startJobQueueService(config?: Partial<QueueConfig>): void {
  getJobQueueService(config).start();
}

/**
 * Stop the job queue service
 */
export function stopJobQueueService(): void {
  if (queueService) {
    queueService.stop();
  }
}

// Export the class for testing
export { JobQueueService };
