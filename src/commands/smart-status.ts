/**
 * Smart Status - The killer "wit" command
 * 
 * When you run `wit` with no arguments, this gives you:
 * 1. Intelligent understanding of what you're working on
 * 2. Smart status that groups changes by intent
 * 3. Background indexing for instant semantic search
 * 4. Interactive mode to ask questions
 * 
 * This is the wedge that makes developers say "holy shit" and never go back to git.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';
import { Repository } from '../core/repository';
import { exists } from '../utils/fs';
import { c } from '../utils/colors';

// Lazy load AI features to avoid missing dependency issues
let _aiModule: typeof import('../ai/mastra') | null = null;
let _searchModule: typeof import('../search') | null = null;

async function getAIModule() {
  if (!_aiModule) {
    try {
      _aiModule = await import('../ai/mastra');
    } catch {
      return null;
    }
  }
  return _aiModule;
}

async function getSearchModule() {
  if (!_searchModule) {
    try {
      _searchModule = await import('../search');
    } catch {
      return null;
    }
  }
  return _searchModule;
}

function isAIAvailable(): boolean {
  return !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

// ansi available for raw color access (aliased as colors in original code)

/**
 * Infer what the user is working on from branch name and changes
 */
function inferWorkContext(branchName: string, changedFiles: string[]): string {
  // Common branch naming patterns
  const patterns = [
    { regex: /^(feature|feat)[\/\-](.+)$/i, format: (m: RegExpMatchArray) => `feature: ${m[2].replace(/[-_]/g, ' ')}` },
    { regex: /^(fix|bugfix|hotfix)[\/\-](.+)$/i, format: (m: RegExpMatchArray) => `fixing: ${m[2].replace(/[-_]/g, ' ')}` },
    { regex: /^(refactor)[\/\-](.+)$/i, format: (m: RegExpMatchArray) => `refactoring: ${m[2].replace(/[-_]/g, ' ')}` },
    { regex: /^(docs)[\/\-](.+)$/i, format: (m: RegExpMatchArray) => `documentation: ${m[2].replace(/[-_]/g, ' ')}` },
    { regex: /^(test)[\/\-](.+)$/i, format: (m: RegExpMatchArray) => `testing: ${m[2].replace(/[-_]/g, ' ')}` },
    { regex: /^(chore)[\/\-](.+)$/i, format: (m: RegExpMatchArray) => `maintenance: ${m[2].replace(/[-_]/g, ' ')}` },
    { regex: /^([A-Z]+-\d+)[\/\-]?(.*)$/i, format: (m: RegExpMatchArray) => `ticket ${m[1]}${m[2] ? `: ${m[2].replace(/[-_]/g, ' ')}` : ''}` },
  ];

  for (const { regex, format } of patterns) {
    const match = branchName.match(regex);
    if (match) {
      return format(match);
    }
  }

  // Infer from changed files
  if (changedFiles.length > 0) {
    const dirs = new Set(changedFiles.map(f => f.split('/')[0]).filter(d => d && !d.includes('.')));
    if (dirs.size === 1) {
      return `changes in ${[...dirs][0]}`;
    }
    if (dirs.size <= 3) {
      return `changes across ${[...dirs].join(', ')}`;
    }
  }

  if (branchName === 'main' || branchName === 'master') {
    return 'main branch';
  }

  return branchName.replace(/[-_]/g, ' ');
}

/**
 * Group files by their likely purpose
 */
function groupFilesByPurpose(files: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  
  const categorize = (file: string): string => {
    const lower = file.toLowerCase();
    
    if (lower.includes('test') || lower.includes('spec')) return 'Tests';
    if (lower.includes('readme') || lower.includes('doc') || lower.endsWith('.md')) return 'Documentation';
    if (lower.includes('config') || lower.includes('.json') || lower.includes('.yaml') || lower.includes('.yml')) return 'Configuration';
    if (lower.includes('style') || lower.includes('.css') || lower.includes('.scss')) return 'Styles';
    if (lower.startsWith('src/api') || lower.includes('route') || lower.includes('endpoint')) return 'API';
    if (lower.includes('component') || lower.includes('.tsx') || lower.includes('.jsx')) return 'Components';
    if (lower.includes('util') || lower.includes('helper') || lower.includes('lib')) return 'Utilities';
    
    return 'Source';
  };
  
  for (const file of files) {
    const category = categorize(file);
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category)!.push(file);
  }
  
  return groups;
}

