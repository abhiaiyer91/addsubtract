import { Link } from 'react-router-dom';
import {
  GitPullRequest,
  GitMerge,
  Circle,
  ChevronRight,
  Layers,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface StackBranch {
  branchName: string;
  position: number;
  isCurrent?: boolean;
  pr?: {
    id: string;
    number: number;
    title: string;
    state: 'open' | 'merged' | 'closed';
    isDraft?: boolean;
    author?: {
      username: string;
      avatarUrl?: string | null;
    };
    reviewStatus?: 'approved' | 'changes_requested' | 'pending';
    checksStatus?: 'passing' | 'failing' | 'pending';
  } | null;
}

export interface StackInfo {
  id: string;
  name: string;
  baseBranch: string;
  branches: StackBranch[];
}

interface StackViewerProps {
  stack: StackInfo;
  currentPrId?: string;
  owner: string;
  repo: string;
  canMergeAll?: boolean;
  onMergeStack?: () => Promise<void>;
  compact?: boolean;
}

function getStateIcon(state: 'open' | 'merged' | 'closed', isDraft?: boolean) {
  if (isDraft) {
    return <Circle className="h-4 w-4 text-gray-400" />;
  }
  switch (state) {
    case 'merged':
      return <GitMerge className="h-4 w-4 text-purple-500" />;
    case 'closed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <GitPullRequest className="h-4 w-4 text-green-500" />;
  }
}

function getReviewIcon(status?: 'approved' | 'changes_requested' | 'pending') {
  switch (status) {
    case 'approved':
      return <CheckCircle className="h-3 w-3 text-green-500" />;
    case 'changes_requested':
      return <XCircle className="h-3 w-3 text-red-500" />;
    case 'pending':
      return <Clock className="h-3 w-3 text-yellow-500" />;
    default:
      return null;
  }
}

function getChecksIcon(status?: 'passing' | 'failing' | 'pending') {
  switch (status) {
    case 'passing':
      return <CheckCircle className="h-3 w-3 text-green-500" />;
    case 'failing':
      return <XCircle className="h-3 w-3 text-red-500" />;
    case 'pending':
      return <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />;
    default:
      return null;
  }
}

export function StackViewer({
  stack,
  currentPrId,
  owner,
  repo,
  canMergeAll = false,
  onMergeStack,
  compact = false,
}: StackViewerProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">Stack:</span>
        <Link
          to={`/${owner}/${repo}/stacks/${stack.name}`}
          className="font-medium text-primary hover:underline"
        >
          {stack.name}
        </Link>
        <div className="flex items-center gap-1">
          {stack.branches.map((branch, idx) => {
            const isCurrent = branch.pr?.id === currentPrId;
            return (
              <div key={branch.branchName} className="flex items-center">
                {idx > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                {branch.pr ? (
                  <Link
                    to={`/${owner}/${repo}/pull/${branch.pr.number}`}
                    className={cn(
                      'px-1.5 py-0.5 rounded text-xs flex items-center gap-1',
                      isCurrent
                        ? 'bg-primary text-primary-foreground font-medium'
                        : branch.pr.state === 'merged'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-200'
                        : branch.pr.state === 'closed'
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200'
                        : 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200'
                    )}
                  >
                    {getStateIcon(branch.pr.state, branch.pr.isDraft)}
                    #{branch.pr.number}
                  </Link>
                ) : (
                  <code className="px-1.5 py-0.5 bg-muted rounded text-xs text-muted-foreground">
                    {branch.branchName}
                  </code>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Stack: {stack.name}
          </CardTitle>
          {canMergeAll && onMergeStack && (
            <Button size="sm" variant="success" onClick={onMergeStack}>
              <GitMerge className="h-4 w-4 mr-1" />
              Merge stack
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Based on <code className="bg-muted px-1 rounded">{stack.baseBranch}</code>
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-1">
          {stack.branches.map((branch, idx) => {
            const isCurrent = branch.pr?.id === currentPrId;
            const pr = branch.pr;

            return (
              <div
                key={branch.branchName}
                className={cn(
                  'relative flex items-center gap-3 p-2 rounded-lg transition-colors',
                  isCurrent && 'bg-primary/10 border border-primary/20',
                  !isCurrent && 'hover:bg-muted/50'
                )}
              >
                {/* Vertical connector line */}
                {idx > 0 && (
                  <div className="absolute left-[18px] -top-1 w-0.5 h-2 bg-border" />
                )}
                {idx < stack.branches.length - 1 && (
                  <div className="absolute left-[18px] -bottom-1 w-0.5 h-2 bg-border" />
                )}

                {/* Position indicator */}
                <div
                  className={cn(
                    'shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium',
                    isCurrent
                      ? 'bg-primary text-primary-foreground'
                      : pr?.state === 'merged'
                      ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {idx + 1}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {pr ? (
                    <Link
                      to={`/${owner}/${repo}/pull/${pr.number}`}
                      className="block group"
                    >
                      <div className="flex items-center gap-2">
                        {getStateIcon(pr.state, pr.isDraft)}
                        <span className="font-medium group-hover:text-primary transition-colors">
                          #{pr.number}
                        </span>
                        <span className="text-muted-foreground truncate flex-1">
                          {pr.title}
                        </span>
                      </div>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Circle className="h-4 w-4 text-muted-foreground" />
                      <code className="text-sm text-muted-foreground">
                        {branch.branchName}
                      </code>
                      <Badge variant="outline" className="text-xs">
                        No PR
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Status indicators */}
                {pr && (
                  <div className="flex items-center gap-2">
                    {pr.author && (
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={pr.author.avatarUrl || undefined} />
                        <AvatarFallback className="text-[10px]">
                          {(pr.author.username || 'UN').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    {getReviewIcon(pr.reviewStatus)}
                    {getChecksIcon(pr.checksStatus)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
          <ChevronRight className="h-3 w-3" />
          Review and merge PRs in order from top to bottom
        </p>
      </CardContent>
    </Card>
  );
}
