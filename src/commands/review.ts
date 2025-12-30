/**
 * Review Command - AI-powered code review using CodeRabbit
 *
 * Pre-push code review that catches issues before they hit the remote.
 * Powered by CodeRabbit (https://coderabbit.ai) - our AI code review partner.
 *
 * Usage:
 *   wit review                     Review uncommitted changes
 *   wit review --staged            Review only staged changes
 *   wit review --branch            Review changes since branching from main
 *   wit review --commits HEAD~3..  Review specific commits
 *   wit review --configure         Configure CodeRabbit API key
 *   wit review --status            Show CodeRabbit configuration status
 */

import * as fs from 'fs';
import * as path from 'path';
import { Repository } from '../core/repository';
import { TsgitError, ErrorCode } from '../core/errors';
import { diff as computeDiff, createHunks } from '../core/diff';
import {
  getCodeRabbitStatus,
  getCodeRabbitApiKey,
  saveCodeRabbitApiKey,
  reviewRepo,
  formatReviewResult,
  CodeRabbitConfig,
} from '../utils/coderabbit';
import { colors } from '../utils/colors';

export const REVIEW_HELP = `
wit review - AI-powered code review using CodeRabbit

Usage: wit review [options]

Review your code before pushing. Powered by CodeRabbit.

Options:
  --staged          Review only staged changes
  --branch          Review all changes since branching from main/master
  --commits <range> Review specific commit range (e.g., HEAD~3.., main..HEAD)
  --base <branch>   Compare against specific branch (default: main)
  --json            Output as JSON
  --verbose         Show detailed output
  --strict          Exit with error if any issues found
  --configure       Set up CodeRabbit API key
  --status          Show CodeRabbit configuration status
  -h, --help        Show this help message

Examples:
  wit review                      Review all uncommitted changes
  wit review --staged             Review only staged changes (pre-commit)
  wit review --branch             Review changes since branching from main
  wit review --commits HEAD~3..   Review last 3 commits
  wit review --strict             Fail if issues found (for CI)
  wit review --configure          Configure CodeRabbit API key

Pre-push hook:
  Add to .wit/hooks/pre-push:
    #!/bin/sh
    wit review --branch --strict

CodeRabbit:
  Get your API key at https://coderabbit.ai
  Set via: wit review --configure
  Or: export CODERABBIT_API_KEY=your-key
`;

