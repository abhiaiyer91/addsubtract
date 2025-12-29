/**
 * AI Collaboration Schema
 * 
 * Tables for tracking AI contributions, attribution, and collaboration features.
 * This is Phase 1 of wit's AI Collaboration vision.
 */

import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  uuid,
  real,
  jsonb,
  pgEnum,
  unique,
} from 'drizzle-orm/pg-core';

import { repositories } from './schema';
import { agentSessions, pullRequests } from './schema';

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Pattern types for codebase patterns
 */
export const patternTypeEnum = pgEnum('pattern_type', [
  'naming',           // Variable/function naming conventions
  'error_handling',   // How errors are handled
  'testing',          // Testing patterns
  'logging',          // Logging conventions
  'api_design',       // API endpoint patterns
  'file_structure',   // Directory/file organization
  'imports',          // Import ordering/grouping
  'comments',         // Documentation style
  'architecture',     // Architectural patterns
  'other',
]);

/**
 * Intent status for intent-driven development
 */
export const intentStatusEnum = pgEnum('intent_status', [
  'draft',        // Intent created but not started
  'planning',     // AI is analyzing and creating a plan
  'ready',        // Plan ready for approval
  'in_progress',  // Implementation in progress
  'paused',       // Implementation paused
  'completed',    // Successfully completed
  'failed',       // Failed to complete
  'cancelled',    // Cancelled by user
]);

/**
 * Decision status for architectural decisions
 */
export const decisionStatusEnum = pgEnum('decision_status', [
  'proposed',
  'accepted',
  'deprecated',
  'superseded',
]);

/**
 * AI action types
 */
export const aiActionTypeEnum = pgEnum('ai_action_type', [
  'file_create',
  'file_edit',
  'file_delete',
  'commit',
  'branch_create',
  'pr_create',
  'pr_update',
  'issue_create',
  'issue_update',
  'search',
  'explain',
  'review',
  'other',
]);

// ============================================================================
// AI ACTIONS - Granular tracking of all AI operations
// ============================================================================

/**
 * AI Actions table
 * Tracks every action taken by AI agents with full attribution
 */
export const aiActions = pgTable('ai_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Session context
  sessionId: uuid('session_id')
    .notNull()
    .references(() => agentSessions.id, { onDelete: 'cascade' }),
  
  // What kind of action
  actionType: aiActionTypeEnum('action_type').notNull(),
  
  // The prompt/instruction that triggered this action
  inputPrompt: text('input_prompt'),
  
  // Result of the action (JSON)
  outputResult: jsonb('output_result'),
  
  // Confidence score (0.0-1.0)
  confidenceScore: real('confidence_score'),
  
  // Alternative approaches the AI considered (JSON array)
  alternativesConsidered: jsonb('alternatives_considered'),
  
  // For file operations: which file was affected
  filePath: text('file_path'),
  
  // For commit operations: the commit SHA
  commitSha: text('commit_sha'),
  
  // For PR operations: the PR ID
  prId: uuid('pr_id').references(() => pullRequests.id, { onDelete: 'set null' }),
  
  // Token usage
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// COMMIT AI ATTRIBUTION - Link commits to AI sessions
// ============================================================================

/**
 * Commit AI Attribution table
 * Links git commits to the AI sessions and prompts that created them
 */
export const commitAiAttribution = pgTable('commit_ai_attribution', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Repository and commit
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  commitSha: text('commit_sha').notNull(),
  
  // AI session that created this commit
  aiSessionId: uuid('ai_session_id').references(() => agentSessions.id, { onDelete: 'set null' }),
  
  // AI action that created this commit
  aiActionId: uuid('ai_action_id').references(() => aiActions.id, { onDelete: 'set null' }),
  
  // The prompt that led to this commit
  inputPrompt: text('input_prompt'),
  
  // Confidence score
  confidenceScore: real('confidence_score'),
  
  // Agent type that made this commit
  agentType: text('agent_type'), // 'code', 'questions', 'pm', 'triage'
  
  // Human who authorized/initiated the AI action
  authorizedByUserId: text('authorized_by_user_id'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueRepoCommit: unique().on(table.repoId, table.commitSha),
}));

