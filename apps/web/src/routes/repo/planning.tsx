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
  Users,
  Gem,
  Lock,
  Unlock,
  Star,
  Flame,
  Coffee,
  ThumbsUp,
  PartyPopper,
  Rocket,
  Glasses,
  KeyRound,
  Vault,
  Briefcase,
  UserCheck,
  Wrench,
  Award,
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

type CrewMemberStatus = 'waiting' | 'on_it' | 'nailed_it' | 'hit_a_snag' | 'sat_out';
type HeistPhase = 'chilling' | 'casing' | 'scheming' | 'making_moves' | 'wrapping_up' | 'pulled_it_off' | 'got_caught';

interface CrewMember {
  id: string;
  title: string;
  description: string;
  priority: string;
  estimatedEffort?: string;
  targetFiles?: string[];
  status: CrewMemberStatus;
  result?: string;
  error?: string;
  duration?: number;
  filesModified?: string[];
}

interface Crew {
  id: string;
  name: string;
  executionOrder: number;
  subtasks: CrewMember[];
  isCompleted?: boolean;
  duration?: number;
}

interface GamePlan {
  id: string;
  version: number;
  originalTask: string;
  summary: string;
  parallelGroups: Crew[];
  estimatedTotalEffort: string;
  riskAssessment?: string;
}

