/**
 * Bisect Command
 * Binary search to find the commit that introduced a bug
 * 
 * Usage:
 * - wit bisect start              # Start bisect session
 * - wit bisect good [<rev>]       # Mark commit as good
 * - wit bisect bad [<rev>]        # Mark commit as bad
 * - wit bisect reset              # End bisect session
 * - wit bisect skip               # Skip current commit
 * - wit bisect log                # Show bisect log
 */

import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../core/repository';
import { TsgitError, ErrorCode } from '../core/errors';
import { exists, readFile, writeFile } from '../utils/fs';
import { parseRevision } from './reset';
import { colors } from '../utils/colors';

/**
 * Bisect state stored in .wit/BISECT_STATE.json
 */
export interface BisectState {
  active: boolean;
  originalHead: string;          // Original HEAD before bisect started
  originalBranch: string | null; // Original branch name
  good: string[];                // Commits marked as good
  bad: string[];                 // Commits marked as bad
  skipped: string[];             // Commits marked as skip
  currentCommit: string;         // Current commit being tested
  commitRange: string[];         // All commits in the range
  steps: number;                 // Number of bisect steps taken
  log: BisectLogEntry[];         // Log of all bisect operations
}

export interface BisectLogEntry {
  action: 'start' | 'good' | 'bad' | 'skip' | 'reset';
  commit?: string;
  timestamp: number;
  message: string;
}

/**
 * Bisect Manager - handles all bisect operations
 */
export class BisectManager {
  private statePath: string;

  constructor(private repo: Repository) {
    this.statePath = path.join(repo.gitDir, 'BISECT_STATE.json');
  }

  /**
   * Load bisect state
   */
  private loadState(): BisectState | null {
    if (!exists(this.statePath)) {
      return null;
    }

    try {
      const content = readFile(this.statePath).toString('utf8');
      return JSON.parse(content) as BisectState;
    } catch {
      return null;
    }
  }

  /**
   * Save bisect state
   */
  private saveState(state: BisectState): void {
    writeFile(this.statePath, JSON.stringify(state, null, 2));
  }

  /**
   * Clear bisect state
   */
  private clearState(): void {
    if (exists(this.statePath)) {
      fs.unlinkSync(this.statePath);
    }
  }

  /**
   * Check if bisect is active
   */
  isActive(): boolean {
    const state = this.loadState();
    return state !== null && state.active;
  }

  /**
   * Get current bisect state
   */
  getState(): BisectState | null {
    return this.loadState();
  }

  /**
   * Start a bisect session
   */
  start(): BisectState {
    if (this.isActive()) {
      throw new TsgitError(
        'Bisect session already in progress',
        ErrorCode.OPERATION_FAILED,
        [
          'wit bisect reset    # End current session first',
          'wit bisect log      # View current session'
        ]
      );
    }

    const head = this.repo.refs.resolve('HEAD');
    if (!head) {
      throw new TsgitError(
        'No commits to bisect',
        ErrorCode.NO_COMMITS_YET,
        ['Create some commits first']
      );
    }

    const branch = this.repo.refs.getCurrentBranch();

    const state: BisectState = {
      active: true,
      originalHead: head,
      originalBranch: branch,
      good: [],
      bad: [],
      skipped: [],
      currentCommit: head,
      commitRange: [],
      steps: 0,
      log: [{
        action: 'start',
        timestamp: Date.now(),
        message: `Bisect started from ${head.slice(0, 8)}`,
      }],
    };

    this.saveState(state);
    return state;
  }

  /**
   * Mark a commit as good
   */
  markGood(ref?: string): { state: BisectState; nextCommit: string | null; found: boolean } {
    const state = this.loadState();
    if (!state || !state.active) {
      throw new TsgitError(
        'No bisect session in progress',
        ErrorCode.OPERATION_FAILED,
        ['wit bisect start    # Start a new session']
      );
    }

    const commitHash = ref 
      ? parseRevision(this.repo, ref)
      : state.currentCommit;

    if (state.good.includes(commitHash)) {
      throw new TsgitError(
        'Commit already marked as good',
        ErrorCode.OPERATION_FAILED,
        []
      );
    }

    state.good.push(commitHash);
    state.log.push({
      action: 'good',
      commit: commitHash,
      timestamp: Date.now(),
      message: `Marked ${commitHash.slice(0, 8)} as good`,
    });

    return this.updateBisect(state);
  }

