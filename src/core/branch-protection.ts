/**
 * Branch Protection Rules System
 * 
 * Provides Git-like branch protection for important branches (main, release/x, etc.)
 * 
 * Features:
 * - Pattern matching for branch names (glob-style: main, release/x, feature/x)
 * - Push restrictions (block direct pushes, require PRs)
 * - Force push blocking
 * - Branch deletion blocking
 * - Required reviews and status checks (metadata for integration)
 * - Allowed pushers list
 * 
 * Storage: .wit/branch-protection.json
 */

import * as path from 'path';
import { exists, readFile, writeFile, mkdirp } from '../utils/fs';
import { TsgitError, ErrorCode } from './errors';

/**
 * Branch protection rule configuration
 */
export interface BranchProtectionRule {
  id: string;                         // Unique identifier (UUID)
  pattern: string;                    // Branch pattern: 'main', 'release/*', '**/protected'
  
  // Push restrictions
  requirePullRequest: boolean;        // Block direct pushes, require PR
  requiredApprovals: number;          // Number of required PR approvals (0-10)
  dismissStaleReviews: boolean;       // Dismiss approvals on new commits
  requireCodeOwnerReview: boolean;    // Require review from code owners
  
  // Status checks
  requireStatusChecks: boolean;       // Require status checks to pass
  requiredStatusChecks: string[];     // List of required check names
  requireBranchUpToDate: boolean;     // Require branch to be up-to-date before merge
  
  // Push controls
  allowForcePush: boolean;            // Allow force pushes (default: false)
  allowDeletions: boolean;            // Allow branch deletions (default: false)
  restrictPushAccess: boolean;        // Restrict who can push
  allowedPushers: string[];           // List of allowed user/team IDs
  
  // Merge queue
  requireMergeQueue: boolean;         // Require PRs to go through merge queue
  
  // Metadata
  createdAt: number;                  // Unix timestamp
  updatedAt: number;                  // Unix timestamp
  description?: string;               // Optional description
}

/**
 * Result of a protection check
 */
export interface ProtectionResult {
  allowed: boolean;
  violations: ProtectionViolation[];
  matchedRules: BranchProtectionRule[];
}

/**
 * A single protection violation
 */
export interface ProtectionViolation {
  ruleId: string;
  pattern: string;
  type: ViolationType;
  message: string;
}

/**
 * Types of protection violations
 */
export type ViolationType = 
  | 'DIRECT_PUSH_BLOCKED'
  | 'FORCE_PUSH_BLOCKED'
  | 'DELETION_BLOCKED'
  | 'PUSH_ACCESS_DENIED'
  | 'REVIEWS_REQUIRED'
  | 'STATUS_CHECKS_REQUIRED'
  | 'BRANCH_NOT_UP_TO_DATE'
  | 'MERGE_QUEUE_REQUIRED';

/**
 * Storage format for branch protection rules
 */
interface BranchProtectionStorage {
  version: number;
  rules: BranchProtectionRule[];
}

/**
 * Default rule values
 */
const DEFAULT_RULE: Omit<BranchProtectionRule, 'id' | 'pattern' | 'createdAt' | 'updatedAt'> = {
  requirePullRequest: false,
  requiredApprovals: 0,
  dismissStaleReviews: false,
  requireCodeOwnerReview: false,
  requireStatusChecks: false,
  requiredStatusChecks: [],
  requireMergeQueue: false,
  requireBranchUpToDate: false,
  allowForcePush: false,
  allowDeletions: false,
  restrictPushAccess: false,
  allowedPushers: [],
};

/**
 * Generate a simple UUID
 */
