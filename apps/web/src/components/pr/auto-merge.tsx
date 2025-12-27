import { useState } from 'react';
import {
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Bell,
  BellOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type MergeMethod = 'merge' | 'squash' | 'rebase';

interface AutoMergeProps {
  isEnabled: boolean;
  mergeMethod?: MergeMethod;
  enabledBy?: string;
  enabledAt?: Date | string;
  checksStatus: 'passing' | 'failing' | 'pending' | 'none';
  requiredChecksPassed: number;
  requiredChecksTotal: number;
  onEnable: (method: MergeMethod) => Promise<void>;
  onDisable: () => Promise<void>;
  canEnable: boolean;
  disabled?: boolean;
}

export function AutoMerge({
  isEnabled,
  mergeMethod,
  enabledBy,
  enabledAt,
  checksStatus,
  requiredChecksPassed,
  requiredChecksTotal,
  onEnable,
  onDisable,
  canEnable,
  disabled = false,
}: AutoMergeProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleEnable = async (method: MergeMethod) => {
    setIsLoading(true);
    try {
      await onEnable(method);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisable = async () => {
    setIsLoading(true);
    try {
      await onDisable();
    } finally {
      setIsLoading(false);
    }
  };

  const methodLabels: Record<MergeMethod, string> = {
    merge: 'Merge commit',
    squash: 'Squash and merge',
    rebase: 'Rebase and merge',
  };

  if (isEnabled) {
    return (
      <Card className="border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-yellow-500/10 rounded-full">
              <Clock className="h-5 w-5 text-yellow-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium">Auto-merge enabled</span>
                <Badge variant="warning" className="text-xs">
                  {methodLabels[mergeMethod || 'squash']}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                This PR will automatically merge when all required checks pass.
              </p>

              {/* Checks progress */}
              <div className="flex items-center gap-2 text-sm mb-3">
                {checksStatus === 'passing' ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : checksStatus === 'failing' ? (
                  <XCircle className="h-4 w-4 text-red-500" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
                )}
                <span>
                  {requiredChecksPassed} of {requiredChecksTotal} required checks passed
                </span>
              </div>

              {enabledBy && (
                <p className="text-xs text-muted-foreground">
                  Enabled by {enabledBy}
                  {enabledAt && (
                    <> on {new Date(enabledAt).toLocaleDateString()}</>
                  )}
                </p>
              )}

              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={handleDisable}
                disabled={isLoading || disabled}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <BellOff className="h-4 w-4 mr-1" />
                )}
                Disable auto-merge
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!canEnable) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={isLoading || disabled}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Bell className="h-4 w-4" />
            )}
            Enable auto-merge
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => handleEnable('merge')}>
            <div>
              <div className="font-medium">Merge commit</div>
              <div className="text-xs text-muted-foreground">
                All commits via merge commit
              </div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleEnable('squash')}>
            <div>
              <div className="font-medium">Squash and merge</div>
              <div className="text-xs text-muted-foreground">
                Combine into one commit
              </div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleEnable('rebase')}>
            <div>
              <div className="font-medium">Rebase and merge</div>
              <div className="text-xs text-muted-foreground">
                Rebase onto base branch
              </div>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
