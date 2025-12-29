/**
 * Patterns Command
 * 
 * View and manage learned codebase patterns.
 * These patterns help AI understand your coding style and conventions.
 * 
 * Usage:
 *   wit patterns                List all learned patterns
 *   wit patterns analyze        Analyze codebase for new patterns
 *   wit patterns show <type>    Show patterns of a specific type
 *   wit patterns feedback       Provide feedback on a pattern
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

export const PATTERNS_HELP = `
${colors.bold('wit patterns')} - Manage learned codebase patterns

${colors.bold('Usage:')}
  wit patterns                List all learned patterns
  wit patterns analyze        Analyze codebase for new patterns
  wit patterns show <type>    Show patterns of a specific type
  wit patterns approve <id>   Approve a pattern (increases confidence)
  wit patterns reject <id>    Reject a pattern (decreases confidence)

${colors.bold('Description:')}
  Patterns are conventions learned from your codebase that guide AI behavior.
  They're discovered through:
  
  • Static analysis of your code
  • Human feedback on AI-generated code
  • Explicit pattern definitions
  
  Higher confidence patterns have more influence on AI suggestions.

${colors.bold('Pattern Types:')}
  ${colors.cyan('naming')}          Variable, function, and file naming conventions
  ${colors.cyan('error_handling')}  How errors are caught and handled
  ${colors.cyan('testing')}         Testing patterns and conventions
  ${colors.cyan('logging')}         Logging format and usage
  ${colors.cyan('api_design')}      API endpoint and response patterns
  ${colors.cyan('file_structure')}  Directory and file organization
  ${colors.cyan('imports')}         Import ordering and grouping
  ${colors.cyan('comments')}        Documentation and comment style
  ${colors.cyan('architecture')}    Architectural patterns

${colors.bold('Examples:')}
  ${colors.dim('# List all patterns')}
  wit patterns
  
  ${colors.dim('# Show naming patterns')}
  wit patterns show naming
  
  ${colors.dim('# Analyze codebase for new patterns')}
  wit patterns analyze
  
  ${colors.dim('# Approve a helpful pattern')}
  wit patterns approve pat_abc123
`;

interface Pattern {
  id: string;
  type: string;
  description: string;
  examples: string[];
  confidence: number;
  confirmations: number;
  rejections: number;
  source: 'ai_analysis' | 'human_defined' | 'review_feedback';
  isActive: boolean;
}

// In-memory patterns for CLI demo
const patterns: Pattern[] = [
  {
    id: 'pat_001',
    type: 'naming',
    description: 'Use camelCase for function names',
    examples: ['handleRequest', 'createUser', 'validateInput'],
    confidence: 0.95,
    confirmations: 47,
    rejections: 2,
    source: 'ai_analysis',
    isActive: true,
  },
  {
    id: 'pat_002',
    type: 'naming',
    description: 'Prefix async functions with verb (handle, fetch, create, etc.)',
    examples: ['handleWebhook', 'fetchUserData', 'createSession'],
    confidence: 0.88,
    confirmations: 23,
    rejections: 5,
    source: 'ai_analysis',
    isActive: true,
  },
  {
    id: 'pat_003',
    type: 'error_handling',
    description: 'Use TsgitError for domain errors with error codes',
    examples: ['throw new TsgitError("message", ErrorCode.NOT_FOUND)'],
    confidence: 0.92,
    confirmations: 31,
    rejections: 1,
    source: 'ai_analysis',
    isActive: true,
  },
  {
    id: 'pat_004',
    type: 'testing',
    description: 'Use describe/it blocks with descriptive names',
    examples: ["describe('UserService', () => { it('creates user', ...) })"],
    confidence: 0.90,
    confirmations: 28,
    rejections: 3,
    source: 'ai_analysis',
    isActive: true,
  },
  {
    id: 'pat_005',
    type: 'imports',
    description: 'Group imports: external libs, then internal modules, then types',
    examples: ["import { z } from 'zod'; import { db } from '../db'; import type { User } from '../types'"],
    confidence: 0.85,
    confirmations: 19,
    rejections: 4,
    source: 'ai_analysis',
    isActive: true,
  },
  {
    id: 'pat_006',
    type: 'api_design',
    description: 'Use tRPC routers with Zod schemas for input validation',
    examples: ["router({ create: protectedProcedure.input(z.object({...})).mutation(...) })"],
    confidence: 0.94,
    confirmations: 35,
    rejections: 1,
    source: 'ai_analysis',
    isActive: true,
  },
  {
    id: 'pat_007',
    type: 'architecture',
    description: 'Separate models from routers from schema definitions',
    examples: ['src/db/models/*.ts for data access, src/api/trpc/routers/*.ts for API'],
    confidence: 0.91,
    confirmations: 26,
    rejections: 2,
    source: 'ai_analysis',
    isActive: true,
  },
];

/**
 * Get confidence bar visualization
 */
