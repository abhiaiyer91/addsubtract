import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code2,
  Flame,
  GitCommit,
  GitPullRequest,
  MessageSquare,
  Moon,
  Star,
  Sun,
  Sunrise,
  Target,
  TrendingUp,
  Users,
  Zap,
  Bot,
  CheckCircle2,
  XCircle,
  Coffee,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

// Personality type configurations
const PERSONALITY_CONFIG: Record<string, { icon: React.ReactNode; color: string; description: string }> = {
  'Night Owl': {
    icon: <Moon className="h-6 w-6" />,
    color: 'text-indigo-500 bg-indigo-500/10',
    description: 'You do your best work when the world is asleep',
  },
  'Early Bird': {
    icon: <Sunrise className="h-6 w-6" />,
    color: 'text-orange-500 bg-orange-500/10',
    description: 'First commits before first coffee',
  },
  'Weekend Warrior': {
    icon: <Zap className="h-6 w-6" />,
    color: 'text-purple-500 bg-purple-500/10',
    description: 'Weekends are for shipping features',
  },
  'Nine-to-Fiver': {
    icon: <Sun className="h-6 w-6" />,
    color: 'text-yellow-500 bg-yellow-500/10',
    description: 'Consistent and steady wins the race',
  },
  'Code Ninja': {
    icon: <Target className="h-6 w-6" />,
    color: 'text-red-500 bg-red-500/10',
    description: 'Strike fast, ship faster',
  },
  'Steady Coder': {
    icon: <TrendingUp className="h-6 w-6" />,
    color: 'text-green-500 bg-green-500/10',
    description: 'Consistent effort, consistent results',
  },
  'Ghost Developer': {
    icon: <Coffee className="h-6 w-6" />,
    color: 'text-gray-500 bg-gray-500/10',
    description: 'Taking a well-deserved break',
  },
};

