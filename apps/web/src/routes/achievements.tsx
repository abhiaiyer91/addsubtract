/**
 * Achievements Page
 * 
 * Shows user's achievements, XP progress, and level
 */

import { Link, useParams } from 'react-router-dom';
import { 
  Trophy, 
  Zap, 
  Flame, 
  Target, 
  Lock,
  CheckCircle2,
  TrendingUp,
  Award,
  Star,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { trpc } from '@/lib/trpc';
import { useSession } from '@/lib/auth-client';
import { cn, formatRelativeTime } from '@/lib/utils';

// Rarity colors
const RARITY_COLORS: Record<string, string> = {
  common: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  uncommon: 'bg-green-500/10 text-green-500 border-green-500/20',
  rare: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  epic: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  legendary: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
};

const RARITY_LABELS: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  commits: <Zap className="h-4 w-4" />,
  pull_requests: <Target className="h-4 w-4" />,
  reviews: <CheckCircle2 className="h-4 w-4" />,
  issues: <Target className="h-4 w-4" />,
  collaboration: <Star className="h-4 w-4" />,
  streaks: <Flame className="h-4 w-4" />,
  milestones: <TrendingUp className="h-4 w-4" />,
  special: <Award className="h-4 w-4" />,
};

const CATEGORY_LABELS: Record<string, string> = {
  commits: 'Commits',
  pull_requests: 'Pull Requests',
  reviews: 'Reviews',
  issues: 'Issues',
  collaboration: 'Collaboration',
  streaks: 'Streaks',
  milestones: 'Milestones',
  special: 'Special',
};

