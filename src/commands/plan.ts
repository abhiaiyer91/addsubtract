/**
 * Multi-Agent Planning Command
 * 
 * Provides a CLI interface for the multi-agent planning workflow.
 * Breaks down complex coding tasks into subtasks and executes them
 * in parallel using specialized AI agents.
 */

import { isAIAvailable, getAIInfo } from '../ai/mastra.js';
import { runMultiAgentPlanningWorkflow, streamMultiAgentPlanningWorkflow } from '../ai/mastra.js';
import { Repository } from '../core/repository.js';
import type { MultiAgentPlanningInput } from '../ai/workflows/multi-agent-planning.workflow.js';

/**
 * Handle the `wit plan` command
 */
export async function handlePlan(args: string[]): Promise<void> {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printPlanHelp();
    return;
  }

  // Check for AI availability
  if (!isAIAvailable()) {
    console.error('AI features require an API key.');
    console.error('Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable.');
    process.exit(1);
  }

  // Parse arguments
  const options = parseArgs(args);

  if (options.subcommand === 'status') {
    printPlanStatus();
    return;
  }

  // Default subcommand is 'run'
  if (options.subcommand === 'run' || !options.subcommand) {
    await runPlanWorkflow(options);
    return;
  }

  console.error(`Unknown subcommand: ${options.subcommand}`);
  printPlanHelp();
  process.exit(1);
}

interface PlanOptions {
  subcommand?: string;
  task: string;
  context?: string;
  maxIterations: number;
  maxParallelTasks: number;
  dryRun: boolean;
  verbose: boolean;
  stream: boolean;
  createBranch: boolean;
  branchName?: string;
  autoCommit: boolean;
  json: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): PlanOptions {
  const options: PlanOptions = {
    task: '',
    maxIterations: 3,
    maxParallelTasks: 5,
    dryRun: false,
    verbose: false,
    stream: true,
    createBranch: true,
    autoCommit: true,
    json: false,
  };

  let i = 0;
  const taskParts: string[] = [];

  while (i < args.length) {
    const arg = args[i];

    if (arg === 'run' || arg === 'status') {
      options.subcommand = arg;
    } else if (arg === '--dry-run' || arg === '-n') {
      options.dryRun = true;
    } else if (arg === '--verbose' || arg === '-v') {
      options.verbose = true;
    } else if (arg === '--no-stream') {
      options.stream = false;
    } else if (arg === '--no-branch') {
      options.createBranch = false;
    } else if (arg === '--no-commit') {
      options.autoCommit = false;
    } else if (arg === '--json') {
      options.json = true;
      options.stream = false;
    } else if (arg === '--max-iterations' || arg === '-i') {
      i++;
      options.maxIterations = parseInt(args[i], 10) || 3;
    } else if (arg === '--max-parallel' || arg === '-p') {
      i++;
      options.maxParallelTasks = parseInt(args[i], 10) || 5;
    } else if (arg === '--branch' || arg === '-b') {
      i++;
      options.branchName = args[i];
    } else if (arg === '--context' || arg === '-c') {
      i++;
      options.context = args[i];
    } else if (!arg.startsWith('-')) {
      taskParts.push(arg);
    }

    i++;
  }

  options.task = taskParts.join(' ');

  return options;
}

/**
 * Run the planning workflow
 */
