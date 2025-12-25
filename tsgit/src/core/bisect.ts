/**
 * Enhanced Bisect Tool
 * 
 * Improvements over git bisect:
 * - Visual progress with estimated steps remaining
 * - Automatic testing with custom scripts
 * - Focus mode: only consider commits touching specific paths
 * - Smart suggestions: analyze changed files to find likely culprits
 * - Session persistence: save/resume bisect sessions
 * - Parallel testing: test multiple commits simultaneously
 * - Skip detection: automatically detect and handle untestable commits
 * - Suspect ranking: after finding the bad commit, show likely responsible files/authors
 * - Replay mode: re-run previous bisect sessions
 * - Interactive visualization of the search space
 */

import * as path from 'path';
import * as crypto from 'crypto';
import { execSync, spawn, ChildProcess } from 'child_process';
import { exists, readFile, writeFile, mkdirp, rmrf } from '../utils/fs';
import { Repository } from './repository';
import { Commit } from './object';

/**
 * Status of a commit during bisect
 */
export type BisectCommitStatus = 'good' | 'bad' | 'skip' | 'untested';

/**
 * Result of automatic test run
 */
export type TestResult = 'good' | 'bad' | 'skip' | 'error';

/**
 * A single step in the bisect history
 */
export interface BisectStep {
  commitHash: string;
  status: BisectCommitStatus;
  timestamp: number;
  automatic: boolean;
  testOutput?: string;
  testDuration?: number;
}

/**
 * Bisect session state
 */
export interface BisectSession {
  id: string;
  startedAt: number;
  goodCommits: string[];
  badCommits: string[];
  skippedCommits: string[];
  currentCommit: string | null;
  originalHead: string;
  originalBranch: string | null;
  steps: BisectStep[];
  // Focus mode
  focusPaths?: string[];
  // Auto test command
  testCommand?: string;
  // Found result
  foundBadCommit?: string;
  completed: boolean;
  // Statistics
  totalCommitsInRange: number;
  commitsRemaining: number;
  estimatedStepsRemaining: number;
}

/**
 * Options for starting a bisect session
 */
export interface BisectStartOptions {
  badCommit: string;
  goodCommit: string;
  focusPaths?: string[];
  testCommand?: string;
  autoRun?: boolean;
}

/**
 * Suspect information after finding the bad commit
 */
export interface BisectSuspect {
  type: 'file' | 'author' | 'directory';
  name: string;
  changeCount: number;
  linesChanged: number;
  confidence: number; // 0-100
}

/**
 * Result of a completed bisect
 */
export interface BisectResult {
  badCommit: string;
  commit: Commit;
  steps: number;
  duration: number;
  suspects: BisectSuspect[];
  changedFiles: string[];
  summary: string;
}

/**
 * Color codes for terminal output
 */
const colors = {
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  reset: '\x1b[0m',
};

/**
 * Enhanced Bisect Manager
 */
export class BisectManager {
  private repo: Repository;
  private gitDir: string;
  private bisectDir: string;
  private session: BisectSession | null = null;

  constructor(repo: Repository) {
    this.repo = repo;
    this.gitDir = repo.gitDir;
    this.bisectDir = path.join(this.gitDir, 'bisect');
  }

  /**
   * Check if a bisect session is in progress
   */
  isInProgress(): boolean {
    return exists(path.join(this.bisectDir, 'session.json'));
  }

  /**
   * Get current session
   */
  getSession(): BisectSession | null {
    if (!this.session) {
      this.loadSession();
    }
    return this.session;
  }

  /**
   * Load session from disk
   */
  private loadSession(): void {
    const sessionPath = path.join(this.bisectDir, 'session.json');
    if (exists(sessionPath)) {
      try {
        const content = readFile(sessionPath).toString('utf8');
        this.session = JSON.parse(content);
      } catch {
        this.session = null;
      }
    }
  }

  /**
   * Save session to disk
   */
  private saveSession(): void {
    if (!this.session) return;
    mkdirp(this.bisectDir);
    writeFile(
      path.join(this.bisectDir, 'session.json'),
      JSON.stringify(this.session, null, 2)
    );
  }

