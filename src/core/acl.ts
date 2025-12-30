/**
 * Access Control List (ACL) Module
 * 
 * Centralized security layer for wi that provides:
 * - Consistent permission checking across all endpoints
 * - Repository access control (owner, collaborator, public access)
 * - Organization role enforcement
 * - OAuth scope validation
 * - Audit logging for security-sensitive operations
 * 
 * @module acl
 */

import { repoModel, collaboratorModel, orgMemberModel } from '../db/models';
import type { Repository } from '../db/schema';

/**
 * Permission levels for repositories
 * These map to the database permission enum
 */
export type RepoPermission = 'read' | 'write' | 'admin';

/**
 * Organization roles
 */
export type OrgRole = 'member' | 'admin' | 'owner';

/**
 * OAuth scopes that can be requested by apps
 */
export type OAuthScope = 
  | 'user:read'
  | 'user:email'
  | 'repo:read'
  | 'repo:write'
  | 'repo:admin'
  | 'org:read'
  | 'org:write'
  | 'workflow:read'
  | 'workflow:write'
  | 'issue:read'
  | 'issue:write'
  | 'pull:read'
  | 'pull:write'
  | 'webhook:read'
  | 'webhook:write';

/**
 * Access check result with detailed information
 */
export interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
  effectivePermission?: RepoPermission | OrgRole;
  source?: 'owner' | 'collaborator' | 'org_member' | 'public';
}

/**
 * Context for access checks
 */
export interface AccessContext {
  userId?: string;
  oauthScopes?: OAuthScope[];
  isServiceAccount?: boolean;
}

/**
 * Hierarchical permission levels for comparison
 */
const REPO_PERMISSION_LEVELS: Record<RepoPermission, number> = {
  read: 1,
  write: 2,
  admin: 3,
};

const ORG_ROLE_LEVELS: Record<OrgRole, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

/**
 * Maps OAuth scopes to repository permissions
 */
const OAUTH_SCOPE_TO_REPO_PERMISSION: Partial<Record<OAuthScope, RepoPermission>> = {
  'repo:read': 'read',
  'repo:write': 'write',
  'repo:admin': 'admin',
  'issue:read': 'read',
  'issue:write': 'write',
  'pull:read': 'read',
  'pull:write': 'write',
  'webhook:read': 'read',
  'webhook:write': 'admin',
  'workflow:read': 'read',
  'workflow:write': 'write',
};

/**
 * Access Control List (ACL) - Main security module
 * 
 * Provides centralized, consistent access control for all wi operations.
 * 
 * @example
 * ```typescript
 * // Check if user can read a repository
 * const result = await ACL.canAccessRepo(userId, repoId, 'read');
 * if (!result.allowed) {
 *   throw new Error(result.reason);
 * }
 * 
 * // Check with OAuth scope enforcement
 * const result = await ACL.canAccessRepo(userId, repoId, 'write', {
 *   oauthScopes: ['repo:read'] // User only has read scope
 * });
 * // result.allowed = false (insufficient OAuth scope)
 * ```
 */
