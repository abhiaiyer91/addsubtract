import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Building2, Loader2, Check, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loading } from '@/components/ui/loading';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

export function OrgSettingsPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    displayName: '',
    description: '',
    avatarUrl: '',
    website: '',
    location: '',
  });

  const utils = trpc.useUtils();

  const { data: org, isLoading: orgLoading } = trpc.organizations.get.useQuery(
    { name: slug! },
    { enabled: !!slug }
  );

  const { data: membership } = trpc.organizations.checkMembership.useQuery(
    { orgId: org?.id!, userId: session?.user?.id! },
    { enabled: !!org?.id && !!session?.user?.id }
  );

  const updateOrg = trpc.organizations.update.useMutation({
    onSuccess: () => {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      utils.organizations.get.invalidate({ name: slug! });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const deleteOrg = trpc.organizations.delete.useMutation({
    onSuccess: () => {
      navigate('/');
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  // Populate form when org loads
  useEffect(() => {
    if (org) {
      setFormData({
        displayName: org.displayName || '',
        description: org.description || '',
        avatarUrl: org.avatarUrl || '',
        website: org.website || '',
        location: org.location || '',
      });
    }
  }, [org]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!org?.id) return;

    updateOrg.mutate({
      orgId: org.id,
      displayName: formData.displayName || undefined,
      description: formData.description || undefined,
      avatarUrl: formData.avatarUrl || null,
      website: formData.website || null,
      location: formData.location || null,
    });
  };

  const handleDelete = () => {
    if (!org?.id) return;

    const confirmText = prompt(
      `This will permanently delete the organization and all its repositories.\nType "${org.name}" to confirm:`
    );
    if (confirmText === org.name) {
      deleteOrg.mutate({ orgId: org.id });
    }
  };

  if (!authenticated) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Please sign in to access settings.</p>
      </div>
    );
  }

  if (orgLoading) {
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

  if (!isAdmin) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-2">Access denied</h2>
        <p className="text-muted-foreground">
          You don't have permission to access organization settings.
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
        <span>Settings</span>
      </div>

      <div>
        <h1 className="text-3xl font-bold">Organization Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your organization's profile and settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Profile
          </CardTitle>
          <CardDescription>
            Update your organization's public profile information.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                placeholder="My Organization"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Building awesome things together"
                rows={3}
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="avatarUrl">Avatar URL</Label>
              <Input
                id="avatarUrl"
                type="url"
                value={formData.avatarUrl}
                onChange={(e) => setFormData({ ...formData, avatarUrl: e.target.value })}
                placeholder="https://example.com/avatar.png"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="url"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="https://example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="San Francisco, CA"
              />
            </div>

            {error && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            <div className="flex items-center gap-4">
              <Button type="submit" disabled={updateOrg.isPending}>
                {updateOrg.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save changes
              </Button>
              {saveSuccess && (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <Check className="h-4 w-4" />
                  Saved successfully
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Members link */}
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Manage who has access to this organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to={`/org/${slug}/members`}>
            <Button variant="outline">Manage members</Button>
          </Link>
        </CardContent>
      </Card>

      {/* Teams link */}
      <Card>
        <CardHeader>
          <CardTitle>Teams</CardTitle>
          <CardDescription>
            Organize members into teams for easier permission management.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link to={`/org/${slug}/teams`}>
            <Button variant="outline">Manage teams</Button>
          </Link>
        </CardContent>
      </Card>

      {/* Danger zone */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
            <CardDescription>
              Irreversible and destructive actions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 border border-destructive/50 rounded-lg">
              <div>
                <div className="font-medium">Delete this organization</div>
                <p className="text-sm text-muted-foreground">
                  This will permanently delete the organization and all its repositories.
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteOrg.isPending}
              >
                {deleteOrg.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Delete organization
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
