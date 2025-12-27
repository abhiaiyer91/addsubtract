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
  Inbox,
  List,
  Eye,
  MessageSquare,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const viewMode = searchParams.get('view') || 'list'; // 'list' or 'inbox'

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
    const params = new URLSearchParams(searchParams);
    params.set('state', state);
    setSearchParams(params);
  };

  const handleViewChange = (view: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('view', view);
    setSearchParams(params);
  };

  // Inbox data (only fetch if in inbox view and authenticated)
  const { data: inboxSummary } = trpc.pulls.inboxSummary.useQuery(
    undefined,
    { enabled: authenticated && viewMode === 'inbox' }
  );
  
  const { data: awaitingReview, isLoading: awaitingLoading } = trpc.pulls.inboxAwaitingReview.useQuery(
    { limit: 20, repoId: repoData?.repo.id },
    { enabled: authenticated && viewMode === 'inbox' && !!repoData?.repo.id }
  );
  
  const { data: myPrs, isLoading: myPrsLoading } = trpc.pulls.inboxMyPrs.useQuery(
    { limit: 20, repoId: repoData?.repo.id },
    { enabled: authenticated && viewMode === 'inbox' && !!repoData?.repo.id }
  );
  
  const { data: participated, isLoading: participatedLoading } = trpc.pulls.inboxParticipated.useQuery(
    { limit: 20, repoId: repoData?.repo.id },
    { enabled: authenticated && viewMode === 'inbox' && !!repoData?.repo.id }
  );

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
            
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
              <button
                onClick={() => handleViewChange('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                  viewMode === 'list'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <List className="h-4 w-4" />
                <span>All</span>
              </button>
              {authenticated && (
                <button
                  onClick={() => handleViewChange('inbox')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
                    viewMode === 'inbox'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Inbox className="h-4 w-4" />
                  <span>Inbox</span>
                </button>
              )}
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

        {/* Inbox View */}
        {viewMode === 'inbox' && authenticated ? (
          <InboxView
            awaitingReview={awaitingReview}
            myPrs={myPrs}
            participated={participated}
            awaitingLoading={awaitingLoading}
            myPrsLoading={myPrsLoading}
            participatedLoading={participatedLoading}
            inboxSummary={inboxSummary}
            owner={owner!}
            repo={repo!}
          />
        ) : (
          <>
            {/* State Tabs and Filters bar */}
            <div className="flex items-center gap-3 pb-2 border-b">
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

              <div className="flex-1" />

              <div className="relative max-w-sm">
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
          </>
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

// Inbox View Component
interface InboxViewProps {
  awaitingReview: any[] | undefined;
  myPrs: any[] | undefined;
  participated: any[] | undefined;
  awaitingLoading: boolean;
  myPrsLoading: boolean;
  participatedLoading: boolean;
  inboxSummary: { awaitingReview: number; myOpenPrs: number; participated: number } | undefined;
  owner: string;
  repo: string;
}

function InboxView({
  awaitingReview,
  myPrs,
  participated,
  awaitingLoading,
  myPrsLoading,
  participatedLoading,
  inboxSummary,
  owner,
  repo,
}: InboxViewProps) {
  return (
    <Tabs defaultValue="review" className="w-full">
      <TabsList className="w-full justify-start bg-muted/50">
        <TabsTrigger value="review" className="gap-2">
          <Eye className="h-4 w-4" />
          To Review
          {inboxSummary?.awaitingReview ? (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {inboxSummary.awaitingReview}
            </Badge>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="mine" className="gap-2">
          <GitPullRequest className="h-4 w-4" />
          Your PRs
          {inboxSummary?.myOpenPrs ? (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {inboxSummary.myOpenPrs}
            </Badge>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="participated" className="gap-2">
          <MessageSquare className="h-4 w-4" />
          Participated
        </TabsTrigger>
      </TabsList>

      <TabsContent value="review" className="mt-4">
        <InboxPRList
          prs={awaitingReview}
          isLoading={awaitingLoading}
          emptyMessage="No pull requests awaiting your review in this repo"
          owner={owner}
          repo={repo}
        />
      </TabsContent>

      <TabsContent value="mine" className="mt-4">
        <InboxPRList
          prs={myPrs}
          isLoading={myPrsLoading}
          emptyMessage="You don't have any open pull requests in this repo"
          owner={owner}
          repo={repo}
        />
      </TabsContent>

      <TabsContent value="participated" className="mt-4">
        <InboxPRList
          prs={participated}
          isLoading={participatedLoading}
          emptyMessage="No pull requests you've participated in"
          owner={owner}
          repo={repo}
        />
      </TabsContent>
    </Tabs>
  );
}

function InboxPRList({
  prs,
  isLoading,
  emptyMessage,
  owner,
  repo,
}: {
  prs: any[] | undefined;
  isLoading: boolean;
  emptyMessage: string;
  owner: string;
  repo: string;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 rounded-lg bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!prs || prs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg divide-y">
      {prs.map((pr) => (
        <InboxPRCard key={pr.id} pr={pr} owner={owner} repo={repo} />
      ))}
    </div>
  );
}

function InboxPRCard({ pr, owner, repo }: { pr: any; owner: string; repo: string }) {
  const stateIcon = {
    open: <GitPullRequest className="h-4 w-4 text-green-500" />,
    closed: <XCircle className="h-4 w-4 text-red-500" />,
    merged: <GitMerge className="h-4 w-4 text-purple-500" />,
  }[pr.state] || <GitPullRequest className="h-4 w-4" />;

  return (
    <Link
      to={`/${pr.repoOwner || owner}/${pr.repoName || repo}/pull/${pr.number}`}
      className="flex items-start gap-3 p-4 hover:bg-muted/50 transition-colors"
    >
      <div className="mt-1">{stateIcon}</div>
      <div className="flex-1 min-w-0">
        <h3 className="font-medium truncate">{pr.title}</h3>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span className="font-mono">#{pr.number}</span>
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {pr.authorUsername || pr.author?.username}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(pr.createdAt)}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        {pr.isDraft && (
          <Badge variant="outline" className="text-xs">Draft</Badge>
        )}
        {pr.reviewState === 'approved' && (
          <Badge className="bg-green-500/10 text-green-500 text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        )}
        {pr.reviewState === 'changes_requested' && (
          <Badge className="bg-red-500/10 text-red-500 text-xs">
            <AlertCircle className="h-3 w-3 mr-1" />
            Changes
          </Badge>
        )}
      </div>
    </Link>
  );
}
