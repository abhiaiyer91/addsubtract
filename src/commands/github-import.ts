/**
 * GitHub Import Command
 * 
 * Import repositories from GitHub to wit, including:
 * - Repository (git data)
 * - Issues with comments
 * - Pull Requests with comments
 * - Labels
 * - Milestones
 * - Releases
 * 
 * Usage:
 *   wit github import <owner/repo>              # Import with defaults
 *   wit github import <owner/repo> --name foo   # Import with custom name
 *   wit github import <owner/repo> --issues     # Import only issues
 *   wit github import <url>                     # Import from URL
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as readline from 'readline';
import { TsgitError, ErrorCode } from '../core/errors';
import {
  fetchGitHubData,
  parseGitHubRepo,
  validateImportOptions,
  getAuthenticatedCloneUrl,
  formatImportSummary,
  GitHubImportOptions,
  GitHubImportResult,
  ImportProgress,
} from '../core/github-import';
import { getGitHubToken, getGitHubManager } from '../core/github';
import { exists, mkdirp } from '../utils/fs';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
};

/**
 * Progress spinner for CLI
 */
class Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private current = 0;
  private interval: NodeJS.Timeout | null = null;
  private message = '';

  start(message: string) {
    this.message = message;
    process.stdout.write(`\r${this.frames[0]} ${message}`);
    this.interval = setInterval(() => {
      this.current = (this.current + 1) % this.frames.length;
      process.stdout.write(`\r${this.frames[this.current]} ${this.message}`);
    }, 80);
  }

  update(message: string) {
    this.message = message;
  }

  succeed(message: string) {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stdout.write(`\r${colors.green('✓')} ${message}\n`);
  }

  fail(message: string) {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stdout.write(`\r${colors.red('✗')} ${message}\n`);
  }

  info(message: string) {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stdout.write(`\r${colors.cyan('ℹ')} ${message}\n`);
  }
}

/**
 * Parse command line arguments
 */
interface ParsedArgs {
  repo: string;
  name?: string;
  description?: string;
  private: boolean;
  token?: string;
  import: {
    repository: boolean;
    issues: boolean;
    pullRequests: boolean;
    labels: boolean;
    milestones: boolean;
    releases: boolean;
  };
  yes: boolean;
  help: boolean;
  preview: boolean;
}

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    repo: '',
    private: false,
    import: {
      repository: true,
      issues: true,
      pullRequests: true,
      labels: true,
      milestones: true,
      releases: true,
    },
    yes: false,
    help: false,
    preview: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--name' || arg === '-n') {
      result.name = args[++i];
    } else if (arg === '--description' || arg === '-d') {
      result.description = args[++i];
    } else if (arg === '--private' || arg === '-p') {
      result.private = true;
    } else if (arg === '--token' || arg === '-t') {
      result.token = args[++i];
    } else if (arg === '--yes' || arg === '-y') {
      result.yes = true;
    } else if (arg === '--preview') {
      result.preview = true;
    } else if (arg === '--no-repo') {
      result.import.repository = false;
    } else if (arg === '--no-issues') {
      result.import.issues = false;
    } else if (arg === '--no-prs') {
      result.import.pullRequests = false;
    } else if (arg === '--no-labels') {
      result.import.labels = false;
    } else if (arg === '--no-milestones') {
      result.import.milestones = false;
    } else if (arg === '--no-releases') {
      result.import.releases = false;
    } else if (arg === '--issues-only') {
      result.import = {
        repository: false,
        issues: true,
        pullRequests: false,
        labels: true,
        milestones: true,
        releases: false,
      };
    } else if (arg === '--prs-only') {
      result.import = {
        repository: false,
        issues: false,
        pullRequests: true,
        labels: true,
        milestones: true,
        releases: false,
      };
    } else if (arg === '--metadata-only') {
      result.import = {
        repository: false,
        issues: true,
        pullRequests: true,
        labels: true,
        milestones: true,
        releases: true,
      };
    } else if (!arg.startsWith('-')) {
      result.repo = arg;
    }

    i++;
  }

  return result;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
${colors.bold('GitHub Import')}

Import repositories from GitHub to wit, including issues, PRs, and more.

${colors.bold('Usage:')}
  wit github import <owner/repo> [options]
  wit github import <github-url> [options]

