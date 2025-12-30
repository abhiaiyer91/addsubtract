/**
 * Tests for the show command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { show, showCommit, showFileAtCommit, showTag } from '../commands/show';
import { createAnnotatedTag, createLightweightTag } from '../commands/tag';
import { 
  createRepoWithMultipleCommits, 
  cleanupTempDir,
  captureConsole,
  restoreCwd,
} from './test-utils';
import { Repository } from '../core/repository';

describe('show command', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let commits: string[];

  beforeEach(() => {
    const result = createRepoWithMultipleCommits(3);
    testDir = result.dir;
    repo = result.repo;
    commits = result.commits;
  });

  afterEach(() => {
    restoreCwd();
    cleanupTempDir(testDir);
  });

  describe('showCommit', () => {
    it('should display commit information', () => {
      const capture = captureConsole();
      
      showCommit(repo, commits[2], { quiet: true });
      
      capture.restore();
      const logs = capture.getLogs();
      
      // Should contain the commit hash
      expect(logs.some(l => l.includes(commits[2]))).toBe(true);
      // Should contain "commit" label
      expect(logs.some(l => l.includes('commit'))).toBe(true);
      // Should contain author info
      expect(logs.some(l => l.includes('Author:'))).toBe(true);
    });

    it('should show commit message', () => {
      const capture = captureConsole();
      
      showCommit(repo, commits[2], { quiet: true });
      
      capture.restore();
      const logs = capture.getLogs();
      
      expect(logs.some(l => l.includes('Commit 3'))).toBe(true);
    });

    it('should show diff when not quiet', () => {
      const capture = captureConsole();
      
      showCommit(repo, commits[2], {});
      
      capture.restore();
      const logs = capture.getLogs();
      
      // Should contain diff markers
      expect(logs.some(l => l.includes('diff') || l.includes('+++') || l.includes('---'))).toBe(true);
    });

    it('should show stat summary when --stat is used', () => {
      const capture = captureConsole();
      
      showCommit(repo, commits[2], { stat: true });
      
      capture.restore();
      const logs = capture.getLogs();
      
      // Should contain file(s) changed summary
      expect(logs.some(l => l.includes('file') && l.includes('changed'))).toBe(true);
    });

    it('should show only filenames when --name-only is used', () => {
      const capture = captureConsole();
      
      showCommit(repo, commits[2], { nameOnly: true });
      
      capture.restore();
      const logs = capture.getLogs();
      
      // Should contain filename but not diff content
      expect(logs.some(l => l.includes('file3.txt'))).toBe(true);
    });
  });

  describe('showFileAtCommit', () => {
    it('should show file content at specific commit', () => {
      // Capture stdout since showFileAtCommit writes to process.stdout
      let output = '';
      const originalWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = (chunk: string | Buffer) => {
        output += chunk.toString();
        return true;
      };
      
      showFileAtCommit(repo, commits[0], 'file1.txt');
      
      process.stdout.write = originalWrite;
      
      expect(output).toContain('Content 1');
    });

    it('should throw for non-existent file', () => {
      expect(() => showFileAtCommit(repo, commits[0], 'nonexistent.txt'))
        .toThrow("does not exist");
    });
  });

  describe('show with tags', () => {
    beforeEach(() => {
      createLightweightTag(repo, 'v1.0.0', commits[0]);
      createAnnotatedTag(repo, 'v2.0.0', 'Version 2.0', commits[2]);
    });

    it('should show lightweight tag info', () => {
      const capture = captureConsole();
      
      show(repo, 'v1.0.0', { quiet: true });
      
      capture.restore();
      const logs = capture.getLogs();
      
      expect(logs.some(l => l.includes('commit'))).toBe(true);
    });

    it('should show annotated tag info', () => {
      const capture = captureConsole();
      
      showTag(repo, 'v2.0.0');
      
      capture.restore();
      const logs = capture.getLogs();
      
      expect(logs.some(l => l.includes('tag v2.0.0'))).toBe(true);
      expect(logs.some(l => l.includes('Version 2.0'))).toBe(true);
    });
  });

  describe('show with commit:file syntax', () => {
    it('should parse commit:file syntax correctly', () => {
      let output = '';
      const originalWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = (chunk: string | Buffer) => {
        output += chunk.toString();
        return true;
      };
      
      show(repo, `${commits[0]}:file1.txt`);
      
      process.stdout.write = originalWrite;
      
      expect(output).toContain('Content 1');
    });

    it('should work with HEAD:file syntax', () => {
      let output = '';
      const originalWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = (chunk: string | Buffer) => {
        output += chunk.toString();
        return true;
      };
      
      show(repo, 'HEAD:file3.txt');
      
      process.stdout.write = originalWrite;
      
      expect(output).toContain('Content 3');
    });
  });

  describe('show with revision specs', () => {
    it('should work with HEAD~N syntax', () => {
      const capture = captureConsole();
      
      show(repo, 'HEAD~1', { quiet: true });
      
      capture.restore();
      const logs = capture.getLogs();
      
      expect(logs.some(l => l.includes(commits[1]))).toBe(true);
    });

    it('should work with commit hash', () => {
      const capture = captureConsole();
      
      show(repo, commits[0], { quiet: true });
      
      capture.restore();
      const logs = capture.getLogs();
      
      expect(logs.some(l => l.includes(commits[0]))).toBe(true);
    });
  });

  describe('show errors', () => {
    it('should throw for unknown ref', () => {
      expect(() => show(repo, 'nonexistent-ref')).toThrow();
    });
  });
});
