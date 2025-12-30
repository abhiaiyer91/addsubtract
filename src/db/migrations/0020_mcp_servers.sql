-- MCP Servers Migration
-- Adds support for Model Context Protocol (MCP) server integrations

-- Create the repo_mcp_servers table
CREATE TABLE IF NOT EXISTS repo_mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Repository this MCP server is enabled for
  repo_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  
  -- Composio MCP server slug/identifier
  mcp_slug TEXT NOT NULL,
  
  -- Display name of the MCP server
  name TEXT NOT NULL,
  
  -- Description of what the MCP server does
  description TEXT,
  
  -- Icon URL for the MCP server
  icon_url TEXT,
  
  -- Category/type of the MCP (e.g., 'productivity', 'development', 'data')
  category TEXT,
  
  -- Whether this MCP is currently enabled
  enabled BOOLEAN NOT NULL DEFAULT true,
  
  -- Configuration JSON for the MCP (API keys, settings, etc.) - encrypted
  config_encrypted TEXT,
  
  -- User who enabled this MCP
  enabled_by_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_repo_mcp_servers_repo_id ON repo_mcp_servers(repo_id);
CREATE INDEX IF NOT EXISTS idx_repo_mcp_servers_slug ON repo_mcp_servers(mcp_slug);

-- Create unique constraint on repo + mcp slug
CREATE UNIQUE INDEX IF NOT EXISTS unique_repo_mcp ON repo_mcp_servers(repo_id, mcp_slug);
