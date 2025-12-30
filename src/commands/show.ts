/**
 * Show Command
 * Show various types of objects (commits, files at commits, tags)
 * 
 * Usage:
 * - wit show <commit>             # Show commit details + diff
 * - wit show <commit>:<file>      # Show file at commit
 * - wit show <tag>                # Show tag info
 * - wit show --stat <commit>      # Show commit with stat summary only
 * - wit show --name-only <commit> # Show commit with file names only
 */

import { Repository } from '../core/repository';
import { Commit } from '../core/object';
import { TsgitError, ErrorCode } from '../core/errors';
import { diff, createHunks, formatColoredDiff, FileDiff } from '../core/diff';
import { parseRevision } from './reset';
import { getTagInfo } from './tag';
import { colors } from '../utils/colors';

export interface ShowOptions {
  stat?: boolean;      // --stat: Show diffstat summary
  nameOnly?: boolean;  // --name-only: Show only file names
  nameStatus?: boolean; // --name-status: Show file names with status
  format?: string;     // --format: Custom format
  quiet?: boolean;     // -q: Suppress diff output
}

/**
 * Show a commit with its diff
 */
export function showCommit(
  repo: Repository, 
  commitHash: string, 
  options: ShowOptions = {}
): void {
  const commit = repo.objects.readCommit(commitHash);
  const branch = repo.refs.getCurrentBranch();
  const headHash = repo.refs.resolve('HEAD');

  // Print commit header
  let commitLine = colors.yellow(`commit ${commitHash}`);
  
  // Add refs
  const refs: string[] = [];
  if (headHash === commitHash) {
    if (branch) {
      refs.push(`HEAD -> ${branch}`);
    } else {
      refs.push('HEAD');
    }
  }
  
  // Check if any tags point to this commit
  const tags = repo.refs.listTags();
  for (const tag of tags) {
    const tagHash = repo.refs.resolve(tag);
    if (tagHash === commitHash) {
      refs.push(`tag: ${tag}`);
    }
  }

  if (refs.length > 0) {
    commitLine += ` (${colors.cyan(refs.join(', '))})`;
  }

  console.log(commitLine);
  console.log(`Author: ${commit.author.name} <${commit.author.email}>`);
  console.log(`Date:   ${formatDate(commit.author.timestamp, commit.author.timezone)}`);
  console.log();

  // Print commit message (indented)
  const messageLines = commit.message.split('\n');
  for (const line of messageLines) {
    console.log(`    ${line}`);
  }
  console.log();

  // Show diff unless quiet
  if (!options.quiet) {
    if (options.stat) {
      showDiffStat(repo, commit);
    } else if (options.nameOnly) {
      showChangedFiles(repo, commit, false);
    } else if (options.nameStatus) {
      showChangedFiles(repo, commit, true);
    } else {
      showDiff(repo, commit);
    }
  }
}

/**
 * Show a file at a specific commit
 */
export function showFileAtCommit(
  repo: Repository, 
  commitRef: string, 
  filePath: string
): void {
  const commitHash = parseRevision(repo, commitRef);
  const commit = repo.objects.readCommit(commitHash);
  
  const blobHash = findBlobInTree(repo, commit.treeHash, filePath.split('/'));
  
  if (!blobHash) {
    throw new TsgitError(
      `Path '${filePath}' does not exist in '${commitRef}'`,
      ErrorCode.FILE_NOT_FOUND,
      [
        `wit ls-tree ${commitRef}    # List files in commit`,
        `wit show ${commitRef}       # Show commit details`
      ]
    );
  }

  const blob = repo.objects.readBlob(blobHash);
  process.stdout.write(blob.content);
}

/**
 * Show tag information
 */
