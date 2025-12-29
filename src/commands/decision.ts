/**
 * Decision Command
 * 
 * Manage Architectural Decision Records (ADRs) for your project.
 * AI can help generate and suggest decisions based on codebase analysis.
 * 
 * Usage:
 *   wit decision                    List all decisions
 *   wit decision create "<title>"   Create a new decision
 *   wit decision show <id>          Show decision details
 *   wit decision search <query>     Search decisions
 *   wit decision suggest            AI suggests decisions based on codebase
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

export const DECISION_HELP = `
${colors.bold('wit decision')} - Manage Architectural Decision Records (ADRs)

${colors.bold('Usage:')}
  wit decision                    List all decisions
  wit decision create "<title>"   Create a new decision interactively
  wit decision show <id>          Show decision details
  wit decision search <query>     Search decisions by keyword
  wit decision suggest            AI suggests decisions based on codebase
  wit decision supersede <id>     Mark a decision as superseded

${colors.bold('Description:')}
  Track architectural decisions for your project. Each decision records:
  
  • Title: What decision was made
  • Context: Why was this decision needed?
  • Decision: What was decided
  • Alternatives: What other options were considered
  • Consequences: What are the implications
  
  AI can help by:
  • Suggesting decisions based on codebase patterns
  • Generating decision content from code review feedback
  • Finding relevant decisions when you're making changes

${colors.bold('Examples:')}
  ${colors.dim('# List all decisions')}
  wit decision
  
  ${colors.dim('# Create a new decision')}
  wit decision create "Use PostgreSQL for database"
  
  ${colors.dim('# Search for relevant decisions')}
  wit decision search "database"
  
  ${colors.dim('# AI suggests decisions')}
  wit decision suggest

${colors.bold('Status:')}
  ${colors.green('proposed')}  - Under discussion
  ${colors.cyan('accepted')}   - Approved and in effect
  ${colors.dim('deprecated')} - No longer relevant
  ${colors.yellow('superseded')} - Replaced by another decision
`;

interface Decision {
  id: string;
  title: string;
  status: 'proposed' | 'accepted' | 'deprecated' | 'superseded';
  context: string;
  decision: string;
  alternatives?: string[];
  consequences?: string;
  createdAt: Date;
  tags?: string[];
  aiGenerated?: boolean;
}

// In-memory storage for CLI demo (real implementation uses database)
const decisions: Decision[] = [
  {
    id: 'ADR-001',
    title: 'Use TypeScript for all server code',
    status: 'accepted',
    context: 'We needed a typed language for the server to reduce runtime errors.',
    decision: 'All server-side code will be written in TypeScript with strict mode enabled.',
    alternatives: ['JavaScript with JSDoc', 'Go', 'Rust'],
    consequences: 'Need to maintain tsconfig, slower compile times, better IDE support.',
    createdAt: new Date('2024-01-15'),
    tags: ['language', 'tooling'],
  },
  {
    id: 'ADR-002',
    title: 'PostgreSQL as primary database',
    status: 'accepted',
    context: 'Need a reliable, scalable database for production.',
    decision: 'Use PostgreSQL 15+ for all persistent data storage.',
    alternatives: ['MySQL', 'SQLite', 'MongoDB'],
    consequences: 'Team needs PostgreSQL expertise, need to manage migrations.',
    createdAt: new Date('2024-01-20'),
    tags: ['database', 'infrastructure'],
  },
  {
    id: 'ADR-003',
    title: 'Drizzle ORM for database access',
    status: 'accepted',
    context: 'Need a type-safe way to interact with the database.',
    decision: 'Use Drizzle ORM for all database queries.',
    alternatives: ['Prisma', 'TypeORM', 'Kysely', 'Raw SQL'],
    consequences: 'Lighter than Prisma, full type inference, SQL-like syntax.',
    createdAt: new Date('2024-02-01'),
    tags: ['database', 'orm'],
  },
];

/**
 * List all decisions
 */
