/**
 * Workflows tRPC Router
 * 
 * API endpoints for CI/CD workflow management.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import * as path from 'path';
import * as fs from 'fs';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import {
  workflowRunModel,
  jobRunModel,
  stepRunModel,
  getWorkflowRunWithDetails,
  repoModel,
  collaboratorModel,
} from '../../../db/models';
import { CIEngine, validateWorkflowFile } from '../../../ci';
import { createExecutor } from '../../../ci/executor';
import { resolveDiskPath } from '../../../server/storage/repos';

export const workflowsRouter = router({
  /**
   * List workflow runs for a repository
   */
  listRuns: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        branch: z.string().optional(),
        event: z.string().optional(),
        state: z.enum(['queued', 'in_progress', 'completed', 'failed', 'cancelled']).optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return workflowRunModel.listByRepo(input.repoId, {
        branch: input.branch,
        event: input.event,
        state: input.state,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * Get a single workflow run with all details (jobs, steps)
   */
  getRun: publicProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const run = await getWorkflowRunWithDetails(input.runId);

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workflow run not found',
        });
      }

      return run;
    }),

  /**
   * Get logs for a specific job
   */
  getJobLogs: publicProcedure
    .input(
      z.object({
        jobRunId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const job = await jobRunModel.findById(input.jobRunId);

      if (!job) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Job run not found',
        });
      }

      // Get all steps for this job
      const steps = await stepRunModel.listByJobRun(input.jobRunId);

      return {
        job,
        steps,
        logs: job.logs || '',
      };
    }),

  /**
   * List available workflows for a repository
   */
  listWorkflows: publicProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
      })
    )
    .query(async ({ input }) => {
      const repoResult = await repoModel.findByPath(input.owner, input.repo);

      if (!repoResult) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const reposDir = process.env.REPOS_DIR || './repos';
      const repoDiskPath = repoResult.repo.diskPath;
      const absoluteDiskPath = path.isAbsolute(repoDiskPath)
        ? repoDiskPath
        : path.join(reposDir, repoDiskPath.replace(/^\/repos\//, ''));

      try {
        const engine = new CIEngine({ repoPath: absoluteDiskPath });
        const workflows = engine.load();

        return workflows.map((w) => ({
          name: w.workflow.name,
          filePath: w.filePath,
          triggers: Object.keys(w.workflow.on || {}),
          jobCount: Object.keys(w.workflow.jobs || {}).length,
        }));
      } catch {
        return [];
      }
    }),

  /**
   * Validate a workflow file
   */
  validateWorkflow: publicProcedure
    .input(
      z.object({
        content: z.string(),
      })
    )
    .query(async ({ input }) => {
      return validateWorkflowFile(input.content);
    }),

  /**
   * Trigger a workflow manually (workflow_dispatch)
   */
  trigger: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        workflowPath: z.string(),
        branch: z.string().default('main'),
        inputs: z.record(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const repoResult = await repoModel.findByPath(input.owner, input.repo);

      if (!repoResult) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check write permission
      const isOwner = repoResult.repo.ownerId === ctx.user.id;
      const canWrite =
        isOwner ||
        (await collaboratorModel.hasPermission(repoResult.repo.id, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to trigger workflows',
        });
      }

      const reposDir = process.env.REPOS_DIR || './repos';
      const repoDiskPath = repoResult.repo.diskPath;
      const absoluteDiskPath = path.isAbsolute(repoDiskPath)
        ? repoDiskPath
        : path.join(reposDir, repoDiskPath.replace(/^\/repos\//, ''));

      // Load the specific workflow
      const engine = new CIEngine({ repoPath: absoluteDiskPath });
      engine.load();

      const workflow = engine.getWorkflows().find((w) => w.filePath === input.workflowPath);

      if (!workflow) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workflow not found',
        });
      }

      // Check if workflow supports workflow_dispatch
      const triggers = workflow.workflow.on;
      const triggerObj = triggers as Record<string, unknown>;
      if (!('workflow_dispatch' in triggerObj)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This workflow does not support manual triggering',
        });
      }

      // Execute the workflow
      const executor = createExecutor(engine);
      const { runId, result } = await executor.execute(
        workflow.workflow,
        input.workflowPath,
        {
          repoId: repoResult.repo.id,
          repoDiskPath: absoluteDiskPath,
          commitSha: 'HEAD', // TODO: resolve actual HEAD commit
          branch: input.branch,
          event: 'workflow_dispatch',
          eventPayload: {
            inputs: input.inputs || {},
          },
          triggeredById: ctx.user.id,
          inputs: input.inputs,
        }
      );

      return {
        runId,
        success: result.success,
        duration: result.duration,
      };
    }),

  /**
   * Cancel a running workflow
   */
  cancel: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const run = await workflowRunModel.findById(input.runId);

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workflow run not found',
        });
      }

      // Check permission
      const repo = await repoModel.findById(run.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const isOwner = repo.ownerId === ctx.user.id;
      const canWrite =
        isOwner ||
        (await collaboratorModel.hasPermission(repo.id, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to cancel workflows',
        });
      }

      // Cancel the workflow
      const cancelled = await workflowRunModel.cancel(input.runId);

      if (!cancelled) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Workflow cannot be cancelled (already completed)',
        });
      }

      return { success: true };
    }),

  /**
   * Re-run a failed workflow
   */
  rerun: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const run = await workflowRunModel.findById(input.runId);

      if (!run) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workflow run not found',
        });
      }

      // Check permission
      const repo = await repoModel.findById(run.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const isOwner = repo.ownerId === ctx.user.id;
      const canWrite =
        isOwner ||
        (await collaboratorModel.hasPermission(repo.id, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to re-run workflows',
        });
      }

      const absoluteDiskPath = resolveDiskPath(repo.diskPath);

      // Load the workflow
      const engine = new CIEngine({ repoPath: absoluteDiskPath });
      engine.load();

      const workflow = engine.getWorkflows().find((w) => w.filePath === run.workflowPath);

      if (!workflow) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workflow file no longer exists',
        });
      }

      // Execute the workflow
      const executor = createExecutor(engine);
      const eventPayload = run.eventPayload ? JSON.parse(run.eventPayload) : {};

      const { runId, result } = await executor.execute(
        workflow.workflow,
        run.workflowPath,
        {
          repoId: repo.id,
          repoDiskPath: absoluteDiskPath,
          commitSha: run.commitSha,
          branch: run.branch || undefined,
          event: run.event,
          eventPayload,
          triggeredById: ctx.user.id,
        }
      );

      return {
        runId,
        success: result.success,
        duration: result.duration,
      };
    }),

  /**
   * Get workflow run counts by state
   */
  getRunCounts: publicProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return workflowRunModel.countByState(input.repoId);
    }),

  /**
   * Get the latest run for each workflow in a repository
   */
  getLatestRuns: publicProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
      })
    )
    .query(async ({ input }) => {
      const repoResult = await repoModel.findByPath(input.owner, input.repo);

      if (!repoResult) {
        return [];
      }

      const reposDir = process.env.REPOS_DIR || './repos';
      const repoDiskPath = repoResult.repo.diskPath;
      const absoluteDiskPath = path.isAbsolute(repoDiskPath)
        ? repoDiskPath
        : path.join(reposDir, repoDiskPath.replace(/^\/repos\//, ''));

      try {
        const engine = new CIEngine({ repoPath: absoluteDiskPath });
        const workflows = engine.load();

        const latestRuns = await Promise.all(
          workflows.map(async (w) => {
            const latestRun = await workflowRunModel.getLatestRun(
              repoResult.repo.id,
              w.filePath
            );
            return {
              workflow: {
                name: w.workflow.name,
                filePath: w.filePath,
              },
              latestRun,
            };
          })
        );

        return latestRuns;
      } catch {
        return [];
      }
    }),

  // =============================================================================
  // Mastra Workflow Builder Endpoints
  // =============================================================================

  /**
   * Save a Mastra workflow definition (generates TypeScript code)
   */
  saveMastraWorkflow: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        workflow: z.object({
          id: z.string(),
          name: z.string(),
          description: z.string().optional(),
          inputSchema: z.object({ fields: z.array(z.any()) }),
          outputSchema: z.object({ fields: z.array(z.any()) }),
          nodes: z.array(z.any()),
          edges: z.array(z.any()),
          env: z.record(z.string()).optional(),
          secrets: z.array(z.string()).optional(),
        }),
        filePath: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const repoResult = await repoModel.findByPath(input.owner, input.repo);

      if (!repoResult) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check write permission
      const isOwner = repoResult.repo.ownerId === ctx.user.id;
      const canWrite =
        isOwner ||
        (await collaboratorModel.hasPermission(repoResult.repo.id, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to save workflows',
        });
      }

      const absoluteDiskPath = resolveDiskPath(repoResult.repo.diskPath);
      const workflowsDir = path.join(absoluteDiskPath, '.wit', 'workflows');
      
      // Ensure workflows directory exists
      if (!fs.existsSync(workflowsDir)) {
        fs.mkdirSync(workflowsDir, { recursive: true });
      }

      // Generate file path
      const filename = input.workflow.name.toLowerCase().replace(/\s+/g, '-');
      const tsFilePath = input.filePath || path.join(workflowsDir, `${filename}.workflow.ts`);
      const jsonFilePath = tsFilePath.replace('.workflow.ts', '.workflow.json');
      
      // Generate Mastra workflow code
      const code = generateMastraWorkflowCode(input.workflow);
      
      // Write both files
      fs.writeFileSync(tsFilePath, code);
      fs.writeFileSync(jsonFilePath, JSON.stringify(input.workflow, null, 2));

      return {
        success: true,
        tsPath: tsFilePath,
        jsonPath: jsonFilePath,
      };
    }),

  /**
   * Load a Mastra workflow definition (from JSON)
   */
  loadMastraWorkflow: publicProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        filePath: z.string(),
      })
    )
    .query(async ({ input }) => {
      const repoResult = await repoModel.findByPath(input.owner, input.repo);

      if (!repoResult) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      const absoluteDiskPath = resolveDiskPath(repoResult.repo.diskPath);
      const jsonPath = input.filePath.endsWith('.json') 
        ? path.join(absoluteDiskPath, input.filePath)
        : path.join(absoluteDiskPath, input.filePath.replace('.workflow.ts', '.workflow.json'));

      if (!fs.existsSync(jsonPath)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Workflow definition not found',
        });
      }

      const content = fs.readFileSync(jsonPath, 'utf-8');
      return JSON.parse(content);
    }),

  /**
   * List all Mastra workflows in a repository
   */
  listMastraWorkflows: publicProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
      })
    )
    .query(async ({ input }) => {
      const repoResult = await repoModel.findByPath(input.owner, input.repo);

      if (!repoResult) {
        return [];
      }

      const absoluteDiskPath = resolveDiskPath(repoResult.repo.diskPath);
      const workflowsDir = path.join(absoluteDiskPath, '.wit', 'workflows');

      if (!fs.existsSync(workflowsDir)) {
        return [];
      }

      const files = fs.readdirSync(workflowsDir);
      const workflows = [];

      for (const file of files) {
        if (file.endsWith('.workflow.json')) {
          try {
            const content = fs.readFileSync(path.join(workflowsDir, file), 'utf-8');
            const workflow = JSON.parse(content);
            workflows.push({
              name: workflow.name,
              description: workflow.description,
              filePath: path.join('.wit', 'workflows', file),
              nodeCount: workflow.nodes?.length || 0,
              updatedAt: fs.statSync(path.join(workflowsDir, file)).mtime,
            });
          } catch {
            // Skip invalid files
          }
        }
      }

      return workflows;
    }),

  /**
   * Delete a Mastra workflow
   */
  deleteMastraWorkflow: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        filePath: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const repoResult = await repoModel.findByPath(input.owner, input.repo);

      if (!repoResult) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check write permission
      const isOwner = repoResult.repo.ownerId === ctx.user.id;
      const canWrite =
        isOwner ||
        (await collaboratorModel.hasPermission(repoResult.repo.id, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to delete workflows',
        });
      }

      const absoluteDiskPath = resolveDiskPath(repoResult.repo.diskPath);
      const jsonPath = path.join(absoluteDiskPath, input.filePath);
      const tsPath = jsonPath.replace('.workflow.json', '.workflow.ts');

      // Delete both files if they exist
      if (fs.existsSync(jsonPath)) {
        fs.unlinkSync(jsonPath);
      }
      if (fs.existsSync(tsPath)) {
        fs.unlinkSync(tsPath);
      }

      return { success: true };
    }),
});

