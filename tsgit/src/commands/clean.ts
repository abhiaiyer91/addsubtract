/**
 * Clean Command
 * Remove untracked files from working directory
 * 
 * Usage:
 * - tsgit clean -n                  # Dry run (show what would be deleted)
 * - tsgit clean -f                  # Force delete untracked files
 * - tsgit clean -fd                 # Delete untracked files and directories
 * - tsgit clean -fx                 # Also delete ignored files
 * - tsgit clean -i                  # Interactive mode
 */

import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../core/repository';
import { TsgitError, ErrorCode } from '../core/errors';
import { 
  exists, 
  walkDir, 
  isDirectory, 
  loadIgnorePatterns,
  matchesIgnorePattern 
} from '../utils/fs';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

export interface CleanOptions {
  dryRun?: boolean;       // -n: Just show what would be deleted
  force?: boolean;        // -f: Actually delete files
  directories?: boolean;  // -d: Also delete directories
  ignored?: boolean;      // -x: Also delete ignored files
  excludePattern?: string[];  // -e: Exclude patterns
  paths?: string[];       // Specific paths to clean
}

export interface CleanResult {
  deletedFiles: string[];
  deletedDirs: string[];
  skippedFiles: string[];
  errors: { path: string; error: string }[];
}

/**
 * Get all untracked files and directories
 */
export function getUntrackedItems(
  repo: Repository, 
  options: CleanOptions = {}
): { files: string[]; directories: string[] } {
  const status = repo.status();
  const workDir = repo.workDir;
  
  // Get untracked files from status
  const untrackedFiles: string[] = [...status.untracked];
  const untrackedDirs: Set<string> = new Set();

  // Get ignore patterns (if not cleaning ignored files)
  const ignorePatterns = options.ignored ? [] : loadIgnorePatterns(workDir);
  
  // Add exclude patterns
  if (options.excludePattern) {
    ignorePatterns.push(...options.excludePattern);
  }

  // Find untracked directories
  if (options.directories) {
    const indexEntries = repo.index.getEntriesMap();
    const trackedDirs = new Set<string>();
    
    // Collect all tracked directory paths
    for (const [filePath] of indexEntries) {
      let dir = path.dirname(filePath);
      while (dir !== '.') {
        trackedDirs.add(dir);
        dir = path.dirname(dir);
      }
    }

    // Walk directory to find untracked directories
    function findUntrackedDirs(dir: string, relativePath: string = ''): void {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const entryRelPath = relativePath 
            ? path.join(relativePath, entry.name) 
            : entry.name;
          const fullPath = path.join(dir, entry.name);

          // Skip .tsgit, .git, node_modules
          if (entry.name === '.tsgit' || entry.name === '.git' || entry.name === 'node_modules') {
            continue;
          }

          // Check if ignored
          if (!options.ignored && ignorePatterns.some(p => matchesIgnorePattern(entryRelPath, p))) {
            continue;
          }

          if (entry.isDirectory()) {
            // Check if this directory or any of its children are tracked
            const hasTrackedContent = Array.from(indexEntries.keys()).some(
              f => f.startsWith(entryRelPath + '/')
            );
            
            if (!hasTrackedContent) {
              untrackedDirs.add(entryRelPath);
            } else {
              // Recurse into partially tracked directories
              findUntrackedDirs(fullPath, entryRelPath);
            }
          }
        }
      } catch {
        // Ignore read errors
      }
    }

    findUntrackedDirs(workDir);
  }

  // Filter by paths if specified
  let filteredFiles = untrackedFiles;
  let filteredDirs = Array.from(untrackedDirs);

  if (options.paths && options.paths.length > 0) {
    filteredFiles = untrackedFiles.filter(f => 
      options.paths!.some(p => f.startsWith(p) || f === p)
    );
    filteredDirs = filteredDirs.filter(d =>
      options.paths!.some(p => d.startsWith(p) || d === p)
    );
  }

  // Filter out ignored files (unless -x is specified)
  if (!options.ignored) {
    filteredFiles = filteredFiles.filter(f => 
      !ignorePatterns.some(p => matchesIgnorePattern(f, p))
    );
  }

  return {
    files: filteredFiles.sort(),
    directories: filteredDirs.sort(),
  };
}

/**
 * Clean (delete) untracked files and directories
 */
