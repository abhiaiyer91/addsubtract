import { Repository } from '../core/repository';
import { TsgitError, Errors } from '../core/errors';
import { colors } from '../utils/colors';

export function branch(
  name?: string,
  options: { delete?: boolean; list?: boolean } = {}
): void {
  try {
    const repo = Repository.find();

    if (options.delete && name) {
      // Check if branch exists
      if (!repo.refs.branchExists(name)) {
        const branches = repo.refs.listBranches();
        throw Errors.branchNotFound(name, branches);
      }
      
      // Check if trying to delete current branch
      const currentBranch = repo.refs.getCurrentBranch();
      if (currentBranch === name) {
        throw Errors.cannotDeleteCurrentBranch(name);
      }
      
      repo.deleteBranch(name);
      console.log(`Deleted branch ${name}`);
      return;
    }

    if (name && !options.list) {
      // Check if branch already exists
      if (repo.refs.branchExists(name)) {
        throw Errors.branchExists(name);
      }
      
      repo.createBranch(name);
      console.log(`Created branch ${name}`);
      return;
    }

    // List branches
    const branches = repo.listBranches();
    
    if (branches.length === 0) {
      console.log('No branches yet');
      console.log('\nhint:');
      console.log('  wit commit -m "Initial commit"    # Create initial commit first');
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
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(`error: ${error.message}`);
    }
    process.exit(1);
  }
}
