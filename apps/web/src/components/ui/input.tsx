import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-full border border-border/40 bg-muted/20 px-4 py-2 text-sm transition-all duration-300',
          'placeholder:text-muted-foreground/50',
          'hover:border-muted-foreground/30 hover:bg-muted/30',
          'focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20 focus:shadow-glow-sm',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
