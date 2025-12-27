import { useState, useMemo, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DiffFile } from './diff-viewer';

export interface FileTreeProps {
  files: DiffFile[];
  /** Files that have been marked as viewed */
  viewedFiles?: Set<string>;
  /** Called when a file's viewed status changes */
  onToggleViewed?: (path: string) => void;
  /** Called when a file is clicked */
  onFileClick?: (path: string) => void;
  /** Currently selected file path */
  selectedFile?: string;
  /** Whether to show the tree or just a flat list */
  showAsTree?: boolean;
  /** Class name for the container */
  className?: string;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
  file?: DiffFile;
}

// Build tree structure from flat file list
function buildTree(files: DiffFile[]): TreeNode[] {
  const root: Record<string, TreeNode> = {};

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = i === parts.length - 1;

      if (!current[part]) {
        current[part] = {
          name: part,
          path: currentPath,
          type: isLast ? 'file' : 'directory',
          children: isLast ? undefined : {},
          file: isLast ? file : undefined,
        };
      }

      if (!isLast) {
        current = current[part].children as Record<string, TreeNode>;
      }
    }
  }

  // Convert to array and sort (directories first, then alphabetical)
  function convertToArray(obj: Record<string, TreeNode>): TreeNode[] {
    return Object.values(obj)
      .map((node) => ({
        ...node,
        children: node.children ? convertToArray(node.children as any) : undefined,
      }))
      .sort((a, b) => {
        if (a.type === 'directory' && b.type === 'file') return -1;
        if (a.type === 'file' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });
  }

  return convertToArray(root);
}

export function FileTree({
  files,
  viewedFiles = new Set(),
  onToggleViewed,
  onFileClick,
  selectedFile,
  showAsTree = true,
  className,
}: FileTreeProps) {
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());

  const tree = useMemo(() => (showAsTree ? buildTree(files) : null), [files, showAsTree]);

  const toggleDir = useCallback((path: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const viewedCount = viewedFiles.size;
  const totalCount = files.length;

  const statusColors: Record<DiffFile['status'], string> = {
    added: 'text-green-500',
    deleted: 'text-red-500',
    modified: 'text-yellow-500',
    renamed: 'text-blue-500',
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isCollapsed = collapsedDirs.has(node.path);
    const isViewed = viewedFiles.has(node.path);
    const isSelected = selectedFile === node.path;

    if (node.type === 'directory') {
      return (
        <div key={node.path}>
          <button
            type="button"
            className="w-full flex items-center gap-1 px-2 py-1 text-left text-sm hover:bg-muted/50 rounded"
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            onClick={() => toggleDir(node.path)}
          >
            {isCollapsed ? (
              <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            )}
            {isCollapsed ? (
              <Folder className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <FolderOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
            <span className="truncate">{node.name}</span>
          </button>
          {!isCollapsed && node.children?.map((child) => renderNode(child, depth + 1))}
        </div>
      );
    }

    const file = node.file!;

    return (
      <div
        key={node.path}
        className={cn(
          'group flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted/50 rounded cursor-pointer',
          isSelected && 'bg-primary/10',
          isViewed && 'opacity-60'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onFileClick?.(node.path)}
      >
        {/* Viewed checkbox */}
        {onToggleViewed && (
          <button
            type="button"
            className={cn(
              'h-4 w-4 rounded border flex-shrink-0 flex items-center justify-center',
              isViewed
                ? 'bg-primary border-primary text-primary-foreground'
                : 'border-muted-foreground/50 hover:border-primary'
            )}
            onClick={(e) => {
              e.stopPropagation();
              onToggleViewed(node.path);
            }}
          >
            {isViewed && <Check className="h-3 w-3" />}
          </button>
        )}

        {/* File icon */}
        <File className={cn('h-4 w-4 flex-shrink-0', statusColors[file.status])} />

        {/* File name */}
        <span className="truncate flex-1">{node.name}</span>

        {/* Stats */}
        <span className="text-xs text-green-500 flex-shrink-0">+{file.additions}</span>
        <span className="text-xs text-red-500 flex-shrink-0">-{file.deletions}</span>
      </div>
    );
  };

  const renderFlatList = () => {
    return files.map((file) => {
      const isViewed = viewedFiles.has(file.path);
      const isSelected = selectedFile === file.path;

      return (
        <div
          key={file.path}
          className={cn(
            'group flex items-center gap-2 px-2 py-1 text-sm hover:bg-muted/50 rounded cursor-pointer',
            isSelected && 'bg-primary/10',
            isViewed && 'opacity-60'
          )}
          onClick={() => onFileClick?.(file.path)}
        >
          {/* Viewed checkbox */}
          {onToggleViewed && (
            <button
              type="button"
              className={cn(
                'h-4 w-4 rounded border flex-shrink-0 flex items-center justify-center',
                isViewed
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-muted-foreground/50 hover:border-primary'
              )}
              onClick={(e) => {
                e.stopPropagation();
                onToggleViewed(file.path);
              }}
            >
              {isViewed && <Check className="h-3 w-3" />}
            </button>
          )}

          {/* File icon */}
          <File className={cn('h-4 w-4 flex-shrink-0', statusColors[file.status])} />

          {/* File path */}
          <span className="truncate flex-1 font-mono text-xs">{file.path}</span>

          {/* Stats */}
          <span className="text-xs text-green-500 flex-shrink-0">+{file.additions}</span>
          <span className="text-xs text-red-500 flex-shrink-0">-{file.deletions}</span>
        </div>
      );
    });
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <span className="text-sm font-medium">Files</span>
        {onToggleViewed && (
          <Badge variant="secondary" className="text-xs">
            {viewedCount}/{totalCount} viewed
          </Badge>
        )}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto p-2">
        {showAsTree && tree ? tree.map((node) => renderNode(node)) : renderFlatList()}
      </div>
    </div>
  );
}
