/**
 * Collaborator Command
 * Manage repository collaborators, teams, and permissions
 * 
 * Usage:
 *   wit collaborator                         # List collaborators
 *   wit collaborator add <email> [--role <role>] [--message "..."]
 *   wit collaborator remove <email>          # Remove collaborator
 *   wit collaborator update <email> --role <role>  # Update role
 *   wit collaborator show <email>            # Show collaborator details
 *   wit collaborator accept <token>          # Accept invitation
 *   wit collaborator revoke <email>          # Revoke pending invitation
 *   wit collaborator invitations             # List pending invitations
 *   wit collaborator activity                # Show activity log
 *   wit collaborator stats                   # Show statistics
 *   wit collaborator config                  # Show/update configuration
 *   
 * Team commands:
 *   wit collaborator team list               # List teams
 *   wit collaborator team create <name> --role <role>
 *   wit collaborator team delete <slug>
 *   wit collaborator team add-member <slug> <email>
 *   wit collaborator team remove-member <slug> <email>
 */

import { Repository } from '../core/repository';
import {
  CollaboratorManager,
  CollaboratorRole,
} from '../core/collaborators';
import { createEmailService } from '../core/email';
import { TsgitError, ErrorCode } from '../core/errors';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
};

const VALID_ROLES: CollaboratorRole[] = ['owner', 'admin', 'maintainer', 'contributor', 'viewer'];

/**
 * Role badge colors
 */
const ROLE_COLORS: Record<CollaboratorRole, (s: string) => string> = {
  owner: colors.magenta,
  admin: colors.red,
  maintainer: colors.yellow,
  contributor: colors.green,
  viewer: colors.dim,
};

/**
 * Format a timestamp as relative time
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  
  if (months > 0) return `${months} month${months > 1 ? 's' : ''} ago`;
  if (weeks > 0) return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
}

/**
 * Format expiration time
 */
function formatExpiration(timestamp: number): string {
  const now = Date.now();
  const diff = timestamp - now;
  
  if (diff <= 0) return colors.red('expired');
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} left`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} left`;
  return colors.yellow('< 1 hour left');
}

/**
 * Print role badge
 */
function roleBadge(role: CollaboratorRole): string {
  return ROLE_COLORS[role](`[${role}]`);
}

/**
 * List all collaborators
 */
export function listCollaborators(verbose: boolean = false): void {
  const repo = Repository.find();
  const manager = new CollaboratorManager(repo.gitDir);
  
  const collaborators = manager.list();
  
  if (collaborators.length === 0) {
    console.log(colors.dim('No collaborators yet.'));
    console.log(colors.dim('Use `wit collaborator add <email>` to invite someone.'));
    return;
  }
  
  // Group by status
  const active = collaborators.filter(c => c.status === 'accepted');
  const pending = collaborators.filter(c => c.status === 'pending');
  
  if (active.length > 0) {
    console.log(colors.bold('\nActive Collaborators'));
    console.log('─'.repeat(60));
    
    for (const c of active) {
      const name = c.name || c.email;
      const emailPart = c.name ? colors.dim(` <${c.email}>`) : '';
      console.log(`  ${roleBadge(c.role)} ${name}${emailPart}`);
      
      if (verbose) {
        console.log(colors.dim(`       Added ${formatRelativeTime(c.invitedAt)} by ${c.invitedBy}`));
        if (c.lastActiveAt) {
          console.log(colors.dim(`       Last active ${formatRelativeTime(c.lastActiveAt)}`));
        }
        if (c.teams && c.teams.length > 0) {
          console.log(colors.dim(`       Teams: ${c.teams.join(', ')}`));
        }
      }
    }
  }
  
  if (pending.length > 0) {
    console.log(colors.bold('\nPending Invitations'));
    console.log('─'.repeat(60));
    
    for (const c of pending) {
      const expiry = c.inviteExpiresAt ? formatExpiration(c.inviteExpiresAt) : '';
      console.log(`  ${roleBadge(c.role)} ${c.email} ${colors.yellow('(pending)')} ${colors.dim(expiry)}`);
      
      if (verbose) {
        console.log(colors.dim(`       Invited ${formatRelativeTime(c.invitedAt)} by ${c.invitedBy}`));
      }
    }
  }
  
  console.log();
}

