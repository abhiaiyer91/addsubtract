/**
 * Integration tests for Git to wit migration
 * 
 * These tests use actual Git commands to create real Git repositories
 * and then test the migration to wit format.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { Repository } from '../../src/core/repository';
import { migrateFromGit, getMigrationStats, loadMigrationMap } from '../../src/core/git-migration';
import { setHashAlgorithm } from '../../src/utils/hash';

describe('Git Migration Integration', () => {
  let testDir: string | undefined;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(() => {
    // Restore cwd
    try {
      if (originalCwd && fs.existsSync(originalCwd)) {
        process.chdir(originalCwd);
      }
    } catch {
      // Ignore
    }

    // Cleanup
    if (testDir && testDir.includes('wit-integration-test-') && fs.existsSync(testDir)) {
      try {
        fs.rmSync(testDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    testDir = undefined;
  });

  /**
   * Check if git is available
   */
  function hasGit(): boolean {
    try {
      execSync('git --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a temporary directory
   */
  function createTempDir(): string {
    return fs.mkdtempSync(path.join(require('os').tmpdir(), 'wit-integration-test-'));
  }

  /**
   * Run git command in a directory
   */
  function git(dir: string, args: string[]): string {
    // Build the command properly with quoting for args with spaces
    const quotedArgs = args.map(arg => {
      if (arg.includes(' ')) {
        return `"${arg}"`;
      }
      return arg;
    });
    return execSync(`git ${quotedArgs.join(' ')}`, {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Test User',
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'Test User',
        GIT_COMMITTER_EMAIL: 'test@example.com',
      },
    });
  }

  /**
   * Initialize a git repo with some history
   */
  function initGitRepoWithHistory(dir: string): void {
    git(dir, ['init']);
    git(dir, ['checkout', '-b', 'main']); // Ensure we're on main
    
    // First commit
    fs.writeFileSync(path.join(dir, 'README.md'), '# Test Project\n');
    git(dir, ['add', 'README.md']);
    git(dir, ['commit', '-m', 'Initial commit']);
    
    // Second commit
    fs.writeFileSync(path.join(dir, 'src/index.ts'), 'console.log("Hello");\n');
    git(dir, ['add', '.']);
    git(dir, ['commit', '-m', 'Add source file']);
    
    // Create a branch
    git(dir, ['checkout', '-b', 'feature']);
    fs.writeFileSync(path.join(dir, 'src/feature.ts'), 'export const feature = true;\n');
    git(dir, ['add', '.']);
    git(dir, ['commit', '-m', 'Add feature']);
    
    // Go back to main
    git(dir, ['checkout', 'main']);
    
    // Create a tag
    git(dir, ['tag', 'v1.0']);
  }

  describe('when git is available', () => {
    it.skipIf(!hasGit())('should migrate real Git repository', async () => {
      testDir = createTempDir();
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      
      // Create a real Git repo
      initGitRepoWithHistory(testDir);
      
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      // Get stats before migration
      const stats = await getMigrationStats(gitDir);
      expect(stats.branches).toBeGreaterThanOrEqual(2); // main and feature
      expect(stats.tags).toBe(1);
      
      // Perform migration
      fs.mkdirSync(path.join(witDir, 'objects'), { recursive: true });
      fs.mkdirSync(path.join(witDir, 'refs', 'heads'), { recursive: true });
      fs.mkdirSync(path.join(witDir, 'refs', 'tags'), { recursive: true });
      
      const result = await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
      });
      
      // Verify migration results
      expect(result.commits).toBeGreaterThanOrEqual(3);
      expect(result.branches).toBeGreaterThanOrEqual(2);
      expect(result.tagRefs).toBe(1);
      expect(result.errors.length).toBe(0);
      
      // Create config file
      const config = `[core]
    repositoryformatversion = 1
[wit]
    hashAlgorithm = sha256
`;
      fs.writeFileSync(path.join(witDir, 'config'), config);
      
      // Verify wit repository works
      setHashAlgorithm('sha256');
      process.chdir(testDir);
      const repo = Repository.find(testDir);
      
      expect(repo.isValid()).toBe(true);
      
      // Verify commit history
      const commits = repo.log('HEAD', 100);
      expect(commits.length).toBeGreaterThanOrEqual(2);
      
      // Verify branches exist
      const branches = repo.listBranches();
      expect(branches.some(b => b.name === 'main')).toBe(true);
      expect(branches.some(b => b.name === 'feature')).toBe(true);
      
      // Verify we can checkout the feature branch
      repo.checkout('feature');
      expect(fs.existsSync(path.join(testDir, 'src/feature.ts'))).toBe(true);
      
      // Verify tag exists
      const tagPath = path.join(witDir, 'refs', 'tags', 'v1.0');
      expect(fs.existsSync(tagPath)).toBe(true);
    });

    it.skipIf(!hasGit())('should migrate repository with merge commits', async () => {
      testDir = createTempDir();
      fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
      
      // Create a repo with merge commits
      git(testDir, ['init']);
      git(testDir, ['checkout', '-b', 'main']);
      
      // Base commit
      fs.writeFileSync(path.join(testDir, 'base.txt'), 'base\n');
      git(testDir, ['add', '.']);
      git(testDir, ['commit', '-m', 'Base commit']);
      
      // Create branch and add commit
      git(testDir, ['checkout', '-b', 'feature']);
      fs.writeFileSync(path.join(testDir, 'feature.txt'), 'feature\n');
      git(testDir, ['add', '.']);
      git(testDir, ['commit', '-m', 'Feature commit']);
      
      // Go to main and add another commit
      git(testDir, ['checkout', 'main']);
      fs.writeFileSync(path.join(testDir, 'main.txt'), 'main\n');
      git(testDir, ['add', '.']);
      git(testDir, ['commit', '-m', 'Main commit']);
      
      // Merge feature into main
      git(testDir, ['merge', 'feature', '-m', 'Merge feature']);
      
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      // Perform migration
      fs.mkdirSync(path.join(witDir, 'objects'), { recursive: true });
      fs.mkdirSync(path.join(witDir, 'refs', 'heads'), { recursive: true });
      fs.mkdirSync(path.join(witDir, 'refs', 'tags'), { recursive: true });
      
      const result = await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
      });
      
      // Should have 4 commits: base, feature, main update, merge
      expect(result.commits).toBe(4);
      expect(result.errors.length).toBe(0);
      
      // Verify the migrated repo
      const config = `[wit]
    hashAlgorithm = sha256
`;
      fs.writeFileSync(path.join(witDir, 'config'), config);
      
      setHashAlgorithm('sha256');
      process.chdir(testDir);
      const repo = Repository.find(testDir);
      
      const commits = repo.log('HEAD', 100);
      // The merge commit should have 2 parents
      const mergeCommit = commits.find(c => c.message.includes('Merge'));
      expect(mergeCommit).toBeDefined();
      expect(mergeCommit!.parentHashes.length).toBe(2);
    });

    it.skipIf(!hasGit())('should preserve file content at each commit', async () => {
      testDir = createTempDir();
      
      git(testDir, ['init']);
      git(testDir, ['checkout', '-b', 'main']);
      
      // Create file versions
      fs.writeFileSync(path.join(testDir, 'file.txt'), 'version 1\n');
      git(testDir, ['add', '.']);
      git(testDir, ['commit', '-m', 'Version 1']);
      
      fs.writeFileSync(path.join(testDir, 'file.txt'), 'version 2\n');
      git(testDir, ['add', '.']);
      git(testDir, ['commit', '-m', 'Version 2']);
      
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      // Perform migration
      fs.mkdirSync(path.join(witDir, 'objects'), { recursive: true });
      fs.mkdirSync(path.join(witDir, 'refs', 'heads'), { recursive: true });
      fs.mkdirSync(path.join(witDir, 'refs', 'tags'), { recursive: true });
      
      await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
      });
      
      // Create config
      fs.writeFileSync(path.join(witDir, 'config'), '[wit]\nhashAlgorithm = sha256\n');
      
      setHashAlgorithm('sha256');
      process.chdir(testDir);
      const repo = Repository.find(testDir);
      
      // Check file at HEAD (should be version 2)
      const contentAtHead = repo.getFileAtRef('HEAD', 'file.txt');
      expect(contentAtHead?.toString()).toBe('version 2\n');
      
      // Check file at HEAD~1 (should be version 1)
      const commits = repo.log('HEAD', 10);
      const firstCommitHash = commits[1].hash();
      const contentAtPrev = repo.getFileAtRef(firstCommitHash, 'file.txt');
      expect(contentAtPrev?.toString()).toBe('version 1\n');
    });

    it.skipIf(!hasGit())('should handle annotated tags', async () => {
      testDir = createTempDir();
      
      git(testDir, ['init']);
      git(testDir, ['checkout', '-b', 'main']);
      
      fs.writeFileSync(path.join(testDir, 'file.txt'), 'content\n');
      git(testDir, ['add', '.']);
      git(testDir, ['commit', '-m', 'Initial']);
      
      // Create annotated tag
      git(testDir, ['tag', '-a', 'v1.0', '-m', 'Release v1.0']);
      
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      // Perform migration
      fs.mkdirSync(path.join(witDir, 'objects'), { recursive: true });
      fs.mkdirSync(path.join(witDir, 'refs', 'heads'), { recursive: true });
      fs.mkdirSync(path.join(witDir, 'refs', 'tags'), { recursive: true });
      
      const result = await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
      });
      
      // Annotated tags create a tag object
      expect(result.tags).toBe(1);
      expect(result.tagRefs).toBe(1);
      expect(result.errors.length).toBe(0);
    });

    it.skipIf(!hasGit())('should handle packed refs', async () => {
      testDir = createTempDir();
      
      git(testDir, ['init']);
      git(testDir, ['checkout', '-b', 'main']);
      
      fs.writeFileSync(path.join(testDir, 'file.txt'), 'content\n');
      git(testDir, ['add', '.']);
      git(testDir, ['commit', '-m', 'Initial']);
      
      // Create multiple branches and tags
      git(testDir, ['branch', 'feature1']);
      git(testDir, ['branch', 'feature2']);
      git(testDir, ['tag', 'v1.0']);
      git(testDir, ['tag', 'v2.0']);
      
      // Pack refs
      git(testDir, ['pack-refs', '--all']);
      
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      // Verify refs are packed
      expect(fs.existsSync(path.join(gitDir, 'packed-refs'))).toBe(true);
      
      // Perform migration
      fs.mkdirSync(path.join(witDir, 'objects'), { recursive: true });
      fs.mkdirSync(path.join(witDir, 'refs', 'heads'), { recursive: true });
      fs.mkdirSync(path.join(witDir, 'refs', 'tags'), { recursive: true });
      
      const result = await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
      });
      
      expect(result.branches).toBe(3); // main, feature1, feature2
      expect(result.tagRefs).toBe(2);
      expect(result.errors.length).toBe(0);
    });

    it.skipIf(!hasGit())('should handle pack files', async () => {
      testDir = createTempDir();
      
      git(testDir, ['init']);
      git(testDir, ['checkout', '-b', 'main']);
      
      // Create multiple commits to have enough objects to pack
      for (let i = 0; i < 5; i++) {
        fs.writeFileSync(path.join(testDir, `file${i}.txt`), `content ${i}\n`);
        git(testDir, ['add', '.']);
        git(testDir, ['commit', '-m', `Commit ${i}`]);
      }
      
      // Run gc to create pack files
      git(testDir, ['gc', '--aggressive']);
      
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      // Verify pack files exist
      const packDir = path.join(gitDir, 'objects', 'pack');
      const packFiles = fs.existsSync(packDir) ? 
        fs.readdirSync(packDir).filter(f => f.endsWith('.pack')) : [];
      expect(packFiles.length).toBeGreaterThan(0);
      
      // Perform migration
      fs.mkdirSync(path.join(witDir, 'objects'), { recursive: true });
      fs.mkdirSync(path.join(witDir, 'refs', 'heads'), { recursive: true });
      fs.mkdirSync(path.join(witDir, 'refs', 'tags'), { recursive: true });
      
      const result = await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
      });
      
      expect(result.commits).toBe(5);
      expect(result.errors.length).toBe(0);
      
      // Verify the migrated repo works
      fs.writeFileSync(path.join(witDir, 'config'), '[wit]\nhashAlgorithm = sha256\n');
      
      setHashAlgorithm('sha256');
      process.chdir(testDir);
      const repo = Repository.find(testDir);
      
      const commits = repo.log('HEAD', 100);
      expect(commits.length).toBe(5);
    });

    it.skipIf(!hasGit())('should preserve hash mapping', async () => {
      testDir = createTempDir();
      
      git(testDir, ['init']);
      git(testDir, ['checkout', '-b', 'main']);
      
      fs.writeFileSync(path.join(testDir, 'file.txt'), 'content\n');
      git(testDir, ['add', '.']);
      git(testDir, ['commit', '-m', 'Initial']);
      
      // Get the Git commit hash
      const gitCommitHash = git(testDir, ['rev-parse', 'HEAD']).trim();
      
      const gitDir = path.join(testDir, '.git');
      const witDir = path.join(testDir, '.wit');
      
      // Perform migration
      fs.mkdirSync(path.join(witDir, 'objects'), { recursive: true });
      fs.mkdirSync(path.join(witDir, 'refs', 'heads'), { recursive: true });
      fs.mkdirSync(path.join(witDir, 'refs', 'tags'), { recursive: true });
      
      const result = await migrateFromGit({
        gitDir,
        witDir,
        hashAlgorithm: 'sha256',
      });
      
      // Verify we can look up the original Git hash
      expect(result.hashMap.has(gitCommitHash)).toBe(true);
      
      // Verify the mapping file was saved
      const loadedMap = loadMigrationMap(witDir);
      expect(loadedMap.get(gitCommitHash)).toBe(result.hashMap.get(gitCommitHash));
    });
  });
});
