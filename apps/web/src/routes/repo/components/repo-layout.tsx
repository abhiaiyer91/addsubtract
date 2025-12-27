import { Link, useLocation } from 'react-router-dom';
import {
  Star,
  GitFork,
  Eye,
  Code,
  GitPullRequest,
  CircleDot,
  Settings,
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
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  // Fetch repository data
  const {
    data: repoData,
    isLoading,
    error,
  } = trpc.repos.get.useQuery(
    { owner, repo },
    { enabled: !!owner && !!repo }
  );

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
    if (path.includes('/issues')) return 'issues';
    if (path.includes('/pulls') || path.includes('/pull/')) return 'pulls';
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
              <Button variant="outline" size="sm" className="gap-2">
                <Eye className="h-4 w-4" />
                Watch
                <Badge variant="secondary" className="ml-1">
                  {repoInfo.watchersCount}
                </Badge>
              </Button>
              <Button variant="outline" size="sm" className="gap-2">
                <GitFork className="h-4 w-4" />
                Fork
                <Badge variant="secondary" className="ml-1">
                  {repoInfo.forksCount}
                </Badge>
              </Button>
              <Button variant="outline" size="sm" className="gap-2">
                <Star className="h-4 w-4" />
                Star
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
