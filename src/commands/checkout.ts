import { Repository } from '../core/repository';
import { TsgitError, Errors } from '../core/errors';

export function checkout(ref: string, options: { createBranch?: boolean } = {}): void {
  try {
    const repo = Repository.find();
    
    // Check if ref exists before attempting checkout
    if (!options.createBranch) {
      const branchExists = repo.refs.branchExists(ref);
      const tagExists = repo.refs.tagExists(ref);
      const isCommit = /^[a-f0-9]{4,40}$/i.test(ref) && repo.objects.hasObject(ref);
      
      if (!branchExists && !tagExists && !isCommit) {
        const branches = repo.refs.listBranches();
        throw Errors.branchNotFound(ref, branches);
      }
    }
    
    repo.checkout(ref, options.createBranch);
    
    if (options.createBranch) {
      console.log(`Switched to a new branch '${ref}'`);
    } else if (repo.refs.branchExists(ref)) {
      console.log(`Switched to branch '${ref}'`);
    } else {
      console.log(`Note: switching to '${ref}'.`);
      console.log();
      console.log("You are in 'detached HEAD' state. You can look around, make");
      console.log("experimental changes and commit them, and you can discard any");
      console.log("commits you make in this state without impacting any branches");
      console.log("by switching to another branch.");
      console.log();
      console.log("To create a new branch from this commit:");
      console.log(`  wit checkout -b <new-branch-name>`);
    }
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      // Handle specific error cases
      if (error.message.includes('uncommitted') || error.message.includes('overwritten')) {
        const repo = Repository.find();
        const status = repo.status();
        const changedFiles = [...status.modified, ...status.staged, ...status.deleted];
        console.error(Errors.checkoutConflict(changedFiles).format());
      } else {
        console.error(`error: ${error.message}`);
      }
    }
    process.exit(1);
  }
}
