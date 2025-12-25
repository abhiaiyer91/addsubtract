/**
 * Partial Clone Support
 * Enables on-demand fetching of objects and sparse checkouts
 */

import * as path from 'path';
import { ObjectStore } from './object-store';
import { GitObject, Blob, Tree, Commit } from './object';
import { exists, readFile, writeFile, mkdirp } from '../utils/fs';
import { TsgitError, ErrorCode } from './errors';

/**
 * Object availability status
 */
export type ObjectAvailability = 'local' | 'remote' | 'missing';

/**
 * Remote object reference
 */
export interface RemoteObjectRef {
  hash: string;
  type: string;
  size: number;
  available: ObjectAvailability;
}

/**
 * Partial clone configuration
 */
export interface PartialCloneConfig {
  enabled: boolean;
  remoteUrl?: string;
  blobFilter?: BlobFilter;
  treelessClone?: boolean;
  depth?: number;
}

/**
 * Blob filter types for partial clones
 */
export interface BlobFilter {
  type: 'none' | 'blob:none' | 'blob:limit' | 'tree:depth';
  limit?: number;  // For blob:limit, size in bytes
  depth?: number;  // For tree:depth
}

/**
 * Object manifest for tracking remote objects
 */
export interface ObjectManifest {
  version: number;
  remoteUrl: string;
  objects: Map<string, RemoteObjectRef>;
  lastUpdated: number;
}

/**
 * Partial Clone Manager
 * Handles on-demand object fetching and sparse operations
 */
export class PartialCloneManager {
  private manifestPath: string;
  private configPath: string;
  private manifest: ObjectManifest | null = null;
  private config: PartialCloneConfig;

  constructor(
    private gitDir: string,
    private objectStore: ObjectStore
  ) {
    this.manifestPath = path.join(gitDir, 'objects', 'manifest.json');
    this.configPath = path.join(gitDir, 'partial-clone.json');
    this.config = this.loadConfig();
    this.loadManifest();
  }

  /**
   * Load configuration
   */
  private loadConfig(): PartialCloneConfig {
    if (!exists(this.configPath)) {
      return { enabled: false };
    }

    try {
      const content = readFile(this.configPath).toString('utf8');
      return JSON.parse(content) as PartialCloneConfig;
    } catch {
      return { enabled: false };
    }
  }

  /**
   * Save configuration
   */
  saveConfig(): void {
    writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }

  /**
   * Load object manifest
   */
  private loadManifest(): void {
    if (!exists(this.manifestPath)) {
      this.manifest = null;
      return;
    }

    try {
      const content = readFile(this.manifestPath).toString('utf8');
      const data = JSON.parse(content);
      this.manifest = {
        ...data,
        objects: new Map(Object.entries(data.objects || {})),
      };
    } catch {
      this.manifest = null;
    }
  }

  /**
   * Save object manifest
   */
  private saveManifest(): void {
    if (!this.manifest) return;

    const data = {
      ...this.manifest,
      objects: Object.fromEntries(this.manifest.objects),
    };
    writeFile(this.manifestPath, JSON.stringify(data, null, 2));
  }

  /**
   * Check if partial clone is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable partial clone mode
   */
  enable(remoteUrl: string, filter?: BlobFilter): void {
    this.config = {
      enabled: true,
      remoteUrl,
      blobFilter: filter,
    };
    this.saveConfig();

    this.manifest = {
      version: 1,
      remoteUrl,
      objects: new Map(),
      lastUpdated: Date.now(),
    };
    this.saveManifest();
  }

  /**
   * Disable partial clone mode
   */
  disable(): void {
    this.config.enabled = false;
    this.saveConfig();
  }

  /**
   * Check object availability
   */
  checkAvailability(hash: string): ObjectAvailability {
    // Check local first
    if (this.objectStore.hasObject(hash)) {
      return 'local';
    }

    // Check manifest
    if (this.manifest?.objects.has(hash)) {
      return 'remote';
    }

    return 'missing';
  }

  /**
   * Get object info without fetching
   */
  getObjectInfo(hash: string): RemoteObjectRef | null {
    // Check local
    if (this.objectStore.hasObject(hash)) {
      try {
        const { type, content } = this.objectStore.readRawObject(hash);
        return {
          hash,
          type,
          size: content.length,
          available: 'local',
        };
      } catch {
        return null;
      }
    }

    // Check manifest
    const remote = this.manifest?.objects.get(hash);
    if (remote) {
      return { ...remote, available: 'remote' };
    }

    return null;
  }

  /**
   * Fetch an object on demand
   * In a real implementation, this would make network requests
   */
  async fetchObject(hash: string): Promise<GitObject> {
    // Check if already local
    if (this.objectStore.hasObject(hash)) {
      return this.objectStore.readObject(hash);
    }

    // Check if known remote
    if (!this.manifest?.objects.has(hash)) {
      throw new TsgitError(
        `Object ${hash} not available locally or remotely`,
        ErrorCode.OBJECT_NOT_FOUND,
        [
          'tsgit fetch    # Fetch objects from remote',
          'tsgit clone --no-filter    # Clone without filtering',
        ]
      );
    }

    // Simulate fetching (in real implementation, would make HTTP request)
    throw new TsgitError(
      `Object ${hash} requires fetching from remote`,
      ErrorCode.OBJECT_NOT_FOUND,
      [`tsgit fetch-object ${hash}    # Fetch this specific object`]
    );
  }

