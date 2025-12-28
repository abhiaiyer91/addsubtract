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
        // Handle different tool call formats from different agents
        // Format 1: { toolName, result } - from code agent
        // Format 2: { payload: { toolName, args }, result } - from mastra
        // Format 3: { type: 'tool-call', payload: { toolName, args } } - event format
        
        let toolName = call.toolName || call.name || '';
        let result = call.result || call.output || {};
        
        // Handle payload wrapper format
        if (call.payload) {
          toolName = call.payload.toolName || toolName;
          // Args might contain the result data
          if (call.payload.args) {
            result = { ...result, ...call.payload.args };
          }
        }

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
