import { ChevronRight, File, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbProps {
  path: string;
  onNavigate?: (path: string) => void;
}

export function Breadcrumb({ path, onNavigate }: BreadcrumbProps) {
  if (!path) return null;

  const parts = path.split('/');
  const fileName = parts.pop() || '';
  const directories = parts;

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 bg-muted/30 border-b text-xs overflow-x-auto">
      {directories.map((dir, index) => {
        const fullPath = parts.slice(0, index + 1).join('/');
        return (
          <div key={fullPath} className="flex items-center gap-0.5 flex-shrink-0">
            {index === 0 ? (
              <Folder className="h-3 w-3 text-blue-400" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
            <button
              className={cn(
                'px-1 py-0.5 rounded hover:bg-muted/50 transition-colors',
                'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => onNavigate?.(fullPath)}
            >
              {dir}
            </button>
          </div>
        );
      })}
      {directories.length > 0 && (
        <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0 mx-1" />
      )}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <File className="h-3 w-3 text-muted-foreground" />
        <span className="font-medium text-foreground">{fileName}</span>
      </div>
    </div>
  );
}
