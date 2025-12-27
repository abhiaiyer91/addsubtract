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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type PRState = 'draft' | 'open' | 'ready' | 'waiting' | 'merged' | 'closed';
type MergeMethod = 'merge' | 'squash' | 'rebase';

interface ActionCardProps {
  prState: 'open' | 'merged' | 'closed';
  isDraft?: boolean;
  isMergeable?: boolean;
  hasConflicts?: boolean;
  mergedBy?: { username: string; avatarUrl?: string | null };
  mergedAt?: Date | string;
  isAuthor?: boolean;
  isReviewer?: boolean;
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
  onMerge?: (method: MergeMethod) => Promise<void>;
  onClose?: () => Promise<void>;
  onReopen?: () => Promise<void>;
  onConvertToDraft?: () => Promise<void>;
  onReadyForReview?: () => Promise<void>;
  owner?: string;
  repo?: string;
}

function getCardState(props: ActionCardProps): PRState {
  if (props.prState === 'merged') return 'merged';
  if (props.prState === 'closed') return 'closed';
  if (props.isDraft) return 'draft';
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
  waiting: {
    icon: <Clock className="h-5 w-5 text-yellow-600" />,
    title: 'Waiting to merge',
    bgClass: 'bg-yellow-50 dark:bg-yellow-950/30',
    borderClass: 'border-yellow-200 dark:border-yellow-900',
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

export function ActionCard(props: ActionCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>('squash');
  const state = getCardState(props);
  const config = stateConfig[state];

  const handleMerge = async () => {
    if (!props.onMerge) return;
    setIsLoading(true);
    try {
      await props.onMerge(mergeMethod);
    } finally {
      setIsLoading(false);
    }
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

  return (
    <Card className={cn('border-2', config.borderClass, config.bgClass)}>
      <CardContent className="p-4">
        {/* State Header */}
        <div className="flex items-center gap-3 mb-3">
          {config.icon}
          <span className="font-semibold">{config.title}</span>
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
                className="w-full"
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

            {/* Merge Section */}
            {props.onMerge && props.isMergeable !== false && !props.hasConflicts && (
              <div className="flex gap-2">
                <div className="flex flex-1">
                  <Button
                    variant="success"
                    className="flex-1 rounded-r-none gap-2"
                    onClick={handleMerge}
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
                    <DropdownMenuContent align="end">
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
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

            {/* Merge Section */}
            {props.onMerge && (
              <div className="flex gap-2">
                <div className="flex flex-1">
                  <Button
                    variant="success"
                    className="flex-1 rounded-r-none gap-2"
                    onClick={handleMerge}
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
                    <DropdownMenuContent align="end">
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
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
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
