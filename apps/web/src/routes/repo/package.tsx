import { useParams, Link } from 'react-router-dom';
import {
  Package,
  Tag,
  Download,
  Clock,
  Copy,
  ExternalLink,
  ChevronLeft,
  AlertCircle,
  FileCode,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { RepoLayout } from './components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/ui/use-toast';
import { formatDistanceToNow } from 'date-fns';
import { MarkdownRenderer } from '@/components/markdown/renderer';

export function PackagePage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { data: session } = useSession();
  const { toast } = useToast();

  // Get repository info
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Get package info for this repo
  const { data: packageData, isLoading: packageLoading } = trpc.packages.getByRepoId.useQuery(
    { repoId: repoData?.repo.id ?? '' },
    { enabled: !!repoData?.repo.id }
  );

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied to clipboard',
      description: text,
    });
  };

  const isLoading = repoLoading || packageLoading;
  const registryUrl = `${window.location.origin}/api/packages`;

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading package..." />
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

  if (!packageData) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <EmptyState
          icon={Package}
          title="No package published"
          description="This repository doesn't have a package published yet."
          action={
            session?.user?.id === repoData.repo.ownerId ? (
              <Link to={`/${owner}/${repo}/settings/package`}>
                <Button>Enable Package Registry</Button>
              </Link>
            ) : undefined
          }
        />
      </RepoLayout>
    );
  }

  const fullPackageName = packageData.fullName;
  const latestVersion = packageData.versions?.[0];
  const isOwner = session?.user?.id === repoData.repo.ownerId;

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="space-y-6">
        {/* Package Header */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <Package className="h-6 w-6 text-muted-foreground" />
                  <h1 className="text-2xl font-bold font-mono">{fullPackageName}</h1>
                  {latestVersion && (
                    <Badge variant="secondary" className="font-mono">
                      v{latestVersion.version}
                    </Badge>
                  )}
                  {packageData.deprecated && (
                    <Badge variant="destructive">Deprecated</Badge>
                  )}
                </div>

                {packageData.description && (
                  <p className="mt-3 text-muted-foreground">{packageData.description}</p>
                )}

                <div className="flex items-center gap-4 mt-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Download className="h-4 w-4" />
                    {packageData.downloadCount?.toLocaleString() ?? 0} downloads
                  </span>
                  {latestVersion && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      Last published{' '}
                      {formatDistanceToNow(new Date(latestVersion.publishedAt), {
                        addSuffix: true,
                      })}
                    </span>
                  )}
                  {packageData.license && (
                    <span className="flex items-center gap-1">
                      <FileCode className="h-4 w-4" />
                      {packageData.license}
                    </span>
                  )}
                </div>
              </div>

              {isOwner && (
                <Link to={`/${owner}/${repo}/settings/package`}>
                  <Button variant="outline" size="sm">
                    Settings
                  </Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* README */}
            {packageData.readme ? (
              <Card>
                <CardHeader>
                  <CardTitle>README</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <MarkdownRenderer content={packageData.readme} />
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <FileCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No README available</p>
                </CardContent>
              </Card>
            )}

            {/* Versions */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Versions</CardTitle>
                  <Badge variant="secondary">
                    {packageData.versions?.length ?? 0} versions
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {packageData.versions && packageData.versions.length > 0 ? (
                  <div className="divide-y">
                    {packageData.versions.map((version) => {
                      const isLatest = packageData.distTags?.some(
                        (dt) => dt.version === version.version && dt.tag === 'latest'
                      );
                      return (
                        <div
                          key={version.id}
                          className="py-3 first:pt-0 last:pb-0 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="font-mono">
                              <Tag className="h-3 w-3 mr-1" />
                              {version.version}
                            </Badge>
                            {isLatest && (
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
                            <span>
                              {formatDistanceToNow(new Date(version.publishedAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    icon={Tag}
                    title="No versions published"
                    description="This package doesn't have any versions published yet."
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Install */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Install</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">npm</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-muted rounded text-sm font-mono truncate">
                      npm i {fullPackageName}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => copyToClipboard(`npm i ${fullPackageName}`)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">yarn</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-muted rounded text-sm font-mono truncate">
                      yarn add {fullPackageName}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => copyToClipboard(`yarn add ${fullPackageName}`)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground mb-1">pnpm</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-muted rounded text-sm font-mono truncate">
                      pnpm add {fullPackageName}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => copyToClipboard(`pnpm add ${fullPackageName}`)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="pt-2 border-t text-xs text-muted-foreground">
                  <p className="mb-1">Registry:</p>
                  <code className="block p-2 bg-muted rounded font-mono text-xs break-all">
                    {registryUrl}
                  </code>
                </div>
              </CardContent>
            </Card>

            {/* Repository */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Repository</CardTitle>
              </CardHeader>
              <CardContent>
                <Link
                  to={`/${owner}/${repo}`}
                  className="flex items-center gap-2 text-sm hover:text-primary"
                >
                  <ExternalLink className="h-4 w-4" />
                  {owner}/{repo}
                </Link>
              </CardContent>
            </Card>

            {/* Keywords */}
            {packageData.keywords && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Keywords</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {JSON.parse(packageData.keywords).map((keyword: string) => (
                      <Badge key={keyword} variant="secondary">
                        {keyword}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Dist Tags */}
            {packageData.distTags && packageData.distTags.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Dist Tags</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {packageData.distTags.map((dt) => (
                      <div
                        key={dt.tag}
                        className="flex items-center justify-between text-sm"
                      >
                        <Badge variant="outline">{dt.tag}</Badge>
                        <span className="font-mono text-muted-foreground">
                          {dt.version}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Deprecation Warning */}
            {packageData.deprecated && (
              <Card className="border-destructive">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                    <div>
                      <h4 className="font-medium text-destructive">Deprecated</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        {packageData.deprecated}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </RepoLayout>
  );
}
