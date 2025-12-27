/**
 * Mastra Configuration for wit
 * 
 * Sets up the Mastra instance with the wit agent, tools, and memory.
 * Uses LibSQL for persistent storage of conversation history.
 */

import * as path from 'path';
import * as os from 'os';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { witAgent, createTsgitAgent } from './agent.js';
import { witTools } from './tools/index.js';
import type { AIConfig } from './types.js';

let mastraInstance: Mastra | null = null;
let memoryInstance: Memory | null = null;
let storageInstance: LibSQLStore | null = null;

/**
 * Get the path to the wit data directory
 */
function getWitDataDir(): string {
  const witDir = process.env.WIT_DATA_DIR || path.join(os.homedir(), '.wit');
  return witDir;
}

/**
 * Get or create the LibSQL storage instance
 */
export function getStorage(): LibSQLStore {
  if (!storageInstance) {
    const dbPath = path.join(getWitDataDir(), 'agent.db');
    storageInstance = new LibSQLStore({
      id: 'wit-agent-storage',
      url: `file:${dbPath}`,
    });
  }
  return storageInstance;
}

/**
 * Get or create the Memory instance for conversation history
 */
export function getMemory(): Memory {
  if (!memoryInstance) {
    const storage = getStorage();
    memoryInstance = new Memory({
      storage,
    });
  }
  return memoryInstance;
}

/**
 * Create and configure a Mastra instance for wit
 */
export function createTsgitMastra(config: AIConfig = {}): Mastra {
  const model = config.model || process.env.WIT_AI_MODEL || 'openai/gpt-4o';
  
  const agent = createTsgitAgent(model);
  const memory = getMemory();
  const storage = getStorage();
  
  const mastra = new Mastra({
    agents: {
      wit: agent,
    },
    tools: witTools,
    memory: {
      wit: memory,
    },
    storage,
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
 * Get the wit agent from the Mastra instance
 */
export function getTsgitAgent(config?: AIConfig): Agent {
  const mastra = getTsgitMastra(config);
  return mastra.getAgent('wit');
}

/**
 * Check if AI is available (model and API key configured)
 */
export function isAIAvailable(): boolean {
  // Check for common AI provider API keys
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasCustomModel = !!process.env.WIT_AI_MODEL;
  
  return hasOpenAI || hasAnthropic || hasCustomModel;
}

/**
 * Get information about the configured AI
 */
export function getAIInfo(): { available: boolean; model: string; provider: string } {
  const model = process.env.WIT_AI_MODEL || 'openai/gpt-4o';
  const [provider] = model.split('/');
  
  return {
    available: isAIAvailable(),
    model,
    provider,
  };
}
