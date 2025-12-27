import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Layers,
  GitBranch,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  GitCommit,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { RepoLayout } from './components/repo-layout';
import { Loading } from '@/components/ui/loading';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

export function StackDetailPage() {
  const { owner, repo, stackName } = useParams<{ owner: string; repo: string; stackName: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;
  const utils = trpc.useUtils();

  const [showAddBranch, setShowAddBranch] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('');

  // Fetch stack details
  const { data: stack, isLoading: stackLoading } = trpc.stacks.get.useQuery(
    { owner: owner!, repo: repo!, name: stackName! },
    { enabled: !!owner && !!repo && !!stackName }
  );

  // Fetch all branches for adding to stack
  const { data: branches } = trpc.repos.getBranches.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo && showAddBranch }
  );

  // Add branch mutation
  const addBranchMutation = trpc.stacks.addBranch.useMutation({
    onSuccess: () => {
      utils.stacks.get.invalidate({ owner: owner!, repo: repo!, name: stackName! });
      setShowAddBranch(false);
      setSelectedBranch('');
    },
  });

  // Remove branch mutation
  const removeBranchMutation = trpc.stacks.removeBranch.useMutation({
    onSuccess: () => {
      utils.stacks.get.invalidate({ owner: owner!, repo: repo!, name: stackName! });
    },
  });

  // Reorder mutation
  const reorderMutation = trpc.stacks.reorder.useMutation({
    onSuccess: () => {
      utils.stacks.get.invalidate({ owner: owner!, repo: repo!, name: stackName! });
    },
  });

  const handleAddBranch = () => {
    if (!selectedBranch) return;
    addBranchMutation.mutate({
      owner: owner!,
      repo: repo!,
      stackName: stackName!,
      branchName: selectedBranch,
    });
  };

  const handleRemoveBranch = (branchName: string) => {
    if (confirm(`Remove "${branchName}" from this stack?`)) {
      removeBranchMutation.mutate({
        owner: owner!,
        repo: repo!,
        stackName: stackName!,
        branchName,
      });
    }
  };

  const handleMoveUp = (index: number) => {
    if (!stack || index <= 0) return;
    const newOrder = [...stack.branches];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    reorderMutation.mutate({
      owner: owner!,
      repo: repo!,
      stackName: stackName!,
      branches: newOrder,
    });
  };

  const handleMoveDown = (index: number) => {
    if (!stack || index >= stack.branches.length - 1) return;
    const newOrder = [...stack.branches];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    reorderMutation.mutate({
      owner: owner!,
      repo: repo!,
      stackName: stackName!,
      branches: newOrder,
    });
  };

  // Filter out branches already in the stack
  const availableBranches = branches?.filter(
    (b) => b.name !== stack?.baseBranch && !stack?.branches.includes(b.name)
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'synced':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'behind':
        return <ArrowDown className="h-4 w-4 text-yellow-500" />;
      case 'ahead':
        return <ArrowUp className="h-4 w-4 text-blue-500" />;
      case 'diverged':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <GitCommit className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'synced':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">Synced</Badge>;
      case 'behind':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Behind</Badge>;
      case 'ahead':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Ahead</Badge>;
      case 'diverged':
        return <Badge variant="secondary" className="bg-red-100 text-red-800">Diverged</Badge>;
      default:
        return null;
    }
  };

  if (stackLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading stack..." />
      </RepoLayout>
    );
  }

  if (!stack) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold mb-2">Stack not found</h2>
          <p className="text-muted-foreground">
            The stack "{stackName}" could not be found.
          </p>
          <Link to={`/${owner}/${repo}/stacks`}>
            <Button className="mt-4">Back to Stacks</Button>
          </Link>
        </div>
      </RepoLayout>
    );
  }

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Link to={`/${owner}/${repo}/stacks`} className="hover:underline">
                Stacks
              </Link>
              <span>/</span>
            </div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Layers className="h-6 w-6" />
              {stack.name}
            </h2>
            {stack.description && (
              <p className="text-muted-foreground mt-1">{stack.description}</p>
            )}
          </div>
          {authenticated && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setShowAddBranch(!showAddBranch)}
            >
              <Plus className="h-4 w-4" />
              Add Branch
            </Button>
          )}
        </div>

        {/* Add Branch Form */}
        {showAddBranch && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add branch to stack</CardTitle>
              <CardDescription>
                Select a branch to add to the top of the stack
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a branch" />
                </SelectTrigger>
                <SelectContent>
                  {availableBranches?.map((branch) => (
                    <SelectItem key={branch.name} value={branch.name}>
                      <span className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4" />
                        {branch.name}
                      </span>
                    </SelectItem>
                  ))}
                  {(!availableBranches || availableBranches.length === 0) && (
                    <div className="px-2 py-1 text-sm text-muted-foreground">
                      No available branches
                    </div>
                  )}
                </SelectContent>
              </Select>
              <Button
                onClick={handleAddBranch}
                disabled={!selectedBranch || addBranchMutation.isPending}
              >
                Add
              </Button>
              <Button variant="outline" onClick={() => setShowAddBranch(false)}>
                Cancel
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stack Visualization */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              Stack Structure
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {/* Stack branches (reversed to show top first) */}
              {[...stack.branches].reverse().map((branch, reversedIndex) => {
                const index = stack.branches.length - 1 - reversedIndex;
                const node = stack.nodes?.find((n) => n.branch === branch);
                return (
                  <div key={branch} className="relative">
                    {/* Connection line */}
                    {reversedIndex < stack.branches.length - 1 && (
                      <div className="absolute left-[19px] top-[40px] w-0.5 h-4 bg-border" />
                    )}
                    
                    <div className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/50 group">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary">
                        {getStatusIcon(node?.status || 'synced')}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/${owner}/${repo}/tree/${branch}`}
                            className="font-medium hover:underline truncate"
                          >
                            {branch}
                          </Link>
                          {node && getStatusBadge(node.status)}
                          <Badge variant="outline" className="text-xs">
                            #{index + 1}
                          </Badge>
                        </div>
                        {node && (
                          <div className="text-sm text-muted-foreground flex items-center gap-2 mt-0.5">
                            <code className="text-xs bg-muted px-1 rounded">{node.commit}</code>
                            <span className="truncate">{node.message}</span>
                          </div>
                        )}
                      </div>

                      {authenticated && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMoveUp(index)}
                            disabled={index === 0 || reorderMutation.isPending}
                            title="Move up"
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMoveDown(index)}
                            disabled={index === stack.branches.length - 1 || reorderMutation.isPending}
                            title="Move down"
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveBranch(branch)}
                            disabled={removeBranchMutation.isPending}
                            title="Remove from stack"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Connection to base */}
              {stack.branches.length > 0 && (
                <div className="relative">
                  <div className="absolute left-[19px] top-0 w-0.5 h-4 bg-border" />
                </div>
              )}

              {/* Base branch */}
              <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-muted/30">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
                  <GitBranch className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/${owner}/${repo}/tree/${stack.baseBranch}`}
                      className="font-medium hover:underline"
                    >
                      {stack.baseBranch}
                    </Link>
                    <Badge variant="secondary">base</Badge>
                  </div>
                  {stack.nodes?.[0] && (
                    <div className="text-sm text-muted-foreground flex items-center gap-2 mt-0.5">
                      <code className="text-xs bg-muted px-1 rounded">{stack.nodes[0].commit}</code>
                      <span className="truncate">{stack.nodes[0].message}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Empty state */}
        {stack.branches.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <GitBranch className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground">
                This stack has no branches yet.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Add branches using the button above or the CLI:
              </p>
              <code className="text-sm bg-muted px-2 py-1 rounded mt-2 inline-block">
                wit stack push
              </code>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link to={`/${owner}/${repo}/pulls/new`}>
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowUpRight className="h-4 w-4" />
                Create PR for top branch
              </Button>
            </Link>
            <Button variant="outline" size="sm" className="gap-2" disabled>
              <ArrowDown className="h-4 w-4" />
              Sync Stack (CLI only)
            </Button>
          </CardContent>
        </Card>

        {/* CLI Info */}
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <h3 className="font-medium mb-2">Managing this stack via CLI</h3>
            <div className="space-y-1 text-sm text-muted-foreground font-mono">
              <p><code>wit stack show {stack.name}</code> - View stack</p>
              <p><code>wit stack push</code> - Add new branch</p>
              <p><code>wit stack sync</code> - Rebase all branches</p>
              <p><code>wit stack submit</code> - Push all branches</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </RepoLayout>
  );
}