export const ACL = {
  /**
   * Check if a user can access a repository with the required permission
   * 
   * Access is granted if:
   * 1. User is the repository owner (full access)
   * 2. User is a collaborator with sufficient permission level
   * 3. For org-owned repos: user is an org member with appropriate access
   * 4. For public repos: read access is granted to everyone
   * 
   * OAuth scope checking:
   * If oauthScopes is provided in context, the user must have a scope that
   * grants at least the required permission level.
   */
  async canAccessRepo(
    repoId: string,
    requiredPermission: RepoPermission,
    context: AccessContext
  ): Promise<AccessCheckResult> {
    const { userId, oauthScopes } = context;

    // Get the repository
    const repo = await repoModel.findById(repoId);
    if (!repo) {
      return { allowed: false, reason: 'Repository not found' };
    }

    // Public repository read access
    if (!repo.isPrivate && requiredPermission === 'read') {
      // Check OAuth scope if present
      if (oauthScopes && !this.hasOAuthScopeForPermission(oauthScopes, 'read')) {
        return { 
          allowed: false, 
          reason: 'OAuth token does not have repo:read scope',
        };
      }
      return { 
        allowed: true, 
        effectivePermission: 'read',
        source: 'public',
      };
    }

    // From here, authentication is required
    if (!userId) {
      return { 
        allowed: false, 
        reason: 'Authentication required',
      };
    }

    // Check OAuth scopes if present
    if (oauthScopes && !this.hasOAuthScopeForPermission(oauthScopes, requiredPermission)) {
      return { 
        allowed: false, 
        reason: `OAuth token does not have sufficient scope (requires repo:${requiredPermission} or higher)`,
      };
    }

    // Owner has full access
    if (repo.ownerId === userId) {
      return { 
        allowed: true, 
        effectivePermission: 'admin',
        source: 'owner',
      };
    }

    // Check if user is a collaborator
    const collaborator = await collaboratorModel.find(repoId, userId);
    if (collaborator) {
      const hasPermission = REPO_PERMISSION_LEVELS[collaborator.permission] >= 
                           REPO_PERMISSION_LEVELS[requiredPermission];
      if (hasPermission) {
        return { 
          allowed: true, 
          effectivePermission: collaborator.permission,
          source: 'collaborator',
        };
      }
    }

    // For org-owned repos, check org membership
    if (repo.ownerType === 'organization') {
      const orgAccess = await this.checkOrgRepoAccess(repo.ownerId, userId, requiredPermission);
      if (orgAccess.allowed) {
        return orgAccess;
      }
    }

    return { 
      allowed: false, 
      reason: `You do not have ${requiredPermission} access to this repository`,
    };
  },

  /**
   * Check if a user has a specific organization role
   */
  async canAccessOrg(
    orgId: string,
    requiredRole: OrgRole,
    context: AccessContext
  ): Promise<AccessCheckResult> {
    const { userId, oauthScopes } = context;

    if (!userId) {
      return { 
        allowed: false, 
        reason: 'Authentication required',
      };
    }

    // Check OAuth scopes if present
    if (oauthScopes) {
      const requiredScope = requiredRole === 'member' ? 'org:read' : 'org:write';
      if (!oauthScopes.includes(requiredScope as OAuthScope) && 
          !oauthScopes.includes('org:write' as OAuthScope)) {
        return { 
          allowed: false, 
          reason: `OAuth token does not have ${requiredScope} scope`,
        };
      }
    }

    const hasRole = await orgMemberModel.hasRole(orgId, userId, requiredRole);
    if (!hasRole) {
      return { 
        allowed: false, 
        reason: `You do not have ${requiredRole} role in this organization`,
      };
    }

    const member = await orgMemberModel.find(orgId, userId);
    return { 
      allowed: true, 
      effectivePermission: member?.role as OrgRole,
      source: 'org_member',
    };
  },

  /**
   * Check organization member access to organization repositories
   * 
   * Org members get implicit read access to all org repos.
   * Org admins get implicit write access.
   * Org owners get implicit admin access.
   */
  async checkOrgRepoAccess(
    orgId: string,
    userId: string,
    requiredPermission: RepoPermission
  ): Promise<AccessCheckResult> {
    const member = await orgMemberModel.find(orgId, userId);
    if (!member) {
      return { allowed: false };
    }

    // Map org roles to repo permissions
    const rolePermissionMap: Record<string, RepoPermission> = {
      owner: 'admin',
      admin: 'write',
      member: 'read',
    };

    const implicitPermission = rolePermissionMap[member.role];
    const hasPermission = REPO_PERMISSION_LEVELS[implicitPermission] >= 
                         REPO_PERMISSION_LEVELS[requiredPermission];

    if (hasPermission) {
      return { 
        allowed: true, 
        effectivePermission: implicitPermission,
        source: 'org_member',
      };
    }

    return { allowed: false };
  },

  /**
   * Check if OAuth scopes include permission for the required level
   */
  hasOAuthScopeForPermission(scopes: OAuthScope[], requiredPermission: RepoPermission): boolean {
    const requiredLevel = REPO_PERMISSION_LEVELS[requiredPermission];
    
    for (const scope of scopes) {
      const scopePermission = OAUTH_SCOPE_TO_REPO_PERMISSION[scope];
      if (scopePermission) {
        const scopeLevel = REPO_PERMISSION_LEVELS[scopePermission];
        if (scopeLevel >= requiredLevel) {
          return true;
        }
      }
    }
    
    return false;
  },

  /**
   * Assert that a user can access a repository
   * Throws an error if access is denied
   */
  async assertRepoAccess(
    repoId: string,
    requiredPermission: RepoPermission,
    context: AccessContext
  ): Promise<{ repo: Repository; effectivePermission: RepoPermission }> {
    const repo = await repoModel.findById(repoId);
    if (!repo) {
      throw new ACLError('NOT_FOUND', 'Repository not found');
    }

    const result = await this.canAccessRepo(repoId, requiredPermission, context);
    if (!result.allowed) {
      if (!context.userId) {
        throw new ACLError('UNAUTHORIZED', result.reason || 'Authentication required');
      }
      throw new ACLError('FORBIDDEN', result.reason || 'Access denied');
    }

    return { 
      repo, 
      effectivePermission: result.effectivePermission as RepoPermission,
    };
  },

  /**
   * Assert that a user has a role in an organization
   * Throws an error if access is denied
   */
  async assertOrgRole(
    orgId: string,
    requiredRole: OrgRole,
    context: AccessContext
  ): Promise<{ effectiveRole: OrgRole }> {
    if (!context.userId) {
      throw new ACLError('UNAUTHORIZED', 'Authentication required');
    }

    const result = await this.canAccessOrg(orgId, requiredRole, context);
    if (!result.allowed) {
      throw new ACLError('FORBIDDEN', result.reason || 'Access denied');
    }

    return { 
      effectiveRole: result.effectivePermission as OrgRole,
    };
  },

  /**
   * Check if user is the owner of a resource
   */
  isOwner(resourceOwnerId: string, userId?: string): boolean {
    if (!userId) return false;
    return resourceOwnerId === userId;
  },

  /**
   * Get all accessible repositories for a user
   * Useful for listings and searches
   */
  async getAccessibleRepoIds(userId: string | undefined): Promise<{
    publicRepos: boolean;  // User can see all public repos
    ownedRepoOwnerIds: string[];  // Repos owned by these IDs
    collaboratorRepoIds: string[];  // Repos where user is a collaborator
    orgIds: string[];  // All repos in these orgs
  }> {
    if (!userId) {
      return {
        publicRepos: true,
        ownedRepoOwnerIds: [],
        collaboratorRepoIds: [],
        orgIds: [],
      };
    }

    // Get orgs user is a member of
    const orgMemberships = await orgMemberModel.listByUser(userId);
    const orgIds = orgMemberships.map(m => m.orgId);

    return {
      publicRepos: true,
      ownedRepoOwnerIds: [userId],
      collaboratorRepoIds: [], // Would need to query collaborators table
      orgIds,
    };
  },
};

