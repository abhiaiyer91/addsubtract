import { trpc } from '../lib/trpc';
import { formatNumber } from '../lib/utils';
import {
  Users,
  GitBranch,
  GitPullRequest,
  CircleDot,
  Building2,
  Play,
  CheckCircle,
  XCircle,
  Bot,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';

export function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = trpc.admin.getStats.useQuery();
  const { data: activity, isLoading: activityLoading } = trpc.admin.getDailyActivity.useQuery({ days: 30 });

  if (statsLoading || activityLoading) {
    return (
      <div className="animate-pulse space-y-8">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-32 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const statCards = [
    {
      name: 'Total Users',
      value: stats?.users.total ?? 0,
      change: stats?.users.newThisMonth ?? 0,
      changeLabel: 'new this month',
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      name: 'Active Users (30d)',
      value: stats?.users.active30Days ?? 0,
      subValue: `${Math.round((stats?.users.active30Days ?? 0) / (stats?.users.total || 1) * 100)}% of total`,
      icon: TrendingUp,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      name: 'Repositories',
      value: stats?.repos.total ?? 0,
      change: stats?.repos.newThisMonth ?? 0,
      changeLabel: 'new this month',
      icon: GitBranch,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      name: 'Pull Requests',
      value: stats?.prs.total ?? 0,
      subValue: `${stats?.prs.open ?? 0} open`,
      icon: GitPullRequest,
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-500/10',
    },
    {
      name: 'Issues',
      value: stats?.issues.total ?? 0,
      subValue: `${stats?.issues.open ?? 0} open`,
      icon: CircleDot,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
    {
      name: 'Organizations',
      value: stats?.orgs.total ?? 0,
      change: stats?.orgs.newThisMonth ?? 0,
      changeLabel: 'new this month',
      icon: Building2,
      color: 'text-pink-500',
      bgColor: 'bg-pink-500/10',
    },
    {
      name: 'Workflow Runs',
      value: stats?.workflows.totalRuns ?? 0,
      subValue: `${Math.round((stats?.workflows.successful ?? 0) / (stats?.workflows.totalRuns || 1) * 100)}% success rate`,
      icon: Play,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-500/10',
    },
    {
      name: 'AI Sessions',
      value: stats?.ai.totalSessions ?? 0,
      subValue: `${formatNumber(stats?.ai.totalTokens ?? 0)} tokens used`,
      icon: Bot,
      color: 'text-teal-500',
      bgColor: 'bg-teal-500/10',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">System overview and statistics</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => (
          <div
            key={stat.name}
            className="bg-card rounded-lg border p-6 hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              {stat.change !== undefined && stat.change > 0 && (
                <div className="flex items-center gap-1 text-sm text-green-500">
                  <TrendingUp className="h-4 w-4" />
                  +{stat.change}
                </div>
              )}
            </div>
            <div>
              <p className="text-2xl font-bold">{formatNumber(stat.value)}</p>
              <p className="text-sm text-muted-foreground">{stat.name}</p>
              {stat.subValue && (
                <p className="text-xs text-muted-foreground mt-1">{stat.subValue}</p>
              )}
              {stat.changeLabel && stat.change !== undefined && stat.change > 0 && (
                <p className="text-xs text-muted-foreground mt-1">{stat.changeLabel}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Growth Chart */}
        <div className="bg-card rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">User Signups (30 days)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activity ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => new Date(value).toLocaleDateString('en', { day: 'numeric' })}
                  className="text-xs"
                />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  labelFormatter={(value) => new Date(value).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                />
                <Area
                  type="monotone"
                  dataKey="users"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary) / 0.2)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Activity Chart */}
        <div className="bg-card rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">Daily Activity (30 days)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activity ?? []}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => new Date(value).toLocaleDateString('en', { day: 'numeric' })}
                  className="text-xs"
                />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  labelFormatter={(value) => new Date(value).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                />
                <Line type="monotone" dataKey="repos" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="prs" stroke="#06b6d4" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="issues" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span className="text-muted-foreground">Repos</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-cyan-500" />
              <span className="text-muted-foreground">PRs</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-muted-foreground">Issues</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Breakdown */}
        <div className="bg-card rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">User Breakdown</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Regular Users</span>
              <span className="font-medium">
                {formatNumber((stats?.users.total ?? 0) - (stats?.users.admins ?? 0) - (stats?.users.suspended ?? 0))}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Admins</span>
              <span className="font-medium text-primary">{stats?.users.admins ?? 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Suspended</span>
              <span className="font-medium text-destructive">{stats?.users.suspended ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Repo Breakdown */}
        <div className="bg-card rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">Repository Breakdown</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Public</span>
              <span className="font-medium">{formatNumber(stats?.repos.public ?? 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Private</span>
              <span className="font-medium">{formatNumber(stats?.repos.private ?? 0)}</span>
            </div>
          </div>
        </div>

        {/* Workflow Stats */}
        <div className="bg-card rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">CI/CD Status</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-muted-foreground">Successful</span>
              </div>
              <span className="font-medium text-green-500">
                {formatNumber(stats?.workflows.successful ?? 0)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" />
                <span className="text-muted-foreground">Failed</span>
              </div>
              <span className="font-medium text-destructive">
                {formatNumber(stats?.workflows.failed ?? 0)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
