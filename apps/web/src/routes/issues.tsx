/**
 * Global Issues Inbox
 * 
 * Shows issues across all repos:
 * - Assigned to you
 * - Created by you
 * - Issues you've participated in
 */

import { Link } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  CircleDot, 
  Clock, 
  CheckCircle2, 
  MessageSquare,
  User,
  Inbox,
  UserCheck,
  PenLine,
} from 'lucide-react';
import { useSession } from '../lib/auth-client';
import { formatRelativeTime } from '../lib/utils';

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

function IssueList({ issues, isLoading, emptyMessage }: { 
  issues: any[] | undefined; 
  isLoading: boolean;
  emptyMessage: string;
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

  if (!issues || issues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {issues.map((issue) => (
        <IssueCard key={`${issue.repoId}-${issue.id}`} issue={issue} />
      ))}
    </div>
  );
}

export function IssuesInboxPage() {
  const { data: session } = useSession();
  
  const { data: summary, isLoading: summaryLoading } = trpc.issues.inboxSummary.useQuery(
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
  
  const { data: participated, isLoading: participatedLoading } = trpc.issues.inboxParticipated.useQuery(
    { limit: 20 },
    { enabled: !!session?.user }
  );

  if (!session?.user) {
    return (
      <div className="container max-w-4xl py-8">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <CircleDot className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Sign in to view your issues</h2>
            <p className="text-muted-foreground mb-4">
              Your issue inbox shows issues that need your attention.
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

  return (
    <div className="container max-w-4xl py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Issues</h1>
          <p className="text-muted-foreground">
            Track issues assigned to you and issues you've created
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <UserCheck className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {summaryLoading ? '...' : summary?.assignedToMe || 0}
                </p>
                <p className="text-xs text-muted-foreground">Assigned to me</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <PenLine className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {summaryLoading ? '...' : summary?.createdByMe || 0}
                </p>
                <p className="text-xs text-muted-foreground">Created by me</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <MessageSquare className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {summaryLoading ? '...' : summary?.participated || 0}
                </p>
                <p className="text-xs text-muted-foreground">Participated</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Issue Tabs */}
      <Tabs defaultValue="assigned" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="assigned" className="gap-2">
            <UserCheck className="h-4 w-4" />
            Assigned
            {summary?.assignedToMe ? (
              <Badge variant="secondary" className="ml-1">
                {summary.assignedToMe}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="created" className="gap-2">
            <PenLine className="h-4 w-4" />
            Created
            {summary?.createdByMe ? (
              <Badge variant="secondary" className="ml-1">
                {summary.createdByMe}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="participated" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Participated
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assigned" className="mt-6">
          <IssueList 
            issues={assignedToMe} 
            isLoading={assignedLoading}
            emptyMessage="No issues assigned to you"
          />
        </TabsContent>

        <TabsContent value="created" className="mt-6">
          <IssueList 
            issues={createdByMe} 
            isLoading={createdLoading}
            emptyMessage="You haven't created any open issues"
          />
        </TabsContent>

        <TabsContent value="participated" className="mt-6">
          <IssueList 
            issues={participated} 
            isLoading={participatedLoading}
            emptyMessage="No issues you've participated in"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