/**
 * Add/invite a collaborator
 */
export async function addCollaborator(
  email: string,
  options: {
    role?: CollaboratorRole;
    message?: string;
    name?: string;
    skipEmail?: boolean;
  } = {}
): Promise<void> {
  const repo = Repository.find();
  const manager = new CollaboratorManager(repo.gitDir);
  manager.init();
  
  const role = options.role || 'contributor';
  
  // Validate role
  if (!VALID_ROLES.includes(role)) {
    throw new TsgitError(
      `Invalid role: ${role}`,
      ErrorCode.INVALID_ARGUMENT,
      [`Valid roles: ${VALID_ROLES.join(', ')}`]
    );
  }
  
  // Get inviter email from environment
  const inviterEmail = process.env.WIT_AUTHOR_EMAIL || 
                       process.env.GIT_AUTHOR_EMAIL || 
                       'unknown@example.com';
  
  const inviterName = process.env.WIT_AUTHOR_NAME || 
                      process.env.GIT_AUTHOR_NAME;
  
  // Invite the collaborator
  const { invitation } = manager.invite(email, role, inviterEmail, {
    name: options.name,
    message: options.message,
    skipEmail: options.skipEmail,
  });
  
  console.log(colors.green('✓') + ` Invited ${colors.bold(email)} as ${roleBadge(role)}`);
  
  // Try to send email if configured
  const config = manager.getConfig();
  if (config.emailEnabled && config.resendApiKey && !options.skipEmail) {
    try {
      const emailService = createEmailService({
        resendApiKey: config.resendApiKey,
        emailFromAddress: config.emailFromAddress || 'noreply@wit.dev',
        emailFromName: config.emailFromName,
        repositoryName: config.repositoryName || 'Repository',
        repositoryUrl: config.repositoryUrl,
      });
      
      const result = await emailService.sendInvitation(invitation, inviterName);
      
      if (result.success) {
        console.log(colors.dim(`  Email sent to ${email}`));
      } else {
        console.log(colors.yellow('!') + colors.dim(` Could not send email: ${result.error}`));
      }
    } catch {
      console.log(colors.dim('  (Email not configured, invitation created locally)'));
    }
  } else {
    console.log(colors.dim('  (Email notifications not configured)'));
  }
  
  // Show invitation token for manual sharing
  console.log();
  console.log(colors.dim('Invitation token (share this with the invitee):'));
  console.log(colors.cyan(`  ${invitation.token}`));
  console.log();
  console.log(colors.dim('They can accept with:'));
  console.log(colors.dim(`  wit collaborator accept ${invitation.token}`));
}

/**
 * Remove a collaborator
 */
export function removeCollaborator(email: string): void {
  const repo = Repository.find();
  const manager = new CollaboratorManager(repo.gitDir);
  
  const removerEmail = process.env.WIT_AUTHOR_EMAIL || 
                       process.env.GIT_AUTHOR_EMAIL || 
                       'unknown@example.com';
  
  manager.remove(email, removerEmail);
  
  console.log(colors.green('✓') + ` Removed ${email} from collaborators`);
}

/**
 * Update a collaborator's role
 */
export function updateCollaboratorRole(email: string, newRole: CollaboratorRole): void {
  const repo = Repository.find();
  const manager = new CollaboratorManager(repo.gitDir);
  
  // Validate role
  if (!VALID_ROLES.includes(newRole)) {
    throw new TsgitError(
      `Invalid role: ${newRole}`,
      ErrorCode.INVALID_ARGUMENT,
      [`Valid roles: ${VALID_ROLES.join(', ')}`]
    );
  }
  
  const updaterEmail = process.env.WIT_AUTHOR_EMAIL || 
                       process.env.GIT_AUTHOR_EMAIL || 
                       'unknown@example.com';
  
  manager.updateRole(email, newRole, updaterEmail);
  
  console.log(colors.green('✓') + ` Updated ${email} to ${roleBadge(newRole)}`);
}

