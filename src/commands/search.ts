/**
 * wit search - The killer semantic search command
 * 
 * Ask questions about your codebase in natural language.
 * This is the feature that makes developers say "holy shit."
 * 
 * Examples:
 *   wit search "where do we handle authentication"
 *   wit search "how does the PR merge work"
 *   wit search "find all API endpoints"
 *   wit search index         # Index repo for semantic search
 *   wit search status        # Show index health
 */

import * as readline from 'readline';
import { Repository } from '../core/repository';
import { SearchEngine, ContentSearchResult } from '../ui/search';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',
  
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgYellow: '\x1b[43m',
};

const c = (color: keyof typeof colors, text: string) => `${colors[color]}${text}${colors.reset}`;

// Lazy load search modules to avoid dependency issues
let _semanticSearch: typeof import('../search') | null = null;

async function getSemanticSearch() {
  if (!_semanticSearch) {
    try {
      _semanticSearch = await import('../search');
    } catch {
      return null;
    }
  }
  return _semanticSearch;
}

function hasApiKey(): boolean {
  return !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

/**
 * Print the search header
 */
function printHeader(query: string, mode: 'semantic' | 'text'): void {
  console.log();
  console.log(`  ${c('bold', c('cyan', 'wit search'))} ${c('dim', '·')} ${c('white', `"${query}"`)}`);
  if (mode === 'semantic') {
    console.log(`  ${c('dim', 'Using AI-powered semantic search')}`);
  } else {
    console.log(`  ${c('dim', 'Using text search (set OPENAI_API_KEY for semantic search)')}`);
  }
  console.log();
}

/**
 * Print a semantic search result with beautiful formatting
 */
function printSemanticResult(result: {
  path: string;
  startLine: number;
  endLine: number;
  content: string;
  score: number;
  chunkType: string;
  chunkName?: string;
  language: string;
}, _index: number): void {
  const scorePercent = Math.round(result.score * 100);
  const scoreColor = scorePercent >= 80 ? 'green' : scorePercent >= 60 ? 'yellow' : 'gray';
  
  // Header with file path and score
  console.log(`  ${c('cyan', '●')} ${c('bold', result.path)}:${c('yellow', String(result.startLine))}-${result.endLine} ${c('dim', '(')}${c(scoreColor, `${scorePercent}%`)}${c('dim', ' match)')}`);
  
  // Function/class name if available
  if (result.chunkName) {
    console.log(`    ${c('magenta', result.chunkType)}: ${c('white', result.chunkName)}`);
  }
  
  // Code preview (first few lines)
  const lines = result.content.split('\n').slice(0, 6);
  const maxLineNumWidth = String(result.startLine + lines.length).length;
  
  for (let i = 0; i < lines.length; i++) {
    const lineNum = String(result.startLine + i).padStart(maxLineNumWidth);
    const line = lines[i].slice(0, 80); // Truncate long lines
    const truncated = lines[i].length > 80 ? '...' : '';
    console.log(`    ${c('dim', '│')} ${c('dim', lineNum)} ${c('dim', '│')} ${line}${truncated}`);
  }
  
  if (result.content.split('\n').length > 6) {
    console.log(`    ${c('dim', '│')} ${c('dim', '...')} ${c('dim', `(${result.content.split('\n').length - 6} more lines)`)}`);
  }
  
  console.log();
}

/**
 * Print a text search result
 */
function printTextResult(result: ContentSearchResult, _index: number): void {
  console.log(`  ${c('cyan', '●')} ${c('bold', result.path)}:${c('yellow', String(result.lineNumber))}`);
  
  // Context before
  for (const line of result.context.before) {
    console.log(`    ${c('dim', '│')} ${c('dim', line.slice(0, 80))}`);
  }
  
  // Matched line with highlighting
  const highlighted = result.lineContent.replace(
    new RegExp(`(${escapeRegex(result.matchedText)})`, 'gi'),
    c('bgYellow', '$1')
  );
  console.log(`    ${c('dim', '│')} ${highlighted.slice(0, 100)}`);
  
  // Context after
  for (const line of result.context.after) {
    console.log(`    ${c('dim', '│')} ${c('dim', line.slice(0, 80))}`);
  }
  
  console.log();
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Handle the index subcommand
 */
async function handleIndex(repo: Repository, args: string[]): Promise<void> {
  const searchModule = await getSemanticSearch();
  
  if (!searchModule) {
    console.log(`  ${c('red', '✗')} Semantic search module not available`);
    console.log(`  ${c('dim', 'Install dependencies: npm install ai @ai-sdk/openai')}`);
    return;
  }
  
  if (!hasApiKey()) {
    console.log(`  ${c('red', '✗')} No API key found`);
    console.log(`  ${c('dim', 'Set OPENAI_API_KEY environment variable')}`);
    return;
  }
  
  const force = args.includes('--force') || args.includes('-f');
  
  console.log();
  console.log(`  ${c('cyan', 'wit search index')} ${c('dim', '· Indexing repository for semantic search')}`);
  console.log();
  
  if (force) {
    console.log(`  ${c('yellow', '!')} Force reindexing all files`);
    console.log();
  }
  
  const search = searchModule.createSemanticSearch(repo);
  
  console.log(`  ${c('dim', 'Scanning files...')}`);
  
  const stats = await search.indexRepository({
    force,
    verbose: false,
    batchSize: 20,
  });
  
  console.log();
  console.log(`  ${c('green', '✓')} Indexing complete`);
  console.log();
  console.log(`    Files indexed:  ${c('cyan', String(stats.filesIndexed))}`);
  console.log(`    Files skipped:  ${c('dim', String(stats.filesSkipped))}`);
  console.log(`    Code chunks:    ${c('cyan', String(stats.chunksCreated))}`);
  console.log(`    Duration:       ${c('dim', `${(stats.duration / 1000).toFixed(2)}s`)}`);
  
  if (stats.errors.length > 0) {
    console.log(`    Errors:         ${c('yellow', String(stats.errors.length))}`);
  }
  
  console.log();
}

/**
 * Handle the status subcommand
 */
async function handleStatus(repo: Repository): Promise<void> {
  const searchModule = await getSemanticSearch();
  
  console.log();
  console.log(`  ${c('cyan', 'wit search status')} ${c('dim', '· Index health')}`);
  console.log();
  
  if (!searchModule) {
    console.log(`  ${c('yellow', '!')} Semantic search module not available`);
    console.log(`  ${c('dim', 'Text search is always available')}`);
    console.log();
    return;
  }
  
  if (!hasApiKey()) {
    console.log(`  ${c('yellow', '!')} No API key configured`);
    console.log(`  ${c('dim', 'Set OPENAI_API_KEY for semantic search')}`);
    console.log();
  } else {
    console.log(`  ${c('green', '✓')} API key configured`);
  }
  
  try {
    const search = searchModule.createSemanticSearch(repo);
    const stats = search.getStats();
    
    if (stats.vectorCount === 0) {
      console.log(`  ${c('yellow', '!')} Index is empty`);
      console.log(`  ${c('dim', 'Run:')} ${c('cyan', 'wit search index')} ${c('dim', 'to index your repository')}`);
    } else {
      console.log(`  ${c('green', '✓')} Index is ready`);
      console.log();
      console.log(`    Vectors:     ${c('cyan', String(stats.vectorCount))}`);
      console.log(`    Files:       ${c('cyan', String(stats.fileCount))}`);
      console.log(`    Dimensions:  ${c('dim', String(stats.dimensions))}`);
      if (stats.lastUpdated) {
        const timestamp = stats.lastUpdated instanceof Date ? stats.lastUpdated.getTime() : stats.lastUpdated;
        const ago = formatTimeAgo(timestamp);
        console.log(`    Last update: ${c('dim', ago)}`);
      }
    }
  } catch {
    console.log(`  ${c('yellow', '!')} Could not read index status`);
  }
  
  console.log();
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

/**
 * Perform semantic search
 */
async function doSemanticSearch(repo: Repository, query: string, limit: number): Promise<boolean> {
  const searchModule = await getSemanticSearch();
  
  if (!searchModule) {
    return false;
  }
  
  try {
    const search = searchModule.createSemanticSearch(repo);
    const stats = search.getStats();
    
    // Check if index exists
    if (stats.vectorCount === 0) {
      console.log(`  ${c('yellow', '!')} Repository not indexed yet`);
      console.log(`  ${c('dim', 'Run:')} ${c('cyan', 'wit search index')} ${c('dim', 'first, or using text search...')}`);
      console.log();
      return false;
    }
    
    const startTime = Date.now();
    const results = await search.search(query, {
      limit,
      minSimilarity: 0.4,
    });
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    if (results.length === 0) {
      console.log(`  ${c('dim', 'No results found')}`);
      console.log();
      console.log(`  ${c('dim', 'Try:')} ${c('cyan', 'wit search --text "' + query + '"')} ${c('dim', 'for literal text search')}`);
      console.log();
      return true;
    }
    
    for (let i = 0; i < results.length; i++) {
      printSemanticResult(results[i], i);
    }
    
    console.log(`  ${c('dim', '─'.repeat(50))}`);
    console.log(`  ${c('dim', `Found ${results.length} results in ${duration}s · Index: ${stats.fileCount} files`)}`);
    console.log();
    
    return true;
  } catch {
    // Semantic search failed, fall back to text
    return false;
  }
}

/**
 * Perform text search (fallback)
 */
function doTextSearch(
  repo: Repository, 
  query: string, 
  limit: number,
  options?: { searchFiles?: boolean; searchContent?: boolean; filePattern?: string }
): void {
  const engine = new SearchEngine(repo);
  const startTime = Date.now();
  
  const results = engine.search(query, {
    searchCommits: false,
    searchFiles: options?.searchFiles ?? true,
    searchContent: options?.searchContent ?? true,
    maxResults: limit,
    contextLines: 2,
    filePattern: options?.filePattern,
  });
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  if (results.totalCount === 0) {
    console.log(`  ${c('dim', 'No results found')}`);
    console.log();
    return;
  }
  
  // Print file matches
  if (results.files.length > 0) {
    console.log(`  ${c('bold', 'Files')}`);
    for (const file of results.files.slice(0, 5)) {
      console.log(`    ${c('cyan', '●')} ${file.path}`);
    }
    if (results.files.length > 5) {
      console.log(`    ${c('dim', `... and ${results.files.length - 5} more`)}`);
    }
    console.log();
  }
  
  // Print content matches
  if (results.content.length > 0) {
    console.log(`  ${c('bold', 'Content')}`);
    for (const content of results.content.slice(0, limit)) {
      printTextResult(content, 0);
    }
  }
  
  console.log(`  ${c('dim', '─'.repeat(50))}`);
  console.log(`  ${c('dim', `Found ${results.totalCount} results in ${duration}s`)}`);
  console.log();
}

/**
 * Perform glob-based file search
 */
function doGlobSearch(repo: Repository, pattern: string, limit: number): void {
  const engine = new SearchEngine(repo);
  const startTime = Date.now();
  
  const results = engine.searchFilesByGlob(pattern, { maxResults: limit * 5 });
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  if (results.length === 0) {
    console.log(`  ${c('dim', 'No files found matching:')} ${c('white', pattern)}`);
    console.log();
    return;
  }
  
  console.log(`  ${c('bold', 'Files matching')} ${c('cyan', pattern)}`);
  console.log();
  
  for (const file of results.slice(0, limit * 3)) {
    console.log(`    ${c('cyan', '●')} ${file.path}`);
  }
  
  if (results.length > limit * 3) {
    console.log(`    ${c('dim', `... and ${results.length - limit * 3} more`)}`);
  }
  
  console.log();
  console.log(`  ${c('dim', '─'.repeat(50))}`);
  console.log(`  ${c('dim', `Found ${results.length} files in ${duration}s`)}`);
  console.log();
}

/**
 * Interactive search mode
 */
async function interactiveMode(repo: Repository): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  console.log();
  console.log(`  ${c('bold', c('cyan', 'wit search'))} ${c('dim', '· Interactive mode')}`);
  console.log(`  ${c('dim', 'Ask questions about your codebase. Press Ctrl+C to exit.')}`);
  console.log();
  
  const askQuestion = (): void => {
    rl.question(`  ${c('cyan', '→')} `, async (input) => {
      const query = input.trim();
      
      if (!query) {
        askQuestion();
        return;
      }
      
      if (query === 'exit' || query === 'quit' || query === 'q') {
        rl.close();
        console.log();
        return;
      }
      
      console.log();
      
      // Try semantic search first
      if (hasApiKey()) {
        const success = await doSemanticSearch(repo, query, 5);
        if (!success) {
          doTextSearch(repo, query, 5);
        }
      } else {
        doTextSearch(repo, query, 5);
      }
      
      askQuestion();
    });
  };
  
  askQuestion();
}

/**
 * Parse --in or --file flag value from args
 */
function parseFilePattern(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--in' || args[i] === '--file' || args[i] === '-f') && args[i + 1]) {
      return args[i + 1];
    }
    if (args[i].startsWith('--in=')) {
      return args[i].slice(5);
    }
    if (args[i].startsWith('--file=')) {
      return args[i].slice(7);
    }
  }
  return undefined;
}

