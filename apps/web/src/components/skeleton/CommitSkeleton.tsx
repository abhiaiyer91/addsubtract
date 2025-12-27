import { Skeleton } from '@/components/ui/skeleton';

export function CommitRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b last:border-b-0">
      {/* Avatar */}
      <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
      
      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-4 w-72" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>

      {/* SHA */}
      <Skeleton className="h-6 w-16 rounded-md font-mono" />
    </div>
  );
}

export function CommitListSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="border rounded-lg divide-y">
      {[...Array(count)].map((_, i) => (
        <CommitRowSkeleton key={i} />
      ))}
    </div>
  );
}

export function CommitDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Commit header */}
      <div className="border rounded-lg p-4">
        <div className="flex items-start gap-4">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-96" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
            <div className="flex items-center gap-4 mt-3">
              <Skeleton className="h-6 w-20 rounded-md" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
            </div>
          </div>
        </div>
      </div>

      {/* Diff files */}
      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="border rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 border-b">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="p-4 space-y-1">
              {[...Array(5)].map((_, j) => (
                <Skeleton key={j} className="h-3 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
