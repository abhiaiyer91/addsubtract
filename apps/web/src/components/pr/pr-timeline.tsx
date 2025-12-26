import { GitCommit, MessageSquare, CheckCircle, XCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Markdown } from '@/components/markdown/renderer';
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
  // For commits
  sha?: string;
  message?: string;
  // For reviews
  reviewState?: 'approved' | 'changes_requested' | 'commented';
}

interface PrTimelineProps {
  events: TimelineEvent[];
}

export function PrTimeline({ events }: PrTimelineProps) {
  return (
    <div className="space-y-4">
      {events.map((event) => (
        <TimelineEventCard key={event.id} event={event} />
      ))}
    </div>
  );
}

function TimelineEventCard({ event }: { event: TimelineEvent }) {
  if (event.type === 'comment') {
    return <CommentEvent event={event} />;
  }

  if (event.type === 'commit') {
    return <CommitEvent event={event} />;
  }

  if (event.type === 'review') {
    return <ReviewEvent event={event} />;
  }

  return null;
}

function CommentEvent({ event }: { event: TimelineEvent }) {
  return (
    <Card>
      <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 border-b">
        <Avatar className="h-6 w-6">
          <AvatarImage src={event.author.avatarUrl || undefined} />
          <AvatarFallback className="text-xs">
            {event.author.username.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="font-medium">{event.author.username}</span>
        <span className="text-muted-foreground">commented</span>
        <span className="text-muted-foreground">
          {formatRelativeTime(event.createdAt)}
        </span>
      </div>
      <CardContent className="p-4">
        <Markdown content={event.body || ''} />
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

function ReviewEvent({ event }: { event: TimelineEvent }) {
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

  const state = event.reviewState || 'commented';

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