/**
 * Get a quick summary of the repo (for future use in enhanced status)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _getRepoSummary(repo: Repository): { type: string; framework?: string; language: string } {
  const workDir = repo.workDir;
  
  // Check for common project files
  const hasPackageJson = exists(path.join(workDir, 'package.json'));
  const hasCargoToml = exists(path.join(workDir, 'Cargo.toml'));
  const hasPyproject = exists(path.join(workDir, 'pyproject.toml')) || exists(path.join(workDir, 'setup.py'));
  const hasGoMod = exists(path.join(workDir, 'go.mod'));
  
  if (hasPackageJson) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(workDir, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      
      if (deps['next']) return { type: 'Next.js app', framework: 'Next.js', language: 'TypeScript/JavaScript' };
      if (deps['react']) return { type: 'React app', framework: 'React', language: 'TypeScript/JavaScript' };
      if (deps['vue']) return { type: 'Vue app', framework: 'Vue', language: 'TypeScript/JavaScript' };
      if (deps['express'] || deps['hono'] || deps['fastify']) return { type: 'Node.js server', framework: deps['express'] ? 'Express' : deps['hono'] ? 'Hono' : 'Fastify', language: 'TypeScript/JavaScript' };
      
      return { type: 'Node.js project', language: 'TypeScript/JavaScript' };
    } catch {
      return { type: 'Node.js project', language: 'JavaScript' };
    }
  }
  
  if (hasCargoToml) return { type: 'Rust project', language: 'Rust' };
  if (hasPyproject) return { type: 'Python project', language: 'Python' };
  if (hasGoMod) return { type: 'Go project', language: 'Go' };
  
  return { type: 'repository', language: 'unknown' };
}

/**
 * Check if semantic index exists and is recent
 */
function checkIndexStatus(repo: Repository): { indexed: boolean; stale: boolean; fileCount?: number } {
  const indexPath = path.join(repo.gitDir, 'semantic-index');
  
  if (!exists(indexPath)) {
    return { indexed: false, stale: false };
  }
  
  try {
    const metaPath = path.join(indexPath, 'metadata.json');
    if (!exists(metaPath)) {
      return { indexed: false, stale: false };
    }
    
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const indexTime = new Date(meta.lastIndexed || 0).getTime();
    const now = Date.now();
    const hoursSinceIndex = (now - indexTime) / (1000 * 60 * 60);
    
    return {
      indexed: true,
      stale: hoursSinceIndex > 24,
      fileCount: meta.fileCount,
    };
  } catch {
    return { indexed: false, stale: false };
  }
}

/**
 * Start background indexing
 */
function startBackgroundIndex(repo: Repository): void {
  // Fork a background process to index
  // For now, we just log - in production this would spawn a worker
  console.log(c('dim', '\n  Indexing repository for semantic search...'));
  
  setImmediate(async () => {
    try {
      const searchModule = await getSearchModule();
      if (!searchModule) return;
      const search = searchModule.createSemanticSearch(repo);
      await search.indexRepository({ verbose: false, batchSize: 50 });
      // Don't log completion - it's background
    } catch {
      // Silently fail - indexing is best-effort
    }
  });
}

/**
 * Print the smart status header
 */
function printHeader(repo: Repository, context: string): void {
  const repoName = path.basename(repo.workDir);
  
  console.log();
  console.log(`  ${c('bold', c('cyan', 'wit'))} ${c('dim', '·')} ${c('white', repoName)}`);
  console.log(`  ${c('dim', 'You\'re working on:')} ${c('yellow', context)}`);
  console.log();
}

/**
 * Print smart file status
 */
function printSmartStatus(repo: Repository): { hasChanges: boolean; changedFiles: string[] } {
  const status = repo.status();
  const allChanges = [...status.staged, ...status.modified, ...status.untracked];
  
  if (allChanges.length === 0 && status.deleted.length === 0) {
    console.log(`  ${c('green', '✓')} ${c('dim', 'Working tree clean')}`);
    return { hasChanges: false, changedFiles: [] };
  }
  
  // Group by purpose
  const stagedGroups = groupFilesByPurpose(status.staged);
  const modifiedGroups = groupFilesByPurpose([...status.modified, ...status.deleted]);
  // const untrackedGroups = groupFilesByPurpose(status.untracked); // For future detailed view
  
  // Print staged
  if (status.staged.length > 0) {
    console.log(`  ${c('green', '●')} ${c('bold', 'Ready to commit')} ${c('dim', `(${status.staged.length} files)`)}`);
    for (const [category, files] of stagedGroups) {
      if (files.length <= 3) {
        console.log(`    ${c('dim', category + ':')} ${files.map(f => c('green', path.basename(f))).join(', ')}`);
      } else {
        console.log(`    ${c('dim', category + ':')} ${c('green', `${files.length} files`)}`);
      }
    }
    console.log();
  }
  
  // Print modified
  if (status.modified.length > 0 || status.deleted.length > 0) {
    const count = status.modified.length + status.deleted.length;
    console.log(`  ${c('yellow', '●')} ${c('bold', 'Modified')} ${c('dim', `(${count} files)`)}`);
    for (const [category, files] of modifiedGroups) {
      if (files.length <= 3) {
        console.log(`    ${c('dim', category + ':')} ${files.map(f => c('yellow', path.basename(f))).join(', ')}`);
      } else {
        console.log(`    ${c('dim', category + ':')} ${c('yellow', `${files.length} files`)}`);
      }
    }
    console.log();
  }
  
  // Print untracked (abbreviated)
  if (status.untracked.length > 0) {
    if (status.untracked.length <= 5) {
      console.log(`  ${c('dim', '●')} ${c('dim', 'Untracked:')} ${status.untracked.map(f => path.basename(f)).join(', ')}`);
    } else {
      console.log(`  ${c('dim', '●')} ${c('dim', `${status.untracked.length} untracked files`)}`);
    }
    console.log();
  }
  
  return { hasChanges: true, changedFiles: allChanges };
}

