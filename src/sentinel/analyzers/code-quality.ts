/**
 * Code Quality Analyzer
 * 
 * Scans code for quality issues including:
 * - Code complexity
 * - Dead code / unused variables
 * - Empty catch blocks
 * - Console statements in production code
 * - Any type usage in TypeScript
 * - TODO/FIXME comments
 * - Magic numbers
 * - Long functions/files
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Analyzer, AnalyzerResult, AnalyzerFinding, ScanOptions } from '../types';

interface QualityPattern {
  id: string;
  name: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'maintainability' | 'reliability' | 'code_style' | 'best_practice';
  message: string;
  suggestion: string;
  fileExtensions?: string[];
  excludeInTests?: boolean;
}

const QUALITY_PATTERNS: QualityPattern[] = [
  // Console statements
  {
    id: 'QUA001',
    name: 'Console Statement',
    pattern: /console\.(log|debug|info|warn|error|trace)\s*\(/g,
    severity: 'info',
    category: 'code_style',
    message: 'Console statement found in code',
    suggestion: 'Use a proper logging library or remove debug statements before production',
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx'],
    excludeInTests: true,
  },
  
  // Empty catch blocks
  {
    id: 'QUA002',
    name: 'Empty Catch Block',
    pattern: /catch\s*\([^)]*\)\s*\{\s*\}/g,
    severity: 'medium',
    category: 'reliability',
    message: 'Empty catch block - errors are being silently swallowed',
    suggestion: 'Log the error or handle it appropriately',
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  
  // TypeScript any type
  {
    id: 'QUA003',
    name: 'Any Type Usage',
    pattern: /:\s*any\b/g,
    severity: 'info',
    category: 'maintainability',
    message: 'Usage of "any" type reduces type safety',
    suggestion: 'Consider using a more specific type or "unknown"',
    fileExtensions: ['.ts', '.tsx'],
  },
  
  // TODO/FIXME comments
  {
    id: 'QUA004',
    name: 'TODO Comment',
    pattern: /\/\/\s*(TODO|FIXME|XXX|HACK|BUG)[\s:]/gi,
    severity: 'info',
    category: 'maintainability',
    message: 'TODO/FIXME comment found - ensure this is tracked',
    suggestion: 'Create an issue to track this work item',
  },
  
  // Disabled ESLint rules
  {
    id: 'QUA005',
    name: 'Disabled Linting',
    pattern: /\/[/*]\s*eslint-disable(?!-next-line)/g,
    severity: 'low',
    category: 'code_style',
    message: 'ESLint rules disabled for this file',
    suggestion: 'Consider fixing the underlying issues instead of disabling rules',
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  
  // TypeScript ignore directive usage
  {
    id: 'QUA006',
    name: 'TypeScript Ignore',
    pattern: /@ts-ignore|@ts-nocheck/g,
    severity: 'low',
    category: 'maintainability',
    message: 'TypeScript type checking is suppressed',
    suggestion: 'Fix the type error instead of ignoring it',
    fileExtensions: ['.ts', '.tsx'],
  },
  
  // Non-null assertion
  {
    id: 'QUA007',
    name: 'Non-null Assertion',
    pattern: /!\s*[.;)]/g,
    severity: 'info',
    category: 'reliability',
    message: 'Non-null assertion operator (!) may hide potential null errors',
    suggestion: 'Add proper null checks or use optional chaining',
    fileExtensions: ['.ts', '.tsx'],
  },
  
  // Async without await
  {
    id: 'QUA008',
    name: 'Floating Promise',
    pattern: /(?<!await\s+)(?:fetch|axios|got|request)\s*\([^)]*\)\s*[;,\n]/g,
    severity: 'medium',
    category: 'reliability',
    message: 'Promise may not be awaited',
    suggestion: 'Ensure the promise is properly awaited or handled',
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  
  // Hardcoded URLs (non-localhost)
  {
    id: 'QUA009',
    name: 'Hardcoded URL',
    pattern: /['"]https?:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)[^'"]+['"]/g,
    severity: 'info',
    category: 'best_practice',
    message: 'Hardcoded URL found - consider using environment variables',
    suggestion: 'Use environment variables for configurable URLs',
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx'],
    excludeInTests: true,
  },
  
  // Magic numbers (excluding common ones)
  {
    id: 'QUA010',
    name: 'Magic Number',
    pattern: /(?<![a-zA-Z0-9_'".[])\b(?!(?:0|1|2|10|100|1000|60|24|365|404|500|200|201|204|301|302|400|401|403)\b)([3-9]\d{2,}|\d{4,})\b(?![a-zA-Z0-9_'"])/g,
    severity: 'info',
    category: 'maintainability',
    message: 'Magic number found - consider extracting to a named constant',
    suggestion: 'Extract magic numbers into well-named constants',
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx'],
    excludeInTests: true,
  },
  
  // Unused imports (basic check)
  {
    id: 'QUA011',
    name: 'Possible Unused Import',
    pattern: /import\s+\{\s*[A-Z][a-zA-Z]*\s*\}\s+from/g,
    severity: 'info',
    category: 'code_style',
    message: 'Single named import - verify it is being used',
    suggestion: 'Remove unused imports to reduce bundle size',
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  
  // Nested callbacks (callback hell)
  {
    id: 'QUA012',
    name: 'Nested Callbacks',
    pattern: /\.then\s*\([^)]*\.then\s*\([^)]*\.then/g,
    severity: 'medium',
    category: 'maintainability',
    message: 'Deeply nested promise chains detected',
    suggestion: 'Use async/await for cleaner asynchronous code',
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
];

// File extensions to scan
const SCANNABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.java', '.kt',
]);

// Directories to skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next',
  'coverage', '.nyc_output', 'vendor', '__pycache__',
  '.venv', 'venv', 'env', '.tox',
]);

// Maximum file size to scan (1MB)
const MAX_FILE_SIZE = 1024 * 1024;

// Thresholds for file-level checks
const MAX_FILE_LINES = 500;
const MAX_FUNCTION_LINES = 100;

export class CodeQualityAnalyzer implements Analyzer {
  name = 'code-quality';

  async analyze(options: ScanOptions): Promise<AnalyzerResult> {
    const startTime = Date.now();
    const findings: AnalyzerFinding[] = [];
    let filesAnalyzed = 0;

    try {
      const files = await this.getFilesToScan(options.repoPath, options.excludePatterns);
      filesAnalyzed = files.length;

      for (const filePath of files) {
        const relativePath = path.relative(options.repoPath, filePath);
        const ext = path.extname(filePath).toLowerCase();
        const isTestFile = this.isTestFile(relativePath);
        
        try {
          const stats = await fs.promises.stat(filePath);
          if (stats.size > MAX_FILE_SIZE) continue;
          
          const content = await fs.promises.readFile(filePath, 'utf-8');
          const lines = content.split('\n');
          
          // File length check
          if (lines.length > MAX_FILE_LINES && !isTestFile) {
            findings.push({
              severity: 'info',
              category: 'maintainability',
              analyzer: this.name,
              ruleId: 'QUA100',
              filePath: relativePath,
              line: 1,
              title: 'Long File',
              message: `File has ${lines.length} lines, which may be hard to maintain`,
              suggestion: `Consider splitting this file into smaller modules (max recommended: ${MAX_FILE_LINES} lines)`,
            });
          }
          
          // Pattern-based checks
          for (const pattern of QUALITY_PATTERNS) {
            // Skip if pattern doesn't apply to this file extension
            if (pattern.fileExtensions && !pattern.fileExtensions.includes(ext)) {
              continue;
            }
            
            // Skip certain patterns in test files
            if (pattern.excludeInTests && isTestFile) {
              continue;
            }
            
            // Reset regex lastIndex
            pattern.pattern.lastIndex = 0;
            
            let match;
            while ((match = pattern.pattern.exec(content)) !== null) {
              // Find line number
              const beforeMatch = content.slice(0, match.index);
              const lineNumber = beforeMatch.split('\n').length;
              const lineContent = lines[lineNumber - 1] || '';
              
              findings.push({
                severity: pattern.severity,
                category: pattern.category,
                analyzer: this.name,
                ruleId: pattern.id,
                filePath: relativePath,
                line: lineNumber,
                title: pattern.name,
                message: pattern.message,
                suggestion: pattern.suggestion,
                codeSnippet: lineContent.trim().slice(0, 200),
              });
            }
          }
          
          // Check for long functions (basic heuristic)
          this.checkLongFunctions(content, relativePath, findings, ext);
          
        } catch {
          // Skip files that can't be read
          continue;
        }
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

  private isTestFile(filePath: string): boolean {
    const lower = filePath.toLowerCase();
    return (
      lower.includes('test') ||
      lower.includes('spec') ||
      lower.includes('__tests__') ||
      lower.includes('__mocks__') ||
      lower.endsWith('.test.ts') ||
      lower.endsWith('.test.tsx') ||
      lower.endsWith('.test.js') ||
      lower.endsWith('.spec.ts') ||
      lower.endsWith('.spec.tsx') ||
      lower.endsWith('.spec.js')
    );
  }

  private checkLongFunctions(
    content: string,
    filePath: string,
    findings: AnalyzerFinding[],
    ext: string
  ): void {
    if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) return;
    
    // Simple heuristic: look for function declarations and count lines until matching brace
    const functionPatterns = [
      /(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/g,
      /(?:async\s+)?(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>\s*\{/g,
      /(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g, // Method in class
    ];
    
    const lines = content.split('\n');
    
    for (const pattern of functionPatterns) {
      pattern.lastIndex = 0;
      let match;
      
      while ((match = pattern.exec(content)) !== null) {
        const funcName = match[1] || 'anonymous';
        const startIndex = match.index;
        const beforeMatch = content.slice(0, startIndex);
        const startLine = beforeMatch.split('\n').length;
        
        // Count lines in function (simple brace counting)
        let braceCount = 0;
        let started = false;
        let funcLines = 0;
        
        for (let i = startLine - 1; i < lines.length && funcLines < MAX_FUNCTION_LINES + 50; i++) {
          const line = lines[i];
          funcLines++;
          
          for (const char of line) {
            if (char === '{') {
              braceCount++;
              started = true;
            } else if (char === '}') {
              braceCount--;
            }
          }
          
          if (started && braceCount === 0) break;
        }
        
        if (funcLines > MAX_FUNCTION_LINES) {
          findings.push({
            severity: 'low',
            category: 'maintainability',
            analyzer: this.name,
            ruleId: 'QUA101',
            filePath,
            line: startLine,
            title: 'Long Function',
            message: `Function "${funcName}" is approximately ${funcLines} lines long`,
            suggestion: `Consider breaking this function into smaller, more focused functions (max recommended: ${MAX_FUNCTION_LINES} lines)`,
          });
        }
      }
    }
  }

  private async getFilesToScan(
    dirPath: string,
    excludePatterns: string[] = []
  ): Promise<string[]> {
    const files: string[] = [];
    
    const scan = async (dir: string) => {
      try {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(dirPath, fullPath);
          
          // Skip excluded patterns
          if (excludePatterns.some(pattern => {
            if (pattern.includes('*')) {
              const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
              return regex.test(relativePath);
            }
            return relativePath.includes(pattern);
          })) {
            continue;
          }
          
          if (entry.isDirectory()) {
            if (!SKIP_DIRS.has(entry.name)) {
              await scan(fullPath);
            }
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (SCANNABLE_EXTENSIONS.has(ext)) {
              files.push(fullPath);
            }
          }
        }
        } catch {
          // Skip directories that can't be read
        }
    };
    
    await scan(dirPath);
    return files;
  }
}
