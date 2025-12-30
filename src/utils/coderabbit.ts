/**
 * CodeRabbit CLI Integration for wit
 *
 * Provides integration with CodeRabbit CLI for AI-powered code reviews on pull requests.
 *
 * CodeRabbit is an AI code reviewer that provides:
 * - High-quality code reviews for PRs
 * - Security and bug detection
 * - Code quality suggestions
 * - Best practices recommendations
 *
 * Installation:
 *   curl -fsSL https://cli.coderabbit.ai/install.sh | sh
 *
 * Authentication:
 *   Run: coderabbit auth login
 *   Or set CODERABBIT_API_KEY environment variable
 */

import { spawn, SpawnOptions } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { colors } from './colors';

// ============================================================================
// Types
// ============================================================================

export interface CodeRabbitConfig {
  /** API key for CodeRabbit (from environment or config) */
  apiKey?: string;
  /** Path to coderabbit executable */
  cliPath?: string;
  /** Output in plain text format (non-interactive) */
  plain?: boolean;
  /** Show only AI agent prompts (implies plain) */
  promptOnly?: boolean;
  /** Working directory path */
  cwd?: string;
  /** Base branch for comparison */
  baseBranch?: string;
  /** Base commit for comparison */
  baseCommit?: string;
}

export interface CodeRabbitReviewResult {
  success: boolean;
  summary?: string;
  issues: CodeRabbitIssue[];
  suggestions: CodeRabbitSuggestion[];
  stats?: CodeRabbitStats;
  rawOutput?: string;
  error?: string;
}

export interface CodeRabbitIssue {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  file: string;
  line?: number;
  endLine?: number;
  message: string;
  category: string;
  suggestion?: string;
}

export interface CodeRabbitSuggestion {
  file: string;
  line?: number;
  message: string;
  code?: string;
}

export interface CodeRabbitStats {
  filesReviewed: number;
  issuesFound: number;
  suggestionsCount: number;
  linesAnalyzed?: number;
}

export interface CodeRabbitStatus {
  installed: boolean;
  version?: string;
  apiKeyConfigured: boolean;
  cliPath?: string;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Get CodeRabbit API key from various sources
 */
export function getCodeRabbitApiKey(): string | undefined {
  // Environment variable (primary)
  if (process.env.CODERABBIT_API_KEY) {
    return process.env.CODERABBIT_API_KEY;
  }

  // Check wit config file
  const configPath = path.join(os.homedir(), '.config', 'wit', 'coderabbit.json');
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.apiKey) {
        return config.apiKey;
      }
    } catch {
      // Ignore parsing errors
    }
  }

  // Check coderabbit's own config
  const crConfigPath = path.join(os.homedir(), '.coderabbit', 'config.json');
  if (fs.existsSync(crConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(crConfigPath, 'utf-8'));
      if (config.api_key || config.apiKey) {
        return config.api_key || config.apiKey;
      }
    } catch {
      // Ignore parsing errors
    }
  }

  return undefined;
}

/**
 * Save CodeRabbit API key to wit config
 */
export function saveCodeRabbitApiKey(apiKey: string): void {
  const configDir = path.join(os.homedir(), '.config', 'wit');
  const configPath = path.join(configDir, 'coderabbit.json');

  // Ensure directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Load existing config or create new
  let config: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      // Start fresh
    }
  }

  config.apiKey = apiKey;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// ============================================================================
// CLI Detection
// ============================================================================

/**
 * Find the CodeRabbit CLI executable
 */
export async function findCodeRabbitCli(): Promise<string | null> {
  const possiblePaths = [
    'coderabbit',
    'cr',
    // Official CLI installation paths (curl -fsSL https://cli.coderabbit.ai/install.sh | sh)
    path.join(os.homedir(), '.local', 'bin', 'coderabbit'),
    '/usr/local/bin/coderabbit',
    '/root/.local/bin/coderabbit', // Docker root user
  ];

  for (const cmdPath of possiblePaths) {
    try {
      const result = await runCommand(cmdPath, ['--version']);
      if (result.exitCode === 0) {
        return cmdPath;
      }
    } catch {
      // Try next path
    }
  }

  return null;
}

/**
 * Check CodeRabbit installation status
 */
