/**
 * Editor Context Menu
 * 
 * A rich context menu for the code editor with AI-powered actions,
 * editing shortcuts, navigation, and more.
 */

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  ContextMenuShortcut,
} from '@/components/ui/context-menu';
import {
  Sparkles,
  Wand2,
  Bug,
  RefreshCw,
  TestTube2,
  BookOpen,
  MessageSquare,
  Copy,
  Scissors,
  ClipboardPaste,
  Undo2,
  Redo2,
  Search,
  FileCode,
  GitBranch,
  History,
  ArrowUpRight,
  Code2,
  Type,
  AlignLeft,
  Link,
  Terminal,
  PlayCircle,
  Eye,
  EyeOff,
  Lightbulb,
  Zap,
  FileSearch,
} from 'lucide-react';

export type ContextMenuAction =
  | 'cut'
  | 'copy'
  | 'paste'
  | 'undo'
  | 'redo'
  | 'select-all'
  | 'find'
  | 'find-in-files'
  | 'go-to-definition'
  | 'go-to-references'
  | 'peek-definition'
  | 'rename-symbol'
  | 'format-document'
  | 'format-selection'
  | 'ai-explain'
  | 'ai-fix'
  | 'ai-refactor'
  | 'ai-test'
  | 'ai-docs'
  | 'ai-optimize'
  | 'ai-ask'
  | 'ai-inline-edit'
  | 'git-blame'
  | 'git-history'
  | 'run-selection'
  | 'open-in-terminal'
  | 'toggle-comment'
  | 'toggle-word-wrap';

interface EditorContextMenuProps {
  children: React.ReactNode;
  hasSelection: boolean;
  selectedText?: string;
  currentFile?: string;
  currentLine?: number;
  canUndo?: boolean;
  canRedo?: boolean;
  onAction: (action: ContextMenuAction, data?: unknown) => void;
  className?: string;
}

