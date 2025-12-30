/**
 * Git Integration Panel
 * 
 * A comprehensive git integration panel for the IDE.
 * Features:
 * - Branch management
 * - Commit history visualization
 * - Staged/unstaged changes
 * - Inline diff viewing
 * - Quick commit
 * - Stash management
 */

import { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  GitBranch,
  GitCommit,
  GitMerge,
  GitPullRequest,
  Plus,
  Minus,
  FileCode,
  Check,
  X,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Upload,
  Download,
  RotateCcw,
  Archive,
  Trash2,
  Eye,
  Clock,
  User,
  Loader2,
  Search,
  Filter,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface GitFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked';
  staged: boolean;
  additions?: number;
  deletions?: number;
}

export interface GitCommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  authorEmail: string;
  date: Date;
  parents: string[];
}

export interface GitBranchInfo {
  name: string;
  current: boolean;
  upstream?: string;
  ahead: number;
  behind: number;
  lastCommit?: GitCommitInfo;
}

export interface GitStash {
  id: string;
  message: string;
  date: Date;
  branch: string;
}

interface GitPanelProps {
  currentBranch: string;
  branches: GitBranchInfo[];
  stagedFiles: GitFile[];
  unstagedFiles: GitFile[];
  commits: GitCommitInfo[];
  stashes: GitStash[];
  isLoading: boolean;
  onStageFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onDiscardFile: (path: string) => void;
  onCommit: (message: string) => Promise<void>;
  onPush: () => Promise<void>;
  onPull: () => Promise<void>;
  onCheckoutBranch: (branch: string) => void;
  onCreateBranch: (name: string) => Promise<void>;
  onDeleteBranch: (name: string) => Promise<void>;
  onStash: (message: string) => Promise<void>;
  onStashPop: (id: string) => Promise<void>;
  onStashDrop: (id: string) => Promise<void>;
  onViewFile: (path: string) => void;
  onViewDiff: (path: string) => void;
  onRefresh: () => void;
  className?: string;
}

