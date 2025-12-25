import { Repository } from '../core/repository';
import * as path from 'path';

export function add(files: string[]): void {
  try {
    const repo = Repository.find();
    
    if (files.length === 0 || files[0] === '.') {
      repo.addAll();
      console.log('Added all files to staging area');
    } else {
      for (const file of files) {
        repo.add(file);
        console.log(`Added: ${file}`);
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`error: ${error.message}`);
    }
    process.exit(1);
  }
}
