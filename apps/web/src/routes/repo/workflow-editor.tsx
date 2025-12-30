/**
 * Workflow Editor Page
 * 
 * Visual workflow builder for creating Mastra workflows.
 * Supports:
 * - Drag-and-drop visual editing with ReactFlow
 * - Code preview with live Mastra code generation
 * - YAML import/export for GitHub Actions compatibility
 * - Pre-built action library
 */

import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Save, 
  Eye, 
  Code, 
  Play, 
  Settings,
  ChevronLeft,
  ChevronRight,
  FileCode,
  Layers,
  Library,
  Wand2,
  Download,
  Upload,
  X,
} from 'lucide-react';
import Editor from '@monaco-editor/react';
import { ReactFlowProvider } from 'reactflow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { trpc } from '@/lib/trpc';
import { RepoLayout } from './components/repo-layout';
import { VisualWorkflowCanvas, NodePalette } from '@/components/workflow/visual-workflow-canvas';
import { StepConfigurator } from '@/components/workflow/step-configurator';
import { ActionLibrary } from '@/components/workflow/action-library';
import { useWorkflowStore } from '@/lib/workflow-store';
import { cn } from '@/lib/utils';

// =============================================================================
// Main Editor Component
// =============================================================================

export function WorkflowEditor() {
  const { owner, repo } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editPath = searchParams.get('path');

  const {
    workflow,
    selectedNodeId,
    isCodePreviewOpen,
    generatedCode,
    isDirty,
    validationErrors,
    setWorkflow,
    updateWorkflowMeta,
    generateCode,
    toggleCodePreview,
    validate,
    reset,
  } = useWorkflowStore();

  const [activeTab, setActiveTab] = useState<'visual' | 'code' | 'yaml'>('visual');
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(true);
  const [workflowSettingsOpen, setWorkflowSettingsOpen] = useState(false);

  // Generate code when switching to code tab
  useEffect(() => {
    if (activeTab === 'code') {
      generateCode();
    }
  }, [activeTab, generateCode]);

  // Open right panel when node is selected
  useEffect(() => {
    if (selectedNodeId) {
      setRightPanelCollapsed(false);
    }
  }, [selectedNodeId]);

  // Save mutation
  const saveMutation = trpc.repos.updateFile.useMutation({
    onSuccess: () => {
      navigate(`/${owner}/${repo}/actions`);
    },
  });

  const handleSave = useCallback(() => {
    if (!validate()) return;
    
    const code = generateCode();
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
  }, [workflow, editPath, owner, repo, validate, generateCode, saveMutation, navigate]);

  const handleExport = useCallback(() => {
    const code = generateCode();
    const blob = new Blob([code], { type: 'text/typescript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${workflow.name.toLowerCase().replace(/\s+/g, '-')}.workflow.ts`;
    a.click();
    URL.revokeObjectURL(url);
  }, [workflow, generateCode]);

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="flex flex-col h-[calc(100vh-120px)]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            
            <Separator orientation="vertical" className="h-6" />
            
            <div className="flex items-center gap-2">
              <Input
                value={workflow.name}
                onChange={(e) => updateWorkflowMeta({ name: e.target.value })}
                className="w-64 h-8 text-base font-semibold"
                placeholder="Workflow name"
              />
              {isDirty && (
                <Badge variant="secondary" className="text-xs">
                  Unsaved
                </Badge>
              )}
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <TabsList>
                <TabsTrigger value="visual" className="gap-1.5">
                  <Layers className="h-4 w-4" />
                  Visual
                </TabsTrigger>
                <TabsTrigger value="code" className="gap-1.5">
                  <Code className="h-4 w-4" />
                  Code
                </TabsTrigger>
                <TabsTrigger value="yaml" className="gap-1.5">
                  <FileCode className="h-4 w-4" />
                  YAML
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setWorkflowSettingsOpen(true)}>
              <Settings className="h-4 w-4 mr-1.5" />
              Settings
            </Button>
            
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-1.5" />
              Export
            </Button>
            
            <Button 
              size="sm" 
              onClick={handleSave}
              disabled={!isDirty || validationErrors.length > 0}
            >
              <Save className="h-4 w-4 mr-1.5" />
              Save
            </Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden">
          <TabsContent value="visual" className="h-full m-0" forceMount hidden={activeTab !== 'visual'}>
            <ResizablePanelGroup direction="horizontal" className="h-full">
              {/* Left Panel - Actions Library */}
              <ResizablePanel
                defaultSize={leftPanelCollapsed ? 0 : 20}
                minSize={0}
                maxSize={30}
                collapsible
                collapsedSize={0}
                onCollapse={() => setLeftPanelCollapsed(true)}
                onExpand={() => setLeftPanelCollapsed(false)}
                className={cn(leftPanelCollapsed && 'hidden')}
              >
                <div className="h-full border-r flex flex-col">
                  <div className="p-3 border-b flex items-center justify-between">
                    <h3 className="font-medium text-sm flex items-center gap-2">
                      <Library className="h-4 w-4" />
                      Actions
                    </h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setLeftPanelCollapsed(true)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </div>
                  <ActionLibrary className="flex-1" />
                </div>
              </ResizablePanel>

              {leftPanelCollapsed && (
                <div className="w-10 border-r flex flex-col items-center pt-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setLeftPanelCollapsed(false)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <ResizableHandle withHandle />

              {/* Center Panel - Canvas */}
              <ResizablePanel defaultSize={rightPanelCollapsed ? 80 : 55} minSize={40}>
                <ReactFlowProvider>
                  <VisualWorkflowCanvas onSave={handleSave} />
                </ReactFlowProvider>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Right Panel - Configurator */}
              <ResizablePanel
                defaultSize={rightPanelCollapsed ? 0 : 25}
                minSize={0}
                maxSize={40}
                collapsible
                collapsedSize={0}
                onCollapse={() => setRightPanelCollapsed(true)}
                onExpand={() => setRightPanelCollapsed(false)}
                className={cn(rightPanelCollapsed && 'hidden')}
              >
                <StepConfigurator onClose={() => setRightPanelCollapsed(true)} />
              </ResizablePanel>

              {rightPanelCollapsed && selectedNodeId && (
                <div className="w-10 border-l flex flex-col items-center pt-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setRightPanelCollapsed(false)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </ResizablePanelGroup>
          </TabsContent>

          <TabsContent value="code" className="h-full m-0" forceMount hidden={activeTab !== 'code'}>
            <div className="h-full flex flex-col">
              <div className="px-4 py-2 border-b flex items-center justify-between bg-muted/30">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-xs">
                    {workflow.name.toLowerCase().replace(/\s+/g, '-')}.workflow.ts
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Generated Mastra workflow code
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(generatedCode)}>
                  Copy
                </Button>
              </div>
              <div className="flex-1">
                <Editor
                  height="100%"
                  language="typescript"
                  value={generatedCode}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: true },
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
          </TabsContent>

          <TabsContent value="yaml" className="h-full m-0" forceMount hidden={activeTab !== 'yaml'}>
            <YAMLEditor workflow={workflow} />
          </TabsContent>
        </div>

        {/* Workflow Settings Sheet */}
        <Sheet open={workflowSettingsOpen} onOpenChange={setWorkflowSettingsOpen}>
          <SheetContent className="sm:max-w-lg">
            <SheetHeader>
              <SheetTitle>Workflow Settings</SheetTitle>
            </SheetHeader>
            <WorkflowSettings />
          </SheetContent>
        </Sheet>
      </div>
    </RepoLayout>
  );
}

// =============================================================================
// YAML Editor Component
// =============================================================================

function YAMLEditor({ workflow }: { workflow: ReturnType<typeof useWorkflowStore>['workflow'] }) {
  const [yamlContent, setYamlContent] = useState('');
  const [yamlError, setYamlError] = useState<string | null>(null);

  // Generate YAML from workflow
  useEffect(() => {
    const yaml = generateYAML(workflow);
    setYamlContent(yaml);
    setYamlError(null);
  }, [workflow]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b flex items-center justify-between bg-muted/30">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {workflow.name.toLowerCase().replace(/\s+/g, '-')}.yml
          </Badge>
          <span className="text-xs text-muted-foreground">
            GitHub Actions compatible YAML
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-1.5" />
            Import
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(yamlContent)}>
            Copy
          </Button>
        </div>
      </div>
      {yamlError && (
        <div className="px-4 py-2 bg-destructive/10 border-b text-destructive text-sm">
          {yamlError}
        </div>
      )}
      <div className="flex-1">
        <Editor
          height="100%"
          language="yaml"
          value={yamlContent}
          onChange={(value) => setYamlContent(value || '')}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
          }}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Workflow Settings Component
