/**
 * Planning Session Component
 * 
 * A comprehensive UI for the agent planning workflow:
 * - Planning phase: Iterate on plan with AI
 * - Task review: View and edit generated tasks
 * - Execution: Monitor parallel agent execution
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  Plus,
  AlertCircle,
  Loader2,
  User,
  Bot,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  ListTodo,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  GripVertical,
  Target,
  FileCode,
  GitBranch,
  RefreshCw,
  Check,
  X,
  Zap,
  AlertTriangle,
  CircleDashed,
  Circle,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

// ============ TYPES ============

type SessionStatus = 'planning' | 'ready' | 'executing' | 'completed' | 'failed' | 'cancelled';
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
  resultSummary: string | null;
  filesChanged: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  iteration: number;
  createdAt: Date;
}

// ============ CONSTANTS ============

const STATUS_CONFIG: Record<SessionStatus, { icon: React.ElementType; label: string; color: string }> = {
  planning: { icon: Pencil, label: 'Planning', color: 'text-blue-400 bg-blue-500/10' },
  ready: { icon: CheckCircle2, label: 'Ready', color: 'text-green-400 bg-green-500/10' },
  executing: { icon: Loader2, label: 'Executing', color: 'text-yellow-400 bg-yellow-500/10' },
  completed: { icon: CheckCircle2, label: 'Completed', color: 'text-emerald-400 bg-emerald-500/10' },
  failed: { icon: XCircle, label: 'Failed', color: 'text-red-400 bg-red-500/10' },
  cancelled: { icon: XCircle, label: 'Cancelled', color: 'text-zinc-400 bg-zinc-500/10' },
};

const TASK_STATUS_CONFIG: Record<TaskStatus, { icon: React.ElementType; label: string; color: string }> = {
  pending: { icon: CircleDashed, label: 'Pending', color: 'text-zinc-400' },
  queued: { icon: Clock, label: 'Queued', color: 'text-blue-400' },
  running: { icon: Loader2, label: 'Running', color: 'text-yellow-400' },
  completed: { icon: CheckCircle2, label: 'Completed', color: 'text-green-400' },
  failed: { icon: XCircle, label: 'Failed', color: 'text-red-400' },
  cancelled: { icon: X, label: 'Cancelled', color: 'text-zinc-500' },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-zinc-500/20 text-zinc-400' },
  medium: { label: 'Medium', color: 'bg-blue-500/20 text-blue-400' },
  high: { label: 'High', color: 'bg-orange-500/20 text-orange-400' },
  critical: { label: 'Critical', color: 'bg-red-500/20 text-red-400' },
};

// ============ COMPONENTS ============

/**
 * Message bubble for planning chat
 */
function PlanningMessage({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div className={cn('flex gap-3 py-4 px-4', isUser && 'bg-zinc-900/30')}>
      <div
        className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0',
          isUser
            ? 'bg-zinc-700 text-zinc-300'
            : isSystem
            ? 'bg-red-500/20 text-red-400'
            : 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white'
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : isSystem ? <AlertCircle className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-zinc-400">
            {isUser ? 'You' : isSystem ? 'System' : 'Planning Agent'}
          </span>
          <span className="text-xs text-zinc-600">Iteration {message.iteration + 1}</span>
        </div>
        <div className={cn('prose prose-sm prose-invert max-w-none', isSystem && 'text-red-400')}>
          <pre className="whitespace-pre-wrap text-sm text-zinc-300 font-sans">{message.content}</pre>
        </div>
      </div>
    </div>
  );
}

/**
 * Task card component
 */
