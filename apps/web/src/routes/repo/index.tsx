import { useParams, Link } from 'react-router-dom';
import { Copy, Check, Tag, Package, Star, GitFork, Eye } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileTree } from '@/components/repo/file-tree';
import { BranchSelector } from '@/components/repo/branch-selector';
import { Markdown } from '@/components/markdown/renderer';
import { RepoLayout } from './components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

export function RepoPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [copied, setCopied] = useState(false);
  const { data: session } = useSession();

  // Fetch repository data
  const { data: repoData } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch branches
  const { data: branches } = trpc.repos.getBranches.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch tree
  const { data: treeData } = trpc.repos.getTree.useQuery(
    {
      owner: owner!,
      repo: repo!,
      ref: repoData?.repo.defaultBranch || 'main',
      path: '',
    },
    { enabled: !!repoData }
  );

  // Fetch README
  const { data: readmeData } = trpc.repos.getFile.useQuery(
    {
      owner: owner!,
      repo: repo!,
      ref: repoData?.repo.defaultBranch || 'main',
      path: 'README.md',
    },
    { enabled: !!repoData }
  );

  // Fetch releases count
  const { data: releases } = trpc.releases.list.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  );

  // Fetch package info
  const { data: packageData } = trpc.packages.getByRepoId.useQuery(
    { repoId: repoData?.repo.id ?? '' },
    { enabled: !!repoData?.repo.id }
  );

  const repoInfo = repoData?.repo;
  const ownerInfo = repoData?.owner;
  const ownerUsername = (ownerInfo && 'username' in ownerInfo ? ownerInfo.username : null) || owner!;
  const tree = treeData?.entries || [];
  const treeError = treeData?.error;
  const readme = readmeData?.encoding === 'utf-8' ? readmeData.content : null;
  const isOwner = session?.user?.id === repoInfo?.ownerId;

  const cloneUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/${ownerUsername}/${repoInfo?.name || repo}.wit`;

  const handleCopyCloneUrl = async () => {
    await navigator.clipboard.writeText(cloneUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="flex gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Branch selector and actions */}
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              {branches && branches.length > 0 && (
                <BranchSelector
                  branches={branches}
                  currentRef={repoInfo?.defaultBranch || 'main'}
                  owner={ownerUsername}
                  repo={repoInfo?.name || repo!}
                />
              )}
              <Link
                to={`/${owner}/${repo}/branches`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                View all branches
              </Link>
            </div>

            {/* Clone button */}
            <div className="flex items-center gap-2">
              <div className="flex items-center border rounded-md">
                <code className="px-3 py-1.5 text-sm bg-muted rounded-l-md max-w-[300px] truncate">
                  {cloneUrl}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-l-none border-l"
                  onClick={handleCopyCloneUrl}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* File tree */}
          <FileTree
            entries={tree}
            owner={ownerUsername}
            repo={repoInfo?.name || repo!}
            currentRef={repoInfo?.defaultBranch || 'main'}
            error={treeError}
          />

          {/* README */}
          {readme && (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-muted/50 border-b">
                <span className="font-medium">README.md</span>
              </div>
              <div className="p-6">
                <Markdown content={readme} />
              </div>
            </div>
          )}
        </div>

        {/* About Sidebar */}
        <div className="hidden lg:block w-72 flex-shrink-0 space-y-4">
          {/* About */}
          <div className="border rounded-lg p-4 space-y-4">
            <h3 className="font-semibold text-sm">About</h3>
            
            {repoInfo?.description ? (
              <p className="text-sm text-muted-foreground">{repoInfo.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">No description provided</p>
            )}

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Star className="h-4 w-4" />
                {repoInfo?.starsCount ?? 0}
              </span>
              <span className="flex items-center gap-1">
                <GitFork className="h-4 w-4" />
                {repoInfo?.forksCount ?? 0}
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                {repoInfo?.watchersCount ?? 0}
              </span>
            </div>
          </div>

          {/* Releases */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Releases</h3>
              {releases && releases.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {releases.length}
                </Badge>
              )}
            </div>
            
            {releases && releases.length > 0 ? (
              <div className="space-y-2">
                <Link
                  to={`/${owner}/${repo}/releases/tag/${releases[0].tagName}`}
                  className="flex items-center gap-2 text-sm hover:text-primary"
                >
                  <Tag className="h-4 w-4" />
                  <span className="font-mono">{releases[0].tagName}</span>
                  <Badge variant="outline" className="text-xs">Latest</Badge>
                </Link>
                <Link
                  to={`/${owner}/${repo}/releases`}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  View all releases
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No releases yet</p>
            )}
          </div>

          {/* Package */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Package</h3>
              {packageData && (
                <Badge variant="secondary" className="text-xs font-mono">
                  {packageData.versions?.length ?? 0} versions
                </Badge>
              )}
            </div>
            
            {packageData ? (
              <div className="space-y-2">
                <Link
                  to={`/${owner}/${repo}/package`}
                  className="flex items-center gap-2 text-sm hover:text-primary"
                >
                  <Package className="h-4 w-4" />
                  <span className="font-mono truncate">{packageData.fullName}</span>
                </Link>
                {packageData.versions && packageData.versions[0] && (
                  <div className="text-xs text-muted-foreground">
                    Latest: <span className="font-mono">{packageData.versions[0].version}</span>
                  </div>
                )}
              </div>
            ) : isOwner ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Publish this repo as an npm package
                </p>
                <Link to={`/${owner}/${repo}/settings/package`}>
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    <Package className="h-4 w-4" />
                    Enable Package Registry
                  </Button>
                </Link>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No package published</p>
            )}
          </div>


        </div>
      </div>
    </RepoLayout>
  );
}