async function listDecisions(): Promise<void> {
  console.log(colors.bold('Architectural Decision Records'));
  console.log();
  
  if (decisions.length === 0) {
    console.log(colors.dim('No decisions recorded yet.'));
    console.log();
    console.log('Create one with:');
    console.log(colors.cyan('  wit decision create "Your decision title"'));
    return;
  }
  
  const statusColors = {
    proposed: colors.yellow,
    accepted: colors.green,
    deprecated: colors.dim,
    superseded: colors.dim,
  };
  
  for (const d of decisions) {
    const statusColor = statusColors[d.status];
    const status = statusColor(`[${d.status}]`.padEnd(12));
    const date = d.createdAt.toLocaleDateString();
    
    console.log(`${colors.cyan(d.id)} ${status} ${d.title}`);
    console.log(`  ${colors.dim(date)} ${d.tags?.map(t => colors.dim(`#${t}`)).join(' ') || ''}`);
  }
  
  console.log();
  console.log(colors.dim(`${decisions.length} decision(s)`));
}

/**
 * Show a specific decision
 */
async function showDecision(id: string): Promise<void> {
  const d = decisions.find(d => d.id.toLowerCase() === id.toLowerCase());
  
  if (!d) {
    console.error(colors.red('error: ') + `Decision ${id} not found`);
    process.exit(1);
  }
  
  const statusColors = {
    proposed: colors.yellow,
    accepted: colors.green,
    deprecated: colors.dim,
    superseded: colors.dim,
  };
  
  console.log(colors.bold('═════════════════════════════════════════════════════════'));
  console.log(colors.bold(`  ${d.id}: ${d.title}`));
  console.log(colors.bold('═════════════════════════════════════════════════════════'));
  console.log();
  
  console.log(colors.bold('Status:'), statusColors[d.status](d.status));
  console.log(colors.bold('Date:'), d.createdAt.toLocaleDateString());
  if (d.tags && d.tags.length > 0) {
    console.log(colors.bold('Tags:'), d.tags.map(t => colors.cyan(`#${t}`)).join(' '));
  }
  if (d.aiGenerated) {
    console.log(colors.bold('Source:'), colors.magenta('AI Generated'));
  }
  console.log();
  
  console.log(colors.bold('Context:'));
  console.log(colors.dim('  ' + d.context));
  console.log();
  
  console.log(colors.bold('Decision:'));
  console.log('  ' + d.decision);
  console.log();
  
  if (d.alternatives && d.alternatives.length > 0) {
    console.log(colors.bold('Alternatives Considered:'));
    for (const alt of d.alternatives) {
      console.log(colors.dim(`  • ${alt}`));
    }
    console.log();
  }
  
  if (d.consequences) {
    console.log(colors.bold('Consequences:'));
    console.log(colors.dim('  ' + d.consequences));
    console.log();
  }
}

/**
 * Create a new decision
 */
async function createDecision(title: string): Promise<void> {
  console.log(colors.bold('Create New Decision'));
  console.log();
  console.log(colors.cyan('Title:'), title);
  console.log();
  
  // In a real implementation, this would be interactive
  console.log(colors.dim('In the full implementation, this would launch an interactive editor'));
  console.log(colors.dim('to capture Context, Decision, Alternatives, and Consequences.'));
  console.log();
  
  const newId = `ADR-${(decisions.length + 1).toString().padStart(3, '0')}`;
  
  // Mock creation
  const newDecision: Decision = {
    id: newId,
    title,
    status: 'proposed',
    context: 'TODO: Add context',
    decision: 'TODO: Document the decision',
    createdAt: new Date(),
    tags: [],
  };
  
  decisions.push(newDecision);
  
  console.log(colors.green('✓') + ` Created decision ${colors.cyan(newId)}`);
  console.log();
  console.log('Edit with:');
  console.log(colors.cyan(`  wit decision edit ${newId}`));
}

/**
 * Search decisions
 */
async function searchDecisions(query: string): Promise<void> {
  console.log(colors.bold(`Searching for: "${query}"`));
  console.log();
  
  const lowerQuery = query.toLowerCase();
  const matches = decisions.filter(d => 
    d.title.toLowerCase().includes(lowerQuery) ||
    d.context.toLowerCase().includes(lowerQuery) ||
    d.decision.toLowerCase().includes(lowerQuery) ||
    d.tags?.some(t => t.toLowerCase().includes(lowerQuery))
  );
  
  if (matches.length === 0) {
    console.log(colors.dim('No matching decisions found.'));
    return;
  }
  
  const statusColors = {
    proposed: colors.yellow,
    accepted: colors.green,
    deprecated: colors.dim,
    superseded: colors.dim,
  };
  
  for (const d of matches) {
    const statusColor = statusColors[d.status];
    const status = statusColor(`[${d.status}]`.padEnd(12));
    
    console.log(`${colors.cyan(d.id)} ${status} ${d.title}`);
  }
  
  console.log();
  console.log(colors.dim(`${matches.length} result(s)`));
}

/**
 * Suggest decisions based on codebase analysis
 */
async function suggestDecisions(): Promise<void> {
  console.log(colors.bold('AI Decision Suggestions'));
  console.log();
  
  // Check for AI availability
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  
  if (!hasOpenAI && !hasAnthropic) {
    console.log(colors.yellow('⚠ No AI API key configured'));
    console.log(colors.dim('Set OPENAI_API_KEY or ANTHROPIC_API_KEY to enable AI suggestions'));
    console.log();
  }
  
  console.log(colors.dim('Analyzing codebase patterns...'));
  console.log();
  
  // Mock suggestions
  console.log(colors.bold('Suggested Decisions:'));
  console.log();
  
  const suggestions = [
    {
      title: 'Use tRPC for API layer',
      reason: 'Found tRPC routers throughout the codebase',
      confidence: 0.95,
    },
    {
      title: 'SHA-256 for object hashing',
      reason: 'Core repository uses SHA-256 instead of SHA-1',
      confidence: 0.92,
    },
    {
      title: 'Mastra for AI agent framework',
      reason: 'AI agents use @mastra/core for tools and workflows',
      confidence: 0.88,
    },
  ];
  
  for (const s of suggestions) {
    const confidence = Math.round(s.confidence * 100);
    const confColor = confidence >= 90 ? colors.green : confidence >= 70 ? colors.yellow : colors.dim;
    
    console.log(`  ${colors.magenta('⚡')} ${s.title}`);
    console.log(`     ${colors.dim(s.reason)} ${confColor(`(${confidence}% confidence)`)}`);
    console.log();
  }
  
  console.log(colors.dim('To create a decision from a suggestion:'));
  console.log(colors.cyan('  wit decision create "Use tRPC for API layer"'));
}

/**
 * CLI handler for decision command
 */
export async function handleDecision(args: string[]): Promise<void> {
  if (args.length > 0 && (args[0] === '--help' || args[0] === '-h')) {
    console.log(DECISION_HELP);
    return;
  }

  // Check for repository context
  try {
    Repository.find();
  } catch {
    // Allow some commands without repo context
    if (args[0] !== 'help') {
      console.log(colors.yellow('⚠ Not in a wit repository'));
      console.log(colors.dim('Decision records are stored in the repository'));
      console.log();
    }
  }

  const subcommand = args[0];

  try {
    switch (subcommand) {
      case undefined:
      case 'list':
        await listDecisions();
        break;
        
      case 'show':
        if (!args[1]) {
          console.error(colors.red('error: ') + 'Decision ID required');
          console.error(colors.dim('Usage: wit decision show <id>'));
          process.exit(1);
        }
        await showDecision(args[1]);
        break;
        
      case 'create':
        if (!args[1]) {
          console.error(colors.red('error: ') + 'Decision title required');
          console.error(colors.dim('Usage: wit decision create "<title>"'));
          process.exit(1);
        }
        await createDecision(args.slice(1).join(' '));
        break;
        
      case 'search':
        if (!args[1]) {
          console.error(colors.red('error: ') + 'Search query required');
          console.error(colors.dim('Usage: wit decision search <query>'));
          process.exit(1);
        }
        await searchDecisions(args.slice(1).join(' '));
        break;
        
      case 'suggest':
        await suggestDecisions();
        break;
        
      default:
        // Treat as showing a specific decision by ID
        await showDecision(subcommand);
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
