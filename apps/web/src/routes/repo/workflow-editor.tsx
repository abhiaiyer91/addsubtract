import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Save, Eye, Code, Plus, Trash2, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Editor from '@monaco-editor/react';
import YAML from 'yaml';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import { RepoLayout } from './components/repo-layout';

interface WorkflowStep {
  id: string;
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, string>;
  env?: Record<string, string>;
  if?: string;
}

interface WorkflowJob {
  id: string;
  name: string;
  runsOn: string;
  needs?: string[];
  steps: WorkflowStep[];
}

interface WorkflowTrigger {
  push?: { branches?: string[]; paths?: string[] };
  pull_request?: { branches?: string[]; types?: string[] };
  workflow_dispatch?: { inputs?: Record<string, any> };
  schedule?: Array<{ cron: string }>;
  [key: string]: unknown;
}

interface WorkflowData {
  name: string;
  on: WorkflowTrigger;
  jobs: Record<string, WorkflowJob>;
}

const STEP_TEMPLATES = [
  {
    category: 'Common',
    steps: [
      { name: 'Checkout', uses: 'actions/checkout@v4' },
      { name: 'Setup Node.js', uses: 'actions/setup-node@v4', with: { 'node-version': '20' } },
      { name: 'Setup Python', uses: 'actions/setup-python@v5', with: { 'python-version': '3.x' } },
    ],
  },
  {
    category: 'Commands',
    steps: [
      { name: 'Run npm install', run: 'npm ci' },
      { name: 'Run npm test', run: 'npm test' },
      { name: 'Run npm build', run: 'npm run build' },
    ],
  },
];

export function WorkflowEditor() {
  const { owner, repo } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editPath = searchParams.get('path');

  const [workflow, setWorkflow] = useState<WorkflowData>({
    name: 'CI',
    on: { push: { branches: ['main'] } },
    jobs: {
      build: {
        id: 'build',
        name: 'Build',
        runsOn: 'ubuntu-latest',
        steps: [
          { id: 'checkout', uses: 'actions/checkout@v4' },
        ],
      },
    },
  });

  const [activeTab, setActiveTab] = useState<'visual' | 'yaml'>('visual');
  const [yamlError, setYamlError] = useState<string | null>(null);

  const generateYaml = useCallback((data: WorkflowData): string => {
    const yamlObj = {
      name: data.name,
      on: data.on,
      jobs: Object.fromEntries(
        Object.entries(data.jobs).map(([key, job]) => [
          key,
          {
            'runs-on': job.runsOn,
            ...(job.needs?.length ? { needs: job.needs } : {}),
            steps: job.steps.map(step => {
              const stepObj: any = {};
              if (step.name) stepObj.name = step.name;
              if (step.uses) stepObj.uses = step.uses;
              if (step.run) stepObj.run = step.run;
              if (step.with && Object.keys(step.with).length) stepObj.with = step.with;
              if (step.env && Object.keys(step.env).length) stepObj.env = step.env;
              if (step.if) stepObj.if = step.if;
              return stepObj;
            }),
          },
        ])
      ),
    };
    return YAML.stringify(yamlObj);
  }, []);

  const [yamlContent, setYamlContent] = useState(() => generateYaml(workflow));

  useEffect(() => {
    if (activeTab === 'visual') {
      setYamlContent(generateYaml(workflow));
    }
  }, [workflow, activeTab, generateYaml]);

  const parseYaml = useCallback((yaml: string): WorkflowData | null => {
    try {
      const parsed = YAML.parse(yaml);
      setYamlError(null);
      return {
        name: parsed.name,
        on: parsed.on,
        jobs: Object.fromEntries(
          Object.entries(parsed.jobs).map(([key, job]: [string, any]) => [
            key,
            {
              id: key,
              name: job.name || key,
              runsOn: job['runs-on'],
              needs: job.needs,
              steps: job.steps.map((step: any, i: number) => ({
                id: `step-${i}`,
                ...step,
              })),
            },
          ])
        ),
      };
    } catch (err: any) {
      setYamlError(err.message);
      return null;
    }
  }, []);

  const saveMutation = trpc.repos.updateFile.useMutation({
    onSuccess: () => {
      navigate(`/${owner}/${repo}/actions`);
    },
  });

  const handleSave = () => {
    const path = editPath || `.wit/workflows/${workflow.name.toLowerCase().replace(/\s+/g, '-')}.yml`;
    saveMutation.mutate({
      owner: owner!,
      repo: repo!,
      path,
      content: yamlContent,
      message: editPath ? `Update workflow: ${workflow.name}` : `Create workflow: ${workflow.name}`,
      ref: 'main',
    });
  };

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="flex flex-col h-[calc(100vh-200px)]">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-4">
            <Input
              value={workflow.name}
              onChange={(e) => setWorkflow({ ...workflow, name: e.target.value })}
              className="w-64 text-lg font-semibold"
            />
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
              <TabsList>
                <TabsTrigger value="visual">
                  <Eye className="h-4 w-4 mr-2" />
                  Visual
                </TabsTrigger>
                <TabsTrigger value="yaml">
                  <Code className="h-4 w-4 mr-2" />
                  YAML
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!!yamlError}>
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <TabsContent value="visual" className="h-full m-0">
            <VisualEditor workflow={workflow} onChange={setWorkflow} />
          </TabsContent>
          <TabsContent value="yaml" className="h-full m-0">
            <YamlEditor
              content={yamlContent}
              onChange={(content) => {
                setYamlContent(content);
                const parsed = parseYaml(content);
                if (parsed) setWorkflow(parsed);
              }}
              error={yamlError}
            />
          </TabsContent>
        </div>
      </div>
    </RepoLayout>
  );
}

