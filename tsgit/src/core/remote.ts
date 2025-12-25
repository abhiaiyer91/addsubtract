/**
 * Remote Management
 * Handles remote repository configuration and tracking
 */

import * as path from 'path';
import { exists, readFileText, writeFile, mkdirp, readDir, isDirectory, deleteFile } from '../utils/fs';
import { TsgitError, ErrorCode } from './errors';

/**
 * Remote repository configuration
 */
export interface Remote {
  name: string;
  url: string;
  fetch: string; // Refspec for fetching
  push?: string; // Refspec for pushing
  pushUrl?: string; // Push URL if different from fetch URL
}

/**
 * Alias for Remote for backwards compatibility
 */
export type RemoteConfig = Remote;

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
 * Parse INI-style config file
 */
function parseConfig(content: string): Map<string, Map<string, string>> {
  const sections = new Map<string, Map<string, string>>();
  let currentSection = '';

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue;
    }

    // Section header: [section] or [section "subsection"]
    const sectionMatch = trimmed.match(/^\[([^\s\]]+)(?:\s+"([^"]+)")?\]$/);
    if (sectionMatch) {
      const sectionName = sectionMatch[1];
      const subsection = sectionMatch[2];
      currentSection = subsection ? `${sectionName}.${subsection}` : sectionName;
      if (!sections.has(currentSection)) {
        sections.set(currentSection, new Map());
      }
      continue;
    }

    // Key-value pair
    const kvMatch = trimmed.match(/^([^=]+?)\s*=\s*(.*)$/);
    if (kvMatch && currentSection) {
      const key = kvMatch[1].trim();
      const value = kvMatch[2].trim();
      const section = sections.get(currentSection) || new Map();
      section.set(key, value);
      sections.set(currentSection, section);
    }
  }

  return sections;
}

/**
 * Serialize sections back to INI format
 */
function serializeConfig(sections: Map<string, Map<string, string>>): string {
  const lines: string[] = [];

  // Group sections by type for better organization
  const sortedSections = Array.from(sections.keys()).sort();

  for (const sectionKey of sortedSections) {
    const values = sections.get(sectionKey)!;
    if (values.size === 0) continue;

    // Parse section key: "type.name" or just "type"
    const dotIndex = sectionKey.indexOf('.');
    if (dotIndex !== -1) {
      const type = sectionKey.slice(0, dotIndex);
      const name = sectionKey.slice(dotIndex + 1);
      lines.push(`[${type} "${name}"]`);
    } else {
      lines.push(`[${sectionKey}]`);
    }

    for (const [key, value] of values) {
      lines.push(`\t${key} = ${value}`);
    }

    lines.push(''); // Empty line between sections
  }

  return lines.join('\n');
}

/**
 * RemoteManager handles remote repository configuration
 * 
 * Stores configuration in .tsgit/config using Git-compatible INI format
 */
export class RemoteManager {
  private configPath: string;
  private remotesDir: string;

  constructor(private gitDir: string) {
    this.configPath = path.join(gitDir, 'config');
    this.remotesDir = path.join(gitDir, 'refs', 'remotes');
  }

  /**
   * Initialize remote infrastructure
   */
  init(): void {
    mkdirp(this.remotesDir);
  }

  /**
   * Load config sections from disk
   */
  private loadConfig(): Map<string, Map<string, string>> {
    if (!exists(this.configPath)) {
      return new Map();
    }

    const content = readFileText(this.configPath);
    return parseConfig(content);
  }

  /**
   * Save config sections to disk
   */
  private saveConfig(sections: Map<string, Map<string, string>>): void {
    const content = serializeConfig(sections);
    writeFile(this.configPath, content);
  }

