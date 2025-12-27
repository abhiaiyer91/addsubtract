import { useParams, useNavigate } from 'react-router-dom';
import { PRForm } from '@/components/pr/pr-form';
import { RepoLayout } from './components/repo-layout';
import { Loading } from '@/components/ui/loading';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { toastSuccess, toastError } from '@/components/ui/use-toast';

export function NewPullPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  // Fetch repository data to get the repo ID
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch branches
  const { data: branches, isLoading: branchesLoading } = trpc.repos.getBranches.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Create PR mutation
  const createPRMutation = trpc.pulls.create.useMutation({
    onSuccess: (data) => {
      toastSuccess({
        title: 'Pull request created',
        description: `PR #${data.number} has been created successfully.`,
      });
      // Redirect to the new PR
      navigate(`/${owner}/${repo}/pull/${data.number}`);
    },
    onError: (error) => {
      toastError({
        title: 'Failed to create pull request',
        description: error.message,
      });
    },
  });

  const handleSubmit = async (data: {
    title: string;
    body: string;
    sourceBranch: string;
    targetBranch: string;
    isDraft: boolean;
  }) => {
    if (!repoData?.repo.id || !branches) return;

    // Find the SHAs for the selected branches
    const sourceBranchData = branches.find(b => b.name === data.sourceBranch);
    const targetBranchData = branches.find(b => b.name === data.targetBranch);

    if (!sourceBranchData || !targetBranchData) {
      console.error('Could not find branch SHAs');
      return;
    }

    createPRMutation.mutate({
      repoId: repoData.repo.id,
      title: data.title,
      body: data.body,
      sourceBranch: data.sourceBranch,
      targetBranch: data.targetBranch,
      headSha: sourceBranchData.sha,
      baseSha: targetBranchData.sha,
      isDraft: data.isDraft,
    });
  };

  if (!authenticated) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">Please sign in to create a pull request.</p>
        </div>
      </RepoLayout>
    );
  }

  if (repoLoading || branchesLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading..." />
      </RepoLayout>
    );
  }

  if (!branches || branches.length < 2) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">You need at least two branches to create a pull request.</p>
          <p className="text-sm mt-2">Push a new branch to get started.</p>
        </div>
      </RepoLayout>
    );
  }

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="max-w-3xl">
        <PRForm
          branches={branches}
          defaultBranch={repoData?.repo.defaultBranch || 'main'}
          repoId={repoData?.repo.id}
          onSubmit={handleSubmit}
          isLoading={createPRMutation.isPending}
          error={createPRMutation.error?.message}
        />
      </div>
    </RepoLayout>
  );
}
