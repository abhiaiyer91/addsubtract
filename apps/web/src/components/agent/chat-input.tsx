import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  isLoading = false,
  disabled = false,
  placeholder = 'Ask the agent anything...',
}: ChatInputProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [message]);

  const handleSubmit = () => {
    const trimmed = message.trim();
    if (trimmed && !isLoading && !disabled) {
      onSend(trimmed);
      setMessage('');
      // Reset height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSend = message.trim().length > 0 && !isLoading && !disabled;

  return (
    <div className="relative">
      <div
        className={cn(
          'flex items-end gap-2 p-3 rounded-2xl border border-border/60',
          'bg-background/80 backdrop-blur-sm',
          'shadow-lg shadow-black/5',
          'focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20',
          'transition-all duration-200'
        )}
      >
        {/* Decorative sparkle icon */}
        <div className="flex-shrink-0 p-2">
          <Sparkles className="h-5 w-5 text-primary/60" />
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          rows={1}
          className={cn(
            'flex-1 resize-none bg-transparent border-0 p-0',
            'text-foreground placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-0',
            'min-h-[24px] max-h-[200px]',
            'text-sm leading-relaxed'
          )}
        />

        {/* Send button */}
        <Button
          onClick={handleSubmit}
          disabled={!canSend}
          size="icon-sm"
          className={cn(
            'flex-shrink-0 transition-all duration-200',
            canSend
              ? 'bg-primary text-primary-foreground shadow-glow'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Helper text */}
      <div className="flex items-center justify-between mt-2 px-2">
        <p className="text-xs text-muted-foreground">
          Press <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Enter</kbd> to send,{' '}
          <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Shift+Enter</kbd> for new line
        </p>
        {isLoading && (
          <p className="text-xs text-primary flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Agent is thinking...
          </p>
        )}
      </div>
    </div>
  );
}
