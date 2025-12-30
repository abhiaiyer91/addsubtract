/**
 * Read File Tool
 * Reads file contents from the repository working directory
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as path from 'path';
import { Repository } from '../../core/repository.js';
import { exists, isDirectory, readFile } from '../../utils/fs.js';

export const readFileTool = createTool({
  id: 'wit-read-file',
  description: `Read the contents of a file from the repository. Returns the file content as text.
Use this to understand existing code before making changes.
Supports reading specific line ranges for large files.
Can also read binary files and return base64 encoded content.`,
  inputSchema: z.object({
    filePath: z.string().describe('Path to the file relative to the repository root'),
    startLine: z.number().optional().describe('Optional: Start reading from this line (1-indexed)'),
    endLine: z.number().optional().describe('Optional: Stop reading at this line (inclusive)'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    content: z.string().optional().describe('File content (text or base64 for binary)'),
    isBinary: z.boolean().optional().describe('Whether the file is binary'),
    lineCount: z.number().optional().describe('Total number of lines in the file'),
    startLine: z.number().optional().describe('Actual start line returned'),
    endLine: z.number().optional().describe('Actual end line returned'),
    size: z.number().optional().describe('File size in bytes'),
    errorMessage: z.string().optional().describe('Error message if operation failed'),
  }),
  execute: async ({ filePath, startLine, endLine }) => {
    try {
      const repo = Repository.find();
      const fullPath = path.join(repo.workDir, filePath);

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
          errorMessage: `File not found: ${filePath}`,
        };
      }

      if (isDirectory(fullPath)) {
        return {
          success: false,
          errorMessage: `Path is a directory, not a file: ${filePath}. Use listDirectory tool instead.`,
        };
      }

      // Read raw bytes to check if binary
      const rawContent = readFile(fullPath);
      const size = rawContent.length;

      // Check if binary (contains null bytes or high ratio of non-printable chars)
      const isBinary = detectBinary(rawContent);

      if (isBinary) {
        return {
          success: true,
          content: rawContent.toString('base64'),
          isBinary: true,
          size,
        };
      }

      // Text file
      const textContent = rawContent.toString('utf-8');
      const lines = textContent.split('\n');
      const totalLines = lines.length;

      // Handle line range
      let actualStartLine = startLine ?? 1;
      let actualEndLine = endLine ?? totalLines;

      // Clamp to valid range
      actualStartLine = Math.max(1, actualStartLine);
      actualEndLine = Math.min(totalLines, actualEndLine);

      if (actualStartLine > totalLines) {
        return {
          success: false,
          errorMessage: `Start line ${startLine} exceeds file length (${totalLines} lines)`,
        };
      }

      // Extract requested lines (convert to 0-indexed)
      const selectedLines = lines.slice(actualStartLine - 1, actualEndLine);
      const content = selectedLines.join('\n');

      return {
        success: true,
        content,
        isBinary: false,
        lineCount: totalLines,
        startLine: actualStartLine,
        endLine: actualEndLine,
        size,
      };
    } catch (err) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : 'Failed to read file',
      };
    }
  },
});

/**
 * Detect if content is binary
 */
function detectBinary(buffer: Buffer): boolean {
  // Check first 8KB for null bytes or high ratio of non-text chars
  const sampleSize = Math.min(buffer.length, 8192);
  let nullBytes = 0;
  let nonPrintable = 0;

  for (let i = 0; i < sampleSize; i++) {
    const byte = buffer[i];
    if (byte === 0) {
      nullBytes++;
    } else if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      // Not tab, newline, or carriage return
      nonPrintable++;
    }
  }

  // Consider binary if any null bytes or >30% non-printable
  return nullBytes > 0 || nonPrintable / sampleSize > 0.3;
}
