import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  AppWindow,
  Trash2,
  Loader2,
  Copy,
  Check,
  RefreshCw,
  Eye,
  EyeOff,
  Users,
  AlertTriangle,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loading } from '@/components/ui/loading';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatDate } from '@/lib/utils';

export function OAuthAppDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: session, isPending: sessionPending } = useSession();
  const user = session?.user;

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    callbackUrl: '',
    websiteUrl: '',
    logoUrl: '',
    privacyPolicyUrl: '',
    termsOfServiceUrl: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [showNewSecret, setShowNewSecret] = useState(false);
  const [isRegenerateDialogOpen, setIsRegenerateDialogOpen] = useState(false);

  const utils = trpc.useUtils();

  const { data: app, isLoading: appLoading } = trpc.oauthApps.get.useQuery(
    { id: id! },
    { enabled: !!user && !!id }
  );

  const updateApp = trpc.oauthApps.update.useMutation({
    onSuccess: () => {
      setSaveSuccess(true);
      setError(null);
      utils.oauthApps.get.invalidate({ id: id! });
      setTimeout(() => setSaveSuccess(false), 3000);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const deleteApp = trpc.oauthApps.delete.useMutation({
    onSuccess: () => {
      navigate('/settings/oauth-apps');
    },
  });

  const regenerateSecret = trpc.oauthApps.regenerateSecret.useMutation({
    onSuccess: (data) => {
      setNewSecret(data.clientSecret);
      setIsRegenerateDialogOpen(false);
      utils.oauthApps.get.invalidate({ id: id! });
    },
  });

  const publishApp = trpc.oauthApps.publish.useMutation({
    onSuccess: () => {
      utils.oauthApps.get.invalidate({ id: id! });
    },
  });

  const unpublishApp = trpc.oauthApps.unpublish.useMutation({
    onSuccess: () => {
      utils.oauthApps.get.invalidate({ id: id! });
    },
  });

  // Update form when app data loads
  useEffect(() => {
    if (app) {
      setFormData({
        name: app.name || '',
        description: app.description || '',
        callbackUrl: app.callbackUrl || '',
        websiteUrl: app.websiteUrl || '',
        logoUrl: app.logoUrl || '',
        privacyPolicyUrl: app.privacyPolicyUrl || '',
        termsOfServiceUrl: app.termsOfServiceUrl || '',
      });
    }
  }, [app]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!formData.callbackUrl.trim()) {
      setError('Callback URL is required');
      return;
    }

    try {
      new URL(formData.callbackUrl);
    } catch {
      setError('Callback URL must be a valid URL');
      return;
    }

    updateApp.mutate({
      id: id!,
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      callbackUrl: formData.callbackUrl.trim(),
      websiteUrl: formData.websiteUrl.trim() || null,
      logoUrl: formData.logoUrl.trim() || null,
      privacyPolicyUrl: formData.privacyPolicyUrl.trim() || null,
      termsOfServiceUrl: formData.termsOfServiceUrl.trim() || null,
    });
  };

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleDelete = () => {
    deleteApp.mutate({ id: id! });
  };

  if (sessionPending || appLoading) {
    return <Loading text="Loading..." />;
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Please sign in to access developer settings.</p>
      </div>
    );
  }

  if (!app) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">OAuth app not found.</p>
        <Link to="/settings/oauth-apps" className="text-primary hover:underline mt-2 inline-block">
          Back to OAuth Apps
        </Link>
      </div>
    );
  }

  return (
    <div className="container max-w-[1200px] mx-auto py-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link to="/settings" className="text-muted-foreground hover:text-foreground">
          Settings
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link to="/settings/oauth-apps" className="text-muted-foreground hover:text-foreground">
          OAuth Apps
        </Link>
        <span className="text-muted-foreground">/</span>
        <span>{app.name}</span>
      </div>

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-muted rounded-lg">
            {app.logoUrl ? (
              <img src={app.logoUrl} alt={app.name} className="h-12 w-12 rounded" />
            ) : (
              <AppWindow className="h-12 w-12 text-muted-foreground" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{app.name}</h1>
              {app.isVerified && (
                <Badge variant="success">Verified</Badge>
              )}
              {app.isPublished && (
                <Badge variant="secondary">Published</Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              {app.installationsCount} {app.installationsCount === 1 ? 'user' : 'users'} authorized
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {app.isPublished ? (
            <Button
              variant="outline"
              onClick={() => unpublishApp.mutate({ id: id! })}
              disabled={unpublishApp.isPending}
            >
              {unpublishApp.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Unpublish
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => publishApp.mutate({ id: id! })}
              disabled={publishApp.isPending}
            >
              {publishApp.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Publish
            </Button>
          )}
        </div>
      </div>

      {/* New Secret Dialog */}
      <Dialog open={!!newSecret} onOpenChange={() => setNewSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-500">
              <Check className="h-5 w-5" />
              New Client Secret Generated
            </DialogTitle>
            <DialogDescription>
              Make sure to copy your new client secret now. You won't be able to see it again!
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  readOnly
                  type={showNewSecret ? 'text' : 'password'}
                  value={newSecret || ''}
                  className="font-mono text-sm pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowNewSecret(!showNewSecret)}
                >
                  {showNewSecret ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleCopy(newSecret!, 'newSecret')}
              >
                {copiedField === 'newSecret' ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setNewSecret(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          {/* Client Credentials */}
          <Card>
            <CardHeader>
              <CardTitle>Client Credentials</CardTitle>
              <CardDescription>
                Use these credentials to authenticate with the OAuth API.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Client ID</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={app.clientId} className="font-mono text-sm" />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopy(app.clientId, 'clientId')}
                  >
                    {copiedField === 'clientId' ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Client Secret</Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={`${app.clientSecretPrefix}${'•'.repeat(32)}`}
                    className="font-mono text-sm"
                  />
                  <AlertDialog open={isRegenerateDialogOpen} onOpenChange={setIsRegenerateDialogOpen}>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Regenerate
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Regenerate Client Secret?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will invalidate your current client secret. Any applications using
                          the old secret will need to be updated with the new one.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => regenerateSecret.mutate({ id: id! })}
                          disabled={regenerateSecret.isPending}
                        >
                          {regenerateSecret.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Regenerate
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <p className="text-xs text-muted-foreground">
                  For security, only the first 12 characters are shown.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* App Settings Form */}
          <Card>
            <CardHeader>
              <CardTitle>Application Settings</CardTitle>
              <CardDescription>
                Update your OAuth app's information.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Application Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="callbackUrl">Authorization Callback URL *</Label>
                  <Input
                    id="callbackUrl"
                    type="url"
                    value={formData.callbackUrl}
                    onChange={(e) => setFormData({ ...formData, callbackUrl: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="websiteUrl">Homepage URL</Label>
                  <Input
                    id="websiteUrl"
                    type="url"
                    value={formData.websiteUrl}
                    onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="logoUrl">Logo URL</Label>
                  <Input
                    id="logoUrl"
                    type="url"
                    value={formData.logoUrl}
                    onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                    placeholder="https://example.com/logo.png"
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="privacyPolicyUrl">Privacy Policy URL</Label>
                  <Input
                    id="privacyPolicyUrl"
                    type="url"
                    value={formData.privacyPolicyUrl}
                    onChange={(e) => setFormData({ ...formData, privacyPolicyUrl: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="termsOfServiceUrl">Terms of Service URL</Label>
                  <Input
                    id="termsOfServiceUrl"
                    type="url"
                    value={formData.termsOfServiceUrl}
                    onChange={(e) => setFormData({ ...formData, termsOfServiceUrl: e.target.value })}
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                    {error}
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex items-center gap-4">
                <Button type="submit" disabled={updateApp.isPending}>
                  {updateApp.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
                {saveSuccess && (
                  <span className="text-sm text-green-500 flex items-center gap-1">
                    <Check className="h-4 w-4" />
                    Saved successfully
                  </span>
                )}
              </CardFooter>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">About</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-muted-foreground">Created</div>
                <div>{formatDate(app.createdAt)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Last Updated</div>
                <div>{formatDate(app.updatedAt)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Authorized Users</div>
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {app.installationsCount}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* OAuth URLs */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">OAuth URLs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <div className="text-muted-foreground">Authorization URL</div>
                <code className="text-xs bg-muted px-2 py-1 rounded block mt-1 break-all">
                  {window.location.origin}/oauth/authorize
                </code>
              </div>
              <div>
                <div className="text-muted-foreground">Token URL</div>
                <code className="text-xs bg-muted px-2 py-1 rounded block mt-1 break-all">
                  {window.location.origin}/oauth/token
                </code>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-base text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Deleting this application will revoke all authorizations and tokens.
                This action cannot be undone.
              </p>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Application
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete OAuth Application?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete "{app.name}" and revoke all user authorizations.
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={deleteApp.isPending}
                    >
                      {deleteApp.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Delete Application
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
