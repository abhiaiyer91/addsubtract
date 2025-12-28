import { useParams, Link } from 'react-router-dom';
import { Tag, Plus, Package, FileDown, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { RepoLayout } from '../components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime } from '@/lib/utils';
import { MarkdownRenderer } from '@/components/markdown/renderer';

export function ReleasesPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  const { data: releasesData, isLoading: releasesLoading } = trpc.releases.list.useQuery(
    { repoId: repoData?.repo.id!, includeDrafts: true },
    { enabled: !!repoData?.repo.id }
  );

  const isLoading = repoLoading || releasesLoading;

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading releases..." />
      </RepoLayout>
    );
  }

  if (!repoData?.repo) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Repository not found.</p>
        </div>
      </RepoLayout>
    );
  }

  const releases = releasesData?.releases || [];
  const isOwner = session?.user?.id === repoData.repo.ownerId;

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Releases</h1>
            <p className="text-muted-foreground mt-1">
              Packaged versions of your software.
            </p>
          </div>
          {authenticated && isOwner && (
            <Link to={`/${owner}/${repo}/releases/new`}>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Draft a new release
              </Button>
            </Link>
          )}
        </div>

        {releases.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <EmptyState
                icon={Tag}
                title="No releases"
                description="Releases are used to distribute versions of your software."
                action={
                  authenticated && isOwner ? (
                    <Link to={`/${owner}/${repo}/releases/new`}>
                      <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        Create a release
                      </Button>
                    </Link>
                  ) : undefined
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {releases.map((release: any, index: number) => (
              <ReleaseCard
                key={release.id}
                release={release}
                owner={owner!}
                repo={repo!}
                isLatest={index === 0 && !release.isDraft && !release.isPrerelease}
                canEdit={authenticated && isOwner}
              />
            ))}
          </div>
        )}
      </div>
    </RepoLayout>
  );
}

interface ReleaseCardProps {
  release: {
    id: string;
    tagName: string;
    name: string;
    body: string | null;
    isDraft: boolean;
    isPrerelease: boolean;
    publishedAt: Date | string | null;
    createdAt: Date | string;
    author?: { username?: string | null } | null;
    assets?: Array<{
      id: string;
      name: string;
      size: number;
      downloadCount: number;
      downloadUrl: string;
    }>;
  };
  owner: string;
  repo: string;
  isLatest: boolean;
  canEdit: boolean;
}

function ReleaseCard({ release, owner, repo, isLatest, canEdit }: ReleaseCardProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <Link
                to={`/${owner}/${repo}/releases/tag/${release.tagName}`}
                className="text-xl font-semibold hover:text-primary transition-colors"
              >
                {release.name || release.tagName}
              </Link>
              {isLatest && (
                <Badge variant="success">Latest</Badge>
              )}
              {release.isDraft && (
                <Badge variant="secondary">Draft</Badge>
              )}
              {release.isPrerelease && !release.isDraft && (
                <Badge variant="warning">Pre-release</Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
              <Tag className="h-4 w-4" />
              <span className="font-mono">{release.tagName}</span>
              {release.author?.username && (
                <>
                  <span>·</span>
                  <Link
                    to={`/${release.author.username}`}
                    className="hover:text-foreground"
                  >
                    @{release.author.username}
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

            {release.body && (
              <div className="mt-4 prose prose-sm dark:prose-invert max-w-none">
                <MarkdownRenderer content={release.body} />
              </div>
            )}

            {release.assets && release.assets.length > 0 && (
              <div className="mt-6">
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Assets
                </h4>
                <div className="space-y-2">
                  {release.assets.map((asset) => (
                    <a
                      key={asset.id}
                      href={asset.downloadUrl}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <FileDown className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                        <span className="font-mono text-sm">{asset.name}</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{formatFileSize(asset.size)}</span>
                        <span>{asset.downloadCount.toLocaleString()} downloads</span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {canEdit && (
            <div className="ml-4">
              <Link to={`/${owner}/${repo}/releases/edit/${release.id}`}>
                <Button variant="outline" size="sm">
                  Edit
                </Button>
              </Link>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
