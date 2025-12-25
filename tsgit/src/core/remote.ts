/**
 * Remote Management
 * Handles remote repository configuration and tracking
 */

import * as path from 'path';
import { exists, readFileText, writeFile, mkdirp, readDir, isDirectory, deleteFile } from '../utils/fs';
import { TsgitError, ErrorCode } from './errors';

/**
 * Remote configuration
 */
export interface RemoteConfig {
  name: string;
  url: string;
  pushUrl?: string;
  fetch: string;  // Refspec for fetching
}

/**
 * Remote tracking branch info
 */
export interface RemoteTrackingBranch {
  remote: string;
  branch: string;
  localRef: string;
  hash: string;
}

/**
 * Branch tracking configuration
 */
export interface BranchTrackingConfig {
  remote: string;
  merge: string;  // e.g., refs/heads/main
}

/**
 * Remote Manager - handles remote configuration
 */
export class RemoteManager {
  private remotesDir: string;
  private configPath: string;

  constructor(private gitDir: string) {
    this.remotesDir = path.join(gitDir, 'refs', 'remotes');
    this.configPath = path.join(gitDir, 'config');
  }

  /**
   * Initialize remotes directory
   */
  init(): void {
    mkdirp(this.remotesDir);
  }

  /**
   * Add a new remote
   */
  add(name: string, url: string, options: { fetch?: string } = {}): void {
    // Validate remote name
    if (!this.isValidRemoteName(name)) {
      throw new TsgitError(
        `'${name}' is not a valid remote name`,
        ErrorCode.INVALID_ARGUMENT,
        ['Remote names should contain only alphanumeric characters, hyphens, and underscores']
      );
    }

    // Check if remote already exists
    if (this.exists(name)) {
      throw new TsgitError(
        `remote ${name} already exists`,
        ErrorCode.OPERATION_FAILED,
        [
          `tsgit remote set-url ${name} ${url}    # Update existing remote URL`,
          `tsgit remote remove ${name}            # Remove and re-add`,
        ]
      );
    }

    // Create remote directory
    const remoteDir = path.join(this.remotesDir, name);
    mkdirp(remoteDir);

    // Write remote config to config file
    const config = this.readConfig();
    const refspec = options.fetch || `+refs/heads/*:refs/remotes/${name}/*`;
    
    config[`remote "${name}"`] = {
      url,
      fetch: refspec,
    };

    this.writeConfig(config);
  }

  /**
   * Remove a remote
   */
  remove(name: string): void {
    if (!this.exists(name)) {
      throw new TsgitError(
        `No such remote: '${name}'`,
        ErrorCode.REF_NOT_FOUND,
        this.getSuggestions(name)
      );
    }

    // Remove from config
    const config = this.readConfig();
    delete config[`remote "${name}"`];
    this.writeConfig(config);

    // Remove remote refs directory
    const remoteDir = path.join(this.remotesDir, name);
    if (exists(remoteDir)) {
      this.removeDir(remoteDir);
    }

    // Remove branch tracking configs for this remote
    for (const key of Object.keys(config)) {
      if (key.startsWith('branch "')) {
        const branchConfig = config[key] as Record<string, string>;
        if (branchConfig.remote === name) {
          delete config[key];
        }
      }
    }
    this.writeConfig(config);
  }

  /**
   * Rename a remote
   */
  rename(oldName: string, newName: string): void {
    if (!this.exists(oldName)) {
      throw new TsgitError(
        `No such remote: '${oldName}'`,
        ErrorCode.REF_NOT_FOUND,
        this.getSuggestions(oldName)
      );
    }

    if (this.exists(newName)) {
      throw new TsgitError(
        `remote ${newName} already exists`,
        ErrorCode.OPERATION_FAILED
      );
    }

    if (!this.isValidRemoteName(newName)) {
      throw new TsgitError(
        `'${newName}' is not a valid remote name`,
        ErrorCode.INVALID_ARGUMENT
      );
    }

    const config = this.readConfig();
    
    // Get old remote config
    const oldKey = `remote "${oldName}"`;
    const remoteConfig = config[oldKey] as Record<string, string>;
    
    if (!remoteConfig) {
      throw new TsgitError(
        `Could not find remote config for '${oldName}'`,
        ErrorCode.OPERATION_FAILED
      );
    }

    // Update fetch refspec
    const newRefspec = remoteConfig.fetch?.replace(
      new RegExp(`refs/remotes/${oldName}/`, 'g'),
      `refs/remotes/${newName}/`
    );

    // Create new remote config
    config[`remote "${newName}"`] = {
      ...remoteConfig,
      fetch: newRefspec,
    };
    delete config[oldKey];

    // Update branch tracking configs
    for (const key of Object.keys(config)) {
      if (key.startsWith('branch "')) {
        const branchConfig = config[key] as Record<string, string>;
        if (branchConfig.remote === oldName) {
          branchConfig.remote = newName;
        }
      }
    }

    this.writeConfig(config);

    // Rename remote refs directory
    const oldDir = path.join(this.remotesDir, oldName);
    const newDir = path.join(this.remotesDir, newName);
    
    if (exists(oldDir)) {
      // Copy refs to new directory
      mkdirp(newDir);
      this.copyDir(oldDir, newDir);
      this.removeDir(oldDir);
    }
  }