/**
 * Print quick actions
 */
function printQuickActions(hasChanges: boolean, hasStagedChanges: boolean): void {
  console.log(`  ${c('dim', '─'.repeat(50))}`);
  console.log();
  
  if (hasStagedChanges) {
    console.log(`  ${c('cyan', 'wit commit')}     ${c('dim', '·')} commit staged changes`);
    console.log(`  ${c('cyan', 'wit ai commit')} ${c('dim', '·')} commit with AI-generated message`);
  } else if (hasChanges) {
    console.log(`  ${c('cyan', 'wit add .')}     ${c('dim', '·')} stage all changes`);
    console.log(`  ${c('cyan', 'wit wip')}       ${c('dim', '·')} quick save work-in-progress`);
  }
  
  console.log(`  ${c('cyan', 'wit ai "..."')}  ${c('dim', '·')} ask anything about this codebase`);
  console.log();
}

/**
 * Interactive mode - ask questions
 */
async function enterInteractiveMode(_repo: Repository): Promise<void> {
  if (!isAIAvailable()) {
    console.log(c('dim', '  AI features require OPENAI_API_KEY or ANTHROPIC_API_KEY'));
    console.log();
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`  ${c('dim', 'Ask me anything about this codebase (or press Enter to exit)')}`);
  console.log();

  const askQuestion = (): void => {
    rl.question(`  ${c('cyan', '→')} `, async (input) => {
      const query = input.trim();
      
      if (!query) {
        rl.close();
        console.log();
        return;
      }

      try {
        const aiModule = await getAIModule();
        if (!aiModule) {
          console.log(`  ${c('red', 'AI module not available')}\n`);
          askQuestion();
          return;
        }
        
        const agent = aiModule.getTsgitAgent();
        console.log();
        
        const result = await agent.stream(query);
        process.stdout.write('  ');
        
        for await (const chunk of result.textStream) {
          // Indent multi-line responses
          process.stdout.write(chunk.replace(/\n/g, '\n  '));
        }
        
        console.log('\n');
      } catch (error) {
        console.log(`  ${c('red', 'Error:')} ${error instanceof Error ? error.message : 'Unknown error'}\n`);
      }
      
      askQuestion();
    });
  };

  askQuestion();
}

/**
 * The main smart status command
 */
export async function handleSmartStatus(args: string[]): Promise<void> {
  // Check if we're in a repo
  let repo: Repository;
  try {
    repo = Repository.find();
  } catch {
    // Not in a repo - show welcome message
    console.log();
    console.log(`  ${c('bold', c('cyan', 'wit'))} ${c('dim', '· Git that understands your code')}`);
    console.log();
    console.log(`  ${c('dim', 'Not in a repository.')}`);
    console.log();
    console.log(`  ${c('cyan', 'wit init')}        ${c('dim', '·')} create a new repository here`);
    console.log(`  ${c('cyan', 'wit clone <url>')} ${c('dim', '·')} clone an existing repository`);
    console.log();
    return;
  }

  const branch = repo.refs.getCurrentBranch() || 'HEAD';
  const status = repo.status();
  const allChanges = [...status.staged, ...status.modified, ...status.untracked];
  
  // Infer what user is working on
  const context = inferWorkContext(branch, allChanges);
  
  // Print header
  printHeader(repo, context);
  
  // Print smart status
  const { hasChanges } = printSmartStatus(repo);
  
  // Print quick actions
  printQuickActions(hasChanges, status.staged.length > 0);
  
  // Check index status and start background indexing if needed
  const indexStatus = checkIndexStatus(repo);
  if (!indexStatus.indexed || indexStatus.stale) {
    if (isAIAvailable()) {
      startBackgroundIndex(repo);
    }
  }
  
  // If --interactive or -i flag, enter interactive mode
  if (args.includes('-i') || args.includes('--interactive')) {
    await enterInteractiveMode(repo);
  }
}

export default handleSmartStatus;
