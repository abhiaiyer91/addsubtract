/**
 * Multi-File Refactoring Component
 * 
 * Enables AI-powered refactoring across multiple files simultaneously.
 * Features:
 * - Visual preview of all changes
 * - Accept/reject individual file changes
 * - Rollback support
 * - Progress tracking
 */

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  FileCode,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  Loader2,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Undo2,
  CheckCircle2,
  XCircle,
  Folder,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface FileChange {
  id: string;
  filePath: string;
  changeType: 'create' | 'modify' | 'delete' | 'rename';
  description: string;
  before?: string;
  after?: string;
  renameTo?: string;
  hunks?: DiffHunk[];
  status: 'pending' | 'accepted' | 'rejected' | 'applied' | 'error';
  error?: string;
}

export interface DiffHunk {
  startLine: number;
  endLine: number;
  before: string;
  after: string;
}

export interface RefactorPlan {
  id: string;
  title: string;
  description: string;
  files: FileChange[];
  status: 'planning' | 'ready' | 'applying' | 'completed' | 'partial' | 'error';
  progress: number;
  createdAt: Date;
}

interface MultiFileRefactorProps {
  plan: RefactorPlan;
  onAcceptFile: (fileId: string) => void;
  onRejectFile: (fileId: string) => void;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onApply: () => Promise<void>;
  onRollback: () => Promise<void>;
  onViewFile: (filePath: string) => void;
  className?: string;
}

