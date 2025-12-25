/**
 * Get Diff Tool
 * Returns the diff of changes in the repository
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Repository } from '../../core/repository.js';
import { diff as computeDiff, createHunks, DiffLine } from '../../core/diff.js';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Format diff lines into a readable string
 */
function formatDiffOutput(file: string, diffLines: DiffLine[], contextLines: number = 3): string {
  const hunks = createHunks(diffLines, contextLines);
  const lines: string[] = [];
  
  lines.push(`--- a/${file}`);
  lines.push(`+++ b/${file}`);
  
  for (const hunk of hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);
    
    for (const line of hunk.lines) {
      switch (line.type) {
        case 'add':
          lines.push(`+${line.content}`);
          break;
        case 'remove':
          lines.push(`-${line.content}`);
          break;
        case 'context':
          lines.push(` ${line.content}`);
          break;
      }
    }
  }
  
  return lines.join('\n');
}

export const getDiffTool = createTool({
  id: 'wit-get-diff',
  description: 'Get the diff showing what has changed. Can show staged changes, unstaged changes, or changes for specific files. Use this to understand exactly what code has been modified.',
  inputSchema: z.object({
    staged: z.boolean().optional().describe('If true, show only staged changes. If false or not specified, show unstaged changes.'),
    files: z.array(z.string()).optional().describe('Specific files to show diff for. If not specified, shows diff for all changed files.'),
    contextLines: z.number().optional().default(3).describe('Number of context lines to show around changes'),
  }),
  outputSchema: z.object({
    diffs: z.array(z.object({
      file: z.string(),
      additions: z.number(),
      deletions: z.number(),
      content: z.string(),
    })),
    totalAdditions: z.number(),
    totalDeletions: z.number(),
    filesChanged: z.number(),
    summary: z.string(),
  }),
  execute: async ({ staged, files, contextLines }) => {
    try {
      const repo = Repository.find();
      const status = repo.status();
      
      // Determine which files to diff
      let filesToDiff: string[];
      if (files && files.length > 0) {
        filesToDiff = files;
      } else if (staged) {
        filesToDiff = status.staged;
      } else {
        filesToDiff = [...status.modified, ...status.staged];
      }
      
      const diffs: Array<{ file: string; additions: number; deletions: number; content: string }> = [];
      let totalAdditions = 0;
      let totalDeletions = 0;
      
      for (const file of filesToDiff) {
        try {
          // Get the old content from index or HEAD
          let oldContent = '';
          const entry = repo.index.get(file);
          if (entry) {
            const blob = repo.objects.readBlob(entry.hash);
            oldContent = blob.content.toString('utf8');
          }
          
          // Get new content from working directory
          const fullPath = path.join(repo.workDir, file);
          let newContent = '';
          try {
            newContent = fs.readFileSync(fullPath, 'utf8');
          } catch {
            // File might be deleted
          }
          
          // Compute diff
          const diffResult = computeDiff(oldContent, newContent);
          const additions = diffResult.filter(l => l.type === 'add').length;
          const deletions = diffResult.filter(l => l.type === 'remove').length;
          
          totalAdditions += additions;
          totalDeletions += deletions;
          
          diffs.push({
            file,
            additions,
            deletions,
            content: formatDiffOutput(file, diffResult, contextLines),
          });
        } catch {
          // Skip files we can't diff
        }
      }
      
      const summary = `${diffs.length} file(s) changed, ${totalAdditions} insertion(s), ${totalDeletions} deletion(s)`;
      
      return {
        diffs,
        totalAdditions,
        totalDeletions,
        filesChanged: diffs.length,
        summary,
      };
    } catch (error) {
      return {
        diffs: [],
        totalAdditions: 0,
        totalDeletions: 0,
        filesChanged: 0,
        summary: 'No changes to show',
      };
    }
  },
});
