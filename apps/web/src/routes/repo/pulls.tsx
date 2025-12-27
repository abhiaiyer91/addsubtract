import { useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { GitPullRequest, Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PrCard } from '@/components/pr/pr-card';
import { RepoLayout } from './components/repo-layout';
import { Loading } from '@/components/ui/loading';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

export function PullsPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  const currentState = searchParams.get('state') || 'open';

  // Fetch repository data to get the repo ID
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch pull requests for current state
  const stateFilter = currentState === 'open' ? 'open' : currentState === 'closed' ? 'closed' : undefined;
  const { data: pullsData, isLoading: pullsLoading } = trpc.pulls.list.useQuery(
    {
      repoId: repoData?.repo.id!,
      state: stateFilter,
      limit: 50,
    },
    { enabled: !!repoData?.repo.id }
  );

  // Fetch counts for both states (for tab badges)
  const { data: openPullsData } = trpc.pulls.list.useQuery(
    { repoId: repoData?.repo.id!, state: 'open', limit: 100 },
    { enabled: !!repoData?.repo.id }
  );
  const { data: closedPullsData } = trpc.pulls.list.useQuery(
    { repoId: repoData?.repo.id!, state: 'closed', limit: 100 },
    { enabled: !!repoData?.repo.id }
  );

  const isLoading = repoLoading || pullsLoading;

  // Get pull requests
  const pullRequests = pullsData || [];

  // Filter by search query
  const filteredPulls = pullRequests.filter((pr) => {
    if (!searchQuery) return true;
    return pr.title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Count PRs by state
  const openCount = openPullsData?.length || 0;
  const closedCount = closedPullsData?.length || 0;

  const handleStateChange = (state: string) => {
    setSearchParams({ state });
  };

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading pull requests..." />
      </RepoLayout>
    );
  }

  return (
    <RepoLayout owner={owner!} repo={repo!}>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <GitPullRequest className="h-5 w-5" />
          Pull Requests
        </h2>
        {authenticated && (
          <Link to={`/${owner}/${repo}/pulls/new`}>
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
                {currentState === 'open' ? filteredPulls.length : openCount}
              </span>
            </TabsTrigger>
            <TabsTrigger value="closed" className="gap-2">
              Closed
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-muted rounded">
                {currentState === 'closed' ? filteredPulls.length : closedCount}
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
      {filteredPulls.length === 0 ? (
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
          {filteredPulls.map((pr) => (
            <PrCard
              key={pr.id}
              pr={{
                id: pr.id,
                number: pr.number,
                title: pr.title,
                state: pr.state,
                author: {
                  username: pr.author?.username || 'Unknown',
                  avatarUrl: pr.author?.avatarUrl || null,
                },
                sourceBranch: pr.sourceBranch,
                targetBranch: pr.targetBranch,
                createdAt: new Date(pr.createdAt),
                labels: pr.labels || [],
                commentsCount: 0, // TODO: Add comments count to API
              }}
              owner={owner!}
              repo={repo!}
            />
          ))}
        </div>
      )}
    </RepoLayout>
  );
}
