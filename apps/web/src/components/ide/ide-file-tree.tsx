import { useState, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  File,
  RefreshCw,
  Plus,
  FilePlus,
  FolderPlus,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { cn, getLanguageFromFilename } from '@/lib/utils';
import { useIDEStore } from '@/lib/ide-store';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface TreeEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
}

interface IDEFileTreeProps {
  owner: string;
  repo: string;
  currentRef: string;
}

interface TreeNodeProps {
  entry: TreeEntry;
  owner: string;
  repo: string;
  currentRef: string;
  level: number;
  onCreateFile: (parentPath: string) => void;
}

function TreeNode({ entry, owner, repo, currentRef, level, onCreateFile }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { openFile, activeFilePath } = useIDEStore();

  // Fetch directory contents when expanded
  const { data: children, isLoading } = trpc.repos.getTree.useQuery(
    {
      owner,
      repo,
      ref: currentRef,
      path: entry.path,
    },
    {
      enabled: entry.type === 'directory' && isExpanded,
    }
  );

  // Fetch file content when clicking a file
  const fetchFile = trpc.repos.getFile.useMutation();

  const handleClick = async () => {
    if (entry.type === 'directory') {
      setIsExpanded(!isExpanded);
    } else {
      // Open file in editor
      try {
        const result = await fetchFile.mutateAsync({
          owner,
          repo,
          ref: currentRef,
          path: entry.path,
        });
        if (result.encoding === 'utf-8') {
          const language = getLanguageFromFilename(entry.name);
          openFile(entry.path, result.content, language);
        }
      } catch {
        // Handle error (binary file, etc.)
      }
    }
  };

  const handleContextAction = (action: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (action === 'new-file') {
      const parentPath = entry.type === 'directory' ? entry.path : entry.path.split('/').slice(0, -1).join('/');
      onCreateFile(parentPath);
    }
  };

  const isActive = activeFilePath === entry.path;
  const sortedChildren = children?.entries
    ? [...children.entries].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
    : [];

  return (
    <div className="group">
      <div
        className={cn(
          'flex items-center gap-1 w-full px-2 py-1 text-left text-sm',
          'hover:bg-muted/50 transition-colors rounded-sm cursor-pointer',
          isActive && 'bg-primary/10 text-primary'
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
      >
        {entry.type === 'directory' ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
            )}
            <Folder className="h-3.5 w-3.5 flex-shrink-0 text-blue-400" />
          </>
        ) : (
          <>
            <span className="w-3.5" />
            <File className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          </>
        )}
        <span className="truncate flex-1">{entry.name}</span>
        
        {fetchFile.isPending && (
          <RefreshCw className="h-3 w-3 animate-spin" />
        )}
        
        {/* Context menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-muted"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={(e) => handleContextAction('new-file', e)}>
              <FilePlus className="h-3.5 w-3.5 mr-2" />
              New File
            </DropdownMenuItem>
            {entry.type === 'directory' && (
              <DropdownMenuItem onClick={(e) => handleContextAction('new-folder', e)}>
                <FolderPlus className="h-3.5 w-3.5 mr-2" />
                New Folder
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => handleContextAction('delete', e)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {entry.type === 'directory' && isExpanded && (
        <div>
          {isLoading ? (
            <div
              className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground"
              style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}
            >
              <RefreshCw className="h-3 w-3 animate-spin" />
              Loading...
            </div>
          ) : (
            sortedChildren.map((child) => (
              <TreeNode
                key={child.path}
                entry={child}
                owner={owner}
                repo={repo}
                currentRef={currentRef}
                level={level + 1}
                onCreateFile={onCreateFile}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function IDEFileTree({ owner, repo, currentRef }: IDEFileTreeProps) {
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [newFileParent, setNewFileParent] = useState('');
  const { openFile } = useIDEStore();

  const { data: rootTree, isLoading, refetch } = trpc.repos.getTree.useQuery({
    owner,
    repo,
    ref: currentRef,
    path: '',
  });

  const sortedEntries = rootTree?.entries
    ? [...rootTree.entries].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      })
    : [];

  const handleCreateFile = useCallback((parentPath: string) => {
    setNewFileParent(parentPath);
    setNewFilePath('');
    setShowNewFileDialog(true);
  }, []);

  const handleConfirmNewFile = useCallback(() => {
    if (!newFilePath.trim()) return;
    
    const fullPath = newFileParent ? `${newFileParent}/${newFilePath}` : newFilePath;
    const language = getLanguageFromFilename(newFilePath);
    
    // Open the new file in editor with empty content
    openFile(fullPath, '', language);
    setShowNewFileDialog(false);
    setNewFilePath('');
  }, [newFilePath, newFileParent, openFile]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Files
        </span>
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6"
                  onClick={() => handleCreateFile('')}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New file</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6"
                  onClick={() => refetch()}
                >
                  <RefreshCw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh files</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Tree */}
      <ScrollArea className="flex-1">
        <div className="py-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : sortedEntries.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              <p>No files found</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 gap-1"
                onClick={() => handleCreateFile('')}
              >
                <FilePlus className="h-3.5 w-3.5" />
                Create a file
              </Button>
            </div>
          ) : (
            sortedEntries.map((entry) => (
              <TreeNode
                key={entry.path}
                entry={entry}
                owner={owner}
                repo={repo}
                currentRef={currentRef}
                level={0}
                onCreateFile={handleCreateFile}
              />
            ))
          )}
        </div>
      </ScrollArea>

      {/* New File Dialog */}
      <Dialog open={showNewFileDialog} onOpenChange={setShowNewFileDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {newFileParent && (
              <p className="text-sm text-muted-foreground">
                Creating in: <code className="bg-muted px-1 rounded">{newFileParent}/</code>
              </p>
            )}
            <Input
              placeholder="filename.ts"
              value={newFilePath}
              onChange={(e) => setNewFilePath(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleConfirmNewFile();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFileDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmNewFile} disabled={!newFilePath.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
