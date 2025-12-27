import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

export function NewOrgPage() {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const user = session?.user;

  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: nameAvailable, isFetching: checkingName } = trpc.organizations.checkName.useQuery(
    { name },
    { enabled: name.length >= 2 }
  );

  const createOrg = trpc.organizations.create.useMutation({
    onSuccess: (org) => {
      navigate(`/org/${org.name}`);
    },
    onError: (err) => {
      setError(err.message);
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
              You need to be logged in to create an organization.
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
      setError('Organization name is required');
      return;
    }

    createOrg.mutate({
      name: name.trim(),
      displayName: displayName.trim() || undefined,
      description: description.trim() || undefined,
    });
  };

  const nameError = name.length >= 2 && nameAvailable && !nameAvailable.available
    ? 'This name is already taken'
    : null;

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Create a new organization</h1>
        <p className="text-muted-foreground mt-2">
          Organizations are shared accounts where teams can collaborate on repositories.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Organization details
            </CardTitle>
            <CardDescription>
              Choose a unique name for your organization.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Organization name *</Label>
              <Input
                id="name"
                placeholder="my-org"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                pattern="^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]{2}$"
              />
              {checkingName && (
                <p className="text-xs text-muted-foreground">Checking availability...</p>
              )}
              {nameError && (
                <p className="text-xs text-destructive">{nameError}</p>
              )}
              {name.length >= 2 && nameAvailable?.available && (
                <p className="text-xs text-green-600">Name is available!</p>
              )}
              <p className="text-xs text-muted-foreground">
                2-39 characters. Alphanumeric and hyphens only. Cannot start or end with a hyphen.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">Display name (optional)</Label>
              <Input
                id="displayName"
                placeholder="My Organization"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                A friendly name for your organization.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="Building awesome things together"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {error && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(-1)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createOrg.isPending || !!nameError || name.length < 2}
              >
                {createOrg.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create organization
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
