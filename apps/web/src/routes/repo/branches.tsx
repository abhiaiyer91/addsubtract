import { useParams, Link } from 'react-router-dom';
import { GitBranch, Shield, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { RepoLayout } from './components/repo-layout';
import { formatRelativeTime } from '@/lib/utils';
import { useSession } from '@/lib/auth-client';

// Mock branches
const mockBranches = [
  {
    name: 'main',
    sha: 'abc123def456',
    isDefault: true,
    isProtected: true,
    lastCommit: {
      message: 'Update README',
      author: 'John Doe',
      date: new Date(Date.now() - 3600000),
    },
  },
  {
    name: 'develop',
    sha: 'def456abc789',
    isDefault: false,
    isProtected: false,
    lastCommit: {
      message: 'Add new feature',
      author: 'Jane Smith',
      date: new Date(Date.now() - 86400000),
    },
  },
  {
    name: 'feature/new-ui',
    sha: 'ghi789def012',
    isDefault: false,
    isProtected: false,
    lastCommit: {
      message: 'Work in progress on new UI components',
      author: 'John Doe',
      date: new Date(Date.now() - 86400000 * 3),
    },
  },
];

export function BranchesPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  // TODO: Fetch real data with tRPC
  const branches = mockBranches;

  return (
    <RepoLayout owner={owner!} repo={repo!}>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Branches
          <Badge variant="secondary">{branches.length}</Badge>
        </h2>
        {authenticated && (
          <Button size="sm">New branch</Button>
        )}
      </div>

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
                      {branch.isProtected && (
                        <Badge variant="outline" className="gap-1">
                          <Shield className="h-3 w-3" />
                          protected
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      <span>{branch.lastCommit.author}</span>
                      <span className="mx-2">·</span>
                      <span>{branch.lastCommit.message}</span>
                      <span className="mx-2">·</span>
                      <span>{formatRelativeTime(branch.lastCommit.date)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link to={`/${owner}/${repo}/compare/${branch.name}`}>
                    <Button variant="outline" size="sm">
                      Compare
                    </Button>
                  </Link>
                  {authenticated && !branch.isDefault && !branch.isProtected && (
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
    </RepoLayout>
  );
}
