import { Repository } from '../core/repository';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

export function branch(
  name?: string,
  options: { delete?: boolean; list?: boolean } = {}
): void {
  try {
    const repo = Repository.find();

    if (options.delete && name) {
      repo.deleteBranch(name);
      console.log(`Deleted branch ${name}`);
      return;
    }

    if (name && !options.list) {
      repo.createBranch(name);
      console.log(`Created branch ${name}`);
      return;
    }

    // List branches
    const branches = repo.listBranches();
    
    if (branches.length === 0) {
      console.log('No branches yet');
      return;
    }

    for (const b of branches) {
      if (b.isCurrent) {
        console.log(`* ${colors.green(b.name)}`);
      } else {
        console.log(`  ${b.name}`);
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`error: ${error.message}`);
    }
    process.exit(1);
  }
}
