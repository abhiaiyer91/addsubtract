import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-all duration-200',
  {
    variants: {
      variant: {
        default:
          'bg-primary/15 text-primary border border-primary/25 hover:bg-primary/20',
        secondary:
          'bg-muted/80 text-muted-foreground border border-border/50 hover:bg-muted',
        destructive:
          'bg-destructive/15 text-destructive border border-destructive/25 hover:bg-destructive/20',
        outline:
          'border border-border/60 text-foreground bg-transparent hover:bg-muted/40',
        success:
          'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20',
        warning:
          'bg-amber-500/15 text-amber-400 border border-amber-500/25 hover:bg-amber-500/20',
        info:
          'bg-blue-500/15 text-blue-400 border border-blue-500/25 hover:bg-blue-500/20',
        purple:
          'bg-purple-500/15 text-purple-400 border border-purple-500/25 hover:bg-purple-500/20',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