// Month names for display
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Activity heatmap component
function ActivityHeatmap({ dailyActivity }: { dailyActivity: Array<{ date: string; total: number }> }) {
  const maxActivity = Math.max(...dailyActivity.map(d => d.total), 1);
  
  // Group by week for display
  const weeks: Array<typeof dailyActivity> = [];
  let currentWeek: typeof dailyActivity = [];
  
  dailyActivity.forEach((day, index) => {
    const dayOfWeek = new Date(day.date).getDay();
    if (index === 0) {
      // Fill in empty days at the start
      for (let i = 0; i < dayOfWeek; i++) {
        currentWeek.push({ date: '', total: -1 });
      }
    }
    currentWeek.push(day);
    if (dayOfWeek === 6 || index === dailyActivity.length - 1) {
      // Fill in empty days at the end
      while (currentWeek.length < 7) {
        currentWeek.push({ date: '', total: -1 });
      }
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });
  
  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div className="flex gap-1 text-xs text-muted-foreground mb-2">
          <span className="w-4" />
          <span className="flex-1 text-center">Sun</span>
          <span className="flex-1 text-center">Mon</span>
          <span className="flex-1 text-center">Tue</span>
          <span className="flex-1 text-center">Wed</span>
          <span className="flex-1 text-center">Thu</span>
          <span className="flex-1 text-center">Fri</span>
          <span className="flex-1 text-center">Sat</span>
        </div>
        <div className="space-y-1">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex gap-1">
              <span className="w-4 text-xs text-muted-foreground flex items-center">
                {weekIndex === 0 ? '1' : weekIndex === weeks.length - 1 ? weeks.length : ''}
              </span>
              {week.map((day, dayIndex) => {
                if (day.total < 0) {
                  return <div key={dayIndex} className="flex-1 aspect-square rounded-sm bg-transparent" />;
                }
                const intensity = day.total / maxActivity;
                const bgClass = day.total === 0
                  ? 'bg-muted'
                  : intensity < 0.25
                    ? 'bg-green-200 dark:bg-green-900'
                    : intensity < 0.5
                      ? 'bg-green-400 dark:bg-green-700'
                      : intensity < 0.75
                        ? 'bg-green-500 dark:bg-green-600'
                        : 'bg-green-600 dark:bg-green-500';
                
                return (
                  <Tooltip key={dayIndex}>
                    <TooltipTrigger asChild>
                      <div
                        className={cn(
                          'flex-1 aspect-square rounded-sm cursor-default transition-transform hover:scale-110',
                          bgClass
                        )}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                      <p className="text-muted-foreground">{day.total} activities</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 justify-end mt-2">
          <span className="text-xs text-muted-foreground">Less</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-sm bg-muted" />
            <div className="w-3 h-3 rounded-sm bg-green-200 dark:bg-green-900" />
            <div className="w-3 h-3 rounded-sm bg-green-400 dark:bg-green-700" />
            <div className="w-3 h-3 rounded-sm bg-green-500 dark:bg-green-600" />
            <div className="w-3 h-3 rounded-sm bg-green-600 dark:bg-green-500" />
          </div>
          <span className="text-xs text-muted-foreground">More</span>
        </div>
      </div>
    </TooltipProvider>
  );
}

// Hourly distribution chart
function HourlyChart({ hourlyDistribution }: { hourlyDistribution: Array<{ hour: number; count: number }> }) {
  const maxCount = Math.max(...hourlyDistribution.map(h => h.count), 1);
  
  return (
    <TooltipProvider>
      <div className="space-y-2">
        <div className="flex items-end gap-1 h-32">
          {hourlyDistribution.map((h) => {
            const height = (h.count / maxCount) * 100;
            return (
              <Tooltip key={h.hour}>
                <TooltipTrigger asChild>
                  <div className="flex-1 flex flex-col justify-end">
                    <div
                      className={cn(
                        'w-full rounded-t transition-all hover:opacity-80',
                        h.hour >= 22 || h.hour < 6
                          ? 'bg-indigo-500'
                          : h.hour >= 6 && h.hour < 12
                            ? 'bg-orange-500'
                            : h.hour >= 12 && h.hour < 18
                              ? 'bg-yellow-500'
                              : 'bg-purple-500'
                      )}
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">{h.hour === 0 ? '12 AM' : h.hour === 12 ? '12 PM' : h.hour < 12 ? `${h.hour} AM` : `${h.hour - 12} PM`}</p>
                  <p className="text-muted-foreground">{h.count} activities</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>12AM</span>
          <span>6AM</span>
          <span>12PM</span>
          <span>6PM</span>
          <span>12AM</span>
        </div>
        <div className="flex items-center gap-4 justify-center text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-indigo-500" />
            <span>Night</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-orange-500" />
            <span>Morning</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-yellow-500" />
            <span>Afternoon</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-purple-500" />
            <span>Evening</span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

// Day of week chart
function DayOfWeekChart({ dayOfWeekDistribution }: { dayOfWeekDistribution: Array<{ dayOfWeek: number; dayName: string; count: number }> }) {
  const maxCount = Math.max(...dayOfWeekDistribution.map(d => d.count), 1);
  
  return (
    <div className="space-y-3">
      {dayOfWeekDistribution.map((d) => {
        const percentage = (d.count / maxCount) * 100;
        const isWeekend = d.dayOfWeek === 0 || d.dayOfWeek === 6;
        return (
          <div key={d.dayOfWeek} className="flex items-center gap-3">
            <span className={cn('w-12 text-sm', isWeekend && 'text-purple-500 font-medium')}>
              {d.dayName.slice(0, 3)}
            </span>
            <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
              <div
                className={cn(
                  'h-full rounded transition-all',
                  isWeekend ? 'bg-purple-500' : 'bg-primary'
                )}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="w-12 text-sm text-muted-foreground text-right">{d.count}</span>
          </div>
        );
      })}
    </div>
  );
}

// Stat card component
function StatCard({
  icon,
  label,
  value,
  subValue,
  trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  trend?: 'up' | 'down' | 'stable';
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          {trend && (
            <Badge
              variant="secondary"
              className={cn(
                trend === 'up' && 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                trend === 'down' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
                trend === 'stable' && 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
              )}
            >
              {trend === 'up' ? '+' : trend === 'down' ? '-' : '~'}
            </Badge>
          )}
        </div>
        <div className="mt-4">
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
          {subValue && <p className="text-xs text-muted-foreground mt-1">{subValue}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// Loading skeleton
function WrappedSkeleton() {
  return (
    <div className="container max-w-[1200px] mx-auto py-8 space-y-8">
      <div className="space-y-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-96" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-lg" />
    </div>
  );
}

export function WrappedPage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = useSession();
  const currentUser = session?.user;
  
  // Determine if viewing own wrapped or another user's
  const isOwnWrapped = currentUser?.username === username;
  
  // Get current date for default selection
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  
  // Fetch user info for the username
  const { data: profileUser, isLoading: userLoading } = trpc.users.getByUsername.useQuery(
    { username: username! },
    { enabled: !!username }
  );
  
  // Fetch available periods - use different endpoints for own vs other user
  const { data: periods, isLoading: periodsLoading } = trpc.wrapped.availablePeriods.useQuery(
    undefined,
    { enabled: isOwnWrapped && !!currentUser }
  );
  
  const { data: otherUserPeriods, isLoading: otherPeriodsLoading } = trpc.wrapped.periodsForUser.useQuery(
    { userId: profileUser?.id || '' },
    { enabled: !isOwnWrapped && !!profileUser?.id }
  );
  
  const availablePeriods = isOwnWrapped ? periods : otherUserPeriods;
  
  // Fetch wrapped data for selected period - use different endpoints for own vs other user
  const { data: wrapped, isLoading: wrappedLoading } = trpc.wrapped.forMonth.useQuery(
    { year: selectedYear, month: selectedMonth },
    { enabled: isOwnWrapped && !!currentUser }
  );
  
  const { data: otherUserWrapped, isLoading: otherWrappedLoading } = trpc.wrapped.forUser.useQuery(
    { userId: profileUser?.id || '', year: selectedYear, month: selectedMonth },
    { enabled: !isOwnWrapped && !!profileUser?.id }
  );
  
  const wrappedData = isOwnWrapped ? wrapped : otherUserWrapped;
  
  // Navigate to previous/next month
  const goToPreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };
  
  const goToNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };
  
  // Check if we can navigate
  const canGoNext = selectedYear < now.getFullYear() || 
    (selectedYear === now.getFullYear() && selectedMonth < now.getMonth() + 1);
  
  const isLoading = sessionPending || userLoading || 
    (isOwnWrapped ? (wrappedLoading || periodsLoading) : (otherWrappedLoading || otherPeriodsLoading));
  
  if (isLoading) {
    return <WrappedSkeleton />;
  }
  
  // User not found
  if (!profileUser) {
    return (
      <div className="container max-w-[800px] mx-auto py-16 text-center">
        <div className="p-6 rounded-full bg-muted w-fit mx-auto mb-6">
          <Flame className="h-12 w-12 text-muted-foreground" />
        </div>
        <h1 className="text-3xl font-bold mb-4">User Not Found</h1>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          The user @{username} doesn't exist or their profile is private.
        </p>
        <Link to="/">
          <Button size="lg">Go Home</Button>
        </Link>
      </div>
    );
  }
  
  // Determine display name
  const displayName = isOwnWrapped ? 'Your' : `${profileUser.name || profileUser.username}'s`;
  
  const personalityConfig = wrappedData?.funStats?.personalityType
    ? PERSONALITY_CONFIG[wrappedData.funStats.personalityType] || PERSONALITY_CONFIG['Steady Coder']
    : PERSONALITY_CONFIG['Ghost Developer'];
  
  return (
    <div className="container max-w-[1200px] mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          {!isOwnWrapped && (
            <Avatar className="h-12 w-12">
              <AvatarImage src={profileUser.avatarUrl || undefined} />
              <AvatarFallback>
                {(profileUser.username || profileUser.name || '?').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Flame className="h-8 w-8 text-orange-500" />
              {displayName} Wrapped
            </h1>
            <p className="text-muted-foreground mt-1">
              {isOwnWrapped ? 'Your' : `@${profileUser.username}'s`} monthly coding activity summary
            </p>
          </div>
        </div>
        
        {/* Period selector */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={goToPreviousMonth}
            disabled={!availablePeriods?.length}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <Select
            value={`${selectedYear}-${selectedMonth}`}
            onValueChange={(value) => {
              const [year, month] = value.split('-').map(Number);
              setSelectedYear(year);
              setSelectedMonth(month);
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue>
                {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {availablePeriods?.map((p) => (
                <SelectItem key={`${p.year}-${p.month}`} value={`${p.year}-${p.month}`}>
                  {MONTH_NAMES[p.month - 1]} {p.year}
                </SelectItem>
              ))}
              {(!availablePeriods || availablePeriods.length === 0) && (
                <SelectItem value={`${selectedYear}-${selectedMonth}`}>
                  {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          
          <Button
            variant="outline"
            size="icon"
            onClick={goToNextMonth}
            disabled={!canGoNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {!wrappedData ? (
        <Card className="py-16">
          <CardContent className="text-center">
            <div className="p-6 rounded-full bg-muted w-fit mx-auto mb-6">
              <Calendar className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No activity this month</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              {isOwnWrapped ? "We don't have enough activity data" : `@${profileUser.username} doesn't have activity data`} for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}.
              {isOwnWrapped && " Try selecting a different month or start coding to build your wrapped!"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Personality Card */}
          <Card className="overflow-hidden">
            <div className={cn('p-6', personalityConfig.color)}>
              <div className="flex items-center gap-4">
                <div className="p-4 rounded-full bg-background/50">
                  {personalityConfig.icon}
                </div>
                <div>
                  <p className="text-sm font-medium opacity-80">{isOwnWrapped ? 'Your' : 'Their'} Coding Personality</p>
                  <h2 className="text-2xl font-bold">{wrappedData.funStats?.personalityType || 'Steady Coder'}</h2>
                  <p className="text-sm opacity-80 mt-1">{personalityConfig.description}</p>
                </div>
              </div>
            </div>
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold">{wrappedData.funStats?.mostActiveHourLabel || '—'}</p>
                  <p className="text-sm text-muted-foreground">Peak Hour</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{wrappedData.funStats?.mostActiveDay || '—'}</p>
                  <p className="text-sm text-muted-foreground">Peak Day</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{wrappedData.funStats?.lateNightCommits || 0}</p>
                  <p className="text-sm text-muted-foreground">Late Night Commits</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{wrappedData.funStats?.weekendWarriorCommits || 0}</p>
                  <p className="text-sm text-muted-foreground">Weekend Commits</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Core Stats */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<GitCommit className="h-5 w-5" />}
              label="Commits"
              value={wrappedData.totalCommits}
              subValue={`${wrappedData.avgCommitsPerActiveDay} per active day`}
            />
            <StatCard
              icon={<GitPullRequest className="h-5 w-5" />}
              label="Pull Requests"
              value={wrappedData.totalPrsOpened}
              subValue={`${wrappedData.totalPrsMerged} merged`}
            />
            <StatCard
              icon={<Code2 className="h-5 w-5" />}
              label="Reviews"
              value={wrappedData.totalReviews}
              subValue={`${wrappedData.totalReviewsApproved} approved`}
            />
            <StatCard
              icon={<Flame className="h-5 w-5" />}
              label="Active Days"
              value={wrappedData.totalActiveDays}
              subValue={`${wrappedData.streaks?.longestStreak || 0} day streak`}
            />
          </div>
          
          {/* Activity Tabs */}
          <Tabs defaultValue="heatmap" className="w-full">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="heatmap">Activity Heatmap</TabsTrigger>
              <TabsTrigger value="hourly">Hourly Distribution</TabsTrigger>
              <TabsTrigger value="weekly">Weekly Pattern</TabsTrigger>
            </TabsList>
            
            <TabsContent value="heatmap" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Activity Heatmap</CardTitle>
                  <CardDescription>
                    Your daily activity throughout {MONTH_NAMES[selectedMonth - 1]}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {wrappedData.dailyActivity && (
                    <ActivityHeatmap dailyActivity={wrappedData.dailyActivity} />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="hourly" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Hourly Activity</CardTitle>
                  <CardDescription>
                    When you're most active during the day
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {wrappedData.hourlyDistribution && (
                    <HourlyChart hourlyDistribution={wrappedData.hourlyDistribution} />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="weekly" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Weekly Pattern</CardTitle>
                  <CardDescription>
                    Your activity distribution across days of the week
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {wrappedData.dayOfWeekDistribution && (
                    <DayOfWeekChart dayOfWeekDistribution={wrappedData.dayOfWeekDistribution} />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          
          {/* Additional Stats Row */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* More Activity Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Collaboration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Issues Opened</span>
                  <span className="font-medium">{wrappedData.totalIssuesOpened}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Issues Closed</span>
                  <span className="font-medium">{wrappedData.totalIssuesClosed}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Comments</span>
                  <span className="font-medium">{wrappedData.totalComments}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Stars Given</span>
                  <span className="font-medium flex items-center gap-1">
                    <Star className="h-4 w-4 text-yellow-500" />
                    {wrappedData.totalStarsGiven}
                  </span>
                </div>
              </CardContent>
            </Card>
            
            {/* Streak Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Flame className="h-5 w-5 text-orange-500" />
                  Streaks
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-muted-foreground">Current Streak</span>
                    <span className="font-bold text-lg">{wrappedData.streaks?.currentStreak || 0} days</span>
                  </div>
                  <Progress value={Math.min((wrappedData.streaks?.currentStreak || 0) / 30 * 100, 100)} />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-muted-foreground">Longest Streak</span>
                    <span className="font-bold text-lg">{wrappedData.streaks?.longestStreak || 0} days</span>
                  </div>
                  {wrappedData.streaks?.longestStreakStart && wrappedData.streaks?.longestStreakEnd && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(wrappedData.streaks.longestStreakStart).toLocaleDateString()} - {new Date(wrappedData.streaks.longestStreakEnd).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
            
            {/* Top Repositories */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code2 className="h-5 w-5" />
                  Top Repositories
                </CardTitle>
              </CardHeader>
              <CardContent>
                {wrappedData.topRepositories && wrappedData.topRepositories.length > 0 ? (
                  <div className="space-y-3">
                    {wrappedData.topRepositories.slice(0, 5).map((repo, index) => (
                      <div key={repo.repoId} className="flex items-center gap-3">
                        <span className="text-muted-foreground text-sm w-4">{index + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{repo.repoName}</p>
                          <p className="text-xs text-muted-foreground">{repo.ownerName}</p>
                        </div>
                        <Badge variant="secondary">{repo.activityCount}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-4">No repository activity</p>
                )}
              </CardContent>
            </Card>
          </div>
          
          {/* AI & CI Stats (if available) */}
          {(wrappedData.aiUsage || wrappedData.ciStats) && (
            <div className="grid gap-4 md:grid-cols-2">
              {/* AI Usage */}
              {wrappedData.aiUsage && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bot className="h-5 w-5" />
                      AI Usage
                    </CardTitle>
                    <CardDescription>{isOwnWrapped ? 'Your' : 'Their'} AI agent activity this month</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold">{wrappedData.aiUsage.agentSessions}</p>
                        <p className="text-sm text-muted-foreground">Sessions</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{wrappedData.aiUsage.totalMessages}</p>
                        <p className="text-sm text-muted-foreground">Messages</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{(wrappedData.aiUsage.totalTokens / 1000).toFixed(1)}k</p>
                        <p className="text-sm text-muted-foreground">Tokens</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* CI Stats */}
              {wrappedData.ciStats && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      CI/CD Stats
                    </CardTitle>
                    <CardDescription>{isOwnWrapped ? 'Your' : 'Their'} workflow runs this month</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center">
                        <p className="text-2xl font-bold">{wrappedData.ciStats.totalRuns}</p>
                        <p className="text-sm text-muted-foreground">Total Runs</p>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <p className="text-2xl font-bold">{wrappedData.ciStats.successRate.toFixed(0)}%</p>
                          {wrappedData.ciStats.successRate >= 80 ? (
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">Success Rate</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold">{wrappedData.ciStats.failedRuns}</p>
                        <p className="text-sm text-muted-foreground">Failed Runs</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold">{wrappedData.ciStats.avgDurationMinutes}m</p>
                        <p className="text-sm text-muted-foreground">Avg Duration</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
          
          {/* Top Collaborators (if available) */}
          {wrappedData.topCollaborators && wrappedData.topCollaborators.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Top Collaborators
                </CardTitle>
                <CardDescription>People {isOwnWrapped ? 'you' : 'they'} worked with most this month</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {wrappedData.topCollaborators.slice(0, 6).map((collaborator) => (
                    <div key={collaborator.userId} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Avatar>
                        <AvatarImage src={collaborator.avatarUrl || undefined} />
                        <AvatarFallback>
                          {(collaborator.username || collaborator.name || '?').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{collaborator.name || collaborator.username}</p>
                        <p className="text-xs text-muted-foreground">@{collaborator.username}</p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-medium">{collaborator.interactions}</p>
                        <p className="text-muted-foreground text-xs">interactions</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
