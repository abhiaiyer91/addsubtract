/**
 * Monorepo/Scope Support
 * Enables working with a subset of the repository
 */

import * as path from 'path';
import { Repository } from './repository';
import { TsgitError, ErrorCode } from './errors';
import { exists, readFile, writeFile, mkdirp } from '../utils/fs';

/**
 * Repository scope configuration
 */
export interface RepositoryScope {
  name?: string;              // Optional scope name
  paths: string[];            // Included paths (directories or files)
  excludePaths: string[];     // Explicitly excluded paths
  depth?: number;             // History depth limit
  includeRoot: boolean;       // Include root-level files
}

/**
 * Default scope (entire repository)
 */
const DEFAULT_SCOPE: RepositoryScope = {
  paths: [],
  excludePaths: [],
  includeRoot: true,
};

/**
 * Scope preset for common monorepo patterns
 */
export interface ScopePreset {
  name: string;
  description: string;
  scope: Partial<RepositoryScope>;
}

/**
 * Common scope presets
 */
export const SCOPE_PRESETS: ScopePreset[] = [
  {
    name: 'frontend',
    description: 'Frontend packages only',
    scope: {
      paths: ['packages/frontend/', 'apps/web/', 'src/client/'],
      excludePaths: ['**/node_modules/', '**/dist/', '**/build/'],
    },
  },
  {
    name: 'backend',
    description: 'Backend packages only',
    scope: {
      paths: ['packages/backend/', 'apps/api/', 'src/server/'],
      excludePaths: ['**/node_modules/', '**/dist/'],
    },
  },
  {
    name: 'docs',
    description: 'Documentation only',
    scope: {
      paths: ['docs/', 'README.md', 'CHANGELOG.md'],
      excludePaths: [],
    },
  },
  {
    name: 'config',
    description: 'Configuration files only',
    scope: {
      paths: ['.github/', '.vscode/', '*.config.*', 'package.json', 'tsconfig.json'],
      excludePaths: [],
      includeRoot: true,
    },
  },
];

/**
 * Scope Manager
 * Manages repository scopes for monorepo support
 */
export class ScopeManager {
  private scopePath: string;
  private scopesDir: string;
  private currentScope: RepositoryScope;
  private currentScopeName: string | null = null;

  constructor(private gitDir: string, private workDir: string) {
    this.scopePath = path.join(gitDir, 'scope');
    this.scopesDir = path.join(gitDir, 'scopes');
    this.currentScope = this.loadCurrentScope();
  }

  /**
   * Initialize scope directories
   */
  init(): void {
    mkdirp(this.scopesDir);
  }

  /**
   * Load current scope
   */
  private loadCurrentScope(): RepositoryScope {
    if (!exists(this.scopePath)) {
      return DEFAULT_SCOPE;
    }

    try {
      const content = readFile(this.scopePath).toString('utf8');
      const data = JSON.parse(content);
      this.currentScopeName = data.name || null;
      return {
        ...DEFAULT_SCOPE,
        ...data.scope,
      };
    } catch {
      return DEFAULT_SCOPE;
    }
  }

  /**
   * Save current scope
   */
  private saveCurrentScope(): void {
    const data = {
      name: this.currentScopeName,
      scope: this.currentScope,
      savedAt: Date.now(),
    };
    writeFile(this.scopePath, JSON.stringify(data, null, 2));
  }

  /**
   * Check if scope is active
   */
  isActive(): boolean {
    return this.currentScope.paths.length > 0 || 
           this.currentScope.excludePaths.length > 0;
  }

  /**
   * Get current scope
   */
  getScope(): RepositoryScope {
    return { ...this.currentScope };
  }

  /**
   * Get current scope name
   */
  getScopeName(): string | null {
    return this.currentScopeName;
  }

  /**
   * Set scope from paths
   */
  setScope(scope: Partial<RepositoryScope>, name?: string): void {
    this.currentScope = {
      ...DEFAULT_SCOPE,
      ...scope,
    };
    this.currentScopeName = name || null;
    this.saveCurrentScope();
  }

