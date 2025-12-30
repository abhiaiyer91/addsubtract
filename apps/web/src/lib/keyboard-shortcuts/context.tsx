/**
 * Keyboard Shortcuts Context System
 *
 * Provides React context for managing active shortcut contexts.
 * Contexts determine which shortcuts are active at any given time.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  type ReactNode,
} from 'react';
import type { ShortcutContext } from './types';

interface ShortcutContextValue {
  /** Set of currently active contexts */
  activeContexts: Set<ShortcutContext>;
  /** Push a context onto the stack */
  pushContext: (context: ShortcutContext) => void;
  /** Pop a context from the stack */
  popContext: (context: ShortcutContext) => void;
  /** Check if a context is currently active */
  isContextActive: (context: ShortcutContext) => boolean;
  /** Get all active contexts as array */
  getActiveContexts: () => ShortcutContext[];
}

const ShortcutContextContext = createContext<ShortcutContextValue | null>(null);

interface ShortcutContextProviderProps {
  children: ReactNode;
}

/**
 * Provider component for the shortcut context system.
 * Wrap your app with this to enable context-aware shortcuts.
 */
export function ShortcutContextProvider({
  children,
}: ShortcutContextProviderProps) {
  // Context stack - 'global' is always active at the base
  const [contextStack, setContextStack] = useState<ShortcutContext[]>([
    'global',
  ]);

  // Memoize the set of active contexts
  const activeContexts = useMemo(
    () => new Set(contextStack),
    [contextStack]
  );

  // Push a context onto the stack
  const pushContext = useCallback((context: ShortcutContext) => {
    setContextStack((prev) => {
      // Don't add duplicates
      if (prev.includes(context)) return prev;
      return [...prev, context];
    });
  }, []);

  // Pop a context from the stack
  const popContext = useCallback((context: ShortcutContext) => {
    setContextStack((prev) => {
      // Don't remove 'global' - it's always active
      if (context === 'global') return prev;

      const idx = prev.lastIndexOf(context);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  }, []);

  // Check if a context is active
  const isContextActive = useCallback(
    (context: ShortcutContext) => {
      return activeContexts.has(context);
    },
    [activeContexts]
  );

  // Get all active contexts
  const getActiveContexts = useCallback(() => {
    return Array.from(activeContexts);
  }, [activeContexts]);

  const value = useMemo(
    () => ({
      activeContexts,
      pushContext,
      popContext,
      isContextActive,
      getActiveContexts,
    }),
    [activeContexts, pushContext, popContext, isContextActive, getActiveContexts]
  );

  return (
    <ShortcutContextContext.Provider value={value}>
      {children}
    </ShortcutContextContext.Provider>
  );
}

/**
 * Hook to access the shortcut context system.
 */
export function useShortcutContext() {
  const ctx = useContext(ShortcutContextContext);
  if (!ctx) {
    throw new Error(
      'useShortcutContext must be used within a ShortcutContextProvider'
    );
  }
  return ctx;
}

/**
 * Hook to register a component as providing a shortcut context.
 * The context is automatically pushed when the component mounts
 * and popped when it unmounts.
 *
 * @param context - The context to register
 * @param enabled - Optional condition to enable/disable (default: true)
 */
export function useRegisterShortcutContext(
  context: ShortcutContext,
  enabled: boolean = true
) {
  const { pushContext, popContext } = useShortcutContext();

  useEffect(() => {
    if (enabled) {
      pushContext(context);
      return () => popContext(context);
    }
  }, [context, enabled, pushContext, popContext]);
}

/**
 * Hook to conditionally activate a context.
 * Returns functions to manually push/pop the context.
 *
 * @param context - The context to manage
 */
export function useManagedShortcutContext(context: ShortcutContext) {
  const { pushContext, popContext, isContextActive } = useShortcutContext();

  const activate = useCallback(() => {
    pushContext(context);
  }, [context, pushContext]);

  const deactivate = useCallback(() => {
    popContext(context);
  }, [context, popContext]);

  const isActive = isContextActive(context);

  return { activate, deactivate, isActive };
}
