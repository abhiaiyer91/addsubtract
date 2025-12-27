import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, onCheckedChange, checked, defaultChecked, ...props }, ref) => {
    const [isChecked, setIsChecked] = React.useState(defaultChecked ?? false);
    
    const actualChecked = checked !== undefined ? checked : isChecked;

    const handleClick = () => {
      if (props.disabled) return;
      
      const newValue = !actualChecked;
      if (checked === undefined) {
        setIsChecked(newValue);
      }
      onCheckedChange?.(newValue);
    };

    return (
      <button
        type="button"
        role="switch"
        aria-checked={actualChecked}
        disabled={props.disabled}
        onClick={handleClick}
        className={cn(
          'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full',
          'border-2 border-transparent shadow-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
          actualChecked ? 'bg-primary' : 'bg-input',
          className
        )}
      >
        <span
          className={cn(
            'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform',
            actualChecked ? 'translate-x-4' : 'translate-x-0'
          )}
        />
        <input
          type="checkbox"
          className="sr-only"
          ref={ref}
          checked={actualChecked}
          onChange={() => {}}
          {...props}
        />
      </button>
    );
  }
);
Switch.displayName = 'Switch';

export { Switch };
