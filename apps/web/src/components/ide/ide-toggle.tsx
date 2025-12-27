import { Maximize2, Minimize2 } from 'lucide-react';
import { useIDEStore } from '@/lib/ide-store';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface IDEToggleProps {
  className?: string;
}

export function IDEToggle({ className }: IDEToggleProps) {
  const { isIDEMode, toggleIDEMode } = useIDEStore();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={isIDEMode ? 'default' : 'outline'}
            size="sm"
            className={cn('gap-2 h-9', className)}
            onClick={toggleIDEMode}
          >
            {isIDEMode ? (
              <>
                <Minimize2 className="h-4 w-4" />
                <span className="hidden sm:inline">Exit IDE</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-4 w-4" />
                <span className="hidden sm:inline">IDE Mode</span>
              </>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {isIDEMode ? 'Exit full IDE mode' : 'Enter full IDE mode with code editor'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
