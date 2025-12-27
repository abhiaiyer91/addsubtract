import { Skeleton } from '@/components/ui/skeleton';

export function IssueCardSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b last:border-b-0">
      {/* Status icon */}
      <Skeleton className="h-5 w-5 rounded-full flex-shrink-0" />

      {/* Main content */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>

      {/* Assignee avatar */}
      <Skeleton className="h-6 w-6 rounded-full flex-shrink-0" />
    </div>
  );
}

export function IssueListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="border rounded-lg divide-y">
      {[...Array(count)].map((_, i) => (
        <IssueCardSkeleton key={i} />
      ))}
    </div>
  );
}
