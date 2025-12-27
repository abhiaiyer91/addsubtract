import { useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  CircleDot,
  CheckCircle2,
  Search,
  Plus,
  SlidersHorizontal,
  ChevronDown,
  User,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RepoLayout } from './components/repo-layout';
import { Loading } from '@/components/ui/loading';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime } from '@/lib/utils';

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

  // Fetch issues for current state
  const { data: issuesData, isLoading: issuesLoading } = trpc.issues.list.useQuery(
    {
      repoId: repoData?.repo.id!,
      state: currentState === 'open' ? 'open' : currentState === 'closed' ? 'closed' : undefined,
      limit: 50,
    },
    { enabled: !!repoData?.repo.id }
  );

  // Fetch counts for both states
  const { data: openIssuesData } = trpc.issues.list.useQuery(
    { repoId: repoData?.repo.id!, state: 'open', limit: 100 },
    { enabled: !!repoData?.repo.id }
  );
  const { data: closedIssuesData } = trpc.issues.list.useQuery(
    { repoId: repoData?.repo.id!, state: 'closed', limit: 100 },
    { enabled: !!repoData?.repo.id }
  );

  const isLoading = repoLoading || issuesLoading;

  // Get issues with labels
  const issues = issuesData || [];

  // Filter by search query
  const filteredIssues = issues.filter((issue) => {
    if (!searchQuery) return true;
    return (
      issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `#${issue.number}`.includes(searchQuery)
    );
  });

  // Counts
  const openCount = openIssuesData?.length || 0;
  const closedCount = closedIssuesData?.length || 0;

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
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-semibold">Issues</h1>
            <div className="flex items-center gap-1 text-sm">
              <button
                onClick={() => handleStateChange('open')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                  currentState === 'open'
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <CircleDot className="h-4 w-4" />
                <span>{openCount} Open</span>
              </button>
              <button
                onClick={() => handleStateChange('closed')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                  currentState === 'closed'
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>{closedCount} Closed</span>
              </button>
            </div>
          </div>
          {authenticated && (
            <Link to={`/${owner}/${repo}/issues/new`}>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                New Issue
              </Button>
            </Link>
          )}
        </div>

        {/* Filters bar */}
        <div className="flex items-center gap-3 pb-2 border-b">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search issues..."
              className="pl-9 h-9 bg-muted/50 border-0 focus-visible:bg-background focus-visible:ring-1"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                  <User className="h-4 w-4" />
                  Author
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem>Created by me</DropdownMenuItem>
                <DropdownMenuItem>Assigned to me</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>All authors</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                  <Tag className="h-4 w-4" />
                  Label
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem>bug</DropdownMenuItem>
                <DropdownMenuItem>feature</DropdownMenuItem>
                <DropdownMenuItem>documentation</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>All labels</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                  <SlidersHorizontal className="h-4 w-4" />
                  Sort
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Newest</DropdownMenuItem>
                <DropdownMenuItem>Oldest</DropdownMenuItem>
                <DropdownMenuItem>Most commented</DropdownMenuItem>
                <DropdownMenuItem>Recently updated</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Issue list */}
        {filteredIssues.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <CircleDot className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">No issues found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery
                ? 'Try a different search term'
                : currentState === 'open'
                ? 'There are no open issues yet'
                : 'There are no closed issues'}
            </p>
            {authenticated && currentState === 'open' && !searchQuery && (
              <Link to={`/${owner}/${repo}/issues/new`}>
                <Button>Create the first issue</Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {filteredIssues.map((issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                owner={owner!}
                repo={repo!}
              />
            ))}
          </div>
        )}
      </div>
    </RepoLayout>
  );
}

interface IssueRowProps {
  issue: {
    id: string;
    number: number;
    title: string;
    state: string;
    createdAt: string | Date;
    author?: { username?: string | null; avatarUrl?: string | null } | null;
    labels?: { id: string; name: string; color: string }[];
    assignee?: { username?: string | null; avatarUrl?: string | null } | null;
  };
  owner: string;
  repo: string;
}

function IssueRow({ issue, owner, repo }: IssueRowProps) {
  const isOpen = issue.state === 'open';

  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors group">
      {/* Status icon */}
      <div className="flex-shrink-0">
        {isOpen ? (
          <CircleDot className="h-5 w-5 text-green-500" />
        ) : (
          <CheckCircle2 className="h-5 w-5 text-purple-500" />
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to={`/${owner}/${repo}/issues/${issue.number}`}
            className="font-medium text-foreground hover:text-primary transition-colors"
          >
            {issue.title}
          </Link>
          {issue.labels?.map((label) => (
            <Badge
              key={label.id}
              variant="secondary"
              className="text-xs font-normal px-2 py-0"
              style={{
                backgroundColor: `#${label.color}20`,
                color: `#${label.color}`,
                borderColor: `#${label.color}40`,
              }}
            >
              {label.name}
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
          <span className="font-mono">#{issue.number}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>
            {isOpen ? 'opened' : 'closed'} {formatRelativeTime(issue.createdAt)}
          </span>
          {issue.author?.username && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <Link
                to={`/${issue.author.username}`}
                className="hover:text-foreground transition-colors"
              >
                {issue.author.username}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Assignee */}
      {issue.assignee?.avatarUrl && (
        <div className="flex-shrink-0">
          <img
            src={issue.assignee.avatarUrl}
            alt={issue.assignee.username || 'Assignee'}
            className="h-6 w-6 rounded-full"
          />
        </div>
      )}
    </div>
  );
}
