/**
 * AI Command Palette
 * 
 * A powerful command palette that combines file navigation, AI actions,
 * git operations, and natural language commands in one unified interface.
 * 
 * Inspired by Raycast, Cursor, and Linear's command palettes.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { cn } from '@/lib/utils';
import {
  Search,
  FileCode,
  FileText,
  Folder,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Terminal,
  Settings,
  Sparkles,
  Wand2,
  TestTube2,
  Bug,
  RefreshCw,
  MessageSquare,
  Play,
  FileQuestion,
  BookOpen,
  Zap,
  ArrowRight,
  History,
  Star,
  Command,
  Hash,
  AtSign,
  Code2,
  Lightbulb,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export type CommandCategory = 
  | 'ai'
  | 'files'
  | 'git'
  | 'terminal'
  | 'navigation'
  | 'search'
  | 'recent';

export interface CommandItem {
  id: string;
  title: string;
  description?: string;
  category: CommandCategory;
  icon: React.ReactNode;
  keywords?: string[];
  shortcut?: string;
  action: () => void | Promise<void>;
  preview?: () => React.ReactNode;
}

export interface CommandGroup {
  category: CommandCategory;
  title: string;
  icon: React.ReactNode;
  items: CommandItem[];
}

const CATEGORY_CONFIG: Record<CommandCategory, { title: string; icon: React.ReactNode }> = {
  ai: { title: 'AI Actions', icon: <Sparkles className="h-4 w-4 text-purple-500" /> },
  files: { title: 'Files', icon: <FileCode className="h-4 w-4 text-blue-500" /> },
  git: { title: 'Git', icon: <GitBranch className="h-4 w-4 text-orange-500" /> },
  terminal: { title: 'Terminal', icon: <Terminal className="h-4 w-4 text-green-500" /> },
  navigation: { title: 'Navigation', icon: <ArrowRight className="h-4 w-4 text-gray-500" /> },
  search: { title: 'Search', icon: <Search className="h-4 w-4 text-cyan-500" /> },
  recent: { title: 'Recent', icon: <History className="h-4 w-4 text-yellow-500" /> },
};

const AI_QUICK_ACTIONS: Omit<CommandItem, 'action'>[] = [
  {
    id: 'ai-explain',
    title: 'Explain Code',
    description: 'Get an explanation of selected code',
    category: 'ai',
    icon: <Lightbulb className="h-4 w-4" />,
    keywords: ['explain', 'understand', 'what'],
    shortcut: '⌘⇧E',
  },
  {
    id: 'ai-fix',
    title: 'Fix Code',
    description: 'Find and fix issues in code',
    category: 'ai',
    icon: <Bug className="h-4 w-4" />,
    keywords: ['fix', 'bug', 'error', 'issue'],
    shortcut: '⌘⇧F',
  },
  {
    id: 'ai-refactor',
    title: 'Refactor Code',
    description: 'Improve code structure and readability',
    category: 'ai',
    icon: <RefreshCw className="h-4 w-4" />,
    keywords: ['refactor', 'improve', 'clean'],
    shortcut: '⌘⇧R',
  },
  {
    id: 'ai-test',
    title: 'Generate Tests',
    description: 'Create tests for the current code',
    category: 'ai',
    icon: <TestTube2 className="h-4 w-4" />,
    keywords: ['test', 'generate', 'unit'],
    shortcut: '⌘⇧T',
  },
  {
    id: 'ai-docs',
    title: 'Add Documentation',
    description: 'Generate documentation comments',
    category: 'ai',
    icon: <BookOpen className="h-4 w-4" />,
    keywords: ['docs', 'document', 'jsdoc', 'comment'],
    shortcut: '⌘⇧D',
  },
  {
    id: 'ai-optimize',
    title: 'Optimize Code',
    description: 'Improve performance',
    category: 'ai',
    icon: <Zap className="h-4 w-4" />,
    keywords: ['optimize', 'performance', 'fast'],
  },
  {
    id: 'ai-ask',
    title: 'Ask AI...',
    description: 'Ask anything about your code',
    category: 'ai',
    icon: <MessageSquare className="h-4 w-4" />,
    keywords: ['ask', 'question', 'chat'],
    shortcut: '⌘L',
  },
];

interface AICommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  files?: { path: string; name: string; type: 'file' | 'folder' }[];
  branches?: string[];
  recentCommands?: string[];
  onOpenFile?: (path: string) => void;
  onCheckoutBranch?: (branch: string) => void;
  onRunCommand?: (command: string) => void;
  onAIAction?: (action: string, context?: string) => void;
  onSearch?: (query: string) => void;
  currentFile?: string;
  selectedText?: string;
}

export function AICommandPalette({
  isOpen,
  onClose,
  files = [],
  branches = [],
  recentCommands = [],
  onOpenFile,
  onCheckoutBranch,
  onRunCommand,
  onAIAction,
  onSearch,
  currentFile,
  selectedText,
}: AICommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'default' | 'ai' | 'files' | 'git' | 'terminal'>('default');
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setMode('default');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Build command items
  const allCommands = useMemo(() => {
    const commands: CommandItem[] = [];

    // AI actions
    AI_QUICK_ACTIONS.forEach(item => {
      commands.push({
        ...item,
        action: () => {
          if (onAIAction) {
            onAIAction(item.id, selectedText);
          }
          onClose();
        },
      });
    });

    // Files
    files.slice(0, 20).forEach(file => {
      commands.push({
        id: `file-${file.path}`,
        title: file.name,
        description: file.path,
        category: 'files',
        icon: file.type === 'folder' ? <Folder className="h-4 w-4" /> : <FileCode className="h-4 w-4" />,
        keywords: file.path.split('/'),
        action: () => {
          if (onOpenFile) {
            onOpenFile(file.path);
          }
          onClose();
        },
      });
    });

    // Git branches
    branches.slice(0, 10).forEach(branch => {
      commands.push({
        id: `branch-${branch}`,
        title: branch,
        description: 'Switch to this branch',
        category: 'git',
        icon: <GitBranch className="h-4 w-4" />,
        keywords: ['branch', 'checkout', branch],
        action: () => {
          if (onCheckoutBranch) {
            onCheckoutBranch(branch);
          }
          onClose();
        },
      });
    });

    // Git actions
    commands.push(
      {
        id: 'git-commit',
        title: 'Commit Changes',
        description: 'Create a new commit',
        category: 'git',
        icon: <GitCommit className="h-4 w-4" />,
        keywords: ['commit', 'save'],
        shortcut: '⌘⇧C',
        action: () => {
          if (onRunCommand) {
            onRunCommand('git commit');
          }
          onClose();
        },
      },
      {
        id: 'git-pull',
        title: 'Pull Changes',
        description: 'Pull from remote',
        category: 'git',
        icon: <GitBranch className="h-4 w-4" />,
        keywords: ['pull', 'fetch', 'update'],
        action: () => {
          if (onRunCommand) {
            onRunCommand('git pull');
          }
          onClose();
        },
      },
      {
        id: 'git-push',
        title: 'Push Changes',
        description: 'Push to remote',
        category: 'git',
        icon: <GitBranch className="h-4 w-4" />,
        keywords: ['push', 'upload'],
        action: () => {
          if (onRunCommand) {
            onRunCommand('git push');
          }
          onClose();
        },
      },
      {
        id: 'git-pr',
        title: 'Create Pull Request',
        description: 'Open a new PR',
        category: 'git',
        icon: <GitPullRequest className="h-4 w-4" />,
        keywords: ['pr', 'pull request', 'merge'],
        action: () => {
          if (onRunCommand) {
            onRunCommand('create-pr');
          }
          onClose();
        },
      }
    );

    // Recent commands
    recentCommands.slice(0, 5).forEach((cmd, i) => {
      commands.push({
        id: `recent-${i}`,
        title: cmd,
        category: 'recent',
        icon: <History className="h-4 w-4" />,
        action: () => {
          if (onRunCommand) {
            onRunCommand(cmd);
          }
          onClose();
        },
      });
    });

    // Navigation
    commands.push(
      {
        id: 'nav-settings',
        title: 'Settings',
        description: 'Open settings',
        category: 'navigation',
        icon: <Settings className="h-4 w-4" />,
        keywords: ['settings', 'preferences', 'config'],
        shortcut: '⌘,',
        action: () => {
          onClose();
        },
      },
      {
        id: 'nav-terminal',
        title: 'Toggle Terminal',
        description: 'Show/hide terminal panel',
        category: 'navigation',
        icon: <Terminal className="h-4 w-4" />,
        keywords: ['terminal', 'console', 'shell'],
        shortcut: '⌘`',
        action: () => {
          onClose();
        },
      }
    );

    return commands;
  }, [files, branches, recentCommands, selectedText, onAIAction, onOpenFile, onCheckoutBranch, onRunCommand, onClose]);

  // Filter commands based on query and mode
  const filteredCommands = useMemo(() => {
    let commands = allCommands;

    // Filter by mode
    if (mode === 'ai') {
      commands = commands.filter(c => c.category === 'ai');
    } else if (mode === 'files') {
      commands = commands.filter(c => c.category === 'files');
    } else if (mode === 'git') {
      commands = commands.filter(c => c.category === 'git');
    } else if (mode === 'terminal') {
      commands = commands.filter(c => c.category === 'terminal' || c.category === 'recent');
    }

    // Filter by query
    if (query.trim()) {
      const lowerQuery = query.toLowerCase();
      commands = commands.filter(c => {
        const searchText = [
          c.title,
          c.description,
          ...(c.keywords || []),
        ].join(' ').toLowerCase();
        return searchText.includes(lowerQuery);
      });
    }

    // Sort by relevance (AI first, then recent, then alphabetical)
    commands.sort((a, b) => {
      if (a.category === 'ai' && b.category !== 'ai') return -1;
      if (b.category === 'ai' && a.category !== 'ai') return 1;
      if (a.category === 'recent' && b.category !== 'recent') return -1;
      if (b.category === 'recent' && a.category !== 'recent') return 1;
      return a.title.localeCompare(b.title);
    });

    return commands;
  }, [allCommands, query, mode]);

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups: CommandGroup[] = [];
    const byCategory = new Map<CommandCategory, CommandItem[]>();

    filteredCommands.forEach(cmd => {
      const items = byCategory.get(cmd.category) || [];
      items.push(cmd);
      byCategory.set(cmd.category, items);
    });

    byCategory.forEach((items, category) => {
      const config = CATEGORY_CONFIG[category];
      groups.push({
        category,
        title: config.title,
        icon: config.icon,
        items,
      });
    });

    return groups;
  }, [filteredCommands]);

  // Flatten for keyboard navigation
  const flatCommands = useMemo(() => {
    return groupedCommands.flatMap(g => g.items);
  }, [groupedCommands]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, flatCommands.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatCommands[activeIndex]) {
          flatCommands[activeIndex].action();
        }
        break;
      case 'Tab':
        e.preventDefault();
        // Check for mode prefixes
        if (query === '>') {
          setMode('ai');
          setQuery('');
        } else if (query === '/') {
          setMode('files');
          setQuery('');
        } else if (query === '@') {
          setMode('git');
          setQuery('');
        } else if (query === '!') {
          setMode('terminal');
          setQuery('');
        }
        break;
      case 'Backspace':
        if (query === '' && mode !== 'default') {
          setMode('default');
        }
        break;
      case 'Escape':
        if (mode !== 'default') {
          setMode('default');
          setQuery('');
        } else {
          onClose();
        }
        break;
    }
  }, [flatCommands, activeIndex, query, mode, onClose]);

  // Keep active item in view
  useEffect(() => {
    const activeElement = scrollRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    if (activeElement) {
      activeElement.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  // Reset active index when query changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query, mode]);

  // Handle natural language AI queries
  const handleNaturalLanguageQuery = useCallback(async () => {
    if (!query.trim() || !onAIAction) return;
    
    setIsLoading(true);
    try {
      await onAIAction('natural-language', query);
      onClose();
    } finally {
      setIsLoading(false);
    }
  }, [query, onAIAction, onClose]);

  const getModePrefix = () => {
    switch (mode) {
      case 'ai': return '>';
      case 'files': return '/';
      case 'git': return '@';
      case 'terminal': return '!';
      default: return '';
    }
  };

  const getModePlaceholder = () => {
    switch (mode) {
      case 'ai': return 'Ask AI anything...';
      case 'files': return 'Search files...';
      case 'git': return 'Git commands and branches...';
      case 'terminal': return 'Run command...';
      default: return 'Search commands, files, or ask AI...';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-0 gap-0 max-w-2xl overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          {mode !== 'default' && (
            <Badge variant="secondary" className="shrink-0">
              {CATEGORY_CONFIG[mode]?.icon}
              <span className="ml-1 text-xs">{CATEGORY_CONFIG[mode]?.title}</span>
            </Badge>
          )}
          <div className="flex items-center flex-1 gap-2">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={getModePlaceholder()}
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          {currentFile && (
            <Badge variant="outline" className="text-xs truncate max-w-[150px]">
              {currentFile.split('/').pop()}
            </Badge>
          )}
        </div>

        {/* Mode hints */}
        {mode === 'default' && !query && (
          <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground border-b bg-muted/30">
            <span>Type</span>
            <kbd className="px-1.5 py-0.5 bg-background rounded text-[10px] border">&gt;</kbd>
            <span>AI</span>
            <kbd className="px-1.5 py-0.5 bg-background rounded text-[10px] border">/</kbd>
            <span>Files</span>
            <kbd className="px-1.5 py-0.5 bg-background rounded text-[10px] border">@</kbd>
            <span>Git</span>
            <kbd className="px-1.5 py-0.5 bg-background rounded text-[10px] border">!</kbd>
            <span>Terminal</span>
          </div>
        )}

        {/* Results */}
        <ScrollArea className="max-h-[400px]" ref={scrollRef}>
          {groupedCommands.length > 0 ? (
            <div className="py-2">
              {groupedCommands.map((group, groupIndex) => (
                <div key={group.category}>
                  {/* Group header */}
                  <div className="flex items-center gap-2 px-4 py-1.5 text-xs font-medium text-muted-foreground">
                    {group.icon}
                    <span>{group.title}</span>
                    <span className="text-muted-foreground/50">
                      {group.items.length}
                    </span>
                  </div>

                  {/* Group items */}
                  {group.items.map((item, itemIndex) => {
                    const globalIndex = groupedCommands
                      .slice(0, groupIndex)
                      .reduce((acc, g) => acc + g.items.length, 0) + itemIndex;
                    const isActive = globalIndex === activeIndex;

                    return (
                      <button
                        key={item.id}
                        data-index={globalIndex}
                        className={cn(
                          'w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-muted/50 transition-colors',
                          isActive && 'bg-muted'
                        )}
                        onClick={() => item.action()}
                        onMouseEnter={() => setActiveIndex(globalIndex)}
                      >
                        <div className={cn(
                          'h-8 w-8 rounded-lg flex items-center justify-center shrink-0',
                          item.category === 'ai' ? 'bg-purple-500/10 text-purple-500' :
                          item.category === 'files' ? 'bg-blue-500/10 text-blue-500' :
                          item.category === 'git' ? 'bg-orange-500/10 text-orange-500' :
                          'bg-muted'
                        )}>
                          {item.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{item.title}</div>
                          {item.description && (
                            <div className="text-xs text-muted-foreground truncate">
                              {item.description}
                            </div>
                          )}
                        </div>
                        {item.shortcut && (
                          <kbd className="px-2 py-1 bg-muted rounded text-xs text-muted-foreground shrink-0">
                            {item.shortcut}
                          </kbd>
                        )}
                        <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                      </button>
                    );
                  })}

                  {groupIndex < groupedCommands.length - 1 && (
                    <Separator className="my-2" />
                  )}
                </div>
              ))}
            </div>
          ) : query.trim() && mode === 'ai' ? (
            /* Natural language AI prompt */
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <Wand2 className="h-5 w-5 text-purple-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Ask AI</p>
                  <p className="text-xs text-muted-foreground">
                    Press Enter to send: &quot;{query}&quot;
                  </p>
                </div>
                <button
                  className="px-3 py-1.5 rounded-md bg-purple-500 text-white text-sm font-medium hover:bg-purple-600 transition-colors"
                  onClick={handleNaturalLanguageQuery}
                >
                  Send
                </button>
              </div>
              
              {selectedText && (
                <div className="p-3 rounded-lg bg-muted text-xs">
                  <p className="text-muted-foreground mb-1">With context:</p>
                  <code className="text-xs line-clamp-3">{selectedText}</code>
                </div>
              )}
            </div>
          ) : (
            /* No results */
            <div className="py-8 text-center text-sm text-muted-foreground">
              No commands found
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-background rounded border">↑↓</kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-background rounded border">↵</kbd>
              Select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1 py-0.5 bg-background rounded border">esc</kbd>
              Close
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-purple-500" />
            <span>Powered by AI</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook for using the AI command palette
 */
export function useAICommandPalette() {
  const [isOpen, setIsOpen] = useState(false);

  // Register global keyboard shortcut
  useHotkeys('mod+k', (e) => {
    e.preventDefault();
    setIsOpen(true);
  }, { enableOnFormTags: true }, []);

  return {
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen(prev => !prev),
  };
}