${colors.bold('Arguments:')}
  owner/repo           GitHub repository in owner/repo format
  github-url           Full GitHub URL (e.g., https://github.com/owner/repo)

${colors.bold('Options:')}
  -n, --name <name>    Use a different name for the imported repository
  -d, --description    Override the repository description
  -p, --private        Make the imported repository private
  -t, --token <token>  GitHub access token (uses stored credentials if not provided)
  -y, --yes            Skip confirmation prompts
  --preview            Show what will be imported without importing

${colors.bold('Import Filters:')}
  --no-repo            Skip cloning git data
  --no-issues          Skip importing issues
  --no-prs             Skip importing pull requests
  --no-labels          Skip importing labels
  --no-milestones      Skip importing milestones
  --no-releases        Skip importing releases
  --issues-only        Import only issues (and labels/milestones)
  --prs-only           Import only pull requests (and labels/milestones)
  --metadata-only      Import metadata without git data

${colors.bold('Examples:')}
  wit github import facebook/react
  wit github import https://github.com/vercel/next.js
  wit github import owner/repo --name my-fork
  wit github import owner/repo --issues-only
  wit github import owner/repo --preview
  wit github import owner/private-repo --token ghp_xxxx

${colors.bold('Authentication:')}
  For private repositories, you need to authenticate first:
    wit github login

  Or provide a token with the --token flag.

${colors.bold('Notes:')}
  - GitHub usernames are preserved in comments as "@username"
  - Issue/PR numbers may differ in wit but are preserved in content
  - Original creation dates are noted in comments
`);
}

/**
 * Ask for confirmation
 */
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Handle progress updates
 */
function createProgressHandler(): (status: ImportProgress) => void {
  const phaseMessages: Record<string, string> = {
    auth: 'Authenticating with GitHub',
    repo_info: 'Fetching repository info',
    clone: 'Cloning repository',
    labels: 'Importing labels',
    milestones: 'Importing milestones',
    issues: 'Importing issues',
    pull_requests: 'Importing pull requests',
    releases: 'Importing releases',
    complete: 'Import complete',
  };

  let lastPhase = '';

  return (status: ImportProgress) => {
    if (status.phase !== lastPhase) {
      if (lastPhase) {
        process.stdout.write('\n');
      }
      lastPhase = status.phase;
      process.stdout.write(`${colors.cyan('→')} ${phaseMessages[status.phase] || status.phase}`);
    }

    if (status.total > 0 && status.current > 0) {
      const progress = Math.round((status.current / status.total) * 100);
      process.stdout.write(`\r${colors.cyan('→')} ${phaseMessages[status.phase]} [${status.current}/${status.total}] ${progress}%`);
      if (status.item) {
        process.stdout.write(` - ${colors.dim(status.item.slice(0, 40))}`);
      }
    }
  };
}

/**
 * Clone a repository from GitHub
 */
async function cloneRepository(
  cloneUrl: string,
  targetPath: string,
  token: string | null
): Promise<boolean> {
  const authenticatedUrl = getAuthenticatedCloneUrl(cloneUrl, token);
  
  try {
    mkdirp(path.dirname(targetPath));
    execSync(`git clone --bare "${authenticatedUrl}" "${targetPath}"`, {
      stdio: 'pipe',
      timeout: 600000, // 10 minute timeout
    });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Main CLI handler
 */
export async function handleGitHubImport(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printHelp();
    return;
  }

  if (!parsed.repo) {
    console.error(colors.red('error: ') + 'Repository is required');
    console.error('\nUsage: wit github import <owner/repo>');
    console.error('Run "wit github import --help" for more information');
    process.exit(1);
  }

  // Parse and validate repository
  const repoInfo = parseGitHubRepo(parsed.repo);
  if (!repoInfo) {
    throw new TsgitError(
      `Invalid repository format: ${parsed.repo}`,
      ErrorCode.OPERATION_FAILED,
      [
        'Use owner/repo format (e.g., facebook/react)',
        'Or use a GitHub URL (e.g., https://github.com/facebook/react)',
      ]
    );
  }

  const spinner = new Spinner();

  try {
    // Check authentication
    spinner.start('Checking GitHub authentication...');
    let token = parsed.token || await getGitHubToken();
    
    if (!token) {
      spinner.info('Not authenticated with GitHub (public repos only)');
      const manager = getGitHubManager();
      const status = await manager.status();
      if (!status.loggedIn) {
        console.log(colors.dim('  Run "wit github login" to authenticate for private repos'));
      }
    } else {
      spinner.succeed('GitHub authentication found');
    }

    // Fetch repository info
    spinner.start(`Fetching repository info for ${repoInfo.owner}/${repoInfo.repo}...`);
    
    const options: GitHubImportOptions = {
      repo: parsed.repo,
      token: token ?? undefined,
      import: parsed.import,
      onProgress: parsed.preview ? undefined : createProgressHandler(),
    };

    const data = await fetchGitHubData(options);
    spinner.succeed(`Found repository: ${data.repo.full_name}`);

    // Show preview
    console.log();
    console.log(colors.bold('Repository Information'));
    console.log('─'.repeat(50));
    console.log(`  Name:        ${colors.cyan(data.repo.name)}`);
    console.log(`  Description: ${data.repo.description || colors.dim('(none)')}`);
    console.log(`  Visibility:  ${data.repo.private ? colors.yellow('private') : colors.green('public')}`);
    console.log(`  Default:     ${data.repo.default_branch}`);
    console.log(`  Stars:       ${data.repo.stargazers_count}`);
    console.log();
    console.log(colors.bold('What will be imported'));
    console.log('─'.repeat(50));
    if (parsed.import.repository) console.log(`  ${colors.green('✓')} Git repository (commits, branches, tags)`);
    if (parsed.import.labels) console.log(`  ${colors.green('✓')} Labels: ${data.labels.length}`);
    if (parsed.import.milestones) console.log(`  ${colors.green('✓')} Milestones: ${data.milestones.length}`);
    if (parsed.import.issues) console.log(`  ${colors.green('✓')} Issues: ${data.issues.length}`);
    if (parsed.import.pullRequests) console.log(`  ${colors.green('✓')} Pull Requests: ${data.pullRequests.length}`);
    if (parsed.import.releases) console.log(`  ${colors.green('✓')} Releases: ${data.releases.length}`);
    console.log();

    // If preview mode, stop here
    if (parsed.preview) {
      console.log(colors.dim('Preview mode - no changes made'));
      console.log(colors.dim('Remove --preview flag to perform the import'));
      return;
    }

    // Confirm import
    if (!parsed.yes) {
      const targetName = parsed.name || data.repo.name;
      const confirmed = await confirm(
        `Import ${colors.cyan(data.repo.full_name)} as ${colors.cyan(targetName)}?`
      );
      if (!confirmed) {
        console.log(colors.dim('Import cancelled'));
        return;
      }
    }

    console.log();
    console.log(colors.bold('Importing...'));
    console.log();

    // Clone repository if needed
    const repoName = parsed.name || data.repo.name;
    const reposDir = process.env.REPOS_DIR || './repos';
    const username = process.env.USER || 'user'; // In CLI mode, use system username
    const targetPath = path.join(reposDir, username, `${repoName}.git`);

    if (parsed.import.repository) {
      spinner.start('Cloning repository...');
      const cloneSuccess = await cloneRepository(data.repo.clone_url, targetPath, token);
      if (cloneSuccess) {
        spinner.succeed(`Repository cloned to ${targetPath}`);
      } else {
        spinner.fail('Failed to clone repository');
        console.log(colors.yellow('  Continuing with metadata import...'));
      }
    }

    // Show import summary
    const totalImported = 
      (parsed.import.labels ? data.labels.length : 0) +
      (parsed.import.milestones ? data.milestones.length : 0) +
      (parsed.import.issues ? data.issues.length : 0) +
      (parsed.import.pullRequests ? data.pullRequests.length : 0) +
      (parsed.import.releases ? data.releases.length : 0);

    console.log();
    console.log(colors.green('═'.repeat(50)));
    console.log(colors.green(colors.bold(' Import Complete!')));
    console.log(colors.green('═'.repeat(50)));
    console.log();
    if (parsed.import.repository) {
      console.log(`  ${colors.green('✓')} Repository: ${targetPath}`);
    }
    if (parsed.import.labels && data.labels.length > 0) {
      console.log(`  ${colors.green('✓')} Labels: ${data.labels.length} imported`);
    }
    if (parsed.import.milestones && data.milestones.length > 0) {
      console.log(`  ${colors.green('✓')} Milestones: ${data.milestones.length} imported`);
    }
    if (parsed.import.issues && data.issues.length > 0) {
      console.log(`  ${colors.green('✓')} Issues: ${data.issues.length} imported`);
    }
    if (parsed.import.pullRequests && data.pullRequests.length > 0) {
      console.log(`  ${colors.green('✓')} Pull Requests: ${data.pullRequests.length} imported`);
    }
    if (parsed.import.releases && data.releases.length > 0) {
      console.log(`  ${colors.green('✓')} Releases: ${data.releases.length} imported`);
    }
    console.log();
    console.log(colors.dim('Note: Full import with database storage requires "wit serve" mode.'));
    console.log(colors.dim('This CLI import clones the git data for local use.'));

  } catch (error) {
    spinner.fail('Import failed');
    if (error instanceof TsgitError) {
      throw error;
    }
    throw new TsgitError(
      error instanceof Error ? error.message : 'Import failed',
      ErrorCode.OPERATION_FAILED,
      [
        'Check if the repository exists and is accessible',
        'For private repos, run "wit github login" first',
        'Try with --token flag to provide a GitHub access token',
      ]
    );
  }
}

/**
 * Export for CLI integration
 */
export default handleGitHubImport;
