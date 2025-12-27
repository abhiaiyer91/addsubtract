/**
 * MergeQueueCard - Sidebar component showing merge queue status
 * 
 * This is a compact status indicator for the PR sidebar.
 * The main merge queue actions are in the ActionCard component.
 */

import {
  Train,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';

type MergeQueueState = 
  | 'pending' 
  | 'preparing' 
  | 'testing' 
  | 'ready' 
  | 'merging' 
  | 'completed' 
  | 'failed' 
  | 'cancelled';

interface MergeQueueCardProps {
  prId: string;
  repoId: string;
  targetBranch: string;
  prState: 'open' | 'merged' | 'closed';
  owner: string;
  repo: string;
}

const stateConfig: Record<MergeQueueState, {
  icon: React.ReactNode;
  label: string;
  color: string;
}> = {
  pending: {
    icon: <Clock className="h-4 w-4" />,
    label: 'Waiting',
    color: 'text-yellow-600 dark:text-yellow-400',
  },
  preparing: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    label: 'Preparing',
    color: 'text-blue-600 dark:text-blue-400',
  },
  testing: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    label: 'Testing',
    color: 'text-blue-600 dark:text-blue-400',
  },
  ready: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    label: 'Ready',
    color: 'text-green-600 dark:text-green-400',
  },
  merging: {
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    label: 'Merging',
    color: 'text-purple-600 dark:text-purple-400',
  },
  completed: {
    icon: <CheckCircle2 className="h-4 w-4" />,
    label: 'Merged',
    color: 'text-purple-600 dark:text-purple-400',
  },
  failed: {
    icon: <XCircle className="h-4 w-4" />,
    label: 'Failed',
    color: 'text-red-600 dark:text-red-400',
  },
  cancelled: {
    icon: <XCircle className="h-4 w-4" />,
    label: 'Cancelled',
    color: 'text-gray-600 dark:text-gray-400',
  },
};

function formatWaitTime(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '';
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `~${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `~${hours}h ${mins}m` : `~${hours}h`;
}

export function MergeQueueCard({
  prId,
  repoId,
  targetBranch,
  prState,
  owner,
  repo,
}: MergeQueueCardProps) {
  // Fetch queue position for this PR
  const { data: queuePosition, isLoading } = trpc.mergeQueue.getQueuePosition.useQuery(
    { prId },
    { enabled: prState === 'open' }
  );

  // Fetch queue config to check if enabled
  const { data: queueConfig } = trpc.mergeQueue.getConfig.useQuery(
    { repoId, targetBranch },
    { enabled: prState === 'open' }
  );

  // Fetch queue stats
  const { data: queueStats } = trpc.mergeQueue.getStats.useQuery(
    { repoId, targetBranch },
    { enabled: prState === 'open' && queueConfig?.enabled }
  );

  // Don't show for merged/closed PRs or if queue is disabled
  if (prState !== 'open' || !queueConfig?.enabled) {
    return null;
  }

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading queue status...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isInQueue = queuePosition?.inQueue ?? false;

  // Not in queue - show summary only
  if (!isInQueue) {
    return (
      <Card>
        <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b">
          <div className="flex items-center gap-2">
            <Train className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">Merge Queue</span>
          </div>
          <Link 
            to={`/${owner}/${repo}/settings/merge-queue`}
            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            Settings
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        <CardContent className="p-3">
          <div className="text-sm text-muted-foreground">
            {queueStats && queueStats.pending > 0 ? (
              <p>{queueStats.pending} PR{queueStats.pending !== 1 ? 's' : ''} in queue</p>
            ) : (
              <p>Queue is empty</p>
            )}
            <p className="text-xs mt-1">
              Use the merge button to add this PR to the queue.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // In queue - show detailed status
  const position = queuePosition as {
    inQueue: true;
    position: number;
    state: MergeQueueState;
    priority: number;
    estimatedWaitMinutes: number | null;
    aheadCount: number;
  };

  const config = stateConfig[position.state];
  const progressPercent = 
    position.state === 'pending' ? 10 
    : position.state === 'preparing' ? 30 
    : position.state === 'testing' ? 60 
    : position.state === 'ready' ? 80 
    : position.state === 'merging' ? 95 
    : 100;

  return (
    <Card className={cn(
      'border-l-4',
      position.state === 'failed' && 'border-l-red-500',
      position.state === 'ready' && 'border-l-green-500',
      ['testing', 'preparing', 'merging'].includes(position.state) && 'border-l-blue-500',
      position.state === 'pending' && 'border-l-yellow-500',
    )}>
      <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b">
        <div className="flex items-center gap-2">
          <Train className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">Merge Queue</span>
        </div>
        <Badge 
          variant={position.state === 'failed' ? 'destructive' : position.state === 'ready' ? 'success' : 'secondary'}
          className="gap-1 text-xs"
        >
          {config.icon}
          {config.label}
        </Badge>
      </div>
      
      <CardContent className="p-3 space-y-2">
        {/* Position */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Position:</span>
          <span className="font-medium">
            #{position.position + 1}
            {position.aheadCount > 0 && (
              <span className="text-muted-foreground font-normal text-xs ml-1">
                ({position.aheadCount} ahead)
              </span>
            )}
          </span>
        </div>

        {/* Estimated wait */}
        {position.estimatedWaitMinutes != null && position.state === 'pending' && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Wait:</span>
            <span className="font-medium">{formatWaitTime(position.estimatedWaitMinutes)}</span>
          </div>
        )}

        {/* Progress */}
        {['preparing', 'testing', 'merging'].includes(position.state) && (
          <Progress value={progressPercent} className="h-1.5" />
        )}

        {/* Failed warning */}
        {position.state === 'failed' && (
          <div className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
            <AlertTriangle className="h-3 w-3" />
            <span>Check CI logs</span>
          </div>
        )}

        {/* Ready indicator */}
        {position.state === 'ready' && (
          <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            <span>Will merge shortly</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
