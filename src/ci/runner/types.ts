/**
 * CI Runner Types
 * 
 * Type definitions for the CI runner system, including runner registration,
 * job assignment, and execution.
 */

import { z } from 'zod';

// =============================================================================
// Runner Status and Configuration
// =============================================================================

/**
 * Runner status values
 */
export const RunnerStatus = {
  OFFLINE: 'offline',
  ONLINE: 'online',
  BUSY: 'busy',
  DRAINING: 'draining', // Not accepting new jobs, finishing current ones
} as const;

export type RunnerStatus = typeof RunnerStatus[keyof typeof RunnerStatus];

/**
 * Runner type - how the runner is hosted
 */
export const RunnerType = {
  SELF_HOSTED: 'self_hosted',
  CLOUD: 'cloud',
  LOCAL: 'local', // For local CLI execution
} as const;

export type RunnerType = typeof RunnerType[keyof typeof RunnerType];

/**
 * Operating system of the runner
 */
export const RunnerOS = {
  LINUX: 'linux',
  MACOS: 'macos',
  WINDOWS: 'windows',
} as const;

export type RunnerOS = typeof RunnerOS[keyof typeof RunnerOS];

/**
 * Runner labels for matching with job requirements
 */
export const RunnerLabelSchema = z.object({
  /** Label name (e.g., 'self-hosted', 'linux', 'gpu') */
  name: z.string(),
  /** Label type (system or custom) */
  type: z.enum(['system', 'custom']),
});

export type RunnerLabel = z.infer<typeof RunnerLabelSchema>;

/**
 * Runner capabilities and resource limits
 */
export const RunnerCapabilitiesSchema = z.object({
  /** Operating system */
  os: z.enum(['linux', 'macos', 'windows']),
  /** Architecture (x64, arm64) */
  arch: z.string(),
  /** Number of CPU cores */
  cpuCores: z.number().optional(),
  /** Memory in GB */
  memoryGB: z.number().optional(),
  /** Available disk space in GB */
  diskGB: z.number().optional(),
  /** Whether Docker is available */
  hasDocker: z.boolean().default(false),
  /** Custom labels */
  labels: z.array(z.string()).default([]),
});

export type RunnerCapabilities = z.infer<typeof RunnerCapabilitiesSchema>;

/**
 * Runner configuration for registration
 */
export const RunnerConfigSchema = z.object({
  /** Display name for the runner */
  name: z.string(),
  /** Runner type */
  type: z.enum(['self_hosted', 'cloud', 'local']),
  /** Organization or repository scope (null for global) */
  scope: z.object({
    type: z.enum(['organization', 'repository', 'global']),
    id: z.string().optional(),
  }).optional(),
  /** Maximum concurrent jobs */
  maxConcurrentJobs: z.number().default(1),
  /** Capabilities */
  capabilities: RunnerCapabilitiesSchema,
  /** Work directory on the runner */
  workDir: z.string().optional(),
  /** Whether to accept jobs from forks */
  acceptForkJobs: z.boolean().default(false),
});

export type RunnerConfig = z.infer<typeof RunnerConfigSchema>;

// =============================================================================
// Runner Registration and Authentication
// =============================================================================

/**
 * Runner registration request
 */
export const RunnerRegistrationSchema = z.object({
  /** Registration token (from server) */
  token: z.string(),
  /** Runner configuration */
  config: RunnerConfigSchema,
});

export type RunnerRegistration = z.infer<typeof RunnerRegistrationSchema>;

/**
 * Runner registration response
 */
export const RunnerRegistrationResponseSchema = z.object({
  /** Runner ID */
  runnerId: z.string().uuid(),
  /** Authentication token for API calls */
  authToken: z.string(),
  /** Polling interval in seconds */
  pollInterval: z.number().default(30),
  /** Server URL for API calls */
  serverUrl: z.string(),
});

export type RunnerRegistrationResponse = z.infer<typeof RunnerRegistrationResponseSchema>;

// =============================================================================
// Job Assignment
// =============================================================================

/**
 * Job status values
 */
export const QueuedJobStatus = {
  QUEUED: 'queued',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
} as const;