function TaskCard({
  task,
  onEdit,
  onDelete,
  isEditing,
  disabled,
}: {
  task: Task;
  onEdit?: () => void;
  onDelete?: () => void;
  isEditing?: boolean;
  disabled?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const statusConfig = TASK_STATUS_CONFIG[task.status];
  const priorityConfig = PRIORITY_CONFIG[task.priority];
  const StatusIcon = statusConfig.icon;
  const targetFiles: string[] = task.targetFiles ? JSON.parse(task.targetFiles) : [];

  return (
    <Card className={cn('bg-zinc-900/50 border-zinc-800', isEditing && 'ring-2 ring-blue-500')}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0">
            {!disabled && (
              <div className="mt-1 cursor-grab text-zinc-600 hover:text-zinc-400">
                <GripVertical className="h-4 w-4" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="h-5 px-1.5 text-xs font-mono">
                  #{task.taskNumber}
                </Badge>
                <StatusIcon
                  className={cn(
                    'h-4 w-4',
                    statusConfig.color,
                    task.status === 'running' && 'animate-spin'
                  )}
                />
                <Badge className={cn('h-5 text-xs', priorityConfig.color)}>{priorityConfig.label}</Badge>
              </div>
              <CardTitle className="text-sm font-medium text-zinc-200">{task.title}</CardTitle>
            </div>
          </div>

          {!disabled && (
            <div className="flex items-center gap-1">
              {onEdit && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
              {onDelete && (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-300" onClick={onDelete}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-400 mb-2"
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {expanded ? 'Hide details' : 'Show details'}
        </button>

        {expanded && (
          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium text-zinc-500 mb-1">Description</div>
              <p className="text-sm text-zinc-400">{task.description}</p>
            </div>

            {targetFiles.length > 0 && (
              <div>
                <div className="text-xs font-medium text-zinc-500 mb-1">Target Files</div>
                <div className="flex flex-wrap gap-1">
                  {targetFiles.map((file, i) => (
                    <Badge key={i} variant="secondary" className="text-xs font-mono">
                      <FileCode className="h-3 w-3 mr-1" />
                      {file}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {task.resultSummary && (
              <div>
                <div className="text-xs font-medium text-zinc-500 mb-1">Result</div>
                <p className="text-sm text-zinc-400">{task.resultSummary}</p>
              </div>
            )}

            {task.errorMessage && (
              <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-2 text-red-400 text-xs font-medium mb-1">
                  <AlertCircle className="h-3 w-3" />
                  Error
                </div>
                <p className="text-sm text-red-300">{task.errorMessage}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Task editor dialog
 */
function TaskEditor({
  task,
  onSave,
  onCancel,
}: {
  task: Partial<Task> & { title: string; description: string };
  onSave: (task: { title: string; description: string; targetFiles: string[]; priority: TaskPriority }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [targetFiles, setTargetFiles] = useState<string[]>(
    task.targetFiles ? JSON.parse(task.targetFiles) : []
  );
  const [priority, setPriority] = useState<TaskPriority>(task.priority || 'medium');
  const [newFile, setNewFile] = useState('');

  const handleAddFile = () => {
    if (newFile && !targetFiles.includes(newFile)) {
      setTargetFiles([...targetFiles, newFile]);
      setNewFile('');
    }
  };

  const handleRemoveFile = (file: string) => {
    setTargetFiles(targetFiles.filter((f) => f !== file));
  };

  return (
    <Dialog open onOpenChange={onCancel}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{task.id ? 'Edit Task' : 'Add Task'}</DialogTitle>
          <DialogDescription>Configure the task for the coding agent.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <label className="text-sm font-medium text-zinc-400">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief task title"
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-400">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed instructions for the coding agent..."
              className="mt-1 min-h-[120px]"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-400">Priority</label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-400">Target Files</label>
            <div className="flex gap-2 mt-1">
              <Input
                value={newFile}
                onChange={(e) => setNewFile(e.target.value)}
                placeholder="path/to/file.ts"
                onKeyDown={(e) => e.key === 'Enter' && handleAddFile()}
              />
              <Button size="sm" onClick={handleAddFile}>
                Add
              </Button>
            </div>
            {targetFiles.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {targetFiles.map((file, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {file}
                    <button onClick={() => handleRemoveFile(file)} className="hover:text-red-400">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onSave({ title, description, targetFiles, priority })} disabled={!title || !description}>
            {task.id ? 'Save Changes' : 'Add Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Execution progress panel
 */
function ExecutionProgress({
  taskCounts,
  totalTasks,
}: {
  taskCounts: Record<TaskStatus, number>;
  totalTasks: number;
}) {
  const completed = taskCounts.completed || 0;
  const failed = taskCounts.failed || 0;
  const running = taskCounts.running || 0;
  const progress = totalTasks > 0 ? ((completed + failed) / totalTasks) * 100 : 0;

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Zap className="h-4 w-4 text-yellow-400" />
          Execution Progress
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Progress value={progress} className="h-2 mb-3" />
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-green-400">{completed}</div>
            <div className="text-xs text-zinc-500">Completed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-400">{running}</div>
            <div className="text-xs text-zinc-500">Running</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-400">{failed}</div>
            <div className="text-xs text-zinc-500">Failed</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============ MAIN COMPONENT ============

interface PlanningSessionProps {
  sessionId?: string;
  repoId: string;
  onClose?: () => void;
}

export function PlanningSession({ sessionId, repoId, onClose }: PlanningSessionProps) {
  const [input, setInput] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [localTasks, setLocalTasks] = useState<
    Array<{ title: string; description: string; targetFiles: string[]; priority: TaskPriority }>
  >([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  // Queries
  const { data: session, isLoading: sessionLoading } = trpc.planningWorkflow.getSessionFull.useQuery(
    { sessionId: sessionId! },
    { enabled: !!sessionId, refetchInterval: session?.status === 'executing' ? 2000 : false }
  );

  // Mutations
  const createSession = trpc.planningWorkflow.createSession.useMutation({
    onSuccess: () => {
      utils.planningWorkflow.listSessions.invalidate();
    },
  });

  const iterate = trpc.planningWorkflow.iterate.useMutation({
    onSuccess: () => {
      utils.planningWorkflow.getSessionFull.invalidate({ sessionId });
      setInput('');
    },
  });

  const generateTasks = trpc.planningWorkflow.generateTasks.useMutation({
    onSuccess: (data) => {
      if (data?.tasks) {
        setLocalTasks(
          data.tasks.map((t) => ({
            title: t.title,
            description: t.description,
            targetFiles: t.targetFiles || [],
            priority: t.priority || 'medium',
          }))
        );
      }
    },
  });

  const finalizeTasks = trpc.planningWorkflow.finalizeTasks.useMutation({
    onSuccess: () => {
      utils.planningWorkflow.getSessionFull.invalidate({ sessionId });
      setLocalTasks([]);
    },
  });

  const execute = trpc.planningWorkflow.execute.useMutation({
    onSuccess: () => {
      utils.planningWorkflow.getSessionFull.invalidate({ sessionId });
    },
  });

  const cancel = trpc.planningWorkflow.cancel.useMutation({
    onSuccess: () => {
      utils.planningWorkflow.getSessionFull.invalidate({ sessionId });
    },
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [session?.messages]);

  // Handlers
  const handleSend = useCallback(() => {
    if (!input.trim()) return;

    if (!sessionId) {
      createSession.mutate({
        repoId,
        planningPrompt: input.trim(),
        title: input.trim().slice(0, 50),
      });
      setInput('');
    } else if (session?.status === 'planning') {
      iterate.mutate({
        sessionId,
        message: input.trim(),
      });
    }
  }, [input, sessionId, session?.status, repoId, createSession, iterate]);

  const handleGenerateTasks = useCallback(() => {
    if (sessionId) {
      generateTasks.mutate({ sessionId });
    }
  }, [sessionId, generateTasks]);

  const handleFinalizeTasks = useCallback(() => {
    if (sessionId && localTasks.length > 0) {
      finalizeTasks.mutate({
        sessionId,
        tasks: localTasks.map((t, i) => ({
          ...t,
          dependsOn: [],
        })),
      });
    }
  }, [sessionId, localTasks, finalizeTasks]);

  const handleExecute = useCallback(() => {
    if (sessionId && session?.status === 'ready') {
      execute.mutate({ sessionId });
    }
  }, [sessionId, session?.status, execute]);

  const handleCancel = useCallback(() => {
    if (sessionId) {
      cancel.mutate({ sessionId });
    }
  }, [sessionId, cancel]);

  const handleAddTask = useCallback(
    (task: { title: string; description: string; targetFiles: string[]; priority: TaskPriority }) => {
      setLocalTasks([...localTasks, task]);
      setShowAddTask(false);
    },
    [localTasks]
  );

  const handleEditTask = useCallback(
    (index: number, task: { title: string; description: string; targetFiles: string[]; priority: TaskPriority }) => {
      const updated = [...localTasks];
      updated[index] = task;
      setLocalTasks(updated);
      setEditingTask(null);
    },
    [localTasks]
  );

  const handleDeleteTask = useCallback(
    (index: number) => {
      setLocalTasks(localTasks.filter((_, i) => i !== index));
    },
    [localTasks]
  );

  const isLoading = createSession.isPending || iterate.isPending;
  const statusConfig = session ? STATUS_CONFIG[session.status] : null;
  const StatusIcon = statusConfig?.icon;

  // Render loading state
  if (sessionLoading && sessionId) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  // Render based on session status
  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <Layers className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">
              {session?.title || 'New Planning Session'}
            </h2>
            {statusConfig && StatusIcon && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <StatusIcon
                  className={cn(
                    'h-3 w-3',
                    statusConfig.color.split(' ')[0],
                    session?.status === 'executing' && 'animate-spin'
                  )}
                />
                <span className="text-xs text-zinc-500">{statusConfig.label}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {session?.status === 'planning' && localTasks.length > 0 && (
            <Button
              size="sm"
              onClick={handleFinalizeTasks}
              disabled={finalizeTasks.isPending}
              className="gap-1.5"
            >
              {finalizeTasks.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Finalize Tasks
            </Button>
          )}

          {session?.status === 'ready' && (
            <Button
              size="sm"
              onClick={handleExecute}
              disabled={execute.isPending}
              className="gap-1.5 bg-green-600 hover:bg-green-500"
            >
              {execute.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Start Execution
            </Button>
          )}

          {session?.status === 'executing' && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleCancel}
              disabled={cancel.isPending}
              className="gap-1.5"
            >
              <Pause className="h-3.5 w-3.5" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Chat/Messages panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto">
            {!session && !sessionId ? (
              <div className="flex flex-col items-center justify-center h-full p-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-5 shadow-lg shadow-blue-500/20">
                  <Target className="h-8 w-8 text-white" />
                </div>
                <h2 className="text-xl font-semibold mb-1 text-zinc-100">Plan Your Work</h2>
                <p className="text-sm text-zinc-500 mb-8 text-center max-w-xs">
                  Describe what you want to build. The planning agent will help you break it down into
                  tasks that can run in parallel.
                </p>
              </div>
            ) : session?.messages && session.messages.length > 0 ? (
              <div>
                {session.messages.map((msg) => (
                  <PlanningMessage
                    key={msg.id}
                    message={{
                      ...msg,
                      role: msg.role as 'user' | 'assistant' | 'system',
                      createdAt: new Date(msg.createdAt),
                    }}
                  />
                ))}
                {isLoading && (
                  <div className="flex items-center gap-3 p-4">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-400">Thinking...</span>
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" />
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce"
                          style={{ animationDelay: '150ms' }}
                        />
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce"
                          style={{ animationDelay: '300ms' }}
                        />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} className="h-4" />
              </div>
            ) : null}
          </div>

          {/* Input */}
          {(!session || session.status === 'planning') && (
            <div className="border-t border-zinc-800 p-3 bg-zinc-900/80">
              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={
                    sessionId ? 'Give feedback or ask to refine the plan...' : 'Describe what you want to build...'
                  }
                  className="min-h-[80px] resize-none"
                  disabled={isLoading}
                />
                <div className="flex flex-col gap-2">
                  <Button onClick={handleSend} disabled={!input.trim() || isLoading} className="h-10">
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                  {session?.status === 'planning' && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            onClick={handleGenerateTasks}
                            disabled={generateTasks.isPending}
                            className="h-10"
                          >
                            {generateTasks.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ListTodo className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Generate tasks from current plan</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tasks panel */}
        {(session?.status === 'planning' && localTasks.length > 0) ||
        session?.status === 'ready' ||
        session?.status === 'executing' ||
        session?.status === 'completed' ||
        session?.status === 'failed' ? (
          <div className="w-80 border-l border-zinc-800 flex flex-col bg-zinc-900/30">
            <div className="px-4 py-3 border-b border-zinc-800">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-zinc-200">Tasks</h3>
                {session?.status === 'planning' && (
                  <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={() => setShowAddTask(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </Button>
                )}
              </div>
            </div>

            {/* Execution progress */}
            {(session?.status === 'executing' || session?.status === 'completed' || session?.status === 'failed') &&
              session?.taskCounts && (
                <div className="p-3 border-b border-zinc-800">
                  <ExecutionProgress taskCounts={session.taskCounts} totalTasks={session.tasks?.length || 0} />
                </div>
              )}

            {/* Task list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {session?.status === 'planning' && localTasks.length > 0
                ? localTasks.map((task, i) => (
                    <TaskCard
                      key={i}
                      task={{
                        id: `local-${i}`,
                        taskNumber: i + 1,
                        title: task.title,
                        description: task.description,
                        targetFiles: JSON.stringify(task.targetFiles),
                        priority: task.priority,
                        status: 'pending',
                        dependsOn: null,
                        resultSummary: null,
                        filesChanged: null,
                        errorMessage: null,
                        startedAt: null,
                        completedAt: null,
                      }}
                      onEdit={() =>
                        setEditingTask({
                          id: `local-${i}`,
                          taskNumber: i + 1,
                          title: task.title,
                          description: task.description,
                          targetFiles: JSON.stringify(task.targetFiles),
                          priority: task.priority,
                          status: 'pending',
                          dependsOn: null,
                          resultSummary: null,
                          filesChanged: null,
                          errorMessage: null,
                          startedAt: null,
                          completedAt: null,
                        })
                      }
                      onDelete={() => handleDeleteTask(i)}
                    />
                  ))
                : session?.tasks?.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={{
                        ...task,
                        priority: task.priority as TaskPriority,
                        status: task.status as TaskStatus,
                        startedAt: task.startedAt ? new Date(task.startedAt) : null,
                        completedAt: task.completedAt ? new Date(task.completedAt) : null,
                      }}
                      disabled={session.status !== 'ready'}
                    />
                  ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Task editor dialog */}
      {showAddTask && (
        <TaskEditor
          task={{ title: '', description: '' }}
          onSave={handleAddTask}
          onCancel={() => setShowAddTask(false)}
        />
      )}

      {editingTask && editingTask.id.startsWith('local-') && (
        <TaskEditor
          task={editingTask}
          onSave={(task) => handleEditTask(parseInt(editingTask.id.split('-')[1]), task)}
          onCancel={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