// =============================================================================

function WorkflowSettings() {
  const { workflow, updateWorkflowMeta } = useWorkflowStore();

  return (
    <ScrollArea className="h-[calc(100vh-120px)] pr-4">
      <div className="space-y-6 py-4">
        {/* Basic Info */}
        <div className="space-y-4">
          <h3 className="font-medium">Basic Information</h3>
          
          <div className="space-y-2">
            <Label>Workflow Name</Label>
            <Input
              value={workflow.name}
              onChange={(e) => updateWorkflowMeta({ name: e.target.value })}
              placeholder="my-workflow"
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={workflow.description || ''}
              onChange={(e) => updateWorkflowMeta({ description: e.target.value })}
              placeholder="What does this workflow do?"
              rows={3}
            />
          </div>
        </div>

        <Separator />

        {/* Input Schema */}
        <div className="space-y-4">
          <h3 className="font-medium">Workflow Input Schema</h3>
          <p className="text-sm text-muted-foreground">
            Define the input parameters this workflow accepts.
          </p>
          
          {workflow.inputSchema.fields.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-6 text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  No input fields defined
                </p>
                <Button variant="outline" size="sm">
                  Add Input Field
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {workflow.inputSchema.fields.map((field, i) => (
                <div key={i} className="flex items-center gap-2 p-2 border rounded">
                  <span className="font-mono text-sm">{field.name}</span>
                  <Badge variant="secondary">{field.type}</Badge>
                  {field.required && <Badge variant="outline">required</Badge>}
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Output Schema */}
        <div className="space-y-4">
          <h3 className="font-medium">Workflow Output Schema</h3>
          <p className="text-sm text-muted-foreground">
            Define the output this workflow produces.
          </p>
          
          {workflow.outputSchema.fields.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-6 text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  No output fields defined
                </p>
                <Button variant="outline" size="sm">
                  Add Output Field
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {workflow.outputSchema.fields.map((field, i) => (
                <div key={i} className="flex items-center gap-2 p-2 border rounded">
                  <span className="font-mono text-sm">{field.name}</span>
                  <Badge variant="secondary">{field.type}</Badge>
                  {field.required && <Badge variant="outline">required</Badge>}
                </div>
              ))}
            </div>
          )}
        </div>

        <Separator />

        {/* Environment */}
        <div className="space-y-4">
          <h3 className="font-medium">Environment Variables</h3>
          <p className="text-sm text-muted-foreground">
            Define environment variables available to all steps.
          </p>
          
          <Card className="border-dashed">
            <CardContent className="py-6 text-center">
              <p className="text-sm text-muted-foreground mb-2">
                No environment variables defined
              </p>
              <Button variant="outline" size="sm">
                Add Variable
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </ScrollArea>
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

function generateYAML(workflow: ReturnType<typeof useWorkflowStore>['workflow']): string {
  const lines: string[] = [];
  
  lines.push(`name: ${workflow.name}`);
  lines.push('');
  
  // Triggers
  const triggers = workflow.nodes.filter((n) => n.type === 'trigger');
  if (triggers.length > 0) {
    lines.push('on:');
    for (const trigger of triggers) {
      const config = trigger.config as { type: string; branches?: string[]; cron?: string };
      if (config.type === 'push') {
        lines.push('  push:');
        if (config.branches?.length) {
          lines.push('    branches:');
          for (const branch of config.branches) {
            lines.push(`      - ${branch}`);
          }
        }
      } else if (config.type === 'pull_request') {
        lines.push('  pull_request:');
        if (config.branches?.length) {
          lines.push('    branches:');
          for (const branch of config.branches) {
            lines.push(`      - ${branch}`);
          }
        }
      } else if (config.type === 'workflow_dispatch') {
        lines.push('  workflow_dispatch:');
      } else if (config.type === 'schedule' && config.cron) {
        lines.push('  schedule:');
        lines.push(`    - cron: '${config.cron}'`);
      }
    }
  }
  
  lines.push('');
  lines.push('jobs:');
  
  // Steps as a single job (simplified)
  const steps = workflow.nodes.filter((n) => n.type === 'step');
  if (steps.length > 0) {
    lines.push('  build:');
    lines.push('    runs-on: ubuntu-latest');
    lines.push('    steps:');
    
    for (const step of steps) {
      const config = step.config as { name?: string; actionRef?: string; runCommand?: string };
      if (config.name) {
        lines.push(`      - name: ${config.name}`);
      }
      if (config.actionRef) {
        lines.push(`        uses: ${config.actionRef}`);
      } else if (config.runCommand) {
        lines.push(`        run: ${config.runCommand}`);
      }
    }
  }
  
  return lines.join('\n');
}
