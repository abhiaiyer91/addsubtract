/**
 * Combined Inbox
 * 
 * Unified inbox showing:
 * - Notifications
 * - PRs awaiting your review / your PRs
 * - Issues assigned to you / created by you
 */

import { Link } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  GitPullRequest, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  MessageSquare,
  Eye,
  GitMerge,
  AlertCircle,
  User,
  Inbox as InboxIcon,
  Bell,
  CircleDot,
  UserCheck,
  PenLine,
  AtSign,
  Check,
} from 'lucide-react';
import { useSession } from '../lib/auth-client';
import { formatRelativeTime } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

// PR Card Component
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PRCard({ pr }: { pr: any }) {
  const stateIcons: Record<string, React.ReactNode> = {
    open: <GitPullRequest className="h-4 w-4 text-green-500" />,
    closed: <XCircle className="h-4 w-4 text-red-500" />,
    merged: <GitMerge className="h-4 w-4 text-purple-500" />,
  };
  const stateIcon = stateIcons[pr.state as string] || <GitPullRequest className="h-4 w-4" />;

  return (
    <Link 
      to={`/${pr.repoOwner}/${pr.repoName}/pull/${pr.number}`}
      className="block"
    >
      <div className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
        <div className="mt-1">{stateIcon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-muted-foreground">
              {pr.repoOwner}/{pr.repoName}
            </span>
            <span className="text-xs text-muted-foreground">#{pr.number}</span>
          </div>
          <h3 className="font-medium truncate">{pr.title}</h3>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {pr.authorUsername || pr.author?.username || 'Unknown'}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(pr.createdAt)}
            </span>
            {(pr.commentCount || pr.comments) > 0 && (
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {pr.commentCount || pr.comments}
              </span>
            )}
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
              Changes requested
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
}

// Issue Card Component
function IssueCard({ issue }: { issue: any }) {
  const stateIcon = issue.state === 'open' 
    ? <CircleDot className="h-4 w-4 text-green-500" />
    : <CheckCircle2 className="h-4 w-4 text-purple-500" />;

  return (
    <Link 
      to={`/${issue.repoOwner}/${issue.repoName}/issues/${issue.number}`}
      className="block"
    >
      <div className="flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
        <div className="mt-1">{stateIcon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-muted-foreground">
              {issue.repoOwner}/{issue.repoName}
            </span>
            <span className="text-xs text-muted-foreground">#{issue.number}</span>
          </div>
          <h3 className="font-medium truncate">{issue.title}</h3>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {issue.author?.username || 'Unknown'}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatRelativeTime(issue.createdAt)}
            </span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {issue.status && issue.status !== 'backlog' && (
            <Badge variant="outline" className="text-xs capitalize">
              {issue.status.replace('_', ' ')}
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
}

// Notification Card Component
function NotificationCard({ notification, onMarkAsRead }: { notification: any; onMarkAsRead: (id: string) => void }) {
  const navigate = useNavigate();
  
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'pr_review_requested':
      case 'pr_reviewed':
      case 'pr_merged':
        return <GitPullRequest className="h-4 w-4 text-purple-500" />;
      case 'pr_comment':
      case 'issue_comment':
        return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case 'issue_assigned':
        return <CircleDot className="h-4 w-4 text-green-500" />;
      case 'mention':
        return <AtSign className="h-4 w-4 text-yellow-500" />;
      default:
        return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const handleClick = () => {
    if (!notification.read) {
      onMarkAsRead(notification.id);
    }
    if (notification.url) {
      navigate(notification.url);
    }
  };

  return (
    <div 
      onClick={handleClick}
      className={`flex items-start gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer ${!notification.read ? 'border-blue-500/30 bg-blue-500/5' : ''}`}
    >
      <div className="mt-1">{getNotificationIcon(notification.type)}</div>
      <div className="flex-1 min-w-0">
        <h3 className={`font-medium truncate ${!notification.read ? 'text-foreground' : 'text-muted-foreground'}`}>
          {notification.title}
        </h3>
        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
          {notification.actor && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {notification.actor.name || notification.actor.username}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(notification.createdAt)}
          </span>
        </div>
      </div>
      {!notification.read && (
        <div className="h-2 w-2 bg-blue-500 rounded-full mt-2" />
      )}
    </div>
  );
}

// Generic List Component
function ItemList<T>({ 
  items, 
  isLoading, 
  emptyMessage,
  renderItem 
}: { 
  items: T[] | undefined; 
  isLoading: boolean;
  emptyMessage: string;
  renderItem: (item: T, index: number) => React.ReactNode;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-muted/50 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <InboxIcon className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => renderItem(item, index))}
    </div>
  );
}

export function InboxPage() {
  const { data: session } = useSession();
  const utils = trpc.useUtils();
  
  // Notifications data
  const { data: notifications, isLoading: notificationsLoading } = trpc.notifications.list.useQuery(
    { limit: 50 },
    { enabled: !!session?.user }
  );
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(
    undefined,
    { enabled: !!session?.user }
  );
  
  const markAsRead = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  const markAllAsRead = trpc.notifications.markAllAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });
  
  // PR data
  const { data: prSummary, isLoading: prSummaryLoading } = trpc.pulls.inboxSummary.useQuery(
    undefined,
    { enabled: !!session?.user }
  );
  const { data: awaitingReview, isLoading: awaitingLoading } = trpc.pulls.inboxAwaitingReview.useQuery(
    { limit: 20 },
    { enabled: !!session?.user }
  );
  const { data: myPrs, isLoading: myPrsLoading } = trpc.pulls.inboxMyPrs.useQuery(
    { limit: 20 },
    { enabled: !!session?.user }
  );
  const { data: prParticipated, isLoading: prParticipatedLoading } = trpc.pulls.inboxParticipated.useQuery(
    { limit: 20 },
    { enabled: !!session?.user }
  );
  
  // Issues data
  const { data: issueSummary, isLoading: issueSummaryLoading } = trpc.issues.inboxSummary.useQuery(
    undefined,
    { enabled: !!session?.user }
  );
  const { data: assignedToMe, isLoading: assignedLoading } = trpc.issues.inboxAssignedToMe.useQuery(
    { limit: 20 },
    { enabled: !!session?.user }
  );
  const { data: createdByMe, isLoading: createdLoading } = trpc.issues.inboxCreatedByMe.useQuery(
    { limit: 20 },
    { enabled: !!session?.user }
  );
  const { data: issueParticipated, isLoading: issueParticipatedLoading } = trpc.issues.inboxParticipated.useQuery(
    { limit: 20 },
    { enabled: !!session?.user }
  );

  if (!session?.user) {
    return (
      <div className="container max-w-4xl py-8">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <InboxIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Sign in to view your inbox</h2>
            <p className="text-muted-foreground mb-4">
              Your inbox shows notifications, pull requests, and issues that need your attention.
            </p>
            <Link 
              to="/login" 
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Sign in
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalPrCount = (prSummary?.awaitingReview || 0) + (prSummary?.myPrsOpen || 0);
  const totalIssueCount = (issueSummary?.assignedToMe || 0) + (issueSummary?.createdByMe || 0);

  return (
    <div className="container max-w-4xl py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Inbox</h1>
          <p className="text-muted-foreground">
            Everything that needs your attention in one place
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Bell className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {unreadCount || 0}
                </p>
                <p className="text-xs text-muted-foreground">Unread</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <GitPullRequest className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {prSummaryLoading ? '...' : totalPrCount}
                </p>
                <p className="text-xs text-muted-foreground">Pull Requests</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <CircleDot className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {issueSummaryLoading ? '...' : totalIssueCount}
                </p>
                <p className="text-xs text-muted-foreground">Issues</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="notifications" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            Notifications
            {unreadCount && unreadCount > 0 ? (
              <Badge variant="secondary" className="ml-1">
                {unreadCount}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="pulls" className="gap-2">
            <GitPullRequest className="h-4 w-4" />
            Pull Requests
            {totalPrCount > 0 ? (
              <Badge variant="secondary" className="ml-1">
                {totalPrCount}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="issues" className="gap-2">
            <CircleDot className="h-4 w-4" />
            Issues
            {totalIssueCount > 0 ? (
              <Badge variant="secondary" className="ml-1">
                {totalIssueCount}
              </Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="mt-6">
          {unreadCount && unreadCount > 0 && (
            <div className="flex justify-end mb-4">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => markAllAsRead.mutate()}
                disabled={markAllAsRead.isPending}
              >
                <Check className="h-4 w-4 mr-2" />
                Mark all as read
              </Button>
            </div>
          )}
          <ItemList
            items={notifications}
            isLoading={notificationsLoading}
            emptyMessage="No notifications"
            renderItem={(notification: any) => (
              <NotificationCard 
                key={notification.id} 
                notification={notification}
                onMarkAsRead={(id) => markAsRead.mutate({ id })}
              />
            )}
          />
        </TabsContent>

        {/* Pull Requests Tab */}
        <TabsContent value="pulls" className="mt-6">
          <Tabs defaultValue="review" className="w-full">
            <TabsList className="w-full justify-start mb-4">
              <TabsTrigger value="review" className="gap-2">
                <Eye className="h-4 w-4" />
                To Review
                {prSummary?.awaitingReview ? (
                  <Badge variant="secondary" className="ml-1">
                    {prSummary.awaitingReview}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="mine" className="gap-2">
                <GitPullRequest className="h-4 w-4" />
                Your PRs
                {prSummary?.myPrsOpen ? (
                  <Badge variant="secondary" className="ml-1">
                    {prSummary.myPrsOpen}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="participated" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                Participated
              </TabsTrigger>
            </TabsList>

            <TabsContent value="review">
              <ItemList
                items={awaitingReview}
                isLoading={awaitingLoading}
                emptyMessage="No pull requests awaiting your review"
                renderItem={(pr: any) => (
                  <PRCard key={`${pr.repoId}-${pr.id}`} pr={pr} />
                )}
              />
            </TabsContent>

            <TabsContent value="mine">
              <ItemList
                items={myPrs}
                isLoading={myPrsLoading}
                emptyMessage="You don't have any open pull requests"
                renderItem={(pr: any) => (
                  <PRCard key={`${pr.repoId}-${pr.id}`} pr={pr} />
                )}
              />
            </TabsContent>

            <TabsContent value="participated">
              <ItemList
                items={prParticipated}
                isLoading={prParticipatedLoading}
                emptyMessage="No pull requests you've participated in"
                renderItem={(pr: any) => (
                  <PRCard key={`${pr.repoId}-${pr.id}`} pr={pr} />
                )}
              />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Issues Tab */}
        <TabsContent value="issues" className="mt-6">
          <Tabs defaultValue="assigned" className="w-full">
            <TabsList className="w-full justify-start mb-4">
              <TabsTrigger value="assigned" className="gap-2">
                <UserCheck className="h-4 w-4" />
                Assigned
                {issueSummary?.assignedToMe ? (
                  <Badge variant="secondary" className="ml-1">
                    {issueSummary.assignedToMe}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="created" className="gap-2">
                <PenLine className="h-4 w-4" />
                Created
                {issueSummary?.createdByMe ? (
                  <Badge variant="secondary" className="ml-1">
                    {issueSummary.createdByMe}
                  </Badge>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="participated" className="gap-2">
                <MessageSquare className="h-4 w-4" />
                Participated
              </TabsTrigger>
            </TabsList>

            <TabsContent value="assigned">
              <ItemList
                items={assignedToMe}
                isLoading={assignedLoading}
                emptyMessage="No issues assigned to you"
                renderItem={(issue: any) => (
                  <IssueCard key={`${issue.repoId}-${issue.id}`} issue={issue} />
                )}
              />
            </TabsContent>

            <TabsContent value="created">
              <ItemList
                items={createdByMe}
                isLoading={createdLoading}
                emptyMessage="You haven't created any open issues"
                renderItem={(issue: any) => (
                  <IssueCard key={`${issue.repoId}-${issue.id}`} issue={issue} />
                )}
              />
            </TabsContent>

            <TabsContent value="participated">
              <ItemList
                items={issueParticipated}
                isLoading={issueParticipatedLoading}
                emptyMessage="No issues you've participated in"
                renderItem={(issue: any) => (
                  <IssueCard key={`${issue.repoId}-${issue.id}`} issue={issue} />
                )}
              />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}
