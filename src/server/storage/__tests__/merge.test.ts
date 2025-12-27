import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { 
  mergePullRequest, 
  checkMergeability, 
  getDefaultMergeMessage,
} from '../merge';

/**
 * Helper to run git commands in a directory
 */
function git(args: string, cwd: string): string {
  return execSync(`git ${args}`, {
    cwd,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

/**
 * Create a bare repository with some initial content
 */
function createTestRepo(baseDir: string, owner: string, name: string): string {
  const repoPath = path.join(baseDir, owner, `${name}.git`);
  
  // Create a non-bare repo first to add commits, then clone as bare
  const tempWorkDir = path.join(baseDir, 'temp-work');
  fs.mkdirSync(tempWorkDir, { recursive: true });
  
  git('init', tempWorkDir);
  git('config user.email "test@test.com"', tempWorkDir);
  git('config user.name "Test User"', tempWorkDir);
  
  // Create initial commit on main
  fs.writeFileSync(path.join(tempWorkDir, 'README.md'), '# Test Repo\n');
  git('add .', tempWorkDir);
  git('commit -m "Initial commit"', tempWorkDir);
  git('branch -M main', tempWorkDir);
  
  // Clone as bare
  fs.mkdirSync(path.dirname(repoPath), { recursive: true });
  git(`clone --bare "${tempWorkDir}" "${repoPath}"`, baseDir);
  
  // Clean up temp work dir
  fs.rmSync(tempWorkDir, { recursive: true, force: true });
  
  return repoPath;
}

/**
 * Add commits to a branch in a bare repo (via worktree)
 */
function addCommitToBranch(
  repoPath: string,
  branch: string,
  filename: string,
  content: string,
  message: string
): void {
  const worktreePath = path.join(path.dirname(repoPath), `worktree-${Date.now()}`);
  
  try {
    // Create or checkout branch in worktree
    try {
      git(`worktree add "${worktreePath}" ${branch}`, repoPath);
    } catch {
      // Branch doesn't exist, create it from main
      git(`worktree add -b ${branch} "${worktreePath}" main`, repoPath);
    }
    
    // Add commit
    git('config user.email "test@test.com"', worktreePath);
    git('config user.name "Test User"', worktreePath);
    fs.writeFileSync(path.join(worktreePath, filename), content);
    git('add .', worktreePath);
    git(`commit -m "${message}"`, worktreePath);
  } finally {
    // Clean up
    git(`worktree remove "${worktreePath}" --force`, repoPath);
  }
}

describe('Server Merge Operations', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wit-merge-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('checkMergeability', () => {
    it('should detect when merge is possible', () => {
      const repoPath = createTestRepo(tempDir, 'owner', 'repo');
      
      // Create a feature branch with a new file
      addCommitToBranch(repoPath, 'feature', 'feature.txt', 'feature content', 'Add feature');
      
      const result = checkMergeability(repoPath, 'feature', 'main');
      
      expect(result.canMerge).toBe(true);
      expect(result.conflicts).toEqual([]);
      expect(result.aheadBy).toBe(1);
    });

    it('should detect when branches are the same', () => {
      const repoPath = createTestRepo(tempDir, 'owner', 'repo');
      
      const result = checkMergeability(repoPath, 'main', 'main');
      
      expect(result.canMerge).toBe(true);
      expect(result.behindBy).toBe(0);
      expect(result.aheadBy).toBe(0);
    });

    it('should throw on missing branch', () => {
      const repoPath = createTestRepo(tempDir, 'owner', 'repo');
      
      expect(() => {
        checkMergeability(repoPath, 'nonexistent', 'main');
      }).toThrow('not found');
    });
  });

  describe('mergePullRequest', () => {
    it('should perform fast-forward merge', async () => {
      const repoPath = createTestRepo(tempDir, 'owner', 'repo');
      
      // Create feature branch with commits
      addCommitToBranch(repoPath, 'feature', 'feature.txt', 'feature content', 'Add feature');
      
      // Get main SHA before merge
      const mainBefore = git('rev-parse refs/heads/main', repoPath);
      
      const result = await mergePullRequest(repoPath, 'feature', 'main', {
        authorName: 'Test User',
        authorEmail: 'test@test.com',
      });
      
      expect(result.success).toBe(true);
      expect(result.mergeSha).toBeDefined();
      
      // Verify main was updated
      const mainAfter = git('rev-parse refs/heads/main', repoPath);
      expect(mainAfter).not.toBe(mainBefore);
      
      // Verify feature.txt is in the tree
      const tree = git('ls-tree -r main --name-only', repoPath);
      expect(tree).toContain('feature.txt');
    });

    it('should perform non-fast-forward merge', async () => {
      const repoPath = createTestRepo(tempDir, 'owner', 'repo');
      
      // Create divergent branches
      addCommitToBranch(repoPath, 'feature', 'feature.txt', 'feature content', 'Add feature');
      addCommitToBranch(repoPath, 'main', 'main.txt', 'main content', 'Add main file');
      
      const result = await mergePullRequest(repoPath, 'feature', 'main', {
        authorName: 'Test User',
        authorEmail: 'test@test.com',
        message: 'Merge feature into main',
      });
      
      expect(result.success).toBe(true);
      expect(result.mergeSha).toBeDefined();
      
      // Verify both files exist
      const tree = git('ls-tree -r main --name-only', repoPath);
      expect(tree).toContain('feature.txt');
      expect(tree).toContain('main.txt');
      
      // Verify it's a merge commit (has 2 parents)
      const parents = git('rev-list --parents -n 1 main', repoPath).split(' ');
      expect(parents.length).toBe(3); // commit SHA + 2 parent SHAs
    });

    it('should detect conflicts', async () => {
      const repoPath = createTestRepo(tempDir, 'owner', 'repo');
      
      // Create conflicting changes
      addCommitToBranch(repoPath, 'feature', 'README.md', '# Feature changes\n', 'Feature update');
      addCommitToBranch(repoPath, 'main', 'README.md', '# Main changes\n', 'Main update');
      
      const result = await mergePullRequest(repoPath, 'feature', 'main', {
        authorName: 'Test User',
        authorEmail: 'test@test.com',
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('conflict');
    });

    it('should perform squash merge', async () => {
      const repoPath = createTestRepo(tempDir, 'owner', 'repo');
      
      // Create feature branch with multiple commits
      addCommitToBranch(repoPath, 'feature', 'file1.txt', 'content1', 'Add file1');
      addCommitToBranch(repoPath, 'feature', 'file2.txt', 'content2', 'Add file2');
      
      // Make main divergent so it's not a fast-forward
      addCommitToBranch(repoPath, 'main', 'main.txt', 'main content', 'Main change');
      
      const result = await mergePullRequest(repoPath, 'feature', 'main', {
        authorName: 'Test User',
        authorEmail: 'test@test.com',
        message: 'Squash feature (#1)',
        strategy: 'squash',
      });
      
      expect(result.success).toBe(true);
      
      // Verify files exist
      const tree = git('ls-tree -r main --name-only', repoPath);
      expect(tree).toContain('file1.txt');
      expect(tree).toContain('file2.txt');
      
      // Verify it's NOT a merge commit (single parent for squash)
      const parents = git('rev-list --parents -n 1 main', repoPath).split(' ');
      expect(parents.length).toBe(2); // commit SHA + 1 parent SHA
    });

    it('should return existing SHA if already merged', async () => {
      const repoPath = createTestRepo(tempDir, 'owner', 'repo');
      
      // main is the same as main - should be a no-op
      const mainSha = git('rev-parse refs/heads/main', repoPath);
      
      const result = await mergePullRequest(repoPath, 'main', 'main', {
        authorName: 'Test User',
        authorEmail: 'test@test.com',
      });
      
      expect(result.success).toBe(true);
      expect(result.mergeSha).toBe(mainSha);
    });
  });

  describe('getDefaultMergeMessage', () => {
    it('should generate merge message', () => {
      const msg = getDefaultMergeMessage(42, 'Add feature', 'feature', 'main', 'merge');
      expect(msg).toContain('#42');
      expect(msg).toContain('feature');
      expect(msg).toContain('Add feature');
    });

    it('should generate squash message', () => {
      const msg = getDefaultMergeMessage(42, 'Add feature', 'feature', 'main', 'squash');
      expect(msg).toContain('Squash');
      expect(msg).toContain('#42');
    });
  });
});
