import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Code2, Lock, Globe, Building2, User, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { trpc } from '@/lib/trpc';
import { useSession } from '@/lib/auth-client';
import { toastSuccess, toastError } from '@/components/ui/use-toast';

type Owner = {
  type: 'user' | 'organization';
  id: string;
  name: string;
  displayName?: string;
};

export function NewRepoPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: session, isPending } = useSession();
  const user = session?.user;

  // Fetch user's organizations for the owner selector
  const { data: userOrgs } = trpc.organizations.listForUser.useQuery(undefined, {
    enabled: !!user,
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Owner selection - default to user, but can be an organization
  const defaultOwner: Owner | null = user ? {
    type: 'user',
    id: user.id,
    name: user.username || '',
    displayName: user.name || user.username || '',
  } : null;

  // Check if we have an org query param to pre-select
  const orgParam = searchParams.get('org');
  const preselectedOrg = userOrgs?.find(m => m.org.name === orgParam);
  
  const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
  
  // Set the owner once data is loaded
  const currentOwner = selectedOwner || (preselectedOrg ? {
    type: 'organization' as const,
    id: preselectedOrg.org.id,
    name: preselectedOrg.org.name,
    displayName: preselectedOrg.org.displayName || preselectedOrg.org.name,
  } : defaultOwner);

  const createRepo = trpc.repos.create.useMutation({
    onSuccess: (repo) => {
      toastSuccess({
        title: 'Repository created',
        description: `${repo.name} has been created successfully.`,
      });
      // Navigate to the correct owner path
      const ownerPath = currentOwner?.type === 'organization' 
        ? currentOwner.name 
        : user?.username;
      navigate(`/${ownerPath}/${repo.name}`);
    },
    onError: (err) => {
      setError(err.message);
      toastError({
        title: 'Failed to create repository',
        description: err.message,
      });
    },
  });

  const createOrgRepo = trpc.repos.createForOrg.useMutation({
    onSuccess: (repo) => {
      toastSuccess({
        title: 'Repository created',
        description: `${repo.name} has been created successfully.`,
      });
      navigate(`/${currentOwner?.name}/${repo.name}`);
    },
    onError: (err) => {
      setError(err.message);
      toastError({
        title: 'Failed to create repository',
        description: err.message,
      });
    },
  });

  if (isPending) {
    return <Loading text="Loading..." />;
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">
              You need to be logged in to create a repository.
            </p>
            <Button className="mt-4" onClick={() => navigate('/login')}>
              Sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Repository name is required');
      return;
    }

    if (!currentOwner) {
      setError('Please select an owner');
      return;
    }

    if (currentOwner.type === 'organization') {
      createOrgRepo.mutate({
        orgId: currentOwner.id,
        name: name.trim(),
        description: description.trim() || undefined,
        isPrivate,
      });
    } else {
      createRepo.mutate({
        name: name.trim(),
        description: description.trim() || undefined,
        isPrivate,
      });
    }
  };

  const isMutating = createRepo.isPending || createOrgRepo.isPending;

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Create a new repository</h1>
        <p className="text-muted-foreground mt-2">
          A repository contains all project files, including the revision history.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Code2 className="h-5 w-5" />
              Repository details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Owner / Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Repository name *</Label>
              <div className="flex items-center gap-2">
                {/* Owner Selector */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2 min-w-[140px] justify-between">
                      <div className="flex items-center gap-2">
                        {currentOwner?.type === 'organization' ? (
                          <Building2 className="h-4 w-4" />
                        ) : (
                          <User className="h-4 w-4" />
                        )}
                        <span className="truncate max-w-[100px]">
                          {currentOwner?.displayName || currentOwner?.name || user?.username}
                        </span>
                      </div>
                      <ChevronDown className="h-3 w-3 shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    <DropdownMenuLabel>Select owner</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => setSelectedOwner({
                        type: 'user',
                        id: user?.id || '',
                        name: user?.username || '',
                        displayName: user?.name || user?.username || '',
                      })}
                    >
                      <User className="mr-2 h-4 w-4" />
                      <div className="flex flex-col">
                        <span className="font-medium">{user?.name || user?.username}</span>
                        <span className="text-xs text-muted-foreground">Personal account</span>
                      </div>
                    </DropdownMenuItem>
                    {userOrgs && userOrgs.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-xs text-muted-foreground">Organizations</DropdownMenuLabel>
                        {userOrgs.map((membership) => (
                          <DropdownMenuItem 
                            key={membership.orgId}
                            onClick={() => setSelectedOwner({
                              type: 'organization',
                              id: membership.org.id,
                              name: membership.org.name,
                              displayName: membership.org.displayName || membership.org.name,
                            })}
                          >
                            <Building2 className="mr-2 h-4 w-4" />
                            <div className="flex flex-col">
                              <span className="font-medium">{membership.org.displayName || membership.org.name}</span>
                              <span className="text-xs text-muted-foreground capitalize">{membership.role}</span>
                            </div>
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <span className="text-muted-foreground">/</span>
                <Input
                  id="name"
                  placeholder="my-awesome-project"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1"
                  pattern="^[a-zA-Z0-9._-]+$"
                  title="Repository name can only contain alphanumeric characters, dots, hyphens, and underscores"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Great repository names are short and memorable.
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="A short description of your project"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Visibility */}
            <div className="space-y-3">
              <Label>Visibility</Label>
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="visibility"
                    checked={!isPrivate}
                    onChange={() => setIsPrivate(false)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      <span className="font-medium">Public</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Anyone on the internet can see this repository. You choose who can commit.
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="visibility"
                    checked={isPrivate}
                    onChange={() => setIsPrivate(true)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      <span className="font-medium">Private</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      You choose who can see and commit to this repository.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            {/* Submit */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(-1)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isMutating}>
                {isMutating ? 'Creating...' : 'Create repository'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
