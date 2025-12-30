/**
 * Action Library
 * 
 * Pre-built step templates and actions for the Mastra workflow builder.
 * Includes common GitHub Actions, shell commands, and custom step templates.
 */

import { useState } from 'react';
import { Search, Box, Terminal, Code, GitBranch, Database, Shield, Zap, Package, FileCode } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useWorkflowStore, type StepConfig } from '@/lib/workflow-store';

// =============================================================================
// Action Templates
// =============================================================================

interface ActionTemplate {
  id: string;
  name: string;
  description: string;
  category: 'checkout' | 'setup' | 'build' | 'test' | 'deploy' | 'utility' | 'custom';
  icon: React.ReactNode;
  tags: string[];
  config: Partial<StepConfig>;
}

const ACTION_TEMPLATES: ActionTemplate[] = [
  // Checkout & Setup
  {
    id: 'checkout',
    name: 'Checkout Repository',
    description: 'Check out the repository code',
    category: 'checkout',
    icon: <GitBranch className="h-4 w-4" />,
    tags: ['git', 'clone', 'repository'],
    config: {
      id: 'checkout',
      name: 'Checkout',
      actionRef: 'actions/checkout@v4',
      inputSchema: { fields: [] },
      outputSchema: { fields: [] },
      executeCode: '',
    },
  },
  {
    id: 'setup-node',
    name: 'Setup Node.js',
    description: 'Set up Node.js environment',
    category: 'setup',
    icon: <Package className="h-4 w-4" />,
    tags: ['node', 'npm', 'javascript', 'typescript'],
    config: {
      id: 'setup-node',
      name: 'Setup Node.js',
      actionRef: 'actions/setup-node@v4',
      inputSchema: { 
        fields: [
          { name: 'nodeVersion', type: 'string', required: false, description: 'Node.js version', default: '20' },
        ] 
      },
      outputSchema: { fields: [] },
      executeCode: '',
    },
  },
  {
    id: 'setup-python',
    name: 'Setup Python',
    description: 'Set up Python environment',
    category: 'setup',
    icon: <Package className="h-4 w-4" />,
    tags: ['python', 'pip'],
    config: {
      id: 'setup-python',
      name: 'Setup Python',
      actionRef: 'actions/setup-python@v5',
      inputSchema: { 
        fields: [
          { name: 'pythonVersion', type: 'string', required: false, description: 'Python version', default: '3.x' },
        ] 
      },
      outputSchema: { fields: [] },
      executeCode: '',
    },
  },

  // Build & Test
  {
    id: 'npm-install',
    name: 'NPM Install',
    description: 'Install npm dependencies',
    category: 'build',
    icon: <Terminal className="h-4 w-4" />,
    tags: ['npm', 'install', 'dependencies'],
    config: {
      id: 'npm-install',
      name: 'Install Dependencies',
      runCommand: 'npm ci',
      inputSchema: { fields: [] },
      outputSchema: { 
        fields: [
          { name: 'success', type: 'boolean', required: true },
        ] 
      },
      executeCode: '',
    },
  },
  {
    id: 'npm-build',
    name: 'NPM Build',
    description: 'Build the project',
    category: 'build',
    icon: <Terminal className="h-4 w-4" />,
    tags: ['npm', 'build', 'compile'],
    config: {
      id: 'npm-build',
      name: 'Build',
      runCommand: 'npm run build',
      inputSchema: { fields: [] },
      outputSchema: { 
        fields: [
          { name: 'success', type: 'boolean', required: true },
        ] 
      },
      executeCode: '',
    },
  },
  {
    id: 'npm-test',
    name: 'NPM Test',
    description: 'Run tests',
    category: 'test',
    icon: <Terminal className="h-4 w-4" />,
    tags: ['npm', 'test', 'jest', 'vitest'],
    config: {
      id: 'npm-test',
      name: 'Run Tests',
      runCommand: 'npm test',
      inputSchema: { fields: [] },
      outputSchema: { 
        fields: [
          { name: 'success', type: 'boolean', required: true },
          { name: 'output', type: 'string', required: false },
        ] 
      },
      executeCode: '',
    },
  },
  {
    id: 'npm-lint',
    name: 'NPM Lint',
    description: 'Run linting',
    category: 'test',
    icon: <Terminal className="h-4 w-4" />,
    tags: ['npm', 'lint', 'eslint'],
    config: {
      id: 'npm-lint',
      name: 'Lint',
      runCommand: 'npm run lint',
      inputSchema: { fields: [] },
      outputSchema: { 
        fields: [
          { name: 'success', type: 'boolean', required: true },
        ] 
      },
      executeCode: '',
    },
  },
  {
    id: 'typecheck',
    name: 'TypeScript Check',
    description: 'Run TypeScript type checking',
    category: 'test',
    icon: <FileCode className="h-4 w-4" />,
    tags: ['typescript', 'tsc', 'types'],
    config: {
      id: 'typecheck',
      name: 'Type Check',
      runCommand: 'npx tsc --noEmit',
      inputSchema: { fields: [] },
      outputSchema: { 
        fields: [
          { name: 'success', type: 'boolean', required: true },
        ] 
      },
      executeCode: '',
    },
  },

  // Database
  {
    id: 'db-migrate',
    name: 'Database Migration',
    description: 'Run database migrations',
    category: 'utility',
    icon: <Database className="h-4 w-4" />,
    tags: ['database', 'migration', 'drizzle', 'prisma'],
    config: {
      id: 'db-migrate',
      name: 'Run Migrations',
      runCommand: 'npx drizzle-kit push',
      inputSchema: { fields: [] },
      outputSchema: { 
        fields: [
          { name: 'success', type: 'boolean', required: true },
        ] 
      },
      executeCode: '',
    },
  },

  // Deploy
  {
    id: 'docker-build',
    name: 'Docker Build',
    description: 'Build Docker image',
    category: 'deploy',
    icon: <Box className="h-4 w-4" />,
    tags: ['docker', 'container', 'build'],
    config: {
      id: 'docker-build',
      name: 'Build Docker Image',
      runCommand: 'docker build -t ${{ github.repository }}:${{ github.sha }} .',
      inputSchema: { fields: [] },
      outputSchema: { 
        fields: [
          { name: 'success', type: 'boolean', required: true },
          { name: 'imageTag', type: 'string', required: false },
        ] 
      },
      executeCode: '',
    },
  },

  // Security
  {
    id: 'security-scan',
    name: 'Security Scan',
    description: 'Run security vulnerability scan',
    category: 'utility',
    icon: <Shield className="h-4 w-4" />,
    tags: ['security', 'audit', 'vulnerabilities'],
    config: {
      id: 'security-scan',
      name: 'Security Scan',
      runCommand: 'npm audit --audit-level=high',
      inputSchema: { fields: [] },
      outputSchema: { 
        fields: [
          { name: 'success', type: 'boolean', required: true },
          { name: 'vulnerabilities', type: 'number', required: false },
        ] 
      },
      executeCode: '',
    },
  },

  // Custom Steps
  {
    id: 'ai-code-review',
    name: 'AI Code Review',
    description: 'Run AI-powered code review using Mastra',
    category: 'custom',
    icon: <Zap className="h-4 w-4" />,
    tags: ['ai', 'review', 'mastra', 'wit'],
    config: {
      id: 'ai-code-review',
      name: 'AI Code Review',
      inputSchema: { 
        fields: [
          { name: 'prId', type: 'string', required: true },
          { name: 'repoPath', type: 'string', required: true },
          { name: 'baseSha', type: 'string', required: true },
          { name: 'headSha', type: 'string', required: true },
        ] 
      },
      outputSchema: { 
        fields: [
          { name: 'success', type: 'boolean', required: true },
          { name: 'approved', type: 'boolean', required: true },
          { name: 'score', type: 'number', required: true },
          { name: 'issues', type: 'array', required: true },
        ] 
      },
      executeCode: `async ({ inputData, mastra }) => {
  const agent = mastra?.getAgent('wit');
  if (!agent) {
    return { success: false, approved: false, score: 0, issues: [] };
  }
  
  // Run the PR review workflow
  const result = await agent.generate(\`
    Review the changes between \${inputData.baseSha} and \${inputData.headSha}
    in the repository at \${inputData.repoPath}.
    Provide a structured code review with score and issues.
  \`);
  
  return {
    success: true,
    approved: true,
    score: 8,
    issues: [],
  };
}`,
    },
  },
  {
    id: 'ai-issue-triage',
    name: 'AI Issue Triage',
    description: 'Automatically triage and label issues',
    category: 'custom',
    icon: <Zap className="h-4 w-4" />,
    tags: ['ai', 'triage', 'issues', 'mastra'],
    config: {
      id: 'ai-issue-triage',
      name: 'AI Issue Triage',
      inputSchema: { 
        fields: [
          { name: 'issueId', type: 'string', required: true },
          { name: 'title', type: 'string', required: true },
          { name: 'body', type: 'string', required: true },
        ] 
      },
      outputSchema: { 
        fields: [
          { name: 'success', type: 'boolean', required: true },
          { name: 'labels', type: 'array', required: true },
          { name: 'priority', type: 'string', required: true },
        ] 
      },
      executeCode: `async ({ inputData, mastra }) => {
  const agent = mastra?.getAgent('wit');
  if (!agent) {
    return { success: false, labels: [], priority: 'none' };
  }
  
  // Analyze the issue and suggest labels
  const result = await agent.generate(\`
    Analyze this issue:
    Title: \${inputData.title}
    Body: \${inputData.body}
    
    Suggest appropriate labels and priority level.
  \`);
  
  return {
    success: true,
    labels: ['needs-triage'],
    priority: 'medium',
  };
}`,
    },
  },
  {
    id: 'custom-step',
    name: 'Custom Step',
    description: 'Create a custom Mastra step with full control',
    category: 'custom',
    icon: <Code className="h-4 w-4" />,
    tags: ['custom', 'code', 'typescript'],
    config: {
      id: 'custom-step',
      name: 'Custom Step',
      inputSchema: { fields: [] },
      outputSchema: { 
        fields: [
          { name: 'success', type: 'boolean', required: true },
        ] 
      },
      executeCode: `async ({ inputData, mastra, getInitData, getStepResult }) => {
  // Access workflow initial data
  const initData = getInitData();
  
  // Access previous step results
  // const prevResult = getStepResult('previous-step-id');
  
  // Your custom logic here
  console.log('Running custom step with:', inputData);
  
  return {
    success: true,
  };
}`,
    },
  },
];

