import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Brain,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronRight,
  ChevronDown,
  GitBranch,
  FileCode,
  ListTodo,
  RefreshCw,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { RepoLayout } from './components/repo-layout';
import { Loading } from '@/components/ui/loading';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime, cn } from '@/lib/utils';

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
type PlanningStatus = 'pending' | 'planning' | 'executing' | 'reviewing' | 'completed' | 'failed';

const statusConfig: Record<TaskStatus, { label: string; icon: typeof CheckCircle2; color: string }> = {
  pending: { label: 'Pending', icon: Clock, color: 'text-gray-500 bg-gray-500/10' },
  in_progress: { label: 'Running', icon: Loader2, color: 'text-blue-500 bg-blue-500/10' },
  completed: { label: 'Done', icon: CheckCircle2, color: 'text-green-500 bg-green-500/10' },
  failed: { label: 'Failed', icon: XCircle, color: 'text-red-500 bg-red-500/10' },
  skipped: { label: 'Skipped', icon: Clock, color: 'text-yellow-500 bg-yellow-500/10' },
};

const planningStatusConfig: Record<PlanningStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'bg-gray-500' },
  planning: { label: 'Planning', color: 'bg-blue-500' },
  executing: { label: 'Executing', color: 'bg-purple-500' },
  reviewing: { label: 'Reviewing', color: 'bg-orange-500' },
  completed: { label: 'Completed', color: 'bg-green-500' },
  failed: { label: 'Failed', color: 'bg-red-500' },
};

interface Subtask {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: TaskStatus;
  result?: string;
  error?: string;
}

interface ParallelGroup {
  id: string;
  name: string;
  executionOrder: number;
  subtasks: Subtask[];
}

interface ExecutionPlan {
  id: string;
  version: number;
  originalTask: string;
  summary: string;
  parallelGroups: ParallelGroup[];
  estimatedTotalEffort: string;
}

