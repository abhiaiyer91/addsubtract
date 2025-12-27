import * as path from 'path';
import { Repository } from '../core/repository';
import { TsgitError, Errors } from '../core/errors';
import { exists } from '../utils/fs';

export function init(directory: string = '.'): void {
  try {
    const absolutePath = path.resolve(directory);
    
    // Check if already a repository
    const gitDir = path.join(absolutePath, '.wit');
    if (exists(gitDir)) {
      throw Errors.repositoryExists(absolutePath);
    }
    
    const repo = Repository.init(directory);
    console.log(`Initialized empty wit repository in ${repo.gitDir}`);
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      // Handle permission errors
      if (error.message.includes('EACCES') || error.message.includes('permission')) {
        console.error(`error: Permission denied: ${directory}`);
        console.error('\nhint:');
        console.error('  Check directory permissions');
        console.error('  Try: sudo wit init (if appropriate)');
      } else if (error.message.includes('ENOENT')) {
        console.error(`error: Directory does not exist: ${directory}`);
        console.error('\nhint:');
        console.error(`  mkdir -p ${directory}    # Create directory first`);
      } else {
        console.error(`error: ${error.message}`);
      }
    }
    process.exit(1);
  }
}
