/**
 * AI Collaboration Models
 * 
 * Database models for AI attribution, intents, patterns, and decisions.
 * Part of wit's AI Collaboration feature set.
 */

import { eq, and, desc, sql, isNull, gte, lte, or, like, inArray } from 'drizzle-orm';
import { getDb } from '../index.js';

// Lazy getter for database to handle initialization timing
function db() {
  return getDb();
}
import {
  aiActions,
  commitAiAttribution,
  codebasePatterns,
  decisions,
  developmentIntents,
  intentSteps,
  reviewFeedback,
  collaborativeSessions,
  collaborativeSessionParticipants,
  type AiAction,
  type NewAiAction,
  type CommitAiAttribution,
  type NewCommitAiAttribution,
  type CodebasePattern,
  type NewCodebasePattern,
  type Decision,
  type NewDecision,
  type DevelopmentIntent,
  type NewDevelopmentIntent,
  type IntentStep,
  type NewIntentStep,
  type ReviewFeedback,
  type NewReviewFeedback,
  type CollaborativeSession,
  type NewCollaborativeSession,
  type CollaborativeSessionParticipant,
  type NewCollaborativeSessionParticipant,
  type PatternType,
  type IntentStatus,
  type AiActionType,
} from '../ai-collaboration-schema.js';

// ============================================================================
// AI ACTIONS MODEL
// ============================================================================

export const aiActionModel = {
  /**
   * Create a new AI action record
   */
  async create(data: NewAiAction): Promise<AiAction> {
    const [action] = await db().insert(aiActions).values(data).returning();
    return action;
  },

  /**
   * Get an AI action by ID
   */
  async findById(id: string): Promise<AiAction | null> {
    const [action] = await db().select().from(aiActions).where(eq(aiActions.id, id));
    return action || null;
  },

  /**
   * Get all actions for a session
   */
  async findBySession(sessionId: string): Promise<AiAction[]> {
    return db()
      .select()
      .from(aiActions)
      .where(eq(aiActions.sessionId, sessionId))
      .orderBy(desc(aiActions.createdAt));
  },

  /**
   * Get actions by commit SHA
   */
  async findByCommit(commitSha: string): Promise<AiAction[]> {
    return db()
      .select()
      .from(aiActions)
      .where(eq(aiActions.commitSha, commitSha));
  },

  /**
   * Get actions by type
   */
  async findByType(sessionId: string, actionType: AiActionType): Promise<AiAction[]> {
    return db()
      .select()
      .from(aiActions)
      .where(and(
        eq(aiActions.sessionId, sessionId),
        eq(aiActions.actionType, actionType)
      ))
      .orderBy(desc(aiActions.createdAt));
  },

  /**
   * Get recent actions with optional filters
   */
  async findRecent(options: {
    limit?: number;
    sessionId?: string;
    actionType?: AiActionType;
    since?: Date;
  } = {}): Promise<AiAction[]> {
    const { limit = 50, sessionId, actionType, since } = options;
    
    const conditions = [];
    if (sessionId) conditions.push(eq(aiActions.sessionId, sessionId));
    if (actionType) conditions.push(eq(aiActions.actionType, actionType));
    if (since) conditions.push(gte(aiActions.createdAt, since));

    return db()
      .select()
      .from(aiActions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(aiActions.createdAt))
      .limit(limit);
  },

  /**
   * Get token usage statistics for a session
   */
  async getTokenUsage(sessionId: string): Promise<{ promptTokens: number; completionTokens: number }> {
    const result = await db()
      .select({
        promptTokens: sql<number>`COALESCE(SUM(${aiActions.promptTokens}), 0)`,
        completionTokens: sql<number>`COALESCE(SUM(${aiActions.completionTokens}), 0)`,
      })
      .from(aiActions)
      .where(eq(aiActions.sessionId, sessionId));
    
    return result[0] || { promptTokens: 0, completionTokens: 0 };
  },
};

// ============================================================================
// COMMIT AI ATTRIBUTION MODEL
// ============================================================================

