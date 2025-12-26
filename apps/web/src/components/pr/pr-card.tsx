import { Link } from 'react-router-dom';
import { GitPullRequest, GitMerge, X, MessageSquare } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatRelativeTime } from '@/lib/utils';
import type { Label } from '@/lib/api-types';

interface PullRequest {
  id: string;
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  author: {
    username: string;
    avatarUrl?: string | null;
  };
  sourceBranch: string;
  targetBranch: string;
  createdAt: Date | string;
  labels?: Label[];
  commentsCount?: number;
}

interface PrCardProps {
  pr: PullRequest;
  owner: string;
  repo: string;
}

export function PrCard({ pr, owner, repo }: PrCardProps) {
  const stateIcon = {
    open: <GitPullRequest className="h-4 w-4 text-green-500" />,
    merged: <GitMerge className="h-4 w-4 text-purple-500" />,
    closed: <X className="h-4 w-4 text-red-500" />,
  };

  const stateColor = {
    open: 'border-green-500/30 bg-green-500/10',
    merged: 'border-purple-500/30 bg-purple-500/10',
    closed: 'border-red-500/30 bg-red-500/10',
  };

  return (
    <Card className={`border-l-4 ${stateColor[pr.state]}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* State icon */}
          <div className="mt-1">{stateIcon[pr.state]}</div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to={`/${owner}/${repo}/pull/${pr.number}`}
                className="font-medium hover:text-primary"
              >
                {pr.title}
              </Link>
              {pr.labels?.map((label) => (
                <Badge
                  key={label.id}
                  variant="outline"
                  style={{
                    backgroundColor: `#${label.color}20`,
                    borderColor: `#${label.color}`,
                    color: `#${label.color}`,
                  }}
                >
                  {label.name}
                </Badge>
              ))}
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
              <span>#{pr.number}</span>
              <span>opened</span>
              <span>{formatRelativeTime(pr.createdAt)}</span>
              <span>by</span>
              <Link
                to={`/${pr.author.username}`}
                className="hover:text-foreground"
              >
                {pr.author.username}
              </Link>
            </div>

            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="font-mono">
                {pr.sourceBranch} → {pr.targetBranch}
              </span>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-4">
            <Avatar className="h-6 w-6">
              <AvatarImage src={pr.author.avatarUrl || undefined} />
              <AvatarFallback className="text-xs">
                {pr.author.username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {pr.commentsCount !== undefined && pr.commentsCount > 0 && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <MessageSquare className="h-4 w-4" />
                <span className="text-sm">{pr.commentsCount}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
