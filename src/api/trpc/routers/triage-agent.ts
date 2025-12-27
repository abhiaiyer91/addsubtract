/**
 * Triage Agent Router
 * 
 * Handles configuration and management of the automated triage agent.
 * Only repository owners/admins can manage triage agent settings.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import { repoModel, triageAgentConfigModel, triageAgentRunModel, repoAiKeyModel } from '../../../db/models';

/**
 * Helper to get repo by owner/name and verify ownership/admin
 */
async function getRepoAndVerifyAccess(owner: string, repoName: string, userId: string) {
  const result = await repoModel.findByPath(owner, repoName);
  
  if (!result) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Repository not found',
    });
  }
  
  const isOwner = result.repo.ownerId === userId;
  // TODO: Check if user is admin collaborator as well
  const hasAccess = isOwner;
  
  return { repo: result.repo, isOwner, hasAccess };
}

/**
 * Helper to verify user has access to manage triage agent
 */
async function verifyAccess(repoId: string, userId: string) {
  const repo = await repoModel.findById(repoId);
  
  if (!repo) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Repository not found',
    });
  }
  
  // Only owner can manage triage agent for now
  if (repo.ownerId !== userId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the repository owner can manage the triage agent',
    });
  }
  
  return repo;
}

export const triageAgentRouter = router({
  /**
   * Get triage agent configuration for a repository
   */
  getConfig: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { repo, isOwner, hasAccess } = await getRepoAndVerifyAccess(input.owner, input.repo, ctx.user.id);
      
      // Check AI availability
      const aiAvailability = await repoAiKeyModel.checkAvailability(repo.id);
      
      // If user doesn't have access, return limited info
      if (!hasAccess) {
        return {
          hasAccess: false,
          repoId: repo.id,
          config: null,
          aiAvailable: aiAvailability.available,
        };
      }
      
      const config = await triageAgentConfigModel.findByRepoId(repo.id);
      
      return {
        hasAccess: true,
        isOwner,
        repoId: repo.id,
        config: config ? {
          id: config.id,
          enabled: config.enabled,
          prompt: config.prompt,
          autoAssignLabels: config.autoAssignLabels,
          autoAssignUsers: config.autoAssignUsers,
          autoSetPriority: config.autoSetPriority,
          addTriageComment: config.addTriageComment,
          updatedAt: config.updatedAt,
        } : null,
        aiAvailable: aiAvailability.available,
      };
    }),

  /**
   * Update triage agent configuration
   */
  updateConfig: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        enabled: z.boolean().optional(),
        prompt: z.string().nullable().optional(),
        autoAssignLabels: z.boolean().optional(),
        autoAssignUsers: z.boolean().optional(),
        autoSetPriority: z.boolean().optional(),
        addTriageComment: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await verifyAccess(input.repoId, ctx.user.id);
      
      const { repoId, ...data } = input;
      
      // Filter out undefined values
      const updateData: Record<string, unknown> = { updatedById: ctx.user.id };
      if (data.enabled !== undefined) updateData.enabled = data.enabled;
      if (data.prompt !== undefined) updateData.prompt = data.prompt;
      if (data.autoAssignLabels !== undefined) updateData.autoAssignLabels = data.autoAssignLabels;
      if (data.autoAssignUsers !== undefined) updateData.autoAssignUsers = data.autoAssignUsers;
      if (data.autoSetPriority !== undefined) updateData.autoSetPriority = data.autoSetPriority;
      if (data.addTriageComment !== undefined) updateData.addTriageComment = data.addTriageComment;
      
      const config = await triageAgentConfigModel.upsert(repoId, updateData as any);
      
      return {
        id: config.id,
        enabled: config.enabled,
        prompt: config.prompt,
        autoAssignLabels: config.autoAssignLabels,
        autoAssignUsers: config.autoAssignUsers,
        autoSetPriority: config.autoSetPriority,
        addTriageComment: config.addTriageComment,
        updatedAt: config.updatedAt,
      };
    }),

  /**
   * Enable or disable the triage agent
   */
  setEnabled: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await verifyAccess(input.repoId, ctx.user.id);
      
      // Check AI availability before enabling
      if (input.enabled) {
        const aiAvailability = await repoAiKeyModel.checkAvailability(input.repoId);
        if (!aiAvailability.available) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'AI API keys must be configured before enabling the triage agent',
          });
        }
      }
      
      const config = await triageAgentConfigModel.setEnabled(
        input.repoId,
        input.enabled,
        ctx.user.id
      );
      
      return { enabled: config.enabled };
    }),

  /**
   * Get recent triage runs for a repository
   */
  getRuns: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      await verifyAccess(input.repoId, ctx.user.id);
      
      const runs = await triageAgentRunModel.listByRepoId(input.repoId, {
        limit: input.limit,
        offset: input.offset,
      });
      
      return runs.map(run => ({
        id: run.id,
        issueId: run.issueId,
        success: run.success,
        errorMessage: run.errorMessage,
        assignedLabels: run.assignedLabels ? JSON.parse(run.assignedLabels) : null,
        assignedUserId: run.assignedUserId,
        assignedPriority: run.assignedPriority,
        reasoning: run.reasoning,
        tokensUsed: run.tokensUsed,
        createdAt: run.createdAt,
      }));
    }),

  /**
   * Get triage run for a specific issue
   */
  getRunByIssue: protectedProcedure
    .input(
      z.object({
        issueId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      const run = await triageAgentRunModel.findLatestByIssueId(input.issueId);
      
      if (!run) {
        return null;
      }
      
      return {
        id: run.id,
        issueId: run.issueId,
        success: run.success,
        errorMessage: run.errorMessage,
        assignedLabels: run.assignedLabels ? JSON.parse(run.assignedLabels) : null,
        assignedUserId: run.assignedUserId,
        assignedPriority: run.assignedPriority,
        reasoning: run.reasoning,
        tokensUsed: run.tokensUsed,
        createdAt: run.createdAt,
      };
    }),
});
