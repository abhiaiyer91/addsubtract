import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all duration-300 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-glow hover:shadow-glow-lg hover:bg-primary/90 active:scale-[0.98]',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 active:scale-[0.98]',
        outline:
          'border border-border bg-transparent hover:bg-muted/30 hover:border-primary/40 active:scale-[0.98]',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/70 active:scale-[0.98]',
        ghost:
          'hover:bg-muted/40 hover:text-foreground',
        link:
          'text-primary underline-offset-4 hover:underline',
        success:
          'bg-success text-success-foreground shadow-glow hover:shadow-glow-lg hover:bg-success/90 active:scale-[0.98]',
        premium:
          'bg-gradient-to-r from-primary via-emerald-400 to-primary text-primary-foreground shadow-glow-lg hover:shadow-glow-xl active:scale-[0.98] animate-glow-pulse',
      },
      size: {
        default: 'h-10 px-5 py-2 rounded-full',
        sm: 'h-8 rounded-full px-4 text-xs',
        lg: 'h-12 rounded-full px-8 text-base',
        xl: 'h-14 rounded-full px-10 text-lg font-semibold',
        icon: 'h-10 w-10 rounded-full',
        'icon-sm': 'h-8 w-8 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
