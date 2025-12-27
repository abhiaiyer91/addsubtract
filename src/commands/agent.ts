/**
 * Agent Command for wit
 * 
 * Provides an interactive coding agent that can:
 * - Read and edit files
 * - Run shell commands
 * - Create branches and PRs
 * - Understand the codebase context
 * 
 * Uses Mastra Memory with LibSQL for persistent conversation history.
 */

import * as readline from 'readline';
import * as crypto from 'crypto';
import { getTsgitAgent, isAIAvailable, getAIInfo, getMemory } from '../ai/mastra.js';
import { Repository } from '../core/repository.js';
import type { Memory } from '@mastra/memory';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

interface AgentSession {
  threadId: string;
  resourceId: string;
  repoPath: string;
  branch: string;
  messageCount: number;
  pendingChanges: Array<{
    filePath: string;
    changeType: 'create' | 'edit' | 'delete';
    description: string;
  }>;
}

/**
 * Create a MastraDBMessage with proper content format
 */
function createMessage(
  threadId: string,
  role: 'user' | 'assistant',
  text: string
): {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: { format: 2; parts: Array<{ type: 'text'; text: string }> };
  createdAt: Date;
} {
  return {
    id: crypto.randomUUID(),
    threadId,
    role,
    content: {
      format: 2,
      parts: [{ type: 'text', text }],
    },
    createdAt: new Date(),
  };
}

/**
 * Main handler for `wit agent` command
 */
export async function handleAgent(args: string[]): Promise<void> {
  const subcommand = args[0];

  switch (subcommand) {
    case 'status':
      printAgentStatus();
      return;
    case 'help':
    case '--help':
    case '-h':
      printAgentHelp();
      return;
    case 'chat':
    case undefined:
      // Default to interactive mode
      await startInteractiveSession(args.slice(subcommand === 'chat' ? 1 : 0));
      return;
    case 'ask':
    case 'run':
      // One-shot query mode
      await handleOneShot(args.slice(1));
      return;
    default:
      // Treat as one-shot query
      await handleOneShot(args);
      return;
  }
}

/**
 * One-shot query mode - ask a question and get a response
 */
