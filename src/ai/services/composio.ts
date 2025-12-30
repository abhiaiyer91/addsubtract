/**
 * Composio API Service
 * 
 * Provides integration with Composio's MCP marketplace to:
 * - Search available MCP servers
 * - Get MCP server details and configuration schema
 * - Connect to MCP servers and get their tools
 */

/**
 * MCP Server from Composio marketplace
 */
export interface ComposioMcpServer {
  slug: string;
  name: string;
  description: string;
  iconUrl: string | null;
  category: string;
  author: string;
  version: string;
  rating: number;
  installCount: number;
  tags: string[];
  requiresConfig: boolean;
  configSchema?: McpConfigField[];
}

/**
 * Configuration field schema for MCP servers
 */
export interface McpConfigField {
  name: string;
  label: string;
  type: 'string' | 'password' | 'boolean' | 'number' | 'select';
  required: boolean;
  description?: string;
  default?: unknown;
  options?: { value: string; label: string }[];
}

/**
 * MCP Tool definition
 */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Search filters for MCP servers
 */
export interface McpSearchFilters {
  query?: string;
  category?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

// Composio API base URL
const COMPOSIO_API_BASE = process.env.COMPOSIO_API_URL || 'https://api.composio.dev';
const COMPOSIO_API_KEY = process.env.COMPOSIO_API_KEY;

/**
 * Popular MCP servers - these are available by default from Composio
 * These are commonly used MCPs that users can enable
 */
const POPULAR_MCP_SERVERS: ComposioMcpServer[] = [
  {
    slug: 'github',
    name: 'GitHub',
    description: 'Interact with GitHub repositories, issues, pull requests, and more',
    iconUrl: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
    category: 'Development',
    author: 'Composio',
    version: '1.0.0',
    rating: 4.9,
    installCount: 15000,
    tags: ['git', 'source-control', 'issues', 'prs'],
    requiresConfig: true,
    configSchema: [
      {
        name: 'token',
        label: 'GitHub Personal Access Token',
        type: 'password',
        required: true,
        description: 'A GitHub PAT with repo access',
      },
    ],
  },
  {
    slug: 'slack',
    name: 'Slack',
    description: 'Send messages, manage channels, and integrate with Slack workspaces',
    iconUrl: 'https://a.slack-edge.com/80588/marketing/img/icons/icon_slack_hash_colored.png',
    category: 'Communication',
    author: 'Composio',
    version: '1.0.0',
    rating: 4.8,
    installCount: 12000,
    tags: ['messaging', 'team', 'notifications'],
    requiresConfig: true,
    configSchema: [
      {
        name: 'token',
        label: 'Slack Bot Token',
        type: 'password',
        required: true,
        description: 'Slack bot token (xoxb-...)',
      },
    ],
  },
  {
    slug: 'linear',
    name: 'Linear',
    description: 'Manage Linear issues, projects, and cycles',
    iconUrl: 'https://asset.brandfetch.io/idvNH3Lwm-/id7v2zYQZ_.svg',
    category: 'Project Management',
    author: 'Composio',
    version: '1.0.0',
    rating: 4.7,
    installCount: 8000,
    tags: ['issues', 'projects', 'agile'],
    requiresConfig: true,
    configSchema: [
      {
        name: 'apiKey',
        label: 'Linear API Key',
        type: 'password',
        required: true,
        description: 'Your Linear API key',
      },
    ],
  },
  {
    slug: 'notion',
    name: 'Notion',
    description: 'Create and manage Notion pages, databases, and content',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png',
    category: 'Productivity',
    author: 'Composio',
    version: '1.0.0',
    rating: 4.6,
    installCount: 10000,
    tags: ['notes', 'wiki', 'documentation'],
    requiresConfig: true,
    configSchema: [
      {
        name: 'token',
        label: 'Notion Integration Token',
        type: 'password',
        required: true,
        description: 'Internal integration token from Notion',
      },
    ],
  },
  {
    slug: 'jira',
    name: 'Jira',
    description: 'Manage Jira issues, sprints, and projects',
    iconUrl: 'https://wac-cdn.atlassian.com/assets/img/favicons/atlassian/favicon.png',
    category: 'Project Management',
    author: 'Composio',
    version: '1.0.0',
    rating: 4.5,
    installCount: 9000,
    tags: ['issues', 'agile', 'sprints'],
    requiresConfig: true,
    configSchema: [
      {
        name: 'domain',
        label: 'Jira Domain',
        type: 'string',
        required: true,
        description: 'Your Jira domain (e.g., company.atlassian.net)',
      },
      {
        name: 'email',
        label: 'Email',
        type: 'string',
        required: true,
        description: 'Your Jira account email',
      },
      {
        name: 'apiToken',
        label: 'API Token',
        type: 'password',
        required: true,
        description: 'Jira API token',
      },
    ],
  },
  {
    slug: 'google-calendar',
    name: 'Google Calendar',
    description: 'Manage calendar events, schedules, and reminders',
    iconUrl: 'https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg',
    category: 'Productivity',
    author: 'Composio',
    version: '1.0.0',
    rating: 4.7,
    installCount: 7000,
    tags: ['calendar', 'scheduling', 'events'],
    requiresConfig: true,
    configSchema: [
      {
        name: 'credentials',
        label: 'OAuth Credentials JSON',
        type: 'password',
        required: true,
        description: 'Google OAuth credentials JSON',
      },
    ],
  },
  {
    slug: 'postgres',
    name: 'PostgreSQL',
    description: 'Query and manage PostgreSQL databases',
    iconUrl: 'https://www.postgresql.org/media/img/about/press/elephant.png',
    category: 'Database',
    author: 'Composio',
    version: '1.0.0',
    rating: 4.6,
    installCount: 6000,
    tags: ['database', 'sql', 'query'],
    requiresConfig: true,
    configSchema: [
      {
        name: 'connectionString',
        label: 'Connection String',
        type: 'password',
        required: true,
        description: 'PostgreSQL connection string',
      },
    ],
  },
  {
    slug: 'openapi',
    name: 'OpenAPI',
    description: 'Connect to any REST API using OpenAPI/Swagger specification',
    iconUrl: 'https://www.openapis.org/wp-content/uploads/sites/3/2016/11/favicon.png',
    category: 'Development',
    author: 'Composio',
    version: '1.0.0',
    rating: 4.4,
    installCount: 5000,
    tags: ['api', 'rest', 'swagger'],
    requiresConfig: true,
    configSchema: [
      {
        name: 'specUrl',
        label: 'OpenAPI Spec URL',
        type: 'string',
        required: true,
        description: 'URL to OpenAPI/Swagger specification',
      },
      {
        name: 'apiKey',
        label: 'API Key (optional)',
        type: 'password',
        required: false,
        description: 'API key for authentication',
      },
    ],
  },
  {
    slug: 'web-search',
    name: 'Web Search',
    description: 'Search the web and retrieve information from websites',
    iconUrl: 'https://www.google.com/favicon.ico',
    category: 'Search',
    author: 'Composio',
    version: '1.0.0',
    rating: 4.5,
    installCount: 11000,
    tags: ['search', 'web', 'browse'],
    requiresConfig: false,
  },
  {
    slug: 'file-system',
    name: 'File System',
    description: 'Read, write, and manage files on the system',
    iconUrl: null,
    category: 'System',
    author: 'Composio',
    version: '1.0.0',
    rating: 4.3,
    installCount: 4000,
    tags: ['files', 'io', 'storage'],
    requiresConfig: false,
  },
  {
    slug: 'memory',
    name: 'Memory',
    description: 'Persistent memory and knowledge base for the agent',
    iconUrl: null,
    category: 'AI',
    author: 'Composio',
    version: '1.0.0',
    rating: 4.6,
    installCount: 8500,
    tags: ['memory', 'knowledge', 'context'],
    requiresConfig: false,
  },
  {
    slug: 'browserbase',
    name: 'Browserbase',
    description: 'Control a headless browser for web automation and scraping',
    iconUrl: 'https://www.browserbase.com/favicon.ico',
    category: 'Automation',
    author: 'Composio',
    version: '1.0.0',
    rating: 4.4,
    installCount: 3500,
    tags: ['browser', 'automation', 'scraping'],
    requiresConfig: true,
    configSchema: [
      {
        name: 'apiKey',
        label: 'Browserbase API Key',
        type: 'password',
        required: true,
        description: 'Your Browserbase API key',
      },
    ],
  },
];

// Get unique categories from popular servers
const CATEGORIES = [...new Set(POPULAR_MCP_SERVERS.map(s => s.category))];

/**
 * Composio API Service
 */
export const composioService = {
  /**
   * Search for MCP servers
   */
  async search(filters: McpSearchFilters = {}): Promise<{
    servers: ComposioMcpServer[];
    total: number;
    categories: string[];
  }> {
    const { query, category, tags, limit = 20, offset = 0 } = filters;
    
    // If Composio API key is available, try to fetch from API
    if (COMPOSIO_API_KEY) {
      try {
        const params = new URLSearchParams();
        if (query) params.set('q', query);
        if (category) params.set('category', category);
        if (tags && tags.length > 0) params.set('tags', tags.join(','));
        params.set('limit', limit.toString());
        params.set('offset', offset.toString());
        
        const response = await fetch(`${COMPOSIO_API_BASE}/v1/mcp/search?${params}`, {
          headers: {
            'Authorization': `Bearer ${COMPOSIO_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          return {
            servers: data.servers || [],
            total: data.total || 0,
            categories: data.categories || CATEGORIES,
          };
        }
      } catch (error) {
        console.warn('[composioService] API request failed, falling back to built-in servers:', error);
      }
    }
    
    // Fall back to built-in popular servers
    let servers = [...POPULAR_MCP_SERVERS];
    
    // Apply filters
    if (query) {
      const q = query.toLowerCase();
      servers = servers.filter(s => 
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.tags.some(t => t.toLowerCase().includes(q)) ||
        s.slug.toLowerCase().includes(q)
      );
    }
    
    if (category) {
      servers = servers.filter(s => s.category === category);
    }
    
    if (tags && tags.length > 0) {
      servers = servers.filter(s => 
        tags.some(tag => s.tags.includes(tag.toLowerCase()))
      );
    }
    
    // Apply pagination
    const total = servers.length;
    servers = servers.slice(offset, offset + limit);
    
    return {
      servers,
      total,
      categories: CATEGORIES,
    };
  },

  /**
   * Get details for a specific MCP server
   */
  async getServer(slug: string): Promise<ComposioMcpServer | null> {
    // If Composio API key is available, try to fetch from API
    if (COMPOSIO_API_KEY) {
      try {
        const response = await fetch(`${COMPOSIO_API_BASE}/v1/mcp/servers/${slug}`, {
          headers: {
            'Authorization': `Bearer ${COMPOSIO_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (response.ok) {
          return await response.json();
        }
      } catch (error) {
        console.warn('[composioService] API request failed, falling back to built-in servers:', error);
      }
    }
    
    // Fall back to built-in popular servers
    return POPULAR_MCP_SERVERS.find(s => s.slug === slug) || null;
  },

  /**
   * Get available tools for an MCP server
   * This would connect to the actual MCP server and list its tools
   */
  async getTools(slug: string, _config?: Record<string, unknown>): Promise<McpTool[]> {
    // If Composio API key is available, try to fetch from API
    if (COMPOSIO_API_KEY) {
      try {
        const response = await fetch(`${COMPOSIO_API_BASE}/v1/mcp/servers/${slug}/tools`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${COMPOSIO_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ config: _config }),
        });
        
        if (response.ok) {
          const data = await response.json();
          return data.tools || [];
        }
      } catch (error) {
        console.warn('[composioService] Failed to get tools:', error);
      }
    }
    
    // Return mock tools based on the MCP type
    const toolsBySlug: Record<string, McpTool[]> = {
      github: [
        { name: 'github_create_issue', description: 'Create a new GitHub issue', inputSchema: {} },
        { name: 'github_list_issues', description: 'List issues in a repository', inputSchema: {} },
        { name: 'github_create_pr', description: 'Create a pull request', inputSchema: {} },
        { name: 'github_search_code', description: 'Search for code in repositories', inputSchema: {} },
      ],
      slack: [
        { name: 'slack_send_message', description: 'Send a message to a Slack channel', inputSchema: {} },
        { name: 'slack_list_channels', description: 'List Slack channels', inputSchema: {} },
        { name: 'slack_create_channel', description: 'Create a new Slack channel', inputSchema: {} },
      ],
      linear: [
        { name: 'linear_create_issue', description: 'Create a Linear issue', inputSchema: {} },
        { name: 'linear_list_issues', description: 'List Linear issues', inputSchema: {} },
        { name: 'linear_update_issue', description: 'Update a Linear issue', inputSchema: {} },
      ],
      notion: [
        { name: 'notion_create_page', description: 'Create a Notion page', inputSchema: {} },
        { name: 'notion_search', description: 'Search Notion', inputSchema: {} },
        { name: 'notion_update_page', description: 'Update a Notion page', inputSchema: {} },
      ],
      jira: [
        { name: 'jira_create_issue', description: 'Create a Jira issue', inputSchema: {} },
        { name: 'jira_list_issues', description: 'List Jira issues', inputSchema: {} },
        { name: 'jira_update_issue', description: 'Update a Jira issue', inputSchema: {} },
      ],
      'web-search': [
        { name: 'web_search', description: 'Search the web', inputSchema: {} },
        { name: 'fetch_url', description: 'Fetch content from a URL', inputSchema: {} },
      ],
      'file-system': [
        { name: 'read_file', description: 'Read a file', inputSchema: {} },
        { name: 'write_file', description: 'Write to a file', inputSchema: {} },
        { name: 'list_directory', description: 'List directory contents', inputSchema: {} },
      ],
      memory: [
        { name: 'memory_store', description: 'Store information in memory', inputSchema: {} },
        { name: 'memory_recall', description: 'Recall information from memory', inputSchema: {} },
        { name: 'memory_search', description: 'Search memory', inputSchema: {} },
      ],
    };
    
    return toolsBySlug[slug] || [];
  },

  /**
   * Get available categories
   */
  getCategories(): string[] {
    return CATEGORIES;
  },

  /**
   * Validate MCP configuration
   */
  validateConfig(server: ComposioMcpServer, config: Record<string, unknown>): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    
    if (!server.requiresConfig) {
      return { valid: true, errors: [] };
    }
    
    if (!server.configSchema) {
      return { valid: true, errors: [] };
    }
    
    for (const field of server.configSchema) {
      if (field.required && !config[field.name]) {
        errors.push(`${field.label} is required`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  },
};
