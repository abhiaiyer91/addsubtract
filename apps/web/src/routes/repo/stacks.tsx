import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Layers, Plus, GitBranch, Trash2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Skeleton } from '@/components/ui/loading';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

export function StacksPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;
  const utils = trpc.useUtils();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newStackName, setNewStackName] = useState('');
  const [newStackDescription, setNewStackDescription] = useState('');
  const [newStackBaseBranch, setNewStackBaseBranch] = useState('');

  // Fetch stacks
  const { data: stacks, isLoading: stacksLoading } = trpc.stacks.list.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch branches for create form
  const { data: branches } = trpc.repos.getBranches.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo && showCreateForm }
  );

  // Create stack mutation
  const createStackMutation = trpc.stacks.create.useMutation({
    onSuccess: () => {
      utils.stacks.list.invalidate({ owner: owner!, repo: repo! });
      setShowCreateForm(false);
      setNewStackName('');
      setNewStackDescription('');
      setNewStackBaseBranch('');
    },
  });

  // Delete stack mutation
  const deleteStackMutation = trpc.stacks.delete.useMutation({
    onSuccess: () => {
      utils.stacks.list.invalidate({ owner: owner!, repo: repo! });
    },
  });

  const handleCreateStack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStackName || !newStackBaseBranch) return;

    createStackMutation.mutate({
      owner: owner!,
      repo: repo!,
      name: newStackName,
      baseBranch: newStackBaseBranch,
      description: newStackDescription || undefined,
    });
  };

  const handleDeleteStack = (name: string) => {
    if (confirm(`Are you sure you want to delete stack "${name}"? This will not delete the branches.`)) {
      deleteStackMutation.mutate({
        owner: owner!,
        repo: repo!,
        name,
      });
    }
  };

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Stacked Diffs
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Manage dependent branches that build on top of each other
            </p>
          </div>
          {authenticated && !showCreateForm && (
            <Button size="sm" className="gap-2" onClick={() => setShowCreateForm(true)}>
              <Plus className="h-4 w-4" />
              New Stack
            </Button>
          )}
        </div>

        {/* Create Stack Form */}
        {showCreateForm && (
          <Card>
            <CardHeader>
              <CardTitle>Create a new stack</CardTitle>
              <CardDescription>
                A stack groups dependent branches that should be reviewed and merged in order
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateStack} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="stack-name">Stack name</Label>
                  <Input
                    id="stack-name"
                    placeholder="e.g., auth-feature"
                    value={newStackName}
                    onChange={(e) => setNewStackName(e.target.value)}
                    pattern="^[a-zA-Z0-9._-]+$"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Only letters, numbers, dots, hyphens, and underscores
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="base-branch">Base branch</Label>
                  <Select value={newStackBaseBranch} onValueChange={setNewStackBaseBranch}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select base branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches?.map((branch) => (
                        <SelectItem key={branch.name} value={branch.name}>
                          <span className="flex items-center gap-2">
                            <GitBranch className="h-4 w-4" />
                            {branch.name}
                            {branch.isDefault && (
                              <span className="text-xs text-muted-foreground">(default)</span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="What does this stack implement?"
                    value={newStackDescription}
                    onChange={(e) => setNewStackDescription(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={!newStackName || !newStackBaseBranch || createStackMutation.isPending}
                  >
                    {createStackMutation.isPending ? 'Creating...' : 'Create Stack'}
                  </Button>
                </div>

                {createStackMutation.error && (
                  <p className="text-sm text-destructive">{createStackMutation.error.message}</p>
                )}
              </form>
            </CardContent>
          </Card>
        )}

        {/* Stacks List */}
        {stacksLoading ? (
          <div className="grid gap-4">
            {[1, 2].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-4 w-64" />
                      <div className="flex items-center gap-4">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !stacks || stacks.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Layers className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No stacks found</p>
            <p className="text-sm mt-2">
              Stacks help you manage dependent branches that build on top of each other.
            </p>
            {authenticated && !showCreateForm && (
              <Button className="mt-4" onClick={() => setShowCreateForm(true)}>
                Create your first stack
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4">
            {stacks.map((stack) => (
              <Card key={stack?.name} className="hover:bg-muted/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <Link
                        to={`/${owner}/${repo}/stacks/${stack?.name}`}
                        className="text-lg font-semibold hover:underline flex items-center gap-2"
                      >
                        <Layers className="h-4 w-4" />
                        {stack?.name}
                      </Link>
                      {stack?.description && (
                        <p className="text-sm text-muted-foreground mt-1">{stack.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <GitBranch className="h-4 w-4" />
                          Base: {stack?.baseBranch}
                        </span>
                        <Badge variant="secondary">
                          {stack?.branchCount} {stack?.branchCount === 1 ? 'branch' : 'branches'}
                        </Badge>
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          Updated {new Date(stack?.updatedAt || 0).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    {authenticated && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteStack(stack?.name || '')}
                        disabled={deleteStackMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Info section */}
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <h3 className="font-medium mb-2">How Stacked Diffs Work</h3>
            <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Create a stack from a base branch (like main)</li>
              <li>Add branches to the stack in order of dependency</li>
              <li>Each branch builds on top of the previous one</li>
              <li>Review and merge branches in order from bottom to top</li>
              <li>When the base changes, sync to rebase the entire stack</li>
            </ol>
            <p className="text-sm text-muted-foreground mt-3">
              <strong>CLI usage:</strong>{' '}
              <code className="bg-muted px-1 rounded">wit stack create &lt;name&gt;</code>
            </p>
          </CardContent>
        </Card>
      </div>
    </RepoLayout>
  );
}
