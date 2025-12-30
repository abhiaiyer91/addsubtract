import { Repository } from '../core/repository';
import { detectRenames, RenameCandidate, RenameDetectionOptions } from '../core/diff';
import { colors } from '../utils/colors';

export interface StatusOptions {
  findRenames?: boolean;
  renameThreshold?: number;
}

export function status(options: StatusOptions = {}): void {
  try {
    const repo = Repository.find();
    const stat = repo.status();
    const detectRenamesEnabled = options.findRenames !== false; // Default to true
    const renameOptions: RenameDetectionOptions = {
      threshold: options.renameThreshold ?? 50,
    };
    
    // Show current branch
    const branch = repo.refs.getCurrentBranch();
    if (branch) {
      console.log(`On branch ${colors.cyan(branch)}`);
    } else {
      const head = repo.refs.getHead();
      console.log(`HEAD detached at ${colors.cyan(head.target.slice(0, 7))}`);
    }
    
    // Check for merge in progress
    const mergeState = repo.mergeManager.getState();
    if (mergeState) {
      console.log();
      console.log(colors.yellow('You have unmerged paths.'));
      console.log(`  (fix conflicts and run "wit commit")`);
      console.log(`  (use "wit merge --abort" to abort the merge)`);
      console.log();
      console.log(`Merging: ${colors.cyan(mergeState.sourceBranch)} into ${colors.cyan(mergeState.targetBranch)}`);
      
      if (mergeState.conflicts.length > 0) {
        console.log();
        console.log('Unmerged paths:');
        console.log('  (use "wit add <file>..." to mark resolution)');
        console.log();
        for (const conflict of mergeState.conflicts) {
          const isResolved = mergeState.resolved.includes(conflict.path);
          if (isResolved) {
            console.log(`        ${colors.green('resolved:   ' + conflict.path)}`);
          } else {
            console.log(`        ${colors.red('both modified:   ' + conflict.path)}`);
          }
        }
      }
    }
    console.log();

    // Detect renames in staged changes
    let stagedRenames: RenameCandidate[] = [];
    let stagedNewFiles = stat.staged.filter(f => !f.includes(' (deleted)'));
    let stagedDeletedFiles = stat.staged.filter(f => f.includes(' (deleted)')).map(f => f.replace(' (deleted)', ''));

    if (detectRenamesEnabled && stagedDeletedFiles.length > 0 && stagedNewFiles.length > 0) {
      // Get content for rename detection
      const headHash = repo.refs.resolve('HEAD');
      const headTree = new Map<string, string>();
      if (headHash) {
        const commit = repo.objects.readCommit(headHash);
        flattenTree(repo, commit.treeHash, '', headTree);
      }

      const deletedWithContent = stagedDeletedFiles
        .filter(path => headTree.has(path))
        .map(path => {
          const hash = headTree.get(path)!;
          const blob = repo.objects.readBlob(hash);
          return { path, content: blob.content.toString('utf8') };
        });

      const indexEntries = repo.index.getEntriesMap();
      const addedWithContent = stagedNewFiles
        .filter(path => indexEntries.has(path))
        .map(path => {
          const entry = indexEntries.get(path)!;
          const blob = repo.objects.readBlob(entry.hash);
          return { path, content: blob.content.toString('utf8') };
        });

      stagedRenames = detectRenames(deletedWithContent, addedWithContent, renameOptions);
      
      // Remove renamed files from regular lists
      const renamedOldPaths = new Set(stagedRenames.map(r => r.oldPath));
      const renamedNewPaths = new Set(stagedRenames.map(r => r.newPath));
      stagedNewFiles = stagedNewFiles.filter(f => !renamedNewPaths.has(f));
      stagedDeletedFiles = stagedDeletedFiles.filter(f => !renamedOldPaths.has(f));
    }

    // Show staged changes
    const hasStaged = stagedRenames.length > 0 || stagedNewFiles.length > 0 || stagedDeletedFiles.length > 0 ||
                      stat.staged.filter(f => !f.includes(' (deleted)') && !stagedNewFiles.includes(f)).length > 0;
    
    if (hasStaged) {
      console.log('Changes to be committed:');
      console.log('  (use "wit restore --staged <file>..." to unstage)');
      console.log();
      
      // Show renames first
      for (const rename of stagedRenames) {
        console.log(`        ${colors.green(`renamed:    ${rename.oldPath} -> ${rename.newPath} (${rename.similarity}% similar)`)}`);
      }
      
      // Show new files
      for (const file of stagedNewFiles) {
        console.log(`        ${colors.green('new file:   ' + file)}`);
      }
      
      // Show deleted files (not part of renames)
      for (const file of stagedDeletedFiles) {
        console.log(`        ${colors.green('deleted:    ' + file)}`);
      }
      
      // Show modified files (files in staged that aren't new or deleted)
      const modifiedStaged = stat.staged.filter(f => 
        !f.includes(' (deleted)') && 
        !stagedNewFiles.includes(f) &&
        !stagedRenames.some(r => r.newPath === f)
      );
      for (const file of modifiedStaged) {
        if (!stagedNewFiles.includes(file)) {
          console.log(`        ${colors.green('modified:   ' + file)}`);
        }
      }
      console.log();
    }

    // Show modified files (unstaged)
    if (stat.modified.length > 0) {
      console.log('Changes not staged for commit:');
      console.log('  (use "wit add <file>..." to update what will be committed)');
      console.log();
      for (const file of stat.modified) {
        console.log(`        ${colors.red('modified:   ' + file)}`);
      }
      console.log();
    }

    // Show deleted files (unstaged)
    if (stat.deleted.length > 0) {
      console.log('Deleted files:');
      for (const file of stat.deleted) {
        console.log(`        ${colors.red('deleted:    ' + file)}`);
      }
      console.log();
    }

    // Show untracked files
    if (stat.untracked.length > 0) {
      console.log('Untracked files:');
      console.log('  (use "wit add <file>..." to include in what will be committed)');
      console.log();
      for (const file of stat.untracked) {
        console.log(`        ${colors.red(file)}`);
      }
      console.log();
    }

    // Summary
    if (!hasStaged && stat.modified.length === 0 && 
        stat.untracked.length === 0 && stat.deleted.length === 0) {
      console.log('nothing to commit, working tree clean');
    } else if (!hasStaged) {
      console.log('no changes added to commit (use "wit add" to stage)');
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`error: ${error.message}`);
    }
    process.exit(1);
  }
}

/**
 * Flatten a tree into a map of path -> blob hash
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