  /**
   * Add a new remote
   */
  add(name: string, url: string, options: { fetch?: string } = {}): void {
    if (!this.isValidRemoteName(name)) {
      throw new TsgitError(
        `'${name}' is not a valid remote name`,
        ErrorCode.INVALID_ARGUMENT,
        ['Remote names should contain only alphanumeric characters, hyphens, and underscores']
      );
    }

    const existing = this.get(name);
    if (existing) {
      throw new TsgitError(
        `remote ${name} already exists`,
        ErrorCode.OPERATION_FAILED,
        [
          `tsgit remote set-url ${name} ${url}    # Update existing remote URL`,
          `tsgit remote remove ${name}            # Remove and re-add`,
        ]
      );
    }

    const sections = this.loadConfig();
    const remoteSection = new Map<string, string>();
    remoteSection.set('url', url);
    remoteSection.set('fetch', options.fetch || `+refs/heads/*:refs/remotes/${name}/*`);
    sections.set(`remote.${name}`, remoteSection);

    this.saveConfig(sections);

    // Create remotes ref directory
    mkdirp(path.join(this.remotesDir, name));
  }

  /**
   * Remove a remote
   */
  remove(name: string): void {
    const existing = this.get(name);
    if (!existing) {
      throw new TsgitError(
        `No such remote: '${name}'`,
        ErrorCode.REF_NOT_FOUND,
        this.getSuggestions(name)
      );
    }

    const sections = this.loadConfig();
    sections.delete(`remote.${name}`);

    // Remove branch tracking configs for this remote
    for (const [key, values] of sections) {
      if (key.startsWith('branch.')) {
        if (values.get('remote') === name) {
          sections.delete(key);
        }
      }
    }

    this.saveConfig(sections);

    // Remove remote refs directory
    const remoteDir = path.join(this.remotesDir, name);
    if (exists(remoteDir)) {
      this.removeDir(remoteDir);
    }
  }

  /**
   * Rename a remote
   */
  rename(oldName: string, newName: string): void {
    if (!this.isValidRemoteName(newName)) {
      throw new TsgitError(
        `'${newName}' is not a valid remote name`,
        ErrorCode.INVALID_ARGUMENT
      );
    }

    const existing = this.get(oldName);
    if (!existing) {
      throw new TsgitError(
        `No such remote: '${oldName}'`,
        ErrorCode.REF_NOT_FOUND,
        this.getSuggestions(oldName)
      );
    }

    const newExisting = this.get(newName);
    if (newExisting) {
      throw new TsgitError(
        `remote ${newName} already exists`,
        ErrorCode.OPERATION_FAILED
      );
    }

    const sections = this.loadConfig();
    const remoteSection = sections.get(`remote.${oldName}`);
    if (!remoteSection) {
      throw new TsgitError(
        `Could not find remote config for '${oldName}'`,
        ErrorCode.OPERATION_FAILED
      );
    }

    // Update the fetch refspec to reflect the new name
    const fetch = remoteSection.get('fetch');
    if (fetch) {
      remoteSection.set('fetch', fetch.replace(
        new RegExp(`refs/remotes/${oldName}/`),
        `refs/remotes/${newName}/`
      ));
    }

    // Update branch tracking configs
    for (const [key, values] of sections) {
      if (key.startsWith('branch.')) {
        if (values.get('remote') === oldName) {
          values.set('remote', newName);
        }
      }
    }

    // Remove old and add new
    sections.delete(`remote.${oldName}`);
    sections.set(`remote.${newName}`, remoteSection);
    this.saveConfig(sections);

    // Rename the remotes ref directory
    const oldRefsDir = path.join(this.remotesDir, oldName);
    const newRefsDir = path.join(this.remotesDir, newName);
    if (exists(oldRefsDir)) {
      const fs = require('fs');
      fs.renameSync(oldRefsDir, newRefsDir);
    }
  }

  /**
   * Set the URL for a remote
   */
  setUrl(name: string, url: string, options: { push?: boolean } = {}): void {
    const existing = this.get(name);
    if (!existing) {
      throw new TsgitError(
        `No such remote '${name}'`,
        ErrorCode.REF_NOT_FOUND,
        this.getSuggestions(name)
      );
    }

    const sections = this.loadConfig();
    const remoteSection = sections.get(`remote.${name}`);
    if (remoteSection) {
      if (options.push) {
        remoteSection.set('pushurl', url);
      } else {
        remoteSection.set('url', url);
      }
      this.saveConfig(sections);
    }
  }

