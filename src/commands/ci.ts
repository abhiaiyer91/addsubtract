/**
 * CI/CD Commands
 *
 * Manage continuous integration workflows from the command line.
 *
 * Usage:
 *   wit ci run [workflow]        Run a workflow locally
 *   wit ci list                  List available workflows
 *   wit ci validate [file]       Validate workflow YAML
 *   wit ci runs                  Show recent workflow runs
 *   wit ci view <run-id>         View workflow run details
 */

import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../core/repository';
import { TsgitError, ErrorCode } from '../core/errors';
import { CIEngine, validateWorkflowFile } from '../ci';
import { createExecutor } from '../ci/executor';
import { colors } from '../utils/colors';

export const CI_HELP = `
wit ci - Manage CI/CD workflows

Usage: wit ci <command> [options]

Commands:
  run [workflow]        Run a workflow locally (defaults to all matching workflows)
  list                  List available workflows in the repository
  validate [file]       Validate workflow YAML syntax
  runs                  Show recent workflow runs (requires server)
  view <run-id>         View workflow run details (requires server)

Options:
  -h, --help            Show this help message
  --job <name>          Run only a specific job
  --dry-run             Show what would be run without executing
  --verbose             Show detailed output

Examples:
  wit ci list                       List all workflows
  wit ci run                        Run all matching workflows for current branch
  wit ci run ci.yml                 Run specific workflow
  wit ci run --job build            Run only the 'build' job
  wit ci validate                   Validate all workflows
  wit ci validate .wit/workflows/ci.yml  Validate specific file
`;

/**
 * Main handler for ci command
 */
export async function handleCI(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === '-h' || subcommand === '--help') {
    console.log(CI_HELP);
    return;
  }

  try {
    switch (subcommand) {
      case 'run':
        await handleCIRun(args.slice(1));
        break;
      case 'list':
        await handleCIList(args.slice(1));
        break;
      case 'validate':
        await handleCIValidate(args.slice(1));
        break;
      case 'runs':
        await handleCIRuns(args.slice(1));
        break;
      case 'view':
        await handleCIView(args.slice(1));
        break;
      default:
        console.error(colors.red('error: ') + `Unknown subcommand: '${subcommand}'`);
        console.log(CI_HELP);
        process.exit(1);
    }
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Parse arguments for common flags
 */
function parseArgs(args: string[]): {
  flags: Record<string, string | boolean>;
  positional: string[];
} {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[key] = args[i + 1];
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      const keyMap: Record<string, string> = {
        j: 'job',
        v: 'verbose',
        n: 'dry-run',
      };
      const mappedKey = keyMap[key] || key;
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[mappedKey] = args[i + 1];
        i += 2;
      } else {
        flags[mappedKey] = true;
        i++;
      }
    } else {
      positional.push(arg);
      i++;
    }
  }

  return { flags, positional };
}

/**
 * Run workflows locally
 */
