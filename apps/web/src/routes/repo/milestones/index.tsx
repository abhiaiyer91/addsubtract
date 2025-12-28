import { useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { Target, Plus, Calendar, Loader2, Edit2, Trash2, Check, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { DatePicker } from '@/components/ui/date-picker';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { RepoLayout } from '../components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatDate, cn } from '@/lib/utils';

interface MilestoneFormData {
  title: string;
  description: string;
  dueDate: Date | undefined;
}

const DEFAULT_FORM: MilestoneFormData = {
  title: '',
  description: '',
  dueDate: undefined,
};

export function MilestonesPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  const currentState = searchParams.get('state') || 'open';

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<any | null>(null);
  const [formData, setFormData] = useState<MilestoneFormData>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  const { data: milestonesData, isLoading: milestonesLoading } = trpc.milestones.list.useQuery(
    { repoId: repoData?.repo.id!, state: currentState as 'open' | 'closed' },
    { enabled: !!repoData?.repo.id }
  );

  const createMilestone = trpc.milestones.create.useMutation({
    onSuccess: () => {
      closeDialog();
      utils.milestones.list.invalidate({ repoId: repoData?.repo.id! });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const updateMilestone = trpc.milestones.update.useMutation({
    onSuccess: () => {
      closeDialog();
      utils.milestones.list.invalidate({ repoId: repoData?.repo.id! });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const closeMilestone = trpc.milestones.close.useMutation({
    onSuccess: () => {
      utils.milestones.list.invalidate({ repoId: repoData?.repo.id! });
    },
  });

  const reopenMilestone = trpc.milestones.reopen.useMutation({
    onSuccess: () => {
      utils.milestones.list.invalidate({ repoId: repoData?.repo.id! });
    },
  });

  const deleteMilestone = trpc.milestones.delete.useMutation({
    onSuccess: () => {
      utils.milestones.list.invalidate({ repoId: repoData?.repo.id! });
    },
  });

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingMilestone(null);
    setFormData(DEFAULT_FORM);
    setError(null);
  };

  const openCreateDialog = () => {
    setEditingMilestone(null);
    setFormData(DEFAULT_FORM);
    setIsDialogOpen(true);
  };

  const openEditDialog = (milestone: any) => {
    setEditingMilestone(milestone);
    setFormData({
      title: milestone.title,
      description: milestone.description || '',
      dueDate: milestone.dueDate ? new Date(milestone.dueDate) : undefined,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.title.trim()) {
      setError('Title is required');
      return;
    }

    if (!repoData?.repo.id) return;

    const payload = {
      repoId: repoData.repo.id,
      title: formData.title.trim(),
      description: formData.description.trim() || undefined,
      dueDate: formData.dueDate,
    };

    if (editingMilestone) {
      updateMilestone.mutate({ id: editingMilestone.id, ...payload });
    } else {
      createMilestone.mutate(payload);
    }
  };

  const handleClose = (id: string) => {
    closeMilestone.mutate({ id });
  };

  const handleReopen = (id: string) => {
    reopenMilestone.mutate({ id });
  };

  const handleDelete = (id: string, title: string) => {
    if (confirm(`Delete milestone "${title}"?`)) {
      deleteMilestone.mutate({ id });
    }
  };

  const handleStateChange = (state: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('state', state);
    setSearchParams(newParams);
  };

  const isLoading = repoLoading || milestonesLoading;

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading milestones..." />
      </RepoLayout>
    );
  }

  if (!repoData?.repo) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Repository not found.</p>
        </div>
      </RepoLayout>
    );
  }

  const milestones = milestonesData?.milestones || [];
  const counts = milestonesData?.counts || { open: 0, closed: 0 };
  const isOwner = session?.user?.id === repoData.repo.ownerId;
  const isMutating = createMilestone.isPending || updateMilestone.isPending;

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-bold">Milestones</h1>
            <div className="flex items-center gap-1 text-sm">
              <button
                onClick={() => handleStateChange('open')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors',
                  currentState === 'open'
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <Target className="h-4 w-4" />
                <span>{counts.open} Open</span>
              </button>
              <button
                onClick={() => handleStateChange('closed')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors',
                  currentState === 'closed'
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <Check className="h-4 w-4" />
                <span>{counts.closed} Closed</span>
              </button>
            </div>
          </div>
          {authenticated && isOwner && (
            <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
              <DialogTrigger asChild>
                <Button className="gap-2" onClick={openCreateDialog}>
                  <Plus className="h-4 w-4" />
                  New milestone
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <form onSubmit={handleSubmit}>
                  <DialogHeader>
                    <DialogTitle>
                      {editingMilestone ? 'Edit Milestone' : 'New Milestone'}
                    </DialogTitle>
                    <DialogDescription>
                      {editingMilestone
                        ? 'Update the milestone details.'
                        : 'Create a new milestone to track progress.'}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Title *</Label>
                      <Input
                        id="title"
                        placeholder="v2.0 Release"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dueDate">Due date (optional)</Label>
                      <DatePicker
                        date={formData.dueDate}
                        onDateChange={(date) => setFormData({ ...formData, dueDate: date })}
                        placeholder="Select due date"
                        className="w-full"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Description (optional)</Label>
                      <Textarea
                        id="description"
                        placeholder="Track progress toward the v2.0 release"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        rows={4}
                      />
                    </div>

                    {error && (
                      <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                        {error}
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={closeDialog}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isMutating}>
                      {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {editingMilestone ? 'Save Changes' : 'Create Milestone'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {milestones.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <EmptyState
                icon={Target}
                title={currentState === 'open' ? 'No open milestones' : 'No closed milestones'}
                description={
                  currentState === 'open'
                    ? 'Milestones help you track progress on groups of issues and pull requests.'
                    : 'Closed milestones will appear here.'
                }
                action={
                  authenticated && isOwner && currentState === 'open' ? (
                    <Button className="gap-2" onClick={openCreateDialog}>
                      <Plus className="h-4 w-4" />
                      Create a milestone
                    </Button>
                  ) : undefined
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {milestones.map((milestone: any) => (
              <MilestoneCard
                key={milestone.id}
                milestone={milestone}
                owner={owner!}
                repo={repo!}
                canEdit={authenticated && isOwner}
                onEdit={() => openEditDialog(milestone)}
                onClose={() => handleClose(milestone.id)}
                onReopen={() => handleReopen(milestone.id)}
                onDelete={() => handleDelete(milestone.id, milestone.title)}
                isClosing={closeMilestone.isPending}
                isReopening={reopenMilestone.isPending}
                isDeleting={deleteMilestone.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </RepoLayout>
  );
}

interface MilestoneCardProps {
  milestone: {
    id: string;
    title: string;
    description?: string | null;
    dueDate?: Date | string | null;
    state: string;
    openIssuesCount?: number;
    closedIssuesCount?: number;
  };
  owner: string;
  repo: string;
  canEdit: boolean;
  onEdit: () => void;
  onClose: () => void;
  onReopen: () => void;
  onDelete: () => void;
  isClosing: boolean;
  isReopening: boolean;
  isDeleting: boolean;
}

function MilestoneCard({
  milestone,
  owner,
  repo,
  canEdit,
  onEdit,
  onClose,
  onReopen,
  onDelete,
  isClosing,
  isReopening,
  isDeleting,
}: MilestoneCardProps) {
  const openCount = milestone.openIssuesCount || 0;
  const closedCount = milestone.closedIssuesCount || 0;
  const total = openCount + closedCount;
  const progress = total > 0 ? Math.round((closedCount / total) * 100) : 0;

  const dueDate = milestone.dueDate ? new Date(milestone.dueDate) : null;
  const isOverdue = dueDate && dueDate < new Date() && milestone.state === 'open';
  const daysLeft = dueDate
    ? Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <Target className="h-5 w-5 text-primary" />
              <Link
                to={`/${owner}/${repo}/milestones/${milestone.id}`}
                className="text-lg font-semibold hover:text-primary transition-colors"
              >
                {milestone.title}
              </Link>
            </div>

            {milestone.description && (
              <p className="text-muted-foreground mt-2 ml-8">{milestone.description}</p>
            )}

            <div className="mt-4 ml-8">
              {/* Progress bar */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {progress}% complete
                </span>
              </div>

              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <span>{openCount} open</span>
                <span>{closedCount} closed</span>
                {dueDate && (
                  <span className={cn('flex items-center gap-1', isOverdue && 'text-destructive')}>
                    <Calendar className="h-4 w-4" />
                    {isOverdue ? (
                      <>Overdue by {Math.abs(daysLeft!)} days</>
                    ) : daysLeft !== null && daysLeft >= 0 ? (
                      daysLeft === 0 ? (
                        'Due today'
                      ) : (
                        `${daysLeft} days left`
                      )
                    ) : (
                      formatDate(dueDate)
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>

          {canEdit && (
            <div className="flex items-center gap-1 ml-4">
              {milestone.state === 'open' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  disabled={isClosing}
                  title="Close milestone"
                >
                  {isClosing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onReopen}
                  disabled={isReopening}
                  title="Reopen milestone"
                >
                  {isReopening ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4" />
                  )}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onEdit}>
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                disabled={isDeleting}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
