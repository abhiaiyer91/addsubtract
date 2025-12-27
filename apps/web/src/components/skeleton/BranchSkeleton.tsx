import { Skeleton } from '@/components/ui/skeleton';

export function BranchRowSkeleton() {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b last:border-b-0">
      <Skeleton className="h-4 w-4 flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
      <Skeleton className="h-6 w-16 rounded-full" />
      <Skeleton className="h-8 w-8 rounded-md" />
    </div>
  );
}

export function BranchListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="border rounded-lg divide-y">
      {[...Array(count)].map((_, i) => (
        <BranchRowSkeleton key={i} />
      ))}
    </div>
  );
}
