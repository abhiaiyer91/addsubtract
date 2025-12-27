import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Users, Plus, Trash2, Loader2, Crown, Shield, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { RepoLayout } from '../components/repo-layout';
import { SettingsLayout } from './layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime } from '@/lib/utils';

const PERMISSION_LEVELS = [
  { value: 'read', label: 'Read', description: 'Can view and clone', icon: Eye },
  { value: 'write', label: 'Write', description: 'Can push to branches', icon: Shield },
  { value: 'admin', label: 'Admin', description: 'Full access including settings', icon: Crown },
];

export function CollaboratorsPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  const [username, setUsername] = useState('');
  const [permission, setPermission] = useState<string>('write');
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  const { data: collaborators, isLoading: collabLoading } = trpc.repos.collaborators.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  );

  const addCollaborator = trpc.repos.addCollaborator.useMutation({
    onSuccess: () => {
      setUsername('');
      setPermission('write');
      setError(null);
      utils.repos.collaborators.invalidate({ repoId: repoData?.repo.id! });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const removeCollaborator = trpc.repos.removeCollaborator.useMutation({
    onSuccess: () => {
      utils.repos.collaborators.invalidate({ repoId: repoData?.repo.id! });
    },
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    if (!repoData?.repo.id) return;

    addCollaborator.mutate({
      repoId: repoData.repo.id,
      username: username.trim(),
      permission: permission as 'read' | 'write' | 'admin',
    });
  };

  const handleRemove = (userId: string, displayName: string) => {
    if (!repoData?.repo.id) return;

    if (confirm(`Remove ${displayName} from collaborators?`)) {
      removeCollaborator.mutate({
        repoId: repoData.repo.id,
        userId,
      });
    }
  };

  if (!authenticated) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Please sign in to access settings.</p>
        </div>
      </RepoLayout>
    );
  }

  const isLoading = repoLoading || collabLoading;

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading collaborators..." />
      </RepoLayout>
    );
  }

  if (!repoData?.repo) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Repository not found.</p>
        </div>
      </RepoLayout>
    );
  }

  const repoOwner = repoData.owner;
  const isOwner = session?.user?.id === repoData.repo.ownerId;

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <SettingsLayout>
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">Collaborators</h2>
            <p className="text-muted-foreground mt-1">
              Manage who has access to this repository.
            </p>
          </div>

          {/* Invite form */}
          <Card>
            <CardHeader>
              <CardTitle>Invite a collaborator</CardTitle>
              <CardDescription>
                Search for a user by their username to add them as a collaborator.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleInvite} className="flex items-end gap-3">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    placeholder="Search by username..."
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div className="w-40 space-y-2">
                  <Label>Permission</Label>
                  <Select value={permission} onValueChange={setPermission}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PERMISSION_LEVELS.map((level) => (
                        <SelectItem key={level.value} value={level.value}>
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={addCollaborator.isPending}>
                  {addCollaborator.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  <span className="ml-2">Invite</span>
                </Button>
              </form>
              {error && (
                <div className="mt-3 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  {error}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Collaborators list */}
          <Card>
            <CardHeader>
              <CardTitle>Collaborators</CardTitle>
              <CardDescription>
                People with access to this repository.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!collaborators || collaborators.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="No collaborators"
                  description="Invite someone to collaborate on this repository."
                />
              ) : (
                <div className="divide-y">
                  {/* Owner first */}
                  {'username' in repoOwner && (
                    <CollaboratorRow
                      user={{
                        id: repoData.repo.ownerId,
                        username: repoOwner.username || '',
                        name: repoOwner.name,
                        avatarUrl: repoOwner.avatarUrl,
                      }}
                      permission="owner"
                      isOwner={true}
                      onRemove={() => {}}
                      isRemoving={false}
                    />
                  )}
                  {/* Other collaborators */}
                  {collaborators
                    .filter((c: any) => c.userId !== repoData.repo.ownerId)
                    .map((collab: any) => (
                      <CollaboratorRow
                        key={collab.id}
                        user={{
                          id: collab.userId,
                          username: collab.user?.username || '',
                          name: collab.user?.name,
                          avatarUrl: collab.user?.avatarUrl,
                        }}
                        permission={collab.permission}
                        addedAt={collab.createdAt}
                        isOwner={false}
                        canRemove={isOwner}
                        onRemove={() => handleRemove(collab.userId, collab.user?.username || 'collaborator')}
                        isRemoving={removeCollaborator.isPending}
                      />
                    ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Permission levels explanation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Permission levels</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                {PERMISSION_LEVELS.map((level) => {
                  const Icon = level.icon;
                  return (
                    <div key={level.value} className="flex items-start gap-3">
                      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div>
                        <span className="font-medium">{level.label}</span>
                        <span className="text-muted-foreground"> - {level.description}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </SettingsLayout>
    </RepoLayout>
  );
}

interface CollaboratorRowProps {
  user: {
    id: string;
    username: string;
    name?: string | null;
    avatarUrl?: string | null;
  };
  permission: string;
  addedAt?: Date | string;
  isOwner: boolean;
  canRemove?: boolean;
  onRemove: () => void;
  isRemoving: boolean;
}

function CollaboratorRow({
  user,
  permission,
  addedAt,
  isOwner,
  canRemove,
  onRemove,
  isRemoving,
}: CollaboratorRowProps) {
  const permissionInfo = PERMISSION_LEVELS.find((p) => p.value === permission);

  return (
    <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarImage src={user.avatarUrl || undefined} />
          <AvatarFallback>
            {(user.username || user.name || 'U').slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{user.name || user.username}</span>
            <span className="text-muted-foreground">@{user.username}</span>
          </div>
          {addedAt && (
            <div className="text-xs text-muted-foreground">
              Added {formatRelativeTime(addedAt)}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {isOwner ? (
          <Badge variant="secondary" className="font-normal">
            Owner
          </Badge>
        ) : (
          <>
            <Badge variant="outline" className="font-normal">
              {permissionInfo?.label || permission}
            </Badge>
            {canRemove && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={onRemove}
                disabled={isRemoving}
              >
                {isRemoving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
