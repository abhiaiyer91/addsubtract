import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Star,
  GitFork,
  Eye,
  Code,
  GitPullRequest,
  CircleDot,
  Settings,
  History,
  Loader2,
  Layers,
  MoreHorizontal,
  Sparkles,
  Maximize2,
  BookOpen,
  FolderKanban,
  RefreshCw,
  Package,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AgentPanel } from '@/components/agent/agent-panel';
import { IDELayout } from '@/components/ide';
import { useIDEStore } from '@/lib/ide-store';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { toastSuccess, toastError } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

interface RepoLayoutProps {
  owner: string;
  repo: string;
  children: React.ReactNode;
}

export function RepoLayout({ owner, repo, children }: RepoLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const authenticated = !!session?.user;
  const utils = trpc.useUtils();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const { isIDEMode, setIDEMode } = useIDEStore();

  // Fetch repository data
  const {
    data: repoData,
    isLoading,
    error,
  } = trpc.repos.get.useQuery(
    { owner, repo },
    { enabled: !!owner && !!repo }
  );

  // Check if user has starred/is watching this repo
  const { data: starredData } = trpc.repos.isStarred.useQuery(
    { repoId: repoData?.repo.id || '' },
    { enabled: !!repoData?.repo.id && authenticated }
  );

  const { data: watchingData } = trpc.repos.isWatching.useQuery(
    { repoId: repoData?.repo.id || '' },
    { enabled: !!repoData?.repo.id && authenticated }
  );

  // Check if package registry is enabled for this repo
  const { data: packageData } = trpc.packages.getByRepoId.useQuery(
    { repoId: repoData?.repo.id || '' },
    { enabled: !!repoData?.repo.id }
  );

  // Star/unstar mutation with optimistic updates
  const starMutation = trpc.repos.star.useMutation({
    onMutate: async () => {
      await utils.repos.isStarred.cancel({ repoId: repoData?.repo.id || '' });
      const previousStarred = utils.repos.isStarred.getData({ repoId: repoData?.repo.id || '' });
      utils.repos.isStarred.setData({ repoId: repoData?.repo.id || '' }, { starred: true });
      return { previousStarred };
    },
    onSuccess: () => {
      utils.repos.get.invalidate({ owner, repo });
      toastSuccess({ title: 'Repository starred' });
    },
    onError: (error, _variables, context) => {
      if (context?.previousStarred !== undefined) {
        utils.repos.isStarred.setData({ repoId: repoData?.repo.id || '' }, context.previousStarred);
      }
      toastError({ title: 'Failed to star repository', description: error.message });
    },
    onSettled: () => {
      utils.repos.isStarred.invalidate({ repoId: repoData?.repo.id || '' });
    },
  });

  const unstarMutation = trpc.repos.unstar.useMutation({
    onMutate: async () => {
      await utils.repos.isStarred.cancel({ repoId: repoData?.repo.id || '' });
      const previousStarred = utils.repos.isStarred.getData({ repoId: repoData?.repo.id || '' });
      utils.repos.isStarred.setData({ repoId: repoData?.repo.id || '' }, { starred: false });
      return { previousStarred };
    },
    onSuccess: () => {
      utils.repos.get.invalidate({ owner, repo });
      toastSuccess({ title: 'Repository unstarred' });
    },
    onError: (error, _variables, context) => {
      if (context?.previousStarred !== undefined) {
        utils.repos.isStarred.setData({ repoId: repoData?.repo.id || '' }, context.previousStarred);
      }
      toastError({ title: 'Failed to unstar repository', description: error.message });
    },
    onSettled: () => {
      utils.repos.isStarred.invalidate({ repoId: repoData?.repo.id || '' });
    },
  });

  // Watch/unwatch mutation with optimistic updates
  const watchMutation = trpc.repos.watch.useMutation({
    onMutate: async () => {
      await utils.repos.isWatching.cancel({ repoId: repoData?.repo.id || '' });
      const previousWatching = utils.repos.isWatching.getData({ repoId: repoData?.repo.id || '' });
      utils.repos.isWatching.setData({ repoId: repoData?.repo.id || '' }, { watching: true });
      return { previousWatching };
    },
    onSuccess: () => {
      utils.repos.get.invalidate({ owner, repo });
      toastSuccess({ title: 'Now watching repository' });
    },
    onError: (error, _variables, context) => {
      if (context?.previousWatching !== undefined) {
        utils.repos.isWatching.setData({ repoId: repoData?.repo.id || '' }, context.previousWatching);
      }
      toastError({ title: 'Failed to watch repository', description: error.message });
    },
    onSettled: () => {
      utils.repos.isWatching.invalidate({ repoId: repoData?.repo.id || '' });
    },
  });

  const unwatchMutation = trpc.repos.unwatch.useMutation({
    onMutate: async () => {
      await utils.repos.isWatching.cancel({ repoId: repoData?.repo.id || '' });
      const previousWatching = utils.repos.isWatching.getData({ repoId: repoData?.repo.id || '' });
      utils.repos.isWatching.setData({ repoId: repoData?.repo.id || '' }, { watching: false });
      return { previousWatching };
    },
    onSuccess: () => {
      utils.repos.get.invalidate({ owner, repo });
      toastSuccess({ title: 'Stopped watching repository' });
    },
    onError: (error, _variables, context) => {
      if (context?.previousWatching !== undefined) {
        utils.repos.isWatching.setData({ repoId: repoData?.repo.id || '' }, context.previousWatching);
      }
      toastError({ title: 'Failed to unwatch repository', description: error.message });
    },
    onSettled: () => {
      utils.repos.isWatching.invalidate({ repoId: repoData?.repo.id || '' });
    },
  });

  // Fork mutation
  const forkMutation = trpc.repos.fork.useMutation({
    onSuccess: (data) => {
      const newOwner = session?.user?.username || session?.user?.name;
      toastSuccess({ title: 'Repository forked', description: `Created ${newOwner}/${data.name}` });
      navigate(`/${newOwner}/${data.name}`);
    },
    onError: (error) => {
      toastError({ title: 'Failed to fork repository', description: error.message });
    },
  });

  const isStarred = starredData?.starred || false;
  const isWatching = watchingData?.watching || false;

  const handleStar = () => {
    if (!repoData?.repo.id) return;
    if (isStarred) {
      unstarMutation.mutate({ repoId: repoData.repo.id });
    } else {
      starMutation.mutate({ repoId: repoData.repo.id });
    }
  };

  const handleWatch = () => {
    if (!repoData?.repo.id) return;
    if (isWatching) {
      unwatchMutation.mutate({ repoId: repoData.repo.id });
    } else {
      watchMutation.mutate({ repoId: repoData.repo.id });
    }
  };

  const handleFork = () => {
    if (!repoData?.repo.id) return;
    forkMutation.mutate({ repoId: repoData.repo.id });
  };

  const isStarLoading = starMutation.isPending || unstarMutation.isPending;
  const isWatchLoading = watchMutation.isPending || unwatchMutation.isPending;
  const isForkLoading = forkMutation.isPending;

  if (isLoading) {
    return <Loading text="Loading repository..." />;
  }

  if (error || !repoData) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-2">Repository not found</h2>
        <p className="text-muted-foreground">
          The repository {owner}/{repo} could not be found.
        </p>
      </div>
    );
  }

  const { repo: repoInfo, owner: ownerInfo } = repoData;
  const ownerUsername = 'username' in ownerInfo ? (ownerInfo.username || owner) : owner;

  // Render IDE mode if enabled
  if (isIDEMode && authenticated) {
    return (
      <>
        <IDELayout
          owner={ownerUsername}
          repo={repoInfo.name}
          repoId={repoInfo.id}
          defaultRef={repoInfo.defaultBranch || 'main'}
        />
        {/* Floating exit button */}
        <Button
          variant="outline"
          size="sm"
          className="fixed bottom-4 left-4 z-[60] gap-2 shadow-lg"
          onClick={() => setIDEMode(false)}
        >
          <Maximize2 className="h-4 w-4" />
          Exit IDE
        </Button>
      </>
    );
  }

  // Determine active tab based on current path
  const path = location.pathname;
  const getActiveTab = () => {
    if (path.includes('/commits')) return 'commits';
    if (path.includes('/issues') || path.includes('/projects') || path.includes('/cycles')) return 'issues';
    if (path.includes('/pulls') || path.includes('/pull/')) return 'pulls';
    if (path.includes('/stacks')) return 'stacks';
    if (path.includes('/journal')) return 'journal';
    if (path.includes('/planning')) return 'planning';
    if (path.includes('/package') && !path.includes('/settings/package')) return 'package';
    if (path.includes('/settings')) return 'settings';
    return 'code';
  };
  const activeTab = getActiveTab();

  // Determine active sub-tab for issues section
  const getActiveIssuesSubTab = () => {
    if (path.includes('/projects')) return 'projects';
    if (path.includes('/cycles')) return 'cycles';
    return 'issues';
  };
  const activeIssuesSubTab = getActiveIssuesSubTab();

  const subTabClass = (tab: string) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${
      activeIssuesSubTab === tab
        ? 'bg-primary/10 text-primary font-medium'
        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
    }`;

  const tabClass = (tab: string) =>
    `flex items-center gap-1.5 md:gap-2 px-2 md:px-4 py-2 border-b-2 text-sm transition-colors whitespace-nowrap ${
      activeTab === tab
        ? 'border-primary text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50'
    }`;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Repository header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 md:gap-2 mb-2 flex-wrap">
            <Link
              to={`/${ownerUsername}`}
              className="text-base md:text-xl text-primary hover:underline truncate"
            >
              {ownerUsername}
            </Link>
            <span className="text-base md:text-xl text-muted-foreground">/</span>
            <Link
              to={`/${ownerUsername}/${repoInfo.name}`}
              className="text-base md:text-xl font-bold hover:underline truncate"
            >
              {repoInfo.name}
            </Link>
            {repoInfo.isPrivate ? (
              <Badge variant="secondary" className="text-xs">Private</Badge>
            ) : (
              <Badge variant="outline" className="text-xs">Public</Badge>
            )}
          </div>
          {repoInfo.description && (
            <p className="text-sm md:text-base text-muted-foreground line-clamp-2">{repoInfo.description}</p>
          )}
        </div>

        {/* Action buttons - responsive layout */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* IDE Mode button */}
          {authenticated && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 h-9"
                    onClick={() => setIDEMode(true)}
                  >
                    <Maximize2 className="h-4 w-4" />
                    <span className="hidden sm:inline">IDE</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Open full IDE mode with code editor
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Agent button */}
          {authenticated && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isChatOpen ? 'default' : 'outline'}
                    size="sm"
                    className={cn(
                      'gap-2 h-9 transition-all',
                      isChatOpen && 'bg-primary/90 shadow-glow'
                    )}
                    onClick={() => setIsChatOpen(!isChatOpen)}
                  >
                    <Sparkles className="h-4 w-4" />
                    <span className="hidden sm:inline">Agent</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isChatOpen ? 'Close agent panel' : 'Open AI agent'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {authenticated && (
            <>
              {/* Desktop buttons */}
              <div className="hidden md:flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-9"
                  onClick={handleWatch}
                  disabled={isWatchLoading}
                >
                  {isWatchLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Eye className={`h-4 w-4 ${isWatching ? 'fill-current' : ''}`} />
                  )}
                  {isWatching ? 'Unwatch' : 'Watch'}
                  <Badge variant="secondary" className="ml-1">
                    {repoInfo.watchersCount}
                  </Badge>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-9"
                  onClick={handleFork}
                  disabled={isForkLoading || repoInfo.ownerId === session?.user?.id}
                >
                  {isForkLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <GitFork className="h-4 w-4" />
                  )}
                  Fork
                  <Badge variant="secondary" className="ml-1">
                    {repoInfo.forksCount}
                  </Badge>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-9"
                  onClick={handleStar}
                  disabled={isStarLoading}
                >
                  {isStarLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Star className={`h-4 w-4 ${isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                  )}
                  {isStarred ? 'Starred' : 'Star'}
                  <Badge variant="secondary" className="ml-1">
                    {repoInfo.starsCount}
                  </Badge>
                </Button>
              </div>

              {/* Mobile compact buttons */}
              <div className="flex md:hidden items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 h-8 px-2"
                  onClick={handleStar}
                  disabled={isStarLoading}
                >
                  {isStarLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Star className={`h-3.5 w-3.5 ${isStarred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                  )}
                  <span className="text-xs">{repoInfo.starsCount}</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleWatch} disabled={isWatchLoading}>
                      <Eye className="mr-2 h-4 w-4" />
                      {isWatching ? 'Unwatch' : 'Watch'} ({repoInfo.watchersCount})
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={handleFork} 
                      disabled={isForkLoading || repoInfo.ownerId === session?.user?.id}
                    >
                      <GitFork className="mr-2 h-4 w-4" />
                      Fork ({repoInfo.forksCount})
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Navigation tabs - horizontally scrollable on mobile */}
      <div className="border-b -mx-4 md:mx-0">
        <nav className="flex gap-0 -mb-px overflow-x-auto px-4 md:px-0 scrollbar-hide">
          <Link to={`/${owner}/${repo}`} className={tabClass('code')}>
            <Code className="h-4 w-4" />
            <span className="hidden sm:inline">Code</span>
          </Link>
          <Link to={`/${owner}/${repo}/commits`} className={tabClass('commits')}>
            <History className="h-4 w-4" />
            <span className="hidden sm:inline">Commits</span>
          </Link>
          <Link to={`/${owner}/${repo}/issues`} className={tabClass('issues')}>
            <CircleDot className="h-4 w-4" />
            <span className="hidden sm:inline">Issues</span>
            <Badge variant="secondary" className="ml-1 text-xs">
              {repoInfo.openIssuesCount}
            </Badge>
          </Link>
          <Link to={`/${owner}/${repo}/pulls`} className={tabClass('pulls')}>
            <GitPullRequest className="h-4 w-4" />
            <span className="hidden sm:inline">PRs</span>
            <Badge variant="secondary" className="ml-1 text-xs">
              {repoInfo.openPrsCount}
            </Badge>
          </Link>
          <Link to={`/${owner}/${repo}/stacks`} className={tabClass('stacks')}>
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">Stacks</span>
          </Link>
          <Link to={`/${owner}/${repo}/journal`} className={tabClass('journal')}>
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Journal</span>
          </Link>
          {authenticated && (
            <Link to={`/${owner}/${repo}/planning`} className={tabClass('planning')}>
              <Target className="h-4 w-4" />
              <span className="hidden sm:inline">Planning</span>
            </Link>
          )}
          {packageData && (
            <Link to={`/${owner}/${repo}/package`} className={tabClass('package')}>
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Package</span>
            </Link>
          )}
          {authenticated && (
            <Link to={`/${owner}/${repo}/settings`} className={tabClass('settings')}>
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </Link>
          )}
        </nav>
      </div>

      {/* Sub-navigation for Issues section */}
      {activeTab === 'issues' && (
        <div className="flex items-center gap-2 -mt-2">
          <Link to={`/${owner}/${repo}/issues`} className={subTabClass('issues')}>
            <CircleDot className="h-4 w-4" />
            Issues
          </Link>
          <Link to={`/${owner}/${repo}/projects`} className={subTabClass('projects')}>
            <FolderKanban className="h-4 w-4" />
            Projects
          </Link>
          <Link to={`/${owner}/${repo}/cycles`} className={subTabClass('cycles')}>
            <RefreshCw className="h-4 w-4" />
            Cycles
          </Link>
        </div>
      )}

      {/* Page content */}
      <div className="min-w-0">
        {children}
      </div>

      {/* Agent Panel */}
      {authenticated && (
        <AgentPanel
          repoId={repoInfo.id}
          repoName={repoInfo.name}
          owner={owner}
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
        />
      )}
    </div>
  );
}
