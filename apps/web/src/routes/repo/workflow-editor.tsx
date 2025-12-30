/**
 * Workflow Editor Page - Redesigned
 * 
 * Simplified workflow builder focused on ease of use.
 * Key principles:
 * - Template-first: Start from common workflow templates
 * - Inline editing: Configure steps directly in the flow
 * - AI-assisted: Describe what you want in plain English
 * - Smart defaults: Auto-configure based on context
 */

import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Save, 
  Plus,
  Play,
  ChevronLeft,
  Sparkles,
  Trash2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Terminal,
  Zap,
  GitBranch,
  Clock,
  MousePointer,
  Check,
  X,
  Code,
  FileCode,
  Copy,
  MoreHorizontal,
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { trpc } from '@/lib/trpc';
import { RepoLayout } from './components/repo-layout';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

type TriggerType = 'push' | 'pull_request' | 'manual' | 'schedule';

interface WorkflowTrigger {
  type: TriggerType;
  branches?: string[];
  cron?: string;
}

interface WorkflowStep {
  id: string;
  name: string;
  type: 'command' | 'action' | 'ai';
  command?: string;
  actionRef?: string;
  aiPrompt?: string;
  enabled: boolean;
}

interface SimpleWorkflow {
  id: string;
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
}

// =============================================================================
// Workflow Templates
// =============================================================================

const WORKFLOW_TEMPLATES: Array<{
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  workflow: SimpleWorkflow;
}> = [
  {
    id: 'ci-basic',
    name: 'Basic CI',
    description: 'Install, lint, test, and build on every push',
    icon: <Terminal className="h-5 w-5" />,
    workflow: {
      id: 'basic-ci',
      name: 'CI',
      description: 'Continuous integration workflow',
      trigger: { type: 'push', branches: ['main', 'develop'] },
      steps: [
        { id: '1', name: 'Install dependencies', type: 'command', command: 'npm ci', enabled: true },
        { id: '2', name: 'Run linter', type: 'command', command: 'npm run lint', enabled: true },
        { id: '3', name: 'Run tests', type: 'command', command: 'npm test', enabled: true },
        { id: '4', name: 'Build', type: 'command', command: 'npm run build', enabled: true },
      ],
    },
  },
  {
    id: 'pr-review',
    name: 'PR Review',
    description: 'AI-powered code review on pull requests',
    icon: <Sparkles className="h-5 w-5" />,
    workflow: {
      id: 'pr-review',
      name: 'PR Review',
      description: 'Automated pull request review',
      trigger: { type: 'pull_request', branches: ['main'] },
      steps: [
        { id: '1', name: 'Install dependencies', type: 'command', command: 'npm ci', enabled: true },
        { id: '2', name: 'Run tests', type: 'command', command: 'npm test', enabled: true },
        { id: '3', name: 'AI Code Review', type: 'ai', aiPrompt: 'Review the code changes for bugs, security issues, and best practices. Leave helpful comments.', enabled: true },
      ],
    },
  },
  {
    id: 'deploy',
    name: 'Deploy',
    description: 'Build and deploy when pushing to main',
    icon: <Zap className="h-5 w-5" />,
    workflow: {
      id: 'deploy',
      name: 'Deploy',
      description: 'Build and deploy to production',
      trigger: { type: 'push', branches: ['main'] },
      steps: [
        { id: '1', name: 'Install dependencies', type: 'command', command: 'npm ci', enabled: true },
        { id: '2', name: 'Build', type: 'command', command: 'npm run build', enabled: true },
        { id: '3', name: 'Deploy', type: 'command', command: 'npm run deploy', enabled: true },
      ],
    },
  },
  {
    id: 'scheduled',
    name: 'Scheduled Task',
    description: 'Run tasks on a schedule (cron)',
    icon: <Clock className="h-5 w-5" />,
    workflow: {
      id: 'scheduled',
      name: 'Scheduled Task',
      description: 'Runs on a schedule',
      trigger: { type: 'schedule', cron: '0 0 * * *' },
      steps: [
        { id: '1', name: 'Your task here', type: 'command', command: 'echo "Hello, world!"', enabled: true },
      ],
    },
  },
  {
    id: 'blank',
    name: 'Blank Workflow',
    description: 'Start from scratch',
    icon: <Plus className="h-5 w-5" />,
    workflow: {
      id: 'blank',
      name: 'My Workflow',
      description: '',
      trigger: { type: 'manual' },
      steps: [],
    },
  },
];