  /**
   * Mark a commit as bad
   */
  markBad(ref?: string): { state: BisectState; nextCommit: string | null; found: boolean } {
    const state = this.loadState();
    if (!state || !state.active) {
      throw new TsgitError(
        'No bisect session in progress',
        ErrorCode.OPERATION_FAILED,
        ['wit bisect start    # Start a new session']
      );
    }

    const commitHash = ref 
      ? parseRevision(this.repo, ref)
      : state.currentCommit;

    if (state.bad.includes(commitHash)) {
      throw new TsgitError(
        'Commit already marked as bad',
        ErrorCode.OPERATION_FAILED,
        []
      );
    }

    state.bad.push(commitHash);
    state.log.push({
      action: 'bad',
      commit: commitHash,
      timestamp: Date.now(),
      message: `Marked ${commitHash.slice(0, 8)} as bad`,
    });

    return this.updateBisect(state);
  }

  /**
   * Skip the current commit
   */
  skip(): { state: BisectState; nextCommit: string | null; found: boolean } {
    const state = this.loadState();
    if (!state || !state.active) {
      throw new TsgitError(
        'No bisect session in progress',
        ErrorCode.OPERATION_FAILED,
        ['wit bisect start    # Start a new session']
      );
    }

    state.skipped.push(state.currentCommit);
    state.log.push({
      action: 'skip',
      commit: state.currentCommit,
      timestamp: Date.now(),
      message: `Skipped ${state.currentCommit.slice(0, 8)}`,
    });

    return this.updateBisect(state);
  }

  /**
   * Update bisect state and find next commit to test
   */
  private updateBisect(state: BisectState): { state: BisectState; nextCommit: string | null; found: boolean } {
    // Need at least one good and one bad commit to bisect
    if (state.good.length === 0 || state.bad.length === 0) {
      this.saveState(state);
      return { state, nextCommit: null, found: false };
    }

    // Build the range of commits between good and bad
    const range = this.buildCommitRange(state);
    state.commitRange = range;

    // Filter out already marked and skipped commits
    const candidates = range.filter(
      c => !state.skipped.includes(c) && 
           !state.good.includes(c) && 
           !state.bad.includes(c)
    );

    if (candidates.length === 0) {
      // No untested commits left - we've found the culprit
      // The culprit is the earliest commit marked as bad in the range
      const badInRange = range.filter(c => state.bad.includes(c));
      if (badInRange.length > 0) {
        const culprit = badInRange[0]; // First (earliest) bad commit
        state.currentCommit = culprit;
        this.saveState(state);
        return { state, nextCommit: culprit, found: true };
      }
      this.saveState(state);
      return { state, nextCommit: null, found: false };
    }

    // Binary search: pick the middle commit (or the only one if just 1 left)
    const midIndex = Math.floor(candidates.length / 2);
    const nextCommit = candidates[midIndex];
    
    state.currentCommit = nextCommit;
    state.steps++;

    // Checkout the commit
    this.checkoutCommit(nextCommit);

    this.saveState(state);

    // remaining steps: Math.ceil(Math.log2(candidates.length))
    return { state, nextCommit, found: false };
  }

  /**
   * Build the range of commits between the first good and the first bad
   */
  private buildCommitRange(state: BisectState): string[] {
    // For simplicity, walk from the bad commit back to the good commit
    const badCommit = state.bad[0];
    const goodCommits = new Set(state.good);
    
    const range: string[] = [];
    const visited = new Set<string>();
    const queue = [badCommit];

    while (queue.length > 0) {
      const hash = queue.shift()!;
      
      if (visited.has(hash)) continue;
      visited.add(hash);

      // Stop if we've reached a good commit
      if (goodCommits.has(hash)) continue;

      range.push(hash);

      try {
        const commit = this.repo.objects.readCommit(hash);
        for (const parentHash of commit.parentHashes) {
          if (!visited.has(parentHash)) {
            queue.push(parentHash);
          }
        }
      } catch {
        // Skip commits that can't be read
      }
    }

    // Reverse to get chronological order (oldest first)
    return range.reverse();
  }

  /**
   * Checkout a specific commit
   */
  private checkoutCommit(commitHash: string): void {
    this.repo.checkout(commitHash, false);
  }

