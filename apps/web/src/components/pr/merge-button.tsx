import { useState } from 'react';
import { GitMerge, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type MergeMethod = 'merge' | 'squash' | 'rebase';

interface MergeButtonProps {
  isMergeable: boolean;
  onMerge: (method: MergeMethod) => Promise<void>;
  disabled?: boolean;
}

export function MergeButton({ isMergeable, onMerge, disabled }: MergeButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [method, setMethod] = useState<MergeMethod>('merge');

  const handleMerge = async () => {
    setIsLoading(true);
    try {
      await onMerge(method);
    } finally {
      setIsLoading(false);
    }
  };

  const methodLabels = {
    merge: 'Create a merge commit',
    squash: 'Squash and merge',
    rebase: 'Rebase and merge',
  };

  if (!isMergeable) {
    return (
      <Button disabled className="gap-2">
        <GitMerge className="h-4 w-4" />
        Not mergeable
      </Button>
    );
  }

  return (
    <div className="flex">
      <Button
        variant="success"
        className="gap-2 rounded-r-none"
        onClick={handleMerge}
        disabled={disabled || isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <GitMerge className="h-4 w-4" />
        )}
        {methodLabels[method]}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="success"
            className="px-2 rounded-l-none border-l border-green-700"
            disabled={disabled || isLoading}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setMethod('merge')}>
            <div>
              <div className="font-medium">Create a merge commit</div>
              <div className="text-xs text-muted-foreground">
                All commits will be added to the base branch via a merge commit.
              </div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMethod('squash')}>
            <div>
              <div className="font-medium">Squash and merge</div>
              <div className="text-xs text-muted-foreground">
                All commits will be combined into one commit.
              </div>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMethod('rebase')}>
            <div>
              <div className="font-medium">Rebase and merge</div>
              <div className="text-xs text-muted-foreground">
                All commits will be rebased onto the base branch.
              </div>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
