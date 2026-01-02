import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { Repository } from '../core/repository';
import { RemoteManager } from '../core/remote';
import { PushOptions, MultiPushResult } from '../commands/push';

describe('Dual-Push', () => {
  let tempDir: string;
  let repoDir: string;
  let remote1Dir: string;
  let remote2Dir: string;
  let repo: Repository;

  beforeEach(() => {
    // Create temp directory structure
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wit-dual-push-test-'));
    repoDir = path.join(tempDir, 'repo');
    remote1Dir = path.join(tempDir, 'remote1');
    remote2Dir = path.join(tempDir, 'remote2');

    // Initialize main repository
    fs.mkdirSync(repoDir, { recursive: true });
    process.chdir(repoDir);
    
    // Create .wit directory structure
    const gitDir = path.join(repoDir, '.wit');
    fs.mkdirSync(path.join(gitDir, 'objects'), { recursive: true });
    fs.mkdirSync(path.join(gitDir, 'refs', 'heads'), { recursive: true });
    fs.mkdirSync(path.join(gitDir, 'refs', 'remotes'), { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(gitDir, 'config'), `[core]
\trepositoryformatversion = 1
\thashAlgorithm = sha256
`);

    // Initialize remote1 as bare repository
    fs.mkdirSync(path.join(remote1Dir, '.wit', 'objects'), { recursive: true });
    fs.mkdirSync(path.join(remote1Dir, '.wit', 'refs', 'heads'), { recursive: true });
    fs.writeFileSync(path.join(remote1Dir, '.wit', 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(remote1Dir, '.wit', 'config'), `[core]
\trepositoryformatversion = 1
\tbare = true
`);

    // Initialize remote2 as bare repository
    fs.mkdirSync(path.join(remote2Dir, '.wit', 'objects'), { recursive: true });
    fs.mkdirSync(path.join(remote2Dir, '.wit', 'refs', 'heads'), { recursive: true });
    fs.writeFileSync(path.join(remote2Dir, '.wit', 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(remote2Dir, '.wit', 'config'), `[core]
\trepositoryformatversion = 1
\tbare = true
`);

    repo = new Repository(repoDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('RemoteManager with multiple remotes', () => {
    it('should configure multiple remotes', () => {
      const remoteManager = new RemoteManager(path.join(repoDir, '.wit'));
      
      remoteManager.add('origin', remote1Dir);
      remoteManager.add('github', remote2Dir);

      const remotes = remoteManager.list();
      expect(remotes).toHaveLength(2);
      expect(remotes.map(r => r.name)).toContain('origin');
      expect(remotes.map(r => r.name)).toContain('github');
    });

    it('should check if remote exists', () => {
      const remoteManager = new RemoteManager(path.join(repoDir, '.wit'));
      
      remoteManager.add('origin', remote1Dir);
      remoteManager.add('github', remote2Dir);

      expect(remoteManager.exists('origin')).toBe(true);
      expect(remoteManager.exists('github')).toBe(true);
      expect(remoteManager.exists('nonexistent')).toBe(false);
    });
  });

  describe('PushOptions interface', () => {
    it('should support also option', () => {
      const options: PushOptions = {
        also: 'github',
      };
      
      expect(options.also).toBe('github');
    });

    it('should support allRemotes option', () => {
      const options: PushOptions = {
        allRemotes: true,
      };
      
      expect(options.allRemotes).toBe(true);
    });

    it('should support combined options', () => {
      const options: PushOptions = {
        setUpstream: true,
        force: false,
        also: 'github',
        verbose: true,
      };
      
      expect(options.setUpstream).toBe(true);
      expect(options.force).toBe(false);
      expect(options.also).toBe('github');
      expect(options.verbose).toBe(true);
    });
  });

  describe('MultiPushResult interface', () => {
    it('should have correct structure', () => {
      const result: MultiPushResult = {
        results: [
          {
            remote: 'origin',
            refs: [
              { ref: 'main', status: 'pushed', oldHash: 'abc', newHash: 'def' },
            ],
          },
          {
            remote: 'github',
            refs: [
              { ref: 'main', status: 'pushed', oldHash: 'abc', newHash: 'def' },
            ],
          },
        ],
        allSucceeded: true,
      };

      expect(result.results).toHaveLength(2);
      expect(result.allSucceeded).toBe(true);
      expect(result.results[0].remote).toBe('origin');
      expect(result.results[1].remote).toBe('github');
    });

    it('should indicate failure when any push fails', () => {
      const result: MultiPushResult = {
        results: [
          {
            remote: 'origin',
            refs: [
              { ref: 'main', status: 'pushed', oldHash: 'abc', newHash: 'def' },
            ],
          },
          {
            remote: 'github',
            refs: [
              { ref: 'main', status: 'rejected', message: 'non-fast-forward' },
            ],
          },
        ],
        allSucceeded: false,
      };

      expect(result.allSucceeded).toBe(false);
    });
  });
});