// ============================================================================
// CODEBASE PATTERNS - Learned patterns from the codebase
// ============================================================================

/**
 * Codebase Patterns table
 * Stores patterns learned from the codebase that guide AI behavior
 */
export const codebasePatterns = pgTable('codebase_patterns', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Repository this pattern belongs to
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  
  // Type of pattern
  patternType: patternTypeEnum('pattern_type').notNull(),
  
  // Description of the pattern
  description: text('description').notNull(),
  
  // Example code/files demonstrating this pattern (JSON array)
  examples: jsonb('examples'),
  
  // How confident we are in this pattern (0.0-1.0)
  confidence: real('confidence').default(0.5),
  
  // Number of times this pattern was confirmed by human review
  confirmationCount: integer('confirmation_count').default(0),
  
  // Number of times this pattern was rejected
  rejectionCount: integer('rejection_count').default(0),
  
  // Source: how this pattern was discovered
  source: text('source'), // 'ai_analysis', 'human_defined', 'review_feedback'
  
  // Is this pattern active (used for AI guidance)?
  isActive: boolean('is_active').default(true),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// DECISIONS - Architectural Decision Records
// ============================================================================

/**
 * Decisions table
 * Stores Architectural Decision Records (ADRs) for the codebase
 */
export const decisions = pgTable('decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Repository this decision belongs to
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  
  // Decision title
  title: text('title').notNull(),
  
  // Context: what problem were we solving?
  context: text('context').notNull(),
  
  // The decision that was made
  decision: text('decision').notNull(),
  
  // Alternatives that were considered (JSON array)
  alternatives: jsonb('alternatives'),
  
  // Consequences of this decision
  consequences: text('consequences'),
  
  // Status
  status: decisionStatusEnum('status').default('accepted'),
  
  // If superseded, link to the new decision
  supersededById: uuid('superseded_by_id'),
  
  // Tags for categorization (JSON array)
  tags: jsonb('tags'),
  
  // Who made this decision
  createdById: text('created_by_id').notNull(),
  
  // Was this created by AI?
  aiGenerated: boolean('ai_generated').default(false),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// DEVELOPMENT INTENTS - Intent-driven development
// ============================================================================

/**
 * Development Intents table
 * Tracks high-level intents for intent-driven development
 */
export const developmentIntents = pgTable('development_intents', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  // Repository context
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  
  // The original intent description
  description: text('description').notNull(),
  
  // Current status
  status: intentStatusEnum('status').notNull().default('draft'),
  
  // AI-generated plan (JSON structure)
  plan: jsonb('plan'),
  
  // Estimated complexity (1-10)
  estimatedComplexity: integer('estimated_complexity'),
  
  // Files that will be affected (JSON array)
  affectedFiles: jsonb('affected_files'),
  
  // Branch created for this intent
  branchName: text('branch_name'),
  
  // PR created for this intent
  prId: uuid('pr_id').references(() => pullRequests.id),
  
  // AI session working on this intent
  aiSessionId: uuid('ai_session_id').references(() => agentSessions.id),
  
  // User who created this intent
  createdById: text('created_by_id').notNull(),
  
  // Progress (0-100)
  progress: integer('progress').default(0),
  
  // Error message if failed
  errorMessage: text('error_message'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

/**
 * Intent Steps table
 * Individual steps in an intent's execution plan
 */
export const intentSteps = pgTable('intent_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  intentId: uuid('intent_id')
    .notNull()
    .references(() => developmentIntents.id, { onDelete: 'cascade' }),
  
  // Step order
  stepNumber: integer('step_number').notNull(),
  
  // Step description
  description: text('description').notNull(),
  
  // Status
  status: text('status').default('pending'), // 'pending', 'in_progress', 'completed', 'failed', 'skipped'
  
  // Commit that completed this step
  commitSha: text('commit_sha'),
  
  // AI action that performed this step
  aiActionId: uuid('ai_action_id').references(() => aiActions.id),
  
  // Error message if failed
  errorMessage: text('error_message'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

// ============================================================================
// REVIEW FEEDBACK - Learning from human reviews
// ============================================================================

/**
 * Review Feedback table
 * Captures human feedback on AI-generated content for continuous learning
 */
export const reviewFeedback = pgTable('review_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  
  // The AI-generated content that was reviewed
  aiActionId: uuid('ai_action_id').references(() => aiActions.id),
  commitSha: text('commit_sha'),
  prId: uuid('pr_id').references(() => pullRequests.id),
  
  // Type of feedback
  feedbackType: text('feedback_type').notNull(), // 'approved', 'rejected', 'modified', 'commented'
  
  // Human reviewer
  reviewerId: text('reviewer_id').notNull(),
  
  // The feedback content (comment, modification description)
  feedbackContent: text('feedback_content'),
  
  // Original AI content
  aiContent: text('ai_content'),
  
  // Human-modified content (if applicable)
  humanContent: text('human_content'),
  
  // File path (if file-specific feedback)
  filePath: text('file_path'),
  
  // Did this feedback lead to a pattern update?
  patternUpdated: boolean('pattern_updated').default(false),
  patternId: uuid('pattern_id').references(() => codebasePatterns.id),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// COLLABORATIVE SESSIONS - Multi-user + AI collaboration
// ============================================================================

/**
 * Collaborative Sessions table
 * Tracks multi-user + AI collaborative coding sessions
 */
export const collaborativeSessions = pgTable('collaborative_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  repoId: uuid('repo_id')
    .notNull()
    .references(() => repositories.id, { onDelete: 'cascade' }),
  
  // Session title
  title: text('title'),
  
  // Session creator
  createdById: text('created_by_id').notNull(),
  
  // Is session active?
  isActive: boolean('is_active').default(true),
  
  // Session context/memory (JSON - what was discussed, decisions made)
  context: jsonb('context'),
  
  // Branch this session is working on
  branchName: text('branch_name'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
});

/**
 * Collaborative Session Participants table
 * Tracks participants (human and AI) in collaborative sessions
 */
export const collaborativeSessionParticipants = pgTable('collaborative_session_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  
  sessionId: uuid('session_id')
    .notNull()
    .references(() => collaborativeSessions.id, { onDelete: 'cascade' }),
  
  // Participant type
  participantType: text('participant_type').notNull(), // 'user', 'ai_agent'
  userId: text('user_id'), // For human participants
  agentType: text('agent_type'), // For AI participants: 'code', 'questions', 'pm'
  
  // Status
  isActive: boolean('is_active').default(true),
  
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  leftAt: timestamp('left_at', { withTimezone: true }),
}, (table) => ({
  uniqueUserSession: unique().on(table.sessionId, table.userId),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type PatternType = (typeof patternTypeEnum.enumValues)[number];
export type IntentStatus = (typeof intentStatusEnum.enumValues)[number];
export type DecisionStatus = (typeof decisionStatusEnum.enumValues)[number];
export type AiActionType = (typeof aiActionTypeEnum.enumValues)[number];

export type AiAction = typeof aiActions.$inferSelect;
export type NewAiAction = typeof aiActions.$inferInsert;

export type CommitAiAttribution = typeof commitAiAttribution.$inferSelect;
export type NewCommitAiAttribution = typeof commitAiAttribution.$inferInsert;

export type CodebasePattern = typeof codebasePatterns.$inferSelect;
export type NewCodebasePattern = typeof codebasePatterns.$inferInsert;

export type Decision = typeof decisions.$inferSelect;
export type NewDecision = typeof decisions.$inferInsert;

export type DevelopmentIntent = typeof developmentIntents.$inferSelect;
export type NewDevelopmentIntent = typeof developmentIntents.$inferInsert;

export type IntentStep = typeof intentSteps.$inferSelect;
export type NewIntentStep = typeof intentSteps.$inferInsert;

export type ReviewFeedback = typeof reviewFeedback.$inferSelect;
export type NewReviewFeedback = typeof reviewFeedback.$inferInsert;

export type CollaborativeSession = typeof collaborativeSessions.$inferSelect;
export type NewCollaborativeSession = typeof collaborativeSessions.$inferInsert;

export type CollaborativeSessionParticipant = typeof collaborativeSessionParticipants.$inferSelect;
export type NewCollaborativeSessionParticipant = typeof collaborativeSessionParticipants.$inferInsert;