interface ReviewOptions {
  staged?: boolean;
  branch?: boolean;
  commits?: string;
  base?: string;
  json?: boolean;
  verbose?: boolean;
  strict?: boolean;
  configure?: boolean;
  status?: boolean;
  help?: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): ReviewOptions {
  const options: ReviewOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--staged':
      case '-s':
        options.staged = true;
        break;
      case '--branch':
      case '-b':
        options.branch = true;
        break;
      case '--commits':
      case '-c':
        options.commits = args[++i];
        break;
      case '--base':
        options.base = args[++i];
        break;
      case '--json':
        options.json = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--strict':
        options.strict = true;
        break;
      case '--configure':
        options.configure = true;
        break;
      case '--status':
        options.status = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

/**
 * Main handler for review command
 */
export async function handleCodeReview(args: string[]): Promise<void> {
  const options = parseArgs(args);

  if (options.help) {
    console.log(REVIEW_HELP);
    return;
  }

  if (options.status) {
    await showStatus();
    return;
  }

  if (options.configure) {
    await configure();
    return;
  }

  // Check CodeRabbit API key
  const apiKey = getCodeRabbitApiKey();

  if (!apiKey) {
    console.log(colors.yellow('\n⚠️  CodeRabbit API key not configured\n'));
    console.log('CodeRabbit provides AI-powered code reviews.');
    console.log('Get your free API key at: ' + colors.cyan('https://coderabbit.ai'));
    console.log('');
    console.log('To configure:');
    console.log(colors.cyan('  wit review --configure'));
    console.log('');
    console.log('Or set the environment variable:');
    console.log(colors.cyan('  export CODERABBIT_API_KEY=your-key'));
    console.log('');
    process.exit(1);
  }

  // Get repository
  const repo = Repository.find();
  const currentBranch = repo.refs.getCurrentBranch();

  // Determine what to review
  let diffContent: string;
  let description: string;

  if (options.commits) {
    // Review specific commits
    const result = await getCommitRangeDiff(repo, options.commits);
    diffContent = result.diff;
    description = `commits ${options.commits}`;
  } else if (options.branch) {
    // Review changes since branching from base
    const baseBranch = options.base || detectBaseBranch(repo);
    const result = await getBranchDiff(repo, baseBranch);
    diffContent = result.diff;
    description = `branch ${currentBranch || 'HEAD'} vs ${baseBranch}`;
  } else if (options.staged) {
    // Review only staged changes
    const result = await getStagedDiff(repo);
    diffContent = result.diff;
    description = 'staged changes';
  } else {
    // Review all uncommitted changes (staged + unstaged)
    const result = await getUncommittedDiff(repo);
    diffContent = result.diff;
    description = 'uncommitted changes';
  }

  if (!diffContent || diffContent.trim().length === 0) {
    console.log(colors.dim('\nNo changes to review.\n'));
    if (options.staged) {
      console.log('Stage some changes with: ' + colors.cyan('wit add <files>'));
    } else if (options.branch) {
      console.log('Make some commits on your branch first.');
    } else {
      console.log('Make some changes to review.');
    }
    return;
  }

  // Show what we're reviewing
  console.log('');
  console.log(colors.bold('🐰 CodeRabbit Review'));
  console.log(colors.dim(`   Reviewing: ${description}`));
  console.log('');

  // Run the review using CodeRabbit CLI
  const config: CodeRabbitConfig = {
    cwd: repo.workDir,
  };

  // Set base branch for comparison if reviewing branch changes
  if (options.branch) {
    config.baseBranch = options.base || detectBaseBranch(repo);
  }

  const result = await reviewRepo(repo.workDir, config);

  // Output results
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatReviewResult(result));
  }

  // Handle strict mode - exit with error if issues found
  if (options.strict && result.issues && result.issues.length > 0) {
    const criticalOrHigh = result.issues.filter(
      i => i.severity === 'critical' || i.severity === 'high'
    );
    
    if (criticalOrHigh.length > 0) {
      console.log(colors.red(`\n✗ Review failed: ${criticalOrHigh.length} critical/high issue(s) found`));
      console.log(colors.dim('  Fix the issues above or use --no-verify to bypass'));
      process.exit(1);
    }
  }

  if (!result.success) {
    process.exit(1);
  }
}

/**
 * Get diff for uncommitted changes (staged + unstaged)
 */
async function getUncommittedDiff(repo: Repository): Promise<{ diff: string; files: string[] }> {
  const status = repo.status();
  const files = [...new Set([...status.staged, ...status.modified, ...status.deleted])];

  if (files.length === 0) {
    return { diff: '', files: [] };
  }

  return generateDiff(repo, files);
}

/**
 * Get diff for staged changes only
 */
async function getStagedDiff(repo: Repository): Promise<{ diff: string; files: string[] }> {
  const status = repo.status();
  const files = status.staged;

  if (files.length === 0) {
    return { diff: '', files: [] };
  }

  return generateDiff(repo, files, true);
}

/**
 * Get diff for branch changes vs base
 */
async function getBranchDiff(repo: Repository, baseBranch: string): Promise<{ diff: string; files: string[] }> {
  // Get merge base
  const currentHead = repo.refs.resolve('HEAD');
  const baseHead = repo.refs.resolve(baseBranch) || 
                   repo.refs.resolve(`origin/${baseBranch}`) ||
                   repo.refs.resolve(`refs/remotes/origin/${baseBranch}`);

  if (!currentHead || !baseHead) {
    throw new TsgitError(
      `Cannot find commits to compare`,
      ErrorCode.REF_NOT_FOUND,
      [
        `Make sure ${baseBranch} exists`,
        `Try: wit fetch origin ${baseBranch}`,
      ]
    );
  }

  // Find merge base (simplified - just use base head for now)
  // A proper implementation would walk the commit graph
  return getCommitDiff(repo, baseHead, currentHead);
}

/**
 * Get diff for a commit range
 */
async function getCommitRangeDiff(repo: Repository, range: string): Promise<{ diff: string; files: string[] }> {
  // Parse range like "HEAD~3.." or "main..HEAD"
  let fromRef: string;
  let toRef: string;

  if (range.includes('..')) {
    const [from, to] = range.split('..');
    fromRef = from || 'HEAD';
    toRef = to || 'HEAD';
  } else {
    fromRef = range;
    toRef = 'HEAD';
  }

  const fromHash = repo.refs.resolve(fromRef);
  const toHash = repo.refs.resolve(toRef);

  if (!fromHash || !toHash) {
    throw new TsgitError(
      `Cannot resolve commit range: ${range}`,
      ErrorCode.REF_NOT_FOUND,
      ['Check that the commits exist']
    );
  }

  return getCommitDiff(repo, fromHash, toHash);
}

