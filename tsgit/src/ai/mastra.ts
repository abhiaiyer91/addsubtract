/**
 * Mastra Configuration for tsgit
 * 
 * Sets up the Mastra instance with the tsgit agent and tools.
 */

import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { tsgitAgent, createTsgitAgent } from './agent.js';
import { tsgitTools } from './tools/index.js';
import type { AIConfig } from './types.js';

let mastraInstance: Mastra | null = null;

/**
 * Create and configure a Mastra instance for tsgit
 */
export function createTsgitMastra(config: AIConfig = {}): Mastra {
  const model = config.model || process.env.TSGIT_AI_MODEL || 'openai/gpt-4o';
  
  const agent = createTsgitAgent(model);
  
  const mastra = new Mastra({
    agents: {
      tsgit: agent,
    },
    tools: tsgitTools,
    logger: config.verbose ? undefined : false,
  });
  
  mastraInstance = mastra;
  return mastra;
}

/**
 * Get the singleton Mastra instance, creating it if needed
 */
export function getTsgitMastra(config?: AIConfig): Mastra {
  if (!mastraInstance) {
    mastraInstance = createTsgitMastra(config);
  }
  return mastraInstance;
}

/**
 * Get the tsgit agent from the Mastra instance
 */
export function getTsgitAgent(config?: AIConfig): Agent {
  const mastra = getTsgitMastra(config);
  return mastra.getAgent('tsgit');
}

/**
 * Check if AI is available (model and API key configured)
 */
export function isAIAvailable(): boolean {
  // Check for common AI provider API keys
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasCustomModel = !!process.env.TSGIT_AI_MODEL;
  
  return hasOpenAI || hasAnthropic || hasCustomModel;
}

/**
 * Get information about the configured AI
 */
export function getAIInfo(): { available: boolean; model: string; provider: string } {
  const model = process.env.TSGIT_AI_MODEL || 'openai/gpt-4o';
  const [provider] = model.split('/');
  
  return {
    available: isAIAvailable(),
    model,
    provider,
  };
}
