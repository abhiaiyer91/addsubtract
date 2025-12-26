import { Link } from 'react-router-dom';
import { CircleDot, CheckCircle2, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatRelativeTime } from '@/lib/utils';
import type { Label } from '@/lib/api-types';

interface Issue {
  id: string;
  number: number;
  title: string;
  state: 'open' | 'closed';
  author: {
    username: string;
  };
  createdAt: Date | string;
  labels?: Label[];
  commentsCount?: number;
}

interface IssueCardProps {
  issue: Issue;
  owner: string;
  repo: string;
}

export function IssueCard({ issue, owner, repo }: IssueCardProps) {
  return (
    <Card className={issue.state === 'closed' ? 'opacity-75' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* State icon */}
          <div className="mt-1">
            {issue.state === 'open' ? (
              <CircleDot className="h-4 w-4 text-green-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-purple-500" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to={`/${owner}/${repo}/issues/${issue.number}`}
                className="font-medium hover:text-primary"
              >
                {issue.title}
              </Link>
              {issue.labels?.map((label) => (
                <Badge
                  key={label.id}
                  variant="outline"
                  style={{
                    backgroundColor: `#${label.color}20`,
                    borderColor: `#${label.color}`,
                    color: `#${label.color}`,
                  }}
                  className="text-xs"
                >
                  {label.name}
                </Badge>
              ))}
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
              <span>#{issue.number}</span>
              <span>opened</span>
              <span>{formatRelativeTime(issue.createdAt)}</span>
              <span>by</span>
              <Link
                to={`/${issue.author.username}`}
                className="hover:text-foreground"
              >
                {issue.author.username}
              </Link>
            </div>
          </div>

          {/* Right side - comments */}
          {issue.commentsCount !== undefined && issue.commentsCount > 0 && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <MessageSquare className="h-4 w-4" />
              <span className="text-sm">{issue.commentsCount}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
