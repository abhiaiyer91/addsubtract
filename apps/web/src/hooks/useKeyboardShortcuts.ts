import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useHotkeys } from 'react-hotkeys-hook';
import { useShortcutsModalStore } from './useCommandPalette';
import { useSearchModalStore } from '@/components/search';

/**
 * Hook for global keyboard shortcuts that work everywhere
 */
export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const { toggle: toggleSearch } = useSearchModalStore();
  const { toggle: toggleShortcuts } = useShortcutsModalStore();

  // Cmd+K - Search modal
  useHotkeys('mod+k', (e) => {
    e.preventDefault();
    toggleSearch();
  }, { enableOnFormTags: false });

  // / - Quick search
  useHotkeys('/', (e) => {
    e.preventDefault();
    toggleSearch();
  }, { enableOnFormTags: false });

  // ? - Shortcuts help
  useHotkeys('shift+/', (e) => {
    e.preventDefault();
    toggleShortcuts();
  }, { enableOnFormTags: false });

  // Alt+h - Go home
  useHotkeys('alt+h', (e) => {
    e.preventDefault();
    navigate('/');
  }, { enableOnFormTags: false });

  // Alt+n - Go to notifications
  useHotkeys('alt+n', (e) => {
    e.preventDefault();
    navigate('/notifications');
  }, { enableOnFormTags: false });

  // Alt+s - Go to settings
  useHotkeys('alt+s', (e) => {
    e.preventDefault();
    navigate('/settings');
  }, { enableOnFormTags: false });
}

/**
 * Hook for repository-specific shortcuts
 */
export function useRepoShortcuts() {
  const navigate = useNavigate();
  const params = useParams<{ owner?: string; repo?: string }>();

  const repoPath = useMemo(() => {
    if (params.owner && params.repo) {
      return `/${params.owner}/${params.repo}`;
    }
    return null;
  }, [params.owner, params.repo]);

  // Alt+c - Go to code
  useHotkeys('alt+c', (e) => {
    e.preventDefault();
    if (repoPath) navigate(repoPath);
  }, { enableOnFormTags: false, enabled: !!repoPath });

  // Alt+i - Go to issues
  useHotkeys('alt+i', (e) => {
    e.preventDefault();
    if (repoPath) navigate(`${repoPath}/issues`);
  }, { enableOnFormTags: false, enabled: !!repoPath });

  // Alt+p - Go to pull requests
  useHotkeys('alt+p', (e) => {
    e.preventDefault();
    if (repoPath) navigate(`${repoPath}/pulls`);
  }, { enableOnFormTags: false, enabled: !!repoPath });

  // Alt+a - Go to actions
  useHotkeys('alt+a', (e) => {
    e.preventDefault();
    if (repoPath) navigate(`${repoPath}/actions`);
  }, { enableOnFormTags: false, enabled: !!repoPath });

  // Alt+b - Go to branches
  useHotkeys('alt+b', (e) => {
    e.preventDefault();
    if (repoPath) navigate(`${repoPath}/branches`);
  }, { enableOnFormTags: false, enabled: !!repoPath });

  return { repoPath };
}

/**
 * Hook for list navigation shortcuts (j/k navigation)
 */
export function useListShortcuts(options: {
  items: any[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onOpen?: (item: any) => void;
  onCreate?: () => void;
}) {
  const { items, selectedIndex, onSelect, onOpen, onCreate } = options;

  // j - Next item
  useHotkeys('j', (e) => {
    e.preventDefault();
    const nextIndex = Math.min(selectedIndex + 1, items.length - 1);
    onSelect(nextIndex);
  }, { enableOnFormTags: false });

  // k - Previous item
  useHotkeys('k', (e) => {
    e.preventDefault();
    const prevIndex = Math.max(selectedIndex - 1, 0);
    onSelect(prevIndex);
  }, { enableOnFormTags: false });

  // o or Enter - Open selected
  useHotkeys('o, enter', (e) => {
    e.preventDefault();
    if (onOpen && items[selectedIndex]) {
      onOpen(items[selectedIndex]);
    }
  }, { enableOnFormTags: false });

  // c - Create new
  useHotkeys('c', (e) => {
    e.preventDefault();
    if (onCreate) onCreate();
  }, { enableOnFormTags: false });
}

/**
 * Hook to combine all shortcuts based on context
 */
export function useKeyboardShortcuts() {
  useGlobalShortcuts();
  useRepoShortcuts();
}
