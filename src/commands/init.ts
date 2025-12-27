import * as path from 'path';
import * as readline from 'readline';
import { Repository } from '../core/repository';
import { TsgitError, Errors } from '../core/errors';
import { exists, mkdirp } from '../utils/fs';
import { 
  migrateFromGit, 
  canMigrateGitRepo, 
  getMigrationStats,
  MigrationProgress,
  MigrationResult 
} from '../core/git-migration';
import { HashAlgorithm } from '../utils/hash';
import { CHUNK_THRESHOLD } from '../core/large-file';

/**
 * Init command options
 */
export interface InitOptions {
  /** Migrate from existing Git repository */
  migrateGit?: boolean;
  /** Skip migration even if .git exists */
  noMigrate?: boolean;
  /** Import from a different Git repository path */
  fromGit?: string;
  /** Hash algorithm to use (sha1 or sha256) */
  hashAlgorithm?: HashAlgorithm;
  /** Skip confirmation prompt */
  yes?: boolean;
}

/**
 * Initialize a new wit repository
 */
export function init(directory: string = '.', options: InitOptions = {}): void {
  initAsync(directory, options).catch((error) => {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(`error: ${error.message}`);
    }
    process.exit(1);
  });
}

/**
 * Async implementation of init
 */
async function initAsync(directory: string = '.', options: InitOptions = {}): Promise<void> {
  const absolutePath = path.resolve(directory);
  
  // Check if already a wit repository
  const witDir = path.join(absolutePath, '.wit');
  if (exists(witDir)) {
    throw Errors.repositoryExists(absolutePath);
  }
  
  // Determine the source Git directory
  let gitDir: string | null = null;
  
  if (options.fromGit) {
    // Import from specified Git repository
    gitDir = path.resolve(options.fromGit);
    if (!exists(gitDir)) {
      throw new Error(`Git directory not found: ${options.fromGit}`);
    }
    // Handle both /path/to/repo and /path/to/repo/.git
    if (!gitDir.endsWith('.git') && exists(path.join(gitDir, '.git'))) {
      gitDir = path.join(gitDir, '.git');
    }
  } else if (!options.noMigrate) {
    // Check for existing .git directory
    const localGitDir = path.join(absolutePath, '.git');
    if (exists(localGitDir)) {
      gitDir = localGitDir;
    }
  }
  
  // If we found a Git repository and migration is not disabled
  if (gitDir && !options.noMigrate) {
    // Check if we should migrate
    const shouldMigrate = options.migrateGit || options.fromGit || 
      await promptForMigration(gitDir, options.yes);
    
    if (shouldMigrate) {
      await performMigration(absolutePath, gitDir, options);
      return;
    }
    
    // User chose not to migrate - warn them
    if (!options.noMigrate) {
      console.log('\nNote: Creating fresh wit repository. Git history will not be migrated.');
      console.log('To migrate later, use: wit init --migrate-git\n');
    }
  }
  
  // Standard initialization (no migration)
  try {
    const repo = Repository.init(directory, { 
      hashAlgorithm: options.hashAlgorithm 
    });
    console.log(`Initialized empty wit repository in ${repo.gitDir}`);
  } catch (error) {
    if (error instanceof TsgitError) {
      throw error;
    } else if (error instanceof Error) {
      // Handle permission errors
      if (error.message.includes('EACCES') || error.message.includes('permission')) {
        console.error(`error: Permission denied: ${directory}`);
        console.error('\nhint:');
        console.error('  Check directory permissions');
        console.error('  Try: sudo wit init (if appropriate)');
        process.exit(1);
      } else if (error.message.includes('ENOENT')) {
        console.error(`error: Directory does not exist: ${directory}`);
        console.error('\nhint:');
        console.error(`  mkdir -p ${directory}    # Create directory first`);
        process.exit(1);
      } else {
        throw error;
      }
    }
  }
}

/**
 * Prompt user for migration confirmation
 */
async function promptForMigration(gitDir: string, autoYes?: boolean): Promise<boolean> {
  if (autoYes) {
    return true;
  }
  
  // Get stats to show the user
  console.log('\nExisting Git repository detected.');
  
  try {
    const stats = await getMigrationStats(gitDir);
    console.log(`  Objects: ~${stats.objectCount.toLocaleString()}`);
    console.log(`  Branches: ${stats.branches}`);
    console.log(`  Tags: ${stats.tags}`);
    if (stats.hasPackFiles) {
      console.log('  (includes packed objects)');
    }
  } catch {
    // Ignore stats errors
  }
  
  // Check for issues
  const { canMigrate, issues } = canMigrateGitRepo(gitDir);
  
  if (issues.length > 0) {
    console.log('\nWarnings:');
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
  }
  
  if (!canMigrate) {
    console.log('\nCannot migrate: repository has critical issues.');
    return false;
  }
  
  // Interactive prompt
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    rl.question('\nMigrate Git history to wit? [Y/n] ', (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === '' || normalized === 'y' || normalized === 'yes');
    });
  });
}

/**
 * Perform the Git to wit migration
 */
