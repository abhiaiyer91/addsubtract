import { useParams } from 'react-router-dom';
import { FileTree, type TreeEntry } from '@/components/repo/file-tree';
import { BranchSelector } from '@/components/repo/branch-selector';
import { RepoHeader } from './components/repo-header';

// Mock data
const mockTree: TreeEntry[] = [
  { name: 'components', path: 'src/components', type: 'directory' },
  { name: 'lib', path: 'src/lib', type: 'directory' },
  { name: 'App.tsx', path: 'src/App.tsx', type: 'file', size: 1234 },
  { name: 'index.tsx', path: 'src/index.tsx', type: 'file', size: 456 },
  { name: 'styles.css', path: 'src/styles.css', type: 'file', size: 2048 },
];

export function TreePage() {
  const { owner, repo, ref, '*': path } = useParams<{
    owner: string;
    repo: string;
    ref: string;
    '*': string;
  }>();

  const currentRef = ref || 'main';
  const currentPath = path || '';

  // TODO: Fetch real data with tRPC
  const tree = mockTree;

  const branches = [
    { name: 'main', sha: 'abc123', isDefault: true },
    { name: 'develop', sha: 'def456' },
  ];

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
