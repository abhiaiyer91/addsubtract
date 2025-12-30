/**
 * Step Configurator Panel
 * 
 * Configuration panel for editing Mastra workflow step properties.
 * Supports editing step ID, schemas, execute code, and more.
 */

import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { X, Plus, Trash2, ChevronDown, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import {
  useWorkflowStore,
  type WorkflowNode,
  type StepConfig,
  type TriggerConfig,
  type MapConfig,
  type ParallelConfig,
  type ConditionConfig,
  type SchemaField,
} from '@/lib/workflow-store';

// =============================================================================
// Main Configurator Component
// =============================================================================

interface StepConfiguratorProps {
  onClose?: () => void;
}

export function StepConfigurator({ onClose }: StepConfiguratorProps) {
  const { workflow, selectedNodeId, updateNode, selectNode } = useWorkflowStore();

  const selectedNode = workflow.nodes.find((n) => n.id === selectedNodeId);

  if (!selectedNode) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Select a node to configure</p>
        </div>
      </div>
    );
  }

  const handleClose = () => {
    selectNode(null);
    onClose?.();
  };

  return (
    <div className="h-full flex flex-col bg-background border-l">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <NodeTypeIcon type={selectedNode.type} />
          <span className="font-medium">{selectedNode.name}</span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {selectedNode.type === 'trigger' && (
            <TriggerConfigurator node={selectedNode} onUpdate={updateNode} />
          )}
          {selectedNode.type === 'step' && (
            <StepNodeConfigurator node={selectedNode} onUpdate={updateNode} />
          )}
          {selectedNode.type === 'parallel' && (
            <ParallelConfigurator node={selectedNode} onUpdate={updateNode} workflow={workflow} />
          )}
          {selectedNode.type === 'map' && (
            <MapConfigurator node={selectedNode} onUpdate={updateNode} />
          )}
          {selectedNode.type === 'condition' && (
            <ConditionConfigurator node={selectedNode} onUpdate={updateNode} />
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// =============================================================================
// Trigger Configurator
// =============================================================================

interface TriggerConfiguratorProps {
  node: WorkflowNode;
  onUpdate: (nodeId: string, updates: Partial<WorkflowNode>) => void;
}

function TriggerConfigurator({ node, onUpdate }: TriggerConfiguratorProps) {
  const config = node.config as TriggerConfig;

  const updateConfig = (updates: Partial<TriggerConfig>) => {
    onUpdate(node.id, {
      config: { ...config, ...updates },
    });
  };

  return (
    <div className="space-y-4">
      {/* Name */}
      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          value={node.name}
          onChange={(e) => onUpdate(node.id, { name: e.target.value })}
          placeholder="Trigger name"
        />
      </div>

      {/* Trigger Type */}
      <div className="space-y-2">
        <Label>Trigger Type</Label>
        <Select value={config.type} onValueChange={(v) => updateConfig({ type: v as TriggerConfig['type'] })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual (workflow_dispatch)</SelectItem>
            <SelectItem value="push">Push</SelectItem>
            <SelectItem value="pull_request">Pull Request</SelectItem>
            <SelectItem value="schedule">Schedule (cron)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Branch filters for push/pull_request */}
      {(config.type === 'push' || config.type === 'pull_request') && (
        <div className="space-y-2">
          <Label>Branches</Label>
          <StringArrayEditor
            values={config.branches || []}
            onChange={(branches) => updateConfig({ branches })}
            placeholder="Add branch filter..."
          />
        </div>
      )}

      {/* Path filters for push */}
      {config.type === 'push' && (
        <div className="space-y-2">
          <Label>Paths (optional)</Label>
          <StringArrayEditor
            values={config.paths || []}
            onChange={(paths) => updateConfig({ paths })}
            placeholder="Add path filter..."
          />
        </div>
      )}

      {/* Cron for schedule */}
      {config.type === 'schedule' && (
        <div className="space-y-2">
          <Label>Cron Expression</Label>
          <Input
            value={config.cron || ''}
            onChange={(e) => updateConfig({ cron: e.target.value })}
            placeholder="0 0 * * *"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Example: "0 0 * * *" runs daily at midnight
          </p>
        </div>
      )}

      {/* Inputs for workflow_dispatch */}
      {config.type === 'workflow_dispatch' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Inputs</Label>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                updateConfig({
                  inputs: [
                    ...(config.inputs || []),
                    { name: 'input', type: 'string', required: false },
                  ],
                });
              }}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
          {config.inputs?.map((input, i) => (
            <div key={i} className="flex gap-2 p-2 border rounded">
              <Input
                value={input.name}
                onChange={(e) => {
                  const newInputs = [...(config.inputs || [])];
                  newInputs[i] = { ...input, name: e.target.value };
                  updateConfig({ inputs: newInputs });
                }}
                placeholder="Name"
                className="flex-1"
              />
              <Select
                value={input.type}
                onValueChange={(v) => {
                  const newInputs = [...(config.inputs || [])];
                  newInputs[i] = { ...input, type: v as 'string' | 'boolean' | 'choice' };
                  updateConfig({ inputs: newInputs });
                }}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="string">String</SelectItem>
                  <SelectItem value="boolean">Boolean</SelectItem>
                  <SelectItem value="choice">Choice</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  const newInputs = config.inputs?.filter((_, j) => j !== i);
                  updateConfig({ inputs: newInputs });
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Step Node Configurator
// =============================================================================

interface StepNodeConfiguratorProps {
  node: WorkflowNode;
  onUpdate: (nodeId: string, updates: Partial<WorkflowNode>) => void;
}

function StepNodeConfigurator({ node, onUpdate }: StepNodeConfiguratorProps) {
  const config = node.config as StepConfig;
  const [activeTab, setActiveTab] = useState<'basic' | 'schemas' | 'code'>('basic');

  const updateConfig = (updates: Partial<StepConfig>) => {
    onUpdate(node.id, {
      config: { ...config, ...updates },
    });
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="schemas">Schemas</TabsTrigger>
          <TabsTrigger value="code">Execute</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-4 pt-4">
          {/* Name */}
          <div className="space-y-2">
            <Label>Name</Label>
            <Input
              value={node.name}
              onChange={(e) => {
                onUpdate(node.id, { name: e.target.value });
                updateConfig({ name: e.target.value });
              }}
              placeholder="Step name"
            />
          </div>

          {/* ID */}
          <div className="space-y-2">
            <Label>Step ID</Label>
            <Input
              value={config.id}
              onChange={(e) => updateConfig({ id: e.target.value })}
              placeholder="unique-step-id"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Used to reference this step in code
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={node.description || ''}
              onChange={(e) => onUpdate(node.id, { description: e.target.value })}
              placeholder="What does this step do?"
              rows={2}
            />
          </div>

          {/* Step Type */}
          <div className="space-y-2">
            <Label>Step Type</Label>
            <Select
              value={config.actionRef ? 'action' : config.runCommand ? 'command' : 'custom'}
              onValueChange={(v) => {
                if (v === 'action') {
                  updateConfig({ actionRef: 'actions/checkout@v4', runCommand: undefined });
                } else if (v === 'command') {
                  updateConfig({ runCommand: 'echo "Hello"', actionRef: undefined });
                } else {
                  updateConfig({ actionRef: undefined, runCommand: undefined });
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom Code</SelectItem>
                <SelectItem value="action">Action (uses)</SelectItem>
                <SelectItem value="command">Shell Command (run)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Action Reference */}
          {config.actionRef && (
            <div className="space-y-2">
              <Label>Action Reference</Label>
              <Input
                value={config.actionRef}
                onChange={(e) => updateConfig({ actionRef: e.target.value })}
                placeholder="actions/checkout@v4"
                className="font-mono"
              />
            </div>
          )}

          {/* Run Command */}
          {config.runCommand !== undefined && (
            <div className="space-y-2">
              <Label>Shell Command</Label>
              <Textarea
                value={config.runCommand}
                onChange={(e) => updateConfig({ runCommand: e.target.value })}
                placeholder="npm install"
                className="font-mono"
                rows={3}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="schemas" className="space-y-4 pt-4">
          {/* Input Schema */}
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-2 w-full">
              <ChevronDown className="h-4 w-4" />
              <span className="font-medium">Input Schema</span>
              <Badge variant="secondary">{config.inputSchema.fields.length}</Badge>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <SchemaEditor
                schema={config.inputSchema}
                onChange={(inputSchema) => updateConfig({ inputSchema })}
              />
            </CollapsibleContent>
          </Collapsible>

          {/* Output Schema */}
          <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center gap-2 w-full">
              <ChevronDown className="h-4 w-4" />
              <span className="font-medium">Output Schema</span>
              <Badge variant="secondary">{config.outputSchema.fields.length}</Badge>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <SchemaEditor
                schema={config.outputSchema}
                onChange={(outputSchema) => updateConfig({ outputSchema })}
              />
            </CollapsibleContent>
          </Collapsible>
        </TabsContent>

        <TabsContent value="code" className="space-y-4 pt-4">
          {!config.actionRef && !config.runCommand && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Execute Function</Label>
                <Button variant="ghost" size="sm" className="gap-1.5">
                  <Wand2 className="h-4 w-4" />
                  Generate
                </Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Editor
                  height="300px"
                  language="typescript"
                  value={config.executeCode}
                  onChange={(value) => updateConfig({ executeCode: value || '' })}
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
              <p className="text-xs text-muted-foreground">
                Function receives {'{'}inputData, mastra, getInitData, getStepResult{'}'}
              </p>
            </div>
          )}
          {(config.actionRef || config.runCommand) && (
            <div className="text-center text-muted-foreground py-8">
              <p>Execute code is not available for action or command steps.</p>
              <p className="text-sm mt-1">Switch to "Custom Code" in the Basic tab.</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =============================================================================
// Parallel Configurator
// =============================================================================

interface ParallelConfiguratorProps {
  node: WorkflowNode;
  onUpdate: (nodeId: string, updates: Partial<WorkflowNode>) => void;
  workflow: { nodes: WorkflowNode[] };
}

function ParallelConfigurator({ node, onUpdate, workflow }: ParallelConfiguratorProps) {
  const config = node.config as ParallelConfig;
  const availableSteps = workflow.nodes.filter((n) => n.type === 'step' && !config.stepIds.includes(n.id));

  const updateConfig = (updates: Partial<ParallelConfig>) => {
    onUpdate(node.id, {
      config: { ...config, ...updates },
    });
  };

  return (
    <div className="space-y-4">
      {/* Name */}
      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          value={node.name}
          onChange={(e) => onUpdate(node.id, { name: e.target.value })}
          placeholder="Parallel group name"
        />
      </div>

      {/* Selected Steps */}
      <div className="space-y-2">
        <Label>Steps to Run in Parallel</Label>
        <div className="space-y-1">
          {config.stepIds.map((stepId) => {
            const step = workflow.nodes.find((n) => n.id === stepId);
            return (
              <div key={stepId} className="flex items-center justify-between p-2 border rounded">
                <span className="text-sm">{step?.name || stepId}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    updateConfig({
                      stepIds: config.stepIds.filter((id) => id !== stepId),
                    });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>

        {availableSteps.length > 0 && (
          <Select
            value=""
            onValueChange={(stepId) => {
              updateConfig({
                stepIds: [...config.stepIds, stepId],
              });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Add step..." />
            </SelectTrigger>
            <SelectContent>
              {availableSteps.map((step) => (
                <SelectItem key={step.id} value={step.id}>
                  {step.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Map Configurator
// =============================================================================

interface MapConfiguratorProps {
  node: WorkflowNode;
  onUpdate: (nodeId: string, updates: Partial<WorkflowNode>) => void;
}

function MapConfigurator({ node, onUpdate }: MapConfiguratorProps) {
  const config = node.config as MapConfig;

  const updateConfig = (updates: Partial<MapConfig>) => {
    onUpdate(node.id, {
      config: { ...config, ...updates },
    });
  };

  return (
    <div className="space-y-4">
      {/* Name */}
      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          value={node.name}
          onChange={(e) => onUpdate(node.id, { name: e.target.value })}
          placeholder="Transform name"
        />
      </div>

      {/* Transform Code */}
      <div className="space-y-2">
        <Label>Transform Function</Label>
        <div className="border rounded-lg overflow-hidden">
          <Editor
            height="250px"
            language="typescript"
            value={config.transformCode}
            onChange={(value) => updateConfig({ transformCode: value || '' })}
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
        <p className="text-xs text-muted-foreground">
          Receives {'{'}inputData, getInitData, getStepResult{'}'}, must return transformed data
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// Condition Configurator
// =============================================================================

interface ConditionConfiguratorProps {
  node: WorkflowNode;
  onUpdate: (nodeId: string, updates: Partial<WorkflowNode>) => void;
}

function ConditionConfigurator({ node, onUpdate }: ConditionConfiguratorProps) {
  const config = node.config as ConditionConfig;

  const updateConfig = (updates: Partial<ConditionConfig>) => {
    onUpdate(node.id, {
      config: { ...config, ...updates },
    });
  };

  return (
    <div className="space-y-4">
      {/* Name */}
      <div className="space-y-2">
        <Label>Name</Label>
        <Input
          value={node.name}
          onChange={(e) => onUpdate(node.id, { name: e.target.value })}
          placeholder="Condition name"
        />
      </div>

      {/* Expression */}
      <div className="space-y-2">
        <Label>Condition Expression</Label>
        <Textarea
          value={config.expression}
          onChange={(e) => updateConfig({ expression: e.target.value })}
          placeholder="inputData.value === true"
          className="font-mono"
          rows={3}
        />
        <p className="text-xs text-muted-foreground">
          JavaScript expression that evaluates to true or false
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// Helper Components
// =============================================================================

function NodeTypeIcon({ type }: { type: string }) {
  const iconClass = "h-4 w-4";
  switch (type) {
    case 'trigger':
      return <div className="p-1 rounded bg-green-600 text-white"><span className={iconClass}>T</span></div>;
    case 'step':
      return <div className="p-1 rounded bg-blue-600 text-white"><span className={iconClass}>S</span></div>;
    case 'parallel':
      return <div className="p-1 rounded bg-purple-600 text-white"><span className={iconClass}>P</span></div>;
    case 'map':
      return <div className="p-1 rounded bg-amber-600 text-white"><span className={iconClass}>M</span></div>;
    case 'condition':
      return <div className="p-1 rounded bg-rose-600 text-white"><span className={iconClass}>C</span></div>;
    default:
      return null;
  }
}

interface StringArrayEditorProps {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

function StringArrayEditor({ values, onChange, placeholder }: StringArrayEditorProps) {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    if (inputValue.trim()) {
      onChange([...values, inputValue.trim()]);
      setInputValue('');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        />
        <Button variant="outline" size="icon" onClick={handleAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {values.map((value, i) => (
            <Badge key={i} variant="secondary" className="gap-1">
              {value}
              <button
                onClick={() => onChange(values.filter((_, j) => j !== i))}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

interface SchemaEditorProps {
  schema: { fields: SchemaField[] };
  onChange: (schema: { fields: SchemaField[] }) => void;
}

function SchemaEditor({ schema, onChange }: SchemaEditorProps) {
  const addField = () => {
    onChange({
      fields: [
        ...schema.fields,
        { name: 'field', type: 'string', required: false },
      ],
    });
  };

  const updateField = (index: number, updates: Partial<SchemaField>) => {
    const newFields = [...schema.fields];
    newFields[index] = { ...newFields[index], ...updates };
    onChange({ fields: newFields });
  };

  const removeField = (index: number) => {
    onChange({
      fields: schema.fields.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="space-y-2">
      {schema.fields.map((field, i) => (
        <div key={i} className="flex gap-2 p-2 border rounded">
          <Input
            value={field.name}
            onChange={(e) => updateField(i, { name: e.target.value })}
            placeholder="Name"
            className="flex-1"
          />
          <Select
            value={field.type}
            onValueChange={(v) => updateField(i, { type: v as SchemaField['type'] })}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="string">String</SelectItem>
              <SelectItem value="number">Number</SelectItem>
              <SelectItem value="boolean">Boolean</SelectItem>
              <SelectItem value="object">Object</SelectItem>
              <SelectItem value="array">Array</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Switch
              checked={field.required}
              onCheckedChange={(checked) => updateField(i, { required: checked })}
            />
            <span className="text-xs text-muted-foreground">Req</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => removeField(i)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" className="w-full" onClick={addField}>
        <Plus className="h-4 w-4 mr-1" />
        Add Field
      </Button>
    </div>
  );
}
