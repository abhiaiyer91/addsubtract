-- AI Collaboration Schema
-- Phase 1: Attribution & Provenance

-- ============================================================================
-- AI SESSION ENHANCEMENTS
-- ============================================================================

-- Add handoff support to agent sessions
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS parent_session_id UUID REFERENCES agent_sessions(id);
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS handoff_instructions TEXT;
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS context JSONB;

-- ============================================================================
-- AI ACTIONS TABLE - Granular tracking of AI operations
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Session context
  session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
  
  -- What kind of action
  action_type TEXT NOT NULL, -- 'file_create', 'file_edit', 'file_delete', 'commit', 'branch_create', 'pr_create', etc.
  
  -- The prompt/instruction that triggered this action
  input_prompt TEXT,
  
  -- Result of the action (JSON)
  output_result JSONB,
  
  -- Confidence score (0.0-1.0) - how confident the AI was in this action
  confidence_score REAL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  
  -- Alternative approaches the AI considered (JSON array)
  alternatives_considered JSONB,
  
  -- For file operations: which file was affected
  file_path TEXT,
  
  -- For commit operations: the commit SHA
  commit_sha TEXT,
  
  -- For PR operations: the PR ID
  pr_id UUID REFERENCES pull_requests(id) ON DELETE SET NULL,
  
  -- Token usage
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_actions_session ON ai_actions(session_id);
CREATE INDEX idx_ai_actions_type ON ai_actions(action_type);
CREATE INDEX idx_ai_actions_commit ON ai_actions(commit_sha) WHERE commit_sha IS NOT NULL;
CREATE INDEX idx_ai_actions_created ON ai_actions(created_at);

-- ============================================================================
-- COMMIT AI ATTRIBUTION - Link commits to AI sessions
-- ============================================================================

-- Add AI attribution columns to activities table (for commit tracking)
-- Note: We don't modify the git objects themselves, we track in our metadata

CREATE TABLE IF NOT EXISTS commit_ai_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Repository and commit
  repo_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  commit_sha TEXT NOT NULL,
  
  -- AI session that created this commit
  ai_session_id UUID REFERENCES agent_sessions(id) ON DELETE SET NULL,
  
  -- AI action that created this commit
  ai_action_id UUID REFERENCES ai_actions(id) ON DELETE SET NULL,
  
  -- The prompt that led to this commit
  input_prompt TEXT,
  
  -- Confidence score
  confidence_score REAL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  
  -- Agent type that made this commit
  agent_type TEXT, -- 'code', 'questions', 'pm', 'triage'
  
  -- Human who authorized/initiated the AI action
  authorized_by_user_id TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(repo_id, commit_sha)
);

CREATE INDEX idx_commit_ai_repo ON commit_ai_attribution(repo_id);
CREATE INDEX idx_commit_ai_session ON commit_ai_attribution(ai_session_id);
CREATE INDEX idx_commit_ai_sha ON commit_ai_attribution(commit_sha);

-- ============================================================================
-- PR AI ATTRIBUTION - Track AI involvement in PRs
-- ============================================================================

-- Add AI-specific columns to pull requests
ALTER TABLE pull_requests ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT FALSE;
ALTER TABLE pull_requests ADD COLUMN IF NOT EXISTS ai_session_id UUID REFERENCES agent_sessions(id);
ALTER TABLE pull_requests ADD COLUMN IF NOT EXISTS ai_reasoning TEXT;
ALTER TABLE pull_requests ADD COLUMN IF NOT EXISTS auto_reviewed BOOLEAN DEFAULT FALSE;
ALTER TABLE pull_requests ADD COLUMN IF NOT EXISTS auto_review_score REAL;

-- ============================================================================
-- CODEBASE PATTERNS - Learned patterns from the codebase
-- ============================================================================

CREATE TYPE pattern_type AS ENUM (
  'naming',           -- Variable/function naming conventions
  'error_handling',   -- How errors are handled
  'testing',          -- Testing patterns
  'logging',          -- Logging conventions
  'api_design',       -- API endpoint patterns
  'file_structure',   -- Directory/file organization
  'imports',          -- Import ordering/grouping
  'comments',         -- Documentation style
  'architecture',     -- Architectural patterns
  'other'
);

