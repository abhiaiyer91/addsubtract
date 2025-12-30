/**
 * Leaderboard Page
 * 
 * Shows developer rankings by XP with timeframe filtering
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  Trophy, 
  Zap, 
  Flame, 
  Medal,
  Crown,
  TrendingUp,
  Calendar,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';
import { useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

function LeaderboardSkeleton() {
  return (
    <div className="container max-w-[900px] mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-10 w-48 sm:w-64" />
        <Skeleton className="h-5 w-full max-w-[24rem]" />
      </div>
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function getRankDisplay(rank: number) {
  if (rank === 1) {
    return (
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 shadow-lg">
        <Crown className="h-6 w-6 text-white" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 shadow-md">
        <Medal className="h-6 w-6 text-white" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-amber-500 to-amber-700 shadow-md">
        <Medal className="h-6 w-6 text-white" />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
      <span className="text-lg font-bold text-muted-foreground">{rank}</span>
    </div>
  );
}

function LeaderboardRow({ 
  user, 
  isCurrentUser 
}: { 
  user: any; 
  isCurrentUser: boolean;
}) {
  return (
    <Link
      to={`/${user.username}`}
      className={cn(
        'flex items-center gap-4 p-4 rounded-xl border transition-all hover:bg-accent/50',
        isCurrentUser && 'bg-primary/5 border-primary/20 ring-1 ring-primary/20',
        user.rank <= 3 && 'bg-gradient-to-r from-transparent to-yellow-500/5'
      )}
    >
      {/* Rank */}
      <div className="flex-shrink-0">
        {getRankDisplay(user.rank)}
      </div>

      {/* Avatar & Info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
          <AvatarImage src={user.avatarUrl || undefined} />
          <AvatarFallback>
            {(user.username || user.name || 'U').slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold truncate">
              {user.name || user.username}
            </span>
            {isCurrentUser && (
              <Badge variant="outline" className="text-xs">You</Badge>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>@{user.username}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Trophy className="h-3 w-3" />
              Level {user.level}
            </span>
          </div>
        </div>
      </div>

      {/* Title */}
      <div className="hidden md:block text-sm text-muted-foreground">
        {user.title}
      </div>

      {/* XP */}
      <div className="flex items-center gap-2 text-right">
        <div>
          <div className="flex items-center gap-1 font-bold text-lg">
            <Zap className="h-4 w-4 text-yellow-500" />
            {user.totalXp.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">XP</div>
        </div>
      </div>
    </Link>
  );
}

export function LeaderboardPage() {
  const [timeframe, setTimeframe] = useState<'all' | 'month' | 'week'>('all');
  const { data: session } = useSession();
  
  const { data: leaderboard, isLoading } = trpc.gamification.leaderboard.useQuery({ 
    timeframe, 
    limit: 50 
  });
  
  const { data: myProfile } = trpc.gamification.myProfile.useQuery(undefined, {
    enabled: !!session?.user,
  });

  if (isLoading) {
    return <LeaderboardSkeleton />;
  }

  // Check if current user is in top 50
  const isInTop50 = leaderboard?.some(u => u.userId === session?.user?.id);

  return (
    <div className="container max-w-[900px] mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 sm:gap-3">
          <Trophy className="h-6 w-6 sm:h-8 sm:w-8 text-yellow-500" />
          Developer Leaderboard
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Top developers ranked by XP earned through contributions
        </p>
      </div>

      {/* Timeframe Tabs */}
      <Tabs value={timeframe} onValueChange={(v) => setTimeframe(v as any)}>
        <TabsList>
          <TabsTrigger value="all" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            All Time
          </TabsTrigger>
          <TabsTrigger value="month" className="gap-2">
            <Calendar className="h-4 w-4" />
            This Month
          </TabsTrigger>
          <TabsTrigger value="week" className="gap-2">
            <Flame className="h-4 w-4" />
            This Week
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Current User Stats (if not in top 50) */}
      {session?.user && myProfile && !isInTop50 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-muted">
                <span className="text-lg font-bold text-muted-foreground">#{myProfile.rank}</span>
              </div>
              <div className="flex items-center gap-3 flex-1">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={session.user.image || undefined} />
                  <AvatarFallback>
                    {(session.user.name || 'U').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{session.user.name}</span>
                    <Badge variant="outline" className="text-xs">You</Badge>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Level {myProfile.level} • {myProfile.title}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 font-bold text-lg">
                <Zap className="h-4 w-4 text-yellow-500" />
                {myProfile.totalXp.toLocaleString()} XP
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Leaderboard List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Medal className="h-5 w-5" />
            {timeframe === 'all' ? 'All Time Rankings' : 
             timeframe === 'month' ? 'Monthly Rankings' : 
             'Weekly Rankings'}
          </CardTitle>
          <CardDescription>
            {timeframe === 'all' 
              ? 'Lifetime XP leaderboard'
              : timeframe === 'month'
              ? 'XP earned in the last 30 days'
              : 'XP earned in the last 7 days'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!leaderboard || leaderboard.length === 0 ? (
            <div className="text-center py-12">
              <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No rankings yet</h3>
              <p className="text-muted-foreground">
                Start contributing to earn XP and climb the leaderboard!
              </p>
              <Link to="/achievements" className="text-primary hover:underline mt-2 inline-block">
                View Achievements →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {leaderboard.map((user) => (
                <LeaderboardRow 
                  key={user.userId} 
                  user={user}
                  isCurrentUser={user.userId === session?.user?.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Call to Action */}
      <Card className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border-purple-500/20">
        <CardContent className="py-6 text-center">
          <h3 className="text-lg font-semibold mb-2">Ready to climb the ranks?</h3>
          <p className="text-muted-foreground mb-4">
            Earn XP by making commits, reviewing code, merging PRs, and more!
          </p>
          <Link 
            to="/achievements" 
            className="inline-flex items-center gap-2 text-primary hover:underline font-medium"
          >
            <Trophy className="h-4 w-4" />
            View All Achievements
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