// =============================================================================
// Code Generation Helper
// =============================================================================

function generateMastraWorkflowCode(workflow: {
  id: string;
  name: string;
  description?: string;
  inputSchema: { fields: Array<{ name: string; type: string; required: boolean; description?: string; default?: unknown }> };
  outputSchema: { fields: Array<{ name: string; type: string; required: boolean; description?: string; default?: unknown }> };
  nodes: Array<{
    id: string;
    type: string;
    name: string;
    config: Record<string, unknown>;
  }>;
  edges: Array<{ source: string; target: string }>;
}): string {
  const lines: string[] = [];

  // Imports
  lines.push("import { createWorkflow, createStep } from '@mastra/core/workflows';");
  lines.push("import { z } from 'zod';");
  lines.push('');

  const pascalName = toPascalCase(workflow.name);
  const camelName = toCamelCase(workflow.name);

  // Input Schema
  lines.push('// =============================================================================');
  lines.push('// Input/Output Schemas');
  lines.push('// =============================================================================');
  lines.push('');
  lines.push(`export const ${pascalName}InputSchema = z.object({`);
  for (const field of workflow.inputSchema.fields) {
    lines.push(`  ${field.name}: ${schemaFieldToZod(field)},`);
  }
  lines.push('});');
  lines.push('');
  lines.push(`export type ${pascalName}Input = z.infer<typeof ${pascalName}InputSchema>;`);
  lines.push('');

  // Output Schema
  lines.push(`export const ${pascalName}OutputSchema = z.object({`);
  for (const field of workflow.outputSchema.fields) {
    lines.push(`  ${field.name}: ${schemaFieldToZod(field)},`);
  }
  lines.push('});');
  lines.push('');
  lines.push(`export type ${pascalName}Output = z.infer<typeof ${pascalName}OutputSchema>;`);
  lines.push('');

  // Build execution order from edges
  const executionOrder = topologicalSort(workflow.nodes, workflow.edges);
  const stepNodes = executionOrder.filter((n) => n.type === 'step');

  // Generate step definitions
  if (stepNodes.length > 0) {
    lines.push('// =============================================================================');
    lines.push('// Steps');
    lines.push('// =============================================================================');
    lines.push('');

    for (const node of stepNodes) {
      const config = node.config as {
        id?: string;
        inputSchema?: { fields: Array<{ name: string; type: string; required: boolean }> };
        outputSchema?: { fields: Array<{ name: string; type: string; required: boolean }> };
        executeCode?: string;
        runCommand?: string;
        actionRef?: string;
      };
      
      const stepId = config.id || node.id;
      lines.push(`const ${toCamelCase(stepId)}Step = createStep({`);
      lines.push(`  id: '${stepId}',`);
      
      // Input schema
      lines.push('  inputSchema: z.object({');
      for (const field of config.inputSchema?.fields || []) {
        lines.push(`    ${field.name}: ${schemaFieldToZod(field)},`);
      }
      lines.push('  }),');
      
      // Output schema
      lines.push('  outputSchema: z.object({');
      for (const field of config.outputSchema?.fields || []) {
        lines.push(`    ${field.name}: ${schemaFieldToZod(field)},`);
      }
      lines.push('  }),');
      
      // Execute function
      if (config.runCommand) {
        lines.push('  execute: async ({ inputData }) => {');
        lines.push("    const { spawn } = await import('child_process');");
        lines.push('    return new Promise((resolve) => {');
        lines.push(`      const child = spawn('sh', ['-c', ${JSON.stringify(config.runCommand)}]);`);
        lines.push("      let output = '';");
        lines.push("      child.stdout?.on('data', (data) => { output += data.toString(); });");
        lines.push("      child.on('close', (code) => {");
        lines.push('        resolve({ success: code === 0, output });');
        lines.push('      });');
        lines.push('    });');
        lines.push('  },');
      } else if (config.actionRef) {
        lines.push('  execute: async ({ inputData }) => {');
        lines.push(`    // Action: ${config.actionRef}`);
        lines.push('    return { success: true };');
        lines.push('  },');
      } else if (config.executeCode) {
        lines.push(`  execute: ${config.executeCode},`);
      } else {
        lines.push('  execute: async ({ inputData }) => {');
        lines.push('    return { success: true };');
        lines.push('  },');
      }
      
      lines.push('});');
      lines.push('');
    }
  }

  // Generate workflow definition
  lines.push('// =============================================================================');
  lines.push('// Workflow Definition');
  lines.push('// =============================================================================');
  lines.push('');
  lines.push(`export const ${camelName}Workflow = createWorkflow({`);
  lines.push(`  id: '${workflow.id}',`);
  lines.push(`  inputSchema: ${pascalName}InputSchema,`);
  lines.push(`  outputSchema: ${pascalName}OutputSchema,`);
  lines.push('})');

  // Chain steps in execution order
  let isFirstStep = true;
  for (const node of executionOrder) {
    if (node.type === 'trigger') continue;
    
    if (node.type === 'step') {
      const config = node.config as { id?: string };
      const stepId = config.id || node.id;
      const indent = isFirstStep ? '' : '  ';
      lines.push(`${indent}.then(${toCamelCase(stepId)}Step)`);
      isFirstStep = false;
    } else if (node.type === 'parallel') {
      const config = node.config as { stepIds?: string[] };
      const stepRefs = (config.stepIds || []).map((id: string) => `${toCamelCase(id)}Step`).join(', ');
      lines.push(`  .parallel([${stepRefs}])`);
    } else if (node.type === 'map') {
      const config = node.config as { transformCode?: string };
      if (config.transformCode) {
        lines.push(`  .map(${config.transformCode})`);
      }
    }
  }

  lines.push('  .commit();');
  lines.push('');

  return lines.join('\n');
}

