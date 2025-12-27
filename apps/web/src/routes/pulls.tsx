/**
 * Global Pull Requests Inbox
 * 
 * Graphite-style PR inbox showing:
 * - PRs awaiting your review
 * - Your open PRs
 * - PRs you've participated in
 */

import { Link } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
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
  Inbox
} from 'lucide-react';
import { useSession } from '../lib/auth-client';
import { formatRelativeTime } from '../lib/utils';

function PRCard({ pr }: { pr: any }) {
  const stateIcon = {
    open: <GitPullRequest className="h-4 w-4 text-green-500" />,
    closed: <XCircle className="h-4 w-4 text-red-500" />,
    merged: <GitMerge className="h-4 w-4 text-purple-500" />,
  }[pr.state] || <GitPullRequest className="h-4 w-4" />;

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
              {pr.authorUsername}
            </span>
            <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(pr.createdAt)}
            </span>
            {pr.commentCount > 0 && (
              <span className="flex items-center gap-1">
                <MessageSquare className="h-3 w-3" />
                {pr.commentCount}
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

function PRList({ prs, isLoading, emptyMessage }: { 
  prs: any[] | undefined; 
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

  if (!prs || prs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {prs.map((pr) => (
        <PRCard key={`${pr.repoId}-${pr.id}`} pr={pr} />
      ))}
    </div>
  );
}

export function PullsInboxPage() {
  const { data: session } = useSession();
  
  const { data: summary, isLoading: summaryLoading } = trpc.pulls.inboxSummary.useQuery(
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
  
  const { data: participated, isLoading: participatedLoading } = trpc.pulls.inboxParticipated.useQuery(
    { limit: 20 },
    { enabled: !!session?.user }
  );

  if (!session?.user) {
    return (
      <div className="container max-w-4xl py-8">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <GitPullRequest className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Sign in to view your inbox</h2>
            <p className="text-muted-foreground mb-4">
              Your PR inbox shows pull requests that need your attention.
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
          <h1 className="text-2xl font-bold">Pull Requests</h1>
          <p className="text-muted-foreground">
            Stay on top of code reviews and your open PRs
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Eye className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {summaryLoading ? '...' : summary?.awaitingReview || 0}
                </p>
                <p className="text-xs text-muted-foreground">To review</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <GitPullRequest className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {summaryLoading ? '...' : summary?.myOpenPrs || 0}
                </p>
                <p className="text-xs text-muted-foreground">Your PRs</p>
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

      {/* PR Tabs */}
      <Tabs defaultValue="review" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="review" className="gap-2">
            <Eye className="h-4 w-4" />
            To Review
            {summary?.awaitingReview ? (
              <Badge variant="secondary" className="ml-1">
                {summary.awaitingReview}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="mine" className="gap-2">
            <GitPullRequest className="h-4 w-4" />
            Your PRs
            {summary?.myOpenPrs ? (
              <Badge variant="secondary" className="ml-1">
                {summary.myOpenPrs}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="participated" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Participated
          </TabsTrigger>
        </TabsList>

        <TabsContent value="review" className="mt-6">
          <PRList 
            prs={awaitingReview} 
            isLoading={awaitingLoading}
            emptyMessage="No pull requests awaiting your review"
          />
        </TabsContent>

        <TabsContent value="mine" className="mt-6">
          <PRList 
            prs={myPrs} 
            isLoading={myPrsLoading}
            emptyMessage="You don't have any open pull requests"
          />
        </TabsContent>

        <TabsContent value="participated" className="mt-6">
          <PRList 
            prs={participated} 
            isLoading={participatedLoading}
            emptyMessage="No pull requests you've participated in"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
