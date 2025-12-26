import { useParams, Link } from 'react-router-dom';
import { MapPin, Link as LinkIcon, Calendar, Code2, GitPullRequest, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { formatDate } from '@/lib/utils';
import { trpc } from '@/lib/trpc';

export function OwnerPage() {
  const { owner } = useParams<{ owner: string }>();

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

  const isLoading = userLoading || reposLoading;

  if (isLoading) {
    return <Loading text="Loading profile..." />;
  }

  if (userError || !userData) {
    return (
      <div className="text-center py-12">
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
    <div className="grid md:grid-cols-4 gap-8">
      {/* Left sidebar - Profile info */}
      <div className="md:col-span-1">
        <div className="sticky top-20 space-y-4">
          <Avatar className="h-64 w-64 rounded-lg">
            <AvatarImage src={user.avatarUrl || undefined} />
            <AvatarFallback className="text-6xl rounded-lg">
              {user.username.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div>
            <h1 className="text-2xl font-bold">{user.name || user.username}</h1>
            <p className="text-xl text-muted-foreground">@{user.username}</p>
          </div>

          {user.bio && (
            <p className="text-muted-foreground">{user.bio}</p>
          )}

          <Button className="w-full">Follow</Button>

          <div className="space-y-2 text-sm">
            {user.location && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {user.location}
              </div>
            )}
            {user.website && (
              <div className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-muted-foreground" />
                <a
                  href={user.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {user.website.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              Joined {formatDate(new Date(user.createdAt))}
            </div>
          </div>

          <div className="flex gap-4 text-sm">
            <button className="flex items-center gap-1 hover:text-primary">
              <Users className="h-4 w-4" />
              <strong>0</strong>
              <span className="text-muted-foreground">followers</span>
            </button>
            <button className="flex items-center gap-1 hover:text-primary">
              <strong>0</strong>
              <span className="text-muted-foreground">following</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="md:col-span-3">
        <Tabs defaultValue="repositories">
          <TabsList>
            <TabsTrigger value="repositories" className="gap-2">
              <Code2 className="h-4 w-4" />
              Repositories
              <Badge variant="secondary" className="ml-1">
                {repos.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="pulls" className="gap-2">
              <GitPullRequest className="h-4 w-4" />
              Pull requests
            </TabsTrigger>
          </TabsList>

          <TabsContent value="repositories" className="mt-6">
            {repos.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Code2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No repositories yet</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {repos.map((repo) => (
                  <Card key={repo.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/${user.username}/${repo.name}`}
                              className="text-lg font-semibold text-primary hover:underline"
                            >
                              {repo.name}
                            </Link>
                            {repo.isPrivate && (
                              <Badge variant="secondary">Private</Badge>
                            )}
                          </div>
                          {repo.description && (
                            <p className="text-muted-foreground">
                              {repo.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>⭐ {repo.starsCount}</span>
                            <span>🍴 {repo.forksCount}</span>
                            <span>Updated {formatDate(new Date(repo.updatedAt))}</span>
                          </div>
                        </div>
                        <Button variant="outline" size="sm">
                          ⭐ Star
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pulls" className="mt-6">
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <GitPullRequest className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No pull requests yet</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
