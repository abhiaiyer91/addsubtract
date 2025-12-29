/**
 * Generate Release Notes Tool
 * Uses AI to generate release notes from commits between tags/releases
 * 
 * Features:
 * - Analyzes commits between two refs (tags, commits, branches)
 * - Categorizes changes (features, fixes, breaking changes, etc.)
 * - Generates human-readable release notes in markdown
 * - Supports different output formats and styles
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

/**
 * Result of release notes generation
 */
export interface GeneratedReleaseNotes {
  /** Release version/tag name */
  version: string;
  /** Release title */
  title: string;
  /** Full markdown release notes */
  body: string;
  /** Categorized changes */
  categories: {
    breaking: ChangeEntry[];
    features: ChangeEntry[];
    fixes: ChangeEntry[];
    improvements: ChangeEntry[];
    documentation: ChangeEntry[];
    dependencies: ChangeEntry[];
    other: ChangeEntry[];
  };
  /** Contributors mentioned in commits */
  contributors: string[];
  /** Statistics */
  stats: {
    totalCommits: number;
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
  };
  /** Comparison URL (if applicable) */
  compareUrl?: string;
}

export interface ChangeEntry {
  /** Commit message/description */
  description: string;
  /** Short commit hash */
  sha: string;
  /** Author name */
  author: string;
  /** Pull request number if found */
  prNumber?: number;
  /** Issue numbers if found */
  issues?: number[];
  /** Scope (e.g., api, ui, core) */
  scope?: string;
}

/**
 * Prompt template for AI-powered release notes generation
 */
export const RELEASE_NOTES_PROMPT = `You are generating release notes for a software release.

## Version: {version}
## Previous Version: {previousVersion}

## Commits:
{commits}

## Changed Files Summary:
{filesSummary}

Generate professional release notes following this structure:
1. A brief overview of the release (1-2 sentences)
2. Categorized changes:
   - **Breaking Changes** (if any) - marked with BREAKING or !
   - **New Features** - commits starting with feat: or feature:
   - **Bug Fixes** - commits starting with fix:
   - **Improvements** - commits starting with improve:, perf:, refactor:
   - **Documentation** - commits starting with docs:
   - **Dependencies** - commits mentioning deps, dependency, bump, upgrade
   - **Other Changes** - everything else
3. Contributors list
4. Statistics

Format the output as markdown suitable for GitHub releases.
Extract PR numbers from commit messages (e.g., (#123) or PR #123).
Extract issue references (e.g., fixes #123, closes #456).

Be concise but informative. Use emoji sparingly.
`;

