import { Repository } from '../core/repository';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

export function status(): void {
  try {
    const repo = Repository.find();
    const stat = repo.status();
    
    // Show current branch
    const branch = repo.refs.getCurrentBranch();
    if (branch) {
      console.log(`On branch ${colors.cyan(branch)}`);
    } else {
      const head = repo.refs.getHead();
      console.log(`HEAD detached at ${colors.cyan(head.target.slice(0, 7))}`);
    }
    console.log();

    // Show staged changes
    if (stat.staged.length > 0) {
      console.log('Changes to be committed:');
      console.log('  (use "wit restore --staged <file>..." to unstage)');
      console.log();
      for (const file of stat.staged) {
        console.log(`        ${colors.green('new file:   ' + file)}`);
      }
      console.log();
    }

    // Show modified files
    if (stat.modified.length > 0) {
      console.log('Changes not staged for commit:');
      console.log('  (use "wit add <file>..." to update what will be committed)');
      console.log();
      for (const file of stat.modified) {
        console.log(`        ${colors.red('modified:   ' + file)}`);
      }
      console.log();
    }

    // Show deleted files
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
    if (stat.staged.length === 0 && stat.modified.length === 0 && 
        stat.untracked.length === 0 && stat.deleted.length === 0) {
      console.log('nothing to commit, working tree clean');
    } else if (stat.staged.length === 0) {
      console.log('no changes added to commit (use "wit add" to stage)');
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`error: ${error.message}`);
    }
    process.exit(1);
  }
}