export async function getCodeRabbitStatus(): Promise<CodeRabbitStatus> {
  const cliPath = await findCodeRabbitCli();
  const apiKey = getCodeRabbitApiKey();

  if (!cliPath) {
    return {
      installed: false,
      apiKeyConfigured: !!apiKey,
    };
  }

  // Get version
  let version: string | undefined;
  try {
    const result = await runCommand(cliPath, ['--version']);
    if (result.exitCode === 0) {
      version = result.stdout.trim();
    }
  } catch {
    // Ignore
  }

  return {
    installed: true,
    version,
    apiKeyConfigured: !!apiKey,
    cliPath,
  };
}

// ============================================================================
// Review Commands
// ============================================================================

/**
 * Review a pull request using CodeRabbit CLI
 * @deprecated The CodeRabbit CLI doesn't support GitHub PR URLs directly. Use reviewRepo() with baseCommit instead.
 */
export async function reviewPullRequest(
  _owner: string,
  _repo: string,
  _prNumber: number,
  config: CodeRabbitConfig = {}
): Promise<CodeRabbitReviewResult> {
  // The CLI doesn't support --pr flag or GitHub PR URLs
  // Use reviewRepo() with the repo path and baseCommit instead
  if (config.cwd && config.baseCommit) {
    return reviewRepo(config.cwd, config);
  }
  
  return {
    success: false,
    issues: [],
    suggestions: [],
    error: 'CodeRabbit CLI does not support GitHub PR URLs. Use reviewRepo() with a local repo path and baseCommit.',
  };
}

/**
 * Review changes in a git repository using CodeRabbit CLI
 * 
 * The CLI works directly on git repos with options:
 *   --plain           Output in plain text format (non-interactive)
 *   --prompt-only     Show only AI agent prompts (implies --plain)
 *   --base <branch>   Base branch for comparison
 *   --base-commit <commit>  Base commit for comparison
 *   --cwd <path>      Working directory path
 */
