import { useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { CircleDot, CheckCircle2, Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IssueCard } from '@/components/issue/issue-card';
import { RepoLayout } from './components/repo-layout';
import { Loading } from '@/components/ui/loading';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

export function IssuesPage() {
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

  // Fetch issues
  const { data: issuesData, isLoading: issuesLoading } = trpc.issues.list.useQuery(
    {
      repoId: repoData?.repo.id!,
      state: currentState === 'open' ? 'open' : currentState === 'closed' ? 'closed' : undefined,
      limit: 50,
    },
    { enabled: !!repoData?.repo.id }
  );

  const isLoading = repoLoading || issuesLoading;

  // Get issues with labels
  const issues = issuesData || [];

  // Filter by search query
  const filteredIssues = issues.filter((issue) => {
    if (!searchQuery) return true;
    return issue.title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Count issues by state (we need to fetch both states for counts)
  const openCount = issues.filter(i => i.state === 'open').length;
  const closedCount = issues.filter(i => i.state === 'closed').length;

  const handleStateChange = (state: string) => {
    setSearchParams({ state });
  };

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading issues..." />
      </RepoLayout>
    );
  }

  return (
    <RepoLayout owner={owner!} repo={repo!}>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CircleDot className="h-5 w-5" />
          Issues
        </h2>
        {authenticated && (
          <Link to={`/${owner}/${repo}/issues/new`}>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              New issue
            </Button>
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Tabs value={currentState} onValueChange={handleStateChange}>
          <TabsList>
            <TabsTrigger value="open" className="gap-2">
              <CircleDot className="h-4 w-4" />
              Open
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-muted rounded">
                {currentState === 'open' ? filteredIssues.length : openCount}
              </span>
            </TabsTrigger>
            <TabsTrigger value="closed" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Closed
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-muted rounded">
                {currentState === 'closed' ? filteredIssues.length : closedCount}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search issues..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Issue list */}
      {filteredIssues.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <CircleDot className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No issues found</p>
          <p className="text-sm mt-2">
            {currentState === 'open'
              ? 'There are no open issues.'
              : 'There are no closed issues.'}
          </p>
          {authenticated && currentState === 'open' && (
            <Link to={`/${owner}/${repo}/issues/new`}>
              <Button className="mt-4">Create an issue</Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredIssues.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={{
                id: issue.id,
                number: issue.number,
                title: issue.title,
                state: issue.state,
                author: { username: issue.author?.username || 'Unknown' },
                createdAt: new Date(issue.createdAt),
                labels: issue.labels || [],
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
