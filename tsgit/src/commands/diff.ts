import * as path from 'path';
import { Repository } from '../core/repository';
import { diff, createHunks, formatColoredDiff, isBinary, FileDiff } from '../core/diff';
import { readFile, walkDir, exists } from '../utils/fs';

export function diffCommand(options: { staged?: boolean; cached?: boolean } = {}): void {
  try {
    const repo = Repository.find();
    const showStaged = options.staged || options.cached;

    if (showStaged) {
      // Diff between HEAD and index
      showStagedDiff(repo);
    } else {
      // Diff between index and working directory
      showWorkingDiff(repo);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`error: ${error.message}`);
    }
    process.exit(1);
  }
}

function showStagedDiff(repo: Repository): void {
  const headHash = repo.refs.resolve('HEAD');
  const indexEntries = repo.index.getEntriesMap();

  // Get HEAD tree
  const headTree = new Map<string, string>();
  if (headHash) {
    const commit = repo.objects.readCommit(headHash);
    flattenTree(repo, commit.treeHash, '', headTree);
  }

  // Find new/modified files in index compared to HEAD
  for (const [filePath, entry] of indexEntries) {
    const oldHash = headTree.get(filePath);
    
    if (!oldHash) {
      // New file
      const newBlob = repo.objects.readBlob(entry.hash);
      const fileDiff = createFileDiff(filePath, '', newBlob.content.toString('utf8'), true, false);
      console.log(formatColoredDiff(fileDiff));
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
      console.log(formatColoredDiff(fileDiff));
    }
  }

  // Find deleted files
  for (const [filePath] of headTree) {
    if (!indexEntries.has(filePath)) {
      const oldBlob = repo.objects.readBlob(headTree.get(filePath)!);
      const fileDiff = createFileDiff(filePath, oldBlob.content.toString('utf8'), '', false, true);
      console.log(formatColoredDiff(fileDiff));
    }
  }
}

function showWorkingDiff(repo: Repository): void {
  const indexEntries = repo.index.getEntriesMap();

  for (const [filePath, entry] of indexEntries) {
    const fullPath = path.join(repo.workDir, filePath);
    
    if (!exists(fullPath)) {
      // File deleted in working directory
      const oldBlob = repo.objects.readBlob(entry.hash);
      const fileDiff = createFileDiff(filePath, oldBlob.content.toString('utf8'), '', false, true);
      console.log(formatColoredDiff(fileDiff));
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
