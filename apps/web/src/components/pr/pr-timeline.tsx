import { useState } from 'react';
import { GitCommit, MessageSquare, CheckCircle, XCircle, Edit3, MoreHorizontal, Trash2, Copy } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Markdown } from '@/components/markdown/renderer';
import { CommentReactions, type Reaction } from './comment-reactions';
import { formatRelativeTime } from '@/lib/utils';

type TimelineEventType = 'comment' | 'commit' | 'review' | 'status';

interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  author: {
    username: string;
    avatarUrl?: string | null;
  };
  createdAt: Date | string;
  // For comments
  body?: string;
  reactions?: Reaction[];
  // For commits
  sha?: string;
  message?: string;
  // For reviews
  reviewState?: 'approved' | 'changes_requested' | 'commented';
}

interface PrTimelineProps {
  events: TimelineEvent[];
  currentUserId?: string;
  onEditComment?: (commentId: string, body: string) => Promise<void>;
  onDeleteComment?: (commentId: string) => Promise<void>;
  onReact?: (commentId: string, emoji: string) => Promise<void>;
  onRemoveReaction?: (commentId: string, emoji: string) => Promise<void>;
}

export function PrTimeline({
  events,
  currentUserId,
  onEditComment,
  onDeleteComment,
  onReact,
  onRemoveReaction,
}: PrTimelineProps) {
  return (
    <div className="space-y-4">
      {events.map((event) => (
        <TimelineEventCard
          key={event.id}
          event={event}
          currentUserId={currentUserId}
          onEditComment={onEditComment}
          onDeleteComment={onDeleteComment}
          onReact={onReact}
          onRemoveReaction={onRemoveReaction}
        />
      ))}
    </div>
  );
}

interface TimelineEventCardProps {
  event: TimelineEvent;
  currentUserId?: string;
  onEditComment?: (commentId: string, body: string) => Promise<void>;
  onDeleteComment?: (commentId: string) => Promise<void>;
  onReact?: (commentId: string, emoji: string) => Promise<void>;
  onRemoveReaction?: (commentId: string, emoji: string) => Promise<void>;
}

function TimelineEventCard(props: TimelineEventCardProps) {
  const { event } = props;
  
  if (event.type === 'comment') {
    return <CommentEvent {...props} />;
  }

  if (event.type === 'commit') {
    return <CommitEvent event={event} />;
  }

  if (event.type === 'review') {
    return <ReviewEvent {...props} />;
  }

  return null;
}