// =============================================================================
// Main Editor Component
// =============================================================================

export function WorkflowEditor() {
  const { owner, repo } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editPath = searchParams.get('path');

  const [workflow, setWorkflow] = useState<SimpleWorkflow | null>(null);
  const [showTemplates, setShowTemplates] = useState(!editPath);
  const [activeView, setActiveView] = useState<'visual' | 'code'>('visual');
  const [isDirty, setIsDirty] = useState(false);
  const [aiStepPrompt, setAiStepPrompt] = useState('');
  const [showAiDialog, setShowAiDialog] = useState(false);

  // Save mutation
  const saveMutation = (trpc as any).repos.updateFile.useMutation({
    onSuccess: () => {
      navigate(`/${owner}/${repo}/actions`);
    },
  });

  const handleSelectTemplate = (template: typeof WORKFLOW_TEMPLATES[0]) => {
    setWorkflow(JSON.parse(JSON.stringify(template.workflow)));
    setShowTemplates(false);
    setIsDirty(true);
  };

  const handleSave = useCallback(() => {
    if (!workflow) return;
    
    const code = generateWorkflowCode(workflow);
    const filename = workflow.name.toLowerCase().replace(/\s+/g, '-');
    const path = editPath || `.wit/workflows/${filename}.workflow.ts`;
    
    saveMutation.mutate({
      owner: owner!,
      repo: repo!,
      path,
      content: code,
      message: editPath ? `Update workflow: ${workflow.name}` : `Create workflow: ${workflow.name}`,
      ref: 'main',
    });
  }, [workflow, editPath, owner, repo, saveMutation]);

  const updateWorkflow = (updates: Partial<SimpleWorkflow>) => {
    if (!workflow) return;
    setWorkflow({ ...workflow, ...updates });
    setIsDirty(true);
  };

  const updateStep = (stepId: string, updates: Partial<WorkflowStep>) => {
    if (!workflow) return;
    setWorkflow({
      ...workflow,
      steps: workflow.steps.map(s => s.id === stepId ? { ...s, ...updates } : s),
    });
    setIsDirty(true);
  };

  const addStep = (type: WorkflowStep['type'], insertAfterIndex?: number) => {
    if (!workflow) return;
    const newStep: WorkflowStep = {
      id: `step-${Date.now()}`,
      name: type === 'ai' ? 'AI Step' : 'New Step',
      type,
      command: type === 'command' ? '' : undefined,
      aiPrompt: type === 'ai' ? '' : undefined,
      enabled: true,
    };
    
    const newSteps = [...workflow.steps];
    const insertIndex = insertAfterIndex !== undefined ? insertAfterIndex + 1 : newSteps.length;
    newSteps.splice(insertIndex, 0, newStep);
    
    setWorkflow({ ...workflow, steps: newSteps });
    setIsDirty(true);
  };

  const deleteStep = (stepId: string) => {
    if (!workflow) return;
    setWorkflow({
      ...workflow,
      steps: workflow.steps.filter(s => s.id !== stepId),
    });
    setIsDirty(true);
  };

  const moveStep = (fromIndex: number, toIndex: number) => {
    if (!workflow) return;
    const newSteps = [...workflow.steps];
    const [removed] = newSteps.splice(fromIndex, 1);
    newSteps.splice(toIndex, 0, removed);
    setWorkflow({ ...workflow, steps: newSteps });
    setIsDirty(true);
  };

  const handleAddAiStep = () => {
    if (!workflow || !aiStepPrompt.trim()) return;
    
    const newStep: WorkflowStep = {
      id: `step-${Date.now()}`,
      name: aiStepPrompt.slice(0, 40) + (aiStepPrompt.length > 40 ? '...' : ''),
      type: 'ai',
      aiPrompt: aiStepPrompt,
      enabled: true,
    };
    
    setWorkflow({ ...workflow, steps: [...workflow.steps, newStep] });
    setAiStepPrompt('');
    setShowAiDialog(false);
    setIsDirty(true);
  };

  // Template selection screen
  if (showTemplates) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="max-w-4xl mx-auto py-8 px-4">
          <div className="mb-8">
            <h1 className="text-2xl font-bold mb-2">Create a Workflow</h1>
            <p className="text-muted-foreground">
              Choose a template to get started, or create a blank workflow.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {WORKFLOW_TEMPLATES.map((template) => (
              <Card
                key={template.id}
                className={cn(
                  'cursor-pointer transition-all hover:border-primary hover:shadow-md',
                  template.id === 'blank' && 'border-dashed'
                )}
                onClick={() => handleSelectTemplate(template)}
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-muted">
                      {template.icon}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">{template.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {template.description}
                      </p>
                      {template.id !== 'blank' && (
                        <div className="flex items-center gap-2 mt-3">
                          <Badge variant="secondary" className="text-xs">
                            {template.workflow.steps.length} steps
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            <TriggerIcon type={template.workflow.trigger.type} className="h-3 w-3 mr-1" />
                            {template.workflow.trigger.type}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* AI Workflow Generation */}
          <Card className="mt-8 border-primary/20 bg-primary/5">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">Describe your workflow</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Tell us what you want to automate and we'll create a workflow for you.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g., Run tests and deploy to staging when pushing to develop branch"
                      className="flex-1"
                    />
                    <Button>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </RepoLayout>
    );
  }

  if (!workflow) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </RepoLayout>
    );
  }

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="flex flex-col h-[calc(100vh-200px)] min-h-[500px]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            
            <Separator orientation="vertical" className="h-6" />
            
            <Input
              value={workflow.name}
              onChange={(e) => updateWorkflow({ name: e.target.value })}
              className="w-64 h-8 text-base font-semibold border-none shadow-none focus-visible:ring-0 px-0"
              placeholder="Workflow name"
            />
            
            {isDirty && (
              <Badge variant="secondary" className="text-xs">
                Unsaved
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Tabs value={activeView} onValueChange={(v) => setActiveView(v as 'visual' | 'code')}>
              <TabsList className="h-8">
                <TabsTrigger value="visual" className="text-xs h-7 px-3">Visual</TabsTrigger>
                <TabsTrigger value="code" className="text-xs h-7 px-3">Code</TabsTrigger>
              </TabsList>
            </Tabs>
            
            <Separator orientation="vertical" className="h-6" />
            
            <Button variant="outline" size="sm">
              <Play className="h-4 w-4 mr-1.5" />
              Test
            </Button>
            
            <Button size="sm" onClick={handleSave} disabled={!isDirty}>
              <Save className="h-4 w-4 mr-1.5" />
              Save
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          {activeView === 'visual' ? (
            <ScrollArea className="h-full">
              <div className="max-w-3xl mx-auto py-6 px-4">
                {/* Trigger Section */}
                <TriggerEditor 
                  trigger={workflow.trigger}
                  onChange={(trigger) => updateWorkflow({ trigger })}
                />

                {/* Steps Section */}
                <div className="mt-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                      Steps
                    </h2>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Plus className="h-4 w-4 mr-1.5" />
                          Add Step
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => addStep('command')}>
                          <Terminal className="h-4 w-4 mr-2" />
                          Shell Command
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setShowAiDialog(true)}>
                          <Sparkles className="h-4 w-4 mr-2" />
                          AI Step
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {workflow.steps.length === 0 ? (
                    <Card className="border-dashed">
                      <CardContent className="py-12 text-center">
                        <p className="text-muted-foreground mb-4">
                          No steps yet. Add your first step to get started.
                        </p>
                        <div className="flex justify-center gap-2">
                          <Button variant="outline" onClick={() => addStep('command')}>
                            <Terminal className="h-4 w-4 mr-2" />
                            Add Command
                          </Button>
                          <Button variant="outline" onClick={() => setShowAiDialog(true)}>
                            <Sparkles className="h-4 w-4 mr-2" />
                            Add AI Step
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {workflow.steps.map((step, index) => (
                        <StepCard
                          key={step.id}
                          step={step}
                          index={index}
                          totalSteps={workflow.steps.length}
                          onUpdate={(updates) => updateStep(step.id, updates)}
                          onDelete={() => deleteStep(step.id)}
                          onMoveUp={() => moveStep(index, index - 1)}
                          onMoveDown={() => moveStep(index, index + 1)}
                          onAddAfter={(type) => addStep(type, index)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick Add Bar */}
                {workflow.steps.length > 0 && (
                  <div className="mt-4 flex justify-center">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Quick add:</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-xs"
                        onClick={() => addStep('command')}
                      >
                        <Terminal className="h-3 w-3 mr-1" />
                        npm install
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-xs"
                        onClick={() => {
                          addStep('command');
                          // Update the last added step with npm test command
                          setTimeout(() => {
                            const lastStep = workflow.steps[workflow.steps.length - 1];
                            if (lastStep) {
                              updateStep(lastStep.id, { name: 'Run tests', command: 'npm test' });
                            }
                          }, 0);
                        }}
                      >
                        <Terminal className="h-3 w-3 mr-1" />
                        npm test
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-xs"
                        onClick={() => setShowAiDialog(true)}
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        AI task
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          ) : (
            <CodeView workflow={workflow} />
          )}
        </div>

        {/* AI Step Dialog */}
        <Dialog open={showAiDialog} onOpenChange={setShowAiDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add AI Step</DialogTitle>
              <DialogDescription>
                Describe what you want the AI to do in plain English.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <Textarea
                value={aiStepPrompt}
                onChange={(e) => setAiStepPrompt(e.target.value)}
                placeholder="e.g., Review the code changes and leave comments on potential issues, or Generate a changelog from the recent commits"
                rows={4}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowAiDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddAiStep} disabled={!aiStepPrompt.trim()}>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Add Step
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </RepoLayout>
  );
}

// =============================================================================
// Trigger Editor Component
// =============================================================================

function TriggerEditor({ 
  trigger, 
  onChange 
}: { 
  trigger: WorkflowTrigger;
  onChange: (trigger: WorkflowTrigger) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const triggerOptions: Array<{ type: TriggerType; label: string; description: string }> = [
    { type: 'push', label: 'Push', description: 'When code is pushed to a branch' },
    { type: 'pull_request', label: 'Pull Request', description: 'When a PR is opened or updated' },
    { type: 'manual', label: 'Manual', description: 'Trigger manually from the UI' },
    { type: 'schedule', label: 'Schedule', description: 'Run on a cron schedule' },
  ];

  return (
    <Card>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <TriggerIcon type={trigger.type} className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <div className="font-medium text-sm">Trigger</div>
                  <div className="text-xs text-muted-foreground">
                    {trigger.type === 'push' && `On push to ${trigger.branches?.join(', ') || 'any branch'}`}
                    {trigger.type === 'pull_request' && `On pull request to ${trigger.branches?.join(', ') || 'any branch'}`}
                    {trigger.type === 'manual' && 'Manually triggered'}
                    {trigger.type === 'schedule' && `Cron: ${trigger.cron || 'Not set'}`}
                  </div>
                </div>
              </div>
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4">
            <Separator className="mb-4" />
            
            {/* Trigger Type Selection */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {triggerOptions.map((option) => (
                <button
                  key={option.type}
                  onClick={() => onChange({ ...trigger, type: option.type })}
                  className={cn(
                    'p-3 rounded-lg border text-left transition-colors',
                    trigger.type === option.type
                      ? 'border-primary bg-primary/5'
                      : 'hover:border-primary/50'
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <TriggerIcon type={option.type} className="h-4 w-4" />
                    <span className="font-medium text-sm">{option.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </button>
              ))}
            </div>

            {/* Branch Selection for push/pull_request */}
            {(trigger.type === 'push' || trigger.type === 'pull_request') && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Branches</label>
                <Input
                  value={trigger.branches?.join(', ') || ''}
                  onChange={(e) => onChange({
                    ...trigger,
                    branches: e.target.value.split(',').map(b => b.trim()).filter(Boolean),
                  })}
                  placeholder="main, develop (leave empty for all)"
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated list of branches. Leave empty to trigger on all branches.
                </p>
              </div>
            )}

            {/* Cron for schedule */}
            {trigger.type === 'schedule' && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Cron Expression</label>
                <Input
                  value={trigger.cron || ''}
                  onChange={(e) => onChange({ ...trigger, cron: e.target.value })}
                  placeholder="0 0 * * *"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Examples: "0 0 * * *" (daily at midnight), "0 */6 * * *" (every 6 hours)
                </p>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// =============================================================================
// Step Card Component
// =============================================================================

function StepCard({
  step,
  index,
  totalSteps,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onAddAfter,
}: {
  step: WorkflowStep;
  index: number;
  totalSteps: number;
  onUpdate: (updates: Partial<WorkflowStep>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onAddAfter: (type: WorkflowStep['type']) => void;
}) {
  const [isEditing, setIsEditing] = useState(!step.command && !step.aiPrompt);

  return (
    <Card className={cn(!step.enabled && 'opacity-50')}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Drag Handle & Step Number */}
          <div className="flex flex-col items-center gap-1 pt-1">
            <button className="cursor-grab text-muted-foreground hover:text-foreground">
              <GripVertical className="h-4 w-4" />
            </button>
            <span className="text-xs text-muted-foreground font-mono">{index + 1}</span>
          </div>

          {/* Step Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <StepIcon type={step.type} />
              {isEditing ? (
                <Input
                  value={step.name}
                  onChange={(e) => onUpdate({ name: e.target.value })}
                  className="h-7 text-sm font-medium flex-1"
                  placeholder="Step name"
                  autoFocus
                />
              ) : (
                <span 
                  className="font-medium text-sm cursor-pointer hover:text-primary"
                  onClick={() => setIsEditing(true)}
                >
                  {step.name}
                </span>
              )}
              <Badge variant="outline" className="text-xs">
                {step.type === 'ai' ? 'AI' : step.type === 'command' ? 'Shell' : step.type}
              </Badge>
            </div>

            {/* Command Input */}
            {step.type === 'command' && (
              <div className="relative">
                <Terminal className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={step.command || ''}
                  onChange={(e) => onUpdate({ command: e.target.value })}
                  className="pl-9 font-mono text-sm h-9"
                  placeholder="npm run build"
                />
              </div>
            )}

            {/* AI Prompt */}
            {step.type === 'ai' && (
              <div className="relative">
                <Textarea
                  value={step.aiPrompt || ''}
                  onChange={(e) => onUpdate({ aiPrompt: e.target.value })}
                  className="text-sm resize-none"
                  placeholder="Describe what the AI should do..."
                  rows={2}
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onUpdate({ enabled: !step.enabled })}>
                  {step.enabled ? (
                    <>
                      <X className="h-4 w-4 mr-2" />
                      Disable
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Enable
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onMoveUp} disabled={index === 0}>
                  Move up
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onMoveDown} disabled={index === totalSteps - 1}>
                  Move down
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onAddAfter('command')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add step after
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Code View Component
// =============================================================================

function CodeView({ workflow }: { workflow: SimpleWorkflow }) {
  const code = generateWorkflowCode(workflow);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            <FileCode className="h-3 w-3 mr-1" />
            {workflow.name.toLowerCase().replace(/\s+/g, '-')}.workflow.ts
          </Badge>
          <span className="text-xs text-muted-foreground">
            Generated workflow code (read-only)
          </span>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => navigator.clipboard.writeText(code)}
        >
          <Copy className="h-4 w-4 mr-1.5" />
          Copy
        </Button>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          language="typescript"
          value={code}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            folding: true,
          }}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Helper Components
// =============================================================================

function TriggerIcon({ type, className }: { type: TriggerType; className?: string }) {
  switch (type) {
    case 'push':
      return <GitBranch className={className} />;
    case 'pull_request':
      return <GitBranch className={className} />;
    case 'manual':
      return <MousePointer className={className} />;
    case 'schedule':
      return <Clock className={className} />;
    default:
      return <Zap className={className} />;
  }
}

function StepIcon({ type }: { type: WorkflowStep['type'] }) {
  const iconClass = "h-4 w-4";
  switch (type) {
    case 'command':
      return (
        <div className="p-1.5 rounded bg-blue-500/10">
          <Terminal className={cn(iconClass, "text-blue-600")} />
        </div>
      );
    case 'ai':
      return (
        <div className="p-1.5 rounded bg-purple-500/10">
          <Sparkles className={cn(iconClass, "text-purple-600")} />
        </div>
      );
    case 'action':
      return (
        <div className="p-1.5 rounded bg-green-500/10">
          <Code className={cn(iconClass, "text-green-600")} />
        </div>
      );
    default:
      return null;
  }
}

// =============================================================================
// Code Generation
// =============================================================================

function generateWorkflowCode(workflow: SimpleWorkflow): string {
  const lines: string[] = [];
  
  // Header comment
  lines.push('/**');
  lines.push(` * ${workflow.name}`);
  if (workflow.description) {
    lines.push(` * ${workflow.description}`);
  }
  lines.push(' * ');
  lines.push(' * Generated by wit workflow builder');
  lines.push(' */');
  lines.push('');
  
  // Imports
  lines.push("import { createWorkflow, createStep } from '@mastra/core/workflows';");
  lines.push("import { z } from 'zod';");
  lines.push('');

  // Generate trigger comment
  lines.push('// Trigger configuration');
  lines.push(`// Type: ${workflow.trigger.type}`);
  if (workflow.trigger.branches?.length) {
    lines.push(`// Branches: ${workflow.trigger.branches.join(', ')}`);
  }
  if (workflow.trigger.cron) {
    lines.push(`// Schedule: ${workflow.trigger.cron}`);
  }
  lines.push('');

  // Generate steps
  const enabledSteps = workflow.steps.filter(s => s.enabled);
  
  for (const step of enabledSteps) {
    const stepId = step.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
    
    lines.push(`const ${toCamelCase(stepId)}Step = createStep({`);
    lines.push(`  id: '${stepId}',`);
    lines.push('  inputSchema: z.object({}),');
    lines.push('  outputSchema: z.object({');
    lines.push('    success: z.boolean(),');
    lines.push('    output: z.string().optional(),');
    lines.push('  }),');
    
    if (step.type === 'command' && step.command) {
      lines.push('  execute: async () => {');
      lines.push("    const { spawn } = await import('child_process');");
      lines.push('    return new Promise((resolve) => {');
      lines.push(`      const child = spawn('sh', ['-c', ${JSON.stringify(step.command)}]);`);
      lines.push("      let output = '';");
      lines.push("      child.stdout?.on('data', (data) => { output += data.toString(); });");
      lines.push("      child.stderr?.on('data', (data) => { output += data.toString(); });");
      lines.push("      child.on('close', (code) => {");
      lines.push('        resolve({ success: code === 0, output });');
      lines.push('      });');
      lines.push('    });');
      lines.push('  },');
    } else if (step.type === 'ai' && step.aiPrompt) {
      lines.push('  execute: async ({ mastra }) => {');
      lines.push("    const agent = mastra?.getAgent('wit');");
      lines.push('    if (!agent) {');
      lines.push("      return { success: false, output: 'Agent not available' };");
      lines.push('    }');
      lines.push('    ');
      lines.push('    const result = await agent.generate(`');
      lines.push(`      ${step.aiPrompt}`);
      lines.push('    `);');
      lines.push('    ');
      lines.push('    return {');
      lines.push('      success: true,');
      lines.push('      output: result.text,');
      lines.push('    };');
      lines.push('  },');
    } else {
      lines.push('  execute: async () => {');
      lines.push('    // TODO: Implement step logic');
      lines.push('    return { success: true };');
      lines.push('  },');
    }
    
    lines.push('});');
    lines.push('');
  }

  // Generate workflow
  const workflowId = workflow.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  
  lines.push('// =============================================================================');
  lines.push('// Workflow Definition');
  lines.push('// =============================================================================');
  lines.push('');
  lines.push(`export const ${toCamelCase(workflowId)}Workflow = createWorkflow({`);
  lines.push(`  id: '${workflowId}',`);
  lines.push('  inputSchema: z.object({}),');
  lines.push('  outputSchema: z.object({');
  lines.push('    success: z.boolean(),');
  lines.push('  }),');
  lines.push('})');

  // Chain steps
  for (const step of enabledSteps) {
    const stepId = step.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-');
    lines.push(`  .then(${toCamelCase(stepId)}Step)`);
  }

  lines.push('  .commit();');
  lines.push('');

  return lines.join('\n');
}

function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^(.)/, (c) => c.toLowerCase());
}
