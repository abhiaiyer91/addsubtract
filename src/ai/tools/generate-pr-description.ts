/**
 * Generate PR Description Tool
 * Uses AI to generate pull request descriptions from diff and commit messages
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { GeneratedPRDescription } from '../types.js';

/**
 * Prompt template for PR description generation (for future AI model integration)
 */
export const PR_DESCRIPTION_PROMPT = `You are analyzing a pull request to generate a helpful description.

## Commit Messages:
{commits}

## Code Changes (Diff):
{diff}

Based on these changes, generate:
1. A clear, concise title (if not provided)
2. A description following this template:
   ## Summary
   Brief overview of what this PR does
   
   ## Changes
   - Bullet points of key changes
   
   ## Testing
   How to test these changes
   
   ## Related Issues
   Any related issues (extracted from commit messages)

3. Suggested labels (choose from: bug, feature, enhancement, docs, refactor, test, chore)

Respond in JSON format:
{
  "title": "...",
  "description": "...",
  "labels": ["..."]
}
`;

export const generatePRDescriptionTool = createTool({
  id: 'wit-generate-pr-description',
  description: 'Generate a PR description from diff and commit messages. Analyzes code changes to create a comprehensive pull request description with title, summary, changes, and suggested labels.',
  inputSchema: z.object({
    diff: z.string().describe('The diff content showing code changes in the PR'),
    commits: z.array(z.object({
      message: z.string().describe('The commit message'),
      sha: z.string().describe('The commit SHA'),
    })).describe('Array of commits included in the PR'),
    title: z.string().optional().describe('Optional title - if not provided, one will be generated'),
    existingDescription: z.string().optional().describe('Existing description to enhance rather than replace'),
  }),
  outputSchema: z.object({
    title: z.string(),
    description: z.string(),
    labels: z.array(z.string()),
    summary: z.string(),
    changes: z.array(z.string()),
    testPlan: z.string().optional(),
    breakingChanges: z.array(z.string()).optional(),
  }),
  execute: async ({ diff, commits, title, existingDescription }): Promise<GeneratedPRDescription & { description: string; labels: string[] }> => {
    // Analyze the diff to determine the type of changes
    const analysis = analyzeDiff(diff);
    // Format commit messages for potential AI model usage
    const _commitMessages = commits.map(c => `- ${c.sha.slice(0, 7)}: ${c.message}`).join('\n');
    void _commitMessages; // Reserved for future AI model integration
    
    // Extract related issues from commit messages
    const relatedIssues = extractRelatedIssues(commits.map(c => c.message));
    
    // Determine labels based on analysis
    const labels = determineLabels(analysis, commits);
    
    // Generate title if not provided
    const generatedTitle = title || generateTitle(analysis, commits);
    
    // Build the description
    const changes = extractChanges(analysis, commits);
    const summary = generateSummary(analysis, commits);
    const testPlan = generateTestPlan(analysis);
    const breakingChanges = detectBreakingChanges(analysis, commits);
    
    // Format the full description
    const description = formatDescription({
      summary,
      changes,
      testPlan,
      breakingChanges,
      relatedIssues,
      existingDescription,
    });
    
    return {
      title: generatedTitle,
      description,
      labels,
      summary,
      changes,
      testPlan,
      breakingChanges: breakingChanges.length > 0 ? breakingChanges : undefined,
    };
  },
});

/**
 * Analyze the diff to understand what types of changes were made
 */
interface DiffAnalysis {
  filesAdded: string[];
  filesModified: string[];
  filesDeleted: string[];
  linesAdded: number;
  linesRemoved: number;
  fileTypes: Set<string>;
  hasTests: boolean;
  hasDocs: boolean;
  hasConfig: boolean;
  hasApi: boolean;
  hasUi: boolean;
}

