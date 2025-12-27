import * as path from 'path';
import { Repository } from '../core/repository';
import { TsgitError, Errors } from '../core/errors';
import { exists } from '../utils/fs';

export function add(files: string[]): void {
  try {
    const repo = Repository.find();
    
    if (files.length === 0 || files[0] === '.') {
      repo.addAll();
      console.log('Added all files to staging area');
    } else {
      const notFound: string[] = [];
      const added: string[] = [];
      
      for (const file of files) {
        const absolutePath = path.resolve(repo.workDir, file);
        
        // Check if file exists before adding
        if (!exists(absolutePath)) {
          notFound.push(file);
          continue;
        }
        
        try {
          repo.add(file);
          added.push(file);
        } catch (err) {
          if (err instanceof Error && err.message.includes('outside')) {
            console.error(`error: '${file}' is outside the repository`);
            console.error('\nhint:');
            console.error('  Check that you are in the correct directory');
            process.exit(1);
          }
          throw err;
        }
      }
      
      // Report results
      for (const file of added) {
        console.log(`Added: ${file}`);
      }
      
      // Report files not found
      if (notFound.length > 0) {
        console.error(`\nerror: pathspec '${notFound.join("', '")}' did not match any files`);
        console.error('\nhint:');
        console.error('  ls                    # Check files in current directory');
        console.error('  wit status            # See tracked and untracked files');
        process.exit(1);
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
