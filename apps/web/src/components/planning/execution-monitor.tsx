/**
 * Execution Monitor Component
 * 
 * Real-time monitoring of parallel agent task execution.
 * Shows progress, status, and results for each task.
 */

import { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FileCode,
  GitCommit,
  GitBranch,
  Terminal,
  Cpu,
  Zap,
  RefreshCw,
  CircleDashed,
  Play,
  Pause,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

// ============ TYPES ============

type TaskStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

interface Task {
  id: string;
  taskNumber: number;
  title: string;
  description: string;
  targetFiles: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dependsOn: string | null;
  branchName: string | null;
  resultSummary: string | null;
  filesChanged: string | null;
  commitSha: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

interface TaskCounts {
  pending: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}

// ============ CONSTANTS ============

const STATUS_CONFIG: Record<TaskStatus, { 
  icon: React.ElementType; 
  label: string; 
  color: string;
  bgColor: string;
}> = {
  pending: { icon: CircleDashed, label: 'Pending', color: 'text-zinc-400', bgColor: 'bg-zinc-500/10' },
  queued: { icon: Clock, label: 'Queued', color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  running: { icon: Loader2, label: 'Running', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  completed: { icon: CheckCircle2, label: 'Completed', color: 'text-green-400', bgColor: 'bg-green-500/10' },
  failed: { icon: XCircle, label: 'Failed', color: 'text-red-400', bgColor: 'bg-red-500/10' },
  cancelled: { icon: XCircle, label: 'Cancelled', color: 'text-zinc-500', bgColor: 'bg-zinc-500/10' },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-zinc-500/20 text-zinc-400' },
  medium: { label: 'Medium', color: 'bg-blue-500/20 text-blue-400' },
  high: { label: 'High', color: 'bg-orange-500/20 text-orange-400' },
  critical: { label: 'Critical', color: 'bg-red-500/20 text-red-400' },
};

// ============ COMPONENTS ============

/**
 * Progress circle for visual status
 */
function ProgressRing({ 
  value, 
  size = 120, 
  strokeWidth = 8 
}: { 
  value: number; 
  size?: number; 
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-zinc-800"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="url(#progress-gradient)"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-500"
      />
      <defs>
        <linearGradient id="progress-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/**
 * Task execution card
 */
function TaskExecutionCard({ 
  task, 
  onRetry,
}: { 
  task: Task;
  onRetry?: (taskId: string) => void;
}) {
  const [expanded, setExpanded] = useState(task.status === 'running' || task.status === 'failed');
  const config = STATUS_CONFIG[task.status];
  const priorityConfig = PRIORITY_CONFIG[task.priority];
  const StatusIcon = config.icon;
  const targetFiles: string[] = task.targetFiles ? JSON.parse(task.targetFiles) : [];
  const filesChanged: string[] = task.filesChanged ? JSON.parse(task.filesChanged) : [];

  const formatDuration = (start: Date | null, end: Date | null) => {
    if (!start) return null;
    const endTime = end ? new Date(end) : new Date();
    const diff = endTime.getTime() - new Date(start).getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const duration = formatDuration(task.startedAt, task.completedAt);

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <Card className={cn(
        'bg-zinc-900/50 border-zinc-800 transition-all',
        task.status === 'running' && 'border-yellow-500/30 bg-yellow-500/5',
        task.status === 'failed' && 'border-red-500/30 bg-red-500/5',
        task.status === 'completed' && 'border-green-500/20',
      )}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 cursor-pointer hover:bg-zinc-800/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center',
                  config.bgColor
                )}>
                  <StatusIcon className={cn(
                    'h-4 w-4',
                    config.color,
                    task.status === 'running' && 'animate-spin'
                  )} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="h-5 px-1.5 text-xs font-mono">
                      #{task.taskNumber}
                    </Badge>
                    <span className="text-sm font-medium text-zinc-200">{task.title}</span>
                    <Badge className={cn('h-5 text-xs', priorityConfig.color)}>
                      {priorityConfig.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                    <span className={config.color}>{config.label}</span>
                    {duration && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {duration}
                      </span>
                    )}
                    {task.branchName && (
                      <span className="flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        {task.branchName}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {task.status === 'failed' && onRetry && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 gap-1 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRetry(task.id);
                    }}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Retry
                  </Button>
                )}
                {expanded ? (
                  <ChevronDown className="h-4 w-4 text-zinc-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-zinc-500" />
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            <div className="border-t border-zinc-800 pt-4">
              <p className="text-xs text-zinc-500 mb-1">Description</p>
              <p className="text-sm text-zinc-400">{task.description}</p>
            </div>

            {targetFiles.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 mb-2">Target Files</p>
                <div className="flex flex-wrap gap-1.5">
                  {targetFiles.map((file, i) => (
                    <Badge key={i} variant="secondary" className="text-xs font-mono gap-1">
                      <FileCode className="h-3 w-3" />
                      {file}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {filesChanged.length > 0 && (
              <div>
                <p className="text-xs text-zinc-500 mb-2">Files Changed</p>
                <div className="flex flex-wrap gap-1.5">
                  {filesChanged.map((file, i) => (
                    <Badge key={i} variant="secondary" className="text-xs font-mono gap-1 bg-green-500/10 text-green-400">
                      <FileCode className="h-3 w-3" />
                      {file}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {task.commitSha && (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <GitCommit className="h-3 w-3" />
                <code className="font-mono">{task.commitSha.slice(0, 8)}</code>
              </div>
            )}

            {task.resultSummary && (
              <div className="p-3 rounded-lg bg-zinc-800/50">
                <p className="text-xs text-zinc-500 mb-1">Result</p>
                <p className="text-sm text-zinc-300">{task.resultSummary}</p>
              </div>
            )}

            {task.errorMessage && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-2 text-red-400 text-xs font-medium mb-1">
                  <AlertCircle className="h-3 w-3" />
                  Error
                </div>
                <p className="text-sm text-red-300 font-mono">{task.errorMessage}</p>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ============ MAIN COMPONENT ============

interface ExecutionMonitorProps {
  tasks: Task[];
  taskCounts: TaskCounts;
  isExecuting: boolean;
  maxConcurrency: number;
  onRetryTask?: (taskId: string) => void;
  onCancel?: () => void;
  onResume?: () => void;
}

export function ExecutionMonitor({
  tasks,
  taskCounts,
  isExecuting,
  maxConcurrency,
  onRetryTask,
  onCancel,
  onResume,
}: ExecutionMonitorProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  
  const total = Object.values(taskCounts).reduce((a, b) => a + b, 0);
  const completed = taskCounts.completed + taskCounts.failed + taskCounts.cancelled;
  const progress = total > 0 ? (completed / total) * 100 : 0;
  const successRate = (taskCounts.completed + taskCounts.failed) > 0 
    ? (taskCounts.completed / (taskCounts.completed + taskCounts.failed)) * 100 
    : 100;
  
  // Timer for elapsed time
  useEffect(() => {
    if (!isExecuting) return;
    
    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    
    return () => clearInterval(interval);
  }, [isExecuting]);

  const formatElapsedTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header Stats */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-6">
          {/* Progress Ring */}
          <div className="relative">
            <ProgressRing value={progress} size={100} strokeWidth={6} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-zinc-100">
                {Math.round(progress)}%
              </span>
              <span className="text-xs text-zinc-500">Complete</span>
            </div>
          </div>
          
          {/* Stats Grid */}
          <div className="flex-1 grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">{taskCounts.completed}</div>
              <div className="text-xs text-zinc-500">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">{taskCounts.running}</div>
              <div className="text-xs text-zinc-500">Running</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">{taskCounts.pending + taskCounts.queued}</div>
              <div className="text-xs text-zinc-500">Pending</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">{taskCounts.failed}</div>
              <div className="text-xs text-zinc-500">Failed</div>
            </div>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
            <span className="flex items-center gap-2">
              <Cpu className="h-3 w-3" />
              {taskCounts.running} / {maxConcurrency} agents active
            </span>
            <span className="flex items-center gap-2">
              <Clock className="h-3 w-3" />
              {formatElapsedTime(elapsedTime)}
            </span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
        
        {/* Controls */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            {isExecuting ? (
              <Badge className="bg-yellow-500/20 text-yellow-400 gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Executing
              </Badge>
            ) : completed === total && total > 0 ? (
              <Badge className={cn(
                'gap-1',
                taskCounts.failed > 0 
                  ? 'bg-orange-500/20 text-orange-400' 
                  : 'bg-green-500/20 text-green-400'
              )}>
                <CheckCircle2 className="h-3 w-3" />
                {taskCounts.failed > 0 ? 'Completed with errors' : 'All tasks completed'}
              </Badge>
            ) : null}
            
            {successRate < 100 && completed > 0 && (
              <Badge variant="secondary" className="text-xs">
                {Math.round(successRate)}% success rate
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {isExecuting && onCancel && (
              <Button variant="destructive" size="sm" className="gap-1" onClick={onCancel}>
                <Pause className="h-3 w-3" />
                Cancel
              </Button>
            )}
            {!isExecuting && taskCounts.failed > 0 && onResume && (
              <Button size="sm" className="gap-1" onClick={onResume}>
                <RefreshCw className="h-3 w-3" />
                Retry Failed
              </Button>
            )}
          </div>
        </div>
      </div>
      
      {/* Task List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {/* Running tasks first */}
          {tasks.filter(t => t.status === 'running').map((task) => (
            <TaskExecutionCard 
              key={task.id} 
              task={task}
              onRetry={onRetryTask}
            />
          ))}
          
          {/* Failed tasks */}
          {tasks.filter(t => t.status === 'failed').map((task) => (
            <TaskExecutionCard 
              key={task.id} 
              task={task}
              onRetry={onRetryTask}
            />
          ))}
          
          {/* Queued tasks */}
          {tasks.filter(t => t.status === 'queued').map((task) => (
            <TaskExecutionCard 
              key={task.id} 
              task={task}
              onRetry={onRetryTask}
            />
          ))}
          
          {/* Pending tasks */}
          {tasks.filter(t => t.status === 'pending').map((task) => (
            <TaskExecutionCard 
              key={task.id} 
              task={task}
              onRetry={onRetryTask}
            />
          ))}
          
          {/* Completed tasks */}
          {tasks.filter(t => t.status === 'completed').map((task) => (
            <TaskExecutionCard 
              key={task.id} 
              task={task}
              onRetry={onRetryTask}
            />
          ))}
          
          {/* Cancelled tasks */}
          {tasks.filter(t => t.status === 'cancelled').map((task) => (
            <TaskExecutionCard 
              key={task.id} 
              task={task}
              onRetry={onRetryTask}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
