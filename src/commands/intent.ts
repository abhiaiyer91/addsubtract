/**
 * Intent Command
 * 
 * Intent-driven development: describe what you want, and wit AI plans
 * and implements it incrementally with reviewable commits.
 * 
 * Usage:
 *   wit intent "add user authentication"
 *   wit intent status
 *   wit intent list
 *   wit intent execute <id>
 *   wit intent pause <id>
 *   wit intent cancel <id>
 */

import { TsgitError, ErrorCode } from '../core/errors';
import { Repository } from '../core/repository';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

export const INTENT_HELP = `
${colors.bold('wit intent')} - Intent-driven development

${colors.bold('Usage:')}
  wit intent "<description>"    Create a new intent from description
  wit intent status             Show status of active intent
  wit intent list               List all intents for this repo
  wit intent show <id>          Show details of an intent
  wit intent execute [<id>]     Start or resume execution
  wit intent pause [<id>]       Pause execution
  wit intent cancel <id>        Cancel an intent

${colors.bold('Description:')}
  Intent-driven development lets you describe what you want in plain English.
  The AI will:
  
  1. Analyze your codebase to understand context
  2. Create a plan with discrete steps
  3. Ask for your approval
  4. Implement each step as a separate commit
  5. Open a PR with full context
  
  Each step is reviewable and reversible.

${colors.bold('Examples:')}
  ${colors.dim('# Create a new intent')}
  wit intent "add rate limiting to API endpoints"
  
  ${colors.dim('# Check progress')}
  wit intent status
  
  ${colors.dim('# Resume execution')}
  wit intent execute
  
  ${colors.dim('# Pause to review')}
  wit intent pause

${colors.bold('Workflow:')}
  1. Create intent: ${colors.cyan('wit intent "your description"')}
  2. Review plan: AI shows proposed changes
  3. Approve: ${colors.cyan('[Y] to proceed')}
  4. Watch: AI implements step by step
  5. Review: Each commit is atomic and reviewable
  6. PR: Optionally open a PR when done
`;

interface IntentPlan {
  summary: string;
  steps: Array<{
    description: string;
    estimatedComplexity: 'low' | 'medium' | 'high';
    affectedFiles: string[];
  }>;
  totalComplexity: number;
  estimatedTime: string;
  affectedFiles: string[];
}

/**
 * Create a new intent
 */
async function createIntent(description: string): Promise<void> {
  console.log(colors.bold('Creating intent...'));
  console.log();
  console.log(colors.cyan('Description:'), description);
  console.log();

  // Check if we have a repository
  try {
    Repository.find();
  } catch {
    throw new TsgitError(
      'Not in a wit repository',
      ErrorCode.NOT_A_REPOSITORY,
      ['Run this command from within a wit repository']
    );
  }

  console.log(colors.dim('Analyzing codebase...'));
  
  // Check for AI availability
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  
  if (!hasOpenAI && !hasAnthropic) {
    console.log();
    console.log(colors.yellow('⚠ No AI API key configured'));
    console.log(colors.dim('Set OPENAI_API_KEY or ANTHROPIC_API_KEY to enable AI planning'));
    console.log();
    console.log('For now, showing a mock plan:');
    console.log();
  }

  // Generate a plan (in a real implementation, this would call the AI)
  const mockPlan: IntentPlan = generateMockPlan(description);
  
  // Display the plan
  displayPlan(description, mockPlan);
  
  // Ask for confirmation
  console.log();
  console.log(colors.bold('Next steps:'));
  console.log(colors.dim('  [Y] Approve and start execution'));
  console.log(colors.dim('  [E] Edit the plan'));
  console.log(colors.dim('  [N] Cancel'));
  console.log();
  console.log(colors.dim('To execute this intent, run:'));
  console.log(colors.cyan('  wit intent execute'));
  console.log();
  console.log(colors.dim('(In the full implementation, this would be interactive)'));
}

/**
 * Generate a mock plan for demonstration
 */
