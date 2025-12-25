import { Repository } from '../core/repository';

export function init(directory: string = '.'): void {
  try {
    const repo = Repository.init(directory);
    console.log(`Initialized empty wit repository in ${repo.gitDir}`);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`error: ${error.message}`);
    }
    process.exit(1);
  }
}
