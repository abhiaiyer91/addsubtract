import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AppWindow,
  Plus,
  Trash2,
  Loader2,
  ChevronLeft,
  Copy,
  Check,
  ExternalLink,
  MoreVertical,
  Eye,
  EyeOff,
  Users,
  Globe,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';


export function OAuthAppsPage() {
  const { data: session, isPending: sessionPending } = useSession();
  const user = session?.user;

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [callbackUrl, setCallbackUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [newApp, setNewApp] = useState<{
    clientId: string;
    clientSecret: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const utils = trpc.useUtils();

  const { data: apps, isLoading: appsLoading } = trpc.oauthApps.list.useQuery(
    undefined,
    { enabled: !!user }
  );

  const createApp = trpc.oauthApps.create.useMutation({
    onSuccess: (data) => {
      setNewApp({
        clientId: data.clientId,
        clientSecret: data.clientSecret,
      });
      setError(null);
      utils.oauthApps.list.invalidate();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const deleteApp = trpc.oauthApps.delete.useMutation({
    onSuccess: () => {
      utils.oauthApps.list.invalidate();
    },
  });

  const handleCreateApp = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!callbackUrl.trim()) {
      setError('Callback URL is required');
      return;
    }

    try {
      new URL(callbackUrl);
    } catch {
      setError('Callback URL must be a valid URL');
      return;
    }

    createApp.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      callbackUrl: callbackUrl.trim(),
      websiteUrl: websiteUrl.trim() || undefined,
    });
  };

  const handleDeleteApp = (id: string, appName: string) => {
    if (confirm(`Are you sure you want to delete "${appName}"? This action cannot be undone.`)) {
      deleteApp.mutate({ id });
    }
  };

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleCloseNewAppDialog = () => {
    setNewApp(null);
    setIsCreateDialogOpen(false);
    setName('');
    setDescription('');
    setCallbackUrl('');
    setWebsiteUrl('');
    setShowSecret(false);
  };

  if (sessionPending) {
    return <Loading text="Loading..." />;
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Please sign in to access developer settings.</p>
      </div>
    );
  }

  return (
    <div className="container max-w-[1200px] mx-auto py-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link to="/settings" className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" />
          Settings
        </Link>
        <span className="text-muted-foreground">/</span>
        <span>Developer Settings</span>
        <span className="text-muted-foreground">/</span>
        <span>OAuth Apps</span>
      </div>

      <div>
        <h1 className="text-3xl font-bold">OAuth Apps</h1>
        <p className="text-muted-foreground mt-1">
          Create and manage OAuth applications that integrate with Wit.
        </p>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex gap-3">
        <Shield className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-blue-500">Build integrations with Wit</p>
          <p className="text-muted-foreground mt-1">
            OAuth apps allow third-party applications to access the Wit API on behalf of users.
            Users will be asked to authorize your app before granting access.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Your OAuth Apps</CardTitle>
            <CardDescription>
              Applications you've registered for OAuth integration.
            </CardDescription>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
            if (!open) {
              handleCloseNewAppDialog();
            } else {
              setIsCreateDialogOpen(true);
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                New OAuth App
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              {newApp ? (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-green-500">
                      <Check className="h-5 w-5" />
                      OAuth App Created
                    </DialogTitle>
                    <DialogDescription>
                      Save your client credentials now. The client secret will only be shown once!
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <div className="space-y-2">
                      <Label>Client ID</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          readOnly
                          value={newApp.clientId}
                          className="font-mono text-sm"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleCopy(newApp.clientId, 'clientId')}
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
                        <div className="relative flex-1">
                          <Input
                            readOnly
                            type={showSecret ? 'text' : 'password'}
                            value={newApp.clientSecret}
                            className="font-mono text-sm pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full"
                            onClick={() => setShowSecret(!showSecret)}
                          >
                            {showSecret ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleCopy(newApp.clientSecret, 'clientSecret')}
                        >
                          {copiedField === 'clientSecret' ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-amber-500">
                        Make sure to copy this secret now. You won't be able to see it again!
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCloseNewAppDialog}>Done</Button>
                  </DialogFooter>
                </>
              ) : (
                <form onSubmit={handleCreateApp}>
                  <DialogHeader>
                    <DialogTitle>Register a New OAuth App</DialogTitle>
                    <DialogDescription>
                      Create an OAuth application to integrate with the Wit API.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Application Name *</Label>
                      <Input
                        id="name"
                        placeholder="My Awesome App"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        This will be displayed to users during authorization.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        placeholder="A brief description of what your app does"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="websiteUrl">Homepage URL</Label>
                      <Input
                        id="websiteUrl"
                        type="url"
                        placeholder="https://example.com"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="callbackUrl">Authorization Callback URL *</Label>
                      <Input
                        id="callbackUrl"
                        type="url"
                        placeholder="https://example.com/auth/callback"
                        value={callbackUrl}
                        onChange={(e) => setCallbackUrl(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Users will be redirected here after authorization.
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
                      onClick={() => setIsCreateDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createApp.isPending}>
                      {createApp.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Register Application
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {appsLoading ? (
            <div className="py-8">
              <Loading text="Loading apps..." />
            </div>
          ) : !apps || apps.length === 0 ? (
            <EmptyState
              icon={AppWindow}
              title="No OAuth Apps"
              description="Register an OAuth app to start building integrations with Wit."
            />
          ) : (
            <div className="divide-y">
              {apps.map((app) => (
                <OAuthAppRow
                  key={app.id}
                  app={app}
                  onDelete={() => handleDeleteApp(app.id, app.name)}
                  isDeleting={deleteApp.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface OAuthAppRowProps {
  app: {
    id: string;
    name: string;
    description: string | null;
    clientId: string;
    clientSecretPrefix: string;
    callbackUrl: string;
    websiteUrl: string | null;
    logoUrl: string | null;
    isPublished: boolean;
    isVerified: boolean;
    installationsCount: number;
    createdAt: Date | string;
  };
  onDelete: () => void;
  isDeleting: boolean;
}

function OAuthAppRow({ app, onDelete, isDeleting }: OAuthAppRowProps) {
  const navigate = useNavigate();
  const [copiedClientId, setCopiedClientId] = useState(false);

  const handleCopyClientId = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(app.clientId);
    setCopiedClientId(true);
    setTimeout(() => setCopiedClientId(false), 2000);
  };

  return (
    <div
      className="flex items-center justify-between py-4 first:pt-0 last:pb-0 cursor-pointer hover:bg-muted/50 -mx-6 px-6 transition-colors"
      onClick={() => navigate(`/settings/oauth-apps/${app.id}`)}
    >
      <div className="flex items-start gap-3">
        <div className="mt-1 p-2 bg-muted rounded-md">
          {app.logoUrl ? (
            <img src={app.logoUrl} alt={app.name} className="h-6 w-6 rounded" />
          ) : (
            <AppWindow className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{app.name}</span>
            {app.isVerified && (
              <Badge variant="success" className="text-xs">
                Verified
              </Badge>
            )}
            {app.isPublished && (
              <Badge variant="secondary" className="text-xs">
                Published
              </Badge>
            )}
          </div>
          {app.description && (
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">
              {app.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <button
              onClick={handleCopyClientId}
              className="font-mono hover:text-foreground flex items-center gap-1"
            >
              {app.clientId.slice(0, 20)}...
              {copiedClientId ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {app.installationsCount} {app.installationsCount === 1 ? 'user' : 'users'}
            </span>
            {app.websiteUrl && (
              <a
                href={app.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <Globe className="h-3 w-3" />
                Website
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={(e) => {
            e.stopPropagation();
            navigate(`/settings/oauth-apps/${app.id}`);
          }}>
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={isDeleting}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete App
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