interface Debrief {
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

interface FeedEntry {
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
const stepToPhase: Record<string, HeistPhase> = {
  'analyze-task': 'casing',
  'create-plan': 'scheming',
  'execute-plan': 'making_moves',
  'review-results': 'wrapping_up',
  'aggregate-results': 'wrapping_up',
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

const crewStatusConfig: Record<CrewMemberStatus, { label: string; icon: typeof CheckCircle2; color: string }> = {
  waiting: { label: 'Ready to roll', icon: Coffee, color: 'text-muted-foreground' },
  on_it: { label: 'On it', icon: Loader2, color: 'text-violet-500' },
  nailed_it: { label: 'Nailed it', icon: CheckCircle2, color: 'text-green-500' },
  hit_a_snag: { label: 'Hit a snag', icon: XCircle, color: 'text-red-500' },
  sat_out: { label: 'Sat this one out', icon: Coffee, color: 'text-yellow-500' },
};

const phaseConfig: Record<HeistPhase, { 
  label: string; 
  description: string;
  icon: typeof Brain; 
  color: string; 
  bgColor: string;
}> = {
  chilling: { label: 'Ready When You Are', description: 'What\'s the job, boss?', icon: Coffee, color: 'text-muted-foreground', bgColor: 'bg-muted' },
  casing: { label: 'Casing the Joint', description: 'Scoping out the codebase...', icon: Search, color: 'text-purple-500', bgColor: 'bg-purple-500' },
  scheming: { label: 'Cooking Up a Plan', description: 'The crew\'s putting heads together...', icon: Brain, color: 'text-indigo-500', bgColor: 'bg-indigo-500' },
  making_moves: { label: 'Making Moves', description: 'The crew\'s in action...', icon: Zap, color: 'text-violet-500', bgColor: 'bg-violet-500' },
  wrapping_up: { label: 'Checking the Loot', description: 'Making sure we got everything...', icon: Eye, color: 'text-cyan-500', bgColor: 'bg-cyan-500' },
  pulled_it_off: { label: 'Clean Getaway', description: 'Job\'s done. We\'re legends.', icon: PartyPopper, color: 'text-green-500', bgColor: 'bg-green-500' },
  got_caught: { label: 'Things Got Messy', description: 'We hit some trouble', icon: AlertCircle, color: 'text-red-500', bgColor: 'bg-red-500' },
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
          <span>to tag files</span>
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
              Looking around...
            </div>
          ) : files.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {mentionQuery ? `Nothing matching "${mentionQuery}"` : 'Start typing to find files...'}
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
                  <FileCode className="h-4 w-4 text-muted-foreground shrink-0" />
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
// Component: JobBriefing - Always visible job context
// =============================================================================

function JobBriefing({ 
  theJob, 
  phase, 
  progress,
  onAbort,
  onRetry,
  onNewJob,
  startTime,
}: { 
  theJob: string;
  phase: HeistPhase;
  progress: number;
  onAbort?: () => void;
  onRetry?: () => void;
  onNewJob?: () => void;
  startTime?: Date;
}) {
  const config = phaseConfig[phase];
  const PhaseIcon = config.icon;
  const isActive = !['chilling', 'pulled_it_off', 'got_caught'].includes(phase);
  const isComplete = phase === 'pulled_it_off' || phase === 'got_caught';
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

  const copyJob = () => {
    navigator.clipboard.writeText(theJob);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn(
      'rounded-xl border-2 transition-all duration-300 overflow-hidden',
      isActive && 'border-violet-500/50 bg-gradient-to-br from-violet-500/5 to-purple-500/5',
      phase === 'pulled_it_off' && 'border-green-500/50 bg-gradient-to-br from-green-500/5 to-emerald-500/5',
      phase === 'got_caught' && 'border-red-500/50 bg-gradient-to-br from-red-500/5 to-rose-500/5',
      phase === 'chilling' && 'border-border bg-card',
    )}>
      {/* The Job Display */}
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Gem className="h-3 w-3" />
              <span className="font-medium">The Job</span>
              <button 
                onClick={copyJob}
                className="hover:text-foreground transition-colors"
                title="Copy"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </button>
            </div>
            <p className="text-sm font-medium leading-relaxed">{theJob}</p>
          </div>
          {isActive && onAbort && (
            <Button variant="destructive" size="sm" onClick={onAbort} className="shrink-0 gap-1.5">
              <Square className="h-3 w-3" />
              Call It Off
            </Button>
          )}
          {isComplete && (
            <div className="flex items-center gap-2 shrink-0">
              {onRetry && (
                <Button variant="default" size="sm" onClick={onRetry} className="gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Run It Back
                </Button>
              )}
              {onNewJob && (
                <Button variant="outline" size="sm" onClick={onNewJob} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  New Job
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <div className={cn(
        'px-4 py-3 border-t flex items-center justify-between gap-4',
        isActive && 'bg-violet-500/5',
        phase === 'pulled_it_off' && 'bg-green-500/5',
        phase === 'got_caught' && 'bg-red-500/5',
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
            <div className="text-sm text-muted-foreground font-mono">
              {formatTime(elapsed)}
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
          {phase === 'pulled_it_off' && (
            <Badge className="bg-green-500 text-white gap-1">
              <PartyPopper className="h-3 w-3" />
              Scored!
            </Badge>
          )}
          {phase === 'got_caught' && (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              Busted
            </Badge>
          )}
        </div>
      </div>

      {/* Phase Progress Steps */}
      {(isActive || isComplete) && (
        <div className="px-4 py-3 border-t bg-muted/30">
          <div className="flex items-center justify-between">
            {(['casing', 'scheming', 'making_moves', 'wrapping_up'] as HeistPhase[]).map((p, index, arr) => {
              const stepConfig = phaseConfig[p];
              const StepIcon = stepConfig.icon;
              const currentIndex = ['casing', 'scheming', 'making_moves', 'wrapping_up'].indexOf(phase);
              const stepIndex = index;
              const isActiveStep = p === phase;
              const isPast = stepIndex < currentIndex || phase === 'pulled_it_off';
              const isFuture = stepIndex > currentIndex && phase !== 'pulled_it_off';

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
// Component: CrewFeed - Real-time crew updates
// =============================================================================

function CrewFeed({ 
  entries, 
  currentAction,
}: { 
  entries: FeedEntry[];
  currentAction?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, currentAction]);

  const getIcon = (type: FeedEntry['type']) => {
    switch (type) {
      case 'success': return <ThumbsUp className="h-4 w-4 text-green-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'phase': return <Flame className="h-4 w-4 text-violet-500" />;
      case 'task': return <Zap className="h-4 w-4 text-amber-500" />;
      default: return <Info className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b bg-muted/50 flex items-center justify-between">
        <span className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4" />
          Crew Chat
        </span>
        {currentAction && (
          <div className="flex items-center gap-2 text-sm text-violet-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="animate-pulse">{currentAction}</span>
          </div>
        )}
      </div>
      <ScrollArea ref={scrollRef} className="h-64">
        <div className="p-3 space-y-2">
          {entries.length === 0 ? (
            <div className="text-muted-foreground text-center py-8 text-sm">
              Waiting for the crew to check in...
            </div>
          ) : (
            entries.map((entry) => (
              <div 
                key={entry.id} 
                className={cn(
                  'flex items-start gap-3 p-2 rounded-lg transition-colors',
                  entry.type === 'error' && 'bg-red-500/10',
                  entry.type === 'success' && 'bg-green-500/5',
                  entry.type === 'phase' && 'bg-violet-500/5',
                )}
              >
                <div className="mt-0.5 shrink-0">{getIcon(entry.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className={cn(
                    'text-sm',
                    entry.type === 'error' && 'text-red-500',
                    entry.type === 'warning' && 'text-yellow-500',
                    entry.type === 'success' && 'text-green-600 dark:text-green-400',
                    entry.type === 'phase' && 'text-violet-500 font-medium',
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
// Component: HomieCard
// =============================================================================

function HomieCard({ homie, isExpanded, onToggle }: { 
  homie: CrewMember; 
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const statusMap: Record<string, CrewMemberStatus> = {
    pending: 'waiting',
    in_progress: 'on_it',
    completed: 'nailed_it',
    failed: 'hit_a_snag',
    skipped: 'sat_out',
  };
  const status = statusMap[homie.status] || homie.status as CrewMemberStatus;
  const config = crewStatusConfig[status];
  const StatusIcon = config.icon;
  
  return (
    <div className={cn(
      'border rounded-lg transition-all',
      status === 'on_it' && 'border-violet-500 bg-violet-500/5 shadow-sm shadow-violet-500/20',
      status === 'nailed_it' && 'border-green-500/50',
      status === 'hit_a_snag' && 'border-red-500/50 bg-red-500/5',
    )}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
      >
        <StatusIcon className={cn(
          'h-5 w-5 shrink-0',
          config.color,
          status === 'on_it' && 'animate-spin'
        )} />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{homie.title}</div>
          {status === 'on_it' && (
            <div className="text-xs text-violet-500 animate-pulse mt-0.5">
              Working their magic...
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={cn(
            "text-xs",
            homie.priority === 'high' && 'border-red-500/50 text-red-500',
            homie.priority === 'medium' && 'border-amber-500/50 text-amber-500',
            homie.priority === 'low' && 'border-green-500/50 text-green-500',
          )}>
            {homie.priority}
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
          <p className="text-sm text-muted-foreground pt-3">{homie.description}</p>
          
          {homie.targetFiles && homie.targetFiles.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">Target files</div>
              <div className="flex flex-wrap gap-1.5">
                {homie.targetFiles.map((file) => (
                  <Badge key={file} variant="secondary" className="text-xs font-mono">
                    <FileCode className="h-3 w-3 mr-1" />
                    {file}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {homie.result && (
            <div className="p-2.5 rounded-lg bg-green-500/10 text-sm text-green-600 dark:text-green-400 border border-green-500/20">
              <ThumbsUp className="h-4 w-4 inline mr-2" />
              {homie.result}
            </div>
          )}
          
          {homie.error && (
            <div className="p-2.5 rounded-lg bg-red-500/10 text-sm text-red-600 dark:text-red-400 border border-red-500/20">
              <XCircle className="h-4 w-4 inline mr-2" />
              {homie.error}
            </div>
          )}
          
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
            {homie.filesModified && homie.filesModified.length > 0 && (
              <span>{homie.filesModified.length} files touched</span>
            )}
            {homie.duration !== undefined && (
              <span>Took {(homie.duration / 1000).toFixed(1)}s</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Component: GamePlanView
// =============================================================================

function GamePlanView({ plan, expandedHomies, onToggleHomie, phase }: {
  plan: GamePlan;
  expandedHomies: Set<string>;
  onToggleHomie: (homieId: string) => void;
  phase: HeistPhase;
}) {
  const [expandedCrews, setExpandedCrews] = useState<Set<string>>(() => 
    new Set(plan.parallelGroups.map(g => g.id))
  );

  const toggleCrew = (crewId: string) => {
    setExpandedCrews(prev => {
      const next = new Set(prev);
      if (next.has(crewId)) {
        next.delete(crewId);
      } else {
        next.add(crewId);
      }
      return next;
    });
  };

  const totalHomies = plan.parallelGroups.reduce((sum, g) => sum + g.subtasks.length, 0);
  const homiesWhoNailedIt = plan.parallelGroups.reduce(
    (sum, g) => sum + g.subtasks.filter(t => t.status === 'completed').length,
    0
  );
  const homiesWhoHitSnags = plan.parallelGroups.reduce(
    (sum, g) => sum + g.subtasks.filter(t => t.status === 'failed').length,
    0
  );
  const homiesOnIt = plan.parallelGroups.reduce(
    (sum, g) => sum + g.subtasks.filter(t => t.status === 'in_progress').length,
    0
  );

  return (
    <div className="space-y-4">
      {/* Game Plan Header */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="p-4 border-b bg-gradient-to-r from-violet-500/10 to-purple-500/10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-bold text-lg flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-violet-500" />
                The Game Plan
              </h3>
              <p className="text-sm text-muted-foreground mt-1">{plan.summary}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="outline" className="gap-1">
                <Users className="h-3 w-3" />
                {totalHomies} homies
              </Badge>
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                ~{plan.estimatedTotalEffort}
              </Badge>
            </div>
          </div>
        </div>

        {/* Crew Status Bar */}
        <div className="p-4 bg-muted/30">
          <div className="flex items-center justify-between mb-2 text-sm">
            <span className="text-muted-foreground text-xs font-medium">Crew Status</span>
            <div className="flex items-center gap-3">
              {homiesOnIt > 0 && (
                <span className="text-violet-500 flex items-center gap-1">
                  <Zap className="h-3 w-3 animate-pulse" />
                  {homiesOnIt} making moves
                </span>
              )}
              <span className="text-green-500">{homiesWhoNailedIt} crushed it</span>
              {homiesWhoHitSnags > 0 && (
                <span className="text-red-500">{homiesWhoHitSnags} hit snags</span>
              )}
            </div>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden flex">
            <div 
              className="bg-green-500 transition-all duration-300"
              style={{ width: `${(homiesWhoNailedIt / totalHomies) * 100}%` }}
            />
            <div 
              className="bg-violet-500 animate-pulse transition-all duration-300"
              style={{ width: `${(homiesOnIt / totalHomies) * 100}%` }}
            />
            <div 
              className="bg-red-500 transition-all duration-300"
              style={{ width: `${(homiesWhoHitSnags / totalHomies) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Risk Assessment */}
      {plan.riskAssessment && (
        <div className="p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
          <div>
            <div className="text-xs font-medium text-yellow-600 dark:text-yellow-400 mb-1">Heads up</div>
            <p className="text-sm text-yellow-600 dark:text-yellow-400">{plan.riskAssessment}</p>
          </div>
        </div>
      )}

      {/* Crews */}
      <div className="space-y-3">
        {plan.parallelGroups
          .sort((a, b) => a.executionOrder - b.executionOrder)
          .map((crew) => {
            const crewNailedIt = crew.subtasks.filter(t => t.status === 'completed').length;
            const crewHitSnags = crew.subtasks.filter(t => t.status === 'failed').length;
            const crewOnIt = crew.subtasks.filter(t => t.status === 'in_progress').length;
            const isExpanded = expandedCrews.has(crew.id);
            const allDone = crewNailedIt + crewHitSnags === crew.subtasks.length;
            
            return (
              <Collapsible
                key={crew.id}
                open={isExpanded}
                onOpenChange={() => toggleCrew(crew.id)}
              >
                <div className={cn(
                  'rounded-lg border bg-card overflow-hidden transition-all',
                  crewOnIt > 0 && 'border-violet-500 shadow-sm shadow-violet-500/20',
                  allDone && crewHitSnags === 0 && 'border-green-500/50',
                  allDone && crewHitSnags > 0 && 'border-red-500/50',
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
                          crewOnIt > 0 && 'bg-violet-500 text-white',
                          allDone && crewHitSnags === 0 && 'bg-green-500 text-white',
                          allDone && crewHitSnags > 0 && 'bg-red-500 text-white',
                          !crewOnIt && !allDone && 'bg-muted text-muted-foreground',
                        )}>
                          {crew.executionOrder}
                        </div>
                        <div className="text-left">
                          <div className="font-semibold">{crew.name}</div>
                          {crewOnIt > 0 && (
                            <div className="text-xs text-violet-500 animate-pulse">
                              {crewOnIt} homie{crewOnIt > 1 ? 's' : ''} doing their thing...
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-sm text-muted-foreground">
                          <span className={crewNailedIt > 0 ? 'text-green-500' : ''}>{crewNailedIt}</span>
                          {crewHitSnags > 0 && (
                            <span className="text-red-500">/{crewHitSnags}</span>
                          )}
                          <span>/{crew.subtasks.length}</span>
                        </div>
                        {allDone && crewHitSnags === 0 && (
                          <Star className="h-5 w-5 text-green-500" />
                        )}
                        {crewOnIt > 0 && (
                          <Loader2 className="h-5 w-5 text-violet-500 animate-spin" />
                        )}
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t p-3 space-y-2 bg-muted/20">
                      {crew.subtasks.map((homie) => (
                        <HomieCard
                          key={homie.id}
                          homie={homie}
                          isExpanded={expandedHomies.has(homie.id)}
                          onToggle={() => onToggleHomie(homie.id)}
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
// Component: DebriefView
// =============================================================================

function DebriefView({ report }: { report: Debrief }) {
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
              <PartyPopper className="h-7 w-7 text-white" />
            </div>
          ) : (
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-red-500 to-rose-500 flex items-center justify-center shadow-lg shadow-red-500/30">
              <AlertCircle className="h-7 w-7 text-white" />
            </div>
          )}
          <div>
            <h3 className={cn(
              'text-xl font-bold',
              report.overallSuccess ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            )}>
              {report.overallSuccess ? 'We pulled it off! 🎉' : 'We hit some bumps'}
            </h3>
            <p className="text-sm text-muted-foreground">{report.summary}</p>
          </div>
        </div>
        
        <div className="flex gap-6 text-sm pt-2 border-t border-current/10">
          <div className="flex items-center gap-2">
            <ThumbsUp className="h-4 w-4 text-green-500" />
            <span><strong>{report.completedTasks}</strong> nailed it</span>
          </div>
          {report.failedTasks > 0 && (
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <span><strong>{report.failedTasks}</strong> hit snags</span>
            </div>
          )}
          {report.skippedTasks > 0 && (
            <div className="flex items-center gap-2">
              <Coffee className="h-4 w-4 text-yellow-500" />
              <span><strong>{report.skippedTasks}</strong> sat out</span>
            </div>
          )}
        </div>
      </div>

      {/* Issues */}
      {report.issues.length > 0 && (
        <div className="rounded-lg border bg-card">
          <div className="p-3 border-b bg-muted/50">
            <h4 className="font-semibold text-sm">Things to know ({report.issues.length})</h4>
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
                    💡 {issue.suggestion}
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
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              Might wanna take another crack at this
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{report.replanningReason}</p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Component: LootSummary
// =============================================================================

function LootSummary({ 
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
        <Gem className="h-4 w-4 text-violet-500" />
        The Loot
      </h3>
      <div className="space-y-2">
        {branchCreated && (
          <div className="flex items-center gap-2 text-sm">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <span>Stashed on:</span>
            <code className="px-2 py-0.5 rounded bg-muted font-mono text-xs">
              {branchCreated}
            </code>
          </div>
        )}
        {filesModified.length > 0 && (
          <div className="text-sm">
            <div className="flex items-center gap-2 mb-2">
              <FileCode className="h-4 w-4 text-muted-foreground" />
              <span>{filesModified.length} files touched</span>
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
  const [theJob, setTheJob] = useState('');
  const [context, setContext] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [createBranch, setCreateBranch] = useState(true);
  const [branchName, setBranchName] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Current run ID (either from URL or newly started)
  const [currentRunId, setCurrentRunId] = useState<string | null>(urlRunId || null);
  
  // Heist state
  const [isRunning, setIsRunning] = useState(false);
  const [phase, setPhase] = useState<HeistPhase>('chilling');
  const [progress, setProgress] = useState(0);
  const [gamePlan, setGamePlan] = useState<GamePlan | null>(null);
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [intelReport, setIntelReport] = useState<IntelReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedHomies, setExpandedHomies] = useState<Set<string>>(new Set());
  const [crewFeed, setCrewFeed] = useState<FeedEntry[]>([]);
  const hasReceivedStartedRef = useRef(false);
  const [currentAction, setCurrentAction] = useState<string | undefined>();
  const [startTime, setStartTime] = useState<Date | undefined>();
  const [submittedJob, setSubmittedJob] = useState('');
  
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

  // Fetch job history
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: jobHistory, refetch: refetchHistory } = (trpc as any).planning?.listRuns?.useQuery(
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
      plan?: GamePlan;
      groupResults?: Array<{ groupId: string; subtaskResults: Array<{ subtaskId: string; status: string; result?: string; error?: string }> }>;
      review?: Debrief;
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

  // Feed helper
  const addToFeed = useCallback((
    type: FeedEntry['type'],
    message: string,
    details?: string
  ) => {
    setCrewFeed(prev => [...prev, {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      type,
      message,
      details,
    }]);
  }, []);

  // Update homie status
  const updateHomie = useCallback((homieId: string, updates: Partial<CrewMember>) => {
    setGamePlan(prev => {
      if (!prev) return null;
      return {
        ...prev,
        parallelGroups: prev.parallelGroups.map(crew => ({
          ...crew,
          subtasks: crew.subtasks.map(homie =>
            homie.id === homieId ? { ...homie, ...updates } : homie
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
    
    // Started event - only process once per job
    if (event.runId && !stepId && !totalDuration && !eventError) {
      if (hasReceivedStartedRef.current) {
        return;
      }
      hasReceivedStartedRef.current = true;
      setCurrentRunId(event.runId);
      addToFeed('phase', 'Alright crew, we\'re in 🎯');
      setCurrentAction('Getting the lay of the land...');
      setPhase('casing');
      setProgress(5);
      return;
    }
    
    // Complete event
    if (totalDuration !== undefined) {
      setPhase('pulled_it_off');
      setProgress(100);
      setCurrentAction(undefined);
      addToFeed('success', 'Clean getaway! Job\'s done 🎉');
      setIsRunning(false);
      return;
    }
    
    // Error event
    if (eventError && !stepId) {
      setError(eventError);
      setPhase('got_caught');
      setCurrentAction(undefined);
      addToFeed('error', `Aw man, we hit a wall: ${eventError}`);
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
          addToFeed('phase', phaseConfig[newPhase]?.label);
        }
      } else if (eventError) {
        // step-error
        addToFeed('error', `Ran into trouble at ${stepId}`, eventError);
        setCurrentAction(undefined);
      } else {
        // step-complete
        setProgress(stepToProgress[stepId] ? stepToProgress[stepId] + 10 : 0);
        
        if (stepId === 'analyze-task' && result) {
          if (result.projectInfo) {
            setIntelReport(result.projectInfo);
            addToFeed('success', `Scoped it out: ${result.projectInfo.language} ${result.projectInfo.type}`);
          }
          if (result.relevantFiles?.length) {
            addToFeed('info', `Found ${result.relevantFiles.length} files we need to hit`);
          }
        }
        
        if (stepId === 'create-plan' && result?.plan) {
          setGamePlan(result.plan);
          const homieCount = result.plan.parallelGroups?.reduce(
            (sum: number, g: Crew) => sum + g.subtasks.length, 0
          ) || 0;
          addToFeed('success', `Game plan ready: ${homieCount} homies across ${result.plan.parallelGroups?.length || 0} crews`);
        }
        
        if (stepId === 'execute-plan' && result) {
          if (result.groupResults) {
            for (const crew of result.groupResults) {
              for (const homieResult of crew.subtaskResults) {
                updateHomie(homieResult.subtaskId, {
                  status: homieResult.status,
                  result: homieResult.result,
                  error: homieResult.error,
                  duration: homieResult.duration,
                  filesModified: homieResult.filesModified,
                });
                
                if (homieResult.status === 'completed') {
                  addToFeed('success', `${homieResult.subtaskId} came through! ✨`);
                } else if (homieResult.status === 'failed') {
                  addToFeed('error', `${homieResult.subtaskId} hit a snag`, homieResult.error);
                }
              }
            }
          }
          if (result.branchName) setBranchCreated(result.branchName);
          if (result.filesModified) setFilesModified(result.filesModified);
        }
        
        if (stepId === 'review-results' && result?.review) {
          setDebrief(result.review);
          addToFeed(
            result.review.overallSuccess ? 'success' : 'warning',
            result.review.summary
          );
        }
      }
    }
  }, [addToFeed, updateHomie]);

  // Start streaming when job begins
  useEffect(() => {
    if (!isRunning || !repoData?.repo.id || !submittedJob) {
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
            task: submittedJob.trim(),
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
        setPhase('got_caught');
        setCurrentAction(undefined);
        setIsRunning(false);
        addToFeed('error', `Lost connection: ${(err as Error).message}`);
      }
    };

    startStream();

    return () => {
      abortController.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, repoData?.repo.id, submittedJob, handleStreamEvent]);

  // Load existing run data when navigating to a run URL
  useEffect(() => {
    if (!existingRun) return;
    
    setSubmittedJob(existingRun.task);
    setCurrentRunId(existingRun.id);
    setStartTime(new Date(existingRun.startedAt));
    
    if (existingRun.plan) {
      setGamePlan(existingRun.plan);
    }
    if (existingRun.review) {
      setDebrief(existingRun.review);
    }
    if (existingRun.error) {
      setError(existingRun.error);
    }
    
    const statusToPhase: Record<string, HeistPhase> = {
      pending: 'casing',
      planning: 'scheming',
      executing: 'making_moves',
      reviewing: 'wrapping_up',
      completed: 'pulled_it_off',
      failed: 'got_caught',
    };
    setPhase(statusToPhase[existingRun.status] || 'chilling');
    
    if (['pending', 'planning', 'executing', 'reviewing'].includes(existingRun.status)) {
      setIsRunning(true);
      setCurrentAction('Catching up with the crew...');
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
            throw new Error(`Couldn't catch up: ${response.status}`);
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
            console.error('Stream error:', err);
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

  const handleStartJob = () => {
    if (!theJob.trim() || !repoData?.repo.id) return;
    
    setSubmittedJob(theJob.trim());
    setIsRunning(true);
    setPhase('casing');
    setProgress(0);
    setGamePlan(null);
    setDebrief(null);
    setIntelReport(null);
    setError(null);
    setCrewFeed([]);
    setBranchCreated(null);
    setFilesModified([]);
    setExpandedHomies(new Set());
    setCurrentAction('Rallying the crew...');
    setStartTime(new Date());
    hasReceivedStartedRef.current = false;
    
    addToFeed('phase', 'Let\'s get this bread 🍞');
  };

  const handleAbortJob = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsRunning(false);
    setPhase('got_caught');
    setCurrentAction(undefined);
    addToFeed('warning', 'Job called off. We\'ll get \'em next time.');
  };

  const handleRetryJob = () => {
    if (!submittedJob.trim() || !repoData?.repo.id) return;
    
    setIsRunning(true);
    setPhase('casing');
    setProgress(0);
    setGamePlan(null);
    setDebrief(null);
    setIntelReport(null);
    setError(null);
    setCrewFeed([]);
    setBranchCreated(null);
    setFilesModified([]);
    setExpandedHomies(new Set());
    setCurrentAction('Getting the crew back together...');
    setStartTime(new Date());
    hasReceivedStartedRef.current = false;
    
    addToFeed('phase', 'Round two, let\'s go! 💪');
  };

  const handleNewJob = () => {
    setTheJob('');
    setSubmittedJob('');
    setCurrentRunId(null);
    setIsRunning(false);
    setPhase('chilling');
    setProgress(0);
    setGamePlan(null);
    setDebrief(null);
    setIntelReport(null);
    setError(null);
    setCrewFeed([]);
    setBranchCreated(null);
    setFilesModified([]);
    setExpandedHomies(new Set());
    setCurrentAction(undefined);
    setStartTime(undefined);
    hasReceivedStartedRef.current = false;
    navigate(`/${owner}/${repo}/planning`);
  };

  const toggleHomie = (homieId: string) => {
    setExpandedHomies(prev => {
      const next = new Set(prev);
      if (next.has(homieId)) {
        next.delete(homieId);
      } else {
        next.add(homieId);
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

  const isChilling = phase === 'chilling';
  const isComplete = phase === 'pulled_it_off' || phase === 'got_caught';
  const showJob = isRunning || isComplete;

  return (
    <RepoLayout owner={owner!} repo={repo!} activeTab="planning">
      <div className="flex gap-6">
        {/* Left Sidebar - Past Jobs */}
        <div className="w-64 shrink-0 hidden lg:block">
          <div className="sticky top-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <History className="h-4 w-4" />
                Past Jobs
              </h3>
              {!isChilling && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 px-2"
                  onClick={handleNewJob}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            
            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-1 pr-4">
                {jobHistory?.map((job) => (
                  <Link
                    key={job.id}
                    to={`/${owner}/${repo}/planning/${job.id}`}
                    className={cn(
                      'block p-3 rounded-lg border transition-colors hover:bg-accent',
                      currentRunId === job.id && 'bg-accent border-primary'
                    )}
                  >
                    <p className="text-sm font-medium line-clamp-2 mb-1">
                      {job.task.length > 60 ? job.task.slice(0, 60) + '...' : job.task}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge 
                        variant={
                          job.status === 'completed' ? 'default' : 
                          job.status === 'failed' ? 'destructive' : 
                          'secondary'
                        }
                        className={cn(
                          "text-[10px] px-1.5 py-0",
                          job.status === 'completed' && 'bg-green-500'
                        )}
                      >
                        {job.status === 'completed' ? 'Scored' : 
                         job.status === 'failed' ? 'Busted' : job.status}
                      </Badge>
                      <span>
                        {new Date(job.startedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </Link>
                ))}
                
                {(!jobHistory || jobHistory.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No jobs yet
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
                isRunning ? 'bg-violet-500/10' : 'bg-primary/10'
              )}>
                <Glasses className={cn(
                  'h-6 w-6',
                  isRunning ? 'text-violet-500 animate-pulse' : 'text-primary'
                )} />
              </div>
              <div>
                <h1 className="text-2xl font-bold">The Crew</h1>
                <p className="text-sm text-muted-foreground">
                  Your AI homies ready to make moves
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
                  Crew's not ready yet
                </p>
                <p className="text-sm text-muted-foreground">
                  Hook up an API key in settings to get the crew online.
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
                  Can't find that job
                </p>
                <p className="text-sm text-muted-foreground">
                  Might've been cleaned up. Start a fresh one?
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleNewJob}>
                <Plus className="h-4 w-4 mr-1" />
                New Job
              </Button>
            </div>
          )}

          {/* Job Briefing - Shows the job & progress when active */}
          {showJob && submittedJob && (
            <JobBriefing
              theJob={submittedJob}
              phase={phase}
              progress={progress}
              onAbort={isRunning ? handleAbortJob : undefined}
              onRetry={isComplete ? handleRetryJob : undefined}
              onNewJob={isComplete ? handleNewJob : undefined}
              startTime={startTime}
            />
          )}

          {/* Job Input - Only shown when chilling */}
          {isChilling && (
            <div className="space-y-4 p-6 rounded-xl border-2 border-dashed bg-gradient-to-br from-card to-muted/20">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Gem className="h-4 w-4 text-violet-500" />
                  What's the job?
                </label>
                <MentionTextarea
                  placeholder="Tell the crew what we're doing... Use @ to point at specific files (e.g., 'Add JWT auth to the login flow')"
                  value={theJob}
                  onChange={setTheJob}
                  owner={owner!}
                  repo={repo!}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Extra context (optional)</label>
                <MentionTextarea
                  placeholder="Anything else the crew should know? Use @ to reference files"
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
                    Just scope it out (dry run)
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="createBranch"
                    checked={createBranch}
                    onCheckedChange={(checked) => setCreateBranch(checked as boolean)}
                  />
                  <label htmlFor="createBranch" className="text-sm cursor-pointer">
                    Work on a separate branch
                  </label>
                </div>
              </div>

              {/* Advanced Options */}
              <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 text-muted-foreground">
                    {showAdvanced ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    More options
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Custom branch name</label>
                    <Input
                      placeholder="feature/cool-stuff"
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
                  onClick={handleStartJob}
                  disabled={!theJob.trim() || !planningStatus?.available}
                  size="lg"
                  className="gap-2 bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white shadow-lg shadow-violet-500/25"
                >
                  <Rocket className="h-4 w-4" />
                  Let's Go
                </Button>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
              <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-red-600 dark:text-red-400">
                  {phase === 'got_caught' ? 'Things went sideways' : 'Uh oh'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
            </div>
          )}

          {/* Main Content - Two columns when job is active */}
          {showJob && (
            <div className="grid lg:grid-cols-5 gap-6">
              {/* Left: Crew Feed */}
              <div className="lg:col-span-2 space-y-4">
                <CrewFeed 
                  entries={crewFeed} 
                  currentAction={isRunning ? currentAction : undefined}
                />
                
                {/* Intel Report */}
                {intelReport && (
                  <div className="rounded-lg border bg-card p-4">
                    <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      What we found
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{intelReport.language}</Badge>
                      <Badge variant="secondary">{intelReport.type}</Badge>
                      {intelReport.hasTests && <Badge variant="outline">Has tests</Badge>}
                      {intelReport.hasLinting && <Badge variant="outline">Has linting</Badge>}
                    </div>
                  </div>
                )}

                {/* Loot Summary */}
                {isComplete && (
                  <LootSummary 
                    branchCreated={branchCreated} 
                    filesModified={filesModified} 
                  />
                )}
              </div>

              {/* Right: Game Plan / Debrief */}
              <div className="lg:col-span-3">
                {debrief ? (
                  <DebriefView report={debrief} />
                ) : gamePlan ? (
                  <GamePlanView
                    plan={gamePlan}
                    expandedHomies={expandedHomies}
                    onToggleHomie={toggleHomie}
                    phase={phase}
                  />
                ) : (
                  <div className="rounded-lg border bg-card p-12 text-center">
                    <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50 animate-pulse" />
                    <p className="text-muted-foreground">Cooking up a plan...</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty State */}
          {isChilling && !error && (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">
                The crew will scope out the codebase, put together a game plan, and get to work.
              </p>
            </div>
          )}
        </div>
      </div>
    </RepoLayout>
  );
}
