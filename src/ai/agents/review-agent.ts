/**
 * Review Agent
 * 
 * Specialized agent for code review, security analysis, and quality checks.
 * Provides thorough, constructive feedback on code changes.
 */

import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { AgentContext } from '../types.js';
import { buildContext, formatContextForPrompt } from '../knowledge/context-builder.js';

export const REVIEW_AGENT_INSTRUCTIONS = `You are wit AI's Code Review specialist. You provide thorough, constructive code reviews that help developers ship better code.

## Your Review Process

1. **Understand Intent**: What is this code trying to accomplish?
2. **Check Correctness**: Does it work? Are there edge cases or bugs?
3. **Security Scan**: Are there security vulnerabilities?
4. **Performance Review**: Are there performance concerns?
5. **Maintainability**: Is the code clear and maintainable?
6. **Style Check**: Does it follow project conventions?

## Issue Severity Levels

- **🔴 Critical**: Security vulnerabilities, data loss risks, crashes
- **🟠 Important**: Bugs, incorrect behavior, performance issues
- **🟡 Suggestion**: Improvements that would make code better
- **⚪ Nitpick**: Style preferences, minor improvements

## Review Output Format

Structure your review as:

### Summary
One-paragraph overall assessment.

### Critical Issues (if any)
List with file:line references.

### Suggestions
Specific, actionable improvements.

### What's Good
Acknowledge good patterns and decisions.

## Review Guidelines

- Be specific with line numbers and code references
- Explain WHY something is an issue, not just WHAT
- Provide concrete suggestions, not just criticism
- Acknowledge good patterns when you see them
- Consider the context - is this a prototype or production code?
- Don't block on style issues unless they're significant

## Security Checklist

Always check for:
- [ ] Hardcoded secrets or credentials
- [ ] SQL injection vulnerabilities
- [ ] XSS vulnerabilities
- [ ] Authentication/authorization issues
- [ ] Input validation
- [ ] Sensitive data exposure
- [ ] Insecure dependencies`;

/**
 * Tool to get diff for review
 */
function createGetDiffTool(context: AgentContext) {
  return createTool({
    id: 'get-diff',
    description: 'Get the diff to review',
    inputSchema: z.object({
      prNumber: z.number().optional().describe('PR number to review'),
      baseSha: z.string().optional().describe('Base commit SHA'),
      headSha: z.string().optional().describe('Head commit SHA'),
    }),
    outputSchema: z.object({
      diff: z.string(),
      files: z.array(z.object({
        path: z.string(),
        additions: z.number(),
        deletions: z.number(),
      })),
      errorMessage: z.string().optional(),
    }),
    execute: async ({ prNumber }) => {
      try {
        if (prNumber) {
          // Get PR diff from database
          const { prModel } = await import('../../db/models/index.js');
          const pr = await prModel.findByRepoAndNumber(context.repoId, prNumber);
          
          if (!pr) {
            return { diff: '', files: [], errorMessage: `PR #${prNumber} not found` };
          }
          
          // In a real implementation, we'd get the actual diff
          return {
            diff: `PR #${prNumber}: ${pr.title}\n\nChanges from ${pr.sourceBranch} to ${pr.targetBranch}`,
            files: [],
          };
        }
        
        return { diff: '', files: [], errorMessage: 'No PR specified' };
      } catch (error) {
        return { 
          diff: '', 
          files: [], 
          errorMessage: error instanceof Error ? error.message : 'Failed to get diff' 
        };
      }
    },
  });
}

/**
 * Tool to get related context for review
 */
function createGetRelatedCodeTool(context: AgentContext) {
  return createTool({
    id: 'get-related-code',
    description: 'Find related code that might be affected by changes',
    inputSchema: z.object({
      filePath: z.string().describe('Path to the changed file'),
      functionName: z.string().optional().describe('Specific function to find usages of'),
    }),
    outputSchema: z.object({
      relatedFiles: z.array(z.object({
        path: z.string(),
        relevance: z.string(),
        snippet: z.string().optional(),
      })),
    }),
    execute: async ({ filePath, functionName }) => {
      try {
        const query = functionName 
          ? `usages of ${functionName} in ${filePath}`
          : `code related to ${filePath}`;
          
        const aiContext = await buildContext(query, context.repoId, {
          maxCode: 5,
          maxDocs: 0,
          maxHistory: 2,
          maxIssues: 0,
        });
        
        return {
          relatedFiles: aiContext.relevantCode.map(r => ({
            path: r.chunk.metadata.path || 'unknown',
            relevance: `${Math.round(r.similarity * 100)}% match`,
            snippet: r.chunk.content.slice(0, 200),
          })),
        };
      } catch {
        return { relatedFiles: [] };
      }
    },
  });
}

/**
 * Tool to check for security issues
 */
