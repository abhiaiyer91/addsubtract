/**
 * Sentinel Analyzers
 * 
 * Exports all available code analyzers.
 */

export { SecurityAnalyzer } from './security';
export { CodeQualityAnalyzer } from './code-quality';
export { CodeRabbitAnalyzer } from './coderabbit';
export { DependencyAnalyzer } from './dependency';

import { SecurityAnalyzer } from './security';
import { CodeQualityAnalyzer } from './code-quality';
import { CodeRabbitAnalyzer } from './coderabbit';
import { DependencyAnalyzer } from './dependency';
import type { Analyzer } from '../types';

/**
 * Get all available analyzers
 */
export function getAllAnalyzers(): Analyzer[] {
  return [
    new SecurityAnalyzer(),
    new CodeQualityAnalyzer(),
    new CodeRabbitAnalyzer(),
    new DependencyAnalyzer(),
  ];
}

/**
 * Get analyzers by name
 */
export function getAnalyzers(names: string[]): Analyzer[] {
  const nameSet = new Set(names.map(n => n.toLowerCase()));
  return getAllAnalyzers().filter(a => nameSet.has(a.name.toLowerCase()));
}

/**
 * Get a specific analyzer by name
 */
export function getAnalyzer(name: string): Analyzer | undefined {
  const lower = name.toLowerCase();
  return getAllAnalyzers().find(a => a.name.toLowerCase() === lower);
}
