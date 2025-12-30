/**
 * Keyboard Shortcuts System
 *
 * A comprehensive keyboard shortcuts system for the wit platform.
 *
 * @example
 * // In App.tsx - wrap your app with the provider
 * import { ShortcutContextProvider, useKeyboardShortcuts } from '@/lib/keyboard-shortcuts';
 *
 * function App() {
 *   return (
 *     <ShortcutContextProvider>
 *       <AppContent />
 *     </ShortcutContextProvider>
 *   );
 * }
 *
 * function AppContent() {
 *   useKeyboardShortcuts(); // Register global shortcuts
 *   return <YourApp />;
 * }
 *
 * @example
 * // Register a shortcut handler in a component
 * import { useShortcutHandler } from '@/lib/keyboard-shortcuts';
 *
 * function MyComponent() {
 *   const handleSave = useCallback(() => {
 *     // Save logic
 *   }, []);
 *
 *   useShortcutHandler('saveFile', handleSave);
 * }
 *
 * @example
 * // Register a context for a component
 * import { useRegisterShortcutContext } from '@/lib/keyboard-shortcuts';
 *
 * function IDEView() {
 *   useRegisterShortcutContext('ide');
 *   return <IDE />;
 * }
 */

// Types
export type {
  ShortcutContext,
  ShortcutAction,
  ShortcutDefinition,
  ShortcutConflict,
  ShortcutPreset,
  ShortcutConfig,
  ShortcutHandler,
  HandlerRegistry,
  StoreActions,
  StoreRegistry,
} from './types';

// Defaults and presets
export {
  DEFAULT_SHORTCUTS,
  getShortcutsByCategory,
  getShortcutsByContext,
  getShortcutById,
  SHORTCUT_CATEGORIES,
} from './defaults';

export { PRESETS, getPresetById, getPresetIds, isValidPresetId } from './presets';

// Store
export {
  useShortcutStore,
  getEffectiveKeysStatic,
  isShortcutDisabledStatic,
} from './store';

// Context
export {
  ShortcutContextProvider,
  useShortcutContext,
  useRegisterShortcutContext,
  useManagedShortcutContext,
} from './context';

// Hooks
export {
  registerShortcutHandler,
  getShortcutHandler,
  registerStoreActions,
  getStoreActions,
  executeShortcutAction,
  useShortcutHandler,
  useStoreActionsRegistration,
  useGlobalKeyboardShortcuts,
  useIDEKeyboardShortcuts,
  useRepoKeyboardShortcuts,
  useListKeyboardShortcuts,
  useKeyboardShortcuts,
} from './useShortcuts';

// Utilities
export {
  isMac,
  formatShortcutDisplay,
  formatShortcutAsArray,
  parseKeyboardEvent,
  isValidShortcut,
  normalizeShortcut,
  shortcutsConflict,
  getContextDescription,
  shortcutArrayToString,
  isInputElement,
} from './utils';
