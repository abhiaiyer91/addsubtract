import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ChevronRight, FolderKanban, RefreshCw } from 'lucide-react';
import { IssueForm, type IssuePriority } from '@/components/issue/issue-form';
import { RepoLayout } from './components/repo-layout';
import { Loading } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { toastSuccess, toastError } from '@/components/ui/use-toast';

export function NewIssuePage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const authenticated = !!session?.user;
  const utils = trpc.useUtils();

  // Get project/cycle context from URL params
  const projectId = searchParams.get('project');
  const cycleId = searchParams.get('cycle');

  // Fetch repository data to get the repo ID
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch project details if context exists
  const { data: project } = trpc.projects.get.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  // Fetch cycle details if context exists
  const { data: cycle } = trpc.cycles.get.useQuery(
    { cycleId: cycleId! },
    { enabled: !!cycleId }
  );

  // Create issue mutation
  const createIssueMutation = trpc.issues.create.useMutation({
    onSuccess: (data) => {
      toastSuccess({
        title: 'Issue created',
        description: `Issue #${data.number} has been created successfully.`,
      });
      // Invalidate issue-related queries so lists refresh
      if (repoData?.repo.id) {
        utils.issues.list.invalidate({ repoId: repoData.repo.id });
        utils.issues.listGroupedByStatus.invalidate({ repoId: repoData.repo.id });
      }
      utils.issues.inboxCreatedByMe.invalidate();
      utils.issues.inboxSummary.invalidate();
      // Redirect to the new issue
      navigate(`/${owner}/${repo}/issues/${data.number}`);
    },
    onError: (error) => {
      toastError({
        title: 'Failed to create issue',
        description: error.message,
      });
    },
  });

  const handleSubmit = async (data: { title: string; body: string; priority?: IssuePriority }) => {
    if (!repoData?.repo.id) return;

    createIssueMutation.mutate({
      repoId: repoData.repo.id,
      title: data.title,
      body: data.body,
      priority: data.priority,
      projectId: projectId || undefined,
      cycleId: cycleId || undefined,
    });
  };

  if (!authenticated) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">Please sign in to create an issue.</p>
        </div>
      </RepoLayout>
    );
  }

  if (repoLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading..." />
      </RepoLayout>
    );
  }

  // Build the back URL with context
  const getBackUrl = () => {
    if (projectId) return `/${owner}/${repo}/issues?section=project&project=${projectId}`;
    if (cycleId) return `/${owner}/${repo}/issues?section=cycle&cycle=${cycleId}`;
    return `/${owner}/${repo}/issues`;
  };

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="max-w-3xl space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
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
                to={getBackUrl()}
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
          <span className="text-foreground font-medium">New Issue</span>
        </div>

        {/* Context indicator */}
        {(project || cycle) && (
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border">
            <span className="text-sm text-muted-foreground">Creating issue in:</span>
            <Badge variant="secondary" className="gap-1.5">
              {project ? (
                <>
                  <FolderKanban className="h-3.5 w-3.5" />
                  {project.icon && <span>{project.icon}</span>}
                  {project.name}
                </>
              ) : cycle ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  {cycle.name}
                </>
              ) : null}
            </Badge>
          </div>
        )}

        <IssueForm
          onSubmit={handleSubmit}
          isLoading={createIssueMutation.isPending}
          error={createIssueMutation.error?.message}
        />
      </div>
    </RepoLayout>
  );
}
