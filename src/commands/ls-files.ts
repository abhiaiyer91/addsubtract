import { Repository } from '../core/repository';

export function lsFiles(options: { stage?: boolean } = {}): void {
  try {
    const repo = Repository.find();
    const entries = repo.index.getEntries();

    for (const entry of entries) {
      if (options.stage) {
        console.log(`${entry.mode} ${entry.hash} ${entry.stage}\t${entry.path}`);
      } else {
        console.log(entry.path);
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`error: ${error.message}`);
    }
    process.exit(1);
  }
}
