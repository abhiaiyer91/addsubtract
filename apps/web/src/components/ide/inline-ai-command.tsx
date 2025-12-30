import { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, Loader2, Check, X, Wand2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';

interface InlineAICommandProps {
  isOpen: boolean;
  onClose: () => void;
  selectedText: string;
  cursorPosition: { lineNumber: number; column: number };
  filePath: string;
  fileContent: string;
  onApply: (newContent: string) => void;
  repoId: string;
}

// Quick action suggestions based on context
const QUICK_ACTIONS = [
  { id: 'explain', label: 'Explain', icon: '💡', prompt: 'Explain what this code does' },
  { id: 'refactor', label: 'Refactor', icon: '✨', prompt: 'Refactor this code to be cleaner and more maintainable' },
  { id: 'fix', label: 'Fix', icon: '🔧', prompt: 'Fix any bugs or issues in this code' },
  { id: 'tests', label: 'Add Tests', icon: '🧪', prompt: 'Write unit tests for this code' },
  { id: 'docs', label: 'Document', icon: '📝', prompt: 'Add documentation comments to this code' },
  { id: 'types', label: 'Add Types', icon: '📐', prompt: 'Add TypeScript types to this code' },
];

export function InlineAICommand({
  isOpen,
  onClose,
  selectedText,
  cursorPosition,
  filePath,
  fileContent,
  onApply,
  repoId,
}: InlineAICommandProps) {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Reset state when closed
  useEffect(() => {
    if (!isOpen) {
      setPrompt('');
      setResult(null);
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  // AI edit mutation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editMutation = (trpc as any).agent?.inlineEdit?.useMutation?.({
    onSuccess: (data: { result: string }) => {
      setResult(data.result);
      setIsLoading(false);
    },
    onError: (err: Error) => {
      setError(err.message);
      setIsLoading(false);
    },
  });

  const handleSubmit = useCallback(
    async (customPrompt?: string) => {
      const finalPrompt = customPrompt || prompt;
      if (!finalPrompt.trim()) return;

      setIsLoading(true);
      setError(null);
      setResult(null);

      if (editMutation?.mutate) {
        editMutation.mutate({
          repoId,
          filePath,
          selectedText: selectedText || undefined,
          fileContent,
          cursorLine: cursorPosition.lineNumber,
          prompt: finalPrompt,
        });
      } else {
        setError('Inline edit not available. Configure AI in repository settings.');
        setIsLoading(false);
      }
    },
    [prompt, repoId, filePath, selectedText, fileContent, cursorPosition, editMutation]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleApply = () => {
    if (result) {
      onApply(result);
      onClose();
    }
  };

  const handleQuickAction = (action: typeof QUICK_ACTIONS[0]) => {
    setPrompt(action.prompt);
    handleSubmit(action.prompt);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
        onClick={onClose}
      />

      {/* Command panel */}
      <div
        ref={containerRef}
        className={cn(
          'fixed left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 z-[101]',
          'w-full max-w-lg',
          'bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl shadow-black/50',
          'overflow-hidden'
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Wand2 className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-zinc-100">AI Edit</div>
            <div className="text-xs text-zinc-500">
              {selectedText ? `${selectedText.split('\n').length} lines selected` : 'At cursor position'}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 text-zinc-400 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Quick actions (when no prompt yet) */}
        {!isLoading && !result && (
          <div className="px-4 py-2 border-b border-zinc-800/50">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleQuickAction(action)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md',
                    'bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600',
                    'text-xs text-zinc-300 hover:text-zinc-100',
                    'transition-all duration-150'
                  )}
                >
                  <span>{action.icon}</span>
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input area */}
        {!result && (
          <div className="p-4">
            <div className="relative">
              <Textarea
                ref={inputRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  selectedText
                    ? 'What should I do with this code?'
                    : 'What code should I write here?'
                }
                disabled={isLoading}
                className={cn(
                  'min-h-[80px] max-h-[200px] resize-none',
                  'bg-zinc-800/50 border-zinc-700 focus:border-violet-500',
                  'placeholder:text-zinc-600 text-zinc-200',
                  'focus:ring-1 focus:ring-violet-500/50'
                )}
              />
              {isLoading && (
                <div className="absolute bottom-3 right-3 flex items-center gap-2 text-xs text-violet-400">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Thinking...</span>
                </div>
              )}
            </div>

            {/* Submit button */}
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2 text-xs text-zinc-600">
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-[10px]">
                  {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+⏎
                </kbd>
                <span>to submit</span>
              </div>
              <Button
                size="sm"
                onClick={() => handleSubmit()}
                disabled={!prompt.trim() || isLoading}
                className="bg-violet-600 hover:bg-violet-500 text-white h-8 px-4 gap-2"
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Generate
              </Button>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="px-4 py-3 bg-red-500/10 border-t border-red-500/20">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Result preview */}
        {result && (
          <div className="flex flex-col max-h-[400px]">
            <div className="px-4 py-2 border-b border-zinc-800 bg-zinc-800/30">
              <span className="text-xs text-zinc-400">Preview</span>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-zinc-950">
              <pre className="text-sm font-mono text-zinc-300 whitespace-pre-wrap">
                {result}
              </pre>
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 bg-zinc-900">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setResult(null);
                  setPrompt('');
                }}
                className="text-zinc-400 hover:text-zinc-200"
              >
                <ArrowRight className="h-3.5 w-3.5 mr-1.5 rotate-180" />
                Try again
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleApply}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5"
                >
                  <Check className="h-3.5 w-3.5" />
                  Apply
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Context display */}
        {selectedText && !result && (
          <div className="px-4 py-3 border-t border-zinc-800/50 bg-zinc-900/50">
            <div className="text-xs text-zinc-500 mb-2">Selected code:</div>
            <pre className="text-xs font-mono text-zinc-400 max-h-20 overflow-auto bg-zinc-800/50 rounded-md p-2">
              {selectedText.length > 200 ? selectedText.slice(0, 200) + '...' : selectedText}
            </pre>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Hook to manage inline AI command state
 */
export function useInlineAICommand() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [cursorPosition, setCursorPosition] = useState({ lineNumber: 1, column: 1 });

  const open = useCallback((text: string, position: { lineNumber: number; column: number }) => {
    setSelectedText(text);
    setCursorPosition(position);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setSelectedText('');
  }, []);

  return {
    isOpen,
    selectedText,
    cursorPosition,
    open,
    close,
  };
}
