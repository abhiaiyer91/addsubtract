/**
 * Rebase Command
 * Reapply commits on top of another base tip
 * 
 * Features:
 * - Basic rebase onto another branch
 * - Interactive rebase with pick, reword, edit, squash, fixup, drop
 * - Continue, abort, skip functionality
 */

import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../core/repository';
import { Commit, Tree } from '../core/object';
import { TsgitError, ErrorCode } from '../core/errors';
import { exists, mkdirp } from '../utils/fs';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

export type RebaseAction = 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop';

export interface RebaseStep {
  action: RebaseAction;
  commitHash: string;
  message: string;
  newMessage?: string;  // For reword action
}

export interface RebaseState {
  onto: string;                    // Base commit to rebase onto
  originalBranch: string | null;   // Branch being rebased
  originalHead: string;            // Original HEAD before rebase
  steps: RebaseStep[];             // All steps
  currentStep: number;             // Current step index
  currentCommit?: string;          // Current commit being processed
  interactive: boolean;            // Is this an interactive rebase
}

export interface RebaseOptions {
  interactive?: boolean;   // Start interactive rebase
  onto?: string;          // Rebase onto a specific commit
}

export interface RebaseResult {
  success: boolean;
  newHead: string;
  commitsRebased: number;
  conflicts?: string[];
}

/**
 * Get rebase directory path
 */
function getRebaseDir(gitDir: string): string {
  return path.join(gitDir, 'rebase-merge');
}

/**
 * Check if a rebase is in progress
 */
export function isRebaseInProgress(repo: Repository): boolean {
  return exists(getRebaseDir(repo.gitDir));
}

/**
 * Get the rebase state
 */