/**
 * Show collaborator details
 */
export function showCollaborator(email: string): void {
  const repo = Repository.find();
  const manager = new CollaboratorManager(repo.gitDir);
  
  const collaborator = manager.getByEmail(email);
  
  if (!collaborator) {
    throw new TsgitError(
      `Collaborator '${email}' not found`,
      ErrorCode.OPERATION_FAILED
    );
  }
  
  console.log();
  console.log(colors.bold(collaborator.name || collaborator.email));
  if (collaborator.name) {
    console.log(colors.dim(collaborator.email));
  }
  console.log();
  
  console.log(`${colors.dim('Role:')}        ${roleBadge(collaborator.role)}`);
  console.log(`${colors.dim('Status:')}      ${collaborator.status === 'accepted' ? colors.green('active') : colors.yellow('pending')}`);
  console.log(`${colors.dim('Invited:')}     ${formatRelativeTime(collaborator.invitedAt)} by ${collaborator.invitedBy}`);
  
  if (collaborator.acceptedAt) {
    console.log(`${colors.dim('Accepted:')}    ${formatRelativeTime(collaborator.acceptedAt)}`);
  }
  
  if (collaborator.lastActiveAt) {
    console.log(`${colors.dim('Last active:')} ${formatRelativeTime(collaborator.lastActiveAt)}`);
  }
  
  if (collaborator.teams && collaborator.teams.length > 0) {
    console.log(`${colors.dim('Teams:')}       ${collaborator.teams.join(', ')}`);
  }
  
  console.log();
  console.log(colors.bold('Permissions'));
  console.log('─'.repeat(40));
  
  const permissions = collaborator.permissions;
  const permissionList = [
    ['Read', permissions.canRead],
    ['Write', permissions.canWrite],
    ['Push', permissions.canPush],
    ['Push Protected', permissions.canPushProtected],
    ['Merge', permissions.canMerge],
    ['Create Branch', permissions.canCreateBranch],
    ['Delete Branch', permissions.canDeleteBranch],
    ['Create Tag', permissions.canCreateTag],
    ['Delete Tag', permissions.canDeleteTag],
    ['Manage Releases', permissions.canManageReleases],
    ['Manage Settings', permissions.canManageSettings],
    ['Manage Collaborators', permissions.canManageCollaborators],
    ['Delete Repository', permissions.canDeleteRepository],
  ];
  
  for (const [name, allowed] of permissionList) {
    const icon = allowed ? colors.green('✓') : colors.red('✗');
    console.log(`  ${icon} ${name}`);
  }
  
  console.log();
}

/**
 * Accept an invitation
 */
export function acceptInvitation(token: string, name?: string): void {
  const repo = Repository.find();
  const manager = new CollaboratorManager(repo.gitDir);
  
  const acceptorName = name || 
                       process.env.WIT_AUTHOR_NAME || 
                       process.env.GIT_AUTHOR_NAME;
  
  const collaborator = manager.accept(token, acceptorName);
  
  console.log(colors.green('✓') + ` Welcome! You are now a ${roleBadge(collaborator.role)} of this repository.`);
}

/**
 * Revoke a pending invitation
 */
export function revokeInvitation(email: string): void {
  const repo = Repository.find();
  const manager = new CollaboratorManager(repo.gitDir);
  
  const revokerEmail = process.env.WIT_AUTHOR_EMAIL || 
                       process.env.GIT_AUTHOR_EMAIL || 
                       'unknown@example.com';
  
  manager.revokeInvitation(email, revokerEmail);
  
  console.log(colors.green('✓') + ` Revoked invitation for ${email}`);
}

/**
 * List pending invitations
 */
