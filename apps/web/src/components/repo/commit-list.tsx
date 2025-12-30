import { Link } from 'react-router-dom';
import { MessageSquare, Clock, Check, Circle, CheckCircle, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatRelativeTime, truncate } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface Commit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    username?: string | null;
    avatarUrl?: string | null;
  };
  date: Date | string;
  pr?: { number: number; title: string } | null;
  commentCount?: number;
  ciStatus?: 'success' | 'failure' | 'pending' | null;
}

interface CommitListProps {
  commits: Commit[];
  owner: string;
  repo: string;
  totalCount?: number;
}

export function CommitList({ commits, owner, repo, totalCount }: CommitListProps) {
  return (
    <div className="divide-y divide-border rounded-lg border">
      {commits.map((commit) => (
        <CommitRow key={commit.sha} commit={commit} owner={owner} repo={repo} />
      ))}
      {totalCount !== undefined && totalCount > 0 && (
        <div className="px-4 py-2 text-sm text-muted-foreground bg-muted/30 flex items-center justify-end gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span>{totalCount.toLocaleString()} Commits</span>
        </div>
      )}
    </div>
  );
}

function CommitRow({
  commit,
  owner,
  repo,
}: {
  commit: Commit;
  owner: string;
  repo: string;
}) {
  const [copied, setCopied] = useState(false);
  const shortSha = commit.sha.slice(0, 7);

  const handleCopySha = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await navigator.clipboard.writeText(commit.sha);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Split message into title and body
  const [title] = commit.message.split('\n');

  // Get the display name (prefer username over full name)
  const displayName = commit.author.username || commit.author.name;

  // CI Status indicator
  const CiStatusIcon = () => {
    if (!commit.ciStatus) return null;
    
    switch (commit.ciStatus) {
      case 'success':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </TooltipTrigger>
              <TooltipContent>CI passed</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'failure':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <XCircle className="h-4 w-4 text-red-500" />
              </TooltipTrigger>
              <TooltipContent>CI failed</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      case 'pending':
        return (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Circle className="h-4 w-4 text-yellow-500 fill-yellow-500" />
              </TooltipTrigger>
              <TooltipContent>CI in progress</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
      {/* Avatar */}
      <Avatar className="h-6 w-6 flex-shrink-0">
        <AvatarImage src={commit.author.avatarUrl || undefined} />
        <AvatarFallback className="text-xs">
          {(displayName || 'UN').slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      {/* Author username */}
      <span className="font-medium text-sm flex-shrink-0">
        {displayName}
      </span>

      {/* Commit message */}
      <Link
        to={`/${owner}/${repo}/commit/${commit.sha}`}
        className="text-sm hover:text-primary truncate flex-1 min-w-0"
      >
        {truncate(title, 72)}
      </Link>

      {/* PR reference */}
      {commit.pr && (
        <Link
          to={`/${owner}/${repo}/pull/${commit.pr.number}`}
          className="text-sm text-muted-foreground hover:text-primary flex-shrink-0"
        >
          (#{commit.pr.number})
        </Link>
      )}

      {/* Comment indicator */}
      {commit.commentCount !== undefined && commit.commentCount > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger className="flex-shrink-0">
              <div className="flex items-center gap-1 text-muted-foreground">
                <MessageSquare className="h-4 w-4" />
              </div>
            </TooltipTrigger>
            <TooltipContent>{commit.commentCount} comment{commit.commentCount !== 1 ? 's' : ''}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* CI Status */}
      <div className="flex-shrink-0">
        <CiStatusIcon />
      </div>

      {/* Short SHA with copy */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleCopySha}
              className="font-mono text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 flex-shrink-0"
            >
              {shortSha}
              {copied && <Check className="h-3 w-3 text-green-500" />}
            </button>
          </TooltipTrigger>
          <TooltipContent>{copied ? 'Copied!' : 'Copy SHA'}</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Relative time */}
      <span className="text-sm text-muted-foreground flex-shrink-0">
        {formatRelativeTime(commit.date)}
      </span>
    </div>
  );
}
