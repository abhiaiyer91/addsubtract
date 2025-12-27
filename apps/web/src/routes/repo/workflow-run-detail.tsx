import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  CheckCircle2, XCircle, Clock, Play, RotateCcw, Ban,
  ChevronDown, ChevronRight, GitCommit, GitBranch,
  User, Calendar, Timer, Loader2, ChevronLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { trpc } from '@/lib/trpc';
import { RepoLayout } from './components/repo-layout';
import { Loading } from '@/components/ui/loading';
import { formatRelativeTime, formatDuration } from '@/lib/utils';
import { toastSuccess, toastError } from '@/components/ui/use-toast';
import { JobGraph } from '@/components/ci/job-graph';
import { buildJobGraph } from '@/lib/job-graph';

const stateConfig = {
  queued: { icon: Clock, color: 'text-yellow-500', label: 'Queued', bg: 'bg-yellow-500/10' },
  in_progress: { icon: Loader2, color: 'text-blue-500', label: 'In Progress', bg: 'bg-blue-500/10' },
  completed: { icon: CheckCircle2, color: 'text-green-500', label: 'Success', bg: 'bg-green-500/10' },
  failed: { icon: XCircle, color: 'text-red-500', label: 'Failed', bg: 'bg-red-500/10' },
  cancelled: { icon: Ban, color: 'text-gray-500', label: 'Cancelled', bg: 'bg-gray-500/10' },
};

export function WorkflowRunDetail() {
  const { owner, repo, runId } = useParams();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [selectedJob, setSelectedJob] = useState<string | null>(null);

  const { data: run, isLoading } = trpc.workflows.getRun.useQuery(
    { runId: runId! },
    { enabled: !!runId, refetchInterval: (data) => data?.state === 'in_progress' ? 3000 : false }
  );

  const jobGraph = useMemo(() => {
    if (!run?.jobs) return null;
    return buildJobGraph(run.jobs);
  }, [run?.jobs]);

  const cancelMutation = trpc.workflows.cancel.useMutation({
    onSuccess: () => {
      utils.workflows.getRun.invalidate({ runId: runId! });
      toastSuccess('Workflow cancelled');
    },
    onError: (err) => {
      toastError(err.message);
    },
  });

  const handleCancel = () => {
    if (confirm('Are you sure you want to cancel this workflow run?')) {
      cancelMutation.mutate({ runId: runId! });
    }
  };

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading workflow run..." />
      </RepoLayout>
    );
  }

  if (!run) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold mb-2">Workflow run not found</h2>
          <p className="text-muted-foreground">The workflow run could not be found.</p>
        </div>
      </RepoLayout>
    );
  }

  const config = stateConfig[run.state as keyof typeof stateConfig];
  const Icon = config.icon;

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link to={`/${owner}/${repo}/actions`} className="text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ChevronLeft className="h-4 w-4" />
            Actions
          </Link>
          <span className="text-muted-foreground">/</span>
          <span>Run #{run.runNumber}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-lg ${config.bg}`}>
                <Icon className={`h-5 w-5 ${config.color} ${run.state === 'in_progress' ? 'animate-spin' : ''}`} />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{run.workflowName}</h1>
                <Badge variant="secondary">{config.label}</Badge>
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <GitBranch className="h-4 w-4" />
                {run.branch}
              </span>
              <span className="flex items-center gap-1">
                <GitCommit className="h-4 w-4" />
                {run.commitSha?.slice(0, 7)}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatRelativeTime(run.createdAt)}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {run.state === 'in_progress' && (
              <Button 
                variant="outline" 
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Ban className="h-4 w-4 mr-2" />
                )}
                Cancel
              </Button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Duration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-muted-foreground" />
                <span className="text-2xl font-bold">
                  {formatDuration(run.startedAt, run.completedAt)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {run.jobs?.filter(j => j.state === 'completed').length || 0}/{run.jobs?.length || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Trigger</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant="outline">{run.event}</Badge>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Run Number</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">#{run.runNumber}</div>
            </CardContent>
          </Card>
        </div>

        {/* Job Graph */}
        {jobGraph && jobGraph.nodes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Execution Flow</CardTitle>
            </CardHeader>
            <CardContent>
              <JobGraph 
                graph={jobGraph} 
                onNodeClick={(jobName) => {
                  setSelectedJob(jobName);
                  // Scroll to job in list
                  const element = document.getElementById(`job-${jobName}`);
                  element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              />
              <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <div className="w-3 h-0.5 bg-primary" />
                  Critical path
                </span>
                <span>{jobGraph.nodes.length} jobs</span>
                <span>{jobGraph.levels} stages</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Jobs */}
        <Card>
          <CardHeader>
            <CardTitle>Jobs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {run.jobs?.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </RepoLayout>
  );
}

function JobCard({ job }: { job: any }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const config = stateConfig[job.state as keyof typeof stateConfig];
  const Icon = config.icon;

  return (
    <div id={`job-${job.jobName}`}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors">
            <div className="flex items-center gap-3">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <Icon className={`h-4 w-4 ${config.color} ${job.state === 'in_progress' ? 'animate-spin' : ''}`} />
              <span className="font-medium">{job.jobName}</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {formatDuration(job.startedAt, job.completedAt)}
            </span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pl-10 pb-4 space-y-1">
            {job.steps?.map((step: any, i: number) => (
              <StepRow key={step.id} step={step} number={i + 1} />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function StepRow({ step, number }: { step: any; number: number }) {
  const [showLogs, setShowLogs] = useState(false);
  const config = stateConfig[step.state as keyof typeof stateConfig] || stateConfig.queued;
  const Icon = config.icon;

  return (
    <div>
      <div 
        className="flex items-center gap-2 p-2 rounded hover:bg-accent/30 cursor-pointer transition-colors"
        onClick={() => setShowLogs(!showLogs)}
      >
        <Icon className={`h-3 w-3 ${config.color} ${step.state === 'in_progress' ? 'animate-spin' : ''}`} />
        <span className="text-sm">{step.stepName}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {formatDuration(step.startedAt, step.completedAt)}
        </span>
      </div>
      {showLogs && step.logs && (
        <div className="ml-6 mt-1">
          <LogViewer logs={step.logs} />
        </div>
      )}
    </div>
  );
}

function LogViewer({ logs }: { logs: string }) {
  return (
    <ScrollArea className="h-[300px] rounded border bg-black">
      <pre className="p-4 text-xs text-green-400 font-mono whitespace-pre-wrap">
        {logs}
      </pre>
    </ScrollArea>
  );
}
