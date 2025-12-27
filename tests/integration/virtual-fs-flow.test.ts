/**
 * Virtual Filesystem Integration Test
 * 
 * Tests the complete flow:
 * 1. User creates a repository
 * 2. Opens the IDE (creates virtual session)
 * 3. Agent generates code in virtual filesystem
 * 4. User/agent commits the code
 * 5. Code can be cloned in a tmp directory
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { VirtualRepository } from '../../src/primitives/virtual-repository';
import { VirtualFS } from '../../src/primitives/virtual-fs';
import { ObjectStore } from '../../src/core/object-store';
import { Refs } from '../../src/core/refs';
import { clone } from '../../src/commands/clone';
import { setVirtualRepo, getVirtualRepo, clearVirtualRepo } from '../../src/ai/tools/virtual-write-file';

describe('Virtual Filesystem Flow', () => {
  let testDir: string;
  let repoPath: string;
  let cloneDir: string;

  beforeEach(() => {
    // Create test directories
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfs-test-'));
    repoPath = path.join(testDir, 'test-repo.git');
    cloneDir = path.join(testDir, 'cloned');
  });

  afterEach(() => {
    // Cleanup
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should complete the full IDE flow: create repo -> write code -> commit -> clone', async () => {
    // Step 1: Create a virtual repository (simulates creating a repo on the server)
    console.log('Step 1: Creating virtual repository...');
    const vrepo = VirtualRepository.init(repoPath);
    expect(vrepo.isValid()).toBe(true);

    // Step 2: Write code in the virtual filesystem (simulates IDE/agent editing)
    console.log('Step 2: Writing code in virtual filesystem...');
    
    // Write a simple function
    vrepo.write('src/utils.ts', `/**
 * Utility functions
 */

/**
 * Add two numbers
 * @param a - First number
 * @param b - Second number
 * @returns The sum of a and b
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Multiply two numbers
 * @param a - First number
 * @param b - Second number
 * @returns The product of a and b
 */
export function multiply(a: number, b: number): number {
  return a * b;
}
`);

    // Write package.json
    vrepo.write('package.json', JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      type: 'module',
      main: 'src/utils.ts',
    }, null, 2));

    // Write README
    vrepo.write('README.md', `# Test Project

A simple utility library.

## Usage

