/**
 * Incremental Indexer
 * 
 * Keeps the knowledge base up-to-date by indexing changes as they happen.
 * Hooks into git events to ensure knowledge is always fresh.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getKnowledgeBase, KnowledgeBase } from './knowledge-base.js';
import { walkDir, loadIgnorePatterns, readFileText } from '../../utils/fs.js';
import { detectLanguage } from '../../search/embeddings.js';
import type { IndexOptions, IndexResult } from './types.js';

/**
 * Default file patterns to exclude from indexing
 */
const DEFAULT_EXCLUDES = [
  'node_modules/',
  '.git/',
  '.wit/',
  'dist/',
  'build/',
  'coverage/',
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.gif',
  '*.ico',
  '*.svg',
  '*.woff',
  '*.woff2',
  '*.ttf',
  '*.eot',
  '*.pdf',
  '*.zip',
  '*.tar',
  '*.gz',
  '*.bin',
  '*.exe',
  '*.dll',
  '*.so',
];

/**
 * File extensions we consider as code
 */
const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
  'py', 'pyi',
  'rs',
  'go',
  'java', 'kt', 'scala',
  'c', 'cpp', 'cc', 'h', 'hpp',
  'cs',
  'rb',
  'php',
  'swift',
  'sh', 'bash', 'zsh',
  'sql',
  'graphql', 'gql',
  'vue', 'svelte',
  'elm',
  'clj', 'cljs',
  'ex', 'exs',
  'erl', 'hrl',
  'hs',
  'ml', 'mli',
  'nim',
  'zig',
  'v',
]);

/**
 * File extensions we consider as documentation
 */
const DOC_EXTENSIONS = new Set([
  'md', 'mdx',
  'txt',
  'rst',
  'adoc',
]);

/**
 * Incremental Indexer
 * 
 * Manages indexing of repository content into the knowledge base.
 */
export class IncrementalIndexer {
  private repoId: string;
  private repoPath: string;
  private kb: KnowledgeBase;
  private indexedFiles: Map<string, number> = new Map(); // path -> mtime

  constructor(repoId: string, repoPath: string) {
    this.repoId = repoId;
    this.repoPath = repoPath;
    this.kb = getKnowledgeBase(repoId);
  }