export const commitAiAttributionModel = {
  /**
   * Create attribution for a commit
   */
  async create(data: NewCommitAiAttribution): Promise<CommitAiAttribution> {
    const [attribution] = await db().insert(commitAiAttribution).values(data).returning();
    return attribution;
  },

  /**
   * Get attribution for a commit
   */
  async findByCommit(repoId: string, commitSha: string): Promise<CommitAiAttribution | null> {
    const [attr] = await db()
      .select()
      .from(commitAiAttribution)
      .where(and(
        eq(commitAiAttribution.repoId, repoId),
        eq(commitAiAttribution.commitSha, commitSha)
      ));
    return attr || null;
  },

  /**
   * Get all AI-authored commits for a repository
   */
  async findAiCommits(repoId: string, options: {
    limit?: number;
    since?: Date;
    agentType?: string;
  } = {}): Promise<CommitAiAttribution[]> {
    const { limit = 100, since, agentType } = options;
    
    const conditions = [eq(commitAiAttribution.repoId, repoId)];
    if (since) conditions.push(gte(commitAiAttribution.createdAt, since));
    if (agentType) conditions.push(eq(commitAiAttribution.agentType, agentType));

    return db()
      .select()
      .from(commitAiAttribution)
      .where(and(...conditions))
      .orderBy(desc(commitAiAttribution.createdAt))
      .limit(limit);
  },

  /**
   * Check if a commit was AI-authored
   */
  async isAiAuthored(repoId: string, commitSha: string): Promise<boolean> {
    const attr = await this.findByCommit(repoId, commitSha);
    return attr !== null;
  },

  /**
   * Get prompt that created a commit
   */
  async getPromptForCommit(repoId: string, commitSha: string): Promise<string | null> {
    const attr = await this.findByCommit(repoId, commitSha);
    return attr?.inputPrompt || null;
  },

  /**
   * Get AI attribution statistics for a repo
   */
  async getStats(repoId: string): Promise<{
    totalAiCommits: number;
    byAgentType: Record<string, number>;
    avgConfidence: number;
  }> {
    const commits = await this.findAiCommits(repoId);
    
    const byAgentType: Record<string, number> = {};
    let totalConfidence = 0;
    let confidenceCount = 0;
    
    for (const commit of commits) {
      const type = commit.agentType || 'unknown';
      byAgentType[type] = (byAgentType[type] || 0) + 1;
      if (commit.confidenceScore !== null) {
        totalConfidence += commit.confidenceScore;
        confidenceCount++;
      }
    }
    
    return {
      totalAiCommits: commits.length,
      byAgentType,
      avgConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
    };
  },
};

// ============================================================================
// CODEBASE PATTERNS MODEL
// ============================================================================

export const codebasePatternsModel = {
  /**
   * Create a new pattern
   */
  async create(data: NewCodebasePattern): Promise<CodebasePattern> {
    const [pattern] = await db().insert(codebasePatterns).values(data).returning();
    return pattern;
  },

  /**
   * Get a pattern by ID
   */
  async findById(id: string): Promise<CodebasePattern | null> {
    const [pattern] = await db().select().from(codebasePatterns).where(eq(codebasePatterns.id, id));
    return pattern || null;
  },

  /**
   * Get all active patterns for a repository
   */
  async findActiveByRepo(repoId: string): Promise<CodebasePattern[]> {
    return db()
      .select()
      .from(codebasePatterns)
      .where(and(
        eq(codebasePatterns.repoId, repoId),
        eq(codebasePatterns.isActive, true)
      ))
      .orderBy(desc(codebasePatterns.confidence));
  },

  /**
   * Get patterns by type
   */
  async findByType(repoId: string, patternType: PatternType): Promise<CodebasePattern[]> {
    return db()
      .select()
      .from(codebasePatterns)
      .where(and(
        eq(codebasePatterns.repoId, repoId),
        eq(codebasePatterns.patternType, patternType),
        eq(codebasePatterns.isActive, true)
      ))
      .orderBy(desc(codebasePatterns.confidence));
  },

  /**
   * Update pattern confidence based on feedback
   */
  async recordFeedback(id: string, approved: boolean): Promise<CodebasePattern | null> {
    const pattern = await this.findById(id);
    if (!pattern) return null;

    const updates = approved
      ? {
          confirmationCount: (pattern.confirmationCount || 0) + 1,
          confidence: Math.min(1, (pattern.confidence || 0.5) + 0.05),
        }
      : {
          rejectionCount: (pattern.rejectionCount || 0) + 1,
          confidence: Math.max(0, (pattern.confidence || 0.5) - 0.1),
        };

    const [updated] = await db()
      .update(codebasePatterns)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(codebasePatterns.id, id))
      .returning();
    
    return updated;
  },

  /**
   * Deactivate low-confidence patterns
   */
  async deactivateLowConfidence(repoId: string, threshold = 0.2): Promise<number> {
    const result = await db()
      .update(codebasePatterns)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(codebasePatterns.repoId, repoId),
        lte(codebasePatterns.confidence, threshold)
      ));
    
    return result.rowCount || 0;
  },

  /**
   * Get pattern summary for AI context
   */
  async getPatternSummary(repoId: string): Promise<string> {
    const patterns = await this.findActiveByRepo(repoId);
    
    if (patterns.length === 0) {
      return 'No learned patterns for this repository yet.';
    }
    
    const lines = ['Codebase Patterns:'];
    for (const pattern of patterns.slice(0, 10)) { // Top 10
      lines.push(`- [${pattern.patternType}] ${pattern.description} (confidence: ${Math.round((pattern.confidence || 0) * 100)}%)`);
    }
    
    return lines.join('\n');
  },
};

