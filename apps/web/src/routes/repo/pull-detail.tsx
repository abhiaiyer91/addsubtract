import { useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  GitPullRequest,
  GitMerge,
  X,
  MessageSquare,
  FileCode,
  GitCommit,
  Bot,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Loader2,
  Layers,
  ArrowRight,
  Circle,
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
import { RepoLayout } from './components/repo-layout';
import { Loading } from '@/components/ui/loading';
import { formatRelativeTime } from '@/lib/utils';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import type { InlineCommentData } from '@/components/diff/inline-comment';



export function PullDetailPage() {
  const { owner, repo, number } = useParams<{
    owner: string;
    repo: string;
    number: string;
  }>();
  const [comment, setComment] = useState('');
  const { data: session } = useSession();
  const authenticated = !!session?.user;
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

  // Fetch diff
  const { data: diffData, isLoading: diffLoading } = trpc.pulls.getDiff.useQuery(
    { prId: prData?.id! },
    { enabled: !!prData?.id }
  );

  // Fetch commits
  const { data: commitsData, isLoading: commitsLoading } = trpc.pulls.getCommits.useQuery(
    { prId: prData?.id! },
    { enabled: !!prData?.id }
  );

  // Fetch AI review
  const { data: aiReviewData, isLoading: aiReviewLoading, refetch: refetchAIReview } = trpc.pulls.getAIReview.useQuery(
    { prId: prData?.id! },
    { enabled: !!prData?.id }
  );

  // Trigger AI review mutation
  const triggerReviewMutation = trpc.pulls.triggerAIReview.useMutation({
    onSuccess: () => {
      // Refetch AI review after a delay to allow processing
      setTimeout(() => {
        refetchAIReview();
      }, 3000);
    },
  });

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

  // Inline comment mutations
  const addInlineCommentMutation = trpc.pulls.addComment.useMutation({
    onSuccess: () => {
      utils.pulls.comments.invalidate({ prId: prData?.id! });
    },
  });

  const editCommentMutation = trpc.pulls.updateComment.useMutation({
    onSuccess: () => {
      utils.pulls.comments.invalidate({ prId: prData?.id! });
    },
  });

  const deleteCommentMutation = trpc.pulls.deleteComment.useMutation({
    onSuccess: () => {
      utils.pulls.comments.invalidate({ prId: prData?.id! });
    },
  });

  const resolveCommentMutation = trpc.pulls.resolveComment.useMutation({
    onSuccess: () => {
      utils.pulls.comments.invalidate({ prId: prData?.id! });
    },
  });

  const unresolveCommentMutation = trpc.pulls.unresolveComment.useMutation({
    onSuccess: () => {
      utils.pulls.comments.invalidate({ prId: prData?.id! });
    },
  });

  const isLoading = repoLoading || prLoading;

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading pull request..." />
      </RepoLayout>
    );
  }

  if (!prData) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold mb-2">Pull request not found</h2>
          <p className="text-muted-foreground">
            Pull request #{prNumber} could not be found in this repository.
          </p>
        </div>
      </RepoLayout>
    );
  }

  const pr = prData;
  const reviews = reviewsData || [];
  const comments = commentsData || [];
  
  // Transform diff data to match DiffFile type
  const diff: DiffFile[] = useMemo(() => (diffData?.files || []).map(file => ({
    path: file.newPath,
    oldPath: file.oldPath !== file.newPath ? file.oldPath : undefined,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    hunks: file.hunks.map(hunk => ({
      oldStart: hunk.oldStart,
      newStart: hunk.newStart,
      oldLines: hunk.oldLines,
      newLines: hunk.newLines,
      lines: hunk.lines.map(line => ({
        type: line.type === 'delete' ? 'remove' as const : line.type as 'add' | 'context',
        content: line.content,
      })),
    })),
  })), [diffData]);

  // Transform comments for the diff viewer, grouped by file path
  const commentsByFile = useMemo(() => {
    const grouped: Record<string, InlineCommentData[]> = {};
    
    // Filter only inline comments (those with a path)
    const inlineComments = comments.filter((c: any) => c.path);
    
    inlineComments.forEach((comment: any) => {
      const filePath = comment.path;
      if (!grouped[filePath]) {
        grouped[filePath] = [];
      }
      grouped[filePath].push({
        id: comment.id,
        body: comment.body,
        userId: comment.userId,
        prId: comment.prId,
        path: comment.path,
        line: comment.line,
        side: comment.side,
        startLine: comment.startLine || null,
        endLine: comment.endLine || null,
        isResolved: comment.isResolved || false,
        resolvedAt: comment.resolvedAt ? new Date(comment.resolvedAt) : null,
        resolvedById: comment.resolvedById || null,
        replyToId: comment.replyToId || null,
        createdAt: new Date(comment.createdAt),
        updatedAt: new Date(comment.updatedAt),
        user: comment.user,
      });
    });
    
    return grouped;
  }, [comments]);

  // Inline comment handlers
  const handleAddInlineComment = useCallback(
    (filePath: string, line: number, side: 'LEFT' | 'RIGHT', body: string) => {
      if (!prData?.id) return;
      addInlineCommentMutation.mutate({
        prId: prData.id,
        body,
        path: filePath,
        line,
        side,
        commitSha: prData.headSha,
      });
    },
    [prData, addInlineCommentMutation]
  );

  const handleReplyComment = useCallback(
    (commentId: string, body: string) => {
      if (!prData?.id) return;
      // Find the parent comment to get context
      const parentComment = comments.find((c: any) => c.id === commentId);
      addInlineCommentMutation.mutate({
        prId: prData.id,
        body,
        path: parentComment?.path,
        line: parentComment?.line,
        side: parentComment?.side,
        commitSha: prData.headSha,
        replyToId: commentId,
      });
    },
    [prData, comments, addInlineCommentMutation]
  );

  const handleEditComment = useCallback(
    (commentId: string, body: string) => {
      editCommentMutation.mutate({ commentId, body });
    },
    [editCommentMutation]
  );

  const handleDeleteComment = useCallback(
    (commentId: string) => {
      deleteCommentMutation.mutate({ commentId });
    },
    [deleteCommentMutation]
  );

  const handleResolveComment = useCallback(
    (commentId: string) => {
      resolveCommentMutation.mutate({ commentId });
    },
    [resolveCommentMutation]
  );

  const handleUnresolveComment = useCallback(
    (commentId: string) => {
      unresolveCommentMutation.mutate({ commentId });
    },
    [unresolveCommentMutation]
  );
  
  const commits = commitsData?.commits || [];

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

  const handleMerge = async (method: 'merge' | 'squash' | 'rebase') => {
    if (!prData?.id) return;
    mergeMutation.mutate({
      prId: prData.id,
      strategy: method,
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
    <RepoLayout owner={owner!} repo={repo!}>
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

        {/* Stack context */}
        {pr.stack && (
          <Card className="mt-4 bg-muted/30">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Part of stack:</span>
                <Link 
                  to={`/${owner}/${repo}/stacks/${pr.stack.name}`}
                  className="text-sm text-primary hover:underline"
                >
                  {pr.stack.name}
                </Link>
              </div>
              <div className="flex items-center gap-1 flex-wrap text-xs">
                <code className="bg-muted px-1.5 py-0.5 rounded">{pr.stack.baseBranch}</code>
                {pr.stack.branches.map((branch, idx) => {
                  const isCurrentPR = branch.isCurrent;
                  const prState = branch.pr?.state;
                  
                  return (
                    <span key={branch.branchName} className="flex items-center gap-1">
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      {branch.pr ? (
                        <Link 
                          to={`/${owner}/${repo}/pull/${branch.pr.number}`}
                          className={`px-1.5 py-0.5 rounded flex items-center gap-1 ${
                            isCurrentPR 
                              ? 'bg-primary text-primary-foreground font-medium' 
                              : prState === 'merged'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                                : prState === 'closed'
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                  : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          }`}
                        >
                          {prState === 'merged' && <GitMerge className="h-3 w-3" />}
                          {prState === 'open' && <GitPullRequest className="h-3 w-3" />}
                          {prState === 'closed' && <Circle className="h-3 w-3" />}
                          #{branch.pr.number}
                        </Link>
                      ) : (
                        <code className="bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                          {branch.branchName}
                        </code>
                      )}
                    </span>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Review and merge PRs in order from left to right
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="conversation">
        <TabsList>
          <TabsTrigger value="conversation" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Conversation
          </TabsTrigger>
          <TabsTrigger value="ai-review" className="gap-2">
            <Bot className="h-4 w-4" />
            AI Review
            {aiReviewData && (
              <Badge variant={aiReviewData.state === 'approved' ? 'success' : 'warning'} className="ml-1">
                {aiReviewData.state === 'approved' ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
              </Badge>
            )}
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

        <TabsContent value="ai-review" className="mt-6">
          <Card>
            <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                <span className="font-medium">AI Code Review</span>
                {aiReviewData?.state && (
                  <Badge variant={aiReviewData.state === 'approved' ? 'success' : 'warning'}>
                    {aiReviewData.state === 'approved' ? 'Approved' : 'Changes Requested'}
                  </Badge>
                )}
              </div>
              {authenticated && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => triggerReviewMutation.mutate({ prId: prData!.id })}
                  disabled={triggerReviewMutation.isPending}
                  className="gap-2"
                >
                  {triggerReviewMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {aiReviewData ? 'Re-run Review' : 'Run AI Review'}
                </Button>
              )}
            </div>
            <CardContent className="p-4">
              {aiReviewLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : aiReviewData?.body ? (
                <Markdown content={aiReviewData.body} />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="mb-2">No AI review yet</p>
                  <p className="text-sm">
                    {authenticated 
                      ? 'Click "Run AI Review" to analyze this pull request'
                      : 'Sign in to run an AI review on this pull request'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="commits" className="mt-6">
          {commitsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : commits.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  {commits.map((commit) => (
                    <div key={commit.sha} className="p-4 hover:bg-muted/50">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{commit.message}</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {commit.author} committed {new Date(commit.date).toLocaleDateString()}
                          </p>
                        </div>
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                          {commit.sha.slice(0, 7)}
                        </code>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <GitCommit className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No commits found</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="files" className="mt-6">
          {diffLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : diff.length > 0 ? (
            <DiffViewer
              files={diff}
              comments={commentsByFile}
              currentUserId={session?.user?.id}
              onAddComment={authenticated ? handleAddInlineComment : undefined}
              onReplyComment={authenticated ? handleReplyComment : undefined}
              onEditComment={authenticated ? handleEditComment : undefined}
              onDeleteComment={authenticated ? handleDeleteComment : undefined}
              onResolveComment={authenticated ? handleResolveComment : undefined}
              onUnresolveComment={authenticated ? handleUnresolveComment : undefined}
              isAddingComment={addInlineCommentMutation.isPending}
              isEditingComment={editCommentMutation.isPending}
              isDeletingComment={deleteCommentMutation.isPending}
              isResolvingComment={resolveCommentMutation.isPending || unresolveCommentMutation.isPending}
            />
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
    </RepoLayout>
  );
}
