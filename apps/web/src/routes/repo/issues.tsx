import { useState } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  CircleDot,
  CheckCircle2,
  Search,
  Plus,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  User,
  Tag,
  List,
  LayoutGrid,
  Inbox,
  UserCheck,
  PenLine,
  MessageSquare,
  Clock,
  FolderKanban,
  RefreshCw,
  Calendar,
  Target,
  AlertCircle,
  Signal,
  Timer,
  TrendingUp,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { RepoLayout } from './components/repo-layout';
import { IssueListSkeleton } from '@/components/skeleton';
import { KanbanBoard } from '@/components/issue/kanban-board';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime, cn } from '@/lib/utils';

type ViewMode = 'list' | 'kanban' | 'inbox';
type SidebarSection = 'all' | 'project' | 'cycle';

// Priority config
const PRIORITY_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  urgent: { label: 'Urgent', icon: <AlertCircle className="h-3 w-3" />, color: 'text-red-500' },
  high: { label: 'High', icon: <Signal className="h-3 w-3" />, color: 'text-orange-500' },
  medium: { label: 'Medium', icon: <Signal className="h-3 w-3" />, color: 'text-yellow-500' },
  low: { label: 'Low', icon: <Signal className="h-3 w-3" />, color: 'text-blue-500' },
  none: { label: 'No priority', icon: <Signal className="h-3 w-3" />, color: 'text-muted-foreground' },
};