  /**
   * Reset/end bisect session
   */
  reset(): { originalBranch: string | null; originalHead: string } {
    const state = this.loadState();
    if (!state || !state.active) {
      throw new TsgitError(
        'No bisect session in progress',
        ErrorCode.OPERATION_FAILED,
        []
      );
    }

    // Restore original state
    if (state.originalBranch) {
      this.repo.checkout(state.originalBranch, false);
    } else {
      this.checkoutCommit(state.originalHead);
    }

    const result = {
      originalBranch: state.originalBranch,
      originalHead: state.originalHead,
    };

    this.clearState();

    return result;
  }

  /**
   * Get bisect log
   */
  getLog(): BisectLogEntry[] {
    const state = this.loadState();
    if (!state) {
      return [];
    }
    return state.log;
  }

  /**
   * Get remaining commits to test
   */
  getRemainingCount(): number {
    const state = this.loadState();
    if (!state || !state.active) return 0;

    const candidates = state.commitRange.filter(
      c => !state.skipped.includes(c) && 
           !state.good.includes(c) && 
           !state.bad.includes(c)
    );

    return candidates.length;
  }

  /**
   * Estimate remaining steps
   */
  estimateSteps(): number {
    const remaining = this.getRemainingCount();
    if (remaining <= 1) return 0;
    return Math.ceil(Math.log2(remaining));
  }
}

/**
 * CLI handler for bisect command
 */
