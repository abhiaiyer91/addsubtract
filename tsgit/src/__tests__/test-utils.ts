/**
 * Test utilities for tsgit tests
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Repository } from '../core/repository';

/**
 * Create a temporary directory for testing
 */
export function createTempDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsgit-test-'));
  return tempDir;
}

/**
 * Clean up a temporary directory
 */
export function cleanupTempDir(dir: string): void {
  if (dir.includes('tsgit-test-') && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Create a test repository with some initial content
 */
export function createTestRepo(dir?: string): { repo: Repository; dir: string } {
  const testDir = dir || createTempDir();
  
  // Initialize repository
  const repo = Repository.init(testDir);
  
  return { repo, dir: testDir };
}

/**
 * Create a test file in the repository
 */
export function createTestFile(repoDir: string, filePath: string, content: string): string {
  const fullPath = path.join(repoDir, filePath);
  const dir = path.dirname(fullPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(fullPath, content);
  return fullPath;
}

/**
 * Read a file from the repository
 */
export function readTestFile(repoDir: string, filePath: string): string {
  const fullPath = path.join(repoDir, filePath);
  return fs.readFileSync(fullPath, 'utf8');
}

/**
 * Check if a file exists in the repository
 */
export function fileExists(repoDir: string, filePath: string): boolean {
  const fullPath = path.join(repoDir, filePath);
  return fs.existsSync(fullPath);
}

/**
 * Set up a repo with an initial commit
 */
export function createRepoWithCommit(dir?: string): { repo: Repository; dir: string; commitHash: string } {
  const { repo, dir: testDir } = createTestRepo(dir);
  
  // Create a file and commit
  createTestFile(testDir, 'README.md', '# Test Project\n');
  repo.add('README.md');
  const commitHash = repo.commit('Initial commit');
  
  return { repo, dir: testDir, commitHash };
}

/**
 * Set up a repo with multiple commits
 */
export function createRepoWithMultipleCommits(numCommits: number = 3): { 
  repo: Repository; 
  dir: string; 
  commits: string[];
} {
  const { repo, dir } = createTestRepo();
  const commits: string[] = [];
  
  for (let i = 1; i <= numCommits; i++) {
    createTestFile(dir, `file${i}.txt`, `Content ${i}\n`);
    repo.add(`file${i}.txt`);
    const hash = repo.commit(`Commit ${i}`);
    commits.push(hash);
  }
  
  return { repo, dir, commits };
}

/**
 * Set up a repo with multiple branches
 */
export function createRepoWithBranches(branches: string[]): {
  repo: Repository;
  dir: string;
  branchHashes: Map<string, string>;
} {
  const { repo, dir, commitHash } = createRepoWithCommit();
  const branchHashes = new Map<string, string>();
  branchHashes.set('main', commitHash);
  
  for (const branch of branches) {
    repo.createBranch(branch);
    branchHashes.set(branch, commitHash);
  }
  
  return { repo, dir, branchHashes };
}

/**
 * Suppress console output during tests
 */
export function suppressConsole(): { restore: () => void } {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
  
  return {
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    },
  };
}

/**
 * Capture console output during tests
 */
export function captureConsole(): { 
  getLogs: () => string[]; 
  getErrors: () => string[];
  restore: () => void;
} {
  const logs: string[] = [];
  const errors: string[] = [];
  
  const originalLog = console.log;
  const originalError = console.error;
  
  console.log = (...args: unknown[]) => {
    logs.push(args.map(a => String(a)).join(' '));
  };
  
  console.error = (...args: unknown[]) => {
    errors.push(args.map(a => String(a)).join(' '));
  };
  
  return {
    getLogs: () => logs,
    getErrors: () => errors,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}
