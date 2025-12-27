import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CircleDot, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Markdown } from '@/components/markdown/renderer';
import { LabelPicker } from '@/components/issue/label-picker';
import { RepoLayout } from './components/repo-layout';
import { Loading } from '@/components/ui/loading';
import { formatRelativeTime, formatDate } from '@/lib/utils';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import type { Label } from '@/lib/api-types';

export function IssueDetailPage() {
  const { owner, repo, number } = useParams<{
    owner: string;
    repo: string;
    number: string;
  }>();
  const [comment, setComment] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<Label[]>([]);
  const { data: session } = useSession();
  const authenticated = !!session?.user;
  const currentUser = session?.user || null;
  const utils = trpc.useUtils();

  const issueNumber = parseInt(number!, 10);

  // Fetch repository data
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch issue
  const { data: issueData, isLoading: issueLoading } = trpc.issues.get.useQuery(
    {
      repoId: repoData?.repo.id!,
      number: issueNumber,
    },
    { enabled: !!repoData?.repo.id }
  );

  // Fetch comments
  const { data: commentsData } = trpc.issues.comments.useQuery(
    { issueId: issueData?.id! },
    { enabled: !!issueData?.id }
  );

  // Fetch available labels
  const { data: availableLabels } = trpc.issues.listLabels.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  );

  // Mutations
  const addCommentMutation = trpc.issues.addComment.useMutation({
    onSuccess: () => {
      setComment('');
      utils.issues.comments.invalidate({ issueId: issueData?.id! });
    },
  });

  const closeIssueMutation = trpc.issues.close.useMutation({
    onSuccess: () => {
      utils.issues.get.invalidate({ repoId: repoData?.repo.id!, number: issueNumber });
    },
  });

  const reopenIssueMutation = trpc.issues.reopen.useMutation({
    onSuccess: () => {
      utils.issues.get.invalidate({ repoId: repoData?.repo.id!, number: issueNumber });
    },
  });

  const isLoading = repoLoading || issueLoading;

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading issue..." />
      </RepoLayout>
    );
  }

  if (!issueData) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold mb-2">Issue not found</h2>
          <p className="text-muted-foreground">
            Issue #{issueNumber} could not be found in this repository.
          </p>
        </div>
      </RepoLayout>
    );
  }

  const issue = issueData;
  const comments = commentsData || [];

  const handleComment = async () => {
    if (!comment.trim() || !issueData?.id) return;
    addCommentMutation.mutate({
      issueId: issueData.id,
      body: comment,
    });
  };

  const handleCloseIssue = async () => {
    if (!issueData?.id) return;
    closeIssueMutation.mutate({ issueId: issueData.id });
  };

  const handleReopenIssue = async () => {
    if (!issueData?.id) return;
    reopenIssueMutation.mutate({ issueId: issueData.id });
  };

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      {/* Issue header */}
      <div>
        <h1 className="text-2xl font-bold">
          {issue.title}
          <span className="text-muted-foreground font-normal ml-2">
            #{issue.number}
          </span>
        </h1>

        <div className="flex items-center gap-3 mt-3">
          <Badge
            variant={issue.state === 'open' ? 'success' : 'purple'}
            className="gap-1"
          >
            {issue.state === 'open' ? (
              <CircleDot className="h-3 w-3" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            {issue.state === 'open' ? 'Open' : 'Closed'}
          </Badge>

          <span className="text-muted-foreground">
            <Link
              to={`/${issue.author?.username}`}
              className="font-medium hover:text-foreground"
            >
              {issue.author?.username || 'Unknown'}
            </Link>{' '}
            opened this issue {formatRelativeTime(new Date(issue.createdAt))} ·{' '}
            {comments.length} comments
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-6">
        {/* Main content */}
        <div className="md:col-span-3 space-y-4">
          {/* Issue body */}
          <Card>
            <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 border-b">
              <Avatar className="h-6 w-6">
                <AvatarImage src={issue.author?.avatarUrl || undefined} />
                <AvatarFallback className="text-xs">
                  {issue.author?.username?.slice(0, 2).toUpperCase() || 'UN'}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium">{issue.author?.username || 'Unknown'}</span>
              <span className="text-muted-foreground">
                commented {formatRelativeTime(new Date(issue.createdAt))}
              </span>
            </div>
            <CardContent className="p-4">
              {issue.body ? (
                <Markdown content={issue.body} />
              ) : (
                <p className="text-muted-foreground italic">No description provided.</p>
              )}
            </CardContent>
          </Card>

          {/* Comments */}
          {comments.map((c) => (
            <Card key={c.id}>
              <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 border-b">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={c.user?.avatarUrl || undefined} />
                  <AvatarFallback className="text-xs">
                    {c.user?.username?.slice(0, 2).toUpperCase() || 'UN'}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium">{c.user?.username || 'Unknown'}</span>
                <span className="text-muted-foreground">
                  commented {formatRelativeTime(new Date(c.createdAt))}
                </span>
              </div>
              <CardContent className="p-4">
                <Markdown content={c.body} />
              </CardContent>
            </Card>
          ))}

          {/* Add comment form */}
          {authenticated && (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {currentUser?.username?.slice(0, 2).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <Textarea
                      placeholder="Leave a comment..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={4}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  {issue.state === 'open' ? (
                    <Button
                      variant="outline"
                      onClick={handleCloseIssue}
                      disabled={closeIssueMutation.isPending}
                    >
                      {closeIssueMutation.isPending ? 'Closing...' : 'Close issue'}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={handleReopenIssue}
                      disabled={reopenIssueMutation.isPending}
                    >
                      {reopenIssueMutation.isPending ? 'Reopening...' : 'Reopen issue'}
                    </Button>
                  )}
                  <Button
                    onClick={handleComment}
                    disabled={!comment.trim() || addCommentMutation.isPending}
                  >
                    {addCommentMutation.isPending ? 'Commenting...' : 'Comment'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Labels */}
          <div>
            <LabelPicker
              availableLabels={availableLabels || []}
              selectedLabels={selectedLabels}
              onLabelsChange={setSelectedLabels}
            />
          </div>

          <Separator />

          {/* Assignee */}
          <div className="space-y-2">
            <span className="text-sm font-medium">Assignees</span>
            {issue.assignee ? (
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-xs">
                    {issue.assignee.username?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span>{issue.assignee.username}</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No one assigned</p>
            )}
          </div>

          <Separator />

          {/* Meta info */}
          <div className="space-y-2 text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">Created:</span>{' '}
              {formatDate(new Date(issue.createdAt))}
            </div>
            <div>
              <span className="font-medium text-foreground">Updated:</span>{' '}
              {formatRelativeTime(new Date(issue.updatedAt))}
            </div>
          </div>
        </div>
      </div>
    </RepoLayout>
  );
}
