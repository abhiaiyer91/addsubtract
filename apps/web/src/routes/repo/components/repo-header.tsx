import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';

interface RepoHeaderProps {
  owner: string;
  repo: string;
  isPrivate?: boolean;
}

export function RepoHeader({ owner, repo, isPrivate = false }: RepoHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <Link
        to={`/${owner}`}
        className="text-xl text-primary hover:underline"
      >
        {owner}
      </Link>
      <span className="text-xl text-muted-foreground">/</span>
      <Link
        to={`/${owner}/${repo}`}
        className="text-xl font-bold hover:underline"
      >
        {repo}
      </Link>
      {isPrivate ? (
        <Badge variant="secondary">Private</Badge>
      ) : (
        <Badge variant="outline">Public</Badge>
      )}
    </div>
  );
}
