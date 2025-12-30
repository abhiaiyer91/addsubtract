import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
  CircleDot,
  AlertTriangle,
  Info,
  Square,
  Copy,
  Check,
  AtSign,
  File,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
  pending: { label: 'Pending', icon: Clock, color: 'text-muted-foreground' },
  in_progress: { label: 'Running', icon: Loader2, color: 'text-blue-500' },
  completed: { label: 'Done', icon: CheckCircle2, color: 'text-green-500' },
  failed: { label: 'Failed', icon: XCircle, color: 'text-red-500' },
  skipped: { label: 'Skipped', icon: Clock, color: 'text-yellow-500' },
};

const phaseConfig: Record<WorkflowPhase, { 
  label: string; 
  description: string;
  icon: typeof Brain; 
  color: string; 
  bgColor: string;
}> = {
  idle: { label: 'Ready', description: 'Enter a task to begin', icon: Brain, color: 'text-muted-foreground', bgColor: 'bg-muted' },
  analyzing: { label: 'Analyzing', description: 'Understanding your codebase...', icon: Search, color: 'text-purple-500', bgColor: 'bg-purple-500' },
  planning: { label: 'Planning', description: 'Creating execution plan...', icon: Brain, color: 'text-indigo-500', bgColor: 'bg-indigo-500' },
  executing: { label: 'Executing', description: 'Running subtasks...', icon: Zap, color: 'text-orange-500', bgColor: 'bg-orange-500' },
  reviewing: { label: 'Reviewing', description: 'Validating results...', icon: Eye, color: 'text-cyan-500', bgColor: 'bg-cyan-500' },
  completed: { label: 'Completed', description: 'All tasks finished', icon: CheckCircle2, color: 'text-green-500', bgColor: 'bg-green-500' },
  failed: { label: 'Failed', description: 'Workflow encountered errors', icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-500' },
};

// =============================================================================
// Component: MentionTextarea - Textarea with @ file mention support
// =============================================================================

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  owner: string;
  repo: string;
  autoFocus?: boolean;
}