export function PlanningPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;
  
  // Form state
  const [task, setTask] = useState('');
  const [context, setContext] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [createBranch, setCreateBranch] = useState(true);
  const [branchName, setBranchName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Results state
  const [isRunning, setIsRunning] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<PlanningStatus>('pending');
  const [plan, setPlan] = useState<ExecutionPlan | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Fetch repository data
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Check planning availability
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: planningStatus } = (trpc as any).planning?.status?.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  ) as { data: { available: boolean; model: string; provider: string } | undefined };

  // Planning mutation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runMutation = (trpc as any).planning?.run?.useMutation({
    onSuccess: (data: any) => {
      setIsRunning(false);
      setCurrentStatus(data.success ? 'completed' : 'failed');
      if (data.finalPlan) {
        setPlan(data.finalPlan);
        // Expand all groups by default
        setExpandedGroups(new Set(data.finalPlan.parallelGroups.map((g: ParallelGroup) => g.id)));
      }
      if (data.error) {
        setError(data.error);
      }
    },
    onError: (err: Error) => {
      setIsRunning(false);
      setCurrentStatus('failed');
      setError(err.message);
    },
  });

  const handleRun = () => {
    if (!task.trim() || !repoData?.repo.id) return;
    
    setIsRunning(true);
    setCurrentStatus('planning');
    setError(null);
    setPlan(null);
    
    runMutation.mutate({
      repoId: repoData.repo.id,
      task: task.trim(),
      context: context.trim() || undefined,
      dryRun,
      createBranch,
      branchName: branchName.trim() || undefined,
      maxIterations: 3,
      maxParallelTasks: 5,
    });
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  if (repoLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!} activeTab="planning">
        <Loading />
      </RepoLayout>
    );
  }

  if (!repoData?.repo) {
    return (
      <RepoLayout owner={owner!} repo={repo!} activeTab="planning">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Repository not found</p>
        </div>
      </RepoLayout>
    );
  }

  return (
    <RepoLayout owner={owner!} repo={repo!} activeTab="planning">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Brain className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">AI Planning</h1>
              <p className="text-sm text-muted-foreground">
                Break down complex tasks into parallel subtasks
              </p>
            </div>
          </div>
          {planningStatus?.available && (
            <Badge variant="outline" className="gap-1">
              <Sparkles className="h-3 w-3" />
              {planningStatus.provider}
            </Badge>
          )}
        </div>

        {/* AI Not Available Warning */}
        {planningStatus && !planningStatus.available && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <AlertCircle className="h-5 w-5 text-yellow-500" />
            <div>
              <p className="font-medium text-yellow-600 dark:text-yellow-400">
                AI not configured
              </p>
              <p className="text-sm text-muted-foreground">
                Add an API key in repository settings to use AI planning.
              </p>
            </div>
          </div>
        )}

        {/* Task Input */}
        <div className="space-y-4 p-6 rounded-lg border bg-card">
          <div className="space-y-2">
            <label className="text-sm font-medium">Task Description</label>
            <Textarea
              placeholder="Describe the task you want to accomplish... (e.g., 'Add user authentication with JWT tokens and password reset functionality')"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              className="min-h-[100px]"
              disabled={isRunning}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Additional Context (optional)</label>
            <Textarea
              placeholder="Any additional context, requirements, or constraints..."
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className="min-h-[60px]"
              disabled={isRunning}
            />
          </div>

          {/* Options */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="dryRun"
                checked={dryRun}
                onCheckedChange={(checked) => setDryRun(checked as boolean)}
                disabled={isRunning}
              />
              <label htmlFor="dryRun" className="text-sm cursor-pointer">
                Dry run (preview only)
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="createBranch"
                checked={createBranch}
                onCheckedChange={(checked) => setCreateBranch(checked as boolean)}
                disabled={isRunning}
              />
              <label htmlFor="createBranch" className="text-sm cursor-pointer">
                Create feature branch
              </label>
            </div>
          </div>

          {/* Advanced Options */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 -ml-2">
                {showAdvanced ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Advanced options
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Branch Name (optional)</label>
                <Input
                  placeholder="ai-planning/my-feature"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  disabled={isRunning || !createBranch}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4">
            <Button
              onClick={handleRun}
              disabled={!task.trim() || isRunning || !planningStatus?.available}
              className="gap-2"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {currentStatus === 'planning' ? 'Planning...' : 
                   currentStatus === 'executing' ? 'Executing...' : 
                   currentStatus === 'reviewing' ? 'Reviewing...' : 'Running...'}
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Start Planning
                </>
              )}
            </Button>
            {plan && (
              <Button
                variant="outline"
                onClick={() => {
                  setPlan(null);
                  setError(null);
                  setCurrentStatus('pending');
                }}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
            <div>
              <p className="font-medium text-red-600 dark:text-red-400">
                Planning failed
              </p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Execution Plan */}
        {plan && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ListTodo className="h-5 w-5" />
                Execution Plan
              </h2>
              <Badge className={cn(planningStatusConfig[currentStatus].color, 'text-white')}>
                {planningStatusConfig[currentStatus].label}
              </Badge>
            </div>

            {/* Plan Summary */}
            <div className="p-4 rounded-lg border bg-muted/50">
              <p className="text-sm">{plan.summary}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Estimated effort: {plan.estimatedTotalEffort} • 
                {plan.parallelGroups.length} parallel groups •
                {plan.parallelGroups.reduce((sum, g) => sum + g.subtasks.length, 0)} subtasks
              </p>
            </div>

            {/* Parallel Groups */}
            <div className="space-y-3">
              {plan.parallelGroups
                .sort((a, b) => a.executionOrder - b.executionOrder)
                .map((group) => (
                  <Collapsible
                    key={group.id}
                    open={expandedGroups.has(group.id)}
                    onOpenChange={() => toggleGroup(group.id)}
                  >
                    <div className="rounded-lg border bg-card overflow-hidden">
                      <CollapsibleTrigger asChild>
                        <button className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-3">
                            {expandedGroups.has(group.id) ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono text-xs">
                                #{group.executionOrder}
                              </Badge>
                              <span className="font-medium">{group.name}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                              {group.subtasks.length} tasks
                            </span>
                            {group.subtasks.every(t => t.status === 'completed') && (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            )}
                          </div>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t divide-y">
                          {group.subtasks.map((subtask) => {
                            const config = statusConfig[subtask.status];
                            const StatusIcon = config.icon;
                            return (
                              <div
                                key={subtask.id}
                                className="p-4 flex items-start gap-3"
                              >
                                <div className={cn('p-1.5 rounded', config.color)}>
                                  <StatusIcon className={cn(
                                    'h-4 w-4',
                                    subtask.status === 'in_progress' && 'animate-spin'
                                  )} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{subtask.title}</span>
                                    <Badge variant="outline" className="text-xs">
                                      {subtask.priority}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {subtask.description}
                                  </p>
                                  {subtask.result && (
                                    <p className="text-sm text-green-600 dark:text-green-400 mt-2">
                                      {subtask.result}
                                    </p>
                                  )}
                                  {subtask.error && (
                                    <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                                      {subtask.error}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isRunning && !plan && !error && (
          <div className="text-center py-12 text-muted-foreground">
            <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Describe a task to get started</p>
            <p className="text-sm mt-1">
              The AI will break it down into subtasks and execute them in parallel
            </p>
          </div>
        )}
      </div>
    </RepoLayout>
  );
}