\`\`\`typescript
import { add, multiply } from './src/utils';

console.log(add(2, 3)); // 5
console.log(multiply(2, 3)); // 6
\`\`\`
`);

    // Verify files were written
    expect(vrepo.exists('src/utils.ts')).toBe(true);
    expect(vrepo.exists('package.json')).toBe(true);
    expect(vrepo.exists('README.md')).toBe(true);

    // Check status shows all files as added
    const status = vrepo.status();
    expect(status.length).toBe(3);
    expect(status.every(s => s.status === 'added')).toBe(true);

    // Step 3: Commit the changes
    console.log('Step 3: Committing changes...');
    const commitHash = vrepo.commit('Initial commit: Add utility functions', {
      name: 'Test User',
      email: 'test@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      timezone: '+0000',
    });

    expect(commitHash).toMatch(/^[a-f0-9]{40}$/);
    console.log(`  Created commit: ${commitHash.slice(0, 7)}`);

    // Verify no more changes after commit
    const statusAfter = vrepo.status();
    expect(statusAfter.length).toBe(0);

    // Step 4: Clone the repository
    console.log('Step 4: Cloning repository...');
    const clonedRepo = clone(repoPath, cloneDir);

    // Verify cloned files exist on disk
    expect(fs.existsSync(path.join(cloneDir, 'src', 'utils.ts'))).toBe(true);
    expect(fs.existsSync(path.join(cloneDir, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(cloneDir, 'README.md'))).toBe(true);

    // Verify content matches
    const clonedContent = fs.readFileSync(path.join(cloneDir, 'src', 'utils.ts'), 'utf-8');
    expect(clonedContent).toContain('export function add');
    expect(clonedContent).toContain('export function multiply');

    console.log('✓ Full flow completed successfully!');
  });

  it('should handle multiple commits and file modifications', async () => {
    // Create repo
    const vrepo = VirtualRepository.init(repoPath);

    // First commit
    vrepo.write('index.ts', 'console.log("v1");');
    const commit1 = vrepo.commit('Initial version');

    // Modify and second commit
    vrepo.write('index.ts', 'console.log("v2");');
    vrepo.write('config.json', '{"version": 2}');
    const commit2 = vrepo.commit('Update to v2');

    // Verify log has both commits
    const log = vrepo.log();
    expect(log.length).toBe(2);
    expect(log[0].hash).toBe(commit2);
    expect(log[1].hash).toBe(commit1);

    // Clone and verify latest content
    const clonedRepo = clone(repoPath, cloneDir);
    const content = fs.readFileSync(path.join(cloneDir, 'index.ts'), 'utf-8');
    expect(content).toBe('console.log("v2");');
  });

  it('should work with AI tools session management', async () => {
    // Create repo
    const vrepo = VirtualRepository.init(repoPath);

    // Simulate AI agent session
    const sessionId = 'test-session-123';
    setVirtualRepo(sessionId, vrepo);

    // Get the session
    const session = getVirtualRepo(sessionId);
    expect(session).toBe(vrepo);

    // Write through the session
    session!.write('agent-generated.ts', `
export function generateGreeting(name: string): string {
  return \`Hello, \${name}!\`;
}
`);

    // Commit
    session!.commit('Agent generated greeting function');

    // Clean up session
    clearVirtualRepo(sessionId);
    expect(getVirtualRepo(sessionId)).toBeNull();

    // Clone to verify
    clone(repoPath, cloneDir);
    expect(fs.existsSync(path.join(cloneDir, 'agent-generated.ts'))).toBe(true);
  });

  it('should handle VirtualFS directly for low-level operations', async () => {
    // Create bare repo structure manually
    fs.mkdirSync(repoPath, { recursive: true });
    fs.mkdirSync(path.join(repoPath, 'objects'));
    fs.mkdirSync(path.join(repoPath, 'refs', 'heads'), { recursive: true });
    fs.writeFileSync(path.join(repoPath, 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(repoPath, 'config'), `[core]
    repositoryformatversion = 0
    bare = true
[wit]
    hashAlgorithm = sha1
`);

    // Create VirtualFS directly
    const objects = new ObjectStore(repoPath);
    const refs = new Refs(repoPath);
    const vfs = new VirtualFS(objects, refs);

    // Write files
    vfs.write('hello.txt', 'Hello, World!');
    vfs.write('nested/deep/file.txt', 'Nested content');

    // List operations
    const rootEntries = vfs.list('.');
    expect(rootEntries.length).toBe(2);
    expect(rootEntries.some(e => e.name === 'hello.txt')).toBe(true);
    expect(rootEntries.some(e => e.name === 'nested' && e.type === 'dir')).toBe(true);

    // Recursive list
    const allEntries = vfs.listRecursive('.');
    expect(allEntries.length).toBe(4); // hello.txt, nested/, nested/deep/, nested/deep/file.txt

    // File operations
    expect(vfs.read('hello.txt')).toBe('Hello, World!');
    expect(vfs.exists('nonexistent.txt')).toBe(false);

    // Copy and move
    vfs.copy('hello.txt', 'hello-copy.txt');
    expect(vfs.read('hello-copy.txt')).toBe('Hello, World!');

    vfs.move('hello-copy.txt', 'hello-moved.txt');
    expect(vfs.exists('hello-copy.txt')).toBe(false);
    expect(vfs.read('hello-moved.txt')).toBe('Hello, World!');

    // Delete
    vfs.delete('hello-moved.txt');
    expect(vfs.exists('hello-moved.txt')).toBe(false);

    // Commit
    const hash = vfs.commit('Test commit');
    expect(hash).toMatch(/^[a-f0-9]{40}$/);

    // Clone to verify
    clone(repoPath, cloneDir);
    expect(fs.readFileSync(path.join(cloneDir, 'hello.txt'), 'utf-8')).toBe('Hello, World!');
    expect(fs.readFileSync(path.join(cloneDir, 'nested', 'deep', 'file.txt'), 'utf-8')).toBe('Nested content');
  });

  it('should support branching workflows', async () => {
    // Create repo with initial commit
    const vrepo = VirtualRepository.init(repoPath);
    vrepo.write('main.ts', 'const version = 1;');
    vrepo.commit('Initial commit');

    // Create and switch to feature branch
    vrepo.createBranch('feature');
    vrepo.checkout('feature');
    expect(vrepo.getCurrentBranch()).toBe('feature');

    // Make changes on feature branch
    vrepo.write('main.ts', 'const version = 2;');
    vrepo.write('feature.ts', 'export const feature = true;');
    vrepo.commit('Add feature');

    // Switch back to main
    vrepo.checkout('main');
    expect(vrepo.getCurrentBranch()).toBe('main');

    // Main should have original content
    expect(vrepo.read('main.ts')).toBe('const version = 1;');
    expect(vrepo.exists('feature.ts')).toBe(false);

    // Switch to feature
    vrepo.checkout('feature');
    expect(vrepo.read('main.ts')).toBe('const version = 2;');
    expect(vrepo.exists('feature.ts')).toBe(true);

    // Clone specific branch
    clone(repoPath, cloneDir, { branch: 'feature' });
    expect(fs.readFileSync(path.join(cloneDir, 'main.ts'), 'utf-8')).toBe('const version = 2;');
    expect(fs.existsSync(path.join(cloneDir, 'feature.ts'))).toBe(true);
  });

  it('should handle the test case: create repo -> open IDE -> agent generates function -> commit -> clone', async () => {
    console.log('\n=== TEST CASE: Complete IDE/Agent Flow ===\n');

    // 1. User creates a repo (on server)
    console.log('1. User creates repository "my-awesome-project"');
    const vrepo = VirtualRepository.init(repoPath);
    console.log(`   Created at: ${repoPath}`);

    // 2. User opens the IDE (creates a session)
    console.log('\n2. User opens IDE, creating editing session');
    const sessionId = `ide-session-${Date.now()}`;
    setVirtualRepo(sessionId, vrepo);
    console.log(`   Session ID: ${sessionId}`);

    // 3. User asks agent to generate a function
    console.log('\n3. Agent generates code based on user request');
    const session = getVirtualRepo(sessionId)!;
    
    // Agent writes the function
    session.write('src/greet.ts', `/**
 * Greeting function generated by AI Agent
 * 
 * @example
 * greet('World') // Returns: 'Hello, World!'
 */
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

/**
 * Personalized greeting with time of day
 */
export function greetWithTime(name: string): string {
  const hour = new Date().getHours();
  let timeGreeting: string;
  
  if (hour < 12) {
    timeGreeting = 'Good morning';
  } else if (hour < 18) {
    timeGreeting = 'Good afternoon';
  } else {
    timeGreeting = 'Good evening';
  }
  
  return \`\${timeGreeting}, \${name}!\`;
}
`);
    console.log('   Generated: src/greet.ts');

    // Agent also writes tests
    session.write('src/greet.test.ts', `import { describe, it, expect } from 'vitest';
import { greet, greetWithTime } from './greet';

describe('greet', () => {
  it('should greet by name', () => {
    expect(greet('World')).toBe('Hello, World!');
    expect(greet('Alice')).toBe('Hello, Alice!');
  });
});

describe('greetWithTime', () => {
  it('should include a time-based greeting', () => {
    const result = greetWithTime('Bob');
    expect(result).toMatch(/^(Good morning|Good afternoon|Good evening), Bob!$/);
  });
});
`);
    console.log('   Generated: src/greet.test.ts');

    // Check what agent created
    const status = session.status();
    console.log(`\n   Changes ready to commit: ${status.length} files`);
    status.forEach(s => console.log(`     - ${s.path} (${s.status})`));

    // 4. User commits the changes
    console.log('\n4. User commits the changes');
    const commitHash = session.commit('feat: Add greeting functions with tests', {
      name: 'Demo User',
      email: 'demo@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      timezone: '+0000',
    });
    console.log(`   Commit: ${commitHash.slice(0, 7)}`);

    // Close session
    clearVirtualRepo(sessionId);

    // 5. Clone in tmp directory
    console.log('\n5. Clone repository to verify');
    const clonedRepo = clone(repoPath, cloneDir);
    console.log(`   Cloned to: ${cloneDir}`);

    // Verify files
    const greetContent = fs.readFileSync(path.join(cloneDir, 'src', 'greet.ts'), 'utf-8');
    const testContent = fs.readFileSync(path.join(cloneDir, 'src', 'greet.test.ts'), 'utf-8');

    expect(greetContent).toContain('export function greet');
    expect(greetContent).toContain('export function greetWithTime');
    expect(testContent).toContain('describe(\'greet\'');

    console.log('\n   ✓ src/greet.ts exists and contains greeting functions');
    console.log('   ✓ src/greet.test.ts exists and contains tests');
    console.log('\n=== TEST CASE PASSED ===\n');
  });
});