async function handleOneShot(args: string[]): Promise<void> {
  const query = args.join(' ');
  
  if (!query.trim()) {
    console.error('Please provide a question or task.');
    console.error('Example: wit agent "explain the authentication flow"');
    process.exit(1);
  }

  if (!isAIAvailable()) {
    printAINotConfigured();
    process.exit(1);
  }

  // Get repo context if available
  let repoContext = '';
  try {
    const repo = Repository.find();
    const status = repo.status();
    const branch = repo.refs.getCurrentBranch() || 'HEAD';
    repoContext = `
Repository: ${repo.workDir}
Current branch: ${branch}
Staged files: ${status.staged.length}
Modified files: ${status.modified.length}
Untracked files: ${status.untracked.length}
`;
  } catch {
    // Not in a wit repo, that's okay
  }

  const agent = getTsgitAgent();
  
  console.log(`\n${colors.cyan}${colors.bold}wit agent${colors.reset}\n`);
  
  try {
    const systemContext = repoContext 
      ? `You are a coding assistant working in a wit repository.\n${repoContext}\n\nUser request:`
      : 'You are a coding assistant. User request:';
    
    const result = await agent.stream(`${systemContext}\n\n${query}`);
    
    // Stream the response
    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
    }
    console.log('\n');
  } catch (error) {
    console.error(`\n${colors.red}Error:${colors.reset}`, error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

/**
 * Start an interactive chat session with the agent
 */
async function startInteractiveSession(args: string[]): Promise<void> {
  if (!isAIAvailable()) {
    printAINotConfigured();
    process.exit(1);
  }

  // Get repo context
  let repo: Repository | null = null;
  let repoPath = '';
  let branch = '';
  
  try {
    repo = Repository.find();
    repoPath = repo.workDir;
    branch = repo.refs.getCurrentBranch() || 'HEAD';
  } catch {
    // Not in a wit repo
  }

  // Create a unique thread for this session
  const threadId = crypto.randomUUID();
  const resourceId = repoPath || 'wit-agent';
  
  // Initialize memory thread
  const memory = getMemory();
  await memory.saveThread({
    thread: {
      id: threadId,
      resourceId,
      title: `Agent session - ${new Date().toISOString()}`,
      metadata: { repoPath, branch },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  const session: AgentSession = {
    threadId,
    resourceId,
    repoPath,
    branch,
    messageCount: 0,
    pendingChanges: [],
  };

  // Print welcome banner
  printWelcomeBanner(session);

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const prompt = `${colors.green}>${colors.reset} `;
  
  const askQuestion = (): void => {
    rl.question(prompt, async (input) => {
      const trimmedInput = input.trim();
      
      // Handle special commands
      if (trimmedInput === '' || trimmedInput === 'exit' || trimmedInput === 'quit' || trimmedInput === 'q') {
        if (trimmedInput === '') {
          askQuestion();
          return;
        }
        console.log(`\n${colors.dim}Goodbye!${colors.reset}\n`);
        rl.close();
        return;
      }

      if (trimmedInput === 'clear' || trimmedInput === '/clear') {
        // Create a new thread for fresh conversation
        const newThreadId = crypto.randomUUID();
        await memory.saveThread({
          thread: {
            id: newThreadId,
            resourceId: session.resourceId,
            title: `Agent session - ${new Date().toISOString()}`,
            metadata: { repoPath: session.repoPath, branch: session.branch },
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
        session.threadId = newThreadId;
        session.messageCount = 0;
        console.log(`${colors.dim}Conversation cleared.${colors.reset}\n`);
        askQuestion();
        return;
      }

      if (trimmedInput === 'help' || trimmedInput === '/help' || trimmedInput === '?') {
        printSessionHelp();
        askQuestion();
        return;
      }

      if (trimmedInput === 'status' || trimmedInput === '/status') {
        printSessionStatus(session);
        askQuestion();
        return;
      }

      if (trimmedInput === 'history' || trimmedInput === '/history') {
        await printHistory(session, memory);
        askQuestion();
        return;
      }

      // Process the user's message
      await processUserMessage(session, trimmedInput);
      askQuestion();
    });
  };

  // Handle Ctrl+C gracefully
  rl.on('close', () => {
    process.exit(0);
  });

  // Start the conversation
  askQuestion();
}

/**
 * Process a user message and get agent response
 */
async function processUserMessage(session: AgentSession, message: string): Promise<void> {
  const agent = getTsgitAgent();
  const memory = getMemory();
  
  try {
    // Save user message to memory
    const userMessage = createMessage(session.threadId, 'user', message);
    await memory.saveMessages({
      messages: [userMessage as never], // Type cast for Mastra compatibility
    });
    session.messageCount++;

    console.log(''); // Empty line before response
    
    // Generate response with memory context
    // The agent will use the thread for context
    const result = await agent.stream(message, {
      threadId: session.threadId,
      resourceId: session.resourceId,
    });
    
    let fullResponse = '';
    
    // Stream the response
    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
      fullResponse += chunk;
    }
    
    console.log('\n'); // Empty line after response
    
    // Save assistant response to memory
    const assistantMessage = createMessage(session.threadId, 'assistant', fullResponse);
    await memory.saveMessages({
      messages: [assistantMessage as never], // Type cast for Mastra compatibility
    });
    session.messageCount++;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`\n${colors.red}Error:${colors.reset} ${errorMessage}\n`);
  }
}

/**
 * Print welcome banner
 */
function printWelcomeBanner(session: AgentSession): void {
  console.log('');
  console.log(`${colors.cyan}${colors.bold}╭─────────────────────────────────────────╮${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}│${colors.reset}          ${colors.magenta}${colors.bold}wit coding agent${colors.reset}            ${colors.cyan}${colors.bold}│${colors.reset}`);
  console.log(`${colors.cyan}${colors.bold}╰─────────────────────────────────────────╯${colors.reset}`);
  console.log('');
  
  if (session.repoPath) {
    console.log(`${colors.dim}Repository:${colors.reset} ${session.repoPath}`);
    console.log(`${colors.dim}Branch:${colors.reset} ${session.branch}`);
  } else {
    console.log(`${colors.yellow}Not in a wit repository${colors.reset}`);
  }
  
  console.log('');
  console.log(`${colors.dim}Type your request, or use:${colors.reset}`);
  console.log(`${colors.dim}  help    - Show commands${colors.reset}`);
  console.log(`${colors.dim}  exit    - Exit the agent${colors.reset}`);
  console.log('');
}

/**
 * Print session help
 */
function printSessionHelp(): void {
  console.log('');
  console.log(`${colors.bold}Commands:${colors.reset}`);
  console.log(`  ${colors.green}help${colors.reset}      Show this help`);
  console.log(`  ${colors.green}status${colors.reset}    Show session status`);
  console.log(`  ${colors.green}history${colors.reset}   Show conversation history`);
  console.log(`  ${colors.green}clear${colors.reset}     Clear conversation history`);
  console.log(`  ${colors.green}exit${colors.reset}      Exit the agent`);
  console.log('');
  console.log(`${colors.bold}Examples:${colors.reset}`);
  console.log(`  ${colors.dim}"explain the authentication flow"${colors.reset}`);
  console.log(`  ${colors.dim}"add a test for the user service"${colors.reset}`);
  console.log(`  ${colors.dim}"refactor the error handling in api/"${colors.reset}`);
  console.log(`  ${colors.dim}"what does the Repository class do?"${colors.reset}`);
  console.log('');
}

/**
 * Print session status
 */
function printSessionStatus(session: AgentSession): void {
  console.log('');
  console.log(`${colors.bold}Session Status:${colors.reset}`);
  console.log(`  Repository: ${session.repoPath || 'None'}`);
  console.log(`  Branch: ${session.branch || 'N/A'}`);
  console.log(`  Thread ID: ${session.threadId.slice(0, 8)}...`);
  console.log(`  Messages: ${session.messageCount}`);
  console.log(`  Pending changes: ${session.pendingChanges.length}`);
  console.log('');
}

/**
 * Extract text content from MastraDBMessage content
 */
function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (content && typeof content === 'object') {
    const c = content as { parts?: Array<{ type: string; text?: string }> };
    if (c.parts && Array.isArray(c.parts)) {
      return c.parts
        .filter(p => p.type === 'text' && p.text)
        .map(p => p.text)
        .join('');
    }
  }
  return JSON.stringify(content);
}

/**
 * Print conversation history from memory
 */
async function printHistory(session: AgentSession, memory: Memory): Promise<void> {
  console.log('');
  
  try {
    const { messages } = await memory.recall({
      threadId: session.threadId,
    });
    
    if (messages.length === 0) {
      console.log(`${colors.dim}No messages in history.${colors.reset}`);
    } else {
      console.log(`${colors.bold}Conversation History:${colors.reset}`);
      console.log('');
      for (const msg of messages) {
        const roleColor = msg.role === 'user' ? colors.green : colors.blue;
        const roleName = msg.role === 'user' ? 'You' : 'Agent';
        const content = extractTextContent(msg.content);
        const preview = content.length > 100 
          ? content.slice(0, 100) + '...' 
          : content;
        console.log(`${roleColor}${roleName}:${colors.reset} ${preview}`);
      }
    }
  } catch (error) {
    console.log(`${colors.dim}Unable to fetch history.${colors.reset}`);
  }
  console.log('');
}

/**
 * Print agent status
 */
function printAgentStatus(): void {
  const info = getAIInfo();
  
  console.log('');
  console.log(`${colors.bold}wit Agent Status${colors.reset}`);
  console.log('');
  console.log(`Available: ${info.available ? `${colors.green}Yes${colors.reset}` : `${colors.red}No${colors.reset}`}`);
  console.log(`Model: ${info.model}`);
  console.log(`Provider: ${info.provider}`);
  
  // Check repo context
  try {
    const repo = Repository.find();
    const branch = repo.refs.getCurrentBranch() || 'HEAD';
    console.log('');
    console.log(`Repository: ${repo.workDir}`);
    console.log(`Branch: ${branch}`);
  } catch {
    console.log('');
    console.log(`${colors.yellow}Not in a wit repository${colors.reset}`);
  }
  
  if (!info.available) {
    console.log('');
    console.log('To enable the agent, set one of:');
    console.log('  export OPENAI_API_KEY=sk-...');
    console.log('  export ANTHROPIC_API_KEY=sk-ant-...');
  }
  console.log('');
}

/**
 * Print AI not configured message
 */
function printAINotConfigured(): void {
  console.error(`${colors.red}AI features require an API key.${colors.reset}`);
  console.error('');
  console.error('Set one of these environment variables:');
  console.error('  export OPENAI_API_KEY=sk-...');
  console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
  console.error('');
  console.error('Run "wit agent status" to see current configuration.');
}

/**
 * Print help for wit agent
 */
function printAgentHelp(): void {
  console.log(`
${colors.bold}wit agent${colors.reset} - Interactive coding assistant

${colors.bold}Usage:${colors.reset}
  wit agent                    Start interactive chat session
  wit agent chat               Start interactive chat session
  wit agent ask <query>        Ask a one-shot question
  wit agent status             Show agent configuration
  wit agent help               Show this help

${colors.bold}Interactive Commands:${colors.reset}
  help                         Show available commands
  status                       Show session status
  history                      Show conversation history
  clear                        Clear conversation
  exit                         Exit the agent

${colors.bold}Examples:${colors.reset}
  wit agent                            # Start interactive session
  wit agent "explain the auth flow"    # One-shot query
  wit agent ask "what does main.ts do" # One-shot query

${colors.bold}Capabilities:${colors.reset}
  - Read and understand code files
  - Edit files with targeted changes
  - Run shell commands (npm, node, etc.)
  - Create branches and commits
  - Open pull requests
  - Explain code and suggest improvements

${colors.bold}Environment:${colors.reset}
  OPENAI_API_KEY       OpenAI API key (for GPT models)
  ANTHROPIC_API_KEY    Anthropic API key (for Claude models)
  WIT_AI_MODEL         Model override (default: openai/gpt-4o)
`);
}

export const AGENT_HELP = `
wit agent - Interactive coding assistant

Usage:
  wit agent                    Start interactive chat session
  wit agent ask <query>        Ask a one-shot question
  wit agent status             Show agent configuration

The coding agent can:
  - Read and edit files in your repository
  - Run shell commands (npm test, tsc, etc.)
  - Create branches and commits
  - Open pull requests
  - Explain code and suggest improvements

Examples:
  wit agent
  wit agent "add error handling to the API"
  wit agent ask "what does Repository.find() do?"
`;
