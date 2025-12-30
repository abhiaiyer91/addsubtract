import { useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  GitPullRequest,
  GitMerge,
  X,
  MessageSquare,
  FileCode,
  GitCommit,
  Loader2,
  Edit3,
  AlertTriangle,
  Settings2,
  ChevronUp,
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
import { AiReviewCard } from '@/components/pr/ai-review-card';
import { BranchStatus } from '@/components/pr/branch-status';
import { KeyboardShortcutsDialog, KeyboardShortcutsButton } from '@/components/pr/keyboard-shortcuts-dialog';
import { MergeQueueCard } from '@/components/pr/merge-queue-card';
import { RichEditor } from '@/components/editor/rich-editor';
import { ConflictResolver } from '@/components/pr/conflict-resolver';
import { Markdown } from '@/components/markdown/renderer';
import { RepoLayout } from './components/repo-layout';
import { Loading } from '@/components/ui/loading';
import { formatRelativeTime, cn } from '@/lib/utils';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { toastSuccess, toastError, toastInfo } from '@/components/ui/use-toast';
import type { InlineCommentData } from '@/components/diff/inline-comment';
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
} from '@/components/ui/bottom-sheet';
import { useMobile } from '@/hooks/use-mobile';

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
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const isMobile = useMobile();
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

  // Fetch available labels for the sidebar
  const { data: availableLabels } = trpc.issues.listLabels.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  );

  // Fetch collaborators for available reviewers
  const { data: collaborators } = trpc.repos.collaborators.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
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
      toastInfo({
        title: 'AI Review started',
        description: 'The review will be ready in a few moments.',
      });
      // Refetch AI review after a delay to allow processing
      setTimeout(() => {
        refetchAIReview();
      }, 3000);
    },
    onError: (error) => {
      toastError({
        title: 'Failed to start AI review',
        description: error.message,
      });
    },
  });

  // Mutations
  const addCommentMutation = trpc.pulls.addComment.useMutation({
    onSuccess: () => {
      setComment('');
      utils.pulls.comments.invalidate({ prId: prData?.id! });
      toastSuccess({
        title: 'Comment added',
        description: 'Your comment has been posted.',
      });
    },
    onError: (error) => {
      toastError({
        title: 'Failed to add comment',
        description: error.message,
      });
    },
  });

  const mergeMutation = trpc.pulls.merge.useMutation({
    onSuccess: () => {
      utils.pulls.get.invalidate({ repoId: repoData?.repo.id!, number: prNumber });
      toastSuccess({
        title: 'Pull request merged',
        description: `PR #${prNumber} has been successfully merged.`,
      });
    },
    onError: (error) => {
      toastError({
        title: 'Failed to merge pull request',
        description: error.message,
      });
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

  const reviews = reviewsData || [];
  const comments = commentsData || [];
  const reviewers = reviewersData || [];

  // Transform diff data to match DiffFile type
  // NOTE: All hooks must be called before any early returns to follow React's rules of hooks
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
        path: parentComment?.path ?? undefined,
        line: parentComment?.line ?? undefined,
        side: parentComment?.side === 'LEFT' || parentComment?.side === 'RIGHT' ? parentComment.side : undefined,
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

  // Process available reviewers from collaborators (includes owner)
  const availableReviewers = useMemo(() => {
    const reviewersList: Array<{ id: string; username: string; avatarUrl?: string | null }> = [];
    
    // Add repo owner
    if (repoData?.repo.owner) {
      reviewersList.push({
        id: repoData.repo.ownerId,
        username: repoData.repo.owner.username,
        avatarUrl: repoData.repo.owner.avatarUrl || null,
      });
    }
    
    // Add collaborators
    if (collaborators) {
      collaborators.forEach((collab: any) => {
        // Don't add duplicates (owner might already be added)
        if (!reviewersList.some((r) => r.id === collab.userId)) {
          reviewersList.push({
            id: collab.userId,
            username: collab.user?.username || 'Unknown',
            avatarUrl: collab.user?.avatarUrl || null,
          });
        }
      });
    }
    
    return reviewersList;
  }, [repoData, collaborators]);

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
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0 order-2 lg:order-1">
          {/* PR Header */}
          <div className="mb-4 lg:mb-6">
            <h1 className="text-xl lg:text-2xl font-bold flex flex-wrap items-center gap-2">
              <span className="break-words">{pr.title}</span>
              <span className="text-muted-foreground font-normal">#{pr.number}</span>
            </h1>

            <div className="flex flex-wrap items-center gap-2 lg:gap-3 mt-3 text-sm lg:text-base">
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
                <span className="hidden sm:inline">wants to merge</span>
              </span>
            </div>

            {/* Branch info - mobile optimized */}
            <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
              <code className="px-1.5 py-0.5 bg-muted rounded font-mono text-xs lg:text-sm truncate max-w-[150px] lg:max-w-none">
                {pr.sourceBranch}
              </code>
              <span className="text-muted-foreground">→</span>
              <code className="px-1.5 py-0.5 bg-muted rounded font-mono text-xs lg:text-sm truncate max-w-[150px] lg:max-w-none">
                {pr.targetBranch}
              </code>
            </div>

            {/* Labels */}
            {pr.labels && pr.labels.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
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
          {authenticated && repoData?.repo.id && (
            <div className="mb-6">
              <ActionCard
                prId={pr.id}
                prState={pr.state}
                repoId={repoData.repo.id}
                targetBranch={pr.targetBranch}
                isDraft={pr.isDraft}
                isMergeable={mergeabilityData?.canMerge}
                hasConflicts={conflictCount > 0}
                reviewsApproved={approvedCount}
                reviewsChangesRequested={changesRequestedCount}
                behindBy={mergeabilityData?.behindBy}
                isAuthor={isAuthor}
                canWrite={authenticated}
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              {/* Scrollable tabs container for mobile */}
              <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
                <TabsList className="inline-flex w-max sm:w-auto">
                  <TabsTrigger value="conversation" className="gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
                    <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="hidden xs:inline">Conversation</span>
                    <span className="xs:hidden">Chat</span>
                  </TabsTrigger>
                  <TabsTrigger value="commits" className="gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
                    <GitCommit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline">Commits</span>
                    <Badge variant="secondary" className="ml-1 text-xs">{commits.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="files" className="gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
                    <FileCode className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline">Files</span>
                    <Badge variant="secondary" className="ml-1 text-xs">{diff.length}</Badge>
                  </TabsTrigger>
                  {mergeabilityData?.canMerge === false && conflictCount > 0 && (
                    <TabsTrigger value="conflicts" className="gap-1.5 text-xs sm:text-sm px-2 sm:px-3">
                      <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500" />
                      <span className="hidden sm:inline">Conflicts</span>
                      <Badge variant="warning" className="text-xs">{conflictCount}</Badge>
                    </TabsTrigger>
                  )}
                </TabsList>
              </div>

              <div className="flex items-center gap-2">
                {/* Mobile sidebar toggle - use BottomSheet */}
                {isMobile && (
                  <BottomSheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
                    <BottomSheetTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="lg:hidden h-9 gap-1.5"
                      >
                        <Settings2 className="h-4 w-4" />
                        <span className="text-xs">Details</span>
                        <ChevronUp className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </BottomSheetTrigger>
                    <BottomSheetContent height="full" showHandle={true}>
                      <BottomSheetHeader>
                        <BottomSheetTitle>PR Details</BottomSheetTitle>
                      </BottomSheetHeader>
                      <div className="space-y-4 pb-20">
                        <PrSidebar
                          reviewers={sidebarReviewers}
                          availableReviewers={availableReviewers}
                          onRequestReview={authenticated ? handleRequestReview : undefined}
                          onRemoveReviewer={authenticated && isAuthor ? handleRemoveReviewer : undefined}
                          canManageReviewers={authenticated && (isAuthor || false)}
                          checks={[]}
                          labels={pr.labels || []}
                          availableLabels={availableLabels || []}
                          onAddLabel={authenticated ? handleAddLabel : undefined}
                          onRemoveLabel={authenticated ? handleRemoveLabel : undefined}
                          canManageLabels={authenticated}
                        />

                        {/* Merge Queue Card */}
                        {repoData?.repo.id && (
                          <MergeQueueCard
                            prId={pr.id}
                            repoId={repoData.repo.id}
                            targetBranch={pr.targetBranch}
                            prState={pr.state}
                            owner={owner!}
                            repo={repo!}
                          />
                        )}

                        {/* AI Chat */}
                        <AiChat
                          prNumber={pr.number}
                          onSendMessage={authenticated ? async () => {
                            return "AI response coming soon! This feature will allow you to ask questions about the PR.";
                          } : undefined}
                        />
                      </div>
                    </BottomSheetContent>
                  </BottomSheet>
                )}

                {authenticated && pr.state === 'open' && (
                  <ReviewButton
                    onSubmit={handleSubmitReview}
                    isAuthor={isAuthor}
                  />
                )}
              </div>
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

              {/* AI Review Card */}
              <AiReviewCard
                data={aiReviewData}
                isLoading={aiReviewLoading}
                onRefresh={() => triggerReviewMutation.mutate({ prId: prData!.id })}
                isRefreshing={triggerReviewMutation.isPending}
                authenticated={authenticated}
              />

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

        {/* Sidebar - Desktop only (mobile uses BottomSheet above) */}
        <div className="hidden lg:block lg:w-64 shrink-0 space-y-6 order-2">
          <PrSidebar
            reviewers={sidebarReviewers}
            availableReviewers={availableReviewers}
            onRequestReview={authenticated ? handleRequestReview : undefined}
            onRemoveReviewer={authenticated && isAuthor ? handleRemoveReviewer : undefined}
            canManageReviewers={authenticated && (isAuthor || false)}
            checks={[]}
            labels={pr.labels || []}
            availableLabels={availableLabels || []}
            onAddLabel={authenticated ? handleAddLabel : undefined}
            onRemoveLabel={authenticated ? handleRemoveLabel : undefined}
            canManageLabels={authenticated}
          />

          {/* Merge Queue Card */}
          {repoData?.repo.id && (
            <MergeQueueCard
              prId={pr.id}
              repoId={repoData.repo.id}
              targetBranch={pr.targetBranch}
              prState={pr.state}
              owner={owner!}
              repo={repo!}
            />
          )}

          {/* AI Chat */}
          <AiChat
            prNumber={pr.number}
            onSendMessage={authenticated ? async () => {
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
