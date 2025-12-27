import { useState, useRef, useEffect } from 'react';
import { Send, X, Lightbulb, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface CommentFormProps {
  /** Called when comment is submitted */
  onSubmit: (body: string, suggestion?: string) => void;
  /** Called when form is cancelled */
  onCancel?: () => void;
  /** Placeholder text */
  placeholder?: string;
  /** Initial value for the textarea */
  initialValue?: string;
  /** Whether the form is in a loading state */
  isLoading?: boolean;
  /** Whether to auto-focus the textarea */
  autoFocus?: boolean;
  /** Submit button text */
  submitText?: string;
  /** Whether to show cancel button */
  showCancel?: boolean;
  /** Additional class name for the container */
  className?: string;
  /** Whether this is a reply form (smaller styling) */
  isReply?: boolean;
  /** Whether to show the suggestion mode toggle */
  showSuggestionMode?: boolean;
  /** Original code for the suggestion (lines being commented on) */
  originalCode?: string;
}

export function CommentForm({
  onSubmit,
  onCancel,
  placeholder = 'Leave a comment...',
  initialValue = '',
  isLoading = false,
  autoFocus = true,
  submitText = 'Comment',
  showCancel = true,
  className,
  isReply = false,
  showSuggestionMode = false,
  originalCode = '',
}: CommentFormProps) {
  const [body, setBody] = useState(initialValue);
  const [isSuggestionMode, setIsSuggestionMode] = useState(false);
  const [suggestion, setSuggestion] = useState(originalCode);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const suggestionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    // When entering suggestion mode, pre-fill with original code
    if (isSuggestionMode && originalCode) {
      setSuggestion(originalCode);
      // Focus the suggestion editor
      setTimeout(() => {
        suggestionRef.current?.focus();
      }, 100);
    }
  }, [isSuggestionMode, originalCode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (body.trim() && !isLoading) {
      if (isSuggestionMode && suggestion.trim()) {
        onSubmit(body.trim(), suggestion.trim());
      } else {
        onSubmit(body.trim());
      }
      setBody('');
      setSuggestion(originalCode);
      setIsSuggestionMode(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Cmd/Ctrl + Enter
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (body.trim() && !isLoading) {
        if (isSuggestionMode && suggestion.trim()) {
          onSubmit(body.trim(), suggestion.trim());
        } else {
          onSubmit(body.trim());
        }
        setBody('');
        setSuggestion(originalCode);
        setIsSuggestionMode(false);
      }
    }
    // Cancel on Escape
    if (e.key === 'Escape' && onCancel) {
      e.preventDefault();
      onCancel();
    }
  };

  const toggleSuggestionMode = () => {
    setIsSuggestionMode(!isSuggestionMode);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        'border rounded-lg bg-card',
        isReply ? 'p-2' : 'p-3',
        className
      )}
    >
      {/* Mode toggle tabs */}
      {showSuggestionMode && !isReply && (
        <div className="flex items-center gap-1 mb-3 pb-2 border-b border-border/50">
          <Button
            type="button"
            variant={!isSuggestionMode ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setIsSuggestionMode(false)}
            className="gap-1"
          >
            <MessageSquare className="h-4 w-4" />
            Comment
          </Button>
          <Button
            type="button"
            variant={isSuggestionMode ? 'secondary' : 'ghost'}
            size="sm"
            onClick={toggleSuggestionMode}
            className="gap-1"
          >
            <Lightbulb className="h-4 w-4" />
            Suggest change
          </Button>
        </div>
      )}

      {/* Comment textarea */}
      <Textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isSuggestionMode ? 'Explain your suggestion...' : placeholder}
        className={cn(
          'resize-none border-0 focus-visible:ring-0 bg-transparent',
          isReply ? 'min-h-[60px] text-sm' : 'min-h-[80px]'
        )}
        disabled={isLoading}
      />

      {/* Suggestion code editor */}
      {isSuggestionMode && (
        <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border-b border-primary/30">
            <Lightbulb className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-primary">Suggested code</span>
          </div>
          <Textarea
            ref={suggestionRef}
            value={suggestion}
            onChange={(e) => setSuggestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter your suggested code..."
            className="resize-none border-0 focus-visible:ring-0 bg-transparent font-mono text-sm min-h-[100px] rounded-none"
            disabled={isLoading}
          />
        </div>
      )}
      
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
        <span className="text-xs text-muted-foreground">
          {isSuggestionMode
            ? 'Edit the code above to suggest changes'
            : 'Markdown supported. Ctrl+Enter to submit.'}
        </span>
        
        <div className="flex items-center gap-2">
          {showCancel && onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={isLoading}
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          )}
          
          <Button
            type="submit"
            size="sm"
            disabled={!body.trim() || (isSuggestionMode && !suggestion.trim()) || isLoading}
          >
            {isSuggestionMode ? (
              <>
                <Lightbulb className="h-4 w-4 mr-1" />
                {isLoading ? 'Submitting...' : 'Suggest'}
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-1" />
                {isLoading ? 'Submitting...' : submitText}
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
