/**
 * Sentinel Scan Workflow
 * 
 * A multi-step AI workflow for comprehensive code scanning and analysis.
 * Uses Mastra workflow framework for structured execution.
 * 
 * Steps:
 * 1. Collect repository metadata and files
 * 2. Run static analyzers in parallel
 * 3. Run AI analysis on findings
 * 4. Aggregate and prioritize results
 * 5. Generate actionable recommendations
 */

import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

// =============================================================================
// Input/Output Schemas
// =============================================================================

export const SentinelWorkflowInputSchema = z.object({
  repoId: z.string().describe('Repository ID'),
  repoPath: z.string().describe('Path to repository on disk'),
  branch: z.string().describe('Branch being scanned'),
  commitSha: z.string().describe('Commit SHA'),
  triggeredById: z.string().optional().describe('User who triggered the scan'),
  customPrompt: z.string().optional().describe('Custom instructions for analysis'),
});

export type SentinelWorkflowInput = z.infer<typeof SentinelWorkflowInputSchema>;

export const SentinelWorkflowOutputSchema = z.object({
  success: z.boolean(),
  scanId: z.string().optional(),
  summary: z.string(),
  healthScore: z.number().min(0).max(100),
  findings: z.array(z.object({
    severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
    category: z.string(),
    file: z.string(),
    line: z.number().optional(),
    title: z.string(),
    message: z.string(),
    suggestion: z.string().optional(),
  })),
  recommendations: z.array(z.string()),
  error: z.string().optional(),
});

export type SentinelWorkflowOutput = z.infer<typeof SentinelWorkflowOutputSchema>;

// =============================================================================
// Step 1: Collect Repository Info
// =============================================================================

const collectRepoInfoStep = createStep({
  id: 'collect-repo-info',
  inputSchema: SentinelWorkflowInputSchema,
  outputSchema: z.object({
    repoId: z.string(),
    repoPath: z.string(),
    branch: z.string(),
    commitSha: z.string(),
    triggeredById: z.string().optional(),
    customPrompt: z.string().optional(),
    fileCount: z.number(),
    languages: z.array(z.string()),
    hasPackageJson: z.boolean(),
    hasTypeScript: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    const fs = await import('fs');
    const path = await import('path');
    
    // Count files and detect languages
    let fileCount = 0;
    const languageExtensions = new Map<string, number>();
    let hasPackageJson = false;
    let hasTypeScript = false;
    
    const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);
    
    const scan = async (dir: string) => {
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !skipDirs.has(entry.name)) {
            await scan(path.join(dir, entry.name));
          } else if (entry.isFile()) {
            fileCount++;
            const ext = path.extname(entry.name).toLowerCase();
            languageExtensions.set(ext, (languageExtensions.get(ext) || 0) + 1);
            
            if (entry.name === 'package.json') hasPackageJson = true;
            if (entry.name === 'tsconfig.json') hasTypeScript = true;
          }
        }
      } catch {
        // Skip inaccessible directories
      }
    };
    
    await scan(inputData.repoPath);
    
    // Determine top languages
    const languages = [...languageExtensions.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ext]) => ext);
    
    return {
      ...inputData,
      fileCount,
      languages,
      hasPackageJson,
      hasTypeScript,
    };
  },
});

// =============================================================================
// Step 2: Run Static Analysis
// =============================================================================

