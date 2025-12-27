import { useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Ban,
  Search,
  RefreshCw,
  ChevronRight,
  FileCode,
  GitBranch,
  User,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RepoLayout } from './components/repo-layout';
import { Loading } from '@/components/ui/loading';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime, cn } from '@/lib/utils';

type WorkflowState = 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';

interface WorkflowRunData {
  id: string;
  workflowName: string | null;
  workflowPath: string;
  state: WorkflowState;
  event: string;
  branch: string | null;
  commitSha: string;
  createdAt: string | Date;
  startedAt: string | Date | null;
  completedAt: string | Date | null;
  triggeredBy?: { username?: string | null } | null;
}

const stateConfig: Record<WorkflowState, { label: string; icon: typeof CheckCircle2; color: string }> = {
  queued: { label: 'Queued', icon: Clock, color: 'text-yellow-500 bg-yellow-500/10' },
  in_progress: { label: 'In Progress', icon: Loader2, color: 'text-blue-500 bg-blue-500/10' },
  completed: { label: 'Success', icon: CheckCircle2, color: 'text-green-500 bg-green-500/10' },
  failed: { label: 'Failed', icon: XCircle, color: 'text-red-500 bg-red-500/10' },
  cancelled: { label: 'Cancelled', icon: Ban, color: 'text-gray-500 bg-gray-500/10' },
};

export function WorkflowsPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  const currentState = searchParams.get('state') as WorkflowState | 'all' | null || 'all';

  // Fetch repository data to get the repo ID
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch available workflows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: workflows, isLoading: workflowsLoading } = (trpc as any).workflows.listWorkflows.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  ) as { data: { name: string; filePath: string; triggers: string[]; jobCount: number }[] | undefined; isLoading: boolean };

  // Fetch workflow runs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: runs, isLoading: runsLoading, refetch: refetchRuns } = (trpc as any).workflows.listRuns.useQuery(
    {
      repoId: repoData?.repo.id!,
      state: currentState !== 'all' ? currentState as WorkflowState : undefined,
      limit: 50,
    },
    { enabled: !!repoData?.repo.id }
  ) as { data: WorkflowRunData[] | undefined; isLoading: boolean; refetch: () => void };

  // Fetch run counts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: counts } = (trpc as any).workflows.getRunCounts.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  ) as { data: Record<WorkflowState, number> | undefined };

  // Mutation to trigger workflow
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const triggerMutation = (trpc as any).workflows.trigger.useMutation({
    onSuccess: () => {
      refetchRuns();
    },
  });

  const isLoading = repoLoading || workflowsLoading || runsLoading;

  // Filter by search query
  const filteredRuns = (runs || []).filter((run) => {
    if (!searchQuery) return true;
    return (
      run.workflowName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      run.branch?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      run.commitSha?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const handleStateChange = (state: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (state === 'all') {
      newParams.delete('state');
    } else {
      newParams.set('state', state);
    }
    setSearchParams(newParams);
  };

  const handleTriggerWorkflow = async (workflowPath: string) => {
    if (!authenticated) return;
    try {
      await triggerMutation.mutateAsync({
        owner: owner!,
        repo: repo!,
        workflowPath,
        branch: 'main',
      });
    } catch (error) {
      console.error('Failed to trigger workflow:', error);
    }
  };

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading workflows..." />
      </RepoLayout>
    );
  }

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-semibold">Actions</h1>

            {/* State filter tabs */}
            <div className="flex items-center gap-1 text-sm">
              {(['all', 'completed', 'in_progress', 'failed', 'queued', 'cancelled'] as const).map((state) => {
                const count = state === 'all' 
                  ? Object.values(counts || {}).reduce((a, b) => a + b, 0)
                  : counts?.[state] || 0;
                const config = state !== 'all' ? stateConfig[state] : null;
                
                return (
                  <button
                    key={state}
                    onClick={() => handleStateChange(state)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors',
                      currentState === state
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    )}
                  >
                    {config && <config.icon className={cn('h-4 w-4', config.color.split(' ')[0])} />}
                    <span className="capitalize">{state === 'all' ? 'All' : config?.label}</span>
                    <span className="text-xs text-muted-foreground">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => refetchRuns()}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        <div className="flex gap-6">
          {/* Sidebar - Available Workflows */}
          <div className="w-64 flex-shrink-0">
            <h2 className="text-sm font-medium mb-3">Workflows</h2>
            <div className="space-y-1">
              {workflows?.length === 0 ? (
                <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
                  No workflows found.
                  <p className="mt-1 text-xs">
                    Create a workflow in <code className="bg-muted px-1 rounded">.wit/workflows/</code>
                  </p>
                </div>
              ) : (
                workflows?.map((workflow) => (
                  <div
                    key={workflow.filePath}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCode className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm truncate">{workflow.name}</span>
                    </div>
                    {authenticated && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                          >
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleTriggerWorkflow(workflow.filePath)}
                          >
                            Run workflow
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Main content - Workflow Runs */}
          <div className="flex-1 min-w-0">
            {/* Search bar */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search workflow runs..."
                className="pl-9 h-9 bg-muted/50 border-0 focus-visible:bg-background focus-visible:ring-1"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Runs list */}
            {filteredRuns.length === 0 ? (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                  <Play className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-1">No workflow runs</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {searchQuery
                    ? 'Try a different search term'
                    : currentState !== 'all'
                    ? `No ${stateConfig[currentState as WorkflowState]?.label.toLowerCase()} runs`
                    : 'Workflow runs will appear here when triggered'}
                </p>
              </div>
            ) : (
              <div className="border rounded-lg divide-y">
                {filteredRuns.map((run) => (
                  <WorkflowRunRow
                    key={run.id}
                    run={run}
                    owner={owner!}
                    repo={repo!}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </RepoLayout>
  );
}

interface WorkflowRunRowProps {
  run: {
    id: string;
    workflowName: string | null;
    workflowPath: string;
    state: WorkflowState;
    event: string;
    branch: string | null;
    commitSha: string;
    createdAt: string | Date;
    startedAt: string | Date | null;
    completedAt: string | Date | null;
    triggeredBy?: { username?: string | null } | null;
  };
  owner: string;
  repo: string;
}

function WorkflowRunRow({ run, owner, repo }: WorkflowRunRowProps) {
  const config = stateConfig[run.state];
  const StateIcon = config.icon;

  const duration = run.startedAt && run.completedAt
    ? Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
    : null;

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <Link
      to={`/${owner}/${repo}/actions/runs/${run.id}`}
      className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors group"
    >
      {/* Status icon */}
      <div className={cn('flex-shrink-0 p-1.5 rounded-full', config.color.split(' ')[1])}>
        <StateIcon 
          className={cn(
            'h-4 w-4',
            config.color.split(' ')[0],
            run.state === 'in_progress' && 'animate-spin'
          )} 
        />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground group-hover:text-primary transition-colors">
            {run.workflowName || run.workflowPath}
          </span>
          <Badge variant="secondary" className="text-xs font-normal">
            {run.event}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
          {run.branch && (
            <span className="flex items-center gap-1">
              <GitBranch className="h-3.5 w-3.5" />
              {run.branch}
            </span>
          )}
          <span className="font-mono text-xs">
            {run.commitSha.slice(0, 7)}
          </span>
          {run.triggeredBy?.username && (
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              {run.triggeredBy.username}
            </span>
          )}
        </div>
      </div>

      {/* Right side info */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        {duration !== null && (
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatDuration(duration)}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5" />
          {formatRelativeTime(run.createdAt)}
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
      </div>
    </Link>
  );
}
