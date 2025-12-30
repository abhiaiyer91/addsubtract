/**
 * Branch Protection Rules Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import {
  BranchProtectionManager,
  BranchProtectionEngine,
  BranchProtectionRule,
  PROTECTION_PRESETS,
  formatRule,
  formatViolations,
} from '../core/branch-protection';
import {
  createRepoWithCommit,
  cleanupTempDir,
  restoreCwd,
  suppressConsole,
} from './test-utils';
import { Repository } from '../core/repository';

describe('branch protection system', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
    testDir = undefined;
  });

  describe('BranchProtectionManager', () => {
    let manager: BranchProtectionManager;

    beforeEach(() => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      manager = new BranchProtectionManager(repo.gitDir);
      manager.init();
    });

    describe('init', () => {
      it('should create branch-protection.json file', () => {
        const protectionPath = path.join(repo.gitDir, 'branch-protection.json');
        expect(fs.existsSync(protectionPath)).toBe(true);
      });

      it('should create valid JSON structure', () => {
        const protectionPath = path.join(repo.gitDir, 'branch-protection.json');
        const content = fs.readFileSync(protectionPath, 'utf8');
        const data = JSON.parse(content);
        expect(data.version).toBe(1);
        expect(Array.isArray(data.rules)).toBe(true);
      });
    });

    describe('addRule', () => {
      it('should add a rule with pattern', () => {
        const rule = manager.addRule('main');
        expect(rule.pattern).toBe('main');
        expect(rule.id).toBeDefined();
        expect(rule.createdAt).toBeDefined();
      });

      it('should add rule with options', () => {
        const rule = manager.addRule('release/*', {
          requirePullRequest: true,
          requiredApprovals: 2,
          allowForcePush: false,
        });

        expect(rule.pattern).toBe('release/*');
        expect(rule.requirePullRequest).toBe(true);
        expect(rule.requiredApprovals).toBe(2);
        expect(rule.allowForcePush).toBe(false);
      });

      it('should persist rules to disk', () => {
        manager.addRule('main', { requirePullRequest: true });
        
        // Create a new manager to verify persistence
        const newManager = new BranchProtectionManager(repo.gitDir);
        const rules = newManager.listRules();
        
        expect(rules.length).toBe(1);
        expect(rules[0].pattern).toBe('main');
        expect(rules[0].requirePullRequest).toBe(true);
      });

      it('should throw error for duplicate pattern', () => {
        manager.addRule('main');
        expect(() => manager.addRule('main')).toThrow();
      });

      it('should generate unique IDs for each rule', () => {
        const rule1 = manager.addRule('main');
        const rule2 = manager.addRule('develop');
        const rule3 = manager.addRule('release/*');

        expect(rule1.id).not.toBe(rule2.id);
        expect(rule2.id).not.toBe(rule3.id);
      });
    });

    describe('updateRule', () => {
      it('should update an existing rule', () => {
        manager.addRule('main', { requiredApprovals: 1 });
        const updated = manager.updateRule('main', { requiredApprovals: 3 });

        expect(updated.requiredApprovals).toBe(3);
      });

      it('should update updatedAt timestamp', () => {
        const original = manager.addRule('main');
        
        const updated = manager.updateRule('main', { requirePullRequest: true });

        expect(updated.updatedAt).toBeGreaterThanOrEqual(original.createdAt);
      });

      it('should throw error for non-existent pattern', () => {
        expect(() => manager.updateRule('non-existent', {})).toThrow();
      });
    });

    describe('removeRule', () => {
      it('should remove an existing rule', () => {
        manager.addRule('main');
        const result = manager.removeRule('main');

        expect(result).toBe(true);
        expect(manager.listRules().length).toBe(0);
      });

      it('should return false for non-existent pattern', () => {
        const result = manager.removeRule('non-existent');
        expect(result).toBe(false);
      });

      it('should persist removal to disk', () => {
        manager.addRule('main');
        manager.removeRule('main');

        const newManager = new BranchProtectionManager(repo.gitDir);
        expect(newManager.listRules().length).toBe(0);
      });
    });

    describe('listRules', () => {
      it('should list all rules sorted by pattern', () => {
        manager.addRule('release/*');
        manager.addRule('main');
        manager.addRule('develop');

        const rules = manager.listRules();
        expect(rules.length).toBe(3);
        expect(rules[0].pattern).toBe('develop');
        expect(rules[1].pattern).toBe('main');
        expect(rules[2].pattern).toBe('release/*');
      });

      it('should return empty array when no rules exist', () => {
        expect(manager.listRules()).toEqual([]);
      });
    });

    describe('getRulesForBranch', () => {
      beforeEach(() => {
        manager.addRule('main');
        manager.addRule('release/*');
        manager.addRule('**/protected');
        manager.addRule('develop');
      });

      it('should match exact branch names', () => {
        const rules = manager.getRulesForBranch('main');
        expect(rules.length).toBe(1);
        expect(rules[0].pattern).toBe('main');
      });

      it('should match wildcard patterns', () => {
        const rules = manager.getRulesForBranch('release/v1.0');
        expect(rules.length).toBe(1);
        expect(rules[0].pattern).toBe('release/*');
      });

      it('should match double-wildcard patterns', () => {
        const rules = manager.getRulesForBranch('feature/protected');
        expect(rules.length).toBe(1);
        expect(rules[0].pattern).toBe('**/protected');
      });

      it('should return multiple matching rules', () => {
        manager.addRule('release/v*');
        const rules = manager.getRulesForBranch('release/v1.0');
        expect(rules.length).toBe(2);
      });

      it('should return empty array for non-matching branches', () => {
        const rules = manager.getRulesForBranch('feature/my-feature');
        expect(rules.length).toBe(0);
      });
    });

    describe('getRuleByPattern', () => {
      it('should return rule for existing pattern', () => {
        manager.addRule('main', { requiredApprovals: 2 });
        const rule = manager.getRuleByPattern('main');

        expect(rule).not.toBeNull();
        expect(rule!.requiredApprovals).toBe(2);
      });

      it('should return null for non-existent pattern', () => {
        const rule = manager.getRuleByPattern('non-existent');
        expect(rule).toBeNull();
      });
    });

    describe('hasRules', () => {
      it('should return false when no rules exist', () => {
        expect(manager.hasRules()).toBe(false);
      });

      it('should return true when rules exist', () => {
        manager.addRule('main');
        expect(manager.hasRules()).toBe(true);
      });
    });

    describe('clearAllRules', () => {
      it('should remove all rules', () => {
        manager.addRule('main');
        manager.addRule('develop');
        manager.addRule('release/*');

        manager.clearAllRules();

        expect(manager.listRules().length).toBe(0);
        expect(manager.hasRules()).toBe(false);
      });
    });
  });

  describe('BranchProtectionEngine', () => {
    let engine: BranchProtectionEngine;
    let manager: BranchProtectionManager;

    beforeEach(() => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      engine = new BranchProtectionEngine(repo.gitDir);
      manager = engine.getManager();
      manager.init();
    });

    describe('canPush', () => {
      it('should allow push when no rules exist', () => {
        const result = engine.canPush('main');
        expect(result.allowed).toBe(true);
        expect(result.violations.length).toBe(0);
      });

      it('should block push when requirePullRequest is true', () => {
        manager.addRule('main', { requirePullRequest: true });

        const result = engine.canPush('main');
        expect(result.allowed).toBe(false);
        expect(result.violations.length).toBe(1);
        expect(result.violations[0].type).toBe('DIRECT_PUSH_BLOCKED');
      });

      it('should block push for unauthorized user', () => {
        manager.addRule('main', {
          restrictPushAccess: true,
          allowedPushers: ['admin', 'lead'],
        });

        const result = engine.canPush('main', 'regular-user');
        expect(result.allowed).toBe(false);
        expect(result.violations[0].type).toBe('PUSH_ACCESS_DENIED');
      });

      it('should allow push for authorized user', () => {
        manager.addRule('main', {
          restrictPushAccess: true,
          allowedPushers: ['admin', 'lead'],
        });

        const result = engine.canPush('main', 'admin');
        expect(result.allowed).toBe(true);
      });

      it('should include matched rules in result', () => {
        manager.addRule('main');
        const result = engine.canPush('main');

        expect(result.matchedRules.length).toBe(1);
        expect(result.matchedRules[0].pattern).toBe('main');
      });
    });

    describe('canForcePush', () => {
      it('should block force push by default', () => {
        manager.addRule('main'); // allowForcePush defaults to false

        const result = engine.canForcePush('main');
        expect(result.allowed).toBe(false);
        expect(result.violations.some(v => v.type === 'FORCE_PUSH_BLOCKED')).toBe(true);
      });

      it('should allow force push when explicitly enabled', () => {
        manager.addRule('feature/*', { allowForcePush: true });

        const result = engine.canForcePush('feature/my-branch');
        expect(result.allowed).toBe(true);
      });

      it('should include push violations', () => {
        manager.addRule('main', {
          requirePullRequest: true,
          allowForcePush: false,
        });

        const result = engine.canForcePush('main');
        expect(result.violations.length).toBe(2);
        expect(result.violations.some(v => v.type === 'DIRECT_PUSH_BLOCKED')).toBe(true);
        expect(result.violations.some(v => v.type === 'FORCE_PUSH_BLOCKED')).toBe(true);
      });
    });

    describe('canDeleteBranch', () => {
      it('should block deletion by default', () => {
        manager.addRule('main'); // allowDeletions defaults to false

        const result = engine.canDeleteBranch('main');
        expect(result.allowed).toBe(false);
        expect(result.violations[0].type).toBe('DELETION_BLOCKED');
      });

      it('should allow deletion when explicitly enabled', () => {
        manager.addRule('temp/*', { allowDeletions: true });

        const result = engine.canDeleteBranch('temp/my-branch');
        expect(result.allowed).toBe(true);
      });

      it('should check user authorization for deletion', () => {
        manager.addRule('release/*', {
          allowDeletions: true,
          restrictPushAccess: true,
          allowedPushers: ['admin'],
        });

        const regularResult = engine.canDeleteBranch('release/v1.0', 'regular-user');
        expect(regularResult.allowed).toBe(false);

        const adminResult = engine.canDeleteBranch('release/v1.0', 'admin');
        expect(adminResult.allowed).toBe(true);
      });
    });

    describe('canMerge', () => {
      it('should pass when no reviews required', () => {
        manager.addRule('main');

        const result = engine.canMerge('main');
        expect(result.allowed).toBe(true);
      });

      it('should require approvals', () => {
        manager.addRule('main', { requiredApprovals: 2 });

        const noApprovalsResult = engine.canMerge('main', { approvalCount: 0 });
        expect(noApprovalsResult.allowed).toBe(false);
        expect(noApprovalsResult.violations[0].type).toBe('REVIEWS_REQUIRED');

        const insufficientResult = engine.canMerge('main', { approvalCount: 1 });
        expect(insufficientResult.allowed).toBe(false);

        const sufficientResult = engine.canMerge('main', { approvalCount: 2 });
        expect(sufficientResult.allowed).toBe(true);
      });

      it('should require code owner review', () => {
        manager.addRule('main', { requireCodeOwnerReview: true });

        const noOwnerResult = engine.canMerge('main', { hasCodeOwnerApproval: false });
        expect(noOwnerResult.allowed).toBe(false);

        const withOwnerResult = engine.canMerge('main', { hasCodeOwnerApproval: true });
        expect(withOwnerResult.allowed).toBe(true);
      });

      it('should require status checks', () => {
        manager.addRule('main', {
          requireStatusChecks: true,
          requiredStatusChecks: ['ci', 'lint', 'test'],
        });

        const noChecksResult = engine.canMerge('main', { passedChecks: [] });
        expect(noChecksResult.allowed).toBe(false);

        const partialResult = engine.canMerge('main', { passedChecks: ['ci', 'lint'] });
        expect(partialResult.allowed).toBe(false);

        const allPassResult = engine.canMerge('main', { passedChecks: ['ci', 'lint', 'test'] });
        expect(allPassResult.allowed).toBe(true);
      });

      it('should require branch to be up-to-date', () => {
        manager.addRule('main', { requireBranchUpToDate: true });

        const outdatedResult = engine.canMerge('main', { isBranchUpToDate: false });
        expect(outdatedResult.allowed).toBe(false);
        expect(outdatedResult.violations[0].type).toBe('BRANCH_NOT_UP_TO_DATE');

        const upToDateResult = engine.canMerge('main', { isBranchUpToDate: true });
        expect(upToDateResult.allowed).toBe(true);
      });
    });

    describe('isProtected', () => {
      it('should return false for unprotected branch', () => {
        expect(engine.isProtected('feature/my-feature')).toBe(false);
      });

      it('should return true for protected branch', () => {
        manager.addRule('main');
        expect(engine.isProtected('main')).toBe(true);
      });

      it('should work with pattern matching', () => {
        manager.addRule('release/*');
        expect(engine.isProtected('release/v1.0')).toBe(true);
        expect(engine.isProtected('release/v2.0-beta')).toBe(true);
        expect(engine.isProtected('hotfix/v1.0')).toBe(false);
      });
    });

    describe('getProtectionSummary', () => {
      it('should return summary for unprotected branch', () => {
        const summary = engine.getProtectionSummary('feature/x');
        expect(summary.isProtected).toBe(false);
        expect(summary.rules.length).toBe(0);
      });

      it('should return comprehensive summary', () => {
        manager.addRule('main', {
          requirePullRequest: true,
          requiredApprovals: 2,
          requireStatusChecks: true,
          requiredStatusChecks: ['ci'],
          allowForcePush: false,
          allowDeletions: false,
        });

        const summary = engine.getProtectionSummary('main');
        expect(summary.isProtected).toBe(true);
        expect(summary.blocksPush).toBe(true);
        expect(summary.blocksForcePush).toBe(true);
        expect(summary.blocksDeletion).toBe(true);
        expect(summary.requiresReviews).toBe(true);
        expect(summary.requiresStatusChecks).toBe(true);
      });
    });
  });

  describe('PROTECTION_PRESETS', () => {
    let manager: BranchProtectionManager;

    beforeEach(() => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      manager = new BranchProtectionManager(repo.gitDir);
      manager.init();
    });

    it('should have basic preset', () => {
      const rule = manager.addRule('main', PROTECTION_PRESETS.basic);
      expect(rule.requirePullRequest).toBe(false);
      expect(rule.allowForcePush).toBe(false);
      expect(rule.allowDeletions).toBe(false);
    });

    it('should have standard preset', () => {
      const rule = manager.addRule('main', PROTECTION_PRESETS.standard);
      expect(rule.requirePullRequest).toBe(true);
      expect(rule.requiredApprovals).toBe(1);
      expect(rule.dismissStaleReviews).toBe(true);
    });

    it('should have strict preset', () => {
      const rule = manager.addRule('main', PROTECTION_PRESETS.strict);
      expect(rule.requirePullRequest).toBe(true);
      expect(rule.requiredApprovals).toBe(2);
      expect(rule.requireCodeOwnerReview).toBe(true);
      expect(rule.requireStatusChecks).toBe(true);
      expect(rule.requireBranchUpToDate).toBe(true);
    });
  });

  describe('formatRule', () => {
    it('should format rule for display', () => {
      const rule: BranchProtectionRule = {
        id: 'test-id',
        pattern: 'main',
        requirePullRequest: true,
        requiredApprovals: 2,
        dismissStaleReviews: true,
        requireCodeOwnerReview: false,
        requireStatusChecks: true,
        requiredStatusChecks: ['ci', 'lint'],
        requireBranchUpToDate: true,
        allowForcePush: false,
        allowDeletions: false,
        restrictPushAccess: false,
        allowedPushers: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const formatted = formatRule(rule);
      expect(formatted).toContain('Pattern: main');
      expect(formatted).toContain('Require pull request: Yes');
      expect(formatted).toContain('Required approvals: 2');
      expect(formatted).toContain('ci, lint');
    });
  });

  describe('formatViolations', () => {
    it('should format violations for display', () => {
      const result = {
        allowed: false,
        violations: [
          {
            ruleId: 'test-id',
            pattern: 'main',
            type: 'DIRECT_PUSH_BLOCKED' as const,
            message: 'Direct pushes blocked',
          },
          {
            ruleId: 'test-id',
            pattern: 'main',
            type: 'FORCE_PUSH_BLOCKED' as const,
            message: 'Force pushes blocked',
          },
        ],
        matchedRules: [],
      };

      const formatted = formatViolations(result);
      expect(formatted).toContain('Protection violations:');
      expect(formatted).toContain('Direct pushes blocked');
      expect(formatted).toContain('Force pushes blocked');
    });

    it('should format success message when allowed', () => {
      const result = {
        allowed: true,
        violations: [],
        matchedRules: [],
      };

      const formatted = formatViolations(result);
      expect(formatted).toContain('No violations');
    });
  });

  describe('Repository integration', () => {
    it('should have branchProtection property', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      expect(repo.branchProtection).toBeDefined();
      expect(repo.branchProtection.getManager).toBeDefined();
    });

    it('should persist protection rules across repository instances', () => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;

      // Add a rule
      repo.branchProtection.getManager().addRule('main', { requirePullRequest: true });

      // Create new repository instance
      const newRepo = new Repository(testDir);
      const rules = newRepo.branchProtection.getManager().listRules();

      expect(rules.length).toBe(1);
      expect(rules[0].pattern).toBe('main');
    });
  });

  describe('pattern matching edge cases', () => {
    let manager: BranchProtectionManager;

    beforeEach(() => {
      const result = createRepoWithCommit();
      testDir = result.dir;
      repo = result.repo;
      manager = new BranchProtectionManager(repo.gitDir);
      manager.init();
    });

    it('should match patterns with dots', () => {
      manager.addRule('v1.0');
      const rules = manager.getRulesForBranch('v1.0');
      expect(rules.length).toBe(1);
    });

    it('should match patterns with hyphens', () => {
      manager.addRule('feature-branch');
      const rules = manager.getRulesForBranch('feature-branch');
      expect(rules.length).toBe(1);
    });

    it('should not match partial branch names', () => {
      manager.addRule('main');
      const rules = manager.getRulesForBranch('main-backup');
      expect(rules.length).toBe(0);
    });

    it('should handle complex patterns', () => {
      manager.addRule('release/v*.x');
      
      const match1 = manager.getRulesForBranch('release/v1.x');
      expect(match1.length).toBe(1);
      
      const match2 = manager.getRulesForBranch('release/v12.x');
      expect(match2.length).toBe(1);
      
      const noMatch = manager.getRulesForBranch('release/v1.0');
      expect(noMatch.length).toBe(0);
    });
  });
});
