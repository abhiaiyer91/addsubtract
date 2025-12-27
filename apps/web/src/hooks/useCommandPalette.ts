import { create } from 'zustand';
import { useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { useSession, signOut } from '@/lib/auth-client';
import {
  staticCommands,
  repoCommands,
  accountCommands,
  type Command,
  type CommandGroup,
} from '@/lib/commands';

interface CommandPaletteState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));

interface ShortcutsModalState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useShortcutsModalStore = create<ShortcutsModalState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));

export interface SearchResult {
  id: string;
  type: 'repository' | 'issue' | 'pull_request' | 'command';
  title: string;
  subtitle?: string;
  url?: string;
  data?: any;
}

export function useCommandPalette() {
  const navigate = useNavigate();
  const params = useParams<{ owner?: string; repo?: string }>();
  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;

  const { isOpen, open, close, toggle } = useCommandPaletteStore();
  const shortcutsModal = useShortcutsModalStore();

  // Determine current repo context
  const repoContext = useMemo(() => {
    if (params.owner && params.repo) {
      return { owner: params.owner, repo: params.repo };
    }
    return null;
  }, [params.owner, params.repo]);

  // NOTE: Global shortcuts (Cmd+K, /, ?) are registered in useGlobalShortcuts
  // to avoid duplicate registrations that would cause toggle to fire twice

  // Get available commands based on context
  const availableCommands = useMemo(() => {
    const groups: CommandGroup[] = [];

    // Add static commands
    staticCommands.forEach((group) => {
      const filteredCommands = group.commands.filter((cmd) => {
        if (cmd.requiresAuth && !isAuthenticated) return false;
        return true;
      });
      if (filteredCommands.length > 0) {
        groups.push({ ...group, commands: filteredCommands });
      }
    });

    // Add repo commands if in repo context
    if (repoContext) {
      repoCommands.forEach((group) => {
        const filteredCommands = group.commands.filter((cmd) => {
          if (cmd.requiresAuth && !isAuthenticated) return false;
          return true;
        });
        if (filteredCommands.length > 0) {
          groups.push({ ...group, commands: filteredCommands });
        }
      });
    }

    // Add account commands if authenticated
    if (isAuthenticated) {
      groups.push(accountCommands);
    }

    return groups;
  }, [isAuthenticated, repoContext]);

  // Execute a command
  const executeCommand = useCallback(
    async (command: Command) => {
      close();

      if (command.id === 'keyboard-shortcuts') {
        shortcutsModal.open();
        return;
      }

      if (command.id === 'sign-out') {
        await signOut();
        navigate('/');
        return;
      }

      if (command.action === 'navigate' && command.path) {
        let path = command.path;

        // Handle repo-specific paths
        if (command.requiresRepo && repoContext) {
          const basePath = `/${repoContext.owner}/${repoContext.repo}`;
          switch (command.id) {
            case 'go-code':
              path = basePath;
              break;
            case 'go-issues':
              path = `${basePath}/issues`;
              break;
            case 'go-pulls':
              path = `${basePath}/pulls`;
              break;
            case 'create-issue':
              path = `${basePath}/issues/new`;
              break;
            case 'create-pull-request':
              path = `${basePath}/pulls/new`;
              break;
            default:
              path = command.path;
          }
        }

        navigate(path);
      }

      if (command.handler) {
        await command.handler();
      }
    },
    [close, navigate, repoContext, shortcutsModal]
  );

  // Navigate to a search result
  const navigateToResult = useCallback(
    (result: SearchResult) => {
      close();
      if (result.url) {
        navigate(result.url);
      }
    },
    [close, navigate]
  );

  return {
    isOpen,
    open,
    close,
    toggle,
    availableCommands,
    executeCommand,
    navigateToResult,
    repoContext,
    isAuthenticated,
    shortcutsModal,
  };
}

// Repository type for search results
interface RepoSearchItem {
  id: string;
  name: string;
  owner: string;
  description?: string | null;
}

// Hook for search functionality
export function useCommandSearch(query: string) {
  // Search repositories - using any to work around tRPC type issues
  const {
    data: repos,
    isLoading: reposLoading,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } = (trpc as any).repos?.list?.useQuery?.(
    undefined,
    {
      staleTime: 60000, // Cache for 1 minute
      enabled: true, // Always fetch to have cache ready
    }
  ) ?? { data: undefined, isLoading: false };

  // Filter results based on query
  const results = useMemo(() => {
    const searchResults: SearchResult[] = [];

    if (!query.trim()) {
      return searchResults;
    }

    const lowerQuery = query.toLowerCase();

    // Filter repositories
    if (repos && Array.isArray(repos)) {
      const matchingRepos = (repos as RepoSearchItem[])
        .filter((repo: RepoSearchItem) =>
          repo.name.toLowerCase().includes(lowerQuery) ||
          repo.description?.toLowerCase().includes(lowerQuery)
        )
        .slice(0, 5)
        .map((repo: RepoSearchItem): SearchResult => ({
          id: `repo-${repo.id}`,
          type: 'repository',
          title: `${repo.owner}/${repo.name}`,
          subtitle: repo.description || undefined,
          url: `/${repo.owner}/${repo.name}`,
          data: repo,
        }));
      searchResults.push(...matchingRepos);
    }

    return searchResults;
  }, [query, repos]);

  return {
    results,
    isLoading: reposLoading,
  };
}
