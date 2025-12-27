import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { 
  MoreHorizontal, 
  Pencil, 
  Trash2, 
  Check, 
  RotateCcw,
  Lightbulb 
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { CommentForm } from './comment-form';
import { SuggestionBlock } from './suggestion-block';

export interface CommentUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  image: string | null;
  avatarUrl: string | null;
}

export interface InlineCommentData {
  id: string;
  body: string;
  userId: string;
  prId: string;
  path: string | null;
  line: number | null;
  side: string | null;
  startLine?: number | null;
  endLine?: number | null;
  isResolved: boolean;
  resolvedAt: Date | null;
  resolvedById: string | null;
  replyToId: string | null;
  suggestion?: string | null;
  suggestionApplied?: boolean;
  suggestionCommitSha?: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: CommentUser;
}

export interface InlineCommentProps {
  comment: InlineCommentData;
  currentUserId?: string;
  /** Whether the current user is the PR author (can apply suggestions) */
  isPrAuthor?: boolean;
  /** Original code for comparison in suggestions */
  originalCode?: string;
  onEdit?: (commentId: string, body: string) => void;
  onDelete?: (commentId: string) => void;
  onResolve?: (commentId: string) => void;
  onUnresolve?: (commentId: string) => void;
  onApplySuggestion?: (commentId: string) => void;
  isEditing?: boolean;
  isDeleting?: boolean;
  isResolving?: boolean;
  isApplyingSuggestion?: boolean;
  /** Whether this is a reply (smaller styling) */
  isReply?: boolean;
  /** Show the resolved indicator */
  showResolvedBadge?: boolean;
}

export function InlineComment({
  comment,
  currentUserId,
  isPrAuthor = false,
  originalCode = '',
  onEdit,
  onDelete,
  onResolve,
  onUnresolve,
  onApplySuggestion,
  isEditing = false,
  isDeleting = false,
  isResolving = false,
  isApplyingSuggestion = false,
  isReply = false,
  showResolvedBadge = false,
}: InlineCommentProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const isOwner = currentUserId === comment.userId;
  const canEdit = isOwner && onEdit;
  const canDelete = isOwner && onDelete;
  const hasSuggestion = !!comment.suggestion;
  const canApplySuggestion = isPrAuthor && hasSuggestion && !comment.suggestionApplied && onApplySuggestion;

  const user = comment.user;
  const displayName = user.username || user.name || user.email;
  const avatarUrl = user.avatarUrl || user.image;
  const initials = displayName?.slice(0, 2).toUpperCase() || '??';

  const handleEditSubmit = (newBody: string) => {
    if (onEdit) {
      onEdit(comment.id, newBody);
      setIsEditMode(false);
    }
  };

  if (isEditMode) {
    return (
      <div className={cn('py-2', isReply && 'pl-8')}>
        <CommentForm
          initialValue={comment.body}
          onSubmit={handleEditSubmit}
          onCancel={() => setIsEditMode(false)}
          submitText="Save"
          placeholder="Edit your comment..."
          isLoading={isEditing}
          isReply={isReply}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group flex gap-3 py-2',
        isReply && 'pl-8',
        comment.isResolved && 'opacity-60'
      )}
    >
      <Avatar className={cn('flex-shrink-0', isReply ? 'h-6 w-6' : 'h-8 w-8')}>
        {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('font-medium', isReply ? 'text-sm' : 'text-sm')}>
            {displayName}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
          </span>
          {comment.updatedAt > comment.createdAt && (
            <span className="text-xs text-muted-foreground">(edited)</span>
          )}
          {showResolvedBadge && comment.isResolved && (
            <span className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded-full">
              Resolved
            </span>
          )}
        </div>

        <div
          className={cn(
            'mt-1 prose prose-sm prose-invert max-w-none',
            isReply ? 'text-sm' : ''
          )}
        >
          {/* Basic markdown rendering - in production use a proper markdown renderer */}
          <p className="whitespace-pre-wrap break-words">{comment.body}</p>
        </div>

        {/* Suggestion block */}
        {hasSuggestion && (
          <div className="mt-3">
            <SuggestionBlock
              originalCode={originalCode}
              suggestedCode={comment.suggestion!}
              isApplied={comment.suggestionApplied}
              appliedCommitSha={comment.suggestionCommitSha || undefined}
              canApply={!!canApplySuggestion}
              isApplying={isApplyingSuggestion}
              onApply={canApplySuggestion ? () => onApplySuggestion!(comment.id) : undefined}
            />
          </div>
        )}
      </div>

      {/* Actions menu */}
      {(canEdit || canDelete || onResolve || onUnresolve) && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEdit && (
                <DropdownMenuItem onClick={() => setIsEditMode(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              )}
              
              {!comment.replyToId && comment.isResolved && onUnresolve && (
                <DropdownMenuItem 
                  onClick={() => onUnresolve(comment.id)}
                  disabled={isResolving}
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Unresolve
                </DropdownMenuItem>
              )}
              
              {!comment.replyToId && !comment.isResolved && onResolve && (
                <DropdownMenuItem 
                  onClick={() => onResolve(comment.id)}
                  disabled={isResolving}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Resolve thread
                </DropdownMenuItem>
              )}
              
              {canDelete && (
                <DropdownMenuItem
                  onClick={() => onDelete(comment.id)}
                  disabled={isDeleting}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
