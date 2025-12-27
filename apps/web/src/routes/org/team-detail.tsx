import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Users, Plus, Trash2, Loader2, ChevronLeft, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

export function TeamDetailPage() {
  const { slug, teamId } = useParams<{ slug: string; teamId: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: org, isLoading: orgLoading } = trpc.organizations.get.useQuery(
    { name: slug! },
    { enabled: !!slug }
  );

  const { data: team, isLoading: teamLoading } = trpc.organizations.getTeam.useQuery(
    { teamId: teamId! },
    { enabled: !!teamId }
  );

  const { data: teamMembers, isLoading: membersLoading } = trpc.organizations.listTeamMembers.useQuery(
    { teamId: teamId! },
    { enabled: !!teamId }
  );

  const { data: orgMembers } = trpc.organizations.listMembers.useQuery(
    { orgId: org?.id! },
    { enabled: !!org?.id }
  );

  const { data: membership } = trpc.organizations.checkMembership.useQuery(
    { orgId: org?.id!, userId: session?.user?.id! },
    { enabled: !!org?.id && !!session?.user?.id }
  );

  // Search users (only among org members who aren't already in the team)
  const { data: searchResults } = trpc.users.search.useQuery(
    { query: searchQuery, limit: 10 },
    { enabled: searchQuery.length >= 2 }
  );

  // Filter search results to only show org members who aren't in the team
  const filteredResults = searchResults?.filter(user => {
    const isOrgMember = orgMembers?.some(m => m.userId === user.id);
    const isTeamMember = teamMembers?.some(m => m.userId === user.id);
    return isOrgMember && !isTeamMember;
  }) || [];

  const addTeamMember = trpc.organizations.addTeamMember.useMutation({
    onSuccess: () => {
      setIsDialogOpen(false);
      setSelectedUserId(null);
      setSearchQuery('');
      setError(null);
      utils.organizations.listTeamMembers.invalidate({ teamId: teamId! });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const removeTeamMember = trpc.organizations.removeTeamMember.useMutation({
    onSuccess: () => {
      utils.organizations.listTeamMembers.invalidate({ teamId: teamId! });
    },
  });

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedUserId) {
      setError('Please select a member to add');
      return;
    }

    if (!teamId) return;

    addTeamMember.mutate({
      teamId,
      userId: selectedUserId,
    });
  };

  const handleRemove = (userId: string, username: string) => {
    if (!teamId) return;
    if (confirm(`Remove ${username} from the team?`)) {
      removeTeamMember.mutate({ teamId, userId });
    }
  };

  if (!authenticated) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Please sign in to access this page.</p>
      </div>
    );
  }

  const isLoading = orgLoading || teamLoading || membersLoading;

  if (isLoading) {
    return <Loading text="Loading team..." />;
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

  if (!team) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-2">Team not found</h2>
        <p className="text-muted-foreground">
          The team could not be found.
        </p>
      </div>
    );
  }

  const isOwner = membership?.role === 'owner';
  const isAdmin = membership?.role === 'admin' || isOwner;

  // Get selected user for display
  const selectedUser = searchResults?.find(u => u.id === selectedUserId) ||
    orgMembers?.find(m => m.userId === selectedUserId)?.user;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          to={`/org/${slug}/teams`}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Teams
        </Link>
        <span className="text-muted-foreground">/</span>
        <span>{team.name}</span>
      </div>

      <div>
        <h1 className="text-3xl font-bold">{team.name}</h1>
        {team.description && (
          <p className="text-muted-foreground mt-1">{team.description}</p>
        )}
      </div>

      {/* Team Members */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>
              {teamMembers?.length || 0} members in this team
            </CardDescription>
          </div>
          {isAdmin && (
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Member
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <form onSubmit={handleAddMember}>
                  <DialogHeader>
                    <DialogTitle>Add Team Member</DialogTitle>
                    <DialogDescription>
                      Add an organization member to this team. Only organization members can be added to teams.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Select member</Label>
                      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={popoverOpen}
                            className="w-full justify-between"
                          >
                            {selectedUser ? (
                              <div className="flex items-center gap-2">
                                <Avatar className="h-5 w-5">
                                  <AvatarImage src={selectedUser.avatarUrl || undefined} />
                                  <AvatarFallback className="text-xs">
                                    {(selectedUser.username || 'U').slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span>{selectedUser.name || selectedUser.username}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">Search for a member...</span>
                            )}
                            <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start">
                          <Command>
                            <CommandInput
                              placeholder="Search members..."
                              value={searchQuery}
                              onValueChange={setSearchQuery}
                            />
                            <CommandList>
                              <CommandEmpty>
                                {searchQuery.length < 2 
                                  ? 'Type to search...' 
                                  : 'No members found.'}
                              </CommandEmpty>
                              <CommandGroup>
                                {filteredResults.map((user) => (
                                  <CommandItem
                                    key={user.id}
                                    value={user.username || user.id}
                                    onSelect={() => {
                                      setSelectedUserId(user.id);
                                      setPopoverOpen(false);
                                    }}
                                  >
                                    <div className="flex items-center gap-2">
                                      <Avatar className="h-6 w-6">
                                        <AvatarImage src={user.avatarUrl || undefined} />
                                        <AvatarFallback className="text-xs">
                                          {(user.username || 'U').slice(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div className="flex flex-col">
                                        <span className="font-medium">{user.name || user.username}</span>
                                        <span className="text-xs text-muted-foreground">@{user.username}</span>
                                      </div>
                                    </div>
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                      <p className="text-xs text-muted-foreground">
                        Search for organization members by name or username.
                      </p>
                    </div>

                    {error && (
                      <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                        {error}
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={addTeamMember.isPending || !selectedUserId}>
                      {addTeamMember.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Add Member
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {!teamMembers || teamMembers.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No team members"
              description="Add organization members to this team."
            />
          ) : (
            <div className="divide-y">
              {teamMembers.map((member) => (
                <TeamMemberRow
                  key={member.userId}
                  member={member}
                  currentUserId={session?.user?.id || ''}
                  isAdmin={isAdmin}
                  onRemove={() => handleRemove(member.userId, member.user?.username || 'this user')}
                  isRemoving={removeTeamMember.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface TeamMemberRowProps {
  member: {
    userId: string;
    joinedAt: Date | string;
    user?: {
      id?: string;
      username?: string | null;
      name?: string | null;
      avatarUrl?: string | null;
    } | null;
  };
  currentUserId: string;
  isAdmin: boolean;
  onRemove: () => void;
  isRemoving: boolean;
}

function TeamMemberRow({
  member,
  currentUserId,
  isAdmin,
  onRemove,
  isRemoving,
}: TeamMemberRowProps) {
  const isSelf = member.userId === currentUserId;
  const canRemove = isAdmin || isSelf;

  return (
    <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <Avatar>
          <AvatarImage src={member.user?.avatarUrl || undefined} />
          <AvatarFallback>
            {(member.user?.username || 'U').slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <Link
              to={`/${member.user?.username}`}
              className="font-medium hover:text-primary"
            >
              {member.user?.name || member.user?.username}
            </Link>
            {isSelf && (
              <span className="text-xs text-muted-foreground">(you)</span>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            @{member.user?.username}
          </div>
        </div>
      </div>
      {canRemove && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={isRemoving}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          {isRemoving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  );
}
