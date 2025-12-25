/**
 * AI Commands for wit
 * 
 * Provides AI-powered features including:
 * - Natural language commands
 * - Commit message generation
 * - Conflict resolution assistance
 * - Code review
 */

import { getTsgitAgent, isAIAvailable, getAIInfo } from '../ai/mastra.js';
import { Repository } from '../core/repository.js';
import { diff as computeDiff, createHunks, DiffLine } from '../core/diff.js';
import { TsgitError, ErrorCode } from '../core/errors.js';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Format diff lines into a readable string
 */
function formatDiffOutput(file: string, diffLines: DiffLine[], contextLines: number = 3): string {
  const hunks = createHunks(diffLines, contextLines);
  const lines: string[] = [];
  
  lines.push(`--- a/${file}`);
  lines.push(`+++ b/${file}`);
  
  for (const hunk of hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);
    
    for (const line of hunk.lines) {
      switch (line.type) {
        case 'add':
          lines.push(`+${line.content}`);
          break;
        case 'remove':
          lines.push(`-${line.content}`);
          break;
        case 'context':
          lines.push(` ${line.content}`);
          break;
      }
    }
  }
  
  return lines.join('\n');
}

/**
 * Handle the main `wit ai` command for natural language interaction
 */
export async function handleAI(args: string[]): Promise<void> {
  if (args.length === 0) {
    printAIHelp();
    return;
  }

  const subcommand = args[0];

  // Status command doesn't require API key
  if (subcommand === 'status') {
    printAIStatus();
    return;
  }

  // All other commands require an API key
  if (!isAIAvailable()) {
    console.error('AI features require an API key.');
    console.error('Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable.');
    console.error('\nAlternatively, set WIT_AI_MODEL to use a different provider.');
    console.error('\nRun "wit ai status" to see current configuration.');
    process.exit(1);
  }

  switch (subcommand) {
    case 'chat':
    case 'ask':
      await handleChat(args.slice(1));
      break;
    case 'commit':
      await handleAICommit(args.slice(1));
      break;
    case 'review':
      await handleReview(args.slice(1));
      break;
    case 'explain':
      await handleExplain(args.slice(1));
      break;
    case 'resolve':
      await handleResolve(args.slice(1));
      break;
    default:
      // Treat the entire args as a natural language query
      await handleChat(args);
  }
}

/**
 * Interactive chat with the AI agent
 */
