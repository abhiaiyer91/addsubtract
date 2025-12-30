/**
 * Dependency Analyzer
 * 
 * Scans project dependencies for:
 * - Known vulnerabilities (via npm audit / basic checks)
 * - Outdated packages
 * - Deprecated packages
 * - Suspicious packages
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import type { Analyzer, AnalyzerResult, AnalyzerFinding, ScanOptions } from '../types';

interface NpmAuditVulnerability {
  name: string;
  severity: 'info' | 'low' | 'moderate' | 'high' | 'critical';
  isDirect: boolean;
  via: string[] | { name: string; severity: string; title: string; url: string }[];
  effects: string[];
  range: string;
  nodes: string[];
  fixAvailable: boolean | { name: string; version: string; isSemVerMajor: boolean };
}

interface NpmAuditResult {
  auditReportVersion: number;
  vulnerabilities: Record<string, NpmAuditVulnerability>;
  metadata: {
    vulnerabilities: {
      info: number;
      low: number;
      moderate: number;
      high: number;
      critical: number;
      total: number;
    };
    dependencies: {
      prod: number;
      dev: number;
      optional: number;
      peer: number;
      peerOptional: number;
      total: number;
    };
  };
}

/**
 * Suspicious package name patterns
 */
const SUSPICIOUS_PATTERNS = [
  /^[a-z]{2,3}-[a-z]{2,3}-[a-z]{2,3}$/i, // Random short segments
  /-[0-9]+$/, // Ends with numbers (possible typosquat)
  /lodash[^-]/i, // Typosquat attempts on lodash
  /react[^-]/i, // Typosquat attempts on react
  /express[^-]/i, // Typosquat attempts on express
];

/**
 * Known deprecated packages and their replacements
 */
const DEPRECATED_PACKAGES: Record<string, string> = {
  'request': 'Use node-fetch, axios, or got instead',
  'request-promise': 'Use node-fetch, axios, or got instead',
  'moment': 'Use date-fns, luxon, or dayjs instead',
  'left-pad': 'Use String.prototype.padStart() instead',
  'underscore': 'Consider using lodash or native methods',
  'node-uuid': 'Use uuid package instead',
  'colors': 'Use chalk or picocolors instead',
  'faker': 'Use @faker-js/faker instead',
  'node-sass': 'Use sass (dart-sass) instead',
  'tslint': 'Use eslint with @typescript-eslint instead',
};

export class DependencyAnalyzer implements Analyzer {
  name = 'dependency';

