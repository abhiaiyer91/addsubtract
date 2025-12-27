/**
 * CI/CD Event Handler
 * 
 * Listens to repository events (push, PR) and triggers matching workflows.
 */

import { eventBus } from '../bus';
import type { RepoPushedEvent, PrCreatedEvent, PrUpdatedEvent } from '../types';
import { CIEngine, type TriggerContext } from '../../ci';
import { createExecutor } from '../../ci/executor';
import { repoModel } from '../../db/models';
import * as path from 'path';

/**
 * CI Handler class that manages workflow triggering
 */
class CIHandler {
  private reposDir: string;
  
  constructor() {
    this.reposDir = process.env.REPOS_DIR || './repos';
  }
  
  /**
   * Initialize the CI engine for a repository
   */
  private getEngineForRepo(repoDiskPath: string): CIEngine | null {
    try {
      const engine = new CIEngine({ repoPath: repoDiskPath });
      engine.load();
      return engine;
    } catch (error) {
      console.error('[CI] Failed to load workflows:', error);
      return null;
    }
  }
  
  /**
   * Trigger workflows for a push event
   */
  async handlePush(event: RepoPushedEvent): Promise<void> {
    const { repoId, repoFullName, ref, afterSha, commits } = event.payload;
    
    // Get repository info
    const [owner, repoName] = repoFullName.split('/');
    const repo = await repoModel.findByPath(owner, repoName);
    if (!repo) {
      console.error(`[CI] Repository not found: ${repoFullName}`);
      return;
    }
    
    const repoDiskPath = repo.repo.diskPath;
    const absoluteDiskPath = path.isAbsolute(repoDiskPath)
      ? repoDiskPath
      : path.join(this.reposDir, repoDiskPath.replace(/^\/repos\//, ''));
    
    // Load CI engine
    const engine = await this.getEngineForRepo(absoluteDiskPath);
    if (!engine) return;
    
    const workflows = engine.getWorkflows();
    if (workflows.length === 0) {
      console.log(`[CI] No workflows found for ${repoFullName}`);
      return;
    }
    
    // Determine if this is a branch or tag push
    let branch: string | undefined;
    let tag: string | undefined;
    
    if (ref.startsWith('refs/heads/')) {
      branch = ref.replace('refs/heads/', '');
    } else if (ref.startsWith('refs/tags/')) {
      tag = ref.replace('refs/tags/', '');
    }
    
    // Get changed paths from commits (in a real implementation, we'd get actual file paths)
    const changedPaths: string[] = [];
    
    // Build trigger context
    const context: TriggerContext = {
      event: 'push',
      branch,
      tag,
      paths: changedPaths,
    };
    
    // Find matching workflows
    const matchingWorkflows = engine.findMatchingWorkflows(context);
    
    if (matchingWorkflows.length === 0) {
      console.log(`[CI] No matching workflows for push to ${ref}`);
      return;
    }
    
    console.log(`[CI] Found ${matchingWorkflows.length} workflows to run for push to ${ref}`);
    
    // Create executor
    const executor = createExecutor(engine);
    
    // Execute each matching workflow
    for (const { filePath, workflow } of matchingWorkflows) {
      console.log(`[CI] Triggering workflow: ${workflow.name} (${filePath})`);
      
      try {
        const { runId, result } = await executor.execute(workflow, filePath, {
          repoId,
          repoDiskPath: absoluteDiskPath,
          commitSha: afterSha,
          branch,
          event: 'push',
          eventPayload: {
            ref,
            before: event.payload.beforeSha,
            after: afterSha,
            commits: commits.map(c => ({
              id: c.sha,
              message: c.message,
              author: { name: c.author },
            })),
          },
          triggeredById: event.actorId,
        });
        
        console.log(`[CI] Workflow ${workflow.name} completed: ${result.success ? 'success' : 'failure'} (run: ${runId})`);
      } catch (error) {
        console.error(`[CI] Failed to execute workflow ${workflow.name}:`, error);
      }
    }
  }
  
  /**
   * Trigger workflows for a pull request event
   */
  async handlePullRequest(
    event: PrCreatedEvent | PrUpdatedEvent,
    action: 'opened' | 'synchronize'
  ): Promise<void> {
    const payload = event.payload;
    const { repoId, repoFullName, prNumber } = payload;
    
    // Get repository info
    const [owner, repoName] = repoFullName.split('/');
    const repo = await repoModel.findByPath(owner, repoName);
    if (!repo) {
      console.error(`[CI] Repository not found: ${repoFullName}`);
      return;
    }
    
    const repoDiskPath = repo.repo.diskPath;
    const absoluteDiskPath = path.isAbsolute(repoDiskPath)
      ? repoDiskPath
      : path.join(this.reposDir, repoDiskPath.replace(/^\/repos\//, ''));
    
    // Load CI engine
    const engine = await this.getEngineForRepo(absoluteDiskPath);
    if (!engine) return;
    
    const workflows = engine.getWorkflows();
    if (workflows.length === 0) {
      console.log(`[CI] No workflows found for ${repoFullName}`);
      return;
    }
    
    // Get branch info from PR (only available in created event)
    let sourceBranch: string | undefined;
    let targetBranch: string | undefined;
    
    if ('sourceBranch' in payload) {
      sourceBranch = payload.sourceBranch;
      targetBranch = payload.targetBranch;
    }
    
    // Build trigger context
    const context: TriggerContext = {
      event: 'pull_request',
      branch: targetBranch,
      prType: action,
    };
    
    // Find matching workflows
    const matchingWorkflows = engine.findMatchingWorkflows(context);
    
    if (matchingWorkflows.length === 0) {
      console.log(`[CI] No matching workflows for PR #${prNumber}`);
      return;
    }
    
    console.log(`[CI] Found ${matchingWorkflows.length} workflows to run for PR #${prNumber}`);
    
    // Get the head commit SHA
    // In a real implementation, we'd get this from the PR
    const commitSha = 'HEAD';
    
    // Create executor
    const executor = createExecutor(engine);
    
    // Execute each matching workflow
    for (const { filePath, workflow } of matchingWorkflows) {
      console.log(`[CI] Triggering workflow: ${workflow.name} (${filePath})`);
      
      try {
        const { runId, result } = await executor.execute(workflow, filePath, {
          repoId,
          repoDiskPath: absoluteDiskPath,
          commitSha,
          branch: sourceBranch,
          event: 'pull_request',
          eventPayload: {
            action,
            number: prNumber,
            pull_request: {
              number: prNumber,
              head: { ref: sourceBranch },
              base: { ref: targetBranch },
            },
          },
          triggeredById: event.actorId,
        });
        
        console.log(`[CI] Workflow ${workflow.name} completed: ${result.success ? 'success' : 'failure'} (run: ${runId})`);
      } catch (error) {
        console.error(`[CI] Failed to execute workflow ${workflow.name}:`, error);
      }
    }
  }
}

// Singleton handler instance
const ciHandler = new CIHandler();

/**
 * Register CI event handlers
 */
export function registerCIHandlers(): void {
  console.log('[CI] Registering CI event handlers');
  
  // Handle push events
  eventBus.on('repo.pushed', async (event: RepoPushedEvent) => {
    console.log(`[CI] Received push event for ${event.payload.repoFullName}`);
    await ciHandler.handlePush(event);
  });
  
  // Handle PR created events
  eventBus.on('pr.created', async (event: PrCreatedEvent) => {
    console.log(`[CI] Received PR created event for ${event.payload.repoFullName}#${event.payload.prNumber}`);
    await ciHandler.handlePullRequest(event, 'opened');
  });
  
  // Handle PR updated events (synchronize)
  eventBus.on('pr.updated', async (event: PrUpdatedEvent) => {
    console.log(`[CI] Received PR updated event for ${event.payload.repoFullName}#${event.payload.prNumber}`);
    await ciHandler.handlePullRequest(event, 'synchronize');
  });
  
  console.log('[CI] CI event handlers registered');
}
