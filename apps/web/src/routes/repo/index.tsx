import { useParams, Link } from 'react-router-dom';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileTree } from '@/components/repo/file-tree';
import { BranchSelector } from '@/components/repo/branch-selector';
import { Markdown } from '@/components/markdown/renderer';
import { RepoLayout } from './components/repo-layout';
import { trpc } from '@/lib/trpc';

export function RepoPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [copied, setCopied] = useState(false);

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

  const repoInfo = repoData?.repo;
  const ownerInfo = repoData?.owner;
  const ownerUsername = (ownerInfo && 'username' in ownerInfo ? ownerInfo.username : null) || owner!;
  const tree = treeData?.entries || [];
  const readme = readmeData?.encoding === 'utf-8' ? readmeData.content : null;

  const cloneUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:3000'}/${ownerUsername}/${repoInfo?.name || repo}.git`;

  const handleCopyCloneUrl = async () => {
    await navigator.clipboard.writeText(cloneUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="space-y-6">
        {/* Branch selector and actions */}
        <div className="flex items-center justify-between">
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
          owner={ownerUsername}
          repo={repoInfo?.name || repo!}
          currentRef={repoInfo?.defaultBranch || 'main'}
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
    </RepoLayout>
  );
}
