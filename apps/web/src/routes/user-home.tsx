/**
 * Unified User Home
 * 
 * The main dashboard for authenticated users at /{username}
 * Combines profile, repos, and inbox into one view
 */

import { Link, useParams } from 'react-router-dom';
import { 
  GitPullRequest, 
  CircleDot, 
  Code2, 
  Bell,
  Building2,
  Plus,
  Star,
  CheckCircle2,
  XCircle,
  GitMerge,
  Clock,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loading } from '@/components/ui/loading';
import { trpc } from '@/lib/trpc';
import { useSession } from '@/lib/auth-client';
import { formatRelativeTime, cn } from '@/lib/utils';

// Repository card
function RepoCard({ repo, owner }: { repo: any; owner: string }) {
  return (
    <Link to={`/${owner}/${repo.name}`} className="block group">
      <div className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-primary truncate group-hover:underline">
                {repo.name}
              </h3>
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
                {repo.starsCount || 0}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatRelativeTime(repo.updatedAt)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// PR Card for inbox
function PRCard({ pr }: { pr: any }) {
  const stateIcons: Record<string, React.ReactNode> = {
    open: <GitPullRequest className="h-4 w-4 text-green-500" />,
    closed: <XCircle className="h-4 w-4 text-red-500" />,
    merged: <GitMerge className="h-4 w-4 text-purple-500" />,
  };

  return (
    <Link to={`/${pr.repoOwner}/${pr.repoName}/pull/${pr.number}`} className="block">
      <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors">
        <div className="mt-0.5">{stateIcons[pr.state] || stateIcons.open}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{pr.title}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span>{pr.repoOwner}/{pr.repoName}</span>
            <span>#{pr.number}</span>
            <span>{formatRelativeTime(pr.createdAt)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// Issue Card for inbox
function IssueCard({ issue }: { issue: any }) {
  const stateIcon = issue.state === 'open' 
    ? <CircleDot className="h-4 w-4 text-green-500" />
    : <CheckCircle2 className="h-4 w-4 text-purple-500" />;

  return (
    <Link to={`/${issue.repoOwner}/${issue.repoName}/issues/${issue.number}`} className="block">
      <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors">
        <div className="mt-0.5">{stateIcon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{issue.title}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span>{issue.repoOwner}/{issue.repoName}</span>
            <span>#{issue.number}</span>
            <span>{formatRelativeTime(issue.createdAt)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// Notification item
function NotificationItem({ notification }: { notification: any }) {
  return (
    <div className={cn(
      'p-3 rounded-lg transition-colors',
      !notification.read ? 'bg-blue-500/5 border border-blue-500/20' : 'hover:bg-accent/50'
    )}>
      <p className="text-sm truncate">{notification.title}</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {formatRelativeTime(notification.createdAt)}
      </p>
    </div>
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

  // Fetch user's repositories
  const { data: reposData, isLoading: reposLoading } = trpc.users.repos.useQuery(
    { username: owner! },
    { enabled: !!owner }
  );

  // Fetch user's organizations (own profile only)
  const { data: orgsData } = trpc.organizations.listByUser.useQuery(
    undefined,
    { enabled: isOwnProfile }
  );

  // Inbox data (own profile only)
  const { data: notifications } = trpc.notifications.list.useQuery(
    { limit: 10 },
    { enabled: isOwnProfile }
  );
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(
    undefined,
    { enabled: isOwnProfile }
  );
  const { data: awaitingReview } = trpc.pulls.inboxAwaitingReview.useQuery(
    { limit: 10 },
    { enabled: isOwnProfile }
  );
  const { data: myPrs } = trpc.pulls.inboxMyPrs.useQuery(
    { limit: 10 },
    { enabled: isOwnProfile }
  );
  const { data: assignedIssues } = trpc.issues.inboxAssignedToMe.useQuery(
    { limit: 10 },
    { enabled: isOwnProfile }
  );
  const { data: createdIssues } = trpc.issues.inboxCreatedByMe.useQuery(
    { limit: 10 },
    { enabled: isOwnProfile }
  );

  // PR/Issue summaries
  const { data: prSummary } = trpc.pulls.inboxSummary.useQuery(
    undefined,
    { enabled: isOwnProfile }
  );
  const { data: issueSummary } = trpc.issues.inboxSummary.useQuery(
    undefined,
    { enabled: isOwnProfile }
  );

  if (userLoading) {
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
  const repos = reposData || [];

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

      {/* Quick Stats for own profile */}
      {isOwnProfile && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Code2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{repos.length}</p>
                  <p className="text-xs text-muted-foreground">Repositories</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <GitPullRequest className="h-4 w-4 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{(prSummary?.awaitingReview || 0) + (prSummary?.myOpenPrs || 0)}</p>
                  <p className="text-xs text-muted-foreground">Open PRs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <CircleDot className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{(issueSummary?.assignedToMe || 0) + (issueSummary?.createdByMe || 0)}</p>
                  <p className="text-xs text-muted-foreground">Open Issues</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Bell className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{unreadCount || 0}</p>
                  <p className="text-xs text-muted-foreground">Notifications</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Repos */}
        <div className="lg:col-span-2 space-y-6">
          {/* Organizations */}
          {isOwnProfile && orgsData && orgsData.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Organizations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {orgsData.map((org: any) => (
                    <Link key={org.id} to={`/${org.name}`} className="group">
                      <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-accent/50 transition-colors">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={org.avatarUrl || undefined} />
                          <AvatarFallback className="text-xs">
                            {org.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium group-hover:text-primary">
                          {org.name}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Repositories */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Code2 className="h-4 w-4" />
                  Repositories
                  <Badge variant="secondary">{repos.length}</Badge>
                </CardTitle>
                {isOwnProfile && (
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/new">
                      <Plus className="h-4 w-4 mr-1" />
                      New
                    </Link>
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {reposLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />
                  ))}
                </div>
              ) : repos.length > 0 ? (
                <div className="space-y-3">
                  {repos.map((repo: any) => (
                    <RepoCard key={repo.id} repo={repo} owner={user.username!} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Code2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No repositories yet</p>
                  {isOwnProfile && (
                    <Button variant="outline" size="sm" className="mt-3" asChild>
                      <Link to="/new">Create your first repository</Link>
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Inbox (own profile only) */}
        {isOwnProfile && (
          <div className="space-y-6">
            {/* Notifications */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Notifications
                  {unreadCount && unreadCount > 0 && (
                    <Badge variant="default">{unreadCount}</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {notifications && notifications.length > 0 ? (
                  <div className="divide-y divide-border">
                    {notifications.slice(0, 5).map((notif: any) => (
                      <div key={notif.id} className="px-4">
                        <NotificationItem notification={notif} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No notifications
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Pull Requests */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <GitPullRequest className="h-4 w-4" />
                  Pull Requests
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Tabs defaultValue="review" className="w-full">
                  <div className="px-4 pb-2">
                    <TabsList className="w-full">
                      <TabsTrigger value="review" className="flex-1 text-xs">
                        To Review
                        {prSummary?.awaitingReview ? (
                          <Badge variant="secondary" className="ml-1 text-xs">{prSummary.awaitingReview}</Badge>
                        ) : null}
                      </TabsTrigger>
                      <TabsTrigger value="mine" className="flex-1 text-xs">
                        Yours
                        {prSummary?.myOpenPrs ? (
                          <Badge variant="secondary" className="ml-1 text-xs">{prSummary.myOpenPrs}</Badge>
                        ) : null}
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="review" className="mt-0">
                    {awaitingReview && awaitingReview.length > 0 ? (
                      <div className="divide-y divide-border">
                        {awaitingReview.slice(0, 5).map((pr: any) => (
                          <PRCard key={pr.id} pr={pr} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        No PRs to review
                      </p>
                    )}
                  </TabsContent>
                  <TabsContent value="mine" className="mt-0">
                    {myPrs && myPrs.length > 0 ? (
                      <div className="divide-y divide-border">
                        {myPrs.slice(0, 5).map((pr: any) => (
                          <PRCard key={pr.id} pr={pr} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        No open PRs
                      </p>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Issues */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CircleDot className="h-4 w-4" />
                  Issues
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Tabs defaultValue="assigned" className="w-full">
                  <div className="px-4 pb-2">
                    <TabsList className="w-full">
                      <TabsTrigger value="assigned" className="flex-1 text-xs">
                        Assigned
                        {issueSummary?.assignedToMe ? (
                          <Badge variant="secondary" className="ml-1 text-xs">{issueSummary.assignedToMe}</Badge>
                        ) : null}
                      </TabsTrigger>
                      <TabsTrigger value="created" className="flex-1 text-xs">
                        Created
                        {issueSummary?.createdByMe ? (
                          <Badge variant="secondary" className="ml-1 text-xs">{issueSummary.createdByMe}</Badge>
                        ) : null}
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="assigned" className="mt-0">
                    {assignedIssues && assignedIssues.length > 0 ? (
                      <div className="divide-y divide-border">
                        {assignedIssues.slice(0, 5).map((issue: any) => (
                          <IssueCard key={issue.id} issue={issue} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        No assigned issues
                      </p>
                    )}
                  </TabsContent>
                  <TabsContent value="created" className="mt-0">
                    {createdIssues && createdIssues.length > 0 ? (
                      <div className="divide-y divide-border">
                        {createdIssues.slice(0, 5).map((issue: any) => (
                          <IssueCard key={issue.id} issue={issue} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        No created issues
                      </p>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
