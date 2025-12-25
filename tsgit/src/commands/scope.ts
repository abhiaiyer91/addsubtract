/**
 * Scope command
 * Manage repository scopes for monorepo support
 */

import { Repository } from '../core/repository';
import { ScopeManager, RepositoryScope, formatScope, SCOPE_PRESETS } from '../core/scope';
import { TsgitError } from '../core/errors';

/**
 * Show current scope
 */
export function showScope(): void {
  const repo = Repository.find();
  const scopeManager = new ScopeManager(repo.gitDir, repo.workDir);

  const scope = scopeManager.getScope();
  const name = scopeManager.getScopeName();

  console.log(formatScope(scope, name || undefined));
}

/**
 * Set scope to specific paths
 */
export function setScope(paths: string[], name?: string): void {
  const repo = Repository.find();
  const scopeManager = new ScopeManager(repo.gitDir, repo.workDir);

  const scope: RepositoryScope = {
    paths,
    excludePaths: [],
    includeRoot: true,
  };

  scopeManager.setScope(scope, name);
  console.log(`Scope set to: ${paths.join(', ')}`);
}

/**
 * Use a named or preset scope
 */
export function useScope(name: string): void {
  const repo = Repository.find();
  const scopeManager = new ScopeManager(repo.gitDir, repo.workDir);

  try {
    scopeManager.applyNamedScope(name);
    console.log(`Using scope: ${name}`);
    console.log(formatScope(scopeManager.getScope()));
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else {
      throw error;
    }
    process.exit(1);
  }
}

/**
 * Clear scope (reset to full repository)
 */
export function clearScope(): void {
  const repo = Repository.find();
  const scopeManager = new ScopeManager(repo.gitDir, repo.workDir);

  scopeManager.clearScope();
  console.log('Scope cleared. Working with full repository.');
}

/**
 * Add paths to scope
 */
export function addToScope(paths: string[]): void {
  const repo = Repository.find();
  const scopeManager = new ScopeManager(repo.gitDir, repo.workDir);

  scopeManager.addPaths(paths);
  console.log(`Added to scope: ${paths.join(', ')}`);
}

/**
 * Exclude paths from scope
 */
export function excludeFromScope(patterns: string[]): void {
  const repo = Repository.find();
  const scopeManager = new ScopeManager(repo.gitDir, repo.workDir);

  scopeManager.addExcludes(patterns);
  console.log(`Excluded from scope: ${patterns.join(', ')}`);
}

/**
 * List available scopes
 */
export function listScopes(): void {
  const repo = Repository.find();
  const scopeManager = new ScopeManager(repo.gitDir, repo.workDir);

  const scopes = scopeManager.listScopes();
  const currentName = scopeManager.getScopeName();

  console.log('Available scopes:\n');

  console.log('Presets:');
  for (const scope of scopes.filter(s => s.isPreset)) {
    const marker = scope.name === currentName ? '* ' : '  ';
    console.log(`${marker}${scope.name.padEnd(15)} ${scope.description || ''}`);
  }

  const customScopes = scopes.filter(s => !s.isPreset);
  if (customScopes.length > 0) {
    console.log('\nCustom:');
    for (const scope of customScopes) {
      const marker = scope.name === currentName ? '* ' : '  ';
      console.log(`${marker}${scope.name}`);
    }
  }
}

/**
 * Save current scope with a name
 */
export function saveScope(name: string): void {
  const repo = Repository.find();
  const scopeManager = new ScopeManager(repo.gitDir, repo.workDir);

  const scope = scopeManager.getScope();
  scopeManager.saveNamedScope(name, scope);
  console.log(`Scope saved as: ${name}`);
}

/**
 * Delete a saved scope
 */
export function deleteScope(name: string): void {
  const repo = Repository.find();
  const scopeManager = new ScopeManager(repo.gitDir, repo.workDir);

  scopeManager.deleteScope(name);
  console.log(`Scope deleted: ${name}`);
}

/**
 * CLI handler for scope command
 */
export function handleScope(args: string[]): void {
  if (args.length === 0) {
    showScope();
    return;
  }

  const subcommand = args[0];
  const subArgs = args.slice(1);

  switch (subcommand) {
    case 'show':
      showScope();
      break;

    case 'set':
      if (subArgs.length === 0) {
        console.error('error: paths required');
        console.error('Usage: tsgit scope set <path>... [--name <name>]');
        process.exit(1);
      }
      const nameIndex = subArgs.indexOf('--name');
      let name: string | undefined;
      let paths = subArgs;
      if (nameIndex !== -1) {
        name = subArgs[nameIndex + 1];
        paths = subArgs.filter((_, i) => i !== nameIndex && i !== nameIndex + 1);
      }
      setScope(paths, name);
      break;

    case 'use':
      if (subArgs.length === 0) {
        console.error('error: scope name required');
        console.error('Usage: tsgit scope use <name>');
        process.exit(1);
      }
      useScope(subArgs[0]);
      break;

    case 'clear':
      clearScope();
      break;

    case 'add':
      if (subArgs.length === 0) {
        console.error('error: paths required');
        process.exit(1);
      }
      addToScope(subArgs);
      break;

    case 'exclude':
      if (subArgs.length === 0) {
        console.error('error: patterns required');
        process.exit(1);
      }
      excludeFromScope(subArgs);
      break;

    case 'list':
      listScopes();
      break;

    case 'save':
      if (subArgs.length === 0) {
        console.error('error: scope name required');
        process.exit(1);
      }
      saveScope(subArgs[0]);
      break;

    case 'delete':
      if (subArgs.length === 0) {
        console.error('error: scope name required');
        process.exit(1);
      }
      deleteScope(subArgs[0]);
      break;

    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      console.error('\nUsage: tsgit scope <subcommand>');
      console.error('\nSubcommands:');
      console.error('  show               Show current scope');
      console.error('  set <path>...      Set scope to specific paths');
      console.error('  use <name>         Apply a named/preset scope');
      console.error('  clear              Clear scope (full repository)');
      console.error('  add <path>...      Add paths to current scope');
      console.error('  exclude <pattern>  Exclude patterns from scope');
      console.error('  list               List available scopes');
      console.error('  save <name>        Save current scope with a name');
      console.error('  delete <name>      Delete a saved scope');
      console.error('\nPresets:');
      for (const preset of SCOPE_PRESETS) {
        console.error(`  ${preset.name.padEnd(15)} ${preset.description}`);
      }
      process.exit(1);
  }
}