function MentionTextarea({ 
  value, 
  onChange, 
  placeholder, 
  className,
  owner,
  repo,
  autoFocus,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Fetch files for autocomplete
  const { data: filesData, isLoading: filesLoading } = trpc.repos.listFiles.useQuery(
    { owner, repo, query: mentionQuery, limit: 10 },
    { enabled: showMentions && mentionQuery.length > 0 }
  );

  const files = useMemo(() => filesData?.files || [], [filesData]);

  // Reset selected index when files change
  useEffect(() => {
    setSelectedIndex(0);
  }, [files]);

  // Detect @ mention trigger
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    onChange(newValue);

    // Check if we just typed @ or are in a mention
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    
    if (atIndex !== -1) {
      // Check if there's a space or start of text before @
      const charBeforeAt = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' ';
      if (charBeforeAt === ' ' || charBeforeAt === '\n' || atIndex === 0) {
        const query = textBeforeCursor.slice(atIndex + 1);
        // Only show dropdown if query doesn't contain spaces (active mention)
        if (!query.includes(' ')) {
          setShowMentions(true);
          setMentionQuery(query);
          setMentionStart(atIndex);
          return;
        }
      }
    }
    
    setShowMentions(false);
    setMentionQuery('');
    setMentionStart(null);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showMentions || files.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % files.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + files.length) % files.length);
    } else if (e.key === 'Enter' && showMentions) {
      e.preventDefault();
      selectFile(files[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowMentions(false);
    } else if (e.key === 'Tab' && showMentions) {
      e.preventDefault();
      selectFile(files[selectedIndex]);
    }
  };

  // Select a file from the dropdown
  const selectFile = (file: string) => {
    if (mentionStart === null || !textareaRef.current) return;

    const before = value.slice(0, mentionStart);
    const after = value.slice(textareaRef.current.selectionStart);
    const newValue = `${before}@${file} ${after}`;
    
    onChange(newValue);
    setShowMentions(false);
    setMentionQuery('');
    setMentionStart(null);

    // Set cursor position after the inserted mention
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = mentionStart + file.length + 2; // +2 for @ and space
        textareaRef.current.selectionStart = newCursorPos;
        textareaRef.current.selectionEnd = newCursorPos;
        textareaRef.current.focus();
      }
    }, 0);
  };

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setShowMentions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get dropdown position
  const getDropdownPosition = () => {
    if (!textareaRef.current || mentionStart === null) return { top: 0, left: 0 };
    
    // Create a hidden div to measure text position
    const div = document.createElement('div');
    const style = window.getComputedStyle(textareaRef.current);
    div.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre-wrap;
      word-wrap: break-word;
      font: ${style.font};
      padding: ${style.padding};
      width: ${textareaRef.current.clientWidth}px;
      line-height: ${style.lineHeight};
    `;
    div.textContent = value.slice(0, mentionStart);
    document.body.appendChild(div);
    
    const textHeight = div.offsetHeight;
    document.body.removeChild(div);
    
    return {
      top: Math.min(textHeight + 24, textareaRef.current.clientHeight - 10),
      left: 8,
    };
  };

  const dropdownPos = getDropdownPosition();

  return (
    <div className="relative">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={cn(
            'flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
            className
          )}
        />
        
        {/* Hint for @ mentions */}
        <div className="absolute bottom-2 right-2 flex items-center gap-1 text-xs text-muted-foreground pointer-events-none">
          <AtSign className="h-3 w-3" />
          <span>to reference files</span>
        </div>
      </div>

      {/* File mention dropdown */}
      {showMentions && (
        <div 
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border bg-popover shadow-lg"
          style={{ top: dropdownPos.top }}
        >
          {filesLoading ? (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching files...
            </div>
          ) : files.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {mentionQuery ? `No files matching "${mentionQuery}"` : 'Type to search files...'}
            </div>
          ) : (
            <div className="py-1">
              {files.map((file, index) => (
                <button
                  key={file}
                  onClick={() => selectFile(file)}
                  className={cn(
                    'flex items-center gap-2 w-full px-3 py-2 text-left text-sm transition-colors',
                    index === selectedIndex 
                      ? 'bg-accent text-accent-foreground' 
                      : 'hover:bg-muted'
                  )}
                >
                  <File className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-mono truncate">{file}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Component: WorkflowHeader - Always visible task context
// =============================================================================

function WorkflowHeader({ 
  task, 
  phase, 
  progress,
  onCancel,
  onRetry,
  onNewTask,
  startTime,
}: { 
  task: string;
  phase: WorkflowPhase;
  progress: number;
  onCancel?: () => void;
  onRetry?: () => void;
  onNewTask?: () => void;
  startTime?: Date;
}) {
  const config = phaseConfig[phase];
  const PhaseIcon = config.icon;
  const isRunning = !['idle', 'completed', 'failed'].includes(phase);
  const isComplete = phase === 'completed' || phase === 'failed';
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Update elapsed time
  useEffect(() => {
    if (!startTime || isComplete) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, isComplete]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const copyTask = () => {
    navigator.clipboard.writeText(task);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn(
      'rounded-xl border-2 transition-all duration-300',
      isRunning && 'border-blue-500/50 bg-blue-500/5',
      phase === 'completed' && 'border-green-500/50 bg-green-500/5',
      phase === 'failed' && 'border-red-500/50 bg-red-500/5',
      phase === 'idle' && 'border-border bg-card',
    )}>
      {/* Task Display - Always Visible */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <span>Task</span>
              <button 
                onClick={copyTask}
                className="hover:text-foreground transition-colors"
                title="Copy task"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
            <p className="text-sm font-medium leading-relaxed">{task}</p>
          </div>
          {isRunning && onCancel && (
            <Button variant="outline" size="sm" onClick={onCancel} className="shrink-0 gap-1.5">
              <Square className="h-3 w-3" />
              Stop
            </Button>
          )}
          {isComplete && (
            <div className="flex items-center gap-2 shrink-0">
              {onRetry && (
                <Button variant="default" size="sm" onClick={onRetry} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
                </Button>
              )}
              {onNewTask && (
                <Button variant="outline" size="sm" onClick={onNewTask} className="gap-1.5">
                  New Task
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className={cn(
        'px-4 py-3 border-t flex items-center justify-between gap-4',
        isRunning && 'bg-blue-500/5',
        phase === 'completed' && 'bg-green-500/5',
        phase === 'failed' && 'bg-red-500/5',
      )}>
        {/* Current Phase */}
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center',
            `${config.bgColor}/20`
          )}>
            <PhaseIcon className={cn(
              'h-5 w-5',
              config.color,
              isRunning && 'animate-pulse'
            )} />
          </div>
          <div>
            <div className={cn('font-semibold', config.color)}>
              {config.label}
            </div>
            <div className="text-xs text-muted-foreground">
              {config.description}
            </div>
          </div>
        </div>

        {/* Progress & Time */}
        <div className="flex items-center gap-4">
          {startTime && (
            <div className="text-sm text-muted-foreground">
              {formatTime(elapsed)}
            </div>
          )}
          {isRunning && (
            <div className="flex items-center gap-2">
              <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn('h-full transition-all duration-500', config.bgColor)}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-sm font-mono text-muted-foreground w-10">
                {progress}%
              </span>
            </div>
          )}
          {phase === 'completed' && (
            <Badge className="bg-green-500 text-white">Complete</Badge>
          )}
          {phase === 'failed' && (
            <Badge variant="destructive">Failed</Badge>
          )}
        </div>
      </div>

      {/* Phase Progress Steps */}
      {(isRunning || isComplete) && (
        <div className="px-4 py-3 border-t bg-muted/30">
          <div className="flex items-center justify-between">
            {(['analyzing', 'planning', 'executing', 'reviewing'] as WorkflowPhase[]).map((p, index, arr) => {
              const stepConfig = phaseConfig[p];
              const StepIcon = stepConfig.icon;
              const currentIndex = ['analyzing', 'planning', 'executing', 'reviewing'].indexOf(phase);
              const stepIndex = index;
              const isActive = p === phase;
              const isPast = stepIndex < currentIndex || phase === 'completed';
              const isFuture = stepIndex > currentIndex && phase !== 'completed';

              return (
                <div key={p} className="flex items-center">
                  <div className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-full transition-all',
                    isActive && `${stepConfig.bgColor}/20`,
                    isPast && 'bg-green-500/10',
                  )}>
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center',
                      isActive && stepConfig.bgColor,
                      isPast && 'bg-green-500',
                      isFuture && 'bg-muted',
                    )}>
                      {isPast ? (
                        <CheckCircle2 className="h-4 w-4 text-white" />
                      ) : (
                        <StepIcon className={cn(
                          'h-3.5 w-3.5',
                          isActive && 'text-white',
                          isFuture && 'text-muted-foreground',
                        )} />
                      )}
                    </div>
                    <span className={cn(
                      'text-sm font-medium',
                      isActive && stepConfig.color,
                      isPast && 'text-green-500',
                      isFuture && 'text-muted-foreground',
                    )}>
                      {stepConfig.label}
                    </span>
                  </div>
                  {index < arr.length - 1 && (
                    <div className={cn(
                      'w-8 h-0.5 mx-1',
                      isPast ? 'bg-green-500' : 'bg-muted',
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Component: LiveActivityFeed - Real-time updates
// =============================================================================

function LiveActivityFeed({ 
  entries, 
  currentAction,
}: { 
  entries: ActivityLogEntry[];
  currentAction?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, currentAction]);

  const getIcon = (type: ActivityLogEntry['type']) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'phase': return <CircleDot className="h-4 w-4 text-blue-500" />;
      case 'task': return <Zap className="h-4 w-4 text-orange-500" />;
      default: return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b bg-muted/50 flex items-center justify-between">
        <span className="text-sm font-medium">Live Activity</span>
        {currentAction && (
          <div className="flex items-center gap-2 text-sm text-blue-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="animate-pulse">{currentAction}</span>
          </div>
        )}
      </div>
      <ScrollArea ref={scrollRef} className="h-64">
        <div className="p-3 space-y-2">
          {entries.length === 0 ? (
            <div className="text-muted-foreground text-center py-8 text-sm">
              Waiting to start...
            </div>
          ) : (
            entries.map((entry) => (
              <div 
                key={entry.id} 
                className={cn(
                  'flex items-start gap-3 p-2 rounded-lg transition-colors',
                  entry.type === 'error' && 'bg-red-500/10',
                  entry.type === 'success' && 'bg-green-500/5',
                  entry.type === 'phase' && 'bg-blue-500/5',
                )}
              >
                <div className="mt-0.5 shrink-0">{getIcon(entry.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    'text-sm',
                    entry.type === 'error' && 'text-red-500',
                    entry.type === 'warning' && 'text-yellow-500',
                    entry.type === 'success' && 'text-green-600 dark:text-green-400',
                    entry.type === 'phase' && 'text-blue-500 font-medium',
                  )}>
                    {entry.message}
                  </div>
                  {entry.details && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {entry.details}
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
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
      task.status === 'in_progress' && 'border-blue-500 bg-blue-500/5 shadow-sm',
      task.status === 'completed' && 'border-green-500/50',
      task.status === 'failed' && 'border-red-500/50 bg-red-500/5',
    )}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
      >
        <StatusIcon className={cn(
          'h-5 w-5 shrink-0',
          config.color,
          task.status === 'in_progress' && 'animate-spin'
        )} />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{task.title}</div>
          {task.status === 'in_progress' && (
            <div className="text-xs text-blue-500 animate-pulse mt-0.5">
              Executing...
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-xs">
            {task.priority}
          </Badge>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>
      
      {isExpanded && (
        <div className="px-3 pb-3 pt-0 border-t space-y-3">
          <p className="text-sm text-muted-foreground pt-3">{task.description}</p>
          
          {task.targetFiles && task.targetFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {task.targetFiles.map((file) => (
                <Badge key={file} variant="secondary" className="text-xs font-mono">
                  <FileCode className="h-3 w-3 mr-1" />
                  {file}
                </Badge>
              ))}
            </div>
          )}
          
          {task.result && (
            <div className="p-2.5 rounded-lg bg-green-500/10 text-sm text-green-600 dark:text-green-400 border border-green-500/20">
              <CheckCircle2 className="h-4 w-4 inline mr-2" />
              {task.result}
            </div>
          )}
          
          {task.error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 text-sm text-red-600 dark:text-red-400 border border-red-500/20">
              <XCircle className="h-4 w-4 inline mr-2" />
              {task.error}
            </div>
          )}
          
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
            {task.filesModified && task.filesModified.length > 0 && (
              <span>{task.filesModified.length} files modified</span>
            )}
            {task.duration !== undefined && (
              <span>{(task.duration / 1000).toFixed(1)}s</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Component: ExecutionPlanView
// =============================================================================

function ExecutionPlanView({ plan, expandedTasks, onToggleTask, phase }: {
  plan: ExecutionPlan;
  expandedTasks: Set<string>;
  onToggleTask: (taskId: string) => void;
  phase: WorkflowPhase;
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
  const runningTasks = plan.parallelGroups.reduce(
    (sum, g) => sum + g.subtasks.filter(t => t.status === 'in_progress').length,
    0
  );

  return (
    <div className="space-y-4">
      {/* Plan Header */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold">Execution Plan</h3>
              <p className="text-sm text-muted-foreground mt-1">{plan.summary}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="gap-1">
                <ListTodo className="h-3 w-3" />
                {totalTasks} tasks
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                {plan.estimatedTotalEffort}
              </Badge>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="p-4 bg-muted/30">
          <div className="flex items-center justify-between mb-2 text-sm">
            <span className="text-muted-foreground">Progress</span>
            <div className="flex items-center gap-3">
              {runningTasks > 0 && (
                <span className="text-blue-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {runningTasks} running
                </span>
              )}
              <span className="text-green-500">{completedTasks} done</span>
              {failedTasks > 0 && (
                <span className="text-red-500">{failedTasks} failed</span>
              )}
            </div>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden flex">
            <div 
              className="bg-green-500 transition-all duration-300"
              style={{ width: `${(completedTasks / totalTasks) * 100}%` }}
            />
            <div 
              className="bg-blue-500 animate-pulse transition-all duration-300"
              style={{ width: `${(runningTasks / totalTasks) * 100}%` }}
            />
            <div 
              className="bg-red-500 transition-all duration-300"
              style={{ width: `${(failedTasks / totalTasks) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Risk Assessment */}
      {plan.riskAssessment && (
        <div className="p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
          <p className="text-sm text-yellow-600 dark:text-yellow-400">{plan.riskAssessment}</p>
        </div>
      )}

      {/* Parallel Groups */}
      <div className="space-y-3">
        {plan.parallelGroups
          .sort((a, b) => a.executionOrder - b.executionOrder)
          .map((group) => {
            const groupCompleted = group.subtasks.filter(t => t.status === 'completed').length;
            const groupFailed = group.subtasks.filter(t => t.status === 'failed').length;
            const groupRunning = group.subtasks.filter(t => t.status === 'in_progress').length;
            const isExpanded = expandedGroups.has(group.id);
            const allDone = groupCompleted + groupFailed === group.subtasks.length;
            
            return (
              <Collapsible
                key={group.id}
                open={isExpanded}
                onOpenChange={() => toggleGroup(group.id)}
              >
                <div className={cn(
                  'rounded-lg border bg-card overflow-hidden transition-all',
                  groupRunning > 0 && 'border-blue-500 shadow-sm shadow-blue-500/20',
                  allDone && groupFailed === 0 && 'border-green-500/50',
                  allDone && groupFailed > 0 && 'border-red-500/50',
                )}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <div className={cn(
                          'w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold',
                          groupRunning > 0 && 'bg-blue-500 text-white',
                          allDone && groupFailed === 0 && 'bg-green-500 text-white',
                          allDone && groupFailed > 0 && 'bg-red-500 text-white',
                          !groupRunning && !allDone && 'bg-muted text-muted-foreground',
                        )}>
                          {group.executionOrder}
                        </div>
                        <div className="text-left">
                          <div className="font-medium">{group.name}</div>
                          {groupRunning > 0 && (
                            <div className="text-xs text-blue-500 animate-pulse">
                              {groupRunning} task{groupRunning > 1 ? 's' : ''} running...
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm text-muted-foreground">
                          <span className={groupCompleted > 0 ? 'text-green-500' : ''}>{groupCompleted}</span>
                          {groupFailed > 0 && (
                            <span className="text-red-500">/{groupFailed}</span>
                          )}
                          <span>/{group.subtasks.length}</span>
                        </div>
                        {allDone && groupFailed === 0 && (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        )}
                        {groupRunning > 0 && (
                          <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                        )}
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t p-3 space-y-2 bg-muted/20">
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
      {/* Overall Result */}
      <div className={cn(
        'p-6 rounded-xl border-2',
        review.overallSuccess 
          ? 'bg-green-500/10 border-green-500/50' 
          : 'bg-red-500/10 border-red-500/50'
      )}>
        <div className="flex items-center gap-3 mb-3">
          {review.overallSuccess ? (
            <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-white" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center">
              <XCircle className="h-6 w-6 text-white" />
            </div>
          )}
          <div>
            <h3 className={cn(
              'text-lg font-semibold',
              review.overallSuccess ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            )}>
              {review.overallSuccess ? 'All tasks completed successfully!' : 'Some tasks failed'}
            </h3>
            <p className="text-sm text-muted-foreground">{review.summary}</p>
          </div>
        </div>
        
        <div className="flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span><strong>{review.completedTasks}</strong> completed</span>
          </div>
          {review.failedTasks > 0 && (
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <span><strong>{review.failedTasks}</strong> failed</span>
            </div>
          )}
          {review.skippedTasks > 0 && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              <span><strong>{review.skippedTasks}</strong> skipped</span>
            </div>
          )}
        </div>
      </div>

      {/* Issues */}
      {review.issues.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="p-3 border-b bg-muted/50">
            <h4 className="font-medium">Issues ({review.issues.length})</h4>
          </div>
          <div className="p-3 space-y-2">
            {review.issues.map((issue, i) => (
              <div
                key={i}
                className={cn(
                  'p-3 rounded-lg border',
                  issue.severity === 'error' && 'bg-red-500/10 border-red-500/30',
                  issue.severity === 'warning' && 'bg-yellow-500/10 border-yellow-500/30',
                  issue.severity === 'info' && 'bg-blue-500/10 border-blue-500/30',
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  {issue.severity === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
                  {issue.severity === 'warning' && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                  {issue.severity === 'info' && <Info className="h-4 w-4 text-blue-500" />}
                  <span className="font-medium text-sm">{issue.subtaskId}</span>
                </div>
                <p className="text-sm">{issue.issue}</p>
                {issue.suggestion && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Suggestion: {issue.suggestion}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Replanning */}
      {review.needsReplanning && review.replanningReason && (
        <div className="p-4 rounded-lg border border-orange-500/30 bg-orange-500/10">
          <div className="flex items-center gap-2 mb-2">
            <RefreshCw className="h-5 w-5 text-orange-500" />
            <span className="font-medium text-orange-600 dark:text-orange-400">
              Re-planning recommended
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{review.replanningReason}</p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Component: ResultsSummary
// =============================================================================

function ResultsSummary({ 
  branchCreated, 
  filesModified 
}: { 
  branchCreated: string | null;
  filesModified: string[];
}) {
  if (!branchCreated && filesModified.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="font-semibold mb-3">Results</h3>
      <div className="space-y-2">
        {branchCreated && (
          <div className="flex items-center gap-2 text-sm">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <span>Branch created:</span>
            <code className="px-2 py-0.5 rounded bg-muted font-mono text-xs">
              {branchCreated}
            </code>
          </div>
        )}
        {filesModified.length > 0 && (
          <div className="text-sm">
            <div className="flex items-center gap-2 mb-2">
              <FileCode className="h-4 w-4 text-muted-foreground" />
              <span>{filesModified.length} files modified</span>
            </div>
            <div className="flex flex-wrap gap-1.5 pl-6">
              {filesModified.slice(0, 10).map((file) => (
                <Badge key={file} variant="secondary" className="font-mono text-xs">
                  {file}
                </Badge>
              ))}
              {filesModified.length > 10 && (
                <Badge variant="outline" className="text-xs">
                  +{filesModified.length - 10} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </div>
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
  const [currentAction, setCurrentAction] = useState<string | undefined>();
  const [startTime, setStartTime] = useState<Date | undefined>();
  const [submittedTask, setSubmittedTask] = useState('');
  
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

  // Abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Handle SSE events - defined before useEffect so it can be referenced
  const handleStreamEvent = useCallback((event: { runId?: string; stepId?: string; result?: any; error?: string; totalDuration?: number }) => {
    // Detect event type from the data structure
    const { stepId, result, error: eventError, totalDuration } = event;
    
    // Started event
    if (event.runId && !stepId && !totalDuration && !eventError) {
      addLog('phase', 'Workflow started');
      setCurrentAction('Initializing...');
      setPhase('analyzing');
      setProgress(5);
      return;
    }
    
    // Complete event
    if (totalDuration !== undefined) {
      setPhase('completed');
      setProgress(100);
      setCurrentAction(undefined);
      addLog('success', 'Workflow completed successfully');
      setIsRunning(false);
      return;
    }
    
    // Error event
    if (eventError && !stepId) {
      setError(eventError);
      setPhase('failed');
      setCurrentAction(undefined);
      addLog('error', eventError);
      setIsRunning(false);
      return;
    }
    
    // Step events
    if (stepId) {
      // Check if it's a step-start (no result) or step-complete (has result)
      if (result === undefined && !eventError) {
        // step-start
        const newPhase = stepToPhase[stepId];
        if (newPhase) {
          setPhase(newPhase);
          setProgress(stepToProgress[stepId] || 0);
          setCurrentAction(phaseConfig[newPhase]?.description);
          addLog('phase', `${phaseConfig[newPhase]?.label}...`);
        }
      } else if (eventError) {
        // step-error
        addLog('error', `Step failed: ${stepId}`, eventError);
        setCurrentAction(undefined);
      } else {
        // step-complete
        setProgress(stepToProgress[stepId] ? stepToProgress[stepId] + 10 : 0);
        
        if (stepId === 'analyze-task' && result) {
          if (result.projectInfo) {
            setProjectInfo(result.projectInfo);
            addLog('success', `Detected ${result.projectInfo.language} ${result.projectInfo.type} project`);
          }
          if (result.relevantFiles?.length) {
            addLog('info', `Found ${result.relevantFiles.length} relevant files`);
          }
        }
        
        if (stepId === 'create-plan' && result?.plan) {
          setPlan(result.plan);
          const taskCount = result.plan.parallelGroups?.reduce(
            (sum: number, g: ParallelGroup) => sum + g.subtasks.length, 0
          ) || 0;
          addLog('success', `Created plan with ${taskCount} subtasks in ${result.plan.parallelGroups?.length || 0} groups`);
        }
        
        if (stepId === 'execute-plan' && result) {
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
        }
      }
    }
  }, [addLog, updateSubtask]);

  // Start streaming when workflow begins
  useEffect(() => {
    if (!isRunning || !repoData?.repo.id || !submittedTask) {
      return;
    }

    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const startStream = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/planning/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            repoId: repoData.repo.id,
            task: submittedTask.trim(),
            context: context.trim() || undefined,
            dryRun,
            createBranch,
            branchName: branchName.trim() || undefined,
            maxIterations: 3,
            maxParallelTasks: 5,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              // Event type line - we'll detect type from the data
              continue;
            }
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6);
              try {
                const data = JSON.parse(dataStr);
                handleStreamEvent(data);
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          // Cancelled by user
          return;
        }
        setError((err as Error).message);
        setPhase('failed');
        setCurrentAction(undefined);
        setIsRunning(false);
        addLog('error', `Connection error: ${(err as Error).message}`);
      }
    };

    startStream();

    return () => {
      abortController.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, repoData?.repo.id, submittedTask, handleStreamEvent]);

  const handleStart = () => {
    if (!task.trim() || !repoData?.repo.id) return;
    
    // Save the task and reset state
    setSubmittedTask(task.trim());
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
    setCurrentAction('Starting workflow...');
    setStartTime(new Date());
    
    addLog('phase', 'Initializing workflow...');
  };

  const handleCancel = () => {
    // Abort the stream
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
    setPhase('failed');
    setCurrentAction(undefined);
    addLog('warning', 'Workflow cancelled by user');
  };

  const handleRetry = () => {
    if (!submittedTask.trim() || !repoData?.repo.id) return;
    
    // Reset workflow state but keep the task
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
    setCurrentAction('Retrying workflow...');
    setStartTime(new Date());
    
    addLog('phase', 'Retrying workflow...');
  };

  const handleNewTask = () => {
    setTask('');
    setSubmittedTask('');
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
    setCurrentAction(undefined);
    setStartTime(undefined);
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
  const showWorkflow = isRunning || isComplete;

  return (
    <RepoLayout owner={owner!} repo={repo!} activeTab="planning">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2.5 rounded-xl transition-colors',
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
            <Badge variant="outline" className="gap-1.5 py-1">
              <Sparkles className="h-3.5 w-3.5" />
              {planningStatus.provider}
            </Badge>
          )}
        </div>

        {/* AI Not Available Warning */}
        {planningStatus && !planningStatus.available && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
            <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0" />
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

        {/* Workflow Header - Shows task & progress when running */}
        {showWorkflow && submittedTask && (
          <WorkflowHeader
            task={submittedTask}
            phase={phase}
            progress={progress}
            onCancel={isRunning ? handleCancel : undefined}
            onRetry={isComplete ? handleRetry : undefined}
            onNewTask={isComplete ? handleNewTask : undefined}
            startTime={startTime}
          />
        )}

        {/* Task Input - Only shown when idle */}
        {isIdle && (
          <div className="space-y-4 p-6 rounded-xl border-2 border-dashed bg-card">
            <div className="space-y-2">
              <label className="text-sm font-medium">What do you want to build?</label>
              <MentionTextarea
                placeholder="Describe the task you want to accomplish... Use @ to reference files (e.g., 'Add user authentication with JWT tokens')"
                value={task}
                onChange={setTask}
                owner={owner!}
                repo={repo!}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Additional context (optional)</label>
              <MentionTextarea
                placeholder="Any additional requirements, constraints, or context... Use @ to reference specific files"
                value={context}
                onChange={setContext}
                owner={owner!}
                repo={repo!}
                className="min-h-[60px]"
              />
            </div>

            {/* Options */}
            <div className="flex flex-wrap items-center gap-6 pt-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="dryRun"
                  checked={dryRun}
                  onCheckedChange={(checked) => setDryRun(checked as boolean)}
                />
                <label htmlFor="dryRun" className="text-sm cursor-pointer">
                  Preview only (dry run)
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
                <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 text-muted-foreground">
                  {showAdvanced ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Advanced options
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Custom branch name</label>
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
            <div className="pt-4">
              <Button
                onClick={handleStart}
                disabled={!task.trim() || !planningStatus?.available}
                size="lg"
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
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
            <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-red-600 dark:text-red-400">
                {phase === 'failed' ? 'Workflow failed' : 'Error'}
              </p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Main Content - Two columns when running */}
        {showWorkflow && (
          <div className="grid lg:grid-cols-5 gap-6">
            {/* Left: Activity Feed */}
            <div className="lg:col-span-2 space-y-4">
              <LiveActivityFeed 
                entries={activityLog} 
                currentAction={isRunning ? currentAction : undefined}
              />
              
              {/* Project Info */}
              {projectInfo && (
                <div className="rounded-lg border bg-card p-4">
                  <h3 className="text-sm font-medium mb-2">Project Detected</h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{projectInfo.language}</Badge>
                    <Badge variant="secondary">{projectInfo.type}</Badge>
                    {projectInfo.hasTests && <Badge variant="outline">Has Tests</Badge>}
                    {projectInfo.hasLinting && <Badge variant="outline">Has Linting</Badge>}
                  </div>
                </div>
              )}

              {/* Results Summary */}
              {isComplete && (
                <ResultsSummary 
                  branchCreated={branchCreated} 
                  filesModified={filesModified} 
                />
              )}
            </div>

            {/* Right: Plan/Review */}
            <div className="lg:col-span-3">
              {review ? (
                <ReviewView review={review} />
              ) : plan ? (
                <ExecutionPlanView
                  plan={plan}
                  expandedTasks={expandedTasks}
                  onToggleTask={toggleTask}
                  phase={phase}
                />
              ) : (
                <div className="rounded-lg border bg-card p-12 text-center">
                  <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50 animate-pulse" />
                  <p className="text-muted-foreground">Creating execution plan...</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty State */}
        {isIdle && !error && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">
              The AI will analyze your codebase, create an execution plan, and run tasks in parallel.
            </p>
          </div>
        )}
      </div>
    </RepoLayout>
  );
}
