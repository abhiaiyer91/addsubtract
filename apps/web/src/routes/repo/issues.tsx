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
  List,
  LayoutGrid,
  Inbox,
  UserCheck,
  PenLine,
  MessageSquare,
  Clock,
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
import { Loading } from '@/components/ui/loading';
import { KanbanBoard } from '@/components/issue/kanban-board';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime, cn } from '@/lib/utils';

type ViewMode = 'list' | 'kanban' | 'inbox';

export function IssuesPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  // View mode from URL or default to 'list'
  const viewMode = (searchParams.get('view') as ViewMode) || 'list';
  const currentState = searchParams.get('state') || 'open';
  const isInboxView = viewMode === 'inbox';

  // Fetch repository data to get the repo ID
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch issues for list view
  const { data: issuesData, isLoading: issuesLoading } = trpc.issues.list.useQuery(
    {
      repoId: repoData?.repo.id!,
      state: currentState === 'open' ? 'open' : currentState === 'closed' ? 'closed' : undefined,
      limit: 50,
    },
    { enabled: !!repoData?.repo.id && viewMode === 'list' }
  );

  // Fetch issues grouped by status for Kanban view
  const { data: kanbanData, isLoading: kanbanLoading } = trpc.issues.listGroupedByStatus.useQuery(
    {
      repoId: repoData?.repo.id!,
    },
    { enabled: !!repoData?.repo.id && viewMode === 'kanban' }
  );

  // Inbox data (only fetch if in inbox view and authenticated)
  const { data: inboxSummary } = trpc.issues.inboxSummary.useQuery(
    { repoId: repoData?.repo.id },
    { enabled: authenticated && isInboxView && !!repoData?.repo.id }
  );
  
  const { data: assignedToMe, isLoading: assignedLoading } = trpc.issues.inboxAssignedToMe.useQuery(
    { limit: 20, repoId: repoData?.repo.id },
    { enabled: authenticated && isInboxView && !!repoData?.repo.id }
  );
  
  const { data: createdByMe, isLoading: createdLoading } = trpc.issues.inboxCreatedByMe.useQuery(
    { limit: 20, repoId: repoData?.repo.id },
    { enabled: authenticated && isInboxView && !!repoData?.repo.id }
  );
  
  const { data: participated, isLoading: participatedLoading } = trpc.issues.inboxParticipated.useQuery(
    { limit: 20, repoId: repoData?.repo.id },
    { enabled: authenticated && isInboxView && !!repoData?.repo.id }
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

  const isLoading = repoLoading || (viewMode === 'list' ? issuesLoading : viewMode === 'kanban' ? kanbanLoading : false);

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
    const newParams = new URLSearchParams(searchParams);
    newParams.set('state', state);
    setSearchParams(newParams);
  };

  const handleViewChange = (view: ViewMode) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('view', view);
    setSearchParams(newParams);
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
            
            {/* View toggle */}
            <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
              <button
                onClick={() => handleViewChange('list')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors',
                  viewMode === 'list'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <List className="h-4 w-4" />
                <span>All</span>
              </button>
              <button
                onClick={() => handleViewChange('kanban')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors',
                  viewMode === 'kanban'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <LayoutGrid className="h-4 w-4" />
                <span>Board</span>
              </button>
              {authenticated && (
                <button
                  onClick={() => handleViewChange('inbox')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors',
                    viewMode === 'inbox'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Inbox className="h-4 w-4" />
                  <span>Inbox</span>
                </button>
              )}
            </div>

            {/* State toggle (only for list view) */}
            {viewMode === 'list' && (
              <div className="flex items-center gap-1 text-sm">
                <button
                  onClick={() => handleStateChange('open')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors',
                    currentState === 'open'
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <CircleDot className="h-4 w-4" />
                  <span>{openCount} Open</span>
                </button>
                <button
                  onClick={() => handleStateChange('closed')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors',
                    currentState === 'closed'
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{closedCount} Closed</span>
                </button>
              </div>
            )}
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

        {/* Filters bar (only for list view) */}
        {viewMode === 'list' && (
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
        )}

        {/* Content based on view mode */}
        {viewMode === 'inbox' && authenticated ? (
          // Inbox view
          <IssueInboxView
            assignedToMe={assignedToMe}
            createdByMe={createdByMe}
            participated={participated}
            assignedLoading={assignedLoading}
            createdLoading={createdLoading}
            participatedLoading={participatedLoading}
            inboxSummary={inboxSummary}
            owner={owner!}
            repo={repo!}
          />
        ) : viewMode === 'kanban' ? (
          // Kanban board view
          repoData?.repo.id && kanbanData ? (
            <KanbanBoard
              repoId={repoData.repo.id}
              owner={owner!}
              repo={repo!}
              groupedIssues={kanbanData}
            />
          ) : (
            <div className="text-center py-16">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                <LayoutGrid className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-1">No issues to display</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create an issue to see it on the board
              </p>
              {authenticated && (
                <Link to={`/${owner}/${repo}/issues/new`}>
                  <Button>Create the first issue</Button>
                </Link>
              )}
            </div>
          )
        ) : (
          // List view
          <>
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
          </>
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
    status?: string;
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

  // Status badge config
  const statusConfig: Record<string, { label: string; color: string }> = {
    backlog: { label: 'Backlog', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
    todo: { label: 'Todo', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
    in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
    in_review: { label: 'In Review', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
    done: { label: 'Done', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
    canceled: { label: 'Canceled', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  };

  const status = issue.status || 'backlog';
  const statusInfo = statusConfig[status] || statusConfig.backlog;

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
          
          {/* Status badge */}
          <Badge
            variant="secondary"
            className={cn('text-xs font-normal px-2 py-0', statusInfo.color)}
          >
            {statusInfo.label}
          </Badge>

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

// Inbox View Components
interface IssueInboxViewProps {
  assignedToMe: any[] | undefined;
  createdByMe: any[] | undefined;
  participated: any[] | undefined;
  assignedLoading: boolean;
  createdLoading: boolean;
  participatedLoading: boolean;
  inboxSummary: { assignedToMe: number; createdByMe: number; participated: number } | undefined;
  owner: string;
  repo: string;
}

function IssueInboxView({
  assignedToMe,
  createdByMe,
  participated,
  assignedLoading,
  createdLoading,
  participatedLoading,
  inboxSummary,
  owner,
  repo,
}: IssueInboxViewProps) {
  return (
    <Tabs defaultValue="assigned" className="w-full">
      <TabsList className="w-full justify-start bg-muted/50">
        <TabsTrigger value="assigned" className="gap-2">
          <UserCheck className="h-4 w-4" />
          Assigned
          {inboxSummary?.assignedToMe ? (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {inboxSummary.assignedToMe}
            </Badge>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="created" className="gap-2">
          <PenLine className="h-4 w-4" />
          Created
          {inboxSummary?.createdByMe ? (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5">
              {inboxSummary.createdByMe}
            </Badge>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="participated" className="gap-2">
          <MessageSquare className="h-4 w-4" />
          Participated
        </TabsTrigger>
      </TabsList>

      <TabsContent value="assigned" className="mt-4">
        <InboxIssueList
          issues={assignedToMe}
          isLoading={assignedLoading}
          emptyMessage="No issues assigned to you in this repo"
          owner={owner}
          repo={repo}
        />
      </TabsContent>

      <TabsContent value="created" className="mt-4">
        <InboxIssueList
          issues={createdByMe}
          isLoading={createdLoading}
          emptyMessage="You haven't created any open issues in this repo"
          owner={owner}
          repo={repo}
        />
      </TabsContent>

      <TabsContent value="participated" className="mt-4">
        <InboxIssueList
          issues={participated}
          isLoading={participatedLoading}
          emptyMessage="No issues you've participated in"
          owner={owner}
          repo={repo}
        />
      </TabsContent>
    </Tabs>
  );
}

function InboxIssueList({
  issues,
  isLoading,
  emptyMessage,
  owner,
  repo,
}: {
  issues: any[] | undefined;
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

  if (!issues || issues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg divide-y">
      {issues.map((issue) => (
        <InboxIssueCard key={issue.id} issue={issue} owner={owner} repo={repo} />
      ))}
    </div>
  );
}

function InboxIssueCard({ issue, owner, repo }: { issue: any; owner: string; repo: string }) {
  const stateIcon = issue.state === 'open' 
    ? <CircleDot className="h-4 w-4 text-green-500" />
    : <CheckCircle2 className="h-4 w-4 text-purple-500" />;

  // Status badge config
  const statusConfig: Record<string, { label: string; color: string }> = {
    backlog: { label: 'Backlog', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
    todo: { label: 'Todo', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
    in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
    in_review: { label: 'In Review', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300' },
    done: { label: 'Done', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
    canceled: { label: 'Canceled', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  };

  const status = issue.status || 'backlog';
  const statusInfo = statusConfig[status] || statusConfig.backlog;

  return (
    <Link
      to={`/${issue.repoOwner || owner}/${issue.repoName || repo}/issues/${issue.number}`}
      className="flex items-start gap-3 p-4 hover:bg-muted/50 transition-colors"
    >
      <div className="mt-1">{stateIcon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-medium truncate">{issue.title}</h3>
          <Badge
            variant="secondary"
            className={cn('text-xs font-normal px-2 py-0', statusInfo.color)}
          >
            {statusInfo.label}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
          <span className="font-mono">#{issue.number}</span>
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {issue.authorUsername || issue.author?.username || 'Unknown'}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(issue.createdAt)}
          </span>
        </div>
      </div>
    </Link>
  );
}