  /**
   * Get URL for a remote
   */
  getUrl(name: string, push: boolean = false): string {
    if (!this.exists(name)) {
      throw new TsgitError(
        `No such remote '${name}'`,
        ErrorCode.REF_NOT_FOUND,
        this.getSuggestions(name)
      );
    }

    const config = this.readConfig();
    const remoteConfig = config[`remote "${name}"`] as Record<string, string>;

    if (push && remoteConfig.pushurl) {
      return remoteConfig.pushurl;
    }

    return remoteConfig.url;
  }

  /**
   * Set URL for a remote
   */
  setUrl(name: string, url: string, options: { push?: boolean } = {}): void {
    if (!this.exists(name)) {
      throw new TsgitError(
        `No such remote '${name}'`,
        ErrorCode.REF_NOT_FOUND,
        this.getSuggestions(name)
      );
    }

    const config = this.readConfig();
    const remoteConfig = config[`remote "${name}"`] as Record<string, string>;

    if (options.push) {
      remoteConfig.pushurl = url;
    } else {
      remoteConfig.url = url;
    }

    this.writeConfig(config);
  }

  /**
   * List all remotes
   */
  list(): RemoteConfig[] {
    const config = this.readConfig();
    const remotes: RemoteConfig[] = [];

    for (const key of Object.keys(config)) {
      const match = key.match(/^remote "(.+)"$/);
      if (match) {
        const name = match[1];
        const remoteConfig = config[key] as Record<string, string>;
        remotes.push({
          name,
          url: remoteConfig.url,
          pushUrl: remoteConfig.pushurl,
          fetch: remoteConfig.fetch,
        });
      }
    }

    return remotes;
  }

  /**
   * Get a specific remote
   */
  get(name: string): RemoteConfig | null {
    const remotes = this.list();
    return remotes.find(r => r.name === name) || null;
  }

  /**
   * Check if a remote exists
   */
  exists(name: string): boolean {
    const config = this.readConfig();
    return `remote "${name}"` in config;
  }

  /**
   * Get remote tracking branches
   */
  getTrackingBranches(remoteName?: string): RemoteTrackingBranch[] {
    const branches: RemoteTrackingBranch[] = [];

    if (!exists(this.remotesDir)) {
      return branches;
    }

    const remotes = remoteName ? [remoteName] : this.listRemoteDirs();

    for (const remote of remotes) {
      const remoteDir = path.join(this.remotesDir, remote);
      if (!exists(remoteDir) || !isDirectory(remoteDir)) continue;

      const refs = this.listRefsRecursive(remoteDir, '');
      for (const { name, hash } of refs) {
        branches.push({
          remote,
          branch: name,
          localRef: `refs/remotes/${remote}/${name}`,
          hash,
        });
      }
    }

    return branches;
  }

  /**
   * Update a remote tracking branch
   */
  updateTrackingBranch(remote: string, branch: string, hash: string): void {
    const refPath = path.join(this.remotesDir, remote, branch);
    mkdirp(path.dirname(refPath));
    writeFile(refPath, hash + '\n');
  }

  /**
   * Get tracking branch hash
   */
  getTrackingBranchHash(remote: string, branch: string): string | null {
    const refPath = path.join(this.remotesDir, remote, branch);
    if (!exists(refPath)) {
      return null;
    }
    return readFileText(refPath).trim();
  }

  /**
   * Delete a remote tracking branch
   */
  deleteTrackingBranch(remote: string, branch: string): void {
    const refPath = path.join(this.remotesDir, remote, branch);
    if (exists(refPath)) {
      deleteFile(refPath);
    }
  }