export function listInvitations(): void {
  const repo = Repository.find();
  const manager = new CollaboratorManager(repo.gitDir);
  
  const invitations = manager.listInvitations('pending');
  
  if (invitations.length === 0) {
    console.log(colors.dim('No pending invitations.'));
    return;
  }
  
  console.log(colors.bold('\nPending Invitations'));
  console.log('─'.repeat(60));
  
  for (const inv of invitations) {
    const expiry = formatExpiration(inv.expiresAt);
    console.log(`  ${inv.email}`);
    console.log(`    ${colors.dim('Role:')} ${roleBadge(inv.role)}`);
    console.log(`    ${colors.dim('Invited by:')} ${inv.invitedBy}`);
    console.log(`    ${colors.dim('Expires:')} ${expiry}`);
    if (inv.message) {
      console.log(`    ${colors.dim('Message:')} "${inv.message}"`);
    }
    console.log();
  }
}

/**
 * Show activity log
 */
export function showActivityLog(limit: number = 20): void {
  const repo = Repository.find();
  const manager = new CollaboratorManager(repo.gitDir);
  
  const activities = manager.getActivityLog(limit);
  
  if (activities.length === 0) {
    console.log(colors.dim('No activity yet.'));
    return;
  }
  
  console.log(colors.bold('\nRecent Activity'));
  console.log('─'.repeat(60));
  
  const activityIcons: Record<string, string> = {
    invited: '📧',
    accepted: '✅',
    removed: '🚫',
    role_changed: '🔄',
    permissions_updated: '🔐',
    revoked: '❌',
  };
  
  for (const activity of activities) {
    const icon = activityIcons[activity.type] || '•';
    const time = formatRelativeTime(activity.performedAt);
    
    let description = '';
    switch (activity.type) {
      case 'invited':
        description = `${activity.performedBy} invited ${activity.collaboratorEmail}`;
        if (activity.details?.role) {
          description += ` as ${activity.details.role}`;
        }
        break;
      case 'accepted':
        description = `${activity.collaboratorEmail} accepted invitation`;
        break;
      case 'removed':
        description = `${activity.performedBy} removed ${activity.collaboratorEmail}`;
        break;
      case 'role_changed':
        description = `${activity.performedBy} changed ${activity.collaboratorEmail}'s role`;
        if (activity.details?.previousRole && activity.details?.newRole) {
          description += ` from ${activity.details.previousRole} to ${activity.details.newRole}`;
        }
        break;
      case 'permissions_updated':
        description = `${activity.performedBy} updated ${activity.collaboratorEmail}'s permissions`;
        break;
      case 'revoked':
        description = `${activity.performedBy} revoked invitation for ${activity.collaboratorEmail}`;
        break;
    }
    
    console.log(`  ${icon} ${description}`);
    console.log(`    ${colors.dim(time)}`);
    console.log();
  }
}

/**
 * Show collaborator statistics
 */
export function showStats(): void {
  const repo = Repository.find();
  const manager = new CollaboratorManager(repo.gitDir);
  
  const stats = manager.getStats();
  
  console.log(colors.bold('\nCollaborator Statistics'));
  console.log('─'.repeat(40));
  
  console.log(`  Total:      ${stats.total}`);
  console.log(`  Active:     ${colors.green(stats.active.toString())}`);
  console.log(`  Pending:    ${colors.yellow(stats.pending.toString())}`);
  console.log(`  Teams:      ${stats.teams}`);
  
  console.log();
  console.log(colors.bold('By Role'));
  console.log('─'.repeat(40));
  
  for (const role of VALID_ROLES) {
    const count = stats.byRole[role];
    if (count > 0) {
      console.log(`  ${roleBadge(role)} ${count}`);
    }
  }
  
  console.log();
}

/**
 * Show/update configuration
 */
