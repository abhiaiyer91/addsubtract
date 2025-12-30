import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
  History,
  Plus,
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
  Target,
  Shield,
  Swords,
  Flag,
  Radio,
  Crosshair,
  Medal,
  Users,
  MapPin,
  Compass,
  Activity,
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

type OperativeStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
type MissionPhase = 'idle' | 'reconnaissance' | 'strategic_planning' | 'deploying' | 'debriefing' | 'mission_complete' | 'mission_failed';

interface Operative {
  id: string;
  title: string;
  description: string;
  priority: string;
  estimatedEffort?: string;
  targetFiles?: string[];
  status: OperativeStatus;
  result?: string;
  error?: string;
  duration?: number;
  filesModified?: string[];
}

interface Squad {
  id: string;
  name: string;
  executionOrder: number;
  subtasks: Operative[];
  isCompleted?: boolean;
  duration?: number;
}

interface BattlePlan {
  id: string;
  version: number;
  originalTask: string;
  summary: string;
  parallelGroups: Squad[];
  estimatedTotalEffort: string;
  riskAssessment?: string;
}

interface DebriefingReport {
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

interface CommandLogEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'success' | 'warning' | 'error' | 'phase' | 'task';
  message: string;
  details?: string;
}

interface IntelReport {
  type: string;
  language: string;
  hasTests: boolean;
  hasLinting: boolean;
  structure: string[];
}

