import { useState } from 'react';
import {
  AlertTriangle,
  GitBranch,
  RefreshCw,
  Loader2,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface BranchStatusProps {
  // Branch status
  behindBy: number;
  aheadBy: number;
  hasConflicts: boolean;
  conflictFiles?: string[];
  
  // Target branch info
  targetBranch: string;
  sourceBranch: string;
  
  // Actions
  onUpdateBranch?: () => Promise<void>;
  canUpdateBranch?: boolean;
  
  // Loading state
  isChecking?: boolean;
}

export function BranchStatus({
  behindBy,
  aheadBy,
  hasConflicts,
  conflictFiles = [],
  targetBranch,
  sourceBranch,
  onUpdateBranch,
  canUpdateBranch = false,
  isChecking = false,
}: BranchStatusProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdate = async () => {
    if (!onUpdateBranch) return;
    setIsUpdating(true);
    try {
      await onUpdateBranch();
    } finally {
      setIsUpdating(false);
    }
  };

  // Don't show if everything is up to date and no conflicts
  if (behindBy === 0 && !hasConflicts && !isChecking) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
        <CheckCircle className="h-4 w-4" />
        <span>This branch is up to date with {targetBranch}</span>
      </div>
    );
  }

  if (isChecking) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Checking branch status...</span>
      </div>
    );
  }

  // Has conflicts
  if (hasConflicts) {
    return (
      <Card className="border-red-500/30 bg-red-500/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-red-500/10 rounded-full">
              <XCircle className="h-5 w-5 text-red-500" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-red-600 dark:text-red-400 mb-1">
                This branch has conflicts that must be resolved
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Conflicts with the base branch prevent this pull request from merging.
                Resolve the conflicts to proceed.
              </p>

              {conflictFiles.length > 0 && (
                <div className="text-sm mb-3">
                  <span className="text-muted-foreground">Conflicting files:</span>
                  <ul className="mt-1 space-y-0.5">
                    {conflictFiles.slice(0, 5).map((file) => (
                      <li key={file} className="font-mono text-xs text-red-600 dark:text-red-400">
                        {file}
                      </li>
                    ))}
                    {conflictFiles.length > 5 && (
                      <li className="text-xs text-muted-foreground">
                        and {conflictFiles.length - 5} more...
                      </li>
                    )}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-2">
                <code className="px-1.5 py-0.5 bg-muted rounded text-xs">
                  git checkout {sourceBranch}
                </code>
                <code className="px-1.5 py-0.5 bg-muted rounded text-xs">
                  git merge {targetBranch}
                </code>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Behind target branch
  if (behindBy > 0) {
    return (
      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-yellow-500/10 rounded-full">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            </div>
            <div className="flex-1">
              <div className="font-medium mb-1">
                This branch is {behindBy} commit{behindBy > 1 ? 's' : ''} behind {targetBranch}
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                {canUpdateBranch
                  ? 'Update your branch to include the latest changes from the base branch.'
                  : 'The branch needs to be updated with changes from the base branch.'}
              </p>

              {canUpdateBranch && onUpdateBranch && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUpdate}
                  disabled={isUpdating}
                  className="gap-2"
                >
                  {isUpdating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Update branch
                </Button>
              )}

              {!canUpdateBranch && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <code className="px-1.5 py-0.5 bg-muted rounded">
                    git fetch origin && git rebase origin/{targetBranch}
                  </code>
                </div>
              )}
            </div>
          </div>

          {aheadBy > 0 && (
            <div className="mt-3 pt-3 border-t text-sm text-muted-foreground flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              <span>
                {aheadBy} commit{aheadBy > 1 ? 's' : ''} ahead of {targetBranch}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return null;
}

// Compact version for sidebar
export function BranchStatusBadge({
  behindBy,
  hasConflicts,
  isUpToDate,
}: {
  behindBy: number;
  hasConflicts: boolean;
  isUpToDate: boolean;
}) {
  if (hasConflicts) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-500">
        <XCircle className="h-3.5 w-3.5" />
        <span>Has conflicts</span>
      </div>
    );
  }

  if (behindBy > 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-yellow-500">
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>{behindBy} behind</span>
      </div>
    );
  }

  if (isUpToDate) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-500">
        <CheckCircle className="h-3.5 w-3.5" />
        <span>Up to date</span>
      </div>
    );
  }

  return null;
}