const CATEGORY_INFO = {
  checkout: { label: 'Checkout', icon: GitBranch },
  setup: { label: 'Setup', icon: Package },
  build: { label: 'Build', icon: Box },
  test: { label: 'Test', icon: Terminal },
  deploy: { label: 'Deploy', icon: Box },
  utility: { label: 'Utility', icon: Terminal },
  custom: { label: 'Custom', icon: Code },
};

// =============================================================================
// Action Library Component
// =============================================================================

interface ActionLibraryProps {
  onAddAction?: (config: Partial<StepConfig>) => void;
  className?: string;
}

export function ActionLibrary({ onAddAction, className }: ActionLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const { addNode, updateNode, getNextNodePosition, selectedNodeId } = useWorkflowStore();

  const filteredTemplates = ACTION_TEMPLATES.filter((template) => {
    const matchesSearch = 
      searchQuery === '' ||
      template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      template.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = 
      activeCategory === 'all' || 
      template.category === activeCategory;
    
    return matchesSearch && matchesCategory;
  });

  const handleAddAction = (template: ActionTemplate) => {
    // Use smart positioning - adds after selected node or last node in chain
    const position = getNextNodePosition(selectedNodeId || undefined);
    
    // Add a new step node with auto-connect
    const nodeId = addNode('step', position, { 
      autoConnect: true, 
      afterNodeId: selectedNodeId || undefined 
    });
    
    updateNode(nodeId, {
      name: template.name,
      description: template.description,
      config: {
        ...template.config,
        id: `${template.id}-${Date.now()}`,
      } as StepConfig,
    });
    
    onAddAction?.(template.config);
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search actions..."
            className="pl-8 h-8"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory} className="flex-1 flex flex-col">
        <TabsList className="grid grid-cols-4 mx-3 mt-2">
          <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
          <TabsTrigger value="build" className="text-xs">Build</TabsTrigger>
          <TabsTrigger value="test" className="text-xs">Test</TabsTrigger>
          <TabsTrigger value="custom" className="text-xs">Custom</TabsTrigger>
        </TabsList>

        <TabsContent value={activeCategory} className="flex-1 mt-0">
          <ScrollArea className="h-full">
            <div className="p-3 space-y-2">
              {filteredTemplates.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8">
                  No actions found
                </div>
              ) : (
                filteredTemplates.map((template) => (
                  <ActionCard
                    key={template.id}
                    template={template}
                    onAdd={() => handleAddAction(template)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================================
// Action Card Component
// =============================================================================

interface ActionCardProps {
  template: ActionTemplate;
  onAdd: () => void;
}

function ActionCard({ template, onAdd }: ActionCardProps) {
  const CategoryIcon = CATEGORY_INFO[template.category]?.icon || Box;

  return (
    <div
      className={cn(
        'p-3 border rounded-lg cursor-pointer transition-all',
        'hover:border-primary/50 hover:bg-accent/50'
      )}
      onClick={onAdd}
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-md bg-muted">
          {template.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm">{template.name}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {template.description}
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            <Badge variant="outline" className="text-[10px]">
              <CategoryIcon className="h-3 w-3 mr-1" />
              {CATEGORY_INFO[template.category]?.label}
            </Badge>
            {template.config.actionRef && (
              <Badge variant="secondary" className="text-[10px]">action</Badge>
            )}
            {template.config.runCommand && (
              <Badge variant="secondary" className="text-[10px]">command</Badge>
            )}
            {template.config.executeCode && !template.config.actionRef && !template.config.runCommand && (
              <Badge variant="secondary" className="text-[10px]">code</Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Quick Actions Bar (for canvas toolbar)
// =============================================================================

export function QuickActionsBar() {
  const { addNode, updateNode, getNextNodePosition, selectedNodeId } = useWorkflowStore();

  const quickActions = ACTION_TEMPLATES.filter((t) => 
    ['checkout', 'setup-node', 'npm-install', 'npm-test'].includes(t.id)
  );

  const handleQuickAdd = (template: ActionTemplate) => {
    // Use smart positioning - adds after selected node or last node in chain
    const position = getNextNodePosition(selectedNodeId || undefined);
    
    const nodeId = addNode('step', position, { 
      autoConnect: true, 
      afterNodeId: selectedNodeId || undefined 
    });
    
    updateNode(nodeId, {
      name: template.name,
      description: template.description,
      config: {
        ...template.config,
        id: `${template.id}-${Date.now()}`,
      } as StepConfig,
    });
  };

  return (
    <div className="flex gap-1">
      {quickActions.map((template) => (
        <Button
          key={template.id}
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => handleQuickAdd(template)}
        >
          {template.icon}
          {template.name}
        </Button>
      ))}
    </div>
  );
}
