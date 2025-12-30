/**
 * Tests for the coding agent tools
 * 
 * These tools enable the AI agent to read, write, and edit files,
 * run commands, create branches, and open pull requests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../core/repository';
import {
  createRepoWithCommit,
  cleanupTempDir,
  createTestFile,
  readTestFile,
  fileExists,
  suppressConsole,
  restoreCwd,
} from './test-utils';

// Import the tools
import { readFileTool } from '../ai/tools/read-file';
import { writeFileTool } from '../ai/tools/write-file';
import { editFileTool } from '../ai/tools/edit-file';
import { listDirectoryTool } from '../ai/tools/list-directory';
import { runCommandTool } from '../ai/tools/run-command';
import { createBranchTool } from '../ai/tools/create-branch';
import { openPullRequestTool } from '../ai/tools/open-pull-request';

// Mock the API client
vi.mock('../api/client', () => ({
  getApiClient: vi.fn(() => ({
    pulls: {
      create: vi.fn().mockResolvedValue({
        number: 42,
        title: 'Test PR',
        state: 'open',
      }),
    },
  })),
  ApiError: class ApiError extends Error {
    constructor(message: string, public status: number) {
      super(message);
    }
  },
}));

describe('Coding Agent Tools', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const result = createRepoWithCommit();
    testDir = result.dir;
    repo = result.repo;
    process.chdir(testDir);
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
    testDir = undefined;
  });

  // ===========================================
  // READ FILE TOOL TESTS
  // ===========================================
  describe('readFileTool', () => {
    it('should read a text file successfully', async () => {
      createTestFile(testDir!, 'test.txt', 'Hello, World!\nLine 2\nLine 3');

      const result = await readFileTool.execute({ filePath: 'test.txt' });

      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello, World!\nLine 2\nLine 3');
      expect(result.isBinary).toBe(false);
      expect(result.lineCount).toBe(3);
    });

    it('should read specific line range', async () => {
      createTestFile(testDir!, 'test.txt', 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5');

      const result = await readFileTool.execute({ 
        filePath: 'test.txt',
        startLine: 2,
        endLine: 4
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('Line 2\nLine 3\nLine 4');
      expect(result.startLine).toBe(2);
      expect(result.endLine).toBe(4);
    });

    it('should return error for non-existent file', async () => {
      const result = await readFileTool.execute({ filePath: 'nonexistent.txt' });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('not found');
    });

    it('should return error for directory path', async () => {
      fs.mkdirSync(path.join(testDir!, 'subdir'));

      const result = await readFileTool.execute({ filePath: 'subdir' });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('directory');
    });

    it('should prevent path traversal outside repo', async () => {
      const result = await readFileTool.execute({ filePath: '../../../etc/passwd' });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('outside repository');
    });

    it('should detect binary files', async () => {
      // Create a file with null bytes (binary indicator)
      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE]);
      fs.writeFileSync(path.join(testDir!, 'binary.bin'), binaryContent);

      const result = await readFileTool.execute({ filePath: 'binary.bin' });

      expect(result.success).toBe(true);
      expect(result.isBinary).toBe(true);
      // Binary content should be base64 encoded
      expect(result.content).toBe(binaryContent.toString('base64'));
    });

    it('should handle files in subdirectories', async () => {
      fs.mkdirSync(path.join(testDir!, 'src', 'utils'), { recursive: true });
      createTestFile(testDir!, 'src/utils/helper.ts', 'export const helper = () => {};');

      const result = await readFileTool.execute({ filePath: 'src/utils/helper.ts' });

      expect(result.success).toBe(true);
      expect(result.content).toBe('export const helper = () => {};');
    });
  });

  // ===========================================
  // WRITE FILE TOOL TESTS
  // ===========================================
  describe('writeFileTool', () => {
    it('should create a new file', async () => {
      const result = await writeFileTool.execute({
        filePath: 'new-file.txt',
        content: 'New file content'
      });

      expect(result.success).toBe(true);
      expect(result.created).toBe(true);
      expect(readTestFile(testDir!, 'new-file.txt')).toBe('New file content');
    });

    it('should overwrite an existing file', async () => {
      createTestFile(testDir!, 'existing.txt', 'Old content');

      const result = await writeFileTool.execute({
        filePath: 'existing.txt',
        content: 'New content'
      });

      expect(result.success).toBe(true);
      expect(result.created).toBe(false);
      expect(result.previousContent).toBe('Old content');
      expect(readTestFile(testDir!, 'existing.txt')).toBe('New content');
    });

    it('should create parent directories when needed', async () => {
      const result = await writeFileTool.execute({
        filePath: 'deep/nested/path/file.txt',
        content: 'Deep content',
        createDirectories: true
      });

      expect(result.success).toBe(true);
      expect(fileExists(testDir!, 'deep/nested/path/file.txt')).toBe(true);
    });

    it('should fail without createDirectories when parent does not exist', async () => {
      const result = await writeFileTool.execute({
        filePath: 'nonexistent/file.txt',
        content: 'Content',
        createDirectories: false
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('does not exist');
    });

    it('should prevent writing to .wit directory', async () => {
      const result = await writeFileTool.execute({
        filePath: '.wit/config',
        content: 'malicious content'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Access denied');
    });

    it('should prevent writing to .git directory', async () => {
      const result = await writeFileTool.execute({
        filePath: '.git/config',
        content: 'malicious content'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Access denied');
    });

    it('should prevent path traversal', async () => {
      const result = await writeFileTool.execute({
        filePath: '../outside-repo.txt',
        content: 'malicious content'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('outside repository');
    });
  });

  // ===========================================
  // EDIT FILE TOOL TESTS
  // ===========================================
  describe('editFileTool', () => {
    it('should apply a single edit successfully', async () => {
      createTestFile(testDir!, 'code.ts', 'const x = 1;\nconst y = 2;\nconst z = 3;');

      const result = await editFileTool.execute({
        filePath: 'code.ts',
        edits: [{ oldText: 'const y = 2;', newText: 'const y = 42;' }]
      });

      expect(result.success).toBe(true);
      expect(result.editsApplied).toBe(1);
      expect(readTestFile(testDir!, 'code.ts')).toBe('const x = 1;\nconst y = 42;\nconst z = 3;');
    });

    it('should apply multiple edits in order', async () => {
      createTestFile(testDir!, 'code.ts', 'const a = 1;\nconst b = 2;\nconst c = 3;');

      const result = await editFileTool.execute({
        filePath: 'code.ts',
        edits: [
          { oldText: 'const a = 1;', newText: 'const a = 10;' },
          { oldText: 'const c = 3;', newText: 'const c = 30;' }
        ]
      });

      expect(result.success).toBe(true);
      expect(result.editsApplied).toBe(2);
      expect(readTestFile(testDir!, 'code.ts')).toBe('const a = 10;\nconst b = 2;\nconst c = 30;');
    });

    it('should fail when oldText is not found', async () => {
      createTestFile(testDir!, 'code.ts', 'const x = 1;');

      const result = await editFileTool.execute({
        filePath: 'code.ts',
        edits: [{ oldText: 'const y = 2;', newText: 'const y = 42;' }]
      });

      expect(result.success).toBe(false);
      expect(result.editsApplied).toBe(0);
      expect(result.editResults?.[0].errorMessage).toContain('not found');
    });

    it('should fail when oldText is ambiguous (multiple matches)', async () => {
      createTestFile(testDir!, 'code.ts', 'const x = 1;\nconst x = 1;');

      const result = await editFileTool.execute({
        filePath: 'code.ts',
        edits: [{ oldText: 'const x = 1;', newText: 'const x = 2;' }]
      });

      expect(result.success).toBe(false);
      expect(result.editResults?.[0].errorMessage).toContain('found 2 times');
    });

    it('should support dry run mode', async () => {
      createTestFile(testDir!, 'code.ts', 'const x = 1;');

      const result = await editFileTool.execute({
        filePath: 'code.ts',
        edits: [{ oldText: 'const x = 1;', newText: 'const x = 2;' }],
        dryRun: true
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Dry run');
      // File should not be changed in dry run mode
      expect(readTestFile(testDir!, 'code.ts')).toBe('const x = 1;');
    });

    it('should return error for non-existent file', async () => {
      const result = await editFileTool.execute({
        filePath: 'nonexistent.ts',
        edits: [{ oldText: 'foo', newText: 'bar' }]
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should preserve whitespace and indentation', async () => {
      createTestFile(testDir!, 'code.ts', '  function foo() {\n    return 1;\n  }');

      const result = await editFileTool.execute({
        filePath: 'code.ts',
        edits: [{ oldText: '    return 1;', newText: '    return 42;' }]
      });

      expect(result.success).toBe(true);
      expect(readTestFile(testDir!, 'code.ts')).toBe('  function foo() {\n    return 42;\n  }');
    });

    it('should generate diff preview', async () => {
      createTestFile(testDir!, 'code.ts', 'const x = 1;');

      const result = await editFileTool.execute({
        filePath: 'code.ts',
        edits: [{ oldText: 'const x = 1;', newText: 'const x = 2;' }]
      });

      expect(result.diff).toBeDefined();
      expect(result.diff).toContain('-const x = 1;');
      expect(result.diff).toContain('+const x = 2;');
    });
  });

  // ===========================================
  // LIST DIRECTORY TOOL TESTS
  // ===========================================
  describe('listDirectoryTool', () => {
    it('should list files in root directory', async () => {
      createTestFile(testDir!, 'file1.txt', 'content1');
      createTestFile(testDir!, 'file2.txt', 'content2');

      const result = await listDirectoryTool.execute({ dirPath: '.' });

      expect(result.success).toBe(true);
      expect(result.entries).toBeDefined();
      const fileNames = result.entries!.map(e => e.name);
      expect(fileNames).toContain('file1.txt');
      expect(fileNames).toContain('file2.txt');
      expect(fileNames).toContain('README.md'); // From initial commit
    });

    it('should list subdirectory contents', async () => {
      fs.mkdirSync(path.join(testDir!, 'src'));
      createTestFile(testDir!, 'src/index.ts', 'export {}');
      createTestFile(testDir!, 'src/utils.ts', 'export {}');

      const result = await listDirectoryTool.execute({ dirPath: 'src' });

      expect(result.success).toBe(true);
      const fileNames = result.entries!.map(e => e.name);
      expect(fileNames).toContain('index.ts');
      expect(fileNames).toContain('utils.ts');
    });

    it('should list recursively when enabled', async () => {
      fs.mkdirSync(path.join(testDir!, 'src', 'utils'), { recursive: true });
      createTestFile(testDir!, 'src/index.ts', 'export {}');
      createTestFile(testDir!, 'src/utils/helper.ts', 'export {}');

      const result = await listDirectoryTool.execute({ 
        dirPath: '.',
        recursive: true,
        maxDepth: 3
      });

      expect(result.success).toBe(true);
      const paths = result.entries!.map(e => e.path);
      expect(paths).toContain('src');
      expect(paths.some(p => p.includes('index.ts'))).toBe(true);
      expect(paths.some(p => p.includes('helper.ts'))).toBe(true);
    });

    it('should exclude hidden files by default', async () => {
      createTestFile(testDir!, '.hidden', 'secret');
      createTestFile(testDir!, 'visible.txt', 'public');

      const result = await listDirectoryTool.execute({ dirPath: '.' });

      const fileNames = result.entries!.map(e => e.name);
      expect(fileNames).not.toContain('.hidden');
      expect(fileNames).toContain('visible.txt');
    });

    it('should include hidden files when requested', async () => {
      createTestFile(testDir!, '.hidden', 'secret');

      const result = await listDirectoryTool.execute({ 
        dirPath: '.',
        includeHidden: true
      });

      const fileNames = result.entries!.map(e => e.name);
      expect(fileNames).toContain('.hidden');
    });

    it('should filter by pattern', async () => {
      createTestFile(testDir!, 'app.ts', 'export {}');
      createTestFile(testDir!, 'app.test.ts', 'test');
      createTestFile(testDir!, 'utils.js', 'module.exports = {}');

      const result = await listDirectoryTool.execute({ 
        dirPath: '.',
        pattern: '*.ts'
      });

      expect(result.success).toBe(true);
      const fileNames = result.entries!.filter(e => e.type === 'file').map(e => e.name);
      expect(fileNames).toContain('app.ts');
      expect(fileNames).toContain('app.test.ts');
      expect(fileNames).not.toContain('utils.js');
    });

    it('should exclude .wit directory', async () => {
      const result = await listDirectoryTool.execute({ 
        dirPath: '.',
        includeHidden: true
      });

      const paths = result.entries!.map(e => e.path);
      expect(paths.some(p => p.includes('.wit'))).toBe(false);
    });

    it('should return error for non-existent directory', async () => {
      const result = await listDirectoryTool.execute({ dirPath: 'nonexistent' });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('not found');
    });

    it('should return error when path is a file', async () => {
      const result = await listDirectoryTool.execute({ dirPath: 'README.md' });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('file, not a directory');
    });
  });

  // ===========================================
  // RUN COMMAND TOOL TESTS
  // ===========================================
  describe('runCommandTool', () => {
    it('should execute allowed commands', async () => {
      const result = await runCommandTool.execute({
        command: 'echo',
        args: ['hello', 'world']
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('hello world');
      expect(result.exitCode).toBe(0);
    });

    it('should parse command string with spaces', async () => {
      const result = await runCommandTool.execute({
        command: 'echo "hello world"'
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('hello world');
    });

    it('should block dangerous commands', async () => {
      const result = await runCommandTool.execute({
        command: 'rm',
        args: ['-rf', '/']
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('blocked');
    });

    it('should block sudo commands', async () => {
      const result = await runCommandTool.execute({
        command: 'sudo',
        args: ['ls']
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('blocked');
    });

    it('should block curl/wget for security', async () => {
      const result = await runCommandTool.execute({
        command: 'curl',
        args: ['http://example.com']
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('blocked');
    });

    it('should reject non-allowed commands', async () => {
      const result = await runCommandTool.execute({
        command: 'some-random-command'
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('not in the allowed list');
    });

    it('should capture stderr', async () => {
      const result = await runCommandTool.execute({
        command: 'node',
        args: ['-e', 'console.error("error message")']
      });

      expect(result.stderr).toContain('error message');
    });

    it('should return non-zero exit code on failure', async () => {
      const result = await runCommandTool.execute({
        command: 'node',
        args: ['-e', 'process.exit(1)']
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it('should run in repository working directory', async () => {
      const result = await runCommandTool.execute({
        command: 'pwd'
      });

      expect(result.success).toBe(true);
      // On macOS, /var is a symlink to /private/var, so we need to resolve both
      const actualPath = fs.realpathSync(result.stdout?.trim() || '');
      const expectedPath = fs.realpathSync(testDir!);
      expect(actualPath).toBe(expectedPath);
    });

    it('should respect timeout', async () => {
      const result = await runCommandTool.execute({
        command: 'node',
        args: ['-e', 'setTimeout(() => {}, 10000)'],
        timeout: 100
      });

      expect(result.timedOut).toBe(true);
    });

    it('should allow npm commands', async () => {
      const result = await runCommandTool.execute({
        command: 'npm',
        args: ['--version']
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });

    it('should allow node commands', async () => {
      const result = await runCommandTool.execute({
        command: 'node',
        args: ['-e', 'console.log(1 + 1)']
      });

      expect(result.success).toBe(true);
      expect(result.stdout?.trim()).toBe('2');
    });
  });

  // ===========================================
  // CREATE BRANCH TOOL TESTS
  // ===========================================
  describe('createBranchTool', () => {
    it('should create a new branch', async () => {
      const result = await createBranchTool.execute({
        name: 'feature/new-feature',
        switchTo: false
      });

      expect(result.success).toBe(true);
      expect(result.branch).toBe('feature/new-feature');
      expect(repo.refs.listBranches()).toContain('feature/new-feature');
    });

    it('should create and switch to new branch', async () => {
      const result = await createBranchTool.execute({
        name: 'feature/switched',
        switchTo: true
      });

      expect(result.success).toBe(true);
      expect(result.previousBranch).toBe('main');
      expect(repo.refs.getCurrentBranch()).toBe('feature/switched');
    });

    it('should fail for existing branch', async () => {
      repo.createBranch('existing-branch');

      const result = await createBranchTool.execute({
        name: 'existing-branch'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('already exists');
    });

    it('should reject invalid branch names', async () => {
      const result = await createBranchTool.execute({
        name: 'branch with spaces'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid branch name');
    });

    it('should reject branch names starting with dash', async () => {
      const result = await createBranchTool.execute({
        name: '-invalid'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid branch name');
    });

    it('should reject branch names with consecutive dots', async () => {
      const result = await createBranchTool.execute({
        name: 'branch..name'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid branch name');
    });

    it('should allow valid branch naming conventions', async () => {
      const validNames = [
        'feature/add-login',
        'fix/bug-123',
        'release/v1.0.0',
        'hotfix/security-patch'
      ];

      for (const name of validNames) {
        const result = await createBranchTool.execute({
          name,
          switchTo: false
        });
        expect(result.success).toBe(true);
      }
    });

    it('should create branch from specific start point', async () => {
      // Get the initial commit hash before making more commits
      const initialCommitHash = repo.refs.resolve('HEAD')!;
      
      // Create another commit
      createTestFile(testDir!, 'new-file.txt', 'content');
      repo.add(path.join(testDir!, 'new-file.txt'));
      repo.commit('Second commit');

      const result = await createBranchTool.execute({
        name: 'from-first-commit',
        startPoint: initialCommitHash,
        switchTo: false
      });

      expect(result.success).toBe(true);
      expect(result.commitHash).toBe(initialCommitHash);
    });
  });

  // ===========================================
  // OPEN PULL REQUEST TOOL TESTS
  // ===========================================
  describe('openPullRequestTool', () => {
    beforeEach(() => {
      // Set up a remote origin for PR tests
      repo.remotes.add('origin', 'https://github.com/testowner/testrepo.git');
      
      // Switch to a feature branch (can't create PR from main)
      repo.createBranch('feature/test-pr');
      repo.checkout('feature/test-pr');
    });

    it('should create a pull request successfully', async () => {
      const result = await openPullRequestTool.execute({
        title: 'Add new feature',
        body: 'This PR adds a great new feature',
        targetBranch: 'main'
      });

      expect(result.success).toBe(true);
      expect(result.prNumber).toBe(42);
      expect(result.sourceBranch).toBe('feature/test-pr');
      expect(result.targetBranch).toBe('main');
    });

    it('should fail when on main branch', async () => {
      repo.checkout('main');

      const result = await openPullRequestTool.execute({
        title: 'Bad PR',
        targetBranch: 'main'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Cannot create PR from main');
    });

    it('should fail when no remote origin configured', async () => {
      // Remove the remote
      repo.remotes.remove('origin');

      const result = await openPullRequestTool.execute({
        title: 'No remote PR',
        targetBranch: 'main'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('No remote origin');
    });

    it('should fail when target branch does not exist', async () => {
      const result = await openPullRequestTool.execute({
        title: 'Bad target',
        targetBranch: 'nonexistent-branch'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Cannot resolve target branch');
    });

    it('should use main as default target branch', async () => {
      const result = await openPullRequestTool.execute({
        title: 'Default target'
      });

      expect(result.success).toBe(true);
      expect(result.targetBranch).toBe('main');
    });

    it('should include body in PR when provided', async () => {
      const result = await openPullRequestTool.execute({
        title: 'PR with body',
        body: '## Summary\n\nThis is a detailed description.'
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Created pull request');
    });
  });
});