export type QueuedJobStatus = typeof QueuedJobStatus[keyof typeof QueuedJobStatus];

/**
 * A job waiting in the queue
 */
export const QueuedJobSchema = z.object({
  /** Unique job queue ID */
  id: z.string().uuid(),
  /** Reference to the job run in workflow_runs */
  jobRunId: z.string().uuid(),
  /** Repository ID */
  repoId: z.string().uuid(),
  /** Workflow run ID */
  workflowRunId: z.string().uuid(),
  /** Job name */
  jobName: z.string(),
  /** Required labels for runner matching */
  labels: z.array(z.string()),
  /** Current status */
  status: z.enum(['queued', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled']),
  /** Priority (lower = higher priority) */
  priority: z.number().default(100),
  /** Assigned runner ID */
  runnerId: z.string().uuid().optional(),
  /** When the job was queued */
  queuedAt: z.date(),
  /** When the job was assigned to a runner */
  assignedAt: z.date().optional(),
  /** When the job started running */
  startedAt: z.date().optional(),
  /** When the job completed */
  completedAt: z.date().optional(),
  /** Timeout in minutes */
  timeoutMinutes: z.number().default(360), // 6 hours default
});

export type QueuedJob = z.infer<typeof QueuedJobSchema>;

/**
 * Job payload sent to runner for execution
 */
export const JobPayloadSchema = z.object({
  /** Queue job ID */
  id: z.string().uuid(),
  /** Job run ID */
  jobRunId: z.string().uuid(),
  /** Workflow run ID */
  workflowRunId: z.string().uuid(),
  /** Repository info */
  repository: z.object({
    id: z.string(),
    fullName: z.string(),
    cloneUrl: z.string(),
    defaultBranch: z.string(),
  }),
  /** Commit to checkout */
  commitSha: z.string(),
  /** Branch name */
  branch: z.string().optional(),
  /** Workflow definition (parsed) */
  workflow: z.object({
    name: z.string(),
    env: z.record(z.string()).optional(),
  }),
  /** Job definition */
  job: z.object({
    name: z.string(),
    runsOn: z.union([z.string(), z.array(z.string())]),
    env: z.record(z.string()).optional(),
    steps: z.array(z.object({
      name: z.string().optional(),
      id: z.string().optional(),
      uses: z.string().optional(),
      run: z.string().optional(),
      with: z.record(z.unknown()).optional(),
      env: z.record(z.string()).optional(),
      if: z.string().optional(),
      workingDirectory: z.string().optional(),
      shell: z.string().optional(),
      continueOnError: z.boolean().optional(),
      timeoutMinutes: z.number().optional(),
    })),
    services: z.record(z.object({
      image: z.string(),
      env: z.record(z.string()).optional(),
      ports: z.array(z.union([z.string(), z.number()])).optional(),
    })).optional(),
    container: z.union([
      z.string(),
      z.object({
        image: z.string(),
        env: z.record(z.string()).optional(),
      }),
    ]).optional(),
    timeoutMinutes: z.number().optional(),
  }),
  /** Context from previous jobs (needs) */
  needs: z.record(z.object({
    result: z.enum(['success', 'failure', 'cancelled', 'skipped']),
    outputs: z.record(z.string()),
  })).optional(),
  /** Secrets (encrypted or tokenized) */
  secretsToken: z.string().optional(),
  /** Input variables */
  inputs: z.record(z.string()).optional(),
});

export type JobPayload = z.infer<typeof JobPayloadSchema>;

// =============================================================================
// Job Execution and Results
// =============================================================================

/**
 * Step execution result from runner
 */
export const StepExecutionResultSchema = z.object({
  /** Step number (1-indexed) */
  stepNumber: z.number(),
  /** Step name */
  stepName: z.string(),
  /** Whether the step succeeded */
  success: z.boolean(),
  /** Exit code */
  exitCode: z.number(),
  /** Step outputs */
  outputs: z.record(z.string()),
  /** Duration in milliseconds */
  durationMs: z.number(),
  /** Was the step skipped */
  skipped: z.boolean().default(false),
});

export type StepExecutionResult = z.infer<typeof StepExecutionResultSchema>;

/**
 * Job execution result from runner
 */
export const JobExecutionResultSchema = z.object({
  /** Queue job ID */
  id: z.string().uuid(),
  /** Job run ID */
  jobRunId: z.string().uuid(),
  /** Whether the job succeeded */
  success: z.boolean(),
  /** Conclusion */
  conclusion: z.enum(['success', 'failure', 'cancelled', 'skipped']),
  /** Step results */
  steps: z.array(StepExecutionResultSchema),
  /** Job outputs */
  outputs: z.record(z.string()),
  /** Total duration in milliseconds */
  durationMs: z.number(),
});

export type JobExecutionResult = z.infer<typeof JobExecutionResultSchema>;

// =============================================================================
// Log Streaming
// =============================================================================

/**
 * Log entry streamed from runner
 */
export const LogEntrySchema = z.object({
  /** Job run ID */
  jobRunId: z.string().uuid(),
  /** Step number (optional, if during step execution) */
  stepNumber: z.number().optional(),
  /** Log level */
  level: z.enum(['debug', 'info', 'warn', 'error', 'group', 'endgroup', 'command']),
  /** Log message */
  message: z.string(),
  /** Timestamp */
  timestamp: z.date(),
});

export type LogEntry = z.infer<typeof LogEntrySchema>;

/**
 * Log stream message types
 */
export const LogStreamMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('log'),
    data: LogEntrySchema,
  }),
  z.object({
    type: z.literal('step_start'),
    data: z.object({
      jobRunId: z.string().uuid(),
      stepNumber: z.number(),
      stepName: z.string(),
    }),
  }),
  z.object({
    type: z.literal('step_complete'),
    data: StepExecutionResultSchema.extend({
      jobRunId: z.string().uuid(),
    }),
  }),
  z.object({
    type: z.literal('job_complete'),
    data: JobExecutionResultSchema,
  }),
  z.object({
    type: z.literal('heartbeat'),
    data: z.object({
      runnerId: z.string().uuid(),
      timestamp: z.date(),
    }),
  }),
]);