async function performMigration(
  workDir: string, 
  gitDir: string, 
  options: InitOptions
): Promise<void> {
  const witDir = path.join(workDir, '.wit');
  const hashAlgorithm = options.hashAlgorithm || 'sha256';
  
  console.log(`\nMigrating Git repository to wit (using ${hashAlgorithm})...`);
  
  // Create wit directory structure
  mkdirp(path.join(witDir, 'objects'));
  mkdirp(path.join(witDir, 'refs', 'heads'));
  mkdirp(path.join(witDir, 'refs', 'tags'));
  mkdirp(path.join(witDir, 'info'));
  
  // Track progress
  let lastPhase = '';
  let spinnerIndex = 0;
  const spinnerChars = ['|', '/', '-', '\\'];
  
  const onProgress = (progress: MigrationProgress) => {
    if (progress.phase !== lastPhase) {
      if (lastPhase) console.log(); // New line after previous phase
      lastPhase = progress.phase;
    }
    
    const spinner = spinnerChars[spinnerIndex++ % spinnerChars.length];
    const percent = progress.total > 0 
      ? Math.round((progress.current / progress.total) * 100)
      : 0;
    
    switch (progress.phase) {
      case 'scanning':
        process.stdout.write(`\r${spinner} Scanning: ${progress.message || 'searching...'}`);
        break;
      case 'objects':
        process.stdout.write(
          `\r${spinner} Migrating objects: ${progress.current}/${progress.total} (${percent}%) ` +
          `${progress.currentItem || ''}`
        );
        break;
      case 'refs':
        process.stdout.write(`\r${spinner} Migrating refs...`);
        break;
      case 'head':
        process.stdout.write(`\r${spinner} Migrating HEAD...`);
        break;
      case 'complete':
        console.log(); // Final newline
        break;
    }
  };
  
  try {
    const result = await migrateFromGit({
      gitDir,
      witDir,
      hashAlgorithm,
      onProgress,
    });
    
    // Create config file
    const config = `[core]
    repositoryformatversion = 1
    filemode = true
    bare = false
[wit]
    hashAlgorithm = ${hashAlgorithm}
    largeFileThreshold = ${CHUNK_THRESHOLD}
    autoStashOnSwitch = true
    migratedFromGit = true
`;
    const configPath = path.join(witDir, 'config');
    require('fs').writeFileSync(configPath, config);
    
    // Create description
    const descPath = path.join(witDir, 'description');
    require('fs').writeFileSync(
      descPath, 
      'Unnamed repository; edit this file to name the repository.\n'
    );
    
    // Initialize feature directories (from Repository class)
    const repo = new Repository(workDir);
    repo.journal.init();
    repo.largeFiles.init();
    repo.branchState.init();
    repo.scopeManager.init();
    repo.hooks.init();
    repo.remotes.init();
    repo.branchProtection.getManager().init();
    repo.collaborators.init();
    
    // Print summary
    console.log('\nMigration complete!');
    console.log(`  Commits: ${result.commits.toLocaleString()}`);
    console.log(`  Trees: ${result.trees.toLocaleString()}`);
    console.log(`  Blobs: ${result.blobs.toLocaleString()}`);
    if (result.tags > 0) {
      console.log(`  Tag objects: ${result.tags}`);
    }
    console.log(`  Branches: ${result.branches}`);
    console.log(`  Tags: ${result.tagRefs}`);
    
    if (result.errors.length > 0) {
      console.log('\nWarnings during migration:');
      for (const error of result.errors.slice(0, 5)) {
        console.log(`  - ${error}`);
      }
      if (result.errors.length > 5) {
        console.log(`  ... and ${result.errors.length - 5} more`);
      }
    }
    
    console.log(`\nRepository initialized in ${witDir}`);
    console.log('Hash mapping saved to .wit/git-migration-map');
    
    if (hashAlgorithm === 'sha256') {
      console.log('\nNote: Objects have been re-hashed with SHA-256.');
      console.log('Original Git SHA-1 hashes are preserved in the mapping file.');
    }
    
  } catch (error) {
    // Clean up partial migration
    try {
      require('fs').rmSync(witDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Parse init command arguments
 */
export function parseInitArgs(args: string[]): { directory: string; options: InitOptions } {
  const options: InitOptions = {};
  let directory = '.';
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--migrate-git') {
      options.migrateGit = true;
    } else if (arg === '--no-migrate') {
      options.noMigrate = true;
    } else if (arg === '--from-git') {
      options.fromGit = args[++i];
    } else if (arg === '--hash' || arg === '--hash-algorithm') {
      const algo = args[++i];
      if (algo === 'sha1' || algo === 'sha256') {
        options.hashAlgorithm = algo;
      } else {
        throw new Error(`Invalid hash algorithm: ${algo}. Use 'sha1' or 'sha256'.`);
      }
    } else if (arg === '-y' || arg === '--yes') {
      options.yes = true;
    } else if (!arg.startsWith('-')) {
      directory = arg;
    }
  }
  
  return { directory, options };
}
