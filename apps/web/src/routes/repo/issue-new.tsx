import { useParams, useNavigate } from 'react-router-dom';
import { IssueForm } from '@/components/issue/issue-form';
import { RepoLayout } from './components/repo-layout';
import { Loading } from '@/components/ui/loading';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { toastSuccess, toastError } from '@/components/ui/use-toast';

export function NewIssuePage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const authenticated = !!session?.user;
  const utils = trpc.useUtils();

  // Fetch repository data to get the repo ID
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
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

  const handleSubmit = async (data: { title: string; body: string }) => {
    if (!repoData?.repo.id) return;

    createIssueMutation.mutate({
      repoId: repoData.repo.id,
      title: data.title,
      body: data.body,
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

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="max-w-3xl">
        <IssueForm
          onSubmit={handleSubmit}
          isLoading={createIssueMutation.isPending}
          error={createIssueMutation.error?.message}
        />
      </div>
    </RepoLayout>
  );
}
