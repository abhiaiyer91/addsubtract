import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  GitMerge,
  GitPullRequest,
  FileEdit,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  RotateCcw,
  Eye,
  ChevronDown,
  Train,
  Zap,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { toastSuccess, toastError } from '@/components/ui/use-toast';

type PRState = 'draft' | 'open' | 'ready' | 'queued' | 'merged' | 'closed';
type MergeMethod = 'merge' | 'squash' | 'rebase';
type MergeQueueState = 
  | 'pending' 
  | 'preparing' 
  | 'testing' 
  | 'ready' 
  | 'merging' 
  | 'completed' 
  | 'failed' 
  | 'cancelled';

interface MergeQueuePosition {
  inQueue: boolean;
  position?: number;
  state?: MergeQueueState;
  priority?: number;
  estimatedWaitMinutes?: number | null;
  aheadCount?: number;
}

interface ActionCardProps {
  prId: string;
  prState: 'open' | 'merged' | 'closed';
  repoId: string;
  targetBranch: string;
  isDraft?: boolean;
  isMergeable?: boolean;
  hasConflicts?: boolean;
  mergedBy?: { username: string; avatarUrl?: string | null };
  mergedAt?: Date | string;
  isAuthor?: boolean;
  isReviewer?: boolean;
  canWrite?: boolean;
  reviewsApproved?: number;
  reviewsChangesRequested?: number;
  checksStatus?: 'passing' | 'failing' | 'pending' | 'none';
  checksFailed?: number;
  checksTotal?: number;
  behindBy?: number;
  // Stack-related props
  stackName?: string;
  stackPosition?: number;
  stackTotal?: number;
  stackCanMerge?: boolean;
  onMerge?: (method: MergeMethod, commitMessage?: string) => Promise<void>;
  onClose?: () => Promise<void>;
  onReopen?: () => Promise<void>;
  onConvertToDraft?: () => Promise<void>;
  onReadyForReview?: () => Promise<void>;
  owner?: string;
  repo?: string;
}

function getCardState(props: ActionCardProps, queuePosition?: MergeQueuePosition): PRState {
  if (props.prState === 'merged') return 'merged';
  if (props.prState === 'closed') return 'closed';
  if (props.isDraft) return 'draft';
  if (queuePosition?.inQueue) return 'queued';
  if (props.isMergeable && props.checksStatus === 'passing') return 'ready';
  if (props.isMergeable !== false) return 'open';
  return 'open';
}

const stateConfig: Record<
  PRState,
  {
    icon: React.ReactNode;
    title: string;
    bgClass: string;
    borderClass: string;
  }
> = {
  draft: {
    icon: <FileEdit className="h-5 w-5 text-gray-500" />,
    title: 'Draft',
    bgClass: 'bg-gray-50 dark:bg-gray-900/30',
    borderClass: 'border-gray-200 dark:border-gray-800',
  },
  open: {
    icon: <GitPullRequest className="h-5 w-5 text-green-500" />,
    title: 'Open',
    bgClass: 'bg-green-50 dark:bg-green-950/30',
    borderClass: 'border-green-200 dark:border-green-900',
  },
  ready: {
    icon: <CheckCircle2 className="h-5 w-5 text-green-600" />,
    title: 'Ready to merge',
    bgClass: 'bg-green-50 dark:bg-green-950/30',
    borderClass: 'border-green-300 dark:border-green-800',
  },
  queued: {
    icon: <Train className="h-5 w-5 text-blue-500" />,
    title: 'In Merge Queue',
    bgClass: 'bg-blue-50 dark:bg-blue-950/30',
    borderClass: 'border-blue-300 dark:border-blue-800',
  },
  merged: {
    icon: <GitMerge className="h-5 w-5 text-purple-500" />,
    title: 'Merged',
    bgClass: 'bg-purple-50 dark:bg-purple-950/30',
    borderClass: 'border-purple-200 dark:border-purple-900',
  },
  closed: {
    icon: <XCircle className="h-5 w-5 text-red-500" />,
    title: 'Closed',
    bgClass: 'bg-red-50 dark:bg-red-950/30',
    borderClass: 'border-red-200 dark:border-red-900',
  },
};

const queueStateLabels: Record<MergeQueueState, { label: string; color: string }> = {
  pending: { label: 'Waiting', color: 'text-yellow-600' },
  preparing: { label: 'Preparing', color: 'text-blue-600' },
  testing: { label: 'Testing', color: 'text-blue-600' },
  ready: { label: 'Ready', color: 'text-green-600' },
  merging: { label: 'Merging', color: 'text-purple-600' },
  completed: { label: 'Completed', color: 'text-purple-600' },
  failed: { label: 'Failed', color: 'text-red-600' },
  cancelled: { label: 'Cancelled', color: 'text-gray-600' },
};

