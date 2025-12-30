/**
 * Sentinel - Code Scanning Feature
 * 
 * A proactive code scanning system that analyzes repositories for:
 * - Security vulnerabilities
 * - Code quality issues
 * - Performance problems
 * - Dependency vulnerabilities
 * - Best practices violations
 * 
 * Integrates with CodeRabbit for AI-powered analysis.
 * 
 * @example
 * ```typescript
 * import { runScan, getRepoScanStatus } from './sentinel';
 * 
 * // Run a scan
 * const { scanId, result } = await runScan({
 *   repoId: 'repo-uuid',
 *   repoPath: '/path/to/repo',
 *   branch: 'main',
 *   commitSha: 'abc123',
 *   triggeredById: 'user-uuid',
 * });
 * 
 * // Check status
 * const status = await getRepoScanStatus('repo-uuid');
 * console.log(`Health score: ${status.lastScan?.healthScore}`);
 * ```
 */

// Core scanner
export { runScan, getRepoScanStatus, type ScannerOptions } from './scanner';

// Types
export {
  type Analyzer,
  type AnalyzerResult,
  type AnalyzerFinding,
  type ScanOptions,
  type ScanResult,
  generateFindingFingerprint,
} from './types';

// Analyzers
export {
  SecurityAnalyzer,
  CodeQualityAnalyzer,
  CodeRabbitAnalyzer,
  DependencyAnalyzer,
  getAllAnalyzers,
  getAnalyzers,
  getAnalyzer,
} from './analyzers';

// Re-export models for convenience
export {
  sentinelConfigModel,
  sentinelScanModel,
  sentinelFindingModel,
} from '../db/models/sentinel';