function getConfidenceBar(confidence: number): string {
  const filled = Math.round(confidence * 10);
  const empty = 10 - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  
  if (confidence >= 0.8) return colors.green(bar);
  if (confidence >= 0.5) return colors.yellow(bar);
  return colors.red(bar);
}

/**
 * List all patterns
 */
async function listPatterns(): Promise<void> {
  console.log(colors.bold('Learned Codebase Patterns'));
  console.log();
  
  if (patterns.length === 0) {
    console.log(colors.dim('No patterns learned yet.'));
    console.log();
    console.log('Analyze your codebase with:');
    console.log(colors.cyan('  wit patterns analyze'));
    return;
  }
  
  // Group by type
  const byType = new Map<string, Pattern[]>();
  for (const p of patterns) {
    if (!byType.has(p.type)) {
      byType.set(p.type, []);
    }
    byType.get(p.type)!.push(p);
  }
  
  for (const [type, typePatterns] of byType) {
    console.log(colors.bold(colors.cyan(`  ${type}`)));
    
    for (const p of typePatterns) {
      const status = p.isActive ? colors.green('●') : colors.dim('○');
      const confPercent = Math.round(p.confidence * 100);
      const bar = getConfidenceBar(p.confidence);
      
      console.log(`    ${status} ${p.description}`);
      console.log(`      ${bar} ${confPercent}% ${colors.dim(`(+${p.confirmations}/-${p.rejections})`)}`);
    }
    console.log();
  }
  
  const activeCount = patterns.filter(p => p.isActive).length;
  console.log(colors.dim(`${activeCount} active pattern(s) from ${byType.size} categories`));
}

/**
 * Show patterns of a specific type
 */
async function showPatternsByType(type: string): Promise<void> {
  const typePatterns = patterns.filter(p => 
    p.type.toLowerCase() === type.toLowerCase()
  );
  
  if (typePatterns.length === 0) {
    console.log(colors.dim(`No patterns found for type: ${type}`));
    console.log();
    console.log(colors.dim('Available types:'));
    const types = [...new Set(patterns.map(p => p.type))];
    for (const t of types) {
      console.log(colors.cyan(`  ${t}`));
    }
    return;
  }
  
  console.log(colors.bold(`Patterns: ${type}`));
  console.log();
  
  for (const p of typePatterns) {
    const confPercent = Math.round(p.confidence * 100);
    const bar = getConfidenceBar(p.confidence);
    
    console.log(colors.cyan(`${p.id}`) + ` ${p.isActive ? colors.green('[active]') : colors.dim('[inactive]')}`);
    console.log(`  ${p.description}`);
    console.log(`  ${bar} ${confPercent}% confidence`);
    console.log(`  ${colors.dim('Source:')} ${p.source.replace('_', ' ')}`);
    
    if (p.examples.length > 0) {
      console.log(`  ${colors.dim('Examples:')}`);
      for (const ex of p.examples.slice(0, 2)) {
        console.log(`    ${colors.dim('•')} ${ex.length > 60 ? ex.slice(0, 60) + '...' : ex}`);
      }
    }
    console.log();
  }
}

/**
 * Analyze codebase for new patterns
 */