// ============================================================================
// DECISIONS MODEL
// ============================================================================

export const decisionsModel = {
  /**
   * Create a new decision
   */
  async create(data: NewDecision): Promise<Decision> {
    const [decision] = await db().insert(decisions).values(data).returning();
    return decision;
  },

  /**
   * Get a decision by ID
   */
  async findById(id: string): Promise<Decision | null> {
    const [decision] = await db().select().from(decisions).where(eq(decisions.id, id));
    return decision || null;
  },

  /**
   * Get all decisions for a repository
   */
  async findByRepo(repoId: string, options: {
    status?: string;
    limit?: number;
  } = {}): Promise<Decision[]> {
    const { status, limit = 100 } = options;
    
    const conditions = [eq(decisions.repoId, repoId)];
    if (status) conditions.push(eq(decisions.status, status as any));

    return db()
      .select()
      .from(decisions)
      .where(and(...conditions))
      .orderBy(desc(decisions.createdAt))
      .limit(limit);
  },

  /**
   * Search decisions by keyword
   */
  async search(repoId: string, query: string): Promise<Decision[]> {
    const pattern = `%${query}%`;
    return db()
      .select()
      .from(decisions)
      .where(and(
        eq(decisions.repoId, repoId),
        or(
          like(decisions.title, pattern),
          like(decisions.context, pattern),
          like(decisions.decision, pattern)
        )
      ))
      .orderBy(desc(decisions.createdAt));
  },

  /**
   * Supersede a decision with a new one
   */
  async supersede(oldId: string, newDecisionData: NewDecision): Promise<Decision> {
    // Create the new decision
    const [newDecision] = await db().insert(decisions).values(newDecisionData).returning();
    
    // Mark the old one as superseded
    await db()
      .update(decisions)
      .set({ 
        status: 'superseded',
        supersededById: newDecision.id,
        updatedAt: new Date(),
      })
      .where(eq(decisions.id, oldId));
    
    return newDecision;
  },

  /**
   * Get decision summary for AI context
   */
  async getDecisionSummary(repoId: string): Promise<string> {
    const activeDecisions = await this.findByRepo(repoId, { status: 'accepted', limit: 20 });
    
    if (activeDecisions.length === 0) {
      return 'No architectural decisions recorded for this repository.';
    }
    
    const lines = ['Architectural Decisions:'];
    for (const d of activeDecisions) {
      lines.push(`- ${d.title}: ${d.decision.slice(0, 100)}...`);
    }
    
    return lines.join('\n');
  },
};

// ============================================================================
// DEVELOPMENT INTENTS MODEL
// ============================================================================

