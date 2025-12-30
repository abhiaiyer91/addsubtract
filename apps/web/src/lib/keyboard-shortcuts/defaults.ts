/**
 * Default Keyboard Shortcuts
 *
 * This module defines all the default keyboard shortcuts for the wit platform.
 * Shortcuts are organized by category and context.
 */

import type { ShortcutDefinition } from './types';

export const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [
  // ============================================
  // GLOBAL SHORTCUTS
  // ============================================
  {
    id: 'global.search',
    keys: 'mod+k',
    description: 'Open search / command palette',
    context: 'global',
    category: 'Global',
    action: { type: 'store-action', store: 'searchModal', action: 'toggle' },
  },
  {
    id: 'global.quickSearch',
    keys: '/',
    description: 'Focus search',
    context: 'global',
    category: 'Global',
    action: { type: 'store-action', store: 'searchModal', action: 'open' },
  },
  {
    id: 'global.shortcuts',
    keys: 'shift+/',
    description: 'Show keyboard shortcuts',
    context: 'global',
    category: 'Global',
    action: { type: 'store-action', store: 'shortcutsModal', action: 'toggle' },
  },
  {
    id: 'global.shortcutsAlt',
    keys: 'mod+/',
    description: 'Show keyboard shortcuts (alternative)',
    context: 'global',
    category: 'Global',
    action: { type: 'store-action', store: 'shortcutsModal', action: 'toggle' },
  },

  // ============================================
  // NAVIGATION SHORTCUTS
  // ============================================
  {
    id: 'nav.home',
    keys: 'alt+h',
    description: 'Go to dashboard',
    context: 'global',
    category: 'Navigation',
    action: { type: 'navigate', path: '/' },
  },
  {
    id: 'nav.notifications',
    keys: 'alt+n',
    description: 'Go to notifications',
    context: 'global',
    category: 'Navigation',
    action: { type: 'navigate', path: '/notifications' },
  },
  {
    id: 'nav.settings',
    keys: 'alt+s',
    description: 'Go to settings',
    context: 'global',
    category: 'Navigation',
    action: { type: 'navigate', path: '/settings' },
  },

  // ============================================
  // COMMAND PALETTE SHORTCUTS
  // ============================================
  {
    id: 'palette.commands',
    keys: 'mod+shift+p',
    description: 'Open command palette (all commands)',
    context: 'global',
    category: 'Command Palette',
    action: { type: 'store-action', store: 'commandPalette', action: 'open' },
  },
  {
    id: 'palette.files',
    keys: 'mod+p',
    description: 'Quick open file',
    context: 'ide',
    category: 'Command Palette',
    action: { type: 'function', handler: 'openQuickOpen' },
  },

  // ============================================
  // IDE LAYOUT SHORTCUTS
  // ============================================
  {
    id: 'ide.toggleSidebar',
    keys: 'mod+b',
    description: 'Toggle file tree sidebar',
    context: 'ide',
    category: 'Layout',
    action: { type: 'store-action', store: 'ide', action: 'toggleFileTree' },
  },
  {
    id: 'ide.toggleTerminal',
    keys: 'mod+`',
    description: 'Toggle terminal panel',
    context: 'ide',
    category: 'Layout',
    action: { type: 'store-action', store: 'ide', action: 'toggleTerminal' },
  },
  {
    id: 'ide.toggleTerminalAlt',
    keys: 'mod+j',
    description: 'Toggle terminal (alternative)',
    context: 'ide',
    category: 'Layout',
    action: { type: 'store-action', store: 'ide', action: 'toggleTerminal' },
  },
  {
    id: 'ide.focusTerminal',
    keys: 'mod+shift+`',
    description: 'Focus terminal',
    context: 'ide',
    category: 'Layout',
    action: { type: 'function', handler: 'focusTerminal' },
  },
  {
    id: 'ide.exit',
    keys: 'escape',
    description: 'Exit IDE mode',
    context: 'ide',
    category: 'Layout',
    action: { type: 'store-action', store: 'ide', action: 'exitIDEMode' },
  },

  // ============================================
  // EDITOR SHORTCUTS
  // ============================================
  {
    id: 'editor.save',
    keys: 'mod+s',
    description: 'Save current file',
    context: 'editor',
    category: 'Editor',
    action: { type: 'function', handler: 'saveFile' },
  },
  {
    id: 'editor.closeTab',
    keys: 'mod+w',
    description: 'Close current tab',
    context: 'ide',
    category: 'Tabs',
    action: { type: 'function', handler: 'closeCurrentTab' },
  },
  {
    id: 'editor.nextTab',
    keys: 'mod+tab',
    description: 'Switch to next tab',
    context: 'ide',
    category: 'Tabs',
    action: { type: 'function', handler: 'nextTab' },
  },
  {
    id: 'editor.prevTab',
    keys: 'mod+shift+tab',
    description: 'Switch to previous tab',
    context: 'ide',
    category: 'Tabs',
    action: { type: 'function', handler: 'prevTab' },
  },
  {
    id: 'editor.tab1',
    keys: 'mod+1',
    description: 'Switch to tab 1',
    context: 'ide',
    category: 'Tabs',
    action: { type: 'function', handler: 'switchToTab', payload: 0 },
  },
  {
    id: 'editor.tab2',
    keys: 'mod+2',
    description: 'Switch to tab 2',
    context: 'ide',
    category: 'Tabs',
    action: { type: 'function', handler: 'switchToTab', payload: 1 },
  },
  {
    id: 'editor.tab3',
    keys: 'mod+3',
    description: 'Switch to tab 3',
    context: 'ide',
    category: 'Tabs',
    action: { type: 'function', handler: 'switchToTab', payload: 2 },
  },
  {
    id: 'editor.tab4',
    keys: 'mod+4',
    description: 'Switch to tab 4',
    context: 'ide',
    category: 'Tabs',
    action: { type: 'function', handler: 'switchToTab', payload: 3 },
  },
  {
    id: 'editor.tab5',
    keys: 'mod+5',
    description: 'Switch to tab 5',
    context: 'ide',
    category: 'Tabs',
    action: { type: 'function', handler: 'switchToTab', payload: 4 },
  },
  {
    id: 'editor.tab6',
    keys: 'mod+6',
    description: 'Switch to tab 6',
    context: 'ide',
    category: 'Tabs',
    action: { type: 'function', handler: 'switchToTab', payload: 5 },
  },
  {
    id: 'editor.tab7',
    keys: 'mod+7',
    description: 'Switch to tab 7',
    context: 'ide',
    category: 'Tabs',
    action: { type: 'function', handler: 'switchToTab', payload: 6 },
  },
  {
    id: 'editor.tab8',
    keys: 'mod+8',
    description: 'Switch to tab 8',
    context: 'ide',
    category: 'Tabs',
    action: { type: 'function', handler: 'switchToTab', payload: 7 },
  },
  {
    id: 'editor.tab9',
    keys: 'mod+9',
    description: 'Switch to last tab',
    context: 'ide',
    category: 'Tabs',
    action: { type: 'function', handler: 'switchToTab', payload: -1 },
  },

  // ============================================
  // GIT SHORTCUTS
  // ============================================
  {
    id: 'git.panel',
    keys: 'mod+shift+g',
    description: 'Open Git panel',
    context: 'ide',
    category: 'Git',
    action: { type: 'function', handler: 'openGitPanel' },
  },
  {
    id: 'git.commit',
    keys: 'mod+enter',
    description: 'Commit staged changes',
    context: 'ide',
    category: 'Git',
    action: { type: 'function', handler: 'commitChanges' },
  },
  {
    id: 'git.push',
    keys: 'mod+shift+k',
    description: 'Push to remote',
    context: 'ide',
    category: 'Git',
    action: { type: 'function', handler: 'pushChanges' },
  },
  {
    id: 'git.pull',
    keys: 'mod+shift+l',
    description: 'Pull from remote',
    context: 'ide',
    category: 'Git',
    action: { type: 'function', handler: 'pullChanges' },
  },

  // ============================================
  // REPOSITORY NAVIGATION SHORTCUTS
  // ============================================
  {
    id: 'repo.code',
    keys: 'alt+c',
    description: 'Go to code',
    context: 'repo',
    category: 'Repository',
    action: { type: 'function', handler: 'navigateToCode' },
  },
  {
    id: 'repo.issues',
    keys: 'alt+i',
    description: 'Go to issues',
    context: 'repo',
    category: 'Repository',
    action: { type: 'function', handler: 'navigateToIssues' },
  },
  {
    id: 'repo.pulls',
    keys: 'alt+p',
    description: 'Go to pull requests',
    context: 'repo',
    category: 'Repository',
    action: { type: 'function', handler: 'navigateToPulls' },
  },
  {
    id: 'repo.actions',
    keys: 'alt+a',
    description: 'Go to actions',
    context: 'repo',
    category: 'Repository',
    action: { type: 'function', handler: 'navigateToActions' },
  },
  {
    id: 'repo.branches',
    keys: 'alt+b',
    description: 'Go to branches',
    context: 'repo',
    category: 'Repository',
    action: { type: 'function', handler: 'navigateToBranches' },
  },
  {
    id: 'repo.branchSwitcher',
    keys: 'b',
    description: 'Open branch switcher',
    context: 'repo',
    category: 'Repository',
    action: { type: 'store-action', store: 'branchSwitcher', action: 'toggle' },
  },

  // ============================================
  // LIST NAVIGATION SHORTCUTS
  // ============================================
  {
    id: 'list.next',
    keys: 'j',
    description: 'Next item',
    context: 'list',
    category: 'Lists',
    action: { type: 'function', handler: 'listNext' },
  },
  {
    id: 'list.prev',
    keys: 'k',
    description: 'Previous item',
    context: 'list',
    category: 'Lists',
    action: { type: 'function', handler: 'listPrev' },
  },
  {
    id: 'list.open',
    keys: 'o',
    description: 'Open selected',
    context: 'list',
    category: 'Lists',
    action: { type: 'function', handler: 'listOpen' },
  },
  {
    id: 'list.openEnter',
    keys: 'enter',
    description: 'Open selected (Enter)',
    context: 'list',
    category: 'Lists',
    action: { type: 'function', handler: 'listOpen' },
  },
  {
    id: 'list.create',
    keys: 'c',
    description: 'Create new',
    context: 'list',
    category: 'Lists',
    action: { type: 'function', handler: 'listCreate' },
  },
];

/**
 * Get all shortcuts by category.
 */
export function getShortcutsByCategory(): Map<string, ShortcutDefinition[]> {
  const map = new Map<string, ShortcutDefinition[]>();
  for (const shortcut of DEFAULT_SHORTCUTS) {
    const list = map.get(shortcut.category) || [];
    list.push(shortcut);
    map.set(shortcut.category, list);
  }
  return map;
}

/**
 * Get all shortcuts by context.
 */
export function getShortcutsByContext(
  context: ShortcutDefinition['context']
): ShortcutDefinition[] {
  return DEFAULT_SHORTCUTS.filter((s) => s.context === context);
}

/**
 * Get a shortcut by ID.
 */
export function getShortcutById(id: string): ShortcutDefinition | undefined {
  return DEFAULT_SHORTCUTS.find((s) => s.id === id);
}

/**
 * All categories in display order.
 */
export const SHORTCUT_CATEGORIES = [
  'Global',
  'Navigation',
  'Command Palette',
  'Layout',
  'Editor',
  'Tabs',
  'Git',
  'Repository',
  'Lists',
] as const;
