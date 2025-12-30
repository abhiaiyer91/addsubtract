// IDE components for wit
export { IDELayout } from './ide-layout';
export { FileTabs } from './file-tabs';
export { CodeEditor } from './code-editor';
export { MarkdownPreview } from './markdown-preview';
export { IDEFileTree } from './ide-file-tree';
export { TerminalPanel } from './terminal-panel';
export { PendingChangesPanel } from './pending-changes-panel';
export { IDEToggle } from './ide-toggle';
export { QuickOpen } from './quick-open';
export { Breadcrumb } from './breadcrumb';

// AI-powered features
export { InlineAICommand, useInlineAICommand } from './inline-ai-command';
export { SelectionActions, useSelectionActions } from './selection-actions';
export { AgentChangesHistory, useAgentChangesHistory, type AgentChange } from './agent-changes-history';
export { useAICodeLens, analyzeCodeForHints, CodeLensQuickActions, type CodeLensHint } from './ai-code-lens';
export { KeyboardShortcutsPanel, ShortcutHint } from './keyboard-shortcuts-panel';

// Git integration
export { 
  GitPanel, 
  useGitPanel,
  type GitFile,
  type GitCommitInfo,
  type GitBranchInfo,
  type GitStash,
} from './git-panel';

// Advanced AI features
export { 
  AICommandPalette, 
  useAICommandPalette,
  type CommandItem,
  type CommandCategory,
  type CommandGroup,
} from './ai-command-palette';
export { 
  AICodeSearch, 
  useAICodeSearch,
  type SearchResult,
  type SearchResultType,
  type SearchFilters,
  type SymbolKind,
} from './ai-code-search';
export { 
  EditorContextMenu, 
  useEditorContextMenu,
  type ContextMenuAction,
} from './editor-context-menu';
