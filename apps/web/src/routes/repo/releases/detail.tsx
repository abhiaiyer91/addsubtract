import { useParams, Link, useNavigate } from 'react-router-dom';
import { Tag, Package, FileDown, Clock, ChevronLeft, Edit2, Trash2, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { RepoLayout } from '../components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime } from '@/lib/utils';
import { MarkdownRenderer } from '@/components/markdown/renderer';

export function ReleaseDetailPage() {
  const { owner, repo, tag } = useParams<{ owner: string; repo: string; tag: string }>();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  const utils = trpc.useUtils();

  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  const { data: release, isLoading: releaseLoading } = trpc.releases.getByTag.useQuery(
    { repoId: repoData?.repo.id!, tagName: tag! },
    { enabled: !!repoData?.repo.id && !!tag }
  );

  const { data: assets } = trpc.releases.assets.list.useQuery(
    { releaseId: release?.id! },
    { enabled: !!release?.id }
  );

  // Check if user has write permission (owner or collaborator with write access)
  const { data: permissionData } = trpc.collaborators.checkPermission.useQuery(
    { repoId: repoData?.repo.id!, permission: 'write' },
    { enabled: !!repoData?.repo.id && authenticated }
  );

  const canWrite = permissionData?.hasPermission ?? false;

  const publishRelease = trpc.releases.publish.useMutation({
    onSuccess: () => {
      utils.releases.getByTag.invalidate({ repoId: repoData?.repo.id!, tagName: tag! });
    },
  });

  const deleteRelease = trpc.releases.delete.useMutation({
    onSuccess: () => {
      navigate(`/${owner}/${repo}/releases`);
    },
  });

  const handlePublish = () => {
    if (!release?.id) return;
    publishRelease.mutate({ id: release.id });
  };

  const handleDelete = () => {
    if (!release?.id) return;
    if (confirm('Are you sure you want to delete this release?')) {
      deleteRelease.mutate({ id: release.id });
    }
  };

  const isLoading = repoLoading || releaseLoading;

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading release..." />
      </RepoLayout>
    );
  }

  if (!repoData?.repo || !release) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Release not found.</p>
          <Link to={`/${owner}/${repo}/releases`}>
            <Button variant="outline" className="mt-4">
              Back to releases
            </Button>
          </Link>
        </div>
      </RepoLayout>
    );
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link
            to={`/${owner}/${repo}/releases`}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Releases
          </Link>
          <span className="text-muted-foreground">/</span>
          <span>{release.tagName}</span>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl font-bold">
                    {release.name || release.tagName}
                  </h1>
                  {release.isDraft && (
                    <Badge variant="secondary">Draft</Badge>
                  )}
                  {release.isPrerelease && !release.isDraft && (
                    <Badge variant="warning">Pre-release</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
                  <Tag className="h-4 w-4" />
                  <span className="font-mono">{release.tagName}</span>
                  {(release as any).author?.username && (
                    <>
                      <span>·</span>
                      <Link
                        to={`/${(release as any).author.username}`}
                        className="hover:text-foreground"
                      >
                        @{(release as any).author.username}
                      </Link>
                    </>
                  )}
                  <span>·</span>
                  <Clock className="h-4 w-4" />
                  <span>
                    {release.isDraft
                      ? `Created ${formatRelativeTime(release.createdAt)}`
                      : `Released ${formatRelativeTime(release.publishedAt || release.createdAt)}`}
                  </span>
                </div>
              </div>

              {authenticated && canWrite && (
                <div className="flex items-center gap-2">
                  {release.isDraft && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePublish}
                      disabled={publishRelease.isPending}
                      className="gap-2"
                    >
                      {publishRelease.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Publish
                    </Button>
                  )}
                  <Link to={`/${owner}/${repo}/releases/edit/${release.id}`}>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Edit2 className="h-4 w-4" />
                      Edit
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleteRelease.isPending}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    {deleteRelease.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              )}
            </div>

            {release.body && (
              <div className="mt-6 prose prose-sm dark:prose-invert max-w-none border-t pt-6">
                <MarkdownRenderer content={release.body} />
              </div>
            )}

            {assets && assets.length > 0 && (
              <div className="mt-8 border-t pt-6">
                <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Assets
                  <Badge variant="secondary">{assets.length}</Badge>
                </h3>
                <div className="space-y-2">
                  {assets.map((asset: any) => (
                    <a
                      key={asset.id}
                      href={asset.downloadUrl}
                      className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <FileDown className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                        <div>
                          <span className="font-mono">{asset.name}</span>
                          <span className="text-muted-foreground ml-2">
                            ({formatFileSize(asset.size)})
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {asset.downloadCount.toLocaleString()} downloads
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </RepoLayout>
  );
}
