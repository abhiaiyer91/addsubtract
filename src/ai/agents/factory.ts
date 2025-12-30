/**
 * Agent Factory
 * 
 * Creates the appropriate agent based on the requested mode.
 * Supports loading MCP tools dynamically from enabled MCP servers.
 */

import { Agent } from '@mastra/core/agent';
import type { AgentMode, AgentContext } from '../types.js';
import { createPMAgent } from './pm-agent.js';
import { createCodeAgent, createCodeAgentWithMcpTools } from './code-agent.js';
import { getMcpToolsRecord, getMcpToolsSummary } from '../services/mcp-loader.js';

/**
 * Create an agent for the specified mode and repository context
 * This async version loads MCP tools dynamically
 */
export async function createAgentForMode(
  mode: AgentMode,
  context: AgentContext,
  model: string = 'anthropic/claude-opus-4-5'
): Promise<Agent> {
  switch (mode) {
    case 'pm':
      return createPMAgent(context, model);
    case 'code': {
      // Load MCP tools for the repository
      const mcpTools = await getMcpToolsRecord(context.repoId);
      const mcpSummary = await getMcpToolsSummary(context.repoId);
      
      // Create code agent with MCP tools if any are available
      if (Object.keys(mcpTools).length > 0) {
        return createCodeAgentWithMcpTools(context, model, mcpTools, mcpSummary);
      }
      
      return createCodeAgent(context, model);
    }
    default:
      throw new Error(`Unknown agent mode: ${mode}`);
  }
}

/**
 * Create an agent synchronously (without MCP tools)
 * Use this when you don't need MCP integration
 */
export function createAgentForModeSync(
  mode: AgentMode,
  context: AgentContext,
  model: string = 'anthropic/claude-opus-4-5'
): Agent {
  switch (mode) {
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
  return 'pm';
}
