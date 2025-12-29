/**
 * AI Agents Module
 * 
 * Specialized agents for different tasks:
 * - Orchestrator: Coordinates other agents for complex tasks
 * - Code Agent: Writing and editing code
 * - PM Agent: Project management (issues, PRs)
 * - Review Agent: Code review and quality
 * - Search Agent: Finding and understanding code
 * - Triage Agent: Issue categorization
 */

// Orchestrator - the meta-agent
export { 
  createOrchestratorAgent,
  ORCHESTRATOR_INSTRUCTIONS,
} from './orchestrator.js';

// Code Agent
export { 
  createCodeAgent,
  CODE_AGENT_INSTRUCTIONS,
} from './code-agent.js';

// PM Agent
export { 
  createPMAgent,
  PM_AGENT_INSTRUCTIONS,
} from './pm-agent.js';

// Review Agent
export {
  createReviewAgent,
  REVIEW_AGENT_INSTRUCTIONS,
} from './review-agent.js';

// Search Agent
export {
  createSearchAgent,
  SEARCH_AGENT_INSTRUCTIONS,
} from './search-agent.js';

// Triage Agent
export {
  createTriageAgent,
  runTriageAgent,
  TRIAGE_AGENT_INSTRUCTIONS,
  type TriageContext,
  type TriageResult,
} from './triage-agent.js';

// Agent Factory
export {
  createAgentForMode,
  getDefaultMode,
} from './factory.js';
