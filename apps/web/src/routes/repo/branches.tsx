import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { GitBranch, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { RepoLayout } from './components/repo-layout';
import { BranchListSkeleton } from '@/components/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { toastSuccess, toastError } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function BranchesPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;
  const [branchToDelete, setBranchToDelete] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: branches, isLoading, error } = trpc.repos.getBranches.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  const deleteBranchMutation = trpc.repos.deleteBranch.useMutation({
    onSuccess: (data) => {
      toastSuccess({
        title: 'Branch deleted',
        description: `Branch '${data.name}' has been deleted.`,
      });
      utils.repos.getBranches.invalidate({ owner: owner!, repo: repo! });
      setBranchToDelete(null);
    },
    onError: (error) => {
      toastError({
        title: 'Failed to delete branch',
        description: error.message,
      });
      setBranchToDelete(null);
    },
  });

  const handleDeleteBranch = () => {
    if (!branchToDelete) return;
    deleteBranchMutation.mutate({
      owner: owner!,
      repo: repo!,
      name: branchToDelete,
    });
  };

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Branches
          {branches && <Badge variant="secondary">{branches.length}</Badge>}
        </h2>
        {authenticated && (
          <Button size="sm">New branch</Button>
        )}
      </div>

      {isLoading && <BranchListSkeleton count={5} />}

      {error && (
        <div className="text-center py-8 text-destructive">
          Failed to load branches: {error.message}
        </div>
      )}

      {branches && branches.length === 0 && (
        <EmptyState
          icon={GitBranch}
          title="Only the default branch exists"
          description="Create a new branch to start working on features or fixes."
          action={
            authenticated ? (
              <Button>Create branch</Button>
            ) : undefined
          }
        />
      )}

      {branches && branches.length > 0 && (
        <div className="space-y-3">
          {branches.map((branch) => (
            <Card key={branch.name}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/${owner}/${repo}/tree/${branch.name}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {branch.name}
                        </Link>
                        {branch.isDefault && (
                          <Badge variant="secondary">default</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        <code className="text-xs">{branch.sha.slice(0, 7)}</code>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {authenticated && !branch.isDefault && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-destructive hover:text-destructive"
                        onClick={() => setBranchToDelete(branch.name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!branchToDelete} onOpenChange={(open) => !open && setBranchToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete branch</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the branch <code className="font-mono bg-muted px-1 rounded">{branchToDelete}</code>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteBranch}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteBranchMutation.isPending}
            >
              {deleteBranchMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </RepoLayout>
  );
}
