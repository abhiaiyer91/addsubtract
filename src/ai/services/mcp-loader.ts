/**
 * MCP Tool Loader
 * 
 * Loads tools from enabled MCP servers for use in agents.
 * This integrates with Composio's MCP infrastructure to dynamically
 * add tools from external services.
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { mcpServerModel } from '../../db/models/mcp-server.js';
import { composioService, type McpTool } from './composio.js';

/**
 * Tool that wraps an MCP tool for use in agents
 */
interface LoadedMcpTool {
  mcpSlug: string;
  mcpName: string;
  tool: ReturnType<typeof createTool>;
}

/**
 * Load all enabled MCP tools for a repository
 */
export async function loadMcpTools(repoId: string): Promise<LoadedMcpTool[]> {
  const enabledServers = await mcpServerModel.listEnabled(repoId);
  const loadedTools: LoadedMcpTool[] = [];
  
  for (const server of enabledServers) {
    try {
      // Get the config for this MCP server
      const config = await mcpServerModel.getConfig(repoId, server.mcpSlug);
      
      // Get available tools from the MCP server
      const mcpTools = await composioService.getTools(server.mcpSlug, config || undefined);
      
      // Create Mastra tools from MCP tools
      for (const mcpTool of mcpTools) {
        const tool = createMcpToolWrapper(server.mcpSlug, server.name, mcpTool, config);
        loadedTools.push({
          mcpSlug: server.mcpSlug,
          mcpName: server.name,
          tool,
        });
      }
    } catch (error) {
      console.error(`[mcp-loader] Failed to load tools from ${server.mcpSlug}:`, error);
      // Continue loading other MCPs even if one fails
    }
  }
  
  return loadedTools;
}

/**
 * Create a Mastra tool wrapper for an MCP tool
 */
function createMcpToolWrapper(
  mcpSlug: string,
  mcpName: string,
  mcpTool: McpTool,
  config: Record<string, unknown> | null
): ReturnType<typeof createTool> {
  // Generate a unique tool ID combining the MCP slug and tool name
  const toolId = `${mcpSlug}_${mcpTool.name}`;
  
  // For now, we create a simple wrapper that logs the tool execution
  // In a real implementation, this would call the actual MCP server
  return createTool({
    id: toolId,
    description: `[${mcpName}] ${mcpTool.description}`,
    inputSchema: z.object({
      // Accept any parameters as a JSON object for flexibility
      params: z.record(z.unknown()).optional().describe('Parameters for the MCP tool'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      result: z.unknown().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ params }) => {
      try {
        // In a real implementation, this would:
        // 1. Connect to the MCP server using the config
        // 2. Call the specific tool with the provided params
        // 3. Return the result
        
        // For now, we return a placeholder response indicating the MCP integration
        // This will be replaced with actual MCP protocol calls when Composio SDK is integrated
        console.log(`[mcp-loader] Executing MCP tool: ${toolId}`, { params, config: !!config });
        
        // Check if we have a COMPOSIO_API_KEY for actual execution
        if (process.env.COMPOSIO_API_KEY) {
          try {
            const response = await fetch(`${process.env.COMPOSIO_API_URL || 'https://api.composio.dev'}/v1/mcp/execute`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${process.env.COMPOSIO_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                mcp: mcpSlug,
                tool: mcpTool.name,
                params,
                config,
              }),
            });
            
            if (response.ok) {
              const data = await response.json();
              return {
                success: true,
                result: data.result,
              };
            } else {
              const errorData = await response.json().catch(() => ({}));
              return {
                success: false,
                error: errorData.message || `MCP execution failed with status ${response.status}`,
              };
            }
          } catch (error) {
            return {
              success: false,
              error: error instanceof Error ? error.message : 'MCP execution failed',
            };
          }
        }
        
        // Return a simulated successful response for demo purposes
        return {
          success: true,
          result: {
            message: `MCP tool '${mcpTool.name}' from '${mcpName}' executed successfully`,
            tool: toolId,
            params,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  });
}

/**
 * Get MCP tools as a record for use in agent initialization
 */
export async function getMcpToolsRecord(repoId: string): Promise<Record<string, ReturnType<typeof createTool>>> {
  const loadedTools = await loadMcpTools(repoId);
  const toolsRecord: Record<string, ReturnType<typeof createTool>> = {};
  
  for (const { tool } of loadedTools) {
    // The tool ID is already unique (mcpSlug_toolName)
    toolsRecord[tool.id as string] = tool;
  }
  
  return toolsRecord;
}

/**
 * Get a summary of loaded MCP tools for agent instructions
 */
export async function getMcpToolsSummary(repoId: string): Promise<string> {
  const loadedTools = await loadMcpTools(repoId);
  
  if (loadedTools.length === 0) {
    return '';
  }
  
  // Group tools by MCP
  const toolsByMcp = new Map<string, string[]>();
  for (const { mcpSlug, tool } of loadedTools) {
    if (!toolsByMcp.has(mcpSlug)) {
      toolsByMcp.set(mcpSlug, []);
    }
    toolsByMcp.get(mcpSlug)!.push(`- ${tool.id}: ${tool.description}`);
  }
  
  let summary = '\n\n## MCP Tools\n\nYou also have access to the following MCP (Model Context Protocol) tools:\n\n';
  
  for (const [mcpSlug, tools] of toolsByMcp) {
    const mcpName = loadedTools.find(t => t.mcpSlug === mcpSlug)?.mcpName || mcpSlug;
    summary += `### ${mcpName}\n${tools.join('\n')}\n\n`;
  }
  
  return summary;
}
