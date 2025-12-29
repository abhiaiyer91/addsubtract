/**
 * CI Runner Module
 * 
 * This module provides the infrastructure for running CI jobs on self-hosted
 * or cloud runners. It includes:
 * 
 * - **Types**: Runner and job type definitions
 * - **Queue**: Job queue service for distributing work to runners
 * - **Executor**: Client-side runner that executes jobs
 * 
 * ## Architecture
 * 
 * ```
 * ┌─────────────────┐      ┌─────────────────┐
 * │   CI Workflow   │      │  Job Queue      │
 * │   Execution     │─────>│  Service        │
 * └─────────────────┘      └────────┬────────┘
 *                                   │
 *                          ┌────────┴────────┐
 *                          │                 │
 *                    ┌─────▼─────┐     ┌─────▼─────┐
 *                    │  Runner 1 │     │  Runner 2 │
 *                    │  (Linux)  │     │  (macOS)  │
 *                    └───────────┘     └───────────┘
 * ```
 * 
 * ## Usage
 * 
 * ### Server Side (Managing Runners)
 * 
 * ```typescript
 * import { startJobQueueService, getJobQueueService } from './ci/runner';
 * 
 * // Start the queue service (call once on server startup)
 * startJobQueueService();
 * 
 * // Enqueue a job for execution
 * const queueService = getJobQueueService();
 * await queueService.enqueueJob({
 *   jobRunId: 'job-123',
 *   repoId: 'repo-456',
 *   workflowRunId: 'run-789',
 *   // ... job details
 * });
 * ```
 * 
 * ### Runner Side (Executing Jobs)
 * 
 * ```typescript
 * import { RunnerClient } from './ci/runner';
 * 
 * const client = new RunnerClient({
 *   serverUrl: 'https://your-server.com',
 *   authToken: 'runner-auth-token',
 *   runnerId: 'runner-id',
 *   workDir: '/var/wit-runner/work',
 *   pollInterval: 30,
 *   labels: ['self-hosted', 'linux', 'x64'],
 *   capabilities: {
 *     os: 'linux',
 *     arch: 'x64',
 *     cpuCores: 4,
 *     memoryGB: 8,
 *   },
 *   daemon: true,
 *   verbose: false,
 * });
 * 
 * await client.start();
 * ```
 */

// Export types
export * from './types';

// Export queue service
export {
  JobQueueService,
  getJobQueueService,
  startJobQueueService,
  stopJobQueueService,
  type QueueConfig,
} from './queue';

// Export runner client (for runner-side execution)
export {
  RunnerClient,
  registerRunner,
  type RunnerClientConfig,
} from './executor';