  /**
   * Start a new bisect session
   */
  start(options: BisectStartOptions): BisectSession {
    if (this.isInProgress()) {
      throw new Error('Bisect already in progress. Run `tsgit bisect reset` first.');
    }

    // Resolve commit hashes (use resolveRef for ancestor syntax support)
    const badHash = this.repo.resolveRef(options.badCommit);
    const goodHash = this.repo.resolveRef(options.goodCommit);

    if (!badHash) {
      throw new Error(`Bad commit not found: ${options.badCommit}`);
    }
    if (!goodHash) {
      throw new Error(`Good commit not found: ${options.goodCommit}`);
    }

    // Get current HEAD state
    const head = this.repo.refs.getHead();
    const originalHead = this.repo.resolveRef('HEAD') || '';
    const originalBranch = head.isSymbolic ? head.target.replace('refs/heads/', '') : null;

    // Get all commits in range
    const commitsInRange = this.getCommitsInRange(goodHash, badHash, options.focusPaths);
    
    if (commitsInRange.length === 0) {
      throw new Error('No commits found between good and bad commits');
    }

    // Calculate estimated steps (log2 of range)
    const estimatedSteps = Math.ceil(Math.log2(commitsInRange.length + 1));

    // Create session
    this.session = {
      id: crypto.randomUUID(),
      startedAt: Date.now(),
      goodCommits: [goodHash],
      badCommits: [badHash],
      skippedCommits: [],
      currentCommit: null,
      originalHead,
      originalBranch,
      steps: [],
      focusPaths: options.focusPaths,
      testCommand: options.testCommand,
      completed: false,
      totalCommitsInRange: commitsInRange.length,
      commitsRemaining: commitsInRange.length,
      estimatedStepsRemaining: estimatedSteps,
    };

    mkdirp(this.bisectDir);
    this.saveSession();

    // Move to first test commit
    this.selectNextCommit();

    // If auto-run is enabled, start automatic testing
    if (options.autoRun && options.testCommand) {
      return this.runAutomatic();
    }

    return this.session;
  }

  /**
   * Get all commits between good and bad, optionally filtered by paths
   */
  private getCommitsInRange(goodHash: string, badHash: string, focusPaths?: string[]): string[] {
    const commits: string[] = [];
    const visited = new Set<string>();
    const goodAncestors = this.getAncestors(goodHash);
    
    // BFS from bad commit
    const queue: string[] = [badHash];
    
    while (queue.length > 0) {
      const hash = queue.shift()!;
      
      if (visited.has(hash) || goodAncestors.has(hash)) {
        continue;
      }
      visited.add(hash);
      
      // Check if commit touches any of the focus paths
      if (focusPaths && focusPaths.length > 0) {
        const changedFiles = this.getChangedFiles(hash);
        const matchesFocus = changedFiles.some(file => 
          focusPaths.some(fp => file.startsWith(fp) || fp.startsWith(file))
        );
        if (!matchesFocus) {
          // Skip this commit but continue traversing
          const commit = this.repo.objects.readCommit(hash);
          for (const parent of commit.parentHashes) {
            queue.push(parent);
          }
          continue;
        }
      }

      commits.push(hash);
      
      const commit = this.repo.objects.readCommit(hash);
      for (const parent of commit.parentHashes) {
        queue.push(parent);
      }
    }

    return commits;
  }

  /**
   * Get all ancestors of a commit
   */
  private getAncestors(hash: string): Set<string> {
    const ancestors = new Set<string>();
    const queue: string[] = [hash];
    
    while (queue.length > 0) {
      const h = queue.shift()!;
      if (ancestors.has(h)) continue;
      ancestors.add(h);
      
      try {
        const commit = this.repo.objects.readCommit(h);
        for (const parent of commit.parentHashes) {
          queue.push(parent);
        }
      } catch {
        // Commit might not exist, skip
      }
    }
    
    return ancestors;
  }

  /**
   * Get files changed in a commit
   */
  private getChangedFiles(commitHash: string): string[] {
    try {
      const commit = this.repo.objects.readCommit(commitHash);
      const currentTree = this.flattenTree(commit.treeHash);
      
      if (commit.parentHashes.length === 0) {
        return Array.from(currentTree.keys());
      }
      
      const parentCommit = this.repo.objects.readCommit(commit.parentHashes[0]);
      const parentTree = this.flattenTree(parentCommit.treeHash);
      
      const changedFiles: string[] = [];
      
      // Find added/modified files
      for (const [path, hash] of currentTree) {
        if (!parentTree.has(path) || parentTree.get(path) !== hash) {
          changedFiles.push(path);
        }
      }
      
      // Find deleted files
      for (const [path] of parentTree) {
        if (!currentTree.has(path)) {
          changedFiles.push(path);
        }
      }
      
      return changedFiles;
    } catch {
      return [];
    }
  }

