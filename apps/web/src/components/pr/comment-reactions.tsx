import { useState } from 'react';
import { SmilePlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface Reaction {
  emoji: string;
  count: number;
  users: string[];
  hasReacted: boolean;
}

interface CommentReactionsProps {
  reactions: Reaction[];
  onReact: (emoji: string) => Promise<void>;
  onRemoveReaction: (emoji: string) => Promise<void>;
  disabled?: boolean;
  size?: 'sm' | 'md';
}

const REACTION_EMOJIS = [
  { emoji: '👍', label: 'Thumbs up' },
  { emoji: '👎', label: 'Thumbs down' },
  { emoji: '😄', label: 'Laugh' },
  { emoji: '🎉', label: 'Hooray' },
  { emoji: '😕', label: 'Confused' },
  { emoji: '❤️', label: 'Heart' },
  { emoji: '🚀', label: 'Rocket' },
  { emoji: '👀', label: 'Eyes' },
];

export function CommentReactions({
  reactions,
  onReact,
  onRemoveReaction,
  disabled = false,
  size = 'sm',
}: CommentReactionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loadingEmoji, setLoadingEmoji] = useState<string | null>(null);

  const handleReaction = async (emoji: string) => {
    const existing = reactions.find((r) => r.emoji === emoji);
    setLoadingEmoji(emoji);
    try {
      if (existing?.hasReacted) {
        await onRemoveReaction(emoji);
      } else {
        await onReact(emoji);
      }
    } finally {
      setLoadingEmoji(null);
      setIsOpen(false);
    }
  };

  const handleExistingReaction = async (emoji: string, hasReacted: boolean) => {
    setLoadingEmoji(emoji);
    try {
      if (hasReacted) {
        await onRemoveReaction(emoji);
      } else {
        await onReact(emoji);
      }
    } finally {
      setLoadingEmoji(null);
    }
  };

  const buttonSize = size === 'sm' ? 'h-6 px-1.5' : 'h-7 px-2';
  const textSize = size === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {/* Existing reactions */}
      {reactions.map((reaction) => (
        <Button
          key={reaction.emoji}
          variant="outline"
          size="sm"
          className={cn(
            buttonSize,
            textSize,
            'gap-1',
            reaction.hasReacted && 'bg-primary/10 border-primary/30'
          )}
          onClick={() => handleExistingReaction(reaction.emoji, reaction.hasReacted)}
          disabled={disabled || loadingEmoji === reaction.emoji}
          title={reaction.users.join(', ')}
        >
          {loadingEmoji === reaction.emoji ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <span>{reaction.emoji}</span>
              <span className="text-muted-foreground">{reaction.count}</span>
            </>
          )}
        </Button>
      ))}

      {/* Add reaction button */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(buttonSize, 'text-muted-foreground hover:text-foreground')}
            disabled={disabled}
          >
            <SmilePlus className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="grid grid-cols-4 gap-1">
            {REACTION_EMOJIS.map(({ emoji, label }) => {
              const existing = reactions.find((r) => r.emoji === emoji);
              return (
                <Button
                  key={emoji}
                  variant={existing?.hasReacted ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 w-8 p-0 text-lg"
                  onClick={() => handleReaction(emoji)}
                  disabled={loadingEmoji === emoji}
                  title={label}
                >
                  {loadingEmoji === emoji ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    emoji
                  )}
                </Button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