export function showTag(repo: Repository, tagName: string): void {
  const info = getTagInfo(repo, tagName);
  
  console.log(colors.bold(`tag ${info.name}`));
  
  if (info.isAnnotated) {
    console.log(`Tagger: ${info.tagger!.name} <${info.tagger!.email}>`);
    console.log(`Date:   ${info.date?.toLocaleString()}`);
    console.log();
    
    if (info.message) {
      const messageLines = info.message.split('\n');
      for (const line of messageLines) {
        console.log(`    ${line}`);
      }
      console.log();
    }
  }
  
  // Show the commit it points to
  console.log(colors.yellow(`commit ${info.targetHash}`));
  
  try {
    const commit = repo.objects.readCommit(info.targetHash);
    console.log(`Author: ${commit.author.name} <${commit.author.email}>`);
    console.log(`Date:   ${formatDate(commit.author.timestamp, commit.author.timezone)}`);
    console.log();
    
    const messageLines = commit.message.split('\n');
    for (const line of messageLines) {
      console.log(`    ${line}`);
    }
  } catch {
    // Target might not be a commit
  }
}

/**
 * Show any object (auto-detect type)
 */
export function show(
  repo: Repository, 
  ref: string, 
  options: ShowOptions = {}
): void {
  // Check for commit:file syntax
  if (ref.includes(':')) {
    const [commitRef, filePath] = ref.split(':', 2);
    showFileAtCommit(repo, commitRef, filePath);
    return;
  }

  // Check if it's a tag
  if (repo.refs.tagExists(ref)) {
    const tagHash = repo.refs.resolve(ref)!;
    
    try {
      const obj = repo.objects.readObject(tagHash);
      
      if (obj.type === 'tag') {
        // Annotated tag
        showTag(repo, ref);
        return;
      }
    } catch {
      // Fall through to show as commit
    }
    
    // Lightweight tag - show the commit it points to
    showCommit(repo, tagHash, options);
    return;
  }

  // Try to resolve as a ref/commit
  try {
    const hash = parseRevision(repo, ref);
    showCommit(repo, hash, options);
  } catch {
    throw new TsgitError(
      `Unknown revision or path: ${ref}`,
      ErrorCode.REF_NOT_FOUND,
      [
        'wit log         # View recent commits',
        'wit branch      # List branches',
        'wit tag         # List tags'
      ]
    );
  }
}

/**
 * Show diff for a commit
 */
function showDiff(repo: Repository, commit: Commit): void {
  if (commit.parentHashes.length === 0) {
    // Initial commit - show all files as new
    const treeFiles = new Map<string, string>();
    flattenTree(repo, commit.treeHash, '', treeFiles);
    
    for (const [filePath, blobHash] of treeFiles) {
      const blob = repo.objects.readBlob(blobHash);
      const content = blob.content.toString('utf8');
      
      const fileDiff = createFileDiff(filePath, '', content, true, false);
      console.log(formatColoredDiff(fileDiff));
    }
    return;
  }

  // Compare with parent
  const parentHash = commit.parentHashes[0];
  const parentCommit = repo.objects.readCommit(parentHash);
  
  const oldTree = new Map<string, string>();
  const newTree = new Map<string, string>();
  
  flattenTree(repo, parentCommit.treeHash, '', oldTree);
  flattenTree(repo, commit.treeHash, '', newTree);

  // Find modified/added files
  for (const [filePath, newBlobHash] of newTree) {
    const oldBlobHash = oldTree.get(filePath);
    
    if (!oldBlobHash) {
      // New file
      const newBlob = repo.objects.readBlob(newBlobHash);
      const fileDiff = createFileDiff(filePath, '', newBlob.content.toString('utf8'), true, false);
      console.log(formatColoredDiff(fileDiff));
    } else if (oldBlobHash !== newBlobHash) {
      // Modified file
      const oldBlob = repo.objects.readBlob(oldBlobHash);
      const newBlob = repo.objects.readBlob(newBlobHash);
      const fileDiff = createFileDiff(
        filePath, 
        oldBlob.content.toString('utf8'), 
        newBlob.content.toString('utf8'), 
        false, 
        false
      );
      console.log(formatColoredDiff(fileDiff));
    }
  }

  // Find deleted files
  for (const [filePath, oldBlobHash] of oldTree) {
    if (!newTree.has(filePath)) {
      const oldBlob = repo.objects.readBlob(oldBlobHash);
      const fileDiff = createFileDiff(filePath, oldBlob.content.toString('utf8'), '', false, true);
      console.log(formatColoredDiff(fileDiff));
    }
  }
}