export function handleBisect(args: string[]): void {
  const repo = Repository.find();
  const bisect = new BisectManager(repo);

  const subcommand = args[0];

  try {
    switch (subcommand) {
      case 'start': {
        const state = bisect.start();
        console.log(colors.green('✓') + ' Bisect session started');
        console.log();
        console.log('Now mark commits as good or bad:');
        console.log(colors.dim('  wit bisect good <commit>  # Known working commit'));
        console.log(colors.dim('  wit bisect bad <commit>   # Known broken commit'));
        console.log();
        console.log(colors.dim('Current commit: ' + state.currentCommit.slice(0, 8)));
        break;
      }

      case 'good': {
        const { state, nextCommit, found } = bisect.markGood(args[1]);
        
        if (found) {
          console.log(colors.green('✓') + ' Found the first bad commit!');
          console.log();
          console.log(colors.bold(colors.red(nextCommit!.slice(0, 8))) + ' is the first bad commit');
          showCommitInfo(repo, nextCommit!);
          console.log();
          console.log(colors.dim('Run "wit bisect reset" to end the session'));
        } else if (nextCommit) {
          const remaining = bisect.estimateSteps();
          console.log(colors.green('✓') + ' Marked as good');
          console.log(`Bisecting: ${bisect.getRemainingCount()} commits left to test`);
          console.log(colors.dim(`(roughly ${remaining} step${remaining !== 1 ? 's' : ''} remaining)`));
          console.log();
          console.log(`Testing: ${colors.yellow(nextCommit.slice(0, 8))}`);
          showCommitInfo(repo, nextCommit);
        } else {
          console.log(colors.green('✓') + ' Marked as good');
          if (state.bad.length === 0) {
            console.log(colors.cyan('Now mark a bad commit:'));
            console.log(colors.dim('  wit bisect bad <commit>'));
          }
        }
        break;
      }

      case 'bad': {
        const { state, nextCommit, found } = bisect.markBad(args[1]);
        
        if (found) {
          console.log(colors.green('✓') + ' Found the first bad commit!');
          console.log();
          console.log(colors.bold(colors.red(nextCommit!.slice(0, 8))) + ' is the first bad commit');
          showCommitInfo(repo, nextCommit!);
          console.log();
          console.log(colors.dim('Run "wit bisect reset" to end the session'));
        } else if (nextCommit) {
          const remaining = bisect.estimateSteps();
          console.log(colors.red('✗') + ' Marked as bad');
          console.log(`Bisecting: ${bisect.getRemainingCount()} commits left to test`);
          console.log(colors.dim(`(roughly ${remaining} step${remaining !== 1 ? 's' : ''} remaining)`));
          console.log();
          console.log(`Testing: ${colors.yellow(nextCommit.slice(0, 8))}`);
          showCommitInfo(repo, nextCommit);
        } else {
          console.log(colors.red('✗') + ' Marked as bad');
          if (state.good.length === 0) {
            console.log(colors.cyan('Now mark a good commit:'));
            console.log(colors.dim('  wit bisect good <commit>'));
          }
        }
        break;
      }

      case 'skip': {
        const { nextCommit, found } = bisect.skip();
        
        if (found) {
          console.log(colors.green('✓') + ' Found the first bad commit!');
          console.log();
          console.log(colors.bold(colors.red(nextCommit!.slice(0, 8))) + ' is the first bad commit');
          showCommitInfo(repo, nextCommit!);
        } else if (nextCommit) {
          console.log(colors.yellow('○') + ' Skipped current commit');
          console.log(`Testing: ${colors.yellow(nextCommit.slice(0, 8))}`);
          showCommitInfo(repo, nextCommit);
        } else {
          console.log(colors.yellow('○') + ' Skipped current commit');
          console.log(colors.dim('No more commits to test'));
        }
        break;
      }

      case 'reset': {
        const { originalBranch, originalHead } = bisect.reset();
        console.log(colors.green('✓') + ' Bisect session ended');
        if (originalBranch) {
          console.log(colors.dim(`Restored to branch: ${originalBranch}`));
        } else {
          console.log(colors.dim(`Restored to: ${originalHead.slice(0, 8)}`));
        }
        break;
      }

      case 'log': {
        const log = bisect.getLog();
        
        if (log.length === 0) {
          console.log(colors.dim('No bisect session in progress'));
          break;
        }

        console.log(colors.bold('Bisect Log:'));
        console.log();
        
        for (const entry of log) {
          const date = new Date(entry.timestamp);
          const time = date.toLocaleTimeString();
          
          let icon = '';
          let color = (s: string) => s;
          
          switch (entry.action) {
            case 'start':
              icon = '●';
              color = colors.cyan;
              break;
            case 'good':
              icon = '✓';
              color = colors.green;
              break;
            case 'bad':
              icon = '✗';
              color = colors.red;
              break;
            case 'skip':
              icon = '○';
              color = colors.yellow;
              break;
            case 'reset':
              icon = '◼';
              color = colors.dim;
              break;
          }
          
          console.log(`${colors.dim(time)} ${color(icon)} ${entry.message}`);
        }
        break;
      }

      case 'status':
      case undefined: {
        const state = bisect.getState();
        
        if (!state || !state.active) {
          console.log(colors.dim('No bisect session in progress'));
          console.log();
          console.log('To start bisecting:');
          console.log(colors.dim('  wit bisect start'));
          break;
        }

        console.log(colors.bold('Bisect Status:'));
        console.log();
        console.log(`Current commit: ${colors.yellow(state.currentCommit.slice(0, 8))}`);
        console.log(`Good commits: ${state.good.length}`);
        console.log(`Bad commits: ${state.bad.length}`);
        console.log(`Skipped: ${state.skipped.length}`);
        console.log(`Steps taken: ${state.steps}`);
        
        const remaining = bisect.getRemainingCount();
        const estimatedSteps = bisect.estimateSteps();
        
        if (remaining > 0) {
          console.log();
          console.log(`${remaining} commits left to test`);
          console.log(colors.dim(`(roughly ${estimatedSteps} step${estimatedSteps !== 1 ? 's' : ''} remaining)`));
        }
        break;
      }

      default:
        console.error(colors.red('error: ') + `Unknown bisect subcommand: ${subcommand}`);
        console.error();
        console.error('Usage:');
        console.error('  wit bisect start           Start bisect session');
        console.error('  wit bisect good [<rev>]    Mark commit as good');
        console.error('  wit bisect bad [<rev>]     Mark commit as bad');
        console.error('  wit bisect skip            Skip current commit');
        console.error('  wit bisect reset           End bisect session');
        console.error('  wit bisect log             Show bisect log');
        console.error('  wit bisect status          Show current status');
        process.exit(1);
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
 * Show commit info for a given hash
 */
function showCommitInfo(repo: Repository, hash: string): void {
  try {
    const commit = repo.objects.readCommit(hash);
    const firstLine = commit.message.split('\n')[0];
    console.log(colors.dim(`  ${commit.author.name}: ${firstLine}`));
  } catch {
    // Ignore errors reading commit
  }
}
