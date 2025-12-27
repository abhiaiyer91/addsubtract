import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Minus,
  Image,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BlockType, SlashCommand } from './types';

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'paragraph',
    label: 'Text',
    description: 'Just start writing with plain text',
    icon: <Type className="h-5 w-5" />,
    blockType: 'paragraph',
    keywords: ['text', 'paragraph', 'plain'],
  },
  {
    id: 'heading1',
    label: 'Heading 1',
    description: 'Large section heading',
    icon: <Heading1 className="h-5 w-5" />,
    blockType: 'heading1',
    keywords: ['h1', 'heading', 'title', 'large'],
    shortcut: '#',
  },
  {
    id: 'heading2',
    label: 'Heading 2',
    description: 'Medium section heading',
    icon: <Heading2 className="h-5 w-5" />,
    blockType: 'heading2',
    keywords: ['h2', 'heading', 'subtitle', 'medium'],
    shortcut: '##',
  },
  {
    id: 'heading3',
    label: 'Heading 3',
    description: 'Small section heading',
    icon: <Heading3 className="h-5 w-5" />,
    blockType: 'heading3',
    keywords: ['h3', 'heading', 'small'],
    shortcut: '###',
  },
  {
    id: 'bulletList',
    label: 'Bulleted list',
    description: 'Create a simple bulleted list',
    icon: <List className="h-5 w-5" />,
    blockType: 'bulletList',
    keywords: ['bullet', 'list', 'unordered', 'ul'],
    shortcut: '-',
  },
  {
    id: 'numberedList',
    label: 'Numbered list',
    description: 'Create a numbered list',
    icon: <ListOrdered className="h-5 w-5" />,
    blockType: 'numberedList',
    keywords: ['number', 'list', 'ordered', 'ol'],
    shortcut: '1.',
  },
  {
    id: 'todoList',
    label: 'To-do list',
    description: 'Track tasks with a to-do list',
    icon: <CheckSquare className="h-5 w-5" />,
    blockType: 'todoList',
    keywords: ['todo', 'checkbox', 'task', 'check'],
    shortcut: '[]',
  },
  {
    id: 'quote',
    label: 'Quote',
    description: 'Capture a quote',
    icon: <Quote className="h-5 w-5" />,
    blockType: 'quote',
    keywords: ['quote', 'blockquote', 'citation'],
    shortcut: '>',
  },
  {
    id: 'callout',
    label: 'Callout',
    description: 'Make writing stand out',
    icon: <AlertCircle className="h-5 w-5" />,
    blockType: 'callout',
    keywords: ['callout', 'alert', 'note', 'warning', 'info'],
  },
  {
    id: 'code',
    label: 'Code',
    description: 'Capture a code snippet',
    icon: <Code className="h-5 w-5" />,
    blockType: 'code',
    keywords: ['code', 'snippet', 'programming', 'pre'],
    shortcut: '```',
  },
  {
    id: 'divider',
    label: 'Divider',
    description: 'Visually divide blocks',
    icon: <Minus className="h-5 w-5" />,
    blockType: 'divider',
    keywords: ['divider', 'separator', 'hr', 'line'],
    shortcut: '---',
  },
  {
    id: 'toggle',
    label: 'Toggle',
    description: 'Toggleable content section',
    icon: <ChevronRight className="h-5 w-5" />,
    blockType: 'toggle',
    keywords: ['toggle', 'collapse', 'expand', 'accordion'],
  },
  {
    id: 'image',
    label: 'Image',
    description: 'Upload or embed an image',
    icon: <Image className="h-5 w-5" />,
    blockType: 'image',
    keywords: ['image', 'picture', 'photo', 'img'],
  },
];

interface SlashMenuProps {
  isOpen: boolean;
  query: string;
  position: { top: number; left: number };
  onSelect: (blockType: BlockType) => void;
  onClose: () => void;
}

export function SlashMenu({
  isOpen,
  query,
  position,
  onSelect,
  onClose,
}: SlashMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // Filter commands based on query
  const filteredCommands = SLASH_COMMANDS.filter((cmd) => {
    if (!query) return true;
    const lowerQuery = query.toLowerCase();
    return (
      cmd.label.toLowerCase().includes(lowerQuery) ||
      cmd.description.toLowerCase().includes(lowerQuery) ||
      cmd.keywords.some((kw) => kw.includes(lowerQuery))
    );
  });

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredCommands.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev > 0 ? prev - 1 : filteredCommands.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            onSelect(filteredCommands[selectedIndex].blockType);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [isOpen, filteredCommands, selectedIndex, onSelect, onClose]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Scroll selected item into view
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const selectedItem = menu.querySelector('[data-selected="true"]');
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[280px] max-h-[320px] overflow-y-auto bg-popover border rounded-lg shadow-lg"
      style={{
        top: position.top,
        left: position.left,
      }}
    >
      <div className="py-1">
        {filteredCommands.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No results found
          </div>
        ) : (
          <>
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Basic blocks
            </div>
            {filteredCommands.map((cmd, index) => (
              <button
                key={cmd.id}
                data-selected={index === selectedIndex}
                onClick={() => onSelect(cmd.blockType)}
                className={cn(
                  'w-full flex items-center gap-3 px-2 py-2 text-left transition-colors',
                  index === selectedIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-muted/50'
                )}
              >
                <div
                  className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-md border',
                    index === selectedIndex
                      ? 'bg-background border-border'
                      : 'bg-muted/30 border-transparent'
                  )}
                >
                  {cmd.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{cmd.label}</span>
                    {cmd.shortcut && (
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-muted rounded">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {cmd.description}
                  </p>
                </div>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export { SLASH_COMMANDS };