  async analyze(options: ScanOptions): Promise<AnalyzerResult> {
    const startTime = Date.now();
    const findings: AnalyzerFinding[] = [];
    let filesAnalyzed = 0;

    try {
      // Check for package.json
      const packageJsonPath = path.join(options.repoPath, 'package.json');
      
      if (!fs.existsSync(packageJsonPath)) {
        return {
          analyzer: this.name,
          success: true,
          findings: [],
          filesAnalyzed: 0,
          durationMs: Date.now() - startTime,
        };
      }

      filesAnalyzed = 1;

      // Read package.json
      const packageJson = JSON.parse(
        await fs.promises.readFile(packageJsonPath, 'utf-8')
      );

      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      // Check for deprecated packages
      for (const [pkg, replacement] of Object.entries(DEPRECATED_PACKAGES)) {
        if (dependencies[pkg]) {
          findings.push({
            severity: 'low',
            category: 'dependency',
            analyzer: this.name,
            ruleId: 'DEP001',
            filePath: 'package.json',
            title: 'Deprecated Package',
            message: `Package "${pkg}" is deprecated or has known issues`,
            suggestion: replacement,
          });
        }
      }

      // Check for suspicious package names
      for (const pkg of Object.keys(dependencies)) {
        for (const pattern of SUSPICIOUS_PATTERNS) {
          if (pattern.test(pkg)) {
            findings.push({
              severity: 'medium',
              category: 'security',
              analyzer: this.name,
              ruleId: 'DEP002',
              filePath: 'package.json',
              title: 'Suspicious Package Name',
              message: `Package "${pkg}" has a suspicious name pattern that may indicate typosquatting`,
              suggestion: 'Verify this package is legitimate and intentional',
            });
            break;
          }
        }
      }

      // Check for packages with specific version (no range)
      for (const [pkg, version] of Object.entries(dependencies)) {
        if (typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version)) {
          findings.push({
            severity: 'info',
            category: 'best_practice',
            analyzer: this.name,
            ruleId: 'DEP003',
            filePath: 'package.json',
            title: 'Pinned Version',
            message: `Package "${pkg}" is pinned to exact version ${version}`,
            suggestion: 'Consider using a caret (^) or tilde (~) range for automatic patch updates',
          });
        }
      }

      // Check for git dependencies
      for (const [pkg, version] of Object.entries(dependencies)) {
        if (typeof version === 'string' && (
          version.startsWith('git') ||
          version.startsWith('github:') ||
          version.includes('github.com')
        )) {
          findings.push({
            severity: 'low',
            category: 'reliability',
            analyzer: this.name,
            ruleId: 'DEP004',
            filePath: 'package.json',
            title: 'Git Dependency',
            message: `Package "${pkg}" is installed from git: ${version}`,
            suggestion: 'Consider using a published npm version for reliability',
          });
        }
      }

      // Try to run npm audit if npm is available
      try {
        const auditResult = await this.runNpmAudit(options.repoPath);
        if (auditResult) {
          this.processAuditResult(auditResult, findings);
        }
        } catch {
        // npm audit failed, continue with other checks
        findings.push({
          severity: 'info',
          category: 'dependency',
          analyzer: this.name,
          ruleId: 'DEP000',
          filePath: 'package.json',
          title: 'Audit Skipped',
          message: 'Could not run npm audit - ensure node_modules is installed',
          suggestion: 'Run npm install and npm audit manually',
        });
      }

      return {
        analyzer: this.name,
        success: true,
        findings,
        filesAnalyzed,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        analyzer: this.name,
        success: false,
        findings,
        filesAnalyzed,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async runNpmAudit(cwd: string): Promise<NpmAuditResult | null> {
    return new Promise((resolve) => {
      const proc = spawn('npm', ['audit', '--json'], {
        cwd,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (_data) => {
        // Ignore stderr
      });

      proc.on('close', () => {
        // npm audit exits with non-zero if vulnerabilities are found
        if (stdout) {
          try {
            resolve(JSON.parse(stdout));
          } catch {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      });

      proc.on('error', () => {
        resolve(null);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        proc.kill();
        resolve(null);
      }, 30000);
    });
  }

  private processAuditResult(audit: NpmAuditResult, findings: AnalyzerFinding[]): void {
    for (const [pkgName, vuln] of Object.entries(audit.vulnerabilities || {})) {
      const severity = this.mapNpmSeverity(vuln.severity);
      
      let message = `Package "${pkgName}" has a ${vuln.severity} severity vulnerability`;
      let suggestion = '';
      
      if (vuln.via && vuln.via.length > 0) {
        const firstVia = vuln.via[0];
        if (typeof firstVia === 'object' && firstVia.title) {
          message = `${firstVia.title} in "${pkgName}"`;
          if (firstVia.url) {
            suggestion = `See: ${firstVia.url}`;
          }
        }
      }
      
      if (vuln.fixAvailable) {
        if (typeof vuln.fixAvailable === 'object') {
          suggestion += ` Fix available: update to ${vuln.fixAvailable.name}@${vuln.fixAvailable.version}`;
          if (vuln.fixAvailable.isSemVerMajor) {
            suggestion += ' (breaking change)';
          }
        } else {
          suggestion += ' Run npm audit fix to resolve';
        }
      }

      findings.push({
        severity,
        category: 'security',
        analyzer: this.name,
        ruleId: 'DEP100',
        filePath: 'package.json',
        title: 'Vulnerable Dependency',
        message,
        suggestion: suggestion.trim(),
      });
    }
  }

  private mapNpmSeverity(npmSeverity: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    switch (npmSeverity) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'high';
      case 'moderate':
        return 'medium';
      case 'low':
        return 'low';
      default:
        return 'info';
    }
  }
}