  /**
   * Fetch objects matching a filter
   */
  async fetchObjects(hashes: string[]): Promise<Map<string, GitObject>> {
    const results = new Map<string, GitObject>();
    const toFetch: string[] = [];

    for (const hash of hashes) {
      if (this.objectStore.hasObject(hash)) {
        results.set(hash, this.objectStore.readObject(hash));
      } else {
        toFetch.push(hash);
      }
    }

    if (toFetch.length > 0) {
      // In real implementation, batch fetch from remote
      console.log(`Would fetch ${toFetch.length} objects from remote`);
    }

    return results;
  }

  /**
   * Register a remote object in the manifest
   */
  registerRemoteObject(ref: RemoteObjectRef): void {
    if (!this.manifest) {
      this.manifest = {
        version: 1,
        remoteUrl: this.config.remoteUrl || '',
        objects: new Map(),
        lastUpdated: Date.now(),
      };
    }

    this.manifest.objects.set(ref.hash, ref);
    this.manifest.lastUpdated = Date.now();
    this.saveManifest();
  }

  /**
   * Get statistics about object availability
   */
  getStats(): {
    localCount: number;
    remoteCount: number;
    localSize: number;
    remoteSize: number;
  } {
    let localCount = 0;
    let remoteCount = 0;
    let localSize = 0;
    let remoteSize = 0;

    // Count local objects
    const localObjects = this.objectStore.listObjects();
    localCount = localObjects.length;

    // Count remote objects
    if (this.manifest) {
      for (const [hash, ref] of this.manifest.objects) {
        if (!this.objectStore.hasObject(hash)) {
          remoteCount++;
          remoteSize += ref.size;
        }
      }
    }

    return { localCount, remoteCount, localSize, remoteSize };
  }

  /**
   * Check if a path should be included based on sparse checkout rules
   */
  shouldIncludePath(filePath: string, sparsePatterns: string[]): boolean {
    if (sparsePatterns.length === 0) {
      return true;
    }

    for (const pattern of sparsePatterns) {
      if (this.matchSparsePattern(filePath, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Match a path against a sparse pattern
   */
  private matchSparsePattern(filePath: string, pattern: string): boolean {
    // Simple pattern matching (in real implementation, would use full glob)
    if (pattern.endsWith('/')) {
      // Directory pattern
      return filePath.startsWith(pattern) || filePath + '/' === pattern;
    }
    
    if (pattern.startsWith('!')) {
      // Negation
      return !this.matchSparsePattern(filePath, pattern.slice(1));
    }

    // Simple wildcard
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(filePath);
    }

    return filePath === pattern || filePath.startsWith(pattern + '/');
  }

  /**
   * Get configuration
   */
  getConfig(): PartialCloneConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<PartialCloneConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }
}

/**
 * Sparse checkout configuration
 */
export interface SparseCheckoutConfig {
  enabled: boolean;
  patterns: string[];
  cone: boolean;  // Cone mode for better performance
}

/**
 * Sparse Checkout Manager
 */
export class SparseCheckoutManager {
  private configPath: string;
  private config: SparseCheckoutConfig;

  constructor(private gitDir: string) {
    this.configPath = path.join(gitDir, 'info', 'sparse-checkout');
    this.config = this.loadConfig();
  }

  /**
   * Load sparse checkout configuration
   */
  private loadConfig(): SparseCheckoutConfig {
    if (!exists(this.configPath)) {
      return { enabled: false, patterns: [], cone: false };
    }

    try {
      const content = readFile(this.configPath).toString('utf8');
      const patterns = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
      return {
        enabled: patterns.length > 0,
        patterns,
        cone: patterns.some(p => p.endsWith('/')),
      };
    } catch {
      return { enabled: false, patterns: [], cone: false };
    }
  }

  /**
   * Save configuration
   */
  private saveConfig(): void {
    mkdirp(path.dirname(this.configPath));
    const content = this.config.patterns.join('\n') + '\n';
    writeFile(this.configPath, content);
  }

  /**
   * Enable sparse checkout
   */
  enable(patterns: string[]): void {
    this.config = {
      enabled: true,
      patterns,
      cone: patterns.every(p => p.endsWith('/') || !p.includes('*')),
    };
    this.saveConfig();
  }

  /**
   * Disable sparse checkout
   */
  disable(): void {
    this.config.enabled = false;
    this.config.patterns = [];
    this.saveConfig();
  }

  /**
   * Add patterns
   */
  addPatterns(patterns: string[]): void {
    this.config.patterns.push(...patterns);
    this.config.enabled = true;
    this.saveConfig();
  }

  /**
   * Remove patterns
   */
  removePatterns(patterns: string[]): void {
    this.config.patterns = this.config.patterns.filter(p => !patterns.includes(p));
    this.saveConfig();
  }

  /**
   * Check if a path should be checked out
   */
  shouldCheckout(filePath: string): boolean {
    if (!this.config.enabled) {
      return true;
    }

    for (const pattern of this.config.patterns) {
      if (this.matchPattern(filePath, pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Match path against pattern
   */
  private matchPattern(filePath: string, pattern: string): boolean {
    if (pattern.startsWith('!')) {
      return !this.matchPattern(filePath, pattern.slice(1));
    }

    if (pattern.endsWith('/')) {
      return filePath.startsWith(pattern.slice(0, -1));
    }

    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(filePath);
    }

    return filePath === pattern || filePath.startsWith(pattern + '/');
  }

  /**
   * Get configuration
   */
  getConfig(): SparseCheckoutConfig {
    return { ...this.config };
  }

  /**
   * Get patterns
   */
  getPatterns(): string[] {
    return [...this.config.patterns];
  }
}
