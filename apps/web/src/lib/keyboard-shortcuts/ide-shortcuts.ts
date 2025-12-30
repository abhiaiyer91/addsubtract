/**
 * Comprehensive IDE keyboard shortcuts configuration
 * 
 * This defines all the keyboard shortcuts available in wit's IDE mode
 * for a keyboard-first, ultra-fast coding experience.
 */

export interface KeyboardShortcut {
  id: string;
  keys: string[];
  description: string;
  category: ShortcutCategory;
  contexts: ShortcutContext[];
  action?: () => void;
  isEnabled?: boolean;
}

export type ShortcutCategory = 
  | 'navigation'
  | 'editing'
  | 'ai'
  | 'git'
  | 'files'
  | 'panels'
  | 'search'
  | 'debug';

export type ShortcutContext = 
  | 'global'
  | 'editor'
  | 'terminal'
  | 'chat'
  | 'filetree';

// Platform detection
const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');
const mod = isMac ? '⌘' : 'Ctrl';
const alt = isMac ? '⌥' : 'Alt';
const shift = '⇧';

/**
 * Default IDE shortcuts
 */
export const IDE_SHORTCUTS: KeyboardShortcut[] = [
  // ═══════════════════════════════════════════════════
  // AI SHORTCUTS - The most important ones!
  // ═══════════════════════════════════════════════════
  {
    id: 'ai.inlineEdit',
    keys: [`${mod}K`],
    description: 'AI inline edit - transform code with AI',
    category: 'ai',
    contexts: ['editor'],
  },
  {
    id: 'ai.explain',
    keys: [`${mod}${shift}E`],
    description: 'Explain selected code',
    category: 'ai',
    contexts: ['editor'],
  },
  {
    id: 'ai.fix',
    keys: [`${mod}${shift}F`],
    description: 'Fix issues in selected code',
    category: 'ai',
    contexts: ['editor'],
  },
  {
    id: 'ai.refactor',
    keys: [`${mod}${shift}R`],
    description: 'Refactor selected code',
    category: 'ai',
    contexts: ['editor'],
  },
  {
    id: 'ai.generateTests',
    keys: [`${mod}${shift}T`],
    description: 'Generate tests for selected code',
    category: 'ai',
    contexts: ['editor'],
  },
  {
    id: 'ai.addDocs',
    keys: [`${mod}${shift}D`],
    description: 'Add documentation to code',
    category: 'ai',
    contexts: ['editor'],
  },
  {
    id: 'ai.chat',
    keys: [`${mod}L`],
    description: 'Focus chat and ask about selection',
    category: 'ai',
    contexts: ['global'],
  },
  {
    id: 'ai.acceptSuggestion',
    keys: ['Tab'],
    description: 'Accept AI suggestion',
    category: 'ai',
    contexts: ['editor'],
  },
  {
    id: 'ai.dismissSuggestion',
    keys: ['Escape'],
    description: 'Dismiss AI suggestion',
    category: 'ai',
    contexts: ['editor'],
  },

  // ═══════════════════════════════════════════════════
  // NAVIGATION SHORTCUTS
  // ═══════════════════════════════════════════════════
  {
    id: 'nav.quickOpen',
    keys: [`${mod}P`],
    description: 'Quick open file',
    category: 'navigation',
    contexts: ['global'],
  },
  {
    id: 'nav.commandPalette',
    keys: [`${mod}${shift}P`],
    description: 'Open command palette',
    category: 'navigation',
    contexts: ['global'],
  },
  {
    id: 'nav.goToLine',
    keys: [`${mod}G`],
    description: 'Go to line',
    category: 'navigation',
    contexts: ['editor'],
  },
  {
    id: 'nav.goToSymbol',
    keys: [`${mod}${shift}O`],
    description: 'Go to symbol in file',
    category: 'navigation',
    contexts: ['editor'],
  },
  {
    id: 'nav.goToDefinition',
    keys: ['F12'],
    description: 'Go to definition',
    category: 'navigation',
    contexts: ['editor'],
  },
  {
    id: 'nav.peekDefinition',
    keys: [`${alt}F12`],
    description: 'Peek definition',
    category: 'navigation',
    contexts: ['editor'],
  },
  {
    id: 'nav.goBack',
    keys: [`${alt}←`],
    description: 'Go back',
    category: 'navigation',
    contexts: ['global'],
  },
  {
    id: 'nav.goForward',
    keys: [`${alt}→`],
    description: 'Go forward',
    category: 'navigation',
    contexts: ['global'],
  },

  // ═══════════════════════════════════════════════════
  // FILE SHORTCUTS
  // ═══════════════════════════════════════════════════
  {
    id: 'files.save',
    keys: [`${mod}S`],
    description: 'Save file',
    category: 'files',
    contexts: ['editor'],
  },
  {
    id: 'files.saveAll',
    keys: [`${mod}${alt}S`],
    description: 'Save all files',
    category: 'files',
    contexts: ['global'],
  },
  {
    id: 'files.close',
    keys: [`${mod}W`],
    description: 'Close current tab',
    category: 'files',
    contexts: ['global'],
  },
  {
    id: 'files.closeAll',
    keys: [`${mod}${shift}W`],
    description: 'Close all tabs',
    category: 'files',
    contexts: ['global'],
  },
  {
    id: 'files.newFile',
    keys: [`${mod}N`],
    description: 'New file',
    category: 'files',
    contexts: ['global'],
  },
  {
    id: 'files.nextTab',
    keys: [`${mod}Tab`],
    description: 'Next tab',
    category: 'files',
    contexts: ['global'],
  },
  {
    id: 'files.prevTab',
    keys: [`${mod}${shift}Tab`],
    description: 'Previous tab',
    category: 'files',
    contexts: ['global'],
  },
  {
    id: 'files.tab1',
    keys: [`${mod}1`],
    description: 'Go to tab 1',
    category: 'files',
    contexts: ['global'],
  },
  {
    id: 'files.tab2',
    keys: [`${mod}2`],
    description: 'Go to tab 2',
    category: 'files',
    contexts: ['global'],
  },
  {
    id: 'files.tab3',
    keys: [`${mod}3`],
    description: 'Go to tab 3',
    category: 'files',
    contexts: ['global'],
  },
  {
    id: 'files.lastTab',
    keys: [`${mod}9`],
    description: 'Go to last tab',
    category: 'files',
    contexts: ['global'],
  },

  // ═══════════════════════════════════════════════════
  // EDITING SHORTCUTS
  // ═══════════════════════════════════════════════════
  {
    id: 'edit.undo',
    keys: [`${mod}Z`],
    description: 'Undo',
    category: 'editing',
    contexts: ['editor'],
  },
  {
    id: 'edit.redo',
    keys: [`${mod}${shift}Z`],
    description: 'Redo',
    category: 'editing',
    contexts: ['editor'],
  },
  {
    id: 'edit.cut',
    keys: [`${mod}X`],
    description: 'Cut line/selection',
    category: 'editing',
    contexts: ['editor'],
  },
  {
    id: 'edit.copy',
    keys: [`${mod}C`],
    description: 'Copy line/selection',
    category: 'editing',
    contexts: ['editor'],
  },
  {
    id: 'edit.paste',
    keys: [`${mod}V`],
    description: 'Paste',
    category: 'editing',
    contexts: ['editor'],
  },
  {
    id: 'edit.duplicateLine',
    keys: [`${mod}${shift}D`],
    description: 'Duplicate line',
    category: 'editing',
    contexts: ['editor'],
  },
  {
    id: 'edit.moveLine.up',
    keys: [`${alt}↑`],
    description: 'Move line up',
    category: 'editing',
    contexts: ['editor'],
  },
  {
    id: 'edit.moveLine.down',
    keys: [`${alt}↓`],
    description: 'Move line down',
    category: 'editing',
    contexts: ['editor'],
  },
  {
    id: 'edit.deleteLine',
    keys: [`${mod}${shift}K`],
    description: 'Delete line',
    category: 'editing',
    contexts: ['editor'],
  },
  {
    id: 'edit.comment',
    keys: [`${mod}/`],
    description: 'Toggle comment',
    category: 'editing',
    contexts: ['editor'],
  },
  {
    id: 'edit.format',
    keys: [`${mod}${shift}F`],
    description: 'Format document',
    category: 'editing',
    contexts: ['editor'],
  },
  {
    id: 'edit.selectAll',
    keys: [`${mod}A`],
    description: 'Select all',
    category: 'editing',
    contexts: ['editor'],
  },
  {
    id: 'edit.selectWord',
    keys: [`${mod}D`],
    description: 'Select word / Add selection to next match',
    category: 'editing',
    contexts: ['editor'],
  },
  {
    id: 'edit.multiCursor.up',
    keys: [`${mod}${alt}↑`],
    description: 'Add cursor above',
    category: 'editing',
    contexts: ['editor'],
  },
  {
    id: 'edit.multiCursor.down',
    keys: [`${mod}${alt}↓`],
    description: 'Add cursor below',
    category: 'editing',
    contexts: ['editor'],
  },

  // ═══════════════════════════════════════════════════
  // SEARCH SHORTCUTS
  // ═══════════════════════════════════════════════════
  {
    id: 'search.find',
    keys: [`${mod}F`],
    description: 'Find in file',
    category: 'search',
    contexts: ['editor'],
  },
  {
    id: 'search.replace',
    keys: [`${mod}H`],
    description: 'Find and replace',
    category: 'search',
    contexts: ['editor'],
  },
  {
    id: 'search.findInFiles',
    keys: [`${mod}${shift}F`],
    description: 'Find in files',
    category: 'search',
    contexts: ['global'],
  },
  {
    id: 'search.replaceInFiles',
    keys: [`${mod}${shift}H`],
    description: 'Replace in files',
    category: 'search',
    contexts: ['global'],
  },
  {
    id: 'search.semantic',
    keys: [`${mod}${shift}S`],
    description: 'Semantic search with AI',
    category: 'search',
    contexts: ['global'],
  },

  // ═══════════════════════════════════════════════════
  // PANEL SHORTCUTS
  // ═══════════════════════════════════════════════════
  {
    id: 'panels.toggleSidebar',
    keys: [`${mod}B`],
    description: 'Toggle file tree sidebar',
    category: 'panels',
    contexts: ['global'],
  },
  {
    id: 'panels.toggleTerminal',
    keys: [`${mod}\``],
    description: 'Toggle terminal',
    category: 'panels',
    contexts: ['global'],
  },
  {
    id: 'panels.toggleChat',
    keys: [`${mod}J`],
    description: 'Toggle AI chat panel',
    category: 'panels',
    contexts: ['global'],
  },
  {
    id: 'panels.focusEditor',
    keys: [`${mod}1`],
    description: 'Focus editor',
    category: 'panels',
    contexts: ['global'],
  },
  {
    id: 'panels.focusTerminal',
    keys: [`${mod}2`],
    description: 'Focus terminal',
    category: 'panels',
    contexts: ['global'],
  },
  {
    id: 'panels.focusChat',
    keys: [`${mod}3`],
    description: 'Focus chat',
    category: 'panels',
    contexts: ['global'],
  },
  {
    id: 'panels.exitIDE',
    keys: ['Escape'],
    description: 'Exit IDE mode',
    category: 'panels',
    contexts: ['global'],
  },

  // ═══════════════════════════════════════════════════
  // GIT SHORTCUTS
  // ═══════════════════════════════════════════════════
  {
    id: 'git.commit',
    keys: [`${mod}${shift}G`],
    description: 'Git: Commit',
    category: 'git',
    contexts: ['global'],
  },
  {
    id: 'git.push',
    keys: [`${mod}${shift}P`],
    description: 'Git: Push',
    category: 'git',
    contexts: ['global'],
  },
  {
    id: 'git.pull',
    keys: [`${mod}${shift}L`],
    description: 'Git: Pull',
    category: 'git',
    contexts: ['global'],
  },
  {
    id: 'git.stage',
    keys: [`${mod}${alt}S`],
    description: 'Stage current file',
    category: 'git',
    contexts: ['editor'],
  },
  {
    id: 'git.diff',
    keys: [`${mod}${alt}D`],
    description: 'Show diff',
    category: 'git',
    contexts: ['editor'],
  },
];

/**
 * Group shortcuts by category
 */
export function getShortcutsByCategory(): Record<ShortcutCategory, KeyboardShortcut[]> {
  const groups: Record<ShortcutCategory, KeyboardShortcut[]> = {
    ai: [],
    navigation: [],
    editing: [],
    files: [],
    search: [],
    panels: [],
    git: [],
    debug: [],
  };

  for (const shortcut of IDE_SHORTCUTS) {
    groups[shortcut.category].push(shortcut);
  }

  return groups;
}

/**
 * Format a keyboard shortcut for display
 */
export function formatShortcut(keys: string[]): string {
  return keys.join(' ');
}