/**
 * Show diff stat summary
 */
function showDiffStat(repo: Repository, commit: Commit): void {
  const changes = getChanges(repo, commit);
  
  let maxNameLen = 0;
  for (const change of changes) {
    maxNameLen = Math.max(maxNameLen, change.path.length);
  }

  let totalInsertions = 0;
  let totalDeletions = 0;

  for (const change of changes) {
    const padding = ' '.repeat(maxNameLen - change.path.length);
    let stats = '';
    
    if (change.type === 'binary') {
      stats = 'Bin';
    } else {
      const total = change.insertions + change.deletions;
      const maxBars = 40;
      const scale = total > maxBars ? maxBars / total : 1;
      
      const insertBars = Math.round(change.insertions * scale);
      const deleteBars = Math.round(change.deletions * scale);
      
      stats = `${change.insertions + change.deletions} `;
      stats += colors.green('+'.repeat(insertBars));
      stats += colors.red('-'.repeat(deleteBars));
      
      totalInsertions += change.insertions;
      totalDeletions += change.deletions;
    }

    const statusIcon = change.status === 'A' 
      ? colors.green('A') 
      : change.status === 'D' 
        ? colors.red('D') 
        : colors.yellow('M');

    console.log(` ${statusIcon} ${change.path}${padding} | ${stats}`);
  }

  console.log();
  console.log(` ${changes.length} file(s) changed, ${colors.green(`${totalInsertions} insertions(+)`)}, ${colors.red(`${totalDeletions} deletions(-)`)}`);
}

/**
 * Show changed files
 */
function showChangedFiles(repo: Repository, commit: Commit, showStatus: boolean): void {
  const changes = getChanges(repo, commit);
  
  for (const change of changes) {
    if (showStatus) {
      console.log(`${change.status}\t${change.path}`);
    } else {
      console.log(change.path);
    }
  }
}

/**
 * Get changes in a commit
 */
