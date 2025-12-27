import { useState, useRef, useEffect, useImperativeHandle, forwardRef, KeyboardEvent } from 'react';
import { Send, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  compact?: boolean;
}

export interface ChatInputRef {
  focus: () => void;
  setValue: (value: string) => void;
}

export const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(function ChatInput(
  {
    onSend,
    isLoading = false,
    disabled = false,
    placeholder = 'Ask anything...',
    compact = false,
  },
  ref
) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      textareaRef.current?.focus();
    },
    setValue: (value: string) => {
      setMessage(value);
      // Trigger resize after setting value
      setTimeout(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.style.height = 'auto';
          textarea.style.height = `${Math.min(textarea.scrollHeight, compact ? 120 : 200)}px`;
        }
      }, 0);
    },
  }));

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, compact ? 120 : 200)}px`;
    }
  }, [message, compact]);

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

  if (compact) {
    return (
      <div className="relative">
        <div
          className={cn(
            'flex items-end gap-2 p-2 rounded-xl border border-border/60',
            'bg-background/60 backdrop-blur-sm',
            'focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20',
            'transition-all duration-200'
          )}
        >
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isLoading}
            rows={1}
            className={cn(
              'flex-1 resize-none bg-transparent border-0 px-2 py-1',
              'text-foreground placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-0',
              'min-h-[28px] max-h-[120px]',
              'text-sm leading-relaxed'
            )}
          />

          <Button
            onClick={handleSubmit}
            disabled={!canSend}
            size="icon-sm"
            className={cn(
              'flex-shrink-0 h-7 w-7 transition-all duration-200',
              canSend
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    );
  }

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
});
