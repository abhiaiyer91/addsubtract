/**
 * Keyboard Shortcuts Hook
 *
 * This module provides the main keyboard shortcuts hooks for the application.
 * It integrates with the centralized keyboard shortcuts system and registers
 * store actions for the global modals.
 */

import { useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useHotkeys } from 'react-hotkeys-hook';
import { useShortcutsModalStore } from './useCommandPalette';
import { useSearchModalStore } from '@/components/search';
import {
  useShortcutStore,
  registerStoreActions,
  useRegisterShortcutContext,
} from '@/lib/keyboard-shortcuts';

/**
 * Hook to register global store actions for the keyboard shortcuts system.
 * This should be called once at the app level.
 */
export function useRegisterGlobalStoreActions() {
  const { toggle: toggleSearch, open: openSearch, close: closeSearch } =
    useSearchModalStore();
  const {
    toggle: toggleShortcuts,
    open: openShortcuts,
    close: closeShortcuts,
  } = useShortcutsModalStore();

  useEffect(() => {
    const cleanups = [
      registerStoreActions('searchModal', {
        toggle: toggleSearch,
        open: openSearch,
        close: closeSearch,
      }),
      registerStoreActions('shortcutsModal', {
        toggle: toggleShortcuts,
        open: openShortcuts,
        close: closeShortcuts,
      }),
    ];

    return () => cleanups.forEach((fn) => fn());
  }, [toggleSearch, openSearch, closeSearch, toggleShortcuts, openShortcuts, closeShortcuts]);
}

/**
 * Hook for global keyboard shortcuts that work everywhere.
 * Uses the centralized shortcuts store for key bindings.
 */
export function useGlobalShortcuts() {
  const navigate = useNavigate();
  const { toggle: toggleSearch } = useSearchModalStore();
  const { toggle: toggleShortcuts } = useShortcutsModalStore();
  const { getEffectiveKeys, isShortcutDisabled } = useShortcutStore();

  // Cmd+K - Search modal
  const searchKeys = getEffectiveKeys('global.search');
  useHotkeys(
    searchKeys || 'mod+k',
    (e) => {
      e.preventDefault();
      toggleSearch();
    },
    { enableOnFormTags: false, enabled: !isShortcutDisabled('global.search') }
  );

  // / - Quick search
  const quickSearchKeys = getEffectiveKeys('global.quickSearch');
  useHotkeys(
    quickSearchKeys || '/',
    (e) => {
      e.preventDefault();
      toggleSearch();
    },
    { enableOnFormTags: false, enabled: !isShortcutDisabled('global.quickSearch') }
  );

  // ? - Shortcuts help
  const shortcutsKeys = getEffectiveKeys('global.shortcuts');
  useHotkeys(
    shortcutsKeys || 'shift+/',
    (e) => {
      e.preventDefault();
      toggleShortcuts();
    },
    { enableOnFormTags: false, enabled: !isShortcutDisabled('global.shortcuts') }
  );

  // Cmd+/ - Shortcuts help (alternative)
  const shortcutsAltKeys = getEffectiveKeys('global.shortcutsAlt');
  useHotkeys(
    shortcutsAltKeys || 'mod+/',
    (e) => {
      e.preventDefault();
      toggleShortcuts();
    },
    { enableOnFormTags: false, enabled: !isShortcutDisabled('global.shortcutsAlt') }
  );

  // Alt+h - Go home
  const homeKeys = getEffectiveKeys('nav.home');
  useHotkeys(
    homeKeys || 'alt+h',
    (e) => {
      e.preventDefault();
      navigate('/');
    },
    { enableOnFormTags: false, enabled: !isShortcutDisabled('nav.home') }
  );

  // Alt+n - Go to notifications
  const notificationsKeys = getEffectiveKeys('nav.notifications');
  useHotkeys(
    notificationsKeys || 'alt+n',
    (e) => {
      e.preventDefault();
      navigate('/notifications');
    },
    { enableOnFormTags: false, enabled: !isShortcutDisabled('nav.notifications') }
  );

  // Alt+s - Go to settings
  const settingsKeys = getEffectiveKeys('nav.settings');
  useHotkeys(
    settingsKeys || 'alt+s',
    (e) => {
      e.preventDefault();
      navigate('/settings');
    },
    { enableOnFormTags: false, enabled: !isShortcutDisabled('nav.settings') }
  );
}

/**
 * Hook for repository-specific shortcuts.
 * Automatically registers the 'repo' context when on a repository page.
 */