export function EditorContextMenu({
  children,
  hasSelection,
  selectedText,
  currentFile,
  currentLine,
  canUndo = false,
  canRedo = false,
  onAction,
  className,
}: EditorContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger className={className} asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        {/* AI Actions - Most prominent */}
        <ContextMenuSub>
          <ContextMenuSubTrigger className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-500" />
            <span>AI Actions</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-56">
            <ContextMenuItem
              className="flex items-center gap-2"
              onClick={() => onAction('ai-inline-edit')}
            >
              <Wand2 className="h-4 w-4" />
              <span>Edit with AI</span>
              <ContextMenuShortcut>⌘K</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="flex items-center gap-2"
              onClick={() => onAction('ai-explain')}
              disabled={!hasSelection}
            >
              <Lightbulb className="h-4 w-4" />
              <span>Explain Selection</span>
              <ContextMenuShortcut>⌘⇧E</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              className="flex items-center gap-2"
              onClick={() => onAction('ai-fix')}
              disabled={!hasSelection}
            >
              <Bug className="h-4 w-4" />
              <span>Fix Issues</span>
              <ContextMenuShortcut>⌘⇧F</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              className="flex items-center gap-2"
              onClick={() => onAction('ai-refactor')}
              disabled={!hasSelection}
            >
              <RefreshCw className="h-4 w-4" />
              <span>Refactor</span>
              <ContextMenuShortcut>⌘⇧R</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              className="flex items-center gap-2"
              onClick={() => onAction('ai-test')}
              disabled={!hasSelection}
            >
              <TestTube2 className="h-4 w-4" />
              <span>Generate Tests</span>
              <ContextMenuShortcut>⌘⇧T</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              className="flex items-center gap-2"
              onClick={() => onAction('ai-docs')}
              disabled={!hasSelection}
            >
              <BookOpen className="h-4 w-4" />
              <span>Add Documentation</span>
              <ContextMenuShortcut>⌘⇧D</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              className="flex items-center gap-2"
              onClick={() => onAction('ai-optimize')}
              disabled={!hasSelection}
            >
              <Zap className="h-4 w-4" />
              <span>Optimize Performance</span>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="flex items-center gap-2"
              onClick={() => onAction('ai-ask')}
            >
              <MessageSquare className="h-4 w-4" />
              <span>Ask AI...</span>
              <ContextMenuShortcut>⌘L</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        {/* Edit Actions */}
        <ContextMenuItem
          className="flex items-center gap-2"
          onClick={() => onAction('cut')}
          disabled={!hasSelection}
        >
          <Scissors className="h-4 w-4" />
          <span>Cut</span>
          <ContextMenuShortcut>⌘X</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          className="flex items-center gap-2"
          onClick={() => onAction('copy')}
          disabled={!hasSelection}
        >
          <Copy className="h-4 w-4" />
          <span>Copy</span>
          <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          className="flex items-center gap-2"
          onClick={() => onAction('paste')}
        >
          <ClipboardPaste className="h-4 w-4" />
          <span>Paste</span>
          <ContextMenuShortcut>⌘V</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          className="flex items-center gap-2"
          onClick={() => onAction('undo')}
          disabled={!canUndo}
        >
          <Undo2 className="h-4 w-4" />
          <span>Undo</span>
          <ContextMenuShortcut>⌘Z</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          className="flex items-center gap-2"
          onClick={() => onAction('redo')}
          disabled={!canRedo}
        >
          <Redo2 className="h-4 w-4" />
          <span>Redo</span>
          <ContextMenuShortcut>⌘⇧Z</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Code Intelligence */}
        <ContextMenuSub>
          <ContextMenuSubTrigger className="flex items-center gap-2">
            <Code2 className="h-4 w-4" />
            <span>Go to</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-52">
            <ContextMenuItem
              className="flex items-center gap-2"
              onClick={() => onAction('go-to-definition')}
            >
              <ArrowUpRight className="h-4 w-4" />
              <span>Go to Definition</span>
              <ContextMenuShortcut>F12</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              className="flex items-center gap-2"
              onClick={() => onAction('peek-definition')}
            >
              <Eye className="h-4 w-4" />
              <span>Peek Definition</span>
              <ContextMenuShortcut>⌥F12</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              className="flex items-center gap-2"
              onClick={() => onAction('go-to-references')}
            >
              <Link className="h-4 w-4" />
              <span>Go to References</span>
              <ContextMenuShortcut>⇧F12</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuItem
          className="flex items-center gap-2"
          onClick={() => onAction('rename-symbol')}
        >
          <Type className="h-4 w-4" />
          <span>Rename Symbol</span>
          <ContextMenuShortcut>F2</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Search */}
        <ContextMenuItem
          className="flex items-center gap-2"
          onClick={() => onAction('find')}
        >
          <Search className="h-4 w-4" />
          <span>Find</span>
          <ContextMenuShortcut>⌘F</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          className="flex items-center gap-2"
          onClick={() => onAction('find-in-files')}
        >
          <FileSearch className="h-4 w-4" />
          <span>Find in Files</span>
          <ContextMenuShortcut>⌘⇧F</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Format */}
        <ContextMenuSub>
          <ContextMenuSubTrigger className="flex items-center gap-2">
            <AlignLeft className="h-4 w-4" />
            <span>Format</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-52">
            <ContextMenuItem
              className="flex items-center gap-2"
              onClick={() => onAction('format-document')}
            >
              <FileCode className="h-4 w-4" />
              <span>Format Document</span>
              <ContextMenuShortcut>⌥⇧F</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem
              className="flex items-center gap-2"
              onClick={() => onAction('format-selection')}
              disabled={!hasSelection}
            >
              <AlignLeft className="h-4 w-4" />
              <span>Format Selection</span>
              <ContextMenuShortcut>⌘K ⌘F</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="flex items-center gap-2"
              onClick={() => onAction('toggle-comment')}
            >
              <Code2 className="h-4 w-4" />
              <span>Toggle Comment</span>
              <ContextMenuShortcut>⌘/</ContextMenuShortcut>
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSeparator />

        {/* Git */}
        <ContextMenuSub>
          <ContextMenuSubTrigger className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            <span>Git</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-52">
            <ContextMenuItem
              className="flex items-center gap-2"
              onClick={() => onAction('git-blame')}
            >
              <Eye className="h-4 w-4" />
              <span>Toggle Blame</span>
            </ContextMenuItem>
            <ContextMenuItem
              className="flex items-center gap-2"
              onClick={() => onAction('git-history')}
            >
              <History className="h-4 w-4" />
              <span>File History</span>
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        {/* Run */}
        {hasSelection && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="flex items-center gap-2"
              onClick={() => onAction('run-selection')}
            >
              <PlayCircle className="h-4 w-4" />
              <span>Run Selection</span>
            </ContextMenuItem>
            <ContextMenuItem
              className="flex items-center gap-2"
              onClick={() => onAction('open-in-terminal')}
            >
              <Terminal className="h-4 w-4" />
              <span>Open in Terminal</span>
            </ContextMenuItem>
          </>
        )}

        <ContextMenuSeparator />

        {/* View */}
        <ContextMenuItem
          className="flex items-center gap-2"
          onClick={() => onAction('toggle-word-wrap')}
        >
          <AlignLeft className="h-4 w-4" />
          <span>Toggle Word Wrap</span>
          <ContextMenuShortcut>⌥Z</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * Hook for managing context menu state
 */
export function useEditorContextMenu() {
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);

  const openContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenuPosition(null);
  }, []);

  return {
    contextMenuPosition,
    openContextMenu,
    closeContextMenu,
  };
}
