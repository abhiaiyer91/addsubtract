/**
 * Mastra Configuration for wit
 * 
 * Sets up the Mastra instance with the wit agent, tools, memory, and workflows.
 * Uses PostgreSQL for server-side storage, LibSQL for CLI storage.
 */

import * as path from 'path';
import * as os from 'os';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { PostgresStore } from '@mastra/pg';
import { witAgent, createTsgitAgent } from './agent.js';
import { witTools } from './tools/index.js';
import { prReviewWorkflow, issueTriageWorkflow, codeGenerationWorkflow, multiAgentPlanningWorkflow } from './workflows/index.js';
import { ciExecutionWorkflow } from '../ci/workflows/index.js';
import type { AIConfig } from './types.js';

let mastraInstance: Mastra | null = null;
let memoryInstance: Memory | null = null;
let storageInstance: LibSQLStore | PostgresStore | null = null;

/**
 * Check if we're running in server mode (have DATABASE_URL)
 */
function isServerMode(): boolean {
  return !!process.env.DATABASE_URL;
}

/**
 * Get the path to the wit data directory (for CLI mode)
 */
function getWitDataDir(): string {
  const witDir = process.env.WIT_DATA_DIR || path.join(os.homedir(), '.wit');
  return witDir;
}

/**
 * Get or create the storage instance.
 * Uses PostgresStore in server mode, LibSQLStore in CLI mode.
 */
export function getStorage(): LibSQLStore | PostgresStore {
  if (!storageInstance) {
    if (isServerMode()) {
      // Server mode: use PostgreSQL
      storageInstance = new PostgresStore({
        id: 'wit-mastra-storage',
        connectionString: process.env.DATABASE_URL!,
      });
      console.log('[Mastra] Using PostgresStore for storage');
    } else {
      // CLI mode: use local LibSQL
      const dbPath = path.join(getWitDataDir(), 'agent.db');
      storageInstance = new LibSQLStore({
        id: 'wit-agent-storage',
        url: `file:${dbPath}`,
      });
      console.log('[Mastra] Using LibSQLStore for storage');
    }
  }
  return storageInstance;
}

/**
 * Get or create the Memory instance for conversation history
 */
export function getMemory(): Memory {
  if (!memoryInstance) {
    const storage = getStorage();
    memoryInstance = new Memory({
      storage,
    });
  }
  return memoryInstance;
}

/**
 * Create and configure a Mastra instance for wit
 * Default model: Claude Opus 4 (claude-opus-4-5)
 */
export function createTsgitMastra(config: AIConfig = {}): Mastra {
  const model = config.model || process.env.WIT_AI_MODEL || 'anthropic/claude-opus-4-5';
  
  const agent = createTsgitAgent(model);
  const memory = getMemory();
  const storage = getStorage();
  
  const mastra = new Mastra({
    agents: {
      wit: agent,
    },
    tools: witTools,
    workflows: {
      prReview: prReviewWorkflow,
      issueTriage: issueTriageWorkflow,
      codeGeneration: codeGenerationWorkflow,
      ciExecution: ciExecutionWorkflow,
      multiAgentPlanning: multiAgentPlanningWorkflow,
    },
    memory: {
      wit: memory,
    },
    storage,
    logger: config.verbose ? undefined : false,
  });
  
  mastraInstance = mastra;
  return mastra;
}

/**
 * Get the singleton Mastra instance, creating it if needed
 */
export function getTsgitMastra(config?: AIConfig): Mastra {
  if (!mastraInstance) {
    mastraInstance = createTsgitMastra(config);
  }
  return mastraInstance;
}

/**
 * Get the wit agent from the Mastra instance
 */
export function getTsgitAgent(config?: AIConfig): Agent {
  const mastra = getTsgitMastra(config);
  return mastra.getAgent('wit');
}

/**
 * Check if AI is available (model and API key configured)
 * This checks for server-level keys only
 */
