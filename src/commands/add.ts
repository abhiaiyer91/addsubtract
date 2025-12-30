import * as path from 'path';
import { Repository } from '../core/repository';
import { TsgitError, Errors } from '../core/errors';
import { exists, isDirectory, walkDir, loadIgnorePatterns } from '../utils/fs';

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
        
        // Handle directories - add all files in directory
        if (isDirectory(absolutePath)) {
          const ignorePatterns = loadIgnorePatterns(repo.workDir);
          const filesInDir = walkDir(absolutePath, ignorePatterns);
          
          for (const fileInDir of filesInDir) {
            const relativePath = path.relative(repo.workDir, fileInDir);
            try {
              repo.add(relativePath);
              added.push(relativePath);
            } catch (err) {
              // Skip files that can't be added (e.g., binary issues)
              if (err instanceof Error && !err.message.includes('outside')) {
                continue;
              }
              throw err;
            }
          }
          continue;
        }
        
        try {
          repo.add(file);
          added.push(file);
        } catch (err) {
          if (err instanceof Error && err.message.includes('outside')) {
            throw Errors.pathOutsideRepository(file);
          }
          throw err;
        }
      }

      // Report results
      if (added.length > 0) {
        if (added.length <= 10) {
          for (const file of added) {
            console.log(`Added: ${file}`);
          }
        } else {
          console.log(`Added ${added.length} files to staging area`);
        }
      }

      // Report files not found
      if (notFound.length > 0) {
        throw Errors.pathspecNotFound(notFound.join("', '"));
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
