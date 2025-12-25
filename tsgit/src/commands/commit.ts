import { Repository } from '../core/repository';

export function commit(message: string): void {
  if (!message || message.trim() === '') {
    console.error('error: empty commit message');
    process.exit(1);
  }

  try {
    const repo = Repository.find();
    const hash = repo.commit(message);
    
    const branch = repo.refs.getCurrentBranch();
    const shortHash = hash.slice(0, 7);
    
    if (branch) {
      console.log(`[${branch} ${shortHash}] ${message.split('\n')[0]}`);
    } else {
      console.log(`[detached HEAD ${shortHash}] ${message.split('\n')[0]}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`error: ${error.message}`);
    }
    process.exit(1);
  }
}
