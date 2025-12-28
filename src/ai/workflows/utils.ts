/**
 * Workflow Utilities
 * 
 * Helper functions for wit workflows that use wit's native APIs
 * instead of shelling out to git.
 */

import { Repository } from '../../core/repository.js';
import { diff, createHunks, formatUnifiedDiff, type FileDiff, type DiffHunk } from '../../core/diff.js';
import { exists, readFileText, writeFile, mkdirp, walkDir, readDir, isDirectory } from '../../utils/fs.js';
import * as path from 'path';

/**
 * Check if a path is a bare repository (has objects/ directly, not .wit/objects)
 */
function isBareRepo(repoPath: string): boolean {
  return exists(path.join(repoPath, 'objects')) && exists(path.join(repoPath, 'refs'));
}

/**
 * List all files in a bare repository by walking the tree at HEAD
 */
async function listFilesInBareRepo(repoPath: string): Promise<string[]> {
  const { BareRepository } = await import('../../server/storage/repos.js');
  
  const repo = new BareRepository(repoPath);
  if (!repo.isValid()) {
    throw new Error(`Not a valid bare repository: ${repoPath}`);
  }
  
  // Get HEAD commit
  const headRef = repo.refs.resolve('HEAD');
  if (!headRef) {
    return []; // Empty repo
  }
  
  const commit = repo.objects.readCommit(headRef);
  const files: string[] = [];
  
  // Recursively walk the tree
  function walkTree(treeHash: string, prefix: string = '') {
    const tree = repo.objects.readTree(treeHash);
    for (const entry of tree.entries) {
      const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.mode === '40000') {
        // Directory - recurse
        walkTree(entry.hash, entryPath);
      } else {
        // File
        files.push(entryPath);
      }
    }
  }
  
  walkTree(commit.treeHash);
  return files;
}

/**
 * Changed file information
 */
export interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  additions: number;
  deletions: number;
  oldContent?: string;
  newContent?: string;
}

/**
 * Diff result between two commits
 */
export interface CommitDiff {
  files: ChangedFile[];
  totalAdditions: number;
  totalDeletions: number;
  unifiedDiff: string;
}

/**
 * Get the diff between two commits using wit's native APIs
 */
export function getCommitDiff(repoPath: string, baseSha: string, headSha: string): CommitDiff {
  const repo = Repository.find(repoPath);
  
  const baseTree = getTreeAtCommit(repo, baseSha);
  const headTree = getTreeAtCommit(repo, headSha);
  
  const changedFiles: ChangedFile[] = [];
  let totalAdditions = 0;
  let totalDeletions = 0;
  const diffParts: string[] = [];
  
  // Find all unique paths
  const allPaths = new Set([...baseTree.keys(), ...headTree.keys()]);
  
  for (const filePath of allPaths) {
    const baseHash = baseTree.get(filePath);
    const headHash = headTree.get(filePath);
    
    if (!baseHash && headHash) {
      // File added
      const newContent = getFileContent(repo, headHash);
      const lines = newContent.split('\n').length;
      changedFiles.push({
        path: filePath,
        status: 'added',
        additions: lines,
        deletions: 0,
        newContent,
      });
      totalAdditions += lines;
      
      // Generate diff
      const fileDiff = generateFileDiff('', newContent, '/dev/null', filePath);
      diffParts.push(fileDiff);
    } else if (baseHash && !headHash) {
      // File deleted
      const oldContent = getFileContent(repo, baseHash);
      const lines = oldContent.split('\n').length;
      changedFiles.push({
        path: filePath,
        status: 'deleted',
        additions: 0,
        deletions: lines,
        oldContent,
      });
      totalDeletions += lines;
      
      // Generate diff
      const fileDiff = generateFileDiff(oldContent, '', filePath, '/dev/null');
      diffParts.push(fileDiff);
    } else if (baseHash !== headHash) {
      // File modified
      const oldContent = getFileContent(repo, baseHash!);
      const newContent = getFileContent(repo, headHash!);
      const diffLines = diff(oldContent, newContent);
      
      const additions = diffLines.filter(l => l.type === 'add').length;
      const deletions = diffLines.filter(l => l.type === 'remove').length;
      
      changedFiles.push({
        path: filePath,
        status: 'modified',
        additions,
        deletions,
        oldContent,
        newContent,
      });
      totalAdditions += additions;
      totalDeletions += deletions;
      
      // Generate diff
      const fileDiff = generateFileDiff(oldContent, newContent, filePath, filePath);
      diffParts.push(fileDiff);
    }
  }
  
  return {
    files: changedFiles,
    totalAdditions,
    totalDeletions,
    unifiedDiff: diffParts.join('\n'),
  };
}

/**
 * Get tree contents at a specific commit
 */
function getTreeAtCommit(repo: Repository, commitSha: string): Map<string, string> {
  const result = new Map<string, string>();
  
  try {
    const commit = repo.objects.readCommit(commitSha);
    flattenTree(repo, commit.treeHash, '', result);
  } catch (error) {
    console.error(`[wit] Failed to read commit ${commitSha}:`, error);
  }
  
  return result;
}

/**
 * Recursively flatten a tree into path -> blob hash map
 */
function flattenTree(repo: Repository, treeHash: string, prefix: string, result: Map<string, string>): void {
  try {
    const tree = repo.objects.readTree(treeHash);
    
    for (const entry of tree.entries) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      
      if (entry.mode === '40000') {
        // Directory - recurse
        flattenTree(repo, entry.hash, fullPath, result);
      } else {
        // File
        result.set(fullPath, entry.hash);
      }
    }
  } catch (error) {
    console.error(`[wit] Failed to read tree ${treeHash}:`, error);
  }
}

/**
 * Get file content from a blob hash
 */
