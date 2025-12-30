/**
 * Sentinel Types
 * 
 * Type definitions for the Sentinel code scanning feature.
 */

import type { SentinelFindingSeverity, SentinelFindingCategory } from '../db/schema';

/**
 * A finding from an analyzer
 */
export interface AnalyzerFinding {
  /** Severity level */
  severity: SentinelFindingSeverity;
  /** Category of the issue */
  category: SentinelFindingCategory;
  /** Which analyzer found this */
  analyzer: string;
  /** Rule/check ID if applicable */
  ruleId?: string;
  /** File path */
  filePath: string;
  /** Start line */
  line?: number;
  /** End line */
  endLine?: number;
  /** Column */
  column?: number;
  /** Short title */
  title: string;
  /** Detailed message */
  message: string;
  /** Suggestion for fix */
  suggestion?: string;
  /** Code snippet */
  codeSnippet?: string;
  /** Suggested replacement code */
  suggestedFix?: string;
}

/**
 * Result from running an analyzer
 */
export interface AnalyzerResult {
  /** Analyzer name */
  analyzer: string;
  /** Whether the analyzer ran successfully */
  success: boolean;
  /** Findings from this analyzer */
  findings: AnalyzerFinding[];
  /** Number of files analyzed */
  filesAnalyzed: number;
  /** Error message if failed */
  error?: string;
  /** Time taken in ms */
  durationMs: number;
  /** Raw output for debugging */
  rawOutput?: unknown;
}

/**
 * Options for running a scan
 */
export interface ScanOptions {
  /** Repository path on disk */
  repoPath: string;
  /** Branch to scan */
  branch: string;
  /** Commit SHA to scan */
  commitSha: string;
  /** File patterns to exclude */
  excludePatterns?: string[];
  /** Custom prompt for AI analysis */
  customPrompt?: string;
  /** Which analyzers to run */
  analyzers?: {
    codeRabbit?: boolean;
    security?: boolean;
    codeQuality?: boolean;
    dependency?: boolean;
  };
}

/**
 * Result from running a full scan
 */
export interface ScanResult {
  /** Whether the scan completed successfully */
  success: boolean;
  /** All findings from all analyzers */
  findings: AnalyzerFinding[];
  /** Results by analyzer */
  analyzerResults: AnalyzerResult[];
  /** Total files scanned */
  filesScanned: number;
  /** Finding counts by severity */
  severityCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  /** Overall health score (0-100) */
  healthScore: number;
  /** Summary of findings */
  summary: string;
  /** Actionable recommendations for improvement */
  recommendations: string[];
  /** Error message if scan failed */
  error?: string;
  /** Total time taken in ms */
  durationMs: number;
}

/**
 * Analyzer interface - all analyzers must implement this
 */
export interface Analyzer {
  /** Unique name of the analyzer */
  name: string;
  /** Run the analyzer on a repository */
  analyze(options: ScanOptions): Promise<AnalyzerResult>;
}

/**
 * Generate a fingerprint for a finding (for deduplication)
 */
export function generateFindingFingerprint(finding: AnalyzerFinding): string {
  // Create a stable fingerprint based on key properties
  const parts = [
    finding.analyzer,
    finding.category,
    finding.filePath,
    finding.ruleId || '',
    finding.title,
    // Include a hash of the message to detect same issue type
    finding.message.slice(0, 100),
  ];
  
  // Simple hash of the parts
  let hash = 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return `${finding.analyzer}-${finding.filePath}-${Math.abs(hash).toString(16)}`;
}
