/**
 * Hooks System
 * 
 * Provides Git-like hooks for customizing wit behavior.
 * 
 * Hook Types:
 * - pre-commit: Before commit is created (can abort)
 * - post-commit: After commit is created
 * - pre-push: Before push (can abort)
 * - post-merge: After merge
 * - pre-rebase: Before rebase (can abort)
 * - commit-msg: Validate/modify commit message (can abort)
 * - post-checkout: After checkout/switch
 * - pre-receive: Before receiving a push
 * 
 * Hooks can be:
 * 1. Shell scripts in .wit/hooks/
 * 2. TypeScript/JavaScript files in .wit/hooks/
 * 3. Programmatic hooks registered via the API
 */

import * as path from 'path';
import * as fs from 'fs';
import { spawn, SpawnOptions } from 'child_process';
import { exists, writeFile, mkdirp, readDir, readFileText } from '../utils/fs';

/**
 * Available hook types
 */
export type HookType = 
  | 'pre-commit'
  | 'post-commit'
  | 'pre-push'
  | 'post-merge'
  | 'pre-rebase'
  | 'commit-msg'
  | 'post-checkout'
  | 'pre-receive'
  | 'prepare-commit-msg';

/**
 * Hook execution result
 */
export interface HookResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  hookType: HookType;
  hookPath?: string;
  duration: number;
}

/**
 * Hook context passed to programmatic hooks
 */
export interface HookContext {
  hookType: HookType;
  gitDir: string;
  workDir: string;
  args: string[];
  env: Record<string, string>;
  
  // Hook-specific data
  commitMessage?: string;
  files?: string[];
  branch?: string;
  targetBranch?: string;
  commitHash?: string;
}

/**
 * Programmatic hook handler type
 */
export type ProgrammaticHook = (context: HookContext) => Promise<{ success: boolean; message?: string; modifiedMessage?: string }>;

/**
 * Hook manager configuration
 */
export interface HookManagerConfig {
  enabled: boolean;
  timeout: number;  // in milliseconds
  parallel: boolean;  // run multiple hooks in parallel
}

const DEFAULT_CONFIG: HookManagerConfig = {
  enabled: true,
  timeout: 30000,  // 30 seconds
  parallel: false,
};

/**
 * Sample hook templates
 */
export const HOOK_TEMPLATES: Record<HookType, string> = {
  'pre-commit': `#!/bin/sh
# pre-commit hook
# 
# This hook is called before a commit is created.
# Exit with non-zero status to abort the commit.
#
# Examples:
# - Run linter
# - Run tests
# - Check for debug statements

# Example: Check for console.log statements
if git diff --cached --name-only | xargs grep -l 'console.log' 2>/dev/null; then
  echo "Warning: console.log statements found in staged files"
  # Uncomment to abort: exit 1
fi

exit 0
`,

  'post-commit': `#!/bin/sh
# post-commit hook
#
# This hook is called after a commit is created.
# The commit hash is available as $1.
#
# Examples:
# - Send notifications
# - Update external systems
# - Generate documentation

echo "Commit created successfully"
exit 0
`,

  'pre-push': `#!/bin/sh
# pre-push hook
#
# This hook is called before pushing to a remote.
# Exit with non-zero status to abort the push.
#
# Args: $1 = remote name, $2 = remote URL
# Stdin: <local ref> <local sha> <remote ref> <remote sha>
#
# Examples:
# - Run full test suite
# - Check for WIP commits

remote="$1"
url="$2"

echo "Preparing to push to $remote ($url)"
exit 0
`,

  'post-merge': `#!/bin/sh
# post-merge hook
#
# This hook is called after a successful merge.
# $1 = squash flag (1 if squash merge, 0 otherwise)
#
# Examples:
# - Install new dependencies
# - Run database migrations
# - Clear caches

is_squash_merge="$1"
echo "Merge completed (squash: $is_squash_merge)"
exit 0
`,

  'pre-rebase': `#!/bin/sh
# pre-rebase hook
#
# This hook is called before a rebase operation.
# Exit with non-zero status to abort the rebase.
# $1 = upstream, $2 = branch being rebased (or empty if current)
#
# Examples:
# - Check for in-progress work
# - Verify branch protection

upstream="$1"
branch="$2"

echo "Rebasing onto $upstream"
exit 0
`,

  'commit-msg': `#!/bin/sh
# commit-msg hook
#
# This hook is called after the commit message is entered.
# The commit message file path is $1.
# Exit with non-zero status to abort the commit.
#
# Examples:
# - Enforce commit message format
# - Add ticket numbers
# - Check message length

COMMIT_MSG_FILE="$1"
COMMIT_MSG=$(cat "$COMMIT_MSG_FILE")

# Example: Ensure message is at least 10 characters
if [ \${#COMMIT_MSG} -lt 10 ]; then
  echo "Error: Commit message must be at least 10 characters"
  exit 1
fi

exit 0
`,

  'post-checkout': `#!/bin/sh
# post-checkout hook
#
# This hook is called after checkout or switch.
# $1 = previous HEAD, $2 = new HEAD, $3 = 1 if branch checkout
#
# Examples:
# - Install branch-specific dependencies
# - Update configuration files

prev_head="$1"
new_head="$2"
is_branch_checkout="$3"

echo "Checked out from $prev_head to $new_head"
exit 0
`,

  'pre-receive': `#!/bin/sh
# pre-receive hook
#
# This hook is called before receiving a push.
# Reads from stdin: <old-value> <new-value> <ref-name>
# Exit with non-zero status to reject the push.

while read oldrev newrev refname; do
  echo "Receiving: $refname ($oldrev -> $newrev)"
done

exit 0
`,

  'prepare-commit-msg': `#!/bin/sh
# prepare-commit-msg hook
#
# This hook is called before the commit message editor is opened.
# Can be used to modify the default commit message.
# $1 = commit message file, $2 = source of message, $3 = commit SHA (for amend)

COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"
SHA1="$3"

# Example: Add branch name to commit message
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [ -n "$BRANCH" ] && [ "$COMMIT_SOURCE" != "merge" ]; then
  # Prepend branch name if not already present
  if ! grep -q "^\\[$BRANCH\\]" "$COMMIT_MSG_FILE"; then
    sed -i.bak "1s/^/[$BRANCH] /" "$COMMIT_MSG_FILE"
  fi
fi

exit 0
`,
};

