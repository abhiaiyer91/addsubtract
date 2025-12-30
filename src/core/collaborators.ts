/**
 * Collaborator Management System
 * 
 * Provides a rich contributor management system for repositories with:
 * - Role-based access control (owner, admin, maintainer, contributor, viewer)
 * - Email invitations via Resend
 * - Invitation tracking and expiration
 * - Team management
 * - Activity logging
 * 
 * Storage: .wit/collaborators.json
 */

import * as path from 'path';
import * as crypto from 'crypto';
import { exists, readFile, writeFile } from '../utils/fs';
import { TsgitError, ErrorCode } from './errors';

/**
 * Collaborator roles with hierarchical permissions
 * 
 * Roles (from highest to lowest access):
 * - owner: Full access including deleting repository, managing billing
 * - admin: Full access except deleting repository
 * - maintainer: Can manage branches, merges, releases
 * - contributor: Can push to non-protected branches
 * - viewer: Read-only access
 */
export type CollaboratorRole = 'owner' | 'admin' | 'maintainer' | 'contributor' | 'viewer';

/**
 * Invitation status
 */
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

/**
 * Permission flags for fine-grained access control
 */
export interface CollaboratorPermissions {
  canRead: boolean;
  canWrite: boolean;
  canPush: boolean;
  canPushProtected: boolean;
  canMerge: boolean;
  canCreateBranch: boolean;
  canDeleteBranch: boolean;
  canCreateTag: boolean;
  canDeleteTag: boolean;
  canManageReleases: boolean;
  canManageSettings: boolean;
  canManageCollaborators: boolean;
  canDeleteRepository: boolean;
}

/**
 * Role permission mappings
 */
export const ROLE_PERMISSIONS: Record<CollaboratorRole, CollaboratorPermissions> = {
  owner: {
    canRead: true,
    canWrite: true,
    canPush: true,
    canPushProtected: true,
    canMerge: true,
    canCreateBranch: true,
    canDeleteBranch: true,
    canCreateTag: true,
    canDeleteTag: true,
    canManageReleases: true,
    canManageSettings: true,
    canManageCollaborators: true,
    canDeleteRepository: true,
  },
  admin: {
    canRead: true,
    canWrite: true,
    canPush: true,
    canPushProtected: true,
    canMerge: true,
    canCreateBranch: true,
    canDeleteBranch: true,
    canCreateTag: true,
    canDeleteTag: true,
    canManageReleases: true,
    canManageSettings: true,
    canManageCollaborators: true,
    canDeleteRepository: false,
  },
  maintainer: {
    canRead: true,
    canWrite: true,
    canPush: true,
    canPushProtected: false,
    canMerge: true,
    canCreateBranch: true,
    canDeleteBranch: true,
    canCreateTag: true,
    canDeleteTag: false,
    canManageReleases: true,
    canManageSettings: false,
    canManageCollaborators: false,
    canDeleteRepository: false,
  },
  contributor: {
    canRead: true,
    canWrite: true,
    canPush: true,
    canPushProtected: false,
    canMerge: false,
    canCreateBranch: true,
    canDeleteBranch: false,
    canCreateTag: false,
    canDeleteTag: false,
    canManageReleases: false,
    canManageSettings: false,
    canManageCollaborators: false,
    canDeleteRepository: false,
  },
  viewer: {
    canRead: true,
    canWrite: false,
    canPush: false,
    canPushProtected: false,
    canMerge: false,
    canCreateBranch: false,
    canDeleteBranch: false,
    canCreateTag: false,
    canDeleteTag: false,
    canManageReleases: false,
    canManageSettings: false,
    canManageCollaborators: false,
    canDeleteRepository: false,
  },
};

/**
 * Role hierarchy for permission comparison
 */
export const ROLE_HIERARCHY: Record<CollaboratorRole, number> = {
  owner: 5,
  admin: 4,
  maintainer: 3,
  contributor: 2,
  viewer: 1,
};

/**
 * A collaborator in the repository
 */
export interface Collaborator {
  id: string;
  email: string;
  name?: string;
  role: CollaboratorRole;
  status: InvitationStatus;
  permissions: CollaboratorPermissions;
  
  // Invitation details
  inviteToken?: string;
  invitedAt: number;
  invitedBy: string;
  inviteExpiresAt?: number;
  
