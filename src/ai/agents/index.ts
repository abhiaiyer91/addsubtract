/**
 * Mode-based Agents for wit
 * 
 * Each mode has a specialized agent with different tools and instructions:
 * - Questions: Read-only, helps understand codebase
 * - PM: Creates issues, PRs, manages projects
 * - Code: Writes code, edits files, commits changes
 */

export { createQuestionsAgent, QUESTIONS_AGENT_INSTRUCTIONS } from './questions-agent.js';
export { createPMAgent, PM_AGENT_INSTRUCTIONS } from './pm-agent.js';
export { createCodeAgent, CODE_AGENT_INSTRUCTIONS } from './code-agent.js';
export { createAgentForMode } from './factory.js';
