import { useParams } from 'react-router-dom';
import { CommitList, type Commit } from '@/components/repo/commit-list';
import { BranchSelector } from '@/components/repo/branch-selector';
import { RepoHeader } from './components/repo-header';

// Mock commits
const mockCommits: Commit[] = [
  {
    sha: 'abc123def456789012345678901234567890abcd',
    message: 'Add new feature for user authentication\n\nThis adds OAuth2 support and session management.',
    author: {
      name: 'John Doe',
      email: 'john@example.com',
    },
    date: new Date(Date.now() - 3600000),
  },
  {
    sha: 'def456abc789012345678901234567890abcdef',
    message: 'Fix bug in file upload component',
    author: {
      name: 'Jane Smith',
      email: 'jane@example.com',
    },
    date: new Date(Date.now() - 86400000),
  },
  {
    sha: 'ghi789def012345678901234567890abcdefghi',
    message: 'Update dependencies to latest versions',
    author: {
      name: 'John Doe',
      email: 'john@example.com',
    },
    date: new Date(Date.now() - 86400000 * 2),
  },
  {
    sha: 'jkl012ghi345678901234567890abcdefghijkl',
    message: 'Refactor API client to use fetch instead of axios',
    author: {
      name: 'Bob Wilson',
      email: 'bob@example.com',
    },
    date: new Date(Date.now() - 86400000 * 5),
  },
  {
    sha: 'mno345jkl678901234567890abcdefghijklmno',
    message: 'Initial commit',
    author: {
      name: 'John Doe',
      email: 'john@example.com',
    },
    date: new Date(Date.now() - 86400000 * 30),
  },
];

export function CommitsPage() {
  const { owner, repo, ref } = useParams<{
    owner: string;
    repo: string;
    ref?: string;
  }>();

  const currentRef = ref || 'main';

  // TODO: Fetch real data with tRPC
  const commits = mockCommits;

  const branches = [
    { name: 'main', sha: 'abc123', isDefault: true },
    { name: 'develop', sha: 'def456' },
  ];

  return (
    <div className="space-y-6">
      <RepoHeader owner={owner!} repo={repo!} />

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

      <CommitList commits={commits} owner={owner!} repo={repo!} />
    </div>
  );
}