  /**
   * Clear scope (reset to full repository)
   */
  clearScope(): void {
    this.currentScope = DEFAULT_SCOPE;
    this.currentScopeName = null;
    
    if (exists(this.scopePath)) {
      require('fs').unlinkSync(this.scopePath);
    }
  }

  /**
   * Add paths to current scope
   */
  addPaths(paths: string[]): void {
    this.currentScope.paths.push(...paths);
    this.saveCurrentScope();
  }

  /**
   * Remove paths from scope
   */
  removePaths(paths: string[]): void {
    this.currentScope.paths = this.currentScope.paths.filter(
      p => !paths.includes(p)
    );
    this.saveCurrentScope();
  }

  /**
   * Add exclude patterns
   */
  addExcludes(patterns: string[]): void {
    this.currentScope.excludePaths.push(...patterns);
    this.saveCurrentScope();
  }

  /**
   * Check if a path is within scope
   */
  isInScope(filePath: string): boolean {
    // Normalize path
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Check excludes first
    for (const exclude of this.currentScope.excludePaths) {
      if (this.matchPattern(normalizedPath, exclude)) {
        return false;
      }
    }

    // If no includes specified, everything (not excluded) is in scope
    if (this.currentScope.paths.length === 0) {
      return true;
    }

    // Check root files
    if (this.currentScope.includeRoot && !normalizedPath.includes('/')) {
      return true;
    }

    // Check includes
    for (const include of this.currentScope.paths) {
      if (this.matchPattern(normalizedPath, include)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Match path against pattern
   */
  private matchPattern(filePath: string, pattern: string): boolean {
    // Handle ** pattern
    if (pattern.startsWith('**/')) {
      return filePath.includes(pattern.slice(3)) || 
             filePath.endsWith(pattern.slice(3).replace(/\/$/, ''));
    }

    // Handle directory pattern
    if (pattern.endsWith('/')) {
      return filePath.startsWith(pattern) || 
             filePath === pattern.slice(0, -1);
    }

    // Handle wildcard
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$'
      );
      return regex.test(filePath);
    }

    // Exact match or prefix match
    return filePath === pattern || filePath.startsWith(pattern + '/');
  }

  /**
   * Filter files by scope
   */
  filterPaths(paths: string[]): string[] {
    return paths.filter(p => this.isInScope(p));
  }

  /**
   * Save a named scope
   */
  saveNamedScope(name: string, scope: RepositoryScope): void {
    const scopeFile = path.join(this.scopesDir, `${name}.json`);
    writeFile(scopeFile, JSON.stringify(scope, null, 2));
  }

  /**
   * Load a named scope
   */
  loadNamedScope(name: string): RepositoryScope | null {
    // Check presets first
    const preset = SCOPE_PRESETS.find(p => p.name === name);
    if (preset) {
      return { ...DEFAULT_SCOPE, ...preset.scope };
    }

    // Check saved scopes
    const scopeFile = path.join(this.scopesDir, `${name}.json`);
    if (!exists(scopeFile)) {
      return null;
    }

    try {
      const content = readFile(scopeFile).toString('utf8');
      return JSON.parse(content) as RepositoryScope;
    } catch {
      return null;
    }
  }

  /**
   * Apply a named scope
   */
  applyNamedScope(name: string): void {
    const scope = this.loadNamedScope(name);
    if (!scope) {
      throw new TsgitError(
        `Scope '${name}' not found`,
        ErrorCode.INVALID_ARGUMENT,
        [
          'tsgit scope list    # List available scopes',
          ...SCOPE_PRESETS.map(p => `tsgit scope use ${p.name}    # ${p.description}`),
        ]
      );
    }

    this.setScope(scope, name);
  }

  /**
   * List all available scopes
   */
  listScopes(): { name: string; description?: string; isPreset: boolean }[] {
    const scopes: { name: string; description?: string; isPreset: boolean }[] = [];

    // Add presets
    for (const preset of SCOPE_PRESETS) {
      scopes.push({
        name: preset.name,
        description: preset.description,
        isPreset: true,
      });
    }

    // Add saved scopes
    if (exists(this.scopesDir)) {
      const files = require('fs').readdirSync(this.scopesDir) as string[];
      for (const file of files) {
        if (file.endsWith('.json')) {
          const name = file.replace('.json', '');
          if (!scopes.some(s => s.name === name)) {
            scopes.push({ name, isPreset: false });
          }
        }
      }
    }

    return scopes;
  }

  /**
   * Delete a saved scope
   */
  deleteScope(name: string): void {
    const scopeFile = path.join(this.scopesDir, `${name}.json`);
    if (exists(scopeFile)) {
      require('fs').unlinkSync(scopeFile);
    }
  }
}

/**
 * Scoped Repository wrapper
 * Wraps a repository with scope enforcement
 */
export class ScopedRepository {
  private scopeManager: ScopeManager;

