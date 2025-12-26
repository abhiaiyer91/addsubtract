import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  GitPullRequest,
  GitMerge,
  X,
  MessageSquare,
  FileCode,
  GitCommit,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { DiffViewer, type DiffFile } from '@/components/diff/diff-viewer';
import { PrTimeline } from '@/components/pr/pr-timeline';
import { MergeButton } from '@/components/pr/merge-button';
import { Markdown } from '@/components/markdown/renderer';
import { RepoHeader } from './components/repo-header';
import { Loading } from '@/components/ui/loading';
import { formatRelativeTime } from '@/lib/utils';
import { isAuthenticated } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

// Mock diff data - TODO: Implement getDiff endpoint
const mockDiff: DiffFile[] = [];

export function PullDetailPage() {
  const { owner, repo, number } = useParams<{
    owner: string;
    repo: string;
    number: string;
  }>();
  const [comment, setComment] = useState('');
  const authenticated = isAuthenticated();
  const utils = trpc.useUtils();

  const prNumber = parseInt(number!, 10);

  // Fetch repository data
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch pull request
  const { data: prData, isLoading: prLoading } = trpc.pulls.get.useQuery(
    {
      repoId: repoData?.repo.id!,
      number: prNumber,
    },
    { enabled: !!repoData?.repo.id }
  );

  // Fetch reviews
  const { data: reviewsData } = trpc.pulls.reviews.useQuery(
    { prId: prData?.id! },
    { enabled: !!prData?.id }
  );

  // Fetch comments
  const { data: commentsData } = trpc.pulls.comments.useQuery(
    { prId: prData?.id! },
    { enabled: !!prData?.id }
  );

  // Mutations
  const addCommentMutation = trpc.pulls.addComment.useMutation({
    onSuccess: () => {
      setComment('');
      utils.pulls.comments.invalidate({ prId: prData?.id! });
    },
  });

  const mergeMutation = trpc.pulls.merge.useMutation({
    onSuccess: () => {
      utils.pulls.get.invalidate({ repoId: repoData?.repo.id!, number: prNumber });
    },
  });

  const isLoading = repoLoading || prLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <RepoHeader owner={owner!} repo={repo!} />
        <Loading text="Loading pull request..." />
      </div>
    );
  }

  if (!prData) {
    return (
      <div className="space-y-6">
        <RepoHeader owner={owner!} repo={repo!} />
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold mb-2">Pull request not found</h2>
          <p className="text-muted-foreground">
            Pull request #{prNumber} could not be found in this repository.
          </p>
        </div>
      </div>
    );
  }

  const pr = prData;
  const reviews = reviewsData || [];
  const comments = commentsData || [];
  const diff = mockDiff;

  // Build timeline from reviews and comments
  const timeline: Array<{
    id: string;
    type: 'comment' | 'commit' | 'review' | 'status';
    author: { username: string; avatarUrl?: string | null };
    createdAt: Date;
    body?: string;
    reviewState?: 'approved' | 'changes_requested' | 'commented';
  }> = [
    ...reviews
      .filter(review => review.state !== 'pending')
      .map(review => ({
        id: review.id,
        type: 'review' as const,
        author: {
          username: review.user?.username || 'Unknown',
          avatarUrl: review.user?.avatarUrl || null,
        },
        reviewState: review.state as 'approved' | 'changes_requested' | 'commented',
        body: review.body || undefined,
        createdAt: new Date(review.createdAt),
      })),
    ...comments.map(comment => ({
      id: comment.id,
      type: 'comment' as const,
      author: {
        username: comment.user?.username || 'Unknown',
        avatarUrl: comment.user?.avatarUrl || null,
      },
      body: comment.body,
      createdAt: new Date(comment.createdAt),
    })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const stateIcon = {
    open: <GitPullRequest className="h-5 w-5 text-green-500" />,
    merged: <GitMerge className="h-5 w-5 text-purple-500" />,
    closed: <X className="h-5 w-5 text-red-500" />,
  };

  const stateText = {
    open: 'Open',
    merged: 'Merged',
    closed: 'Closed',
  };

  const handleMerge = async (_method: 'merge' | 'squash' | 'rebase') => {
    if (!prData?.id) return;
    // For now, we'll use the head SHA as the merge SHA
    // In a real implementation, the server would compute this
    // TODO: Pass method to server when implementing different merge strategies
    mergeMutation.mutate({
      prId: prData.id,
      mergeSha: prData.headSha,
    });
  };

  const handleComment = async () => {
    if (!comment.trim() || !prData?.id) return;
    addCommentMutation.mutate({
      prId: prData.id,
      body: comment,
    });
  };

  return (
    <div className="space-y-6">
      <RepoHeader owner={owner!} repo={repo!} />

      {/* PR Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          {pr.title}
          <span className="text-muted-foreground font-normal">#{pr.number}</span>
        </h1>

        <div className="flex items-center gap-3 mt-3">
          <Badge
            variant={pr.state === 'open' ? 'success' : pr.state === 'merged' ? 'purple' : 'secondary'}
            className="gap-1"
          >
            {stateIcon[pr.state]}
            {stateText[pr.state]}
          </Badge>

          <span className="text-muted-foreground">
            <Link to={`/${pr.author?.username}`} className="font-medium hover:text-foreground">
              {pr.author?.username || 'Unknown'}
            </Link>{' '}
            wants to merge{' '}
            <code className="px-1.5 py-0.5 bg-muted rounded font-mono text-sm">
              {pr.sourceBranch}
            </code>{' '}
            into{' '}
            <code className="px-1.5 py-0.5 bg-muted rounded font-mono text-sm">
              {pr.targetBranch}
            </code>
          </span>
        </div>

        <div className="flex items-center gap-2 mt-3">
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
      </div>

      {/* Tabs */}
      <Tabs defaultValue="conversation">
        <TabsList>
          <TabsTrigger value="conversation" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Conversation
          </TabsTrigger>
          <TabsTrigger value="commits" className="gap-2">
            <GitCommit className="h-4 w-4" />
            Commits
          </TabsTrigger>
          <TabsTrigger value="files" className="gap-2">
            <FileCode className="h-4 w-4" />
            Files changed
            <Badge variant="secondary">{diff.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conversation" className="mt-6 space-y-6">
          {/* PR Description */}
          <Card>
            <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 border-b">
              <Avatar className="h-6 w-6">
                <AvatarImage src={pr.author?.avatarUrl || undefined} />
                <AvatarFallback className="text-xs">
                  {pr.author?.username?.slice(0, 2).toUpperCase() || 'UN'}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium">{pr.author?.username || 'Unknown'}</span>
              <span className="text-muted-foreground">opened this pull request</span>
              <span className="text-muted-foreground">
                {formatRelativeTime(new Date(pr.createdAt))}
              </span>
            </div>
            <CardContent className="p-4">
              {pr.body ? (
                <Markdown content={pr.body} />
              ) : (
                <p className="text-muted-foreground italic">No description provided.</p>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          {timeline.length > 0 && <PrTimeline events={timeline} />}

          {/* Merge section */}
          {pr.state === 'open' && authenticated && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    {pr.isMergeable !== false ? (
                      <p className="text-green-500 font-medium">
                        ✓ This branch has no conflicts with the base branch
                      </p>
                    ) : (
                      <p className="text-red-500 font-medium">
                        ✗ This branch has conflicts that must be resolved
                      </p>
                    )}
                  </div>
                  <MergeButton
                    isMergeable={pr.isMergeable !== false}
                    onMerge={handleMerge}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Comment form */}
          {authenticated && (
            <Card>
              <CardContent className="p-4 space-y-4">
                <Textarea
                  placeholder="Leave a comment..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                />
                <div className="flex justify-end">
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
        </TabsContent>

        <TabsContent value="commits" className="mt-6">
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              <GitCommit className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Commit list coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="files" className="mt-6">
          {diff.length > 0 ? (
            <DiffViewer files={diff} />
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <FileCode className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>File diff coming soon</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
