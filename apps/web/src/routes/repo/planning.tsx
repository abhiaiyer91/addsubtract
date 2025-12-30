import { useState, useCallback, useRef, useEffect } from 'react';
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
  Search,
  Zap,
  Eye,
  Activity,
  Terminal,
  CircleDot,
  CheckCheck,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { RepoLayout } from './components/repo-layout';
import { Loading } from '@/components/ui/loading';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

// =============================================================================
// Types
// =============================================================================

type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
type WorkflowPhase = 'idle' | 'analyzing' | 'planning' | 'executing' | 'reviewing' | 'completed' | 'failed';

interface Subtask {
  id: string;
  title: string;
  description: string;
  priority: string;
  estimatedEffort?: string;
  targetFiles?: string[];
  status: TaskStatus;
  result?: string;
  error?: string;
  duration?: number;
  filesModified?: string[];
}

interface ParallelGroup {
  id: string;
  name: string;
  executionOrder: number;
  subtasks: Subtask[];
  isCompleted?: boolean;
  duration?: number;
}

interface ExecutionPlan {
  id: string;
  version: number;
  originalTask: string;
  summary: string;
  parallelGroups: ParallelGroup[];
  estimatedTotalEffort: string;
  riskAssessment?: string;
}

interface ReviewResult {
  overallSuccess: boolean;
  completedTasks: number;
  failedTasks: number;
  skippedTasks: number;
  issues: Array<{
    subtaskId: string;
    issue: string;
    severity: 'error' | 'warning' | 'info';
    suggestion?: string;
  }>;
  needsReplanning: boolean;
  replanningReason?: string;
  summary: string;
}

interface ActivityLogEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'warning' | 'error' | 'phase' | 'task';
  message: string;
  details?: string;
}

interface ProjectInfo {
  type: string;
  language: string;
  hasTests: boolean;
  hasLinting: boolean;
  structure: string[];
}

// Step to phase mapping
const stepToPhase: Record<string, WorkflowPhase> = {
  'analyze-task': 'analyzing',
  'create-plan': 'planning',
  'execute-plan': 'executing',
  'review-results': 'reviewing',
  'aggregate-results': 'reviewing',
};

// Step to progress mapping
const stepToProgress: Record<string, number> = {
  'analyze-task': 15,
  'create-plan': 35,
  'execute-plan': 70,
  'review-results': 90,
  'aggregate-results': 95,
};

// =============================================================================
// Status Configurations
// =============================================================================

const taskStatusConfig: Record<TaskStatus, { label: string; icon: typeof CheckCircle2; color: string }> = {
  pending: { label: 'Pending', icon: Clock, color: 'text-gray-500 bg-gray-500/10' },
  in_progress: { label: 'Running', icon: Loader2, color: 'text-blue-500 bg-blue-500/10' },
  completed: { label: 'Done', icon: CheckCircle2, color: 'text-green-500 bg-green-500/10' },
  failed: { label: 'Failed', icon: XCircle, color: 'text-red-500 bg-red-500/10' },
  skipped: { label: 'Skipped', icon: Clock, color: 'text-yellow-500 bg-yellow-500/10' },
};

