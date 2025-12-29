import { Repository } from '../core/repository';
import { Commit } from '../core/object';

const colors = {
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

interface LogOptions {
  oneline?: boolean;
  n?: number;
  aiAuthored?: boolean;      // Show only AI-authored commits
  showAiAgent?: boolean;     // Show which AI agent made each commit
  showPrompt?: boolean;      // Show the prompt that generated each commit
}

// AI attribution cache (in-memory for CLI, would use DB in server context)
// This will be populated from the database in server environments
interface AiAttribution {
  commitSha: string;
  agentType: string;
  inputPrompt?: string;
  confidenceScore?: number;
  authorizedByUserId?: string;
}

// Mock function to get AI attribution - in production this queries the database
// For now, we detect AI commits by author email pattern
function getAiAttribution(commit: Commit): AiAttribution | null {
  // Check if commit was made by wit AI (author email contains 'ai@wit' or author name is 'wit AI')
  const isAiCommit = 
    commit.author.email.includes('ai@wit') ||
    commit.author.name.toLowerCase().includes('wit ai') ||
    commit.author.name.toLowerCase() === 'wit-bot';
  
  if (!isAiCommit) {
    return null;
  }
  
  // Extract agent type from commit message if present
  // Convention: AI commits may include [agent:code] or similar in the message
  const agentMatch = commit.message.match(/\[agent:(\w+)\]/);
  const agentType = agentMatch ? agentMatch[1] : 'code';
  
  return {
    commitSha: commit.hash(),
    agentType,
    // In a real implementation, these would come from the database
    inputPrompt: undefined,
    confidenceScore: undefined,
    authorizedByUserId: undefined,
  };
}

export function log(ref: string = 'HEAD', options: LogOptions = {}): void {
  try {
    const repo = Repository.find();
    let commits = repo.log(ref, options.n || 10);

    // Filter to AI-authored commits if requested
    if (options.aiAuthored) {
      commits = commits.filter(commit => getAiAttribution(commit) !== null);
      
      if (commits.length === 0) {
        console.log(colors.dim('No AI-authored commits found'));
        console.log(colors.dim('AI commits are created by wit AI agents (author: wit AI <ai@wit.dev>)'));
        return;
      }
    }

    if (commits.length === 0) {
      console.log('No commits yet');
      return;
    }

    // Get HEAD hash to mark it
    const headHash = repo.refs.resolve('HEAD');
    const currentBranch = repo.refs.getCurrentBranch();

    for (const commit of commits) {
      const hash = commit.hash();
      const aiAttr = options.showAiAgent || options.aiAuthored ? getAiAttribution(commit) : null;
      
      if (options.oneline) {
        const shortHash = colors.yellow(hash.slice(0, 7));
        const firstLine = commit.message.split('\n')[0];
        
        if (aiAttr) {
          const agentBadge = colors.magenta(`[${aiAttr.agentType}]`);
          console.log(`${shortHash} ${agentBadge} ${firstLine}`);
        } else {
          console.log(`${shortHash} ${firstLine}`);
        }
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
        
        // Add AI badge if this is an AI commit
        if (aiAttr) {
          commitLine += ` ${colors.magenta('[AI: ' + aiAttr.agentType + ']')}`;
        }
        
        console.log(commitLine);
        console.log(`Author: ${commit.author.name} <${commit.author.email}>`);
        console.log(`Date:   ${formatDate(commit.author.timestamp, commit.author.timezone)}`);
        
        // Show AI-specific information if requested
        if (aiAttr && (options.showAiAgent || options.aiAuthored)) {
          console.log();
          console.log(colors.dim(`    AI Agent: ${aiAttr.agentType}`));
          if (aiAttr.confidenceScore !== undefined) {
            const confidencePercent = Math.round(aiAttr.confidenceScore * 100);
            console.log(colors.dim(`    Confidence: ${confidencePercent}%`));
          }
          if (aiAttr.inputPrompt && options.showPrompt) {
            console.log(colors.dim(`    Prompt: "${aiAttr.inputPrompt.slice(0, 100)}${aiAttr.inputPrompt.length > 100 ? '...' : ''}"`));
          }
        }
        
        console.log();
        
        // Indent commit message
        const lines = commit.message.split('\n');
        for (const line of lines) {
          console.log(`    ${line}`);
        }
        console.log();
      }
    }
    
    // Show summary for AI-authored filter
    if (options.aiAuthored) {
      console.log(colors.dim(`─────────────────────────────────────────`));
      console.log(colors.dim(`Showing ${commits.length} AI-authored commit${commits.length !== 1 ? 's' : ''}`));
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
