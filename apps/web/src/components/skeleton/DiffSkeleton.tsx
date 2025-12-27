import { Skeleton } from '@/components/ui/skeleton';

export function DiffFileSkeleton() {
  return (
    <div className="border rounded-lg overflow-hidden">
      {/* File header */}
      <div className="flex items-center gap-3 px-4 py-2 bg-muted/50 border-b">
        <Skeleton className="h-6 w-6" />
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-48 flex-1" />
        <Skeleton className="h-5 w-16 rounded-full" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3 w-8" />
        </div>
      </div>

      {/* Diff content lines */}
      <div className="font-mono text-sm">
        {/* Hunk header */}
        <div className="bg-blue-500/10 px-4 py-1">
          <Skeleton className="h-3 w-32" />
        </div>
        
        {/* Diff lines */}
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex items-center px-4 py-0.5">
            <Skeleton className="h-3 w-8 mr-2" />
            <Skeleton className="h-3 w-8 mr-4" />
            <Skeleton 
              className="h-3 flex-1" 
              style={{ maxWidth: `${Math.random() * 40 + 30}%` }} 
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DiffSkeleton({ files = 3 }: { files?: number }) {
  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-4 w-12" />
      </div>

      {/* File diffs */}
      {[...Array(files)].map((_, i) => (
        <DiffFileSkeleton key={i} />
      ))}
    </div>
  );
}
