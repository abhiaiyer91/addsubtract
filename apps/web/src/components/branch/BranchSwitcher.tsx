import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { GitBranch, Plus, Check } from 'lucide-react';
import { create } from 'zustand';
import { useHotkeys } from 'react-hotkeys-hook';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import { trpc } from '@/lib/trpc';

// Store for branch switcher state
interface BranchSwitcherState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useBranchSwitcherStore = create<BranchSwitcherState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));

// Branch type
interface Branch {
  name: string;
  isDefault?: boolean;
  isCurrent?: boolean;
  lastCommit?: {
    date: string;
    message: string;
  };
}

// Hook to use branch switcher with keyboard shortcut
export function useBranchSwitcher() {
  const params = useParams<{ owner?: string; repo?: string; ref?: string }>();
  const { isOpen, open, close, toggle } = useBranchSwitcherStore();

  // Only enable on repo pages
  const isRepoPage = !!(params.owner && params.repo);
  const currentRef = params.ref || 'main';

  // 'b' key opens branch switcher on repo pages
  useHotkeys('b', (e) => {
    e.preventDefault();
    if (isRepoPage) toggle();
  }, { enableOnFormTags: false, enabled: isRepoPage });

  return {
    isOpen,
    open,
    close,
    toggle,
    isRepoPage,
    currentRef,
    owner: params.owner,
    repo: params.repo,
  };
}

export function BranchSwitcher() {
  const navigate = useNavigate();
  const { isOpen, close, isRepoPage, currentRef, owner, repo } = useBranchSwitcher();
  const [query, setQuery] = useState('');

  // Fetch branches
  const { data: branchesData } = trpc.repos.getBranches.useQuery(
    { owner: owner || '', repo: repo || '' },
    {
      staleTime: 60000,
      enabled: isRepoPage && isOpen && !!owner && !!repo,
    }
  );

  // Transform branches data
  const branches: Branch[] = useMemo(() => {
    if (!branchesData) return [];
    if (Array.isArray(branchesData)) {
      return branchesData.map((b: any) => ({
        name: b.name || b,
        isDefault: b.isDefault || b.name === 'main' || b.name === 'master',
        isCurrent: (b.name || b) === currentRef,
        lastCommit: b.lastCommit,
      }));
    }
    return [];
  }, [branchesData, currentRef]);

  // Filter branches
  const filteredBranches = useMemo(() => {
    if (!query.trim()) return branches;
    const lowerQuery = query.toLowerCase();
    return branches.filter((b) => b.name.toLowerCase().includes(lowerQuery));
  }, [branches, query]);

  // Recent branches (current first, then default)
  const recentBranches = useMemo(() => {
    const sorted = [...branches].sort((a, b) => {
      if (a.isCurrent) return -1;
      if (b.isCurrent) return 1;
      if (a.isDefault) return -1;
      if (b.isDefault) return 1;
      return 0;
    });
    return sorted.slice(0, 3);
  }, [branches]);

  // Clear query when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
    }
  }, [isOpen]);

  const handleSelect = useCallback(
    (branchName: string) => {
      if (branchName === '__create__') {
        // Navigate to create branch page/modal
        close();
        // For now, just log - in a real implementation you'd open a create dialog
        console.log('Create new branch');
        return;
      }

      close();
      // Navigate to the branch
      navigate(`/${owner}/${repo}/tree/${branchName}`);
    },
    [close, navigate, owner, repo]
  );

  if (!isRepoPage) return null;

  return (
    <CommandDialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <CommandInput
        placeholder="Switch branch..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No branches found.</CommandEmpty>

        {/* Recent branches (when not searching) */}
        {!query && recentBranches.length > 0 && (
          <>
            <CommandGroup heading="Recent">
              {recentBranches.map((branch) => (
                <CommandItem
                  key={branch.name}
                  value={branch.name}
                  onSelect={handleSelect}
                  className="flex items-center gap-3"
                >
                  <div className="flex h-6 w-6 items-center justify-center">
                    {branch.isCurrent ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <GitBranch className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <span className={branch.isCurrent ? 'font-medium' : ''}>
                    {branch.name}
                  </span>
                  {branch.isDefault && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      default
                    </span>
                  )}
                  {branch.isCurrent && (
                    <span className="ml-auto text-xs text-primary">current</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* All branches */}
        <CommandGroup heading={query ? 'Results' : 'All branches'}>
          {filteredBranches.map((branch) => (
            <CommandItem
              key={branch.name}
              value={branch.name}
              onSelect={handleSelect}
              className="flex items-center gap-3"
            >
              <div className="flex h-6 w-6 items-center justify-center">
                {branch.isCurrent ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : (
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <span className={branch.isCurrent ? 'font-medium' : ''}>
                {branch.name}
              </span>
              {branch.isDefault && !branch.isCurrent && (
                <span className="ml-auto text-xs text-muted-foreground">
                  default
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Create new branch */}
        <CommandGroup>
          <CommandItem
            value="__create__"
            onSelect={handleSelect}
            className="flex items-center gap-3"
          >
            <div className="flex h-6 w-6 items-center justify-center">
              <Plus className="h-4 w-4 text-muted-foreground" />
            </div>
            <span>Create new branch</span>
          </CommandItem>
        </CommandGroup>

        {/* Footer hint */}
        <div className="border-t border-border/40 px-3 py-2 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="kbd">b</kbd>
              Toggle
            </span>
            <span className="flex items-center gap-1">
              <kbd className="kbd">
                <span className="text-[10px]">&#8629;</span>
              </kbd>
              Switch
            </span>
          </div>
        </div>
      </CommandList>
    </CommandDialog>
  );
}