  /**
   * Get a remote by name
   */
  get(name: string): Remote | null {
    const sections = this.loadConfig();
    const remoteSection = sections.get(`remote.${name}`);

    if (!remoteSection) {
      return null;
    }

    const url = remoteSection.get('url');
    if (!url) {
      return null;
    }

    return {
      name,
      url,
      fetch: remoteSection.get('fetch') || `+refs/heads/*:refs/remotes/${name}/*`,
      push: remoteSection.get('push'),
      pushUrl: remoteSection.get('pushurl'),
    };
  }

  /**
   * Get URL for a remote
   */
  getUrl(name: string, push: boolean = false): string {
    const sections = this.loadConfig();
    const remoteSection = sections.get(`remote.${name}`);

    if (!remoteSection) {
      throw new TsgitError(
        `No such remote '${name}'`,
        ErrorCode.REF_NOT_FOUND,
        this.getSuggestions(name)
      );
    }

    if (push) {
      const pushUrl = remoteSection.get('pushurl');
      if (pushUrl) return pushUrl;
    }

    return remoteSection.get('url') || '';
  }

  /**
   * Check if a remote exists
   */
  exists(name: string): boolean {
    return this.get(name) !== null;
  }

  /**
   * List all configured remotes
   */
  list(): Remote[] {
    const sections = this.loadConfig();
    const remotes: Remote[] = [];

    for (const [key, values] of sections) {
      if (key.startsWith('remote.')) {
        const name = key.slice(7); // Remove 'remote.' prefix
        const url = values.get('url');
        if (url) {
          remotes.push({
            name,
            url,
            fetch: values.get('fetch') || `+refs/heads/*:refs/remotes/${name}/*`,
            push: values.get('push'),
            pushUrl: values.get('pushurl'),
          });
        }
      }
    }

    return remotes.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get the default remote (usually 'origin')
   */
  getDefault(): Remote | null {
    // First try 'origin' as it's the conventional default
    const origin = this.get('origin');
    if (origin) {
      return origin;
    }

    // Otherwise return the first remote
    const remotes = this.list();
    return remotes.length > 0 ? remotes[0] : null;
  }

  /**
   * Set the push URL for a remote (separate from fetch URL)
   */
  setPushUrl(name: string, url: string): void {
    const existing = this.get(name);
    if (!existing) {
      throw new TsgitError(
        `No such remote '${name}'`,
        ErrorCode.REF_NOT_FOUND,
        this.getSuggestions(name)
      );
    }

    const sections = this.loadConfig();
    const remoteSection = sections.get(`remote.${name}`);
    if (remoteSection) {
      remoteSection.set('pushurl', url);
      this.saveConfig(sections);
    }
  }

  /**
   * Get the push URL for a remote
   * Falls back to the regular URL if no push URL is configured
   */
  getPushUrl(name: string): string | null {
    const sections = this.loadConfig();
    const remoteSection = sections.get(`remote.${name}`);

    if (!remoteSection) {
      return null;
    }

    return remoteSection.get('pushurl') || remoteSection.get('url') || null;
  }

  /**
   * Update a remote tracking ref
   */
  updateRemoteRef(remoteName: string, refName: string, hash: string): void {
    const refPath = path.join(this.remotesDir, remoteName, refName);
    mkdirp(path.dirname(refPath));
    writeFile(refPath, hash + '\n');
  }

  /**
   * Get a remote tracking ref
   */
  getRemoteRef(remoteName: string, refName: string): string | null {
    const refPath = path.join(this.remotesDir, remoteName, refName);
    if (!exists(refPath)) {
      return null;
    }
    return readFileText(refPath).trim();
  }

  /**
   * Delete a remote tracking ref
   */
  deleteRemoteRef(remoteName: string, refName: string): void {
    const refPath = path.join(this.remotesDir, remoteName, refName);
    if (exists(refPath)) {
      deleteFile(refPath);
    }
  }

  /**
   * Update a remote tracking branch (alias for updateRemoteRef)
   */
  updateTrackingBranch(remote: string, branch: string, hash: string): void {
    this.updateRemoteRef(remote, branch, hash);
  }

  /**
   * Get tracking branch hash
   */
  getTrackingBranchHash(remote: string, branch: string): string | null {
    return this.getRemoteRef(remote, branch);
  }

  /**
   * Delete a remote tracking branch
   */
  deleteTrackingBranch(remote: string, branch: string): void {
    this.deleteRemoteRef(remote, branch);
  }

  /**
   * List all refs for a remote
   */
  listRemoteRefs(remoteName: string): Map<string, string> {
    const refs = new Map<string, string>();
    const remoteRefDir = path.join(this.remotesDir, remoteName);

    if (!exists(remoteRefDir)) {
      return refs;
    }

    const listRefsRecursive = (dir: string, prefix: string): void => {
      const entries = readDir(dir);

      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const refName = prefix ? prefix + '/' + entry : entry;

        if (isDirectory(fullPath)) {
          listRefsRecursive(fullPath, refName);
        } else {
          const hash = readFileText(fullPath).trim();
          refs.set(refName, hash);
        }
      }
    };

    listRefsRecursive(remoteRefDir, '');
    return refs;
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
      const refs = this.listRemoteRefs(remote);
      for (const [name, hash] of refs) {
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
   * Set branch tracking configuration
   */
  setTrackingBranch(branch: string, remote: string, remoteBranch: string): void {
    const sections = this.loadConfig();
    
    let branchSection = sections.get(`branch.${branch}`);
    if (!branchSection) {
      branchSection = new Map();
      sections.set(`branch.${branch}`, branchSection);
    }
    
    branchSection.set('remote', remote);
    branchSection.set('merge', `refs/heads/${remoteBranch}`);
    
    this.saveConfig(sections);
  }

  /**
   * Get branch tracking configuration
   */
  getTrackingConfig(branch: string): BranchTrackingConfig | null {
    const sections = this.loadConfig();
    const branchSection = sections.get(`branch.${branch}`);
    
    if (!branchSection) {
      return null;
    }

    const remote = branchSection.get('remote');
    const merge = branchSection.get('merge');
    
    if (!remote || !merge) {
      return null;
    }

    return { remote, merge };
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
   * Validate remote name
   */
  private isValidRemoteName(name: string): boolean {
    // Remote names should be alphanumeric with hyphens and underscores
    // They cannot start with a hyphen or contain slashes
    return /^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/.test(name);
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
   * Remove directory recursively
   */
  private removeDir(dir: string): void {
    const fs = require('fs');
    if (exists(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  /**
   * Parse a refspec string
   */
  static parseRefspec(refspec: string): { force: boolean; src: string; dst: string } {
    let force = false;
    let spec = refspec;

    if (spec.startsWith('+')) {
      force = true;
      spec = spec.slice(1);
    }

    const colonIndex = spec.indexOf(':');
    if (colonIndex === -1) {
      // Simple refspec without destination
      return { force, src: spec, dst: spec };
    }

    return {
      force,
      src: spec.slice(0, colonIndex),
      dst: spec.slice(colonIndex + 1),
    };
  }

  /**
   * Apply a refspec to transform a ref name
   * Returns null if the ref doesn't match the refspec pattern
   */
  static applyRefspec(refspec: string, refName: string): string | null {
    const { src, dst } = RemoteManager.parseRefspec(refspec);

    // Handle glob patterns (*)
    if (src.includes('*')) {
      const srcPattern = new RegExp('^' + src.replace('*', '(.+)') + '$');
      const match = refName.match(srcPattern);

      if (!match) {
        return null;
      }

      // Replace the * in dst with the captured group
      return dst.replace('*', match[1]);
    }

    // Exact match
    if (refName === src) {
      return dst;
    }

    return null;
  }
}
