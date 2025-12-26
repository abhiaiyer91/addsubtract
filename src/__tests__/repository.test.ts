/**
 * Tests for the Repository class - the main entry point for all git operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../core/repository';
import {
  createTempDir,
  createRepoWithCommit,
  createRepoWithMultipleCommits,
  createRepoWithBranches,
  cleanupTempDir,
  createTestFile,
  readTestFile,
  fileExists,
  suppressConsole,
  restoreCwd,
} from './test-utils';

describe('Repository', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
    testDir = undefined;
  });

  // ===========================================
  // INITIALIZATION TESTS
  // ===========================================
  describe('initialization', () => {
    it('should initialize a new repository with init()', () => {
      testDir = createTempDir();
      process.chdir(testDir);

      repo = Repository.init(testDir);

      expect(repo).toBeInstanceOf(Repository);
      expect(repo.isValid()).toBe(true);
      expect(fs.existsSync(path.join(testDir, '.wit'))).toBe(true);
      expect(fs.existsSync(path.join(testDir, '.wit', 'objects'))).toBe(true);
      expect(fs.existsSync(path.join(testDir, '.wit', 'refs', 'heads'))).toBe(true);
      expect(fs.existsSync(path.join(testDir, '.wit', 'refs', 'tags'))).toBe(true);
    });

    it('should initialize with custom hash algorithm', () => {
      testDir = createTempDir();
      process.chdir(testDir);

      repo = Repository.init(testDir, { hashAlgorithm: 'sha1' });

      expect(repo.getHashAlgorithm()).toBe('sha1');
    });

    it('should throw error when initializing existing repository', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      expect(() => Repository.init(testDir!)).toThrow(/already exists/);
    });

    it('should find existing repository with find()', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;

      const found = Repository.find(testDir);

      expect(found).toBeInstanceOf(Repository);
      expect(found.workDir).toBe(testDir);
    });

    it('should find repository from subdirectory', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      const subDir = path.join(testDir, 'subdir');
      fs.mkdirSync(subDir, { recursive: true });

      const found = Repository.find(subDir);

      expect(found.workDir).toBe(testDir);
    });

    it('should throw error when no repository found', () => {
      testDir = createTempDir();

      expect(() => Repository.find(testDir!)).toThrow(/Not a wit repository/);
    });

    it('should validate repository with isValid()', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      expect(repo.isValid()).toBe(true);

      // Create an invalid repo (no objects dir)
      const invalidDir = createTempDir();
      fs.mkdirSync(path.join(invalidDir, '.wit'));
      const invalidRepo = new Repository(invalidDir);
      expect(invalidRepo.isValid()).toBe(false);
      cleanupTempDir(invalidDir);
    });

    it('should get repository configuration', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      const config = repo.getConfig();

      expect(config).toHaveProperty('hashAlgorithm');
      expect(config).toHaveProperty('largeFileThreshold');
      expect(config).toHaveProperty('autoStashOnSwitch');
    });
  });

  // ===========================================
  // STAGING TESTS
  // ===========================================
  describe('staging', () => {
    it('should add a single file with add()', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      createTestFile(testDir, 'newfile.txt', 'new content\n');
      repo.add(path.join(testDir, 'newfile.txt'));

      const status = repo.status();
      expect(status.staged).toContain('newfile.txt');
    });

    it('should add multiple files', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      createTestFile(testDir, 'file1.txt', 'content 1\n');
      createTestFile(testDir, 'file2.txt', 'content 2\n');

      repo.add(path.join(testDir, 'file1.txt'));
      repo.add(path.join(testDir, 'file2.txt'));

      const status = repo.status();
      expect(status.staged).toContain('file1.txt');
      expect(status.staged).toContain('file2.txt');
    });

    it('should add file in subdirectory', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      createTestFile(testDir, 'subdir/nested.txt', 'nested content\n');
      repo.add(path.join(testDir, 'subdir/nested.txt'));

      const status = repo.status();
      expect(status.staged.some(f => f.includes('nested.txt'))).toBe(true);
    });

    it('should stage all changes with addAll()', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      createTestFile(testDir, 'file1.txt', 'content 1\n');
      createTestFile(testDir, 'file2.txt', 'content 2\n');
      createTestFile(testDir, 'subdir/file3.txt', 'content 3\n');

      repo.addAll();

      const status = repo.status();
      expect(status.staged.length).toBeGreaterThanOrEqual(3);
    });

    it('should throw error when adding non-existent file', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      expect(() => repo.add(path.join(testDir!, 'nonexistent.txt'))).toThrow(/not found/);
    });

    it('should stage modified file', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      // Modify the README.md that was committed
      createTestFile(testDir, 'README.md', '# Updated Project\n');
      repo.add(path.join(testDir, 'README.md'));

      const status = repo.status();
      expect(status.staged).toContain('README.md');
    });
  });

  // ===========================================
  // COMMIT TESTS
  // ===========================================
  describe('commits', () => {
    it('should create a commit with message', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      createTestFile(testDir, 'newfile.txt', 'content\n');
      repo.add(path.join(testDir, 'newfile.txt'));
      const commitHash = repo.commit('Second commit');

      expect(commitHash).toBeTruthy();
      expect(commitHash.length).toBeGreaterThan(0);

      const commits = repo.log('HEAD', 1);
      expect(commits[0].message).toBe('Second commit');
    });

    it('should create commit with custom author info', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      createTestFile(testDir, 'newfile.txt', 'content\n');
      repo.add(path.join(testDir, 'newfile.txt'));

      const author = {
        name: 'Test Author',
        email: 'test@example.com',
        timestamp: Math.floor(Date.now() / 1000),
        timezone: '+0000',
      };
      const commitHash = repo.commit('Commit with author', author);

      const commits = repo.log('HEAD', 1);
      expect(commits[0].author.name).toBe('Test Author');
      expect(commits[0].author.email).toBe('test@example.com');
    });

    it('should throw error when nothing to commit', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      // Clear the index
      repo.index.clear();
      repo.index.save();

      expect(() => repo.commit('Empty commit')).toThrow(/Nothing to commit/);
    });

    it('should create commit with parent reference', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const firstCommit = result.commitHash;

      createTestFile(testDir, 'newfile.txt', 'content\n');
      repo.add(path.join(testDir, 'newfile.txt'));
      const secondCommit = repo.commit('Second commit');

      const commits = repo.log('HEAD', 1);
      expect(commits[0].parentHashes).toContain(firstCommit);
    });

    it('should update branch reference after commit', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      createTestFile(testDir, 'newfile.txt', 'content\n');
      repo.add(path.join(testDir, 'newfile.txt'));
      const commitHash = repo.commit('New commit');

      const headHash = repo.refs.resolve('HEAD');
      expect(headHash).toBe(commitHash);
    });

    it('should handle initial commit (no parent)', () => {
      testDir = createTempDir();
      process.chdir(testDir);
      repo = Repository.init(testDir);

      createTestFile(testDir, 'initial.txt', 'initial content\n');
      repo.add(path.join(testDir, 'initial.txt'));
      const commitHash = repo.commit('Initial commit');

      const commits = repo.log('HEAD', 1);
      expect(commits[0].parentHashes.length).toBe(0);
    });
  });

  // ===========================================
  // BRANCHING TESTS
  // ===========================================
  describe('branching', () => {
    it('should create a new branch with createBranch()', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      repo.createBranch('feature');

      const branches = repo.listBranches();
      expect(branches.some(b => b.name === 'feature')).toBe(true);
    });

    it('should list all branches with listBranches()', () => {
      const result = createRepoWithBranches(['feature', 'develop']);
      testDir = result.dir;
      repo = result.repo;

      const branches = repo.listBranches();

      expect(branches.length).toBe(3); // main, feature, develop
      expect(branches.some(b => b.name === 'main')).toBe(true);
      expect(branches.some(b => b.name === 'feature')).toBe(true);
      expect(branches.some(b => b.name === 'develop')).toBe(true);
    });

    it('should mark current branch in listBranches()', () => {
      const result = createRepoWithBranches(['feature']);
      testDir = result.dir;
      repo = result.repo;

      const branches = repo.listBranches();
      const currentBranch = branches.find(b => b.isCurrent);

      expect(currentBranch).toBeDefined();
      expect(currentBranch!.name).toBe('main');
    });

    it('should delete a branch with deleteBranch()', () => {
      const result = createRepoWithBranches(['feature']);
      testDir = result.dir;
      repo = result.repo;

      repo.deleteBranch('feature');

      const branches = repo.listBranches();
      expect(branches.some(b => b.name === 'feature')).toBe(false);
    });

    it('should throw error when creating branch with no commits', () => {
      testDir = createTempDir();
      process.chdir(testDir);
      repo = Repository.init(testDir);

      expect(() => repo.createBranch('feature')).toThrow(/no commits/);
    });

    it('should get current branch name', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      const branches = repo.listBranches();
      const current = branches.find(b => b.isCurrent);

      expect(current?.name).toBe('main');
    });

    it('should create branch pointing to current HEAD', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      const headBefore = repo.refs.resolve('HEAD');
      repo.createBranch('feature');

      const featureHash = repo.refs.resolve('feature');
      expect(featureHash).toBe(headBefore);
    });
  });

  // ===========================================
  // CHECKOUT TESTS
  // ===========================================
  describe('checkout', () => {
    it('should switch to existing branch with checkout()', () => {
      const result = createRepoWithBranches(['feature']);
      testDir = result.dir;
      repo = result.repo;

      repo.checkout('feature');

      const branches = repo.listBranches();
      const current = branches.find(b => b.isCurrent);
      expect(current?.name).toBe('feature');
    });

    it('should checkout to detached HEAD with commit hash', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      const commitHash = result.commitHash;

      repo.checkout(commitHash);

      const head = repo.refs.getHead();
      expect(head.isSymbolic).toBe(false);
      expect(repo.refs.resolve('HEAD')).toBe(commitHash);
    });

    it('should create and switch to new branch with checkout -b', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      repo.checkout('newbranch', true);

      const branches = repo.listBranches();
      const current = branches.find(b => b.isCurrent);
      expect(current?.name).toBe('newbranch');
    });

    it('should restore files to working directory on checkout', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      // Create a commit with a file on main
      createTestFile(testDir, 'feature.txt', 'feature content\n');
      repo.add(path.join(testDir, 'feature.txt'));
      repo.commit('Add feature');

      // Verify file exists
      expect(fileExists(testDir, 'feature.txt')).toBe(true);

      // Create another branch and make changes
      repo.createBranch('otherbranch');
      repo.checkout('otherbranch');

      // Modify the file on the other branch
      createTestFile(testDir, 'feature.txt', 'modified content\n');
      repo.add(path.join(testDir, 'feature.txt'));
      repo.commit('Modify feature');

      // Checkout back to main - should restore original content
      repo.checkout('main');
      const content = readTestFile(testDir, 'feature.txt');
      expect(content).toBe('feature content\n');
    });

    it('should throw error on invalid ref', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      expect(() => repo.checkout('nonexistent')).toThrow(/did not match/);
    });

    it('should throw error creating branch with no commits', () => {
      testDir = createTempDir();
      process.chdir(testDir);
      repo = Repository.init(testDir);

      expect(() => repo.checkout('newbranch', true)).toThrow(/no commits/);
    });
  });

  // ===========================================
  // STATUS TESTS
  // ===========================================
  describe('status', () => {
    it('should return empty status for clean working directory', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      const status = repo.status();

      expect(status.staged.length).toBe(0);
      expect(status.modified.length).toBe(0);
      expect(status.untracked.length).toBe(0);
    });

    it('should detect untracked files', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      createTestFile(testDir, 'untracked.txt', 'untracked content\n');

      const status = repo.status();
      expect(status.untracked).toContain('untracked.txt');
    });

    it('should detect staged files', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      createTestFile(testDir, 'staged.txt', 'staged content\n');
      repo.add(path.join(testDir, 'staged.txt'));

      const status = repo.status();
      expect(status.staged).toContain('staged.txt');
    });

    it('should detect modified files', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      // Modify the committed README.md
      createTestFile(testDir, 'README.md', '# Modified Project\n');

      const status = repo.status();
      expect(status.modified).toContain('README.md');
    });

    it('should detect deleted files', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      // Delete the committed README.md
      fs.unlinkSync(path.join(testDir, 'README.md'));

      const status = repo.status();
      expect(status.deleted).toContain('README.md');
    });

    it('should handle mix of status types', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      // Add new staged file
      createTestFile(testDir, 'staged.txt', 'content\n');
      repo.add(path.join(testDir, 'staged.txt'));

      // Add untracked file
      createTestFile(testDir, 'untracked.txt', 'content\n');

      // Modify committed file
      createTestFile(testDir, 'README.md', '# Modified\n');

      const status = repo.status();
      expect(status.staged).toContain('staged.txt');
      expect(status.untracked).toContain('untracked.txt');
      expect(status.modified).toContain('README.md');
    });
  });

  // ===========================================
  // LOG TESTS
  // ===========================================
  describe('log', () => {
    it('should return commit history', () => {
      const result = createRepoWithMultipleCommits(3);
      testDir = result.dir;
      repo = result.repo;

      const commits = repo.log('HEAD', 10);

      expect(commits.length).toBe(3);
    });

    it('should return commits in reverse chronological order', () => {
      const result = createRepoWithMultipleCommits(3);
      testDir = result.dir;
      repo = result.repo;

      const commits = repo.log('HEAD', 10);

      expect(commits[0].message).toBe('Commit 3');
      expect(commits[1].message).toBe('Commit 2');
      expect(commits[2].message).toBe('Commit 1');
    });

    it('should respect limit parameter', () => {
      const result = createRepoWithMultipleCommits(5);
      testDir = result.dir;
      repo = result.repo;

      const commits = repo.log('HEAD', 2);

      expect(commits.length).toBe(2);
    });

    it('should default to 10 commits', () => {
      const result = createRepoWithMultipleCommits(3);
      testDir = result.dir;
      repo = result.repo;

      const commits = repo.log();

      expect(commits.length).toBe(3);
    });

    it('should start from specified ref', () => {
      const result = createRepoWithMultipleCommits(3);
      testDir = result.dir;
      repo = result.repo;
      const commits = result.commits;

      // Start from second commit
      const log = repo.log(commits[1], 10);

      expect(log.length).toBe(2); // second and first commit
      expect(log[0].message).toBe('Commit 2');
    });

    it('should handle empty repository', () => {
      testDir = createTempDir();
      process.chdir(testDir);
      repo = Repository.init(testDir);

      const commits = repo.log('HEAD', 10);

      expect(commits.length).toBe(0);
    });

    it('should include parent hash in commit', () => {
      const result = createRepoWithMultipleCommits(2);
      testDir = result.dir;
      repo = result.repo;

      const commits = repo.log('HEAD', 10);

      expect(commits[0].parentHashes.length).toBe(1);
      expect(commits[0].parentHashes[0]).toBe(result.commits[0]);
    });
  });

  // ===========================================
  // REFS TESTS
  // ===========================================
  describe('refs', () => {
    it('should resolve HEAD to current commit', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      const headHash = repo.refs.resolve('HEAD');

      expect(headHash).toBe(result.commitHash);
    });

    it('should resolve branch name to commit hash', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      const mainHash = repo.refs.resolve('main');

      expect(mainHash).toBe(result.commitHash);
    });

    it('should return null for non-existent ref', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      const hash = repo.refs.resolve('nonexistent');

      expect(hash).toBeNull();
    });

    it('should check if branch exists', () => {
      const result = createRepoWithBranches(['feature']);
      testDir = result.dir;
      repo = result.repo;

      expect(repo.refs.branchExists('main')).toBe(true);
      expect(repo.refs.branchExists('feature')).toBe(true);
      expect(repo.refs.branchExists('nonexistent')).toBe(false);
    });

    it('should get HEAD info', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      const head = repo.refs.getHead();

      expect(head.isSymbolic).toBe(true);
      expect(head.target).toBe('refs/heads/main');
    });

    it('should detect detached HEAD', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      repo.checkout(result.commitHash);
      const head = repo.refs.getHead();

      expect(head.isSymbolic).toBe(false);
    });

    it('should get current branch name', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      const currentBranch = repo.refs.getCurrentBranch();

      expect(currentBranch).toBe('main');
    });

    it('should return null for current branch when HEAD is detached', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      repo.checkout(result.commitHash);
      const currentBranch = repo.refs.getCurrentBranch();

      expect(currentBranch).toBeNull();
    });
  });

  // ===========================================
  // SHOW / FILE AT REF TESTS
  // ===========================================
  describe('show and getFileAtRef', () => {
    it('should get file content at ref', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      const content = repo.getFileAtRef('HEAD', 'README.md');

      expect(content).toBeDefined();
      expect(content?.toString()).toBe('# Test Project\n');
    });

    it('should return null for non-existent file at ref', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      const content = repo.getFileAtRef('HEAD', 'nonexistent.txt');

      expect(content).toBeNull();
    });

    it('should return null for invalid ref', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      const content = repo.getFileAtRef('invalidref', 'README.md');

      expect(content).toBeNull();
    });

    it('should get file from nested path', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      // Add nested file
      createTestFile(testDir, 'src/app/index.ts', 'export default {};');
      repo.add(path.join(testDir, 'src/app/index.ts'));
      repo.commit('Add nested file');

      const content = repo.getFileAtRef('HEAD', 'src/app/index.ts');

      expect(content).toBeDefined();
      expect(content?.toString()).toBe('export default {};');
    });
  });

  // ===========================================
  // INTEGRATION TESTS
  // ===========================================
  describe('integration', () => {
    it('should handle complete workflow: init, add, commit, branch, checkout', () => {
      testDir = createTempDir();
      process.chdir(testDir);

      // Initialize
      repo = Repository.init(testDir);
      expect(repo.isValid()).toBe(true);

      // Create and commit initial file
      createTestFile(testDir, 'initial.txt', 'initial content\n');
      repo.add(path.join(testDir, 'initial.txt'));
      const initialCommit = repo.commit('Initial commit');

      // Create feature branch
      repo.createBranch('feature');
      repo.checkout('feature');

      // Modify existing file on feature branch
      createTestFile(testDir, 'initial.txt', 'feature modified content\n');
      repo.add(path.join(testDir, 'initial.txt'));
      repo.commit('Modify initial on feature');

      // Checkout main - should restore original content
      repo.checkout('main');
      const mainContent = readTestFile(testDir, 'initial.txt');
      expect(mainContent).toBe('initial content\n');

      // Checkout feature - should have modified content
      repo.checkout('feature');
      const featureContent = readTestFile(testDir, 'initial.txt');
      expect(featureContent).toBe('feature modified content\n');

      // Verify log on feature has 2 commits
      const log = repo.log('HEAD', 10);
      expect(log.length).toBe(2);
    });

    it('should preserve commit history across branch switches', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      // Create feature branch with commits
      repo.createBranch('feature');
      repo.checkout('feature');

      createTestFile(testDir, 'f1.txt', 'f1\n');
      repo.add(path.join(testDir, 'f1.txt'));
      const featureCommit1 = repo.commit('Feature 1');

      createTestFile(testDir, 'f2.txt', 'f2\n');
      repo.add(path.join(testDir, 'f2.txt'));
      const featureCommit2 = repo.commit('Feature 2');

      // Switch to main and back
      repo.checkout('main');
      repo.checkout('feature');

      // Verify history is intact
      const log = repo.log('HEAD', 10);
      expect(log.length).toBe(3);
      expect(log[0].message).toBe('Feature 2');
    });
  });
});
