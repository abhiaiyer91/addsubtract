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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

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

  // Star/unstar mutation
  const starMutation = trpc.repos.star.useMutation({
    onSuccess: () => {
      utils.repos.get.invalidate({ owner, repo });
      utils.repos.isStarred.invalidate({ repoId: repoData?.repo.id || '' });
    },
  });

  const unstarMutation = trpc.repos.unstar.useMutation({
    onSuccess: () => {
      utils.repos.get.invalidate({ owner, repo });
      utils.repos.isStarred.invalidate({ repoId: repoData?.repo.id || '' });
    },
  });

  // Watch/unwatch mutation
  const watchMutation = trpc.repos.watch.useMutation({
    onSuccess: () => {
      utils.repos.get.invalidate({ owner, repo });
      utils.repos.isWatching.invalidate({ repoId: repoData?.repo.id || '' });
    },
  });

  const unwatchMutation = trpc.repos.unwatch.useMutation({
    onSuccess: () => {
      utils.repos.get.invalidate({ owner, repo });
      utils.repos.isWatching.invalidate({ repoId: repoData?.repo.id || '' });
    },
  });

  // Fork mutation
  const forkMutation = trpc.repos.fork.useMutation({
    onSuccess: (data) => {
      // Navigate to the new fork
      const newOwner = session?.user?.username || session?.user?.name;
      navigate(`/${newOwner}/${data.name}`);
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
  const ownerUsername = 'username' in ownerInfo ? ownerInfo.username : owner;

  // Determine active tab based on current path
  const path = location.pathname;
  const getActiveTab = () => {
    if (path.includes('/commits')) return 'commits';
    if (path.includes('/issues')) return 'issues';
    if (path.includes('/pulls') || path.includes('/pull/')) return 'pulls';
    if (path.includes('/stacks')) return 'stacks';
    if (path.includes('/settings')) return 'settings';
    return 'code';
  };
  const activeTab = getActiveTab();

  const tabClass = (tab: string) =>
    `flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
      activeTab === tab
        ? 'border-primary text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50'
    }`;

  return (
    <div className="space-y-6">
      {/* Repository header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              to={`/${ownerUsername}`}
              className="text-xl text-primary hover:underline"
            >
              {ownerUsername}
            </Link>
            <span className="text-xl text-muted-foreground">/</span>
            <Link
              to={`/${ownerUsername}/${repoInfo.name}`}
              className="text-xl font-bold hover:underline"
            >
              {repoInfo.name}
            </Link>
            {repoInfo.isPrivate ? (
              <Badge variant="secondary">Private</Badge>
            ) : (
              <Badge variant="outline">Public</Badge>
            )}
          </div>
          {repoInfo.description && (
            <p className="text-muted-foreground">{repoInfo.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {authenticated && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
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
                className="gap-2"
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
                className="gap-2"
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
            </>
          )}
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="border-b">
        <nav className="flex gap-0 -mb-px">
          <Link to={`/${owner}/${repo}`} className={tabClass('code')}>
            <Code className="h-4 w-4" />
            Code
          </Link>
          <Link to={`/${owner}/${repo}/commits`} className={tabClass('commits')}>
            <History className="h-4 w-4" />
            Commits
          </Link>
          <Link to={`/${owner}/${repo}/issues`} className={tabClass('issues')}>
            <CircleDot className="h-4 w-4" />
            Issues
            <Badge variant="secondary" className="ml-1">
              {repoInfo.openIssuesCount}
            </Badge>
          </Link>
          <Link to={`/${owner}/${repo}/pulls`} className={tabClass('pulls')}>
            <GitPullRequest className="h-4 w-4" />
            Pull requests
            <Badge variant="secondary" className="ml-1">
              {repoInfo.openPrsCount}
            </Badge>
          </Link>
          <Link to={`/${owner}/${repo}/stacks`} className={tabClass('stacks')}>
            <Layers className="h-4 w-4" />
            Stacks
          </Link>
          {authenticated && (
            <Link to={`/${owner}/${repo}/settings`} className={tabClass('settings')}>
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          )}
        </nav>
      </div>

      {/* Page content */}
      {children}
    </div>
  );
}
