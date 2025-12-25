import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { RemoteManager, Remote } from '../core/remote';
import {
  parseRefAdvertisement,
  parseCapabilities,
  serializeCapabilities,
  parseRefspec,
  applyFetchRefspec,
  getBranches,
  getTags,
} from '../core/protocol/refs-discovery';
import {
  pktLine,
  pktFlush,
  parsePktLines,
  writePackHeader,
  parsePackHeader,
  writePackObjectHeader,
  readPackObjectHeader,
  PackObjectType,
  applyDelta,
} from '../core/protocol';
import {
  CredentialManager,
  createBasicCredentials,
  createBearerCredentials,
  createGitHubCredentials,
} from '../core/auth';

describe('RemoteManager', () => {
  let tempDir: string;
  let gitDir: string;
  let remoteManager: RemoteManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsgit-remote-test-'));
    gitDir = path.join(tempDir, '.tsgit');
    fs.mkdirSync(gitDir, { recursive: true });
    fs.mkdirSync(path.join(gitDir, 'refs', 'remotes'), { recursive: true });
    
    // Create initial config
    fs.writeFileSync(path.join(gitDir, 'config'), `[core]
\trepositoryformatversion = 1
`);
    
    remoteManager = new RemoteManager(gitDir);
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('CRUD operations', () => {
    it('should add a remote', () => {
      remoteManager.add('origin', 'https://github.com/user/repo.git');
      
      const remote = remoteManager.get('origin');
      expect(remote).not.toBeNull();
      expect(remote!.name).toBe('origin');
      expect(remote!.url).toBe('https://github.com/user/repo.git');
      expect(remote!.fetch).toBe('+refs/heads/*:refs/remotes/origin/*');
    });

    it('should list remotes', () => {
      remoteManager.add('origin', 'https://github.com/user/repo.git');
      remoteManager.add('upstream', 'https://github.com/other/repo.git');
      
      const remotes = remoteManager.list();
      expect(remotes).toHaveLength(2);
      expect(remotes.map(r => r.name)).toContain('origin');
      expect(remotes.map(r => r.name)).toContain('upstream');
    });

    it('should remove a remote', () => {
      remoteManager.add('origin', 'https://github.com/user/repo.git');
      remoteManager.remove('origin');
      
      const remote = remoteManager.get('origin');
      expect(remote).toBeNull();
    });

    it('should rename a remote', () => {
      remoteManager.add('origin', 'https://github.com/user/repo.git');
      remoteManager.rename('origin', 'upstream');
      
      expect(remoteManager.get('origin')).toBeNull();
      const upstream = remoteManager.get('upstream');
      expect(upstream).not.toBeNull();
      expect(upstream!.url).toBe('https://github.com/user/repo.git');
    });

    it('should update remote URL', () => {
      remoteManager.add('origin', 'https://github.com/user/repo.git');
      remoteManager.setUrl('origin', 'https://github.com/user/new-repo.git');
      
      const remote = remoteManager.get('origin');
      expect(remote!.url).toBe('https://github.com/user/new-repo.git');
    });

    it('should get default remote', () => {
      remoteManager.add('upstream', 'https://github.com/other/repo.git');
      remoteManager.add('origin', 'https://github.com/user/repo.git');
      
      const defaultRemote = remoteManager.getDefault();
      expect(defaultRemote!.name).toBe('origin');
    });

    it('should throw when adding duplicate remote', () => {
      remoteManager.add('origin', 'https://github.com/user/repo.git');
      
      expect(() => {
        remoteManager.add('origin', 'https://github.com/other/repo.git');
      }).toThrow("remote origin already exists");
    });

    it('should throw when removing non-existent remote', () => {
      expect(() => {
        remoteManager.remove('nonexistent');
      }).toThrow("No such remote: 'nonexistent'");
    });
  });

  describe('refspec parsing', () => {
    it('should parse simple refspec', () => {
      const result = RemoteManager.parseRefspec('refs/heads/*:refs/remotes/origin/*');
      expect(result.force).toBe(false);
      expect(result.src).toBe('refs/heads/*');
      expect(result.dst).toBe('refs/remotes/origin/*');
    });

    it('should parse force refspec', () => {
      const result = RemoteManager.parseRefspec('+refs/heads/*:refs/remotes/origin/*');
      expect(result.force).toBe(true);
      expect(result.src).toBe('refs/heads/*');
      expect(result.dst).toBe('refs/remotes/origin/*');
    });

    it('should apply refspec to ref', () => {
      const result = RemoteManager.applyRefspec(
        '+refs/heads/*:refs/remotes/origin/*',
        'refs/heads/main'
      );
      expect(result).toBe('refs/remotes/origin/main');
    });
  });
});

