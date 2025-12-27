import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Users, Plus, Trash2, Loader2, ChevronLeft, Crown, Shield, User, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { formatRelativeTime } from '@/lib/utils';

const ROLE_LEVELS = [
  { value: 'member', label: 'Member', description: 'Can view repositories', icon: User },
  { value: 'admin', label: 'Admin', description: 'Can manage teams and settings', icon: Shield },
  { value: 'owner', label: 'Owner', description: 'Full access', icon: Crown },
];

export function OrgMembersPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [role, setRole] = useState('member');
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: org, isLoading: orgLoading } = trpc.organizations.get.useQuery(
    { name: slug! },
    { enabled: !!slug }
  );

  const { data: members, isLoading: membersLoading } = trpc.organizations.listMembers.useQuery(
    { orgId: org?.id! },
    { enabled: !!org?.id }
  );

  const { data: membership } = trpc.organizations.checkMembership.useQuery(
    { orgId: org?.id!, userId: session?.user?.id! },
    { enabled: !!org?.id && !!session?.user?.id }
  );

  // Search users
  const { data: searchResults } = trpc.users.search.useQuery(
    { query: searchQuery, limit: 10 },
    { enabled: searchQuery.length >= 2 }
  );

  // Filter out users who are already members
  const filteredResults = searchResults?.filter(user => 
    !members?.some(m => m.userId === user.id)
  ) || [];

  const addMember = trpc.organizations.addMember.useMutation({
    onSuccess: () => {
      setIsDialogOpen(false);
      setSelectedUserId(null);
      setSearchQuery('');
      setRole('member');
      setError(null);
      utils.organizations.listMembers.invalidate({ orgId: org?.id! });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const updateRole = trpc.organizations.updateMemberRole.useMutation({
    onSuccess: () => {
      utils.organizations.listMembers.invalidate({ orgId: org?.id! });
    },
  });

  const removeMember = trpc.organizations.removeMember.useMutation({
    onSuccess: () => {
      utils.organizations.listMembers.invalidate({ orgId: org?.id! });
    },
  });

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedUserId) {
      setError('Please select a user to add');
      return;
    }

    if (!org?.id) return;

    addMember.mutate({
      orgId: org.id,
      userId: selectedUserId,
      role: role as 'member' | 'admin' | 'owner',
    });
  };

  // Get selected user for display
  const selectedUser = searchResults?.find(u => u.id === selectedUserId);

  const handleRoleChange = (memberId: string, newRole: string) => {
    if (!org?.id) return;
    updateRole.mutate({
      orgId: org.id,
      userId: memberId,
      role: newRole as 'member' | 'admin' | 'owner',
    });
  };

  const handleRemove = (memberId: string, username: string) => {
    if (!org?.id) return;
    if (confirm(`Remove ${username} from the organization?`)) {
      removeMember.mutate({ orgId: org.id, userId: memberId });
    }
  };

  if (!authenticated) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Please sign in to access this page.</p>
      </div>
    );
  }

  const isLoading = orgLoading || membersLoading;

  if (isLoading) {
    return <Loading text="Loading members..." />;
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
          You don't have permission to manage members.
        </p>
      </div>
    );
  }

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
        <span>Members</span>
      </div>

      <div>
        <h1 className="text-3xl font-bold">Members</h1>
        <p className="text-muted-foreground mt-1">
          Manage who has access to this organization.
        </p>
      </div>

      {/* Add member */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Organization Members</CardTitle>
            <CardDescription>
              People with access to this organization.
            </CardDescription>
          </div>
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
                  <DialogTitle>Add Member</DialogTitle>
                  <DialogDescription>
                    Search for a user to add to the organization.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Search for user</Label>
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
                            <span className="text-muted-foreground">Search for a user...</span>
                          )}
                          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command>
                          <CommandInput
                            placeholder="Search by name or username..."
                            value={searchQuery}
                            onValueChange={setSearchQuery}
                          />
                          <CommandList>
                            <CommandEmpty>
                              {searchQuery.length < 2 
                                ? 'Type at least 2 characters to search...' 
                                : 'No users found.'}
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
                      Search for users by name or username.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_LEVELS.map((level) => (
                          <SelectItem key={level.value} value={level.value}>
                            {level.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                  <Button type="submit" disabled={addMember.isPending || !selectedUserId}>
                    {addMember.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Member
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {!members || members.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No members"
              description="Add members to your organization."
            />
          ) : (
            <div className="divide-y">
              {members.map((member: any) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  currentUserId={session?.user?.id || ''}
                  isOwner={isOwner}
                  onRoleChange={(newRole) => handleRoleChange(member.userId, newRole)}
                  onRemove={() => handleRemove(member.userId, member.user?.username)}
                  isUpdating={updateRole.isPending}
                  isRemoving={removeMember.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role explanation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Role levels</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            {ROLE_LEVELS.map((level) => {
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
  );
}

interface MemberRowProps {
  member: {
    id: string;
    userId: string;
    role: string;
    createdAt: Date | string;
    user?: {
      username?: string | null;
      name?: string | null;
      avatarUrl?: string | null;
    } | null;
  };
  currentUserId: string;
  isOwner: boolean;
  onRoleChange: (role: string) => void;
  onRemove: () => void;
  isUpdating: boolean;
  isRemoving: boolean;
}

function MemberRow({
  member,
  currentUserId,
  isOwner,
  onRoleChange,
  onRemove,
  isUpdating,
  isRemoving,
}: MemberRowProps) {
  const isSelf = member.userId === currentUserId;
  const canChangeRole = isOwner && !isSelf;
  const canRemove = isOwner && !isSelf || (isSelf && member.role !== 'owner');

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
              <Badge variant="outline" className="text-xs">
                You
              </Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            @{member.user?.username}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {canChangeRole ? (
          <Select
            value={member.role}
            onValueChange={onRoleChange}
            disabled={isUpdating}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLE_LEVELS.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  {level.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="outline" className="capitalize">
            {member.role}
          </Badge>
        )}
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
    </div>
  );
}