  constructor(
    private repo: Repository,
    scope?: Partial<RepositoryScope>
  ) {
    this.scopeManager = new ScopeManager(repo.gitDir, repo.workDir);
    if (scope) {
      this.scopeManager.setScope(scope);
    }
  }

  /**
   * Check if a path is in scope
   */
  isInScope(filePath: string): boolean {
    return this.scopeManager.isInScope(filePath);
  }

  /**
   * Add files with scope enforcement
   */
  add(filePath: string): void {
    this.assertInScope(filePath);
    this.repo.add(filePath);
  }

  /**
   * Get status with scope filtering
   */
  status(): {
    staged: string[];
    modified: string[];
    untracked: string[];
    deleted: string[];
  } {
    const fullStatus = this.repo.status();
    
    return {
      staged: this.scopeManager.filterPaths(fullStatus.staged),
      modified: this.scopeManager.filterPaths(fullStatus.modified),
      untracked: this.scopeManager.filterPaths(fullStatus.untracked),
      deleted: this.scopeManager.filterPaths(fullStatus.deleted),
    };
  }

  /**
   * Get log with scope filtering (commits affecting scope)
   */
  log(ref: string = 'HEAD', limit: number = 10): any[] {
    // In a real implementation, would filter commits to those affecting scope
    return this.repo.log(ref, limit);
  }

  /**
   * Assert path is in scope
   */
  private assertInScope(filePath: string): void {
    if (!this.scopeManager.isInScope(filePath)) {
      throw new TsgitError(
        `Path '${filePath}' is outside the current scope`,
        ErrorCode.SCOPE_VIOLATION,
        [
          'tsgit scope show    # View current scope',
          `tsgit scope add ${filePath}    # Add path to scope`,
          'tsgit scope clear    # Clear scope restrictions',
        ]
      );
    }
  }

  /**
   * Get scope manager
   */
  getScopeManager(): ScopeManager {
    return this.scopeManager;
  }

  /**
   * Get underlying repository
   */
  getRepository(): Repository {
    return this.repo;
  }
}

/**
 * Format scope for display
 */
export function formatScope(scope: RepositoryScope, name?: string): string {
  let output = '';

  if (name) {
    output += `Scope: ${name}\n\n`;
  }

  if (scope.paths.length > 0) {
    output += 'Included paths:\n';
    for (const p of scope.paths) {
      output += `  + ${p}\n`;
    }
  }

  if (scope.excludePaths.length > 0) {
    output += '\nExcluded paths:\n';
    for (const p of scope.excludePaths) {
      output += `  - ${p}\n`;
    }
  }

  if (scope.depth !== undefined) {
    output += `\nHistory depth: ${scope.depth}\n`;
  }

  output += `\nRoot files: ${scope.includeRoot ? 'included' : 'excluded'}\n`;

  return output || 'No scope restrictions (full repository)\n';
}
