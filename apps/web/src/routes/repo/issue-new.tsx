import { useParams, useNavigate } from 'react-router-dom';
import { IssueForm } from '@/components/issue/issue-form';
import { RepoHeader } from './components/repo-header';
import { Loading } from '@/components/ui/loading';
import { isAuthenticated } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

export function NewIssuePage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();
  const authenticated = isAuthenticated();

  // Fetch repository data to get the repo ID
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Create issue mutation
  const createIssueMutation = trpc.issues.create.useMutation({
    onSuccess: (data) => {
      // Redirect to the new issue
      navigate(`/${owner}/${repo}/issues/${data.number}`);
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
      <div className="space-y-6">
        <RepoHeader owner={owner!} repo={repo!} />
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">Please sign in to create an issue.</p>
        </div>
      </div>
    );
  }

  if (repoLoading) {
    return (
      <div className="space-y-6">
        <RepoHeader owner={owner!} repo={repo!} />
        <Loading text="Loading..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RepoHeader owner={owner!} repo={repo!} />
      <div className="max-w-3xl">
        <IssueForm
          onSubmit={handleSubmit}
          isLoading={createIssueMutation.isPending}
          error={createIssueMutation.error?.message}
        />
      </div>
    </div>
  );
}