export function handleConfig(args: string[]): void {
  const repo = Repository.find();
  const manager = new CollaboratorManager(repo.gitDir);
  manager.init();
  
  if (args.length === 0) {
    // Show current config
    const config = manager.getConfig();
    
    console.log(colors.bold('\nCollaborator Configuration'));
    console.log('─'.repeat(50));
    
    console.log(`  ${colors.dim('Public access:')}         ${config.allowPublicAccess ? 'yes' : 'no'}`);
    console.log(`  ${colors.dim('Default role:')}          ${config.defaultRole}`);
    console.log(`  ${colors.dim('Invite expiration:')}     ${config.inviteExpirationDays} days`);
    console.log(`  ${colors.dim('Email verification:')}    ${config.requireEmailVerification ? 'required' : 'optional'}`);
    console.log(`  ${colors.dim('Self signup:')}           ${config.allowSelfSignup ? 'allowed' : 'disabled'}`);
    console.log(`  ${colors.dim('Max collaborators:')}     ${config.maxCollaborators || 'unlimited'}`);
    console.log(`  ${colors.dim('Max teams:')}             ${config.maxTeams || 'unlimited'}`);
    
    console.log();
    console.log(colors.bold('Email Settings'));
    console.log('─'.repeat(50));
    
    console.log(`  ${colors.dim('Email enabled:')}         ${config.emailEnabled ? colors.green('yes') : 'no'}`);
    console.log(`  ${colors.dim('Resend API key:')}        ${config.resendApiKey ? colors.green('configured') : colors.dim('not set')}`);
    console.log(`  ${colors.dim('From address:')}          ${config.emailFromAddress || colors.dim('not set')}`);
    console.log(`  ${colors.dim('From name:')}             ${config.emailFromName || colors.dim('not set')}`);
    
    console.log();
    return;
  }
  
  // Parse config updates
  const key = args[0];
  const value = args[1];
  
  if (!value) {
    console.error(colors.red('error: ') + `Missing value for ${key}`);
    process.exit(1);
  }
  
  const updates: Record<string, unknown> = {};
  
  switch (key) {
    case 'public-access':
      updates.allowPublicAccess = value === 'true' || value === 'yes';
      break;
    case 'default-role':
      if (!VALID_ROLES.includes(value as CollaboratorRole)) {
        console.error(colors.red('error: ') + `Invalid role: ${value}`);
        console.error(`Valid roles: ${VALID_ROLES.join(', ')}`);
        process.exit(1);
      }
      updates.defaultRole = value;
      break;
    case 'invite-expiration':
      updates.inviteExpirationDays = parseInt(value, 10);
      break;
    case 'email-enabled':
      updates.emailEnabled = value === 'true' || value === 'yes';
      break;
    case 'resend-api-key':
      updates.resendApiKey = value;
      break;
    case 'email-from':
      updates.emailFromAddress = value;
      break;
    case 'email-from-name':
      updates.emailFromName = value;
      break;
    case 'repository-name':
      updates.repositoryName = value;
      break;
    case 'repository-url':
      updates.repositoryUrl = value;
      break;
    default:
      console.error(colors.red('error: ') + `Unknown config key: ${key}`);
      console.error('\nAvailable keys:');
      console.error('  public-access, default-role, invite-expiration');
      console.error('  email-enabled, resend-api-key, email-from, email-from-name');
      console.error('  repository-name, repository-url');
      process.exit(1);
  }
  
  manager.updateConfig(updates);
  console.log(colors.green('✓') + ` Updated ${key}`);
}

// ==================== TEAM COMMANDS ====================

/**
 * List teams
 */
export function listTeams(): void {
  const repo = Repository.find();
  const manager = new CollaboratorManager(repo.gitDir);
  
  const teams = manager.listTeams();
  
  if (teams.length === 0) {
    console.log(colors.dim('No teams yet.'));
    console.log(colors.dim('Use `wit collaborator team create <name>` to create one.'));
    return;
  }
  
  console.log(colors.bold('\nTeams'));
  console.log('─'.repeat(50));
  
  for (const team of teams) {
    console.log(`  ${colors.bold(team.name)} ${colors.dim(`(${team.slug})`)}`);
    console.log(`    ${colors.dim('Role:')} ${roleBadge(team.role)}`);
    console.log(`    ${colors.dim('Members:')} ${team.members.length}`);
    if (team.description) {
      console.log(`    ${colors.dim('Description:')} ${team.description}`);
    }
    console.log();
  }
}