async function handleChat(args: string[]): Promise<void> {
  const query = args.join(' ');
  
  if (!query) {
    console.error('Please provide a question or command.');
    console.error('Example: wit ai "what files have I changed?"');
    process.exit(1);
  }

  const agent = getTsgitAgent();
  
  console.log('\n🤖 wit AI\n');
  
  try {
    const result = await agent.stream(query);
    
    // Stream the response
    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
    }
    console.log('\n');
  } catch (error) {
    console.error('\nError:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

/**
 * Generate a commit message using AI
 */
async function handleAICommit(args: string[]): Promise<void> {
  const repo = Repository.find();
  const status = repo.status();
  
  // Check for --all flag
  const stageAll = args.includes('-a') || args.includes('--all');
  const execute = args.includes('--execute') || args.includes('-x');
  
  // If -a flag, stage all modified files first
  if (stageAll) {
    for (const file of status.modified) {
      repo.add(file);
    }
    for (const file of status.deleted) {
      repo.index.remove(file);
    }
    repo.index.save();
  }
  
  // Get staged files
  const stagedFiles = stageAll ? [...status.modified, ...status.deleted] : status.staged;
  
  if (stagedFiles.length === 0) {
    console.error('No changes staged for commit.');
    console.error('Use "wit add <files>" to stage files first, or use "wit ai commit -a" to stage all.');
    process.exit(1);
  }
  
  // Get the diff of staged changes
  let diffContent = '';
  for (const file of stagedFiles) {
    try {
      let oldContent = '';
      const entry = repo.index.get(file);
      if (entry) {
        const headHash = repo.refs.resolve('HEAD');
        if (headHash) {
          // Get from HEAD if possible
          try {
            const blob = repo.objects.readBlob(entry.hash);
            oldContent = blob.content.toString('utf8');
          } catch {
            // No previous version
          }
        }
      }
      
      const fullPath = path.join(repo.workDir, file);
      let newContent = '';
      try {
        newContent = fs.readFileSync(fullPath, 'utf8');
      } catch {
        // File might be deleted
      }
      
      const diffResult = computeDiff(oldContent, newContent);
      diffContent += `\n=== ${file} ===\n`;
      diffContent += formatDiffOutput(file, diffResult, 3);
    } catch {
      // Skip files we can't diff
    }
  }
  
  console.log('\n🤖 Generating commit message...\n');
  
  const agent = getTsgitAgent();
  
  const prompt = `Based on the following diff of staged changes, generate a good commit message.

The commit message should:
1. Have a concise subject line (under 72 characters) in imperative mood
2. Optionally include a body explaining WHY the change was made
3. Follow conventional commits format if appropriate (feat:, fix:, docs:, etc.)

Return ONLY the commit message, nothing else.

Staged files: ${stagedFiles.join(', ')}

Diff:
${diffContent}`;

  try {
    const result = await agent.generate(prompt);
    const message = result.text.trim();
    
    console.log('📝 Suggested commit message:\n');
    console.log('─'.repeat(60));
    console.log(message);
    console.log('─'.repeat(60));
    
    if (execute) {
      // Actually create the commit
      const hash = repo.commit(message);
      const shortHash = hash.slice(0, 8);
      const branch = repo.refs.getCurrentBranch();
      console.log(`\n✅ [${branch} ${shortHash}] ${message.split('\n')[0]}`);
    } else {
      console.log('\nTo use this message, run:');
      console.log(`  wit commit -m "${message.split('\n')[0]}"`);
      console.log('\nOr add --execute (-x) to commit directly:');
      console.log('  wit ai commit -x');
    }
  } catch (error) {
    console.error('Error generating commit message:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

/**
 * AI-powered code review of changes
 */
async function handleReview(args: string[]): Promise<void> {
  const repo = Repository.find();
  const status = repo.status();
  const staged = args.includes('--staged');
  
  const filesToReview = staged ? status.staged : [...status.staged, ...status.modified];
  
  if (filesToReview.length === 0) {
    console.log('No changes to review.');
    return;
  }
  
  // Get the diff
  let diffContent = '';
  for (const file of filesToReview) {
    try {
      let oldContent = '';
      const entry = repo.index.get(file);
      if (entry) {
        try {
          const blob = repo.objects.readBlob(entry.hash);
          oldContent = blob.content.toString('utf8');
        } catch {
          // No previous version
        }
      }
      
      const fullPath = path.join(repo.workDir, file);
      let newContent = '';
      try {
        newContent = fs.readFileSync(fullPath, 'utf8');
      } catch {
        // File might be deleted
      }
      
      const diffResult = computeDiff(oldContent, newContent);
      diffContent += `\n=== ${file} ===\n`;
      diffContent += formatDiffOutput(file, diffResult, 5);
    } catch {
      // Skip files we can't diff
    }
  }
  
  console.log('\n🔍 Reviewing changes...\n');
  
  const agent = getTsgitAgent();
  
  const prompt = `Please review the following code changes and provide feedback.

Look for:
1. Potential bugs or issues
2. Security concerns
3. Code quality improvements
4. Best practices violations

Be constructive and specific. Reference file names and line numbers when possible.

Files changed: ${filesToReview.join(', ')}

Diff:
${diffContent}`;

  try {
    const result = await agent.stream(prompt);
    
    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
    }
    console.log('\n');
  } catch (error) {
    console.error('Error during review:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

/**
 * Explain a commit or range of commits
 */
async function handleExplain(args: string[]): Promise<void> {
  const repo = Repository.find();
  const ref = args[0] || 'HEAD';
  
  try {
    const hash = repo.refs.resolve(ref);
    if (!hash) {
      console.error(`Could not resolve: ${ref}`);
      process.exit(1);
    }
    
    const commit = repo.objects.readCommit(hash);
    
    // Get the diff for this commit
    let diffContent = '';
    if (commit.parentHashes.length > 0) {
      // Get diff between parent and this commit
      const parentHash = commit.parentHashes[0];
      // For now, just show the commit info
      // TODO: Implement tree diff
    }
    
    console.log('\n📖 Explaining commit...\n');
    
    const agent = getTsgitAgent();
    
    const prompt = `Please explain the following commit in plain English.

Commit: ${hash.slice(0, 8)}
Author: ${commit.author.name} <${commit.author.email}>
Date: ${new Date(commit.author.timestamp * 1000).toISOString()}
Message: ${commit.message}

Explain:
1. What this commit does
2. Why it might have been made
3. What parts of the codebase it affects`;

    const result = await agent.stream(prompt);
    
    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
    }
    console.log('\n');
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

/**
 * AI-assisted conflict resolution
 */
async function handleResolve(args: string[]): Promise<void> {
  const repo = Repository.find();
  
  // Import the merge manager dynamically to avoid circular deps
  const { MergeManager } = await import('../core/merge.js');
  const mergeManager = new MergeManager(repo, repo.gitDir);
  
  const state = mergeManager.getState();
  
  if (!state || !state.inProgress) {
    console.log('No merge in progress. Nothing to resolve.');
    return;
  }
  
  const unresolvedConflicts = mergeManager.getUnresolvedConflicts();
  
  if (unresolvedConflicts.length === 0) {
    console.log('All conflicts have been resolved.');
    console.log('Run "wit merge --continue" to complete the merge.');
    return;
  }
  
  // If a specific file is given, resolve just that one
  const targetFile = args[0];
  const conflictsToResolve = targetFile 
    ? unresolvedConflicts.filter(c => c.path === targetFile)
    : unresolvedConflicts;
  
  if (targetFile && conflictsToResolve.length === 0) {
    console.error(`No conflict found for: ${targetFile}`);
    process.exit(1);
  }
  
  const agent = getTsgitAgent();
  
  for (const conflict of conflictsToResolve) {
    console.log(`\n🔧 Resolving: ${conflict.path}\n`);
    
    const prompt = `Please help resolve this merge conflict.

File: ${conflict.path}
Source branch: ${state.sourceBranch}
Target branch: ${state.targetBranch}

Our version (${state.targetBranch}):
\`\`\`
${conflict.oursContent}
\`\`\`

Their version (${state.sourceBranch}):
\`\`\`
${conflict.theirsContent}
\`\`\`

${conflict.baseContent ? `Original version (merge base):
\`\`\`
${conflict.baseContent}
\`\`\`
` : ''}

Please:
1. Analyze what each side is trying to do
2. Suggest the best resolution
3. Explain your reasoning

If you can provide a merged resolution, output it in a code block labeled "RESOLVED".`;

    try {
      const result = await agent.stream(prompt);
      
      for await (const chunk of result.textStream) {
        process.stdout.write(chunk);
      }
      console.log('\n');
    } catch (error) {
      console.error('Error resolving conflict:', error instanceof Error ? error.message : 'Unknown error');
    }
  }
}

/**
 * Print AI status and configuration
 */
function printAIStatus(): void {
  const info = getAIInfo();
  
  console.log('\n🤖 wit AI Status\n');
  console.log(`Available: ${info.available ? '✅ Yes' : '❌ No'}`);
  console.log(`Model: ${info.model}`);
  console.log(`Provider: ${info.provider}`);
  
  if (!info.available) {
    console.log('\nTo enable AI features, set one of:');
    console.log('  export OPENAI_API_KEY=sk-...');
    console.log('  export ANTHROPIC_API_KEY=sk-ant-...');
    console.log('  export WIT_AI_MODEL=provider/model');
  }
  
  console.log('\nEnvironment Variables:');
  console.log(`  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log(`  WIT_AI_MODEL: ${process.env.WIT_AI_MODEL || '(not set, using default)'}`);
}

/**
 * Print AI help
 */
function printAIHelp(): void {
  console.log(`
wit ai - AI-powered git assistant

Usage: wit ai <command> [options]

Commands:
  wit ai <query>              Ask a question or give a natural language command
  wit ai commit [-a] [-x]     Generate a commit message from staged changes
  wit ai review [--staged]    Review code changes
  wit ai explain [ref]        Explain a commit
  wit ai resolve [file]       Help resolve merge conflicts
  wit ai status               Show AI configuration status

Options:
  -a, --all        Stage all tracked files before commit message generation
  -x, --execute    Execute the commit with the generated message
  --staged         Review only staged changes

Examples:
  wit ai "what files have changed?"
  wit ai "show me the last 5 commits"
  wit ai "create a branch for the login feature"
  wit ai commit -a -x
  wit ai review --staged
  wit ai resolve src/utils.ts

Environment:
  OPENAI_API_KEY       OpenAI API key (for GPT models)
  ANTHROPIC_API_KEY    Anthropic API key (for Claude models)
  WIT_AI_MODEL       Model to use (default: openai/gpt-4o)
`);
}

export { handleAICommit, handleReview, handleExplain, handleResolve };
