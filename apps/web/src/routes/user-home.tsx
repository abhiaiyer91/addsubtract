/**
 * Unified User Home
 * 
 * The main dashboard for authenticated users at /{username}
 * Shows:
 * - User profile summary
 * - Stats overview (repos, PRs, issues, commits)
 * - Organizations
 * - Recent repositories
 * - Inbox (notifications, PRs to review, assigned issues)
 * - Activity feed
 * - Contribution calendar
 */

import { Link, useParams } from 'react-router-dom';
import { 
  GitPullRequest, 
  CircleDot, 
  Code2, 
  GitCommit,
  Bell,
  Eye,
  TrendingUp,
  TrendingDown,
  Minus,
  Building2,
  Plus,
  Star,
  MessageSquare,
  CheckCircle2,
  XCircle,
  GitMerge,
  Flame,
  Calendar,
  Activity,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { trpc } from '@/lib/trpc';
import { useSession } from '@/lib/auth-client';
import { formatRelativeTime, cn } from '@/lib/utils';

// Contribution calendar component
function ContributionCalendar({ data }: { data: Array<{ date: string; count: number; level: 0 | 1 | 2 | 3 | 4 }> }) {
  const weeks: Array<Array<typeof data[0]>> = [];
  let currentWeek: typeof data[0][] = [];
  
  // Fill in the start of the first week with empty cells
  if (data.length > 0) {
    const firstDate = new Date(data[0].date);
    const dayOfWeek = firstDate.getDay();
    for (let i = 0; i < dayOfWeek; i++) {
      currentWeek.push({ date: '', count: 0, level: 0 });
    }
  }
  
  for (const day of data) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  const levelColors = {
    0: 'bg-muted',
    1: 'bg-emerald-200 dark:bg-emerald-900',
    2: 'bg-emerald-300 dark:bg-emerald-700',
    3: 'bg-emerald-400 dark:bg-emerald-500',
    4: 'bg-emerald-500 dark:bg-emerald-400',
  };

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px] min-w-max">
        {weeks.slice(-52).map((week, weekIndex) => (
          <div key={weekIndex} className="flex flex-col gap-[3px]">
            {week.map((day, dayIndex) => (
              <div
                key={dayIndex}
                className={cn(
                  'w-[10px] h-[10px] rounded-sm',
                  levelColors[day.level],
                  day.date && 'cursor-pointer hover:ring-1 hover:ring-foreground/20'
                )}
                title={day.date ? `${day.count} contributions on ${day.date}` : ''}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-1 mt-2 text-xs text-muted-foreground">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={cn('w-[10px] h-[10px] rounded-sm', levelColors[level as 0 | 1 | 2 | 3 | 4])}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

// Stat card component
function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  trend,
  href,
}: { 
  icon: React.ElementType; 
  label: string; 
  value: number | string;
  trend?: 'up' | 'down' | 'stable';
  href?: string;
}) {
  const content = (
    <Card className={cn(href && 'hover:bg-accent/50 transition-colors cursor-pointer')}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground truncate">{label}</p>
          </div>
          {trend && (
            <div className={cn(
              'p-1 rounded',
              trend === 'up' && 'text-emerald-500',
              trend === 'down' && 'text-red-500',
              trend === 'stable' && 'text-muted-foreground'
            )}>
              {trend === 'up' && <TrendingUp className="h-4 w-4" />}
              {trend === 'down' && <TrendingDown className="h-4 w-4" />}
              {trend === 'stable' && <Minus className="h-4 w-4" />}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link to={href}>{content}</Link>;
  }
  return content;
}

// Activity item component  
function ActivityItem({ activity }: { activity: any }) {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'push':
        return <GitCommit className="h-4 w-4 text-emerald-500" />;
      case 'pr_opened':
      case 'pr_merged':
      case 'pr_closed':
        return <GitPullRequest className="h-4 w-4 text-purple-500" />;
      case 'issue_opened':
      case 'issue_closed':
        return <CircleDot className="h-4 w-4 text-green-500" />;
      case 'comment':
        return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case 'star':
        return <Star className="h-4 w-4 text-yellow-500" />;
      default:
        return <Activity className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActivityMessage = (activity: any) => {
    const repo = activity.repoName;
    switch (activity.type) {
      case 'push':
        return `Pushed to ${repo}`;
      case 'pr_opened':
        return `Opened a pull request in ${repo}`;
      case 'pr_merged':
        return `Merged a pull request in ${repo}`;
      case 'issue_opened':
        return `Opened an issue in ${repo}`;
      case 'issue_closed':
        return `Closed an issue in ${repo}`;
      case 'comment':
        return `Commented in ${repo}`;
      case 'star':
        return `Starred ${repo}`;
      default:
        return `Activity in ${repo || 'unknown'}`;
    }
  };

  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5">{getActivityIcon(activity.type)}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">{getActivityMessage(activity)}</p>
        <p className="text-xs text-muted-foreground">
          {formatRelativeTime(activity.createdAt)}
        </p>
      </div>
    </div>
  );
}

// PR/Issue card for inbox
function InboxItemCard({ item, type }: { item: any; type: 'pr' | 'issue' }) {
  const isPR = type === 'pr';
  const href = isPR 
    ? `/${item.repoOwner}/${item.repoName}/pull/${item.number}`
    : `/${item.repoOwner}/${item.repoName}/issues/${item.number}`;

  const prStateIcons: Record<string, React.ReactNode> = {
    open: <GitPullRequest className="h-4 w-4 text-green-500" />,
    closed: <XCircle className="h-4 w-4 text-red-500" />,
    merged: <GitMerge className="h-4 w-4 text-purple-500" />,
  };
  const stateIcon = isPR ? prStateIcons[item.state as string] : (
    item.state === 'open' 
      ? <CircleDot className="h-4 w-4 text-green-500" />
      : <CheckCircle2 className="h-4 w-4 text-purple-500" />
  );

  return (
    <Link to={href} className="block">
      <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors">
        <div className="mt-0.5">{stateIcon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{item.title}</p>
          <p className="text-xs text-muted-foreground">
            {item.repoOwner}/{item.repoName} #{item.number}
          </p>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {formatRelativeTime(item.createdAt)}
        </span>
      </div>
    </Link>
  );
}

// Repository card
function RepoCard({ repo, username }: { repo: any; username: string }) {
  return (
    <Link to={`/${username}/${repo.name}`} className="block">
      <Card className="hover:bg-accent/50 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-primary truncate">{repo.name}</h3>
                {repo.isPrivate && (
                  <Badge variant="secondary" className="text-xs">Private</Badge>
                )}
              </div>
              {repo.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                  {repo.description}
                </p>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3" />
                  {repo.starsCount}
                </span>
                {repo.openPrs > 0 && (
                  <span className="flex items-center gap-1">
                    <GitPullRequest className="h-3 w-3" />
                    {repo.openPrs}
                  </span>
                )}
                {repo.openIssues > 0 && (
                  <span className="flex items-center gap-1">
                    <CircleDot className="h-3 w-3" />
                    {repo.openIssues}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function UserHomePage() {
  const { owner } = useParams<{ owner: string }>();
  const { data: session } = useSession();
  
  const isOwnProfile = session?.user?.username === owner;

  // Fetch user data
  const { data: userData, isLoading: userLoading, error: userError } = trpc.users.get.useQuery(
    { username: owner! },
    { enabled: !!owner }
  );

  // Fetch dashboard data (only for own profile)
  const { data: dashboardData, isLoading: dashboardLoading } = trpc.dashboard.getData.useQuery(
    { includeCalendar: true, repoLimit: 6, activityLimit: 10 },
    { enabled: isOwnProfile }
  );

  // Fetch user's repositories (for any profile)
  const { data: reposData } = trpc.users.repos.useQuery(
    { username: owner! },
    { enabled: !!owner && !isOwnProfile }
  );

  // Fetch user's organizations
  const { data: orgsData } = trpc.organizations.listByUser.useQuery(
    undefined,
    { enabled: isOwnProfile }
  );

  // Inbox data for own profile
  const { data: notifications } = trpc.notifications.list.useQuery(
    { limit: 5 },
    { enabled: isOwnProfile }
  );
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(
    undefined,
    { enabled: isOwnProfile }
  );
  const { data: awaitingReview } = trpc.pulls.inboxAwaitingReview.useQuery(
    { limit: 5 },
    { enabled: isOwnProfile }
  );
  const { data: assignedIssues } = trpc.issues.inboxAssignedToMe.useQuery(
    { limit: 5 },
    { enabled: isOwnProfile }
  );

  const isLoading = userLoading || (isOwnProfile && dashboardLoading);

  if (isLoading) {
    return <Loading text="Loading..." />;
  }

  if (userError || !userData) {
    return (
      <div className="container max-w-6xl py-8 text-center">
        <h2 className="text-2xl font-bold mb-2">User not found</h2>
        <p className="text-muted-foreground">
          The user @{owner} could not be found.
        </p>
      </div>
    );
  }

  const user = userData;
  const repos = isOwnProfile ? dashboardData?.repos : reposData;
  const summary = dashboardData?.summary;
  const activity = dashboardData?.activity;
  const contributionStats = dashboardData?.contributionStats;

  return (
    <div className="container max-w-6xl py-6 space-y-6">
      {/* Profile Header */}
      <div className="flex items-start gap-6">
        <Avatar className="h-20 w-20 rounded-xl">
          <AvatarImage src={user.avatarUrl || undefined} />
          <AvatarFallback className="text-2xl rounded-xl">
            {(user.username || user.name || 'U').slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{user.name || user.username}</h1>
            {!isOwnProfile && (
              <Button size="sm">Follow</Button>
            )}
          </div>
          <p className="text-muted-foreground">@{user.username}</p>
          {user.bio && (
            <p className="text-sm mt-2">{user.bio}</p>
          )}
        </div>
        {isOwnProfile && (
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings">Edit profile</Link>
          </Button>
        )}
      </div>

      {/* Stats Row - Only for own profile */}
      {isOwnProfile && summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard 
            icon={Code2} 
            label="Repositories" 
            value={repos?.length || 0}
          />
          <StatCard 
            icon={GitPullRequest} 
            label="Pull Requests" 
            value={summary.myOpenPrs || 0}
            href={`/${owner}?tab=pulls`}
          />
          <StatCard 
            icon={CircleDot} 
            label="Issues" 
            value={summary.inbox?.issuesCreated || 0}
            href={`/${owner}?tab=issues`}
          />
          <StatCard 
            icon={Activity} 
            label="This Week" 
            value={summary.thisWeekContributions || 0}
            trend={summary.contributionTrend}
          />
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Repos & Activity */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contribution Calendar */}
          {isOwnProfile && contributionStats && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Contributions
                  </CardTitle>
                  {contributionStats.streak.current > 0 && (
                    <Badge variant="secondary" className="gap-1">
                      <Flame className="h-3 w-3 text-orange-500" />
                      {contributionStats.streak.current} day streak
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ContributionCalendar data={contributionStats.contributionCalendar} />
                <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                  <span>{contributionStats.totalCommits} commits</span>
                  <span>{contributionStats.totalPullRequests} PRs</span>
                  <span>{contributionStats.totalIssues} issues</span>
                  <span>{contributionStats.totalReviews} reviews</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Repositories */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Code2 className="h-4 w-4" />
                  Repositories
                </CardTitle>
                {isOwnProfile && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/new">
                      <Plus className="h-4 w-4 mr-1" />
                      New
                    </Link>
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {repos && repos.length > 0 ? (
                <div className="grid gap-3">
                  {repos.slice(0, 6).map((repo: any) => (
                    <RepoCard key={repo.id} repo={repo} username={user.username!} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No repositories yet
                </p>
              )}
              {repos && repos.length > 6 && (
                <Button variant="ghost" className="w-full mt-3" asChild>
                  <Link to={`/${owner}?tab=repos`}>
                    View all repositories
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Activity Feed */}
          {isOwnProfile && activity && activity.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="divide-y divide-border">
                  {activity.slice(0, 8).map((item: any) => (
                    <ActivityItem key={item.id} activity={item} />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Inbox & Orgs */}
        <div className="space-y-6">
          {/* Organizations */}
          {isOwnProfile && orgsData && orgsData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Organizations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {orgsData.map((org: any) => (
                    <Link key={org.id} to={`/${org.name}`}>
                      <Avatar className="h-10 w-10 hover:ring-2 ring-primary transition-all">
                        <AvatarImage src={org.avatarUrl || undefined} />
                        <AvatarFallback>
                          {org.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Inbox - Notifications */}
          {isOwnProfile && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    Notifications
                    {unreadCount && unreadCount > 0 && (
                      <Badge variant="secondary">{unreadCount}</Badge>
                    )}
                  </CardTitle>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/inbox">View all</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {notifications && notifications.length > 0 ? (
                  <div className="space-y-2">
                    {notifications.slice(0, 5).map((notif: any) => (
                      <div 
                        key={notif.id} 
                        className={cn(
                          'p-2 rounded-lg text-sm',
                          !notif.read && 'bg-blue-500/5 border border-blue-500/20'
                        )}
                      >
                        <p className="truncate">{notif.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelativeTime(notif.createdAt)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No notifications
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* PRs Awaiting Review */}
          {isOwnProfile && awaitingReview && awaitingReview.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="h-4 w-4" />
                    Review Requests
                    <Badge variant="secondary">{awaitingReview.length}</Badge>
                  </CardTitle>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/inbox?tab=pulls">View all</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {awaitingReview.slice(0, 3).map((pr: any) => (
                    <InboxItemCard key={pr.id} item={pr} type="pr" />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Assigned Issues */}
          {isOwnProfile && assignedIssues && assignedIssues.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CircleDot className="h-4 w-4" />
                    Assigned to You
                    <Badge variant="secondary">{assignedIssues.length}</Badge>
                  </CardTitle>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/inbox?tab=issues">View all</Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {assignedIssues.slice(0, 3).map((issue: any) => (
                    <InboxItemCard key={issue.id} item={issue} type="issue" />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
