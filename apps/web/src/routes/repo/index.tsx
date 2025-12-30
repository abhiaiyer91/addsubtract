import { useParams, Link } from 'react-router-dom';
import { Copy, Check, Tag, Package, Star, GitFork, Eye, Info, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileTree } from '@/components/repo/file-tree';
import { BranchSelector } from '@/components/repo/branch-selector';
import { LanguageBar } from '@/components/repo/language-bar';
import { Markdown } from '@/components/markdown/renderer';
import { RepoLayout } from './components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { useMobile } from '@/hooks/use-mobile';
import {
  BottomSheet,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetTrigger,
} from '@/components/ui/bottom-sheet';
import { cn } from '@/lib/utils';

export function RepoPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [copied, setCopied] = useState(false);
  const [showMobileInfo, setShowMobileInfo] = useState(false);
  const isMobile = useMobile();
  const { data: session } = useSession();

  // Fetch all page data in a single request for better performance
  const { data: pageData, isLoading: pageLoading } = trpc.repos.getPageData.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch releases count (still separate as it's less critical)
  const { data: releases } = trpc.releases.list.useQuery(
    { repoId: pageData?.repo.id! },
    { enabled: !!pageData?.repo.id }
  );

  // Fetch package info (still separate as it's less critical)
  const { data: packageData } = trpc.packages.getByRepoId.useQuery(
    { repoId: pageData?.repo.id ?? '' },
    { enabled: !!pageData?.repo.id }
  );

  // Extract data from combined response
  const repoInfo = pageData?.repo;
  const ownerInfo = pageData?.owner;
  const branches = pageData?.branches;
  const tree = pageData?.tree?.entries || [];
  const treeError = pageData?.tree?.error;
  const readme = pageData?.readme?.encoding === 'utf-8' ? pageData.readme.content : null;
  const languagesData = pageData?.languages;
  const ownerUsername = (ownerInfo && 'username' in ownerInfo ? ownerInfo.username : null) || owner!;
  
  // Check if current user is the owner
  const isOwner = session?.user?.id === repoInfo?.ownerId;
  
  // Utils for the trpc context
  const utils = trpc.useUtils();

  const cloneUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/${ownerUsername}/${repoInfo?.name || repo}.wit`;

  const handleCopyCloneUrl = async () => {
    await navigator.clipboard.writeText(cloneUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Sidebar content (shared between desktop and mobile bottom sheet)
  const SidebarContent = () => (
    <div className="space-y-4">
      {/* About */}
      <div className={cn("border rounded-lg p-4 space-y-4", isMobile && "border-0 p-0")}>
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

      {/* Languages */}
      {languagesData && languagesData.length > 0 && (
        <div className={cn("border rounded-lg p-4 space-y-3", isMobile && "border-0 p-0 pt-4 border-t rounded-none")}>
          <h3 className="font-semibold text-sm">Languages</h3>
          <LanguageBar languages={languagesData} />
        </div>
      )}

      {/* Releases */}
      <div className={cn("border rounded-lg p-4 space-y-3", isMobile && "border-0 p-0 pt-4 border-t rounded-none")}>
        <div className="flex items-center justify-between">
          <Link 
            to={`/${owner}/${repo}/releases`}
            className="font-semibold text-sm hover:text-primary"
            onClick={() => setShowMobileInfo(false)}
          >
            Releases
          </Link>
          {releases && releases.releases.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {releases.total}
            </Badge>
          )}
        </div>
        
        {releases && releases.releases.length > 0 ? (
          <div className="space-y-2">
            <Link
              to={`/${owner}/${repo}/releases/tag/${releases.releases[0].tagName}`}
              className="flex items-center gap-2 text-sm hover:text-primary"
              onClick={() => setShowMobileInfo(false)}
            >
              <Tag className="h-4 w-4" />
              <span className="font-mono">{releases.releases[0].tagName}</span>
              <Badge variant="outline" className="text-xs">Latest</Badge>
            </Link>
            <Link
              to={`/${owner}/${repo}/releases`}
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowMobileInfo(false)}
            >
              View all releases
            </Link>
          </div>
        ) : isOwner ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Create versioned releases of your software
            </p>
            <Link to={`/${owner}/${repo}/releases/new`} onClick={() => setShowMobileInfo(false)}>
              <Button variant="outline" size="sm" className="w-full gap-2">
                <Tag className="h-4 w-4" />
                Create a release
              </Button>
            </Link>
          </div>
        ) : (
          <Link 
            to={`/${owner}/${repo}/releases`}
            className="text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setShowMobileInfo(false)}
          >
            No releases yet
          </Link>
        )}
      </div>

      {/* Package */}
      <div className={cn("border rounded-lg p-4 space-y-3", isMobile && "border-0 p-0 pt-4 border-t rounded-none")}>
        <h3 className="font-semibold text-sm">Package</h3>
        {packageData ? (
          <div className="space-y-1">
            <Link
              to={`/${owner}/${repo}/package`}
              className="flex items-center gap-2 text-sm hover:text-primary"
              onClick={() => setShowMobileInfo(false)}
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
            <Link to={`/${owner}/${repo}/settings/package`} onClick={() => setShowMobileInfo(false)}>
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
  );

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="flex gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-4 md:space-y-6">
          {/* Branch selector and actions - mobile optimized */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
              {pageLoading ? (
                <div className="h-9 w-32 bg-muted rounded-md animate-pulse" />
              ) : branches && branches.length > 0 ? (
                <BranchSelector
                  branches={branches}
                  currentRef={repoInfo?.defaultBranch || 'main'}
                  owner={ownerUsername}
                  repo={repoInfo?.name || repo!}
                />
              ) : null}
              <Link
                to={`/${owner}/${repo}/branches`}
                className="text-xs sm:text-sm text-muted-foreground hover:text-foreground"
              >
                View all branches
              </Link>
              
              {/* Mobile info button */}
              {isMobile && (
                <BottomSheet open={showMobileInfo} onOpenChange={setShowMobileInfo}>
                  <BottomSheetTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-1.5">
                      <Info className="h-3.5 w-3.5" />
                      <span className="text-xs">About</span>
                      <ChevronUp className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </BottomSheetTrigger>
                  <BottomSheetContent height="half" showHandle={true}>
                    <BottomSheetHeader>
                      <BottomSheetTitle>Repository Info</BottomSheetTitle>
                    </BottomSheetHeader>
                    <div className="pb-10">
                      <SidebarContent />
                    </div>
                  </BottomSheetContent>
                </BottomSheet>
              )}
            </div>

            {/* Clone button - responsive */}
            <div className="flex items-center gap-2">
              <div className="flex items-center border rounded-md flex-1 sm:flex-none overflow-hidden">
                <code className={cn(
                  "px-2 sm:px-3 py-1.5 text-xs sm:text-sm bg-muted rounded-l-md truncate",
                  isMobile ? "max-w-[200px]" : "max-w-[300px]"
                )}>
                  {cloneUrl}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-l-none rounded-r-md border-l bg-muted hover:bg-muted/80 h-8 sm:h-9 touch-target shrink-0"
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
            repoId={repoInfo?.id}
            currentRef={repoInfo?.defaultBranch || 'main'}
            error={treeError}
            canResync={isOwner && !!treeError}
            isLoading={pageLoading}
            onResyncComplete={() => {
              utils.repos.getPageData.invalidate({ owner: owner!, repo: repo! });
            }}
          />

          {/* README */}
          {pageLoading ? (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-muted/50 border-b">
                <div className="h-5 w-24 bg-muted rounded animate-pulse" />
              </div>
              <div className="p-6 space-y-3">
                <div className="h-6 w-3/4 bg-muted rounded animate-pulse" />
                <div className="h-4 w-full bg-muted rounded animate-pulse" />
                <div className="h-4 w-5/6 bg-muted rounded animate-pulse" />
                <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
              </div>
            </div>
          ) : readme ? (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-muted/50 border-b">
                <span className="font-medium">README.md</span>
              </div>
              <div className="p-6">
                <Markdown content={readme} />
              </div>
            </div>
          ) : null}
        </div>

        {/* About Sidebar - Desktop only */}
        <div className="hidden lg:block w-72 flex-shrink-0">
          <SidebarContent />
        </div>
      </div>
    </RepoLayout>
  );
}
