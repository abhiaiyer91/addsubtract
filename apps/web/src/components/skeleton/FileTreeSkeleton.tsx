import { Skeleton } from '@/components/ui/skeleton';

export function FileTreeRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b last:border-b-0">
      <Skeleton className="h-4 w-4 flex-shrink-0" />
      <Skeleton className="h-4 w-32 flex-1 max-w-[200px]" />
      <Skeleton className="h-3 w-12 ml-auto" />
    </div>
  );
}

export function FileTreeSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border rounded-lg border">
      {/* Breadcrumb header */}
      <div className="px-4 py-2 bg-muted/50 flex items-center gap-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-16" />
      </div>
      
      {/* File rows - show some folders first, then files */}
      {[...Array(rows)].map((_, i) => (
        <FileTreeRowSkeleton key={i} />
      ))}
    </div>
  );
}
