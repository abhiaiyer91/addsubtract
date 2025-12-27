import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Link,
  Highlighter,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormattingToolbarProps {
  containerRef: React.RefObject<HTMLElement>;
  onFormat: (format: FormatType, value?: string) => void;
}

export type FormatType =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strikethrough'
  | 'code'
  | 'link'
  | 'highlight';

interface ToolbarButton {
  format: FormatType;
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
}

const TOOLBAR_BUTTONS: ToolbarButton[] = [
  {
    format: 'bold',
    icon: <Bold className="h-3.5 w-3.5" />,
    label: 'Bold',
    shortcut: '⌘B',
  },
  {
    format: 'italic',
    icon: <Italic className="h-3.5 w-3.5" />,
    label: 'Italic',
    shortcut: '⌘I',
  },
  {
    format: 'underline',
    icon: <Underline className="h-3.5 w-3.5" />,
    label: 'Underline',
    shortcut: '⌘U',
  },
  {
    format: 'strikethrough',
    icon: <Strikethrough className="h-3.5 w-3.5" />,
    label: 'Strikethrough',
  },
  {
    format: 'code',
    icon: <Code className="h-3.5 w-3.5" />,
    label: 'Code',
    shortcut: '⌘E',
  },
  {
    format: 'link',
    icon: <Link className="h-3.5 w-3.5" />,
    label: 'Link',
    shortcut: '⌘K',
  },
  {
    format: 'highlight',
    icon: <Highlighter className="h-3.5 w-3.5" />,
    label: 'Highlight',
  },
];

export function FormattingToolbar({
  containerRef,
  onFormat,
}: FormattingToolbarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [linkMode, setLinkMode] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkInputRef = useRef<HTMLInputElement>(null);

  const handleSelectionChange = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !containerRef.current) {
      setIsVisible(false);
      setLinkMode(false);
      return;
    }

    // Check if selection is within our container
    const range = selection.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) {
      setIsVisible(false);
      return;
    }

    // Get selection bounds
    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    // Position toolbar above selection
    setPosition({
      top: rect.top - containerRect.top - 40,
      left: rect.left - containerRect.left + rect.width / 2,
    });
    setIsVisible(true);
  }, [containerRef]);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [handleSelectionChange]);

  // Focus link input when entering link mode
  useEffect(() => {
    if (linkMode && linkInputRef.current) {
      linkInputRef.current.focus();
    }
  }, [linkMode]);

  const handleFormatClick = (format: FormatType) => {
    if (format === 'link') {
      setLinkMode(true);
    } else {
      onFormat(format);
    }
  };

  const handleLinkSubmit = () => {
    if (linkUrl) {
      onFormat('link', linkUrl);
      setLinkUrl('');
    }
    setLinkMode(false);
  };

  if (!isVisible) return null;

  return (
    <div
      ref={toolbarRef}
      className="absolute z-50 flex items-center gap-0.5 px-1 py-0.5 bg-popover border rounded-lg shadow-lg"
      style={{
        top: position.top,
        left: position.left,
        transform: 'translateX(-50%)',
      }}
    >
      {linkMode ? (
        <div className="flex items-center gap-1 px-1">
          <input
            ref={linkInputRef}
            type="text"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleLinkSubmit();
              }
              if (e.key === 'Escape') {
                setLinkMode(false);
                setLinkUrl('');
              }
            }}
            placeholder="Paste link..."
            className="w-48 px-2 py-1 text-sm bg-transparent border-0 outline-none"
          />
          <button
            onClick={handleLinkSubmit}
            className="px-2 py-1 text-xs font-medium text-primary hover:bg-muted rounded"
          >
            Apply
          </button>
        </div>
      ) : (
        <>
          {TOOLBAR_BUTTONS.map((btn) => (
            <button
              key={btn.format}
              onClick={() => handleFormatClick(btn.format)}
              className={cn(
                'p-1.5 rounded hover:bg-muted transition-colors',
                'text-muted-foreground hover:text-foreground'
              )}
              title={`${btn.label}${btn.shortcut ? ` (${btn.shortcut})` : ''}`}
            >
              {btn.icon}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

// Helper to apply markdown formatting
export function applyMarkdownFormat(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  format: FormatType,
  linkUrl?: string
): { newText: string; newSelectionStart: number; newSelectionEnd: number } {
  const before = text.slice(0, selectionStart);
  const selected = text.slice(selectionStart, selectionEnd);
  const after = text.slice(selectionEnd);

  let prefix = '';
  let suffix = '';

  switch (format) {
    case 'bold':
      prefix = '**';
      suffix = '**';
      break;
    case 'italic':
      prefix = '_';
      suffix = '_';
      break;
    case 'underline':
      // Markdown doesn't have underline, use HTML
      prefix = '<u>';
      suffix = '</u>';
      break;
    case 'strikethrough':
      prefix = '~~';
      suffix = '~~';
      break;
    case 'code':
      prefix = '`';
      suffix = '`';
      break;
    case 'link':
      prefix = '[';
      suffix = `](${linkUrl || 'url'})`;
      break;
    case 'highlight':
      prefix = '==';
      suffix = '==';
      break;
  }

  const newText = before + prefix + selected + suffix + after;
  const newSelectionStart = selectionStart + prefix.length;
  const newSelectionEnd = selectionEnd + prefix.length;

  return { newText, newSelectionStart, newSelectionEnd };
}
