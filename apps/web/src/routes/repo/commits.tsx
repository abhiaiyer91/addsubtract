import { useParams } from 'react-router-dom';
import { CommitList, type Commit } from '@/components/repo/commit-list';
import { BranchSelector } from '@/components/repo/branch-selector';
import { RepoLayout } from './components/repo-layout';
import { trpc } from '@/lib/trpc';
import { Loading } from '@/components/ui/loading';

export function CommitsPage() {
  const { owner, repo, ref } = useParams<{
    owner: string;
    repo: string;
    ref?: string;
  }>();

  const currentRef = ref || 'main';

  // Fetch real commits from tRPC
  const { data: commitsData, isLoading: commitsLoading } = trpc.repos.getCommits.useQuery(
    { owner: owner!, repo: repo!, ref: currentRef },
    { enabled: !!owner && !!repo }
  );

  // Fetch branches
  const { data: branchesData } = trpc.repos.getBranches.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  const commits: Commit[] = commitsData?.commits?.map(c => ({
    sha: c.sha,
    message: c.message,
    author: {
      name: c.author,
      email: c.authorEmail,
      username: c.authorUsername,
      avatarUrl: c.authorAvatarUrl,
    },
    date: new Date(c.date),
    pr: c.pr,
    commentCount: c.commentCount,
    ciStatus: c.ciStatus,
  })) || [];

  const totalCount = commitsData?.totalCount || 0;

  const branches = branchesData?.map(b => ({
    name: b.name,
    sha: b.sha,
    isDefault: b.isDefault,
  })) || [];

  if (commitsLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading />
      </RepoLayout>
    );
  }

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <BranchSelector
              branches={branches}
              currentRef={currentRef}
              owner={owner!}
              repo={repo!}
              basePath="commits"
            />
            <h2 className="text-lg font-semibold">Commits</h2>
          </div>
        </div>

        <CommitList commits={commits} owner={owner!} repo={repo!} totalCount={totalCount} />
      </div>
    </RepoLayout>
  );
}