export const developmentIntentsModel = {
  /**
   * Create a new intent
   */
  async create(data: NewDevelopmentIntent): Promise<DevelopmentIntent> {
    const [intent] = await db().insert(developmentIntents).values(data).returning();
    return intent;
  },

  /**
   * Get an intent by ID
   */
  async findById(id: string): Promise<DevelopmentIntent | null> {
    const [intent] = await db().select().from(developmentIntents).where(eq(developmentIntents.id, id));
    return intent || null;
  },

  /**
   * Get intents for a repository
   */
  async findByRepo(repoId: string, options: {
    status?: IntentStatus;
    limit?: number;
  } = {}): Promise<DevelopmentIntent[]> {
    const { status, limit = 50 } = options;
    
    const conditions = [eq(developmentIntents.repoId, repoId)];
    if (status) conditions.push(eq(developmentIntents.status, status));

    return db()
      .select()
      .from(developmentIntents)
      .where(and(...conditions))
      .orderBy(desc(developmentIntents.createdAt))
      .limit(limit);
  },

  /**
   * Get active intents for a user
   */
  async findActiveByUser(userId: string): Promise<DevelopmentIntent[]> {
    return db()
      .select()
      .from(developmentIntents)
      .where(and(
        eq(developmentIntents.createdById, userId),
        inArray(developmentIntents.status, ['draft', 'planning', 'ready', 'in_progress', 'paused'])
      ))
      .orderBy(desc(developmentIntents.updatedAt));
  },

  /**
   * Update intent status
   */
  async updateStatus(id: string, status: IntentStatus, extras: Partial<DevelopmentIntent> = {}): Promise<DevelopmentIntent | null> {
    const updates: Partial<DevelopmentIntent> = {
      status,
      updatedAt: new Date(),
      ...extras,
    };
    
    // Set timestamps based on status
    if (status === 'in_progress' && !extras.startedAt) {
      updates.startedAt = new Date();
    }
    if (status === 'completed' || status === 'failed') {
      updates.completedAt = new Date();
    }

    const [updated] = await db()
      .update(developmentIntents)
      .set(updates)
      .where(eq(developmentIntents.id, id))
      .returning();
    
    return updated || null;
  },

  /**
   * Update intent progress
   */
  async updateProgress(id: string, progress: number): Promise<DevelopmentIntent | null> {
    const [updated] = await db()
      .update(developmentIntents)
      .set({ progress, updatedAt: new Date() })
      .where(eq(developmentIntents.id, id))
      .returning();
    
    return updated || null;
  },

  /**
   * Set the plan for an intent
   */
  async setPlan(id: string, plan: object, affectedFiles: string[], estimatedComplexity: number): Promise<DevelopmentIntent | null> {
    const [updated] = await db()
      .update(developmentIntents)
      .set({
        plan,
        affectedFiles,
        estimatedComplexity,
        status: 'ready',
        updatedAt: new Date(),
      })
      .where(eq(developmentIntents.id, id))
      .returning();
    
    return updated || null;
  },
};

// ============================================================================
// INTENT STEPS MODEL
// ============================================================================

export const intentStepsModel = {
  /**
   * Create steps for an intent
   */
  async createBatch(intentId: string, steps: Array<{ description: string }>): Promise<IntentStep[]> {
    const stepsToInsert = steps.map((step, index) => ({
      intentId,
      stepNumber: index + 1,
      description: step.description,
    }));

    return db().insert(intentSteps).values(stepsToInsert).returning();
  },

  /**
   * Get steps for an intent
   */
  async findByIntent(intentId: string): Promise<IntentStep[]> {
    return db()
      .select()
      .from(intentSteps)
      .where(eq(intentSteps.intentId, intentId))
      .orderBy(intentSteps.stepNumber);
  },

  /**
   * Update step status
   */
  async updateStatus(id: string, status: string, extras: Partial<IntentStep> = {}): Promise<IntentStep | null> {
    const updates: Partial<IntentStep> = { status, ...extras };
    
    if (status === 'completed') {
      updates.completedAt = new Date();
    }

    const [updated] = await db()
      .update(intentSteps)
      .set(updates)
      .where(eq(intentSteps.id, id))
      .returning();
    
    return updated || null;
  },

  /**
   * Get next pending step for an intent
   */
  async getNextPending(intentId: string): Promise<IntentStep | null> {
    const [step] = await db()
      .select()
      .from(intentSteps)
      .where(and(
        eq(intentSteps.intentId, intentId),
        eq(intentSteps.status, 'pending')
      ))
      .orderBy(intentSteps.stepNumber)
      .limit(1);
    
    return step || null;
  },
};