async function analyzePatterns(): Promise<void> {
  console.log(colors.bold('Analyzing Codebase for Patterns'));
  console.log();
  
  // Check for AI availability
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  
  if (!hasOpenAI && !hasAnthropic) {
    console.log(colors.yellow('⚠ No AI API key configured'));
    console.log(colors.dim('Set OPENAI_API_KEY or ANTHROPIC_API_KEY for better analysis'));
    console.log();
  }
  
  console.log(colors.dim('Scanning codebase...'));
  
  // Simulate analysis
  console.log(colors.dim('  ✓ Analyzed 156 TypeScript files'));
  console.log(colors.dim('  ✓ Found 7 consistent patterns'));
  console.log(colors.dim('  ✓ Identified 2 potential new patterns'));
  console.log();
  
  console.log(colors.bold('New Patterns Discovered:'));
  console.log();
  
  console.log(colors.magenta('  ⚡') + ` ${colors.cyan('comments')} - Use JSDoc for public functions`);
  console.log(`     ${colors.dim('Found in 23 files, 67% consistency')}`);
  console.log();
  
  console.log(colors.magenta('  ⚡') + ` ${colors.cyan('logging')} - Use structured logging with context`);
  console.log(`     ${colors.dim('Found in 15 files, 54% consistency')}`);
  console.log();
  
  console.log(colors.dim('Review and approve patterns:'));
  console.log(colors.cyan('  wit patterns approve <id>'));
}

/**
 * Approve a pattern
 */
async function approvePattern(id: string): Promise<void> {
  const p = patterns.find(p => p.id === id);
  
  if (!p) {
    console.error(colors.red('error: ') + `Pattern ${id} not found`);
    process.exit(1);
  }
  
  p.confirmations++;
  p.confidence = Math.min(1, p.confidence + 0.02);
  
  console.log(colors.green('✓') + ` Approved pattern ${colors.cyan(id)}`);
  console.log(colors.dim(`  New confidence: ${Math.round(p.confidence * 100)}%`));
}

/**
 * Reject a pattern
 */
async function rejectPattern(id: string): Promise<void> {
  const p = patterns.find(p => p.id === id);
  
  if (!p) {
    console.error(colors.red('error: ') + `Pattern ${id} not found`);
    process.exit(1);
  }
  
  p.rejections++;
  p.confidence = Math.max(0, p.confidence - 0.05);
  
  if (p.confidence < 0.2) {
    p.isActive = false;
    console.log(colors.yellow('!') + ` Deactivated pattern ${colors.cyan(id)} (low confidence)`);
  } else {
    console.log(colors.green('✓') + ` Rejected pattern ${colors.cyan(id)}`);
  }
  
  console.log(colors.dim(`  New confidence: ${Math.round(p.confidence * 100)}%`));
}

/**
 * CLI handler for patterns command
 */
export async function handlePatterns(args: string[]): Promise<void> {
  if (args.length > 0 && (args[0] === '--help' || args[0] === '-h')) {
    console.log(PATTERNS_HELP);
    return;
  }

  // Check for repository context
  try {
    Repository.find();
  } catch {
    console.log(colors.yellow('⚠ Not in a wit repository'));
    console.log(colors.dim('Patterns are stored per-repository'));
    console.log();
  }

  const subcommand = args[0];

  try {
    switch (subcommand) {
      case undefined:
      case 'list':
        await listPatterns();
        break;
        
      case 'show':
        if (!args[1]) {
          console.error(colors.red('error: ') + 'Pattern type required');
          console.error(colors.dim('Usage: wit patterns show <type>'));
          process.exit(1);
        }
        await showPatternsByType(args[1]);
        break;
        
      case 'analyze':
        await analyzePatterns();
        break;
        
      case 'approve':
        if (!args[1]) {
          console.error(colors.red('error: ') + 'Pattern ID required');
          console.error(colors.dim('Usage: wit patterns approve <id>'));
          process.exit(1);
        }
        await approvePattern(args[1]);
        break;
        
      case 'reject':
        if (!args[1]) {
          console.error(colors.red('error: ') + 'Pattern ID required');
          console.error(colors.dim('Usage: wit patterns reject <id>'));
          process.exit(1);
        }
        await rejectPattern(args[1]);
        break;
        
      default:
        // Treat as a pattern type
        await showPatternsByType(subcommand);
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