const securityCheckTool = createTool({
  id: 'security-check',
  description: 'Run security checks on code',
  inputSchema: z.object({
    code: z.string().describe('Code to check'),
    language: z.string().optional().describe('Programming language'),
  }),
  outputSchema: z.object({
    issues: z.array(z.object({
      severity: z.enum(['critical', 'high', 'medium', 'low']),
      type: z.string(),
      description: z.string(),
      line: z.number().optional(),
    })),
    passed: z.boolean(),
  }),
  execute: async ({ code }) => {
    const issues: Array<{
      severity: 'critical' | 'high' | 'medium' | 'low';
      type: string;
      description: string;
      line?: number;
    }> = [];
    
    const lines = code.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      
      // Check for hardcoded secrets
      if (/password\s*=\s*['"][^'"]+['"]/.test(line) ||
          /api[_-]?key\s*=\s*['"][^'"]+['"]/.test(line) ||
          /secret\s*=\s*['"][^'"]+['"]/.test(line)) {
        issues.push({
          severity: 'critical',
          type: 'hardcoded-secret',
          description: 'Possible hardcoded secret or credential',
          line: lineNum,
        });
      }
      
      // Check for eval
      if (/\beval\s*\(/.test(line)) {
        issues.push({
          severity: 'high',
          type: 'code-injection',
          description: 'Use of eval() is a security risk',
          line: lineNum,
        });
      }
      
      // Check for SQL injection
      if (/\$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE)/i.test(line)) {
        issues.push({
          severity: 'critical',
          type: 'sql-injection',
          description: 'Possible SQL injection vulnerability',
          line: lineNum,
        });
      }
      
      // Check for innerHTML
      if (/\.innerHTML\s*=/.test(line) || /dangerouslySetInnerHTML/.test(line)) {
        issues.push({
          severity: 'medium',
          type: 'xss',
          description: 'Direct HTML injection may lead to XSS',
          line: lineNum,
        });
      }
    }
    
    return {
      issues,
      passed: issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0,
    };
  },
});

/**
 * Tool to add review comment
 */
function createAddReviewCommentTool(context: AgentContext) {
  return createTool({
    id: 'add-review-comment',
    description: 'Add a review comment to a PR',
    inputSchema: z.object({
      prNumber: z.number().describe('PR number'),
      body: z.string().describe('Comment body'),
      path: z.string().optional().describe('File path for inline comment'),
      line: z.number().optional().describe('Line number for inline comment'),
      severity: z.enum(['critical', 'important', 'suggestion', 'nitpick']).optional(),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      commentId: z.string().optional(),
      errorMessage: z.string().optional(),
    }),
    execute: async ({ prNumber, body, path, line, severity }) => {
      try {
        const { prModel, prCommentModel } = await import('../../db/models/index.js');
        
        const pr = await prModel.findByRepoAndNumber(context.repoId, prNumber);
        if (!pr) {
          return { success: false, errorMessage: `PR #${prNumber} not found` };
        }
        
        // Format comment with severity badge
        const badges: Record<string, string> = {
          critical: '🔴 **Critical**:',
          important: '🟠 **Important**:',
          suggestion: '🟡 **Suggestion**:',
          nitpick: '⚪ **Nitpick**:',
        };
        
        const formattedBody = severity 
          ? `${badges[severity]} ${body}`
          : body;
        
        const comment = await prCommentModel.create({
          prId: pr.id,
          userId: context.userId,
          body: formattedBody,
          path,
          line,
        });
        
        return { success: true, commentId: comment.id };
      } catch (error) {
        return { 
          success: false, 
          errorMessage: error instanceof Error ? error.message : 'Failed to add comment' 
        };
      }
    },
  });
}

/**
 * Tool to submit review
 */
function createSubmitReviewTool(context: AgentContext) {
  return createTool({
    id: 'submit-review',
    description: 'Submit a complete review for a PR',
    inputSchema: z.object({
      prNumber: z.number().describe('PR number'),
      state: z.enum(['approved', 'changes_requested', 'commented']).describe('Review state'),
      summary: z.string().describe('Review summary'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      reviewId: z.string().optional(),
      errorMessage: z.string().optional(),
    }),
    execute: async ({ prNumber, state, summary }) => {
      try {
        const { prModel, prReviewModel } = await import('../../db/models/index.js');
        
        const pr = await prModel.findByRepoAndNumber(context.repoId, prNumber);
        if (!pr) {
          return { success: false, errorMessage: `PR #${prNumber} not found` };
        }
        
        const review = await prReviewModel.create({
          prId: pr.id,
          userId: context.userId,
          state,
          body: summary,
          commitSha: pr.headSha,
        });
        
        return { success: true, reviewId: review.id };
      } catch (error) {
        return { 
          success: false, 
          errorMessage: error instanceof Error ? error.message : 'Failed to submit review' 
        };
      }
    },
  });
}

/**
 * Create a Review Agent for a repository
 */
export function createReviewAgent(context: AgentContext, model: string = 'anthropic/claude-sonnet-4-20250514'): Agent {
  return new Agent({
    id: `wit-review-${context.repoId}`,
    name: 'wit Review Agent',
    description: 'Specialized agent for code review and quality analysis',
    instructions: REVIEW_AGENT_INSTRUCTIONS,
    model,
    tools: {
      getDiff: createGetDiffTool(context),
      getRelatedCode: createGetRelatedCodeTool(context),
      securityCheck: securityCheckTool,
      addComment: createAddReviewCommentTool(context),
      submitReview: createSubmitReviewTool(context),
    },
  });
}
