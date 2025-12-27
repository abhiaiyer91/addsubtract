import { useState } from 'react';
import { MessageSquare, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Markdown } from '@/components/markdown/renderer';
import { formatRelativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';

export interface InlineComment {
  id: string;
  body: string;
  author: {
    username: string;
    avatarUrl?: string | null;
  };
  createdAt: Date | string;
  side: 'LEFT' | 'RIGHT';
  line: number;
  path: string;
  replies?: InlineComment[];
}

interface InlineCommentThreadProps {
  comments: InlineComment[];
  onAddReply?: (body: string) => Promise<void>;
}

export function InlineCommentThread({
  comments,
  onAddReply,
}: InlineCommentThreadProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmitReply = async () => {
    if (!replyText.trim() || !onAddReply) return;
    setIsSubmitting(true);
    try {
      await onAddReply(replyText);
      setReplyText('');
      setIsReplying(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-muted/30 border border-border rounded-lg overflow-hidden mx-2 my-1">
      {/* Comments */}
      <div className="divide-y divide-border">
        {comments.map((comment) => (
          <div key={comment.id} className="p-3">
            <div className="flex items-start gap-2">
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarImage src={comment.author.avatarUrl || undefined} />
                <AvatarFallback className="text-[10px]">
                  {comment.author.username.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">
                    {comment.author.username}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(comment.createdAt)}
                  </span>
                </div>
                <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                  <Markdown content={comment.body} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Reply form */}
      {onAddReply && (
        <div className="border-t border-border p-2">
          {isReplying ? (
            <div className="space-y-2">
              <Textarea
                placeholder="Write a reply..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={2}
                className="text-sm"
                autoFocus
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsReplying(false);
                    setReplyText('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSubmitReply}
                  disabled={!replyText.trim() || isSubmitting}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Send className="h-4 w-4 mr-1" />
                  )}
                  Reply
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsReplying(true)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <MessageSquare className="h-3 w-3" />
              Reply...
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface AddCommentFormProps {
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
  side: 'LEFT' | 'RIGHT';
  line: number;
}

export function AddCommentForm({
  onSubmit,
  onCancel,
  side,
  line,
}: AddCommentFormProps) {
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!body.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(body);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-muted/30 border border-border rounded-lg overflow-hidden mx-2 my-1 p-3">
      <Textarea
        placeholder="Write a comment..."
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        className="text-sm mb-2"
        autoFocus
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Commenting on line {line} ({side.toLowerCase()} side)
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!body.trim() || isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <MessageSquare className="h-4 w-4 mr-1" />
            )}
            Add comment
          </Button>
        </div>
      </div>
    </div>
  );
}

interface CommentButtonProps {
  onClick: () => void;
  className?: string;
}

export function CommentButton({ onClick, className }: CommentButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'absolute left-0 w-5 h-5 flex items-center justify-center',
        'bg-primary text-primary-foreground rounded-full',
        'opacity-0 group-hover:opacity-100 hover:scale-110',
        'transition-all duration-150 shadow-sm',
        '-translate-x-1/2',
        className
      )}
      title="Add comment"
    >
      <MessageSquare className="h-3 w-3" />
    </button>
  );
}
