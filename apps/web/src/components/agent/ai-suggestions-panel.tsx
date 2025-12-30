/**
 * AI Suggestions Panel
 * 
 * A proactive AI assistant that analyzes code and provides
 * contextual suggestions, improvements, and insights.
 * 
 * Features:
 * - Real-time code analysis
 * - Performance suggestions
 * - Security warnings
 * - Best practices
 * - One-click fixes
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Sparkles,
  Lightbulb,
  AlertTriangle,
  Shield,
  Zap,
  Bug,
  CheckCircle,
  XCircle,
  ChevronRight,
  ChevronDown,
  Play,
  X,
  RefreshCw,
  Filter,
  Settings2,
  Eye,
  EyeOff,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type SuggestionSeverity = 'info' | 'warning' | 'error' | 'success';
export type SuggestionCategory = 
  | 'performance'
  | 'security'
  | 'best-practice'
  | 'bug'
  | 'accessibility'
  | 'style'
  | 'documentation'
  | 'refactoring';

export interface Suggestion {
  id: string;
  title: string;
  description: string;
  category: SuggestionCategory;
  severity: SuggestionSeverity;
  filePath: string;
  lineNumber?: number;
  code?: string;
  suggestedFix?: string;
  explanation?: string;
  learnMoreUrl?: string;
  isApplied?: boolean;
  isDismissed?: boolean;
  confidence: number; // 0-100
}

export interface SuggestionGroup {
  category: SuggestionCategory;
  suggestions: Suggestion[];
  isExpanded: boolean;
}

const CATEGORY_CONFIG: Record<SuggestionCategory, { 
  label: string; 
  icon: React.ReactNode;
  color: string;
}> = {
  performance: { 
    label: 'Performance', 
    icon: <Zap className="h-4 w-4" />,
    color: 'text-yellow-500'
  },
  security: { 
    label: 'Security', 
    icon: <Shield className="h-4 w-4" />,
    color: 'text-red-500'
  },
  'best-practice': { 
    label: 'Best Practices', 
    icon: <CheckCircle className="h-4 w-4" />,
    color: 'text-blue-500'
  },
  bug: { 
    label: 'Potential Bugs', 
    icon: <Bug className="h-4 w-4" />,
    color: 'text-orange-500'
  },
  accessibility: { 
    label: 'Accessibility', 
    icon: <Eye className="h-4 w-4" />,
    color: 'text-purple-500'
  },
  style: { 
    label: 'Code Style', 
    icon: <Settings2 className="h-4 w-4" />,
    color: 'text-gray-500'
  },
  documentation: { 
    label: 'Documentation', 
    icon: <Lightbulb className="h-4 w-4" />,
    color: 'text-cyan-500'
  },
  refactoring: { 
    label: 'Refactoring', 
    icon: <RefreshCw className="h-4 w-4" />,
    color: 'text-green-500'
  },
};

const SEVERITY_CONFIG: Record<SuggestionSeverity, { 
  label: string;
  color: string;
  bgColor: string;
}> = {
  info: { label: 'Info', color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  warning: { label: 'Warning', color: 'text-yellow-500', bgColor: 'bg-yellow-500/10' },
  error: { label: 'Error', color: 'text-red-500', bgColor: 'bg-red-500/10' },
  success: { label: 'Good', color: 'text-green-500', bgColor: 'bg-green-500/10' },
};

interface AISuggestionsPanelProps {
  suggestions: Suggestion[];
  isAnalyzing: boolean;
  currentFile?: string;
  onApplySuggestion: (suggestion: Suggestion) => Promise<void>;
  onDismissSuggestion: (id: string) => void;
  onFeedback: (id: string, helpful: boolean) => void;
  onGoToLine: (filePath: string, line: number) => void;
  onRefresh: () => void;
  className?: string;
}

export function AISuggestionsPanel({
  suggestions,
  isAnalyzing,
  currentFile,
  onApplySuggestion,
  onDismissSuggestion,
  onFeedback,
  onGoToLine,
  onRefresh,
  className,
}: AISuggestionsPanelProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<SuggestionCategory>>(
    new Set(['security', 'bug', 'performance'])
  );
  const [showDismissed, setShowDismissed] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<SuggestionSeverity | 'all'>('all');
  const [applyingId, setApplyingId] = useState<string | null>(null);

  // Filter suggestions
  const filteredSuggestions = useMemo(() => {
    return suggestions.filter(s => {
      if (!showDismissed && s.isDismissed) return false;
      if (filterSeverity !== 'all' && s.severity !== filterSeverity) return false;
      return true;
    });
  }, [suggestions, showDismissed, filterSeverity]);

  // Group by category
  const groupedSuggestions = useMemo(() => {
    const groups: Record<SuggestionCategory, Suggestion[]> = {
      security: [],
      bug: [],
      performance: [],
      'best-practice': [],
      accessibility: [],
      documentation: [],
      refactoring: [],
      style: [],
    };

    filteredSuggestions.forEach(s => {
      groups[s.category].push(s);
    });

    // Sort each group by severity then confidence
    Object.values(groups).forEach(group => {
      group.sort((a, b) => {
        const severityOrder = { error: 0, warning: 1, info: 2, success: 3 };
        const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
        if (severityDiff !== 0) return severityDiff;
        return b.confidence - a.confidence;
      });
    });

    return groups;
  }, [filteredSuggestions]);

  const toggleCategory = useCallback((category: SuggestionCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const handleApply = useCallback(async (suggestion: Suggestion) => {
    setApplyingId(suggestion.id);
    try {
      await onApplySuggestion(suggestion);
    } finally {
      setApplyingId(null);
    }
  }, [onApplySuggestion]);

  const totalCount = filteredSuggestions.length;
  const errorCount = filteredSuggestions.filter(s => s.severity === 'error').length;
  const warningCount = filteredSuggestions.filter(s => s.severity === 'warning').length;

  // Calculate health score
  const healthScore = useMemo(() => {
    if (suggestions.length === 0) return 100;
    const errorWeight = 10;
    const warningWeight = 3;
    const infoWeight = 1;
    
    const totalPenalty = suggestions.reduce((acc, s) => {
      if (s.isDismissed || s.isApplied) return acc;
      switch (s.severity) {
        case 'error': return acc + errorWeight;
        case 'warning': return acc + warningWeight;
        case 'info': return acc + infoWeight;
        default: return acc;
      }
    }, 0);
    
    return Math.max(0, 100 - totalPenalty);
  }, [suggestions]);

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          <span className="font-medium text-sm">AI Suggestions</span>
          {totalCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {totalCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setShowDismissed(!showDismissed)}
                >
                  {showDismissed ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showDismissed ? 'Hide dismissed' : 'Show dismissed'}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onRefresh}
                  disabled={isAnalyzing}
                >
                  <RefreshCw className={cn('h-4 w-4', isAnalyzing && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh analysis</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Health Score */}
      <div className="px-3 py-2 border-b">
        <div className="flex items-center justify-between text-sm mb-1.5">
          <span className="text-muted-foreground">Code Health</span>
          <span className={cn(
            'font-medium',
            healthScore >= 80 ? 'text-green-500' :
            healthScore >= 60 ? 'text-yellow-500' :
            'text-red-500'
          )}>
            {healthScore}%
          </span>
        </div>
        <Progress 
          value={healthScore} 
          className={cn(
            'h-1.5',
            healthScore >= 80 ? '[&>div]:bg-green-500' :
            healthScore >= 60 ? '[&>div]:bg-yellow-500' :
            '[&>div]:bg-red-500'
          )}
        />
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-red-500">
              <XCircle className="h-3 w-3" />
              {errorCount} errors
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-1 text-yellow-500">
              <AlertTriangle className="h-3 w-3" />
              {warningCount} warnings
            </span>
          )}
          {errorCount === 0 && warningCount === 0 && (
            <span className="flex items-center gap-1 text-green-500">
              <CheckCircle className="h-3 w-3" />
              Looking good!
            </span>
          )}
        </div>
      </div>

      {/* Current File */}
      {currentFile && (
        <div className="px-3 py-2 border-b text-xs text-muted-foreground truncate">
          Analyzing: {currentFile}
        </div>
      )}

      {/* Suggestions List */}
      <ScrollArea className="flex-1">
        {isAnalyzing && suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <RefreshCw className="h-8 w-8 text-purple-500 animate-spin mb-3" />
            <p className="text-sm font-medium">Analyzing code...</p>
            <p className="text-xs text-muted-foreground">Looking for improvements</p>
          </div>
        ) : totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <CheckCircle className="h-8 w-8 text-green-500 mb-3" />
            <p className="text-sm font-medium">No suggestions</p>
            <p className="text-xs text-muted-foreground text-center">
              Your code looks great! No improvements needed.
            </p>
          </div>
        ) : (
          <div className="py-2">
            {Object.entries(groupedSuggestions).map(([category, items]) => {
              if (items.length === 0) return null;
              const config = CATEGORY_CONFIG[category as SuggestionCategory];
              const isExpanded = expandedCategories.has(category as SuggestionCategory);

              return (
                <Collapsible
                  key={category}
                  open={isExpanded}
                  onOpenChange={() => toggleCategory(category as SuggestionCategory)}
                >
                  <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between px-3 py-2 hover:bg-muted/50">
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className={cn('', config.color)}>
                          {config.icon}
                        </span>
                        <span className="text-sm font-medium">{config.label}</span>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {items.length}
                      </Badge>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="pl-4 pr-2 space-y-1">
                      {items.map((suggestion) => (
                        <SuggestionCard
                          key={suggestion.id}
                          suggestion={suggestion}
                          isApplying={applyingId === suggestion.id}
                          onApply={() => handleApply(suggestion)}
                          onDismiss={() => onDismissSuggestion(suggestion.id)}
                          onFeedback={(helpful) => onFeedback(suggestion.id, helpful)}
                          onGoToLine={() => {
                            if (suggestion.lineNumber) {
                              onGoToLine(suggestion.filePath, suggestion.lineNumber);
                            }
                          }}
                        />
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-2 border-t text-xs text-muted-foreground">
        <span>Powered by AI analysis</span>
        <span>{filteredSuggestions.filter(s => s.isApplied).length} applied</span>
      </div>
    </div>
  );
}

interface SuggestionCardProps {
  suggestion: Suggestion;
  isApplying: boolean;
  onApply: () => void;
  onDismiss: () => void;
  onFeedback: (helpful: boolean) => void;
  onGoToLine: () => void;
}

function SuggestionCard({
  suggestion,
  isApplying,
  onApply,
  onDismiss,
  onFeedback,
  onGoToLine,
}: SuggestionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const severityConfig = SEVERITY_CONFIG[suggestion.severity];

  return (
    <div
      className={cn(
        'rounded-lg border p-2.5 mb-1.5',
        suggestion.isDismissed && 'opacity-50',
        suggestion.isApplied && 'border-green-500/30 bg-green-500/5'
      )}
    >
      <div className="flex items-start gap-2">
        <div className={cn('mt-0.5', severityConfig.color)}>
          {suggestion.severity === 'error' ? <XCircle className="h-4 w-4" /> :
           suggestion.severity === 'warning' ? <AlertTriangle className="h-4 w-4" /> :
           suggestion.severity === 'success' ? <CheckCircle className="h-4 w-4" /> :
           <Lightbulb className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate">{suggestion.title}</p>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
              {suggestion.confidence}%
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {suggestion.description}
          </p>
          
          {suggestion.lineNumber && (
            <button
              className="text-xs text-purple-500 hover:underline mt-1"
              onClick={onGoToLine}
            >
              Line {suggestion.lineNumber}
            </button>
          )}

          {/* Expandable details */}
          {(suggestion.explanation || suggestion.suggestedFix) && (
            <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
              <CollapsibleTrigger className="text-xs text-muted-foreground hover:text-foreground mt-1.5 flex items-center gap-1">
                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {isExpanded ? 'Less' : 'More'}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 space-y-2">
                  {suggestion.explanation && (
                    <p className="text-xs text-muted-foreground">
                      {suggestion.explanation}
                    </p>
                  )}
                  {suggestion.suggestedFix && (
                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                      <code>{suggestion.suggestedFix}</code>
                    </pre>
                  )}
                  {suggestion.learnMoreUrl && (
                    <a
                      href={suggestion.learnMoreUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-purple-500 hover:underline flex items-center gap-1"
                    >
                      Learn more <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1">
              {suggestion.suggestedFix && !suggestion.isApplied && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs px-2"
                  onClick={onApply}
                  disabled={isApplying}
                >
                  {isApplying ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <Play className="h-3 w-3 mr-1" />
                      Apply
                    </>
                  )}
                </Button>
              )}
              {suggestion.isApplied && (
                <span className="text-xs text-green-500 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Applied
                </span>
              )}
              {!suggestion.isDismissed && !suggestion.isApplied && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs px-2"
                  onClick={onDismiss}
                >
                  <X className="h-3 w-3 mr-1" />
                  Dismiss
                </Button>
              )}
            </div>
            <div className="flex items-center gap-0.5">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => onFeedback(true)}
                    >
                      <ThumbsUp className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Helpful</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => onFeedback(false)}
                    >
                      <ThumbsDown className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Not helpful</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook for managing AI suggestions
 */
export function useAISuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const analyze = useCallback(async (code: string, filePath: string) => {
    setIsAnalyzing(true);
    
    try {
      // This would call the AI API in a real implementation
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Mock suggestions for demo
      const mockSuggestions: Suggestion[] = [
        {
          id: '1',
          title: 'Consider using optional chaining',
          description: 'Replace nested property access with optional chaining for safety.',
          category: 'best-practice',
          severity: 'info',
          filePath,
          lineNumber: 15,
          confidence: 92,
          suggestedFix: 'user?.profile?.name',
        },
      ];
      
      setSuggestions(mockSuggestions);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const applySuggestion = useCallback(async (suggestion: Suggestion) => {
    // Apply the suggestion
    await new Promise(resolve => setTimeout(resolve, 500));
    
    setSuggestions(prev =>
      prev.map(s => s.id === suggestion.id ? { ...s, isApplied: true } : s)
    );
  }, []);

  const dismissSuggestion = useCallback((id: string) => {
    setSuggestions(prev =>
      prev.map(s => s.id === id ? { ...s, isDismissed: true } : s)
    );
  }, []);

  return {
    suggestions,
    isAnalyzing,
    analyze,
    applySuggestion,
    dismissSuggestion,
    setSuggestions,
  };
}