// ============================================================================
// REVIEW FEEDBACK MODEL
// ============================================================================

export const reviewFeedbackModel = {
  /**
   * Record feedback on AI content
   */
  async create(data: NewReviewFeedback): Promise<ReviewFeedback> {
    const [feedback] = await db().insert(reviewFeedback).values(data).returning();
    return feedback;
  },

  /**
   * Get feedback for a repository
   */
  async findByRepo(repoId: string, options: {
    feedbackType?: string;
    limit?: number;
  } = {}): Promise<ReviewFeedback[]> {
    const { feedbackType, limit = 100 } = options;
    
    const conditions = [eq(reviewFeedback.repoId, repoId)];
    if (feedbackType) conditions.push(eq(reviewFeedback.feedbackType, feedbackType));

    return db()
      .select()
      .from(reviewFeedback)
      .where(and(...conditions))
      .orderBy(desc(reviewFeedback.createdAt))
      .limit(limit);
  },

  /**
   * Get approval rate for AI content in a repo
   */
  async getApprovalRate(repoId: string): Promise<number> {
    const all = await this.findByRepo(repoId);
    if (all.length === 0) return 0;
    
    const approved = all.filter(f => f.feedbackType === 'approved').length;
    return approved / all.length;
  },
};

// ============================================================================
// COLLABORATIVE SESSIONS MODEL
// ============================================================================

export const collaborativeSessionsModel = {
  /**
   * Create a new collaborative session
   */
  async create(data: NewCollaborativeSession): Promise<CollaborativeSession> {
    const [session] = await db().insert(collaborativeSessions).values(data).returning();
    return session;
  },

  /**
   * Get a session by ID
   */
  async findById(id: string): Promise<CollaborativeSession | null> {
    const [session] = await db().select().from(collaborativeSessions).where(eq(collaborativeSessions.id, id));
    return session || null;
  },

  /**
   * Get active sessions for a repository
   */
  async findActiveByRepo(repoId: string): Promise<CollaborativeSession[]> {
    return db()
      .select()
      .from(collaborativeSessions)
      .where(and(
        eq(collaborativeSessions.repoId, repoId),
        eq(collaborativeSessions.isActive, true)
      ))
      .orderBy(desc(collaborativeSessions.updatedAt));
  },

  /**
   * End a session
   */
  async end(id: string): Promise<CollaborativeSession | null> {
    const [updated] = await db()
      .update(collaborativeSessions)
      .set({
        isActive: false,
        endedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(collaborativeSessions.id, id))
      .returning();
    
    return updated || null;
  },

  /**
   * Add a participant
   */
  async addParticipant(data: NewCollaborativeSessionParticipant): Promise<CollaborativeSessionParticipant> {
    const [participant] = await db().insert(collaborativeSessionParticipants).values(data).returning();
    return participant;
  },

  /**
   * Get participants for a session
   */
  async getParticipants(sessionId: string): Promise<CollaborativeSessionParticipant[]> {
    return db()
      .select()
      .from(collaborativeSessionParticipants)
      .where(eq(collaborativeSessionParticipants.sessionId, sessionId));
  },

  /**
   * Remove a participant
   */
  async removeParticipant(sessionId: string, userId: string): Promise<void> {
    await db()
      .update(collaborativeSessionParticipants)
      .set({ isActive: false, leftAt: new Date() })
      .where(and(
        eq(collaborativeSessionParticipants.sessionId, sessionId),
        eq(collaborativeSessionParticipants.userId, userId)
      ));
  },
};

// ============================================================================
// EXPORT ALL MODELS
// ============================================================================

export const aiCollaborationModels = {
  aiActions: aiActionModel,
  commitAttribution: commitAiAttributionModel,
  patterns: codebasePatternsModel,
  decisions: decisionsModel,
  intents: developmentIntentsModel,
  intentSteps: intentStepsModel,
  reviewFeedback: reviewFeedbackModel,
  collaborativeSessions: collaborativeSessionsModel,
};

export default aiCollaborationModels;
