import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  FolderKanban,
  ArrowLeft,
  Plus,
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  Target,
  TrendingUp,
  AlertCircle,
  CircleDot,
  MoreHorizontal,
  Edit,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RepoLayout } from './components/repo-layout';
import { KanbanBoard } from '@/components/issue/kanban-board';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime, cn } from '@/lib/utils';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  backlog: { label: 'Backlog', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: <Clock className="h-3 w-3" /> },
  planned: { label: 'Planned', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', icon: <Calendar className="h-3 w-3" /> },
  in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300', icon: <TrendingUp className="h-3 w-3" /> },
  paused: { label: 'Paused', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300', icon: <AlertCircle className="h-3 w-3" /> },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', icon: <CheckCircle2 className="h-3 w-3" /> },
  canceled: { label: 'Canceled', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', icon: <AlertCircle className="h-3 w-3" /> },
};

const HEALTH_CONFIG: Record<string, { label: string; color: string }> = {
  on_track: { label: 'On Track', color: 'text-green-500 bg-green-500/10' },
  at_risk: { label: 'At Risk', color: 'text-yellow-500 bg-yellow-500/10' },
  off_track: { label: 'Off Track', color: 'text-red-500 bg-red-500/10' },
};

export function ProjectDetailPage() {
  const { owner, repo, projectId } = useParams<{ owner: string; repo: string; projectId: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  // Fetch repository data
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch project
  const { data: project, isLoading: projectLoading } = trpc.projects.get.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  // Fetch progress
  const { data: progress } = trpc.projects.getProgress.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  // Fetch issues
  const { data: issues } = trpc.projects.getIssues.useQuery(
    { projectId: projectId!, limit: 100 },
    { enabled: !!projectId }
  );

  // Fetch members
  const { data: members } = trpc.projects.getMembers.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  // Fetch updates
  const { data: updates } = trpc.projects.listUpdates.useQuery(
    { projectId: projectId!, limit: 10 },
    { enabled: !!projectId }
  );

  const isLoading = repoLoading || projectLoading;

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="space-y-6">
          <div className="h-8 w-64 bg-muted rounded animate-pulse" />
          <div className="h-24 bg-muted rounded-lg animate-pulse" />
          <div className="h-96 bg-muted rounded-lg animate-pulse" />
        </div>
      </RepoLayout>
    );
  }

  if (!project) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-16">
          <h2 className="text-xl font-semibold mb-2">Project not found</h2>
          <p className="text-muted-foreground mb-4">
            This project may have been deleted or you don't have access.
          </p>
          <Link to={`/${owner}/${repo}/projects`}>
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Projects
            </Button>
          </Link>
        </div>
      </RepoLayout>
    );
  }

  const statusConfig = STATUS_CONFIG[project.status] || STATUS_CONFIG.backlog;
  const progressPercent = progress
    ? Math.round((progress.completedIssues / Math.max(progress.totalIssues, 1)) * 100)
    : 0;

  // Group issues by status for Kanban
  const groupedIssues = issues?.reduce((acc, issue) => {
    const status = issue.status || 'backlog';
    if (!acc[status]) acc[status] = [];
    acc[status].push(issue);
    return acc;
  }, {} as Record<string, typeof issues>);

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to={`/${owner}/${repo}/projects`} className="hover:text-foreground transition-colors">
            Projects
          </Link>
          <span>/</span>
          <span className="text-foreground">{project.name}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              {project.icon && <span className="text-2xl">{project.icon}</span>}
              <h1 className="text-2xl font-bold">{project.name}</h1>
              <Badge variant="secondary" className={cn('gap-1', statusConfig.color)}>
                {statusConfig.icon}
                {statusConfig.label}
              </Badge>
            </div>
            {project.description && (
              <p className="text-muted-foreground max-w-2xl">{project.description}</p>
            )}
          </div>

          {authenticated && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit Project
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Progress Overview */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="p-4 border rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Progress</div>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2 mt-2" />
          </div>

          <div className="p-4 border rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Total Issues</div>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold">{progress?.total || 0}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {progress?.completed || 0} completed, {progress?.inProgress || 0} in progress
            </div>
          </div>

          <div className="p-4 border rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Target Date</div>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold">
                {project.targetDate
                  ? new Date(project.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '—'}
              </span>
            </div>
            {project.targetDate && (
              <div className="text-xs text-muted-foreground mt-1">
                {formatRelativeTime(project.targetDate)}
              </div>
            )}
          </div>

          <div className="p-4 border rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Team</div>
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {members?.slice(0, 5).map((member: any, i: number) => (
                  <div
                    key={member.userId}
                    className="w-8 h-8 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center text-xs font-medium"
                  >
                    {member.user?.username?.[0]?.toUpperCase() || '?'}
                  </div>
                ))}
              </div>
              {(members?.length || 0) > 5 && (
                <span className="text-sm text-muted-foreground">+{members!.length - 5}</span>
              )}
              {(!members || members.length === 0) && (
                <span className="text-muted-foreground text-sm">No members yet</span>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="issues" className="w-full">
          <TabsList>
            <TabsTrigger value="issues" className="gap-2">
              <CircleDot className="h-4 w-4" />
              Issues
              <Badge variant="secondary" className="ml-1 h-5">
                {progress?.total || 0}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="updates" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Updates
              <Badge variant="secondary" className="ml-1 h-5">
                {updates?.length || 0}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="issues" className="mt-4">
            {repoData?.repo.id && groupedIssues && Object.keys(groupedIssues).length > 0 ? (
              <KanbanBoard
                repoId={repoData.repo.id}
                owner={owner!}
                repo={repo!}
                groupedIssues={groupedIssues as any}
              />
            ) : (
              <div className="text-center py-16 border rounded-lg">
                <CircleDot className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-1">No issues in this project</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Add issues to this project to track progress
                </p>
                {authenticated && (
                  <Link to={`/${owner}/${repo}/issues/new?project=${projectId}`}>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Issue
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="updates" className="mt-4">
            {updates && updates.length > 0 ? (
              <div className="space-y-4">
                {updates.map((update: any) => (
                  <div key={update.id} className="p-4 border rounded-lg">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium">
                        {update.author?.username?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <span className="font-medium">{update.author?.username || 'Unknown'}</span>
                        <span className="text-muted-foreground text-sm ml-2">
                          {formatRelativeTime(update.createdAt)}
                        </span>
                      </div>
                      {update.health && (
                        <Badge variant="secondary" className={cn('ml-auto', HEALTH_CONFIG[update.health]?.color)}>
                          {HEALTH_CONFIG[update.health]?.label}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm">{update.body}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 border rounded-lg">
                <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-1">No updates yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Share progress updates with your team
                </p>
                {authenticated && (
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Post Update
                  </Button>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </RepoLayout>
  );
}