export function IssuesPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [cyclesOpen, setCyclesOpen] = useState(true);
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  // View mode from URL or default to 'list'
  const viewMode = (searchParams.get('view') as ViewMode) || 'list';
  const currentState = searchParams.get('state') || 'open';
  const isInboxView = viewMode === 'inbox';
  
  // Sidebar selection
  const sidebarSection = (searchParams.get('section') as SidebarSection) || 'all';
  const selectedProjectId = searchParams.get('project');
  const selectedCycleId = searchParams.get('cycle');

  // Fetch repository data to get the repo ID
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch projects
  const { data: projects } = trpc.projects.list.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  );

  // Fetch cycles
  const { data: cycles } = trpc.cycles.list.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  );

  // Fetch current cycle
  const { data: currentCycle } = trpc.cycles.getCurrent.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  );

  // Fetch issues for list view
  const { data: issuesData, isLoading: issuesLoading } = trpc.issues.list.useQuery(
    {
      repoId: repoData?.repo.id!,
      state: currentState === 'open' ? 'open' : currentState === 'closed' ? 'closed' : undefined,
      projectId: selectedProjectId || undefined,
      cycleId: selectedCycleId || undefined,
      limit: 50,
    },
    { enabled: !!repoData?.repo.id && viewMode === 'list' }
  );

  // Fetch issues grouped by status for Kanban view
  const { data: kanbanData, isLoading: kanbanLoading } = trpc.issues.listGroupedByStatus.useQuery(
    {
      repoId: repoData?.repo.id!,
      projectId: selectedProjectId || undefined,
      cycleId: selectedCycleId || undefined,
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

  const handleSidebarSelect = (section: SidebarSection, id?: string) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('section', section);
    newParams.delete('project');
    newParams.delete('cycle');
    if (section === 'project' && id) {
      newParams.set('project', id);
    } else if (section === 'cycle' && id) {
      newParams.set('cycle', id);
    }
    setSearchParams(newParams);
  };

  // Get current context info
  const getContextInfo = () => {
    if (selectedProjectId) {
      const project = projects?.find(p => p.id === selectedProjectId);
      return { 
        name: project?.name || 'Project', 
        type: 'project' as const, 
        icon: project?.icon,
        id: selectedProjectId 
      };
    }
    if (selectedCycleId) {
      const cycle = cycles?.find(c => c.id === selectedCycleId);
      return { 
        name: cycle?.name || 'Cycle', 
        type: 'cycle' as const, 
        icon: null,
        id: selectedCycleId 
      };
    }
    return { name: 'All Issues', type: 'all' as const, icon: null, id: null };
  };

  const contextInfo = getContextInfo();

  const clearContext = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('section');
    newParams.delete('project');
    newParams.delete('cycle');
    setSearchParams(newParams);
  };

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="flex gap-6">
          <div className="w-56 flex-shrink-0">
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-8 bg-muted rounded animate-pulse" />
              ))}
            </div>
          </div>
          <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between">
              <div className="h-6 w-24 bg-muted rounded animate-pulse" />
              <div className="h-9 w-28 bg-muted rounded animate-pulse" />
            </div>
            <IssueListSkeleton count={5} />
          </div>
        </div>
      </RepoLayout>
    );
  }

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="flex gap-6">
        {/* Linear-style Sidebar */}
        <aside className="w-56 flex-shrink-0 space-y-1">
          {/* All Issues */}
          <button
            onClick={() => handleSidebarSelect('all')}
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
              sidebarSection === 'all' && !selectedProjectId && !selectedCycleId
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <CircleDot className="h-4 w-4" />
            All Issues
            <Badge variant="secondary" className="ml-auto text-xs">
              {openCount}
            </Badge>
          </button>

          {/* Active Cycle Quick Link */}
          {currentCycle && (
            <button
              onClick={() => handleSidebarSelect('cycle', currentCycle.id)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                selectedCycleId === currentCycle.id
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <TrendingUp className="h-4 w-4 text-green-500" />
              Active Cycle
            </button>
          )}

          {/* My Issues (authenticated only) */}
          {authenticated && (
            <button
              onClick={() => handleViewChange('inbox')}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                viewMode === 'inbox'
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              <Inbox className="h-4 w-4" />
              My Issues
            </button>
          )}

          <div className="h-px bg-border my-2" />

          {/* Projects Section */}
          <Collapsible open={projectsOpen} onOpenChange={setProjectsOpen}>
            <CollapsibleTrigger className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
              <ChevronRight className={cn('h-3 w-3 transition-transform', projectsOpen && 'rotate-90')} />
              <FolderKanban className="h-3.5 w-3.5" />
              PROJECTS
              {authenticated && (
                <Link
                  to={`/${owner}/${repo}/projects`}
                  className="ml-auto hover:text-primary"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Link>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-0.5">
              {projects?.map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleSidebarSelect('project', project.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5 pl-8 rounded-md text-sm transition-colors',
                    selectedProjectId === project.id
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  )}
                >
                  {project.icon && <span className="text-sm">{project.icon}</span>}
                  <span className="truncate">{project.name}</span>
                </button>
              ))}
              {(!projects || projects.length === 0) && (
                <div className="px-3 py-2 pl-8 text-xs text-muted-foreground">
                  No projects yet
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Cycles Section */}
          <Collapsible open={cyclesOpen} onOpenChange={setCyclesOpen}>
            <CollapsibleTrigger className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
              <ChevronRight className={cn('h-3 w-3 transition-transform', cyclesOpen && 'rotate-90')} />
              <RefreshCw className="h-3.5 w-3.5" />
              CYCLES
              {authenticated && (
                <Link
                  to={`/${owner}/${repo}/cycles`}
                  className="ml-auto hover:text-primary"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Link>
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-0.5">
              {cycles?.slice(0, 5).map((cycle) => {
                const isActive = currentCycle?.id === cycle.id;
                return (
                  <button
                    key={cycle.id}
                    onClick={() => handleSidebarSelect('cycle', cycle.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 pl-8 rounded-md text-sm transition-colors',
                      selectedCycleId === cycle.id
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    )}
                  >
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                    <span className="truncate">{cycle.name}</span>
                  </button>
                );
              })}
              {(!cycles || cycles.length === 0) && (
                <div className="px-3 py-2 pl-8 text-xs text-muted-foreground">
                  No cycles yet
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </aside>

        {/* Main Content */}
        <div className="flex-1 space-y-4">
          {/* Breadcrumb - shows when filtering by project or cycle */}
          {(selectedProjectId || selectedCycleId) && (
            <div className="flex items-center gap-2 text-sm">
              <Link 
                to={`/${owner}/${repo}/issues`} 
                className="text-muted-foreground hover:text-foreground transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  clearContext();
                }}
              >
                All Issues
              </Link>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="flex items-center gap-1.5 text-foreground font-medium">
                {contextInfo.type === 'project' ? (
                  <FolderKanban className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <RefreshCw className="h-4 w-4 text-muted-foreground" />
                )}
                {contextInfo.icon && <span>{contextInfo.icon}</span>}
                {contextInfo.name}
              </span>
              <button
                onClick={clearContext}
                className="ml-1 p-0.5 rounded hover:bg-muted transition-colors"
                title="Clear filter"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          )}

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              {/* Context Switcher Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 text-xl font-semibold hover:text-primary transition-colors">
                    {contextInfo.icon && <span>{contextInfo.icon}</span>}
                    {contextInfo.name}
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuItem onClick={() => clearContext()}>
                    <CircleDot className="mr-2 h-4 w-4" />
                    All Issues
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {projects && projects.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        Projects
                      </div>
                      {projects.map((project) => (
                        <DropdownMenuItem
                          key={project.id}
                          onClick={() => handleSidebarSelect('project', project.id)}
                          className={selectedProjectId === project.id ? 'bg-primary/10' : ''}
                        >
                          <FolderKanban className="mr-2 h-4 w-4" />
                          {project.icon && <span className="mr-1">{project.icon}</span>}
                          {project.name}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {cycles && cycles.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                        Cycles
                      </div>
                      {cycles.slice(0, 5).map((cycle) => (
                        <DropdownMenuItem
                          key={cycle.id}
                          onClick={() => handleSidebarSelect('cycle', cycle.id)}
                          className={selectedCycleId === cycle.id ? 'bg-primary/10' : ''}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          {cycle.name}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              
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
                  <span>List</span>
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
              <Link 
                to={`/${owner}/${repo}/issues/new${
                  selectedProjectId ? `?project=${selectedProjectId}` : 
                  selectedCycleId ? `?cycle=${selectedCycleId}` : ''
                }`}
              >
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
                      <Signal className="h-4 w-4" />
                      Priority
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem>Urgent</DropdownMenuItem>
                    <DropdownMenuItem>High</DropdownMenuItem>
                    <DropdownMenuItem>Medium</DropdownMenuItem>
                    <DropdownMenuItem>Low</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>All priorities</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                      <User className="h-4 w-4" />
                      Assignee
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem>Assigned to me</DropdownMenuItem>
                    <DropdownMenuItem>Unassigned</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem>All assignees</DropdownMenuItem>
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
                    <DropdownMenuItem>Priority</DropdownMenuItem>
                    <DropdownMenuItem>Due date</DropdownMenuItem>
                    <DropdownMenuItem>Recently updated</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}

          {/* Content based on view mode */}
          {viewMode === 'inbox' && authenticated ? (
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
    priority?: string;
    estimate?: number | null;
    dueDate?: Date | string | null;
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
  const priorityInfo = PRIORITY_CONFIG[issue.priority || 'none'];

  // Check if due date is overdue or soon
  const getDueDateStatus = () => {
    if (!issue.dueDate) return null;
    const due = new Date(issue.dueDate);
    const now = new Date();
    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'overdue';
    if (diffDays <= 3) return 'soon';
    return 'normal';
  };
  const dueDateStatus = getDueDateStatus();

  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors group">
      {/* Priority indicator */}
      <div className={cn('flex-shrink-0', priorityInfo.color)} title={priorityInfo.label}>
        {priorityInfo.icon}
      </div>

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

      {/* Right side: due date, estimate, assignee */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {/* Due date */}
        {issue.dueDate && (
          <span className={cn(
            'flex items-center gap-1 text-xs',
            dueDateStatus === 'overdue' && 'text-red-500',
            dueDateStatus === 'soon' && 'text-orange-500',
            dueDateStatus === 'normal' && 'text-muted-foreground'
          )}>
            <Calendar className="h-3 w-3" />
            {new Date(issue.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}

        {/* Estimate */}
        {issue.estimate && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Target className="h-3 w-3" />
            {issue.estimate}
          </span>
        )}

        {/* Assignee */}
        {issue.assignee?.avatarUrl && (
          <img
            src={issue.assignee.avatarUrl}
            alt={issue.assignee.username || 'Assignee'}
            className="h-6 w-6 rounded-full"
          />
        )}
      </div>
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