function CommentEvent({
  event,
  currentUserId,
  onEditComment,
  onDeleteComment,
  onReact,
  onRemoveReaction,
}: TimelineEventCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedBody, setEditedBody] = useState(event.body || '');
  const [isSaving, setIsSaving] = useState(false);

  const isAuthor = currentUserId === event.author.username; // Simplified check
  const canEdit = isAuthor && onEditComment;
  const canDelete = isAuthor && onDeleteComment;

  const handleSave = async () => {
    if (!onEditComment || !editedBody.trim()) return;
    setIsSaving(true);
    try {
      await onEditComment(event.id, editedBody);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyLink = () => {
    // Copy comment link to clipboard
    const url = `${window.location.href}#comment-${event.id}`;
    navigator.clipboard.writeText(url);
  };

  return (
    <Card id={`comment-${event.id}`}>
      <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b">
        <div className="flex items-center gap-3">
          <Avatar className="h-6 w-6">
            <AvatarImage src={event.author.avatarUrl || undefined} />
            <AvatarFallback className="text-xs">
              {(event.author.username || 'UN').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">{event.author.username}</span>
          <span className="text-muted-foreground">commented</span>
          <span className="text-muted-foreground">
            {formatRelativeTime(event.createdAt)}
          </span>
        </div>

        {(canEdit || canDelete) && !isEditing && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCopyLink}>
                <Copy className="h-4 w-4 mr-2" />
                Copy link
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem onClick={() => setIsEditing(true)}>
                  <Edit3 className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  className="text-red-500 focus:text-red-500"
                  onClick={() => onDeleteComment!(event.id)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <CardContent className="p-4">
        {isEditing ? (
          <div className="space-y-3">
            <textarea
              value={editedBody}
              onChange={(e) => setEditedBody(e.target.value)}
              rows={4}
              className="w-full p-3 border rounded-lg bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsEditing(false);
                  setEditedBody(event.body || '');
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !editedBody.trim()}
              >
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Markdown content={event.body || ''} />
            
            {/* Reactions */}
            {(event.reactions?.length || onReact) && (
              <div className="mt-3 pt-3 border-t">
                <CommentReactions
                  reactions={event.reactions || []}
                  onReact={onReact ? (emoji) => onReact(event.id, emoji) : async () => {}}
                  onRemoveReaction={onRemoveReaction ? (emoji) => onRemoveReaction(event.id, emoji) : async () => {}}
                  disabled={!onReact}
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CommitEvent({ event }: { event: TimelineEvent }) {
  return (
    <div className="flex items-center gap-3 py-2 px-4 text-sm text-muted-foreground">
      <GitCommit className="h-4 w-4" />
      <Avatar className="h-5 w-5">
        <AvatarImage src={event.author.avatarUrl || undefined} />
        <AvatarFallback className="text-xs">
          {event.author.username.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="font-medium text-foreground">{event.author.username}</span>
      <span>pushed</span>
      <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
        {event.sha?.slice(0, 7)}
      </code>
      <span className="truncate">{event.message}</span>
      <span className="ml-auto">{formatRelativeTime(event.createdAt)}</span>
    </div>
  );
}

function ReviewEvent({
  event,
  onReact,
  onRemoveReaction,
}: TimelineEventCardProps) {
  const reviewIcons = {
    approved: <CheckCircle className="h-4 w-4 text-green-500" />,
    changes_requested: <XCircle className="h-4 w-4 text-red-500" />,
    commented: <MessageSquare className="h-4 w-4 text-blue-500" />,
  };

  const reviewText = {
    approved: 'approved these changes',
    changes_requested: 'requested changes',
    commented: 'reviewed',
  };

  const reviewBg = {
    approved: 'bg-green-500/5 border-green-500/20',
    changes_requested: 'bg-red-500/5 border-red-500/20',
    commented: 'bg-blue-500/5 border-blue-500/20',
  };

  const state = event.reviewState || 'commented';

  // If review has a body, show it as a card
  if (event.body) {
    return (
      <Card className={reviewBg[state]}>
        <div className="flex items-center gap-3 px-4 py-2 border-b border-inherit">
          {reviewIcons[state]}
          <Avatar className="h-5 w-5">
            <AvatarImage src={event.author.avatarUrl || undefined} />
            <AvatarFallback className="text-xs">
              {(event.author.username || 'UN').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">{event.author.username}</span>
          <span className="text-muted-foreground">{reviewText[state]}</span>
          <span className="ml-auto text-muted-foreground">
            {formatRelativeTime(event.createdAt)}
          </span>
        </div>
        <CardContent className="p-4">
          <Markdown content={event.body} />
          
          {/* Reactions */}
          {(event.reactions?.length || onReact) && (
            <div className="mt-3 pt-3 border-t">
              <CommentReactions
                reactions={event.reactions || []}
                onReact={onReact ? (emoji) => onReact(event.id, emoji) : async () => {}}
                onRemoveReaction={onRemoveReaction ? (emoji) => onRemoveReaction(event.id, emoji) : async () => {}}
                disabled={!onReact}
              />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Simple inline review without body
  return (
    <div className="flex items-center gap-3 py-2 px-4 text-sm text-muted-foreground">
      {reviewIcons[state]}
      <Avatar className="h-5 w-5">
        <AvatarImage src={event.author.avatarUrl || undefined} />
        <AvatarFallback className="text-xs">
          {event.author.username.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="font-medium text-foreground">{event.author.username}</span>
      <span>{reviewText[state]}</span>
      <span className="ml-auto">{formatRelativeTime(event.createdAt)}</span>
    </div>
  );
}