function analyzeDiff(diff: string): DiffAnalysis {
  const analysis: DiffAnalysis = {
    filesAdded: [],
    filesModified: [],
    filesDeleted: [],
    linesAdded: 0,
    linesRemoved: 0,
    fileTypes: new Set(),
    hasTests: false,
    hasDocs: false,
    hasConfig: false,
    hasApi: false,
    hasUi: false,
  };
  
  const lines = diff.split('\n');
  let currentFile = '';
  
  for (const line of lines) {
    // Parse file headers
    if (line.startsWith('diff --git')) {
      const match = line.match(/diff --git a\/(.+) b\/(.+)/);
      if (match) {
        currentFile = match[2];
        const ext = currentFile.split('.').pop() || '';
        analysis.fileTypes.add(ext);
        
        // Categorize file types
        if (currentFile.includes('test') || currentFile.includes('spec')) {
          analysis.hasTests = true;
        }
        if (ext === 'md' || ext === 'mdx' || currentFile.includes('docs/')) {
          analysis.hasDocs = true;
        }
        if (['json', 'yaml', 'yml', 'toml', 'env'].includes(ext) || currentFile.includes('config')) {
          analysis.hasConfig = true;
        }
        if (currentFile.includes('/api/') || currentFile.includes('routes')) {
          analysis.hasApi = true;
        }
        if (currentFile.includes('/ui/') || currentFile.includes('/components/') || ['tsx', 'jsx', 'vue', 'svelte'].includes(ext)) {
          analysis.hasUi = true;
        }
      }
    }
    
    // Parse new/deleted files
    if (line.startsWith('new file mode')) {
      analysis.filesAdded.push(currentFile);
    } else if (line.startsWith('deleted file mode')) {
      analysis.filesDeleted.push(currentFile);
    } else if (line.startsWith('---') && !line.includes('/dev/null')) {
      if (!analysis.filesAdded.includes(currentFile) && !analysis.filesDeleted.includes(currentFile)) {
        if (!analysis.filesModified.includes(currentFile)) {
          analysis.filesModified.push(currentFile);
        }
      }
    }
    
    // Count line changes
    if (line.startsWith('+') && !line.startsWith('+++')) {
      analysis.linesAdded++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      analysis.linesRemoved++;
    }
  }
  
  return analysis;
}

/**
 * Extract related issues from commit messages
 */
function extractRelatedIssues(messages: string[]): string[] {
  const issues: Set<string> = new Set();
  const issuePatterns = [
    /#(\d+)/g,                    // #123
    /(?:fixes|closes|resolves)\s+#(\d+)/gi,  // fixes #123
    /\[([A-Z]+-\d+)\]/g,          // [PROJ-123]
  ];
  
  for (const message of messages) {
    for (const pattern of issuePatterns) {
      const matches = message.matchAll(pattern);
      for (const match of matches) {
        issues.add(match[0]);
      }
    }
  }
  
  return Array.from(issues);
}

/**
 * Determine appropriate labels based on analysis
 */
function determineLabels(analysis: DiffAnalysis, commits: { message: string; sha: string }[]): string[] {
  const labels: Set<string> = new Set();
  const allMessages = commits.map(c => c.message.toLowerCase()).join(' ');
  
  // Check commit message patterns
  if (allMessages.includes('fix') || allMessages.includes('bug')) {
    labels.add('bug');
  }
  if (allMessages.includes('feat') || allMessages.includes('feature') || allMessages.includes('add')) {
    labels.add('feature');
  }
  if (allMessages.includes('refactor') || allMessages.includes('cleanup') || allMessages.includes('improve')) {
    labels.add('enhancement');
  }
  if (allMessages.includes('chore') || allMessages.includes('deps') || allMessages.includes('dependency')) {
    labels.add('chore');
  }
  
  // Check based on files changed
  if (analysis.hasDocs) {
    labels.add('docs');
  }
  if (analysis.hasTests) {
    labels.add('test');
  }
  
  // If no labels determined, default based on changes
  if (labels.size === 0) {
    if (analysis.filesAdded.length > analysis.filesModified.length) {
      labels.add('feature');
    } else {
      labels.add('enhancement');
    }
  }
  
  return Array.from(labels);
}

/**
 * Generate a title from the analysis and commits
 */
function generateTitle(analysis: DiffAnalysis, commits: { message: string; sha: string }[]): string {
  // If single commit, use its message
  if (commits.length === 1) {
    const message = commits[0].message.split('\n')[0];
    return message.length > 72 ? message.slice(0, 69) + '...' : message;
  }
  
  // For multiple commits, summarize
  const firstLine = commits[0].message.split('\n')[0];
  const prefix = firstLine.match(/^(feat|fix|docs|style|refactor|test|chore)(\(.+?\))?:/)?.[0] || '';
  
  if (analysis.filesAdded.length > 0 && analysis.filesModified.length === 0) {
    return `${prefix || 'feat:'} Add ${summarizeFiles(analysis.filesAdded)}`;
  }
  
  if (analysis.filesDeleted.length > 0 && analysis.filesModified.length === 0) {
    return `${prefix || 'chore:'} Remove ${summarizeFiles(analysis.filesDeleted)}`;
  }
  
  // Default to first commit message
  return firstLine.length > 72 ? firstLine.slice(0, 69) + '...' : firstLine;
}

function summarizeFiles(files: string[]): string {
  if (files.length === 1) {
    return files[0].split('/').pop() || files[0];
  }
  if (files.length <= 3) {
    return files.map(f => f.split('/').pop()).join(', ');
  }
  return `${files.length} files`;
}

