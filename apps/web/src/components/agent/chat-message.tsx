import { Bot, User, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Markdown } from '@/components/markdown/renderer';
import { Button } from '@/components/ui/button';

export interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  isStreaming?: boolean;
  timestamp?: Date;
  compact?: boolean;
}

export function ChatMessage({ role, content, isStreaming, timestamp, compact = false }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = role === 'user';
  const isSystem = role === 'system';

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isSystem) {
    return (
      <div className={cn('flex justify-center', compact ? 'py-2' : 'py-3')}>
        <div className="text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
          {content}
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div
        className={cn(
          'group relative px-4',
          isUser ? 'py-3 bg-transparent' : 'py-3 bg-muted/20'
        )}
      >
        <div className="flex gap-3">
          {/* Avatar */}
          <div
            className={cn(
              'flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-0.5',
              isUser
                ? 'bg-primary/10 text-primary'
                : 'bg-gradient-to-br from-emerald-400/80 to-primary/80 text-white'
            )}
          >
            {isUser ? (
              <User className="h-3 w-3" />
            ) : (
              <Bot className="h-3 w-3" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {isUser ? 'You' : 'Agent'}
              </span>
              {timestamp && (
                <span className="text-[10px] text-muted-foreground/60">
                  {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-pre:my-2 prose-headings:my-2">
              {isUser ? (
                <p className="text-foreground whitespace-pre-wrap text-sm m-0">{content}</p>
              ) : (
                <>
                  <Markdown content={content} />
                  {isStreaming && (
                    <span className="inline-block w-1.5 h-4 ml-0.5 bg-primary animate-pulse rounded-sm" />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Copy button for assistant messages */}
          {!isUser && !isStreaming && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleCopy}
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            >
              {copied ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Default (non-compact) layout
  return (
    <div
      className={cn(
        'flex gap-3 py-4 px-4',
        isUser ? 'bg-transparent' : 'bg-muted/30'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser
            ? 'bg-primary/10 text-primary'
            : 'bg-gradient-to-br from-emerald-400 to-primary text-white'
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {isUser ? 'You' : 'wit Agent'}
          </span>
          {timestamp && (
            <span className="text-xs text-muted-foreground">
              {timestamp.toLocaleTimeString()}
            </span>
          )}
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none">
          {isUser ? (
            <p className="text-foreground whitespace-pre-wrap">{content}</p>
          ) : (
            <>
              <Markdown content={content} />
              {isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse rounded-sm" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