/**
 * ACL Error types
 */
export type ACLErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'BAD_REQUEST';

/**
 * ACL Error class for consistent error handling
 */
export class ACLError extends Error {
  readonly code: ACLErrorCode;
  readonly statusCode: number;

  constructor(code: ACLErrorCode, message: string) {
    super(message);
    this.name = 'ACLError';
    this.code = code;
    this.statusCode = {
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      BAD_REQUEST: 400,
    }[code];
  }
}

/**
 * Permission check helper for inline use
 * Returns a boolean for simple checks
 */
export async function checkRepoPermission(
  repoId: string,
  userId: string | undefined,
  requiredPermission: RepoPermission
): Promise<boolean> {
  const result = await ACL.canAccessRepo(repoId, requiredPermission, { userId });
  return result.allowed;
}

/**
 * Permission check helper for organizations
 */
export async function checkOrgRole(
  orgId: string,
  userId: string | undefined,
  requiredRole: OrgRole
): Promise<boolean> {
  if (!userId) return false;
  const result = await ACL.canAccessOrg(orgId, requiredRole, { userId });
  return result.allowed;
}

/**
 * Security logging for audit trail
 */
export function logSecurityEvent(event: {
  type: 'access_granted' | 'access_denied' | 'permission_changed' | 'suspicious_activity';
  userId?: string;
  resourceType: 'repo' | 'org' | 'user';
  resourceId: string;
  action: string;
  details?: Record<string, unknown>;
}): void {
  // In production, this would write to a security audit log
  // For now, we'll use console.log with a special prefix
  console.log(`[SECURITY] ${event.type}:`, JSON.stringify({
    ...event,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Check if a user can access a repository (simplified helper for API routes)
 * Returns a simple result with allowed/denied status
 */
export async function checkRepoAccess(
  repoId: string,
  userId: string | undefined,
  requiredLevel: RepoPermission
): Promise<AccessCheckResult> {
  return ACL.canAccessRepo(repoId, requiredLevel, { userId });
}

export default ACL;
