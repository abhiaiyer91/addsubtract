import { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Search,
  MessageSquare,
  CheckCircle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface FileInfo {
  path: string;
  additions: number;
  deletions: number;
  status: 'added' | 'deleted' | 'modified' | 'renamed';
  commentCount?: number;
  viewed?: boolean;
}

interface FileTreeProps {
  files: FileInfo[];
  selectedFile?: string;
  onSelectFile: (path: string) => void;
  className?: string;
}

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
  file?: FileInfo;
}

function buildTree(files: FileInfo[]): TreeNode[] {
  const root: TreeNode[] = [];
  
  for (const file of files) {
    const parts = file.path.split('/');
    let currentLevel = root;
    let currentPath = '';
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = i === parts.length - 1;
      
      let existing = currentLevel.find(n => n.name === part);
      
      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          isFolder: !isFile,
          children: [],
          file: isFile ? file : undefined,
        };
        currentLevel.push(existing);
      }
      
      currentLevel = existing.children;
    }
  }
  
  // Sort: folders first, then alphabetically
  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    }).map(node => ({
      ...node,
      children: sortNodes(node.children),
    }));
  };
  
  return sortNodes(root);
}

export function FileTree({
  files,
  selectedFile,
  onSelectFile,
  className,
}: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  
  const tree = useMemo(() => buildTree(files), [files]);
  
  const filteredFiles = useMemo(() => {
    if (!searchQuery) return files;
    const query = searchQuery.toLowerCase();
    return files.filter(f => f.path.toLowerCase().includes(query));
  }, [files, searchQuery]);
  
  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };
  
  // Expand all folders by default
  useMemo(() => {
    const allFolders = new Set<string>();
    const collectFolders = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.isFolder) {
          allFolders.add(node.path);
          collectFolders(node.children);
        }
      }
    };
    collectFolders(tree);
    setExpandedFolders(allFolders);
  }, [tree]);
  
  const renderNode = (node: TreeNode, level: number = 0) => {
    if (searchQuery && !node.isFolder) {
      // When searching, only show matching files
      if (!node.path.toLowerCase().includes(searchQuery.toLowerCase())) {
        return null;
      }
    }
    
    if (node.isFolder) {
      const isExpanded = expandedFolders.has(node.path);
      const visibleChildren = node.children.filter(child => {
        if (!searchQuery) return true;
        if (child.isFolder) return true;
        return child.path.toLowerCase().includes(searchQuery.toLowerCase());
      });
      
      if (searchQuery && visibleChildren.length === 0) {
        return null;
      }
      
      return (
        <div key={node.path}>
          <button
            onClick={() => toggleFolder(node.path)}
            className="flex items-center gap-1 w-full py-1 px-1 hover:bg-muted rounded text-sm text-muted-foreground hover:text-foreground"
            style={{ paddingLeft: `${level * 12 + 4}px` }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 text-blue-500" />
            ) : (
              <Folder className="h-4 w-4 text-blue-500" />
            )}
            <span>{node.name}</span>
          </button>
          {isExpanded && (
            <div>
              {node.children.map(child => renderNode(child, level + 1))}
            </div>
          )}
        </div>
      );
    }
    
    const file = node.file!;
    const isSelected = selectedFile === file.path;
    
    return (
      <button
        key={node.path}
        onClick={() => onSelectFile(file.path)}
        className={cn(
          'flex items-center gap-1.5 w-full py-1 px-1 rounded text-sm',
          isSelected
            ? 'bg-primary/10 text-primary'
            : 'hover:bg-muted text-muted-foreground hover:text-foreground',
          file.viewed && 'opacity-60'
        )}
        style={{ paddingLeft: `${level * 12 + 4}px` }}
      >
        <File className={cn(
          'h-4 w-4',
          file.status === 'added' && 'text-green-500',
          file.status === 'deleted' && 'text-red-500',
          file.status === 'modified' && 'text-yellow-500',
          file.status === 'renamed' && 'text-blue-500'
        )} />
        <span className="flex-1 truncate text-left">{node.name}</span>
        {file.viewed && (
          <CheckCircle className="h-3 w-3 text-green-500" />
        )}
        {file.commentCount && file.commentCount > 0 && (
          <Badge variant="outline" className="h-4 px-1 text-[10px]">
            <MessageSquare className="h-2.5 w-2.5 mr-0.5" />
            {file.commentCount}
          </Badge>
        )}
        <span className="text-[10px] font-mono">
          <span className="text-green-500">+{file.additions}</span>
          {' '}
          <span className="text-red-500">-{file.deletions}</span>
        </span>
      </button>
    );
  };
  
  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Search */}
      <div className="p-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 pl-7 text-sm"
          />
        </div>
      </div>
      
      {/* Summary */}
      <div className="px-3 py-2 border-b text-xs text-muted-foreground">
        {files.length} file{files.length !== 1 ? 's' : ''} changed
        <span className="ml-2 text-green-500">
          +{files.reduce((acc, f) => acc + f.additions, 0)}
        </span>
        <span className="ml-1 text-red-500">
          -{files.reduce((acc, f) => acc + f.deletions, 0)}
        </span>
      </div>
      
      {/* Tree */}
      <div className="flex-1 overflow-y-auto p-2">
        {searchQuery ? (
          // Flat list when searching
          <div>
            {filteredFiles.map(file => (
              <button
                key={file.path}
                onClick={() => onSelectFile(file.path)}
                className={cn(
                  'flex items-center gap-1.5 w-full py-1 px-2 rounded text-sm',
                  selectedFile === file.path
                    ? 'bg-primary/10 text-primary'
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                )}
              >
                <File className={cn(
                  'h-4 w-4 shrink-0',
                  file.status === 'added' && 'text-green-500',
                  file.status === 'deleted' && 'text-red-500',
                  file.status === 'modified' && 'text-yellow-500',
                  file.status === 'renamed' && 'text-blue-500'
                )} />
                <span className="flex-1 truncate text-left">{file.path}</span>
                <span className="text-[10px] font-mono shrink-0">
                  <span className="text-green-500">+{file.additions}</span>
                  {' '}
                  <span className="text-red-500">-{file.deletions}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          // Tree view
          tree.map(node => renderNode(node))
        )}
      </div>
    </div>
  );
}
