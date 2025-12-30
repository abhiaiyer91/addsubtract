import * as path from 'path';
import { Repository } from '../core/repository';
import { diff, createHunks, formatColoredDiff, isBinary, FileDiff, detectRenames, RenameDetectionOptions } from '../core/diff';
import { readFile, exists } from '../utils/fs';

export interface DiffCommandOptions {
  staged?: boolean;
  cached?: boolean;
  findRenames?: boolean;
  renameThreshold?: number;
}

export function diffCommand(options: DiffCommandOptions = {}): void {
  try {
    const repo = Repository.find();
    const showStaged = options.staged || options.cached;
    const detectRenamesEnabled = options.findRenames !== false; // Default to true
    const renameOptions: RenameDetectionOptions = {
      threshold: options.renameThreshold ?? 50,
    };

    if (showStaged) {
      // Diff between HEAD and index
      showStagedDiff(repo, detectRenamesEnabled, renameOptions);
    } else {
      // Diff between index and working directory
      showWorkingDiff(repo, detectRenamesEnabled, renameOptions);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`error: ${error.message}`);
    }
    process.exit(1);
  }
}

function showStagedDiff(
  repo: Repository,
  detectRenamesEnabled: boolean,
  renameOptions: RenameDetectionOptions
): void {
  const headHash = repo.refs.resolve('HEAD');
  const indexEntries = repo.index.getEntriesMap();

  // Get HEAD tree
  const headTree = new Map<string, string>();
  if (headHash) {
    const commit = repo.objects.readCommit(headHash);
    flattenTree(repo, commit.treeHash, '', headTree);
  }

  const fileDiffs: FileDiff[] = [];
  const deletedFiles: { path: string; content: string; hash: string }[] = [];
  const addedFiles: { path: string; content: string; hash: string }[] = [];

  // Find new/modified files in index compared to HEAD
  for (const [filePath, entry] of indexEntries) {
    const oldHash = headTree.get(filePath);
    
    if (!oldHash) {
      // New file - potential rename target
      const newBlob = repo.objects.readBlob(entry.hash);
      const content = newBlob.content.toString('utf8');
      addedFiles.push({ path: filePath, content, hash: entry.hash });
      fileDiffs.push(createFileDiff(filePath, '', content, true, false));
    } else if (oldHash !== entry.hash) {
      // Modified file
      const oldBlob = repo.objects.readBlob(oldHash);
      const newBlob = repo.objects.readBlob(entry.hash);
      const fileDiff = createFileDiff(
        filePath,
        oldBlob.content.toString('utf8'),
        newBlob.content.toString('utf8'),
        false,
        false
      );
      fileDiffs.push(fileDiff);
    }
  }

  // Find deleted files - potential rename sources
  for (const [filePath, hash] of headTree) {
    if (!indexEntries.has(filePath)) {
      const oldBlob = repo.objects.readBlob(hash);
      const content = oldBlob.content.toString('utf8');
      deletedFiles.push({ path: filePath, content, hash });
      fileDiffs.push(createFileDiff(filePath, content, '', false, true));
    }
  }

  // Detect renames if enabled
  if (detectRenamesEnabled && deletedFiles.length > 0 && addedFiles.length > 0) {
    const renames = detectRenames(deletedFiles, addedFiles, renameOptions);
    
    // Track which files are part of renames
    const renamedOldPaths = new Set(renames.map(r => r.oldPath));
    const renamedNewPaths = new Set(renames.map(r => r.newPath));

    // Output renames first
    for (const rename of renames) {
      const oldContent = deletedFiles.find(f => f.path === rename.oldPath)!.content;
      const newContent = addedFiles.find(f => f.path === rename.newPath)!.content;
      
      const diffLines = diff(oldContent, newContent);
      const hunks = createHunks(diffLines);

      const renameDiff: FileDiff = {
        oldPath: rename.oldPath,
        newPath: rename.newPath,
        hunks,
        isBinary: false,
        isNew: false,
        isDeleted: false,
        isRename: true,
        similarity: rename.similarity,
      };
      console.log(formatColoredDiff(renameDiff));
    }

    // Output remaining diffs (excluding those that were part of renames)
    for (const fileDiff of fileDiffs) {
      if (fileDiff.isDeleted && renamedOldPaths.has(fileDiff.oldPath)) continue;
      if (fileDiff.isNew && renamedNewPaths.has(fileDiff.newPath)) continue;
      console.log(formatColoredDiff(fileDiff));
    }
  } else {
    // No rename detection, output all diffs
    for (const fileDiff of fileDiffs) {
      console.log(formatColoredDiff(fileDiff));
    }
  }
}

function showWorkingDiff(
  repo: Repository,
  detectRenamesEnabled: boolean,
  renameOptions: RenameDetectionOptions
): void {
  const indexEntries = repo.index.getEntriesMap();
  const fileDiffs: FileDiff[] = [];
  const deletedFiles: { path: string; content: string }[] = [];
  const addedFiles: { path: string; content: string }[] = [];

  // Check for deleted and modified files in working directory
  for (const [filePath, entry] of indexEntries) {
    const fullPath = path.join(repo.workDir, filePath);
    
    if (!exists(fullPath)) {
      // File deleted in working directory - potential rename source
      const oldBlob = repo.objects.readBlob(entry.hash);
      const content = oldBlob.content.toString('utf8');
      deletedFiles.push({ path: filePath, content });
      fileDiffs.push(createFileDiff(filePath, content, '', false, true));
      continue;
    }

    const currentContent = readFile(fullPath);
    
    if (isBinary(currentContent)) {
      continue;
    }

    const oldBlob = repo.objects.readBlob(entry.hash);
    const oldContent = oldBlob.content.toString('utf8');
    const newContent = currentContent.toString('utf8');

    if (oldContent !== newContent) {
      const fileDiff = createFileDiff(filePath, oldContent, newContent, false, false);
      fileDiffs.push(fileDiff);
    }
  }

  // Check for untracked files that might be rename targets
  // (This is more complex as we need to scan the working directory)
  // For simplicity, we only detect renames among tracked files here

  // Detect renames if enabled
  if (detectRenamesEnabled && deletedFiles.length > 0 && addedFiles.length > 0) {
    const renames = detectRenames(deletedFiles, addedFiles, renameOptions);
    
    const renamedOldPaths = new Set(renames.map(r => r.oldPath));
    const renamedNewPaths = new Set(renames.map(r => r.newPath));

    // Output renames first
    for (const rename of renames) {
      const oldContent = deletedFiles.find(f => f.path === rename.oldPath)!.content;
      const newContent = addedFiles.find(f => f.path === rename.newPath)!.content;
      
      const diffLines = diff(oldContent, newContent);
      const hunks = createHunks(diffLines);

      const renameDiff: FileDiff = {
        oldPath: rename.oldPath,
        newPath: rename.newPath,
        hunks,
        isBinary: false,
        isNew: false,
        isDeleted: false,
        isRename: true,
        similarity: rename.similarity,
      };
      console.log(formatColoredDiff(renameDiff));
    }

    // Output remaining diffs
    for (const fileDiff of fileDiffs) {
      if (fileDiff.isDeleted && renamedOldPaths.has(fileDiff.oldPath)) continue;
      if (fileDiff.isNew && renamedNewPaths.has(fileDiff.newPath)) continue;
      console.log(formatColoredDiff(fileDiff));
    }
  } else {
    // No rename detection, output all diffs
    for (const fileDiff of fileDiffs) {
      console.log(formatColoredDiff(fileDiff));
    }
  }
}

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
