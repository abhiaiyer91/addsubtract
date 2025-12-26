/**
 * Database Module
 * In-memory database for development/testing
 * Replace with actual database (PostgreSQL, SQLite, etc.) in production
 */

import { Repository, User, Activity } from './schema';

/**
 * In-memory data store
 * In production, this would be replaced with actual database queries
 */
class Database {
  private users: Map<string, User> = new Map();
  private repositories: Map<string, Repository> = new Map();
  private activities: Activity[] = [];

  // User operations
  getUser(id: string): User | undefined {
    return this.users.get(id);
  }

  getUserByUsername(username: string): User | undefined {
    return Array.from(this.users.values()).find(u => u.username === username);
  }

  createUser(user: User): User {
    this.users.set(user.id, user);
    return user;
  }

  // Repository operations
  getRepository(id: string): Repository | undefined {
    return this.repositories.get(id);
  }

  getRepositoryByOwnerAndName(ownerId: string, name: string): Repository | undefined {
    return Array.from(this.repositories.values()).find(
      r => r.ownerId === ownerId && r.name === name
    );
  }

  getRepositoriesByOwner(ownerId: string): Repository[] {
    return Array.from(this.repositories.values()).filter(r => r.ownerId === ownerId);
  }

  getForksByParent(parentId: string): Repository[] {
    return Array.from(this.repositories.values()).filter(r => r.forkedFromId === parentId);
  }

  createRepository(repo: Repository): Repository {
    this.repositories.set(repo.id, repo);
    return repo;
  }

  updateRepository(id: string, updates: Partial<Repository>): Repository | undefined {
    const repo = this.repositories.get(id);
    if (!repo) return undefined;
    
    const updated = { ...repo, ...updates, updatedAt: new Date() };
    this.repositories.set(id, updated);
    return updated;
  }

  deleteRepository(id: string): boolean {
    return this.repositories.delete(id);
  }

  // Activity operations
  logActivity(activity: Activity): Activity {
    this.activities.push(activity);
    return activity;
  }

  getActivitiesByUser(userId: string, limit = 50): Activity[] {
    return this.activities
      .filter(a => a.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  getActivitiesByRepo(repoId: string, limit = 50): Activity[] {
    return this.activities
      .filter(a => a.repoId === repoId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}

// Export singleton instance
export const db = new Database();

// Re-export schema types
export * from './schema';
