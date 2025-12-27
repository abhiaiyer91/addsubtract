import { X, FileCode2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OpenFile } from '@/lib/ide-store';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface FileTabsProps {
  files: OpenFile[];
  activeFilePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

export function FileTabs({ files, activeFilePath, onSelect, onClose }: FileTabsProps) {
  const getFileName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1];
  };

  const getFileIcon = (_language: string) => {
    // Could add more specific icons based on language
    void _language;
    return FileCode2;
  };

  return (
    <div className="border-b bg-muted/20 flex-shrink-0">
      <ScrollArea className="w-full">
        <div className="flex h-9">
          {files.map((file) => {
            const Icon = getFileIcon(file.language);
            const isActive = file.path === activeFilePath;
            const fileName = getFileName(file.path);

            return (
              <div
                key={file.path}
                className={cn(
                  'group flex items-center gap-1.5 px-3 h-full border-r cursor-pointer',
                  'hover:bg-muted/40 transition-colors min-w-0',
                  isActive
                    ? 'bg-background border-b-2 border-b-primary'
                    : 'border-b-2 border-b-transparent'
                )}
                onClick={() => onSelect(file.path)}
              >
                <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                <span
                  className={cn(
                    'text-xs truncate max-w-[120px]',
                    isActive ? 'text-foreground' : 'text-muted-foreground'
                  )}
                  title={file.path}
                >
                  {fileName}
                </span>
                {file.isDirty && (
                  <Circle className="h-2 w-2 flex-shrink-0 fill-current text-amber-500" />
                )}
                <button
                  className={cn(
                    'p-0.5 rounded hover:bg-muted-foreground/20 transition-colors ml-1',
                    'opacity-0 group-hover:opacity-100',
                    isActive && 'opacity-100'
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(file.path);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
