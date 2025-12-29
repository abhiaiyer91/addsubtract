/**
 * AI Collaboration API Router
 * 
 * Endpoints for AI attribution, intents, patterns, and decisions.
 * Part of wit's AI Collaboration feature set.
 */

import { z } from 'zod';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import {
  aiActionModel,
  commitAiAttributionModel,
  codebasePatternsModel,
  decisionsModel,
  developmentIntentsModel,
  intentStepsModel,
  reviewFeedbackModel,
  collaborativeSessionsModel,
} from '../../../db/models';

// ============================================================================
// AI ACTIONS
// ============================================================================

const aiActionsRouter = router({
  /**
   * Get AI actions for a session
   */
  bySession: protectedProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      return aiActionModel.findBySession(input.sessionId);
    }),

  /**
   * Get AI actions by commit
   */
  byCommit: publicProcedure
    .input(z.object({
      commitSha: z.string(),
    }))
    .query(async ({ input }) => {
      return aiActionModel.findByCommit(input.commitSha);
    }),

  /**
   * Get recent AI actions
   */
  recent: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      sessionId: z.string().uuid().optional(),
      actionType: z.enum([
        'file_create', 'file_edit', 'file_delete', 'commit', 'branch_create',
        'pr_create', 'pr_update', 'issue_create', 'issue_update',
        'search', 'explain', 'review', 'other'
      ]).optional(),
      since: z.date().optional(),
    }))
    .query(async ({ input }) => {
      return aiActionModel.findRecent(input);
    }),

  /**
   * Get token usage for a session
   */
  tokenUsage: protectedProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
    }))
    .query(async ({ input }) => {
      return aiActionModel.getTokenUsage(input.sessionId);
    }),
});

// ============================================================================
// COMMIT ATTRIBUTION
// ============================================================================

const commitAttributionRouter = router({
  /**
   * Get attribution for a specific commit
   */
  byCommit: publicProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      commitSha: z.string(),
    }))
    .query(async ({ input }) => {
      return commitAiAttributionModel.findByCommit(input.repoId, input.commitSha);
    }),

  /**
   * Get all AI-authored commits for a repository
   */
  aiCommits: publicProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      limit: z.number().min(1).max(100).default(50),
      since: z.date().optional(),
      agentType: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return commitAiAttributionModel.findAiCommits(input.repoId, input);
    }),

  /**
   * Check if a commit was AI-authored
   */
  isAiAuthored: publicProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      commitSha: z.string(),
    }))
    .query(async ({ input }) => {
      return commitAiAttributionModel.isAiAuthored(input.repoId, input.commitSha);
    }),

  /**
   * Get the prompt that created a commit
   */
  getPrompt: publicProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      commitSha: z.string(),
    }))
    .query(async ({ input }) => {
      return commitAiAttributionModel.getPromptForCommit(input.repoId, input.commitSha);
    }),

  /**
   * Get AI attribution stats for a repository
   */
  stats: publicProcedure
    .input(z.object({
      repoId: z.string().uuid(),
    }))
    .query(async ({ input }) => {
      return commitAiAttributionModel.getStats(input.repoId);
    }),
});

// ============================================================================
// CODEBASE PATTERNS
// ============================================================================

const patternsRouter = router({
  /**
   * List active patterns for a repository
   */
  list: publicProcedure
    .input(z.object({
      repoId: z.string().uuid(),
    }))
    .query(async ({ input }) => {
      return codebasePatternsModel.findActiveByRepo(input.repoId);
    }),

  /**
   * Get patterns by type
   */
  byType: publicProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      patternType: z.enum([
        'naming', 'error_handling', 'testing', 'logging',
        'api_design', 'file_structure', 'imports', 'comments',
        'architecture', 'other'
      ]),
    }))
    .query(async ({ input }) => {
      return codebasePatternsModel.findByType(input.repoId, input.patternType);
    }),

  /**
   * Create a new pattern
   */
  create: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      patternType: z.enum([
        'naming', 'error_handling', 'testing', 'logging',
        'api_design', 'file_structure', 'imports', 'comments',
        'architecture', 'other'
      ]),
      description: z.string(),
      examples: z.any().optional(),
      source: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return codebasePatternsModel.create(input);
    }),

  /**
   * Record feedback on a pattern
   */
  feedback: protectedProcedure
    .input(z.object({
      patternId: z.string().uuid(),
      approved: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      return codebasePatternsModel.recordFeedback(input.patternId, input.approved);
    }),

  /**
   * Get pattern summary for AI context
   */
  summary: publicProcedure
    .input(z.object({
      repoId: z.string().uuid(),
    }))
    .query(async ({ input }) => {
      return codebasePatternsModel.getPatternSummary(input.repoId);
    }),
});

