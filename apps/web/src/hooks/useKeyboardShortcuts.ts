import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useHotkeys } from 'react-hotkeys-hook';
import { useCommandPaletteStore, useShortcutsModalStore } from './useCommandPalette';

/**
 * Hook for global keyboard shortcuts that work everywhere
 */
export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const { toggle: togglePalette } = useCommandPaletteStore();
  const { toggle: toggleShortcuts } = useShortcutsModalStore();

  // Cmd+K - Command palette
  useHotkeys('mod+k', (e) => {
    e.preventDefault();
    togglePalette();
  }, { enableOnFormTags: false });

  // / - Quick search (focus command palette)
  useHotkeys('/', (e) => {
    e.preventDefault();
    togglePalette();
  }, { enableOnFormTags: false });

  // ? - Shortcuts help
  useHotkeys('shift+/', (e) => {
    e.preventDefault();
    toggleShortcuts();
  }, { enableOnFormTags: false });

  // g then h - Go home
  useHotkeys('g h', (e) => {
    e.preventDefault();
    navigate('/');
  }, { enableOnFormTags: false });

  // g then n - Go to notifications
  useHotkeys('g n', (e) => {
    e.preventDefault();
    navigate('/notifications');
  }, { enableOnFormTags: false });

  // g then s - Go to settings
  useHotkeys('g s', (e) => {
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

  // g then c - Go to code
  useHotkeys('g c', (e) => {
    e.preventDefault();
    if (repoPath) navigate(repoPath);
  }, { enableOnFormTags: false, enabled: !!repoPath });

  // g then i - Go to issues
  useHotkeys('g i', (e) => {
    e.preventDefault();
    if (repoPath) navigate(`${repoPath}/issues`);
  }, { enableOnFormTags: false, enabled: !!repoPath });

  // g then p - Go to pull requests
  useHotkeys('g p', (e) => {
    e.preventDefault();
    if (repoPath) navigate(`${repoPath}/pulls`);
  }, { enableOnFormTags: false, enabled: !!repoPath });

  // g then a - Go to actions
  useHotkeys('g a', (e) => {
    e.preventDefault();
    if (repoPath) navigate(`${repoPath}/actions`);
  }, { enableOnFormTags: false, enabled: !!repoPath });

  // g then b - Go to branches
  useHotkeys('g b', (e) => {
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
