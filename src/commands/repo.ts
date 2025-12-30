/**
 * Repository management commands
 * 
 * Provides commands for transferring repositories between users and organizations.
 */

import { createApiClient, getAuthToken } from '../api/client';

export const REPO_HELP = `
Repository Management Commands

Usage: wit repo <subcommand> [options]

Subcommands:
  transfer <owner/repo> <new-owner>    Transfer repository to another user or org

Transfer Options:
  --org                                Transfer to an organization (default: user)

Examples:
  wit repo transfer myuser/myrepo newuser
  wit repo transfer myuser/myrepo myorg --org
  wit repo transfer acme-org/project other-org --org

Notes:
  - You must be the owner of the repository to transfer it
  - When transferring to an organization, you must be an admin/owner of that org
  - The repository name must not already exist for the target owner
  - All issues, PRs, collaborators, and settings are preserved
`;

interface TransferOptions {
  toOrg?: boolean;
}

/**
 * Handle the repo command
 */
export async function handleRepo(args: string[]): Promise<void> {
  if (args.length === 0 || args[0] === 'help' || args.includes('--help') || args.includes('-h')) {
    console.log(REPO_HELP);
    return;
  }

  const subcommand = args[0];
  const subArgs = args.slice(1);

  switch (subcommand) {
    case 'transfer':
      await handleTransfer(subArgs);
      break;

    default:
      console.error(`Unknown repo subcommand: ${subcommand}`);
      console.error('Run "wit repo help" for usage information.');
      process.exit(1);
  }
}

/**
 * Handle the transfer subcommand
 */
async function handleTransfer(args: string[]): Promise<void> {
  // Parse arguments
  const options: TransferOptions = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--org' || arg === '-o') {
      options.toOrg = true;
    } else if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    } else {
      positional.push(arg);
    }
  }

  if (positional.length < 2) {
    console.error('Usage: wit repo transfer <owner/repo> <new-owner> [--org]');
    console.error('');
    console.error('Examples:');
    console.error('  wit repo transfer alice/myrepo bob');
    console.error('  wit repo transfer alice/myrepo acme-corp --org');
    process.exit(1);
  }

  const repoPath = positional[0];
  const newOwner = positional[1];
  const newOwnerType = options.toOrg ? 'organization' : 'user';

  // Parse owner/repo
  const parts = repoPath.split('/');
  if (parts.length !== 2) {
    console.error('Repository must be in the format: owner/repo');
    process.exit(1);
  }

  const [currentOwner, repoName] = parts;

  // Check for auth token
  const token = getAuthToken();
  if (!token) {
    console.error('Authentication required. Please log in first.');
    console.error('');
    console.error('To authenticate:');
    console.error('  1. Start the server: wit up');
    console.error('  2. Create a token via the web UI or API');
    console.error('  3. Set WIT_TOKEN environment variable');
    process.exit(1);
  }

  console.log(`Transferring ${currentOwner}/${repoName} to ${newOwner}...`);

  try {
    const client = createApiClient();
    
    const result = await client.repos.transfer(currentOwner, repoName, {
      newOwner: newOwner,
      newOwnerType: newOwnerType,
    });

    if (result.success) {
      console.log('');
      console.log(`Repository transferred successfully!`);
      console.log(`  From: ${result.previousOwner}/${repoName}`);
      console.log(`  To:   ${result.newOwner}/${repoName}`);
      console.log('');
      console.log('Note: Update your git remotes to use the new URL:');
      console.log(`  git remote set-url origin <server>/${result.newOwner}/${repoName}.git`);
    } else {
      console.error('Transfer failed');
      process.exit(1);
    }
  } catch (error) {
    if (error instanceof Error) {
      // Parse tRPC error messages
      const message = error.message;
      
      if (message.includes('NOT_FOUND')) {
        if (message.includes('Repository')) {
          console.error(`Repository not found: ${currentOwner}/${repoName}`);
        } else if (message.includes('User')) {
          console.error(`User not found: ${newOwner}`);
        } else if (message.includes('Organization')) {
          console.error(`Organization not found: ${newOwner}`);
        } else {
          console.error('Resource not found');
        }
      } else if (message.includes('FORBIDDEN')) {
        if (message.includes('owner can transfer')) {
          console.error('Permission denied: Only the repository owner can transfer it.');
        } else if (message.includes('admin or owner')) {
          console.error('Permission denied: You must be an admin or owner of the target organization.');
        } else {
          console.error('Permission denied');
        }
      } else if (message.includes('CONFLICT')) {
        console.error(`A repository named '${repoName}' already exists for ${newOwner}`);
      } else if (message.includes('UNAUTHORIZED')) {
        console.error('Authentication required. Please ensure your WIT_TOKEN is valid.');
      } else {
        console.error(`Error: ${message}`);
      }
    } else {
      console.error('An unknown error occurred');
    }
    process.exit(1);
  }
}
