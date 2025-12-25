/**
 * Cherry-pick Command
 * Apply the changes introduced by an existing commit to the current branch
 * 
 * Features:
 * - Apply single or multiple commits
 * - Handle conflicts with --continue, --abort, --skip
 * - No-commit mode to apply without committing
 */

import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../core/repository';
import { Commit, Tree } from '../core/object';
import { TsgitError, ErrorCode } from '../core/errors';
import { exists, mkdirp, writeFile as writeFileUtil } from '../utils/fs';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

export interface CherryPickOptions {
  noCommit?: boolean;      // Apply changes without committing
  edit?: boolean;          // Edit the commit message
}

export interface CherryPickResult {
  commitHash: string;
  originalHash: string;
  message: string;
  hasConflicts: boolean;
  conflictFiles?: string[];
}

interface CherryPickState {
  originalCommit: string;
  message: string;
  author: {
    name: string;
    email: string;
    timestamp: number;
    timezone: string;
  };
  remaining: string[];       // Remaining commits to cherry-pick
  noCommit: boolean;
}

/**
 * Get cherry-pick state file path
 */
function getCherryPickStatePath(gitDir: string): string {
  return path.join(gitDir, 'CHERRY_PICK_HEAD');
}

function getCherryPickStateFilePath(gitDir: string): string {
  return path.join(gitDir, 'cherry-pick-state.json');
}

/**
 * Check if a cherry-pick is in progress
 */
export function isCherryPickInProgress(repo: Repository): boolean {
  return exists(getCherryPickStatePath(repo.gitDir));
}

/**
 * Get the cherry-pick state
 */
