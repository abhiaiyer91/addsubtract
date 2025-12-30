/**
 * Keyboard Shortcuts Hook
 *
 * Main hook for registering and executing keyboard shortcuts.
 * Provides handler and store registries for decoupled shortcut actions.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useHotkeys } from 'react-hotkeys-hook';
import { useShortcutStore } from './store';
import { useShortcutContext } from './context';
import type {
  ShortcutAction,
  ShortcutHandler,
  HandlerRegistry,
  StoreActions,
  StoreRegistry,
  ShortcutContext as ShortcutContextType,
} from './types';

// ============================================
// HANDLER REGISTRY
// ============================================

/**
 * Global registry for shortcut handlers.
 * Components can register handlers by name, and shortcuts
 * can reference them without tight coupling.
 */
const handlerRegistry: HandlerRegistry = new Map();

/**
 * Register a shortcut handler by name.
 * Returns a cleanup function to unregister.
 *
 * @param name - Handler name (matches action.handler in shortcuts)
 * @param handler - Function to execute
 */
export function registerShortcutHandler(
  name: string,
  handler: ShortcutHandler
): () => void {
  handlerRegistry.set(name, handler);
  return () => {
    handlerRegistry.delete(name);
  };
}

/**
 * Get a registered handler by name.
 */
export function getShortcutHandler(name: string): ShortcutHandler | undefined {
  return handlerRegistry.get(name);
}

// ============================================
// STORE REGISTRY
// ============================================

/**
 * Global registry for store actions.
 * Allows shortcuts to trigger store actions without importing stores directly.
 */
const storeRegistry: StoreRegistry = new Map();

/**
 * Register store actions by store name.
 * Returns a cleanup function to unregister.
 *
 * @param storeName - Store name (matches action.store in shortcuts)
 * @param actions - Object mapping action names to functions
 */
export function registerStoreActions(
  storeName: string,
  actions: StoreActions
): () => void {
  storeRegistry.set(storeName, actions);
  return () => {
    storeRegistry.delete(storeName);
  };
}

/**
 * Get a registered store's actions.
 */
export function getStoreActions(storeName: string): StoreActions | undefined {
  return storeRegistry.get(storeName);
}

// ============================================
// ACTION EXECUTOR
// ============================================

/**
 * Execute a shortcut action.
 */
export function executeShortcutAction(
  action: ShortcutAction,
  navigate: (path: string) => void
): void {
  switch (action.type) {
    case 'navigate':
      navigate(action.path);
      break;

    case 'function': {
      const handler = handlerRegistry.get(action.handler);
      if (handler) {
        handler();
      } else {
        console.warn(`Shortcut handler not found: ${action.handler}`);
      }
      break;
    }

    case 'store-action': {
      const store = storeRegistry.get(action.store);
      if (store?.[action.action]) {
        store[action.action]();
      } else {
        console.warn(
          `Store action not found: ${action.store}.${action.action}`
        );
      }
      break;
    }

    case 'command':
      // TODO: Integrate with command palette system
      console.warn(`Command shortcuts not yet implemented: ${action.commandId}`);
      break;
  }
}

// ============================================
// HOOKS
// ============================================

/**
 * Hook to register a shortcut handler.
 * Automatically cleans up on unmount.
 */
export function useShortcutHandler(name: string, handler: ShortcutHandler) {
  useEffect(() => {
    return registerShortcutHandler(name, handler);
  }, [name, handler]);
}

/**
 * Hook to register store actions.
 * Automatically cleans up on unmount.
 */
export function useStoreActionsRegistration(
  storeName: string,
  actions: StoreActions
) {
  useEffect(() => {
    return registerStoreActions(storeName, actions);
  }, [storeName, actions]);
}

/**
 * Main hook for global keyboard shortcuts.
 * Registers shortcuts based on current context.
 */
export function useGlobalKeyboardShortcuts() {
  const navigate = useNavigate();
  const { isContextActive } = useShortcutContext();
  const { shortcuts, getEffectiveKeys, isShortcutDisabled } = useShortcutStore();

  // Get all enabled global shortcuts
  const globalShortcuts = useMemo(() => {
    return shortcuts.filter(
      (s) =>
        s.context === 'global' &&
        !isShortcutDisabled(s.id) &&
        getEffectiveKeys(s.id)
    );
  }, [shortcuts, isShortcutDisabled, getEffectiveKeys]);

  // Register each global shortcut
  for (const shortcut of globalShortcuts) {
    const keys = getEffectiveKeys(shortcut.id);
    if (!keys) continue;

    // eslint-disable-next-line react-hooks/rules-of-hooks
    useHotkeys(
      keys,
      (e) => {
        e.preventDefault();
        executeShortcutAction(shortcut.action, navigate);
      },
      {
        enableOnFormTags: shortcut.allowInInput ?? false,
        preventDefault: shortcut.preventDefault ?? true,
      },
      [shortcut.action, navigate]
    );
  }
}

/**
 * Hook for IDE-specific shortcuts.
 * Only active when IDE context is active.
 */