  /**
   * Set branch tracking configuration
   */
  setTrackingBranch(branch: string, remote: string, remoteBranch: string): void {
    const config = this.readConfig();
    config[`branch "${branch}"`] = {
      remote,
      merge: `refs/heads/${remoteBranch}`,
    };
    this.writeConfig(config);
  }

  /**
   * Get branch tracking configuration
   */
  getTrackingConfig(branch: string): BranchTrackingConfig | null {
    const config = this.readConfig();
    const branchConfig = config[`branch "${branch}"`] as Record<string, string> | undefined;
    
    if (!branchConfig || !branchConfig.remote || !branchConfig.merge) {
      return null;
    }

    return {
      remote: branchConfig.remote,
      merge: branchConfig.merge,
    };
  }

  /**
   * Get upstream branch name for a local branch
   */
  getUpstream(branch: string): { remote: string; branch: string } | null {
    const tracking = this.getTrackingConfig(branch);
    if (!tracking) {
      return null;
    }

    const remoteBranch = tracking.merge.replace('refs/heads/', '');
    return {
      remote: tracking.remote,
      branch: remoteBranch,
    };
  }

  /**
   * Read config file
   */
  private readConfig(): Record<string, Record<string, string> | string> {
    if (!exists(this.configPath)) {
      return {};
    }

    const content = readFileText(this.configPath);
    return this.parseConfig(content);
  }

  /**
   * Write config file
   */
  private writeConfig(config: Record<string, Record<string, string> | string>): void {
    const content = this.serializeConfig(config);
    writeFile(this.configPath, content);
  }

  /**
   * Parse Git-style config file
   */
  private parseConfig(content: string): Record<string, Record<string, string> | string> {
    const config: Record<string, Record<string, string>> = {};
    let currentSection = '';

    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
        continue;
      }

      // Section header
      const sectionMatch = trimmed.match(/^\[(.+)\]$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1];
        if (!config[currentSection]) {
          config[currentSection] = {};
        }
        continue;
      }

      // Key-value pair
      const kvMatch = trimmed.match(/^(\S+)\s*=\s*(.*)$/);
      if (kvMatch && currentSection) {
        const [, key, value] = kvMatch;
        (config[currentSection] as Record<string, string>)[key.trim()] = value.trim();
      }
    }

    return config;
  }

  /**
   * Serialize config to Git-style format
   */
  private serializeConfig(config: Record<string, Record<string, string> | string>): string {
    const lines: string[] = [];

    for (const [section, values] of Object.entries(config)) {
      if (typeof values === 'string') {
        continue;
      }

      lines.push(`[${section}]`);
      for (const [key, value] of Object.entries(values)) {
        lines.push(`\t${key} = ${value}`);
      }
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Validate remote name
   */
  private isValidRemoteName(name: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(name);
  }

  /**
   * List remote directories
   */
  private listRemoteDirs(): string[] {
    if (!exists(this.remotesDir)) {
      return [];
    }
    return readDir(this.remotesDir).filter(name => 
      isDirectory(path.join(this.remotesDir, name))
    );
  }

  /**
   * List refs recursively
   */
  private listRefsRecursive(dir: string, prefix: string): { name: string; hash: string }[] {
    const refs: { name: string; hash: string }[] = [];
    const entries = readDir(dir);

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const refName = prefix ? `${prefix}/${entry}` : entry;

      if (isDirectory(fullPath)) {
        refs.push(...this.listRefsRecursive(fullPath, refName));
      } else {
        const hash = readFileText(fullPath).trim();
        refs.push({ name: refName, hash });
      }
    }

    return refs;
  }

  /**
   * Get suggestions for similar remote names
   */
  private getSuggestions(name: string): string[] {
    const remotes = this.list().map(r => r.name);
    const suggestions: string[] = [];

    for (const remote of remotes) {
      if (remote.toLowerCase().includes(name.toLowerCase()) ||
          name.toLowerCase().includes(remote.toLowerCase())) {
        suggestions.push(`tsgit remote -v    # List all remotes`);
        break;
      }
    }

    if (remotes.length > 0) {
      suggestions.push(`Available remotes: ${remotes.join(', ')}`);
    } else {
      suggestions.push(`tsgit remote add <name> <url>    # Add a remote`);
    }

    return suggestions;
  }

  /**
   * Remove directory recursively
   */
  private removeDir(dir: string): void {
    const fs = require('fs');
    if (exists(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  /**
   * Copy directory recursively
   */
  private copyDir(src: string, dest: string): void {
    const fs = require('fs');
    mkdirp(dest);
    
    const entries = readDir(src);
    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);
      
      if (isDirectory(srcPath)) {
        this.copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}
