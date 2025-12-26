import { useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { CircleDot, CheckCircle2, Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IssueCard } from '@/components/issue/issue-card';
import { RepoHeader } from './components/repo-header';
import { isAuthenticated } from '@/lib/auth';

// Mock issues
const mockIssues = [
  {
    id: '1',
    number: 15,
    title: 'File upload fails for files larger than 10MB',
    state: 'open' as const,
    author: { username: 'johndoe' },
    createdAt: new Date(Date.now() - 3600000),
    labels: [
      { id: '1', name: 'bug', color: 'd73a4a', description: null, repoId: '1', createdAt: new Date() },
      { id: '2', name: 'help wanted', color: '008672', description: null, repoId: '1', createdAt: new Date() },
    ],
    commentsCount: 3,
  },
  {
    id: '2',
    number: 14,
    title: 'Add dark mode support',
    state: 'open' as const,
    author: { username: 'janesmith' },
    createdAt: new Date(Date.now() - 86400000),
    labels: [
      { id: '3', name: 'enhancement', color: 'a2eeef', description: null, repoId: '1', createdAt: new Date() },
    ],
    commentsCount: 7,
  },
  {
    id: '3',
    number: 13,
    title: 'Documentation needs updating for v2.0',
    state: 'open' as const,
    author: { username: 'bobwilson' },
    createdAt: new Date(Date.now() - 86400000 * 2),
    labels: [
      { id: '4', name: 'documentation', color: '0075ca', description: null, repoId: '1', createdAt: new Date() },
    ],
    commentsCount: 1,
  },
  {
    id: '4',
    number: 12,
    title: 'Memory leak when processing large datasets',
    state: 'closed' as const,
    author: { username: 'johndoe' },
    createdAt: new Date(Date.now() - 86400000 * 5),
    labels: [
      { id: '1', name: 'bug', color: 'd73a4a', description: null, repoId: '1', createdAt: new Date() },
    ],
    commentsCount: 12,
  },
  {
    id: '5',
    number: 11,
    title: 'Add support for TypeScript 5.0',
    state: 'closed' as const,
    author: { username: 'janesmith' },
    createdAt: new Date(Date.now() - 86400000 * 10),
    labels: [],
    commentsCount: 4,
  },
];

export function IssuesPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const authenticated = isAuthenticated();

  const currentState = searchParams.get('state') || 'open';

  // TODO: Fetch real data with tRPC
  const issues = mockIssues.filter((issue) => {
    if (currentState === 'all') return true;
    return issue.state === currentState;
  });

  const counts = {
    open: mockIssues.filter((i) => i.state === 'open').length,
    closed: mockIssues.filter((i) => i.state === 'closed').length,
    all: mockIssues.length,
  };

  const handleStateChange = (state: string) => {
    setSearchParams({ state });
  };

  return (
    <div className="space-y-6">
      <RepoHeader owner={owner!} repo={repo!} />

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
                {counts.open}
              </span>
            </TabsTrigger>
            <TabsTrigger value="closed" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
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
              placeholder="Search issues..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Issue list */}
      {issues.length === 0 ? (
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
          {issues.map((issue) => (
            <IssueCard key={issue.id} issue={issue} owner={owner!} repo={repo!} />
          ))}
        </div>
      )}
    </div>
  );
}