export async function reviewRepo(
  repoPath: string,
  config: CodeRabbitConfig = {}
): Promise<CodeRabbitReviewResult> {
  const status = await getCodeRabbitStatus();

  if (!status.installed) {
    return {
      success: false,
      issues: [],
      suggestions: [],
      error:
        'CodeRabbit CLI is not installed. Install with: curl -fsSL https://cli.coderabbit.ai/install.sh | sh',
    };
  }

  const apiKey = config.apiKey || getCodeRabbitApiKey();
  if (!apiKey) {
    return {
      success: false,
      issues: [],
      suggestions: [],
      error:
        'CodeRabbit API key not configured. Set CODERABBIT_API_KEY environment variable or run: coderabbit auth login',
    };
  }

  const cliPath = config.cliPath || status.cliPath!;
  const args = ['review', '--plain']; // Always use plain for programmatic parsing

  if (config.baseCommit) {
    args.push('--base-commit', config.baseCommit);
  } else if (config.baseBranch) {
    args.push('--base', config.baseBranch);
  }

  if (config.cwd || repoPath) {
    args.push('--cwd', config.cwd || repoPath);
  }

  try {
    const env = { ...process.env, CODERABBIT_API_KEY: apiKey };
    const result = await runCommand(cliPath, args, { env });

    if (result.exitCode !== 0) {
      return {
        success: false,
        issues: [],
        suggestions: [],
        rawOutput: result.stderr || result.stdout,
        error: `CodeRabbit review failed: ${result.stderr || 'Unknown error'}`,
      };
    }

    return parseTextReviewOutput(result.stdout);
  } catch (error) {
    return {
      success: false,
      issues: [],
      suggestions: [],
      error: `Failed to run CodeRabbit: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Review local changes (diff) using CodeRabbit CLI
 * @deprecated Use reviewRepo instead - CLI works on git repos directly
 */
export async function reviewDiff(
  _diffContent: string,
  config: CodeRabbitConfig = {}
): Promise<CodeRabbitReviewResult> {
  // The CodeRabbit CLI doesn't support direct diff file input
  // It works on git repositories directly
  // If cwd is provided, use reviewRepo, otherwise return error
  if (config.cwd) {
    return reviewRepo(config.cwd, config);
  }
  
  return {
    success: false,
    issues: [],
    suggestions: [],
    error: 'CodeRabbit CLI requires a git repository path. Use reviewRepo() instead or provide cwd in config.',
  };
}

/**
 * Review specific files using CodeRabbit CLI
 * @deprecated The CodeRabbit CLI doesn't support file-specific reviews. Use reviewRepo() instead.
 */
export async function reviewFiles(
  _files: string[],
  baseBranch: string = 'main',
  config: CodeRabbitConfig = {}
): Promise<CodeRabbitReviewResult> {
  // The CLI doesn't support --files flag, review the whole repo with base branch
  if (config.cwd) {
    return reviewRepo(config.cwd, { ...config, baseBranch });
  }
  
  return {
    success: false,
    issues: [],
    suggestions: [],
    error: 'CodeRabbit CLI requires a git repository path. Use reviewRepo() instead.',
  };
}

// ============================================================================
// Output Parsing
// ============================================================================

/**
 * Parse JSON output from CodeRabbit CLI
 */
function parseJsonReviewOutput(output: string): CodeRabbitReviewResult {
  try {
    const data = JSON.parse(output);

    return {
      success: true,
      summary: data.summary || data.message,
      issues: (data.issues || data.findings || []).map(
        (issue: Record<string, unknown>) => ({
          severity: mapSeverity(issue.severity as string),
          file: issue.file || issue.path || 'unknown',
          line: issue.line || issue.start_line,
          endLine: issue.end_line,
          message: issue.message || issue.description || '',
          category: issue.category || issue.type || 'general',
          suggestion: issue.suggestion || issue.fix,
        })
      ),
      suggestions: (data.suggestions || []).map((sug: Record<string, unknown>) => ({
        file: sug.file || sug.path || 'unknown',
        line: sug.line,
        message: sug.message || sug.description || '',
        code: sug.code || sug.replacement,
      })),
      stats: data.stats
        ? {
            filesReviewed: data.stats.files_reviewed || data.stats.filesReviewed || 0,
            issuesFound: data.stats.issues_found || data.stats.issuesFound || 0,
            suggestionsCount:
              data.stats.suggestions_count || data.stats.suggestionsCount || 0,
            linesAnalyzed: data.stats.lines_analyzed || data.stats.linesAnalyzed,
          }
        : undefined,
      rawOutput: output,
    };
  } catch {
    // If JSON parsing fails, try to extract what we can
    return {
      success: true,
      summary: output,
      issues: [],
      suggestions: [],
      rawOutput: output,
    };
  }
}

/**
 * Parse text output from CodeRabbit CLI
 */
function parseTextReviewOutput(output: string): CodeRabbitReviewResult {
  const issues: CodeRabbitIssue[] = [];
  const suggestions: CodeRabbitSuggestion[] = [];
  let summary = '';

  const lines = output.split('\n');
  let currentSection = '';
  const summaryLines: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Detect section headers
    if (
      trimmedLine.startsWith('##') ||
      trimmedLine.startsWith('===') ||
      trimmedLine.startsWith('---')
    ) {
      if (trimmedLine.toLowerCase().includes('summary')) {
        currentSection = 'summary';
      } else if (
        trimmedLine.toLowerCase().includes('issue') ||
        trimmedLine.toLowerCase().includes('finding')
      ) {
        currentSection = 'issues';
      } else if (trimmedLine.toLowerCase().includes('suggestion')) {
        currentSection = 'suggestions';
      }
      continue;
    }

    // Parse based on section
    if (currentSection === 'summary' && trimmedLine) {
      summaryLines.push(trimmedLine);
    }

    // Parse issue patterns like "⚠️ [HIGH] file.ts:42 - Message"
    // Match optional emoji prefix followed by severity in brackets
    const issueMatch = line.match(
      // eslint-disable-next-line no-misleading-character-class
      /[⚠️🔴🟡🟢ℹ️❌✗✕]?\s*\[(CRITICAL|HIGH|MEDIUM|LOW|INFO|WARNING|ERROR)\]\s*([^:]+):?(\d+)?\s*[-:]\s*(.+)/i
    );
    if (issueMatch) {
      issues.push({
        severity: mapSeverity(issueMatch[1]),
        file: issueMatch[2].trim(),
        line: issueMatch[3] ? parseInt(issueMatch[3], 10) : undefined,
        message: issueMatch[4].trim(),
        category: 'general',
      });
      continue;
    }

    // Parse file:line patterns for suggestions
    const suggestionMatch = line.match(/^\s*[-•*]\s*([^:]+):(\d+):\s*(.+)/);
    if (suggestionMatch && currentSection === 'suggestions') {
      suggestions.push({
        file: suggestionMatch[1].trim(),
        line: parseInt(suggestionMatch[2], 10),
        message: suggestionMatch[3].trim(),
      });
    }
  }

  summary = summaryLines.join(' ').trim() || extractSummaryFromOutput(output);

  return {
    success: true,
    summary,
    issues,
    suggestions,
    stats: {
      filesReviewed: new Set(issues.map((i) => i.file)).size,
      issuesFound: issues.length,
      suggestionsCount: suggestions.length,
    },
    rawOutput: output,
  };
}

/**
 * Map various severity strings to standard severity
 */
function mapSeverity(
  severity: string | undefined
): 'critical' | 'high' | 'medium' | 'low' | 'info' {
  if (!severity) return 'info';

  const s = severity.toLowerCase();
  if (s.includes('critical') || s.includes('error')) return 'critical';
  if (s.includes('high') || s.includes('warning')) return 'high';
  if (s.includes('medium') || s.includes('moderate')) return 'medium';
  if (s.includes('low') || s.includes('minor')) return 'low';
  return 'info';
}

/**
 * Extract a summary from raw output if no explicit summary section found
 */
function extractSummaryFromOutput(output: string): string {
  // Take the first non-empty, non-header line as summary
  const lines = output.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed &&
      !trimmed.startsWith('#') &&
      !trimmed.startsWith('=') &&
      !trimmed.startsWith('-') &&
      trimmed.length > 20
    ) {
      return trimmed.length > 200 ? trimmed.slice(0, 200) + '...' : trimmed;
    }
  }
  return 'Review completed';
}

// ============================================================================
// Command Execution Helper
// ============================================================================

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a command and capture output
 */
function runCommand(
  command: string,
  args: string[],
  options: SpawnOptions = {}
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    // Handle npx-style commands
    let cmd = command;
    let cmdArgs = args;

    if (command.startsWith('npx ')) {
      cmd = 'npx';
      const npxParts = command.slice(4).split(' ');
      cmdArgs = [...npxParts, ...args];
    }

    const proc = spawn(cmd, cmdArgs, {
      shell: true,
      ...options,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format a review result for terminal output
 */
export function formatReviewResult(result: CodeRabbitReviewResult): string {
  const lines: string[] = [];

  if (!result.success) {
    lines.push(colors.red('❌ Review failed'));
    if (result.error) {
      lines.push(colors.dim(result.error));
    }
    return lines.join('\n');
  }

  // Header
  lines.push(colors.bold('🐰 CodeRabbit Review'));
  lines.push('');

  // Summary
  if (result.summary) {
    lines.push(colors.bold('Summary:'));
    lines.push(result.summary);
    lines.push('');
  }

  // Stats
  if (result.stats) {
    lines.push(colors.dim('─'.repeat(60)));
    lines.push(
      `Files: ${result.stats.filesReviewed} | ` +
        `Issues: ${result.stats.issuesFound} | ` +
        `Suggestions: ${result.stats.suggestionsCount}`
    );
    lines.push(colors.dim('─'.repeat(60)));
    lines.push('');
  }

  // Issues
  if (result.issues.length > 0) {
    lines.push(colors.bold('Issues:'));
    for (const issue of result.issues) {
      const icon = getSeverityIcon(issue.severity);
      const color = getSeverityColor(issue.severity);
      const location = issue.line ? `${issue.file}:${issue.line}` : issue.file;

      lines.push(`${icon} ${color(`[${issue.severity.toUpperCase()}]`)} ${colors.cyan(location)}`);
      lines.push(`   ${issue.message}`);
      if (issue.suggestion) {
        lines.push(`   ${colors.dim('→')} ${issue.suggestion}`);
      }
      lines.push('');
    }
  }

  // Suggestions
  if (result.suggestions.length > 0) {
    lines.push(colors.bold('Suggestions:'));
    for (const sug of result.suggestions) {
      const location = sug.line ? `${sug.file}:${sug.line}` : sug.file;
      lines.push(`💡 ${colors.cyan(location)}`);
      lines.push(`   ${sug.message}`);
      if (sug.code) {
        lines.push(`   ${colors.dim('```')}`);
        lines.push(`   ${sug.code}`);
        lines.push(`   ${colors.dim('```')}`);
      }
      lines.push('');
    }
  }

  // No issues
  if (result.issues.length === 0 && result.suggestions.length === 0) {
    lines.push(colors.green('✓ No issues found! Your code looks great.'));
    lines.push('');
  }

  return lines.join('\n');
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'critical':
      return '🔴';
    case 'high':
      return '🟠';
    case 'medium':
      return '🟡';
    case 'low':
      return '🟢';
    default:
      return 'ℹ️';
  }
}

function getSeverityColor(severity: string): (s: string) => string {
  switch (severity) {
    case 'critical':
      return colors.red;
    case 'high':
      return colors.yellow;
    case 'medium':
      return colors.yellow;
    case 'low':
      return colors.green;
    default:
      return colors.cyan;
  }
}
