/**
 * Token Command
 * Manage Personal Access Tokens for API/CLI authentication
 *
 * Usage:
 *   wit token create <name>           Create a new token
 *   wit token create <name> --expires 30   Token expires in 30 days
 *   wit token create <name> --scopes repo:read,repo:write
 *   wit token list                    List all tokens
 *   wit token revoke <id>             Revoke/delete a token
 *   wit token scopes                  List available scopes
 */

import * as crypto from 'crypto';
import { initDatabase, getDb } from '../db';
import { personalAccessTokens, type PersonalAccessToken } from '../db/schema';
import { eq, and } from 'drizzle-orm';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  bgYellow: (s: string) => `\x1b[43m\x1b[30m${s}\x1b[0m`,
};

/**
 * Available token scopes
 */
const TOKEN_SCOPES = [
  'repo:read',
  'repo:write',
  'repo:admin',
  'user:read',
  'user:write',
] as const;

type TokenScope = (typeof TOKEN_SCOPES)[number];

const SCOPE_DESCRIPTIONS: Record<TokenScope, string> = {
  'repo:read': 'Clone and pull repositories',
  'repo:write': 'Push to repositories',
  'repo:admin': 'Manage repository settings, collaborators, and deletion',
  'user:read': 'Read your profile information',
  'user:write': 'Update your profile',
};

/**
 * Generate a new token
 */
function generateToken(): string {
  const randomPart = crypto.randomBytes(20).toString('hex');
  return `wit_${randomPart}`;
}

/**
 * Hash a token using SHA256
 */
function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Format time ago
 */
function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;

  return date.toLocaleDateString();
}

/**
 * Main token command handler
 */
export async function handleToken(args: string[]): Promise<void> {
  const subcommand = args[0] || 'list';

  // Initialize database
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error(colors.red('error: ') + 'DATABASE_URL environment variable not set');
    console.error('\nThe token command requires a connection to the wit platform database.');
    console.error('Make sure you have the wit platform running (wit up) or set DATABASE_URL.');
    process.exit(1);
  }

  try {
    initDatabase(dbUrl);
  } catch (error) {
    console.error(colors.red('error: ') + 'Failed to connect to database');
    console.error(colors.dim((error as Error).message));
    process.exit(1);
  }

  try {
    switch (subcommand) {
      case 'create': {
        await handleCreate(args.slice(1));
        break;
      }

      case 'list':
      case 'ls': {
        await handleList();
        break;
      }

      case 'revoke':
      case 'delete':
      case 'rm': {
        await handleRevoke(args.slice(1));
        break;
      }

      case 'scopes': {
        handleScopes();
        break;
      }

      case 'help':
      case '--help':
      case '-h': {
        printHelp();
        break;
      }

      default: {
        // If first arg doesn't look like a subcommand, treat as create with name
        if (!['create', 'list', 'ls', 'revoke', 'delete', 'rm', 'scopes', 'help'].includes(subcommand)) {
          await handleCreate(args);
        } else {
          console.error(colors.red('error: ') + `Unknown subcommand: ${subcommand}`);
          printHelp();
          process.exit(1);
        }
      }
    }
  } catch (error) {
    console.error(colors.red('error: ') + (error as Error).message);
    process.exit(1);
  }
}

/**
 * Handle token creation
 */
async function handleCreate(args: string[]): Promise<void> {
  // Parse arguments
  let name: string | undefined;
  let expiresInDays: number | undefined;
  let scopes: TokenScope[] = ['repo:read', 'repo:write']; // Default scopes

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--expires' || arg === '-e') {
      const value = args[++i];
      if (!value || isNaN(parseInt(value, 10))) {
        console.error(colors.red('error: ') + '--expires requires a number of days');
        process.exit(1);
      }
      expiresInDays = parseInt(value, 10);
    } else if (arg === '--scopes' || arg === '-s') {
      const value = args[++i];
      if (!value) {
        console.error(colors.red('error: ') + '--scopes requires a comma-separated list');
        process.exit(1);
      }
      scopes = value.split(',').map((s) => s.trim()) as TokenScope[];

      // Validate scopes
      for (const scope of scopes) {
        if (!TOKEN_SCOPES.includes(scope)) {
          console.error(colors.red('error: ') + `Invalid scope: ${scope}`);
          console.error(`\nValid scopes: ${TOKEN_SCOPES.join(', ')}`);
          process.exit(1);
        }
      }
    } else if (!arg.startsWith('-') && !name) {
      name = arg;
    }
  }

  if (!name) {
    console.error(colors.red('error: ') + 'Token name is required');
    console.error('\nUsage: wit token create <name> [--expires <days>] [--scopes <scope1,scope2>]');
    process.exit(1);
  }

  // For CLI, we need to know the user. For now, require WIT_USER_ID env var
  // In production, this would use session/auth
  const userId = process.env.WIT_USER_ID;
  if (!userId) {
    console.error(colors.red('error: ') + 'Not authenticated');
    console.error('\nSet WIT_USER_ID environment variable or use the web UI to create tokens.');
    process.exit(1);
  }

  // Generate token
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const tokenPrefix = rawToken.substring(0, 8);

  // Calculate expiration
  let expiresAt: Date | null = null;
  if (expiresInDays) {
    expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  }

  // Insert into database
  const db = getDb();
  await db
    .insert(personalAccessTokens)
    .values({
      userId,
      name,
      tokenHash,
      tokenPrefix,
      scopes: JSON.stringify(scopes),
      expiresAt,
    });

  // Display the token
  console.log();
  console.log(colors.green('✓') + ' Created personal access token');
  console.log();
  console.log(colors.bold('Token:'));
  console.log();
  console.log('  ' + colors.bgYellow(' ' + rawToken + ' '));
  console.log();
  console.log(colors.yellow('⚠ ') + colors.bold('Make sure to copy your token now.'));
  console.log(colors.yellow('  ') + 'You will not be able to see it again!');
  console.log();
  console.log(colors.dim('Name:    ') + name);
  console.log(colors.dim('Scopes:  ') + scopes.join(', '));
  if (expiresAt) {
    console.log(colors.dim('Expires: ') + expiresAt.toLocaleDateString());
  } else {
    console.log(colors.dim('Expires: ') + 'Never');
  }
  console.log();
  console.log(colors.dim('Use this token in the Authorization header:'));
  console.log(colors.dim('  Authorization: Bearer ' + rawToken));
  console.log();
}

