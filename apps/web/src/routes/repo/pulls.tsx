import { useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { GitPullRequest, Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PrCard } from '@/components/pr/pr-card';
import { RepoHeader } from './components/repo-header';
import { isAuthenticated } from '@/lib/auth';

// Mock pull requests
const mockPullRequests = [
  {
    id: '1',
    number: 42,
    title: 'Add new authentication system with OAuth2 support',
    state: 'open' as const,
    author: { username: 'johndoe', avatarUrl: null },
    sourceBranch: 'feature/oauth2',
    targetBranch: 'main',
    createdAt: new Date(Date.now() - 3600000),
    labels: [
      { id: '1', name: 'enhancement', color: 'a2eeef', description: null, repoId: '1', createdAt: new Date() },
    ],
    commentsCount: 5,
  },
  {
    id: '2',
    number: 41,
    title: 'Fix memory leak in file upload handler',
    state: 'open' as const,
    author: { username: 'janesmith', avatarUrl: null },
    sourceBranch: 'fix/memory-leak',
    targetBranch: 'main',
    createdAt: new Date(Date.now() - 86400000),
    labels: [
      { id: '2', name: 'bug', color: 'd73a4a', description: null, repoId: '1', createdAt: new Date() },
    ],
    commentsCount: 3,
  },
  {
    id: '3',
    number: 40,
    title: 'Update documentation for API endpoints',
    state: 'merged' as const,
    author: { username: 'bobwilson', avatarUrl: null },
    sourceBranch: 'docs/api-update',
    targetBranch: 'main',
    createdAt: new Date(Date.now() - 86400000 * 3),
    labels: [
      { id: '3', name: 'documentation', color: '0075ca', description: null, repoId: '1', createdAt: new Date() },
    ],
    commentsCount: 1,
  },
  {
    id: '4',
    number: 39,
    title: 'Refactor database connection pooling',
    state: 'closed' as const,
    author: { username: 'johndoe', avatarUrl: null },
    sourceBranch: 'refactor/db-pool',
    targetBranch: 'main',
    createdAt: new Date(Date.now() - 86400000 * 7),
    labels: [],
    commentsCount: 8,
  },
];

export function PullsPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const authenticated = isAuthenticated();

  const currentState = searchParams.get('state') || 'open';

  // TODO: Fetch real data with tRPC
  const pullRequests = mockPullRequests.filter((pr) => {
    if (currentState === 'all') return true;
    return pr.state === currentState;
  });

  const counts = {
    open: mockPullRequests.filter((pr) => pr.state === 'open').length,
    closed: mockPullRequests.filter((pr) => pr.state === 'closed' || pr.state === 'merged').length,
    all: mockPullRequests.length,
  };

  const handleStateChange = (state: string) => {
    setSearchParams({ state });
  };

  return (
    <div className="space-y-6">
      <RepoHeader owner={owner!} repo={repo!} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <GitPullRequest className="h-5 w-5" />
          Pull Requests
        </h2>
        {authenticated && (
          <Link to={`/${owner}/${repo}/compare`}>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              New pull request
            </Button>
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Tabs value={currentState} onValueChange={handleStateChange}>
          <TabsList>
            <TabsTrigger value="open" className="gap-2">
              <GitPullRequest className="h-4 w-4" />
              Open
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-muted rounded">
                {counts.open}
              </span>
            </TabsTrigger>
            <TabsTrigger value="closed" className="gap-2">
              Closed
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-muted rounded">
                {counts.closed}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search pull requests..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Pull request list */}
      {pullRequests.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <GitPullRequest className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No pull requests found</p>
          <p className="text-sm mt-2">
            {currentState === 'open'
              ? 'There are no open pull requests.'
              : 'There are no closed pull requests.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pullRequests.map((pr) => (
            <PrCard key={pr.id} pr={pr} owner={owner!} repo={repo!} />
          ))}
        </div>
      )}
    </div>
  );
}
