import { useRef, useCallback, useEffect, useState } from 'react';
import { useIDEStore } from '@/lib/ide-store';
import { FileTabs } from './file-tabs';
import { CodeEditor } from './code-editor';
import { MarkdownPreview } from './markdown-preview';
import { IDEFileTree } from './ide-file-tree';
import { TerminalPanel } from './terminal-panel';
import { PendingChangesPanel } from './pending-changes-panel';
import { QuickOpen } from './quick-open';
import { Breadcrumb } from './breadcrumb';
import { AgentPanel } from '@/components/agent/agent-panel';
import { trpc } from '@/lib/trpc';
import { toastSuccess, toastError } from '@/components/ui/use-toast';
import {
  PanelLeft,
  PanelBottom,
  FileCode2,
  Search,
  Save,
  Keyboard,
  GitBranch,
  Check,
  Plus,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface IDELayoutProps {
  owner: string;
  repo: string;
  repoId: string;
  defaultRef: string;
}

export function IDELayout({ owner, repo, repoId, defaultRef }: IDELayoutProps) {
  const [currentRef, setCurrentRef] = useState(defaultRef);
  const {
    openFiles,
    activeFilePath,
    setActiveFile,
    closeFile,
    updateFileContent,
    markFileSaved,
    sidebarWidth,
    chatWidth,
    terminalHeight,
    setSidebarWidth,
    setChatWidth,
    setTerminalHeight,
    showTerminal,
    setShowTerminal,
    showFileTree,
    setShowFileTree,
    pendingChanges,
    setIDEMode,
  } = useIDEStore();

  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const [showCreateBranchDialog, setShowCreateBranchDialog] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const sidebarRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef<'sidebar' | 'chat' | 'terminal' | null>(null);
  const utils = trpc.useUtils();

  const activeFile = openFiles.find((f) => f.path === activeFilePath);
  const pendingCount = pendingChanges.filter((c) => c.status === 'pending').length;
  const dirtyFilesCount = openFiles.filter((f) => f.isDirty).length;

  // Fetch branches
  const { data: branchesData } = trpc.repos.getBranches.useQuery({ owner, repo });
  const branches = branchesData || [];

  // Create branch mutation
  const createBranch = trpc.repos.createBranch.useMutation({
    onSuccess: (data) => {
      toastSuccess({ title: `Branch '${data.name}' created` });
      setShowCreateBranchDialog(false);
      setNewBranchName('');
      utils.repos.getBranches.invalidate({ owner, repo });
      setCurrentRef(data.name);
    },
    onError: (error) => {
      toastError({ title: 'Failed to create branch', description: error.message });
    },
  });

  const handleCreateBranch = () => {
    if (!newBranchName.trim()) return;
    createBranch.mutate({
      owner,
      repo,
      name: newBranchName.trim(),
      fromRef: currentRef,
    });
  };

  // Save file mutation
  const saveFile = trpc.repos.updateFile.useMutation({
    onSuccess: () => {
      if (activeFilePath) {
        markFileSaved(activeFilePath);
        toastSuccess({ title: 'File saved' });
      }
    },
    onError: (error) => {
      toastError({ title: 'Failed to save', description: error.message });
    },
  });

  // Handle save
  const handleSave = useCallback(() => {
    if (!activeFile || !activeFile.isDirty) return;
    
    saveFile.mutate({
      owner,
      repo,
      ref: currentRef,
      path: activeFile.path,
      content: activeFile.content,
      message: `Update ${activeFile.path}`,
    });
  }, [activeFile, owner, repo, currentRef, saveFile]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + P - Quick Open
      if (isMod && e.key === 'p') {
        e.preventDefault();
        setQuickOpenVisible(true);
        return;
      }

      // Cmd/Ctrl + S - Save
      if (isMod && e.key === 's') {
        e.preventDefault();
        handleSave();
        return;
      }

      // Cmd/Ctrl + B - Toggle sidebar
      if (isMod && e.key === 'b') {
        e.preventDefault();
        setShowFileTree(!showFileTree);
        return;
      }

      // Cmd/Ctrl + ` - Toggle terminal
      if (isMod && e.key === '`') {
        e.preventDefault();
        setShowTerminal(!showTerminal);
        return;
      }

      // Cmd/Ctrl + W - Close current tab
      if (isMod && e.key === 'w' && activeFilePath) {
        e.preventDefault();
        closeFile(activeFilePath);
        return;
      }

      // Cmd/Ctrl + Tab - Next tab
      if (isMod && e.key === 'Tab' && openFiles.length > 1) {
        e.preventDefault();
        const currentIndex = openFiles.findIndex((f) => f.path === activeFilePath);
        const nextIndex = e.shiftKey
          ? (currentIndex - 1 + openFiles.length) % openFiles.length
          : (currentIndex + 1) % openFiles.length;
        setActiveFile(openFiles[nextIndex].path);
        return;
      }

      // Escape - Exit IDE mode
      if (e.key === 'Escape') {
        e.preventDefault();
        setIDEMode(false);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleSave,
    showFileTree,
    setShowFileTree,
    showTerminal,
    setShowTerminal,
    activeFilePath,
    closeFile,
    openFiles,
    setActiveFile,
  ]);

  // Resizer handlers
  const handleMouseDown = useCallback(
    (type: 'sidebar' | 'chat' | 'terminal') => () => {
      isResizing.current = type;
      document.body.style.cursor = type === 'terminal' ? 'ns-resize' : 'ew-resize';
      document.body.style.userSelect = 'none';
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing.current) return;

      if (isResizing.current === 'sidebar') {
        const newWidth = Math.max(180, Math.min(400, e.clientX));
        setSidebarWidth(newWidth);
      } else if (isResizing.current === 'chat') {
        const newWidth = Math.max(320, Math.min(600, window.innerWidth - e.clientX));
        setChatWidth(newWidth);
      } else if (isResizing.current === 'terminal') {
        const container = terminalRef.current?.parentElement;
        if (container) {
          const rect = container.getBoundingClientRect();
          const newHeight = Math.max(100, Math.min(400, rect.bottom - e.clientY));
          setTerminalHeight(newHeight);
        }
      }
    },
    [setSidebarWidth, setChatWidth, setTerminalHeight]
  );

  const handleMouseUp = useCallback(() => {
    isResizing.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  // Set up global mouse handlers
  const startResize = useCallback(
    (type: 'sidebar' | 'chat' | 'terminal') => {
      const handleMove = (e: MouseEvent) => handleMouseMove(e);
      const handleUp = () => {
        handleMouseUp();
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
      };
      handleMouseDown(type)();
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    },
    [handleMouseDown, handleMouseMove, handleMouseUp]
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* IDE Header */}
      <div className="flex items-center justify-between h-10 px-2 border-b bg-muted/30 flex-shrink-0">
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showFileTree ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  onClick={() => setShowFileTree(!showFileTree)}
                >
                  <PanelLeft className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle file tree (⌘B)</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <span className="text-sm font-medium text-muted-foreground">
            {owner}/{repo}
          </span>

          {/* Branch selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                <GitBranch className="h-3 w-3" />
                <span className="max-w-[100px] truncate">{currentRef}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <div className="max-h-64 overflow-y-auto">
                {branches.length === 0 ? (
                  <DropdownMenuItem disabled>No branches</DropdownMenuItem>
                ) : (
                  branches.map((branch: { name: string }) => (
                    <DropdownMenuItem
                      key={branch.name}
                      onClick={() => setCurrentRef(branch.name)}
                      className="gap-2"
                    >
                      {branch.name === currentRef && <Check className="h-3 w-3" />}
                      {branch.name !== currentRef && <span className="w-3" />}
                      <span className="truncate">{branch.name}</span>
                    </DropdownMenuItem>
                  ))
                )}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowCreateBranchDialog(true)} className="gap-2">
                <Plus className="h-3 w-3" />
                Create new branch
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Quick open button */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-2 text-xs text-muted-foreground"
            onClick={() => setQuickOpenVisible(true)}
          >
            <Search className="h-3 w-3" />
            <span className="hidden sm:inline">Search files</span>
            <kbd className="hidden sm:inline-block ml-2 px-1.5 py-0.5 bg-muted rounded text-[10px]">⌘P</kbd>
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* Dirty files indicator */}
          {dirtyFilesCount > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 text-xs text-amber-500"
                    onClick={handleSave}
                    disabled={saveFile.isPending}
                  >
                    <Save className="h-3.5 w-3.5" />
                    <span>{dirtyFilesCount} unsaved</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Save current file (⌘S)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Pending changes */}
          {pendingCount > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 text-amber-500 text-xs">
              <FileCode2 className="h-3.5 w-3.5" />
              <span>{pendingCount} pending</span>
            </div>
          )}

          {/* Terminal toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showTerminal ? 'secondary' : 'ghost'}
                  size="icon-sm"
                  onClick={() => setShowTerminal(!showTerminal)}
                >
                  <PanelBottom className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle terminal (⌘`)</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Keyboard shortcuts menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <Keyboard className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Keyboard Shortcuts
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="justify-between">
                <span>Quick open</span>
                <kbd className="text-xs text-muted-foreground">⌘P</kbd>
              </DropdownMenuItem>
              <DropdownMenuItem className="justify-between">
                <span>Save file</span>
                <kbd className="text-xs text-muted-foreground">⌘S</kbd>
              </DropdownMenuItem>
              <DropdownMenuItem className="justify-between">
                <span>Toggle sidebar</span>
                <kbd className="text-xs text-muted-foreground">⌘B</kbd>
              </DropdownMenuItem>
              <DropdownMenuItem className="justify-between">
                <span>Toggle terminal</span>
                <kbd className="text-xs text-muted-foreground">⌘`</kbd>
              </DropdownMenuItem>
              <DropdownMenuItem className="justify-between">
                <span>Close tab</span>
                <kbd className="text-xs text-muted-foreground">⌘W</kbd>
              </DropdownMenuItem>
              <DropdownMenuItem className="justify-between">
                <span>Next tab</span>
                <kbd className="text-xs text-muted-foreground">⌘Tab</kbd>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main IDE Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* File Tree Sidebar */}
        {showFileTree && (
          <>
            <div
              ref={sidebarRef}
              className="flex flex-col border-r bg-muted/20"
              style={{ width: sidebarWidth }}
            >
              <IDEFileTree
                owner={owner}
                repo={repo}
                currentRef={currentRef}
              />
            </div>
            {/* Sidebar Resizer */}
            <div
              className="w-1 cursor-ew-resize hover:bg-primary/50 transition-colors"
              onMouseDown={() => startResize('sidebar')}
            />
          </>
        )}

        {/* Editor Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Tabs + Editor */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {openFiles.length > 0 ? (
              <>
                <FileTabs
                  files={openFiles}
                  activeFilePath={activeFilePath}
                  onSelect={setActiveFile}
                  onClose={closeFile}
                />
                {activeFile && (
                  <Breadcrumb path={activeFile.path} />
                )}
                <div className="flex-1 overflow-hidden">
                  {activeFile && (
                    activeFile.language === 'markdown' ? (
                      <MarkdownPreview
                        key={activeFile.path}
                        content={activeFile.content}
                        path={activeFile.path}
                        onChange={(content) => updateFileContent(activeFile.path, content)}
                      />
                    ) : (
                      <CodeEditor
                        key={activeFile.path}
                        content={activeFile.content}
                        language={activeFile.language}
                        path={activeFile.path}
                        onChange={(content) => updateFileContent(activeFile.path, content)}
                        onSave={handleSave}
                      />
                    )
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground bg-zinc-950">
                <div className="text-center space-y-4">
                  <FileCode2 className="h-16 w-16 mx-auto opacity-20" />
                  <div className="space-y-1">
                    <p className="text-sm">No file open</p>
                    <p className="text-xs text-muted-foreground/60">
                      Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">⌘P</kbd> to search files
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setQuickOpenVisible(true)}
                    className="gap-2"
                  >
                    <Search className="h-3.5 w-3.5" />
                    Open a file
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Terminal */}
          {showTerminal && (
            <>
              {/* Terminal Resizer */}
              <div
                ref={terminalRef}
                className="h-1 cursor-ns-resize hover:bg-primary/50 transition-colors"
                onMouseDown={() => startResize('terminal')}
              />
              <TerminalPanel height={terminalHeight} />
            </>
          )}
        </div>

        {/* Chat Resizer */}
        <div
          className="w-1 cursor-ew-resize hover:bg-primary/50 transition-colors"
          onMouseDown={() => startResize('chat')}
        />

        {/* Chat + Pending Changes */}
        <div
          ref={chatRef}
          className="flex flex-col border-l bg-background"
          style={{ width: chatWidth }}
        >
          {/* Pending Changes (if any) */}
          {pendingCount > 0 && (
            <PendingChangesPanel repoId={repoId} />
          )}

          {/* Agent Chat */}
          <div className="flex-1 flex flex-col min-h-0">
            <AgentPanel
              isOpen={true}
              onClose={() => {}}
              repoId={repoId}
              repoName={repo}
              owner={owner}
              embedded
            />
          </div>
        </div>
      </div>

      {/* Quick Open Dialog */}
      <QuickOpen
        isOpen={quickOpenVisible}
        onClose={() => setQuickOpenVisible(false)}
        owner={owner}
        repo={repo}
        currentRef={currentRef}
      />

      {/* Create Branch Dialog */}
      <Dialog open={showCreateBranchDialog} onOpenChange={setShowCreateBranchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a new branch</DialogTitle>
            <DialogDescription>
              Create a new branch from <code className="bg-muted px-1 rounded">{currentRef}</code>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ide-branch-name">Branch name</Label>
              <Input
                id="ide-branch-name"
                placeholder="feature/my-feature"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateBranch();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateBranchDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateBranch} 
              disabled={!newBranchName.trim() || createBranch.isPending}
            >
              {createBranch.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create branch'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