function getRebaseState(repo: Repository): RebaseState | null {
  const stateFile = path.join(getRebaseDir(repo.gitDir), 'state.json');
  if (!exists(stateFile)) return null;
  
  try {
    const content = fs.readFileSync(stateFile, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Save rebase state
 */
function saveRebaseState(repo: Repository, state: RebaseState): void {
  const rebaseDir = getRebaseDir(repo.gitDir);
  mkdirp(rebaseDir);
  
  const stateFile = path.join(rebaseDir, 'state.json');
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

/**
 * Clear rebase state
 */
function clearRebaseState(repo: Repository): void {
  const rebaseDir = getRebaseDir(repo.gitDir);
  if (exists(rebaseDir)) {
    fs.rmSync(rebaseDir, { recursive: true, force: true });
  }
}

/**
 * Find the merge base between two commits
 */
function findMergeBase(repo: Repository, commit1: string, commit2: string): string | null {
  // Build ancestor set for commit1
  const ancestors1 = new Set<string>();
  const queue1: string[] = [commit1];
  
  while (queue1.length > 0) {
    const hash = queue1.shift()!;
    if (ancestors1.has(hash)) continue;
    ancestors1.add(hash);
    
    try {
      const commit = repo.objects.readCommit(hash);
      queue1.push(...commit.parentHashes);
    } catch {
      // Reached end of history
    }
  }
  
  // Find first ancestor of commit2 that's in commit1's ancestors
  const queue2: string[] = [commit2];
  const visited = new Set<string>();
  
  while (queue2.length > 0) {
    const hash = queue2.shift()!;
    if (visited.has(hash)) continue;
    visited.add(hash);
    
    if (ancestors1.has(hash)) {
      return hash;
    }
    
    try {
      const commit = repo.objects.readCommit(hash);
      queue2.push(...commit.parentHashes);
    } catch {
      // Reached end of history
    }
  }
  
  return null;
}

/**
 * Get commits between base and tip (exclusive base, inclusive tip)
 */
function getCommitsBetween(repo: Repository, base: string, tip: string): string[] {
  const commits: string[] = [];
  let current = tip;
  
  while (current !== base) {
    commits.push(current);
    const commit = repo.objects.readCommit(current);
    
    if (commit.parentHashes.length === 0) {
      break;
    }
    
    current = commit.parentHashes[0];
  }
  
  return commits.reverse();
}

/**
 * Apply a commit on top of current HEAD (similar to cherry-pick)
 */
function applyCommit(
  repo: Repository, 
  commitHash: string, 
  options: { newMessage?: string; squashWith?: string } = {}
): { success: boolean; newCommitHash?: string; conflicts?: string[] } {
  const commit = repo.objects.readCommit(commitHash);
  
  if (commit.parentHashes.length === 0) {
    return { success: false, conflicts: ['Cannot rebase initial commit'] };
  }
  
  const parentHash = commit.parentHashes[0];
  const parentCommit = repo.objects.readCommit(parentHash);
  const headHash = repo.refs.resolve('HEAD')!;
  const headCommit = repo.objects.readCommit(headHash);
  
  // Get file trees
  const parentFiles = getTreeFiles(repo, parentCommit.treeHash);
  const commitFiles = getTreeFiles(repo, commit.treeHash);
  const headFiles = getTreeFiles(repo, headCommit.treeHash);
  
  // Compute diff
  const diff = computeDiff(parentFiles, commitFiles);
  
  // Apply changes
  const conflictFiles: string[] = [];
  
  // Apply added files
  for (const [filePath, fileInfo] of diff.added) {
    const fullPath = path.join(repo.workDir, filePath);
    const currentFile = headFiles.get(filePath);
    
    if (currentFile && currentFile.hash !== fileInfo.hash) {
      conflictFiles.push(filePath);
    }
    
    mkdirp(path.dirname(fullPath));
    fs.writeFileSync(fullPath, fileInfo.content);
    
    const blobHash = repo.objects.writeBlob(fileInfo.content);
    repo.index.add(filePath, blobHash, repo.workDir);
  }
  
  // Apply modified files
  for (const [filePath, fileInfo] of diff.modified) {
    const fullPath = path.join(repo.workDir, filePath);
    const currentFile = headFiles.get(filePath);
    
    const result = applyChanges(
      currentFile?.content || null,
      fileInfo.oldContent,
      fileInfo.content
    );
    
    if (result.hasConflict) {
      conflictFiles.push(filePath);
    }
    
    mkdirp(path.dirname(fullPath));
    fs.writeFileSync(fullPath, result.content);
    
    if (!result.hasConflict) {
      const blobHash = repo.objects.writeBlob(result.content);
      repo.index.add(filePath, blobHash, repo.workDir);
    }
  }
  
  // Apply deleted files
  for (const filePath of diff.deleted) {
    const fullPath = path.join(repo.workDir, filePath);
    
    if (exists(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    repo.index.remove(filePath);
  }
  
  repo.index.save();
  
  if (conflictFiles.length > 0) {
    return { success: false, conflicts: conflictFiles };
  }
  
  // Create new commit
  const treeHash = buildTree(repo);
  const message = options.newMessage || commit.message;
  
  const newCommit = new Commit(
    treeHash,
    [headHash],
    commit.author,
    {
      name: process.env.TSGIT_AUTHOR_NAME || process.env.GIT_AUTHOR_NAME || commit.committer.name,
      email: process.env.TSGIT_AUTHOR_EMAIL || process.env.GIT_AUTHOR_EMAIL || commit.committer.email,
      timestamp: Math.floor(Date.now() / 1000),
      timezone: getTimezone(),
    },
    message
  );
  
  const newCommitHash = repo.objects.writeObject(newCommit);
  
  // Update HEAD
  const head = repo.refs.getHead();
  if (head.isSymbolic) {
    const branchName = head.target.replace('refs/heads/', '');
    repo.refs.updateBranch(branchName, newCommitHash);
  } else {
    repo.refs.setHeadDetached(newCommitHash);
  }
  
  return { success: true, newCommitHash };
}

/**
 * Start a rebase operation
 */
export function rebase(
  upstream: string,
  options: RebaseOptions = {}
): RebaseResult {
  const repo = Repository.find();
  
  // Check for in-progress rebase
  if (isRebaseInProgress(repo)) {
    throw new TsgitError(
      'A rebase is already in progress',
      ErrorCode.OPERATION_IN_PROGRESS,
      [
        'tsgit rebase --continue    # Continue after resolving conflicts',
        'tsgit rebase --abort       # Abort the current rebase',
      ]
    );
  }
  
  // Resolve upstream
  const upstreamHash = repo.refs.resolve(upstream);
  if (!upstreamHash) {
    throw new TsgitError(
      `Unknown ref: ${upstream}`,
      ErrorCode.UNKNOWN_REF,
      ['tsgit branch -a    # List all branches']
    );
  }
  
  // Get current HEAD
  const headHash = repo.refs.resolve('HEAD');
  if (!headHash) {
    throw new TsgitError(
      'No commits yet',
      ErrorCode.NO_COMMITS_YET,
      ['tsgit commit -m "Initial commit"    # Create your first commit']
    );
  }
  
  // Check for uncommitted changes
  const status = repo.status();
  if (status.modified.length > 0 || status.staged.length > 0) {
    throw new TsgitError(
      'Cannot rebase: You have uncommitted changes',
      ErrorCode.UNCOMMITTED_CHANGES,
      [
        'tsgit commit -a -m "WIP"    # Commit your changes',
        'tsgit stash                 # Stash your changes (if implemented)',
      ]
    );
  }
  
  // Find merge base
  const mergeBase = options.onto 
    ? repo.refs.resolve(options.onto)!
    : findMergeBase(repo, headHash, upstreamHash);
    
  if (!mergeBase) {
    throw new TsgitError(
      'Cannot find common ancestor',
      ErrorCode.OPERATION_FAILED,
      ['The branches have no common history']
    );
  }
  
  // Get commits to rebase
  const commitsToRebase = getCommitsBetween(repo, mergeBase, headHash);
  
  if (commitsToRebase.length === 0) {
    return {
      success: true,
      newHead: headHash,
      commitsRebased: 0,
    };
  }
  
  // Record before state
  const beforeState = {
    head: headHash,
    branch: repo.refs.getCurrentBranch(),
    indexHash: '',
  };
  
  // Create rebase steps
  const steps: RebaseStep[] = commitsToRebase.map(hash => {
    const commit = repo.objects.readCommit(hash);
    return {
      action: 'pick' as RebaseAction,
      commitHash: hash,
      message: commit.message.split('\n')[0],
    };
  });
  
  // For interactive rebase, we'd stop here and let user edit
  // For now, we'll just print what would be done
  if (options.interactive) {
    // Save state for interactive editing
    const state: RebaseState = {
      onto: upstreamHash,
      originalBranch: repo.refs.getCurrentBranch(),
      originalHead: headHash,
      steps,
      currentStep: 0,
      interactive: true,
    };
    
    saveRebaseState(repo, state);
    
    // Print the todo list
    console.log(colors.cyan('Interactive rebase plan:'));
    console.log(colors.dim('(Edit the commands before continuing with --continue)'));
    console.log();
    
    for (const step of steps) {
      console.log(`${step.action} ${step.commitHash.slice(0, 8)} ${step.message}`);
    }
    
    console.log();
    console.log(colors.cyan('Commands:'));
    console.log(colors.dim('  pick   = use commit'));
    console.log(colors.dim('  reword = use commit, but edit message'));
    console.log(colors.dim('  edit   = use commit, but stop for amending'));
    console.log(colors.dim('  squash = use commit, but meld into previous'));
    console.log(colors.dim('  fixup  = like squash, but discard this message'));
    console.log(colors.dim('  drop   = remove commit'));
    console.log();
    console.log(colors.yellow('Note: Interactive editing not fully implemented.'));
    console.log(colors.yellow('Run `tsgit rebase --continue` to proceed with picks.'));
    
    return {
      success: true,
      newHead: headHash,
      commitsRebased: 0,
    };
  }
  
  // Non-interactive rebase: move HEAD to upstream
  const head = repo.refs.getHead();
  if (head.isSymbolic) {
    const branchName = head.target.replace('refs/heads/', '');
    repo.refs.updateBranch(branchName, upstreamHash);
  } else {
    repo.refs.setHeadDetached(upstreamHash);
  }
  
  // Apply each commit
  const state: RebaseState = {
    onto: upstreamHash,
    originalBranch: repo.refs.getCurrentBranch(),
    originalHead: headHash,
    steps,
    currentStep: 0,
    interactive: false,
  };
  
  let rebased = 0;
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    state.currentStep = i;
    state.currentCommit = step.commitHash;
    
    const result = applyCommit(repo, step.commitHash);
    
    if (!result.success) {
      // Save state for continue
      saveRebaseState(repo, state);
      
      return {
        success: false,
        newHead: repo.refs.resolve('HEAD')!,
        commitsRebased: rebased,
        conflicts: result.conflicts,
      };
    }
    
    rebased++;
  }
  
  const newHead = repo.refs.resolve('HEAD')!;
  
  // Record in journal
  const afterState = {
    head: newHead,
    branch: repo.refs.getCurrentBranch(),
    indexHash: '',
  };
  
  repo.journal.record(
    'rebase',
    [upstream],
    `Rebased ${rebased} commit(s) onto ${upstream}`,
    beforeState,
    afterState
  );
  
  return {
    success: true,
    newHead,
    commitsRebased: rebased,
  };
}

/**
 * Continue a rebase after resolving conflicts
 */
export function rebaseContinue(): RebaseResult {
  const repo = Repository.find();
  
  if (!isRebaseInProgress(repo)) {
    throw new TsgitError(
      'No rebase in progress',
      ErrorCode.OPERATION_FAILED,
      ['tsgit rebase <branch>    # Start a rebase']
    );
  }
  
  const state = getRebaseState(repo);
  if (!state) {
    throw new TsgitError(
      'Rebase state is corrupted',
      ErrorCode.OPERATION_FAILED,
      ['tsgit rebase --abort    # Abort and start over']
    );
  }
  
  // If we're in the middle of a commit, create the commit first
  if (state.currentCommit) {
    const step = state.steps[state.currentStep];
    
    // Build tree and create commit
    try {
      const treeHash = buildTree(repo);
      const originalCommit = repo.objects.readCommit(step.commitHash);
      const headHash = repo.refs.resolve('HEAD')!;
      
      const newCommit = new Commit(
        treeHash,
        [headHash],
        originalCommit.author,
        {
          name: process.env.TSGIT_AUTHOR_NAME || process.env.GIT_AUTHOR_NAME || originalCommit.committer.name,
          email: process.env.TSGIT_AUTHOR_EMAIL || process.env.GIT_AUTHOR_EMAIL || originalCommit.committer.email,
          timestamp: Math.floor(Date.now() / 1000),
          timezone: getTimezone(),
        },
        step.newMessage || originalCommit.message
      );
      
      const newCommitHash = repo.objects.writeObject(newCommit);
      
      const head = repo.refs.getHead();
      if (head.isSymbolic) {
        const branchName = head.target.replace('refs/heads/', '');
        repo.refs.updateBranch(branchName, newCommitHash);
      } else {
        repo.refs.setHeadDetached(newCommitHash);
      }
    } catch (error) {
      throw new TsgitError(
        'Failed to create commit',
        ErrorCode.OPERATION_FAILED,
        ['Ensure all conflicts are resolved and files are staged']
      );
    }
    
    state.currentStep++;
    state.currentCommit = undefined;
  }
  
  // Continue with remaining commits
  let rebased = state.currentStep;
  
  for (let i = state.currentStep; i < state.steps.length; i++) {
    const step = state.steps[i];
    state.currentStep = i;
    state.currentCommit = step.commitHash;
    
    if (step.action === 'drop') {
      rebased++;
      continue;
    }
    
    const result = applyCommit(repo, step.commitHash, { newMessage: step.newMessage });
    
    if (!result.success) {
      saveRebaseState(repo, state);
      
      return {
        success: false,
        newHead: repo.refs.resolve('HEAD')!,
        commitsRebased: rebased,
        conflicts: result.conflicts,
      };
    }
    
    rebased++;
  }
  
  const newHead = repo.refs.resolve('HEAD')!;
  
  // Record in journal
  const beforeState = {
    head: state.originalHead,
    branch: state.originalBranch,
    indexHash: '',
  };
  
  const afterState = {
    head: newHead,
    branch: repo.refs.getCurrentBranch(),
    indexHash: '',
  };
  
  repo.journal.record(
    'rebase',
    ['--continue'],
    `Completed rebase of ${rebased} commit(s)`,
    beforeState,
    afterState
  );
  
  // Clear state
  clearRebaseState(repo);
  
  return {
    success: true,
    newHead,
    commitsRebased: rebased,
  };
}

/**
 * Abort a rebase in progress
 */
export function rebaseAbort(): void {
  const repo = Repository.find();
  
  if (!isRebaseInProgress(repo)) {
    throw new TsgitError(
      'No rebase in progress',
      ErrorCode.OPERATION_FAILED,
      []
    );
  }
  
  const state = getRebaseState(repo);
  if (!state) {
    clearRebaseState(repo);
    return;
  }
  
  // Restore original HEAD
  const head = repo.refs.getHead();
  if (state.originalBranch) {
    repo.refs.updateBranch(state.originalBranch, state.originalHead);
    repo.refs.setHeadSymbolic(`refs/heads/${state.originalBranch}`);
  } else {
    repo.refs.setHeadDetached(state.originalHead);
  }
  
  // Reset working tree
  const commit = repo.objects.readCommit(state.originalHead);
  resetToTree(repo, commit.treeHash);
  
  clearRebaseState(repo);
}

/**
 * Skip current commit and continue rebase
 */
export function rebaseSkip(): RebaseResult {
  const repo = Repository.find();
  
  if (!isRebaseInProgress(repo)) {
    throw new TsgitError(
      'No rebase in progress',
      ErrorCode.OPERATION_FAILED,
      []
    );
  }
  
  const state = getRebaseState(repo);
  if (!state) {
    throw new TsgitError(
      'Rebase state is corrupted',
      ErrorCode.OPERATION_FAILED,
      ['tsgit rebase --abort    # Abort and start over']
    );
  }
  
  // Mark current as dropped and continue
  state.steps[state.currentStep].action = 'drop';
  state.currentStep++;
  state.currentCommit = undefined;
  
  saveRebaseState(repo, state);
  
  return rebaseContinue();
}

// Helper functions

function getTreeFiles(repo: Repository, treeHash: string): Map<string, { hash: string; content: Buffer }> {
  const files = new Map<string, { hash: string; content: Buffer }>();
  flattenTree(repo, treeHash, '', files);
  return files;
}

function flattenTree(
  repo: Repository, 
  treeHash: string, 
  prefix: string, 
  result: Map<string, { hash: string; content: Buffer }>
): void {
  const tree = repo.objects.readTree(treeHash);
  
  for (const entry of tree.entries) {
    const fullPath = prefix ? prefix + '/' + entry.name : entry.name;
    
    if (entry.mode === '40000') {
      flattenTree(repo, entry.hash, fullPath, result);
    } else {
      const blob = repo.objects.readBlob(entry.hash);
      result.set(fullPath, { hash: entry.hash, content: blob.content });
    }
  }
}

function computeDiff(
  parentFiles: Map<string, { hash: string; content: Buffer }>,
  commitFiles: Map<string, { hash: string; content: Buffer }>
): {
  added: Map<string, { hash: string; content: Buffer }>;
  modified: Map<string, { hash: string; content: Buffer; oldContent: Buffer }>;
  deleted: string[];
} {
  const added = new Map<string, { hash: string; content: Buffer }>();
  const modified = new Map<string, { hash: string; content: Buffer; oldContent: Buffer }>();
  const deleted: string[] = [];
  
  for (const [filePath, fileInfo] of commitFiles) {
    const parentFile = parentFiles.get(filePath);
    if (!parentFile) {
      added.set(filePath, fileInfo);
    } else if (parentFile.hash !== fileInfo.hash) {
      modified.set(filePath, { 
        hash: fileInfo.hash, 
        content: fileInfo.content, 
        oldContent: parentFile.content 
      });
    }
  }
  
  for (const [filePath] of parentFiles) {
    if (!commitFiles.has(filePath)) {
      deleted.push(filePath);
    }
  }
  
  return { added, modified, deleted };
}

function applyChanges(
  currentContent: Buffer | null,
  oldContent: Buffer | null,
  newContent: Buffer
): { content: Buffer; hasConflict: boolean } {
  if (currentContent && oldContent && currentContent.equals(oldContent)) {
    return { content: newContent, hasConflict: false };
  }
  
  if (!currentContent) {
    return { content: newContent, hasConflict: false };
  }
  
  if (currentContent && oldContent && !currentContent.equals(oldContent)) {
    const currentStr = currentContent.toString('utf8');
    const newStr = newContent.toString('utf8');
    
    const conflictContent = `<<<<<<< HEAD
${currentStr}=======
${newStr}>>>>>>> rebase
`;
    return { content: Buffer.from(conflictContent), hasConflict: true };
  }
  
  return { content: newContent, hasConflict: false };
}

function resetToTree(repo: Repository, treeHash: string): void {
  repo.index.clear();
  resetTreeRecursive(repo, treeHash, '');
  repo.index.save();
}

function resetTreeRecursive(repo: Repository, treeHash: string, prefix: string): void {
  const tree = repo.objects.readTree(treeHash);
  
  for (const entry of tree.entries) {
    const fullPath = prefix ? prefix + '/' + entry.name : entry.name;
    const absolutePath = path.join(repo.workDir, fullPath);
    
    if (entry.mode === '40000') {
      mkdirp(absolutePath);
      resetTreeRecursive(repo, entry.hash, fullPath);
    } else {
      const blob = repo.objects.readBlob(entry.hash);
      mkdirp(path.dirname(absolutePath));
      fs.writeFileSync(absolutePath, blob.content);
      repo.index.add(fullPath, entry.hash, repo.workDir);
    }
  }
}

function buildTree(repo: Repository): string {
  const entries = repo.index.getEntries();
  
  if (entries.length === 0) {
    throw new TsgitError(
      'Nothing staged',
      ErrorCode.NOTHING_TO_COMMIT,
      ['tsgit add <file>    # Stage files first']
    );
  }
  
  const trees = new Map<string, Map<string, { isTree: boolean; mode: string; hash: string }>>();
  
  for (const entry of entries) {
    const parts = entry.path.split('/');
    const fileName = parts.pop()!;
    const dirPath = parts.join('/');
    
    let currentPath = '';
    for (const part of parts) {
      if (!trees.has(currentPath)) {
        trees.set(currentPath, new Map());
      }
      const parent = trees.get(currentPath)!;
      const nextPath = currentPath ? currentPath + '/' + part : part;
      if (!parent.has(part)) {
        parent.set(part, { isTree: true, mode: '40000', hash: '' });
      }
      currentPath = nextPath;
    }
    
    if (!trees.has(dirPath)) {
      trees.set(dirPath, new Map());
    }
    trees.get(dirPath)!.set(fileName, {
      isTree: false,
      mode: entry.mode,
      hash: entry.hash,
    });
  }
  
  const sortedPaths = Array.from(trees.keys()).sort((a, b) => b.length - a.length);
  const treeHashes = new Map<string, string>();
  
  for (const treePath of sortedPaths) {
    const treeEntries = trees.get(treePath)!;
    const finalEntries: Array<{ mode: string; name: string; hash: string }> = [];
    
    for (const [name, info] of treeEntries) {
      if (info.isTree) {
        const childPath = treePath ? treePath + '/' + name : name;
        const childHash = treeHashes.get(childPath)!;
        finalEntries.push({ mode: '40000', name, hash: childHash });
      } else {
        finalEntries.push({ mode: info.mode, name, hash: info.hash });
      }
    }
    
    finalEntries.sort((a, b) => a.name.localeCompare(b.name));
    
    const tree = new Tree(finalEntries);
    const hash = repo.objects.writeObject(tree);
    treeHashes.set(treePath, hash);
  }
  
  return treeHashes.get('')!;
}

function getTimezone(): string {
  const offset = new Date().getTimezoneOffset();
  const sign = offset <= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
  const minutes = (Math.abs(offset) % 60).toString().padStart(2, '0');
  return `${sign}${hours}${minutes}`;
}

/**
 * CLI handler for rebase command
 */
export function handleRebase(args: string[]): void {
  const options: RebaseOptions = {};
  let upstream: string | undefined;
  let action: 'rebase' | 'continue' | 'abort' | 'skip' = 'rebase';
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--continue') {
      action = 'continue';
    } else if (arg === '--abort') {
      action = 'abort';
    } else if (arg === '--skip') {
      action = 'skip';
    } else if (arg === '--interactive' || arg === '-i') {
      options.interactive = true;
    } else if (arg === '--onto' && i + 1 < args.length) {
      options.onto = args[++i];
    } else if (!arg.startsWith('-')) {
      upstream = arg;
    }
  }
  
  try {
    switch (action) {
      case 'continue': {
        const result = rebaseContinue();
        if (result.success) {
          console.log(colors.green('✓') + ` Rebase complete: ${result.commitsRebased} commit(s) rebased`);
          console.log(colors.dim(`  New HEAD: ${result.newHead.slice(0, 8)}`));
        } else {
          console.log(colors.yellow('⚠') + ' Rebase encountered conflicts');
          if (result.conflicts) {
            console.log(colors.red('Conflicts in:'));
            for (const file of result.conflicts) {
              console.log(colors.red(`  ${file}`));
            }
          }
          console.log();
          console.log(colors.cyan('After resolving conflicts:'));
          console.log(colors.dim('  tsgit add <resolved-files>'));
          console.log(colors.dim('  tsgit rebase --continue'));
          console.log();
          console.log(colors.dim('Or skip this commit: tsgit rebase --skip'));
          console.log(colors.dim('Or abort: tsgit rebase --abort'));
          process.exit(1);
        }
        break;
      }
      
      case 'abort': {
        rebaseAbort();
        console.log(colors.green('✓') + ' Rebase aborted');
        break;
      }
      
      case 'skip': {
        const result = rebaseSkip();
        if (result.success) {
          console.log(colors.green('✓') + ` Skipped commit, rebase complete: ${result.commitsRebased} commit(s) rebased`);
        } else {
          console.log(colors.yellow('⚠') + ' Rebase encountered more conflicts');
          process.exit(1);
        }
        break;
      }
      
      case 'rebase':
      default: {
        if (!upstream) {
          console.error(colors.red('error: ') + 'Upstream branch required');
          console.error('\nUsage: tsgit rebase [options] <upstream>');
          console.error('\nOptions:');
          console.error('  -i, --interactive    Start interactive rebase');
          console.error('  --onto <newbase>     Rebase onto a specific commit');
          console.error('  --continue           Continue after resolving conflicts');
          console.error('  --abort              Abort the current rebase');
          console.error('  --skip               Skip the current commit');
          process.exit(1);
        }
        
        const result = rebase(upstream, options);
        
        if (options.interactive) {
          // Already printed by rebase function
          return;
        }
        
        if (result.success) {
          console.log(colors.green('✓') + ` Rebase complete: ${result.commitsRebased} commit(s) rebased`);
          console.log(colors.dim(`  New HEAD: ${result.newHead.slice(0, 8)}`));
        } else {
          console.log(colors.yellow('⚠') + ' Rebase encountered conflicts');
          if (result.conflicts) {
            console.log(colors.red('Conflicts in:'));
            for (const file of result.conflicts) {
              console.log(colors.red(`  ${file}`));
            }
          }
          console.log();
          console.log(colors.cyan('After resolving conflicts:'));
          console.log(colors.dim('  tsgit add <resolved-files>'));
          console.log(colors.dim('  tsgit rebase --continue'));
          console.log();
          console.log(colors.dim('Or skip this commit: tsgit rebase --skip'));
          console.log(colors.dim('Or abort: tsgit rebase --abort'));
          process.exit(1);
        }
        break;
      }
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
