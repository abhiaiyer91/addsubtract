/**
 * Mode-based Agents for wit
 * 
 * Each mode has a specialized agent with different tools and instructions:
 * - PM: Creates issues, PRs, manages projects
 * - Code: Writes code, edits files, commits changes
 * - Triage: Automatically categorizes and prioritizes new issues
 * - Planning: Helps users plan tasks and spawn parallel agents
 */

export { createPMAgent, PM_AGENT_INSTRUCTIONS } from './pm-agent.js';
export { createCodeAgent, CODE_AGENT_INSTRUCTIONS } from './code-agent.js';
export { createAgentForMode } from './factory.js';
export { 
  createTriageAgent, 
  runTriageAgent, 
  TRIAGE_AGENT_INSTRUCTIONS,
  type TriageContext,
  type TriageResult,
} from './triage-agent.js';
export {
  createPlanningAgent,
  parseTasksFromResponse,
  PLANNING_AGENT_INSTRUCTIONS,
  TaskGenerationSchema,
  type TaskGeneration,
} from './planning-agent.js';
