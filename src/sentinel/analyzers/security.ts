/**
 * Security Analyzer
 * 
 * Scans code for security vulnerabilities including:
 * - Hardcoded secrets and credentials
 * - SQL injection vulnerabilities
 * - XSS vulnerabilities
 * - Insecure functions (eval, etc.)
 * - Insecure cryptography
 * - Path traversal vulnerabilities
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Analyzer, AnalyzerResult, AnalyzerFinding, ScanOptions } from '../types';

interface SecurityPattern {
  id: string;
  name: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  message: string;
  suggestion: string;
  fileExtensions?: string[];
}

const SECURITY_PATTERNS: SecurityPattern[] = [
  // Hardcoded secrets
  {
    id: 'SEC001',
    name: 'Hardcoded Password',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{3,}['"]/gi,
    severity: 'critical',
    message: 'Possible hardcoded password detected',
    suggestion: 'Use environment variables or a secrets manager to store passwords',
  },
  {
    id: 'SEC002',
    name: 'Hardcoded API Key',
    pattern: /(?:api[_-]?key|apikey|api[_-]?secret)\s*[:=]\s*['"][^'"]{10,}['"]/gi,
    severity: 'critical',
    message: 'Possible hardcoded API key detected',
    suggestion: 'Store API keys in environment variables or a secrets manager',
  },
  {
    id: 'SEC003',
    name: 'Hardcoded Token',
    pattern: /(?:token|auth[_-]?token|access[_-]?token|bearer)\s*[:=]\s*['"][^'"]{10,}['"]/gi,
    severity: 'critical',
    message: 'Possible hardcoded authentication token detected',
    suggestion: 'Store tokens securely using environment variables or a vault',
  },
  {
    id: 'SEC004',
    name: 'AWS Access Key',
    pattern: /(?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16}/g,
    severity: 'critical',
    message: 'AWS Access Key ID detected',
    suggestion: 'Remove AWS credentials from code and use IAM roles or environment variables',
  },
  {
    id: 'SEC005',
    name: 'Private Key',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    severity: 'critical',
    message: 'Private key detected in code',
    suggestion: 'Remove private keys from source code and store them securely',
  },
  
  // Injection vulnerabilities
  {
    id: 'SEC010',
    name: 'SQL Injection',
    pattern: /(?:execute|query|run)\s*\(\s*[`'"]\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP).*\$\{/gi,
    severity: 'high',
    message: 'Possible SQL injection vulnerability - string interpolation in SQL query',
    suggestion: 'Use parameterized queries or prepared statements instead of string interpolation',
    fileExtensions: ['.ts', '.js', '.tsx', '.jsx'],
  },
  {
    id: 'SEC011',
    name: 'Command Injection',
    pattern: /(?:exec|spawn|execSync|spawnSync)\s*\([^)]*\$\{/g,
    severity: 'high',
    message: 'Possible command injection - user input in shell command',
    suggestion: 'Sanitize user input and use parameterized commands',
    fileExtensions: ['.ts', '.js', '.tsx', '.jsx'],
  },
  
  // XSS vulnerabilities
  {
    id: 'SEC020',
    name: 'innerHTML Assignment',
    pattern: /\.innerHTML\s*=\s*(?!['"`])/g,
    severity: 'medium',
    message: 'Direct innerHTML assignment may lead to XSS vulnerabilities',
    suggestion: 'Use textContent for text or sanitize HTML with a library like DOMPurify',
    fileExtensions: ['.ts', '.js', '.tsx', '.jsx'],
  },
  {
    id: 'SEC021',
    name: 'dangerouslySetInnerHTML',
    pattern: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html\s*:/g,
    severity: 'medium',
    message: 'dangerouslySetInnerHTML can lead to XSS vulnerabilities',
    suggestion: 'Ensure the HTML is properly sanitized before rendering',
    fileExtensions: ['.tsx', '.jsx'],
  },
  
  // Insecure functions
  {
    id: 'SEC030',
    name: 'eval Usage',
    pattern: /\beval\s*\(/g,
    severity: 'high',
    message: 'Usage of eval() is a security risk',
    suggestion: 'Avoid eval() - use safer alternatives like JSON.parse() or Function constructors',
    fileExtensions: ['.ts', '.js', '.tsx', '.jsx'],
  },
  {
    id: 'SEC031',
    name: 'Function Constructor',
    pattern: /new\s+Function\s*\([^)]*\)/g,
    severity: 'medium',
    message: 'Function constructor can be as dangerous as eval()',
    suggestion: 'Avoid dynamic code execution when possible',
    fileExtensions: ['.ts', '.js', '.tsx', '.jsx'],
  },
  
  // Insecure cryptography
  {
    id: 'SEC040',
    name: 'Weak Hash Algorithm',
    pattern: /(?:createHash|hash)\s*\(\s*['"](?:md5|sha1)['"]/gi,
    severity: 'medium',
    message: 'Weak hash algorithm (MD5/SHA1) should not be used for security',
    suggestion: 'Use SHA-256 or stronger for security-sensitive hashing',
    fileExtensions: ['.ts', '.js', '.tsx', '.jsx'],
  },
  {
    id: 'SEC041',
    name: 'Hardcoded IV/Salt',
    pattern: /(?:iv|salt)\s*[:=]\s*(?:Buffer\.from\s*\(\s*)?['"][^'"]+['"]/gi,
    severity: 'medium',
    message: 'Hardcoded initialization vector or salt detected',
    suggestion: 'Generate random IVs and salts for each encryption operation',
    fileExtensions: ['.ts', '.js', '.tsx', '.jsx'],
  },
  
  // Network security
  {
    id: 'SEC050',
    name: 'HTTP Without TLS',
    pattern: /['"]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/g,
    severity: 'low',
    message: 'HTTP URL without TLS encryption detected',
    suggestion: 'Use HTTPS for secure communication',
  },
  {
    id: 'SEC051',
    name: 'Disabled SSL Verification',
    pattern: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/g,
    severity: 'high',
    message: 'SSL/TLS certificate verification is disabled',
    suggestion: 'Enable certificate verification to prevent man-in-the-middle attacks',
    fileExtensions: ['.ts', '.js', '.tsx', '.jsx'],
  },
  
  // Path traversal
  {
    id: 'SEC060',
    name: 'Path Traversal',
    pattern: /(?:readFile|writeFile|unlink|rmdir|mkdir)\s*\([^)]*(?:\+|concat|join)\s*[^)]*(?:req\.|params\.|query\.)/g,
    severity: 'high',
    message: 'Possible path traversal vulnerability - user input in file path',
    suggestion: 'Validate and sanitize file paths, use path.resolve() and check against allowed directories',
    fileExtensions: ['.ts', '.js', '.tsx', '.jsx'],
  },
];

// File extensions to scan
const SCANNABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.java', '.kt', '.scala',
  '.php', '.cs', '.rs', '.swift', '.m', '.mm',
  '.c', '.cpp', '.h', '.hpp',
  '.sh', '.bash', '.zsh',
  '.yaml', '.yml', '.json', '.xml', '.toml',
  '.env', '.env.local', '.env.development', '.env.production',
]);

// Directories to skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next',
  'coverage', '.nyc_output', 'vendor', '__pycache__',
  '.venv', 'venv', 'env', '.tox',
]);

export class SecurityAnalyzer implements Analyzer {
  name = 'security';

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
        
        try {
          const content = await fs.promises.readFile(filePath, 'utf-8');
          const lines = content.split('\n');
          
          for (const pattern of SECURITY_PATTERNS) {
            // Skip if pattern doesn't apply to this file extension
            if (pattern.fileExtensions && !pattern.fileExtensions.includes(ext)) {
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
                category: 'security',
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
            if (SCANNABLE_EXTENSIONS.has(ext) || entry.name.startsWith('.env')) {
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
