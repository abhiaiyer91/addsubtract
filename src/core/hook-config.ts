/**
 * Hook Configuration System
 * 
 * Provides project-level hook configuration similar to Husky.
 * Allows teams to share hook configurations via version control.
 * 
 * Configuration can be in:
 * - .wit/hooks.json (recommended)
 * - wit.config.js (for dynamic configs)
 * - package.json "wit.hooks" field
 */

import * as path from 'path';
import { exists, readFileText, writeFile, mkdirp } from '../utils/fs';
import { HookType, HOOK_TEMPLATES } from './hooks';

/**
 * Hook definition in config
 */
export interface HookDefinition {
  /** The command to run */
  run: string;
  /** Only run on specific file patterns (glob) */
  files?: string[];
  /** Skip this hook */
  skip?: boolean;
}

/**
 * Project hook configuration
 */
export interface HookConfig {
  /** Hook definitions by type */
  hooks?: Partial<Record<HookType, string | string[] | HookDefinition>>;
  /** Lint-staged style config: run commands on staged files matching patterns */
  staged?: Record<string, string | string[]>;
  /** Whether hooks are enabled globally */
  enabled?: boolean;
}

/**
 * Default config file locations
 */
const CONFIG_LOCATIONS = [
  '.wit/hooks.json',
  'wit.config.json',
];

/**
 * Load hook configuration from project
 */
export function loadHookConfig(workDir: string): HookConfig | null {
  // Try JSON config files
  for (const location of CONFIG_LOCATIONS) {
    const configPath = path.join(workDir, location);
    if (exists(configPath)) {
      try {
        const content = readFileText(configPath);
        return JSON.parse(content) as HookConfig;
      } catch (e) {
        console.error(`Warning: Failed to parse ${location}: ${e}`);
      }
    }
  }

  // Try package.json wit.hooks field
  const packageJsonPath = path.join(workDir, 'package.json');
  if (exists(packageJsonPath)) {
    try {
      const content = readFileText(packageJsonPath);
      const pkg = JSON.parse(content);
      if (pkg.wit?.hooks || pkg.wit?.staged) {
        return {
          hooks: pkg.wit.hooks,
          staged: pkg.wit.staged,
          enabled: pkg.wit.enabled,
        };
      }
    } catch {
      // Ignore parse errors for package.json
    }
  }

  return null;
}

/**
 * Save hook configuration to project
 */
export function saveHookConfig(workDir: string, config: HookConfig): void {
  const witDir = path.join(workDir, '.wit');
  if (!exists(witDir)) {
    mkdirp(witDir);
  }
  
  const configPath = path.join(witDir, 'hooks.json');
  writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Generate hook script content from config
 */
export function generateHookScript(hookType: HookType, config: HookConfig): string | null {
  const hookDef = config.hooks?.[hookType];
  
  if (!hookDef) {
    return null;
  }

  // Handle simple string command
  if (typeof hookDef === 'string') {
    return generateShellScript(hookType, [hookDef]);
  }

  // Handle array of commands
  if (Array.isArray(hookDef)) {
    return generateShellScript(hookType, hookDef);
  }

  // Handle HookDefinition object
  if (hookDef.skip) {
    return null;
  }

  const commands = typeof hookDef.run === 'string' ? [hookDef.run] : [hookDef.run];
  return generateShellScript(hookType, commands, hookDef.files);
}

/**
 * Generate shell script for hook
 */
function generateShellScript(hookType: HookType, commands: string[], filePatterns?: string[]): string {
  let script = `#!/bin/sh
# wit ${hookType} hook
# Generated from .wit/hooks.json - DO NOT EDIT DIRECTLY
# To modify, edit .wit/hooks.json and run: wit hooks sync

set -e

`;

  if (filePatterns && filePatterns.length > 0) {
    // Filter commands to only run on matching files
    script += `# Only run on files matching: ${filePatterns.join(', ')}\n`;
    script += `STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '${filePatterns.join('|')}' || true)\n`;
    script += `if [ -z "$STAGED_FILES" ]; then\n`;
    script += `  exit 0\n`;
    script += `fi\n\n`;
  }

  for (const cmd of commands) {
    script += `echo "Running: ${cmd}"\n`;
    script += `${cmd}\n\n`;
  }

  script += `exit 0\n`;
  
  return script;
}

/**
 * Generate lint-staged style hook script
 */
export function generateStagedHookScript(config: HookConfig): string | null {
  if (!config.staged || Object.keys(config.staged).length === 0) {
    return null;
  }

  let script = `#!/bin/sh
# wit pre-commit hook (lint-staged style)
# Generated from .wit/hooks.json - DO NOT EDIT DIRECTLY

set -e

`;

  for (const [pattern, commands] of Object.entries(config.staged)) {
    const cmdList = Array.isArray(commands) ? commands : [commands];
    
    script += `# Files matching: ${pattern}\n`;
    script += `FILES=$(git diff --cached --name-only --diff-filter=ACMR | grep -E '${pattern}' || true)\n`;
    script += `if [ -n "$FILES" ]; then\n`;
    
    for (const cmd of cmdList) {
      // Replace {} with $FILES to pass files as argument
      const resolvedCmd = cmd.includes('{}') 
        ? cmd.replace('{}', '$FILES')
        : `${cmd} $FILES`;
      script += `  echo "Running: ${cmd}"\n`;
      script += `  ${resolvedCmd}\n`;
    }
    
    script += `fi\n\n`;
  }

  script += `exit 0\n`;
  
  return script;
}

/**
 * Create a sample hooks.json config
 */
export function createSampleConfig(): HookConfig {
  return {
    hooks: {
      'pre-commit': 'npm run lint',
      'commit-msg': 'npx commitlint --edit $1',
    },
    staged: {
      '\\.(ts|tsx)$': ['eslint --fix', 'prettier --write'],
      '\\.(json|md)$': 'prettier --write',
    },
    enabled: true,
  };
}

/**
 * Initialize hook configuration for a project
 */
export function initHookConfig(workDir: string, sample: boolean = false): string {
  const config = sample ? createSampleConfig() : { hooks: {}, staged: {}, enabled: true };
  saveHookConfig(workDir, config);
  return path.join(workDir, '.wit', 'hooks.json');
}