function topologicalSort(
  nodes: Array<{ id: string; type: string; name: string; config: Record<string, unknown> }>,
  edges: Array<{ source: string; target: string }>
): Array<{ id: string; type: string; name: string; config: Record<string, unknown> }> {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  const queue: string[] = [];
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(nodeId);
    }
  }

  const result: Array<{ id: string; type: string; name: string; config: Record<string, unknown> }> = [];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const node = nodeMap.get(nodeId);
    if (node) {
      result.push(node);
    }

    for (const neighbor of adjacency.get(nodeId) || []) {
      const newDegree = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  return result;
}

function schemaFieldToZod(field: { name?: string; type: string; required?: boolean; description?: string; default?: unknown }): string {
  let zodType: string;
  switch (field.type) {
    case 'string':
      zodType = 'z.string()';
      break;
    case 'number':
      zodType = 'z.number()';
      break;
    case 'boolean':
      zodType = 'z.boolean()';
      break;
    case 'object':
      zodType = 'z.record(z.unknown())';
      break;
    case 'array':
      zodType = 'z.array(z.unknown())';
      break;
    default:
      zodType = 'z.unknown()';
  }

  if (field.description) {
    zodType += `.describe('${field.description.replace(/'/g, "\\'")}')`;
  }

  if (field.required === false) {
    zodType += '.optional()';
  }

  if (field.default !== undefined) {
    zodType += `.default(${JSON.stringify(field.default)})`;
  }

  return zodType;
}

function toPascalCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (c) => c.toUpperCase());
}

function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (c) => c.toLowerCase());
}