// ============================================================================
// DECISIONS (ADRs)
// ============================================================================

const decisionsRouter = router({
  /**
   * List decisions for a repository
   */
  list: publicProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      status: z.enum(['proposed', 'accepted', 'deprecated', 'superseded']).optional(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      return decisionsModel.findByRepo(input.repoId, input);
    }),

  /**
   * Get a specific decision
   */
  get: publicProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .query(async ({ input }) => {
      return decisionsModel.findById(input.id);
    }),

  /**
   * Search decisions
   */
  search: publicProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      query: z.string(),
    }))
    .query(async ({ input }) => {
      return decisionsModel.search(input.repoId, input.query);
    }),

  /**
   * Create a new decision
   */
  create: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      title: z.string(),
      context: z.string(),
      decision: z.string(),
      alternatives: z.any().optional(),
      consequences: z.string().optional(),
      tags: z.array(z.string()).optional(),
      aiGenerated: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      return decisionsModel.create({
        ...input,
        createdById: ctx.user.id,
      });
    }),

  /**
   * Supersede a decision with a new one
   */
  supersede: protectedProcedure
    .input(z.object({
      oldId: z.string().uuid(),
      newDecision: z.object({
        repoId: z.string().uuid(),
        title: z.string(),
        context: z.string(),
        decision: z.string(),
        alternatives: z.any().optional(),
        consequences: z.string().optional(),
        tags: z.array(z.string()).optional(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      return decisionsModel.supersede(input.oldId, {
        ...input.newDecision,
        createdById: ctx.user.id,
      });
    }),

  /**
   * Get decision summary for AI context
   */
  summary: publicProcedure
    .input(z.object({
      repoId: z.string().uuid(),
    }))
    .query(async ({ input }) => {
      return decisionsModel.getDecisionSummary(input.repoId);
    }),
});

// ============================================================================
// DEVELOPMENT INTENTS
// ============================================================================

const intentsRouter = router({
  /**
   * List intents for a repository
   */
  list: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      status: z.enum([
        'draft', 'planning', 'ready', 'in_progress',
        'paused', 'completed', 'failed', 'cancelled'
      ]).optional(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      return developmentIntentsModel.findByRepo(input.repoId, input);
    }),

  /**
   * Get my active intents
   */
  myActive: protectedProcedure
    .query(async ({ ctx }) => {
      return developmentIntentsModel.findActiveByUser(ctx.user.id);
    }),

  /**
   * Get a specific intent
   */
  get: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .query(async ({ input }) => {
      return developmentIntentsModel.findById(input.id);
    }),

  /**
   * Create a new intent
   */
  create: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      description: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      return developmentIntentsModel.create({
        ...input,
        createdById: ctx.user.id,
      });
    }),

  /**
   * Update intent status
   */
  updateStatus: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      status: z.enum([
        'draft', 'planning', 'ready', 'in_progress',
        'paused', 'completed', 'failed', 'cancelled'
      ]),
      errorMessage: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return developmentIntentsModel.updateStatus(
        input.id,
        input.status,
        input.errorMessage ? { errorMessage: input.errorMessage } : {}
      );
    }),

  /**
   * Update intent progress
   */
  updateProgress: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      progress: z.number().min(0).max(100),
    }))
    .mutation(async ({ input }) => {
      return developmentIntentsModel.updateProgress(input.id, input.progress);
    }),

  /**
   * Set the plan for an intent
   */
  setPlan: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      plan: z.any(),
      affectedFiles: z.array(z.string()),
      estimatedComplexity: z.number().min(1).max(10),
    }))
    .mutation(async ({ input }) => {
      return developmentIntentsModel.setPlan(
        input.id,
        input.plan,
        input.affectedFiles,
        input.estimatedComplexity
      );
    }),

  /**
   * Get steps for an intent
   */
  getSteps: protectedProcedure
    .input(z.object({
      intentId: z.string().uuid(),
    }))
    .query(async ({ input }) => {
      return intentStepsModel.findByIntent(input.intentId);
    }),

  /**
   * Create steps for an intent
   */
  createSteps: protectedProcedure
    .input(z.object({
      intentId: z.string().uuid(),
      steps: z.array(z.object({
        description: z.string(),
      })),
    }))
    .mutation(async ({ input }) => {
      return intentStepsModel.createBatch(input.intentId, input.steps);
    }),

  /**
   * Update step status
   */
  updateStepStatus: protectedProcedure
    .input(z.object({
      stepId: z.string().uuid(),
      status: z.string(),
      commitSha: z.string().optional(),
      errorMessage: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      return intentStepsModel.updateStatus(input.stepId, input.status, {
        commitSha: input.commitSha,
        errorMessage: input.errorMessage,
      });
    }),
});

