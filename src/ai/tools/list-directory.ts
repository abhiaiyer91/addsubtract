/**
 * List Directory Tool
 * Lists files and directories in the repository
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs';
import { Repository } from '../../core/repository.js';
import { exists, isDirectory, readDir, loadIgnorePatterns } from '../../utils/fs.js';

export const listDirectoryTool = createTool({
  id: 'wit-list-directory',
  description: `List files and directories in the repository.
Use this to explore the codebase structure and find relevant files.
By default, respects .gitignore patterns.
Can recursively list subdirectories up to a specified depth.`,
  inputSchema: z.object({
    dirPath: z.string().optional().default('.').describe('Directory path relative to repository root. Defaults to root.'),
    recursive: z.boolean().optional().default(false).describe('List subdirectories recursively'),
    maxDepth: z.number().optional().default(3).describe('Maximum depth for recursive listing (1-10)'),
    includeHidden: z.boolean().optional().default(false).describe('Include hidden files (starting with .)'),
    pattern: z.string().optional().describe('Filter by glob pattern (e.g., "*.ts", "*.test.js")'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    path: z.string().optional().describe('The directory that was listed'),
    entries: z.array(z.object({
      name: z.string(),
      path: z.string(),
      type: z.enum(['file', 'directory']),
      size: z.number().optional(),
    })).optional(),
    totalFiles: z.number().optional(),
    totalDirectories: z.number().optional(),
    truncated: z.boolean().optional().describe('Whether results were truncated due to limit'),
    errorMessage: z.string().optional().describe('Error message if operation failed'),
  }),
  execute: async ({ dirPath = '.', recursive = false, maxDepth = 3, includeHidden = false, pattern }) => {
    try {
      const repo = Repository.find();
      const fullPath = path.join(repo.workDir, dirPath);

      // Security: Ensure path is within repo
      const resolvedPath = path.resolve(fullPath);
      if (!resolvedPath.startsWith(repo.workDir)) {
        return {
          success: false,
          errorMessage: 'Access denied: Path is outside repository',
        };
      }

      if (!exists(fullPath)) {
        return {
          success: false,
          errorMessage: `Directory not found: ${dirPath}`,
        };
      }

      if (!isDirectory(fullPath)) {
        return {
          success: false,
          errorMessage: `Path is a file, not a directory: ${dirPath}. Use readFile tool instead.`,
        };
      }

      // Load ignore patterns
      const ignorePatterns = loadIgnorePatterns(repo.workDir);

      // Compile glob pattern to regex if provided
      let patternRegex: RegExp | null = null;
      if (pattern) {
        patternRegex = globToRegex(pattern);
      }

      const entries: Array<{
        name: string;
        path: string;
        type: 'file' | 'directory';
        size?: number;
      }> = [];

      // Clamp maxDepth
      maxDepth = Math.max(1, Math.min(10, maxDepth));

      // List directory contents
      const MAX_ENTRIES = 1000;
      let truncated = false;

      const listDir = (currentPath: string, relativePath: string, depth: number) => {
        if (entries.length >= MAX_ENTRIES) {
          truncated = true;
          return;
        }

        if (depth > maxDepth) return;

        let items: string[];
        try {
          items = readDir(currentPath);
        } catch {
          return;
        }

        // Sort: directories first, then files, alphabetically
        items.sort((a, b) => {
          const aIsDir = isDirectory(path.join(currentPath, a));
          const bIsDir = isDirectory(path.join(currentPath, b));
          if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
          return a.localeCompare(b);
        });

        for (const item of items) {
          if (entries.length >= MAX_ENTRIES) {
            truncated = true;
            return;
          }

          // Skip hidden files unless requested
          if (!includeHidden && item.startsWith('.')) {
            continue;
          }

          const itemFullPath = path.join(currentPath, item);
          const itemRelativePath = relativePath ? path.join(relativePath, item) : item;

          // Check ignore patterns
          if (shouldIgnore(itemRelativePath, ignorePatterns)) {
            continue;
          }

          const itemIsDir = isDirectory(itemFullPath);

          // Apply pattern filter (only to files)
          if (!itemIsDir && patternRegex && !patternRegex.test(item)) {
            continue;
          }

          let size: number | undefined;
          if (!itemIsDir) {
            try {
              const stats = fs.statSync(itemFullPath);
              size = stats.size;
            } catch {
              // Ignore stat errors
            }
          }

          entries.push({
            name: item,
            path: itemRelativePath,
            type: itemIsDir ? 'directory' : 'file',
            size,
          });

          // Recurse into directories
          if (itemIsDir && recursive && depth < maxDepth) {
            listDir(itemFullPath, itemRelativePath, depth + 1);
          }
        }
      };

      listDir(fullPath, dirPath === '.' ? '' : dirPath, 1);

      const totalFiles = entries.filter(e => e.type === 'file').length;
      const totalDirectories = entries.filter(e => e.type === 'directory').length;

      return {
        success: true,
        path: dirPath,
        entries,
        totalFiles,
        totalDirectories,
        truncated,
      };
    } catch (error) {
      return {
        success: false,
        errorMessage: error instanceof Error ? error.message : 'Failed to list directory',
      };
    }
  },
});

/**
 * Convert glob pattern to regex
 */
function globToRegex(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * Check if path should be ignored
 */
function shouldIgnore(relativePath: string, patterns: string[]): boolean {
  const pathParts = relativePath.split(path.sep);

  for (const pattern of patterns) {
    // Simple pattern matching (doesn't handle all gitignore edge cases)
    if (pattern.startsWith('/')) {
      // Anchored to root
      const cleanPattern = pattern.slice(1);
      if (relativePath === cleanPattern || relativePath.startsWith(cleanPattern + '/')) {
        return true;
      }
    } else if (pattern.endsWith('/')) {
      // Directory pattern
      const cleanPattern = pattern.slice(0, -1);
      if (pathParts.includes(cleanPattern)) {
        return true;
      }
    } else {
      // Match anywhere
      if (pathParts.includes(pattern) || relativePath.endsWith(pattern)) {
        return true;
      }
    }
  }

  // Always ignore .wit and .git
  if (pathParts.includes('.wit') || pathParts.includes('.git')) {
    return true;
  }

  return false;
}
