import { useState, useRef, useCallback } from 'react';
import {
  Bold,
  Italic,
  Code,
  Link,
  List,
  ListOrdered,
  Quote,
  Heading2,
  Image,
  Eye,
  Edit3,
  AtSign,
  Hash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Markdown } from '@/components/markdown/renderer';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface RichEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minRows?: number;
  maxRows?: number;
  disabled?: boolean;
  className?: string;
  showToolbar?: boolean;
  autoFocus?: boolean;
}

interface ToolbarAction {
  icon: React.ReactNode;
  label: string;
  prefix: string;
  suffix: string;
  block?: boolean;
}

const toolbarActions: ToolbarAction[] = [
  { icon: <Bold className="h-4 w-4" />, label: 'Bold', prefix: '**', suffix: '**' },
  { icon: <Italic className="h-4 w-4" />, label: 'Italic', prefix: '_', suffix: '_' },
  { icon: <Code className="h-4 w-4" />, label: 'Code', prefix: '`', suffix: '`' },
  { icon: <Link className="h-4 w-4" />, label: 'Link', prefix: '[', suffix: '](url)' },
  { icon: <Heading2 className="h-4 w-4" />, label: 'Heading', prefix: '## ', suffix: '', block: true },
  { icon: <Quote className="h-4 w-4" />, label: 'Quote', prefix: '> ', suffix: '', block: true },
  { icon: <List className="h-4 w-4" />, label: 'Bullet list', prefix: '- ', suffix: '', block: true },
  { icon: <ListOrdered className="h-4 w-4" />, label: 'Numbered list', prefix: '1. ', suffix: '', block: true },
  { icon: <Image className="h-4 w-4" />, label: 'Image', prefix: '![alt](', suffix: ')' },
];

export function RichEditor({
  value,
  onChange,
  placeholder = 'Write something...',
  minRows = 4,
  maxRows = 20,
  disabled = false,
  className,
  showToolbar = true,
  autoFocus = false,
}: RichEditorProps) {
  const [activeTab, setActiveTab] = useState<'write' | 'preview'>('write');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertText = useCallback(
    (action: ToolbarAction) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = value.substring(start, end);
      const beforeText = value.substring(0, start);
      const afterText = value.substring(end);

      let newText: string;
      let newCursorPos: number;

      if (action.block) {
        // For block elements, add on new line if not at start
        const needsNewline = start > 0 && !beforeText.endsWith('\n');
        const prefix = needsNewline ? '\n' + action.prefix : action.prefix;
        newText = beforeText + prefix + selectedText + action.suffix + afterText;
        newCursorPos = start + prefix.length + selectedText.length + action.suffix.length;
      } else {
        newText = beforeText + action.prefix + selectedText + action.suffix + afterText;
        newCursorPos = selectedText
          ? start + action.prefix.length + selectedText.length + action.suffix.length
          : start + action.prefix.length;
      }

      onChange(newText);

      // Restore focus and cursor position
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    },
    [value, onChange]
  );

  const insertMention = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const beforeText = value.substring(0, start);
    const afterText = value.substring(start);
    const newText = beforeText + '@' + afterText;

    onChange(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + 1, start + 1);
    }, 0);
  }, [value, onChange]);

  const insertIssueRef = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const beforeText = value.substring(0, start);
    const afterText = value.substring(start);
    const newText = beforeText + '#' + afterText;

    onChange(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + 1, start + 1);
    }, 0);
  }, [value, onChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Cmd/Ctrl + B for bold
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        insertText(toolbarActions[0]);
      }
      // Cmd/Ctrl + I for italic
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault();
        insertText(toolbarActions[1]);
      }
      // Cmd/Ctrl + K for link
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        insertText(toolbarActions[3]);
      }
      // Tab for indentation
      if (e.key === 'Tab') {
        e.preventDefault();
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newText = value.substring(0, start) + '  ' + value.substring(end);
        onChange(newText);

        setTimeout(() => {
          textarea.setSelectionRange(start + 2, start + 2);
        }, 0);
      }
    },
    [insertText, value, onChange]
  );

  return (
    <div className={cn('border rounded-lg overflow-hidden', className)}>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'write' | 'preview')}>
        {/* Header with tabs and toolbar */}
        <div className="flex items-center justify-between border-b bg-muted/30 px-2">
          <TabsList className="h-9 bg-transparent">
            <TabsTrigger value="write" className="gap-1.5 text-xs">
              <Edit3 className="h-3 w-3" />
              Write
            </TabsTrigger>
            <TabsTrigger value="preview" className="gap-1.5 text-xs">
              <Eye className="h-3 w-3" />
              Preview
            </TabsTrigger>
          </TabsList>

          {/* Toolbar - only show in write mode */}
          {showToolbar && activeTab === 'write' && (
            <TooltipProvider delayDuration={300}>
              <div className="flex items-center gap-0.5">
                {toolbarActions.map((action, idx) => (
                  <Tooltip key={idx}>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => insertText(action)}
                        disabled={disabled}
                      >
                        {action.icon}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      {action.label}
                    </TooltipContent>
                  </Tooltip>
                ))}
                <div className="w-px h-4 bg-border mx-1" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={insertMention}
                      disabled={disabled}
                    >
                      <AtSign className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Mention user
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={insertIssueRef}
                      disabled={disabled}
                    >
                      <Hash className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Reference issue
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          )}
        </div>

        {/* Content */}
        <TabsContent value="write" className="m-0">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            autoFocus={autoFocus}
            className="border-0 rounded-none focus-visible:ring-0 resize-none"
            style={{
              minHeight: `${minRows * 1.5}rem`,
              maxHeight: `${maxRows * 1.5}rem`,
            }}
          />
        </TabsContent>

        <TabsContent value="preview" className="m-0">
          <div
            className="p-4 prose prose-sm dark:prose-invert max-w-none overflow-y-auto"
            style={{
              minHeight: `${minRows * 1.5}rem`,
              maxHeight: `${maxRows * 1.5}rem`,
            }}
          >
            {value ? (
              <Markdown content={value} />
            ) : (
              <p className="text-muted-foreground italic">Nothing to preview</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Footer with tips */}
      <div className="px-3 py-1.5 border-t bg-muted/20 text-xs text-muted-foreground flex items-center justify-between">
        <span>Markdown supported</span>
        <span className="hidden sm:inline">
          <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">⌘B</kbd> bold
          <span className="mx-2">·</span>
          <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">⌘I</kbd> italic
          <span className="mx-2">·</span>
          <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">⌘K</kbd> link
        </span>
      </div>
    </div>
  );
}