  /**
   * Index the entire repository
   */
  async indexRepository(options: IndexOptions = {}): Promise<IndexResult> {
    const startTime = Date.now();
    const result: IndexResult = {
      chunksCreated: 0,
      filesProcessed: 0,
      skipped: 0,
      errors: [],
      duration: 0,
    };

    await this.kb.init();

    const {
      force = false,
      include = [],
      exclude = [],
      verbose = false,
      batchSize = 20,
    } = options;

    // Get ignore patterns
    const ignorePatterns = loadIgnorePatterns(this.repoPath);
    const allExcludes = [...ignorePatterns, ...DEFAULT_EXCLUDES, ...exclude];

    // Walk the directory
    const allFiles = walkDir(this.repoPath, allExcludes);
    let filesToIndex = allFiles.map(f => path.relative(this.repoPath, f));

    // Filter by include patterns
    if (include.length > 0) {
      filesToIndex = filesToIndex.filter(file =>
        include.some(pattern => this.matchPattern(file, pattern))
      );
    }

    if (verbose) {
      console.log(`Found ${filesToIndex.length} files to index`);
    }

    // Process in batches
    for (let i = 0; i < filesToIndex.length; i += batchSize) {
      const batch = filesToIndex.slice(i, i + batchSize);

      if (verbose) {
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(filesToIndex.length / batchSize)}`);
      }

      for (const filePath of batch) {
        try {
          const fullPath = path.join(this.repoPath, filePath);
          const stat = fs.statSync(fullPath);
          
          // Check if file needs reindexing
          const lastIndexed = this.indexedFiles.get(filePath);
          if (!force && lastIndexed && lastIndexed >= stat.mtimeMs) {
            result.skipped++;
            continue;
          }

          // Read file
          let content: string;
          try {
            content = readFileText(fullPath);
          } catch {
            // Skip binary files
            result.skipped++;
            continue;
          }

          // Skip empty files
          if (!content.trim()) {
            result.skipped++;
            continue;
          }

          // Index based on file type
          const ext = filePath.split('.').pop()?.toLowerCase() || '';
          let chunks = 0;

          if (CODE_EXTENSIONS.has(ext)) {
            const language = detectLanguage(filePath);
            chunks = await this.kb.indexCode(filePath, content, language);
          } else if (DOC_EXTENSIONS.has(ext)) {
            await this.kb.indexDocumentation(filePath, content);
            chunks = 1;
          } else {
            result.skipped++;
            continue;
          }

          result.filesProcessed++;
          result.chunksCreated += chunks;
          this.indexedFiles.set(filePath, stat.mtimeMs);

        } catch (error) {
          result.errors.push({
            source: filePath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    result.duration = Date.now() - startTime;

    if (verbose) {
      console.log(`\nIndexing complete:`);
      console.log(`  Files processed: ${result.filesProcessed}`);
      console.log(`  Chunks created: ${result.chunksCreated}`);
      console.log(`  Skipped: ${result.skipped}`);
      console.log(`  Errors: ${result.errors.length}`);
      console.log(`  Duration: ${(result.duration / 1000).toFixed(2)}s`);
    }

    return result;
  }

  /**
   * Index a single file (after it changed)
   */
  async indexFile(filePath: string): Promise<number> {
    const fullPath = path.join(this.repoPath, filePath);
    
    if (!fs.existsSync(fullPath)) {
      // File was deleted
      await this.kb.removeForFile(filePath);
      this.indexedFiles.delete(filePath);
      return 0;
    }

    // Remove old chunks for this file
    await this.kb.removeForFile(filePath);

    // Read and index
    let content: string;
    try {
      content = readFileText(fullPath);
    } catch {
      return 0;
    }

    if (!content.trim()) return 0;

    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    let chunks = 0;

    if (CODE_EXTENSIONS.has(ext)) {
      const language = detectLanguage(filePath);
      chunks = await this.kb.indexCode(filePath, content, language);
    } else if (DOC_EXTENSIONS.has(ext)) {
      await this.kb.indexDocumentation(filePath, content);
      chunks = 1;
    }

    const stat = fs.statSync(fullPath);
    this.indexedFiles.set(filePath, stat.mtimeMs);

    return chunks;
  }

  /**
   * Handle a commit event
   */
  async onCommit(commit: {
    sha: string;
    message: string;
    author: string;
    timestamp: Date;
    changedFiles: Array<{ path: string; status: 'added' | 'modified' | 'deleted' }>;
  }): Promise<void> {
    // Index the commit message
    await this.kb.indexCommit(
      commit.sha,
      commit.message,
      commit.author,
      commit.timestamp,
      commit.changedFiles.map(f => f.path)
    );

    // Update changed files
    for (const file of commit.changedFiles) {
      if (file.status === 'deleted') {
        await this.kb.removeForFile(file.path);
        this.indexedFiles.delete(file.path);
      } else {
        await this.indexFile(file.path);
      }
    }
  }

  /**
   * Handle a PR merge event
   */
  async onPRMerge(pr: {
    number: number;
    title: string;
    body: string;
    author: string;
    reviewComments: string[];
  }): Promise<void> {
    await this.kb.indexPR(
      pr.number,
      pr.title,
      pr.body,
      'merged',
      pr.author,
      pr.reviewComments
    );
  }

  /**
   * Handle an issue closed event
   */
  async onIssueClosed(issue: {
    number: number;
    title: string;
    body: string;
    state: string;
    labels: string[];
    author: string;
    resolution?: string;
  }): Promise<void> {
    const body = issue.resolution 
      ? `${issue.body}\n\nResolution: ${issue.resolution}`
      : issue.body;

    await this.kb.indexIssue(
      issue.number,
      issue.title,
      body,
      issue.state,
      issue.labels,
      issue.author
    );
  }

  /**
   * Detect and index project conventions
   */
  async indexConventions(): Promise<void> {
    // Check for common config files that indicate conventions
    const configFiles = [
      { file: '.eslintrc.js', convention: 'Uses ESLint for code linting' },
      { file: '.eslintrc.json', convention: 'Uses ESLint for code linting' },
      { file: 'eslint.config.js', convention: 'Uses ESLint flat config for linting' },
      { file: '.prettierrc', convention: 'Uses Prettier for code formatting' },
      { file: 'prettier.config.js', convention: 'Uses Prettier for code formatting' },
      { file: 'tsconfig.json', convention: 'TypeScript project with strict configuration' },
      { file: 'jest.config.js', convention: 'Uses Jest for testing' },
      { file: 'vitest.config.ts', convention: 'Uses Vitest for testing' },
      { file: 'tailwind.config.js', convention: 'Uses Tailwind CSS for styling' },
      { file: 'docker-compose.yml', convention: 'Uses Docker Compose for development' },
      { file: '.github/workflows', convention: 'Uses GitHub Actions for CI/CD' },
    ];

    for (const { file, convention } of configFiles) {
      const fullPath = path.join(this.repoPath, file);
      if (fs.existsSync(fullPath)) {
        await this.kb.addConvention(convention, [file]);
      }
    }

    // Check for common patterns in package.json
    const pkgPath = path.join(this.repoPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        
        if (pkg.type === 'module') {
          await this.kb.addConvention('Uses ESM modules (import/export)', ['package.json']);
        }
        
        if (pkg.scripts?.test) {
          await this.kb.addConvention(`Test command: npm test runs "${pkg.scripts.test}"`, ['package.json']);
        }
        
        if (pkg.scripts?.build) {
          await this.kb.addConvention(`Build command: npm run build runs "${pkg.scripts.build}"`, ['package.json']);
        }
      } catch {
        // Invalid package.json
      }
    }
  }

  /**
   * Index project architecture from directory structure
   */
  async indexArchitecture(): Promise<void> {
    // Detect common directory patterns
    const dirs = fs.readdirSync(this.repoPath, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => d.name);

    const patterns: string[] = [];

    if (dirs.includes('src')) {
      patterns.push('Source code in `src/` directory');
      
      // Check for common src subdirectories
      const srcDir = path.join(this.repoPath, 'src');
      if (fs.existsSync(srcDir)) {
        const srcDirs = fs.readdirSync(srcDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name);
        
        if (srcDirs.includes('components')) patterns.push('UI components in `src/components/`');
        if (srcDirs.includes('utils')) patterns.push('Utilities in `src/utils/`');
        if (srcDirs.includes('api')) patterns.push('API layer in `src/api/`');
        if (srcDirs.includes('db')) patterns.push('Database layer in `src/db/`');
        if (srcDirs.includes('core')) patterns.push('Core business logic in `src/core/`');
        if (srcDirs.includes('commands')) patterns.push('CLI commands in `src/commands/`');
        if (srcDirs.includes('routes')) patterns.push('Routes/handlers in `src/routes/`');
      }
    }

    if (dirs.includes('tests') || dirs.includes('test') || dirs.includes('__tests__')) {
      patterns.push('Tests in dedicated test directory');
    }

    if (dirs.includes('docs')) {
      patterns.push('Documentation in `docs/` directory');
    }

    if (dirs.includes('apps')) {
      patterns.push('Monorepo with multiple apps in `apps/`');
    }

    if (dirs.includes('packages')) {
      patterns.push('Monorepo with shared packages in `packages/`');
    }

    if (patterns.length > 0) {
      await this.kb.addArchitectureKnowledge(
        `Project Structure:\n${patterns.map(p => `- ${p}`).join('\n')}`,
        ['architecture', 'structure']
      );
    }
  }

  /**
   * Simple pattern matching
   */
  private matchPattern(file: string, pattern: string): boolean {
    const regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*');
    return new RegExp(`^${regex}$`).test(file);
  }
}

/**
 * Create an indexer for a repository
 */
export function createIndexer(repoId: string, repoPath: string): IncrementalIndexer {
  return new IncrementalIndexer(repoId, repoPath);
}