/**
 * Handle listing tokens
 */
async function handleList(): Promise<void> {
  const userId = process.env.WIT_USER_ID;
  if (!userId) {
    console.error(colors.red('error: ') + 'Not authenticated');
    console.error('\nSet WIT_USER_ID environment variable.');
    process.exit(1);
  }

  const db = getDb();
  const tokens = await db
    .select()
    .from(personalAccessTokens)
    .where(eq(personalAccessTokens.userId, userId));

  if (tokens.length === 0) {
    console.log(colors.dim('No personal access tokens'));
    console.log();
    console.log('Create one with: wit token create <name>');
    return;
  }

  console.log();
  console.log(colors.bold(`Personal Access Tokens (${tokens.length})`));
  console.log();

  for (const token of tokens) {
    const scopes = JSON.parse(token.scopes) as string[];
    const isExpired = token.expiresAt && token.expiresAt < new Date();

    console.log(
      colors.cyan(token.tokenPrefix + '...') +
        '  ' +
        (isExpired ? colors.red('[EXPIRED] ') : '') +
        colors.bold(token.name)
    );
    console.log(
      colors.dim('  ID: ') +
        token.id.substring(0, 8) +
        colors.dim('  Scopes: ') +
        scopes.join(', ')
    );

    const parts: string[] = [];
    if (token.lastUsedAt) {
      parts.push('Last used: ' + formatTimeAgo(token.lastUsedAt));
    } else {
      parts.push('Never used');
    }
    if (token.expiresAt) {
      if (isExpired) {
        parts.push('Expired: ' + token.expiresAt.toLocaleDateString());
      } else {
        parts.push('Expires: ' + token.expiresAt.toLocaleDateString());
      }
    }
    console.log(colors.dim('  ' + parts.join('  •  ')));
    console.log();
  }
}

/**
 * Handle revoking a token
 */
async function handleRevoke(args: string[]): Promise<void> {
  const tokenIdOrPrefix = args[0];

  if (!tokenIdOrPrefix) {
    console.error(colors.red('error: ') + 'Token ID or prefix is required');
    console.error('\nUsage: wit token revoke <id>');
    console.error('\nUse "wit token list" to see your tokens.');
    process.exit(1);
  }

  const userId = process.env.WIT_USER_ID;
  if (!userId) {
    console.error(colors.red('error: ') + 'Not authenticated');
    process.exit(1);
  }

  const db = getDb();

  // Try to find by ID first, then by prefix
  let token: PersonalAccessToken | undefined;

  // Check if it looks like a UUID
  if (tokenIdOrPrefix.includes('-') || tokenIdOrPrefix.length > 16) {
    const [found] = await db
      .select()
      .from(personalAccessTokens)
      .where(
        and(
          eq(personalAccessTokens.id, tokenIdOrPrefix),
          eq(personalAccessTokens.userId, userId)
        )
      );
    token = found;
  }

  // If not found, try matching by ID prefix
  if (!token) {
    const allTokens = await db
      .select()
      .from(personalAccessTokens)
      .where(eq(personalAccessTokens.userId, userId));

    token = allTokens.find(
      (t) =>
        t.id.startsWith(tokenIdOrPrefix) ||
        t.tokenPrefix.includes(tokenIdOrPrefix)
    );
  }

  if (!token) {
    console.error(colors.red('error: ') + 'Token not found');
    console.error('\nUse "wit token list" to see your tokens.');
    process.exit(1);
  }

  // Delete the token
  await db.delete(personalAccessTokens).where(eq(personalAccessTokens.id, token.id));

  console.log(colors.green('✓') + ' Revoked token: ' + colors.bold(token.name));
  console.log(colors.dim('  ' + token.tokenPrefix + '...'));
}

/**
 * List available scopes
 */
function handleScopes(): void {
  console.log();
  console.log(colors.bold('Available Token Scopes'));
  console.log();

  for (const scope of TOKEN_SCOPES) {
    console.log(colors.cyan(scope));
    console.log(colors.dim('  ' + SCOPE_DESCRIPTIONS[scope]));
    console.log();
  }
}

/**
 * Print help
 */
function printHelp(): void {
  console.log(`
${colors.bold('wit token')} - Manage Personal Access Tokens

${colors.bold('USAGE')}
  wit token <command> [options]

${colors.bold('COMMANDS')}
  create <name>     Create a new token
  list              List all tokens
  revoke <id>       Revoke/delete a token
  scopes            List available scopes

${colors.bold('OPTIONS')}
  --expires, -e <days>    Token expires in N days (default: never)
  --scopes, -s <scopes>   Comma-separated scopes (default: repo:read,repo:write)

${colors.bold('EXAMPLES')}
  wit token create "CI Token"
  wit token create "Deploy Key" --expires 30 --scopes repo:read
  wit token create "Full Access" --scopes repo:read,repo:write,repo:admin
  wit token list
  wit token revoke abc12345

${colors.bold('ENVIRONMENT')}
  DATABASE_URL      Connection string for wit platform database
  WIT_USER_ID       Your user ID (required for CLI usage)
`);
}