function VisualEditor({ workflow, onChange }: { workflow: WorkflowData; onChange: (w: WorkflowData) => void }) {
  const addJob = () => {
    const id = `job-${Date.now()}`;
    onChange({
      ...workflow,
      jobs: {
        ...workflow.jobs,
        [id]: {
          id,
          name: 'New Job',
          runsOn: 'ubuntu-latest',
          steps: [],
        },
      },
    });
  };

  const updateJob = (jobId: string, updates: Partial<WorkflowJob>) => {
    onChange({
      ...workflow,
      jobs: {
        ...workflow.jobs,
        [jobId]: { ...workflow.jobs[jobId], ...updates },
      },
    });
  };

  const deleteJob = (jobId: string) => {
    const { [jobId]: _, ...rest } = workflow.jobs;
    onChange({ ...workflow, jobs: rest });
  };

  return (
    <div className="flex h-full">
      <div className="w-72 border-r p-4 overflow-y-auto">
        <h3 className="font-semibold mb-4">Triggers</h3>
        <TriggerEditor
          triggers={workflow.on}
          onChange={(on) => onChange({ ...workflow, on })}
        />
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Jobs</h3>
          <Button size="sm" onClick={addJob}>
            <Plus className="h-4 w-4 mr-1" />
            Add Job
          </Button>
        </div>

        <div className="space-y-4">
          {Object.entries(workflow.jobs).map(([jobId, job]) => (
            <JobEditor
              key={jobId}
              job={job}
              onChange={(updates) => updateJob(jobId, updates)}
              onDelete={() => deleteJob(jobId)}
            />
          ))}
        </div>
      </div>

      <div className="w-72 border-l p-4 overflow-y-auto">
        <h3 className="font-semibold mb-4">Step Library</h3>
        <StepLibrary />
      </div>
    </div>
  );
}

