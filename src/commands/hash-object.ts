import { Repository } from '../core/repository';
import { Blob } from '../core/object';
import { readFile, exists } from '../utils/fs';
import { hashObject } from '../utils/hash';

export function hashObjectCommand(
  file: string,
  options: { write?: boolean; stdin?: boolean } = {}
): void {
  try {
    let content: Buffer;

    if (options.stdin) {
      // Read from stdin (for now, just error)
      console.error('stdin not yet implemented');
      process.exit(1);
    } else {
      if (!exists(file)) {
        console.error(`error: file not found: ${file}`);
        process.exit(1);
      }
      content = readFile(file);
    }

    const hash = hashObject('blob', content);

    if (options.write) {
      const repo = Repository.find();
      const blob = new Blob(content);
      repo.objects.writeObject(blob);
    }

    console.log(hash);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`error: ${error.message}`);
    }
    process.exit(1);
  }
}
