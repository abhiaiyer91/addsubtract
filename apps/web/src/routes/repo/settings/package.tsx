import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Package,
  Loader2,
  Check,
  AlertCircle,
  Copy,
  ExternalLink,
  Tag,
  Download,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loading } from '@/components/ui/loading';
import { RepoLayout } from '../components/repo-layout';
import { SettingsLayout } from './layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/ui/use-toast';
import { formatDistanceToNow } from 'date-fns';

export function PackageSettingsPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;
  const { toast } = useToast();

  // Local state
  const [packageName, setPackageName] = useState('');
  const [packageScope, setPackageScope] = useState('');
  const [publishOnRelease, setPublishOnRelease] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);

  const utils = trpc.useUtils();

  // Get repository info
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo && authenticated }
  );

  // Get package info for this repo
  const { data: packageData, isLoading: packageLoading } = trpc.packages.getByRepoId.useQuery(
    { repoId: repoData?.id ?? '' },
    { enabled: !!repoData?.id }
  );

  // Initialize form state from package data
  useEffect(() => {
    if (packageData) {
      setIsEnabled(true);
      setPackageName(packageData.name);
      setPackageScope(packageData.scope ?? '');
      setPublishOnRelease(packageData.publishOnRelease ?? false);
    } else if (repoData) {
      // Default values for new package
      setIsEnabled(false);
      setPackageName(repoData.name);
      setPackageScope(owner ?? '');
      setPublishOnRelease(false);
    }
  }, [packageData, repoData, owner]);

  // Enable package mutation
  const enableMutation = trpc.packages.enableForRepo.useMutation({
    onSuccess: (data) => {
      toast({
        title: 'Package registry enabled',
        description: `Package ${data.fullName} is now available.`,
      });
      utils.packages.getByRepoId.invalidate({ repoId: repoData?.id ?? '' });
    },
    onError: (err) => {
      toast({
        title: 'Failed to enable package registry',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Disable package mutation
  const disableMutation = trpc.packages.disableForRepo.useMutation({
    onSuccess: () => {
      toast({
        title: 'Package registry disabled',
        description: 'Package registry has been disabled for this repository.',
      });
      setIsEnabled(false);
      utils.packages.getByRepoId.invalidate({ repoId: repoData?.id ?? '' });
    },
    onError: (err) => {
      toast({
        title: 'Failed to disable package registry',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  // Update package mutation
  const updateMutation = trpc.packages.update.useMutation({
    onSuccess: () => {
      toast({
        title: 'Package settings updated',
        description: 'Your package settings have been saved.',
      });
      utils.packages.getByRepoId.invalidate({ repoId: repoData?.id ?? '' });
    },
    onError: (err) => {
      toast({
        title: 'Failed to update package',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const handleEnableToggle = async (enabled: boolean) => {
    if (!repoData) return;

    if (enabled) {
      enableMutation.mutate({
        repoId: repoData.id,
        name: packageName,
        scope: packageScope || null,
        publishOnRelease,
      });
    } else {
      if (
        packageData?.versions &&
        packageData.versions.length > 0 &&
        !confirm(
          'This package has published versions. Disabling will unlink it from this repository but keep the package available. Continue?'
        )
      ) {
        return;
      }
      disableMutation.mutate({ repoId: repoData.id });
    }
    setIsEnabled(enabled);
  };

  const handleSave = () => {
    if (!packageData) return;

    updateMutation.mutate({
      id: packageData.id,
      // Note: name and scope can't be changed after creation for safety
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied to clipboard',
      description: text,
    });
  };

  const fullPackageName = packageScope ? `@${packageScope}/${packageName}` : packageName;
  const registryUrl = `${window.location.origin}/api/packages`;
  const isLoading = repoLoading || packageLoading;
  const isMutating = enableMutation.isPending || disableMutation.isPending || updateMutation.isPending;

  if (!authenticated) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Please sign in to access settings.</p>
        </div>
      </RepoLayout>
    );
  }

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading package settings..." />
      </RepoLayout>
    );
  }

  if (!repoData) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Repository not found.</p>
        </div>
      </RepoLayout>
    );
  }

  // Only owners can manage package settings
  const isOwner = session?.user?.id === repoData.ownerId;
  if (!isOwner) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <SettingsLayout>
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Package Registry</h2>
              <p className="text-muted-foreground mt-1">
                Publish this repository as an npm package.
              </p>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Only the repository owner can manage package registry settings.
              </AlertDescription>
            </Alert>
          </div>
        </SettingsLayout>
      </RepoLayout>
    );
  }

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <SettingsLayout>
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">Package Registry</h2>
            <p className="text-muted-foreground mt-1">
              Publish this repository as an npm-compatible package that others can install.
            </p>
          </div>

          {/* Enable/Disable Toggle Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded-md">
                    <Package className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">Enable Package Registry</CardTitle>
                    <CardDescription>
                      Allow this repository to be published and installed as an npm package.
                    </CardDescription>
                  </div>
                </div>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={handleEnableToggle}
                  disabled={isMutating}
                />
              </div>
            </CardHeader>
          </Card>

          {/* Package Configuration */}
          {isEnabled && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Package Configuration</CardTitle>
                  <CardDescription>
                    Configure your package name and settings.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Package Name */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="scope">Scope (optional)</Label>
                      <div className="flex items-center">
                        <span className="text-muted-foreground mr-1">@</span>
                        <Input
                          id="scope"
                          placeholder="username"
                          value={packageScope}
                          onChange={(e) => setPackageScope(e.target.value)}
                          disabled={!!packageData} // Can't change after creation
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Scopes help organize packages (e.g., @myorg/package)
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="name">Package Name</Label>
                      <Input
                        id="name"
                        placeholder="my-package"
                        value={packageName}
                        onChange={(e) => setPackageName(e.target.value)}
                        disabled={!!packageData} // Can't change after creation
                      />
                      <p className="text-xs text-muted-foreground">
                        The name users will use to install your package
                      </p>
                    </div>
                  </div>

                  {/* Full Package Name Preview */}
                  <div className="p-3 bg-muted rounded-md">
                    <div className="text-sm text-muted-foreground mb-1">Package Name</div>
                    <div className="font-mono text-lg">{fullPackageName}</div>
                  </div>

                  {/* Auto-publish on Release */}
                  <div className="flex items-center justify-between py-3 border-t">
                    <div>
                      <div className="font-medium">Auto-publish on Release</div>
                      <div className="text-sm text-muted-foreground">
                        Automatically publish a new version when you create a git release/tag.
                      </div>
                    </div>
                    <Switch
                      checked={publishOnRelease}
                      onCheckedChange={setPublishOnRelease}
                      disabled={!packageData}
                    />
                  </div>

                  {packageData && (
                    <Button onClick={handleSave} disabled={isMutating}>
                      {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save Changes
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Installation Instructions */}
              <Card>
                <CardHeader>
                  <CardTitle>Installation</CardTitle>
                  <CardDescription>
                    How to install this package from Wit's registry.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Configure registry */}
                  <div className="space-y-2">
                    <Label>1. Configure npm registry (one-time setup)</Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-3 bg-muted rounded-md text-sm font-mono overflow-x-auto">
                        npm config set {packageScope ? `@${packageScope}:registry` : 'registry'} {registryUrl}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          copyToClipboard(
                            `npm config set ${packageScope ? `@${packageScope}:registry` : 'registry'} ${registryUrl}`
                          )
                        }
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Install command */}
                  <div className="space-y-2">
                    <Label>2. Install the package</Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-3 bg-muted rounded-md text-sm font-mono">
                        npm install {fullPackageName}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(`npm install ${fullPackageName}`)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* .npmrc alternative */}
                  <div className="space-y-2">
                    <Label>Alternative: Add to .npmrc</Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-3 bg-muted rounded-md text-sm font-mono">
                        {packageScope ? `@${packageScope}:registry` : 'registry'}={registryUrl}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          copyToClipboard(
                            `${packageScope ? `@${packageScope}:registry` : 'registry'}=${registryUrl}`
                          )
                        }
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Publishing Instructions */}
              <Card>
                <CardHeader>
                  <CardTitle>Publishing</CardTitle>
                  <CardDescription>
                    How to publish new versions of your package.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>1. Login to Wit registry</Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-3 bg-muted rounded-md text-sm font-mono">
                        npm login --registry={registryUrl}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(`npm login --registry=${registryUrl}`)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>2. Publish your package</Label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-3 bg-muted rounded-md text-sm font-mono">
                        npm publish --registry={registryUrl}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyToClipboard(`npm publish --registry=${registryUrl}`)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <Alert>
                    <Check className="h-4 w-4" />
                    <AlertDescription>
                      Make sure your package.json has the name set to{' '}
                      <code className="font-mono bg-muted px-1 rounded">{fullPackageName}</code>
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>

              {/* Published Versions */}
              {packageData?.versions && packageData.versions.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Published Versions</CardTitle>
                    <CardDescription>
                      All versions of this package that have been published.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="divide-y">
                      {packageData.versions.map((version) => (
                        <div
                          key={version.id}
                          className="py-3 first:pt-0 last:pb-0 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <Badge variant="secondary" className="font-mono">
                              <Tag className="h-3 w-3 mr-1" />
                              {version.version}
                            </Badge>
                            {packageData.distTags?.some(
                              (dt) => dt.version === version.version && dt.tag === 'latest'
                            ) && (
                              <Badge variant="default" className="text-xs">
                                latest
                              </Badge>
                            )}
                            {version.deprecated && (
                              <Badge variant="destructive" className="text-xs">
                                deprecated
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Download className="h-3 w-3" />
                              {version.downloadCount?.toLocaleString() ?? 0}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDistanceToNow(new Date(version.publishedAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* No versions yet */}
              {packageData && (!packageData.versions || packageData.versions.length === 0) && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No versions have been published yet. Follow the publishing instructions above
                    to publish your first version.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}

          {/* Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">About Package Registry</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                The package registry allows you to publish your repository as an npm-compatible
                package. Others can install your package using npm, yarn, or pnpm.
              </p>
              <p>
                Private repositories will create private packages that require authentication to
                install. Public repositories create public packages anyone can install.
              </p>
              <p>
                Package versions are immutable - once published, a version cannot be modified or
                republished. You can deprecate versions but not delete them.
              </p>
            </CardContent>
          </Card>
        </div>
      </SettingsLayout>
    </RepoLayout>
  );
}
