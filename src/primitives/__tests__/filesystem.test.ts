import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Filesystem } from '../filesystem';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('Filesystem', () => {
  let tempDir: string;
  let filesystem: Filesystem;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-test-'));
    filesystem = new Filesystem(tempDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('File Operations', () => {
    it('should write and read files', async () => {
      await filesystem.write('test.txt', 'hello world');
      const content = await filesystem.read('test.txt');
      expect(content).toBe('hello world');
    });

    it('should create parent directories', async () => {
      await filesystem.write('a/b/c/deep.txt', 'deep content');
      const content = await filesystem.read('a/b/c/deep.txt');
      expect(content).toBe('deep content');
    });

    it('should return null for missing files', async () => {
      const content = await filesystem.read('nonexistent.txt');
      expect(content).toBeNull();
    });

    it('should read binary files', async () => {
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      await filesystem.write('binary.bin', binaryData);
      const content = await filesystem.readBuffer('binary.bin');
      expect(content).toEqual(binaryData);
    });

    it('should append to files', async () => {
      await filesystem.write('log.txt', 'line1\n');
      await filesystem.append('log.txt', 'line2\n');
      const content = await filesystem.read('log.txt');
      expect(content).toBe('line1\nline2\n');
    });

    it('should append to non-existent files', async () => {
      await filesystem.append('new-log.txt', 'first line\n');
      const content = await filesystem.read('new-log.txt');
      expect(content).toBe('first line\n');
    });

    it('should delete files', async () => {
      await filesystem.write('test.txt', 'content');
      expect(await filesystem.exists('test.txt')).toBe(true);

      const result = await filesystem.delete('test.txt');
      expect(result).toBe(true);
      expect(await filesystem.exists('test.txt')).toBe(false);
    });

    it('should return false when deleting non-existent file', async () => {
      const result = await filesystem.delete('nonexistent.txt');
      expect(result).toBe(false);
    });

    it('should check file existence', async () => {
      expect(await filesystem.exists('test.txt')).toBe(false);
      await filesystem.write('test.txt', 'content');
      expect(await filesystem.exists('test.txt')).toBe(true);
    });
  });

  describe('Directory Operations', () => {
    it('should list directory contents', async () => {
      await filesystem.write('a.txt', 'a');
      await filesystem.write('b.txt', 'b');
      await filesystem.mkdir('subdir');

      const entries = await filesystem.list('.');
      const names = entries.map(e => e.name).sort();
      expect(names).toContain('a.txt');
      expect(names).toContain('b.txt');
      expect(names).toContain('subdir');
    });

    it('should identify file types correctly', async () => {
      await filesystem.write('file.txt', 'content');
      await filesystem.mkdir('dir');

      const entries = await filesystem.list('.');
      const file = entries.find(e => e.name === 'file.txt');
      const dir = entries.find(e => e.name === 'dir');

      expect(file?.type).toBe('file');
      expect(dir?.type).toBe('dir');
    });

    it('should return empty array for non-existent directory', async () => {
      const entries = await filesystem.list('nonexistent');
      expect(entries).toEqual([]);
    });

    it('should not list hidden files', async () => {
      await filesystem.write('.hidden', 'hidden');
      await filesystem.write('visible.txt', 'visible');

      const entries = await filesystem.list('.');
      const names = entries.map(e => e.name);
      expect(names).not.toContain('.hidden');
      expect(names).toContain('visible.txt');
    });

    it('should list files recursively', async () => {
      await filesystem.write('a.txt', 'a');
      await filesystem.write('sub/b.txt', 'b');
      await filesystem.write('sub/deep/c.txt', 'c');

      const entries = await filesystem.listRecursive('.');
      const paths = entries.map(e => e.path);
      expect(paths).toContain('a.txt');
      expect(paths).toContain('sub/b.txt');
      expect(paths).toContain('sub/deep/c.txt');
    });

    it('should create and remove directories', async () => {
      await filesystem.mkdir('newdir');
      expect(await filesystem.exists('newdir')).toBe(true);

      const result = await filesystem.rmdir('newdir');
      expect(result).toBe(true);
      expect(await filesystem.exists('newdir')).toBe(false);
    });

    it('should remove directories recursively', async () => {
      await filesystem.write('dir/file.txt', 'content');
      await filesystem.write('dir/sub/nested.txt', 'nested');

      const result = await filesystem.rmdir('dir');
      expect(result).toBe(true);
      expect(await filesystem.exists('dir')).toBe(false);
    });

    it('should return false when removing non-existent directory', async () => {
      const result = await filesystem.rmdir('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('Git Operations', () => {
    it('should commit changes', async () => {
      await filesystem.write('file.txt', 'content');
      const hash = await filesystem.commit('Initial commit');
      expect(hash).toMatch(/^[a-f0-9]{40}$/);
    });

    it('should show commit history', async () => {
      await filesystem.write('file.txt', 'v1');
      await filesystem.commit('First commit');

      await filesystem.write('file.txt', 'v2');
      await filesystem.commit('Second commit');

      const log = await filesystem.log(10);
      expect(log.length).toBeGreaterThanOrEqual(2);
      expect(log[0].message).toBe('Second commit');
      expect(log[1].message).toBe('First commit');
    });

    it('should include author info in log', async () => {
      await filesystem.write('file.txt', 'content');
      await filesystem.commit('Test commit');

      const log = await filesystem.log(1);
      expect(log[0].author).toMatch(/.+ <.+>/);
      expect(log[0].date).toBeInstanceOf(Date);
    });

    it('should rollback last commit', async () => {
      await filesystem.write('file.txt', 'v1');
      await filesystem.commit('First');

      await filesystem.write('file.txt', 'v2');
      await filesystem.commit('Second');

      await filesystem.rollback();

      const log = await filesystem.log(10);
      expect(log[0].message).toBe('First');
    });

    it('should reset to specific commit', async () => {
      await filesystem.write('file.txt', 'v1');
      const hash1 = await filesystem.commit('First');

      await filesystem.write('file.txt', 'v2');
      await filesystem.commit('Second');

      await filesystem.reset(hash1);

      const content = await filesystem.read('file.txt');
      expect(content).toBe('v1');
    });

    it('should show status of uncommitted changes', async () => {
      await filesystem.write('file.txt', 'content');
      await filesystem.commit('Initial');

      await filesystem.write('file.txt', 'modified');
      await filesystem.write('new.txt', 'new file');

      const status = await filesystem.status();
      expect(status.length).toBeGreaterThan(0);
    });

    it('should generate diff', async () => {
      await filesystem.write('file.txt', 'line1\n');
      await filesystem.commit('Initial');

      await filesystem.write('file.txt', 'line1\nline2\n');

      const diffOutput = await filesystem.diff();
      expect(diffOutput).toContain('file.txt');
    });
  });

  describe('Branching', () => {
    it('should create and list branches', async () => {
      await filesystem.write('file.txt', 'content');
      await filesystem.commit('Initial');

      await filesystem.branch('feature');

      const branches = await filesystem.branches();
      expect(branches).toContain('main');
      expect(branches).toContain('feature');
    });

    it('should switch branches', async () => {
      await filesystem.write('file.txt', 'main content');
      await filesystem.commit('Main commit');

      await filesystem.branch('feature');
      await filesystem.checkout('feature');

      await filesystem.write('file.txt', 'feature content');
      await filesystem.commit('Feature commit');

      await filesystem.checkout('main');
      const content = await filesystem.read('file.txt');
      expect(content).toBe('main content');
    });

    it('should get current branch', async () => {
      const branch = await filesystem.currentBranch();
      expect(branch).toBe('main');
    });

    it('should delete branch', async () => {
      await filesystem.write('file.txt', 'content');
      await filesystem.commit('Initial');

      await filesystem.branch('temp');
      let branches = await filesystem.branches();
      expect(branches).toContain('temp');

      await filesystem.deleteBranch('temp');
      branches = await filesystem.branches();
      expect(branches).not.toContain('temp');
    });

    it('should not delete current branch', async () => {
      await filesystem.write('file.txt', 'content');
      await filesystem.commit('Initial');

      await expect(filesystem.deleteBranch('main')).rejects.toThrow();
    });
  });

  describe('Utilities', () => {
    it('should copy files', async () => {
      await filesystem.write('src.txt', 'content');
      await filesystem.copy('src.txt', 'dest.txt');

      const content = await filesystem.read('dest.txt');
      expect(content).toBe('content');
      // Original should still exist
      expect(await filesystem.exists('src.txt')).toBe(true);
    });

    it('should copy binary files', async () => {
      const binaryData = Buffer.from([0x00, 0xff, 0x42]);
      await filesystem.write('src.bin', binaryData);
      await filesystem.copy('src.bin', 'dest.bin');

      const content = await filesystem.readBuffer('dest.bin');
      expect(content).toEqual(binaryData);
    });

    it('should throw when copying non-existent file', async () => {
      await expect(filesystem.copy('nonexistent.txt', 'dest.txt')).rejects.toThrow();
    });

    it('should move files', async () => {
      await filesystem.write('old.txt', 'content');
      await filesystem.move('old.txt', 'new.txt');

      expect(await filesystem.exists('old.txt')).toBe(false);
      expect(await filesystem.read('new.txt')).toBe('content');
    });

    it('should move files to nested directories', async () => {
      await filesystem.write('file.txt', 'content');
      await filesystem.move('file.txt', 'deep/nested/file.txt');

      expect(await filesystem.exists('file.txt')).toBe(false);
      expect(await filesystem.read('deep/nested/file.txt')).toBe('content');
    });

    it('should throw when moving non-existent file', async () => {
      await expect(filesystem.move('nonexistent.txt', 'dest.txt')).rejects.toThrow();
    });

    it('should get file stats', async () => {
      await filesystem.write('file.txt', 'hello');
      const stat = await filesystem.stat('file.txt');

      expect(stat).not.toBeNull();
      expect(stat!.size).toBe(5);
      expect(stat!.type).toBe('file');
      expect(stat!.modified).toBeInstanceOf(Date);
      expect(stat!.created).toBeInstanceOf(Date);
    });

    it('should get directory stats', async () => {
      await filesystem.mkdir('mydir');
      const stat = await filesystem.stat('mydir');

      expect(stat).not.toBeNull();
      expect(stat!.type).toBe('dir');
    });

    it('should return null for non-existent path stats', async () => {
      const stat = await filesystem.stat('nonexistent.txt');
      expect(stat).toBeNull();
    });

    it('should match files with glob patterns', async () => {
      await filesystem.write('src/index.ts', 'export {}');
      await filesystem.write('src/utils/helper.ts', 'export {}');
      await filesystem.write('src/utils/data.json', '{}');
      await filesystem.write('test/test.ts', 'test');

      const tsFiles = await filesystem.glob('**/*.ts');
      expect(tsFiles).toContain('src/index.ts');
      expect(tsFiles).toContain('src/utils/helper.ts');
      expect(tsFiles).toContain('test/test.ts');
      expect(tsFiles).not.toContain('src/utils/data.json');
    });

    it('should match files with simple glob', async () => {
      await filesystem.write('a.txt', 'a');
      await filesystem.write('b.txt', 'b');
      await filesystem.write('c.md', 'c');

      const txtFiles = await filesystem.glob('*.txt');
      expect(txtFiles).toContain('a.txt');
      expect(txtFiles).toContain('b.txt');
      expect(txtFiles).not.toContain('c.md');
    });
  });

  describe('Path Traversal Protection', () => {
    it('should prevent path traversal with ../', async () => {
      await expect(filesystem.read('../../../etc/passwd')).rejects.toThrow('Path traversal not allowed');
    });

    it('should prevent path traversal in write', async () => {
      await expect(filesystem.write('../outside.txt', 'content')).rejects.toThrow('Path traversal not allowed');
    });

    it('should prevent path traversal with absolute paths', async () => {
      await expect(filesystem.read('/etc/passwd')).rejects.toThrow('Path traversal not allowed');
    });

    it('should allow paths with .. that stay within workspace', async () => {
      await filesystem.write('subdir/file.txt', 'content');
      // This should work - goes into subdir then back to root
      const content = await filesystem.read('subdir/../subdir/file.txt');
      expect(content).toBe('content');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty files', async () => {
      await filesystem.write('empty.txt', '');
      const content = await filesystem.read('empty.txt');
      expect(content).toBe('');
    });

    it('should handle unicode content', async () => {
      const unicodeContent = '你好世界 🌍 مرحبا';
      await filesystem.write('unicode.txt', unicodeContent);
      const content = await filesystem.read('unicode.txt');
      expect(content).toBe(unicodeContent);
    });

    it('should handle files with special characters in name', async () => {
      await filesystem.write('file with spaces.txt', 'content');
      const content = await filesystem.read('file with spaces.txt');
      expect(content).toBe('content');
    });

    it('should handle deeply nested paths', async () => {
      const deepPath = 'a/b/c/d/e/f/g/h/i/j/file.txt';
      await filesystem.write(deepPath, 'deep content');
      const content = await filesystem.read(deepPath);
      expect(content).toBe('deep content');
    });
  });
});
