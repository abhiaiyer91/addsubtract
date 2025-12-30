import { useState, useCallback } from 'react';
import {
  Zap,
  Pause,
  Play,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  Sparkles,
  Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type AutonomyLevel = 'off' | 'suggest' | 'ask' | 'auto';

export interface AgenticModeConfig {
  enabled: boolean;
  autonomyLevel: AutonomyLevel;
  allowFileCreation: boolean;
  allowFileDeletion: boolean;
  allowCommandExecution: boolean;
  allowGitOperations: boolean;
  requireApprovalForSensitive: boolean;
  showToolCalls: boolean;
  maxActionsPerTurn: number;
}

const DEFAULT_CONFIG: AgenticModeConfig = {
  enabled: false,
  autonomyLevel: 'ask',
  allowFileCreation: true,
  allowFileDeletion: false,
  allowCommandExecution: true,
  allowGitOperations: false,
  requireApprovalForSensitive: true,
  showToolCalls: true,
  maxActionsPerTurn: 10,
};

const AUTONOMY_LEVELS: Record<AutonomyLevel, { label: string; description: string; icon: React.ElementType; color: string }> = {
  off: {
    label: 'Off',
    description: 'Agent will only suggest, not act',
    icon: EyeOff,
    color: 'text-zinc-500',
  },
  suggest: {
    label: 'Suggest',
    description: 'Agent suggests actions, you execute',
    icon: Eye,
    color: 'text-blue-400',
  },
  ask: {
    label: 'Ask First',
    description: 'Agent asks before each action',
    icon: Shield,
    color: 'text-amber-400',
  },
  auto: {
    label: 'Autonomous',
    description: 'Agent executes without asking',
    icon: Zap,
    color: 'text-emerald-400',
  },
};

interface AgenticModeToggleProps {
  config: AgenticModeConfig;
  onConfigChange: (config: AgenticModeConfig) => void;
  isExecuting?: boolean;
  onPause?: () => void;
  onResume?: () => void;
}

export function AgenticModeToggle({
  config,
  onConfigChange,
  isExecuting,
  onPause,
  onResume,
}: AgenticModeToggleProps) {
  const level = AUTONOMY_LEVELS[config.autonomyLevel];
  const LevelIcon = level.icon;

  const handleAutonomyChange = (newLevel: AutonomyLevel) => {
    onConfigChange({
      ...config,
      enabled: newLevel !== 'off',
      autonomyLevel: newLevel,
    });
  };

  return (
    <div className="flex items-center gap-2">
      {/* Main toggle */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={config.enabled ? 'default' : 'outline'}
            size="sm"
            className={cn(
              "h-8 gap-2",
              config.enabled && "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500"
            )}
          >
            {isExecuting ? (
              <>
                <div className="relative">
                  <Bot className="h-4 w-4" />
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                </div>
                <span className="text-xs">Running</span>
              </>
            ) : (
              <>
                <LevelIcon className={cn("h-4 w-4", !config.enabled && level.color)} />
                <span className="text-xs">{level.label}</span>
              </>
            )}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs text-zinc-500">
            Agent Autonomy Level
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {(Object.keys(AUTONOMY_LEVELS) as AutonomyLevel[]).map((lvl) => {
            const levelConfig = AUTONOMY_LEVELS[lvl];
            const Icon = levelConfig.icon;
            return (
              <DropdownMenuItem
                key={lvl}
                onClick={() => handleAutonomyChange(lvl)}
                className={cn(
                  "gap-3",
                  config.autonomyLevel === lvl && "bg-zinc-800"
                )}
              >
                <Icon className={cn("h-4 w-4", levelConfig.color)} />
                <div className="flex-1">
                  <div className="font-medium text-sm">{levelConfig.label}</div>
                  <div className="text-xs text-zinc-500">{levelConfig.description}</div>
                </div>
                {config.autonomyLevel === lvl && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                )}
              </DropdownMenuItem>
            );
          })}
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem className="gap-2 opacity-50" disabled>
            <Settings2 className="h-4 w-4 text-zinc-500" />
            <span>Advanced Settings (coming soon)</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      
      {/* Pause/Resume button when executing */}
      {isExecuting && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onPause || onResume}
                className="h-8 w-8"
              >
                {onPause ? (
                  <Pause className="h-4 w-4 text-amber-400" />
                ) : (
                  <Play className="h-4 w-4 text-emerald-400" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {onPause ? 'Pause agent' : 'Resume agent'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
      
      {/* Settings modal would go here */}
    </div>
  );
}

/**
 * Compact status indicator for the agent
 */
export function AgentStatusIndicator({
  status,
  message,
}: {
  status: 'idle' | 'thinking' | 'executing' | 'waiting' | 'error';
  message?: string;
}) {
  const configs = {
    idle: { icon: Bot, color: 'text-zinc-500', bg: 'bg-zinc-800', label: 'Ready' },
    thinking: { icon: Sparkles, color: 'text-purple-400', bg: 'bg-purple-500/10', label: 'Thinking...' },
    executing: { icon: Zap, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Executing...' },
    waiting: { icon: Shield, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Waiting for approval' },
    error: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Error' },
  };
  
  const config = configs[status];
  const Icon = config.icon;

  return (
    <div className={cn(
      "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs",
      config.bg, config.color
    )}>
      <Icon className={cn(
        "h-3.5 w-3.5",
        status === 'thinking' && "animate-pulse",
        status === 'executing' && "animate-bounce"
      )} />
      <span>{message || config.label}</span>
    </div>
  );
}

/**
 * Permission request dialog
 */
export function PermissionRequest({
  action,
  description,
  risk,
  onApprove,
  onDeny,
  onAlwaysAllow,
}: {
  action: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  onApprove: () => void;
  onDeny: () => void;
  onAlwaysAllow?: () => void;
}) {
  const riskConfig = {
    low: { icon: ShieldCheck, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
    medium: { icon: Shield, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
    high: { icon: ShieldAlert, color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  };
  
  const config = riskConfig[risk];
  const Icon = config.icon;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center border", config.color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-medium text-zinc-200">Permission Required</h4>
          <p className="text-sm text-zinc-400 mt-0.5">{action}</p>
          {description && (
            <p className="text-xs text-zinc-500 mt-1">{description}</p>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-2 justify-end">
        {onAlwaysAllow && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onAlwaysAllow}
            className="text-xs text-zinc-500"
          >
            Always allow
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onDeny}
          className="text-xs text-red-400 hover:text-red-300"
        >
          <XCircle className="h-3.5 w-3.5 mr-1" />
          Deny
        </Button>
        <Button
          size="sm"
          onClick={onApprove}
          className="text-xs bg-emerald-600 hover:bg-emerald-500"
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
          Allow
        </Button>
      </div>
    </div>
  );
}

/**
 * Hook to manage agentic mode state
 */
export function useAgenticMode(initialConfig?: Partial<AgenticModeConfig>) {
  const [config, setConfig] = useState<AgenticModeConfig>({
    ...DEFAULT_CONFIG,
    ...initialConfig,
  });
  const [isExecuting, setIsExecuting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  const updateConfig = useCallback((updates: Partial<AgenticModeConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);
  
  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);
  
  const resume = useCallback(() => {
    setIsPaused(false);
  }, []);
  
  const startExecution = useCallback(() => {
    setIsExecuting(true);
    setIsPaused(false);
  }, []);
  
  const stopExecution = useCallback(() => {
    setIsExecuting(false);
    setIsPaused(false);
  }, []);
  
  const shouldAskPermission = useCallback((actionType: string): boolean => {
    if (!config.enabled) return true;
    if (config.autonomyLevel === 'off') return true;
    if (config.autonomyLevel === 'suggest') return true;
    if (config.autonomyLevel === 'auto') {
      // Still ask for sensitive operations
      if (config.requireApprovalForSensitive) {
        const sensitiveOps = ['delete', 'git-push', 'deploy'];
        if (sensitiveOps.some(op => actionType.includes(op))) {
          return true;
        }
      }
      return false;
    }
    // 'ask' mode
    return true;
  }, [config]);
  
  return {
    config,
    setConfig,
    updateConfig,
    isExecuting,
    isPaused,
    pause,
    resume,
    startExecution,
    stopExecution,
    shouldAskPermission,
  };
}
