import { useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
  GitPullRequest,
  GitMerge,
  Search,
  Plus,
  SlidersHorizontal,
  ChevronDown,
  User,
  Tag,
  XCircle,
  CheckCircle2,
  GitBranch,
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
import { PRListSkeleton } from '@/components/skeleton';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime } from '@/lib/utils';

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
    return (
      pr.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      `#${pr.number}`.includes(searchQuery)
    );
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
        <div className="space-y-4">
          {/* Header skeleton */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="h-6 w-32 bg-muted rounded animate-shimmer bg-gradient-to-r from-muted via-muted-foreground/10 to-muted bg-[length:200%_100%]" />
              <div className="flex items-center gap-1">
                <div className="h-8 w-20 bg-muted rounded animate-shimmer bg-gradient-to-r from-muted via-muted-foreground/10 to-muted bg-[length:200%_100%]" />
                <div className="h-8 w-20 bg-muted rounded animate-shimmer bg-gradient-to-r from-muted via-muted-foreground/10 to-muted bg-[length:200%_100%]" />
              </div>
            </div>
            <div className="h-9 w-36 bg-muted rounded animate-shimmer bg-gradient-to-r from-muted via-muted-foreground/10 to-muted bg-[length:200%_100%]" />
          </div>
          <PRListSkeleton count={5} />
        </div>
      </RepoLayout>
    );
  }

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-semibold">Pull Requests</h1>
            <div className="flex items-center gap-1 text-sm">
              <button
                onClick={() => handleStateChange('open')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                  currentState === 'open'
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <GitPullRequest className="h-4 w-4" />
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
            <Link to={`/${owner}/${repo}/pulls/new`}>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                New Pull Request
              </Button>
            </Link>
          )}
        </div>

        {/* Filters bar */}
        <div className="flex items-center gap-3 pb-2 border-b">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search pull requests..."
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
                <DropdownMenuItem>Review requested</DropdownMenuItem>
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

        {/* Pull request list */}
        {filteredPulls.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <GitPullRequest className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">No pull requests found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery
                ? 'Try a different search term'
                : currentState === 'open'
                ? 'There are no open pull requests yet'
                : 'There are no closed pull requests'}
            </p>
            {authenticated && currentState === 'open' && !searchQuery && (
              <Link to={`/${owner}/${repo}/pulls/new`}>
                <Button>Create the first pull request</Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {filteredPulls.map((pr) => (
              <PRRow
                key={pr.id}
                pr={{
                  id: pr.id,
                  number: pr.number,
                  title: pr.title,
                  state: pr.state,
                  createdAt: pr.createdAt,
                  sourceBranch: pr.sourceBranch,
                  targetBranch: pr.targetBranch,
                  isDraft: pr.isDraft,
                  author: pr.author,
                  labels: pr.labels,
                }}
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

interface PRRowProps {
  pr: {
    id: string;
    number: number;
    title: string;
    state: string;
    createdAt: string | Date;
    sourceBranch: string;
    targetBranch: string;
    isDraft?: boolean;
    author?: { username?: string | null; avatarUrl?: string | null } | null;
    labels?: { id: string; name: string; color: string }[];
  };
  owner: string;
  repo: string;
}

function PRRow({ pr, owner, repo }: PRRowProps) {
  const getStateIcon = () => {
    switch (pr.state) {
      case 'merged':
        return <GitMerge className="h-5 w-5 text-purple-500" />;
      case 'closed':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <GitPullRequest className="h-5 w-5 text-green-500" />;
    }
  };

  const getStateText = () => {
    if (pr.isDraft) return 'draft';
    return pr.state;
  };

  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors group">
      {/* Status icon */}
      <div className="flex-shrink-0">
        {getStateIcon()}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to={`/${owner}/${repo}/pull/${pr.number}`}
            className="font-medium text-foreground hover:text-primary transition-colors"
          >
            {pr.title}
          </Link>
          {pr.isDraft && (
            <Badge variant="secondary" className="text-xs">
              Draft
            </Badge>
          )}
          {pr.labels?.map((label) => (
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
          <span className="font-mono">#{pr.number}</span>
          <span className="text-muted-foreground/50">·</span>
          <span>
            {getStateText() === 'open' ? 'opened' : getStateText()} {formatRelativeTime(pr.createdAt)}
          </span>
          {pr.author?.username && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <Link
                to={`/${pr.author.username}`}
                className="hover:text-foreground transition-colors"
              >
                {pr.author.username}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Branch info */}
      <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
        <GitBranch className="h-3 w-3" />
        <span className="font-mono truncate max-w-[120px]">{pr.sourceBranch}</span>
        <span className="text-muted-foreground/50 mx-1">→</span>
        <span className="font-mono truncate max-w-[80px]">{pr.targetBranch}</span>
      </div>

      {/* Author avatar */}
      {pr.author?.avatarUrl && (
        <div className="flex-shrink-0">
          <img
            src={pr.author.avatarUrl}
            alt={pr.author.username || 'Author'}
            className="h-6 w-6 rounded-full"
          />
        </div>
      )}
    </div>
  );
}
