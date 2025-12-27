import { Skeleton } from '@/components/ui/skeleton';

export function PRCardSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b last:border-b-0">
      {/* Status icon */}
      <Skeleton className="h-5 w-5 rounded-full flex-shrink-0" />

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>

      {/* Branch info */}
      <div className="hidden md:flex items-center gap-1">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-16" />
      </div>

      {/* Avatar */}
      <Skeleton className="h-6 w-6 rounded-full flex-shrink-0" />
    </div>
  );
}

export function PRListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="border rounded-lg divide-y">
      {[...Array(count)].map((_, i) => (
        <PRCardSkeleton key={i} />
      ))}
    </div>
  );
}
