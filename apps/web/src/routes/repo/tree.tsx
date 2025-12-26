import { useParams } from 'react-router-dom';
import { FileTree, type TreeEntry } from '@/components/repo/file-tree';
import { BranchSelector } from '@/components/repo/branch-selector';
import { RepoHeader } from './components/repo-header';
import { trpc } from '@/lib/trpc';
import { Loading } from '@/components/ui/loading';

export function TreePage() {
  const { owner, repo, ref, '*': path } = useParams<{
    owner: string;
    repo: string;
    ref: string;
    '*': string;
  }>();

  const currentRef = ref || 'main';
  const currentPath = path || '';

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

  const tree: TreeEntry[] = treeData?.entries?.map(entry => ({
    name: entry.name,
    path: entry.path,
    type: entry.type,
    size: entry.size,
  })) || [];

  const branches = branchesData?.map(b => ({
    name: b.name,
    sha: b.sha,
    isDefault: b.isDefault,
  })) || [];

  if (treeLoading) {
    return (
      <div className="space-y-6">
        <RepoHeader owner={owner!} repo={repo!} />
        <Loading />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RepoHeader owner={owner!} repo={repo!} />

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
        currentRef={currentRef}
        currentPath={currentPath}
      />
    </div>
  );
}
