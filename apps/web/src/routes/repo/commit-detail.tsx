import { useParams, Link } from 'react-router-dom';
import { GitCommit, Copy, Check, ChevronLeft } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { RepoLayout } from './components/repo-layout';
import { Loading } from '@/components/ui/loading';
import { DiffViewer } from '@/components/diff/diff-viewer';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime } from '@/lib/utils';

export function CommitDetailPage() {
  const { owner, repo, sha } = useParams<{
    owner: string;
    repo: string;
    sha: string;
  }>();
  const [copied, setCopied] = useState(false);

  const { data: commitData, isLoading, error } = trpc.repos.getCommit.useQuery(
    { owner: owner!, repo: repo!, sha: sha! },
    { enabled: !!owner && !!repo && !!sha }
  );

  const handleCopySha = async () => {
    if (sha) {
      await navigator.clipboard.writeText(sha);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading commit..." />
      </RepoLayout>
    );
  }

  if (error || !commitData) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold mb-2">Commit not found</h2>
          <p className="text-muted-foreground">
            The commit {sha?.slice(0, 7)} could not be found.
          </p>
        </div>
      </RepoLayout>
    );
  }

  const [title, ...bodyParts] = commitData.message.split('\n');
  const body = bodyParts.filter(Boolean).join('\n');

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="space-y-6">
        {/* Back link */}
        <Link
          to={`/${owner}/${repo}/commits`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to commits
        </Link>

        {/* Commit header */}
        <div className="border rounded-lg p-6 space-y-4">
          <div className="flex items-start gap-4">
            <GitCommit className="h-6 w-6 text-muted-foreground mt-1" />
            <div className="flex-1">
              <h1 className="text-xl font-semibold">{title}</h1>
              {body && (
                <pre className="mt-4 text-sm text-muted-foreground whitespace-pre-wrap font-mono bg-muted/50 p-4 rounded">
                  {body}
                </pre>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs">
                  {(commitData.author.name || 'UN').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="text-sm">
                <span className="font-medium">{commitData.author.name}</span>
                <span className="text-muted-foreground"> committed </span>
                <span className="text-muted-foreground">
                  {formatRelativeTime(commitData.author.date)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1 font-mono text-xs"
                onClick={handleCopySha}
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {sha?.slice(0, 7)}
              </Button>
              <Link to={`/${owner}/${repo}/tree/${sha}`}>
                <Button variant="outline" size="sm">
                  Browse files
                </Button>
              </Link>
            </div>
          </div>

          {/* Parent commits */}
          {commitData.parents.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Parent{commitData.parents.length > 1 ? 's' : ''}:</span>
              {commitData.parents.map((parent) => (
                <Link
                  key={parent}
                  to={`/${owner}/${repo}/commit/${parent}`}
                  className="font-mono text-primary hover:underline"
                >
                  {parent.slice(0, 7)}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Diff */}
        {commitData.diff ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Changes</h2>
            <DiffViewer diff={commitData.diff} />
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No changes to display
          </div>
        )}
      </div>
    </RepoLayout>
  );
}
