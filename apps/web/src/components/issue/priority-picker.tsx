import { Check, Minus, Signal, SignalLow, SignalMedium, SignalHigh } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type IssuePriority = 'none' | 'low' | 'medium' | 'high' | 'urgent';

const PRIORITY_OPTIONS: { value: IssuePriority; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'none', label: 'No priority', icon: <Minus className="h-4 w-4" />, color: 'text-muted-foreground' },
  { value: 'low', label: 'Low', icon: <SignalLow className="h-4 w-4" />, color: 'text-blue-500' },
  { value: 'medium', label: 'Medium', icon: <SignalMedium className="h-4 w-4" />, color: 'text-yellow-500' },
  { value: 'high', label: 'High', icon: <SignalHigh className="h-4 w-4" />, color: 'text-orange-500' },
  { value: 'urgent', label: 'Urgent', icon: <Signal className="h-4 w-4" />, color: 'text-red-500' },
];

interface PriorityPickerProps {
  priority: IssuePriority | null | undefined;
  onPriorityChange: (priority: IssuePriority) => void;
  isLoading?: boolean;
}

export function PriorityPicker({
  priority,
  onPriorityChange,
  isLoading,
}: PriorityPickerProps) {
  const currentPriority = PRIORITY_OPTIONS.find(p => p.value === (priority || 'none')) || PRIORITY_OPTIONS[0];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Priority</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 gap-1" disabled={isLoading}>
              <span className={currentPriority.color}>{currentPriority.icon}</span>
              {isLoading ? 'Saving...' : 'Edit'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {PRIORITY_OPTIONS.map((option) => {
              const isSelected = (priority || 'none') === option.value;
              return (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => onPriorityChange(option.value)}
                  className="flex items-center gap-2"
                >
                  <span className={option.color}>{option.icon}</span>
                  <span className={`flex-1 ${option.color}`}>{option.label}</span>
                  {isSelected && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Selected priority display */}
      <div className={`flex items-center gap-2 text-sm ${currentPriority.color}`}>
        {currentPriority.icon}
        <span>{currentPriority.label}</span>
      </div>
    </div>
  );
}
