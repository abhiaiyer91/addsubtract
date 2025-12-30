/**
 * Keyboard Shortcuts System Types
 *
 * This module defines the core types for the keyboard shortcuts system,
 * including shortcut definitions, contexts, actions, and presets.
 */

/**
 * Shortcut context determines where a shortcut is active.
 * - global: Works everywhere in the application
 * - editor: Only active when code editor has focus
 * - terminal: Only active when terminal has focus
 * - modal: Only active when a modal is open
 * - ide: Only active in IDE mode
 * - repo: Only active on repository pages
 * - list: Only active in list views (issues, PRs, etc.)
 */
export type ShortcutContext =
  | 'global'
  | 'editor'
  | 'terminal'
  | 'modal'
  | 'ide'
  | 'repo'
  | 'list';

/**
 * Action to execute when a shortcut is triggered.
 */
export type ShortcutAction =
  | { type: 'navigate'; path: string }
  | { type: 'function'; handler: string }
  | { type: 'store-action'; store: string; action: string; payload?: unknown }
  | { type: 'command'; commandId: string };

/**
 * Definition of a keyboard shortcut.
 */
export interface ShortcutDefinition {
  /** Unique identifier (e.g., 'editor.save', 'global.search') */
  id: string;
  /** Hotkey string using react-hotkeys-hook format (e.g., 'mod+s', 'alt+shift+p') */
  keys: string;
  /** Human-readable description */
  description: string;
  /** Where this shortcut is active */
  context: ShortcutContext;
  /** Category for grouping in UI (e.g., 'Editor', 'Navigation', 'Git') */
  category: string;
  /** What to do when triggered */
  action: ShortcutAction;
  /** Whether this shortcut is enabled (default: true) */
  enabled?: boolean;
  /** Allow triggering in form fields (default: false) */
  allowInInput?: boolean;
  /** Prevent default browser behavior (default: true) */
  preventDefault?: boolean;
}

/**
 * Conflict detected between two shortcuts.
 */
export interface ShortcutConflict {
  /** ID of the shortcut with the conflict */
  shortcutId: string;
  /** ID of the conflicting shortcut */
  conflictingId: string;
  /** The key combination that conflicts */
  keys: string;
  /** The context where the conflict occurs */
  context: ShortcutContext;
}

/**
 * A preset scheme of keyboard shortcuts.
 */
export interface ShortcutPreset {
  /** Unique identifier for the preset */
  id: string;
  /** Display name */
  name: string;
  /** Description of the preset */
  description: string;
  /** Key overrides: shortcutId -> keys */
  shortcuts: Partial<Record<string, string>>;
}

/**
 * User's custom shortcut configuration.
 */
export interface ShortcutConfig {
  /** Version for migration purposes */
  version: number;
  /** Custom key bindings: shortcutId -> keys */
  customBindings: Record<string, string>;
  /** IDs of disabled shortcuts */
  disabledShortcuts: string[];
  /** Currently active preset (null = custom) */
  activePreset: string | null;
}

/**
 * Handler function type for shortcut actions.
 */
export type ShortcutHandler = () => void | Promise<void>;

/**
 * Registry of shortcut handlers by name.
 */
export type HandlerRegistry = Map<string, ShortcutHandler>;

/**
 * Store actions registry entry.
 */
export type StoreActions = Record<string, () => void>;

/**
 * Registry of store actions by store name.
 */
export type StoreRegistry = Map<string, StoreActions>;