function formatWaitTime(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '';
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `~${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `~${hours}h ${mins}m` : `~${hours}h`;
}

export function ActionCard(props: ActionCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>('squash');
  const utils = trpc.useUtils();

  // Fetch merge queue config
  const { data: queueConfig } = trpc.mergeQueue.getConfig.useQuery(
    { repoId: props.repoId, targetBranch: props.targetBranch },
    { enabled: props.prState === 'open' }
  );

  // Fetch queue position for this PR
  const { data: queuePosition } = trpc.mergeQueue.getQueuePosition.useQuery(
    { prId: props.prId },
    { enabled: props.prState === 'open' }
  );

  // Fetch queue stats
  const { data: queueStats } = trpc.mergeQueue.getStats.useQuery(
    { repoId: props.repoId, targetBranch: props.targetBranch },
    { enabled: props.prState === 'open' && queueConfig?.enabled }
  );

  // Add to queue mutation
  const addToQueueMutation = trpc.mergeQueue.addToQueue.useMutation({
    onSuccess: (data) => {
      utils.mergeQueue.getQueuePosition.invalidate({ prId: props.prId });
      utils.mergeQueue.getStats.invalidate({ repoId: props.repoId, targetBranch: props.targetBranch });
      toastSuccess({
        title: 'Added to merge queue',
        description: data.message,
      });
    },
    onError: (error) => {
      toastError({
        title: 'Failed to add to queue',
        description: error.message,
      });
    },
  });

  // Remove from queue mutation
  const removeFromQueueMutation = trpc.mergeQueue.removeFromQueue.useMutation({
    onSuccess: (data) => {
      utils.mergeQueue.getQueuePosition.invalidate({ prId: props.prId });
      utils.mergeQueue.getStats.invalidate({ repoId: props.repoId, targetBranch: props.targetBranch });
      toastSuccess({
        title: 'Removed from queue',
        description: data.message,
      });
    },
    onError: (error) => {
      toastError({
        title: 'Failed to remove from queue',
        description: error.message,
      });
    },
  });

  // Trigger queue processing mutation
  const triggerProcessingMutation = trpc.mergeQueue.triggerProcessing.useMutation({
    onSuccess: () => {
      toastSuccess({
        title: 'Queue processing started',
        description: 'The merge queue is now processing.',
      });
    },
    onError: (error) => {
      toastError({
        title: 'Failed to trigger processing',
        description: error.message,
      });
    },
  });

  const state = getCardState(props, queuePosition as MergeQueuePosition | undefined);
  const config = stateConfig[state];
  const isQueueEnabled = queueConfig?.enabled ?? false;
  const canModify = props.isAuthor || props.canWrite;

  const handleMerge = async () => {
    if (!props.onMerge) return;
    setIsLoading(true);
    try {
      await props.onMerge(mergeMethod);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddToQueue = (priority: number = 50) => {
    addToQueueMutation.mutate({ prId: props.prId, priority });
  };

  const handleRemoveFromQueue = () => {
    removeFromQueueMutation.mutate({ prId: props.prId });
  };

  const handleTriggerProcessing = () => {
    triggerProcessingMutation.mutate({ 
      repoId: props.repoId, 
      targetBranch: props.targetBranch 
    });
  };

  const handleClose = async () => {
    if (!props.onClose) return;
    setIsLoading(true);
    try {
      await props.onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handleReopen = async () => {
    if (!props.onReopen) return;
    setIsLoading(true);
    try {
      await props.onReopen();
    } finally {
      setIsLoading(false);
    }
  };

  const handleReadyForReview = async () => {
    if (!props.onReadyForReview) return;
    setIsLoading(true);
    try {
      await props.onReadyForReview();
    } finally {
      setIsLoading(false);
    }
  };

  const methodLabels: Record<MergeMethod, string> = {
    merge: 'Merge commit',
    squash: 'Squash and merge',
    rebase: 'Rebase and merge',
  };

  const isMutating = addToQueueMutation.isPending || removeFromQueueMutation.isPending || isLoading;

  // Calculate progress for queued state
  const getQueueProgress = () => {
    if (!queuePosition?.inQueue) return 0;
    const queueState = (queuePosition as any).state as MergeQueueState;
    switch (queueState) {
      case 'pending': return 10;
      case 'preparing': return 30;
      case 'testing': return 60;
      case 'ready': return 80;
      case 'merging': return 95;
      default: return 0;
    }
  };

  return (
    <Card className={cn('border-2', config.borderClass, config.bgClass)}>
      <CardContent className="p-4">
        {/* State Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            {config.icon}
            <span className="font-semibold">{config.title}</span>
          </div>
          {state === 'queued' && queuePosition?.inQueue && (
            <Badge variant="secondary" className="gap-1">
              #{((queuePosition as any).position ?? 0) + 1} in queue
            </Badge>
          )}
        </div>

        {/* State-specific content */}
        {state === 'draft' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This pull request is still a work in progress.
            </p>
            {props.isAuthor && props.onReadyForReview && (
              <Button
                onClick={handleReadyForReview}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Eye className="h-4 w-4 mr-2" />
                )}
                Ready for review
              </Button>
            )}
          </div>
        )}

        {state === 'open' && (
          <div className="space-y-3">
            {/* Checks Status */}
            {props.checksStatus && props.checksStatus !== 'none' && (
              <div className="flex items-center gap-2 text-sm">
                {props.checksStatus === 'passing' && (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-green-600 dark:text-green-400">All checks passed</span>
                  </>
                )}
                {props.checksStatus === 'failing' && (
                  <>
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-red-600 dark:text-red-400">
                      {props.checksFailed || 1} check{(props.checksFailed || 1) > 1 ? 's' : ''} failed
                    </span>
                  </>
                )}
                {props.checksStatus === 'pending' && (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
                    <span className="text-yellow-600 dark:text-yellow-400">Checks in progress</span>
                  </>
                )}
              </div>
            )}

            {/* Conflicts */}
            {props.hasConflicts && (
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="text-red-600 dark:text-red-400">
                  This branch has conflicts that must be resolved
                </span>
              </div>
            )}

            {/* Behind target branch */}
            {props.behindBy && props.behindBy > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>
                  This branch is {props.behindBy} commit{props.behindBy > 1 ? 's' : ''} behind the target
                </span>
              </div>
            )}

            {/* Reviews */}
            {(props.reviewsApproved || props.reviewsChangesRequested) && (
              <div className="flex items-center gap-3 text-sm">
                {props.reviewsApproved && props.reviewsApproved > 0 && (
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    {props.reviewsApproved} approved
                  </span>
                )}
                {props.reviewsChangesRequested && props.reviewsChangesRequested > 0 && (
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <XCircle className="h-4 w-4" />
                    {props.reviewsChangesRequested} changes requested
                  </span>
                )}
              </div>
            )}

            {/* Merge Actions */}
            {props.onMerge && props.isMergeable !== false && !props.hasConflicts && (
              <MergeActions
                prId={props.prId}
                mergeMethod={mergeMethod}
                setMergeMethod={setMergeMethod}
                methodLabels={methodLabels}
                isLoading={isMutating}
                onMerge={handleMerge}
                onAddToQueue={handleAddToQueue}
                isQueueEnabled={isQueueEnabled}
                queueStats={queueStats}
                canWrite={canModify}
              />
            )}

            {/* Close button */}
            {props.onClose && (
              <Button
                variant="outline"
                className="w-full"
                onClick={handleClose}
                disabled={isLoading}
              >
                Close pull request
              </Button>
            )}
          </div>
        )}

        {state === 'ready' && (
          <div className="space-y-3">
            <p className="text-sm text-green-600 dark:text-green-400">
              All checks have passed and this pull request is ready to merge.
            </p>

            {/* Stack info */}
            {props.stackName && props.stackPosition !== undefined && (
              <div className="p-2 bg-muted/50 rounded text-sm">
                <span className="text-muted-foreground">Part of stack: </span>
                <Link
                  to={`/${props.owner}/${props.repo}/stacks/${props.stackName}`}
                  className="font-medium text-primary hover:underline"
                >
                  {props.stackName}
                </Link>
                <span className="text-muted-foreground ml-1">
                  ({props.stackPosition + 1}/{props.stackTotal})
                </span>
                {props.stackCanMerge && (
                  <p className="text-green-600 dark:text-green-400 mt-1">
                    The stack is ready to merge.
                  </p>
                )}
              </div>
            )}

            {/* Merge Actions */}
            {props.onMerge && (
              <MergeActions
                prId={props.prId}
                mergeMethod={mergeMethod}
                setMergeMethod={setMergeMethod}
                methodLabels={methodLabels}
                isLoading={isMutating}
                onMerge={handleMerge}
                onAddToQueue={handleAddToQueue}
                isQueueEnabled={isQueueEnabled}
                queueStats={queueStats}
                canWrite={canModify}
              />
            )}
          </div>
        )}

        {state === 'queued' && queuePosition?.inQueue && (
          <div className="space-y-3">
            {/* Queue status */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status:</span>
                <span className={cn(
                  'font-medium',
                  queueStateLabels[(queuePosition as any).state as MergeQueueState]?.color
                )}>
                  {queueStateLabels[(queuePosition as any).state as MergeQueueState]?.label || 'Processing'}
                </span>
              </div>
              
              {(queuePosition as any).estimatedWaitMinutes != null && (queuePosition as any).state === 'pending' && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Estimated wait:</span>
                  <span className="font-medium">
                    {formatWaitTime((queuePosition as any).estimatedWaitMinutes)}
                  </span>
                </div>
              )}
            </div>

            {/* Progress bar */}
            <div className="space-y-1">
              <Progress value={getQueueProgress()} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {(queuePosition as any).state === 'pending' && 'Waiting for earlier PRs...'}
                {(queuePosition as any).state === 'preparing' && 'Preparing merge commit...'}
                {(queuePosition as any).state === 'testing' && 'Running CI checks...'}
                {(queuePosition as any).state === 'ready' && 'Ready to merge!'}
                {(queuePosition as any).state === 'merging' && 'Merging...'}
              </p>
            </div>

            {/* Failed state */}
            {(queuePosition as any).state === 'failed' && (
              <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-950/30 rounded text-sm">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-600 dark:text-red-400 font-medium">Merge failed</p>
                  <p className="text-red-600/80 dark:text-red-400/80 text-xs mt-0.5">
                    Check the CI logs for details
                  </p>
                </div>
              </div>
            )}

            {/* Actions for queued state */}
            {canModify && (
              <div className="flex gap-2 pt-2 border-t">
                {/* Manual trigger button (for admins when queue is in manual mode) */}
                {queueConfig?.autoMergeMode === 'manual' && (queuePosition as any).state === 'ready' && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="default"
                          size="sm"
                          className="flex-1"
                          onClick={handleTriggerProcessing}
                          disabled={triggerProcessingMutation.isPending}
                        >
                          {triggerProcessingMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <Zap className="h-4 w-4 mr-1" />
                          )}
                          Merge Queue Now
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Process the merge queue immediately</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    queueConfig?.autoMergeMode === 'manual' ? '' : 'w-full',
                    'text-red-600 hover:text-red-700 hover:bg-red-50'
                  )}
                  onClick={handleRemoveFromQueue}
                  disabled={removeFromQueueMutation.isPending || ['merging', 'completed'].includes((queuePosition as any).state)}
                >
                  {removeFromQueueMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-1" />
                  )}
                  Remove from Queue
                </Button>
              </div>
            )}
          </div>
        )}

        {state === 'merged' && (
          <div className="space-y-2">
            <p className="text-sm text-purple-600 dark:text-purple-400">
              This pull request was successfully merged.
            </p>
            {props.mergedBy && (
              <p className="text-sm text-muted-foreground">
                Merged by {props.mergedBy.username}
                {props.mergedAt && (
                  <> on {new Date(props.mergedAt).toLocaleDateString()}</>
                )}
              </p>
            )}
          </div>
        )}

        {state === 'closed' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This pull request was closed without being merged.
            </p>
            {props.onReopen && (
              <Button
                variant="outline"
                className="w-full"
                onClick={handleReopen}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RotateCcw className="h-4 w-4 mr-2" />
                )}
                Reopen pull request
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * MergeActions component - handles the merge button with queue option
 */
function MergeActions({
  prId,
  mergeMethod,
  setMergeMethod,
  methodLabels,
  isLoading,
  onMerge,
  onAddToQueue,
  isQueueEnabled,
  queueStats,
  canWrite,
}: {
  prId: string;
  mergeMethod: MergeMethod;
  setMergeMethod: (method: MergeMethod) => void;
  methodLabels: Record<MergeMethod, string>;
  isLoading: boolean;
  onMerge: (commitMessage?: string) => Promise<void>;
  onAddToQueue: (priority?: number) => void;
  isQueueEnabled: boolean;
  queueStats?: { pending: number; avgMergeTimeMinutes: number } | null;
  canWrite?: boolean;
}) {
  const [squashMessage, setSquashMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // AI summarize mutation
  const summarizeMutation = trpc.ai.summarizeForSquash.useMutation({
    onSuccess: (data) => {
      setSquashMessage(data.fullMessage);
      toastSuccess({
        title: 'Commit message generated',
        description: `Summarized ${data.commitCount} commits`,
      });
    },
    onError: (error) => {
      toastError({
        title: 'Failed to generate summary',
        description: error.message,
      });
    },
    onSettled: () => {
      setIsGenerating(false);
    },
  });

  const handleSummarize = () => {
    setIsGenerating(true);
    summarizeMutation.mutate({ prId });
  };

  const handleCopyMessage = async () => {
    if (squashMessage) {
      await navigator.clipboard.writeText(squashMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleMergeWithMessage = () => {
    onMerge(mergeMethod === 'squash' ? squashMessage || undefined : undefined);
  };

  if (!canWrite) return null;

  return (
    <div className="space-y-2">
      {/* Squash commit message editor - show when squash is selected */}
      {mergeMethod === 'squash' && (
        <div className="space-y-2 p-3 rounded-lg bg-muted/30 border">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Squash commit message</span>
            <div className="flex items-center gap-1">
              {squashMessage && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={handleCopyMessage}
                      >
                        {copied ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy message</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={handleSummarize}
                      disabled={isGenerating || isLoading}
                    >
                      {isGenerating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                      )}
                      {isGenerating ? 'Generating...' : 'AI Summarize'}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Use AI to summarize all commits into one message</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          {squashMessage && (
            <textarea
              value={squashMessage}
              onChange={(e) => setSquashMessage(e.target.value)}
              className="w-full min-h-[100px] p-2 text-sm font-mono bg-background border rounded-md resize-y"
              placeholder="Commit message..."
            />
          )}
          {!squashMessage && (
            <p className="text-xs text-muted-foreground">
              Click "AI Summarize" to generate a commit message from all PR commits
            </p>
          )}
        </div>
      )}

      {/* Primary merge button */}
      <div className="flex gap-2">
        <div className="flex flex-1">
          <Button
            variant="success"
            className="flex-1 rounded-r-none gap-2"
            onClick={handleMergeWithMessage}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GitMerge className="h-4 w-4" />
            )}
            {methodLabels[mergeMethod]}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="success"
                className="px-2 rounded-l-none border-l border-green-700"
                disabled={isLoading}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Merge method</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setMergeMethod('merge')}>
                <div>
                  <div className="font-medium">Create a merge commit</div>
                  <div className="text-xs text-muted-foreground">
                    All commits will be added via a merge commit.
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMergeMethod('squash')}>
                <div>
                  <div className="font-medium">Squash and merge</div>
                  <div className="text-xs text-muted-foreground">
                    All commits will be combined into one.
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMergeMethod('rebase')}>
                <div>
                  <div className="font-medium">Rebase and merge</div>
                  <div className="text-xs text-muted-foreground">
                    Commits will be rebased onto base.
                  </div>
                </div>
              </DropdownMenuItem>
              
              {/* Queue options */}
              {isQueueEnabled && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="flex items-center gap-2">
                    <Train className="h-4 w-4" />
                    Merge Queue
                    {queueStats && queueStats.pending > 0 && (
                      <Badge variant="secondary" className="text-xs ml-auto">
                        {queueStats.pending} waiting
                      </Badge>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => onAddToQueue(50)}>
                    <div className="flex items-center gap-2 w-full">
                      <Train className="h-4 w-4 text-blue-500" />
                      <div className="flex-1">
                        <div className="font-medium">Add to queue</div>
                        <div className="text-xs text-muted-foreground">
                          Automatically merged when ready
                        </div>
                      </div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAddToQueue(80)}>
                    <div className="flex items-center gap-2 w-full">
                      <Zap className="h-4 w-4 text-yellow-500" />
                      <div className="flex-1">
                        <div className="font-medium">Add with high priority</div>
                        <div className="text-xs text-muted-foreground">
                          Jump ahead in the queue
                        </div>
                      </div>
                    </div>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Quick add to queue button when queue is enabled */}
      {isQueueEnabled && (
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => onAddToQueue(50)}
          disabled={isLoading}
        >
          <Train className="h-4 w-4" />
          Add to Merge Queue
          {queueStats && queueStats.pending > 0 && (
            <span className="text-muted-foreground">
              ({queueStats.pending} ahead)
            </span>
          )}
        </Button>
      )}
    </div>
  );
}