export function isAIAvailable(): boolean {
  // Check for common AI provider API keys
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasCustomModel = !!process.env.WIT_AI_MODEL;
  
  return hasOpenAI || hasAnthropic || hasCustomModel;
}

/**
 * Check if AI is available for a specific repository
 * This checks both repo-level and server-level keys
 */
export async function isAIAvailableForRepo(repoId: string): Promise<boolean> {
  // First check server-level keys
  if (isAIAvailable()) {
    return true;
  }
  
  // Then check repo-level keys
  try {
    const { repoAiKeyModel } = await import('../db/models/repo-ai-keys.js');
    return await repoAiKeyModel.hasKeys(repoId);
  } catch {
    // If we can't check repo keys (e.g., no DB), fall back to server check
    return false;
  }
}

/**
 * Get the API key for a specific provider and repository
 * Checks repo-level keys first, then falls back to server-level keys
 */
export async function getApiKeyForRepo(
  repoId: string | null,
  provider: 'openai' | 'anthropic'
): Promise<string | null> {
  // If we have a repo ID, try repo-level keys first
  if (repoId) {
    try {
      const { repoAiKeyModel } = await import('../db/models/repo-ai-keys.js');
      const key = await repoAiKeyModel.getDecryptedKey(repoId, provider);
      if (key) {
        return key;
      }
    } catch {
      // If we can't get repo keys, fall through to server keys
    }
  }
  
  // Fall back to server-level keys
  if (provider === 'openai') {
    return process.env.OPENAI_API_KEY || null;
  } else if (provider === 'anthropic') {
    return process.env.ANTHROPIC_API_KEY || null;
  }
  
  return null;
}

/**
 * Get any available API key for a repository
 * Prefers repo-level keys, then server-level keys
 * Prefers Anthropic (Claude Opus 4.5) over OpenAI (GPT 5.2)
 * Returns the provider and key
 */
export async function getAnyApiKeyForRepo(
  repoId: string | null
): Promise<{ provider: 'openai' | 'anthropic'; key: string } | null> {
  // If we have a repo ID, try repo-level keys first
  if (repoId) {
    try {
      const { repoAiKeyModel } = await import('../db/models/repo-ai-keys.js');
      const repoKey = await repoAiKeyModel.getAnyKey(repoId);
      if (repoKey) {
        return repoKey;
      }
    } catch {
      // If we can't get repo keys, fall through to server keys
    }
  }
  
  // Fall back to server-level keys - prefer Anthropic (Claude Opus 4.5)
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: 'anthropic', key: process.env.ANTHROPIC_API_KEY };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', key: process.env.OPENAI_API_KEY };
  }
  
  return null;
}

/**
 * Get information about the configured AI
 * Default: Claude Opus 4
 */
export function getAIInfo(): { available: boolean; model: string; provider: string } {
  const model = process.env.WIT_AI_MODEL || 'anthropic/claude-opus-4-5';
  
  return {
    available: isAIAvailable(),
    model,
    provider: 'anthropic',
  };
}

/**
 * Get AI info for a specific repository
 * Default: Claude Opus 4.5
 */
export async function getAIInfoForRepo(repoId: string): Promise<{
  available: boolean;
  source: 'repository' | 'server' | null;
  model: string;
  provider: string;
}> {
  const model = process.env.WIT_AI_MODEL || 'anthropic/claude-opus-4-5';
  const defaultProvider = 'anthropic';
  
  // Check repo-level keys first
  if (repoId) {
    try {
      const { repoAiKeyModel } = await import('../db/models/repo-ai-keys.js');
      const hasRepoKeys = await repoAiKeyModel.hasKeys(repoId);
      if (hasRepoKeys) {
        return {
          available: true,
          source: 'repository',
          model,
          provider: defaultProvider,
        };
      }
    } catch {
      // Fall through
    }
  }
  
  // Check server-level keys
  if (isAIAvailable()) {
    return {
      available: true,
      source: 'server',
      model,
      provider: defaultProvider,
    };
  }
  
  return {
    available: false,
    source: null,
    model,
    provider: defaultProvider,
  };
}