function generateMockPlan(description: string): IntentPlan {
  // Parse the description to generate reasonable steps
  const lowerDesc = description.toLowerCase();
  
  const steps: IntentPlan['steps'] = [];
  const affectedFiles: string[] = [];
  
  if (lowerDesc.includes('rate limit')) {
    steps.push({
      description: 'Create rate limiting middleware',
      estimatedComplexity: 'medium',
      affectedFiles: ['src/middleware/rate-limit.ts'],
    });
    steps.push({
      description: 'Add rate limit configuration',
      estimatedComplexity: 'low',
      affectedFiles: ['src/config/rate-limit.ts'],
    });
    steps.push({
      description: 'Apply middleware to API routes',
      estimatedComplexity: 'low',
      affectedFiles: ['src/server/routes/index.ts'],
    });
    steps.push({
      description: 'Add tests for rate limiting',
      estimatedComplexity: 'medium',
      affectedFiles: ['src/__tests__/rate-limit.test.ts'],
    });
    affectedFiles.push(
      'src/middleware/rate-limit.ts',
      'src/config/rate-limit.ts',
      'src/server/routes/index.ts',
      'src/__tests__/rate-limit.test.ts'
    );
  } else if (lowerDesc.includes('auth') || lowerDesc.includes('login')) {
    steps.push({
      description: 'Create authentication service',
      estimatedComplexity: 'high',
      affectedFiles: ['src/services/auth.ts'],
    });
    steps.push({
      description: 'Add auth middleware',
      estimatedComplexity: 'medium',
      affectedFiles: ['src/middleware/auth.ts'],
    });
    steps.push({
      description: 'Create login endpoint',
      estimatedComplexity: 'medium',
      affectedFiles: ['src/routes/auth.ts'],
    });
    steps.push({
      description: 'Add auth tests',
      estimatedComplexity: 'medium',
      affectedFiles: ['src/__tests__/auth.test.ts'],
    });
    affectedFiles.push(
      'src/services/auth.ts',
      'src/middleware/auth.ts',
      'src/routes/auth.ts',
      'src/__tests__/auth.test.ts'
    );
  } else {
    // Generic steps
    steps.push({
      description: `Analyze requirements for: ${description}`,
      estimatedComplexity: 'low',
      affectedFiles: [],
    });
    steps.push({
      description: 'Implement core functionality',
      estimatedComplexity: 'medium',
      affectedFiles: ['src/features/new-feature.ts'],
    });
    steps.push({
      description: 'Add integration',
      estimatedComplexity: 'low',
      affectedFiles: ['src/index.ts'],
    });
    steps.push({
      description: 'Add tests',
      estimatedComplexity: 'medium',
      affectedFiles: ['src/__tests__/new-feature.test.ts'],
    });
    affectedFiles.push(
      'src/features/new-feature.ts',
      'src/index.ts',
      'src/__tests__/new-feature.test.ts'
    );
  }
  
  const complexityMap = { low: 1, medium: 2, high: 3 };
  const totalComplexity = steps.reduce(
    (sum, step) => sum + complexityMap[step.estimatedComplexity],
    0
  );
  
  return {
    summary: `This will implement "${description}" by making ${steps.length} changes across ${affectedFiles.length} files.`,
    steps,
    totalComplexity: Math.min(10, Math.round(totalComplexity / steps.length * 3)),
    estimatedTime: totalComplexity <= 4 ? '~5 minutes' : totalComplexity <= 8 ? '~15 minutes' : '~30 minutes',
    affectedFiles,
  };
}

/**
 * Display a plan
 */