function getFileContent(repo: Repository, blobHash: string): string {
  try {
    const blob = repo.objects.readBlob(blobHash);
    return blob.content.toString('utf-8');
  } catch (error) {
    console.error(`[wit] Failed to read blob ${blobHash}:`, error);
    return '';
  }
}

/**
 * Generate unified diff for a file
 */
function generateFileDiff(oldContent: string, newContent: string, oldPath: string, newPath: string): string {
  const diffLines = diff(oldContent, newContent);
  const hunks = createHunks(diffLines);
  
  const fileDiff: FileDiff = {
    oldPath,
    newPath,
    hunks,
    isBinary: false,
    isNew: oldPath === '/dev/null',
    isDeleted: newPath === '/dev/null',
    isRename: false,
  };
  
  return formatUnifiedDiff(fileDiff);
}

/**
 * Find files in a repository (supports both working directories and bare repos)
 */
export async function findFilesInRepo(repoPath: string, pattern?: RegExp): Promise<string[]> {
  let files: string[];
  
  if (isBareRepo(repoPath)) {
    // Bare repository - list files from git tree
    files = await listFilesInBareRepo(repoPath);
  } else {
    // Working directory - walk filesystem
    const repo = Repository.find(repoPath);
    files = walkDir(repo.workDir, ['.wit', '.git', 'node_modules']);
  }
  
  if (pattern) {
    return files.filter(f => pattern.test(f));
  }
  
  return files;
}

/**
 * Search for a pattern in repository files (for bare repos, this only searches file names)
 */
export async function searchInRepo(
  repoPath: string,
  pattern: RegExp,
  filePattern?: RegExp
): Promise<Array<{ path: string; line: number; content: string }>> {
  const results: Array<{ path: string; line: number; content: string }> = [];
  const files = await findFilesInRepo(repoPath, filePattern);
  
  // For bare repos, we can't easily read file contents without extracting
  // So we just return files that match the pattern in their path
  if (isBareRepo(repoPath)) {
    for (const file of files) {
      if (pattern.test(file)) {
        results.push({
          path: file,
          line: 0,
          content: `(file path matches: ${file})`,
        });
      }
    }
    return results;
  }
  
  // For working directories, search file contents
  for (const file of files) {
    const fullPath = path.join(repoPath, file);
    
    try {
      const content = readFileText(fullPath);
      const lines = content.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          results.push({
            path: file,
            line: i + 1,
            content: lines[i],
          });
        }
      }
    } catch {
      // Skip unreadable files
    }
  }
  
  return results;
}

/**
 * Get repository status using wit APIs
 */
export function getRepoStatus(repoPath: string): {
  staged: string[];
  modified: string[];
  untracked: string[];
  deleted: string[];
  branch: string | null;
} {
  const repo = Repository.find(repoPath);
  const status = repo.status();
  const branch = repo.refs.getCurrentBranch();
  
  return {
    ...status,
    branch,
  };
}

/**
 * Create a branch using wit APIs
 */
export function createBranch(repoPath: string, branchName: string, checkout: boolean = true): {
  success: boolean;
  commitHash?: string;
  error?: string;
} {
  try {
    const repo = Repository.find(repoPath);
    
    if (checkout) {
      repo.checkout(branchName, true);
    } else {
      repo.createBranch(branchName);
    }
    
    const hash = repo.refs.resolve('HEAD');
    
    return {
      success: true,
      commitHash: hash || undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Stage files using wit APIs
 */
export function stageFiles(repoPath: string, files: string[]): {
  success: boolean;
  stagedFiles: string[];
  error?: string;
} {
  try {
    const repo = Repository.find(repoPath);
    const stagedFiles: string[] = [];
    
    for (const file of files) {
      repo.add(file);
      stagedFiles.push(file);
    }
    
    return {
      success: true,
      stagedFiles,
    };
  } catch (error) {
    return {
      success: false,
      stagedFiles: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Create a commit using wit APIs
 */
export function createCommit(
  repoPath: string,
  message: string,
  author?: { name: string; email: string }
): {
  success: boolean;
  commitHash?: string;
  error?: string;
} {
  try {
    const repo = Repository.find(repoPath);
    
    const authorInfo = author ? {
      name: author.name,
      email: author.email,
      timestamp: Math.floor(Date.now() / 1000),
      timezone: '+0000',
    } : undefined;
    
    const hash = repo.commit(message, authorInfo);
    
    return {
      success: true,
      commitHash: hash,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get the default branch name (main or master)
 */
export function getDefaultBranch(repoPath: string): string | null {
  const repo = Repository.find(repoPath);
  
  if (repo.refs.branchExists('main')) {
    return 'main';
  }
  
  if (repo.refs.branchExists('master')) {
    return 'master';
  }
  
  // Try to get from refs
  const branches = repo.listBranches();
  return branches.length > 0 ? branches[0].name : null;
}

/**
 * Resolve a ref to a commit hash
 */
export function resolveRef(repoPath: string, ref: string): string | null {
  const repo = Repository.find(repoPath);
  return repo.refs.resolve(ref);
}

/**
 * Write a file to the repository
 */
export function writeRepoFile(
  repoPath: string,
  filePath: string,
  content: string
): { success: boolean; error?: string } {
  try {
    const fullPath = path.join(repoPath, filePath);
    const dir = path.dirname(fullPath);
    
    if (!exists(dir)) {
      mkdirp(dir);
    }
    
    writeFile(fullPath, content);
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Read a file from the repository
 */
export function readRepoFile(repoPath: string, filePath: string): string | null {
  try {
    const fullPath = path.join(repoPath, filePath);
    
    if (!exists(fullPath)) {
      return null;
    }
    
    return readFileText(fullPath);
  } catch {
    return null;
  }
}