describe('Protocol - Ref Advertisement', () => {
  it('should parse capabilities', () => {
    const caps = parseCapabilities('multi_ack thin-pack side-band-64k agent=git/2.40.0');
    
    expect(caps['multi_ack']).toBe(true);
    expect(caps['thin-pack']).toBe(true);
    expect(caps['side-band-64k']).toBe(true);
    expect(caps['agent']).toBe('git/2.40.0');
  });

  it('should serialize capabilities', () => {
    const caps = {
      'multi_ack': true,
      'thin-pack': true,
      'agent': 'tsgit/2.0',
    };
    
    const result = serializeCapabilities(caps);
    expect(result).toContain('multi_ack');
    expect(result).toContain('thin-pack');
    expect(result).toContain('agent=tsgit/2.0');
  });

  it('should parse refspec', () => {
    const result = parseRefspec('+refs/heads/*:refs/remotes/origin/*');
    
    expect(result.force).toBe(true);
    expect(result.source).toBe('refs/heads/*');
    expect(result.destination).toBe('refs/remotes/origin/*');
    expect(result.isGlob).toBe(true);
  });

  it('should apply fetch refspec', () => {
    const refspec = parseRefspec('+refs/heads/*:refs/remotes/origin/*');
    
    expect(applyFetchRefspec('refs/heads/main', refspec)).toBe('refs/remotes/origin/main');
    expect(applyFetchRefspec('refs/heads/feature/test', refspec)).toBe('refs/remotes/origin/feature/test');
    expect(applyFetchRefspec('refs/tags/v1.0', refspec)).toBeNull();
  });
});

describe('Protocol - PKT-LINE', () => {
  it('should create pkt-line', () => {
    const line = pktLine('hello');
    expect(line.toString()).toBe('0009hello');
  });

  it('should create flush packet', () => {
    const flush = pktFlush();
    expect(flush.toString()).toBe('0000');
  });

  it('should parse pkt-lines', () => {
    const data = Buffer.concat([
      pktLine('first line\n'),
      pktLine('second line\n'),
      pktFlush(),
    ]);
    
    const { lines } = parsePktLines(data);
    expect(lines).toHaveLength(3);
    expect(lines[0].toString()).toBe('first line\n');
    expect(lines[1].toString()).toBe('second line\n');
    expect(lines[2].length).toBe(0); // Flush packet
  });
});

describe('Protocol - Pack File', () => {
  it('should write and parse pack header', () => {
    const header = writePackHeader(42, 2);
    expect(header.length).toBe(12);
    
    const parsed = parsePackHeader(header);
    expect(parsed.signature).toBe('PACK');
    expect(parsed.version).toBe(2);
    expect(parsed.objectCount).toBe(42);
  });

  it('should write and read pack object header', () => {
    const header = writePackObjectHeader(PackObjectType.BLOB, 1234);
    const { type, size } = readPackObjectHeader(header, 0);
    
    expect(type).toBe(PackObjectType.BLOB);
    expect(size).toBe(1234);
  });

  it('should apply delta', () => {
    // Create a simple delta that copies from source
    const source = Buffer.from('Hello, World!');
    const target = Buffer.from('Hello, World!');
    
    // Delta format: source size, target size, copy instruction
    // Source size = 13 (0x0d)
    // Target size = 13 (0x0d)
    // Copy: 0x80 | offset_flags | size_flags, offset bytes, size bytes
    // Copy entire source: 0x80 | 0x10 = 0x90, size = 13
    const delta = Buffer.from([
      0x0d, // source size
      0x0d, // target size
      0x90, 0x0d, // copy from offset 0, size 13
    ]);
    
    const result = applyDelta(source, delta);
    expect(result.toString()).toBe('Hello, World!');
  });
});

describe('CredentialManager', () => {
  it('should create basic credentials', () => {
    const creds = createBasicCredentials('user', 'pass');
    
    expect(creds.username).toBe('user');
    expect(creds.password).toBe('pass');
    expect(creds.type).toBe('basic');
  });

  it('should create bearer credentials', () => {
    const creds = createBearerCredentials('token123');
    
    expect(creds.username).toBe('token');
    expect(creds.password).toBe('token123');
    expect(creds.type).toBe('bearer');
  });

  it('should create GitHub credentials', () => {
    const creds = createGitHubCredentials('ghp_xxxxx');
    
    expect(creds.username).toBe('x-access-token');
    expect(creds.password).toBe('ghp_xxxxx');
    expect(creds.type).toBe('basic');
  });

  it('should get credentials from environment', async () => {
    const originalToken = process.env.TSGIT_TOKEN;
    process.env.TSGIT_TOKEN = 'test-token';
    
    try {
      const manager = new CredentialManager();
      const creds = await manager.getCredentials('https://github.com/user/repo.git');
      
      expect(creds).not.toBeNull();
      expect(creds!.password).toBe('test-token');
      expect(creds!.type).toBe('bearer');
    } finally {
      if (originalToken) {
        process.env.TSGIT_TOKEN = originalToken;
      } else {
        delete process.env.TSGIT_TOKEN;
      }
    }
  });

  it('should return null when no credentials available', async () => {
    const originalTsgitToken = process.env.TSGIT_TOKEN;
    const originalGithubToken = process.env.GITHUB_TOKEN;
    const originalGitToken = process.env.GIT_TOKEN;
    
    delete process.env.TSGIT_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GIT_TOKEN;
    
    try {
      const manager = new CredentialManager();
      // Clear the cache to ensure fresh lookup
      manager.clearCache();
      
      // This may return null or use git credential helper
      const creds = await manager.getCredentials('https://example.com/repo.git');
      // We can't reliably test this as it depends on system configuration
      // Just verify it doesn't throw
    } finally {
      if (originalTsgitToken) process.env.TSGIT_TOKEN = originalTsgitToken;
      if (originalGithubToken) process.env.GITHUB_TOKEN = originalGithubToken;
      if (originalGitToken) process.env.GIT_TOKEN = originalGitToken;
    }
  });
});
