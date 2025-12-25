import { Repository } from '../core/repository';

export function checkout(ref: string, options: { createBranch?: boolean } = {}): void {
  try {
    const repo = Repository.find();
    repo.checkout(ref, options.createBranch);
    
    if (options.createBranch) {
      console.log(`Switched to a new branch '${ref}'`);
    } else if (repo.refs.branchExists(ref)) {
      console.log(`Switched to branch '${ref}'`);
    } else {
      console.log(`Note: switching to '${ref}'.`);
      console.log();
      console.log("You are in 'detached HEAD' state.");
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`error: ${error.message}`);
    }
    process.exit(1);
  }
}
