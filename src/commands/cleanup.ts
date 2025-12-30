/**
 * Cleanup Command
 * Find and delete branches that have been merged or are stale
 * 
 * Much better than manually checking each branch
 */

import { Repository } from '../core/repository';
import { TsgitError, ErrorCode } from '../core/errors';
import * as readline from 'readline';
import { colors } from '../utils/colors';

export interface CleanupOptions {
  dryRun?: boolean;      // Just show what would be deleted
  force?: boolean;       // Don't ask for confirmation
  merged?: boolean;      // Only show merged branches
  stale?: boolean;       // Only show stale branches (older than staleDays)
  staleDays?: number;    // Days before a branch is considered stale (default: 30)
  all?: boolean;         // Show all candidates (merged + stale)
}

export interface BranchInfo {
  name: string;
  lastCommitHash: string;
  lastCommitDate: Date;
  lastCommitMessage: string;
  isMerged: boolean;
  isStale: boolean;
  daysSinceLastCommit: number;
}

/**
 * Analyze branches and return cleanup candidates
 */
export function analyzeBranches(options: CleanupOptions = {}): BranchInfo[] {
  const repo = Repository.find();
  const staleDays = options.staleDays || 30;
  const now = Date.now();
  
  const branches = repo.refs.listBranches();
  const currentBranch = repo.refs.getCurrentBranch();
  const mainBranches = ['main', 'master', 'develop', 'development'];
  
  // Get the main branch hash for merge detection
  let mainHash: string | null = null;
  for (const main of mainBranches) {
    if (branches.includes(main)) {
      mainHash = repo.refs.resolve(main);
      break;
    }
  }
  
  const results: BranchInfo[] = [];
  
  for (const branch of branches) {
    // Skip current branch and protected branches
    if (branch === currentBranch || mainBranches.includes(branch)) {
      continue;
    }
    
    const branchHash = repo.refs.resolve(branch);
    if (!branchHash) continue;
    
    try {
      const commit = repo.objects.readCommit(branchHash);
      const commitDate = new Date(commit.author.timestamp * 1000);
      const daysSince = Math.floor((now - commitDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Check if merged into main
      const isMerged = mainHash ? isAncestor(repo, branchHash, mainHash) : false;
      const isStale = daysSince >= staleDays;
      
      // Filter based on options
      if (options.merged && !isMerged) continue;
      if (options.stale && !isStale) continue;
      if (!options.merged && !options.stale && !options.all) {
        // Default: show merged or stale
        if (!isMerged && !isStale) continue;
      }
      
      results.push({
        name: branch,
        lastCommitHash: branchHash,
        lastCommitDate: commitDate,
        lastCommitMessage: commit.message.split('\n')[0],
        isMerged,
        isStale,
        daysSinceLastCommit: daysSince,
      });
    } catch {
      // Skip branches we can't read
    }
  }
  
  // Sort by most likely to delete first (merged, then by age)
  results.sort((a, b) => {
    if (a.isMerged && !b.isMerged) return -1;
    if (!a.isMerged && b.isMerged) return 1;
    return b.daysSinceLastCommit - a.daysSinceLastCommit;
  });
  
  return results;
}

/**
 * Check if commit A is an ancestor of commit B
 */
function isAncestor(repo: Repository, ancestorHash: string, descendantHash: string): boolean {
  const visited = new Set<string>();
  const queue = [descendantHash];
  
  while (queue.length > 0) {
    const hash = queue.shift()!;
    
    if (hash === ancestorHash) {
      return true;
    }
    
    if (visited.has(hash)) {
      continue;
    }
    visited.add(hash);
    
    try {
      const commit = repo.objects.readCommit(hash);
      queue.push(...commit.parentHashes);
    } catch {
      // Skip on error
    }
    
    // Limit search depth
    if (visited.size > 1000) {
      return false;
    }
  }
  
  return false;
}

/**
 * Delete branches
 */
export function deleteBranches(branches: string[]): { deleted: string[]; errors: Array<{ branch: string; error: string }> } {
  const repo = Repository.find();
  const deleted: string[] = [];
  const errors: Array<{ branch: string; error: string }> = [];
  
  for (const branch of branches) {
    try {
      repo.refs.deleteBranch(branch);
      deleted.push(branch);
    } catch (error) {
      errors.push({
        branch,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  
  return { deleted, errors };
}

/**
 * CLI handler for cleanup
 */
export function handleCleanup(args: string[]): void {
  const options: CleanupOptions = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--dry-run' || arg === '-n') {
      options.dryRun = true;
    } else if (arg === '--force' || arg === '-f') {
      options.force = true;
    } else if (arg === '--merged') {
      options.merged = true;
    } else if (arg === '--stale') {
      options.stale = true;
    } else if (arg === '--all' || arg === '-a') {
      options.all = true;
    } else if (arg === '--days' && i + 1 < args.length) {
      options.staleDays = parseInt(args[i + 1], 10);
      i++;
    }
  }
  
  try {
    const candidates = analyzeBranches(options);
    
    if (candidates.length === 0) {
      console.log(colors.green('✓') + ' No branches to clean up');
      console.log(colors.dim('  All branches are either current, protected, or still active'));
      return;
    }
    
    // Show what we found
    console.log(colors.bold('Branch cleanup candidates:\n'));
    
    for (const branch of candidates) {
      let status = '';
      if (branch.isMerged) {
        status = colors.green('[merged]');
      } else if (branch.isStale) {
        status = colors.yellow(`[stale: ${branch.daysSinceLastCommit}d]`);
      }
      
      console.log(`  ${status} ${colors.cyan(branch.name)}`);
      console.log(colors.dim(`    Last commit: ${branch.lastCommitMessage.slice(0, 50)}`));
      console.log(colors.dim(`    Date: ${branch.lastCommitDate.toLocaleDateString()}`));
      console.log();
    }
    
    if (options.dryRun) {
      console.log(colors.yellow('Dry run - no branches deleted'));
      console.log(colors.dim('  Remove --dry-run to actually delete branches'));
      return;
    }
    
    // Confirm deletion
    if (!options.force) {
      console.log(colors.yellow(`\nThis will delete ${candidates.length} branch(es).`));
      console.log(colors.dim('Use --force to skip this confirmation.\n'));
      
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      
      rl.question('Continue? [y/N] ', (answer) => {
        rl.close();
        
        if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
          console.log('Aborted');
          return;
        }
        
        performCleanup(candidates.map(c => c.name));
      });
    } else {
      performCleanup(candidates.map(c => c.name));
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

/**
 * Perform the actual cleanup
 */
function performCleanup(branches: string[]): void {
  const result = deleteBranches(branches);
  
  if (result.deleted.length > 0) {
    console.log(colors.green(`\n✓ Deleted ${result.deleted.length} branch(es):`));
    for (const branch of result.deleted) {
      console.log(colors.dim(`  - ${branch}`));
    }
  }
  
  if (result.errors.length > 0) {
    console.log(colors.red(`\n✗ Failed to delete ${result.errors.length} branch(es):`));
    for (const error of result.errors) {
      console.log(colors.dim(`  - ${error.branch}: ${error.error}`));
    }
  }
}