/**
 * Extract key changes from the analysis
 */
function extractChanges(analysis: DiffAnalysis, commits: { message: string; sha: string }[]): string[] {
  const changes: string[] = [];
  
  if (analysis.filesAdded.length > 0) {
    changes.push(`Added ${analysis.filesAdded.length} new file(s): ${summarizeFiles(analysis.filesAdded)}`);
  }
  if (analysis.filesModified.length > 0) {
    changes.push(`Modified ${analysis.filesModified.length} file(s): ${summarizeFiles(analysis.filesModified)}`);
  }
  if (analysis.filesDeleted.length > 0) {
    changes.push(`Deleted ${analysis.filesDeleted.length} file(s): ${summarizeFiles(analysis.filesDeleted)}`);
  }
  
  // Add changes from commit messages
  for (const commit of commits) {
    const lines = commit.message.split('\n').slice(1).filter(l => l.trim().startsWith('-'));
    for (const line of lines.slice(0, 3)) { // Limit to 3 per commit
      changes.push(line.trim());
    }
  }
  
  return changes.slice(0, 10); // Limit total changes
}

/**
 * Generate a summary of the PR
 */
function generateSummary(analysis: DiffAnalysis, _commits: { message: string; sha: string }[]): string {
  void _commits; // Available for future AI enhancement
  const parts: string[] = [];
  
  const totalFiles = analysis.filesAdded.length + analysis.filesModified.length + analysis.filesDeleted.length;
  parts.push(`This PR includes changes to ${totalFiles} file(s) with ${analysis.linesAdded} additions and ${analysis.linesRemoved} deletions.`);
  
  if (analysis.hasTests) {
    parts.push('Includes test changes.');
  }
  if (analysis.hasDocs) {
    parts.push('Includes documentation updates.');
  }
  if (analysis.hasApi) {
    parts.push('Includes API changes.');
  }
  if (analysis.hasUi) {
    parts.push('Includes UI changes.');
  }
  
  return parts.join(' ');
}

/**
 * Generate a test plan based on the changes
 */
function generateTestPlan(analysis: DiffAnalysis): string {
  const steps: string[] = [];
  
  if (analysis.hasTests) {
    steps.push('- Run the test suite: `npm test`');
  }
  
  if (analysis.hasApi) {
    steps.push('- Test API endpoints affected by these changes');
  }
  
  if (analysis.hasUi) {
    steps.push('- Verify UI changes in the browser');
    steps.push('- Check for responsive design issues');
  }
  
  if (analysis.hasConfig) {
    steps.push('- Verify configuration changes are applied correctly');
  }
  
  if (steps.length === 0) {
    steps.push('- Review the code changes');
    steps.push('- Run the application and verify functionality');
  }
  
  return steps.join('\n');
}

/**
 * Detect breaking changes from commits
 */
function detectBreakingChanges(analysis: DiffAnalysis, commits: { message: string; sha: string }[]): string[] {
  const breaking: string[] = [];
  
  for (const commit of commits) {
    const message = commit.message.toLowerCase();
    if (message.includes('breaking') || message.includes('!:')) {
      breaking.push(commit.message.split('\n')[0]);
    }
  }
  
  // Check for potentially breaking patterns
  if (analysis.filesDeleted.some(f => f.includes('api') || f.includes('public'))) {
    breaking.push('Deleted files that may affect public API');
  }
  
  return breaking;
}

/**
 * Format the full description
 */
function formatDescription(opts: {
  summary: string;
  changes: string[];
  testPlan: string;
  breakingChanges: string[];
  relatedIssues: string[];
  existingDescription?: string;
}): string {
  const sections: string[] = [];
  
  sections.push('## Summary');
  sections.push(opts.summary);
  sections.push('');
  
  sections.push('## Changes');
  for (const change of opts.changes) {
    sections.push(change.startsWith('-') ? change : `- ${change}`);
  }
  sections.push('');
  
  if (opts.breakingChanges.length > 0) {
    sections.push('## Breaking Changes');
    for (const bc of opts.breakingChanges) {
      sections.push(`- ${bc}`);
    }
    sections.push('');
  }
  
  sections.push('## Testing');
  sections.push(opts.testPlan);
  sections.push('');
  
  if (opts.relatedIssues.length > 0) {
    sections.push('## Related Issues');
    sections.push(opts.relatedIssues.join(', '));
    sections.push('');
  }
  
  if (opts.existingDescription) {
    sections.push('## Additional Context');
    sections.push(opts.existingDescription);
  }
  
  return sections.join('\n');
}