const phaseConfig: Record<WorkflowPhase, { label: string; icon: typeof Brain; color: string; bgColor: string }> = {
  idle: { label: 'Ready', icon: Brain, color: 'text-gray-500', bgColor: 'bg-gray-500' },
  analyzing: { label: 'Analyzing', icon: Search, color: 'text-purple-500', bgColor: 'bg-purple-500' },
  planning: { label: 'Planning', icon: Brain, color: 'text-indigo-500', bgColor: 'bg-indigo-500' },
  executing: { label: 'Executing', icon: Zap, color: 'text-orange-500', bgColor: 'bg-orange-500' },
  reviewing: { label: 'Reviewing', icon: Eye, color: 'text-cyan-500', bgColor: 'bg-cyan-500' },
  completed: { label: 'Completed', icon: CheckCircle2, color: 'text-green-500', bgColor: 'bg-green-500' },
  failed: { label: 'Failed', icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-500' },
};

// =============================================================================
// Component: PhaseProgress
// =============================================================================

function PhaseProgress({ phase, progress }: { phase: WorkflowPhase; progress: number }) {
  const phases: WorkflowPhase[] = ['analyzing', 'planning', 'executing', 'reviewing'];
  const currentIndex = phases.indexOf(phase);
  
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className={cn('font-medium flex items-center gap-2', phaseConfig[phase].color)}>
          {(() => {
            const PhaseIcon = phaseConfig[phase].icon;
            return <PhaseIcon className={cn('h-4 w-4', phase === 'executing' && 'animate-pulse')} />;
          })()}
          {phaseConfig[phase].label}
        </span>
        <span className="text-muted-foreground">{progress}%</span>
      </div>
      <Progress value={progress} className="h-2" />
      <div className="flex justify-between">
        {phases.map((p, index) => {
          const isActive = index === currentIndex;
          const isComplete = index < currentIndex || phase === 'completed';
          const config = phaseConfig[p];
          const Icon = isComplete ? CheckCircle2 : config.icon;
          
          return (
            <div
              key={p}
              className={cn(
                'flex flex-col items-center gap-1 text-xs transition-all',
                isActive && config.color,
                isComplete && 'text-green-500',
                !isActive && !isComplete && 'text-muted-foreground'
              )}
            >
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                isActive && `${config.bgColor}/20`,
                isComplete && 'bg-green-500/20',
                !isActive && !isComplete && 'bg-muted'
              )}>
                <Icon className={cn('h-4 w-4', isActive && phase !== 'completed' && phase !== 'failed' && 'animate-spin')} />
              </div>
              <span className="font-medium">{config.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Component: ActivityLog
// =============================================================================

function ActivityLog({ entries, maxHeight = 300 }: { entries: ActivityLogEntry[]; maxHeight?: number }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  const getIcon = (type: ActivityLogEntry['type']) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />;
      case 'error': return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      case 'phase': return <CircleDot className="h-3.5 w-3.5 text-blue-500" />;
      case 'task': return <Zap className="h-3.5 w-3.5 text-orange-500" />;
      default: return <Info className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <ScrollArea ref={scrollRef} className="border rounded-lg bg-muted/30" style={{ maxHeight }}>
      <div className="p-3 space-y-2 font-mono text-xs">
        {entries.length === 0 ? (
          <div className="text-muted-foreground text-center py-4">
            Activity will appear here...
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex items-start gap-2">
              <span className="text-muted-foreground shrink-0 w-16">
                {entry.timestamp.toLocaleTimeString()}
              </span>
              <span className="shrink-0">{getIcon(entry.type)}</span>
              <span className={cn(
                entry.type === 'error' && 'text-red-500',
                entry.type === 'warning' && 'text-yellow-500',
                entry.type === 'success' && 'text-green-500',
                entry.type === 'phase' && 'text-blue-500 font-medium',
              )}>
                {entry.message}
                {entry.details && (
                  <span className="text-muted-foreground ml-1">({entry.details})</span>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </ScrollArea>
  );
}

// =============================================================================
// Component: TaskCard
// =============================================================================

function TaskCard({ task, isExpanded, onToggle }: { 
  task: Subtask; 
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const config = taskStatusConfig[task.status];
  const StatusIcon = config.icon;
  
  return (
    <div className={cn(
      'border rounded-lg transition-all',
      task.status === 'in_progress' && 'border-blue-500/50 bg-blue-500/5',
      task.status === 'completed' && 'border-green-500/30',
      task.status === 'failed' && 'border-red-500/30 bg-red-500/5',
    )}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
      >
        <div className={cn('p-1.5 rounded shrink-0', config.color)}>
          <StatusIcon className={cn(
            'h-4 w-4',
            task.status === 'in_progress' && 'animate-spin'
          )} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{task.title}</span>
            <Badge variant="outline" className="text-xs shrink-0">
              {task.priority}
            </Badge>
            {task.estimatedEffort && (
              <Badge variant="secondary" className="text-xs shrink-0">
                {task.estimatedEffort}
              </Badge>
            )}
          </div>
          {task.status === 'in_progress' && (
            <p className="text-xs text-blue-500 mt-0.5 animate-pulse">
              Executing...
            </p>
          )}
        </div>
        <div className="shrink-0">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>
      
      {isExpanded && (
        <div className="px-3 pb-3 pt-0 border-t space-y-2">
          <p className="text-sm text-muted-foreground">{task.description}</p>
          
          {task.targetFiles && task.targetFiles.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.targetFiles.map((file) => (
                <Badge key={file} variant="outline" className="text-xs font-mono">
                  <FileCode className="h-3 w-3 mr-1" />
                  {file}
                </Badge>
              ))}
            </div>
          )}
          
          {task.result && (
            <div className="p-2 rounded bg-green-500/10 text-sm text-green-600 dark:text-green-400">
              {task.result}
            </div>
          )}
          
          {task.error && (
            <div className="p-2 rounded bg-red-500/10 text-sm text-red-600 dark:text-red-400">
              {task.error}
            </div>
          )}
          
          {task.filesModified && task.filesModified.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Modified: {task.filesModified.join(', ')}
            </div>
          )}
          
          {task.duration !== undefined && (
            <div className="text-xs text-muted-foreground">
              Duration: {(task.duration / 1000).toFixed(1)}s
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Component: ExecutionPlanView
// =============================================================================

function ExecutionPlanView({ plan, expandedTasks, onToggleTask }: {
  plan: ExecutionPlan;
  expandedTasks: Set<string>;
  onToggleTask: (taskId: string) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => 
    new Set(plan.parallelGroups.map(g => g.id))
  );

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

  const totalTasks = plan.parallelGroups.reduce((sum, g) => sum + g.subtasks.length, 0);
  const completedTasks = plan.parallelGroups.reduce(
    (sum, g) => sum + g.subtasks.filter(t => t.status === 'completed').length,
    0
  );
  const failedTasks = plan.parallelGroups.reduce(
    (sum, g) => sum + g.subtasks.filter(t => t.status === 'failed').length,
    0
  );

  return (
    <div className="space-y-4">
      {/* Plan Summary */}
      <div className="p-4 rounded-lg border bg-muted/50">
        <p className="text-sm">{plan.summary}</p>
        <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ListTodo className="h-3.5 w-3.5" />
            {totalTasks} subtasks
          </span>
          <span className="flex items-center gap-1">
            <Activity className="h-3.5 w-3.5" />
            {plan.parallelGroups.length} groups
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {plan.estimatedTotalEffort}
          </span>
          {completedTasks > 0 && (
            <span className="flex items-center gap-1 text-green-500">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {completedTasks} done
            </span>
          )}
          {failedTasks > 0 && (
            <span className="flex items-center gap-1 text-red-500">
              <XCircle className="h-3.5 w-3.5" />
              {failedTasks} failed
            </span>
          )}
        </div>
        {plan.riskAssessment && (
          <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            {plan.riskAssessment}
          </p>
        )}
      </div>

      {/* Parallel Groups */}
      <div className="space-y-3">
        {plan.parallelGroups
          .sort((a, b) => a.executionOrder - b.executionOrder)
          .map((group) => {
            const groupCompleted = group.subtasks.filter(t => t.status === 'completed').length;
            const groupFailed = group.subtasks.filter(t => t.status === 'failed').length;
            const groupRunning = group.subtasks.filter(t => t.status === 'in_progress').length;
            const isExpanded = expandedGroups.has(group.id);
            
            return (
              <Collapsible
                key={group.id}
                open={isExpanded}
                onOpenChange={() => toggleGroup(group.id)}
              >
                <div className={cn(
                  'rounded-lg border bg-card overflow-hidden transition-all',
                  groupRunning > 0 && 'border-blue-500/50 shadow-sm shadow-blue-500/10',
                  group.isCompleted && 'border-green-500/30',
                )}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <Badge variant="outline" className="font-mono text-xs">
                          #{group.executionOrder}
                        </Badge>
                        <span className="font-medium">{group.name}</span>
                        {groupRunning > 0 && (
                          <Badge className="bg-blue-500 text-white animate-pulse">
                            Running
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1 text-sm">
                          {groupCompleted > 0 && (
                            <span className="text-green-500">{groupCompleted}</span>
                          )}
                          {groupFailed > 0 && (
                            <span className="text-red-500">/{groupFailed}</span>
                          )}
                          <span className="text-muted-foreground">/{group.subtasks.length}</span>
                        </div>
                        {group.isCompleted && (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t p-3 space-y-2">
                      {group.subtasks.map((subtask) => (
                        <TaskCard
                          key={subtask.id}
                          task={subtask}
                          isExpanded={expandedTasks.has(subtask.id)}
                          onToggle={() => onToggleTask(subtask.id)}
                        />
                      ))}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
      </div>
    </div>
  );
}

// =============================================================================
// Component: ReviewView
// =============================================================================

function ReviewView({ review }: { review: ReviewResult }) {
  return (
    <div className="space-y-4">
      <div className={cn(
        'p-4 rounded-lg border',
        review.overallSuccess ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'
      )}>
        <div className="flex items-center gap-2 mb-2">
          {review.overallSuccess ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : (
            <XCircle className="h-5 w-5 text-red-500" />
          )}
          <span className="font-medium">
            {review.overallSuccess ? 'All tasks completed successfully' : 'Some tasks failed'}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{review.summary}</p>
        
        <div className="flex gap-4 mt-3 text-sm">
          <span className="text-green-500">{review.completedTasks} completed</span>
          {review.failedTasks > 0 && (
            <span className="text-red-500">{review.failedTasks} failed</span>
          )}
          {review.skippedTasks > 0 && (
            <span className="text-yellow-500">{review.skippedTasks} skipped</span>
          )}
        </div>
      </div>

      {review.issues.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Issues</h4>
          {review.issues.map((issue, i) => (
            <div
              key={i}
              className={cn(
                'p-3 rounded-lg border text-sm',
                issue.severity === 'error' && 'bg-red-500/10 border-red-500/30',
                issue.severity === 'warning' && 'bg-yellow-500/10 border-yellow-500/30',
                issue.severity === 'info' && 'bg-blue-500/10 border-blue-500/30',
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                {issue.severity === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
                {issue.severity === 'warning' && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                {issue.severity === 'info' && <Info className="h-4 w-4 text-blue-500" />}
                <span className="font-medium">{issue.subtaskId}</span>
              </div>
              <p>{issue.issue}</p>
              {issue.suggestion && (
                <p className="text-muted-foreground mt-1">Suggestion: {issue.suggestion}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {review.needsReplanning && review.replanningReason && (
        <div className="p-3 rounded-lg border border-orange-500/30 bg-orange-500/10">
          <div className="flex items-center gap-2 mb-1">
            <RefreshCw className="h-4 w-4 text-orange-500" />
            <span className="font-medium text-orange-600 dark:text-orange-400">
              Re-planning recommended
            </span>
          </div>
          <p className="text-sm">{review.replanningReason}</p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Main Component: PlanningPage
// =============================================================================

export function PlanningPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { data: session } = useSession();
  
  // Form state
  const [task, setTask] = useState('');
  const [context, setContext] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [createBranch, setCreateBranch] = useState(true);
  const [branchName, setBranchName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Workflow state
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<WorkflowPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [plan, setPlan] = useState<ExecutionPlan | null>(null);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'plan' | 'activity' | 'review'>('plan');
  
  // Results state
  const [branchCreated, setBranchCreated] = useState<string | null>(null);
  const [filesModified, setFilesModified] = useState<string[]>([]);

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

  // Activity log helper
  const addLog = useCallback((
    type: ActivityLogEntry['type'],
    message: string,
    details?: string
  ) => {
    setActivityLog(prev => [...prev, {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      type,
      message,
      details,
    }]);
  }, []);

  // Update subtask status
  const updateSubtask = useCallback((subtaskId: string, updates: Partial<Subtask>) => {
    setPlan(prev => {
      if (!prev) return null;
      return {
        ...prev,
        parallelGroups: prev.parallelGroups.map(group => ({
          ...group,
          subtasks: group.subtasks.map(task =>
            task.id === subtaskId ? { ...task, ...updates } : task
          ),
        })),
      };
    });
  }, []);

  // Streaming subscription - interprets Mastra workflow events
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (trpc as any).planning?.stream?.useSubscription(
    {
      repoId: repoData?.repo.id!,
      task: task.trim(),
      context: context.trim() || undefined,
      dryRun,
      createBranch,
      branchName: branchName.trim() || undefined,
      maxIterations: 3,
      maxParallelTasks: 5,
    },
    {
      enabled: isRunning && !!repoData?.repo.id,
      onData: (event: { type: string; stepId?: string; result?: any; error?: string }) => {
        const { type, stepId, result, error: eventError } = event;
        
        switch (type) {
          case 'started':
            addLog('phase', `Starting workflow for: ${result?.task?.slice(0, 50) || task.slice(0, 50)}...`);
            setPhase('analyzing');
            setProgress(5);
            break;
            
          case 'step-start':
            if (stepId) {
              const newPhase = stepToPhase[stepId];
              if (newPhase) {
                setPhase(newPhase);
                setProgress(stepToProgress[stepId] || progress);
                addLog('phase', `${phaseConfig[newPhase]?.label || stepId}...`);
              }
            }
            break;
            
          case 'step-complete':
            if (stepId) {
              setProgress(stepToProgress[stepId] ? stepToProgress[stepId] + 10 : progress + 10);
              
              // Handle step-specific results
              if (stepId === 'analyze-task' && result) {
                if (result.projectInfo) {
                  setProjectInfo(result.projectInfo);
                  addLog('success', `Detected ${result.projectInfo.language} ${result.projectInfo.type} project`);
                }
              }
              
              if (stepId === 'create-plan' && result?.plan) {
                setPlan(result.plan);
                const taskCount = result.plan.parallelGroups?.reduce(
                  (sum: number, g: ParallelGroup) => sum + g.subtasks.length, 0
                ) || 0;
                addLog('success', `Created plan with ${taskCount} tasks`);
                setActiveTab('plan');
              }
              
              if (stepId === 'execute-plan' && result) {
                // Update plan with execution results
                if (result.groupResults) {
                  for (const group of result.groupResults) {
                    for (const taskResult of group.subtaskResults) {
                      updateSubtask(taskResult.subtaskId, {
                        status: taskResult.status,
                        result: taskResult.result,
                        error: taskResult.error,
                        duration: taskResult.duration,
                        filesModified: taskResult.filesModified,
                      });
                      
                      if (taskResult.status === 'completed') {
                        addLog('success', `Completed: ${taskResult.subtaskId}`);
                      } else if (taskResult.status === 'failed') {
                        addLog('error', `Failed: ${taskResult.subtaskId}`, taskResult.error);
                      }
                    }
                  }
                }
                if (result.branchName) setBranchCreated(result.branchName);
                if (result.filesModified) setFilesModified(result.filesModified);
              }
              
              if (stepId === 'review-results' && result?.review) {
                setReview(result.review);
                addLog(
                  result.review.overallSuccess ? 'success' : 'warning',
                  result.review.summary
                );
                setActiveTab('review');
              }
            }
            break;
            
          case 'step-error':
            addLog('error', `Step failed: ${stepId}`, eventError);
            break;
            
          case 'complete':
            setPhase('completed');
            setProgress(100);
            addLog('success', 'Workflow completed', `${result?.totalDuration ? (result.totalDuration / 1000).toFixed(1) + 's' : ''}`);
            setIsRunning(false);
            break;
            
          case 'error':
            setError(eventError || 'Unknown error');
            setPhase('failed');
            addLog('error', eventError || 'Workflow failed');
            setIsRunning(false);
            break;
        }
      },
      onError: (err: Error) => {
        setError(err.message);
        setPhase('failed');
        setIsRunning(false);
        addLog('error', `Connection error: ${err.message}`);
      },
    }
  );

  const handleStart = () => {
    if (!task.trim() || !repoData?.repo.id) return;
    
    // Reset state
    setIsRunning(true);
    setPhase('analyzing');
    setProgress(0);
    setPlan(null);
    setReview(null);
    setProjectInfo(null);
    setError(null);
    setActivityLog([]);
    setBranchCreated(null);
    setFilesModified([]);
    setExpandedTasks(new Set());
    setActiveTab('activity');
    
    addLog('phase', 'Initializing workflow...');
  };

  const handleReset = () => {
    setIsRunning(false);
    setPhase('idle');
    setProgress(0);
    setPlan(null);
    setReview(null);
    setProjectInfo(null);
    setError(null);
    setActivityLog([]);
    setBranchCreated(null);
    setFilesModified([]);
    setExpandedTasks(new Set());
    setActiveTab('plan');
  };

  const toggleTask = (taskId: string) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
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

  const isIdle = phase === 'idle';
  const isComplete = phase === 'completed' || phase === 'failed';

  return (
    <RepoLayout owner={owner!} repo={repo!} activeTab="planning">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2 rounded-lg transition-colors',
              isRunning ? 'bg-blue-500/10' : 'bg-primary/10'
            )}>
              <Brain className={cn(
                'h-6 w-6',
                isRunning ? 'text-blue-500 animate-pulse' : 'text-primary'
              )} />
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

        {/* Progress Section (shown when running) */}
        {(isRunning || isComplete) && (
          <div className="p-6 rounded-lg border bg-card">
            <PhaseProgress phase={phase} progress={progress} />
            
            {/* Project Info */}
            {projectInfo && (
              <div className="mt-4 pt-4 border-t flex flex-wrap gap-2">
                <Badge variant="secondary">{projectInfo.language}</Badge>
                <Badge variant="secondary">{projectInfo.type}</Badge>
                {projectInfo.hasTests && <Badge variant="outline">Tests</Badge>}
                {projectInfo.hasLinting && <Badge variant="outline">Linting</Badge>}
              </div>
            )}
            
            {/* Results Summary */}
            {isComplete && (
              <div className="mt-4 pt-4 border-t space-y-2">
                {branchCreated && (
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    <span>Branch: <code className="px-1 py-0.5 rounded bg-muted">{branchCreated}</code></span>
                  </div>
                )}
                {filesModified.length > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <FileCode className="h-4 w-4 text-muted-foreground" />
                    <span>{filesModified.length} files modified</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Task Input (shown when idle) */}
        {isIdle && (
          <div className="space-y-4 p-6 rounded-lg border bg-card">
            <div className="space-y-2">
              <label className="text-sm font-medium">Task Description</label>
              <Textarea
                placeholder="Describe the task you want to accomplish... (e.g., 'Add user authentication with JWT tokens and password reset functionality')"
                value={task}
                onChange={(e) => setTask(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Additional Context (optional)</label>
              <Textarea
                placeholder="Any additional context, requirements, or constraints..."
                value={context}
                onChange={(e) => setContext(e.target.value)}
                className="min-h-[60px]"
              />
            </div>

            {/* Options */}
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="dryRun"
                  checked={dryRun}
                  onCheckedChange={(checked) => setDryRun(checked as boolean)}
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
                    disabled={!createBranch}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Start Button */}
            <div className="flex items-center gap-3 pt-4">
              <Button
                onClick={handleStart}
                disabled={!task.trim() || !planningStatus?.available}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                Start Planning
              </Button>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="flex items-start gap-3 p-4 rounded-lg bg-red-500/10 border border-red-500/20">
            <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
            <div>
              <p className="font-medium text-red-600 dark:text-red-400">
                {phase === 'failed' ? 'Workflow failed' : 'Error'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Main Content Tabs (shown when running or complete) */}
        {(isRunning || plan || review) && (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="plan" className="gap-2">
                <ListTodo className="h-4 w-4" />
                Plan
                {plan && (
                  <Badge variant="secondary" className="ml-1">
                    {plan.parallelGroups.reduce((sum, g) => sum + g.subtasks.length, 0)}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="activity" className="gap-2">
                <Terminal className="h-4 w-4" />
                Activity
                {isRunning && <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />}
              </TabsTrigger>
              <TabsTrigger value="review" className="gap-2" disabled={!review}>
                <Eye className="h-4 w-4" />
                Review
                {review && (
                  <Badge variant={review.overallSuccess ? 'default' : 'destructive'} className="ml-1">
                    {review.overallSuccess ? 'Pass' : 'Fail'}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="plan" className="mt-4">
              {plan ? (
                <ExecutionPlanView
                  plan={plan}
                  expandedTasks={expandedTasks}
                  onToggleTask={toggleTask}
                />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Plan will appear here once created...</p>
                </div>
              )}
            </TabsContent>
            
            <TabsContent value="activity" className="mt-4">
              <ActivityLog entries={activityLog} maxHeight={500} />
            </TabsContent>
            
            <TabsContent value="review" className="mt-4">
              {review ? (
                <ReviewView review={review} />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Review will appear after execution...</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}

        {/* Reset Button (shown when complete) */}
        {isComplete && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={handleReset} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Start New Planning Session
            </Button>
          </div>
        )}

        {/* Empty State */}
        {isIdle && !plan && !error && (
          <div className="text-center py-12 text-muted-foreground">
            <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Describe a task to get started</p>
            <p className="text-sm mt-1">
              The AI will analyze your codebase, create a plan, and execute tasks in parallel
            </p>
          </div>
        )}
      </div>
    </RepoLayout>
  );
}
