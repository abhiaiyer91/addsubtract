import { useParams, Link } from 'react-router-dom';
import {
  Star,
  GitFork,
  Eye,
  Code,
  GitPullRequest,
  CircleDot,
  Settings,
  Copy,
  Check,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileTree } from '@/components/repo/file-tree';
import { SimpleBranchSelector } from '@/components/repo/branch-selector';
import { Markdown } from '@/components/markdown/renderer';
import { Loading } from '@/components/ui/loading';
import { isAuthenticated } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

export function RepoPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [copied, setCopied] = useState(false);
  const authenticated = isAuthenticated();

  // Fetch repository data
  const {
    data: repoData,
    isLoading: repoLoading,
    error: repoError,
  } = trpc.repos.get.useQuery(
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

  if (repoLoading) {
    return <Loading text="Loading repository..." />;
  }

  if (repoError || !repoData) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-bold mb-2">Repository not found</h2>
        <p className="text-muted-foreground">
          The repository {owner}/{repo} could not be found.
        </p>
      </div>
    );
  }

  const { repo: repoInfo, owner: ownerInfo } = repoData;
  const ownerUsername = 'username' in ownerInfo ? ownerInfo.username : owner!;
  const ownerData = { username: ownerUsername, name: 'name' in ownerInfo ? ownerInfo.name : null, avatarUrl: 'avatarUrl' in ownerInfo ? ownerInfo.avatarUrl : null };
  const tree = treeData?.entries || [];
  const readme = readmeData?.encoding === 'utf-8' ? readmeData.content : null;

  const cloneUrl = `https://wit.dev/${ownerUsername}/${repoInfo.name}.git`;

  const handleCopyCloneUrl = async () => {
    await navigator.clipboard.writeText(cloneUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Repository header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              to={`/${ownerData.username}`}
              className="text-xl text-primary hover:underline"
            >
              {ownerData.username}
            </Link>
            <span className="text-xl text-muted-foreground">/</span>
            <Link
              to={`/${ownerData.username}/${repoInfo.name}`}
              className="text-xl font-bold hover:underline"
            >
              {repoInfo.name}
            </Link>
            {repoInfo.isPrivate ? (
              <Badge variant="secondary">Private</Badge>
            ) : (
              <Badge variant="outline">Public</Badge>
            )}
          </div>
          {repoInfo.description && (
            <p className="text-muted-foreground">{repoInfo.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {authenticated && (
            <>
              <Button variant="outline" size="sm" className="gap-2">
                <Eye className="h-4 w-4" />
                Watch
                <Badge variant="secondary" className="ml-1">
                  {repoInfo.watchersCount}
                </Badge>
              </Button>
              <Button variant="outline" size="sm" className="gap-2">
                <GitFork className="h-4 w-4" />
                Fork
                <Badge variant="secondary" className="ml-1">
                  {repoInfo.forksCount}
                </Badge>
              </Button>
              <Button variant="outline" size="sm" className="gap-2">
                <Star className="h-4 w-4" />
                Star
                <Badge variant="secondary" className="ml-1">
                  {repoInfo.starsCount}
                </Badge>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Navigation tabs */}
      <Tabs defaultValue="code" className="w-full">
        <TabsList className="w-full justify-start h-auto p-0 bg-transparent border-b rounded-none">
          <TabsTrigger
            value="code"
            className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <Code className="h-4 w-4" />
            Code
          </TabsTrigger>
          <TabsTrigger
            value="issues"
            className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            asChild
          >
            <Link to={`/${owner}/${repo}/issues`}>
              <CircleDot className="h-4 w-4" />
              Issues
              <Badge variant="secondary">{repoInfo.openIssuesCount}</Badge>
            </Link>
          </TabsTrigger>
          <TabsTrigger
            value="pulls"
            className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            asChild
          >
            <Link to={`/${owner}/${repo}/pulls`}>
              <GitPullRequest className="h-4 w-4" />
              Pull requests
              <Badge variant="secondary">{repoInfo.openPrsCount}</Badge>
            </Link>
          </TabsTrigger>
          {authenticated && (
            <TabsTrigger
              value="settings"
              className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              asChild
            >
              <Link to={`/${owner}/${repo}/settings`}>
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="code" className="mt-6 space-y-6">
          {/* Branch selector and actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <SimpleBranchSelector
                defaultBranch={repoInfo.defaultBranch}
                owner={ownerData.username}
                repo={repoInfo.name}
              />
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
                <code className="px-3 py-1.5 text-sm bg-muted rounded-l-md">
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
            owner={ownerData.username}
            repo={repoInfo.name}
            currentRef={repoInfo.defaultBranch}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
