/**
 * Branch Protection Rules Model
 *
 * Database operations for repository branch protection rules.
 * Used to enforce policies like requiring PRs, reviews, status checks.
 */

import { eq } from 'drizzle-orm';
import { getDb } from '../index';
import {
  branchProtectionRules,
  type BranchProtectionRule,
  type NewBranchProtectionRule,
} from '../schema';

/**
 * Simple glob pattern matching
 * Supports: * (single segment), ** (multiple segments)
 */
function matchesPattern(branchName: string, pattern: string): boolean {
  // Escape regex special chars except * 
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{DOUBLE}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{DOUBLE}}/g, '.*');

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(branchName);
}

export const branchProtectionModel = {
  /**
   * Find a rule by ID
   */
  async findById(id: string): Promise<BranchProtectionRule | undefined> {
    const db = getDb();
    const [rule] = await db
      .select()
      .from(branchProtectionRules)
      .where(eq(branchProtectionRules.id, id));
    return rule;
  },

  /**
   * Find all rules for a repository
   */
  async findByRepoId(repoId: string): Promise<BranchProtectionRule[]> {
    const db = getDb();
    return db
      .select()
      .from(branchProtectionRules)
      .where(eq(branchProtectionRules.repoId, repoId));
  },

  /**
   * Find the rule that matches a specific branch
   * Returns the first matching rule (most specific should be first)
   */
  async findMatchingRule(
    repoId: string,
    branchName: string
  ): Promise<BranchProtectionRule | undefined> {
    const rules = await this.findByRepoId(repoId);

    // First try exact match
    const exactMatch = rules.find((rule) => rule.pattern === branchName);
    if (exactMatch) return exactMatch;

    // Then try pattern match
    return rules.find((rule) => matchesPattern(branchName, rule.pattern));
  },

  /**
   * Check if a branch is protected
   */
  async isProtected(repoId: string, branchName: string): Promise<boolean> {
    const rule = await this.findMatchingRule(repoId, branchName);
    return !!rule;
  },

  /**
   * Create a new protection rule
   */
  async create(
    data: Omit<NewBranchProtectionRule, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<BranchProtectionRule> {
    const db = getDb();
    const [rule] = await db
      .insert(branchProtectionRules)
      .values(data)
      .returning();
    return rule;
  },

  /**
   * Update a protection rule
   */
  async update(
    id: string,
    data: Partial<Omit<NewBranchProtectionRule, 'id' | 'repoId' | 'createdAt'>>
  ): Promise<BranchProtectionRule | undefined> {
    const db = getDb();
    const [rule] = await db
      .update(branchProtectionRules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(branchProtectionRules.id, id))
      .returning();
    return rule;
  },

  /**
   * Delete a protection rule
   */
  async delete(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db
      .delete(branchProtectionRules)
      .where(eq(branchProtectionRules.id, id))
      .returning();
    return result.length > 0;
  },

  /**
   * Delete all rules for a repository
   */
  async deleteAllForRepo(repoId: string): Promise<number> {
    const db = getDb();
    const result = await db
      .delete(branchProtectionRules)
      .where(eq(branchProtectionRules.repoId, repoId))
      .returning();
    return result.length;
  },

  /**
   * Check if a rule belongs to a repository
   */
  async belongsToRepo(ruleId: string, repoId: string): Promise<boolean> {
    const rule = await this.findById(ruleId);
    return rule?.repoId === repoId;
  },

  /**
   * Get required status checks for a rule
   */
  getRequiredStatusChecks(rule: BranchProtectionRule): string[] {
    if (!rule.requiredStatusChecks) return [];
    try {
      return JSON.parse(rule.requiredStatusChecks);
    } catch {
      return [];
    }
  },

  /**
   * Check if a push is allowed to a protected branch
   */
  async canPush(
    repoId: string,
    branchName: string,
    options: {
      isForcePush?: boolean;
      isDeletion?: boolean;
      isPRMerge?: boolean;
    } = {}
  ): Promise<{ allowed: boolean; reason?: string; rule?: BranchProtectionRule }> {
    const rule = await this.findMatchingRule(repoId, branchName);

    if (!rule) {
      return { allowed: true };
    }

    // PR merges are always allowed on protected branches
    if (options.isPRMerge) {
      return { allowed: true, rule };
    }

    // Check force push
    if (options.isForcePush && !rule.allowForcePush) {
      return {
        allowed: false,
        reason: `Force push is not allowed on protected branch '${branchName}'`,
        rule,
      };
    }

    // Check deletion
    if (options.isDeletion && !rule.allowDeletion) {
      return {
        allowed: false,
        reason: `Deletion is not allowed on protected branch '${branchName}'`,
        rule,
      };
    }

    // Check if PR is required
    if (rule.requirePullRequest) {
      return {
        allowed: false,
        reason: `Branch '${branchName}' is protected. Please open a pull request.`,
        rule,
      };
    }

    return { allowed: true, rule };
  },
};

/**
 * Export pattern matching for testing
 */
export { matchesPattern };