async function runPlanWorkflow(options: PlanOptions): Promise<void> {
  if (!options.task) {
    console.error('Please provide a task description.');
    console.error('Example: wit plan "Add a new user authentication feature"');
    process.exit(1);
  }

  // Find the repository
  let repo: Repository;
  try {
    repo = Repository.find();
  } catch {
    console.error('Not in a wit repository.');
    process.exit(1);
  }

  const repoPath = repo.workDir;
  const owner = 'local';
  const repoName = repoPath.split('/').pop() || 'repo';
  const repoId = `local-${repoName}`;
  const userId = 'cli-user';

  const input: MultiAgentPlanningInput = {
    repoId,
    repoPath,
    owner,
    repoName,
    userId,
    task: options.task,
    context: options.context,
    maxIterations: options.maxIterations,
    maxParallelTasks: options.maxParallelTasks,
    dryRun: options.dryRun,
    verbose: options.verbose,
    createBranch: options.createBranch,
    branchName: options.branchName,
    autoCommit: options.autoCommit,
  };

  if (options.dryRun) {
    console.log('\n[DRY RUN] Planning workflow will preview without executing changes.\n');
  }

  if (!options.json) {
    console.log('\n🤖 Multi-Agent Planning Workflow\n');
    console.log(`Task: ${options.task}`);
    if (options.context) {
      console.log(`Context: ${options.context}`);
    }
    console.log(`Max iterations: ${options.maxIterations}`);
    console.log(`Max parallel tasks: ${options.maxParallelTasks}`);
    console.log('');
  }

  try {
    if (options.stream && !options.json) {
      // Stream the workflow execution
      console.log('Starting workflow...\n');
      console.log('─'.repeat(60));

      // step tracking via eventData.stepId

      for await (const event of streamMultiAgentPlanningWorkflow(input)) {
        if (options.verbose) {
          console.log('Event:', JSON.stringify(event, null, 2));
        }

        // Handle different event types
        const eventData = event as any;
        if (eventData.type === 'step-start') {
          console.log(`\n📍 Step: ${eventData.stepId}`);
        } else if (eventData.type === 'step-complete') {
          console.log(`   ✅ Completed: ${eventData.stepId}`);
        } else if (eventData.type === 'step-error') {
          console.log(`   ❌ Failed: ${eventData.stepId} - ${eventData.error}`);
        }
      }

      console.log('─'.repeat(60));
      console.log('\nWorkflow completed. Run with --json for full results.');
    } else {
      // Run without streaming
      const result = await runMultiAgentPlanningWorkflow(input);

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printResults(result);
      }
    }
  } catch (error) {
    if (options.json) {
      console.log(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, null, 2));
    } else {
      console.error('\nError:', error instanceof Error ? error.message : 'Unknown error');
    }
    process.exit(1);
  }
}

/**
 * Print workflow results
 */
function printResults(result: any): void {
  console.log('\n' + '═'.repeat(60));
  console.log('WORKFLOW RESULTS');
  console.log('═'.repeat(60));

  console.log(`\nStatus: ${result.success ? '✅ Success' : '❌ Failed'}`);
  console.log(`Total iterations: ${result.totalIterations}`);
  console.log(`Total duration: ${(result.totalDuration / 1000).toFixed(2)}s`);

  if (result.finalPlan) {
    console.log('\n📋 Execution Plan:');
    console.log(`   Summary: ${result.finalPlan.summary}`);
    console.log(`   Groups: ${result.finalPlan.parallelGroups.length}`);
    
    for (const group of result.finalPlan.parallelGroups) {
      console.log(`\n   Group ${group.executionOrder}: ${group.name}`);
      for (const task of group.subtasks) {
        const status = task.status === 'completed' ? '✅' : 
                       task.status === 'failed' ? '❌' : 
                       task.status === 'skipped' ? '⏭️' : '⏳';
        console.log(`      ${status} ${task.title}`);
      }
    }
  }

  if (result.groupResults && result.groupResults.length > 0) {
    console.log('\n📊 Execution Results:');
    for (const group of result.groupResults) {
      console.log(`\n   Group: ${group.groupId}`);
      console.log(`   Duration: ${(group.duration / 1000).toFixed(2)}s`);
      console.log(`   All succeeded: ${group.allSucceeded ? '✅' : '❌'}`);
      
      for (const taskResult of group.subtaskResults) {
        const status = taskResult.status === 'completed' ? '✅' : 
                       taskResult.status === 'failed' ? '❌' : '⏳';
        console.log(`      ${status} ${taskResult.subtaskId}: ${taskResult.result || taskResult.error || 'No result'}`);
      }
    }
  }

  if (result.review) {
    console.log('\n📝 Review Summary:');
    console.log(`   Completed: ${result.review.completedTasks}`);
    console.log(`   Failed: ${result.review.failedTasks}`);
    console.log(`   Skipped: ${result.review.skippedTasks}`);
    
    if (result.review.issues && result.review.issues.length > 0) {
      console.log('\n   Issues:');
      for (const issue of result.review.issues) {
        const severity = issue.severity === 'error' ? '❌' : 
                         issue.severity === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`      ${severity} [${issue.subtaskId}] ${issue.issue}`);
      }
    }
  }

  if (result.filesModified && result.filesModified.length > 0) {
    console.log('\n📁 Files Modified:');
    for (const file of result.filesModified) {
      console.log(`   • ${file}`);
    }
  }

  if (result.branchName) {
    console.log(`\n🌿 Branch: ${result.branchName}`);
  }

  if (result.commits && result.commits.length > 0) {
    console.log('\n📝 Commits:');
    for (const commit of result.commits) {
      console.log(`   ${commit.hash.slice(0, 8)} ${commit.message}`);
    }
  }

  console.log('\n' + result.summary);
  console.log('');
}