// =============================================================================
// Workflow Execution Helpers
// =============================================================================

import type { PRReviewInput, PRReviewOutput } from './workflows/pr-review.workflow.js';
import type { IssueTriageInput, IssueTriageOutput } from './workflows/issue-triage.workflow.js';
import type { CodeGenerationInput, CodeGenerationOutput } from './workflows/code-generation.workflow.js';
import type { CIExecutionInput, CIExecutionOutput } from '../ci/workflows/ci-execution.workflow.js';
import type { MultiAgentPlanningInput, MultiAgentPlanningOutput } from './workflows/multi-agent-planning.workflow.js';

/**
 * Run the PR Review workflow
 * 
 * @param input - PR review input parameters
 * @returns PR review results including issues, suggestions, and score
 */
export async function runPRReviewWorkflow(input: PRReviewInput): Promise<PRReviewOutput> {
  const mastra = getTsgitMastra();
  const workflow = mastra.getWorkflow('prReview');
  
  const run = await workflow.createRun();
  const result = await run.start({ inputData: input });
  
  if (result.status === 'failed') {
    return {
      success: false,
      summary: 'Workflow failed',
      approved: false,
      score: 0,
      issues: [],
      suggestions: [],
      securityConcerns: [],
      error: 'Workflow execution failed',
    };
  }
  
  return (result as any).result as PRReviewOutput;
}

/**
 * Run the Issue Triage workflow
 * 
 * @param input - Issue triage input parameters
 * @returns Triage results including labels, priority, and assignee suggestions
 */
export async function runIssueTriageWorkflow(input: IssueTriageInput): Promise<IssueTriageOutput> {
  const mastra = getTsgitMastra();
  const workflow = mastra.getWorkflow('issueTriage');
  
  const run = await workflow.createRun();
  const result = await run.start({ inputData: input });
  
  if (result.status === 'failed') {
    return {
      success: false,
      issueType: 'other',
      priority: 'none',
      suggestedLabels: [],
      relatedFiles: [],
      similarIssues: [],
      reasoning: 'Workflow failed',
      error: 'Workflow execution failed',
    };
  }
  
  return (result as any).result as IssueTriageOutput;
}

/**
 * Run the Code Generation workflow
 * 
 * @param input - Code generation input parameters
 * @returns Generated files and validation results
 */
export async function runCodeGenerationWorkflow(input: CodeGenerationInput): Promise<CodeGenerationOutput> {
  const mastra = getTsgitMastra();
  const workflow = mastra.getWorkflow('codeGeneration');
  
  const run = await workflow.createRun();
  const result = await run.start({ inputData: input });
  
  if (result.status === 'failed') {
    return {
      success: false,
      generatedFiles: [],
      validation: {},
      summary: 'Workflow failed',
      error: 'Workflow execution failed',
    };
  }
  
  return (result as any).result as CodeGenerationOutput;
}

/**
 * Stream the PR Review workflow execution
 * 
 * @param input - PR review input parameters
 * @returns AsyncIterator of workflow events
 */
export async function* streamPRReviewWorkflow(input: PRReviewInput) {
  const mastra = getTsgitMastra();
  const workflow = mastra.getWorkflow('prReview');
  
  const run = await workflow.createRun();
  const result = await run.stream({ inputData: input });
  
  for await (const chunk of result.fullStream) {
    yield chunk;
  }
}

/**
 * Stream the Issue Triage workflow execution
 * 
 * @param input - Issue triage input parameters  
 * @returns AsyncIterator of workflow events
 */
export async function* streamIssueTriageWorkflow(input: IssueTriageInput) {
  const mastra = getTsgitMastra();
  const workflow = mastra.getWorkflow('issueTriage');
  
  const run = await workflow.createRun();
  const result = await run.stream({ inputData: input });
  
  for await (const chunk of result.fullStream) {
    yield chunk;
  }
}

