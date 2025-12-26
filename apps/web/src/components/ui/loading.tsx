import { cn } from '@/lib/utils';

interface LoadingProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

export function Loading({ className, size = 'md', text }: LoadingProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-10 w-10',
  };

  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <div className={cn('relative', sizeClasses[size])}>
        {/* Outer ring */}
        <div className="absolute inset-0 rounded-full border-2 border-muted" />
        {/* Spinning gradient */}
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
      </div>
      {text && (
        <p className="text-sm text-muted-foreground animate-pulse">{text}</p>
      )}
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loading size="lg" text="Loading..." />
    </div>
  );
}

export function InlineLoading() {
  return <Loading size="sm" />;
}

// Skeleton loading component
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted/50',
        className
      )}
    />
  );
}
