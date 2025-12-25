/**
 * AI Integration for wit using @mastra/core
 * 
 * This module provides AI-powered features for wit including:
 * - Intelligent commit message generation
 * - AI-assisted merge conflict resolution
 * - Natural language git commands
 * - Code review and analysis
 */

export { createTsgitMastra, getTsgitAgent } from './mastra.js';
export { witTools } from './tools/index.js';
export { witAgent } from './agent.js';
export type { AIConfig, CommitMessageOptions, ConflictResolutionOptions } from './types.js';
