import { useState } from 'react';
import { Link } from 'react-router-dom';
import { File, Folder, ChevronRight, AlertCircle, RefreshCw, Github } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';
import { toastSuccess, toastError } from '@/components/ui/use-toast';

export interface TreeEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
}

interface FileTreeProps {
  entries: TreeEntry[];
  owner: string;
  repo: string;
  repoId?: string;
  currentRef: string;
  currentPath?: string;
  error?: string;
  canResync?: boolean;
  onResyncComplete?: () => void;
}

export function FileTree({ entries, owner, repo, repoId, currentRef, currentPath, error, canResync, onResyncComplete }: FileTreeProps) {
  const [showResync, setShowResync] = useState(false);
  const [githubRepo, setGithubRepo] = useState(`${owner}/${repo}`);
  const [isResyncing, setIsResyncing] = useState(false);

  const resyncMutation = trpc.githubImport.resync.useMutation();

  const handleResync = async () => {
    if (!repoId || !githubRepo.trim()) return;
    
    setIsResyncing(true);
    try {
      await resyncMutation.mutateAsync({
        repoId,
        githubRepo: githubRepo.trim(),
      });
      toastSuccess({
        title: 'Repository resynced',
        description: 'The repository has been successfully resynced from GitHub.',
      });
      onResyncComplete?.();
    } catch (err) {
      toastError({
        title: 'Resync failed',
        description: err instanceof Error ? err.message : 'Failed to resync repository',
      });
    } finally {
      setIsResyncing(false);
    }
  };

  // Sort: directories first, then files
  const sorted = [...entries].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="divide-y divide-border rounded-lg border">
      {/* Header with breadcrumb if we're in a subdirectory */}
      {currentPath && (
        <div className="px-3 sm:px-4 py-2 bg-muted/50 flex items-center gap-1 text-xs sm:text-sm overflow-x-auto scrollbar-hide">
          <Link
            to={`/${owner}/${repo}`}
            className="text-primary hover:underline shrink-0"
          >
            {repo}
          </Link>
          {currentPath.split('/').map((part, index, parts) => {
            const pathToHere = parts.slice(0, index + 1).join('/');
            return (
              <span key={pathToHere} className="flex items-center gap-1 shrink-0">
                <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                <Link
                  to={`/${owner}/${repo}/tree/${currentRef}/${pathToHere}`}
                  className="text-primary hover:underline truncate max-w-[100px] sm:max-w-none"
                >
                  {part}
                </Link>
              </span>
            );
          })}
        </div>
      )}

      {error ? (
        <div className="px-4 py-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-destructive font-medium">Unable to load files</p>
            <p className="text-sm text-muted-foreground max-w-md">{error}</p>
            
            {canResync && repoId && (
              <div className="mt-4 space-y-3">
                {!showResync ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowResync(true)}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Resync from GitHub
                  </Button>
                ) : (
                  <div className="flex flex-col items-center gap-3 p-4 border rounded-lg bg-muted/30 max-w-sm">
                    <p className="text-sm text-muted-foreground">
                      Enter the GitHub repository to resync from:
                    </p>
                    <div className="flex items-center gap-2 w-full">
                      <Github className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Input
                        placeholder="owner/repo"
                        value={githubRepo}
                        onChange={(e) => setGithubRepo(e.target.value)}
                        className="flex-1"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowResync(false)}
                        disabled={isResyncing}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleResync}
                        disabled={isResyncing || !githubRepo.trim()}
                      >
                        {isResyncing ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Resyncing...
                          </>
                        ) : (
                          'Resync'
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : sorted.length === 0 ? (
        <div className="px-4 py-8 text-center text-muted-foreground">
          This directory is empty
        </div>
      ) : (
        sorted.map((entry) => (
          <FileTreeRow
            key={entry.path}
            entry={entry}
            owner={owner}
            repo={repo}
            currentRef={currentRef}
          />
        ))
      )}
    </div>
  );
}

function FileTreeRow({
  entry,
  owner,
  repo,
  currentRef,
}: {
  entry: TreeEntry;
  owner: string;
  repo: string;
  currentRef: string;
}) {
  const linkPath =
    entry.type === 'directory'
      ? `/${owner}/${repo}/tree/${currentRef}/${entry.path}`
      : `/${owner}/${repo}/blob/${currentRef}/${entry.path}`;

  return (
    <Link
      to={linkPath}
      className={cn(
        'flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-2 hover:bg-muted/50 transition-colors',
        'group no-tap-highlight'
      )}
    >
      {entry.type === 'directory' ? (
        <Folder className="h-4 w-4 text-blue-400 shrink-0" />
      ) : (
        <File className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
      <span className="flex-1 group-hover:text-primary transition-colors truncate text-sm">
        {entry.name}
      </span>
      {entry.size !== undefined && entry.type === 'file' && (
        <span className="text-xs text-muted-foreground shrink-0 hidden sm:block">
          {formatFileSize(entry.size)}
        </span>
      )}
    </Link>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