export function useRepoShortcuts() {
  const navigate = useNavigate();
  const params = useParams<{ owner?: string; repo?: string }>();
  const { getEffectiveKeys, isShortcutDisabled } = useShortcutStore();

  const repoPath = useMemo(() => {
    if (params.owner && params.repo) {
      return `/${params.owner}/${params.repo}`;
    }
    return null;
  }, [params.owner, params.repo]);

  // Register repo context when we're on a repo page
  useRegisterShortcutContext('repo', !!repoPath);

  // Alt+c - Go to code
  const codeKeys = getEffectiveKeys('repo.code');
  useHotkeys(
    codeKeys || 'alt+c',
    (e) => {
      e.preventDefault();
      if (repoPath) navigate(repoPath);
    },
    {
      enableOnFormTags: false,
      enabled: !!repoPath && !isShortcutDisabled('repo.code'),
    }
  );

  // Alt+i - Go to issues
  const issuesKeys = getEffectiveKeys('repo.issues');
  useHotkeys(
    issuesKeys || 'alt+i',
    (e) => {
      e.preventDefault();
      if (repoPath) navigate(`${repoPath}/issues`);
    },
    {
      enableOnFormTags: false,
      enabled: !!repoPath && !isShortcutDisabled('repo.issues'),
    }
  );

  // Alt+p - Go to pull requests
  const pullsKeys = getEffectiveKeys('repo.pulls');
  useHotkeys(
    pullsKeys || 'alt+p',
    (e) => {
      e.preventDefault();
      if (repoPath) navigate(`${repoPath}/pulls`);
    },
    {
      enableOnFormTags: false,
      enabled: !!repoPath && !isShortcutDisabled('repo.pulls'),
    }
  );

  // Alt+a - Go to actions
  const actionsKeys = getEffectiveKeys('repo.actions');
  useHotkeys(
    actionsKeys || 'alt+a',
    (e) => {
      e.preventDefault();
      if (repoPath) navigate(`${repoPath}/actions`);
    },
    {
      enableOnFormTags: false,
      enabled: !!repoPath && !isShortcutDisabled('repo.actions'),
    }
  );

  // Alt+b - Go to branches
  const branchesKeys = getEffectiveKeys('repo.branches');
  useHotkeys(
    branchesKeys || 'alt+b',
    (e) => {
      e.preventDefault();
      if (repoPath) navigate(`${repoPath}/branches`);
    },
    {
      enableOnFormTags: false,
      enabled: !!repoPath && !isShortcutDisabled('repo.branches'),
    }
  );

  return { repoPath };
}

/**
 * Hook for list navigation shortcuts (j/k navigation).
 * Uses the centralized shortcuts store for key bindings.
 */
export function useListShortcuts(options: {
  items: unknown[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onOpen?: (item: unknown) => void;
  onCreate?: () => void;
  enabled?: boolean;
}) {
  const { items, selectedIndex, onSelect, onOpen, onCreate, enabled = true } =
    options;
  const { getEffectiveKeys, isShortcutDisabled } = useShortcutStore();

  // j - Next item
  const nextKeys = getEffectiveKeys('list.next');
  useHotkeys(
    nextKeys || 'j',
    (e) => {
      e.preventDefault();
      const nextIndex = Math.min(selectedIndex + 1, items.length - 1);
      onSelect(nextIndex);
    },
    { enableOnFormTags: false, enabled: enabled && !isShortcutDisabled('list.next') }
  );

  // k - Previous item
  const prevKeys = getEffectiveKeys('list.prev');
  useHotkeys(
    prevKeys || 'k',
    (e) => {
      e.preventDefault();
      const prevIndex = Math.max(selectedIndex - 1, 0);
      onSelect(prevIndex);
    },
    { enableOnFormTags: false, enabled: enabled && !isShortcutDisabled('list.prev') }
  );

  // o - Open selected
  const openKeys = getEffectiveKeys('list.open');
  useHotkeys(
    openKeys || 'o',
    (e) => {
      e.preventDefault();
      if (onOpen && items[selectedIndex]) {
        onOpen(items[selectedIndex]);
      }
    },
    {
      enableOnFormTags: false,
      enabled: enabled && !!onOpen && !isShortcutDisabled('list.open'),
    }
  );

  // Enter - Open selected (alternative)
  const openEnterKeys = getEffectiveKeys('list.openEnter');
  useHotkeys(
    openEnterKeys || 'enter',
    (e) => {
      e.preventDefault();
      if (onOpen && items[selectedIndex]) {
        onOpen(items[selectedIndex]);
      }
    },
    {
      enableOnFormTags: false,
      enabled: enabled && !!onOpen && !isShortcutDisabled('list.openEnter'),
    }
  );

  // c - Create new
  const createKeys = getEffectiveKeys('list.create');
  useHotkeys(
    createKeys || 'c',
    (e) => {
      e.preventDefault();
      if (onCreate) onCreate();
    },
    {
      enableOnFormTags: false,
      enabled: enabled && !!onCreate && !isShortcutDisabled('list.create'),
    }
  );
}

/**
 * Hook to combine all shortcuts based on context.
 * Also registers global store actions for the keyboard shortcuts system.
 */
export function useKeyboardShortcuts() {
  useRegisterGlobalStoreActions();
  useGlobalShortcuts();
  useRepoShortcuts();
}