export function clean(repo: Repository, options: CleanOptions = {}): CleanResult {
  const result: CleanResult = {
    deletedFiles: [],
    deletedDirs: [],
    skippedFiles: [],
    errors: [],
  };

  // Safety check: require -f or -n
  if (!options.force && !options.dryRun) {
    throw new TsgitError(
      'Clean requires -f (force) or -n (dry-run) to prevent accidental data loss',
      ErrorCode.OPERATION_FAILED,
      [
        'tsgit clean -n    # Preview what would be deleted',
        'tsgit clean -f    # Actually delete files'
      ]
    );
  }

  const { files, directories } = getUntrackedItems(repo, options);
  const workDir = repo.workDir;

  // Delete files
  for (const file of files) {
    const fullPath = path.join(workDir, file);
    
    if (options.dryRun) {
      result.deletedFiles.push(file);
    } else {
      try {
        fs.unlinkSync(fullPath);
        result.deletedFiles.push(file);
      } catch (err) {
        result.errors.push({
          path: file,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
  }

  // Delete directories (deepest first to handle nested dirs)
  if (options.directories) {
    // Sort by depth (deepest first)
    const sortedDirs = directories.sort((a, b) => {
      const depthA = a.split(path.sep).length;
      const depthB = b.split(path.sep).length;
      return depthB - depthA;
    });

    for (const dir of sortedDirs) {
      const fullPath = path.join(workDir, dir);
      
      if (options.dryRun) {
        result.deletedDirs.push(dir);
      } else {
        try {
          fs.rmSync(fullPath, { recursive: true });
          result.deletedDirs.push(dir);
        } catch (err) {
          result.errors.push({
            path: dir,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    }
  }

  return result;
}

/**
 * CLI handler for clean command
 */
export function handleClean(args: string[]): void {
  const repo = Repository.find();
  
  const options: CleanOptions = {
    dryRun: false,
    force: false,
    directories: false,
    ignored: false,
    excludePattern: [],
    paths: [],
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-n' || arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '-f' || arg === '--force') {
      options.force = true;
    } else if (arg === '-d' || arg === '--directories') {
      options.directories = true;
    } else if (arg === '-x' || arg === '--ignored') {
      options.ignored = true;
    } else if (arg === '-e' || arg === '--exclude') {
      if (i + 1 < args.length) {
        options.excludePattern!.push(args[++i]);
      }
    } else if (arg === '-fd' || arg === '-df') {
      options.force = true;
      options.directories = true;
    } else if (arg === '-fx' || arg === '-xf') {
      options.force = true;
      options.ignored = true;
    } else if (arg === '-fdx' || arg === '-fxd' || arg === '-xfd' || arg === '-xdf' || arg === '-dfx' || arg === '-dxf') {
      options.force = true;
      options.directories = true;
      options.ignored = true;
    } else if (!arg.startsWith('-')) {
      options.paths!.push(arg);
    }
  }

  try {
    // Show preview first if dry-run
    if (options.dryRun) {
      const { files, directories } = getUntrackedItems(repo, options);
      
      if (files.length === 0 && directories.length === 0) {
        console.log(colors.dim('Nothing to clean'));
        return;
      }

      console.log(colors.bold('Would remove:'));
      console.log();

      for (const file of files) {
        console.log(`  ${colors.red('×')} ${file}`);
      }

      if (options.directories) {
        for (const dir of directories) {
          console.log(`  ${colors.red('×')} ${dir}${path.sep}`);
        }
      }

      console.log();
      console.log(colors.dim(`${files.length} file(s)` + 
        (options.directories ? `, ${directories.length} directory(ies)` : '')));
      console.log();
      console.log(colors.cyan('Use -f to actually delete these files'));
      return;
    }

    // Actually clean
    const result = clean(repo, options);

    if (result.deletedFiles.length === 0 && result.deletedDirs.length === 0) {
      console.log(colors.dim('Nothing to clean'));
      return;
    }

    // Show what was deleted
    for (const file of result.deletedFiles) {
      console.log(`${colors.green('✓')} Removed ${file}`);
    }

    for (const dir of result.deletedDirs) {
      console.log(`${colors.green('✓')} Removed ${dir}${path.sep}`);
    }

    // Show errors
    for (const { path: errPath, error } of result.errors) {
      console.log(`${colors.red('✗')} Failed to remove ${errPath}: ${error}`);
    }

    console.log();
    console.log(colors.green('✓') + ` Removed ${result.deletedFiles.length} file(s)` +
      (options.directories ? `, ${result.deletedDirs.length} directory(ies)` : ''));

  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(colors.red('error: ') + error.message);
    }
    process.exit(1);
  }
}