/**
 * Hook Manager - handles hook installation, execution, and management
 */
export class HookManager {
  private hooksDir: string;
  private programmaticHooks: Map<HookType, ProgrammaticHook[]> = new Map();
  private config: HookManagerConfig;

  constructor(private gitDir: string, private workDir: string, config: Partial<HookManagerConfig> = {}) {
    this.hooksDir = path.join(gitDir, 'hooks');
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize hooks directory with sample hooks
   */
  init(): void {
    mkdirp(this.hooksDir);
    
    // Create a hooks README
    const readme = `# wit Hooks

Place hook scripts in this directory. Hooks must be executable.

Available hooks:
- pre-commit     Before commit (can abort)
- post-commit    After commit
- pre-push       Before push (can abort)
- post-merge     After merge
- pre-rebase     Before rebase (can abort)
- commit-msg     Validate commit message (can abort)
- post-checkout  After checkout/switch
- prepare-commit-msg  Modify default commit message

To enable a sample hook:
  mv pre-commit.sample pre-commit
  chmod +x pre-commit
`;
    writeFile(path.join(this.hooksDir, 'README'), readme);
    
    // Create sample hooks
    for (const [hookType, template] of Object.entries(HOOK_TEMPLATES)) {
      const samplePath = path.join(this.hooksDir, `${hookType}.sample`);
      if (!exists(samplePath)) {
        writeFile(samplePath, template);
        try {
          fs.chmodSync(samplePath, 0o755);
        } catch {
          // Ignore chmod errors on Windows
        }
      }
    }
  }

  /**
   * Check if hooks are enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable/disable hooks
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Get the path to a hook file
   */
  getHookPath(hookType: HookType): string {
    return path.join(this.hooksDir, hookType);
  }

  /**
   * Check if a hook exists
   */
  hookExists(hookType: HookType): boolean {
    const hookPath = this.getHookPath(hookType);
    return exists(hookPath);
  }

  /**
   * List all installed hooks
   */
  listHooks(): { type: HookType; path: string; enabled: boolean }[] {
    const hooks: { type: HookType; path: string; enabled: boolean }[] = [];
    
    if (!exists(this.hooksDir)) {
      return hooks;
    }

    const files = readDir(this.hooksDir);
    const hookTypes: HookType[] = [
      'pre-commit', 'post-commit', 'pre-push', 'post-merge',
      'pre-rebase', 'commit-msg', 'post-checkout', 'pre-receive', 'prepare-commit-msg'
    ];

    for (const file of files) {
      if (hookTypes.includes(file as HookType)) {
        const hookPath = path.join(this.hooksDir, file);
        hooks.push({
          type: file as HookType,
          path: hookPath,
          enabled: this.isExecutable(hookPath),
        });
      }
    }

    return hooks;
  }

  /**
   * Check if a file is executable
   */
  private isExecutable(filePath: string): boolean {
    try {
      const stats = fs.statSync(filePath);
      // Check if any execute bit is set
      return (stats.mode & 0o111) !== 0;
    } catch {
      return false;
    }
  }

  /**
   * Install a hook from template
   */
  installHook(hookType: HookType, content?: string): void {
    mkdirp(this.hooksDir);
    
    const hookPath = this.getHookPath(hookType);
    const hookContent = content || HOOK_TEMPLATES[hookType];
    
    writeFile(hookPath, hookContent);
    
    try {
      fs.chmodSync(hookPath, 0o755);
    } catch {
      // Ignore chmod errors on Windows
    }
  }

  /**
   * Remove a hook
   */
  removeHook(hookType: HookType): boolean {
    const hookPath = this.getHookPath(hookType);
    
    if (exists(hookPath)) {
      fs.unlinkSync(hookPath);
      return true;
    }
    
    return false;
  }

  /**
   * Register a programmatic hook
   */
  registerHook(hookType: HookType, handler: ProgrammaticHook): void {
    if (!this.programmaticHooks.has(hookType)) {
      this.programmaticHooks.set(hookType, []);
    }
    this.programmaticHooks.get(hookType)!.push(handler);
  }

  /**
   * Unregister all programmatic hooks of a type
   */
  unregisterHooks(hookType: HookType): void {
    this.programmaticHooks.delete(hookType);
  }

  /**
   * Run a hook
   */
  async runHook(hookType: HookType, context: Partial<HookContext> = {}): Promise<HookResult> {
    const startTime = Date.now();
    
    // Build full context
    const fullContext: HookContext = {
      hookType,
      gitDir: this.gitDir,
      workDir: this.workDir,
      args: context.args || [],
      env: context.env || {},
      ...context,
    };

    // Check if hooks are enabled
    if (!this.config.enabled) {
      return {
        success: true,
        exitCode: 0,
        stdout: '',
        stderr: '',
        hookType,
        duration: Date.now() - startTime,
      };
    }

    const hookPath = this.getHookPath(hookType);
    
    // Run file-based hook if it exists
    if (exists(hookPath) && this.isExecutable(hookPath)) {
      const result = await this.executeHook(hookPath, fullContext);
      if (!result.success) {
        return result;
      }
    }

    // Run programmatic hooks
    const programmaticHandlers = this.programmaticHooks.get(hookType) || [];
    for (const handler of programmaticHandlers) {
      try {
        const result = await handler(fullContext);
        if (!result.success) {
          return {
            success: false,
            exitCode: 1,
            stdout: '',
            stderr: result.message || 'Hook rejected operation',
            hookType,
            duration: Date.now() - startTime,
          };
        }
        
        // Handle modified commit message
        if (result.modifiedMessage && hookType === 'commit-msg') {
          fullContext.commitMessage = result.modifiedMessage;
        }
      } catch (error) {
        return {
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          hookType,
          duration: Date.now() - startTime,
        };
      }
    }

    return {
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
      hookType,
      hookPath: exists(hookPath) ? hookPath : undefined,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Execute a hook file
   */
  private executeHook(hookPath: string, context: HookContext): Promise<HookResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      
      // Prepare environment
      const env: Record<string, string> = {
        ...process.env as Record<string, string>,
        ...context.env,
        WIT_DIR: context.gitDir,
        WIT_WORK_DIR: context.workDir,
        WIT_HOOK_TYPE: context.hookType,
      };

      if (context.commitHash) {
        env.WIT_COMMIT = context.commitHash;
      }
      if (context.branch) {
        env.WIT_BRANCH = context.branch;
      }

      // Determine how to execute the hook
      const hookContent = readFileText(hookPath);
      const isShellScript = hookContent.startsWith('#!');
      
      let command: string;
      let args: string[];

      if (isShellScript) {
        // Use the shebang
        const shebangMatch = hookContent.match(/^#!(.+)/);
        if (shebangMatch) {
          const shebang = shebangMatch[1].trim();
          const parts = shebang.split(/\s+/);
          command = parts[0];
          args = [...parts.slice(1), hookPath, ...context.args];
        } else {
          command = '/bin/sh';
          args = [hookPath, ...context.args];
        }
      } else if (hookPath.endsWith('.js') || hookPath.endsWith('.mjs')) {
        command = 'node';
        args = [hookPath, ...context.args];
      } else if (hookPath.endsWith('.ts')) {
        command = 'npx';
        args = ['ts-node', hookPath, ...context.args];
      } else {
        // Default to shell
        command = process.platform === 'win32' ? 'cmd' : '/bin/sh';
        args = process.platform === 'win32' 
          ? ['/c', hookPath, ...context.args]
          : [hookPath, ...context.args];
      }

      // Set up stdin for commit-msg hook
      let stdin: string | undefined;
      if (context.hookType === 'commit-msg' && context.commitMessage) {
        // Write commit message to a temp file
        const msgFile = path.join(context.gitDir, 'COMMIT_EDITMSG');
        writeFile(msgFile, context.commitMessage);
        args = args.filter(a => a !== hookPath);
        args.push(hookPath, msgFile);
      }

      const spawnOptions: SpawnOptions = {
        cwd: context.workDir,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.config.timeout,
      };

      let stdout = '';
      let stderr = '';

      try {
        const child = spawn(command, args, spawnOptions);

        child.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        if (stdin && child.stdin) {
          child.stdin.write(stdin);
          child.stdin.end();
        }

        child.on('close', (code: number | null) => {
          resolve({
            success: code === 0,
            exitCode: code ?? 1,
            stdout,
            stderr,
            hookType: context.hookType,
            hookPath,
            duration: Date.now() - startTime,
          });
        });

        child.on('error', (error: Error) => {
          resolve({
            success: false,
            exitCode: 1,
            stdout,
            stderr: error.message,
            hookType: context.hookType,
            hookPath,
            duration: Date.now() - startTime,
          });
        });
      } catch (error) {
        resolve({
          success: false,
          exitCode: 1,
          stdout: '',
          stderr: error instanceof Error ? error.message : String(error),
          hookType: context.hookType,
          hookPath,
          duration: Date.now() - startTime,
        });
      }
    });
  }

  /**
   * Get hook template for a specific hook type
   */
  getTemplate(hookType: HookType): string {
    return HOOK_TEMPLATES[hookType];
  }

  /**
   * Read the content of an installed hook
   */
  readHook(hookType: HookType): string | null {
    const hookPath = this.getHookPath(hookType);
    
    if (!exists(hookPath)) {
      return null;
    }
    
    return readFileText(hookPath);
  }

  /**
   * Check if running hooks should abort an operation
   * Returns error message if should abort, null otherwise
   */
  async shouldAbort(hookType: HookType, context: Partial<HookContext> = {}): Promise<string | null> {
    const result = await this.runHook(hookType, context);
    
    if (!result.success) {
      // Combine stderr and stdout for the error message
      const message = (result.stderr || result.stdout || 'Hook rejected the operation').trim();
      return message;
    }
    
    return null;
  }
}

import { colors } from '../utils/colors';

// Import hook config utilities
import {
  loadHookConfig,
  saveHookConfig,
  generateHookScript,
  generateStagedHookScript,
  initHookConfig,
} from './hook-config';

/**
 * Sync hooks from config to .wit/hooks directory
 */
function syncHooksFromConfig(hookManager: HookManager, workDir: string): number {
  const config = loadHookConfig(workDir);
  if (!config) {
    return 0;
  }

  let synced = 0;
  const hookTypes: HookType[] = [
    'pre-commit', 'post-commit', 'pre-push', 'post-merge',
    'pre-rebase', 'commit-msg', 'post-checkout', 'pre-receive', 'prepare-commit-msg'
  ];

  // Generate hooks from config
  for (const hookType of hookTypes) {
    const script = generateHookScript(hookType, config);
    if (script) {
      hookManager.installHook(hookType, script);
      synced++;
    }
  }

  // Generate lint-staged style pre-commit hook if configured
  if (config.staged && Object.keys(config.staged).length > 0) {
    const stagedScript = generateStagedHookScript(config);
    if (stagedScript) {
      // Merge with existing pre-commit if present
      const existingPreCommit = hookManager.readHook('pre-commit');
      if (existingPreCommit && !existingPreCommit.includes('lint-staged style')) {
        // Append staged commands to existing pre-commit
        const combined = existingPreCommit.replace('exit 0', '') + '\n' + 
          stagedScript.split('\n').slice(5).join('\n');
        hookManager.installHook('pre-commit', combined);
      } else {
        hookManager.installHook('pre-commit', stagedScript);
      }
      synced++;
    }
  }

  return synced;
}

/**
 * CLI handler for hooks command
 */
export function handleHooks(args: string[]): void {
  // Import Repository here to avoid circular dependency
  const { Repository } = require('./repository');
  
  const repo = Repository.find();
  const hookManager = new HookManager(repo.gitDir, repo.workDir);
  
  const subcommand = args[0];

  switch (subcommand) {
    case 'list':
    case undefined: {
      const hooks = hookManager.listHooks();
      const config = loadHookConfig(repo.workDir);
      
      console.log(colors.bold('Hooks Status\n'));
      
      if (config) {
        console.log(colors.cyan('Config:') + ` .wit/hooks.json`);
        console.log(colors.dim('  Run "wit hooks sync" to apply config changes\n'));
      }
      
      if (hooks.length === 0) {
        console.log(colors.dim('No hooks installed'));
        console.log(colors.dim('\nQuick start:'));
        console.log(colors.dim('  wit hooks setup              # Create hooks.json config'));
        console.log(colors.dim('  wit hooks install <type>     # Install a single hook'));
        return;
      }

      console.log(colors.bold('Installed hooks:\n'));
      for (const hook of hooks) {
        const status = hook.enabled 
          ? colors.green('●') 
          : colors.yellow('○');
        console.log(`  ${status} ${hook.type}`);
        console.log(colors.dim(`    ${hook.path}`));
      }
      break;
    }

    case 'setup': {
      // Like husky install - sets up hooks for the project
      const sample = args.includes('--sample') || args.includes('-s');
      
      // Initialize hooks directory
      hookManager.init();
      
      // Create hooks.json config
      const configPath = initHookConfig(repo.workDir, sample);
      
      console.log(colors.green('✓') + ' Hooks setup complete!');
      console.log(colors.dim(`\nCreated: ${configPath}`));
      
      if (sample) {
        console.log(colors.dim('\nSample config includes:'));
        console.log(colors.dim('  • pre-commit: npm run lint'));
        console.log(colors.dim('  • commit-msg: commitlint'));
        console.log(colors.dim('  • staged: eslint + prettier for TS/TSX files'));
      }
      
      console.log(colors.dim('\nNext steps:'));
      console.log(colors.dim('  1. Edit .wit/hooks.json to customize hooks'));
      console.log(colors.dim('  2. Run "wit hooks sync" to apply changes'));
      console.log(colors.dim('  3. Add "wit hooks sync" to your npm postinstall script'));
      break;
    }

    case 'sync': {
      // Sync hooks from config file to .wit/hooks
      const synced = syncHooksFromConfig(hookManager, repo.workDir);
      
      if (synced === 0) {
        console.log(colors.yellow('!') + ' No hooks defined in config');
        console.log(colors.dim('  Run "wit hooks setup --sample" to create a sample config'));
      } else {
        console.log(colors.green('✓') + ` Synced ${synced} hook(s) from config`);
      }
      break;
    }

    case 'add': {
      // Add a hook command to config (like husky add)
      const hookType = args[1] as HookType;
      const command = args.slice(2).join(' ');
      
      if (!hookType || !command) {
        console.error(colors.red('error: ') + 'Usage: wit hooks add <hook-type> <command>');
        console.error('\nExample:');
        console.error('  wit hooks add pre-commit "npm run lint"');
        console.error('  wit hooks add commit-msg "npx commitlint --edit $1"');
        process.exit(1);
      }

      if (!HOOK_TEMPLATES[hookType]) {
        console.error(colors.red('error: ') + `Unknown hook type: ${hookType}`);
        process.exit(1);
      }

      // Load or create config
      const config = loadHookConfig(repo.workDir) || { hooks: {}, staged: {}, enabled: true };
      
      // Add or append command
      const existing = config.hooks?.[hookType];
      if (existing) {
        if (typeof existing === 'string') {
          config.hooks![hookType] = [existing, command];
        } else if (Array.isArray(existing)) {
          existing.push(command);
        }
      } else {
        config.hooks = config.hooks || {};
        config.hooks[hookType] = command;
      }
      
      saveHookConfig(repo.workDir, config);
      console.log(colors.green('✓') + ` Added command to ${hookType} hook`);
      console.log(colors.dim('  Run "wit hooks sync" to apply changes'));
      break;
    }

    case 'install': {
      const hookType = args[1] as HookType;
      
      if (!hookType) {
        console.error(colors.red('error: ') + 'Please specify a hook type');
        console.error('\nAvailable hooks:');
        console.error('  pre-commit, post-commit, pre-push, post-merge');
        console.error('  pre-rebase, commit-msg, post-checkout, prepare-commit-msg');
        process.exit(1);
      }

      if (!HOOK_TEMPLATES[hookType]) {
        console.error(colors.red('error: ') + `Unknown hook type: ${hookType}`);
        process.exit(1);
      }

      hookManager.installHook(hookType);
      console.log(colors.green('✓') + ` Installed ${hookType} hook`);
      console.log(colors.dim(`  Edit: ${hookManager.getHookPath(hookType)}`));
      break;
    }

    case 'remove': {
      const hookType = args[1] as HookType;
      
      if (!hookType) {
        console.error(colors.red('error: ') + 'Please specify a hook type');
        process.exit(1);
      }

      if (hookManager.removeHook(hookType)) {
        console.log(colors.green('✓') + ` Removed ${hookType} hook`);
      } else {
        console.log(colors.yellow('!') + ` No ${hookType} hook installed`);
      }
      break;
    }

    case 'show': {
      const hookType = args[1] as HookType;
      
      if (!hookType) {
        console.error(colors.red('error: ') + 'Please specify a hook type');
        process.exit(1);
      }

      const content = hookManager.readHook(hookType);
      if (content) {
        console.log(colors.bold(`${hookType} hook:\n`));
        console.log(content);
      } else {
        console.log(colors.yellow('!') + ` No ${hookType} hook installed`);
      }
      break;
    }

    case 'template': {
      const hookType = args[1] as HookType;
      
      if (!hookType) {
        console.error(colors.red('error: ') + 'Please specify a hook type');
        console.error('\nAvailable hooks:');
        Object.keys(HOOK_TEMPLATES).forEach(h => console.error(`  ${h}`));
        process.exit(1);
      }

      const template = hookManager.getTemplate(hookType);
      if (template) {
        console.log(template);
      } else {
        console.error(colors.red('error: ') + `Unknown hook type: ${hookType}`);
        process.exit(1);
      }
      break;
    }

    case 'run': {
      const hookType = args[1] as HookType;
      
      if (!hookType) {
        console.error(colors.red('error: ') + 'Please specify a hook type');
        process.exit(1);
      }

      if (!hookManager.hookExists(hookType)) {
        console.error(colors.red('error: ') + `No ${hookType} hook installed`);
        process.exit(1);
      }

      hookManager.runHook(hookType, { args: args.slice(2) }).then(result => {
        if (result.stdout) console.log(result.stdout);
        if (result.stderr) console.error(result.stderr);
        
        if (result.success) {
          console.log(colors.green('✓') + ` Hook ${hookType} passed (${result.duration}ms)`);
        } else {
          console.log(colors.red('✗') + ` Hook ${hookType} failed with exit code ${result.exitCode}`);
          process.exit(result.exitCode);
        }
      }).catch(err => {
        console.error(colors.red('error: ') + err.message);
        process.exit(1);
      });
      break;
    }

    case 'init': {
      hookManager.init();
      console.log(colors.green('✓') + ' Initialized hooks directory');
      console.log(colors.dim(`  Sample hooks created in ${repo.gitDir}/hooks/`));
      break;
    }

    default:
      console.error(colors.red('error: ') + `Unknown subcommand: ${subcommand}`);
      console.error('\n' + colors.bold('Usage:'));
      console.error('  wit hooks                       List installed hooks');
      console.error('  wit hooks setup [--sample]      Set up hooks for project (like husky install)');
      console.error('  wit hooks add <type> <cmd>      Add a hook command to config');
      console.error('  wit hooks sync                  Sync hooks from config');
      console.error('  wit hooks install <type>        Install a hook from template');
      console.error('  wit hooks remove <type>         Remove a hook');
      console.error('  wit hooks show <type>           Show hook content');
      console.error('  wit hooks run <type> [args...]  Run a hook manually');
      console.error('\n' + colors.bold('Examples:'));
      console.error('  wit hooks setup --sample        # Create sample hooks config');
      console.error('  wit hooks add pre-commit "npm run lint"');
      console.error('  wit hooks sync                  # Apply config to hooks');
      process.exit(1);
  }
}
