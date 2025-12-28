import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Users, Plus, Trash2, Loader2, ChevronLeft, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

interface TeamFormData {
  name: string;
  description: string;
}

const DEFAULT_FORM: TeamFormData = {
  name: '',
  description: '',
};

export function OrgTeamsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<any | null>(null);
  const [formData, setFormData] = useState<TeamFormData>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: org, isLoading: orgLoading } = trpc.organizations.get.useQuery(
    { name: slug! },
    { enabled: !!slug }
  );

  const { data: teams, isLoading: teamsLoading } = trpc.organizations.listTeams.useQuery(
    { orgId: org?.id! },
    { enabled: !!org?.id }
  );

  const { data: membership } = trpc.organizations.checkMembership.useQuery(
    { orgId: org?.id!, userId: session?.user?.id! },
    { enabled: !!org?.id && !!session?.user?.id }
  );

  const createTeam = trpc.organizations.createTeam.useMutation({
    onSuccess: () => {
      closeDialog();
      utils.organizations.listTeams.invalidate({ orgId: org?.id! });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const updateTeam = trpc.organizations.updateTeam.useMutation({
    onSuccess: () => {
      closeDialog();
      utils.organizations.listTeams.invalidate({ orgId: org?.id! });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const deleteTeam = trpc.organizations.deleteTeam.useMutation({
    onSuccess: () => {
      utils.organizations.listTeams.invalidate({ orgId: org?.id! });
    },
  });

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingTeam(null);
    setFormData(DEFAULT_FORM);
    setError(null);
  };

  const openCreateDialog = () => {
    setEditingTeam(null);
    setFormData(DEFAULT_FORM);
    setIsDialogOpen(true);
  };

  const openEditDialog = (team: any) => {
    setEditingTeam(team);
    setFormData({
      name: team.name,
      description: team.description || '',
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('Team name is required');
      return;
    }

    if (!org?.id) return;

    if (editingTeam) {
      updateTeam.mutate({
        teamId: editingTeam.id,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
      });
    } else {
      createTeam.mutate({
        orgId: org.id,
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
      });
    }
  };

  const handleDelete = (teamId: string, teamName: string) => {
    if (confirm(`Delete team "${teamName}"?`)) {
      deleteTeam.mutate({ teamId });
    }
  };

  if (!authenticated) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Please sign in to access this page.</p>
      </div>
    );
  }

  const isLoading = orgLoading || teamsLoading;

  if (isLoading) {
    return <Loading text="Loading teams..." />;
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

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-2">Access denied</h2>
        <p className="text-muted-foreground">
          You don't have permission to manage teams.
        </p>
      </div>
    );
  }

  const isMutating = createTeam.isPending || updateTeam.isPending;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          to={`/org/${slug}`}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          {org.displayName || org.name}
        </Link>
        <span className="text-muted-foreground">/</span>
        <span>Teams</span>
      </div>

      <div>
        <h1 className="text-3xl font-bold">Teams</h1>
        <p className="text-muted-foreground mt-1">
          Organize members into teams for easier permission management.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Teams</CardTitle>
            <CardDescription>
              Create teams to group members together.
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2" onClick={openCreateDialog}>
                <Plus className="h-4 w-4" />
                New Team
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>
                    {editingTeam ? 'Edit Team' : 'Create Team'}
                  </DialogTitle>
                  <DialogDescription>
                    {editingTeam
                      ? 'Update the team details.'
                      : 'Create a new team in your organization.'}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Team name *</Label>
                    <Input
                      id="name"
                      placeholder="Engineering"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Description (optional)</Label>
                    <Textarea
                      id="description"
                      placeholder="The engineering team"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                    />
                  </div>

                  {error && (
                    <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                      {error}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={closeDialog}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isMutating}>
                    {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingTeam ? 'Save Changes' : 'Create Team'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {!teams || teams.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No teams"
              description="Create teams to organize your members."
            />
          ) : (
            <div className="divide-y">
              {teams.map((team: any) => (
                <TeamRow
                  key={team.id}
                  team={team}
                  orgSlug={slug!}
                  onEdit={() => openEditDialog(team)}
                  onDelete={() => handleDelete(team.id, team.name)}
                  isDeleting={deleteTeam.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface TeamRowProps {
  team: {
    id: string;
    name: string;
    description?: string | null;
    memberCount?: number;
  };
  orgSlug: string;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

function TeamRow({ team, orgSlug, onEdit, onDelete, isDeleting }: TeamRowProps) {
  return (
    <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-muted rounded-md">
          <Users className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <Link
            to={`/org/${orgSlug}/teams/${team.id}`}
            className="font-medium hover:text-primary"
          >
            {team.name}
          </Link>
          {team.description && (
            <p className="text-sm text-muted-foreground">{team.description}</p>
          )}
          <div className="text-xs text-muted-foreground mt-1">
            {team.memberCount || 0} members
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Edit2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={isDeleting}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
