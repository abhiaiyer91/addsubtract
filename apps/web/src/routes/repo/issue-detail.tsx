import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CircleDot, CheckCircle2, ChevronRight, FolderKanban, RefreshCw, Settings2, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Markdown } from '@/components/markdown/renderer';
import { LabelPicker } from '@/components/issue/label-picker';
import { ProjectPicker } from '@/components/issue/project-picker';
import { PriorityPicker, type IssuePriority } from '@/components/issue/priority-picker';
import { RepoLayout } from './components/repo-layout';
import { Loading } from '@/components/ui/loading';
import { formatRelativeTime, formatDate, cn } from '@/lib/utils';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import type { Label } from '@/lib/api-types';
import { toastSuccess, toastError } from '@/components/ui/use-toast';
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
} from '@/components/ui/bottom-sheet';
import { useMobile } from '@/hooks/use-mobile';

export function IssueDetailPage() {
  const { owner, repo, number } = useParams<{
    owner: string;
    repo: string;
    number: string;
  }>();
  const [comment, setComment] = useState('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const isMobile = useMobile();
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

  // Fetch project if issue belongs to one
  const { data: project } = trpc.projects.get.useQuery(
    { projectId: issueData?.projectId! },
    { enabled: !!issueData?.projectId }
  );

  // Fetch cycle if issue belongs to one
  const { data: cycle } = trpc.cycles.get.useQuery(
    { cycleId: issueData?.cycleId! },
    { enabled: !!issueData?.cycleId }
  );

  // Fetch available projects for the picker
  const { data: availableProjects } = trpc.projects.list.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  );

  // Mutations
  const addCommentMutation = trpc.issues.addComment.useMutation({
    onSuccess: () => {
      setComment('');
      utils.issues.comments.invalidate({ issueId: issueData?.id! });
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

  const closeIssueMutation = trpc.issues.close.useMutation({
    onMutate: async () => {
      // Cancel outgoing refetches
      await utils.issues.get.cancel({ repoId: repoData?.repo.id!, number: issueNumber });
      
      // Snapshot previous value
      const previousIssue = utils.issues.get.getData({ repoId: repoData?.repo.id!, number: issueNumber });
      
      // Optimistically update
      utils.issues.get.setData(
        { repoId: repoData?.repo.id!, number: issueNumber },
        (old) => old ? { ...old, state: 'closed' } : old
      );
      
      return { previousIssue };
    },
    onSuccess: () => {
      toastSuccess({
        title: 'Issue closed',
        description: `Issue #${issueNumber} has been closed.`,
      });
    },
    onError: (error, _variables, context) => {
      // Roll back on error
      if (context?.previousIssue) {
        utils.issues.get.setData(
          { repoId: repoData?.repo.id!, number: issueNumber },
          context.previousIssue
        );
      }
      toastError({
        title: 'Failed to close issue',
        description: error.message,
      });
    },
    onSettled: () => {
      // Invalidate all issue-related queries to ensure UI is updated everywhere
      utils.issues.get.invalidate({ repoId: repoData?.repo.id!, number: issueNumber });
      utils.issues.list.invalidate({ repoId: repoData?.repo.id! });
      utils.issues.listGroupedByStatus.invalidate({ repoId: repoData?.repo.id! });
      utils.issues.inboxAssignedToMe.invalidate();
      utils.issues.inboxCreatedByMe.invalidate();
      utils.issues.inboxParticipated.invalidate();
      utils.issues.inboxSummary.invalidate();
    },
  });

  const reopenIssueMutation = trpc.issues.reopen.useMutation({
    onMutate: async () => {
      // Cancel outgoing refetches
      await utils.issues.get.cancel({ repoId: repoData?.repo.id!, number: issueNumber });
      
      // Snapshot previous value
      const previousIssue = utils.issues.get.getData({ repoId: repoData?.repo.id!, number: issueNumber });
      
      // Optimistically update
      utils.issues.get.setData(
        { repoId: repoData?.repo.id!, number: issueNumber },
        (old) => old ? { ...old, state: 'open' } : old
      );
      
      return { previousIssue };
    },
    onSuccess: () => {
      toastSuccess({
        title: 'Issue reopened',
        description: `Issue #${issueNumber} has been reopened.`,
      });
    },
    onError: (error, _variables, context) => {
      // Roll back on error
      if (context?.previousIssue) {
        utils.issues.get.setData(
          { repoId: repoData?.repo.id!, number: issueNumber },
          context.previousIssue
        );
      }
      toastError({
        title: 'Failed to reopen issue',
        description: error.message,
      });
    },
    onSettled: () => {
      // Invalidate all issue-related queries to ensure UI is updated everywhere
      utils.issues.get.invalidate({ repoId: repoData?.repo.id!, number: issueNumber });
      utils.issues.list.invalidate({ repoId: repoData?.repo.id! });
      utils.issues.listGroupedByStatus.invalidate({ repoId: repoData?.repo.id! });
      utils.issues.inboxAssignedToMe.invalidate();
      utils.issues.inboxCreatedByMe.invalidate();
      utils.issues.inboxParticipated.invalidate();
      utils.issues.inboxSummary.invalidate();
    },
  });

  const assignToProjectMutation = trpc.issues.assignToProject.useMutation({
    onSuccess: () => {
      utils.issues.get.invalidate({ repoId: repoData?.repo.id!, number: issueNumber });
      utils.projects.getProgress.invalidate();
      toastSuccess({
        title: 'Project updated',
        description: 'Issue project assignment has been updated.',
      });
    },
    onError: (error) => {
      toastError({
        title: 'Failed to update project',
        description: error.message,
      });
    },
  });

  const updatePriorityMutation = trpc.issues.updatePriority.useMutation({
    onMutate: async ({ priority }) => {
      await utils.issues.get.cancel({ repoId: repoData?.repo.id!, number: issueNumber });
      const previousIssue = utils.issues.get.getData({ repoId: repoData?.repo.id!, number: issueNumber });
      utils.issues.get.setData(
        { repoId: repoData?.repo.id!, number: issueNumber },
        (old) => old ? { ...old, priority } : old
      );
      return { previousIssue };
    },
    onSuccess: () => {
      toastSuccess({
        title: 'Priority updated',
        description: 'Issue priority has been updated.',
      });
    },
    onError: (error, _variables, context) => {
      if (context?.previousIssue) {
        utils.issues.get.setData(
          { repoId: repoData?.repo.id!, number: issueNumber },
          context.previousIssue
        );
      }
      toastError({
        title: 'Failed to update priority',
        description: error.message,
      });
    },
    onSettled: () => {
      utils.issues.get.invalidate({ repoId: repoData?.repo.id!, number: issueNumber });
      utils.issues.list.invalidate({ repoId: repoData?.repo.id! });
      utils.issues.listGroupedByStatus.invalidate({ repoId: repoData?.repo.id! });
    },
  });

  const addLabelMutation = trpc.issues.addLabel.useMutation({
    onMutate: async ({ labelId }) => {
      await utils.issues.get.cancel({ repoId: repoData?.repo.id!, number: issueNumber });
      const previousIssue = utils.issues.get.getData({ repoId: repoData?.repo.id!, number: issueNumber });
      const labelToAdd = availableLabels?.find((l) => l.id === labelId);
      if (labelToAdd) {
        utils.issues.get.setData(
          { repoId: repoData?.repo.id!, number: issueNumber },
          (old) => old ? { ...old, labels: [...(old.labels || []), labelToAdd] } : old
        );
      }
      return { previousIssue };
    },
    onError: (error, _variables, context) => {
      if (context?.previousIssue) {
        utils.issues.get.setData(
          { repoId: repoData?.repo.id!, number: issueNumber },
          context.previousIssue
        );
      }
      toastError({
        title: 'Failed to add label',
        description: error.message,
      });
    },
    onSettled: () => {
      utils.issues.get.invalidate({ repoId: repoData?.repo.id!, number: issueNumber });
      utils.issues.list.invalidate({ repoId: repoData?.repo.id! });
      utils.issues.listGroupedByStatus.invalidate({ repoId: repoData?.repo.id! });
    },
  });

  const removeLabelMutation = trpc.issues.removeLabel.useMutation({
    onMutate: async ({ labelId }) => {
      await utils.issues.get.cancel({ repoId: repoData?.repo.id!, number: issueNumber });
      const previousIssue = utils.issues.get.getData({ repoId: repoData?.repo.id!, number: issueNumber });
      utils.issues.get.setData(
        { repoId: repoData?.repo.id!, number: issueNumber },
        (old) => old ? { ...old, labels: (old.labels || []).filter((l) => l.id !== labelId) } : old
      );
      return { previousIssue };
    },
    onError: (error, _variables, context) => {
      if (context?.previousIssue) {
        utils.issues.get.setData(
          { repoId: repoData?.repo.id!, number: issueNumber },
          context.previousIssue
        );
      }
      toastError({
        title: 'Failed to remove label',
        description: error.message,
      });
    },
    onSettled: () => {
      utils.issues.get.invalidate({ repoId: repoData?.repo.id!, number: issueNumber });
      utils.issues.list.invalidate({ repoId: repoData?.repo.id! });
      utils.issues.listGroupedByStatus.invalidate({ repoId: repoData?.repo.id! });
    },
  });

  const handleProjectChange = (newProject: { id: string; name: string; icon: string | null } | null) => {
    if (!issueData?.id) return;
    assignToProjectMutation.mutate({
      issueId: issueData.id,
      projectId: newProject?.id ?? null,
    });
  };

  const handlePriorityChange = (priority: IssuePriority) => {
    if (!issueData?.id) return;
    updatePriorityMutation.mutate({
      issueId: issueData.id,
      priority,
    });
  };

  const handleLabelsChange = (newLabels: Label[]) => {
    if (!issueData?.id) return;
    const currentLabels = issueData.labels || [];
    const currentLabelIds = new Set(currentLabels.map((l) => l.id));
    const newLabelIds = new Set(newLabels.map((l) => l.id));

    // Find labels to add (in newLabels but not in current)
    for (const label of newLabels) {
      if (!currentLabelIds.has(label.id)) {
        addLabelMutation.mutate({
          issueId: issueData.id,
          labelId: label.id,
        });
      }
    }

    // Find labels to remove (in current but not in newLabels)
    for (const label of currentLabels) {
      if (!newLabelIds.has(label.id)) {
        removeLabelMutation.mutate({
          issueId: issueData.id,
          labelId: label.id,
        });
      }
    }
  };

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
      {/* Breadcrumb navigation */}
      <div className="flex items-center gap-2 text-sm mb-4">
        <Link 
          to={`/${owner}/${repo}/issues`}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Issues
        </Link>
        {(project || cycle) && (
          <>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <Link 
              to={project 
                ? `/${owner}/${repo}/issues?section=project&project=${project.id}` 
                : `/${owner}/${repo}/issues?section=cycle&cycle=${cycle?.id}`
              }
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              {project ? (
                <>
                  <FolderKanban className="h-4 w-4" />
                  {project.icon && <span>{project.icon}</span>}
                  {project.name}
                </>
              ) : cycle ? (
                <>
                  <RefreshCw className="h-4 w-4" />
                  {cycle.name}
                </>
              ) : null}
            </Link>
          </>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
        <span className="text-foreground">#{issue.number}</span>
      </div>

      {/* Issue header */}
      <div>
        <h1 className="text-xl lg:text-2xl font-bold flex flex-wrap items-start gap-2">
          <span className="break-words">{issue.title}</span>
          <span className="text-muted-foreground font-normal">
            #{issue.number}
          </span>
        </h1>

        <div className="flex flex-wrap items-center gap-2 lg:gap-3 mt-3">
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

          {/* Project/Cycle badges */}
          {project && (
            <Link to={`/${owner}/${repo}/issues?section=project&project=${project.id}`}>
              <Badge variant="outline" className="gap-1.5 hover:bg-muted transition-colors">
                <FolderKanban className="h-3 w-3" />
                {project.icon && <span>{project.icon}</span>}
                <span className="hidden sm:inline">{project.name}</span>
              </Badge>
            </Link>
          )}
          {cycle && (
            <Link to={`/${owner}/${repo}/issues?section=cycle&cycle=${cycle.id}`}>
              <Badge variant="outline" className="gap-1.5 hover:bg-muted transition-colors">
                <RefreshCw className="h-3 w-3" />
                <span className="hidden sm:inline">{cycle.name}</span>
              </Badge>
            </Link>
          )}

          {/* Mobile sidebar toggle - use BottomSheet */}
          {isMobile && (
            <BottomSheet open={isMobileSidebarOpen} onOpenChange={setIsMobileSidebarOpen}>
              <BottomSheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="md:hidden h-8 gap-1.5"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  <span className="text-xs">Details</span>
                  <ChevronUp className="h-3 w-3 text-muted-foreground" />
                </Button>
              </BottomSheetTrigger>
              <BottomSheetContent height="full" showHandle={true}>
                <BottomSheetHeader>
                  <BottomSheetTitle>Issue Details</BottomSheetTitle>
                </BottomSheetHeader>
                <div className="space-y-4 pb-20">
                  {/* Labels */}
                  <div>
                    <LabelPicker
                      availableLabels={availableLabels || []}
                      selectedLabels={issue.labels || []}
                      onLabelsChange={handleLabelsChange}
                    />
                  </div>

                  <Separator />

                  {/* Priority */}
                  <PriorityPicker
                    priority={issue.priority as IssuePriority}
                    onPriorityChange={handlePriorityChange}
                    isLoading={updatePriorityMutation.isPending}
                  />

                  <Separator />

                  {/* Project */}
                  <ProjectPicker
                    availableProjects={availableProjects || []}
                    selectedProject={project || null}
                    onProjectChange={handleProjectChange}
                    isLoading={assignToProjectMutation.isPending}
                  />

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
              </BottomSheetContent>
            </BottomSheet>
          )}
        </div>

        {/* Author info - separate line for better mobile layout */}
        <p className="text-sm text-muted-foreground mt-2">
          <Link
            to={`/${issue.author?.username}`}
            className="font-medium hover:text-foreground"
          >
            {issue.author?.username || 'Unknown'}
          </Link>{' '}
          opened {formatRelativeTime(new Date(issue.createdAt))} · {comments.length} comments
        </p>
      </div>

      <div className="grid md:grid-cols-4 gap-4 lg:gap-6">
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

        {/* Sidebar - Desktop only (mobile uses BottomSheet above) */}
        <div className="hidden md:block space-y-4 lg:space-y-6">
          {/* Labels */}
          <div>
            <LabelPicker
              availableLabels={availableLabels || []}
              selectedLabels={issue.labels || []}
              onLabelsChange={handleLabelsChange}
            />
          </div>

          <Separator />

          {/* Priority */}
          <PriorityPicker
            priority={issue.priority as IssuePriority}
            onPriorityChange={handlePriorityChange}
            isLoading={updatePriorityMutation.isPending}
          />

          <Separator />

          {/* Project */}
          <ProjectPicker
            availableProjects={availableProjects || []}
            selectedProject={project || null}
            onProjectChange={handleProjectChange}
            isLoading={assignToProjectMutation.isPending}
          />

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
