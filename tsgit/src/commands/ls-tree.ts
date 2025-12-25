import { Repository } from '../core/repository';

export function lsTree(treeish: string, options: { recursive?: boolean; nameOnly?: boolean } = {}): void {
  try {
    const repo = Repository.find();
    
    // Resolve to a commit or tree hash
    let treeHash: string;
    
    const hash = repo.refs.resolve(treeish);
    if (!hash) {
      console.error(`error: not a valid object name: ${treeish}`);
      process.exit(1);
    }

    // Check if it's a commit
    try {
      const commit = repo.objects.readCommit(hash);
      treeHash = commit.treeHash;
    } catch {
      // Assume it's already a tree
      treeHash = hash;
    }

    printTree(repo, treeHash, '', options);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`error: ${error.message}`);
    }
    process.exit(1);
  }
}

function printTree(
  repo: Repository,
  treeHash: string,
  prefix: string,
  options: { recursive?: boolean; nameOnly?: boolean }
): void {
  const tree = repo.objects.readTree(treeHash);

  for (const entry of tree.entries) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const type = entry.mode === '40000' ? 'tree' : 'blob';

    if (options.nameOnly) {
      console.log(fullPath);
    } else {
      console.log(`${entry.mode} ${type} ${entry.hash}\t${fullPath}`);
    }

    if (options.recursive && entry.mode === '40000') {
      printTree(repo, entry.hash, fullPath, options);
    }
  }
}
