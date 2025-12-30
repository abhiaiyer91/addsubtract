/**
 * Keyboard Shortcut Presets
 *
 * Pre-configured shortcut schemes that users can choose from.
 * Each preset can override any default shortcut binding.
 */

import type { ShortcutPreset } from './types';

export const PRESETS: ShortcutPreset[] = [
  {
    id: 'default',
    name: 'Default',
    description: 'Standard wit keyboard shortcuts',
    shortcuts: {},
  },
  {
    id: 'vscode',
    name: 'VS Code',
    description: 'Shortcuts similar to Visual Studio Code',
    shortcuts: {
      // Layout
      'ide.toggleSidebar': 'mod+b',
      'ide.toggleTerminal': 'mod+`',
      'ide.toggleTerminalAlt': 'mod+j',

      // Editor
      'editor.save': 'mod+s',
      'editor.closeTab': 'mod+w',

      // Command palette
      'palette.files': 'mod+p',
      'palette.commands': 'mod+shift+p',

      // Search
      'global.search': 'mod+shift+f',

      // Git
      'git.panel': 'mod+shift+g',
      'git.commit': 'mod+enter',
    },
  },
  {
    id: 'vim',
    name: 'Vim-like',
    description: 'Vim-inspired navigation and editing shortcuts',
    shortcuts: {
      // List navigation (already vim-like)
      'list.next': 'j',
      'list.prev': 'k',
      'list.open': 'enter',

      // Search
      'global.search': '/',
      'global.quickSearch': '/',

      // Navigation using g prefix is handled differently
      // These are just fallbacks
      'nav.home': 'g h',
      'nav.notifications': 'g n',
      'nav.settings': 'g s',

      // Repository navigation
      'repo.code': 'g c',
      'repo.issues': 'g i',
      'repo.pulls': 'g p',
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Only essential shortcuts to avoid conflicts with browser',
    shortcuts: {
      // Core shortcuts only
      'global.search': 'mod+k',
      'global.shortcuts': 'mod+/',
      'editor.save': 'mod+s',

      // Disable potentially conflicting shortcuts
      'global.quickSearch': '',
      'list.next': '',
      'list.prev': '',
      'list.open': '',
      'list.create': '',
      'repo.branchSwitcher': '',
    },
  },
  {
    id: 'jetbrains',
    name: 'JetBrains',
    description: 'Shortcuts similar to IntelliJ IDEA / WebStorm',
    shortcuts: {
      // Search
      'global.search': 'shift+shift',
      'palette.files': 'mod+shift+n',
      'palette.commands': 'mod+shift+a',

      // Layout
      'ide.toggleSidebar': 'mod+1',
      'ide.toggleTerminal': 'alt+f12',

      // Editor
      'editor.save': 'mod+s',
      'editor.closeTab': 'mod+f4',

      // Navigation
      'editor.nextTab': 'alt+right',
      'editor.prevTab': 'alt+left',

      // Git
      'git.commit': 'mod+k',
      'git.push': 'mod+shift+k',
      'git.pull': 'mod+t',
    },
  },
];

/**
 * Get a preset by ID.
 */
export function getPresetById(id: string): ShortcutPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/**
 * Get all preset IDs.
 */
export function getPresetIds(): string[] {
  return PRESETS.map((p) => p.id);
}

/**
 * Check if a preset ID is valid.
 */
export function isValidPresetId(id: string): boolean {
  return PRESETS.some((p) => p.id === id);
}