function JobEditor({ job, onChange, onDelete }: {
  job: WorkflowJob;
  onChange: (updates: Partial<WorkflowJob>) => void;
  onDelete: () => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor));

  const addStep = () => {
    const newStep: WorkflowStep = {
      id: `step-${Date.now()}`,
      run: 'echo "Hello"',
    };
    onChange({ steps: [...job.steps, newStep] });
  };

  const updateStep = (stepId: string, updates: Partial<WorkflowStep>) => {
    onChange({
      steps: job.steps.map(s => s.id === stepId ? { ...s, ...updates } : s),
    });
  };

  const deleteStep = (stepId: string) => {
    onChange({ steps: job.steps.filter(s => s.id !== stepId) });
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = job.steps.findIndex(s => s.id === active.id);
      const newIndex = job.steps.findIndex(s => s.id === over.id);
      const newSteps = [...job.steps];
      const [removed] = newSteps.splice(oldIndex, 1);
      newSteps.splice(newIndex, 0, removed);
      onChange({ steps: newSteps });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <Input
            value={job.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="w-48 font-semibold"
          />
          <div className="flex items-center gap-2">
            <Select value={job.runsOn} onValueChange={(v) => onChange({ runsOn: v })}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ubuntu-latest">ubuntu-latest</SelectItem>
                <SelectItem value="macos-latest">macos-latest</SelectItem>
                <SelectItem value="windows-latest">windows-latest</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={job.steps.map(s => s.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {job.steps.map((step) => (
                <SortableStep
                  key={step.id}
                  step={step}
                  onChange={(updates) => updateStep(step.id, updates)}
                  onDelete={() => deleteStep(step.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <Button
          variant="outline"
          size="sm"
          className="w-full mt-2"
          onClick={addStep}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Step
        </Button>
      </CardContent>
    </Card>
  );
}

function SortableStep({ step, onChange, onDelete }: {
  step: WorkflowStep;
  onChange: (updates: Partial<WorkflowStep>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2 p-2 border rounded bg-card">
      <div {...attributes} {...listeners} className="cursor-grab pt-1">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 space-y-2">
        <Input
          placeholder="Step name (optional)"
          value={step.name || ''}
          onChange={(e) => onChange({ name: e.target.value || undefined })}
          className="h-8 text-sm"
        />
        {step.uses ? (
          <div className="flex items-center gap-2">
            <Badge variant="secondary">uses</Badge>
            <Input
              value={step.uses}
              onChange={(e) => onChange({ uses: e.target.value })}
              className="h-8 text-sm font-mono"
              placeholder="actions/checkout@v4"
            />
          </div>
        ) : (
          <div>
            <Badge variant="secondary" className="mb-1">run</Badge>
            <Textarea
              value={step.run || ''}
              onChange={(e) => onChange({ run: e.target.value })}
              className="font-mono text-sm"
              rows={2}
              placeholder="npm install"
            />
          </div>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

function StepLibrary() {
  return (
    <div className="space-y-4">
      {STEP_TEMPLATES.map((category) => (
        <div key={category.category}>
          <h4 className="text-sm font-medium text-muted-foreground mb-2">{category.category}</h4>
          <div className="space-y-1">
            {category.steps.map((step, i) => (
              <div
                key={i}
                className="p-2 border rounded text-sm hover:bg-accent/50 transition-colors"
              >
                {step.name}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TriggerEditor({ triggers, onChange }: {
  triggers: WorkflowTrigger;
  onChange: (triggers: WorkflowTrigger) => void;
}) {
  const [activeTriggers, setActiveTriggers] = useState<string[]>(
    Object.keys(triggers)
  );

  const toggleTrigger = (trigger: string) => {
    if (activeTriggers.includes(trigger)) {
      setActiveTriggers(activeTriggers.filter(t => t !== trigger));
      const { [trigger]: _, ...rest } = triggers;
      onChange(rest as WorkflowTrigger);
    } else {
      setActiveTriggers([...activeTriggers, trigger]);
      onChange({
        ...triggers,
        [trigger]: trigger === 'push' ? { branches: ['main'] } : {},
      });
    }
  };

  return (
    <div className="space-y-3">
      {['push', 'pull_request', 'workflow_dispatch'].map((trigger) => (
        <label key={trigger} className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={activeTriggers.includes(trigger)}
            onChange={() => toggleTrigger(trigger)}
            className="rounded"
          />
          <span className="text-sm">{trigger}</span>
        </label>
      ))}
    </div>
  );
}

function YamlEditor({ content, onChange, error }: {
  content: string;
  onChange: (content: string) => void;
  error: string | null;
}) {
  return (
    <div className="h-full flex flex-col">
      {error && (
        <div className="p-2 bg-red-50 border-b border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}
      <Editor
        height="100%"
        language="yaml"
        value={content}
        onChange={(value) => onChange(value || '')}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
        }}
      />
    </div>
  );
}
