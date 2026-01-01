import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  GitCommit,
  GitPullRequest,
  CircleDot,
  Users,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
  XCircle,
  Calendar,
  FileCode,
  Heart,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

// Period options
const PERIODS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '1y', label: 'Last year' },
  { value: 'all', label: 'All time' },
] as const;

type Period = (typeof PERIODS)[number]['value'];

// Health indicator colors
const HEALTH_COLORS = {
  excellent: 'text-green-500 bg-green-500/10',
  good: 'text-blue-500 bg-blue-500/10',
  needs_attention: 'text-yellow-500 bg-yellow-500/10',
  poor: 'text-red-500 bg-red-500/10',
  active: 'text-green-500 bg-green-500/10',
  stable: 'text-blue-500 bg-blue-500/10',
  slow: 'text-yellow-500 bg-yellow-500/10',
  dormant: 'text-gray-500 bg-gray-500/10',
  high: 'text-green-500 bg-green-500/10',
  medium: 'text-blue-500 bg-blue-500/10',
  low: 'text-gray-500 bg-gray-500/10',
};

// Commit frequency chart component
function CommitFrequencyChart({ data }: { data: Array<{ date: string; count: number }> }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const recentData = data.slice(-30); // Last 30 days

  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div className="flex items-end gap-[2px] h-32">
          {recentData.map((d, i) => {
            const height = (d.count / maxCount) * 100;
            return (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <div
                    className="flex-1 bg-primary rounded-t transition-all hover:bg-primary/80"
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">{new Date(d.date).toLocaleDateString()}</p>
                  <p className="text-muted-foreground">{d.count} commits</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{recentData[0]?.date ? new Date(recentData[0].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
          <span>Today</span>
        </div>
      </div>
    </TooltipProvider>
  );
}

// Contributor list component
function ContributorList({ contributors, limit = 5 }: { contributors: Array<{
  userId: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  commits: number;
  percentage: number;
}>; limit?: number }) {
  const displayContributors = contributors.slice(0, limit);

  return (
    <div className="space-y-3">
      {displayContributors.map((contributor, index) => (
        <div key={contributor.userId} className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm w-4">{index + 1}</span>
          <Avatar className="h-8 w-8">
            <AvatarImage src={contributor.avatarUrl || undefined} />
            <AvatarFallback>
              {(contributor.username || contributor.name || '?').slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{contributor.name || contributor.username}</p>
            <p className="text-xs text-muted-foreground">@{contributor.username}</p>
          </div>
          <div className="text-right">
            <p className="font-medium">{contributor.commits}</p>
            <p className="text-xs text-muted-foreground">{contributor.percentage.toFixed(1)}%</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// PR metrics component
function PRMetricsCard({ metrics }: { metrics: {
  total: number;
  open: number;
  merged: number;
  closed: number;
  avgTimeToMergeHours: number;
  avgTimeToFirstReviewHours: number;
  avgReviewsPerPR: number;
  mergeRate: number;
}}) {
  const formatDuration = (hours: number) => {
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="text-center p-4 bg-muted/50 rounded-lg">
        <p className="text-2xl font-bold">{metrics.total}</p>
        <p className="text-sm text-muted-foreground">Total PRs</p>
      </div>
      <div className="text-center p-4 bg-muted/50 rounded-lg">
        <p className="text-2xl font-bold text-green-500">{metrics.mergeRate.toFixed(0)}%</p>
        <p className="text-sm text-muted-foreground">Merge Rate</p>
      </div>
      <div className="text-center p-4 bg-muted/50 rounded-lg">
        <p className="text-2xl font-bold">{formatDuration(metrics.avgTimeToMergeHours)}</p>
        <p className="text-sm text-muted-foreground">Avg Time to Merge</p>
      </div>
      <div className="text-center p-4 bg-muted/50 rounded-lg">
        <p className="text-2xl font-bold">{formatDuration(metrics.avgTimeToFirstReviewHours)}</p>
        <p className="text-sm text-muted-foreground">Avg Time to Review</p>
      </div>
    </div>
  );
}

// Activity heatmap component
function ActivityHeatmap({ data }: { data: Array<{ hour: number; dayOfWeek: number; count: number }> }) {
  const maxCount = Math.max(...data.map(d => d.count), 1);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Build grid
  const grid: number[][] = Array(7).fill(null).map(() => Array(24).fill(0));
  for (const d of data) {
    grid[d.dayOfWeek][d.hour] = d.count;
  }

  return (
    <TooltipProvider>
      <div className="space-y-1">
        <div className="flex gap-1">
          <div className="w-8" />
          <div className="flex-1 flex justify-between text-xs text-muted-foreground">
            <span>12am</span>
            <span>6am</span>
            <span>12pm</span>
            <span>6pm</span>
            <span>12am</span>
          </div>
        </div>
        {grid.map((row, dayIndex) => (
          <div key={dayIndex} className="flex gap-[2px] items-center">
            <span className="w-8 text-xs text-muted-foreground">{dayNames[dayIndex]}</span>
            {row.map((count, hourIndex) => {
              const intensity = count / maxCount;
              const bgClass = count === 0
                ? 'bg-muted'
                : intensity < 0.25
                  ? 'bg-green-200 dark:bg-green-900'
                  : intensity < 0.5
                    ? 'bg-green-400 dark:bg-green-700'
                    : intensity < 0.75
                      ? 'bg-green-500 dark:bg-green-600'
                      : 'bg-green-600 dark:bg-green-500';
              return (
                <Tooltip key={hourIndex}>
                  <TooltipTrigger asChild>
                    <div className={cn('flex-1 aspect-square rounded-sm', bgClass)} />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-medium">{dayNames[dayIndex]} {hourIndex}:00</p>
                    <p className="text-muted-foreground">{count} activities</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </div>
    </TooltipProvider>
  );
}

// Health score component
function HealthScore({ health }: { health: {
  score: number;
  prResponseTime: string;
  issueResolution: string;
  releaseFrequency: string;
  communityEngagement: string;
}}) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-blue-500';
    if (score >= 40) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Attention';
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className={cn('text-5xl font-bold', getScoreColor(health.score))}>
          {health.score}
        </div>
        <p className="text-muted-foreground mt-1">{getScoreLabel(health.score)}</p>
        <Progress value={health.score} className="mt-4" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="text-sm">PR Response</span>
          </div>
          <Badge className={cn('mt-2', HEALTH_COLORS[health.prResponseTime as keyof typeof HEALTH_COLORS])}>
            {health.prResponseTime.replace('_', ' ')}
          </Badge>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2">
            <CircleDot className="h-4 w-4" />
            <span className="text-sm">Issue Resolution</span>
          </div>
          <Badge className={cn('mt-2', HEALTH_COLORS[health.issueResolution as keyof typeof HEALTH_COLORS])}>
            {health.issueResolution.replace('_', ' ')}
          </Badge>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="text-sm">Release Frequency</span>
          </div>
          <Badge className={cn('mt-2', HEALTH_COLORS[health.releaseFrequency as keyof typeof HEALTH_COLORS])}>
            {health.releaseFrequency}
          </Badge>
        </div>
        <div className="p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4" />
            <span className="text-sm">Community</span>
          </div>
          <Badge className={cn('mt-2', HEALTH_COLORS[health.communityEngagement as keyof typeof HEALTH_COLORS])}>
            {health.communityEngagement}
          </Badge>
        </div>
      </div>
    </div>
  );
}

// Loading skeleton
function StatsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}

// Main stats page
export function RepoStatsPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [period, setPeriod] = useState<Period>('30d');

  const { data: stats, isLoading, error } = trpc.stats.getRepoStats.useQuery(
    { owner: owner!, repo: repo!, period },
    { enabled: !!owner && !!repo }
  );

  if (isLoading) {
    return <StatsSkeleton />;
  }

  if (error) {
    return (
      <Card className="py-16">
        <CardContent className="text-center">
          <div className="p-6 rounded-full bg-destructive/10 w-fit mx-auto mb-6">
            <XCircle className="h-12 w-12 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Error Loading Statistics</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            {error.message}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card className="py-16">
        <CardContent className="text-center">
          <div className="p-6 rounded-full bg-muted w-fit mx-auto mb-6">
            <BarChart3 className="h-12 w-12 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No Statistics Available</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            This repository doesn't have enough activity to generate statistics yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6" />
            Repository Statistics
          </h1>
          <p className="text-muted-foreground">
            Insights and analytics for {owner}/{repo}
          </p>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Commits</CardTitle>
            <GitCommit className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.summary.totalCommits.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              by {stats.summary.totalContributors} contributors
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pull Requests</CardTitle>
            <GitPullRequest className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.summary.totalPRs.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {stats.prMetrics.mergeRate.toFixed(0)}% merge rate
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Issues</CardTitle>
            <CircleDot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.summary.totalIssues.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {stats.issueMetrics.open} open, {stats.issueMetrics.closed} closed
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Health Score</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.health.score}/100</div>
            <Progress value={stats.health.score} className="h-2 mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contributors">Contributors</TabsTrigger>
          <TabsTrigger value="prs">Pull Requests</TabsTrigger>
          <TabsTrigger value="issues">Issues</TabsTrigger>
          {stats.ciStats && <TabsTrigger value="ci">CI/CD</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Commit Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Commit Activity</CardTitle>
                <CardDescription>Commits over the last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                <CommitFrequencyChart data={stats.commitFrequency} />
              </CardContent>
            </Card>

            {/* Health Score */}
            <Card>
              <CardHeader>
                <CardTitle>Repository Health</CardTitle>
                <CardDescription>Overall health indicators</CardDescription>
              </CardHeader>
              <CardContent>
                <HealthScore health={stats.health} />
              </CardContent>
            </Card>
          </div>

          {/* Activity Heatmap */}
          <Card>
            <CardHeader>
              <CardTitle>Activity Heatmap</CardTitle>
              <CardDescription>Activity by day and hour</CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityHeatmap data={stats.hourlyActivityHeatmap} />
            </CardContent>
          </Card>

          {/* Peak Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Peak Activity</CardTitle>
              <CardDescription>When this repository is most active</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">Peak Hour</p>
                  <p className="text-2xl font-bold">{stats.peakHour}:00</p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">Peak Day</p>
                  <p className="text-2xl font-bold">{stats.peakDayOfWeek}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contributors" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Top Contributors</CardTitle>
              <CardDescription>Most active contributors in this period</CardDescription>
            </CardHeader>
            <CardContent>
              <ContributorList contributors={stats.contributors} limit={20} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prs" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Pull Request Metrics</CardTitle>
              <CardDescription>PR performance and statistics</CardDescription>
            </CardHeader>
            <CardContent>
              <PRMetricsCard metrics={stats.prMetrics} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>PR Size Distribution</CardTitle>
              <CardDescription>Distribution of PRs by size</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <span className="w-24 text-sm">Small (&lt;100)</span>
                  <Progress value={(stats.prMetrics.prsBySize.small / stats.prMetrics.total) * 100} className="flex-1" />
                  <span className="w-12 text-sm text-right">{stats.prMetrics.prsBySize.small}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="w-24 text-sm">Medium</span>
                  <Progress value={(stats.prMetrics.prsBySize.medium / stats.prMetrics.total) * 100} className="flex-1" />
                  <span className="w-12 text-sm text-right">{stats.prMetrics.prsBySize.medium}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="w-24 text-sm">Large (&gt;500)</span>
                  <Progress value={(stats.prMetrics.prsBySize.large / stats.prMetrics.total) * 100} className="flex-1" />
                  <span className="w-12 text-sm text-right">{stats.prMetrics.prsBySize.large}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="issues" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Issue Metrics</CardTitle>
              <CardDescription>Issue tracking and resolution stats</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold">{stats.issueMetrics.total}</p>
                  <p className="text-sm text-muted-foreground">Total Issues</p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-500">{stats.issueMetrics.open}</p>
                  <p className="text-sm text-muted-foreground">Open</p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold text-green-500">{stats.issueMetrics.closed}</p>
                  <p className="text-sm text-muted-foreground">Closed</p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold">{(stats.issueMetrics.avgTimeToCloseHours / 24).toFixed(1)}d</p>
                  <p className="text-sm text-muted-foreground">Avg Time to Close</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {stats.issueMetrics.priorityDistribution.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Priority Distribution</CardTitle>
                <CardDescription>Issues by priority level</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats.issueMetrics.priorityDistribution.map((p) => (
                    <div key={p.priority} className="flex items-center gap-4">
                      <span className="w-24 text-sm capitalize">{p.priority}</span>
                      <Progress value={p.percentage} className="flex-1" />
                      <span className="w-12 text-sm text-right">{p.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {stats.ciStats && (
          <TabsContent value="ci" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>CI/CD Statistics</CardTitle>
                <CardDescription>Workflow runs and success rates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold">{stats.ciStats.totalRuns}</p>
                    <p className="text-sm text-muted-foreground">Total Runs</p>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-center gap-1">
                      <p className="text-2xl font-bold">{stats.ciStats.successRate.toFixed(0)}%</p>
                      {stats.ciStats.successRate >= 80 ? (
                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-500" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">Success Rate</p>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold">{stats.ciStats.avgDurationMinutes.toFixed(1)}m</p>
                    <p className="text-sm text-muted-foreground">Avg Duration</p>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-2xl font-bold text-red-500">
                      {stats.ciStats.runsByStatus?.failure || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Failed Runs</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