  // Activity tracking
  acceptedAt?: number;
  lastActiveAt?: number;
  
  // Custom overrides
  customPermissions?: Partial<CollaboratorPermissions>;
  
  // Metadata
  avatarUrl?: string;
  bio?: string;
  teams?: string[];
}

/**
 * A team of collaborators
 */
export interface Team {
  id: string;
  name: string;
  slug: string;
  description?: string;
  role: CollaboratorRole;
  members: string[]; // Collaborator IDs
  createdAt: number;
  createdBy: string;
}

/**
 * Invitation for a new collaborator
 */
export interface Invitation {
  id: string;
  email: string;
  role: CollaboratorRole;
  token: string;
  invitedBy: string;
  invitedAt: number;
  expiresAt: number;
  message?: string;
  status: InvitationStatus;
  acceptedAt?: number;
  revokedAt?: number;
}

/**
 * Activity log entry for audit purposes
 */
export interface CollaboratorActivity {
  id: string;
  type: 'invited' | 'accepted' | 'removed' | 'role_changed' | 'permissions_updated' | 'revoked';
  collaboratorId?: string;
  collaboratorEmail: string;
  performedBy: string;
  performedAt: number;
  details?: Record<string, unknown>;
}

/**
 * Configuration for collaborator management
 */
export interface CollaboratorConfig {
  // Access settings
  allowPublicAccess: boolean;
  defaultRole: CollaboratorRole;
  
  // Invitation settings
  inviteExpirationDays: number;
  requireEmailVerification: boolean;
  allowSelfSignup: boolean;
  
  // Limits
  maxCollaborators?: number;
  maxTeams?: number;
  
  // Email settings
  emailEnabled: boolean;
  resendApiKey?: string;
  emailFromAddress?: string;
  emailFromName?: string;
  
  // Repository info for emails
  repositoryName?: string;
  repositoryUrl?: string;
}

/**
 * Storage format for collaborators
 */
interface CollaboratorStorage {
  version: 1;
  config: CollaboratorConfig;
  collaborators: Collaborator[];
  teams: Team[];
  invitations: Invitation[];
  activityLog: CollaboratorActivity[];
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CollaboratorConfig = {
  allowPublicAccess: false,
  defaultRole: 'viewer',
  inviteExpirationDays: 7,
  requireEmailVerification: true,
  allowSelfSignup: false,
  emailEnabled: false,
  maxCollaborators: 100,
  maxTeams: 20,
};

/**
 * Default storage
 */
const DEFAULT_STORAGE: CollaboratorStorage = {
  version: 1,
  config: DEFAULT_CONFIG,
  collaborators: [],
  teams: [],
  invitations: [],
  activityLog: [],
};

/**
 * Collaborator Manager
 * 
 * Manages collaborators, teams, invitations, and permissions for a repository.
 */
export class CollaboratorManager {
  private collaboratorsPath: string;
  private storage: CollaboratorStorage;

  constructor(private gitDir: string) {
    this.collaboratorsPath = path.join(gitDir, 'collaborators.json');
    this.storage = this.load();
  }

  /**
   * Initialize collaborator storage
   */
  init(): void {
    if (!exists(this.collaboratorsPath)) {
      this.save();
    }
  }

  /**
   * Load collaborator data from disk
   */
  private load(): CollaboratorStorage {
    if (!exists(this.collaboratorsPath)) {
      return { ...DEFAULT_STORAGE };
    }

    try {
      const content = readFile(this.collaboratorsPath).toString('utf8');
      const data = JSON.parse(content) as CollaboratorStorage;
      
      // Ensure config has all defaults
      data.config = { ...DEFAULT_CONFIG, ...data.config };
      
      return data;
    } catch {
      return { ...DEFAULT_STORAGE };
    }
  }

  /**
   * Save collaborator data to disk
   */
  private save(): void {
    writeFile(this.collaboratorsPath, JSON.stringify(this.storage, null, 2));
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return crypto.randomBytes(12).toString('hex');
  }