const runStaticAnalysisStep = createStep({
  id: 'run-static-analysis',
  inputSchema: z.object({
    repoId: z.string(),
    repoPath: z.string(),
    branch: z.string(),
    commitSha: z.string(),
    triggeredById: z.string().optional(),
    customPrompt: z.string().optional(),
    fileCount: z.number(),
    languages: z.array(z.string()),
    hasPackageJson: z.boolean(),
    hasTypeScript: z.boolean(),
  }),
  outputSchema: z.object({
    repoId: z.string(),
    repoPath: z.string(),
    branch: z.string(),
    commitSha: z.string(),
    customPrompt: z.string().optional(),
    fileCount: z.number(),
    findings: z.array(z.object({
      severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
      category: z.string(),
      analyzer: z.string(),
      file: z.string(),
      line: z.number().optional(),
      title: z.string(),
      message: z.string(),
      suggestion: z.string().optional(),
    })),
    analyzerStats: z.record(z.object({
      success: z.boolean(),
      filesAnalyzed: z.number(),
      findingsCount: z.number(),
      durationMs: z.number(),
    })),
  }),
  execute: async ({ inputData }) => {
    // Import scanner dynamically to avoid circular dependencies
    const { SecurityAnalyzer, CodeQualityAnalyzer, DependencyAnalyzer } = 
      await import('../../sentinel/analyzers/index.js');
    
    const analyzers = [
      new SecurityAnalyzer(),
      new CodeQualityAnalyzer(),
      new DependencyAnalyzer(),
    ];
    
    const scanOptions = {
      repoPath: inputData.repoPath,
      branch: inputData.branch,
      commitSha: inputData.commitSha,
      customPrompt: inputData.customPrompt,
    };
    
    // Run analyzers in parallel
    const results = await Promise.all(
      analyzers.map(async (analyzer) => {
        try {
          return await analyzer.analyze(scanOptions);
        } catch (error) {
          return {
            analyzer: analyzer.name,
            success: false,
            findings: [],
            filesAnalyzed: 0,
            durationMs: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );
    
    // Aggregate findings
    const findings = results.flatMap(r => 
      r.findings.map(f => ({
        severity: f.severity as 'critical' | 'high' | 'medium' | 'low' | 'info',
        category: f.category,
        analyzer: f.analyzer,
        file: f.filePath,
        line: f.line,
        title: f.title,
        message: f.message,
        suggestion: f.suggestion,
      }))
    );
    
    const analyzerStats: Record<string, {
      success: boolean;
      filesAnalyzed: number;
      findingsCount: number;
      durationMs: number;
    }> = {};
    
    for (const result of results) {
      analyzerStats[result.analyzer] = {
        success: result.success,
        filesAnalyzed: result.filesAnalyzed,
        findingsCount: result.findings.length,
        durationMs: result.durationMs,
      };
    }
    
    return {
      repoId: inputData.repoId,
      repoPath: inputData.repoPath,
      branch: inputData.branch,
      commitSha: inputData.commitSha,
      customPrompt: inputData.customPrompt,
      fileCount: inputData.fileCount,
      findings,
      analyzerStats,
    };
  },
});

// =============================================================================
// Step 3: Generate AI Recommendations
// =============================================================================

const generateRecommendationsStep = createStep({
  id: 'generate-recommendations',
  inputSchema: z.object({
    repoId: z.string(),
    repoPath: z.string(),
    branch: z.string(),
    commitSha: z.string(),
    customPrompt: z.string().optional(),
    fileCount: z.number(),
    findings: z.array(z.object({
      severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
      category: z.string(),
      analyzer: z.string(),
      file: z.string(),
      line: z.number().optional(),
      title: z.string(),
      message: z.string(),
      suggestion: z.string().optional(),
    })),
    analyzerStats: z.record(z.object({
      success: z.boolean(),
      filesAnalyzed: z.number(),
      findingsCount: z.number(),
      durationMs: z.number(),
    })),
  }),
  outputSchema: SentinelWorkflowOutputSchema,
  execute: async ({ inputData }) => {
    const { findings, fileCount } = inputData;
    
    // Count severities
    const severityCounts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    
    for (const finding of findings) {
      severityCounts[finding.severity]++;
    }
    
    // Calculate health score
    let penalty = 0;
    penalty += severityCounts.critical * 25;
    penalty += severityCounts.high * 15;
    penalty += severityCounts.medium * 5;
    penalty += severityCounts.low * 2;
    penalty += severityCounts.info * 0.5;
    
    const healthScore = Math.max(0, Math.round(100 - penalty));
    
    // Generate recommendations based on findings
    const recommendations: string[] = [];
    const categoryGroups = new Map<string, number>();
    
    for (const finding of findings) {
      categoryGroups.set(
        finding.category,
        (categoryGroups.get(finding.category) || 0) + 1
      );
    }
    
    // Top recommendation areas
    if (severityCounts.critical > 0) {
      recommendations.push(
        `Address ${severityCounts.critical} critical issue(s) immediately - these pose significant security or reliability risks.`
      );
    }
    
    if (severityCounts.high > 0) {
      recommendations.push(
        `Review and fix ${severityCounts.high} high-priority issue(s) in the next sprint.`
      );
    }
    
    if (categoryGroups.get('security') && (categoryGroups.get('security') ?? 0) > 0) {
      recommendations.push(
        'Consider implementing a security review process for code changes.'
      );
    }
    
    if (categoryGroups.get('maintainability') && (categoryGroups.get('maintainability') ?? 0) > 3) {
      recommendations.push(
        'Code complexity is high in several areas. Consider refactoring for better maintainability.'
      );
    }
    
    if (categoryGroups.get('dependency') && (categoryGroups.get('dependency') ?? 0) > 0) {
      recommendations.push(
        'Run `npm audit fix` to address known dependency vulnerabilities.'
      );
    }
    
    if (findings.length === 0) {
      recommendations.push(
        'Great job! No significant issues found. Continue following best practices.'
      );
    }
    
    // Generate summary
    let summary = '';
    const total = findings.length;
    
    if (total === 0) {
      summary = `Scanned ${fileCount} files - no issues found. Your code looks great!`;
    } else {
      const parts: string[] = [];
      if (severityCounts.critical > 0) parts.push(`${severityCounts.critical} critical`);
      if (severityCounts.high > 0) parts.push(`${severityCounts.high} high`);
      if (severityCounts.medium > 0) parts.push(`${severityCounts.medium} medium`);
      if (severityCounts.low > 0) parts.push(`${severityCounts.low} low`);
      if (severityCounts.info > 0) parts.push(`${severityCounts.info} info`);
      
      summary = `Scanned ${fileCount} files. Found ${total} issue(s): ${parts.join(', ')}.`;
      
      if (healthScore >= 80) {
        summary += ' Overall code health is good.';
      } else if (healthScore >= 60) {
        summary += ' Code health needs attention.';
      } else if (healthScore >= 40) {
        summary += ' Code health requires significant improvements.';
      } else {
        summary += ' Code health is critical and needs immediate attention.';
      }
    }
    
    return {
      success: true,
      summary,
      healthScore,
      findings: findings.map(f => ({
        severity: f.severity,
        category: f.category,
        file: f.file,
        line: f.line,
        title: f.title,
        message: f.message,
        suggestion: f.suggestion,
      })),
      recommendations,
    };
  },
});

// =============================================================================
// Workflow Definition
// =============================================================================

export const sentinelWorkflow = createWorkflow({
  id: 'sentinel-scan',
  inputSchema: SentinelWorkflowInputSchema,
  outputSchema: SentinelWorkflowOutputSchema,
})
  .then(collectRepoInfoStep)
  .then(runStaticAnalysisStep)
  .then(generateRecommendationsStep)
  .commit();
