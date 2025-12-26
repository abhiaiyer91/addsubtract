import { useParams, Link } from 'react-router-dom';
import { ChevronRight, Pencil, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BranchSelector } from '@/components/repo/branch-selector';
import { CodeViewer } from '@/components/repo/code-viewer';
import { RepoHeader } from './components/repo-header';
import { isAuthenticated } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { Loading } from '@/components/ui/loading';

export function BlobPage() {
  const { owner, repo, ref, '*': path } = useParams<{
    owner: string;
    repo: string;
    ref: string;
    '*': string;
  }>();

  const currentRef = ref || 'main';
  const filePath = path || '';
  const filename = filePath.split('/').pop() || '';
  const authenticated = isAuthenticated();

  // Fetch real file data from tRPC
  const { data: fileData, isLoading: fileLoading, error: fileError } = trpc.repos.getFile.useQuery(
    { owner: owner!, repo: repo!, ref: currentRef, path: filePath },
    { enabled: !!owner && !!repo && !!filePath }
  );

  // Fetch branches
  const { data: branchesData } = trpc.repos.getBranches.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  const fileContent = fileData?.content || '';
  const branches = branchesData?.map(b => ({
    name: b.name,
    sha: b.sha,
    isDefault: b.isDefault,
  })) || [];

  if (fileLoading) {
    return (
      <div className="space-y-6">
        <RepoHeader owner={owner!} repo={repo!} />
        <Loading />
      </div>
    );
  }

  if (fileError) {
    return (
      <div className="space-y-6">
        <RepoHeader owner={owner!} repo={repo!} />
        <div className="p-4 text-center text-muted-foreground">
          {fileError.message || 'File not found'}
        </div>
      </div>
    );
  }

  // Build breadcrumb parts
  const pathParts = filePath.split('/').filter(Boolean);

  return (
    <div className="space-y-6">
      <RepoHeader owner={owner!} repo={repo!} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <BranchSelector
            branches={branches}
            currentRef={currentRef}
            owner={owner!}
            repo={repo!}
            basePath="blob"
            filePath={filePath}
          />

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-sm">
            <Link
              to={`/${owner}/${repo}`}
              className="text-primary hover:underline"
            >
              {repo}
            </Link>
            {pathParts.map((part, index) => {
              const pathToHere = pathParts.slice(0, index + 1).join('/');
              const isLast = index === pathParts.length - 1;

              return (
                <span key={pathToHere} className="flex items-center gap-1">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  {isLast ? (
                    <span className="font-medium">{part}</span>
                  ) : (
                    <Link
                      to={`/${owner}/${repo}/tree/${currentRef}/${pathToHere}`}
                      className="text-primary hover:underline"
                    >
                      {part}
                    </Link>
                  )}
                </span>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link to={`/${owner}/${repo}/commits/${currentRef}/${filePath}`}>
            <Button variant="outline" size="sm" className="gap-2">
              <History className="h-4 w-4" />
              History
            </Button>
          </Link>
          {authenticated && (
            <Button variant="outline" size="sm" className="gap-2">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <CodeViewer content={fileContent} filename={filename} />
    </div>
  );
}