/**
 * Create a team
 */
export function createTeam(
  name: string,
  role: CollaboratorRole,
  description?: string
): void {
  const repo = Repository.find();
  const manager = new CollaboratorManager(repo.gitDir);
  manager.init();
  
  // Validate role
  if (!VALID_ROLES.includes(role)) {
    throw new TsgitError(
      `Invalid role: ${role}`,
      ErrorCode.INVALID_ARGUMENT,
      [`Valid roles: ${VALID_ROLES.join(', ')}`]
    );
  }
  
  const creatorEmail = process.env.WIT_AUTHOR_EMAIL || 
                       process.env.GIT_AUTHOR_EMAIL || 
                       'unknown@example.com';
  
  const team = manager.createTeam(name, role, creatorEmail, { description });
  
  console.log(colors.green('✓') + ` Created team ${colors.bold(team.name)} with role ${roleBadge(role)}`);
}

/**
 * Delete a team
 */
export function deleteTeam(slug: string): void {
  const repo = Repository.find();
  const manager = new CollaboratorManager(repo.gitDir);
  
  manager.deleteTeam(slug);
  
  console.log(colors.green('✓') + ` Deleted team ${slug}`);
}

/**
 * Add member to team
 */
export function addTeamMember(teamSlug: string, email: string): void {
  const repo = Repository.find();
  const manager = new CollaboratorManager(repo.gitDir);
  
  const team = manager.addTeamMember(teamSlug, email);
  
  console.log(colors.green('✓') + ` Added ${email} to team ${team.name}`);
}

/**
 * Remove member from team
 */
export function removeTeamMember(teamSlug: string, email: string): void {
  const repo = Repository.find();
  const manager = new CollaboratorManager(repo.gitDir);
  
  const team = manager.removeTeamMember(teamSlug, email);
  
  console.log(colors.green('✓') + ` Removed ${email} from team ${team.name}`);
}

// ==================== CLI HANDLER ====================

/**
 * CLI handler for collaborator command
 */
