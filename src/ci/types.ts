/**
 * CI/CD Workflow Types
 * 
 * Type definitions for workflow YAML files in .wit/workflows/*.yml
 * Compatible with GitHub Actions syntax.
 */

/**
 * Input definition for workflow_dispatch trigger
 */
export interface InputDef {
  description?: string;
  required?: boolean;
  default?: string;
  type?: 'string' | 'boolean' | 'choice' | 'environment';
  options?: string[];
}

/**
 * Push trigger configuration
 */
export interface PushTrigger {
  branches?: string[];
  'branches-ignore'?: string[];
  tags?: string[];
  'tags-ignore'?: string[];
  paths?: string[];
  'paths-ignore'?: string[];
}

/**
 * Pull request trigger configuration
 */
export interface PullRequestTrigger {
  branches?: string[];
  'branches-ignore'?: string[];
  paths?: string[];
  'paths-ignore'?: string[];
  types?: (
    | 'opened'
    | 'closed'
    | 'reopened'
    | 'synchronize'
    | 'edited'
    | 'ready_for_review'
    | 'labeled'
    | 'unlabeled'
    | 'assigned'
    | 'unassigned'
    | 'review_requested'
    | 'review_request_removed'
  )[];
}

/**
 * Schedule trigger configuration
 */
export interface ScheduleTrigger {
  cron: string;
}

/**
 * Workflow dispatch trigger configuration
 */
export interface WorkflowDispatchTrigger {
  inputs?: Record<string, InputDef>;
}

/**
 * Workflow call trigger for reusable workflows
 */
export interface WorkflowCallTrigger {
  inputs?: Record<string, InputDef>;
  outputs?: Record<string, { description?: string; value: string }>;
  secrets?: Record<string, { description?: string; required?: boolean }>;
}

/**
 * Workflow trigger configuration
 */
export interface WorkflowTrigger {
  push?: PushTrigger;
  pull_request?: PullRequestTrigger;
  pull_request_target?: PullRequestTrigger;
  workflow_dispatch?: WorkflowDispatchTrigger;
  workflow_call?: WorkflowCallTrigger;
  schedule?: ScheduleTrigger[];
  repository_dispatch?: {
    types?: string[];
  };
  release?: {
    types?: ('published' | 'unpublished' | 'created' | 'edited' | 'deleted' | 'prereleased' | 'released')[];
  };
  issues?: {
    types?: ('opened' | 'edited' | 'deleted' | 'transferred' | 'pinned' | 'unpinned' | 'closed' | 'reopened' | 'assigned' | 'unassigned' | 'labeled' | 'unlabeled' | 'milestoned' | 'demilestoned')[];
  };
  workflow_run?: {
    workflows: string[];
    types?: ('completed' | 'requested' | 'in_progress')[];
    branches?: string[];
    'branches-ignore'?: string[];
  };
}

/**
 * Service container configuration
 */
export interface Service {
  image: string;
  credentials?: {
    username: string;
    password: string;
  };
  env?: Record<string, string>;
  ports?: (string | number)[];
  volumes?: string[];
  options?: string;
}

/**
 * Container configuration for job
 */
export interface Container {
  image: string;
  credentials?: {
    username: string;
    password: string;
  };
  env?: Record<string, string>;
  ports?: (string | number)[];
  volumes?: string[];
  options?: string;
}

/**
 * Matrix configuration
 */
export interface MatrixConfig {
  [key: string]: unknown[] | Record<string, unknown>[] | undefined;
}

/**
 * Strategy configuration for matrix builds
 */
export interface Strategy {
  matrix?: MatrixConfig;
  'fail-fast'?: boolean;
  'max-parallel'?: number;
}

/**
 * Concurrency configuration
 */
export interface Concurrency {
  group: string;
  'cancel-in-progress'?: boolean;
}

/**
 * Defaults configuration
 */
export interface Defaults {
  run?: {
    shell?: string;
    'working-directory'?: string;
  };
}

/**
 * Permissions configuration
 */
export type PermissionLevel = 'read' | 'write' | 'none';
export type Permissions =
  | 'read-all'
  | 'write-all'
  | {
      actions?: PermissionLevel;
      checks?: PermissionLevel;
      contents?: PermissionLevel;
      deployments?: PermissionLevel;
      discussions?: PermissionLevel;
      'id-token'?: PermissionLevel;
      issues?: PermissionLevel;
      packages?: PermissionLevel;
      pages?: PermissionLevel;
      'pull-requests'?: PermissionLevel;
      'repository-projects'?: PermissionLevel;
      'security-events'?: PermissionLevel;
      statuses?: PermissionLevel;
    };

