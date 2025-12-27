import { useParams, Link } from 'react-router-dom';
import { GitBranch, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { RepoLayout } from './components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

export function BranchesPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  const { data: branches, isLoading, error } = trpc.repos.getBranches.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  return (
    <RepoLayout owner={owner!} repo={repo!}>

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

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="text-center py-8 text-destructive">
          Failed to load branches: {error.message}
        </div>
      )}

      {branches && branches.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No branches found
        </div>
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
                    <Link to={`/${owner}/${repo}/compare/${branch.name}`}>
                      <Button variant="outline" size="sm">
                        Compare
                      </Button>
                    </Link>
                    {authenticated && !branch.isDefault && (
                      <Button variant="ghost" size="sm" className="text-destructive">
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
    </RepoLayout>
  );
}