export const generateReleaseNotesTool = createTool({
  id: 'wit-generate-release-notes',
  description: 'Generate release notes from commits between two versions. Analyzes commit history to create categorized, human-readable release notes with features, fixes, breaking changes, and contributor information.',
  inputSchema: z.object({
    version: z.string().describe('The version/tag being released (e.g., v1.2.0)'),
    previousVersion: z.string().optional().describe('The previous version/tag to compare against (defaults to previous tag)'),
    commits: z.array(z.object({
      sha: z.string().describe('Full commit hash'),
      shortSha: z.string().describe('Short commit hash (7 chars)'),
      message: z.string().describe('Full commit message'),
      author: z.string().describe('Commit author name'),
      email: z.string().describe('Commit author email'),
      date: z.string().describe('Commit date (ISO string)'),
    })).describe('Array of commits included in this release'),
    filesSummary: z.object({
      totalFiles: z.number().describe('Total number of files changed'),
      additions: z.number().describe('Total lines added'),
      deletions: z.number().describe('Total lines removed'),
      files: z.array(z.object({
        path: z.string(),
        additions: z.number(),
        deletions: z.number(),
      })).optional().describe('Per-file change summary (optional)'),
    }).optional().describe('Summary of file changes (optional)'),
    repoUrl: z.string().optional().describe('Repository URL for generating links'),
    style: z.enum(['standard', 'detailed', 'minimal', 'changelog']).default('standard').describe('Output style'),
    includeStats: z.boolean().default(true).describe('Include statistics section'),
    includeContributors: z.boolean().default(true).describe('Include contributors section'),
  }),
  outputSchema: z.object({
    version: z.string(),
    title: z.string(),
    body: z.string(),
    categories: z.object({
      breaking: z.array(z.object({
        description: z.string(),
        sha: z.string(),
        author: z.string(),
        prNumber: z.number().optional(),
        issues: z.array(z.number()).optional(),
        scope: z.string().optional(),
      })),
      features: z.array(z.object({
        description: z.string(),
        sha: z.string(),
        author: z.string(),
        prNumber: z.number().optional(),
        issues: z.array(z.number()).optional(),
        scope: z.string().optional(),
      })),
      fixes: z.array(z.object({
        description: z.string(),
        sha: z.string(),
        author: z.string(),
        prNumber: z.number().optional(),
        issues: z.array(z.number()).optional(),
        scope: z.string().optional(),
      })),
      improvements: z.array(z.object({
        description: z.string(),
        sha: z.string(),
        author: z.string(),
        prNumber: z.number().optional(),
        issues: z.array(z.number()).optional(),
        scope: z.string().optional(),
      })),
      documentation: z.array(z.object({
        description: z.string(),
        sha: z.string(),
        author: z.string(),
        prNumber: z.number().optional(),
        issues: z.array(z.number()).optional(),
        scope: z.string().optional(),
      })),
      dependencies: z.array(z.object({
        description: z.string(),
        sha: z.string(),
        author: z.string(),
        prNumber: z.number().optional(),
        issues: z.array(z.number()).optional(),
        scope: z.string().optional(),
      })),
      other: z.array(z.object({
        description: z.string(),
        sha: z.string(),
        author: z.string(),
        prNumber: z.number().optional(),
        issues: z.array(z.number()).optional(),
        scope: z.string().optional(),
      })),
    }),
    contributors: z.array(z.string()),
    stats: z.object({
      totalCommits: z.number(),
      filesChanged: z.number(),
      linesAdded: z.number(),
      linesRemoved: z.number(),
    }),
    compareUrl: z.string().optional(),
  }),
  execute: async ({ 
    version, 
    previousVersion, 
    commits, 
    filesSummary, 
    repoUrl,
    style,
    includeStats,
    includeContributors,
  }): Promise<GeneratedReleaseNotes> => {
    // Categorize commits
    const categories = categorizeCommits(commits);
    
    // Extract unique contributors
    const contributors = extractContributors(commits);
    
    // Calculate stats
    const stats = {
      totalCommits: commits.length,
      filesChanged: filesSummary?.totalFiles ?? 0,
      linesAdded: filesSummary?.additions ?? 0,
      linesRemoved: filesSummary?.deletions ?? 0,
    };
    
    // Generate title
    const title = generateReleaseTitle(version, categories);
    
    // Generate comparison URL if repo URL provided
    const compareUrl = repoUrl && previousVersion 
      ? `${repoUrl}/compare/${previousVersion}...${version}`
      : undefined;
    
    // Generate markdown body
    const body = generateReleaseBody({
      version,
      previousVersion,
      title,
      categories,
      contributors,
      stats,
      compareUrl,
      style,
      includeStats,
      includeContributors,
    });
    
    return {
      version,
      title,
      body,
      categories,
      contributors,
      stats,
      compareUrl,
    };
  },
});

/**
 * Parse a commit message to extract conventional commit info
 */
interface ParsedCommit {
  type: string;
  scope?: string;
  breaking: boolean;
  description: string;
  body?: string;
  prNumber?: number;
  issues: number[];
}