// Step to phase mapping
const stepToPhase: Record<string, MissionPhase> = {
  'analyze-task': 'reconnaissance',
  'create-plan': 'strategic_planning',
  'execute-plan': 'deploying',
  'review-results': 'debriefing',
  'aggregate-results': 'debriefing',
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

const operativeStatusConfig: Record<OperativeStatus, { label: string; icon: typeof CheckCircle2; color: string }> = {
  pending: { label: 'Awaiting Orders', icon: Clock, color: 'text-muted-foreground' },
  in_progress: { label: 'Engaged', icon: Loader2, color: 'text-amber-500' },
  completed: { label: 'Mission Success', icon: CheckCircle2, color: 'text-green-500' },
  failed: { label: 'Casualty', icon: XCircle, color: 'text-red-500' },
  skipped: { label: 'Stood Down', icon: Clock, color: 'text-yellow-500' },
};

const phaseConfig: Record<MissionPhase, { 
  label: string; 
  description: string;
  icon: typeof Brain; 
  color: string; 
  bgColor: string;
}> = {
  idle: { label: 'Awaiting Orders', description: 'Define your mission objective', icon: Target, color: 'text-muted-foreground', bgColor: 'bg-muted' },
  reconnaissance: { label: 'Reconnaissance', description: 'Gathering intelligence on target...', icon: Search, color: 'text-purple-500', bgColor: 'bg-purple-500' },
  strategic_planning: { label: 'Strategic Planning', description: 'Formulating battle plan...', icon: Compass, color: 'text-indigo-500', bgColor: 'bg-indigo-500' },
  deploying: { label: 'Deploying Forces', description: 'Operatives engaging targets...', icon: Swords, color: 'text-amber-500', bgColor: 'bg-amber-500' },
  debriefing: { label: 'Debriefing', description: 'Analyzing mission results...', icon: Eye, color: 'text-cyan-500', bgColor: 'bg-cyan-500' },
  mission_complete: { label: 'Mission Complete', description: 'All objectives achieved', icon: Medal, color: 'text-green-500', bgColor: 'bg-green-500' },
  mission_failed: { label: 'Mission Failed', description: 'Objectives not met', icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-500' },
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
          <span>to reference targets</span>
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
              Scanning targets...
            </div>
          ) : files.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {mentionQuery ? `No targets matching "${mentionQuery}"` : 'Type to identify targets...'}
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
                  <Crosshair className="h-4 w-4 text-muted-foreground shrink-0" />
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
// Component: MissionBriefing - Always visible mission context
// =============================================================================

function MissionBriefing({ 
  objective, 
  phase, 
  progress,
  onAbort,
  onRetry,
  onNewMission,
  startTime,
}: { 
  objective: string;
  phase: MissionPhase;
  progress: number;
  onAbort?: () => void;
  onRetry?: () => void;
  onNewMission?: () => void;
  startTime?: Date;
}) {
  const config = phaseConfig[phase];
  const PhaseIcon = config.icon;
  const isActive = !['idle', 'mission_complete', 'mission_failed'].includes(phase);
  const isComplete = phase === 'mission_complete' || phase === 'mission_failed';
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

  const copyObjective = () => {
    navigator.clipboard.writeText(objective);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn(
      'rounded-xl border-2 transition-all duration-300 overflow-hidden',
      isActive && 'border-amber-500/50 bg-gradient-to-br from-amber-500/5 to-orange-500/5',
      phase === 'mission_complete' && 'border-green-500/50 bg-gradient-to-br from-green-500/5 to-emerald-500/5',
      phase === 'mission_failed' && 'border-red-500/50 bg-gradient-to-br from-red-500/5 to-rose-500/5',
      phase === 'idle' && 'border-border bg-card',
    )}>
      {/* Mission Objective Display */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Target className="h-3 w-3" />
              <span className="uppercase tracking-wider font-semibold">Mission Objective</span>
              <button 
                onClick={copyObjective}
                className="hover:text-foreground transition-colors"
                title="Copy objective"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
            <p className="text-sm font-medium leading-relaxed">{objective}</p>
          </div>
          {isActive && onAbort && (
            <Button variant="destructive" size="sm" onClick={onAbort} className="shrink-0 gap-1.5">
              <Square className="h-3 w-3" />
              Abort Mission
            </Button>
          )}
          {isComplete && (
            <div className="flex items-center gap-2 shrink-0">
              {onRetry && (
                <Button variant="default" size="sm" onClick={onRetry} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry Mission
                </Button>
              )}
              {onNewMission && (
                <Button variant="outline" size="sm" onClick={onNewMission} className="gap-1.5">
                  <Flag className="h-3.5 w-3.5" />
                  New Mission
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className={cn(
        'px-4 py-3 border-t flex items-center justify-between gap-4',
        isActive && 'bg-amber-500/5',
        phase === 'mission_complete' && 'bg-green-500/5',
        phase === 'mission_failed' && 'bg-red-500/5',
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
              isActive && 'animate-pulse'
            )} />
          </div>
          <div>
            <div className={cn('font-semibold uppercase tracking-wide text-sm', config.color)}>
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
            <div className="text-sm text-muted-foreground font-mono">
              T+{formatTime(elapsed)}
            </div>
          )}
          {isActive && (
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
          {phase === 'mission_complete' && (
            <Badge className="bg-green-500 text-white gap-1">
              <Medal className="h-3 w-3" />
              Victory
            </Badge>
          )}
          {phase === 'mission_failed' && (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3 w-3" />
              Failed
            </Badge>
          )}
        </div>
      </div>

      {/* Phase Progress Steps */}
      {(isActive || isComplete) && (
        <div className="px-4 py-3 border-t bg-muted/30">
          <div className="flex items-center justify-between">
            {(['reconnaissance', 'strategic_planning', 'deploying', 'debriefing'] as MissionPhase[]).map((p, index, arr) => {
              const stepConfig = phaseConfig[p];
              const StepIcon = stepConfig.icon;
              const currentIndex = ['reconnaissance', 'strategic_planning', 'deploying', 'debriefing'].indexOf(phase);
              const stepIndex = index;
              const isActiveStep = p === phase;
              const isPast = stepIndex < currentIndex || phase === 'mission_complete';
              const isFuture = stepIndex > currentIndex && phase !== 'mission_complete';

              return (
                <div key={p} className="flex items-center">
                  <div className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-full transition-all',
                    isActiveStep && `${stepConfig.bgColor}/20`,
                    isPast && 'bg-green-500/10',
                  )}>
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center',
                      isActiveStep && stepConfig.bgColor,
                      isPast && 'bg-green-500',
                      isFuture && 'bg-muted',
                    )}>
                      {isPast ? (
                        <CheckCircle2 className="h-4 w-4 text-white" />
                      ) : (
                        <StepIcon className={cn(
                          'h-3.5 w-3.5',
                          isActiveStep && 'text-white',
                          isFuture && 'text-muted-foreground',
                        )} />
                      )}
                    </div>
                    <span className={cn(
                      'text-sm font-medium',
                      isActiveStep && stepConfig.color,
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
// Component: CommandLog - Real-time field communications
// =============================================================================

function CommandLog({ 
  entries, 
  currentAction,
}: { 
  entries: CommandLogEntry[];
  currentAction?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, currentAction]);

  const getIcon = (type: CommandLogEntry['type']) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'phase': return <Flag className="h-4 w-4 text-blue-500" />;
      case 'task': return <Swords className="h-4 w-4 text-amber-500" />;
      default: return <Radio className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b bg-muted/50 flex items-center justify-between">
        <span className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
          <Radio className="h-4 w-4" />
          Command Log
        </span>
        {currentAction && (
          <div className="flex items-center gap-2 text-sm text-amber-500">
            <Activity className="h-3.5 w-3.5 animate-pulse" />
            <span className="animate-pulse">{currentAction}</span>
          </div>
        )}
      </div>
      <ScrollArea ref={scrollRef} className="h-64">
        <div className="p-3 space-y-2 font-mono text-xs">
          {entries.length === 0 ? (
            <div className="text-muted-foreground text-center py-8 text-sm">
              Awaiting transmissions...
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
                    entry.type === 'phase' && 'text-blue-500 font-semibold uppercase',
                  )}>
                    {entry.message}
                  </div>
                  {entry.details && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {entry.details}
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground shrink-0 tabular-nums">
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
// Component: OperativeCard
// =============================================================================

function OperativeCard({ operative, isExpanded, onToggle }: { 
  operative: Operative; 
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const config = operativeStatusConfig[operative.status];
  const StatusIcon = config.icon;
  
  return (
    <div className={cn(
      'border rounded-lg transition-all',
      operative.status === 'in_progress' && 'border-amber-500 bg-amber-500/5 shadow-sm shadow-amber-500/20',
      operative.status === 'completed' && 'border-green-500/50',
      operative.status === 'failed' && 'border-red-500/50 bg-red-500/5',
    )}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
      >
        <StatusIcon className={cn(
          'h-5 w-5 shrink-0',
          config.color,
          operative.status === 'in_progress' && 'animate-spin'
        )} />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{operative.title}</div>
          {operative.status === 'in_progress' && (
            <div className="text-xs text-amber-500 animate-pulse mt-0.5">
              Engaging target...
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={cn(
            "text-xs",
            operative.priority === 'high' && 'border-red-500/50 text-red-500',
            operative.priority === 'medium' && 'border-amber-500/50 text-amber-500',
            operative.priority === 'low' && 'border-green-500/50 text-green-500',
          )}>
            {operative.priority}
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
          <p className="text-sm text-muted-foreground pt-3">{operative.description}</p>
          
          {operative.targetFiles && operative.targetFiles.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wider">Target Files</div>
              <div className="flex flex-wrap gap-1.5">
                {operative.targetFiles.map((file) => (
                  <Badge key={file} variant="secondary" className="text-xs font-mono">
                    <Crosshair className="h-3 w-3 mr-1" />
                    {file}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {operative.result && (
            <div className="p-2.5 rounded-lg bg-green-500/10 text-sm text-green-600 dark:text-green-400 border border-green-500/20">
              <Medal className="h-4 w-4 inline mr-2" />
              {operative.result}
            </div>
          )}
          
          {operative.error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 text-sm text-red-600 dark:text-red-400 border border-red-500/20">
              <XCircle className="h-4 w-4 inline mr-2" />
              {operative.error}
            </div>
          )}
          
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
            {operative.filesModified && operative.filesModified.length > 0 && (
              <span>{operative.filesModified.length} targets modified</span>
            )}
            {operative.duration !== undefined && (
              <span>Duration: {(operative.duration / 1000).toFixed(1)}s</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Component: BattlePlanView
// =============================================================================

function BattlePlanView({ plan, expandedOperatives, onToggleOperative, phase }: {
  plan: BattlePlan;
  expandedOperatives: Set<string>;
  onToggleOperative: (operativeId: string) => void;
  phase: MissionPhase;
}) {
  const [expandedSquads, setExpandedSquads] = useState<Set<string>>(() => 
    new Set(plan.parallelGroups.map(g => g.id))
  );

  const toggleSquad = (squadId: string) => {
    setExpandedSquads(prev => {
      const next = new Set(prev);
      if (next.has(squadId)) {
        next.delete(squadId);
      } else {
        next.add(squadId);
      }
      return next;
    });
  };

  const totalOperatives = plan.parallelGroups.reduce((sum, g) => sum + g.subtasks.length, 0);
  const successfulOperatives = plan.parallelGroups.reduce(
    (sum, g) => sum + g.subtasks.filter(t => t.status === 'completed').length,
    0
  );
  const casualtyOperatives = plan.parallelGroups.reduce(
    (sum, g) => sum + g.subtasks.filter(t => t.status === 'failed').length,
    0
  );
  const engagedOperatives = plan.parallelGroups.reduce(
    (sum, g) => sum + g.subtasks.filter(t => t.status === 'in_progress').length,
    0
  );

  return (
    <div className="space-y-4">
      {/* Battle Plan Header */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="p-4 border-b bg-gradient-to-r from-indigo-500/10 to-purple-500/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Shield className="h-5 w-5 text-indigo-500" />
                Battle Plan
              </h3>
              <p className="text-sm text-muted-foreground mt-1">{plan.summary}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="gap-1">
                <Users className="h-3 w-3" />
                {totalOperatives} operatives
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                {plan.estimatedTotalEffort}
              </Badge>
            </div>
          </div>
        </div>

        {/* Force Status Bar */}
        <div className="p-4 bg-muted/30">
          <div className="flex items-center justify-between mb-2 text-sm">
            <span className="text-muted-foreground uppercase tracking-wider text-xs font-semibold">Force Status</span>
            <div className="flex items-center gap-3">
              {engagedOperatives > 0 && (
                <span className="text-amber-500 flex items-center gap-1">
                  <Swords className="h-3 w-3 animate-pulse" />
                  {engagedOperatives} engaged
                </span>
              )}
              <span className="text-green-500">{successfulOperatives} successful</span>
              {casualtyOperatives > 0 && (
                <span className="text-red-500">{casualtyOperatives} casualties</span>
              )}
            </div>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden flex">
            <div 
              className="bg-green-500 transition-all duration-300"
              style={{ width: `${(successfulOperatives / totalOperatives) * 100}%` }}
            />
            <div 
              className="bg-amber-500 animate-pulse transition-all duration-300"
              style={{ width: `${(engagedOperatives / totalOperatives) * 100}%` }}
            />
            <div 
              className="bg-red-500 transition-all duration-300"
              style={{ width: `${(casualtyOperatives / totalOperatives) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Risk Assessment */}
      {plan.riskAssessment && (
        <div className="p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold text-yellow-600 dark:text-yellow-400 mb-1">Risk Assessment</div>
            <p className="text-sm text-yellow-600 dark:text-yellow-400">{plan.riskAssessment}</p>
          </div>
        </div>
      )}

      {/* Squads */}
      <div className="space-y-3">
        {plan.parallelGroups
          .sort((a, b) => a.executionOrder - b.executionOrder)
          .map((squad) => {
            const squadSuccess = squad.subtasks.filter(t => t.status === 'completed').length;
            const squadCasualties = squad.subtasks.filter(t => t.status === 'failed').length;
            const squadEngaged = squad.subtasks.filter(t => t.status === 'in_progress').length;
            const isExpanded = expandedSquads.has(squad.id);
            const allDone = squadSuccess + squadCasualties === squad.subtasks.length;
            
            return (
              <Collapsible
                key={squad.id}
                open={isExpanded}
                onOpenChange={() => toggleSquad(squad.id)}
              >
                <div className={cn(
                  'rounded-lg border bg-card overflow-hidden transition-all',
                  squadEngaged > 0 && 'border-amber-500 shadow-sm shadow-amber-500/20',
                  allDone && squadCasualties === 0 && 'border-green-500/50',
                  allDone && squadCasualties > 0 && 'border-red-500/50',
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
                          'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold',
                          squadEngaged > 0 && 'bg-amber-500 text-white',
                          allDone && squadCasualties === 0 && 'bg-green-500 text-white',
                          allDone && squadCasualties > 0 && 'bg-red-500 text-white',
                          !squadEngaged && !allDone && 'bg-muted text-muted-foreground',
                        )}>
                          <Users className="h-4 w-4" />
                        </div>
                        <div className="text-left">
                          <div className="font-semibold">Squad {squad.executionOrder}: {squad.name}</div>
                          {squadEngaged > 0 && (
                            <div className="text-xs text-amber-500 animate-pulse">
                              {squadEngaged} operative{squadEngaged > 1 ? 's' : ''} engaged...
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm text-muted-foreground">
                          <span className={squadSuccess > 0 ? 'text-green-500' : ''}>{squadSuccess}</span>
                          {squadCasualties > 0 && (
                            <span className="text-red-500">/{squadCasualties}</span>
                          )}
                          <span>/{squad.subtasks.length}</span>
                        </div>
                        {allDone && squadCasualties === 0 && (
                          <Medal className="h-5 w-5 text-green-500" />
                        )}
                        {squadEngaged > 0 && (
                          <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
                        )}
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t p-3 space-y-2 bg-muted/20">
                      {squad.subtasks.map((operative) => (
                        <OperativeCard
                          key={operative.id}
                          operative={operative}
                          isExpanded={expandedOperatives.has(operative.id)}
                          onToggle={() => onToggleOperative(operative.id)}
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
// Component: DebriefingView
// =============================================================================

function DebriefingView({ report }: { report: DebriefingReport }) {
  return (
    <div className="space-y-4">
      {/* Overall Result */}
      <div className={cn(
        'p-6 rounded-xl border-2',
        report.overallSuccess 
          ? 'bg-gradient-to-br from-green-500/10 to-emerald-500/10 border-green-500/50' 
          : 'bg-gradient-to-br from-red-500/10 to-rose-500/10 border-red-500/50'
      )}>
        <div className="flex items-center gap-3 mb-3">
          {report.overallSuccess ? (
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/30">
              <Medal className="h-7 w-7 text-white" />
            </div>
          ) : (
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center shadow-lg shadow-red-500/30">
              <XCircle className="h-7 w-7 text-white" />
            </div>
          )}
          <div>
            <h3 className={cn(
              'text-xl font-bold uppercase tracking-wide',
              report.overallSuccess ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            )}>
              {report.overallSuccess ? 'Mission Accomplished!' : 'Mission Failed'}
            </h3>
            <p className="text-sm text-muted-foreground">{report.summary}</p>
          </div>
        </div>
        
        <div className="flex gap-6 text-sm pt-2 border-t border-current/10">
          <div className="flex items-center gap-2">
            <Medal className="h-4 w-4 text-green-500" />
            <span><strong>{report.completedTasks}</strong> successful</span>
          </div>
          {report.failedTasks > 0 && (
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <span><strong>{report.failedTasks}</strong> casualties</span>
            </div>
          )}
          {report.skippedTasks > 0 && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              <span><strong>{report.skippedTasks}</strong> stood down</span>
            </div>
          )}
        </div>
      </div>

      {/* Issues */}
      {report.issues.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="p-3 border-b bg-muted/50">
            <h4 className="font-semibold uppercase tracking-wider text-sm">After Action Report ({report.issues.length} issues)</h4>
          </div>
          <div className="p-3 space-y-2">
            {report.issues.map((issue, i) => (
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
                    Tactical suggestion: {issue.suggestion}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Replanning */}
      {report.needsReplanning && report.replanningReason && (
        <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/10">
          <div className="flex items-center gap-2 mb-2">
            <RefreshCw className="h-5 w-5 text-amber-500" />
            <span className="font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
              Strategic Reassessment Required
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{report.replanningReason}</p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Component: MissionResults
// =============================================================================

function MissionResults({ 
  branchCreated, 
  filesModified 
}: { 
  branchCreated: string | null;
  filesModified: string[];
}) {
  if (!branchCreated && filesModified.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <MapPin className="h-4 w-4" />
        Mission Results
      </h3>
      <div className="space-y-2">
        {branchCreated && (
          <div className="flex items-center gap-2 text-sm">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <span>Forward Operating Base:</span>
            <code className="px-2 py-0.5 rounded bg-muted font-mono text-xs">
              {branchCreated}
            </code>
          </div>
        )}
        {filesModified.length > 0 && (
          <div className="text-sm">
            <div className="flex items-center gap-2 mb-2">
              <Crosshair className="h-4 w-4 text-muted-foreground" />
              <span>{filesModified.length} targets modified</span>
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
  const { owner, repo, runId: urlRunId } = useParams<{ owner: string; repo: string; runId?: string }>();
  const navigate = useNavigate();
  const { data: session } = useSession();
  
  // Form state
  const [missionObjective, setMissionObjective] = useState('');
  const [context, setContext] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [createBranch, setCreateBranch] = useState(true);
  const [branchName, setBranchName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Current run ID (either from URL or newly started)
  const [currentRunId, setCurrentRunId] = useState<string | null>(urlRunId || null);
  
  // Mission state
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<MissionPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [battlePlan, setBattlePlan] = useState<BattlePlan | null>(null);
  const [debriefing, setDebriefing] = useState<DebriefingReport | null>(null);
  const [intelReport, setIntelReport] = useState<IntelReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedOperatives, setExpandedOperatives] = useState<Set<string>>(new Set());
  const [commandLog, setCommandLog] = useState<CommandLogEntry[]>([]);
  const hasReceivedStartedRef = useRef(false);
  const [currentAction, setCurrentAction] = useState<string | undefined>();
  const [startTime, setStartTime] = useState<Date | undefined>();
  const [submittedObjective, setSubmittedObjective] = useState('');
  
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

  // Fetch mission history
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: missionHistory, refetch: refetchHistory } = (trpc as any).planning?.listRuns?.useQuery(
    { repoId: repoData?.repo.id!, limit: 20 },
    { enabled: !!repoData?.repo.id }
  ) as { 
    data: Array<{
      id: string;
      task: string;
      status: string;
      startedAt: string;
      completedAt?: string;
      error?: string;
    }> | undefined;
    refetch: () => void;
  };

  // Fetch current run data if we have a runId
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingRun, error: existingRunError, isLoading: isLoadingRun } = (trpc as any).planning?.getRun?.useQuery(
    { runId: urlRunId! },
    { enabled: !!urlRunId, retry: false }
  ) as { 
    data: {
      id: string;
      repoId: string;
      task: string;
      context?: string;
      status: string;
      plan?: BattlePlan;
      groupResults?: Array<{ groupId: string; subtaskResults: Array<{ subtaskId: string; status: string; result?: string; error?: string }> }>;
      review?: DebriefingReport;
      error?: string;
      startedAt: string;
      completedAt?: string;
      dryRun: boolean;
      createBranch: boolean;
      branchName?: string;
    } | undefined;
    error: { message: string } | null;
    isLoading: boolean;
  };

  // Command log helper
  const addLog = useCallback((
    type: CommandLogEntry['type'],
    message: string,
    details?: string
  ) => {
    setCommandLog(prev => [...prev, {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      type,
      message,
      details,
    }]);
  }, []);

  // Update operative status
  const updateOperative = useCallback((operativeId: string, updates: Partial<Operative>) => {
    setBattlePlan(prev => {
      if (!prev) return null;
      return {
        ...prev,
        parallelGroups: prev.parallelGroups.map(squad => ({
          ...squad,
          subtasks: squad.subtasks.map(operative =>
            operative.id === operativeId ? { ...operative, ...updates } : operative
          ),
        })),
      };
    });
  }, []);

  // Abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Handle SSE events
  const handleStreamEvent = useCallback((event: { runId?: string; stepId?: string; result?: any; error?: string; totalDuration?: number }) => {
    const { stepId, result, error: eventError, totalDuration } = event;
    
    // Started event - only process once per mission
    if (event.runId && !stepId && !totalDuration && !eventError) {
      if (hasReceivedStartedRef.current) {
        return;
      }
      hasReceivedStartedRef.current = true;
      setCurrentRunId(event.runId);
      addLog('phase', 'Mission initiated');
      setCurrentAction('Deploying reconnaissance...');
      setPhase('reconnaissance');
      setProgress(5);
      return;
    }
    
    // Complete event
    if (totalDuration !== undefined) {
      setPhase('mission_complete');
      setProgress(100);
      setCurrentAction(undefined);
      addLog('success', 'Mission accomplished - all objectives achieved');
      setIsRunning(false);
      return;
    }
    
    // Error event
    if (eventError && !stepId) {
      setError(eventError);
      setPhase('mission_failed');
      setCurrentAction(undefined);
      addLog('error', `Mission compromised: ${eventError}`);
      setIsRunning(false);
      return;
    }
    
    // Step events
    if (stepId) {
      if (result === undefined && !eventError) {
        // step-start
        const newPhase = stepToPhase[stepId];
        if (newPhase) {
          setPhase(newPhase);
          setProgress(stepToProgress[stepId] || 0);
          setCurrentAction(phaseConfig[newPhase]?.description);
          addLog('phase', phaseConfig[newPhase]?.label);
        }
      } else if (eventError) {
        // step-error
        addLog('error', `Operation failed: ${stepId}`, eventError);
        setCurrentAction(undefined);
      } else {
        // step-complete
        setProgress(stepToProgress[stepId] ? stepToProgress[stepId] + 10 : 0);
        
        if (stepId === 'analyze-task' && result) {
          if (result.projectInfo) {
            setIntelReport(result.projectInfo);
            addLog('success', `Intel gathered: ${result.projectInfo.language} ${result.projectInfo.type} detected`);
          }
          if (result.relevantFiles?.length) {
            addLog('info', `${result.relevantFiles.length} strategic targets identified`);
          }
        }
        
        if (stepId === 'create-plan' && result?.plan) {
          setBattlePlan(result.plan);
          const operativeCount = result.plan.parallelGroups?.reduce(
            (sum: number, g: Squad) => sum + g.subtasks.length, 0
          ) || 0;
          addLog('success', `Battle plan formulated: ${operativeCount} operatives in ${result.plan.parallelGroups?.length || 0} squads`);
        }
        
        if (stepId === 'execute-plan' && result) {
          if (result.groupResults) {
            for (const squad of result.groupResults) {
              for (const opResult of squad.subtaskResults) {
                updateOperative(opResult.subtaskId, {
                  status: opResult.status,
                  result: opResult.result,
                  error: opResult.error,
                  duration: opResult.duration,
                  filesModified: opResult.filesModified,
                });
                
                if (opResult.status === 'completed') {
                  addLog('success', `Operative ${opResult.subtaskId}: Target secured`);
                } else if (opResult.status === 'failed') {
                  addLog('error', `Operative ${opResult.subtaskId}: Casualty`, opResult.error);
                }
              }
            }
          }
          if (result.branchName) setBranchCreated(result.branchName);
          if (result.filesModified) setFilesModified(result.filesModified);
        }
        
        if (stepId === 'review-results' && result?.review) {
          setDebriefing(result.review);
          addLog(
            result.review.overallSuccess ? 'success' : 'warning',
            result.review.summary
          );
        }
      }
    }
  }, [addLog, updateOperative]);

  // Start streaming when mission begins
  useEffect(() => {
    if (!isRunning || !repoData?.repo.id || !submittedObjective) {
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
            task: submittedObjective.trim(),
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
          return;
        }
        setError((err as Error).message);
        setPhase('mission_failed');
        setCurrentAction(undefined);
        setIsRunning(false);
        addLog('error', `Communications lost: ${(err as Error).message}`);
      }
    };

    startStream();

    return () => {
      abortController.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, repoData?.repo.id, submittedObjective, handleStreamEvent]);

  // Load existing run data when navigating to a run URL
  useEffect(() => {
    if (!existingRun) return;
    
    setSubmittedObjective(existingRun.task);
    setCurrentRunId(existingRun.id);
    setStartTime(new Date(existingRun.startedAt));
    
    if (existingRun.plan) {
      setBattlePlan(existingRun.plan);
    }
    if (existingRun.review) {
      setDebriefing(existingRun.review);
    }
    if (existingRun.error) {
      setError(existingRun.error);
    }
    
    const statusToPhase: Record<string, MissionPhase> = {
      pending: 'reconnaissance',
      planning: 'strategic_planning',
      executing: 'deploying',
      reviewing: 'debriefing',
      completed: 'mission_complete',
      failed: 'mission_failed',
    };
    setPhase(statusToPhase[existingRun.status] || 'idle');
    
    if (['pending', 'planning', 'executing', 'reviewing'].includes(existingRun.status)) {
      setIsRunning(true);
      setCurrentAction('Reconnecting to command...');
      hasReceivedStartedRef.current = true;
      
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      
      const observeStream = async () => {
        try {
          const response = await fetch(`${apiUrl}/api/planning/observe/${existingRun.id}`, {
            credentials: 'include',
            signal: abortController.signal,
          });
          
          if (!response.ok) {
            throw new Error(`Failed to observe mission: ${response.status}`);
          }
          
          const reader = response.body?.getReader();
          if (!reader) return;
          
          const decoder = new TextDecoder();
          let buffer = '';
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  handleStreamEvent(data);
                } catch {
                  // Ignore parse errors
                }
              }
            }
          }
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            console.error('Observation error:', err);
          }
        }
      };
      
      observeStream();
      
      return () => {
        abortController.abort();
      };
    } else {
      setIsRunning(false);
      setProgress(existingRun.status === 'completed' ? 100 : 0);
    }
  }, [existingRun, handleStreamEvent]);

  // Update URL when currentRunId changes
  useEffect(() => {
    if (currentRunId && currentRunId !== urlRunId) {
      navigate(`/${owner}/${repo}/planning/${currentRunId}`, { replace: true });
      refetchHistory?.();
    }
  }, [currentRunId, urlRunId, owner, repo, navigate, refetchHistory]);

  const handleLaunchMission = () => {
    if (!missionObjective.trim() || !repoData?.repo.id) return;
    
    setSubmittedObjective(missionObjective.trim());
    setIsRunning(true);
    setPhase('reconnaissance');
    setProgress(0);
    setBattlePlan(null);
    setDebriefing(null);
    setIntelReport(null);
    setError(null);
    setCommandLog([]);
    setBranchCreated(null);
    setFilesModified([]);
    setExpandedOperatives(new Set());
    setCurrentAction('Initiating mission...');
    setStartTime(new Date());
    hasReceivedStartedRef.current = false;
    
    addLog('phase', 'Mission parameters received - deploying forces...');
  };

  const handleAbortMission = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
    setPhase('mission_failed');
    setCurrentAction(undefined);
    addLog('warning', 'Mission aborted by command');
  };

  const handleRetryMission = () => {
    if (!submittedObjective.trim() || !repoData?.repo.id) return;
    
    setIsRunning(true);
    setPhase('reconnaissance');
    setProgress(0);
    setBattlePlan(null);
    setDebriefing(null);
    setIntelReport(null);
    setError(null);
    setCommandLog([]);
    setBranchCreated(null);
    setFilesModified([]);
    setExpandedOperatives(new Set());
    setCurrentAction('Retrying mission...');
    setStartTime(new Date());
    hasReceivedStartedRef.current = false;
    
    addLog('phase', 'Mission retry authorized...');
  };

  const handleNewMission = () => {
    setMissionObjective('');
    setSubmittedObjective('');
    setCurrentRunId(null);
    setIsRunning(false);
    setPhase('idle');
    setProgress(0);
    setBattlePlan(null);
    setDebriefing(null);
    setIntelReport(null);
    setError(null);
    setCommandLog([]);
    setBranchCreated(null);
    setFilesModified([]);
    setExpandedOperatives(new Set());
    setCurrentAction(undefined);
    setStartTime(undefined);
    hasReceivedStartedRef.current = false;
    navigate(`/${owner}/${repo}/planning`);
  };

  const toggleOperative = (operativeId: string) => {
    setExpandedOperatives(prev => {
      const next = new Set(prev);
      if (next.has(operativeId)) {
        next.delete(operativeId);
      } else {
        next.add(operativeId);
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
  const isComplete = phase === 'mission_complete' || phase === 'mission_failed';
  const showMission = isRunning || isComplete;

  return (
    <RepoLayout owner={owner!} repo={repo!} activeTab="planning">
      <div className="flex gap-6">
        {/* Left Sidebar - Mission Archives */}
        <div className="w-64 shrink-0 hidden lg:block">
          <div className="sticky top-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                <History className="h-4 w-4" />
                Mission Archives
              </h3>
              {!isIdle && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 px-2"
                  onClick={handleNewMission}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            
            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-1 pr-4">
                {missionHistory?.map((mission) => (
                  <Link
                    key={mission.id}
                    to={`/${owner}/${repo}/planning/${mission.id}`}
                    className={cn(
                      'block p-3 rounded-lg border transition-colors hover:bg-accent',
                      currentRunId === mission.id && 'bg-accent border-primary'
                    )}
                  >
                    <p className="text-sm font-medium line-clamp-2 mb-1">
                      {mission.task.length > 60 ? mission.task.slice(0, 60) + '...' : mission.task}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge 
                        variant={
                          mission.status === 'completed' ? 'default' : 
                          mission.status === 'failed' ? 'destructive' : 
                          'secondary'
                        }
                        className={cn(
                          "text-[10px] px-1.5 py-0",
                          mission.status === 'completed' && 'bg-green-500'
                        )}
                      >
                        {mission.status === 'completed' ? 'Victory' : 
                         mission.status === 'failed' ? 'Failed' : mission.status}
                      </Badge>
                      <span>
                        {new Date(mission.startedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </Link>
                ))}
                
                {(!missionHistory || missionHistory.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No missions logged
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0 max-w-4xl space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                'p-2.5 rounded-xl transition-colors',
                isRunning ? 'bg-amber-500/10' : 'bg-primary/10'
              )}>
                <Target className={cn(
                  'h-6 w-6',
                  isRunning ? 'text-amber-500 animate-pulse' : 'text-primary'
                )} />
              </div>
              <div>
                <h1 className="text-2xl font-bold uppercase tracking-wide">Command Center</h1>
                <p className="text-sm text-muted-foreground">
                  Deploy AI operatives to accomplish complex objectives
                </p>
              </div>
            </div>
            {planningStatus?.available && (
              <Badge variant="outline" className="gap-1.5 py-1">
                <Shield className="h-3.5 w-3.5" />
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
                  Command systems offline
                </p>
                <p className="text-sm text-muted-foreground">
                  Configure AI credentials in repository settings to activate command center.
                </p>
              </div>
            </div>
          )}

          {/* Run Not Found Error */}
          {urlRunId && existingRunError && !isLoadingRun && (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/30">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <div className="flex-1">
                <p className="font-medium text-destructive">
                  Mission record not found
                </p>
                <p className="text-sm text-muted-foreground">
                  This mission log may have been archived or deleted. Launch a new mission to continue.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleNewMission}>
                <Flag className="h-4 w-4 mr-1" />
                New Mission
              </Button>
            </div>
          )}

          {/* Mission Briefing - Shows objective & progress when active */}
          {showMission && submittedObjective && (
            <MissionBriefing
              objective={submittedObjective}
              phase={phase}
              progress={progress}
              onAbort={isRunning ? handleAbortMission : undefined}
              onRetry={isComplete ? handleRetryMission : undefined}
              onNewMission={isComplete ? handleNewMission : undefined}
              startTime={startTime}
            />
          )}

          {/* Mission Input - Only shown when idle */}
          {isIdle && (
            <div className="space-y-4 p-6 rounded-xl border-2 border-dashed bg-gradient-to-br from-card to-muted/20">
              <div className="space-y-2">
                <label className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Mission Objective
                </label>
                <MentionTextarea
                  placeholder="Define your objective... Use @ to designate strategic targets (e.g., 'Implement secure authentication with JWT tokens')"
                  value={missionObjective}
                  onChange={setMissionObjective}
                  owner={owner!}
                  repo={repo!}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Strategic context (optional)</label>
                <MentionTextarea
                  placeholder="Additional intelligence, constraints, or tactical considerations... Use @ to reference specific targets"
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
                    Simulation mode (dry run)
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="createBranch"
                    checked={createBranch}
                    onCheckedChange={(checked) => setCreateBranch(checked as boolean)}
                  />
                  <label htmlFor="createBranch" className="text-sm cursor-pointer">
                    Establish forward operating base (branch)
                  </label>
                </div>
              </div>

              {/* Advanced Options */}
              <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 text-muted-foreground">
                    {showAdvanced ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    Advanced parameters
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Custom base designation</label>
                    <Input
                      placeholder="ops/mission-codename"
                      value={branchName}
                      onChange={(e) => setBranchName(e.target.value)}
                      disabled={!createBranch}
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Launch Button */}
              <div className="pt-4">
                <Button
                  onClick={handleLaunchMission}
                  disabled={!missionObjective.trim() || !planningStatus?.available}
                  size="lg"
                  className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg shadow-amber-500/25"
                >
                  <Swords className="h-4 w-4" />
                  Launch Mission
                </Button>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
              <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">
                  {phase === 'mission_failed' ? 'Mission Compromised' : 'Critical Error'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Main Content - Two columns when mission is active */}
          {showMission && (
            <div className="grid lg:grid-cols-5 gap-6">
              {/* Left: Command Log */}
              <div className="lg:col-span-2 space-y-4">
                <CommandLog 
                  entries={commandLog} 
                  currentAction={isRunning ? currentAction : undefined}
                />
                
                {/* Intel Report */}
                {intelReport && (
                  <div className="rounded-lg border bg-card p-4">
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 uppercase tracking-wider">
                      <Search className="h-4 w-4" />
                      Intel Report
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{intelReport.language}</Badge>
                      <Badge variant="secondary">{intelReport.type}</Badge>
                      {intelReport.hasTests && <Badge variant="outline">Tests Detected</Badge>}
                      {intelReport.hasLinting && <Badge variant="outline">Linting Active</Badge>}
                    </div>
                  </div>
                )}

                {/* Mission Results */}
                {isComplete && (
                  <MissionResults 
                    branchCreated={branchCreated} 
                    filesModified={filesModified} 
                  />
                )}
              </div>

              {/* Right: Battle Plan / Debriefing */}
              <div className="lg:col-span-3">
                {debriefing ? (
                  <DebriefingView report={debriefing} />
                ) : battlePlan ? (
                  <BattlePlanView
                    plan={battlePlan}
                    expandedOperatives={expandedOperatives}
                    onToggleOperative={toggleOperative}
                    phase={phase}
                  />
                ) : (
                  <div className="rounded-lg border bg-card p-12 text-center">
                    <Compass className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50 animate-pulse" />
                    <p className="text-muted-foreground">Formulating battle plan...</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty State */}
          {isIdle && !error && (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">
                The AI command system will analyze the battlefield, formulate a battle plan, and deploy operatives in coordinated squads.
              </p>
            </div>
          )}
        </div>
      </div>
    </RepoLayout>
  );
}
