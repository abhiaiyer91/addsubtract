/**
 * AI Integration for tsgit using @mastra/core
 * 
 * This module provides AI-powered features for tsgit including:
 * - Intelligent commit message generation
 * - AI-assisted merge conflict resolution
 * - Natural language git commands
 * - Code review and analysis
 */

export { createTsgitMastra, getTsgitAgent } from './mastra.js';
export { tsgitTools } from './tools/index.js';
export { tsgitAgent } from './agent.js';
export type { AIConfig, CommitMessageOptions, ConflictResolutionOptions } from './types.js';
