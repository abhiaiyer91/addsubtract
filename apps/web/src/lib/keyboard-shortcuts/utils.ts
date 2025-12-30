/**
 * Keyboard Shortcuts Utility Functions
 *
 * Provides helper functions for formatting, parsing, and validating
 * keyboard shortcuts.
 */

/**
 * Check if the current platform is Mac.
 */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
}

/**
 * Format a shortcut key string for display.
 * Converts 'mod+s' to '\u2318S' on Mac or 'Ctrl+S' on Windows/Linux.
 *
 * @param keys - The hotkey string (e.g., 'mod+shift+s')
 * @returns Formatted string for display
 */
export function formatShortcutDisplay(keys: string): string {
  const mac = isMac();

  return keys
    .split('+')
    .map((key) => {
      const k = key.toLowerCase().trim();
      switch (k) {
        case 'mod':
          return mac ? '\u2318' : 'Ctrl';
        case 'shift':
          return mac ? '\u21E7' : 'Shift';
        case 'alt':
          return mac ? '\u2325' : 'Alt';
        case 'ctrl':
          return mac ? '\u2303' : 'Ctrl';
        case 'enter':
          return '\u23CE';
        case 'return':
          return '\u23CE';
        case 'escape':
        case 'esc':
          return 'Esc';
        case 'tab':
          return '\u21E5';
        case 'backspace':
          return '\u232B';
        case 'delete':
          return '\u2326';
        case 'arrowup':
        case 'up':
          return '\u2191';
        case 'arrowdown':
        case 'down':
          return '\u2193';
        case 'arrowleft':
        case 'left':
          return '\u2190';
        case 'arrowright':
        case 'right':
          return '\u2192';
        case 'space':
          return 'Space';
        case '`':
          return '`';
        default:
          return k.toUpperCase();
      }
    })
    .join(mac ? '' : '+');
}

/**
 * Format a shortcut key string as an array for legacy compatibility.
 * Converts 'mod+shift+s' to ['mod', 'shift', 's'].
 *
 * @param keys - The hotkey string
 * @returns Array of key parts
 */
export function formatShortcutAsArray(keys: string): string[] {
  return keys.split('+').map((k) => k.trim().toLowerCase());
}

/**
 * Parse a keyboard event into a hotkey string.
 * Returns null if only modifier keys are pressed.
 *
 * @param e - The keyboard event
 * @returns Hotkey string or null
 */
export function parseKeyboardEvent(e: KeyboardEvent): string | null {
  const parts: string[] = [];

  // Ignore modifier-only presses
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
    return null;
  }

  // Add modifiers
  if (e.metaKey || e.ctrlKey) parts.push('mod');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');

  // Normalize the key
  let key = e.key.toLowerCase();
  switch (key) {
    case ' ':
      key = 'space';
      break;
    case 'escape':
      key = 'esc';
      break;
    case 'arrowup':
      key = 'up';
      break;
    case 'arrowdown':
      key = 'down';
      break;
    case 'arrowleft':
      key = 'left';
      break;
    case 'arrowright':
      key = 'right';
      break;
  }

  parts.push(key);

  return parts.join('+');
}

/**
 * Check if a key combination is valid (has at least one non-modifier key).
 *
 * @param keys - The hotkey string
 * @returns True if valid
 */
export function isValidShortcut(keys: string): boolean {
  const parts = keys.split('+').map((p) => p.trim().toLowerCase());
  if (parts.length === 0) return false;

  const modifiers = ['mod', 'shift', 'alt', 'ctrl', 'meta'];
  const hasNonModifier = parts.some((p) => !modifiers.includes(p));

  return hasNonModifier;
}

/**
 * Normalize a hotkey string for comparison.
 * Sorts modifiers and lowercases everything.
 *
 * @param keys - The hotkey string
 * @returns Normalized string
 */
export function normalizeShortcut(keys: string): string {
  const parts = keys.split('+').map((p) => p.trim().toLowerCase());

  // Separate modifiers and key
  const modifiers = ['mod', 'shift', 'alt', 'ctrl', 'meta'];
  const mods = parts.filter((p) => modifiers.includes(p)).sort();
  const nonMods = parts.filter((p) => !modifiers.includes(p));

  return [...mods, ...nonMods].join('+');
}

/**
 * Check if two shortcuts conflict (same keys in same or overlapping context).
 *
 * @param keys1 - First hotkey string
 * @param keys2 - Second hotkey string
 * @returns True if they conflict
 */
export function shortcutsConflict(keys1: string, keys2: string): boolean {
  return normalizeShortcut(keys1) === normalizeShortcut(keys2);
}

/**
 * Get a human-readable description of a shortcut context.
 *
 * @param context - The shortcut context
 * @returns Human-readable description
 */
export function getContextDescription(
  context: 'global' | 'editor' | 'terminal' | 'modal' | 'ide' | 'repo' | 'list'
): string {
  switch (context) {
    case 'global':
      return 'Works everywhere';
    case 'editor':
      return 'When editing code';
    case 'terminal':
      return 'When terminal is focused';
    case 'modal':
      return 'When a modal is open';
    case 'ide':
      return 'In IDE mode';
    case 'repo':
      return 'On repository pages';
    case 'list':
      return 'In list views';
    default:
      return 'Unknown context';
  }
}

/**
 * Convert a shortcut array format to string format.
 * ['mod', 'shift', 's'] -> 'mod+shift+s'
 *
 * @param shortcut - Array of key parts
 * @returns Hotkey string
 */
export function shortcutArrayToString(shortcut: string[]): string {
  return shortcut.join('+').toLowerCase();
}

/**
 * Check if an element is an input field where shortcuts should be disabled.
 *
 * @param element - The DOM element
 * @returns True if shortcuts should be disabled
 */
export function isInputElement(element: EventTarget | null): boolean {
  if (!element || !(element instanceof HTMLElement)) return false;

  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement ||
    element.isContentEditable
  );
}