/**
 * Main search command handler
 */
export async function handleSearch(args: string[]): Promise<void> {
  // Check if we're in a repo
  let repo: Repository;
  try {
    repo = Repository.find();
  } catch {
    console.log();
    console.log(`  ${c('red', '✗')} Not in a wit repository`);
    console.log(`  ${c('dim', 'Run:')} ${c('cyan', 'wit init')} ${c('dim', 'to create one')}`);
    console.log();
    return;
  }
  
  // Parse arguments
  const textOnly = args.includes('--text') || args.includes('-t');
  const interactive = args.includes('--interactive') || args.includes('-i');
  const filesOnly = args.includes('--files');
  const contentOnly = args.includes('--content') || args.includes('-c');
  const filePattern = parseFilePattern(args);
  const limit = 10;
  
  // Filter out flags and their values to get the query
  const skipNextArg = new Set<number>();
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--in' || args[i] === '--file' || args[i] === '-f') && args[i + 1]) {
      skipNextArg.add(i + 1);
    }
  }
  
  const queryParts = args.filter((arg, idx) => 
    !arg.startsWith('-') && 
    arg !== 'index' && 
    arg !== 'status' &&
    !skipNextArg.has(idx)
  );
  const query = queryParts.join(' ').trim();
  
  // Handle subcommands
  if (args[0] === 'index') {
    await handleIndex(repo, args.slice(1));
    return;
  }
  
  if (args[0] === 'status') {
    await handleStatus(repo);
    return;
  }
  
  // Handle files subcommand for glob-only search
  if (args[0] === 'files' && args[1]) {
    const pattern = args.slice(1).filter(a => !a.startsWith('-')).join(' ');
    doGlobSearch(repo, pattern, limit);
    return;
  }
  
  // Interactive mode
  if (interactive || args.length === 0) {
    await interactiveMode(repo);
    return;
  }
  
  // No query provided
  if (!query) {
    console.log();
    console.log(`  ${c('bold', c('cyan', 'wit search'))} ${c('dim', '· Search your codebase')}`);
    console.log();
    console.log(`  ${c('dim', 'Usage:')}`);
    console.log(`    ${c('cyan', 'wit search')} ${c('white', '"where do we handle auth"')}`);
    console.log(`    ${c('cyan', 'wit search')} ${c('white', '"find all API endpoints"')}`);
    console.log(`    ${c('cyan', 'wit search index')}     ${c('dim', '· Index repo for semantic search')}`);
    console.log(`    ${c('cyan', 'wit search status')}    ${c('dim', '· Check index health')}`);
    console.log(`    ${c('cyan', 'wit search -i')}        ${c('dim', '· Interactive mode')}`);
    console.log(`    ${c('cyan', 'wit search -t')} ${c('white', '"foo"')} ${c('dim', '· Force text search')}`);
    console.log();
    console.log(`  ${c('dim', 'File/Content Search:')}`);
    console.log(`    ${c('cyan', 'wit search files')} ${c('white', '"*.ts"')}       ${c('dim', '· Find files by glob pattern')}`);
    console.log(`    ${c('cyan', 'wit search')} ${c('white', '"foo"')} ${c('cyan', '--in')} ${c('white', '"*.ts"')} ${c('dim', '· Search in specific files')}`);
    console.log(`    ${c('cyan', 'wit search --files')} ${c('white', '"pattern"')} ${c('dim', '· Search file names only')}`);
    console.log(`    ${c('cyan', 'wit search --content')} ${c('white', '"pattern"')} ${c('dim', '· Search file contents only')}`);
    console.log();
    return;
  }
  
  // Determine search mode
  const useSemanticSearch = hasApiKey() && !textOnly && !filesOnly && !contentOnly && !filePattern;
  
  // File pattern only search (glob search)
  if (filesOnly) {
    console.log();
    console.log(`  ${c('bold', c('cyan', 'wit search --files'))} ${c('dim', '·')} ${c('white', `"${query}"`)}`);
    console.log(`  ${c('dim', 'Searching file names...')}`);
    console.log();
    doGlobSearch(repo, query, limit);
    return;
  }
  
  // Content only search (optionally in specific files)
  if (contentOnly || filePattern) {
    console.log();
    console.log(`  ${c('bold', c('cyan', 'wit search'))} ${c('dim', '·')} ${c('white', `"${query}"`)}`);
    if (filePattern) {
      console.log(`  ${c('dim', `Searching in files matching: ${filePattern}`)}`);
    } else {
      console.log(`  ${c('dim', 'Searching file contents...')}`);
    }
    console.log();
    doTextSearch(repo, query, limit, { 
      searchFiles: !contentOnly, 
      searchContent: true, 
      filePattern 
    });
    return;
  }
  
  printHeader(query, useSemanticSearch ? 'semantic' : 'text');
  
  if (useSemanticSearch) {
    const success = await doSemanticSearch(repo, query, limit);
    if (!success) {
      console.log(`  ${c('dim', 'Falling back to text search...')}`);
      console.log();
      doTextSearch(repo, query, limit);
    }
  } else {
    doTextSearch(repo, query, limit);
  }
}

export default handleSearch;