  /**
   * Generate an invitation token
   */
  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Get configuration
   */
  getConfig(): CollaboratorConfig {
    return { ...this.storage.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<CollaboratorConfig>): void {
    this.storage.config = { ...this.storage.config, ...config };
    this.save();
  }

  // ==================== COLLABORATOR MANAGEMENT ====================

  /**
   * Invite a new collaborator
   */
  invite(
    email: string,
    role: CollaboratorRole,
    invitedBy: string,
    options: {
      name?: string;
      message?: string;
      skipEmail?: boolean;
    } = {}
  ): { collaborator: Collaborator; invitation: Invitation } {
    // Validate email
    if (!this.isValidEmail(email)) {
      throw new TsgitError(
        `Invalid email address: ${email}`,
        ErrorCode.INVALID_ARGUMENT
      );
    }

    // Check if already a collaborator
    const existing = this.getByEmail(email);
    if (existing && existing.status === 'accepted') {
      throw new TsgitError(
        `'${email}' is already a collaborator`,
        ErrorCode.OPERATION_FAILED,
        [
          `wit collaborator update ${email} --role ${role}    # Update role`,
          `wit collaborator remove ${email}                    # Remove first`,
        ]
      );
    }

    // Check max collaborators limit
    const config = this.getConfig();
    if (config.maxCollaborators && this.storage.collaborators.length >= config.maxCollaborators) {
      throw new TsgitError(
        `Maximum number of collaborators (${config.maxCollaborators}) reached`,
        ErrorCode.OPERATION_FAILED
      );
    }

    // Check if inviter has permission
    const inviter = this.getByEmail(invitedBy);
    if (inviter && !inviter.permissions.canManageCollaborators) {
      throw new TsgitError(
        'You do not have permission to invite collaborators',
        ErrorCode.OPERATION_FAILED
      );
    }

    // Calculate expiration
    const now = Date.now();
    const expiresAt = now + (config.inviteExpirationDays * 24 * 60 * 60 * 1000);

    // Create invitation
    const token = this.generateToken();
    const invitation: Invitation = {
      id: this.generateId(),
      email,
      role,
      token,
      invitedBy,
      invitedAt: now,
      expiresAt,
      message: options.message,
      status: 'pending',
    };

    // Create or update collaborator
    const collaboratorId = existing?.id || this.generateId();
    const collaborator: Collaborator = {
      id: collaboratorId,
      email,
      name: options.name,
      role,
      status: 'pending',
      permissions: this.getPermissionsForRole(role),
      inviteToken: token,
      invitedAt: now,
      invitedBy,
      inviteExpiresAt: expiresAt,
    };

    // Remove existing pending invitation if exists
    if (existing) {
      this.storage.collaborators = this.storage.collaborators.filter(c => c.id !== existing.id);
      this.storage.invitations = this.storage.invitations.filter(i => i.email !== email);
    }

    // Add to storage
    this.storage.collaborators.push(collaborator);
    this.storage.invitations.push(invitation);

    // Log activity
    this.logActivity({
      type: 'invited',
      collaboratorId: collaborator.id,
      collaboratorEmail: email,
      performedBy: invitedBy,
      details: { role, message: options.message },
    });

    this.save();

    return { collaborator, invitation };
  }

  /**
   * Accept an invitation
   */
  accept(token: string, acceptorName?: string): Collaborator {
    const invitation = this.storage.invitations.find(i => i.token === token);
    
    if (!invitation) {
      throw new TsgitError(
        'Invalid or expired invitation token',
        ErrorCode.OPERATION_FAILED
      );
    }

    if (invitation.status !== 'pending') {
      throw new TsgitError(
        `Invitation has already been ${invitation.status}`,
        ErrorCode.OPERATION_FAILED
      );
    }

    if (Date.now() > invitation.expiresAt) {
      invitation.status = 'expired';
      this.save();
      throw new TsgitError(
        'Invitation has expired',
        ErrorCode.OPERATION_FAILED,
        ['Ask the repository owner to send a new invitation']
      );
    }

    // Find and update collaborator
    const collaborator = this.storage.collaborators.find(c => c.email === invitation.email);
    if (!collaborator) {
      throw new TsgitError(
        'Collaborator record not found',
        ErrorCode.OPERATION_FAILED
      );
    }

    const now = Date.now();

    // Update invitation
    invitation.status = 'accepted';
    invitation.acceptedAt = now;

    // Update collaborator
    collaborator.status = 'accepted';
    collaborator.acceptedAt = now;
    collaborator.lastActiveAt = now;
    collaborator.inviteToken = undefined;
    collaborator.inviteExpiresAt = undefined;
    
    if (acceptorName) {
      collaborator.name = acceptorName;
    }

    // Log activity
    this.logActivity({
      type: 'accepted',
      collaboratorId: collaborator.id,
      collaboratorEmail: collaborator.email,
      performedBy: collaborator.email,
    });

    this.save();

    return collaborator;
  }

  /**
   * Revoke an invitation
   */
  revokeInvitation(email: string, revokedBy: string): void {
    const invitation = this.storage.invitations.find(
      i => i.email === email && i.status === 'pending'
    );

    if (!invitation) {
      throw new TsgitError(
        `No pending invitation found for '${email}'`,
        ErrorCode.OPERATION_FAILED
      );
    }

    invitation.status = 'revoked';
    invitation.revokedAt = Date.now();

    // Also remove the pending collaborator
    this.storage.collaborators = this.storage.collaborators.filter(
      c => !(c.email === email && c.status === 'pending')
    );

    // Log activity
    this.logActivity({
      type: 'revoked',
      collaboratorEmail: email,
      performedBy: revokedBy,
    });

    this.save();
  }

  /**
   * Remove a collaborator
   */
  remove(email: string, removedBy: string): void {
    const collaborator = this.getByEmail(email);

    if (!collaborator) {
      throw new TsgitError(
        `Collaborator '${email}' not found`,
        ErrorCode.OPERATION_FAILED
      );
    }

    // Cannot remove the last owner
    if (collaborator.role === 'owner') {
      const owners = this.storage.collaborators.filter(
        c => c.role === 'owner' && c.status === 'accepted'
      );
      if (owners.length <= 1) {
        throw new TsgitError(
          'Cannot remove the last owner',
          ErrorCode.OPERATION_FAILED,
          ['Transfer ownership to another collaborator first']
        );
      }
    }

    // Remove from storage
    this.storage.collaborators = this.storage.collaborators.filter(c => c.email !== email);

    // Remove from teams
    for (const team of this.storage.teams) {
      team.members = team.members.filter(id => id !== collaborator.id);
    }

    // Log activity
    this.logActivity({
      type: 'removed',
      collaboratorId: collaborator.id,
      collaboratorEmail: email,
      performedBy: removedBy,
      details: { previousRole: collaborator.role },
    });

    this.save();
  }

  /**
   * Update a collaborator's role
   */
  updateRole(email: string, newRole: CollaboratorRole, updatedBy: string): Collaborator {
    const collaborator = this.getByEmail(email);

    if (!collaborator) {
      throw new TsgitError(
        `Collaborator '${email}' not found`,
        ErrorCode.OPERATION_FAILED
      );
    }

    // Cannot demote the last owner
    if (collaborator.role === 'owner' && newRole !== 'owner') {
      const owners = this.storage.collaborators.filter(
        c => c.role === 'owner' && c.status === 'accepted'
      );
      if (owners.length <= 1) {
        throw new TsgitError(
          'Cannot demote the last owner',
          ErrorCode.OPERATION_FAILED,
          ['Promote another collaborator to owner first']
        );
      }
    }

    const previousRole = collaborator.role;
    collaborator.role = newRole;
    collaborator.permissions = {
      ...this.getPermissionsForRole(newRole),
      ...collaborator.customPermissions,
    };

    // Log activity
    this.logActivity({
      type: 'role_changed',
      collaboratorId: collaborator.id,
      collaboratorEmail: email,
      performedBy: updatedBy,
      details: { previousRole, newRole },
    });

    this.save();

    return collaborator;
  }

  /**
   * Update custom permissions for a collaborator
   */
  updatePermissions(
    email: string,
    permissions: Partial<CollaboratorPermissions>,
    updatedBy: string
  ): Collaborator {
    const collaborator = this.getByEmail(email);

    if (!collaborator) {
      throw new TsgitError(
        `Collaborator '${email}' not found`,
        ErrorCode.OPERATION_FAILED
      );
    }

    collaborator.customPermissions = {
      ...collaborator.customPermissions,
      ...permissions,
    };

    collaborator.permissions = {
      ...this.getPermissionsForRole(collaborator.role),
      ...collaborator.customPermissions,
    };

    // Log activity
    this.logActivity({
      type: 'permissions_updated',
      collaboratorId: collaborator.id,
      collaboratorEmail: email,
      performedBy: updatedBy,
      details: { permissions },
    });

    this.save();

    return collaborator;
  }

  // ==================== TEAM MANAGEMENT ====================

  /**
   * Create a new team
   */
  createTeam(
    name: string,
    role: CollaboratorRole,
    createdBy: string,
    options: { description?: string; members?: string[] } = {}
  ): Team {
    // Validate name
    const slug = this.slugify(name);
    
    if (this.storage.teams.some(t => t.slug === slug)) {
      throw new TsgitError(
        `Team '${name}' already exists`,
        ErrorCode.OPERATION_FAILED
      );
    }

    // Check max teams limit
    const config = this.getConfig();
    if (config.maxTeams && this.storage.teams.length >= config.maxTeams) {
      throw new TsgitError(
        `Maximum number of teams (${config.maxTeams}) reached`,
        ErrorCode.OPERATION_FAILED
      );
    }

    const team: Team = {
      id: this.generateId(),
      name,
      slug,
      description: options.description,
      role,
      members: options.members || [],
      createdAt: Date.now(),
      createdBy,
    };

    this.storage.teams.push(team);
    this.save();

    return team;
  }

  /**
   * Delete a team
   */
  deleteTeam(slug: string): void {
    const index = this.storage.teams.findIndex(t => t.slug === slug);
    
    if (index === -1) {
      throw new TsgitError(
        `Team '${slug}' not found`,
        ErrorCode.OPERATION_FAILED
      );
    }

    const team = this.storage.teams[index];

    // Remove team from collaborators
    for (const collaborator of this.storage.collaborators) {
      if (collaborator.teams) {
        collaborator.teams = collaborator.teams.filter(t => t !== team.id);
      }
    }

    this.storage.teams.splice(index, 1);
    this.save();
  }

  /**
   * Add a member to a team
   */
  addTeamMember(teamSlug: string, email: string): Team {
    const team = this.storage.teams.find(t => t.slug === teamSlug);
    
    if (!team) {
      throw new TsgitError(
        `Team '${teamSlug}' not found`,
        ErrorCode.OPERATION_FAILED
      );
    }

    const collaborator = this.getByEmail(email);
    
    if (!collaborator) {
      throw new TsgitError(
        `Collaborator '${email}' not found`,
        ErrorCode.OPERATION_FAILED
      );
    }

    if (team.members.includes(collaborator.id)) {
      throw new TsgitError(
        `'${email}' is already a member of team '${team.name}'`,
        ErrorCode.OPERATION_FAILED
      );
    }

    team.members.push(collaborator.id);
    
    if (!collaborator.teams) {
      collaborator.teams = [];
    }
    collaborator.teams.push(team.id);

    this.save();

    return team;
  }

  /**
   * Remove a member from a team
   */
  removeTeamMember(teamSlug: string, email: string): Team {
    const team = this.storage.teams.find(t => t.slug === teamSlug);
    
    if (!team) {
      throw new TsgitError(
        `Team '${teamSlug}' not found`,
        ErrorCode.OPERATION_FAILED
      );
    }

    const collaborator = this.getByEmail(email);
    
    if (!collaborator) {
      throw new TsgitError(
        `Collaborator '${email}' not found`,
        ErrorCode.OPERATION_FAILED
      );
    }

    team.members = team.members.filter(id => id !== collaborator.id);
    
    if (collaborator.teams) {
      collaborator.teams = collaborator.teams.filter(t => t !== team.id);
    }

    this.save();

    return team;
  }

  // ==================== QUERIES ====================

  /**
   * Get a collaborator by email
   */
  getByEmail(email: string): Collaborator | undefined {
    return this.storage.collaborators.find(
      c => c.email.toLowerCase() === email.toLowerCase()
    );
  }

  /**
   * Get a collaborator by ID
   */
  getById(id: string): Collaborator | undefined {
    return this.storage.collaborators.find(c => c.id === id);
  }

  /**
   * List all collaborators
   */
  list(options: { status?: InvitationStatus; role?: CollaboratorRole } = {}): Collaborator[] {
    let collaborators = [...this.storage.collaborators];

    if (options.status) {
      collaborators = collaborators.filter(c => c.status === options.status);
    }

    if (options.role) {
      collaborators = collaborators.filter(c => c.role === options.role);
    }

    return collaborators.sort((a, b) => {
      // Sort by role hierarchy, then by name/email
      const roleCompare = ROLE_HIERARCHY[b.role] - ROLE_HIERARCHY[a.role];
      if (roleCompare !== 0) return roleCompare;
      return (a.name || a.email).localeCompare(b.name || b.email);
    });
  }

  /**
   * List all teams
   */
  listTeams(): Team[] {
    return [...this.storage.teams];
  }

  /**
   * Get a team by slug
   */
  getTeam(slug: string): Team | undefined {
    return this.storage.teams.find(t => t.slug === slug);
  }

  /**
   * List pending invitations
   */
  listInvitations(status?: InvitationStatus): Invitation[] {
    let invitations = [...this.storage.invitations];

    if (status) {
      invitations = invitations.filter(i => i.status === status);
    }

    return invitations.sort((a, b) => b.invitedAt - a.invitedAt);
  }

  /**
   * Get activity log
   */
  getActivityLog(limit: number = 50): CollaboratorActivity[] {
    return this.storage.activityLog
      .sort((a, b) => b.performedAt - a.performedAt)
      .slice(0, limit);
  }

  // ==================== PERMISSION CHECKS ====================

  /**
   * Check if a user has a specific permission
   */
  hasPermission(email: string, permission: keyof CollaboratorPermissions): boolean {
    const collaborator = this.getByEmail(email);
    
    if (!collaborator || collaborator.status !== 'accepted') {
      return false;
    }

    return collaborator.permissions[permission];
  }

  /**
   * Check if a user has at least a specific role level
   */
  hasRole(email: string, minimumRole: CollaboratorRole): boolean {
    const collaborator = this.getByEmail(email);
    
    if (!collaborator || collaborator.status !== 'accepted') {
      return false;
    }

    return ROLE_HIERARCHY[collaborator.role] >= ROLE_HIERARCHY[minimumRole];
  }

  /**
   * Get permissions for a role
   */
  getPermissionsForRole(role: CollaboratorRole): CollaboratorPermissions {
    return { ...ROLE_PERMISSIONS[role] };
  }

  // ==================== UTILITY METHODS ====================

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Create a URL-safe slug from a name
   */
  private slugify(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Log an activity
   */
  private logActivity(activity: Omit<CollaboratorActivity, 'id' | 'performedAt'>): void {
    this.storage.activityLog.push({
      id: this.generateId(),
      performedAt: Date.now(),
      ...activity,
    });

    // Keep only last 1000 entries
    if (this.storage.activityLog.length > 1000) {
      this.storage.activityLog = this.storage.activityLog.slice(-1000);
    }
  }

  /**
   * Clean up expired invitations
   */
  cleanupExpiredInvitations(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const invitation of this.storage.invitations) {
      if (invitation.status === 'pending' && now > invitation.expiresAt) {
        invitation.status = 'expired';
        cleaned++;
      }
    }

    // Remove expired pending collaborators
    this.storage.collaborators = this.storage.collaborators.filter(c => {
      if (c.status === 'pending' && c.inviteExpiresAt && now > c.inviteExpiresAt) {
        return false;
      }
      return true;
    });

    if (cleaned > 0) {
      this.save();
    }

    return cleaned;
  }

  /**
   * Get summary statistics
   */
  getStats(): {
    total: number;
    active: number;
    pending: number;
    byRole: Record<CollaboratorRole, number>;
    teams: number;
  } {
    const active = this.storage.collaborators.filter(c => c.status === 'accepted');
    const pending = this.storage.collaborators.filter(c => c.status === 'pending');

    const byRole: Record<CollaboratorRole, number> = {
      owner: 0,
      admin: 0,
      maintainer: 0,
      contributor: 0,
      viewer: 0,
    };

    for (const c of active) {
      byRole[c.role]++;
    }

    return {
      total: this.storage.collaborators.length,
      active: active.length,
      pending: pending.length,
      byRole,
      teams: this.storage.teams.length,
    };
  }
}