async function handleCIRun(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const workflowFile = positional[0];
  const jobFilter = flags.job as string | undefined;
  const dryRun = !!flags['dry-run'];
  const verbose = !!flags.verbose;

  // Find repository
  const repo = Repository.find();
  const repoPath = repo.workDir;

  // Load workflows
  const engine = new CIEngine({ repoPath });
  const workflows = engine.load();

  if (workflows.length === 0) {
    console.log(colors.yellow('No workflows found'));
    console.log(colors.dim('Create workflows in .wit/workflows/'));
    return;
  }

  // Filter to specific workflow if provided
  let targetWorkflows = workflows;
  if (workflowFile) {
    targetWorkflows = workflows.filter(
      (w) => w.filePath === workflowFile || w.filePath.endsWith(workflowFile)
    );
    if (targetWorkflows.length === 0) {
      throw new TsgitError(
        `Workflow not found: ${workflowFile}`,
        ErrorCode.FILE_NOT_FOUND,
        [`Available workflows: ${workflows.map((w) => w.filePath).join(', ')}`]
      );
    }
  }

  // Get current branch and HEAD
  const currentBranch = repo.refs.getCurrentBranch() || 'main';
  const headSha = repo.refs.resolve('HEAD') || 'HEAD';

  console.log(
    `\n${colors.bold('Running CI workflows')} ${colors.dim(`(${currentBranch} @ ${headSha.slice(0, 7)})`)}\n`
  );

  if (dryRun) {
    console.log(colors.yellow('DRY RUN - no commands will be executed\n'));
  }

  for (const { workflow, filePath } of targetWorkflows) {
    console.log(`${colors.cyan('▶')} ${colors.bold(workflow.name || filePath)}`);
    console.log(colors.dim(`  ${filePath}`));

    // Get jobs in order
    const jobNames = Object.keys(workflow.jobs);
    const jobOrder = engine.getJobOrder(workflow);

    // Filter jobs if --job flag provided
    const jobsToRun = jobFilter
      ? jobOrder.filter((j) => j === jobFilter)
      : jobOrder;

    if (jobFilter && jobsToRun.length === 0) {
      console.log(colors.yellow(`  Job '${jobFilter}' not found in workflow`));
      console.log(colors.dim(`  Available jobs: ${jobNames.join(', ')}`));
      continue;
    }

    if (dryRun) {
      console.log(`  ${colors.dim('Jobs to run:')}`);
      for (const jobId of jobsToRun) {
        const job = workflow.jobs[jobId];
        console.log(`    ${colors.cyan('○')} ${jobId} (${job.steps?.length || 0} steps)`);
        if (job.steps && verbose) {
          for (const step of job.steps) {
            const stepName = step.name || step.run?.slice(0, 40) || step.uses || 'unnamed';
            console.log(`      ${colors.dim('-')} ${stepName}`);
          }
        }
      }
      console.log();
      continue;
    }

    // Execute the workflow
    const executor = createExecutor(engine);
    const startTime = Date.now();

    try {
      const { result } = await executor.execute(workflow, filePath, {
        repoId: 'local',
        repoDiskPath: repoPath,
        commitSha: headSha,
        branch: currentBranch,
        event: 'workflow_dispatch',
        eventPayload: {},
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (result.success) {
        console.log(
          `  ${colors.green('✓')} Completed in ${duration}s\n`
        );
      } else {
        console.log(
          `  ${colors.red('✗')} Failed in ${duration}s\n`
        );

        // Show failed jobs
        for (const [jobName, jobResult] of Object.entries(result.jobs)) {
          if (!jobResult.success) {
            console.log(`  ${colors.red('Failed job:')} ${jobName}`);
            
            // Show failed steps
            for (let i = 0; i < jobResult.steps.length; i++) {
              const stepResult = jobResult.steps[i];
              if (!stepResult.success) {
                console.log(`    ${colors.red('Failed step:')} Step ${i + 1}`);
                if (stepResult.output) {
                  const logLines = stepResult.output.split('\n').slice(-10);
                  for (const line of logLines) {
                    console.log(`      ${colors.dim(line)}`);
                  }
                }
                if (stepResult.error) {
                  console.log(`      ${colors.red(stepResult.error)}`);
                }
              }
            }
          }
        }
        
        process.exit(1);
      }
    } catch (error) {
      console.log(`  ${colors.red('✗')} Error: ${error instanceof Error ? error.message : error}\n`);
      process.exit(1);
    }
  }

  console.log(colors.green('All workflows completed successfully'));
}

/**
 * List available workflows
 */
async function handleCIList(_args: string[]): Promise<void> {
  // Find repository
  const repo = Repository.find();
  const repoPath = repo.workDir;

  // Load workflows
  const engine = new CIEngine({ repoPath });
  const workflows = engine.load();

  if (workflows.length === 0) {
    console.log(colors.yellow('No workflows found'));
    console.log();
    console.log('Create workflows in .wit/workflows/');
    console.log();
    console.log('Example workflow (.wit/workflows/ci.yml):');
    console.log(colors.dim(`
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      
      - name: Install dependencies
        run: npm install
      
      - name: Run tests
        run: npm test
`));
    return;
  }

  console.log(`\n${colors.bold('Available Workflows')}\n`);

  for (const { workflow, filePath } of workflows) {
    const name = workflow.name || path.basename(filePath, path.extname(filePath));
    const triggers = Object.keys(workflow.on || {});
    const jobCount = Object.keys(workflow.jobs || {}).length;

    console.log(`${colors.cyan('●')} ${colors.bold(name)}`);
    console.log(`  ${colors.dim('File:')} ${filePath}`);
    console.log(`  ${colors.dim('Triggers:')} ${triggers.join(', ') || 'none'}`);
    console.log(`  ${colors.dim('Jobs:')} ${jobCount}`);

    // List jobs
    for (const [jobId, job] of Object.entries(workflow.jobs || {})) {
      const stepCount = job.steps?.length || 0;
      console.log(`    ${colors.dim('-')} ${jobId} (${stepCount} steps)`);
    }
    console.log();
  }
}

/**
 * Validate workflow files
 */
async function handleCIValidate(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const targetFile = positional[0];

  // Find repository
  const repo = Repository.find();
  const repoPath = repo.workDir;

  // Determine which files to validate
  let filesToValidate: string[] = [];

  if (targetFile) {
    // Validate specific file
    const absolutePath = path.isAbsolute(targetFile)
      ? targetFile
      : path.join(repoPath, targetFile);

    if (!fs.existsSync(absolutePath)) {
      throw new TsgitError(
        `File not found: ${targetFile}`,
        ErrorCode.FILE_NOT_FOUND
      );
    }
    filesToValidate = [absolutePath];
  } else {
    // Validate all workflows
    const workflowsDir = path.join(repoPath, '.wit', 'workflows');
    if (!fs.existsSync(workflowsDir)) {
      console.log(colors.yellow('No workflows directory found'));
      console.log(colors.dim('Create workflows in .wit/workflows/'));
      return;
    }

    filesToValidate = fs.readdirSync(workflowsDir)
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      .map((f) => path.join(workflowsDir, f));
  }

  if (filesToValidate.length === 0) {
    console.log(colors.yellow('No workflow files found'));
    return;
  }

  console.log(`\n${colors.bold('Validating Workflows')}\n`);

  let hasErrors = false;

  for (const filePath of filesToValidate) {
    const relativePath = path.relative(repoPath, filePath);
    const content = fs.readFileSync(filePath, 'utf-8');

    const result = validateWorkflowFile(content);

    if (result.valid) {
      console.log(`${colors.green('✓')} ${relativePath}`);
    } else {
      console.log(`${colors.red('✗')} ${relativePath}`);
      hasErrors = true;

      for (const error of result.errors) {
        console.log(`  ${colors.red('-')} ${error}`);
      }
    }
  }

  console.log();

  if (hasErrors) {
    console.log(colors.red('Validation failed'));
    process.exit(1);
  } else {
    console.log(colors.green('All workflows are valid'));
  }
}

/**
 * Show recent workflow runs (requires server connection)
 */
async function handleCIRuns(_args: string[]): Promise<void> {
  console.log(colors.yellow('This command requires a connection to the wit server.'));
  console.log();
  console.log('To view workflow runs:');
  console.log('  1. Start the server: wit serve');
  console.log('  2. View runs in the web UI: http://localhost:3000/:owner/:repo/actions');
  console.log();
  console.log('Or use the API:');
  console.log(colors.dim('  curl http://localhost:3000/trpc/workflows.listRuns?input={"repoId":"..."}'));
}

/**
 * View workflow run details (requires server connection)
 */
async function handleCIView(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const runId = positional[0];

  if (!runId) {
    console.error(colors.red('error: ') + 'Run ID required');
    console.error('usage: wit ci view <run-id>');
    process.exit(1);
  }

  console.log(colors.yellow('This command requires a connection to the wit server.'));
  console.log();
  console.log('To view workflow run details:');
  console.log('  1. Start the server: wit serve');
  console.log(`  2. View in web UI: http://localhost:3000/runs/${runId}`);
  console.log();
  console.log('Or use the API:');
  console.log(colors.dim(`  curl http://localhost:3000/trpc/workflows.getRun?input={"runId":"${runId}"}`));
}
