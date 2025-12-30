/**
 * Planning Streaming Routes
 * 
 * SSE endpoint for streaming planning workflow responses.
 * Uses HTTP POST with SSE response for proper authentication.
 */

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import * as path from 'path';
import {
  repoModel,
  repoAiKeyModel,
} from '../../db/models';
import { createAuth } from '../../lib/auth';
import { isAIAvailable, streamMultiAgentPlanningWorkflow } from '../../ai/mastra';
import type { MultiAgentPlanningInput } from '../../ai/workflows/multi-agent-planning.workflow';

function getRepoDiskPath(ownerUsername: string, repoName: string): string {
  const reposDir = process.env.REPOS_DIR || './repos';
  return path.join(reposDir, ownerUsername, `${repoName}.git`);
}

/**
 * Create planning streaming routes
 */
export function createPlanningStreamRoutes() {
  const app = new Hono();

  // SSE endpoint for streaming planning workflow
  app.post('/stream', async (c) => {
    // Get session from cookie using better-auth
    const auth = createAuth();

    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const userId = session.user.id;

    // Parse request body
    let body: {
      repoId: string;
      task: string;
      context?: string;
      maxIterations?: number;
      maxParallelTasks?: number;
      dryRun?: boolean;
      createBranch?: boolean;
      branchName?: string;
      autoCommit?: boolean;
    };

    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const { 
      repoId, 
      task, 
      context,
      maxIterations = 3,
      maxParallelTasks = 5,
      dryRun = false,
      createBranch = true,
      branchName,
      autoCommit = true,
    } = body;

    if (!repoId || !task) {
      return c.json({ error: 'repoId and task are required' }, 400);
    }

    if (task.length < 10) {
      return c.json({ error: 'Task must be at least 10 characters' }, 400);
    }

    // Check AI availability and get API key
    if (!isAIAvailable()) {
      const repoKey = await repoAiKeyModel.getAnyKey(repoId);
      if (!repoKey) {
        return c.json({ error: 'AI is not configured. Add an API key in repository settings.' }, 412);
      }
      
      if (repoKey.provider === 'anthropic') {
        process.env.ANTHROPIC_API_KEY = repoKey.key;
      } else {
        process.env.OPENAI_API_KEY = repoKey.key;
      }
    }

    // Get repository details
    const repo = await repoModel.findByIdWithOwner(repoId);
    if (!repo) {
      return c.json({ error: 'Repository not found' }, 404);
    }

    const ownerInfo = repo.owner as { username?: string; name?: string };
    const ownerUsername = ownerInfo.username || ownerInfo.name || 'unknown';

    // Build workflow input
    const workflowInput: MultiAgentPlanningInput = {
      repoId,
      repoPath: getRepoDiskPath(ownerUsername, repo.repo.name),
      owner: ownerUsername,
      repoName: repo.repo.name,
      userId,
      task,
      context,
      maxIterations,
      maxParallelTasks,
      dryRun,
      verbose: true,
      createBranch,
      branchName,
      autoCommit,
    };

    const runId = crypto.randomUUID();
    const startTime = Date.now();

    // Stream the response
    return streamSSE(c, async (stream) => {
      try {
        // Emit started event
        await stream.writeSSE({
          event: 'started',
          data: JSON.stringify({
            runId,
            timestamp: new Date().toISOString(),
            task,
            repoName: repo.repo.name,
            dryRun,
          }),
        });

        // Stream Mastra workflow events
        for await (const event of streamMultiAgentPlanningWorkflow(workflowInput)) {
          const eventData = event as { type: string; stepId?: string; result?: unknown; error?: string };
          
          await stream.writeSSE({
            event: eventData.type,
            data: JSON.stringify({
              runId,
              timestamp: new Date().toISOString(),
              stepId: eventData.stepId,
              result: eventData.result,
              error: eventData.error,
            }),
          });
        }

        // Emit complete event
        await stream.writeSSE({
          event: 'complete',
          data: JSON.stringify({
            runId,
            timestamp: new Date().toISOString(),
            totalDuration: Date.now() - startTime,
          }),
        });

      } catch (error) {
        console.error('[planning-stream] Error:', error);
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({
            runId,
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        });
      }
    });
  });

  return app;
}