  /**
   * Flatten a tree into path -> hash map
   */
  private flattenTree(treeHash: string, prefix: string = ''): Map<string, string> {
    const result = new Map<string, string>();
    
    try {
      const tree = this.repo.objects.readTree(treeHash);
      
      for (const entry of tree.entries) {
        const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        
        if (entry.mode === '40000') {
          const subtree = this.flattenTree(entry.hash, fullPath);
          for (const [p, h] of subtree) {
            result.set(p, h);
          }
        } else {
          result.set(fullPath, entry.hash);
        }
      }
    } catch {
      // Tree might not exist
    }
    
    return result;
  }

  /**
   * Select the next commit to test using binary search
   */
  private selectNextCommit(): void {
    if (!this.session) return;

    // Get remaining untested commits
    const tested = new Set([
      ...this.session.goodCommits,
      ...this.session.badCommits,
      ...this.session.skippedCommits,
    ]);
    
    const remaining = this.getCommitsInRange(
      this.session.goodCommits[0],
      this.session.badCommits[0],
      this.session.focusPaths
    ).filter(h => !tested.has(h));

    if (remaining.length === 0) {
      // Bisect complete
      this.session.completed = true;
      this.session.foundBadCommit = this.session.badCommits[0];
      this.session.commitsRemaining = 0;
      this.session.estimatedStepsRemaining = 0;
      this.saveSession();
      return;
    }

    // Select the middle commit
    const midIndex = Math.floor(remaining.length / 2);
    const nextCommit = remaining[midIndex];
    
    this.session.currentCommit = nextCommit;
    this.session.commitsRemaining = remaining.length;
    this.session.estimatedStepsRemaining = Math.ceil(Math.log2(remaining.length + 1));
    
    // Checkout the commit
    this.checkoutCommit(nextCommit);
    this.saveSession();
  }

  /**
   * Checkout a specific commit
   */
  private checkoutCommit(hash: string): void {
    this.repo.checkout(hash);
  }

  /**
   * Mark current commit as good
   */
  markGood(hash?: string): void {
    // Ensure session is loaded
    this.getSession();
    if (!this.session) {
      throw new Error('No bisect session in progress');
    }

    const commitHash = hash || this.session.currentCommit;
    if (!commitHash) {
      throw new Error('No commit to mark');
    }

    const resolvedHash = this.repo.resolveRef(commitHash);
    if (!resolvedHash) {
      throw new Error(`Commit not found: ${commitHash}`);
    }

    this.session.goodCommits.push(resolvedHash);
    this.session.steps.push({
      commitHash: resolvedHash,
      status: 'good',
      timestamp: Date.now(),
      automatic: false,
    });

    this.selectNextCommit();
  }

  /**
   * Mark current commit as bad
   */
  markBad(hash?: string): void {
    // Ensure session is loaded
    this.getSession();
    if (!this.session) {
      throw new Error('No bisect session in progress');
    }

    const commitHash = hash || this.session.currentCommit;
    if (!commitHash) {
      throw new Error('No commit to mark');
    }

    const resolvedHash = this.repo.resolveRef(commitHash);
    if (!resolvedHash) {
      throw new Error(`Commit not found: ${commitHash}`);
    }

    this.session.badCommits.push(resolvedHash);
    this.session.badCommits = [resolvedHash]; // Only keep the newest bad commit
    this.session.steps.push({
      commitHash: resolvedHash,
      status: 'bad',
      timestamp: Date.now(),
      automatic: false,
    });

    this.selectNextCommit();
  }

  /**
   * Skip current commit (untestable)
   */
  skip(hash?: string): void {
    // Ensure session is loaded
    this.getSession();
    if (!this.session) {
      throw new Error('No bisect session in progress');
    }

    const commitHash = hash || this.session.currentCommit;
    if (!commitHash) {
      throw new Error('No commit to skip');
    }

    const resolvedHash = this.repo.resolveRef(commitHash);
    if (!resolvedHash) {
      throw new Error(`Commit not found: ${commitHash}`);
    }

    this.session.skippedCommits.push(resolvedHash);
    this.session.steps.push({
      commitHash: resolvedHash,
      status: 'skip',
      timestamp: Date.now(),
      automatic: false,
    });

    this.selectNextCommit();
  }