export function useIDEKeyboardShortcuts() {
  const navigate = useNavigate();
  const { isContextActive } = useShortcutContext();
  const { shortcuts, getEffectiveKeys, isShortcutDisabled } = useShortcutStore();

  const isIDEActive = isContextActive('ide');

  // Get all enabled IDE shortcuts
  const ideShortcuts = useMemo(() => {
    return shortcuts.filter(
      (s) =>
        s.context === 'ide' &&
        !isShortcutDisabled(s.id) &&
        getEffectiveKeys(s.id)
    );
  }, [shortcuts, isShortcutDisabled, getEffectiveKeys]);

  // Register each IDE shortcut
  for (const shortcut of ideShortcuts) {
    const keys = getEffectiveKeys(shortcut.id);
    if (!keys) continue;

    // eslint-disable-next-line react-hooks/rules-of-hooks
    useHotkeys(
      keys,
      (e) => {
        e.preventDefault();
        executeShortcutAction(shortcut.action, navigate);
      },
      {
        enabled: isIDEActive,
        enableOnFormTags: shortcut.allowInInput ?? false,
        preventDefault: shortcut.preventDefault ?? true,
      },
      [shortcut.action, navigate, isIDEActive]
    );
  }
}

/**
 * Hook for repository-specific shortcuts.
 * Only active when on a repository page.
 */
export function useRepoKeyboardShortcuts() {
  const navigate = useNavigate();
  const params = useParams<{ owner?: string; repo?: string }>();
  const { isContextActive } = useShortcutContext();
  const { shortcuts, getEffectiveKeys, isShortcutDisabled } = useShortcutStore();

  const isRepoActive = isContextActive('repo');
  const repoPath = useMemo(() => {
    if (params.owner && params.repo) {
      return `/${params.owner}/${params.repo}`;
    }
    return null;
  }, [params.owner, params.repo]);

  // Register navigation handlers when in repo context
  useEffect(() => {
    if (!repoPath) return;

    const cleanups = [
      registerShortcutHandler('navigateToCode', () => navigate(repoPath)),
      registerShortcutHandler('navigateToIssues', () =>
        navigate(`${repoPath}/issues`)
      ),
      registerShortcutHandler('navigateToPulls', () =>
        navigate(`${repoPath}/pulls`)
      ),
      registerShortcutHandler('navigateToActions', () =>
        navigate(`${repoPath}/actions`)
      ),
      registerShortcutHandler('navigateToBranches', () =>
        navigate(`${repoPath}/branches`)
      ),
    ];

    return () => cleanups.forEach((fn) => fn());
  }, [repoPath, navigate]);

  // Get all enabled repo shortcuts
  const repoShortcuts = useMemo(() => {
    return shortcuts.filter(
      (s) =>
        s.context === 'repo' &&
        !isShortcutDisabled(s.id) &&
        getEffectiveKeys(s.id)
    );
  }, [shortcuts, isShortcutDisabled, getEffectiveKeys]);

  // Register each repo shortcut
  for (const shortcut of repoShortcuts) {
    const keys = getEffectiveKeys(shortcut.id);
    if (!keys) continue;

    // eslint-disable-next-line react-hooks/rules-of-hooks
    useHotkeys(
      keys,
      (e) => {
        e.preventDefault();
        executeShortcutAction(shortcut.action, navigate);
      },
      {
        enabled: isRepoActive && !!repoPath,
        enableOnFormTags: shortcut.allowInInput ?? false,
        preventDefault: shortcut.preventDefault ?? true,
      },
      [shortcut.action, navigate, isRepoActive, repoPath]
    );
  }
}

/**
 * Hook for list navigation shortcuts.
 * Provides j/k/o/c navigation for lists.
 */
export function useListKeyboardShortcuts(options: {
  items: unknown[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onOpen?: (item: unknown) => void;
  onCreate?: () => void;
  enabled?: boolean;
}) {
  const { items, selectedIndex, onSelect, onOpen, onCreate, enabled = true } =
    options;

  const { isContextActive } = useShortcutContext();
  const { getEffectiveKeys, isShortcutDisabled } = useShortcutStore();

  const isListActive = isContextActive('list') && enabled;

  // j - Next item
  const nextKeys = getEffectiveKeys('list.next');
  useHotkeys(
    nextKeys || 'j',
    (e) => {
      e.preventDefault();
      const nextIndex = Math.min(selectedIndex + 1, items.length - 1);
      onSelect(nextIndex);
    },
    {
      enabled: isListActive && !isShortcutDisabled('list.next'),
      enableOnFormTags: false,
    },
    [selectedIndex, items.length, onSelect, isListActive]
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
    {
      enabled: isListActive && !isShortcutDisabled('list.prev'),
      enableOnFormTags: false,
    },
    [selectedIndex, onSelect, isListActive]
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
      enabled: isListActive && !!onOpen && !isShortcutDisabled('list.open'),
      enableOnFormTags: false,
    },
    [selectedIndex, items, onOpen, isListActive]
  );

  // c - Create new
  const createKeys = getEffectiveKeys('list.create');
  useHotkeys(
    createKeys || 'c',
    (e) => {
      e.preventDefault();
      if (onCreate) {
        onCreate();
      }
    },
    {
      enabled: isListActive && !!onCreate && !isShortcutDisabled('list.create'),
      enableOnFormTags: false,
    },
    [onCreate, isListActive]
  );
}

/**
 * Combined hook that sets up all keyboard shortcuts.
 * Call this once at the app level.
 */
export function useKeyboardShortcuts() {
  useGlobalKeyboardShortcuts();
  useRepoKeyboardShortcuts();
}
