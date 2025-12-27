/**
 * Agent Factory
 * 
 * Creates the appropriate agent based on the requested mode.
 */

import { Agent } from '@mastra/core/agent';
import type { AgentMode, AgentContext } from '../types.js';
import { createQuestionsAgent } from './questions-agent.js';
import { createPMAgent } from './pm-agent.js';
import { createCodeAgent } from './code-agent.js';

/**
 * Create an agent for the specified mode and repository context
 */
export function createAgentForMode(
  mode: AgentMode,
  context: AgentContext,
  model: string = 'anthropic/claude-opus-4-5'
): Agent {
  switch (mode) {
    case 'questions':
      return createQuestionsAgent(context, model);
    case 'pm':
      return createPMAgent(context, model);
    case 'code':
      return createCodeAgent(context, model);
    default:
      throw new Error(`Unknown agent mode: ${mode}`);
  }
}

/**
 * Get the default mode for a new session
 */
export function getDefaultMode(): AgentMode {
  return 'questions';
}