export async function handleCollaborator(args: string[]): Promise<void> {
  // Parse options
  const options: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-v' || arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--role' && i + 1 < args.length) {
      options.role = args[++i];
    } else if (arg === '-r' && i + 1 < args.length) {
      options.role = args[++i];
    } else if (arg === '--message' && i + 1 < args.length) {
      options.message = args[++i];
    } else if (arg === '-m' && i + 1 < args.length) {
      options.message = args[++i];
    } else if (arg === '--name' && i + 1 < args.length) {
      options.name = args[++i];
    } else if (arg === '--description' && i + 1 < args.length) {
      options.description = args[++i];
    } else if (arg === '-n' && i + 1 < args.length) {
      options.limit = args[++i];
    } else if (arg === '--skip-email') {
      options.skipEmail = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  const subcommand = positional[0];

  try {
    switch (subcommand) {
      case undefined:
      case 'list':
        listCollaborators(!!options.verbose);
        break;

      case 'add':
      case 'invite': {
        const email = positional[1];
        if (!email) {
          console.error(colors.red('error: ') + 'usage: wit collaborator add <email> [--role <role>] [--message "..."]');
          process.exit(1);
        }
        await addCollaborator(email, {
          role: options.role as CollaboratorRole,
          message: options.message as string,
          name: options.name as string,
          skipEmail: !!options.skipEmail,
        });
        break;
      }

      case 'remove':
      case 'rm': {
        const email = positional[1];
        if (!email) {
          console.error(colors.red('error: ') + 'usage: wit collaborator remove <email>');
          process.exit(1);
        }
        removeCollaborator(email);
        break;
      }

      case 'update': {
        const email = positional[1];
        const role = options.role as CollaboratorRole;
        if (!email || !role) {
          console.error(colors.red('error: ') + 'usage: wit collaborator update <email> --role <role>');
          process.exit(1);
        }
        updateCollaboratorRole(email, role);
        break;
      }

      case 'show': {
        const email = positional[1];
        if (!email) {
          console.error(colors.red('error: ') + 'usage: wit collaborator show <email>');
          process.exit(1);
        }
        showCollaborator(email);
        break;
      }

      case 'accept': {
        const token = positional[1];
        if (!token) {
          console.error(colors.red('error: ') + 'usage: wit collaborator accept <token>');
          process.exit(1);
        }
        acceptInvitation(token, options.name as string);
        break;
      }

      case 'revoke': {
        const email = positional[1];
        if (!email) {
          console.error(colors.red('error: ') + 'usage: wit collaborator revoke <email>');
          process.exit(1);
        }
        revokeInvitation(email);
        break;
      }

      case 'invitations':
        listInvitations();
        break;

      case 'activity':
        showActivityLog(options.limit ? parseInt(options.limit as string, 10) : 20);
        break;

      case 'stats':
        showStats();
        break;

      case 'config':
        handleConfig(positional.slice(1));
        break;

      case 'team': {
        const teamSubcommand = positional[1];
        
        switch (teamSubcommand) {
          case undefined:
          case 'list':
            listTeams();
            break;

          case 'create': {
            const name = positional[2];
            const role = (options.role || 'contributor') as CollaboratorRole;
            if (!name) {
              console.error(colors.red('error: ') + 'usage: wit collaborator team create <name> [--role <role>]');
              process.exit(1);
            }
            createTeam(name, role, options.description as string);
            break;
          }

          case 'delete': {
            const slug = positional[2];
            if (!slug) {
              console.error(colors.red('error: ') + 'usage: wit collaborator team delete <slug>');
              process.exit(1);
            }
            deleteTeam(slug);
            break;
          }

          case 'add-member': {
            const slug = positional[2];
            const email = positional[3];
            if (!slug || !email) {
              console.error(colors.red('error: ') + 'usage: wit collaborator team add-member <slug> <email>');
              process.exit(1);
            }
            addTeamMember(slug, email);
            break;
          }

          case 'remove-member': {
            const slug = positional[2];
            const email = positional[3];
            if (!slug || !email) {
              console.error(colors.red('error: ') + 'usage: wit collaborator team remove-member <slug> <email>');
              process.exit(1);
            }
            removeTeamMember(slug, email);
            break;
          }

          default:
            console.error(colors.red('error: ') + `Unknown team subcommand: ${teamSubcommand}`);
            console.error('\nTeam commands:');
            console.error('  wit collaborator team list');
            console.error('  wit collaborator team create <name> [--role <role>]');
            console.error('  wit collaborator team delete <slug>');
            console.error('  wit collaborator team add-member <slug> <email>');
            console.error('  wit collaborator team remove-member <slug> <email>');
            process.exit(1);
        }
        break;
      }

      default:
        // Check if it might be an email for 'show'
        if (subcommand.includes('@')) {
          showCollaborator(subcommand);
        } else {
          console.error(colors.red('error: ') + `Unknown subcommand: ${subcommand}`);
          console.error('\nUsage:');
          console.error('  wit collaborator                       List collaborators');
          console.error('  wit collaborator add <email>           Invite a collaborator');
          console.error('  wit collaborator remove <email>        Remove a collaborator');
          console.error('  wit collaborator update <email> --role <role>');
          console.error('  wit collaborator show <email>          Show details');
          console.error('  wit collaborator accept <token>        Accept invitation');
          console.error('  wit collaborator revoke <email>        Revoke invitation');
          console.error('  wit collaborator invitations           List pending');
          console.error('  wit collaborator activity              Show activity log');
          console.error('  wit collaborator stats                 Show statistics');
          console.error('  wit collaborator config                Configure settings');
          console.error('  wit collaborator team ...              Team management');
          process.exit(1);
        }
    }
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(colors.red('error: ') + error.message);
    }
    process.exit(1);
  }
}
