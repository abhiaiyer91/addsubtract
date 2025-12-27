import { useCallback } from 'react';
import { useIDEStore, type AgentToolResult } from './ide-store';

/**
 * Hook to process agent tool calls and update the IDE state accordingly.
 * 
 * This parses the tool call results from agent responses and:
 * - Opens/updates files in the editor
 * - Shows command output in terminal
 * - Adds pending changes for review
 */
export function useAgentTools() {
  const processAgentToolResult = useIDEStore((s) => s.processAgentToolResult);
  const isIDEMode = useIDEStore((s) => s.isIDEMode);

  /**
   * Process a list of tool calls from an agent response
   */
  const processToolCalls = useCallback(
    (toolCalls: any[] | undefined) => {
      if (!toolCalls || !isIDEMode) return;

      for (const call of toolCalls) {
        // Each tool call has a name and result
        const toolName = call.toolName || call.name || '';
        const result = call.result || call.output || {};

        const agentResult: AgentToolResult = {
          toolName,
          success: result.success ?? true,
          filePath: result.filePath || result.path,
          content: result.content,
          message: result.message,
          command: result.command,
          output: result.output,
        };

        processAgentToolResult(agentResult);
      }
    },
    [processAgentToolResult, isIDEMode]
  );

  /**
   * Parse tool results from assistant message content
   * (for when tool results are embedded in the message text)
   */
  const parseToolResultsFromMessage = useCallback(
    (content: string) => {
      if (!isIDEMode) return;

      // Look for common patterns in agent responses
      // Pattern: "Created file: path/to/file.ts"
      const createdMatch = content.match(/Created file:\s*([^\s\n]+)/i);
      if (createdMatch) {
        processAgentToolResult({
          toolName: 'wit-write-file',
          success: true,
          filePath: createdMatch[1],
          message: 'File created by agent',
        });
      }

      // Pattern: "Updated file: path/to/file.ts"
      const updatedMatch = content.match(/Updated file:\s*([^\s\n]+)/i);
      if (updatedMatch) {
        processAgentToolResult({
          toolName: 'wit-edit-file',
          success: true,
          filePath: updatedMatch[1],
          message: 'File updated by agent',
        });
      }

      // Pattern for command execution
      const commandMatch = content.match(/Executed:\s*`([^`]+)`/i);
      if (commandMatch) {
        processAgentToolResult({
          toolName: 'wit-run-command',
          success: true,
          command: commandMatch[1],
        });
      }
    },
    [processAgentToolResult, isIDEMode]
  );

  return {
    processToolCalls,
    parseToolResultsFromMessage,
  };
}