function AchievementCard({ 
  achievement, 
  unlocked, 
  unlockedAt 
}: { 
  achievement: any; 
  unlocked: boolean; 
  unlockedAt?: Date;
}) {
  const isSecret = achievement.isSecret && !unlocked;
  
  return (
    <div className={cn(
      'relative p-4 rounded-lg border transition-all',
      unlocked 
        ? 'bg-card hover:bg-accent/50' 
        : 'bg-muted/30 opacity-60',
      isSecret && 'opacity-40'
    )}>
      {/* Icon */}
      <div className="flex items-start gap-3">
        <div className={cn(
          'text-3xl flex-shrink-0',
          !unlocked && 'grayscale'
        )}>
          {isSecret ? <Lock className="h-8 w-8 text-muted-foreground" /> : achievement.icon}
        </div>
        
        <div className="flex-1 min-w-0">
          {/* Name */}
          <div className="flex items-center gap-2">
            <h3 className={cn(
              'font-semibold truncate',
              !unlocked && 'text-muted-foreground'
            )}>
              {isSecret ? '???' : achievement.name}
            </h3>
            {unlocked && (
              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
            )}
          </div>
          
          {/* Description */}
          <p className="text-sm text-muted-foreground mt-0.5">
            {isSecret ? 'Secret achievement - unlock to reveal' : achievement.description}
          </p>
          
          {/* Meta */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge 
              variant="outline" 
              className={cn('text-xs', RARITY_COLORS[achievement.rarity])}
            >
              {RARITY_LABELS[achievement.rarity]}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              <Zap className="h-3 w-3 mr-1" />
              +{achievement.xpReward} XP
            </Badge>
            {unlockedAt && (
              <span className="text-xs text-muted-foreground">
                Unlocked {formatRelativeTime(unlockedAt)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LevelProgress({ 
  level, 
  xp, 
  xpProgress, 
  title 
}: { 
  level: number; 
  xp: number; 
  xpProgress: number;
  title: string;
}) {
  return (
    <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          {/* Level Badge */}
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center border-4 border-primary">
              <span className="text-2xl font-bold text-primary">{level}</span>
            </div>
            <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-1">
              <Trophy className="h-4 w-4" />
            </div>
          </div>
          
          {/* Info */}
          <div className="flex-1">
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="text-sm text-muted-foreground">Level {level}</p>
            
            {/* XP Progress */}
            <div className="mt-3">
              <div className="flex justify-between text-sm mb-1">
                <span>{xp.toLocaleString()} XP</span>
                <span className="text-muted-foreground">{Math.round(xpProgress)}% to next level</span>
              </div>
              <Progress value={xpProgress} className="h-2" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatsGrid({ stats, streak }: { stats: any; streak: { current: number; longest: number } }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Card>
        <CardContent className="p-4 text-center">
          <Flame className="h-5 w-5 mx-auto text-orange-500 mb-1" />
          <p className="text-2xl font-bold">{streak.current}</p>
          <p className="text-xs text-muted-foreground">Day Streak</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <Zap className="h-5 w-5 mx-auto text-yellow-500 mb-1" />
          <p className="text-2xl font-bold">{stats.commits}</p>
          <p className="text-xs text-muted-foreground">Commits</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <Target className="h-5 w-5 mx-auto text-green-500 mb-1" />
          <p className="text-2xl font-bold">{stats.prsMerged}</p>
          <p className="text-xs text-muted-foreground">PRs Merged</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4 text-center">
          <CheckCircle2 className="h-5 w-5 mx-auto text-blue-500 mb-1" />
          <p className="text-2xl font-bold">{stats.reviews}</p>
          <p className="text-xs text-muted-foreground">Reviews</p>
        </CardContent>
      </Card>
    </div>
  );
}

export function AchievementsPage() {
  const { username } = useParams<{ username?: string }>();
  const { data: session } = useSession();
  
  const isOwnProfile = !username || session?.user?.username === username;
  const targetUsername = username || session?.user?.username;
  
  // Use different queries based on whether it's own profile
  const { data: profile, isLoading: profileLoading } = isOwnProfile
    ? trpc.gamification.myProfile.useQuery()
    : trpc.gamification.getProfile.useQuery(
        { username: targetUsername! },
        { enabled: !!targetUsername }
      );
  
  const { data: achievements, isLoading: achievementsLoading } = isOwnProfile
    ? trpc.gamification.myAchievements.useQuery()
    : trpc.gamification.getAchievements.useQuery(
        { username: targetUsername! },
        { enabled: !!targetUsername }
      );

  const { data: categories } = trpc.gamification.achievementCategories.useQuery(
    undefined,
    { enabled: isOwnProfile }
  );

  if (profileLoading || achievementsLoading) {
    return (
      <div className="container max-w-4xl mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container max-w-4xl mx-auto px-4 py-8 text-center">
        <h2 className="text-2xl font-bold mb-2">Profile not found</h2>
        <p className="text-muted-foreground">
          {username ? `User @${username} not found` : 'Please log in to view your achievements'}
        </p>
      </div>
    );
  }

  // Group achievements by category
  const achievementsByCategory = achievements?.reduce((acc, a) => {
    const cat = a.achievement.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(a);
    return acc;
  }, {} as Record<string, typeof achievements>) || {};

  const unlockedCount = achievements?.filter(a => a.unlocked).length || 0;
  const totalCount = achievements?.length || 0;

  return (
    <div className="container max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Trophy className="h-8 w-8 text-yellow-500" />
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">
            {isOwnProfile ? 'Your Achievements' : `${profile.username || profile.name}'s Achievements`}
          </h1>
          <p className="text-muted-foreground">
            {unlockedCount} of {totalCount} achievements unlocked
          </p>
        </div>
      </div>

      {/* Level Progress */}
      <LevelProgress 
        level={profile.level}
        xp={profile.totalXp}
        xpProgress={profile.xpProgress}
        title={profile.title}
      />

      {/* Stats */}
      <StatsGrid 
        stats={'stats' in profile ? profile.stats : {
          commits: 0,
          prsMerged: 0,
          reviews: 0,
        }}
        streak={{
          current: profile.currentStreak,
          longest: profile.longestStreak,
        }}
      />

      {/* Rank */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-yellow-500/10">
                <Trophy className="h-5 w-5 text-yellow-500" />
              </div>
              <div>
                <p className="font-medium">Global Rank</p>
                <p className="text-sm text-muted-foreground">Based on total XP</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">#{profile.rank}</p>
              <Link to="/leaderboard" className="text-sm text-primary hover:underline">
                View Leaderboard
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Achievements by Category */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Achievements
          </CardTitle>
          <CardDescription>
            Complete actions to unlock achievements and earn XP
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="w-full flex-wrap h-auto gap-1 mb-4">
              <TabsTrigger value="all" className="text-xs">
                All
                <Badge variant="secondary" className="ml-1">{totalCount}</Badge>
              </TabsTrigger>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <TabsTrigger key={key} value={key} className="text-xs">
                  {CATEGORY_ICONS[key]}
                  <span className="ml-1 hidden sm:inline">{label}</span>
                  {categories?.[key] && (
                    <Badge variant="secondary" className="ml-1">
                      {categories[key].unlocked}/{categories[key].total}
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="all" className="mt-0">
              <div className="grid gap-3">
                {achievements?.map((a) => (
                  <AchievementCard 
                    key={a.achievement.id} 
                    achievement={a.achievement}
                    unlocked={a.unlocked}
                    unlockedAt={a.unlockedAt}
                  />
                ))}
              </div>
            </TabsContent>

            {Object.entries(CATEGORY_LABELS).map(([key]) => (
              <TabsContent key={key} value={key} className="mt-0">
                <div className="grid gap-3">
                  {achievementsByCategory[key]?.map((a) => (
                    <AchievementCard 
                      key={a.achievement.id} 
                      achievement={a.achievement}
                      unlocked={a.unlocked}
                      unlockedAt={a.unlockedAt}
                    />
                  ))}
                  {(!achievementsByCategory[key] || achievementsByCategory[key].length === 0) && (
                    <p className="text-center text-muted-foreground py-8">
                      No achievements in this category
                    </p>
                  )}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
