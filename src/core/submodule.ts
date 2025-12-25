/**
 * Submodule System
 * 
 * Provides Git-like submodule support for nested repositories.
 * 
 * Commands:
 * - wit submodule add <url> <path>   Add a submodule
 * - wit submodule init               Initialize submodules
 * - wit submodule update             Update submodules to recorded commits
 * - wit submodule status             Show submodule status
 * - wit submodule foreach <cmd>      Run command in each submodule
 * - wit submodule sync               Sync submodule URLs
 * - wit submodule deinit <path>      Deinitialize a submodule
 * 
 * Submodule configuration is stored in:
 * - .witmodules (or .gitmodules)
 * - .wit/config
 */

import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { exists, readFile, writeFile, mkdirp, readFileText, readDir, isDirectory } from '../utils/fs';
import { TsgitError, ErrorCode } from './errors';
import { FileMode } from './types';

/**
 * Submodule entry in .witmodules
 */
export interface SubmoduleConfig {
  name: string;
  path: string;
  url: string;
  branch?: string;
  update?: 'checkout' | 'rebase' | 'merge' | 'none';
  shallow?: boolean;
}

/**
 * Submodule status
 */
export interface SubmoduleStatus {
  name: string;
  path: string;
  commit: string | null;
  expectedCommit: string | null;
  initialized: boolean;
  hasChanges: boolean;
  isDetached: boolean;
  branch?: string;
  ahead?: number;
  behind?: number;
}

/**
 * Parsed .witmodules file
 */
interface ModulesFile {
  submodules: Map<string, SubmoduleConfig>;
}

/**
 * Submodule Manager
 */
export class SubmoduleManager {
  private modulesPath: string;
  private gitmodulesPath: string;
  private configPath: string;
  private modulesDir: string;

  constructor(private gitDir: string, private workDir: string) {
    this.modulesPath = path.join(workDir, '.witmodules');
    this.gitmodulesPath = path.join(workDir, '.gitmodules');
    this.configPath = path.join(gitDir, 'config');
    this.modulesDir = path.join(gitDir, 'modules');
  }

  /**
   * Parse .witmodules or .gitmodules file
   */
  private parseModulesFile(): ModulesFile {
    const submodules = new Map<string, SubmoduleConfig>();
    
    // Try .witmodules first, then .gitmodules
    const filePath = exists(this.modulesPath) 
      ? this.modulesPath 
      : (exists(this.gitmodulesPath) ? this.gitmodulesPath : null);
    
    if (!filePath) {
      return { submodules };
    }

    const content = readFileText(filePath);
    const lines = content.split('\n');
    
    let currentSubmodule: Partial<SubmoduleConfig> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Section header: [submodule "name"]
      const sectionMatch = trimmed.match(/^\[submodule\s+"(.+)"\]$/);
      if (sectionMatch) {
        if (currentSubmodule && currentSubmodule.name) {
          submodules.set(currentSubmodule.name, currentSubmodule as SubmoduleConfig);
        }
        currentSubmodule = { name: sectionMatch[1] };
        continue;
      }

      // Key-value pair
      const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
      if (kvMatch && currentSubmodule) {
        const key = kvMatch[1].toLowerCase();
        const value = kvMatch[2].trim();
        
        switch (key) {
          case 'path':
            currentSubmodule.path = value;
            break;
          case 'url':
            currentSubmodule.url = value;
            break;
          case 'branch':
            currentSubmodule.branch = value;
            break;
          case 'update':
            currentSubmodule.update = value as SubmoduleConfig['update'];
            break;
          case 'shallow':
            currentSubmodule.shallow = value === 'true';
            break;
        }
      }
    }

    // Add last submodule
    if (currentSubmodule && currentSubmodule.name) {
      submodules.set(currentSubmodule.name, currentSubmodule as SubmoduleConfig);
    }