function getChanges(repo: Repository, commit: Commit): {
  path: string;
  status: 'A' | 'M' | 'D';
  type: 'text' | 'binary';
  insertions: number;
  deletions: number;
}[] {
  const changes: {
    path: string;
    status: 'A' | 'M' | 'D';
    type: 'text' | 'binary';
    insertions: number;
    deletions: number;
  }[] = [];

  if (commit.parentHashes.length === 0) {
    // Initial commit
    const treeFiles = new Map<string, string>();
    flattenTree(repo, commit.treeHash, '', treeFiles);
    
    for (const [filePath, blobHash] of treeFiles) {
      const blob = repo.objects.readBlob(blobHash);
      const content = blob.content.toString('utf8');
      const lines = content.split('\n').length;
      
      changes.push({
        path: filePath,
        status: 'A',
        type: 'text',
        insertions: lines,
        deletions: 0,
      });
    }
    return changes;
  }

  // Compare with parent
  const parentHash = commit.parentHashes[0];
  const parentCommit = repo.objects.readCommit(parentHash);
  
  const oldTree = new Map<string, string>();
  const newTree = new Map<string, string>();
  
  flattenTree(repo, parentCommit.treeHash, '', oldTree);
  flattenTree(repo, commit.treeHash, '', newTree);

  // Modified/added files
  for (const [filePath, newBlobHash] of newTree) {
    const oldBlobHash = oldTree.get(filePath);
    
    if (!oldBlobHash) {
      const newBlob = repo.objects.readBlob(newBlobHash);
      const content = newBlob.content.toString('utf8');
      const lines = content.split('\n').length;
      
      changes.push({
        path: filePath,
        status: 'A',
        type: 'text',
        insertions: lines,
        deletions: 0,
      });
    } else if (oldBlobHash !== newBlobHash) {
      const oldBlob = repo.objects.readBlob(oldBlobHash);
      const newBlob = repo.objects.readBlob(newBlobHash);
      
      const oldContent = oldBlob.content.toString('utf8');
      const newContent = newBlob.content.toString('utf8');
      
      const diffLines = diff(oldContent, newContent);
      const insertions = diffLines.filter(l => l.type === 'add').length;
      const deletions = diffLines.filter(l => l.type === 'remove').length;
      
      changes.push({
        path: filePath,
        status: 'M',
        type: 'text',
        insertions,
        deletions,
      });
    }
  }

  // Deleted files
  for (const [filePath, oldBlobHash] of oldTree) {
    if (!newTree.has(filePath)) {
      const oldBlob = repo.objects.readBlob(oldBlobHash);
      const content = oldBlob.content.toString('utf8');
      const lines = content.split('\n').length;
      
      changes.push({
        path: filePath,
        status: 'D',
        type: 'text',
        insertions: 0,
        deletions: lines,
      });
    }
  }

  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Helper: Create FileDiff object
 */
function createFileDiff(
  filePath: string,
  oldContent: string,
  newContent: string,
  isNew: boolean,
  isDeleted: boolean
): FileDiff {
  const diffLines = diff(oldContent, newContent);
  const hunks = createHunks(diffLines);

  return {
    oldPath: filePath,
    newPath: filePath,
    hunks,
    isBinary: false,
    isNew,
    isDeleted,
    isRename: false,
  };
}

/**
 * Helper: Flatten tree to map of path -> blob hash
 */
function flattenTree(repo: Repository, treeHash: string, prefix: string, result: Map<string, string>): void {
  const tree = repo.objects.readTree(treeHash);

  for (const entry of tree.entries) {
    const fullPath = prefix ? prefix + '/' + entry.name : entry.name;

    if (entry.mode === '40000') {
      flattenTree(repo, entry.hash, fullPath, result);
    } else {
      result.set(fullPath, entry.hash);
    }
  }
}

/**
 * Helper: Find blob in tree by path
 */
function findBlobInTree(repo: Repository, treeHash: string, pathParts: string[]): string | null {
  const tree = repo.objects.readTree(treeHash);
  
  for (const entry of tree.entries) {
    if (entry.name === pathParts[0]) {
      if (pathParts.length === 1) {
        return entry.mode === '40000' ? null : entry.hash;
      }
      if (entry.mode === '40000') {
        return findBlobInTree(repo, entry.hash, pathParts.slice(1));
      }
    }
  }
  
  return null;
}

/**
 * Helper: Format date
 */
function formatDate(timestamp: number, timezone: string): string {
  const date = new Date(timestamp * 1000);
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };
  
  return date.toLocaleString('en-US', options) + ' ' + timezone;
}

/**
 * CLI handler for show command
 */
export function handleShow(args: string[]): void {
  const repo = Repository.find();
  
  const options: ShowOptions = {};
  let ref = 'HEAD';

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--stat') {
      options.stat = true;
    } else if (arg === '--name-only') {
      options.nameOnly = true;
    } else if (arg === '--name-status') {
      options.nameStatus = true;
    } else if (arg === '-q' || arg === '--quiet') {
      options.quiet = true;
    } else if (arg === '--format') {
      if (i + 1 < args.length) {
        options.format = args[++i];
      }
    } else if (!arg.startsWith('-')) {
      ref = arg;
    }
  }

  try {
    show(repo, ref, options);
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(colors.red('error: ') + error.message);
    }
    process.exit(1);
  }
}