/**
 * Get diff between two commits
 */
async function getCommitDiff(repo: Repository, fromHash: string, toHash: string): Promise<{ diff: string; files: string[] }> {
  // Get trees for both commits
  const fromCommit = repo.objects.readCommit(fromHash);
  const toCommit = repo.objects.readCommit(toHash);

  const fromTree = repo.objects.readTree(fromCommit.treeHash);
  const toTree = repo.objects.readTree(toCommit.treeHash);

  // Compare trees to find changed files
  const changedFiles = findChangedFiles(repo, fromTree.entries, toTree.entries);
  
  // Generate diff for changed files
  let diffContent = '';

  for (const file of changedFiles) {
    let oldContent = '';
    let newContent = '';

    try {
      if (file.oldHash) {
        const blob = repo.objects.readBlob(file.oldHash);
        oldContent = blob.content.toString('utf8');
      }
    } catch {
      // File didn't exist before
    }

    try {
      if (file.newHash) {
        const blob = repo.objects.readBlob(file.newHash);
        newContent = blob.content.toString('utf8');
      }
    } catch {
      // File was deleted
    }

    const diffResult = computeDiff(oldContent, newContent);
    const hunks = createHunks(diffResult, 3);

    if (hunks.length > 0) {
      diffContent += formatFileDiff(file.path, hunks);
    }
  }

  return { diff: diffContent, files: changedFiles.map(f => f.path) };
}

/**
 * Find changed files between two tree entry lists
 */
function findChangedFiles(
  repo: Repository,
  fromEntries: Array<{ mode: string; name: string; hash: string }>,
  toEntries: Array<{ mode: string; name: string; hash: string }>,
  prefix: string = ''
): Array<{ path: string; oldHash?: string; newHash?: string }> {
  const result: Array<{ path: string; oldHash?: string; newHash?: string }> = [];
  
  const fromMap = new Map(fromEntries.map(e => [e.name, e]));
  const toMap = new Map(toEntries.map(e => [e.name, e]));

  // Check for modified and deleted files
  for (const [name, fromEntry] of fromMap) {
    const filePath = prefix ? `${prefix}/${name}` : name;
    const toEntry = toMap.get(name);

    if (!toEntry) {
      // File deleted
      if (!fromEntry.mode.startsWith('40')) { // Not a directory
        result.push({ path: filePath, oldHash: fromEntry.hash });
      }
    } else if (fromEntry.hash !== toEntry.hash) {
      // File modified
      if (fromEntry.mode.startsWith('40') && toEntry.mode.startsWith('40')) {
        // Both are directories, recurse
        try {
          const fromSubTree = repo.objects.readTree(fromEntry.hash);
          const toSubTree = repo.objects.readTree(toEntry.hash);
          result.push(...findChangedFiles(repo, fromSubTree.entries, toSubTree.entries, filePath));
        } catch {
          // Skip if we can't read subtrees
        }
      } else if (!fromEntry.mode.startsWith('40') && !toEntry.mode.startsWith('40')) {
        // Both are files
        result.push({ path: filePath, oldHash: fromEntry.hash, newHash: toEntry.hash });
      }
    }
  }

  // Check for new files
  for (const [name, toEntry] of toMap) {
    if (!fromMap.has(name)) {
      const filePath = prefix ? `${prefix}/${name}` : name;
      if (!toEntry.mode.startsWith('40')) { // Not a directory
        result.push({ path: filePath, newHash: toEntry.hash });
      } else {
        // New directory, add all files in it
        try {
          const subTree = repo.objects.readTree(toEntry.hash);
          for (const entry of subTree.entries) {
            if (!entry.mode.startsWith('40')) {
              result.push({ path: `${filePath}/${entry.name}`, newHash: entry.hash });
            }
          }
        } catch {
          // Skip if we can't read subtree
        }
      }
    }
  }

  return result;
}

/**
 * Generate diff for a list of files
 */
