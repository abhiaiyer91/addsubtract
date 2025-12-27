import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react';
import {
  GripVertical,
  Plus,
  Trash2,
  Copy,
  ChevronRight,
  ChevronDown,
  Check,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Block, BlockType } from './types';

// Callout colors
const CALLOUT_COLORS = {
  default: 'bg-muted/50 border-muted-foreground/20',
  blue: 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800',
  green: 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800',
  yellow: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800',
  red: 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800',
  purple: 'bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800',
};

// Callout icons
const CALLOUT_ICONS = ['💡', '📝', '⚠️', '❌', '✅', 'ℹ️', '🔥', '🎯', '🚀', '💬'];

// Code languages
const CODE_LANGUAGES = [
  'typescript',
  'javascript',
  'python',
  'rust',
  'go',
  'java',
  'c',
  'cpp',
  'csharp',
  'ruby',
  'php',
  'swift',
  'kotlin',
  'scala',
  'sql',
  'html',
  'css',
  'json',
  'yaml',
  'markdown',
  'bash',
  'text',
];

interface BlockItemProps {
  block: Block;
  isSelected: boolean;
  isFocused: boolean;
  isDragging?: boolean;
  onUpdate: (updates: Partial<Block>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddBlockAfter: (type?: BlockType) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  onSlashCommand: (query: string, cursorPosition: { top: number; left: number }) => void;
  onCloseSlashMenu: () => void;
  dragHandleProps?: any;
}

export function BlockItem({
  block,
  isFocused,
  isDragging,
  onUpdate,
  onDelete,
  onDuplicate,
  onAddBlockAfter,
  onFocus,
  onBlur,
  onKeyDown,
  onSlashCommand,
  onCloseSlashMenu,
  dragHandleProps,
}: BlockItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  // Focus the input when block is focused
  useEffect(() => {
    if (isFocused && inputRef.current) {
      inputRef.current.focus();
      // Move cursor to end
      if ('setSelectionRange' in inputRef.current) {
        const len = inputRef.current.value.length;
        inputRef.current.setSelectionRange(len, len);
      }
    }
  }, [isFocused]);

  // Auto-resize textarea
  const autoResize = useCallback((element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    element.style.height = element.scrollHeight + 'px';
  }, []);

  // Handle content change
  const handleContentChange = (value: string) => {
    // Check for slash command trigger
    if (value.startsWith('/') && block.content === '') {
      const query = value.slice(1);
      const rect = inputRef.current?.getBoundingClientRect();
      if (rect) {
        onSlashCommand(query, {
          top: rect.bottom + 4,
          left: rect.left,
        });
      }
    } else if (!value.includes('/') || value.indexOf('/') !== 0) {
      onCloseSlashMenu();
    }

    onUpdate({ content: value });
  };

  // Handle checkbox toggle for todo items
  const handleTodoToggle = () => {
    onUpdate({ checked: !block.checked });
  };

  // Handle toggle collapse
  const handleToggleCollapse = () => {
    onUpdate({ collapsed: !block.collapsed });
  };

  // Render the appropriate input for the block type
  const renderBlockContent = () => {
    const commonInputProps = {
      ref: inputRef as React.Ref<HTMLTextAreaElement>,
      value: block.content,
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        handleContentChange(e.target.value);
        if (e.target instanceof HTMLTextAreaElement) {
          autoResize(e.target);
        }
      },
      onFocus,
      onBlur,
      onKeyDown,
      className: cn(
        'w-full bg-transparent border-0 outline-none resize-none',
        'placeholder:text-muted-foreground/40',
        'focus-visible:ring-0'
      ),
      rows: 1,
    };

    switch (block.type) {
      case 'heading1':
        return (
          <textarea
            {...commonInputProps}
            placeholder="Heading 1"
            className={cn(commonInputProps.className, 'text-3xl font-bold')}
          />
        );

      case 'heading2':
        return (
          <textarea
            {...commonInputProps}
            placeholder="Heading 2"
            className={cn(commonInputProps.className, 'text-2xl font-semibold')}
          />
        );

      case 'heading3':
        return (
          <textarea
            {...commonInputProps}
            placeholder="Heading 3"
            className={cn(commonInputProps.className, 'text-xl font-medium')}
          />
        );

      case 'bulletList':
        return (
          <div className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-foreground mt-2.5 flex-shrink-0" />
            <textarea
              {...commonInputProps}
              placeholder="List item"
              className={cn(commonInputProps.className, 'flex-1')}
            />
          </div>
        );

      case 'numberedList':
        return (
          <div className="flex items-start gap-2">
            <span className="text-muted-foreground font-medium tabular-nums min-w-[1.5rem] text-right">
              {block.listNumber || 1}.
            </span>
            <textarea
              {...commonInputProps}
              placeholder="List item"
              className={cn(commonInputProps.className, 'flex-1')}
            />
          </div>
        );

      case 'todoList':
        return (
          <div className="flex items-start gap-2">
            <button
              onClick={handleTodoToggle}
              className={cn(
                'w-4 h-4 mt-1 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors',
                block.checked
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-muted-foreground/30 hover:border-primary'
              )}
            >
              {block.checked && <Check className="h-3 w-3" />}
            </button>
            <textarea
              {...commonInputProps}
              placeholder="To-do"
              className={cn(
                commonInputProps.className,
                'flex-1',
                block.checked && 'line-through text-muted-foreground'
              )}
            />
          </div>
        );

      case 'quote':
        return (
          <div className="flex items-stretch gap-3">
            <div className="w-1 bg-foreground/20 rounded-full flex-shrink-0" />
            <textarea
              {...commonInputProps}
              placeholder="Quote"
              className={cn(commonInputProps.className, 'flex-1 italic')}
            />
          </div>
        );

      case 'callout':
        return (
          <div
            className={cn(
              'flex items-start gap-3 p-3 rounded-lg border',
              CALLOUT_COLORS[block.color || 'default']
            )}
          >
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="text-xl hover:scale-110 transition-transform"
            >
              {block.icon || '💡'}
            </button>
            <textarea
              {...commonInputProps}
              placeholder="Type something..."
              className={cn(commonInputProps.className, 'flex-1')}
            />
            {showColorPicker && (
              <div className="absolute z-50 mt-8 p-2 bg-popover border rounded-lg shadow-lg">
                <div className="flex flex-wrap gap-1 mb-2 max-w-[200px]">
                  {CALLOUT_ICONS.map((icon) => (
                    <button
                      key={icon}
                      onClick={() => {
                        onUpdate({ icon });
                        setShowColorPicker(false);
                      }}
                      className="p-1.5 text-lg hover:bg-muted rounded"
                    >
                      {icon}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 pt-2 border-t">
                  {Object.keys(CALLOUT_COLORS).map((color) => (
                    <button
                      key={color}
                      onClick={() => {
                        onUpdate({ color: color as Block['color'] });
                        setShowColorPicker(false);
                      }}
                      className={cn(
                        'w-6 h-6 rounded-full border-2',
                        color === block.color
                          ? 'ring-2 ring-primary ring-offset-2'
                          : '',
                        color === 'default' && 'bg-muted',
                        color === 'blue' && 'bg-blue-400',
                        color === 'green' && 'bg-green-400',
                        color === 'yellow' && 'bg-yellow-400',
                        color === 'red' && 'bg-red-400',
                        color === 'purple' && 'bg-purple-400'
                      )}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'code':
        return (
          <div className="relative">
            <div className="absolute top-2 right-2 z-10">
              <button
                onClick={() => setShowLanguagePicker(!showLanguagePicker)}
                className="px-2 py-0.5 text-xs text-muted-foreground bg-muted/50 rounded hover:bg-muted"
              >
                {block.language || 'text'}
              </button>
              {showLanguagePicker && (
                <div className="absolute right-0 mt-1 p-1 bg-popover border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                  {CODE_LANGUAGES.map((lang) => (
                    <button
                      key={lang}
                      onClick={() => {
                        onUpdate({ language: lang });
                        setShowLanguagePicker(false);
                      }}
                      className={cn(
                        'block w-full px-3 py-1 text-sm text-left rounded hover:bg-muted',
                        lang === block.language && 'bg-muted'
                      )}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <textarea
              {...commonInputProps}
              placeholder="// Write code..."
              className={cn(
                commonInputProps.className,
                'font-mono text-sm p-3 bg-muted/50 rounded-lg'
              )}
            />
          </div>
        );

      case 'divider':
        return (
          <div className="py-2 flex items-center justify-center group cursor-pointer">
            <div className="flex-1 h-px bg-border" />
          </div>
        );

      case 'toggle':
        return (
          <div>
            <div className="flex items-start gap-1">
              <button
                onClick={handleToggleCollapse}
                className="p-0.5 rounded hover:bg-muted transition-colors"
              >
                {block.collapsed ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              <textarea
                {...commonInputProps}
                placeholder="Toggle"
                className={cn(commonInputProps.className, 'flex-1 font-medium')}
              />
            </div>
            {!block.collapsed && (
              <div className="ml-6 mt-1 pl-3 border-l-2 border-muted">
                <span className="text-sm text-muted-foreground italic">
                  Empty. Click to add content.
                </span>
              </div>
            )}
          </div>
        );

      case 'image':
        return (
          <div className="space-y-2">
            {block.url ? (
              <div className="relative group">
                <img
                  src={block.url}
                  alt={block.caption || ''}
                  className="max-w-full rounded-lg"
                />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-lg">
                  <button className="px-3 py-1.5 text-sm bg-white text-black rounded hover:bg-gray-100">
                    Replace
                  </button>
                  <button
                    onClick={() => onUpdate({ url: '', caption: '' })}
                    className="px-3 py-1.5 text-sm bg-white text-black rounded hover:bg-gray-100"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed rounded-lg p-8 text-center">
                <input
                  type="text"
                  placeholder="Paste image URL..."
                  className="w-full max-w-md mx-auto px-3 py-2 text-sm border rounded-lg bg-background"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const value = (e.target as HTMLInputElement).value;
                      onUpdate({ url: value });
                    }
                  }}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Press Enter to add image
                </p>
              </div>
            )}
            {block.url && (
              <input
                type="text"
                value={block.caption || ''}
                onChange={(e) => onUpdate({ caption: e.target.value })}
                placeholder="Add a caption..."
                className="w-full text-center text-sm text-muted-foreground bg-transparent border-0 outline-none"
              />
            )}
          </div>
        );

      default:
        return (
          <textarea
            {...commonInputProps}
            placeholder="Type '/' for commands..."
            className={cn(commonInputProps.className, 'leading-relaxed')}
          />
        );
    }
  };

  return (
    <div
      className={cn(
        'group relative flex items-start gap-0 py-0.5 -mx-10 px-10 rounded transition-colors',
        isDragging && 'opacity-50',
        isHovered && !isDragging && 'bg-muted/30'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Left controls - only visible on hover */}
      <div
        className={cn(
          'absolute left-0 flex items-center gap-0.5 transition-opacity',
          isHovered ? 'opacity-100' : 'opacity-0'
        )}
        style={{ top: '2px' }}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1 rounded hover:bg-muted transition-colors">
              <Plus className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={() => onAddBlockAfter()}>
              <Plus className="mr-2 h-4 w-4" />
              Add block below
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          {...dragHandleProps}
          className="p-1 rounded hover:bg-muted transition-colors cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Block content */}
      <div className="flex-1 min-w-0">{renderBlockContent()}</div>
    </div>
  );
}
