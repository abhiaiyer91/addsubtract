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
  Loader2,
  Edit3,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { DiffViewer, type DiffFile } from '@/components/diff/diff-viewer';
import { PrTimeline } from '@/components/pr/pr-timeline';
import { ActionCard } from '@/components/pr/action-card';
import { PrSidebar } from '@/components/pr/pr-sidebar';
import { StackViewer } from '@/components/pr/stack-viewer';
import { ReviewButton } from '@/components/pr/review-button';
import { AiChat } from '@/components/pr/ai-chat';
import { BranchStatus } from '@/components/pr/branch-status';
import { KeyboardShortcutsDialog, KeyboardShortcutsButton } from '@/components/pr/keyboard-shortcuts-dialog';
import { RichEditor } from '@/components/editor/rich-editor';
import { ConflictResolver } from '@/components/pr/conflict-resolver';
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
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(new Set());
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editedBody, setEditedBody] = useState('');
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

  // Fetch reviewers
  const { data: reviewersData } = trpc.pulls.reviewers.useQuery(
    { prId: prData?.id! },
    { enabled: !!prData?.id }
  );

  // Check mergeability
  const { data: mergeabilityData } = trpc.pulls.checkMergeability.useQuery(
    { prId: prData?.id! },
    { enabled: !!prData?.id && prData?.state === 'open' }
  );

  // Fetch conflict details if not mergeable
  const { data: conflictsData, isLoading: conflictsLoading } = trpc.pulls.getConflicts.useQuery(
    { prId: prData?.id! },
    { enabled: !!prData?.id && mergeabilityData?.canMerge === false }
  );

  // Trigger AI review mutation
  const triggerReviewMutation = trpc.pulls.triggerAIReview.useMutation({
    onSuccess: () => {
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

  const closeMutation = trpc.pulls.close.useMutation({
    onSuccess: () => {
      utils.pulls.get.invalidate({ repoId: repoData?.repo.id!, number: prNumber });
    },
  });

  const reopenMutation = trpc.pulls.reopen.useMutation({
    onSuccess: () => {
      utils.pulls.get.invalidate({ repoId: repoData?.repo.id!, number: prNumber });
    },
  });

  const updateMutation = trpc.pulls.update.useMutation({
    onSuccess: () => {
      setIsEditingDescription(false);
      utils.pulls.get.invalidate({ repoId: repoData?.repo.id!, number: prNumber });
    },
  });

  const addReviewMutation = trpc.pulls.addReview.useMutation({
    onSuccess: () => {
      utils.pulls.reviews.invalidate({ prId: prData?.id! });
    },
  });

  const requestReviewMutation = trpc.pulls.requestReview.useMutation({
    onSuccess: () => {
      utils.pulls.reviewers.invalidate({ prId: prData?.id! });
    },
  });

  const removeReviewerMutation = trpc.pulls.removeReviewRequest.useMutation({
    onSuccess: () => {
      utils.pulls.reviewers.invalidate({ prId: prData?.id! });
    },
  });

  const addLabelMutation = trpc.pulls.addLabel.useMutation({
    onSuccess: () => {
      utils.pulls.get.invalidate({ repoId: repoData?.repo.id!, number: prNumber });
    },
  });

  const removeLabelMutation = trpc.pulls.removeLabel.useMutation({
    onSuccess: () => {
      utils.pulls.get.invalidate({ repoId: repoData?.repo.id!, number: prNumber });
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
  const reviewers = reviewersData || [];

  // Transform diff data to match DiffFile type
  const diff: DiffFile[] = useMemo(() => (diffData?.files || []).map((file) => ({
    path: file.newPath,
    oldPath: file.oldPath !== file.newPath ? file.oldPath : undefined,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    hunks: file.hunks.map((hunk) => ({
      oldStart: hunk.oldStart,
      newStart: hunk.newStart,
      oldLines: hunk.oldLines,
      newLines: hunk.newLines,
      lines: hunk.lines.map((line) => ({
        type: line.type === 'delete' ? ('remove' as const) : (line.type as 'add' | 'context'),
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
      .filter((review) => review.state !== 'pending')
      .map((review) => ({
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
    ...comments
      .filter((c) => !c.path) // Only general comments, not inline
      .map((comment) => ({
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

  // Process reviewers for sidebar
  const sidebarReviewers = reviewers.map((r) => {
    const latestReview = reviews.find((rev) => rev.userId === r.userId);
    return {
      id: r.userId,
      username: r.user?.username || 'Unknown',
      avatarUrl: r.user?.avatarUrl || null,
      status: (latestReview?.state || 'pending') as 'pending' | 'approved' | 'changes_requested' | 'commented',
    };
  });

  // Review counts
  const approvedCount = reviews.filter((r) => r.state === 'approved').length;
  const changesRequestedCount = reviews.filter((r) => r.state === 'changes_requested').length;

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
    await mergeMutation.mutateAsync({
      prId: prData.id,
      strategy: method,
    });
  };

  const handleClose = async () => {
    if (!prData?.id) return;
    await closeMutation.mutateAsync({ prId: prData.id });
  };

  const handleReopen = async () => {
    if (!prData?.id) return;
    await reopenMutation.mutateAsync({ prId: prData.id });
  };

  const handleComment = async () => {
    if (!comment.trim() || !prData?.id) return;
    addCommentMutation.mutate({
      prId: prData.id,
      body: comment,
    });
  };

  const handleSubmitReview = async (state: 'approved' | 'changes_requested' | 'commented', body: string) => {
    if (!prData?.id) return;
    await addReviewMutation.mutateAsync({
      prId: prData.id,
      state,
      body,
      commitSha: prData.headSha,
    });
  };

  const handleRequestReview = async (userId: string) => {
    if (!prData?.id) return;
    await requestReviewMutation.mutateAsync({
      prId: prData.id,
      reviewerId: userId,
    });
  };

  const handleRemoveReviewer = async (userId: string) => {
    if (!prData?.id) return;
    await removeReviewerMutation.mutateAsync({
      prId: prData.id,
      reviewerId: userId,
    });
  };

  const handleAddLabel = async (labelId: string) => {
    if (!prData?.id) return;
    await addLabelMutation.mutateAsync({
      prId: prData.id,
      labelId,
    });
  };

  const handleRemoveLabel = async (labelId: string) => {
    if (!prData?.id) return;
    await removeLabelMutation.mutateAsync({
      prId: prData.id,
      labelId,
    });
  };

  const handleToggleViewed = (path: string) => {
    const newViewed = new Set(viewedFiles);
    if (newViewed.has(path)) {
      newViewed.delete(path);
    } else {
      newViewed.add(path);
    }
    setViewedFiles(newViewed);
  };

  const handleSaveDescription = async () => {
    if (!prData?.id) return;
    await updateMutation.mutateAsync({
      prId: prData.id,
      body: editedBody,
    });
  };

  const isAuthor = session?.user?.id === pr.authorId;

  // Calculate conflict count
  const conflictCount = conflictsData?.conflicts?.length || mergeabilityData?.conflicts?.length || 0;

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="flex gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* PR Header */}
          <div className="mb-6">
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
                {pr.isDraft && ' (Draft)'}
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

            {/* Labels */}
            {pr.labels && pr.labels.length > 0 && (
              <div className="flex items-center gap-2 mt-3">
                {pr.labels.map((label) => (
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
            )}
          </div>

          {/* Stack visualization (if part of a stack) */}
          {pr.stack && (
            <div className="mb-6">
              <StackViewer
                stack={pr.stack}
                currentPrId={pr.id}
                owner={owner!}
                repo={repo!}
              />
            </div>
          )}

          {/* Action Card */}
          {authenticated && (
            <div className="mb-6">
              <ActionCard
                prState={pr.state}
                isDraft={pr.isDraft}
                isMergeable={mergeabilityData?.canMerge}
                hasConflicts={conflictCount > 0}
                reviewsApproved={approvedCount}
                reviewsChangesRequested={changesRequestedCount}
                behindBy={mergeabilityData?.behindBy}
                isAuthor={isAuthor}
                onMerge={pr.state === 'open' && !pr.isDraft ? handleMerge : undefined}
                onClose={pr.state === 'open' ? handleClose : undefined}
                onReopen={pr.state === 'closed' ? handleReopen : undefined}
                stackName={pr.stack?.name}
                stackPosition={pr.stack?.branches.findIndex((b) => b.pr?.id === pr.id)}
                stackTotal={pr.stack?.branches.length}
                owner={owner}
                repo={repo}
              />
            </div>
          )}

          {/* Tabs */}
          <Tabs defaultValue="conversation">
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                <TabsTrigger value="conversation" className="gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Conversation
                </TabsTrigger>
                <TabsTrigger value="commits" className="gap-2">
                  <GitCommit className="h-4 w-4" />
                  Commits
                  <Badge variant="secondary" className="ml-1">{commits.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="files" className="gap-2">
                  <FileCode className="h-4 w-4" />
                  Files changed
                  <Badge variant="secondary" className="ml-1">{diff.length}</Badge>
                </TabsTrigger>
                {mergeabilityData?.canMerge === false && conflictCount > 0 && (
                  <TabsTrigger value="conflicts" className="gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    Conflicts
                    <Badge variant="warning">{conflictCount}</Badge>
                  </TabsTrigger>
                )}
              </TabsList>

              {authenticated && pr.state === 'open' && (
                <ReviewButton
                  onSubmit={handleSubmitReview}
                  isAuthor={isAuthor}
                />
              )}
            </div>

            <TabsContent value="conversation" className="space-y-6">
              {/* PR Description */}
              <Card>
                <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b">
                  <div className="flex items-center gap-3">
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
                  {isAuthor && !isEditingDescription && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditedBody(pr.body || '');
                        setIsEditingDescription(true);
                      }}
                    >
                      <Edit3 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <CardContent className="p-4">
                  {isEditingDescription ? (
                    <div className="space-y-3">
                      <RichEditor
                        value={editedBody}
                        onChange={setEditedBody}
                        placeholder="Add a description..."
                        minRows={6}
                        autoFocus
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsEditingDescription(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSaveDescription}
                          disabled={updateMutation.isPending}
                        >
                          {updateMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : null}
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : pr.body ? (
                    <Markdown content={pr.body} />
                  ) : (
                    <p className="text-muted-foreground italic">No description provided.</p>
                  )}
                </CardContent>
              </Card>

              {/* Timeline */}
              {timeline.length > 0 && <PrTimeline events={timeline} />}

              {/* Branch status */}
              {pr.state === 'open' && mergeabilityData && (
                <BranchStatus
                  behindBy={mergeabilityData.behindBy || 0}
                  aheadBy={mergeabilityData.aheadBy || 0}
                  hasConflicts={conflictCount > 0}
                  conflictFiles={mergeabilityData.conflicts}
                  targetBranch={pr.targetBranch}
                  sourceBranch={pr.sourceBranch}
                  canUpdateBranch={isAuthor}
                />
              )}

              {/* Comment form */}
              {authenticated && (
                <Card>
                  <CardContent className="p-0">
                    <RichEditor
                      value={comment}
                      onChange={setComment}
                      placeholder="Leave a comment..."
                      minRows={3}
                    />
                    <div className="flex justify-end p-3 border-t">
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

            <TabsContent value="commits">
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

            <TabsContent value="files">
              {diffLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : diff.length > 0 ? (
                <DiffViewer
                  files={diff}
                  prId={prData?.id}
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
                  viewedFiles={viewedFiles}
                  onToggleViewed={handleToggleViewed}
                  showViewedToggle={authenticated}
                />
              ) : (
                <Card>
                  <CardContent className="p-6 text-center text-muted-foreground">
                    <FileCode className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No files changed</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Conflicts Tab */}
            {mergeabilityData?.canMerge === false && conflictCount > 0 && (
              <TabsContent value="conflicts">
                {conflictsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : conflictsData?.conflicts && conflictsData.conflicts.length > 0 ? (
                  <ConflictResolver
                    prId={prData!.id}
                    conflicts={conflictsData.conflicts}
                    sourceBranch={pr.sourceBranch}
                    targetBranch={pr.targetBranch}
                    onResolved={() => {
                      utils.pulls.checkMergeability.invalidate({ prId: prData!.id });
                    }}
                  />
                ) : (
                  <Card>
                    <CardContent className="p-6 text-center text-muted-foreground">
                      <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Conflict details could not be loaded</p>
                      {conflictsData?.error && (
                        <p className="text-sm mt-2">{conflictsData.error}</p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            )}
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="w-64 shrink-0 space-y-6">
          <PrSidebar
            reviewers={sidebarReviewers}
            onRequestReview={authenticated ? handleRequestReview : undefined}
            onRemoveReviewer={authenticated && isAuthor ? handleRemoveReviewer : undefined}
            canManageReviewers={authenticated && (isAuthor || false)}
            checks={[]} // TODO: Add CI checks integration
            labels={pr.labels || []}
            onAddLabel={authenticated ? handleAddLabel : undefined}
            onRemoveLabel={authenticated ? handleRemoveLabel : undefined}
            canManageLabels={authenticated}
          />

          {/* AI Review Card */}
          <Card>
            <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                <span className="font-medium text-sm">AI Review</span>
                {aiReviewData?.state && (
                  <Badge variant={aiReviewData.state === 'approved' ? 'success' : 'warning'} className="text-xs">
                    {aiReviewData.state === 'approved' ? 'Approved' : 'Changes'}
                  </Badge>
                )}
              </div>
              {authenticated && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => triggerReviewMutation.mutate({ prId: prData!.id })}
                  disabled={triggerReviewMutation.isPending}
                >
                  {triggerReviewMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>
            <CardContent className="p-3">
              {aiReviewLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : aiReviewData?.body ? (
                <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                  <Markdown content={aiReviewData.body.slice(0, 300) + (aiReviewData.body.length > 300 ? '...' : '')} />
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">
                    {authenticated ? 'Click refresh to run AI review' : 'Sign in to run AI review'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AI Chat */}
          <AiChat
            prNumber={pr.number}
            onSendMessage={authenticated ? async () => {
              // TODO: Integrate with actual AI endpoint
              return "AI response coming soon! This feature will allow you to ask questions about the PR.";
            } : undefined}
          />

          {/* Keyboard shortcuts button */}
          <div className="pt-4 border-t">
            <KeyboardShortcutsButton />
          </div>
        </div>
      </div>

      {/* Keyboard shortcuts dialog */}
      <KeyboardShortcutsDialog />
    </RepoLayout>
  );
}
