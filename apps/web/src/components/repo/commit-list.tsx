import { Link } from 'react-router-dom';
import { GitCommit, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { formatRelativeTime, truncate } from '@/lib/utils';

export interface Commit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    avatarUrl?: string;
  };
  date: Date | string;
}

interface CommitListProps {
  commits: Commit[];
  owner: string;
  repo: string;
}

export function CommitList({ commits, owner, repo }: CommitListProps) {
  return (
    <div className="divide-y divide-border rounded-lg border">
      {commits.map((commit) => (
        <CommitRow key={commit.sha} commit={commit} owner={owner} repo={repo} />
      ))}
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

  const handleCopySha = async () => {
    await navigator.clipboard.writeText(commit.sha);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Split message into title and body
  const [title, ...bodyParts] = commit.message.split('\n');
  const hasBody = bodyParts.filter(Boolean).length > 0;

  return (
    <div className="flex items-start gap-4 p-4 hover:bg-muted/30">
      <Avatar className="h-8 w-8 mt-0.5">
        <AvatarImage src={commit.author.avatarUrl} />
        <AvatarFallback className="text-xs">
          {(commit.author.name || 'UN').slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link
            to={`/${owner}/${repo}/commit/${commit.sha}`}
            className="font-medium hover:text-primary truncate"
          >
            {truncate(title, 72)}
          </Link>
          {hasBody && (
            <span className="text-muted-foreground">…</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
          <span>{commit.author.name}</span>
          <span>committed</span>
          <span>{formatRelativeTime(commit.date)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1 h-7 px-2 font-mono text-xs"
          onClick={handleCopySha}
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          {shortSha}
        </Button>
        <Link to={`/${owner}/${repo}/tree/${commit.sha}`}>
          <Button variant="ghost" size="sm" className="h-7 px-2">
            <GitCommit className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