async function generateDiff(
  repo: Repository, 
  files: string[],
  _stagedOnly: boolean = false
): Promise<{ diff: string; files: string[] }> {
  let diffContent = '';

  for (const file of files) {
    try {
      // Get old content from index
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

      // Get new content
      let newContent = '';
      const fullPath = path.join(repo.workDir, file);
      try {
        newContent = fs.readFileSync(fullPath, 'utf8');
      } catch {
        // File might be deleted
      }

      const diffResult = computeDiff(oldContent, newContent);
      const hunks = createHunks(diffResult, 3);

      if (hunks.length > 0) {
        diffContent += formatFileDiff(file, hunks);
      }
    } catch {
      // Skip files we can't diff
    }
  }

  return { diff: diffContent, files };
}

/**
 * Format a file diff in unified diff format
 */
function formatFileDiff(
  filePath: string,
  hunks: Array<{
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
    lines: Array<{ type: 'add' | 'remove' | 'context'; content: string }>;
  }>
): string {
  let output = `diff --git a/${filePath} b/${filePath}\n`;
  output += `--- a/${filePath}\n`;
  output += `+++ b/${filePath}\n`;

  for (const hunk of hunks) {
    output += `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@\n`;

    for (const line of hunk.lines) {
      switch (line.type) {
        case 'add':
          output += `+${line.content}\n`;
          break;
        case 'remove':
          output += `-${line.content}\n`;
          break;
        case 'context':
          output += ` ${line.content}\n`;
          break;
      }
    }
  }

  return output;
}

/**
 * Detect the base branch (main or master)
 */
function detectBaseBranch(repo: Repository): string {
  // Check if main exists
  if (repo.refs.branchExists('main') || 
      repo.refs.resolve('origin/main') || 
      repo.refs.resolve('refs/remotes/origin/main')) {
    return 'main';
  }

  // Fall back to master
  if (repo.refs.branchExists('master') || 
      repo.refs.resolve('origin/master') || 
      repo.refs.resolve('refs/remotes/origin/master')) {
    return 'master';
  }

  return 'main';
}

/**
 * Show CodeRabbit status
 */
async function showStatus(): Promise<void> {
  console.log('\n🐰 CodeRabbit Status\n');

  const status = await getCodeRabbitStatus();
  const apiKey = getCodeRabbitApiKey();

  console.log(`API Key:   ${apiKey ? colors.green('✓ Configured') : colors.yellow('✗ Not configured')}`);

  if (apiKey) {
    console.log(`           ${colors.dim(`${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`)}`);
  }

  console.log(`CLI:       ${status.installed ? colors.green('✓ Installed') : colors.dim('○ Not installed (optional)')}`);

  if (status.installed && status.version) {
    console.log(`           ${colors.dim(`Version: ${status.version}`)}`);
  }

  console.log('');

  if (!apiKey) {
    console.log('To configure:');
    console.log(colors.cyan('  wit review --configure'));
    console.log('');
    console.log('Or set environment variable:');
    console.log(colors.cyan('  export CODERABBIT_API_KEY=your-key'));
    console.log('');
    console.log('Get your API key at: ' + colors.cyan('https://coderabbit.ai'));
  } else {
    console.log(colors.green('Ready to review!'));
    console.log(colors.dim('Try: wit review'));
  }

  console.log('');
}

/**
 * Configure CodeRabbit API key
 */
async function configure(): Promise<void> {
  const readline = await import('readline');

  console.log('\n🐰 CodeRabbit Configuration\n');
  console.log('CodeRabbit provides AI-powered code reviews.');
  console.log('Get your API key at: ' + colors.cyan('https://coderabbit.ai'));
  console.log('');

  const currentKey = getCodeRabbitApiKey();
  if (currentKey) {
    console.log(colors.green('✓') + ' API key is already configured');
    console.log(colors.dim(`  Current: ${currentKey.slice(0, 8)}...${currentKey.slice(-4)}`));
    console.log('');
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  };

  try {
    const apiKey = await question('Enter your CodeRabbit API key (or press Enter to skip): ');

    if (apiKey.trim()) {
      saveCodeRabbitApiKey(apiKey.trim());
      console.log(colors.green('\n✓') + ' API key saved successfully');
      console.log(colors.dim('  Stored in: ~/.config/wit/coderabbit.json'));
      console.log('');
      console.log('You can now run: ' + colors.cyan('wit review'));
    } else {
      console.log('\nSkipped.');
      console.log('You can also set: ' + colors.cyan('export CODERABBIT_API_KEY=your-key'));
    }
  } finally {
    rl.close();
  }

  console.log('');
}
