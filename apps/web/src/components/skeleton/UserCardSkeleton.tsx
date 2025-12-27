import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export function UserCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

export function UserListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {[...Array(count)].map((_, i) => (
        <UserCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function CollaboratorRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0">
      <Skeleton className="h-8 w-8 rounded-full" />
      <div className="space-y-1.5 flex-1">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-6 w-16 rounded-full" />
    </div>
  );
}

export function CollaboratorListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="border rounded-lg divide-y">
      {[...Array(count)].map((_, i) => (
        <CollaboratorRowSkeleton key={i} />
      ))}
    </div>
  );
}