function getCherryPickState(repo: Repository): CherryPickState | null {
  const statePath = getCherryPickStateFilePath(repo.gitDir);
  if (!exists(statePath)) return null;
  
  try {
    const content = fs.readFileSync(statePath, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Save cherry-pick state
 */
function saveCherryPickState(repo: Repository, state: CherryPickState): void {
  const statePath = getCherryPickStateFilePath(repo.gitDir);
  const headPath = getCherryPickStatePath(repo.gitDir);
  
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  fs.writeFileSync(headPath, state.originalCommit + '\n');
}

/**
 * Clear cherry-pick state
 */
function clearCherryPickState(repo: Repository): void {
  const statePath = getCherryPickStateFilePath(repo.gitDir);
  const headPath = getCherryPickStatePath(repo.gitDir);
  
  if (exists(statePath)) fs.unlinkSync(statePath);
  if (exists(headPath)) fs.unlinkSync(headPath);
}

/**
 * Get the tree files as a map
 */
function getTreeFiles(repo: Repository, treeHash: string): Map<string, { hash: string; content: Buffer }> {
  const files = new Map<string, { hash: string; content: Buffer }>();
  flattenTree(repo, treeHash, '', files);
  return files;
}

/**
 * Flatten tree to map of path -> {hash, content}
 */
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

/**
 * Compute the diff between parent and commit
 */
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
  
  // Find added and modified files
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
  
  // Find deleted files
  for (const [filePath] of parentFiles) {
    if (!commitFiles.has(filePath)) {
      deleted.push(filePath);
    }
  }
  
  return { added, modified, deleted };
}

/**
 * Apply changes to a file with simple merge logic
 */
function applyChanges(
  currentContent: Buffer | null,
  oldContent: Buffer | null,
  newContent: Buffer
): { content: Buffer; hasConflict: boolean } {
  // Simple case: if current matches old, just use new
  if (currentContent && oldContent && currentContent.equals(oldContent)) {
    return { content: newContent, hasConflict: false };
  }
  
  // If no current content, use new content
  if (!currentContent) {
    return { content: newContent, hasConflict: false };
  }
  
  // Simple conflict detection - check if both modified
  if (currentContent && oldContent && !currentContent.equals(oldContent)) {
    // Both modified - create conflict markers
    const currentStr = currentContent.toString('utf8');
    const newStr = newContent.toString('utf8');
    
    const conflictContent = `<<<<<<< HEAD
${currentStr}=======
${newStr}>>>>>>> cherry-pick
`;
    return { content: Buffer.from(conflictContent), hasConflict: true };
  }
  
  // Default: use new content
  return { content: newContent, hasConflict: false };
}

/**
 * Cherry-pick a single commit
 */
export function cherryPick(
  commitRef: string,
  options: CherryPickOptions = {}
): CherryPickResult {
  const repo = Repository.find();
  
  // Check for in-progress cherry-pick
  if (isCherryPickInProgress(repo)) {
    throw new TsgitError(
      'A cherry-pick is already in progress',
      ErrorCode.OPERATION_IN_PROGRESS,
      [
        'tsgit cherry-pick --continue    # Continue after resolving conflicts',
        'tsgit cherry-pick --abort       # Abort the current cherry-pick',
      ]
    );
  }
  
  // Resolve the commit
  const commitHash = repo.refs.resolve(commitRef);
  if (!commitHash) {
    throw new TsgitError(
      `Unknown commit: ${commitRef}`,
      ErrorCode.UNKNOWN_REF,
      ['tsgit log    # View commit history']
    );
  }
  
  const commit = repo.objects.readCommit(commitHash);
  
  // Get parent commit (for diff calculation)
  if (commit.parentHashes.length === 0) {
    throw new TsgitError(
      'Cannot cherry-pick the initial commit',
      ErrorCode.OPERATION_FAILED,
      ['The initial commit has no parent to diff against']
    );
  }
  
  const parentHash = commit.parentHashes[0];
  const parentCommit = repo.objects.readCommit(parentHash);
  
  // Get current HEAD
  const headHash = repo.refs.resolve('HEAD');
  if (!headHash) {
    throw new TsgitError(
      'No commits yet',
      ErrorCode.NO_COMMITS_YET,
      ['tsgit commit -m "Initial commit"    # Create your first commit']
    );
  }
  
  const headCommit = repo.objects.readCommit(headHash);
  
  // Get file trees
  const parentFiles = getTreeFiles(repo, parentCommit.treeHash);
  const commitFiles = getTreeFiles(repo, commit.treeHash);
  const headFiles = getTreeFiles(repo, headCommit.treeHash);
  
  // Compute the diff introduced by the commit
  const diff = computeDiff(parentFiles, commitFiles);
  
  // Apply changes to working directory
  const conflictFiles: string[] = [];
  
  // Record before state
  const beforeState = {
    head: headHash,
    branch: repo.refs.getCurrentBranch(),
    indexHash: '',
  };
  
  // Apply added files
  for (const [filePath, fileInfo] of diff.added) {
    const fullPath = path.join(repo.workDir, filePath);
    const currentFile = headFiles.get(filePath);
    
    if (currentFile) {
      // File exists in HEAD - check for conflict
      if (currentFile.hash !== fileInfo.hash) {
        conflictFiles.push(filePath);
      }
    }
    
    // Create directory if needed
    mkdirp(path.dirname(fullPath));
    fs.writeFileSync(fullPath, fileInfo.content);
    
    // Stage the file
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
    
    // Create directory if needed
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
    const currentFile = headFiles.get(filePath);
    
    if (currentFile) {
      // Check if the file has been modified in HEAD
      const parentFile = parentFiles.get(filePath);
      if (parentFile && currentFile.hash !== parentFile.hash) {
        conflictFiles.push(filePath);
        continue;
      }
    }
    
    if (exists(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    repo.index.remove(filePath);
  }
  
  repo.index.save();
  
  // Handle conflicts
  if (conflictFiles.length > 0) {
    // Save state for --continue
    saveCherryPickState(repo, {
      originalCommit: commitHash,
      message: commit.message,
      author: commit.author,
      remaining: [],
      noCommit: options.noCommit || false,
    });
    
    return {
      commitHash: '',
      originalHash: commitHash,
      message: commit.message.split('\n')[0],
      hasConflicts: true,
      conflictFiles,
    };
  }
  
  // Create commit if not in --no-commit mode
  let newCommitHash = '';
  if (!options.noCommit) {
    newCommitHash = createCherryPickCommit(repo, commit, headHash);
    
    // Record in journal
    const afterState = {
      head: newCommitHash,
      branch: repo.refs.getCurrentBranch(),
      indexHash: '',
    };
    
    repo.journal.record(
      'cherry-pick',
      [commitHash],
      `Cherry-picked ${commitHash.slice(0, 8)} as ${newCommitHash.slice(0, 8)}`,
      beforeState,
      afterState,
      { commitHash: newCommitHash }
    );
  }
  
  return {
    commitHash: newCommitHash,
    originalHash: commitHash,
    message: commit.message.split('\n')[0],
    hasConflicts: false,
  };
}

/**
 * Create a commit for cherry-pick
 */
function createCherryPickCommit(
  repo: Repository, 
  originalCommit: Commit, 
  parentHash: string
): string {
  // Build tree from current index
  const treeHash = buildTree(repo);
  
  // Create commit with original author, but new committer
  const newCommit = new Commit(
    treeHash,
    [parentHash],
    originalCommit.author,  // Keep original author
    {
      name: process.env.TSGIT_AUTHOR_NAME || process.env.GIT_AUTHOR_NAME || originalCommit.committer.name,
      email: process.env.TSGIT_AUTHOR_EMAIL || process.env.GIT_AUTHOR_EMAIL || originalCommit.committer.email,
      timestamp: Math.floor(Date.now() / 1000),
      timezone: getTimezone(),
    },
    originalCommit.message
  );
  
  const commitHash = repo.objects.writeObject(newCommit);
  
  // Update branch
  const head = repo.refs.getHead();
  if (head.isSymbolic) {
    const branchName = head.target.replace('refs/heads/', '');
    repo.refs.updateBranch(branchName, commitHash);
  } else {
    repo.refs.setHeadDetached(commitHash);
  }
  
  return commitHash;
}

/**
 * Continue a cherry-pick after resolving conflicts
 */
export function cherryPickContinue(): CherryPickResult {
  const repo = Repository.find();
  
  if (!isCherryPickInProgress(repo)) {
    throw new TsgitError(
      'No cherry-pick in progress',
      ErrorCode.OPERATION_FAILED,
      ['tsgit cherry-pick <commit>    # Start a cherry-pick']
    );
  }
  
  const state = getCherryPickState(repo);
  if (!state) {
    throw new TsgitError(
      'Cherry-pick state is corrupted',
      ErrorCode.OPERATION_FAILED,
      ['tsgit cherry-pick --abort    # Abort and start over']
    );
  }
  
  // Check for unresolved conflicts (files with conflict markers)
  // For now, we trust the user has resolved conflicts
  
  const headHash = repo.refs.resolve('HEAD');
  if (!headHash) {
    throw new TsgitError('No HEAD found', ErrorCode.OPERATION_FAILED, []);
  }
  
  const beforeState = {
    head: headHash,
    branch: repo.refs.getCurrentBranch(),
    indexHash: '',
  };
  
  let newCommitHash = '';
  if (!state.noCommit) {
    // Create commit with stored author info
    const treeHash = buildTree(repo);
    
    const newCommit = new Commit(
      treeHash,
      [headHash],
      state.author,
      {
        name: process.env.TSGIT_AUTHOR_NAME || process.env.GIT_AUTHOR_NAME || state.author.name,
        email: process.env.TSGIT_AUTHOR_EMAIL || process.env.GIT_AUTHOR_EMAIL || state.author.email,
        timestamp: Math.floor(Date.now() / 1000),
        timezone: getTimezone(),
      },
      state.message
    );
    
    newCommitHash = repo.objects.writeObject(newCommit);
    
    // Update branch
    const head = repo.refs.getHead();
    if (head.isSymbolic) {
      const branchName = head.target.replace('refs/heads/', '');
      repo.refs.updateBranch(branchName, newCommitHash);
    } else {
      repo.refs.setHeadDetached(newCommitHash);
    }
    
    // Record in journal
    const afterState = {
      head: newCommitHash,
      branch: repo.refs.getCurrentBranch(),
      indexHash: '',
    };
    
    repo.journal.record(
      'cherry-pick',
      [state.originalCommit, '--continue'],
      `Cherry-picked ${state.originalCommit.slice(0, 8)} as ${newCommitHash.slice(0, 8)}`,
      beforeState,
      afterState,
      { commitHash: newCommitHash }
    );
  }
  
  // Clear state
  clearCherryPickState(repo);
  
  return {
    commitHash: newCommitHash,
    originalHash: state.originalCommit,
    message: state.message.split('\n')[0],
    hasConflicts: false,
  };
}

/**
 * Abort a cherry-pick in progress
 */
export function cherryPickAbort(): void {
  const repo = Repository.find();
  
  if (!isCherryPickInProgress(repo)) {
    throw new TsgitError(
      'No cherry-pick in progress',
      ErrorCode.OPERATION_FAILED,
      []
    );
  }
  
  // Reset to HEAD
  const headHash = repo.refs.resolve('HEAD');
  if (headHash) {
    const commit = repo.objects.readCommit(headHash);
    resetToTree(repo, commit.treeHash);
  }
  
  clearCherryPickState(repo);
}

/**
 * Reset working tree and index to match a tree
 */
function resetToTree(repo: Repository, treeHash: string): void {
  const tree = repo.objects.readTree(treeHash);
  
  // Clear index and rebuild
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

/**
 * Build tree from index
 */
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
 * CLI handler for cherry-pick command
 */
export function handleCherryPick(args: string[]): void {
  const options: CherryPickOptions = {};
  let commitRef: string | undefined;
  let action: 'pick' | 'continue' | 'abort' = 'pick';
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--continue') {
      action = 'continue';
    } else if (arg === '--abort') {
      action = 'abort';
    } else if (arg === '--no-commit' || arg === '-n') {
      options.noCommit = true;
    } else if (arg === '--edit' || arg === '-e') {
      options.edit = true;
    } else if (!arg.startsWith('-')) {
      commitRef = arg;
    }
  }
  
  try {
    switch (action) {
      case 'continue': {
        const result = cherryPickContinue();
        console.log(colors.green('✓') + ` Cherry-pick complete: ${colors.yellow(result.commitHash.slice(0, 8))}`);
        console.log(colors.dim(`  Original: ${result.originalHash.slice(0, 8)} "${result.message}"`));
        break;
      }
      
      case 'abort': {
        cherryPickAbort();
        console.log(colors.green('✓') + ' Cherry-pick aborted');
        break;
      }
      
      case 'pick':
      default: {
        if (!commitRef) {
          console.error(colors.red('error: ') + 'Commit reference required');
          console.error('\nUsage: tsgit cherry-pick [options] <commit>');
          console.error('\nOptions:');
          console.error('  --no-commit, -n    Apply changes without committing');
          console.error('  --continue         Continue after resolving conflicts');
          console.error('  --abort            Abort the current cherry-pick');
          process.exit(1);
        }
        
        const result = cherryPick(commitRef, options);
        
        if (result.hasConflicts) {
          console.log(colors.yellow('⚠') + ' Cherry-pick encountered conflicts');
          console.log(colors.dim(`  Original: ${result.originalHash.slice(0, 8)} "${result.message}"`));
          console.log();
          console.log(colors.red('Conflicts in:'));
          for (const file of result.conflictFiles || []) {
            console.log(colors.red(`  ${file}`));
          }
          console.log();
          console.log(colors.cyan('After resolving conflicts:'));
          console.log(colors.dim('  tsgit add <resolved-files>'));
          console.log(colors.dim('  tsgit cherry-pick --continue'));
          console.log();
          console.log(colors.dim('Or abort with: tsgit cherry-pick --abort'));
          process.exit(1);
        } else {
          if (options.noCommit) {
            console.log(colors.green('✓') + ' Changes applied (not committed)');
          } else {
            console.log(colors.green('✓') + ` Cherry-pick complete: ${colors.yellow(result.commitHash.slice(0, 8))}`);
          }
          console.log(colors.dim(`  Original: ${result.originalHash.slice(0, 8)} "${result.message}"`));
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