/**
 * Step definition in a job
 */
export interface Step {
  /** Display name for the step */
  name?: string;
  /** Unique identifier for referencing step outputs */
  id?: string;
  /** Action reference (e.g., actions/checkout@v4) */
  uses?: string;
  /** Shell command to run */
  run?: string;
  /** Inputs passed to the action */
  with?: Record<string, string | number | boolean>;
  /** Environment variables for this step */
  env?: Record<string, string>;
  /** Conditional expression */
  if?: string;
  /** Working directory for run commands */
  'working-directory'?: string;
  /** Shell to use (bash, pwsh, python, sh, cmd, powershell) */
  shell?: string;
  /** Continue workflow if step fails */
  'continue-on-error'?: boolean;
  /** Maximum minutes to run before killing */
  'timeout-minutes'?: number;
}

/**
 * Job definition in a workflow
 */
export interface Job {
  /** Display name for the job */
  name?: string;
  /** Runner label (e.g., ubuntu-latest, self-hosted) */
  'runs-on': string | string[];
  /** Jobs that must complete before this job runs */
  needs?: string | string[];
  /** Conditional expression */
  if?: string;
  /** Environment variables for all steps */
  env?: Record<string, string>;
  /** Steps to execute */
  steps: Step[];
  /** Service containers */
  services?: Record<string, Service>;
  /** Container to run job in */
  container?: string | Container;
  /** Outputs from this job */
  outputs?: Record<string, string>;
  /** Matrix strategy */
  strategy?: Strategy;
  /** Continue workflow if job fails */
  'continue-on-error'?: boolean;
  /** Maximum minutes to run before killing */
  'timeout-minutes'?: number;
  /** Concurrency settings */
  concurrency?: string | Concurrency;
  /** Permissions for this job */
  permissions?: Permissions;
  /** Environment to deploy to */
  environment?: string | {
    name: string;
    url?: string;
  };
  /** Default settings for run steps */
  defaults?: Defaults;
}

/**
 * Complete workflow definition
 */
export interface Workflow {
  /** Workflow name */
  name: string;
  /** Trigger events */
  on: WorkflowTrigger | string | string[];
  /** Global environment variables */
  env?: Record<string, string>;
  /** Jobs to run */
  jobs: Record<string, Job>;
  /** Default settings */
  defaults?: Defaults;
  /** Concurrency settings */
  concurrency?: string | Concurrency;
  /** Permissions for the workflow */
  permissions?: Permissions;
}

/**
 * Parsed workflow with metadata
 */
export interface ParsedWorkflow {
  /** The parsed workflow */
  workflow: Workflow;
  /** Source file path */
  filePath: string;
  /** Raw YAML content */
  rawContent: string;
}

/**
 * Validation error for workflow parsing
 */
export interface ValidationError {
  /** Error message */
  message: string;
  /** Path to the error in the workflow (e.g., 'jobs.build.steps[0]') */
  path: string;
  /** Line number in source file (if available) */
  line?: number;
  /** Severity level */
  severity: 'error' | 'warning';
}

/**
 * Validation result for a workflow
 */
export interface ValidationResult {
  /** Whether the workflow is valid */
  valid: boolean;
  /** List of validation errors */
  errors: ValidationError[];
  /** List of validation warnings */
  warnings: ValidationError[];
}

/**
 * Trigger event types
 */
export const TRIGGER_EVENTS = [
  'push',
  'pull_request',
  'pull_request_target',
  'workflow_dispatch',
  'workflow_call',
  'schedule',
  'repository_dispatch',
  'release',
  'issues',
  'workflow_run',
] as const;

export type TriggerEvent = typeof TRIGGER_EVENTS[number];

/**
 * Valid shell types
 */
export const SHELL_TYPES = ['bash', 'pwsh', 'python', 'sh', 'cmd', 'powershell'] as const;
export type ShellType = typeof SHELL_TYPES[number];

/**
 * Expression pattern for ${{ ... }} syntax
 */
export const EXPRESSION_PATTERN = /\$\{\{[\s\S]*?\}\}/g;

/**
 * Action reference pattern (owner/repo@ref or ./local/path)
 */
export const ACTION_REFERENCE_PATTERN = /^(?:\.\/[\w\-./]+|[\w\-]+\/[\w\-]+(?:\/[\w\-./]+)?@[\w\-./]+)$/;

/**
 * Cron expression pattern (basic validation)
 */
export const CRON_PATTERN = /^(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)\s+(\*|[0-9,\-\/]+)$/;
