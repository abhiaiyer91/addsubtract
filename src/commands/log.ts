import { Repository } from '../core/repository';
import { Commit } from '../core/object';
import { colors } from '../utils/colors';

export function log(ref: string = 'HEAD', options: { oneline?: boolean; n?: number } = {}): void {
  try {
    const repo = Repository.find();
    const commits = repo.log(ref, options.n || 10);

    if (commits.length === 0) {
      console.log('No commits yet');
      return;
    }

    // Get HEAD hash to mark it
    const headHash = repo.refs.resolve('HEAD');
    const currentBranch = repo.refs.getCurrentBranch();

    for (const commit of commits) {
      const hash = commit.hash();
      
      if (options.oneline) {
        const shortHash = colors.yellow(hash.slice(0, 7));
        const firstLine = commit.message.split('\n')[0];
        console.log(`${shortHash} ${firstLine}`);
      } else {
        // Full log format
        let commitLine = colors.yellow(`commit ${hash}`);
        
        if (hash === headHash) {
          if (currentBranch) {
            commitLine += ` (${colors.cyan('HEAD -> ' + currentBranch)})`;
          } else {
            commitLine += ` (${colors.cyan('HEAD')})`;
          }
        }
        
        console.log(commitLine);
        console.log(`Author: ${commit.author.name} <${commit.author.email}>`);
        console.log(`Date:   ${formatDate(commit.author.timestamp, commit.author.timezone)}`);
        console.log();
        
        // Indent commit message
        const lines = commit.message.split('\n');
        for (const line of lines) {
          console.log(`    ${line}`);
        }
        console.log();
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`error: ${error.message}`);
    }
    process.exit(1);
  }
}

function formatDate(timestamp: number, timezone: string): string {
  const date = new Date(timestamp * 1000);
  const options: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };
  
  return date.toLocaleString('en-US', options) + ' ' + timezone;
}