export type LogStreamMessage = z.infer<typeof LogStreamMessageSchema>;

// =============================================================================
// Runner Heartbeat
// =============================================================================

/**
 * Heartbeat sent by runner to indicate it's alive
 */
export const RunnerHeartbeatSchema = z.object({
  /** Runner ID */
  runnerId: z.string().uuid(),
  /** Current status */
  status: z.enum(['online', 'busy', 'draining']),
  /** Active job IDs */
  activeJobs: z.array(z.string().uuid()),
  /** Resource usage */
  resources: z.object({
    cpuPercent: z.number().optional(),
    memoryPercent: z.number().optional(),
    diskPercent: z.number().optional(),
  }).optional(),
  /** Client version */
  version: z.string(),
});

export type RunnerHeartbeat = z.infer<typeof RunnerHeartbeatSchema>;

// =============================================================================
// Runner API Types
// =============================================================================

/**
 * Request for next available job
 */
export const GetNextJobRequestSchema = z.object({
  /** Runner ID */
  runnerId: z.string().uuid(),
  /** Runner's current labels */
  labels: z.array(z.string()),
});

export type GetNextJobRequest = z.infer<typeof GetNextJobRequestSchema>;

/**
 * Response with next job (or empty)
 */
export const GetNextJobResponseSchema = z.object({
  /** Job payload if available */
  job: JobPayloadSchema.optional(),
  /** Wait time in seconds before next poll */
  waitSeconds: z.number().default(5),
});

export type GetNextJobResponse = z.infer<typeof GetNextJobResponseSchema>;

/**
 * Job completion report from runner
 */
export const CompleteJobRequestSchema = z.object({
  /** Runner ID */
  runnerId: z.string().uuid(),
  /** Job result */
  result: JobExecutionResultSchema,
  /** Full logs (if not streamed) */
  logs: z.string().optional(),
});

export type CompleteJobRequest = z.infer<typeof CompleteJobRequestSchema>;
