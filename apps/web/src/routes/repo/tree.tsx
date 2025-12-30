import { useParams } from 'react-router-dom';
import { FileTree, type TreeEntry } from '@/components/repo/file-tree';
import { BranchSelector } from '@/components/repo/branch-selector';
import { RepoLayout } from './components/repo-layout';
import { trpc } from '@/lib/trpc';
import { Loading } from '@/components/ui/loading';
import { useSession } from '@/lib/auth-client';

export function TreePage() {
  const { owner, repo, ref, '*': path } = useParams<{
    owner: string;
    repo: string;
    ref: string;
    '*': string;
  }>();
  const { data: session } = useSession();
  const utils = trpc.useUtils();

  const currentRef = ref || 'main';
  const currentPath = path || '';

  // Fetch repo data to check ownership
  const { data: repoData } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch real tree data from tRPC
  const { data: treeData, isLoading: treeLoading } = trpc.repos.getTree.useQuery(
    { owner: owner!, repo: repo!, ref: currentRef, path: currentPath },
    { enabled: !!owner && !!repo }
  );

  // Fetch branches
  const { data: branchesData } = trpc.repos.getBranches.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );
  
  const repoInfo = repoData?.repo;
  const isOwner = session?.user?.id === repoInfo?.ownerId;

  const tree: TreeEntry[] = treeData?.entries?.map(entry => ({
    name: entry.name,
    path: entry.path,
    type: entry.type,
    size: entry.size,
  })) || [];
  
  const treeError = treeData?.error;

  const branches = branchesData?.map(b => ({
    name: b.name,
    sha: b.sha,
    isDefault: b.isDefault,
  })) || [];

  if (treeLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading />
      </RepoLayout>
    );
  }

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <BranchSelector
            branches={branches}
            currentRef={currentRef}
            owner={owner!}
            repo={repo!}
            basePath="tree"
            filePath={currentPath}
          />
        </div>

        <FileTree
          entries={tree}
          owner={owner!}
          repo={repo!}
          repoId={repoInfo?.id}
          currentRef={currentRef}
          currentPath={currentPath}
          error={treeError}
          canResync={isOwner && !!treeError}
          onResyncComplete={() => {
            utils.repos.getTree.invalidate({ owner: owner!, repo: repo! });
          }}
        />
      </div>
    </RepoLayout>
  );
}