function parseCommitMessage(message: string): ParsedCommit {
  const lines = message.split('\n');
  const firstLine = lines[0];
  
  // Default result
  const result: ParsedCommit = {
    type: 'other',
    breaking: false,
    description: firstLine,
    issues: [],
  };
  
  // Parse conventional commit format: type(scope)!: description
  const conventionalMatch = firstLine.match(
    /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/
  );
  
  if (conventionalMatch) {
    result.type = conventionalMatch[1].toLowerCase();
    result.scope = conventionalMatch[2];
    result.breaking = conventionalMatch[3] === '!';
    result.description = conventionalMatch[4];
  }
  
  // Check for BREAKING CHANGE in body
  const fullMessage = message.toLowerCase();
  if (fullMessage.includes('breaking change') || fullMessage.includes('breaking:')) {
    result.breaking = true;
  }
  
  // Extract PR numbers (#123 or PR #123)
  const prMatches = message.match(/(?:PR\s*)?#(\d+)/gi);
  if (prMatches) {
    // Take the first one as the PR number
    const prMatch = prMatches[0].match(/(\d+)/);
    if (prMatch) {
      result.prNumber = parseInt(prMatch[1], 10);
    }
  }
  
  // Extract issue references (fixes #123, closes #456, resolves #789)
  const issuePattern = /(?:fix(?:es)?|close[sd]?|resolve[sd]?)\s+#(\d+)/gi;
  let issueMatch;
  while ((issueMatch = issuePattern.exec(message)) !== null) {
    result.issues.push(parseInt(issueMatch[1], 10));
  }
  
  // Get body if present
  if (lines.length > 2) {
    result.body = lines.slice(2).join('\n').trim();
  }
  
  return result;
}

/**
 * Categorize commits into release note sections
 */
function categorizeCommits(commits: Array<{
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  email: string;
  date: string;
}>): GeneratedReleaseNotes['categories'] {
  const categories: GeneratedReleaseNotes['categories'] = {
    breaking: [],
    features: [],
    fixes: [],
    improvements: [],
    documentation: [],
    dependencies: [],
    other: [],
  };
  
  for (const commit of commits) {
    const parsed = parseCommitMessage(commit.message);
    
    const entry: ChangeEntry = {
      description: parsed.description,
      sha: commit.shortSha,
      author: commit.author,
      prNumber: parsed.prNumber,
      issues: parsed.issues.length > 0 ? parsed.issues : undefined,
      scope: parsed.scope,
    };
    
    // Breaking changes go first regardless of type
    if (parsed.breaking) {
      categories.breaking.push(entry);
      continue;
    }
    
    // Categorize by type
    switch (parsed.type) {
      case 'feat':
      case 'feature':
        categories.features.push(entry);
        break;
      case 'fix':
      case 'bugfix':
        categories.fixes.push(entry);
        break;
      case 'improve':
      case 'perf':
      case 'refactor':
      case 'style':
        categories.improvements.push(entry);
        break;
      case 'docs':
      case 'doc':
        categories.documentation.push(entry);
        break;
      case 'deps':
      case 'build':
      case 'chore':
        // Check if it's dependency related
        if (commit.message.toLowerCase().match(/(?:bump|upgrade|update|deps|dependency|dependencies)/)) {
          categories.dependencies.push(entry);
        } else {
          categories.other.push(entry);
        }
        break;
      default:
        // Try to infer from message content
        const lowerMessage = commit.message.toLowerCase();
        if (lowerMessage.includes('add') || lowerMessage.includes('new') || lowerMessage.includes('implement')) {
          categories.features.push(entry);
        } else if (lowerMessage.includes('fix') || lowerMessage.includes('bug') || lowerMessage.includes('issue')) {
          categories.fixes.push(entry);
        } else if (lowerMessage.includes('doc')) {
          categories.documentation.push(entry);
        } else if (lowerMessage.match(/(?:bump|upgrade|update|deps|dependency)/)) {
          categories.dependencies.push(entry);
        } else {
          categories.other.push(entry);
        }
    }
  }
  
  return categories;
}

/**
 * Extract unique contributors from commits
 */
function extractContributors(commits: Array<{ author: string; email: string }>): string[] {
  const seen = new Set<string>();
  const contributors: string[] = [];
  
  for (const commit of commits) {
    // Use email as unique key but display name
    if (!seen.has(commit.email)) {
      seen.add(commit.email);
      contributors.push(commit.author);
    }
  }
  
  return contributors.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

/**
 * Generate a release title based on the changes
 */
function generateReleaseTitle(version: string, categories: GeneratedReleaseNotes['categories']): string {
  const parts: string[] = [];
  
  if (categories.breaking.length > 0) {
    parts.push('Breaking Changes');
  }
  
  if (categories.features.length > 0) {
    const count = categories.features.length;
    parts.push(`${count} New Feature${count > 1 ? 's' : ''}`);
  }
  
  if (categories.fixes.length > 0) {
    const count = categories.fixes.length;
    parts.push(`${count} Bug Fix${count > 1 ? 'es' : ''}`);
  }
  
  if (parts.length === 0) {
    if (categories.improvements.length > 0) {
      parts.push('Improvements');
    } else if (categories.documentation.length > 0) {
      parts.push('Documentation Updates');
    } else {
      parts.push('Maintenance Release');
    }
  }
  
  return `${version}: ${parts.join(', ')}`;
}

/**
 * Generate the full release notes markdown body
 */
function generateReleaseBody(opts: {
  version: string;
  previousVersion?: string;
  title: string;
  categories: GeneratedReleaseNotes['categories'];
  contributors: string[];
  stats: GeneratedReleaseNotes['stats'];
  compareUrl?: string;
  style: 'standard' | 'detailed' | 'minimal' | 'changelog';
  includeStats: boolean;
  includeContributors: boolean;
}): string {
  const sections: string[] = [];
  
  // Overview
  const overview = generateOverview(opts.categories, opts.stats);
  if (overview) {
    sections.push(overview);
    sections.push('');
  }
  
  // Comparison link
  if (opts.compareUrl) {
    sections.push(`**Full Changelog**: ${opts.compareUrl}`);
    sections.push('');
  }
  
  // Breaking Changes (always show prominently)
  if (opts.categories.breaking.length > 0) {
    sections.push('## Breaking Changes');
    sections.push('');
    for (const entry of opts.categories.breaking) {
      sections.push(formatChangeEntry(entry, opts.style));
    }
    sections.push('');
  }
  
  // Features
  if (opts.categories.features.length > 0) {
    sections.push('## New Features');
    sections.push('');
    for (const entry of opts.categories.features) {
      sections.push(formatChangeEntry(entry, opts.style));
    }
    sections.push('');
  }
  
  // Bug Fixes
  if (opts.categories.fixes.length > 0) {
    sections.push('## Bug Fixes');
    sections.push('');
    for (const entry of opts.categories.fixes) {
      sections.push(formatChangeEntry(entry, opts.style));
    }
    sections.push('');
  }
  
  // Improvements (only in standard/detailed)
  if (opts.style !== 'minimal' && opts.categories.improvements.length > 0) {
    sections.push('## Improvements');
    sections.push('');
    for (const entry of opts.categories.improvements) {
      sections.push(formatChangeEntry(entry, opts.style));
    }
    sections.push('');
  }
  
  // Documentation (only in detailed)
  if (opts.style === 'detailed' && opts.categories.documentation.length > 0) {
    sections.push('## Documentation');
    sections.push('');
    for (const entry of opts.categories.documentation) {
      sections.push(formatChangeEntry(entry, opts.style));
    }
    sections.push('');
  }
  
  // Dependencies (only in detailed/changelog)
  if ((opts.style === 'detailed' || opts.style === 'changelog') && opts.categories.dependencies.length > 0) {
    sections.push('## Dependencies');
    sections.push('');
    for (const entry of opts.categories.dependencies) {
      sections.push(formatChangeEntry(entry, opts.style));
    }
    sections.push('');
  }
  
  // Other changes (only in detailed/changelog)
  if ((opts.style === 'detailed' || opts.style === 'changelog') && opts.categories.other.length > 0) {
    sections.push('## Other Changes');
    sections.push('');
    for (const entry of opts.categories.other) {
      sections.push(formatChangeEntry(entry, opts.style));
    }
    sections.push('');
  }
  
  // Contributors
  if (opts.includeContributors && opts.contributors.length > 0) {
    sections.push('## Contributors');
    sections.push('');
    sections.push(`Thanks to ${opts.contributors.length === 1 ? '' : 'all '}our contributor${opts.contributors.length === 1 ? '' : 's'}: ${opts.contributors.join(', ')}`);
    sections.push('');
  }
  
  // Stats
  if (opts.includeStats && opts.stats.totalCommits > 0) {
    sections.push('---');
    sections.push('');
    const statParts: string[] = [];
    statParts.push(`**${opts.stats.totalCommits}** commit${opts.stats.totalCommits === 1 ? '' : 's'}`);
    if (opts.stats.filesChanged > 0) {
      statParts.push(`**${opts.stats.filesChanged}** file${opts.stats.filesChanged === 1 ? '' : 's'} changed`);
    }
    if (opts.stats.linesAdded > 0 || opts.stats.linesRemoved > 0) {
      statParts.push(`**+${opts.stats.linesAdded}** / **-${opts.stats.linesRemoved}** lines`);
    }
    sections.push(statParts.join(' | '));
  }
  
  return sections.join('\n');
}

/**
 * Generate overview text
 */
function generateOverview(
  categories: GeneratedReleaseNotes['categories'], 
  stats: GeneratedReleaseNotes['stats']
): string {
  const counts: string[] = [];
  
  if (categories.breaking.length > 0) {
    counts.push(`${categories.breaking.length} breaking change${categories.breaking.length === 1 ? '' : 's'}`);
  }
  if (categories.features.length > 0) {
    counts.push(`${categories.features.length} new feature${categories.features.length === 1 ? '' : 's'}`);
  }
  if (categories.fixes.length > 0) {
    counts.push(`${categories.fixes.length} bug fix${categories.fixes.length === 1 ? '' : 'es'}`);
  }
  if (categories.improvements.length > 0) {
    counts.push(`${categories.improvements.length} improvement${categories.improvements.length === 1 ? '' : 's'}`);
  }
  
  if (counts.length === 0) {
    return `This release includes ${stats.totalCommits} commit${stats.totalCommits === 1 ? '' : 's'}.`;
  }
  
  return `This release includes ${counts.join(', ')}.`;
}

/**
 * Format a single change entry
 */
function formatChangeEntry(entry: ChangeEntry, style: string): string {
  const parts: string[] = [];
  
  // Start with bullet point
  parts.push('-');
  
  // Add scope if present
  if (entry.scope && style !== 'minimal') {
    parts.push(`**${entry.scope}:**`);
  }
  
  // Add description
  parts.push(entry.description);
  
  // Add PR reference
  if (entry.prNumber) {
    parts.push(`(#${entry.prNumber})`);
  }
  
  // Add commit sha in detailed mode
  if (style === 'detailed' || style === 'changelog') {
    parts.push(`\`${entry.sha}\``);
  }
  
  // Add author in detailed mode
  if (style === 'detailed') {
    parts.push(`by @${entry.author.replace(/\s+/g, '')}`);
  }
  
  // Add issue references
  if (entry.issues && entry.issues.length > 0 && style === 'detailed') {
    const issueRefs = entry.issues.map(i => `#${i}`).join(', ');
    parts.push(`(fixes ${issueRefs})`);
  }
  
  return parts.join(' ');
}

/**
 * Helper to get commits between two refs (to be called from CLI/API)
 * This is a utility function that can be used by the release command
 */
export async function getCommitsBetweenRefs(
  repo: any, // Repository instance
  fromRef: string,
  toRef: string = 'HEAD'
): Promise<Array<{
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  email: string;
  date: string;
}>> {
  // This would be implemented to call the repository's log functionality
  // For now, we return a placeholder that would be filled by the caller
  const commits: Array<{
    sha: string;
    shortSha: string;
    message: string;
    author: string;
    email: string;
    date: string;
  }> = [];
  
  return commits;
}
