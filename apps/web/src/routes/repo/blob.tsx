import { useParams, Link } from 'react-router-dom';
import { ChevronRight, Pencil, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BranchSelector } from '@/components/repo/branch-selector';
import { CodeViewer } from '@/components/repo/code-viewer';
import { RepoLayout } from './components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { Loading } from '@/components/ui/loading';
import { useIDEStore } from '@/lib/ide-store';

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
  const { data: session } = useSession();
  const authenticated = !!session?.user;
  const { setIDEMode, openFile } = useIDEStore();

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
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading />
      </RepoLayout>
    );
  }

  if (fileError) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="p-4 text-center text-muted-foreground">
          {fileError.message || 'File not found'}
        </div>
      </RepoLayout>
    );
  }

  // Build breadcrumb parts
  const pathParts = filePath.split('/').filter(Boolean);

  return (
    <RepoLayout owner={owner!} repo={repo!}>

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
          <Link to={`/${owner}/${repo}/commits/${currentRef}`}>
            <Button variant="outline" size="sm" className="gap-2">
              <History className="h-4 w-4" />
              History
            </Button>
          </Link>
          {authenticated && (
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2"
              onClick={() => {
                // Detect language from filename
                const ext = filename.split('.').pop()?.toLowerCase() || '';
                const langMap: Record<string, string> = {
                  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
                  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
                  md: 'markdown', json: 'json', yaml: 'yaml', yml: 'yaml',
                  html: 'html', css: 'css', scss: 'scss', sql: 'sql',
                };
                const language = langMap[ext] || 'plaintext';
                
                // Open file in IDE and switch to IDE mode
                openFile(filePath, fileContent, language);
                setIDEMode(true);
              }}
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <CodeViewer content={fileContent} filename={filename} />
    </RepoLayout>
  );
}
