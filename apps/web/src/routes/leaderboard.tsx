import { Link } from 'react-router-dom';
import { Trophy, GitCommit, Star, BookOpen, Building2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { trpc } from '@/lib/trpc';

function LeaderboardSkeleton() {
  return (
    <div className="container max-w-[900px] mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-10 w-48 sm:w-64" />
        <Skeleton className="h-5 w-full max-w-[24rem]" />
      </div>
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function getRankBadge(rank: number) {
  if (rank === 1) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-500/20">
        <Trophy className="h-5 w-5 text-yellow-500" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-400/20">
        <Trophy className="h-5 w-5 text-gray-400" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-600/20">
        <Trophy className="h-5 w-5 text-amber-600" />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
      <span className="text-sm font-medium text-muted-foreground">{rank}</span>
    </div>
  );
}

export function LeaderboardPage() {
  const { data: leaderboard, isLoading } = trpc.repos.leaderboard.useQuery({ limit: 20 });

  if (isLoading) {
    return <LeaderboardSkeleton />;
  }

  return (
    <div className="container max-w-[900px] mx-auto px-4 py-6 sm:py-8 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2 sm:gap-3">
          <Trophy className="h-6 w-6 sm:h-8 sm:w-8 text-yellow-500" />
          Leaderboard
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Most active repositories by commits in the last 7 days
        </p>
      </div>

      {/* Leaderboard List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCommit className="h-5 w-5" />
            Top Repositories
          </CardTitle>
          <CardDescription>
            Ranked by number of commits in the past week
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!leaderboard || leaderboard.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No activity yet</h3>
              <p className="text-muted-foreground">
                No repositories have commits in the last 7 days.
              </p>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {leaderboard.map((repo, index) => (
                <Link
                  key={repo.id}
                  to={`/${repo.ownerName}/${repo.name}`}
                  className="block p-3 sm:p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  {/* Mobile: Stacked layout, Desktop: Horizontal layout */}
                  <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                    {/* Rank */}
                    <div className="flex-shrink-0">
                      {getRankBadge(index + 1)}
                    </div>

                    {/* Repo Info + Stats */}
                    <div className="flex-1 min-w-0">
                      {/* Repo name */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {repo.ownerType === 'organization' && (
                          <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        )}
                        <span className="font-medium text-primary hover:underline break-all">
                          {repo.ownerName}/{repo.name}
                        </span>
                      </div>
                      
                      {/* Description */}
                      {repo.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 sm:truncate mt-1">
                          {repo.description}
                        </p>
                      )}
                      
                      {/* Stats - Shown below on mobile, inline on desktop */}
                      <div className="flex items-center gap-3 mt-2 sm:hidden">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Star className="h-3.5 w-3.5" />
                          <span>{repo.starsCount}</span>
                        </div>
                        <Badge variant="secondary" className="font-mono text-xs">
                          <GitCommit className="h-3 w-3 mr-1" />
                          {repo.commitCount}
                        </Badge>
                      </div>
                    </div>

                    {/* Stats - Desktop only */}
                    <div className="hidden sm:flex items-center gap-4 text-sm flex-shrink-0">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Star className="h-4 w-4" />
                        <span>{repo.starsCount}</span>
                      </div>
                      <Badge variant="secondary" className="font-mono">
                        <GitCommit className="h-3 w-3 mr-1" />
                        {repo.commitCount} commits
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
