import { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  MessageSquare,
  Wand2,
  TestTube,
  FileText,
  Bug,
  Scissors,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SelectionAction {
  id: string;
  label: string;
  icon: React.ElementType;
  prompt: string;
  color?: string;
}

const SELECTION_ACTIONS: SelectionAction[] = [
  {
    id: 'explain',
    label: 'Explain',
    icon: MessageSquare,
    prompt: 'Explain what this code does in simple terms',
    color: 'text-blue-400',
  },
  {
    id: 'refactor',
    label: 'Refactor',
    icon: Sparkles,
    prompt: 'Refactor this code to be cleaner and more maintainable',
    color: 'text-purple-400',
  },
  {
    id: 'fix',
    label: 'Fix Issues',
    icon: Bug,
    prompt: 'Fix any bugs, issues, or potential problems in this code',
    color: 'text-red-400',
  },
  {
    id: 'tests',
    label: 'Add Tests',
    icon: TestTube,
    prompt: 'Write comprehensive unit tests for this code',
    color: 'text-green-400',
  },
  {
    id: 'docs',
    label: 'Document',
    icon: FileText,
    prompt: 'Add clear documentation comments to this code',
    color: 'text-amber-400',
  },
  {
    id: 'simplify',
    label: 'Simplify',
    icon: Scissors,
    prompt: 'Simplify this code while maintaining the same functionality',
    color: 'text-cyan-400',
  },
];

interface SelectionActionsProps {
  position: { x: number; y: number } | null;
  selectedText: string;
  onAction: (prompt: string) => void;
  onDismiss: () => void;
}

export function SelectionActions({
  position,
  selectedText,
  onAction,
  onDismiss,
}: SelectionActionsProps) {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Show with slight delay to avoid flickering
  useEffect(() => {
    if (position && selectedText.trim().length >= 5) {
      const timer = setTimeout(() => setIsVisible(true), 150);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [position, selectedText]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isVisible, onDismiss]);

  if (!position || !isVisible) return null;

  // Adjust position to stay in viewport
  const adjustedX = Math.min(position.x, window.innerWidth - 320);
  const adjustedY = Math.min(position.y + 10, window.innerHeight - 60);

  return (
    <div
      ref={containerRef}
      className={cn(
        'fixed z-[200] flex items-center gap-1',
        'p-1 rounded-lg',
        'bg-zinc-900/95 backdrop-blur-md border border-zinc-700',
        'shadow-xl shadow-black/50',
        'animate-in fade-in-0 zoom-in-95 duration-150'
      )}
      style={{
        left: adjustedX,
        top: adjustedY,
      }}
    >
      {SELECTION_ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <Button
            key={action.id}
            variant="ghost"
            size="sm"
            className={cn(
              'h-7 px-2 gap-1.5 text-xs',
              'hover:bg-zinc-800',
              action.color || 'text-zinc-300'
            )}
            onClick={() => {
              onAction(action.prompt);
              onDismiss();
            }}
            title={action.prompt}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{action.label}</span>
          </Button>
        );
      })}
      
      {/* Custom prompt with Cmd+K */}
      <div className="border-l border-zinc-700 ml-1 pl-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 gap-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
          onClick={() => {
            onAction('');  // Empty prompt triggers Cmd+K dialog
            onDismiss();
          }}
        >
          <Wand2 className="h-3.5 w-3.5" />
          <kbd className="text-[10px] bg-zinc-800 px-1 rounded">⌘K</kbd>
        </Button>
      </div>
      
      {/* Dismiss */}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 ml-1"
        onClick={onDismiss}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

/**
 * Hook to track selection and show action bar
 */
export function useSelectionActions() {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');

  const showAt = (x: number, y: number, text: string) => {
    setPosition({ x, y });
    setSelectedText(text);
  };

  const dismiss = () => {
    setPosition(null);
    setSelectedText('');
  };

  return {
    position,
    selectedText,
    showAt,
    dismiss,
  };
}
