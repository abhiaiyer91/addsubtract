import { useParams, Link } from 'react-router-dom';
import { Building2, Users, MapPin, LinkIcon, Settings, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime } from '@/lib/utils';

export function OrgPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  const { data: org, isLoading: orgLoading } = trpc.organizations.get.useQuery(
    { name: slug! },
    { enabled: !!slug }
  );

  const { data: members, isLoading: membersLoading } = trpc.organizations.listMembers.useQuery(
    { orgId: org?.id! },
    { enabled: !!org?.id }
  );

  const { data: repos, isLoading: reposLoading } = trpc.repos.list.useQuery(
    { owner: slug!, ownerType: 'organization' },
    { enabled: !!slug }
  );

  const { data: membership } = trpc.organizations.checkMembership.useQuery(
    { orgId: org?.id!, userId: session?.user?.id! },
    { enabled: !!org?.id && !!session?.user?.id }
  );

  const isLoading = orgLoading;

  if (isLoading) {
    return <Loading text="Loading organization..." />;
  }

  if (!org) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-2">Organization not found</h2>
        <p className="text-muted-foreground">
          The organization "{slug}" could not be found.
        </p>
      </div>
    );
  }

  const isOwner = membership?.role === 'owner';
  const isAdmin = membership?.role === 'admin' || isOwner;
  const isMember = membership?.isMember;

  return (
    <div className="space-y-8">
      {/* Organization header */}
      <div className="flex items-start gap-6">
        <Avatar className="h-24 w-24">
          <AvatarImage src={org.avatarUrl || undefined} />
          <AvatarFallback className="text-3xl">
            <Building2 className="h-12 w-12" />
          </AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{org.displayName || org.name}</h1>
            <Badge variant="secondary">Organization</Badge>
          </div>
          {org.description && (
            <p className="text-muted-foreground mt-2">{org.description}</p>
          )}
          <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
            {org.location && (
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {org.location}
              </span>
            )}
            {org.website && (
              <a
                href={org.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-foreground"
              >
                <LinkIcon className="h-4 w-4" />
                {org.website.replace(/^https?:\/\//, '')}
              </a>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {members?.length || 0} members
            </span>
          </div>
        </div>
        {isAdmin && (
          <Link to={`/org/${slug}/settings`}>
            <Button variant="outline" className="gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </Button>
          </Link>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="repos" className="space-y-6">
        <TabsList>
          <TabsTrigger value="repos" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Repositories
          </TabsTrigger>
          <TabsTrigger value="members" className="gap-2">
            <Users className="h-4 w-4" />
            Members
          </TabsTrigger>
        </TabsList>

        <TabsContent value="repos" className="space-y-4">
          {reposLoading ? (
            <Loading text="Loading repositories..." />
          ) : !repos || repos.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <EmptyState
                  icon={BookOpen}
                  title="No repositories"
                  description="This organization doesn't have any repositories yet."
                />
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {repos.map((repo: any) => (
                <Card key={repo.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <Link
                          to={`/${slug}/${repo.name}`}
                          className="text-lg font-semibold hover:text-primary transition-colors"
                        >
                          {repo.name}
                        </Link>
                        {repo.description && (
                          <p className="text-muted-foreground mt-1">{repo.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          {repo.isPrivate ? (
                            <Badge variant="secondary">Private</Badge>
                          ) : (
                            <Badge variant="outline">Public</Badge>
                          )}
                          <span>Updated {formatRelativeTime(repo.updatedAt)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="members" className="space-y-4">
          {membersLoading ? (
            <Loading text="Loading members..." />
          ) : !members || members.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <EmptyState
                  icon={Users}
                  title="No members"
                  description="This organization doesn't have any members yet."
                />
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Members</CardTitle>
                <CardDescription>
                  People in this organization.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {members.map((member: any) => (
                    <div key={member.id} className="flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={member.user?.avatarUrl || undefined} />
                          <AvatarFallback>
                            {(member.user?.username || 'U').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <Link
                            to={`/${member.user?.username}`}
                            className="font-medium hover:text-primary"
                          >
                            {member.user?.name || member.user?.username}
                          </Link>
                          <div className="text-sm text-muted-foreground">
                            @{member.user?.username}
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className="capitalize">
                        {member.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
