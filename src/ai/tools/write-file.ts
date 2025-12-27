/**
 * Write File Tool
 * Creates or overwrites files in the repository working directory
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as path from 'path';
import { Repository } from '../../core/repository.js';
import { exists, writeFile, mkdirp, readFileText } from '../../utils/fs.js';

export const writeFileTool = createTool({
  id: 'wit-write-file',
  description: `Create a new file or overwrite an existing file in the repository.
Use this when you need to create a completely new file or completely replace file contents.
For small targeted changes to existing files, prefer the editFile tool instead.
The file will be created in the repository working directory and can be staged/committed after.`,
  inputSchema: z.object({
    filePath: z.string().describe('Path to the file relative to the repository root'),
    content: z.string().describe('The content to write to the file'),
    createDirectories: z.boolean().optional().default(true).describe('Create parent directories if they do not exist'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    filePath: z.string().optional().describe('The path where the file was written'),
    created: z.boolean().optional().describe('Whether this was a new file (vs overwrite)'),
    size: z.number().optional().describe('Size of the written file in bytes'),
    message: z.string(),
    previousContent: z.string().optional().describe('Previous content if file was overwritten (for undo)'),
  }),
  execute: async ({ filePath, content, createDirectories = true }) => {
    try {
      const repo = Repository.find();
      const fullPath = path.join(repo.workDir, filePath);

      // Security: Ensure path is within repo
      const resolvedPath = path.resolve(fullPath);
      if (!resolvedPath.startsWith(repo.workDir)) {
        return {
          success: false,
          message: 'Access denied: Path is outside repository',
        };
      }

      // Security: Prevent writing to .wit or .git directories
      const relativePath = path.relative(repo.workDir, resolvedPath);
      if (relativePath.startsWith('.wit') || relativePath.startsWith('.git')) {
        return {
          success: false,
          message: 'Access denied: Cannot write to .wit or .git directories',
        };
      }

      // Check if file exists for created flag
      const fileExisted = exists(fullPath);
      let previousContent: string | undefined;

      if (fileExisted) {
        try {
          previousContent = readFileText(fullPath);
        } catch {
          // Ignore - might be binary
        }
      }

      // Create parent directories if needed
      if (createDirectories) {
        const parentDir = path.dirname(fullPath);
        if (!exists(parentDir)) {
          mkdirp(parentDir);
        }
      } else {
        const parentDir = path.dirname(fullPath);
        if (!exists(parentDir)) {
          return {
            success: false,
            message: `Parent directory does not exist: ${path.dirname(filePath)}. Set createDirectories=true to create it.`,
          };
        }
      }

      // Write the file
      const contentBuffer = Buffer.from(content, 'utf-8');
      writeFile(fullPath, contentBuffer);

      return {
        success: true,
        filePath,
        created: !fileExisted,
        size: contentBuffer.length,
        message: fileExisted
          ? `Updated file: ${filePath} (${contentBuffer.length} bytes)`
          : `Created file: ${filePath} (${contentBuffer.length} bytes)`,
        previousContent: fileExisted ? previousContent : undefined,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to write file',
      };
    }
  },
});