export function GitPanel({
  currentBranch,
  branches,
  stagedFiles,
  unstagedFiles,
  commits,
  stashes,
  isLoading,
  onStageFile,
  onUnstageFile,
  onStageAll,
  onUnstageAll,
  onDiscardFile,
  onCommit,
  onPush,
  onPull,
  onCheckoutBranch,
  onCreateBranch,
  onDeleteBranch,
  onStash,
  onStashPop,
  onStashDrop,
  onViewFile,
  onViewDiff,
  onRefresh,
  className,
}: GitPanelProps) {
  const [activeTab, setActiveTab] = useState('changes');
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [showNewBranchDialog, setShowNewBranchDialog] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [branchSearch, setBranchSearch] = useState('');
  const [commitSearch, setCommitSearch] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['staged', 'unstaged'])
  );

  const currentBranchInfo = branches.find(b => b.name === currentBranch);
  const hasChanges = stagedFiles.length > 0 || unstagedFiles.length > 0;
  const canCommit = stagedFiles.length > 0 && commitMessage.trim().length > 0;

  const toggleSection = useCallback((section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }, []);

  const handleCommit = useCallback(async () => {
    if (!canCommit) return;
    setIsCommitting(true);
    try {
      await onCommit(commitMessage);
      setCommitMessage('');
    } finally {
      setIsCommitting(false);
    }
  }, [canCommit, commitMessage, onCommit]);

  const handlePush = useCallback(async () => {
    setIsPushing(true);
    try {
      await onPush();
    } finally {
      setIsPushing(false);
    }
  }, [onPush]);

  const handlePull = useCallback(async () => {
    setIsPulling(true);
    try {
      await onPull();
    } finally {
      setIsPulling(false);
    }
  }, [onPull]);

  const filteredBranches = useMemo(() => {
    if (!branchSearch) return branches;
    const search = branchSearch.toLowerCase();
    return branches.filter(b => b.name.toLowerCase().includes(search));
  }, [branches, branchSearch]);

  const filteredCommits = useMemo(() => {
    if (!commitSearch) return commits;
    const search = commitSearch.toLowerCase();
    return commits.filter(c =>
      c.message.toLowerCase().includes(search) ||
      c.author.toLowerCase().includes(search) ||
      c.shortSha.toLowerCase().includes(search)
    );
  }, [commits, commitSearch]);

  const getStatusIcon = (status: GitFile['status']) => {
    switch (status) {
      case 'added':
      case 'untracked':
        return <Plus className="h-3.5 w-3.5 text-green-500" />;
      case 'modified':
        return <FileCode className="h-3.5 w-3.5 text-yellow-500" />;
      case 'deleted':
        return <Minus className="h-3.5 w-3.5 text-red-500" />;
      case 'renamed':
        return <RefreshCw className="h-3.5 w-3.5 text-blue-500" />;
      default:
        return <FileCode className="h-3.5 w-3.5" />;
    }
  };

  const getStatusLabel = (status: GitFile['status']) => {
    switch (status) {
      case 'added': return 'A';
      case 'modified': return 'M';
      case 'deleted': return 'D';
      case 'renamed': return 'R';
      case 'untracked': return 'U';
      default: return '?';
    }
  };

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-purple-500" />
          <span className="font-medium text-sm">{currentBranch}</span>
          {currentBranchInfo && (
            <div className="flex items-center gap-1">
              {currentBranchInfo.ahead > 0 && (
                <Badge variant="outline" className="text-xs h-5 px-1.5">
                  ↑{currentBranchInfo.ahead}
                </Badge>
              )}
              {currentBranchInfo.behind > 0 && (
                <Badge variant="outline" className="text-xs h-5 px-1.5">
                  ↓{currentBranchInfo.behind}
                </Badge>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handlePull}
                  disabled={isPulling}
                >
                  {isPulling ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Pull</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handlePush}
                  disabled={isPushing}
                >
                  {isPushing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Push</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onRefresh}
                  disabled={isLoading}
                >
                  <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b px-2 h-9">
          <TabsTrigger value="changes" className="text-xs h-7 relative">
            Changes
            {hasChanges && (
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-purple-500 text-white text-[10px] flex items-center justify-center">
                {stagedFiles.length + unstagedFiles.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="branches" className="text-xs h-7">
            Branches
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs h-7">
            History
          </TabsTrigger>
          <TabsTrigger value="stashes" className="text-xs h-7 relative">
            Stashes
            {stashes.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-muted text-xs flex items-center justify-center">
                {stashes.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Changes Tab */}
        <TabsContent value="changes" className="flex-1 m-0 flex flex-col">
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {/* Staged Changes */}
              <Collapsible
                open={expandedSections.has('staged')}
                onOpenChange={() => toggleSection('staged')}
              >
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                    <div className="flex items-center gap-2">
                      {expandedSections.has('staged') ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <span className="text-sm font-medium">Staged Changes</span>
                      <Badge variant="secondary" className="text-xs">
                        {stagedFiles.length}
                      </Badge>
                    </div>
                    {stagedFiles.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          onUnstageAll();
                        }}
                      >
                        Unstage All
                      </Button>
                    )}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="pl-6 space-y-0.5">
                    {stagedFiles.map((file) => (
                      <FileItem
                        key={file.path}
                        file={file}
                        onStage={() => onUnstageFile(file.path)}
                        onDiscard={() => onDiscardFile(file.path)}
                        onView={() => onViewFile(file.path)}
                        onViewDiff={() => onViewDiff(file.path)}
                        staged
                      />
                    ))}
                    {stagedFiles.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2">
                        No staged changes
                      </p>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Unstaged Changes */}
              <Collapsible
                open={expandedSections.has('unstaged')}
                onOpenChange={() => toggleSection('unstaged')}
              >
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                    <div className="flex items-center gap-2">
                      {expandedSections.has('unstaged') ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <span className="text-sm font-medium">Changes</span>
                      <Badge variant="secondary" className="text-xs">
                        {unstagedFiles.length}
                      </Badge>
                    </div>
                    {unstagedFiles.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          onStageAll();
                        }}
                      >
                        Stage All
                      </Button>
                    )}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="pl-6 space-y-0.5">
                    {unstagedFiles.map((file) => (
                      <FileItem
                        key={file.path}
                        file={file}
                        onStage={() => onStageFile(file.path)}
                        onDiscard={() => onDiscardFile(file.path)}
                        onView={() => onViewFile(file.path)}
                        onViewDiff={() => onViewDiff(file.path)}
                        staged={false}
                      />
                    ))}
                    {unstagedFiles.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2">
                        No changes
                      </p>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </ScrollArea>

          {/* Commit Section */}
          <div className="border-t p-3 space-y-2">
            <Textarea
              placeholder="Commit message..."
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              className="min-h-[60px] text-sm resize-none"
            />
            <div className="flex items-center gap-2">
              <Button
                className="flex-1"
                onClick={handleCommit}
                disabled={!canCommit || isCommitting}
              >
                {isCommitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Committing...
                  </>
                ) : (
                  <>
                    <GitCommit className="h-4 w-4 mr-2" />
                    Commit ({stagedFiles.length})
                  </>
                )}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onStash(commitMessage || 'WIP')}>
                    <Archive className="h-4 w-4 mr-2" />
                    Stash Changes
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-500"
                    onClick={() => {
                      unstagedFiles.forEach(f => onDiscardFile(f.path));
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Discard All Changes
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </TabsContent>

        {/* Branches Tab */}
        <TabsContent value="branches" className="flex-1 m-0 flex flex-col">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search branches..."
                value={branchSearch}
                onChange={(e) => setBranchSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {filteredBranches.map((branch) => (
                <div
                  key={branch.name}
                  className={cn(
                    'flex items-center justify-between p-2 rounded cursor-pointer hover:bg-muted/50',
                    branch.current && 'bg-purple-500/10'
                  )}
                  onClick={() => !branch.current && onCheckoutBranch(branch.name)}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <GitBranch className={cn(
                      'h-4 w-4 shrink-0',
                      branch.current ? 'text-purple-500' : 'text-muted-foreground'
                    )} />
                    <span className={cn(
                      'text-sm truncate',
                      branch.current && 'font-medium'
                    )}>
                      {branch.name}
                    </span>
                    {branch.current && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        current
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {branch.ahead > 0 && (
                      <span className="text-xs text-green-500">↑{branch.ahead}</span>
                    )}
                    {branch.behind > 0 && (
                      <span className="text-xs text-red-500">↓{branch.behind}</span>
                    )}
                    {!branch.current && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onCheckoutBranch(branch.name)}>
                            <Check className="h-4 w-4 mr-2" />
                            Checkout
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <GitMerge className="h-4 w-4 mr-2" />
                            Merge into current
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-red-500"
                            onClick={() => onDeleteBranch(branch.name)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="p-2 border-t">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setShowNewBranchDialog(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              New Branch
            </Button>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="flex-1 m-0 flex flex-col">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search commits..."
                value={commitSearch}
                onChange={(e) => setCommitSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {filteredCommits.map((commit, index) => (
                <div
                  key={commit.sha}
                  className="flex gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer"
                >
                  {/* Graph line */}
                  <div className="flex flex-col items-center">
                    <div className="h-2 w-0.5 bg-muted" style={{ visibility: index === 0 ? 'hidden' : 'visible' }} />
                    <div className="h-2 w-2 rounded-full bg-purple-500 shrink-0" />
                    <div className="flex-1 w-0.5 bg-muted" />
                  </div>
                  
                  {/* Commit info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{commit.message}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <span className="font-mono">{commit.shortSha}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {commit.author}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(commit.date)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Stashes Tab */}
        <TabsContent value="stashes" className="flex-1 m-0">
          <ScrollArea className="h-full">
            <div className="p-2 space-y-1">
              {stashes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Archive className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No stashes</p>
                </div>
              ) : (
                stashes.map((stash) => (
                  <div
                    key={stash.id}
                    className="flex items-center justify-between p-2 rounded hover:bg-muted/50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{stash.message}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <span>On {stash.branch}</span>
                        <span>·</span>
                        <span>{formatRelativeTime(stash.date)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => onStashPop(stash.id)}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        Pop
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500"
                        onClick={() => onStashDrop(stash.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* New Branch Dialog */}
      <Dialog open={showNewBranchDialog} onOpenChange={setShowNewBranchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Branch</DialogTitle>
            <DialogDescription>
              Create a new branch from {currentBranch}
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="feature/my-feature"
            value={newBranchName}
            onChange={(e) => setNewBranchName(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewBranchDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await onCreateBranch(newBranchName);
                setNewBranchName('');
                setShowNewBranchDialog(false);
              }}
              disabled={!newBranchName.trim()}
            >
              Create Branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface FileItemProps {
  file: GitFile;
  staged: boolean;
  onStage: () => void;
  onDiscard: () => void;
  onView: () => void;
  onViewDiff: () => void;
}

function FileItem({ file, staged, onStage, onDiscard, onView, onViewDiff }: FileItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  const statusColors: Record<GitFile['status'], string> = {
    added: 'text-green-500',
    modified: 'text-yellow-500',
    deleted: 'text-red-500',
    renamed: 'text-blue-500',
    untracked: 'text-gray-500',
  };

  const statusLabels: Record<GitFile['status'], string> = {
    added: 'A',
    modified: 'M',
    deleted: 'D',
    renamed: 'R',
    untracked: 'U',
  };

  return (
    <div
      className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span className={cn('text-xs font-mono w-4', statusColors[file.status])}>
        {statusLabels[file.status]}
      </span>
      <span
        className="flex-1 text-sm truncate cursor-pointer hover:underline"
        onClick={onView}
      >
        {file.path.split('/').pop()}
      </span>
      {isHovered && (
        <div className="flex items-center gap-0.5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={onViewDiff}
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>View diff</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={onStage}
                >
                  {staged ? (
                    <Minus className="h-3.5 w-3.5" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{staged ? 'Unstage' : 'Stage'}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-red-500"
                  onClick={onDiscard}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Discard changes</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}

/**
 * Hook for managing git state
 */
export function useGitPanel() {
  const [isLoading, setIsLoading] = useState(false);
  const [currentBranch, setCurrentBranch] = useState('main');
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [stagedFiles, setStagedFiles] = useState<GitFile[]>([]);
  const [unstagedFiles, setUnstagedFiles] = useState<GitFile[]>([]);
  const [commits, setCommits] = useState<GitCommitInfo[]>([]);
  const [stashes, setStashes] = useState<GitStash[]>([]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    // This would fetch actual git data in a real implementation
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsLoading(false);
  }, []);

  const stageFile = useCallback((path: string) => {
    setUnstagedFiles(prev => prev.filter(f => f.path !== path));
    const file = [...unstagedFiles].find(f => f.path === path);
    if (file) {
      setStagedFiles(prev => [...prev, { ...file, staged: true }]);
    }
  }, [unstagedFiles]);

  const unstageFile = useCallback((path: string) => {
    setStagedFiles(prev => prev.filter(f => f.path !== path));
    const file = [...stagedFiles].find(f => f.path === path);
    if (file) {
      setUnstagedFiles(prev => [...prev, { ...file, staged: false }]);
    }
  }, [stagedFiles]);

  return {
    isLoading,
    currentBranch,
    branches,
    stagedFiles,
    unstagedFiles,
    commits,
    stashes,
    refresh,
    stageFile,
    unstageFile,
    setStagedFiles,
    setUnstagedFiles,
    setCurrentBranch,
    setBranches,
    setCommits,
    setStashes,
  };
}