function generateId(): string {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Branch Protection Manager
 * 
 * Manages storage and retrieval of branch protection rules
 */
export class BranchProtectionManager {
  private protectionPath: string;
  private rules: Map<string, BranchProtectionRule> = new Map();

  constructor(private gitDir: string) {
    this.protectionPath = path.join(gitDir, 'branch-protection.json');
    this.load();
  }

  /**
   * Initialize branch protection (create config file if needed)
   */
  init(): void {
    if (!exists(this.protectionPath)) {
      this.save();
    }
  }

  /**
   * Load rules from disk
   */
  private load(): void {
    if (!exists(this.protectionPath)) {
      return;
    }

    try {
      const content = readFile(this.protectionPath).toString('utf8');
      const data: BranchProtectionStorage = JSON.parse(content);
      
      this.rules.clear();
      for (const rule of data.rules) {
        this.rules.set(rule.id, rule);
      }
    } catch (error) {
      // Start fresh if corrupted
      this.rules.clear();
    }
  }

  /**
   * Save rules to disk
   */
  private save(): void {
    const data: BranchProtectionStorage = {
      version: 1,
      rules: Array.from(this.rules.values()).sort((a, b) => 
        a.pattern.localeCompare(b.pattern)
      ),
    };
    writeFile(this.protectionPath, JSON.stringify(data, null, 2));
  }

  /**
   * Add a new protection rule
   */
  addRule(pattern: string, options: Partial<Omit<BranchProtectionRule, 'id' | 'pattern' | 'createdAt' | 'updatedAt'>> = {}): BranchProtectionRule {
    // Check for duplicate pattern
    for (const rule of this.rules.values()) {
      if (rule.pattern === pattern) {
        throw new TsgitError(
          `Protection rule for pattern '${pattern}' already exists`,
          ErrorCode.INVALID_ARGUMENT,
          [
            `wit protect update ${pattern}    # Update existing rule`,
            `wit protect remove ${pattern}    # Remove existing rule first`,
          ],
          { pattern }
        );
      }
    }

    const now = Date.now();
    const rule: BranchProtectionRule = {
      ...DEFAULT_RULE,
      ...options,
      id: generateId(),
      pattern,
      createdAt: now,
      updatedAt: now,
    };

    this.rules.set(rule.id, rule);
    this.save();
    return rule;
  }

  /**
   * Update an existing rule
   */
  updateRule(pattern: string, options: Partial<Omit<BranchProtectionRule, 'id' | 'pattern' | 'createdAt' | 'updatedAt'>>): BranchProtectionRule {
    const existingRule = this.getRuleByPattern(pattern);
    if (!existingRule) {
      throw new TsgitError(
        `No protection rule found for pattern '${pattern}'`,
        ErrorCode.INVALID_ARGUMENT,
        [
          'wit protect list    # List existing rules',
          `wit protect add ${pattern}    # Add new rule`,
        ],
        { pattern }
      );
    }

    const updatedRule: BranchProtectionRule = {
      ...existingRule,
      ...options,
      updatedAt: Date.now(),
    };

    this.rules.set(existingRule.id, updatedRule);
    this.save();
    return updatedRule;
  }

  /**
   * Remove a protection rule by pattern
   */
  removeRule(pattern: string): boolean {
    const rule = this.getRuleByPattern(pattern);
    if (!rule) {
      return false;
    }
    
    this.rules.delete(rule.id);
    this.save();
    return true;
  }

  /**
   * Remove a rule by ID
   */
  removeRuleById(id: string): boolean {
    const deleted = this.rules.delete(id);
    if (deleted) {
      this.save();
    }
    return deleted;
  }

  /**
   * Get a rule by pattern
   */
  getRuleByPattern(pattern: string): BranchProtectionRule | null {
    for (const rule of this.rules.values()) {
      if (rule.pattern === pattern) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Get a rule by ID
   */
  getRuleById(id: string): BranchProtectionRule | null {
    return this.rules.get(id) || null;
  }

  /**
   * List all rules
   */
  listRules(): BranchProtectionRule[] {
    return Array.from(this.rules.values()).sort((a, b) => 
      a.pattern.localeCompare(b.pattern)
    );
  }

  /**
   * Get rules that match a specific branch
   */
  getRulesForBranch(branchName: string): BranchProtectionRule[] {
    const matching: BranchProtectionRule[] = [];
    
    for (const rule of this.rules.values()) {
      if (this.matchPattern(branchName, rule.pattern)) {
        matching.push(rule);
      }
    }
    
    return matching;
  }

  /**
   * Match a branch name against a pattern
   * Supports: exact match, *, **, glob patterns
   */
  private matchPattern(branchName: string, pattern: string): boolean {
    // Exact match
    if (pattern === branchName) {
      return true;
    }

    // Handle ** (matches any path depth)
    if (pattern.includes('**')) {
      const regex = new RegExp(
        '^' + pattern
          .replace(/\./g, '\\.')
          .replace(/\*\*/g, '.*')
          .replace(/(?<!\.)(\*)(?!\.)/g, '[^/]*') + '$'
      );
      return regex.test(branchName);
    }

    // Handle single * (matches within a single level)
    if (pattern.includes('*')) {
      const regex = new RegExp(
        '^' + pattern
          .replace(/\./g, '\\.')
          .replace(/\*/g, '[^/]*') + '$'
      );
      return regex.test(branchName);
    }

    return false;
  }

  /**
   * Check if any rules exist
   */
  hasRules(): boolean {
    return this.rules.size > 0;
  }

  /**
   * Clear all rules
   */
  clearAllRules(): void {
    this.rules.clear();
    this.save();
  }
}

/**
 * Branch Protection Engine
 * 
 * Enforces protection rules and returns detailed violation information
 */
export class BranchProtectionEngine {
  private manager: BranchProtectionManager;

  constructor(private gitDir: string) {
    this.manager = new BranchProtectionManager(gitDir);
  }

  /**
   * Get the underlying manager
   */
  getManager(): BranchProtectionManager {
    return this.manager;
  }

  /**
   * Get all rules matching a branch
   */
  getRulesForBranch(branchName: string): BranchProtectionRule[] {
    return this.manager.getRulesForBranch(branchName);
  }

  /**
   * Check if a push is allowed
   */
  canPush(branchName: string, userId?: string): ProtectionResult {
    const rules = this.manager.getRulesForBranch(branchName);
    const violations: ProtectionViolation[] = [];

    for (const rule of rules) {
      // Check if direct pushes are blocked
      if (rule.requirePullRequest) {
        violations.push({
          ruleId: rule.id,
          pattern: rule.pattern,
          type: 'DIRECT_PUSH_BLOCKED',
          message: `Direct pushes to '${branchName}' are blocked. Please create a pull request.`,
        });
      }

      // Check push access restrictions
      if (rule.restrictPushAccess && userId) {
        if (!rule.allowedPushers.includes(userId)) {
          violations.push({
            ruleId: rule.id,
            pattern: rule.pattern,
            type: 'PUSH_ACCESS_DENIED',
            message: `You are not authorized to push to '${branchName}'.`,
          });
        }
      }
    }

    return {
      allowed: violations.length === 0,
      violations,
      matchedRules: rules,
    };
  }

  /**
   * Check if a force push is allowed
   */
  canForcePush(branchName: string, userId?: string): ProtectionResult {
    const rules = this.manager.getRulesForBranch(branchName);
    const violations: ProtectionViolation[] = [];

    // First check normal push permissions
    const pushResult = this.canPush(branchName, userId);
    violations.push(...pushResult.violations);

    // Check force push specifically
    for (const rule of rules) {
      if (!rule.allowForcePush) {
        violations.push({
          ruleId: rule.id,
          pattern: rule.pattern,
          type: 'FORCE_PUSH_BLOCKED',
          message: `Force pushes to '${branchName}' are not allowed.`,
        });
      }
    }

    return {
      allowed: violations.length === 0,
      violations,
      matchedRules: rules,
    };
  }

  /**
   * Check if a branch can be deleted
   */
  canDeleteBranch(branchName: string, userId?: string): ProtectionResult {
    const rules = this.manager.getRulesForBranch(branchName);
    const violations: ProtectionViolation[] = [];

    for (const rule of rules) {
      if (!rule.allowDeletions) {
        violations.push({
          ruleId: rule.id,
          pattern: rule.pattern,
          type: 'DELETION_BLOCKED',
          message: `Deletion of branch '${branchName}' is not allowed.`,
        });
      }

      // Also check push access for deletion
      if (rule.restrictPushAccess && userId) {
        if (!rule.allowedPushers.includes(userId)) {
          violations.push({
            ruleId: rule.id,
            pattern: rule.pattern,
            type: 'PUSH_ACCESS_DENIED',
            message: `You are not authorized to delete '${branchName}'.`,
          });
        }
      }
    }

    return {
      allowed: violations.length === 0,
      violations,
      matchedRules: rules,
    };
  }

  /**
   * Check if a merge/PR can proceed
   * This checks review and status check requirements
   */
  canMerge(
    branchName: string, 
    options: {
      approvalCount?: number;
      hasCodeOwnerApproval?: boolean;
      passedChecks?: string[];
      isBranchUpToDate?: boolean;
    } = {}
  ): ProtectionResult {
    const rules = this.manager.getRulesForBranch(branchName);
    const violations: ProtectionViolation[] = [];
    const {
      approvalCount = 0,
      hasCodeOwnerApproval = false,
      passedChecks = [],
      isBranchUpToDate = true,
    } = options;

    for (const rule of rules) {
      // Check required approvals
      if (rule.requiredApprovals > 0 && approvalCount < rule.requiredApprovals) {
        violations.push({
          ruleId: rule.id,
          pattern: rule.pattern,
          type: 'REVIEWS_REQUIRED',
          message: `Requires ${rule.requiredApprovals} approval(s), but only ${approvalCount} received.`,
        });
      }

      // Check code owner review
      if (rule.requireCodeOwnerReview && !hasCodeOwnerApproval) {
        violations.push({
          ruleId: rule.id,
          pattern: rule.pattern,
          type: 'REVIEWS_REQUIRED',
          message: `Requires approval from a code owner.`,
        });
      }

      // Check status checks
      if (rule.requireStatusChecks && rule.requiredStatusChecks.length > 0) {
        const missingChecks = rule.requiredStatusChecks.filter(
          check => !passedChecks.includes(check)
        );
        if (missingChecks.length > 0) {
          violations.push({
            ruleId: rule.id,
            pattern: rule.pattern,
            type: 'STATUS_CHECKS_REQUIRED',
            message: `Required status checks not passing: ${missingChecks.join(', ')}`,
          });
        }
      }

      // Check branch up-to-date
      if (rule.requireBranchUpToDate && !isBranchUpToDate) {
        violations.push({
          ruleId: rule.id,
          pattern: rule.pattern,
          type: 'BRANCH_NOT_UP_TO_DATE',
          message: `Branch must be up-to-date with base branch before merging.`,
        });
      }
    }

    return {
      allowed: violations.length === 0,
      violations,
      matchedRules: rules,
    };
  }

  /**
   * Check if a branch is protected (has any matching rules)
   */
  isProtected(branchName: string): boolean {
    return this.manager.getRulesForBranch(branchName).length > 0;
  }

  /**
   * Get a summary of protection for a branch
   */
  getProtectionSummary(branchName: string): {
    isProtected: boolean;
    blocksPush: boolean;
    blocksForcePush: boolean;
    blocksDeletion: boolean;
    requiresReviews: boolean;
    requiresStatusChecks: boolean;
    rules: BranchProtectionRule[];
  } {
    const rules = this.manager.getRulesForBranch(branchName);
    
    return {
      isProtected: rules.length > 0,
      blocksPush: rules.some(r => r.requirePullRequest),
      blocksForcePush: rules.some(r => !r.allowForcePush),
      blocksDeletion: rules.some(r => !r.allowDeletions),
      requiresReviews: rules.some(r => r.requiredApprovals > 0 || r.requireCodeOwnerReview),
      requiresStatusChecks: rules.some(r => r.requireStatusChecks && r.requiredStatusChecks.length > 0),
      rules,
    };
  }
}

/**
 * Common rule presets for quick setup
 */
export const PROTECTION_PRESETS = {
  /**
   * Basic protection for main branches
   * Blocks force push and deletion, but allows direct push
   */
  basic: {
    requirePullRequest: false,
    requiredApprovals: 0,
    allowForcePush: false,
    allowDeletions: false,
  },

  /**
   * Standard protection requiring pull requests
   */
  standard: {
    requirePullRequest: true,
    requiredApprovals: 1,
    dismissStaleReviews: true,
    allowForcePush: false,
    allowDeletions: false,
  },

  /**
   * Strict protection with multiple reviews and status checks
   */
  strict: {
    requirePullRequest: true,
    requiredApprovals: 2,
    dismissStaleReviews: true,
    requireCodeOwnerReview: true,
    requireStatusChecks: true,
    requireBranchUpToDate: true,
    allowForcePush: false,
    allowDeletions: false,
  },
};

/**
 * Format a protection rule for display
 */
export function formatRule(rule: BranchProtectionRule): string {
  const lines: string[] = [];
  
  lines.push(`Pattern: ${rule.pattern}`);
  lines.push(`ID: ${rule.id}`);
  
  if (rule.description) {
    lines.push(`Description: ${rule.description}`);
  }
  
  lines.push('');
  lines.push('Push restrictions:');
  lines.push(`  - Require pull request: ${rule.requirePullRequest ? 'Yes' : 'No'}`);
  lines.push(`  - Allow force push: ${rule.allowForcePush ? 'Yes' : 'No'}`);
  lines.push(`  - Allow deletion: ${rule.allowDeletions ? 'Yes' : 'No'}`);
  
  if (rule.restrictPushAccess) {
    lines.push(`  - Restricted push access: Yes`);
    if (rule.allowedPushers.length > 0) {
      lines.push(`    Allowed pushers: ${rule.allowedPushers.join(', ')}`);
    }
  }
  
  if (rule.requiredApprovals > 0 || rule.requireCodeOwnerReview) {
    lines.push('');
    lines.push('Review requirements:');
    lines.push(`  - Required approvals: ${rule.requiredApprovals}`);
    lines.push(`  - Dismiss stale reviews: ${rule.dismissStaleReviews ? 'Yes' : 'No'}`);
    lines.push(`  - Require code owner review: ${rule.requireCodeOwnerReview ? 'Yes' : 'No'}`);
  }
  
  if (rule.requireStatusChecks) {
    lines.push('');
    lines.push('Status checks:');
    lines.push(`  - Require status checks: Yes`);
    if (rule.requiredStatusChecks.length > 0) {
      lines.push(`  - Required checks: ${rule.requiredStatusChecks.join(', ')}`);
    }
    lines.push(`  - Require branch up-to-date: ${rule.requireBranchUpToDate ? 'Yes' : 'No'}`);
  }
  
  lines.push('');
  lines.push(`Created: ${new Date(rule.createdAt).toISOString()}`);
  lines.push(`Updated: ${new Date(rule.updatedAt).toISOString()}`);
  
  return lines.join('\n');
}

/**
 * Format protection violations for display
 */
export function formatViolations(result: ProtectionResult): string {
  if (result.allowed) {
    return 'No violations - operation allowed.';
  }
  
  const lines: string[] = [];
  lines.push('Protection violations:');
  
  for (const violation of result.violations) {
    lines.push(`  ✗ ${violation.message}`);
    lines.push(`    Rule: ${violation.pattern} (${violation.type})`);
  }
  
  return lines.join('\n');
}

/**
 * CLI handler for branch protection
 */
export function handleProtect(args: string[]): void {
  // Import Repository here to avoid circular dependency
  const { Repository } = require('./repository');
  
  const repo = Repository.find();
  const engine = new BranchProtectionEngine(repo.gitDir);
  const manager = engine.getManager();
  
  const colors = {
    green: (s: string) => `\x1b[32m${s}\x1b[0m`,
    yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
    red: (s: string) => `\x1b[31m${s}\x1b[0m`,
    cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
    dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
    bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  };
  
  const subcommand = args[0];
  
  switch (subcommand) {
    case 'list':
    case undefined: {
      const rules = manager.listRules();
      
      if (rules.length === 0) {
        console.log(colors.dim('No branch protection rules configured'));
        console.log(colors.dim('\nUse "wit protect add <pattern>" to add a rule'));
        console.log(colors.dim('Examples:'));
        console.log(colors.dim('  wit protect add main --require-pr'));
        console.log(colors.dim('  wit protect add "release/*" --no-force-push --no-delete'));
        return;
      }
      
      console.log(colors.bold('Branch protection rules:\n'));
      for (const rule of rules) {
        const restrictions: string[] = [];
        if (rule.requirePullRequest) restrictions.push('PR required');
        if (!rule.allowForcePush) restrictions.push('no force-push');
        if (!rule.allowDeletions) restrictions.push('no delete');
        if (rule.requiredApprovals > 0) restrictions.push(`${rule.requiredApprovals} approval(s)`);
        if (rule.requireStatusChecks) restrictions.push('status checks');
        
        console.log(`  ${colors.cyan(rule.pattern)}`);
        console.log(`    ${restrictions.length > 0 ? restrictions.join(', ') : colors.dim('no restrictions')}`);
      }
      break;
    }
    
    case 'add': {
      const pattern = args[1];
      if (!pattern) {
        console.error(colors.red('error: ') + 'Please specify a branch pattern');
        console.error('\nUsage: wit protect add <pattern> [options]');
        console.error('\nExamples:');
        console.error('  wit protect add main');
        console.error('  wit protect add "release/*" --require-pr');
        console.error('  wit protect add main --preset strict');
        process.exit(1);
      }
      
      const options = parseProtectionOptions(args.slice(2));
      
      try {
        const rule = manager.addRule(pattern, options);
        console.log(colors.green('✓') + ` Added protection for '${pattern}'`);
        
        const restrictions: string[] = [];
        if (rule.requirePullRequest) restrictions.push('PR required');
        if (!rule.allowForcePush) restrictions.push('no force-push');
        if (!rule.allowDeletions) restrictions.push('no delete');
        
        if (restrictions.length > 0) {
          console.log(colors.dim(`  Restrictions: ${restrictions.join(', ')}`));
        }
      } catch (error) {
        if (error instanceof TsgitError) {
          console.error(colors.red('error: ') + error.message);
        } else if (error instanceof Error) {
          console.error(colors.red('error: ') + error.message);
        }
        process.exit(1);
      }
      break;
    }
    
    case 'update': {
      const pattern = args[1];
      if (!pattern) {
        console.error(colors.red('error: ') + 'Please specify a branch pattern');
        process.exit(1);
      }
      
      const options = parseProtectionOptions(args.slice(2));
      
      try {
        const rule = manager.updateRule(pattern, options);
        console.log(colors.green('✓') + ` Updated protection for '${pattern}'`);
      } catch (error) {
        if (error instanceof TsgitError) {
          console.error(colors.red('error: ') + error.message);
        } else if (error instanceof Error) {
          console.error(colors.red('error: ') + error.message);
        }
        process.exit(1);
      }
      break;
    }
    
    case 'remove':
    case 'delete': {
      const pattern = args[1];
      if (!pattern) {
        console.error(colors.red('error: ') + 'Please specify a branch pattern');
        process.exit(1);
      }
      
      if (manager.removeRule(pattern)) {
        console.log(colors.green('✓') + ` Removed protection for '${pattern}'`);
      } else {
        console.log(colors.yellow('!') + ` No protection rule found for '${pattern}'`);
      }
      break;
    }
    
    case 'show': {
      const pattern = args[1];
      if (!pattern) {
        console.error(colors.red('error: ') + 'Please specify a branch pattern');
        process.exit(1);
      }
      
      const rule = manager.getRuleByPattern(pattern);
      if (!rule) {
        console.error(colors.red('error: ') + `No protection rule found for '${pattern}'`);
        process.exit(1);
      }
      
      console.log(formatRule(rule));
      break;
    }
    
    case 'check': {
      const branchName = args[1];
      if (!branchName) {
        console.error(colors.red('error: ') + 'Please specify a branch name');
        console.error('\nUsage: wit protect check <branch> [--push|--force-push|--delete|--merge]');
        process.exit(1);
      }
      
      const checkType = args[2] || '--push';
      let result: ProtectionResult;
      
      switch (checkType) {
        case '--push':
          result = engine.canPush(branchName);
          break;
        case '--force-push':
          result = engine.canForcePush(branchName);
          break;
        case '--delete':
          result = engine.canDeleteBranch(branchName);
          break;
        case '--merge':
          result = engine.canMerge(branchName);
          break;
        default:
          console.error(colors.red('error: ') + `Unknown check type: ${checkType}`);
          process.exit(1);
      }
      
      if (result.allowed) {
        console.log(colors.green('✓') + ` Operation allowed on '${branchName}'`);
      } else {
        console.log(colors.red('✗') + ` Operation blocked on '${branchName}'`);
        console.log('');
        console.log(formatViolations(result));
        process.exit(1);
      }
      break;
    }
    
    case 'status': {
      const branchName = args[1];
      if (!branchName) {
        console.error(colors.red('error: ') + 'Please specify a branch name');
        process.exit(1);
      }
      
      const summary = engine.getProtectionSummary(branchName);
      
      if (!summary.isProtected) {
        console.log(colors.dim(`Branch '${branchName}' is not protected`));
        return;
      }
      
      console.log(colors.bold(`Protection status for '${branchName}':\n`));
      console.log(`  Push: ${summary.blocksPush ? colors.red('Blocked (PR required)') : colors.green('Allowed')}`);
      console.log(`  Force push: ${summary.blocksForcePush ? colors.red('Blocked') : colors.green('Allowed')}`);
      console.log(`  Deletion: ${summary.blocksDeletion ? colors.red('Blocked') : colors.green('Allowed')}`);
      
      if (summary.requiresReviews) {
        console.log(`  Reviews: ${colors.yellow('Required')}`);
      }
      if (summary.requiresStatusChecks) {
        console.log(`  Status checks: ${colors.yellow('Required')}`);
      }
      
      console.log(colors.dim(`\nMatching rules: ${summary.rules.map(r => r.pattern).join(', ')}`));
      break;
    }
    
    default:
      console.error(colors.red('error: ') + `Unknown subcommand: ${subcommand}`);
      console.error('\nUsage:');
      console.error('  wit protect                           List all protection rules');
      console.error('  wit protect add <pattern> [options]   Add a protection rule');
      console.error('  wit protect update <pattern> [options] Update a rule');
      console.error('  wit protect remove <pattern>          Remove a rule');
      console.error('  wit protect show <pattern>            Show rule details');
      console.error('  wit protect check <branch> [type]     Check if operation is allowed');
      console.error('  wit protect status <branch>           Show protection status');
      console.error('\nOptions:');
      console.error('  --require-pr                Require pull requests');
      console.error('  --approvals <n>             Required number of approvals');
      console.error('  --no-force-push             Block force pushes');
      console.error('  --no-delete                 Block branch deletion');
      console.error('  --status-checks <checks>    Required status checks (comma-separated)');
      console.error('  --preset <name>             Use a preset (basic, standard, strict)');
      process.exit(1);
  }
}

/**
 * Parse protection options from CLI arguments
 */
function parseProtectionOptions(args: string[]): Partial<BranchProtectionRule> {
  const options: Partial<BranchProtectionRule> = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--require-pr':
        options.requirePullRequest = true;
        break;
      case '--no-require-pr':
        options.requirePullRequest = false;
        break;
      case '--approvals':
        options.requiredApprovals = parseInt(args[++i], 10) || 0;
        break;
      case '--dismiss-stale':
        options.dismissStaleReviews = true;
        break;
      case '--require-codeowner':
        options.requireCodeOwnerReview = true;
        break;
      case '--no-force-push':
        options.allowForcePush = false;
        break;
      case '--allow-force-push':
        options.allowForcePush = true;
        break;
      case '--no-delete':
        options.allowDeletions = false;
        break;
      case '--allow-delete':
        options.allowDeletions = true;
        break;
      case '--status-checks':
        options.requireStatusChecks = true;
        options.requiredStatusChecks = args[++i]?.split(',').map(s => s.trim()) || [];
        break;
      case '--require-up-to-date':
        options.requireBranchUpToDate = true;
        break;
      case '--restrict-push':
        options.restrictPushAccess = true;
        break;
      case '--allowed-pushers':
        options.allowedPushers = args[++i]?.split(',').map(s => s.trim()) || [];
        break;
      case '--description':
        options.description = args[++i];
        break;
      case '--preset':
        const presetName = args[++i] as keyof typeof PROTECTION_PRESETS;
        const preset = PROTECTION_PRESETS[presetName];
        if (!preset) {
          console.error(`Unknown preset: ${presetName}`);
          console.error('Available presets: basic, standard, strict');
          process.exit(1);
        }
        Object.assign(options, preset);
        break;
    }
  }
  
  return options;
}