/**
 * Print planning status
 */
function printPlanStatus(): void {
  const info = getAIInfo();

  console.log('\n🤖 Multi-Agent Planning Status\n');
  console.log(`AI Available: ${info.available ? '✅ Yes' : '❌ No'}`);
  console.log(`Model: ${info.model}`);
  console.log(`Provider: ${info.provider}`);

  if (!info.available) {
    console.log('\nTo enable planning features, set one of:');
    console.log('  export OPENAI_API_KEY=sk-...');
    console.log('  export ANTHROPIC_API_KEY=sk-ant-...');
  }

  console.log('\nWorkflow Components:');
  console.log('  • Planner Agent - Breaks down tasks into subtasks');
  console.log('  • Executor Agents - Run subtasks in parallel');
  console.log('  • Reviewer Agent - Validates results and triggers re-planning');

  console.log('\nCapabilities:');
  console.log('  • Iterative task planning');
  console.log('  • Parallel subtask execution');
  console.log('  • Automatic dependency management');
  console.log('  • Result validation and re-planning');
  console.log('  • Branch creation and auto-commit');
}

/**
 * Print help for the plan command
 */
function printPlanHelp(): void {
  console.log(`
wit plan - Multi-agent task planning and execution

Usage: wit plan <task> [options]

Commands:
  wit plan <task>             Plan and execute a complex coding task
  wit plan status             Show planning system status

Options:
  -n, --dry-run               Preview plan without executing
  -v, --verbose               Enable verbose output
  --no-stream                 Disable streaming output
  --no-branch                 Don't create a feature branch
  --no-commit                 Don't auto-commit changes
  --json                      Output results as JSON
  -i, --max-iterations <n>    Maximum planning iterations (default: 3)
  -p, --max-parallel <n>      Maximum parallel tasks (default: 5)
  -b, --branch <name>         Custom branch name
  -c, --context <text>        Additional context for planning

Examples:
  wit plan "Add user authentication with JWT"
  wit plan "Refactor the database layer to use connection pooling"
  wit plan "Add unit tests for the API endpoints" --dry-run
  wit plan "Implement dark mode" -c "Use CSS custom properties"
  wit plan "Fix all TypeScript errors" --json

Workflow:
  1. Planner Agent analyzes the task and creates an execution plan
  2. Plan is broken into parallel groups of subtasks
  3. Executor Agents run subtasks in parallel within each group
  4. Reviewer Agent validates results and may trigger re-planning
  5. Changes are committed to a feature branch

Environment:
  OPENAI_API_KEY       OpenAI API key (for GPT models)
  ANTHROPIC_API_KEY    Anthropic API key (for Claude models)
  WIT_AI_MODEL         Model to use (default: anthropic/claude-opus-4-5)
`);
}

export const PLAN_HELP = `
wit plan - Multi-agent task planning and execution

Usage: wit plan <task> [options]

Commands:
  wit plan <task>             Plan and execute a complex coding task
  wit plan status             Show planning system status

Options:
  -n, --dry-run               Preview plan without executing
  -v, --verbose               Enable verbose output
  --no-stream                 Disable streaming output
  --no-branch                 Don't create a feature branch
  --no-commit                 Don't auto-commit changes
  --json                      Output results as JSON
  -i, --max-iterations <n>    Maximum planning iterations (default: 3)
  -p, --max-parallel <n>      Maximum parallel tasks (default: 5)
  -b, --branch <name>         Custom branch name
  -c, --context <text>        Additional context for planning

Examples:
  wit plan "Add user authentication with JWT"
  wit plan "Refactor the database layer to use connection pooling"
  wit plan "Add unit tests for the API endpoints" --dry-run
  wit plan "Implement dark mode" -c "Use CSS custom properties"
  wit plan "Fix all TypeScript errors" --json

Workflow:
  1. Planner Agent analyzes the task and creates an execution plan
  2. Plan is broken into parallel groups of subtasks
  3. Executor Agents run subtasks in parallel within each group
  4. Reviewer Agent validates results and may trigger re-planning
  5. Changes are committed to a feature branch
`;

export { printPlanHelp, printPlanStatus };