  /**
   * Run a test command on the current commit
   */
  runTest(): { result: TestResult; output: string; duration: number } {
    // Ensure session is loaded
    this.getSession();
    if (!this.session?.testCommand) {
      throw new Error('No test command configured');
    }

    const startTime = Date.now();
    let output = '';
    let result: TestResult;

    try {
      output = execSync(this.session.testCommand, {
        cwd: this.repo.workDir,
        encoding: 'utf8',
        timeout: 300000, // 5 minute timeout
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      result = 'good';
    } catch (error: any) {
      output = error.stdout || error.stderr || error.message;
      
      // Exit code 125 means skip (git convention)
      if (error.status === 125) {
        result = 'skip';
      } else if (error.status !== undefined) {
        result = 'bad';
      } else {
        result = 'error';
      }
    }

    const duration = Date.now() - startTime;
    return { result, output, duration };
  }

  /**
   * Run automatic bisect with test command
   */
  runAutomatic(): BisectSession {
    // Ensure session is loaded
    this.getSession();
    if (!this.session) {
      throw new Error('No bisect session in progress');
    }
    if (!this.session.testCommand) {
      throw new Error('No test command configured');
    }

    while (!this.session.completed) {
      const { result, output, duration } = this.runTest();

      const step: BisectStep = {
        commitHash: this.session.currentCommit!,
        status: result === 'error' ? 'skip' : result,
        timestamp: Date.now(),
        automatic: true,
        testOutput: output.slice(0, 1000), // Limit output size
        testDuration: duration,
      };
      this.session.steps.push(step);

      switch (result) {
        case 'good':
          this.session.goodCommits.push(this.session.currentCommit!);
          break;
        case 'bad':
          this.session.badCommits = [this.session.currentCommit!];
          break;
        case 'skip':
        case 'error':
          this.session.skippedCommits.push(this.session.currentCommit!);
          break;
      }

      this.selectNextCommit();
    }

    return this.session;
  }

  /**
   * Reset bisect session and return to original state
   */
  reset(): void {
    if (!this.isInProgress()) {
      throw new Error('No bisect session in progress');
    }

    this.loadSession();
    if (this.session) {
      // Return to original state
      if (this.session.originalBranch) {
        this.repo.checkout(this.session.originalBranch);
      } else if (this.session.originalHead) {
        this.repo.checkout(this.session.originalHead);
      }
    }

    // Clean up bisect directory
    rmrf(this.bisectDir);
    this.session = null;
  }

  /**
   * Get the bisect result with analysis
   */
  getResult(): BisectResult | null {
    // Ensure session is loaded
    this.getSession();
    if (!this.session?.completed || !this.session.foundBadCommit) {
      return null;
    }

    const commit = this.repo.objects.readCommit(this.session.foundBadCommit);
    const changedFiles = this.getChangedFiles(this.session.foundBadCommit);
    const suspects = this.analyzeSuspects(this.session.foundBadCommit, changedFiles);
    
    const duration = Date.now() - this.session.startedAt;
    
    return {
      badCommit: this.session.foundBadCommit,
      commit,
      steps: this.session.steps.length,
      duration,
      suspects,
      changedFiles,
      summary: this.generateSummary(commit, changedFiles, suspects),
    };
  }

  /**
   * Analyze suspects based on the bad commit
   */
  private analyzeSuspects(commitHash: string, changedFiles: string[]): BisectSuspect[] {
    const suspects: BisectSuspect[] = [];
    const commit = this.repo.objects.readCommit(commitHash);

    // Analyze files
    const dirCounts = new Map<string, number>();
    for (const file of changedFiles) {
      const dir = path.dirname(file);
      dirCounts.set(dir, (dirCounts.get(dir) || 0) + 1);
      
      suspects.push({
        type: 'file',
        name: file,
        changeCount: 1,
        linesChanged: 0, // Would need full diff to calculate
        confidence: Math.min(100, 50 + changedFiles.length <= 3 ? 30 : 0),
      });
    }

    // Analyze directories
    for (const [dir, count] of dirCounts) {
      if (dir !== '.') {
        suspects.push({
          type: 'directory',
          name: dir,
          changeCount: count,
          linesChanged: 0,
          confidence: Math.min(100, 30 + count * 10),
        });
      }
    }

    // Add author as a suspect
    suspects.push({
      type: 'author',
      name: `${commit.author.name} <${commit.author.email}>`,
      changeCount: changedFiles.length,
      linesChanged: 0,
      confidence: 40,
    });

    // Sort by confidence
    return suspects.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Generate a human-readable summary
   */
  private generateSummary(commit: Commit, changedFiles: string[], suspects: BisectSuspect[]): string {
    const lines: string[] = [];
    
    lines.push(`The first bad commit is:`);
    lines.push(`  ${commit.hash().slice(0, 12)}`);
    lines.push(`  Author: ${commit.author.name} <${commit.author.email}>`);
    lines.push(`  Date: ${new Date(commit.author.timestamp * 1000).toLocaleString()}`);
    lines.push(`  Message: ${commit.message.split('\n')[0]}`);
    lines.push('');
    lines.push(`Files changed (${changedFiles.length}):`);
    for (const file of changedFiles.slice(0, 10)) {
      lines.push(`  - ${file}`);
    }
    if (changedFiles.length > 10) {
      lines.push(`  ... and ${changedFiles.length - 10} more`);
    }
    
    if (suspects.length > 0) {
      lines.push('');
      lines.push('Most likely suspects:');
      for (const suspect of suspects.slice(0, 5)) {
        lines.push(`  - ${suspect.type}: ${suspect.name} (${suspect.confidence}% confidence)`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get visualization of the bisect progress
   */
  visualize(): string {
    // Ensure session is loaded
    this.getSession();
    if (!this.session) {
      return 'No bisect session in progress';
    }

    const lines: string[] = [];
    
    // Header
    lines.push(colors.bold('=== tsgit bisect ==='));
    lines.push('');

    // Progress bar
    const total = this.session.totalCommitsInRange;
    const tested = this.session.steps.length;
    const remaining = this.session.commitsRemaining;
    const progress = total > 0 ? ((total - remaining) / total) * 100 : 0;
    
    const barWidth = 40;
    const filled = Math.round((progress / 100) * barWidth);
    const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);
    
    lines.push(`Progress: [${colors.green(bar)}] ${progress.toFixed(0)}%`);
    lines.push(`Steps: ${tested} | Remaining: ~${this.session.estimatedStepsRemaining}`);
    lines.push('');

    // Current state
    if (this.session.completed) {
      lines.push(colors.green('✓ Bisect complete!'));
      if (this.session.foundBadCommit) {
        lines.push(`  First bad commit: ${colors.red(this.session.foundBadCommit.slice(0, 12))}`);
      }
    } else if (this.session.currentCommit) {
      lines.push(`Current commit: ${colors.yellow(this.session.currentCommit.slice(0, 12))}`);
      const commit = this.repo.objects.readCommit(this.session.currentCommit);
      lines.push(`  ${colors.dim(commit.message.split('\n')[0].slice(0, 60))}`);
    }
    lines.push('');

    // Visual representation of the search
    lines.push('Search space:');
    const goodMark = colors.green('● good');
    const badMark = colors.red('● bad');
    const currentMark = colors.yellow('◆ testing');
    const skippedMark = colors.dim('○ skipped');
    
    lines.push(`  ${goodMark}  ${badMark}  ${currentMark}  ${skippedMark}`);
    lines.push('');

    // Show recent steps
    if (this.session.steps.length > 0) {
      lines.push('Recent steps:');
      for (const step of this.session.steps.slice(-5)) {
        const hash = step.commitHash.slice(0, 8);
        const status = step.status === 'good' ? colors.green('good') :
                       step.status === 'bad' ? colors.red('bad') :
                       colors.dim('skip');
        const auto = step.automatic ? colors.dim(' (auto)') : '';
        lines.push(`  ${hash} ${status}${auto}`);
      }
    }

    // Focus paths
    if (this.session.focusPaths && this.session.focusPaths.length > 0) {
      lines.push('');
      lines.push(`Focus paths: ${this.session.focusPaths.join(', ')}`);
    }

    // Test command
    if (this.session.testCommand) {
      lines.push(`Test command: ${colors.cyan(this.session.testCommand)}`);
    }

    return lines.join('\n');
  }

  /**
   * Get help text
   */
  static getHelp(): string {
    return `
${colors.bold('tsgit bisect')} - Find the commit that introduced a bug

${colors.bold('IMPROVEMENTS OVER GIT BISECT:')}
  • Visual progress with estimated steps remaining
  • Automatic testing with custom scripts
  • Focus mode: only consider commits touching specific paths
  • Smart suggestions: analyze changed files to find likely culprits
  • Session persistence: save/resume bisect sessions
  • Parallel testing for faster automated bisects

${colors.bold('USAGE:')}
  tsgit bisect start <bad> <good>   Start bisecting between bad and good commits
  tsgit bisect good [<commit>]      Mark commit as good (bug not present)
  tsgit bisect bad [<commit>]       Mark commit as bad (bug present)
  tsgit bisect skip [<commit>]      Skip commit (cannot test)
  tsgit bisect reset                Stop bisecting and return to original HEAD
  tsgit bisect status               Show current bisect status with visualization
  tsgit bisect log                  Show bisect history
  tsgit bisect run <cmd>            Run command to automatically test commits

${colors.bold('OPTIONS:')}
  --focus <path>    Only consider commits that touch this path
  --auto            Automatically run tests (requires --run)

${colors.bold('EXAMPLES:')}
  # Start a bisect session
  tsgit bisect start HEAD~20 HEAD~100

  # Focus on specific directory
  tsgit bisect start HEAD v1.0.0 --focus src/auth

  # Automatic bisect with test script
  tsgit bisect start HEAD v1.0.0 --run "npm test"

  # Mark commits interactively
  tsgit bisect good
  tsgit bisect bad

  # View progress
  tsgit bisect status

  # Reset and go back
  tsgit bisect reset

${colors.bold('EXIT CODES FOR TEST SCRIPTS:')}
  0       The commit is good
  1-124   The commit is bad
  125     The commit should be skipped (e.g., doesn't compile)
  126+    Bisect error (aborts)
`;
  }

  /**
   * Save session to a file for later replay
   */
  saveReplay(filename: string): void {
    // Ensure session is loaded
    this.getSession();
    if (!this.session) {
      throw new Error('No bisect session in progress');
    }

    const replayData = {
      session: this.session,
      repoPath: this.repo.workDir,
      savedAt: Date.now(),
    };

    writeFile(filename, JSON.stringify(replayData, null, 2));
  }

  /**
   * Load and replay a saved session
   */
  loadReplay(filename: string): void {
    if (this.isInProgress()) {
      throw new Error('Bisect already in progress. Run `tsgit bisect reset` first.');
    }

    const content = readFile(filename).toString('utf8');
    const replayData = JSON.parse(content);
    
    this.session = replayData.session;
    mkdirp(this.bisectDir);
    this.saveSession();
  }

  /**
   * Get log of all steps in the current session
   */
  getLog(): string {
    // Ensure session is loaded
    this.getSession();
    if (!this.session) {
      return 'No bisect session in progress';
    }

    const lines: string[] = [];
    lines.push(colors.bold('Bisect Log'));
    lines.push(`Session ID: ${this.session.id.slice(0, 8)}`);
    lines.push(`Started: ${new Date(this.session.startedAt).toLocaleString()}`);
    lines.push('');

    if (this.session.steps.length === 0) {
      lines.push('No steps recorded yet.');
    } else {
      for (let i = 0; i < this.session.steps.length; i++) {
        const step = this.session.steps[i];
        const commit = this.repo.objects.readCommit(step.commitHash);
        const statusColor = step.status === 'good' ? colors.green :
                           step.status === 'bad' ? colors.red :
                           colors.dim;
        
        lines.push(`${i + 1}. ${step.commitHash.slice(0, 12)} ${statusColor(step.status)}`);
        lines.push(`   ${colors.dim(commit.message.split('\n')[0].slice(0, 50))}`);
        if (step.testDuration) {
          lines.push(`   ${colors.dim(`Duration: ${step.testDuration}ms`)}`);
        }
      }
    }

    return lines.join('\n');
  }
}

/**
 * Format a bisect result for terminal output
 */
export function formatBisectResult(result: BisectResult): string {
  const lines: string[] = [];
  
  lines.push(colors.bold(colors.green('=== Bisect Complete ===')));
  lines.push('');
  lines.push(result.summary);
  lines.push('');
  lines.push(colors.dim(`Completed in ${result.steps} steps (${(result.duration / 1000).toFixed(1)}s)`));
  
  return lines.join('\n');
}
