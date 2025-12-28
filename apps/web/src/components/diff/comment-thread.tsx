import { useState } from 'react';
import { ChevronDown, ChevronRight, MessageSquare, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { InlineComment, type InlineCommentData } from './inline-comment';
import { CommentForm } from './comment-form';

export interface CommentThreadProps {
  /** The root comment of the thread */
  rootComment: InlineCommentData;
  /** Replies to the root comment */
  replies: InlineCommentData[];
  /** Current user ID for edit/delete permissions */
  currentUserId?: string;
  /** Whether the thread is collapsed by default */
  defaultCollapsed?: boolean;
  /** Called when submitting a reply */
  onReply?: (rootCommentId: string, body: string) => void;
  /** Called when editing a comment */
  onEdit?: (commentId: string, body: string) => void;
  /** Called when deleting a comment */
  onDelete?: (commentId: string) => void;
  /** Called when resolving the thread */
  onResolve?: (commentId: string) => void;
  /** Called when unresolving the thread */
  onUnresolve?: (commentId: string) => void;
  /** Loading states */
  isReplying?: boolean;
  isEditing?: boolean;
  isDeleting?: boolean;
  isResolving?: boolean;
  /** Additional class name */
  className?: string;
  /** File path for context */
  filePath?: string;
  /** Line range display */
  lineRange?: { start: number; end: number } | number;
}

export function CommentThread({
  rootComment,
  replies,
  currentUserId,
  defaultCollapsed = false,
  onReply,
  onEdit,
  onDelete,
  onResolve,
  onUnresolve,
  isReplying = false,
  isEditing = false,
  isDeleting = false,
  isResolving = false,
  className,
  filePath: _filePath,
  lineRange,
}: CommentThreadProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [showReplyForm, setShowReplyForm] = useState(false);

  const handleReplySubmit = (body: string) => {
    if (onReply) {
      onReply(rootComment.id, body);
      setShowReplyForm(false);
    }
  };

  const lineDisplay = typeof lineRange === 'number'
    ? `Line ${lineRange}`
    : lineRange
    ? `Lines ${lineRange.start}-${lineRange.end}`
    : null;

  const allComments = [rootComment, ...replies];
  const isResolved = rootComment.isResolved;

  return (
    <div
      className={cn(
        'border rounded-lg bg-card overflow-hidden',
        isResolved && 'border-green-500/30 bg-green-500/5',
        className
      )}
    >
      {/* Thread header */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 bg-muted/30 border-b cursor-pointer hover:bg-muted/50',
          isResolved && 'bg-green-500/10'
        )}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <Button variant="ghost" size="icon-sm" className="h-5 w-5 p-0">
          {isCollapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </Button>

        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        
        <span className="text-sm font-medium">
          {rootComment.user.username || rootComment.user.name}
        </span>

        {lineDisplay && (
          <span className="text-xs text-muted-foreground">
            on {lineDisplay}
          </span>
        )}

        <span className="text-xs text-muted-foreground">
          {allComments.length} {allComments.length === 1 ? 'comment' : 'comments'}
        </span>

        {isResolved && (
          <span className="ml-auto flex items-center gap-1 text-xs text-green-500">
            <Check className="h-3 w-3" />
            Resolved
          </span>
        )}
      </div>

      {/* Thread content */}
      {!isCollapsed && (
        <div className="divide-y divide-border/50">
          {/* Root comment */}
          <div className="px-3">
            <InlineComment
              comment={rootComment}
              currentUserId={currentUserId}
              onEdit={onEdit}
              onDelete={onDelete}
              onResolve={onResolve}
              onUnresolve={onUnresolve}
              isEditing={isEditing}
              isDeleting={isDeleting}
              isResolving={isResolving}
            />
          </div>

          {/* Replies */}
          {replies.map((reply) => (
            <div key={reply.id} className="px-3">
              <InlineComment
                comment={reply}
                currentUserId={currentUserId}
                onEdit={onEdit}
                onDelete={onDelete}
                isEditing={isEditing}
                isDeleting={isDeleting}
                isReply
              />
            </div>
          ))}

          {/* Reply form */}
          {showReplyForm ? (
            <div className="p-3">
              <CommentForm
                onSubmit={handleReplySubmit}
                onCancel={() => setShowReplyForm(false)}
                placeholder="Write a reply..."
                submitText="Reply"
                isLoading={isReplying}
                isReply
              />
            </div>
          ) : (
            <div className="px-3 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowReplyForm(true);
                }}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Reply
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