CREATE TABLE IF NOT EXISTS codebase_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Repository this pattern belongs to
  repo_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  
  -- Type of pattern
  pattern_type pattern_type NOT NULL,
  
  -- Description of the pattern
  description TEXT NOT NULL,
  
  -- Example code/files demonstrating this pattern (JSON array)
  examples JSONB,
  
  -- How confident we are in this pattern (0.0-1.0)
  confidence REAL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  
  -- Number of times this pattern was confirmed by human review
  confirmation_count INTEGER DEFAULT 0,
  
  -- Number of times this pattern was rejected
  rejection_count INTEGER DEFAULT 0,
  
  -- Source: how this pattern was discovered
  source TEXT, -- 'ai_analysis', 'human_defined', 'review_feedback'
  
  -- Is this pattern active (used for AI guidance)?
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_codebase_patterns_repo ON codebase_patterns(repo_id);
CREATE INDEX idx_codebase_patterns_type ON codebase_patterns(pattern_type);
CREATE INDEX idx_codebase_patterns_active ON codebase_patterns(repo_id, is_active) WHERE is_active = TRUE;

-- ============================================================================
-- ARCHITECTURAL DECISIONS - Decision journal
-- ============================================================================

CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Repository this decision belongs to
  repo_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  
  -- Decision title
  title TEXT NOT NULL,
  
  -- Context: what problem were we solving?
  context TEXT NOT NULL,
  
  -- The decision that was made
  decision TEXT NOT NULL,
  
  -- Alternatives that were considered (JSON array)
  alternatives JSONB,
  
  -- Consequences of this decision
  consequences TEXT,
  
  -- Status: proposed, accepted, deprecated, superseded
  status TEXT DEFAULT 'accepted',
  
  -- If superseded, link to the new decision
  superseded_by_id UUID REFERENCES decisions(id),
  
  -- Tags for categorization (JSON array)
  tags JSONB,
  
  -- Who made this decision
  created_by_id TEXT NOT NULL,
  
  -- Was this created by AI?
  ai_generated BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_decisions_repo ON decisions(repo_id);
CREATE INDEX idx_decisions_status ON decisions(repo_id, status);

-- ============================================================================
-- INTENT TRACKING - Intent-driven development
-- ============================================================================

CREATE TYPE intent_status AS ENUM (
  'draft',        -- Intent created but not started
  'planning',     -- AI is analyzing and creating a plan
  'ready',        -- Plan ready for approval
  'in_progress',  -- Implementation in progress
  'paused',       -- Implementation paused
  'completed',    -- Successfully completed
  'failed',       -- Failed to complete
  'cancelled'     -- Cancelled by user
);

CREATE TABLE IF NOT EXISTS development_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Repository context
  repo_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  
  -- The original intent description
  description TEXT NOT NULL,
  
  -- Current status
  status intent_status NOT NULL DEFAULT 'draft',
  
  -- AI-generated plan (JSON structure)
  plan JSONB,
  
  -- Estimated complexity (1-10)
  estimated_complexity INTEGER CHECK (estimated_complexity >= 1 AND estimated_complexity <= 10),
  
  -- Files that will be affected (JSON array)
  affected_files JSONB,
  
  -- Branch created for this intent
  branch_name TEXT,
  
  -- PR created for this intent
  pr_id UUID REFERENCES pull_requests(id),
  
  -- AI session working on this intent
  ai_session_id UUID REFERENCES agent_sessions(id),
  
  -- User who created this intent
  created_by_id TEXT NOT NULL,
  
  -- Progress (0-100)
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  
  -- Error message if failed
  error_message TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_intents_repo ON development_intents(repo_id);
CREATE INDEX idx_intents_status ON development_intents(status);
CREATE INDEX idx_intents_user ON development_intents(created_by_id);

