/**
 * tRPC Context
 * Provides request context including user authentication and permissions
 */

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Context {
  user: User | null;
}

/**
 * Repository collaborator permissions
 */
export type Permission = 'read' | 'write' | 'admin';

/**
 * In-memory store for repository collaborators (in production, this would be a database)
 */
const collaboratorsStore = new Map<string, Map<string, Permission>>();

/**
 * Get a user's permission level for a repository
 */
export async function getRepoPermission(
  userId: string,
  repoId: string
): Promise<Permission | null> {
  const repoCollaborators = collaboratorsStore.get(repoId);
  if (!repoCollaborators) {
    return null;
  }
  return repoCollaborators.get(userId) ?? null;
}

/**
 * Set a user's permission level for a repository
 */
export async function setRepoPermission(
  userId: string,
  repoId: string,
  permission: Permission
): Promise<void> {
  let repoCollaborators = collaboratorsStore.get(repoId);
  if (!repoCollaborators) {
    repoCollaborators = new Map();
    collaboratorsStore.set(repoId, repoCollaborators);
  }
  repoCollaborators.set(userId, permission);
}

/**
 * Check if a user has at least the required permission level
 */
export function hasPermission(
  userPermission: Permission | null,
  required: Permission
): boolean {
  if (!userPermission) {
    return false;
  }

  const levels: Record<Permission, number> = {
    read: 1,
    write: 2,
    admin: 3,
  };

  return levels[userPermission] >= levels[required];
}

/**
 * Remove a user's permission from a repository
 */
export async function removeRepoPermission(
  userId: string,
  repoId: string
): Promise<boolean> {
  const repoCollaborators = collaboratorsStore.get(repoId);
  if (!repoCollaborators) {
    return false;
  }
  return repoCollaborators.delete(userId);
}

/**
 * Clear all collaborators (useful for testing)
 */
export async function clearCollaborators(): Promise<void> {
  collaboratorsStore.clear();
}