function displayPlan(description: string, plan: IntentPlan): void {
  console.log();
  console.log(colors.bold('═══════════════════════════════════════════════════════'));
  console.log(colors.bold('  AI Plan for: ') + colors.cyan(description));
  console.log(colors.bold('═══════════════════════════════════════════════════════'));
  console.log();
  console.log(colors.dim(plan.summary));
  console.log();
  
  console.log(colors.bold('Proposed Steps:'));
  console.log();
  
  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const complexityColors = {
      low: colors.green,
      medium: colors.yellow,
      high: colors.red,
    };
    const complexityColor = complexityColors[step.estimatedComplexity];
    
    console.log(`  ${colors.cyan((i + 1).toString())}. ${step.description}`);
    console.log(`     ${complexityColor(`[${step.estimatedComplexity}]`)} ${colors.dim(step.affectedFiles.join(', ') || 'analysis only')}`);
  }
  
  console.log();
  console.log(colors.bold('Summary:'));
  console.log(`  ${colors.dim('Complexity:')} ${getComplexityBar(plan.totalComplexity)} ${plan.totalComplexity}/10`);
  console.log(`  ${colors.dim('Estimated time:')} ${plan.estimatedTime}`);
  console.log(`  ${colors.dim('Files affected:')} ${plan.affectedFiles.length}`);
}

/**
 * Generate a visual complexity bar
 */
function getComplexityBar(complexity: number): string {
  const filled = '█'.repeat(complexity);
  const empty = '░'.repeat(10 - complexity);
  
  if (complexity <= 3) {
    return colors.green(filled) + colors.dim(empty);
  } else if (complexity <= 6) {
    return colors.yellow(filled) + colors.dim(empty);
  } else {
    return colors.red(filled) + colors.dim(empty);
  }
}

/**
 * Show status of active intent
 */
async function showStatus(): Promise<void> {
  console.log(colors.bold('Intent Status'));
  console.log();
  console.log(colors.dim('No active intent.'));
  console.log();
  console.log('Create one with:');
  console.log(colors.cyan('  wit intent "describe what you want to build"'));
}

/**
 * List all intents
 */
async function listIntents(): Promise<void> {
  console.log(colors.bold('Development Intents'));
  console.log();
  console.log(colors.dim('No intents found for this repository.'));
  console.log();
  console.log('Create one with:');
  console.log(colors.cyan('  wit intent "describe what you want to build"'));
}

/**
 * Show details of a specific intent
 */
async function showIntent(id: string): Promise<void> {
  console.log(colors.bold(`Intent: ${id}`));
  console.log();
  console.log(colors.dim('Intent not found.'));
}

/**
 * Execute an intent
 */
async function executeIntent(id?: string): Promise<void> {
  console.log(colors.bold('Execute Intent'));
  console.log();
  if (id) {
    console.log(colors.dim(`Intent ${id} not found.`));
  } else {
    console.log(colors.dim('No active intent to execute.'));
    console.log();
    console.log('Create one with:');
    console.log(colors.cyan('  wit intent "describe what you want to build"'));
  }
}

/**
 * Pause an intent
 */
async function pauseIntent(id?: string): Promise<void> {
  console.log(colors.bold('Pause Intent'));
  console.log();
  console.log(colors.dim('No intent is currently executing.'));
}

/**
 * Cancel an intent
 */
async function cancelIntent(id: string): Promise<void> {
  console.log(colors.bold('Cancel Intent'));
  console.log();
  console.log(colors.dim(`Intent ${id} not found.`));
}

/**
 * CLI handler for intent command
 */
export async function handleIntent(args: string[]): Promise<void> {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(INTENT_HELP);
    return;
  }

  const subcommand = args[0];

  try {
    switch (subcommand) {
      case 'status':
        await showStatus();
        break;
        
      case 'list':
        await listIntents();
        break;
        
      case 'show':
        if (!args[1]) {
          console.error(colors.red('error: ') + 'Intent ID required');
          console.error(colors.dim('Usage: wit intent show <id>'));
          process.exit(1);
        }
        await showIntent(args[1]);
        break;
        
      case 'execute':
        await executeIntent(args[1]);
        break;
        
      case 'pause':
        await pauseIntent(args[1]);
        break;
        
      case 'cancel':
        if (!args[1]) {
          console.error(colors.red('error: ') + 'Intent ID required');
          console.error(colors.dim('Usage: wit intent cancel <id>'));
          process.exit(1);
        }
        await cancelIntent(args[1]);
        break;
        
      default:
        // Treat as a description for a new intent
        const description = args.join(' ');
        await createIntent(description);
        break;
    }
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(colors.red('error: ') + error.message);
    }
    process.exit(1);
  }
}