    return { submodules };
  }

  /**
   * Write .witmodules file
   */
  private writeModulesFile(modules: ModulesFile): void {
    let content = '';
    
    for (const [name, config] of modules.submodules) {
      content += `[submodule "${name}"]\n`;
      content += `\tpath = ${config.path}\n`;
      content += `\turl = ${config.url}\n`;
      
      if (config.branch) {
        content += `\tbranch = ${config.branch}\n`;
      }
      if (config.update) {
        content += `\tupdate = ${config.update}\n`;
      }
      if (config.shallow !== undefined) {
        content += `\tshallow = ${config.shallow}\n`;
      }
      content += '\n';
    }

    writeFile(this.modulesPath, content);
  }

  /**
   * Get the recorded commit for a submodule from the index/tree
   */
  private getRecordedCommit(submodulePath: string): string | null {
    // Read from index or current tree
    const indexPath = path.join(this.gitDir, 'index');
    
    if (!exists(indexPath)) {
      return null;
    }

    try {
      const indexContent = readFileText(indexPath);
      const index = JSON.parse(indexContent);
      
      for (const entry of index.entries || []) {
        if (entry.path === submodulePath && entry.mode === FileMode.SUBMODULE) {
          return entry.hash;
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Get current commit of a submodule directory
   */
  private getSubmoduleCommit(submodulePath: string): string | null {
    const fullPath = path.join(this.workDir, submodulePath);
    const headPath = path.join(fullPath, '.wit', 'HEAD');
    const gitHeadPath = path.join(fullPath, '.git', 'HEAD');
    
    // Check for wit repo
    if (exists(headPath)) {
      const head = readFileText(headPath).trim();
      if (head.startsWith('ref: ')) {
        // Symbolic ref
        const refPath = path.join(fullPath, '.wit', head.slice(5));
        if (exists(refPath)) {
          return readFileText(refPath).trim();
        }
      }
      return head;
    }
    
    // Check for git repo
    if (exists(gitHeadPath)) {
      const head = readFileText(gitHeadPath).trim();
      if (head.startsWith('ref: ')) {
        const refPath = path.join(fullPath, '.git', head.slice(5));
        if (exists(refPath)) {
          return readFileText(refPath).trim();
        }
      }
      return head;
    }

    return null;
  }

  /**
   * Check if submodule is initialized
   */
  private isInitialized(config: SubmoduleConfig): boolean {
    const moduleDir = path.join(this.modulesDir, config.name);
    const submoduleGitDir = path.join(this.workDir, config.path, '.wit');
    const submoduleGitDir2 = path.join(this.workDir, config.path, '.git');
    
    return exists(moduleDir) || exists(submoduleGitDir) || exists(submoduleGitDir2);
  }

  /**
   * List all submodules
   */
  list(): SubmoduleConfig[] {
    const modules = this.parseModulesFile();
    return Array.from(modules.submodules.values());
  }

  /**
   * Get submodule status
   */
  status(): SubmoduleStatus[] {
    const modules = this.parseModulesFile();
    const results: SubmoduleStatus[] = [];

    for (const [name, config] of modules.submodules) {
      const currentCommit = this.getSubmoduleCommit(config.path);
      const expectedCommit = this.getRecordedCommit(config.path);
      const initialized = this.isInitialized(config);
      
      // Check for changes
      let hasChanges = false;
      let isDetached = true;
      let branch: string | undefined;

      if (initialized && currentCommit) {
        const fullPath = path.join(this.workDir, config.path);
        
        // Check if on a branch
        const headPath = path.join(fullPath, '.wit', 'HEAD');
        const gitHeadPath = path.join(fullPath, '.git', 'HEAD');
        
        const actualHeadPath = exists(headPath) ? headPath : (exists(gitHeadPath) ? gitHeadPath : null);
        
        if (actualHeadPath) {
          const head = readFileText(actualHeadPath).trim();
          if (head.startsWith('ref: ')) {
            isDetached = false;
            branch = head.replace(/^ref: refs\/heads\//, '');
          }
        }

        // Simple check for modified files
        // In a full implementation, we'd check the submodule's status
        hasChanges = false;
      }

      results.push({
        name,
        path: config.path,
        commit: currentCommit,
        expectedCommit,
        initialized,
        hasChanges,
        isDetached,
        branch,
      });
    }

    return results;
  }

  /**
   * Add a submodule
   */
  async add(url: string, targetPath: string, options: { branch?: string; name?: string } = {}): Promise<SubmoduleConfig> {
    const fullPath = path.join(this.workDir, targetPath);
    
    // Check if path already exists
    if (exists(fullPath)) {
      throw new TsgitError(
        `Path '${targetPath}' already exists`,
        ErrorCode.OPERATION_FAILED,
        ['Choose a different path or remove the existing directory']
      );
    }

    // Check if already a submodule
    const modules = this.parseModulesFile();
    const name = options.name || path.basename(targetPath);
    
    if (modules.submodules.has(name)) {
      throw new TsgitError(
        `Submodule '${name}' already exists`,
        ErrorCode.OPERATION_FAILED,
        ['Use a different name or remove the existing submodule']
      );
    }

    // Clone the repository
    mkdirp(path.dirname(fullPath));
    
    const cloneArgs = ['clone'];
    if (options.branch) {
      cloneArgs.push('-b', options.branch);
    }
    cloneArgs.push(url, fullPath);

    await this.runGitCommand(cloneArgs, this.workDir);

    // Create submodule config
    const config: SubmoduleConfig = {
      name,
      path: targetPath,
      url,
      branch: options.branch,
    };

    // Add to .witmodules
    modules.submodules.set(name, config);
    this.writeModulesFile(modules);

    // Set up gitlink in modules directory
    mkdirp(this.modulesDir);
    const moduleDir = path.join(this.modulesDir, name);
    
    // Move .git directory to modules
    const submoduleGitDir = path.join(fullPath, '.git');
    if (exists(submoduleGitDir)) {
      // Move the .git directory
      fs.renameSync(submoduleGitDir, moduleDir);
      
      // Create gitlink file
      writeFile(submoduleGitDir, `gitdir: ${path.relative(fullPath, moduleDir)}\n`);
    }

    return config;
  }

  /**
   * Initialize submodules (copy URL to local config)
   */
  init(submodulePaths?: string[]): SubmoduleConfig[] {
    const modules = this.parseModulesFile();
    const initialized: SubmoduleConfig[] = [];

    for (const [name, config] of modules.submodules) {
      // Filter by paths if provided
      if (submodulePaths && submodulePaths.length > 0) {
        if (!submodulePaths.includes(config.path) && !submodulePaths.includes(name)) {
          continue;
        }
      }

      // Mark as initialized by creating module directory
      const moduleDir = path.join(this.modulesDir, name);
      if (!exists(moduleDir)) {
        mkdirp(moduleDir);
        writeFile(path.join(moduleDir, 'config'), `[core]\n\trepositoryformatversion = 0\n`);
      }

      initialized.push(config);
    }

    return initialized;
  }

  /**
   * Update submodules to their recorded commits
   */
  async update(options: { 
    init?: boolean; 
    recursive?: boolean; 
    remote?: boolean;
    submodulePaths?: string[];
  } = {}): Promise<{ updated: SubmoduleConfig[]; errors: Array<{ config: SubmoduleConfig; error: string }> }> {
    // Initialize first if requested
    if (options.init) {
      this.init(options.submodulePaths);
    }

    const modules = this.parseModulesFile();
    const updated: SubmoduleConfig[] = [];
    const errors: Array<{ config: SubmoduleConfig; error: string }> = [];

    for (const [name, config] of modules.submodules) {
      // Filter by paths if provided
      if (options.submodulePaths && options.submodulePaths.length > 0) {
        if (!options.submodulePaths.includes(config.path) && !options.submodulePaths.includes(name)) {
          continue;
        }
      }

      try {
        const fullPath = path.join(this.workDir, config.path);
        
        // Clone if not present
        if (!exists(fullPath) || !exists(path.join(fullPath, '.git'))) {
          const cloneArgs = ['clone'];
          if (config.branch) {
            cloneArgs.push('-b', config.branch);
          }
          cloneArgs.push(config.url, fullPath);
          
          await this.runGitCommand(cloneArgs, this.workDir);
        }

        // Get expected commit
        const expectedCommit = this.getRecordedCommit(config.path);
        
        if (expectedCommit && !options.remote) {
          // Checkout the recorded commit
          await this.runGitCommand(['checkout', expectedCommit], fullPath);
        } else if (options.remote) {
          // Update to latest from remote
          await this.runGitCommand(['fetch'], fullPath);
          const branch = config.branch || 'main';
          await this.runGitCommand(['checkout', `origin/${branch}`], fullPath);
        }

        // Recursive update
        if (options.recursive) {
          const subManager = new SubmoduleManager(
            path.join(fullPath, '.wit'),
            fullPath
          );
          await subManager.update({ ...options, submodulePaths: undefined });
        }

        updated.push(config);
      } catch (error) {
        errors.push({
          config,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { updated, errors };
  }

  /**
   * Deinitialize a submodule
   */
  deinit(targetPath: string, options: { force?: boolean } = {}): void {
    const modules = this.parseModulesFile();
    
    // Find the submodule
    let foundConfig: SubmoduleConfig | null = null;
    for (const [name, config] of modules.submodules) {
      if (config.path === targetPath || name === targetPath) {
        foundConfig = config;
        break;
      }
    }

    if (!foundConfig) {
      throw new TsgitError(
        `No submodule at path '${targetPath}'`,
        ErrorCode.OPERATION_FAILED,
        ['wit submodule status    # List submodules']
      );
    }

    const fullPath = path.join(this.workDir, foundConfig.path);
    
    // Check for local changes
    if (!options.force) {
      const currentCommit = this.getSubmoduleCommit(foundConfig.path);
      const expectedCommit = this.getRecordedCommit(foundConfig.path);
      
      if (currentCommit && expectedCommit && currentCommit !== expectedCommit) {
        throw new TsgitError(
          `Submodule '${foundConfig.name}' has local modifications`,
          ErrorCode.UNCOMMITTED_CHANGES,
          [
            'Commit or stash your changes first',
            'Use --force to deinitialize anyway'
          ]
        );
      }
    }

    // Remove the working directory contents (but keep .git)
    if (exists(fullPath)) {
      const entries = readDir(fullPath);
      for (const entry of entries) {
        if (entry !== '.git' && entry !== '.wit') {
          const entryPath = path.join(fullPath, entry);
          fs.rmSync(entryPath, { recursive: true, force: true });
        }
      }
    }

    // Remove from modules directory
    const moduleDir = path.join(this.modulesDir, foundConfig.name);
    if (exists(moduleDir)) {
      fs.rmSync(moduleDir, { recursive: true, force: true });
    }
  }

  /**
   * Remove a submodule completely
   */
  remove(targetPath: string): void {
    const modules = this.parseModulesFile();
    
    // Find and remove the submodule
    let foundName: string | null = null;
    for (const [name, config] of modules.submodules) {
      if (config.path === targetPath || name === targetPath) {
        foundName = name;
        break;
      }
    }

    if (!foundName) {
      throw new TsgitError(
        `No submodule at path '${targetPath}'`,
        ErrorCode.OPERATION_FAILED
      );
    }

    const config = modules.submodules.get(foundName)!;

    // Remove working directory
    const fullPath = path.join(this.workDir, config.path);
    if (exists(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }

    // Remove from modules directory
    const moduleDir = path.join(this.modulesDir, foundName);
    if (exists(moduleDir)) {
      fs.rmSync(moduleDir, { recursive: true, force: true });
    }

    // Remove from .witmodules
    modules.submodules.delete(foundName);
    this.writeModulesFile(modules);
  }

  /**
   * Run command in each submodule
   */
  async foreach(command: string, options: { recursive?: boolean } = {}): Promise<Map<string, { success: boolean; output: string }>> {
    const modules = this.parseModulesFile();
    const results = new Map<string, { success: boolean; output: string }>();

    for (const [name, config] of modules.submodules) {
      const fullPath = path.join(this.workDir, config.path);
      
      if (!exists(fullPath)) {
        results.set(name, { success: false, output: 'Submodule not checked out' });
        continue;
      }

      try {
        const output = await this.runCommand(command, fullPath, {
          WIT_SUBMODULE_NAME: name,
          WIT_SUBMODULE_PATH: config.path,
        });
        
        results.set(name, { success: true, output });

        // Recursive
        if (options.recursive) {
          const subManager = new SubmoduleManager(
            path.join(fullPath, '.wit'),
            fullPath
          );
          const subResults = await subManager.foreach(command, options);
          for (const [subName, result] of subResults) {
            results.set(`${name}/${subName}`, result);
          }
        }
      } catch (error) {
        results.set(name, { 
          success: false, 
          output: error instanceof Error ? error.message : String(error) 
        });
      }
    }

    return results;
  }

  /**
   * Sync submodule URLs from .witmodules to .wit/config
   */
  sync(submodulePaths?: string[]): SubmoduleConfig[] {
    const modules = this.parseModulesFile();
    const synced: SubmoduleConfig[] = [];

    for (const [name, config] of modules.submodules) {
      if (submodulePaths && !submodulePaths.includes(config.path) && !submodulePaths.includes(name)) {
        continue;
      }

      // Update remote URL in submodule
      const fullPath = path.join(this.workDir, config.path);
      const configFile = path.join(fullPath, '.git', 'config');
      
      if (exists(configFile)) {
        let content = readFileText(configFile);
        // Simple URL replacement - in production, use a proper config parser
        content = content.replace(
          /(\[remote "origin"\][^\[]*url\s*=\s*).+/,
          `$1${config.url}`
        );
        writeFile(configFile, content);
      }

      synced.push(config);
    }

    return synced;
  }

  /**
   * Run a git command
   */
  private runGitCommand(args: string[], cwd: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('git', args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(stderr || `Command failed with code ${code}`));
        }
      });

      child.on('error', (error: Error) => {
        reject(error);
      });
    });
  }

  /**
   * Run a shell command
   */
  private runCommand(command: string, cwd: string, env: Record<string, string> = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      const shell = process.platform === 'win32' ? 'cmd' : '/bin/sh';
      const shellArg = process.platform === 'win32' ? '/c' : '-c';

      const child = spawn(shell, [shellArg, command], {
        cwd,
        env: { ...process.env, ...env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve(stdout + stderr);
        } else {
          reject(new Error(stderr || stdout || `Command failed with code ${code}`));
        }
      });

      child.on('error', (error: Error) => {
        reject(error);
      });
    });
  }
}

/**
 * Colors for CLI output
 */
const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

/**
 * CLI handler for submodule command
 */
export async function handleSubmodule(args: string[]): Promise<void> {
  // Import Repository here to avoid circular dependency
  const { Repository } = require('./repository');
  
  const repo = Repository.find();
  const submoduleManager = new SubmoduleManager(repo.gitDir, repo.workDir);
  
  const subcommand = args[0];

  try {
    switch (subcommand) {
      case 'status':
      case undefined: {
        const statuses = submoduleManager.status();
        
        if (statuses.length === 0) {
          console.log(colors.dim('No submodules configured'));
          console.log(colors.dim('Use "wit submodule add <url> <path>" to add a submodule'));
          return;
        }

        for (const status of statuses) {
          let prefix = ' ';
          let color = (s: string) => s;
          
          if (!status.initialized) {
            prefix = '-';
            color = colors.red;
          } else if (status.commit !== status.expectedCommit) {
            prefix = '+';
            color = colors.yellow;
          } else if (status.hasChanges) {
            prefix = 'M';
            color = colors.yellow;
          }

          const commit = status.commit ? status.commit.slice(0, 7) : '(none)';
          const branchInfo = status.branch ? ` (${status.branch})` : (status.isDetached ? ' (detached)' : '');
          
          console.log(`${color(prefix)} ${commit} ${status.path}${colors.dim(branchInfo)}`);
        }
        break;
      }

      case 'add': {
        const url = args[1];
        const targetPath = args[2];
        
        if (!url || !targetPath) {
          console.error(colors.red('error: ') + 'Missing required arguments');
          console.error('\nUsage: wit submodule add <url> <path> [--branch <branch>]');
          process.exit(1);
        }

        // Parse options
        const options: { branch?: string; name?: string } = {};
        for (let i = 3; i < args.length; i++) {
          if (args[i] === '--branch' || args[i] === '-b') {
            options.branch = args[++i];
          } else if (args[i] === '--name') {
            options.name = args[++i];
          }
        }

        console.log(`Cloning into '${targetPath}'...`);
        const config = await submoduleManager.add(url, targetPath, options);
        console.log(colors.green('✓') + ` Added submodule '${config.name}'`);
        break;
      }

      case 'init': {
        const paths = args.slice(1).filter(a => !a.startsWith('-'));
        const initialized = submoduleManager.init(paths.length > 0 ? paths : undefined);
        
        if (initialized.length === 0) {
          console.log(colors.dim('No submodules to initialize'));
        } else {
          for (const config of initialized) {
            console.log(colors.green('✓') + ` Initialized submodule '${config.name}'`);
          }
        }
        break;
      }

      case 'update': {
        const options: { init?: boolean; recursive?: boolean; remote?: boolean; submodulePaths?: string[] } = {};
        const paths: string[] = [];
        
        for (let i = 1; i < args.length; i++) {
          if (args[i] === '--init') {
            options.init = true;
          } else if (args[i] === '--recursive') {
            options.recursive = true;
          } else if (args[i] === '--remote') {
            options.remote = true;
          } else if (!args[i].startsWith('-')) {
            paths.push(args[i]);
          }
        }
        
        if (paths.length > 0) {
          options.submodulePaths = paths;
        }

        console.log('Updating submodules...');
        const { updated, errors } = await submoduleManager.update(options);
        
        for (const config of updated) {
          console.log(colors.green('✓') + ` Updated '${config.path}'`);
        }
        
        for (const { config, error } of errors) {
          console.log(colors.red('✗') + ` Failed to update '${config.path}': ${error}`);
        }
        break;
      }

      case 'deinit': {
        const targetPath = args[1];
        const force = args.includes('--force') || args.includes('-f');
        
        if (!targetPath) {
          console.error(colors.red('error: ') + 'Please specify a submodule path');
          process.exit(1);
        }

        submoduleManager.deinit(targetPath, { force });
        console.log(colors.green('✓') + ` Deinitialized submodule at '${targetPath}'`);
        break;
      }

      case 'foreach': {
        const command = args.slice(1).join(' ');
        const recursive = args.includes('--recursive');
        
        if (!command || command === '--recursive') {
          console.error(colors.red('error: ') + 'Please specify a command');
          console.error('\nUsage: wit submodule foreach [--recursive] <command>');
          process.exit(1);
        }

        const results = await submoduleManager.foreach(
          command.replace('--recursive', '').trim(),
          { recursive }
        );
        
        for (const [name, result] of results) {
          console.log(colors.bold(`\nEntering '${name}'`));
          if (result.success) {
            console.log(result.output);
          } else {
            console.log(colors.red(result.output));
          }
        }
        break;
      }

      case 'sync': {
        const paths = args.slice(1).filter(a => !a.startsWith('-'));
        const synced = submoduleManager.sync(paths.length > 0 ? paths : undefined);
        
        for (const config of synced) {
          console.log(colors.green('✓') + ` Synchronized '${config.name}'`);
        }
        break;
      }

      default:
        console.error(colors.red('error: ') + `Unknown subcommand: ${subcommand}`);
        console.error('\nUsage:');
        console.error('  wit submodule                     Show status');
        console.error('  wit submodule add <url> <path>    Add a submodule');
        console.error('  wit submodule init [<path>...]    Initialize submodules');
        console.error('  wit submodule update [--init]     Update submodules');
        console.error('  wit submodule deinit <path>       Deinitialize a submodule');
        console.error('  wit submodule foreach <cmd>       Run command in each');
        console.error('  wit submodule sync                Sync URLs');
        process.exit(1);
    }
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(colors.red('error: ') + error.message);
    }
    process.exit(1);
  }
}
