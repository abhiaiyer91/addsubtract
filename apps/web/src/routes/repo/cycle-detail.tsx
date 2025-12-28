import { useParams, Link } from 'react-router-dom';
import {
  RefreshCw,
  ArrowLeft,
  Plus,
  Calendar,
  CheckCircle2,
  Clock,
  Target,
  TrendingUp,
  CircleDot,
  BarChart3,
  MoreHorizontal,
  Edit,
  Trash2,
  ArrowRight,
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

export function CycleDetailPage() {
  const { owner, repo, cycleId } = useParams<{ owner: string; repo: string; cycleId: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  // Fetch repository data
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch cycle
  const { data: cycle, isLoading: cycleLoading } = trpc.cycles.get.useQuery(
    { cycleId: cycleId! },
    { enabled: !!cycleId }
  );

  // Fetch progress
  const { data: progress } = trpc.cycles.getProgress.useQuery(
    { cycleId: cycleId! },
    { enabled: !!cycleId }
  );

  // Fetch issues
  const { data: issues } = trpc.cycles.getIssues.useQuery(
    { cycleId: cycleId!, limit: 100 },
    { enabled: !!cycleId }
  );

  // Fetch velocity for repo
  const { data: velocityData } = trpc.cycles.getVelocity.useQuery(
    { repoId: repoData?.repo.id!, cycleCount: 5 },
    { enabled: !!repoData?.repo.id }
  );

  const isLoading = repoLoading || cycleLoading;

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

  if (!cycle) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-16">
          <h2 className="text-xl font-semibold mb-2">Cycle not found</h2>
          <p className="text-muted-foreground mb-4">
            This cycle may have been deleted or you don't have access.
          </p>
          <Link to={`/${owner}/${repo}/cycles`}>
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Cycles
            </Button>
          </Link>
        </div>
      </RepoLayout>
    );
  }

  const startDate = new Date(cycle.startDate);
  const endDate = new Date(cycle.endDate);
  const now = new Date();
  const isActive = startDate <= now && endDate >= now;
  const isCompleted = endDate < now;
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysElapsed = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const timeProgressPercent = isCompleted ? 100 : Math.min(100, Math.round((daysElapsed / totalDays) * 100));

  const issueProgressPercent = progress
    ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100)
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
      <div className="space-y-6 min-w-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to={`/${owner}/${repo}/cycles`} className="hover:text-foreground transition-colors">
            Cycles
          </Link>
          <span>/</span>
          <span className="text-foreground">{cycle.name}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{cycle.name}</h1>
              {isActive && (
                <Badge variant="default" className="bg-green-500">Active</Badge>
              )}
              {isCompleted && (
                <Badge variant="secondary">Completed</Badge>
              )}
              {!isActive && !isCompleted && (
                <Badge variant="outline">Upcoming</Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {startDate.toLocaleDateString()} - {endDate.toLocaleDateString()}
              </span>
              <span>({totalDays} days)</span>
              {isActive && (
                <span className="text-primary font-medium">
                  {daysRemaining} days remaining
                </span>
              )}
            </div>
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
                  Edit Cycle
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Cycle
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Progress Overview */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="p-4 border rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Time Progress</div>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold">{timeProgressPercent}%</span>
            </div>
            <Progress value={timeProgressPercent} className="h-2 mt-2" />
          </div>

          <div className="p-4 border rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Issue Progress</div>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold">{issueProgressPercent}%</span>
            </div>
            <Progress value={issueProgressPercent} className="h-2 mt-2" />
          </div>

          <div className="p-4 border rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Velocity</div>
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold">
                {velocity?.pointsCompleted || 0}
              </span>
              <span className="text-sm text-muted-foreground mb-0.5">pts</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {velocity?.issuesCompleted || 0} issues completed
            </div>
          </div>

          <div className="p-4 border rounded-lg">
            <div className="text-sm text-muted-foreground mb-1">Issues</div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-500">{progress?.completed || 0}</div>
                <div className="text-xs text-muted-foreground">Done</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-500">{progress?.inProgress || 0}</div>
                <div className="text-xs text-muted-foreground">In Progress</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-500">{progress?.todo || 0}</div>
                <div className="text-xs text-muted-foreground">Todo</div>
              </div>
            </div>
          </div>
        </div>

        {/* Burndown/Burnup Chart placeholder */}
        {isActive && (
          <div className="p-6 border rounded-lg bg-muted/30">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-5 w-5" />
              <h3 className="font-medium">Burndown Chart</h3>
            </div>
            <div className="h-48 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Burndown chart visualization coming soon</p>
              </div>
            </div>
          </div>
        )}

        {/* Issues */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CircleDot className="h-5 w-5" />
              Issues
              <Badge variant="secondary">{progress?.total || 0}</Badge>
            </h2>
            {authenticated && (
              <Link to={`/${owner}/${repo}/issues/new?cycle=${cycleId}`}>
                <Button size="sm" variant="outline">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Issue
                </Button>
              </Link>
            )}
          </div>

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
              <h3 className="text-lg font-medium mb-1">No issues in this cycle</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add issues to this cycle to track sprint progress
              </p>
              {authenticated && (
                <Link to={`/${owner}/${repo}/issues/new?cycle=${cycleId}`}>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Issue
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </RepoLayout>
  );
}