export function MultiFileRefactor({
  plan,
  onAcceptFile,
  onRejectFile,
  onAcceptAll,
  onRejectAll,
  onApply,
  onRollback,
  onViewFile,
  className,
}: MultiFileRefactorProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [showDiff, setShowDiff] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);

  const toggleFile = useCallback((fileId: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  }, []);

  const acceptedCount = plan.files.filter(f => f.status === 'accepted').length;
  const rejectedCount = plan.files.filter(f => f.status === 'rejected').length;
  const pendingCount = plan.files.filter(f => f.status === 'pending').length;
  const appliedCount = plan.files.filter(f => f.status === 'applied').length;

  const handleApply = useCallback(async () => {
    setIsApplying(true);
    try {
      await onApply();
    } finally {
      setIsApplying(false);
    }
  }, [onApply]);

  const handleRollback = useCallback(async () => {
    setIsRollingBack(true);
    try {
      await onRollback();
    } finally {
      setIsRollingBack(false);
    }
  }, [onRollback]);

  const getChangeTypeColor = (type: FileChange['changeType']) => {
    switch (type) {
      case 'create': return 'text-green-500';
      case 'modify': return 'text-yellow-500';
      case 'delete': return 'text-red-500';
      case 'rename': return 'text-blue-500';
      default: return 'text-muted-foreground';
    }
  };

  const getChangeTypeLabel = (type: FileChange['changeType']) => {
    switch (type) {
      case 'create': return 'New';
      case 'modify': return 'Modified';
      case 'delete': return 'Deleted';
      case 'rename': return 'Renamed';
      default: return type;
    }
  };

  const getStatusIcon = (status: FileChange['status']) => {
    switch (status) {
      case 'accepted': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'rejected': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'applied': return <Check className="h-4 w-4 text-green-500" />;
      case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return null;
    }
  };

  // Group files by directory
  const filesByDirectory = plan.files.reduce((acc, file) => {
    const parts = file.filePath.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '/';
    if (!acc[dir]) acc[dir] = [];
    acc[dir].push(file);
    return acc;
  }, {} as Record<string, FileChange[]>);

  return (
    <div className={cn('flex flex-col bg-background border rounded-lg', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="space-y-1">
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-purple-500" />
            {plan.title}
          </h3>
          <p className="text-sm text-muted-foreground">{plan.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowDiff(!showDiff)}
                >
                  {showDiff ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {showDiff ? 'Hide diffs' : 'Show diffs'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Progress */}
      {(plan.status === 'applying' || plan.status === 'completed') && (
        <div className="px-4 py-2 border-b">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-muted-foreground">
              {plan.status === 'applying' ? 'Applying changes...' : 'Changes applied'}
            </span>
            <span className="font-medium">{plan.progress}%</span>
          </div>
          <Progress value={plan.progress} className="h-1.5" />
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 px-4 py-2 border-b text-sm">
        <span className="flex items-center gap-1">
          <span className="text-muted-foreground">Files:</span>
          <span className="font-medium">{plan.files.length}</span>
        </span>
        <span className="flex items-center gap-1 text-green-500">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {acceptedCount}
        </span>
        <span className="flex items-center gap-1 text-red-500">
          <XCircle className="h-3.5 w-3.5" />
          {rejectedCount}
        </span>
        <span className="flex items-center gap-1 text-muted-foreground">
          <span>Pending:</span>
          {pendingCount}
        </span>
        {appliedCount > 0 && (
          <span className="flex items-center gap-1 text-purple-500">
            <Check className="h-3.5 w-3.5" />
            Applied: {appliedCount}
          </span>
        )}
      </div>

      {/* File List */}
      <ScrollArea className="flex-1 max-h-[400px]">
        <div className="p-2 space-y-1">
          {Object.entries(filesByDirectory).map(([dir, files]) => (
            <div key={dir} className="space-y-1">
              {/* Directory Header */}
              {Object.keys(filesByDirectory).length > 1 && (
                <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                  <Folder className="h-3 w-3" />
                  <span>{dir}</span>
                </div>
              )}
              
              {/* Files */}
              {files.map((file) => (
                <Collapsible
                  key={file.id}
                  open={expandedFiles.has(file.id)}
                  onOpenChange={() => toggleFile(file.id)}
                >
                  <div
                    className={cn(
                      'rounded-lg border',
                      file.status === 'rejected' && 'opacity-50',
                      file.status === 'error' && 'border-red-500/50',
                    )}
                  >
                    {/* File Header */}
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-t-lg">
                        {expandedFiles.has(file.id) ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        <FileCode className={cn('h-4 w-4', getChangeTypeColor(file.changeType))} />
                        <span className="flex-1 text-left text-sm font-medium truncate">
                          {file.filePath.split('/').pop()}
                        </span>
                        <Badge variant="secondary" className={cn('text-xs', getChangeTypeColor(file.changeType))}>
                          {getChangeTypeLabel(file.changeType)}
                        </Badge>
                        {getStatusIcon(file.status)}
                      </div>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <div className="p-2 pt-0 space-y-2 border-t">
                        {/* Description */}
                        <p className="text-xs text-muted-foreground">
                          {file.description}
                        </p>
                        
                        {/* Error */}
                        {file.error && (
                          <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 p-2 rounded">
                            <AlertCircle className="h-3.5 w-3.5" />
                            {file.error}
                          </div>
                        )}

                        {/* Diff Preview */}
                        {showDiff && file.before && file.after && (
                          <div className="text-xs font-mono bg-muted rounded overflow-hidden">
                            <div className="max-h-[200px] overflow-auto">
                              {file.before.split('\n').slice(0, 10).map((line, i) => (
                                <div key={`before-${i}`} className="bg-red-500/10 text-red-400 px-2 py-0.5">
                                  - {line}
                                </div>
                              ))}
                              {file.before.split('\n').length > 10 && (
                                <div className="px-2 py-0.5 text-muted-foreground">
                                  ... {file.before.split('\n').length - 10} more lines
                                </div>
                              )}
                              {file.after.split('\n').slice(0, 10).map((line, i) => (
                                <div key={`after-${i}`} className="bg-green-500/10 text-green-400 px-2 py-0.5">
                                  + {line}
                                </div>
                              ))}
                              {file.after.split('\n').length > 10 && (
                                <div className="px-2 py-0.5 text-muted-foreground">
                                  ... {file.after.split('\n').length - 10} more lines
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        {file.status === 'pending' && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-green-500 hover:text-green-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                onAcceptFile(file.id);
                              }}
                            >
                              <Check className="h-3 w-3 mr-1" />
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-red-500 hover:text-red-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRejectFile(file.id);
                              }}
                            >
                              <X className="h-3 w-3 mr-1" />
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                onViewFile(file.filePath);
                              }}
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              View
                            </Button>
                          </div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className="flex items-center justify-between p-4 border-t">
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onAcceptAll}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Accept All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onRejectAll}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject All
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {appliedCount > 0 && plan.status !== 'completed' && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRollback}
              disabled={isRollingBack}
            >
              {isRollingBack ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Undo2 className="h-4 w-4 mr-2" />
              )}
              Rollback
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleApply}
            disabled={isApplying || acceptedCount === 0}
          >
            {isApplying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Apply {acceptedCount} Change{acceptedCount !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook for managing multi-file refactor state
 */
export function useMultiFileRefactor() {
  const [plan, setPlan] = useState<RefactorPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const startRefactor = useCallback(async (
    title: string,
    description: string,
    files: Omit<FileChange, 'id' | 'status'>[]
  ) => {
    setIsLoading(true);
    
    // Create plan with generated IDs
    const newPlan: RefactorPlan = {
      id: crypto.randomUUID(),
      title,
      description,
      files: files.map((f, i) => ({
        ...f,
        id: `file-${i}-${Date.now()}`,
        status: 'pending' as const,
      })),
      status: 'ready',
      progress: 0,
      createdAt: new Date(),
    };
    
    setPlan(newPlan);
    setIsLoading(false);
    return newPlan;
  }, []);

  const acceptFile = useCallback((fileId: string) => {
    setPlan(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        files: prev.files.map(f =>
          f.id === fileId ? { ...f, status: 'accepted' as const } : f
        ),
      };
    });
  }, []);

  const rejectFile = useCallback((fileId: string) => {
    setPlan(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        files: prev.files.map(f =>
          f.id === fileId ? { ...f, status: 'rejected' as const } : f
        ),
      };
    });
  }, []);

  const acceptAll = useCallback(() => {
    setPlan(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        files: prev.files.map(f =>
          f.status === 'pending' ? { ...f, status: 'accepted' as const } : f
        ),
      };
    });
  }, []);

  const rejectAll = useCallback(() => {
    setPlan(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        files: prev.files.map(f =>
          f.status === 'pending' ? { ...f, status: 'rejected' as const } : f
        ),
      };
    });
  }, []);

  const applyChanges = useCallback(async () => {
    if (!plan) return;
    
    setPlan(prev => prev ? { ...prev, status: 'applying' } : prev);
    
    const acceptedFiles = plan.files.filter(f => f.status === 'accepted');
    
    for (let i = 0; i < acceptedFiles.length; i++) {
      const file = acceptedFiles[i];
      
      // Simulate applying change
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setPlan(prev => {
        if (!prev) return prev;
        const progress = Math.round(((i + 1) / acceptedFiles.length) * 100);
        return {
          ...prev,
          progress,
          files: prev.files.map(f =>
            f.id === file.id ? { ...f, status: 'applied' as const } : f
          ),
        };
      });
    }
    
    setPlan(prev => prev ? { ...prev, status: 'completed' } : prev);
  }, [plan]);

  const rollback = useCallback(async () => {
    if (!plan) return;
    
    // Simulate rollback
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setPlan(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        status: 'ready',
        progress: 0,
        files: prev.files.map(f =>
          f.status === 'applied' ? { ...f, status: 'pending' as const } : f
        ),
      };
    });
  }, [plan]);

  const reset = useCallback(() => {
    setPlan(null);
  }, []);

  return {
    plan,
    isLoading,
    startRefactor,
    acceptFile,
    rejectFile,
    acceptAll,
    rejectAll,
    applyChanges,
    rollback,
    reset,
  };
}
