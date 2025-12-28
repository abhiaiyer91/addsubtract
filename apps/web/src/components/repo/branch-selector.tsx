import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitBranch, Plus, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc';
import { toastSuccess, toastError } from '@/components/ui/use-toast';

interface Branch {
  name: string;
  sha: string;
  isDefault?: boolean;
}

interface BranchSelectorProps {
  branches: Branch[];
  currentRef: string;
  owner: string;
  repo: string;
  basePath?: string; // 'tree' | 'blob' | ''
  filePath?: string;
  onBranchCreated?: (branchName: string) => void;
}

export function BranchSelector({
  branches,
  currentRef,
  owner,
  repo,
  basePath = '',
  filePath = '',
  onBranchCreated,
}: BranchSelectorProps) {
  const navigate = useNavigate();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const utils = trpc.useUtils();

  const createBranch = trpc.repos.createBranch.useMutation({
    onSuccess: (data) => {
      toastSuccess({ title: `Branch '${data.name}' created` });
      setShowCreateDialog(false);
      setNewBranchName('');
      utils.repos.getBranches.invalidate({ owner, repo });
      onBranchCreated?.(data.name);
      // Navigate to the new branch
      handleBranchChange(data.name);
    },
    onError: (error) => {
      toastError({ title: 'Failed to create branch', description: error.message });
    },
  });

  const handleBranchChange = (branch: string) => {
    let path = `/${owner}/${repo}`;
    if (basePath) {
      path += `/${basePath}/${branch}`;
      if (filePath) {
        path += `/${filePath}`;
      }
    } else {
      // Default to tree view when no basePath is specified
      path += `/tree/${branch}`;
    }
    navigate(path);
  };

  const handleCreateBranch = () => {
    if (!newBranchName.trim()) return;
    createBranch.mutate({
      owner,
      repo,
      name: newBranchName.trim(),
      fromRef: currentRef,
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-[180px] justify-start gap-2">
            <GitBranch className="h-4 w-4" />
            <span className="truncate flex-1 text-left">{currentRef}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[220px]">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Branches
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            {branches.map((branch) => (
              <DropdownMenuItem
                key={branch.name}
                onClick={() => handleBranchChange(branch.name)}
                className="gap-2"
              >
                {branch.name === currentRef ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <span className="w-4" />
                )}
                <span className="truncate">{branch.name}</span>
                {branch.isDefault && (
                  <span className="text-xs text-muted-foreground ml-auto">(default)</span>
                )}
              </DropdownMenuItem>
            ))}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowCreateDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create new branch
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a new branch</DialogTitle>
            <DialogDescription>
              Create a new branch from <code className="bg-muted px-1 rounded">{currentRef}</code>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="branch-name">Branch name</Label>
              <Input
                id="branch-name"
                placeholder="feature/my-feature"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateBranch();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateBranch} 
              disabled={!newBranchName.trim() || createBranch.isPending}
            >
              {createBranch.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create branch'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