// ============================================================================
// REVIEW FEEDBACK
// ============================================================================

const feedbackRouter = router({
  /**
   * Record feedback on AI content
   */
  create: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      aiActionId: z.string().uuid().optional(),
      commitSha: z.string().optional(),
      prId: z.string().uuid().optional(),
      feedbackType: z.enum(['approved', 'rejected', 'modified', 'commented']),
      feedbackContent: z.string().optional(),
      aiContent: z.string().optional(),
      humanContent: z.string().optional(),
      filePath: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return reviewFeedbackModel.create({
        ...input,
        reviewerId: ctx.user.id,
      });
    }),

  /**
   * Get feedback for a repository
   */
  list: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      feedbackType: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      return reviewFeedbackModel.findByRepo(input.repoId, input);
    }),

  /**
   * Get approval rate
   */
  approvalRate: publicProcedure
    .input(z.object({
      repoId: z.string().uuid(),
    }))
    .query(async ({ input }) => {
      return reviewFeedbackModel.getApprovalRate(input.repoId);
    }),
});

// ============================================================================
// COLLABORATIVE SESSIONS
// ============================================================================

const collaborativeSessionsRouter = router({
  /**
   * Create a new collaborative session
   */
  create: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      title: z.string().optional(),
      branchName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return collaborativeSessionsModel.create({
        ...input,
        createdById: ctx.user.id,
      });
    }),

  /**
   * Get a session
   */
  get: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .query(async ({ input }) => {
      return collaborativeSessionsModel.findById(input.id);
    }),

  /**
   * Get active sessions for a repository
   */
  active: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid(),
    }))
    .query(async ({ input }) => {
      return collaborativeSessionsModel.findActiveByRepo(input.repoId);
    }),

  /**
   * End a session
   */
  end: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
    }))
    .mutation(async ({ input }) => {
      return collaborativeSessionsModel.end(input.id);
    }),

  /**
   * Get participants
   */
  participants: protectedProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
    }))
    .query(async ({ input }) => {
      return collaborativeSessionsModel.getParticipants(input.sessionId);
    }),

  /**
   * Join a session
   */
  join: protectedProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
      return collaborativeSessionsModel.addParticipant({
        sessionId: input.sessionId,
        participantType: 'user',
        userId: ctx.user.id,
      });
    }),

  /**
   * Leave a session
   */
  leave: protectedProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
      return collaborativeSessionsModel.removeParticipant(input.sessionId, ctx.user.id);
    }),
});

// ============================================================================
// COMBINED ROUTER
// ============================================================================

export const aiCollaborationRouter = router({
  actions: aiActionsRouter,
  attribution: commitAttributionRouter,
  patterns: patternsRouter,
  decisions: decisionsRouter,
  intents: intentsRouter,
  feedback: feedbackRouter,
  sessions: collaborativeSessionsRouter,
});
