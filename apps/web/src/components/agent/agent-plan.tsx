import { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Circle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  Sparkles,
  FileCode,
  GitBranch,
  Terminal,
  Search,
  FileEdit,
  Trash2,
  FolderOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

export interface PlanStep {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  type: 'analyze' | 'create' | 'edit' | 'delete' | 'command' | 'git' | 'search' | 'other';
  output?: string;
  error?: string;
  duration?: number;
  children?: PlanStep[];
}

export interface AgentPlan {
  id: string;
  title: string;
  description: string;
  steps: PlanStep[];
  status: 'planning' | 'executing' | 'paused' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
}

interface AgentPlanProps {
  plan: AgentPlan | null;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
  onModifyPlan?: () => void;
}

const STEP_ICONS: Record<PlanStep['type'], React.ElementType> = {
  analyze: Search,
  create: FileCode,
  edit: FileEdit,
  delete: Trash2,
  command: Terminal,
  git: GitBranch,
  search: FolderOpen,
  other: Sparkles,
};

function PlanStepItem({ step, depth = 0 }: { step: PlanStep; depth?: number }) {
  const [expanded, setExpanded] = useState(step.status === 'in_progress' || step.status === 'failed');
  const Icon = STEP_ICONS[step.type];
  const hasChildren = step.children && step.children.length > 0;

  const statusIcon = () => {
    switch (step.status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
      case 'in_progress':
        return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-400" />;
      case 'skipped':
        return <Circle className="h-4 w-4 text-zinc-600" />;
      default:
        return <Circle className="h-4 w-4 text-zinc-500" />;
    }
  };

  return (
    <div className={cn("relative", depth > 0 && "ml-4")}>
      {/* Connection line */}
      {depth > 0 && (
        <div className="absolute left-0 top-0 bottom-0 w-px bg-zinc-800 -ml-2" />
      )}
      
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className={cn(
          "flex items-start gap-2 w-full text-left py-1.5 px-2 rounded-md",
          "hover:bg-zinc-800/50 transition-colors",
          step.status === 'in_progress' && "bg-blue-500/5",
          step.status === 'failed' && "bg-red-500/5",
          !hasChildren && "cursor-default"
        )}
      >
        {/* Expand/collapse indicator */}
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="h-4 w-4 text-zinc-500 mt-0.5 flex-shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-zinc-500 mt-0.5 flex-shrink-0" />
          )
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}
        
        {/* Status icon */}
        <span className="mt-0.5 flex-shrink-0">{statusIcon()}</span>
        
        {/* Step type icon */}
        <span className="mt-0.5 flex-shrink-0">
          <Icon className={cn(
            "h-4 w-4",
            step.status === 'completed' && "text-zinc-400",
            step.status === 'in_progress' && "text-blue-400",
            step.status === 'failed' && "text-red-400",
            step.status === 'pending' && "text-zinc-500",
            step.status === 'skipped' && "text-zinc-600"
          )} />
        </span>
        
        {/* Step content */}
        <div className="flex-1 min-w-0">
          <div className={cn(
            "text-sm",
            step.status === 'completed' && "text-zinc-400",
            step.status === 'in_progress' && "text-zinc-200",
            step.status === 'failed' && "text-red-300",
            step.status === 'pending' && "text-zinc-500",
            step.status === 'skipped' && "text-zinc-600 line-through"
          )}>
            {step.title}
          </div>
          {step.description && step.status !== 'completed' && (
            <div className="text-xs text-zinc-600 mt-0.5">{step.description}</div>
          )}
          {step.duration !== undefined && step.status === 'completed' && (
            <div className="text-xs text-zinc-600">{step.duration}ms</div>
          )}
        </div>
      </button>
      
      {/* Error message */}
      {step.error && step.status === 'failed' && (
        <div className="ml-14 mt-1 p-2 rounded bg-red-500/10 border border-red-500/20">
          <p className="text-xs text-red-400 font-mono">{step.error}</p>
        </div>
      )}
      
      {/* Output */}
      {step.output && expanded && (
        <div className="ml-14 mt-1 p-2 rounded bg-zinc-800/50 border border-zinc-800">
          <pre className="text-xs text-zinc-400 font-mono whitespace-pre-wrap">{step.output}</pre>
        </div>
      )}
      
      {/* Children */}
      {hasChildren && expanded && (
        <div className="mt-1">
          {step.children!.map((child) => (
            <PlanStepItem key={child.id} step={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentPlanVisualization({
  plan,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onModifyPlan,
}: AgentPlanProps) {
  const [elapsedTime, setElapsedTime] = useState(0);

  // Track elapsed time
  useEffect(() => {
    if (plan?.status === 'executing' && plan.startedAt) {
      const interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - plan.startedAt!.getTime()) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [plan?.status, plan?.startedAt]);

  if (!plan) return null;

  const completedSteps = plan.steps.filter(s => s.status === 'completed').length;
  const totalSteps = plan.steps.length;
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center",
            plan.status === 'executing' && "bg-blue-500/20",
            plan.status === 'completed' && "bg-emerald-500/20",
            plan.status === 'failed' && "bg-red-500/20",
            plan.status === 'paused' && "bg-amber-500/20",
            plan.status === 'planning' && "bg-purple-500/20"
          )}>
            {plan.status === 'executing' && <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />}
            {plan.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
            {plan.status === 'failed' && <XCircle className="h-4 w-4 text-red-400" />}
            {plan.status === 'paused' && <Pause className="h-4 w-4 text-amber-400" />}
            {plan.status === 'planning' && <Sparkles className="h-4 w-4 text-purple-400 animate-pulse" />}
          </div>
          <div>
            <h3 className="text-sm font-medium text-zinc-200">{plan.title}</h3>
            <p className="text-xs text-zinc-500">{plan.description}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Time elapsed */}
          {plan.status === 'executing' && (
            <span className="text-xs text-zinc-500">{formatTime(elapsedTime)}</span>
          )}
          
          {/* Control buttons */}
          {plan.status === 'executing' && onPause && (
            <Button variant="ghost" size="sm" onClick={onPause} className="h-7 px-2">
              <Pause className="h-3.5 w-3.5" />
            </Button>
          )}
          {plan.status === 'paused' && onResume && (
            <Button variant="ghost" size="sm" onClick={onResume} className="h-7 px-2">
              <Play className="h-3.5 w-3.5" />
            </Button>
          )}
          {plan.status === 'failed' && onRetry && (
            <Button variant="ghost" size="sm" onClick={onRetry} className="h-7 px-2 text-amber-400">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
          {(plan.status === 'executing' || plan.status === 'paused') && onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} className="h-7 px-2 text-red-400">
              <XCircle className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      
      {/* Progress bar */}
      {plan.status !== 'planning' && (
        <div className="px-4 py-2 border-b border-zinc-800/50">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-zinc-500">
              {completedSteps} of {totalSteps} steps
            </span>
            <span className="text-xs text-zinc-500">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-1" />
        </div>
      )}
      
      {/* Steps */}
      <div className="p-3 max-h-64 overflow-y-auto">
        {plan.status === 'planning' ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Creating execution plan...</span>
          </div>
        ) : (
          <div className="space-y-0.5">
            {plan.steps.map((step) => (
              <PlanStepItem key={step.id} step={step} />
            ))}
          </div>
        )}
      </div>
      
      {/* Footer with modify button */}
      {(plan.status === 'planning' || plan.status === 'paused') && onModifyPlan && (
        <div className="px-4 py-2 border-t border-zinc-800/50 bg-zinc-900/80">
          <Button variant="ghost" size="sm" onClick={onModifyPlan} className="text-xs">
            Modify plan
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Hook to manage agent plan state
 */
export function useAgentPlan() {
  const [plan, setPlan] = useState<AgentPlan | null>(null);

  const startPlan = (title: string, description: string, steps: Omit<PlanStep, 'status'>[]) => {
    setPlan({
      id: `plan-${Date.now()}`,
      title,
      description,
      steps: steps.map(s => ({ ...s, status: 'pending' as const })),
      status: 'executing',
      startedAt: new Date(),
    });
  };

  const updateStep = (stepId: string, updates: Partial<PlanStep>) => {
    setPlan(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        steps: prev.steps.map(s => 
          s.id === stepId ? { ...s, ...updates } : s
        ),
      };
    });
  };

  const completeStep = (stepId: string, output?: string, duration?: number) => {
    updateStep(stepId, { status: 'completed', output, duration });
  };

  const failStep = (stepId: string, error: string) => {
    updateStep(stepId, { status: 'failed', error });
    setPlan(prev => prev ? { ...prev, status: 'failed' } : prev);
  };

  const startStep = (stepId: string) => {
    updateStep(stepId, { status: 'in_progress' });
  };

  const pausePlan = () => {
    setPlan(prev => prev ? { ...prev, status: 'paused' } : prev);
  };

  const resumePlan = () => {
    setPlan(prev => prev ? { ...prev, status: 'executing' } : prev);
  };

  const completePlan = () => {
    setPlan(prev => prev ? { ...prev, status: 'completed', completedAt: new Date() } : prev);
  };

  const clearPlan = () => {
    setPlan(null);
  };

  return {
    plan,
    startPlan,
    updateStep,
    completeStep,
    failStep,
    startStep,
    pausePlan,
    resumePlan,
    completePlan,
    clearPlan,
  };
}
