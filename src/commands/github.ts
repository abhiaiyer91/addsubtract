/**
 * GitHub Command
 * Manage GitHub authentication for push/pull operations
 * 
 * Usage:
 *   wit github login           # Authenticate with GitHub
 *   wit github logout          # Remove stored credentials
 *   wit github status          # Show authentication status
 *   wit github token           # Print the current token (for scripting)
 */

import { TsgitError, ErrorCode } from '../core/errors';
import {
  GitHubManager,
  getGitHubManager,
  loadGitHubCredentials,
  getGitHubToken,
} from '../core/github';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

/**
 * Handle the github login subcommand
 */
async function handleLogin(): Promise<void> {
  const manager = getGitHubManager();

  // Check if already logged in
  const status = await manager.status();
  if (status.loggedIn) {
    console.log(colors.yellow('!') + ` Already logged in as ${colors.bold(status.username || 'unknown')}`);
    console.log(colors.dim('  Use "wit github logout" to log out first'));
    return;
  }

  console.log(colors.cyan('ℹ') + ' Starting GitHub authentication...');
  
  try {
    const { user } = await manager.login();
    
    console.log();
    console.log(colors.green('✓') + ` Successfully authenticated as ${colors.bold(user.login)}`);
    if (user.name) {
      console.log(colors.dim(`  ${user.name}`));
    }
    console.log();
    console.log(colors.dim('You can now push and pull from GitHub repositories.'));
  } catch (error) {
    if (error instanceof Error) {
      throw new TsgitError(
        `GitHub authentication failed: ${error.message}`,
        ErrorCode.OPERATION_FAILED,
        [
          'Make sure you have internet connectivity',
          'Try running "wit github login" again',
          'You can also set GITHUB_TOKEN environment variable',
        ]
      );
    }
    throw error;
  }
}

/**
 * Handle the github logout subcommand
 */
async function handleLogout(): Promise<void> {
  const manager = getGitHubManager();

  // Check if we have env token
  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) {
    console.log(colors.yellow('!') + ' GitHub token is set via environment variable');
    console.log(colors.dim('  Unset GITHUB_TOKEN or GH_TOKEN to fully log out'));
  }

  const removed = manager.logout();
  
  if (removed) {
    console.log(colors.green('✓') + ' Logged out from GitHub');
    console.log(colors.dim('  Stored credentials have been removed'));
  } else {
    console.log(colors.dim('No stored GitHub credentials found'));
  }
}

/**
 * Handle the github status subcommand
 */
async function handleStatus(): Promise<void> {
  const manager = getGitHubManager();
  const status = await manager.status();

  console.log();
  console.log(colors.bold('GitHub Authentication Status'));
  console.log('─'.repeat(40));

  if (status.loggedIn) {
    console.log(`  Status:   ${colors.green('✓ Authenticated')}`);
    console.log(`  Username: ${colors.bold(status.username || 'unknown')}`);
    console.log(`  Source:   ${status.source === 'environment' ? 'Environment variable' : 'Stored credentials'}`);
    
    // Show additional info from stored credentials
    const stored = loadGitHubCredentials();
    if (stored) {
      const createdAt = new Date(stored.created_at);
      console.log(`  Scope:    ${stored.scope}`);
      console.log(`  Created:  ${createdAt.toLocaleDateString()}`);
    }
  } else {
    console.log(`  Status:   ${colors.red('✗ Not authenticated')}`);
    console.log();
    console.log(colors.dim('  Run "wit github login" to authenticate'));
    console.log(colors.dim('  Or set GITHUB_TOKEN environment variable'));
  }

  console.log();
}

/**
 * Handle the github token subcommand (for scripting)
 */
async function handleToken(): Promise<void> {
  const token = await getGitHubToken();
  
  if (token) {
    // Just print the token, no extra output for scripting
    console.log(token);
  } else {
    // Exit with error code for scripting
    process.stderr.write('Not authenticated with GitHub\n');
    process.exit(1);
  }
}

/**
 * Print usage help for github command
 */
function printHelp(): void {
  console.log(`
${colors.bold('GitHub Integration')}

Authenticate with GitHub to enable push/pull operations for private repositories
and to increase API rate limits.

${colors.bold('Usage:')}
  wit github <subcommand>

${colors.bold('Subcommands:')}
  login     Authenticate with GitHub using device flow
  logout    Remove stored GitHub credentials
  status    Show current authentication status
  token     Print the current access token (for scripting)

${colors.bold('Examples:')}
  wit github login      # Start interactive login
  wit github status     # Check if you're logged in
  wit github logout     # Log out from GitHub

${colors.bold('Environment Variables:')}
  GITHUB_TOKEN          GitHub personal access token
  GH_TOKEN              Alternative to GITHUB_TOKEN (GitHub CLI compatible)

${colors.bold('Notes:')}
  - The device flow opens a browser for secure authentication
  - Credentials are stored securely in ~/.wit/github-credentials.json
  - You can also use environment variables instead of logging in
  - For CI/CD, prefer using GITHUB_TOKEN environment variable
`);
}

/**
 * Main CLI handler for the github command
 */
export async function handleGitHub(args: string[]): Promise<void> {
  const subcommand = args[0];

  // Check for help flag
  if (args.includes('--help') || args.includes('-h') || subcommand === 'help') {
    printHelp();
    return;
  }

  switch (subcommand) {
    case 'login':
      await handleLogin();
      break;

    case 'logout':
      await handleLogout();
      break;

    case 'status':
      await handleStatus();
      break;

    case 'token':
      await handleToken();
      break;

    case undefined:
      // No subcommand - show status by default
      await handleStatus();
      break;

    default:
      console.error(colors.red('error: ') + `Unknown github subcommand: '${subcommand}'`);
      console.error();
      console.error('Available subcommands: login, logout, status, token');
      console.error('Run "wit github --help" for more information');
      process.exit(1);
  }
}

/**
 * Exported functions for programmatic use
 */
export { GitHubManager, getGitHubManager } from '../core/github';
