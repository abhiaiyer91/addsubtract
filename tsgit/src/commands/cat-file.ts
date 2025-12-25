import { Repository } from '../core/repository';

export function catFile(hash: string, options: { type?: boolean; showSize?: boolean; print?: boolean } = {}): void {
  try {
    const repo = Repository.find();
    const { type, content } = repo.objects.readRawObject(hash);

    if (options.type) {
      console.log(type);
    } else if (options.showSize) {
      console.log(content.length);
    } else if (options.print) {
      if (type === 'tree') {
        // Special formatting for trees
        const tree = repo.objects.readTree(hash);
        for (const entry of tree.entries) {
          const entryType = entry.mode === '40000' ? 'tree' : 'blob';
          console.log(`${entry.mode} ${entryType} ${entry.hash}    ${entry.name}`);
        }
      } else {
        console.log(content.toString('utf8'));
      }
    } else {
      console.log(content.toString('utf8'));
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`error: ${error.message}`);
    }
    process.exit(1);
  }
}