/**
 * Stream the Code Generation workflow execution
 * 
 * @param input - Code generation input parameters
 * @returns AsyncIterator of workflow events
 */
export async function* streamCodeGenerationWorkflow(input: CodeGenerationInput) {
  const mastra = getTsgitMastra();
  const workflow = mastra.getWorkflow('codeGeneration');
  
  const run = await workflow.createRun();
  const result = await run.stream({ inputData: input });
  
  for await (const chunk of result.fullStream) {
    yield chunk;
  }
}

// =============================================================================
// CI/CD Workflow Execution Helpers
// =============================================================================

/**
 * Run the CI Execution workflow
 * 
 * This executes a parsed CI workflow definition using Mastra orchestration.
 * The workflow provides observability, retry handling, and streaming.
 * 
 * @param input - CI execution input parameters including the workflow definition
 * @returns CI execution results including job results and conclusion
 */
export async function runCIExecutionWorkflow(input: CIExecutionInput): Promise<CIExecutionOutput> {
  const mastra = getTsgitMastra();
  const workflow = mastra.getWorkflow('ciExecution');
  
  const run = await workflow.createRun();
  const result = await run.start({ inputData: input });
  
  if (result.status === 'failed') {
    return {
      success: false,
      conclusion: 'failure',
      jobs: {},
      totalDuration: 0,
      summary: 'Workflow execution failed',
      error: 'Mastra workflow execution failed',
    };
  }
  
  return (result as any).result as CIExecutionOutput;
}

/**
 * Stream the CI Execution workflow
 * 
 * Streams workflow execution events for real-time updates.
 * Useful for showing live job/step progress in the UI.
 * 
 * @param input - CI execution input parameters
 * @returns AsyncIterator of workflow events
 */
export async function* streamCIExecutionWorkflow(input: CIExecutionInput) {
  const mastra = getTsgitMastra();
  const workflow = mastra.getWorkflow('ciExecution');
  
  const run = await workflow.createRun();
  const result = await run.stream({ inputData: input });
  
  for await (const chunk of result.fullStream) {
    yield chunk;
  }
}

// =============================================================================
// Multi-Agent Planning Workflow Execution Helpers
// =============================================================================

/**
 * Run the Multi-Agent Planning workflow
 * 
 * This workflow breaks down complex tasks into subtasks, executes them in parallel
 * groups, and supports iterative re-planning based on results.
 * 
 * @param input - Multi-agent planning input parameters
 * @returns Planning results including execution plan and task results
 */
export async function runMultiAgentPlanningWorkflow(input: MultiAgentPlanningInput): Promise<MultiAgentPlanningOutput> {
  const mastra = getTsgitMastra();
  const workflow = mastra.getWorkflow('multiAgentPlanning');
  
  const run = await workflow.createRun();
  const result = await run.start({ inputData: input });
  
  if (result.status === 'failed') {
    return {
      success: false,
      totalIterations: 0,
      groupResults: [],
      summary: 'Workflow execution failed',
      filesModified: [],
      totalDuration: 0,
      error: 'Mastra workflow execution failed',
    };
  }
  
  return (result as any).result as MultiAgentPlanningOutput;
}

/**
 * Stream the Multi-Agent Planning workflow execution
 * 
 * Streams workflow events for real-time progress updates.
 * Shows planning, execution, and review phases as they happen.
 * 
 * @param input - Multi-agent planning input parameters
 * @returns AsyncIterator of workflow events
 */
export async function* streamMultiAgentPlanningWorkflow(input: MultiAgentPlanningInput): AsyncGenerator<unknown> {
  const mastra = getTsgitMastra();
  const workflow = mastra.getWorkflow('multiAgentPlanning');
  
  const run = await workflow.createRun();
  const result = await run.stream({ inputData: input });
  
  for await (const chunk of result.fullStream) {
    yield chunk;
  }
}