-- Intent steps - individual steps in an intent's plan
CREATE TABLE IF NOT EXISTS intent_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  intent_id UUID NOT NULL REFERENCES development_intents(id) ON DELETE CASCADE,
  
  -- Step order
  step_number INTEGER NOT NULL,
  
  -- Step description
  description TEXT NOT NULL,
  
  -- Status
  status TEXT DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'failed', 'skipped'
  
  -- Commit that completed this step
  commit_sha TEXT,
  
  -- AI action that performed this step
  ai_action_id UUID REFERENCES ai_actions(id),
  
  -- Error message if failed
  error_message TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_intent_steps_intent ON intent_steps(intent_id);

-- ============================================================================
-- REVIEW FEEDBACK LEARNING - AI learning from human reviews
-- ============================================================================

CREATE TABLE IF NOT EXISTS review_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  repo_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  
  -- The AI-generated content that was reviewed
  ai_action_id UUID REFERENCES ai_actions(id),
  commit_sha TEXT,
  pr_id UUID REFERENCES pull_requests(id),
  
  -- Type of feedback
  feedback_type TEXT NOT NULL, -- 'approved', 'rejected', 'modified', 'commented'
  
  -- Human reviewer
  reviewer_id TEXT NOT NULL,
  
  -- The feedback content (comment, modification description)
  feedback_content TEXT,
  
  -- Original AI content
  ai_content TEXT,
  
  -- Human-modified content (if applicable)
  human_content TEXT,
  
  -- File path (if file-specific feedback)
  file_path TEXT,
  
  -- Did this feedback lead to a pattern update?
  pattern_updated BOOLEAN DEFAULT FALSE,
  pattern_id UUID REFERENCES codebase_patterns(id),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_review_feedback_repo ON review_feedback(repo_id);
CREATE INDEX idx_review_feedback_ai_action ON review_feedback(ai_action_id);
CREATE INDEX idx_review_feedback_type ON review_feedback(feedback_type);

-- ============================================================================
-- COLLABORATIVE SESSIONS - Multi-user + AI collaboration
-- ============================================================================

CREATE TABLE IF NOT EXISTS collaborative_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  repo_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  
  -- Session title
  title TEXT,
  
  -- Session creator
  created_by_id TEXT NOT NULL,
  
  -- Is session active?
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Session context/memory (JSON - what was discussed, decisions made)
  context JSONB,
  
  -- Branch this session is working on
  branch_name TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX idx_collab_sessions_repo ON collaborative_sessions(repo_id);
CREATE INDEX idx_collab_sessions_active ON collaborative_sessions(is_active) WHERE is_active = TRUE;

-- Participants in collaborative sessions
CREATE TABLE IF NOT EXISTS collaborative_session_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  session_id UUID NOT NULL REFERENCES collaborative_sessions(id) ON DELETE CASCADE,
  
  -- Participant (can be user or AI agent)
  participant_type TEXT NOT NULL, -- 'user', 'ai_agent'
  user_id TEXT, -- For human participants
  agent_type TEXT, -- For AI participants: 'code', 'questions', 'pm'
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  
  UNIQUE(session_id, user_id) -- Users can only join once
);

CREATE INDEX idx_collab_participants_session ON collaborative_session_participants(session_id);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_codebase_patterns_updated_at
  BEFORE UPDATE ON codebase_patterns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_decisions_updated_at
  BEFORE UPDATE ON decisions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_development_intents_updated_at
  BEFORE UPDATE ON development_intents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_collaborative_sessions_updated_at
  BEFORE UPDATE ON collaborative_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE ai_actions IS 'Granular tracking of all AI operations with prompts, results, and confidence scores';
COMMENT ON TABLE commit_ai_attribution IS 'Links git commits to the AI sessions and prompts that created them';
COMMENT ON TABLE codebase_patterns IS 'Learned patterns from the codebase that guide AI behavior';
COMMENT ON TABLE decisions IS 'Architectural Decision Records (ADRs) - decision journal for the codebase';
COMMENT ON TABLE development_intents IS 'Intent-driven development - high-level descriptions of desired changes';
COMMENT ON TABLE intent_steps IS 'Individual steps in an intent plan';
COMMENT ON TABLE review_feedback IS 'Human feedback on AI-generated content for continuous learning';
COMMENT ON TABLE collaborative_sessions IS 'Multi-user + AI collaborative coding sessions';
