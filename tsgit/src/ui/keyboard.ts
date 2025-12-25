/**
 * Comprehensive Keyboard Navigation System for tsgit
 * Full keyboard support with customizable shortcuts
 */

/**
 * Key combination
 */
export interface KeyCombo {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

/**
 * Keyboard shortcut definition
 */
export interface Shortcut {
  id: string;
  keys: KeyCombo[];
  description: string;
  category: string;
  action: () => void;
  when?: () => boolean;
}

/**
 * Parse key string to KeyCombo
 * Formats: "Ctrl+S", "Alt+Shift+P", "Escape", "?"
 */
export function parseKeyString(keyString: string): KeyCombo {
  const parts = keyString.toLowerCase().split('+');
  const combo: KeyCombo = { key: '' };

  for (const part of parts) {
    const trimmed = part.trim();
    switch (trimmed) {
      case 'ctrl':
      case 'control':
        combo.ctrl = true;
        break;
      case 'alt':
      case 'option':
        combo.alt = true;
        break;
      case 'shift':
        combo.shift = true;
        break;
      case 'meta':
      case 'cmd':
      case 'command':
      case 'win':
        combo.meta = true;
        break;
      default:
        combo.key = trimmed;
    }
  }

  return combo;
}

/**
 * Format KeyCombo to display string
 */
export function formatKeyCombo(combo: KeyCombo): string {
  const parts: string[] = [];

  if (combo.ctrl) parts.push('Ctrl');
  if (combo.alt) parts.push('Alt');
  if (combo.shift) parts.push('Shift');
  if (combo.meta) parts.push('⌘');

  // Format special keys
  const keyMap: Record<string, string> = {
    'arrowup': '↑',
    'arrowdown': '↓',
    'arrowleft': '←',
    'arrowright': '→',
    'enter': '↵',
    'escape': 'Esc',
    'tab': 'Tab',
    'backspace': '⌫',
    'delete': 'Del',
    ' ': 'Space',
  };

  const displayKey = keyMap[combo.key.toLowerCase()] || combo.key.toUpperCase();
  parts.push(displayKey);

  return parts.join('+');
}

/**
 * Check if event matches KeyCombo
 */
export function matchesKeyCombo(event: KeyboardEvent, combo: KeyCombo): boolean {
  const key = event.key.toLowerCase();
  const comboKey = combo.key.toLowerCase();

  // Handle special cases
  if (comboKey === 'space' && key !== ' ') return false;
  if (comboKey !== 'space' && key !== comboKey) return false;

  if ((combo.ctrl || false) !== event.ctrlKey) return false;
  if ((combo.alt || false) !== event.altKey) return false;
  if ((combo.shift || false) !== event.shiftKey) return false;
  if ((combo.meta || false) !== event.metaKey) return false;

  return true;
}

/**
 * Keyboard manager
 */
export class KeyboardManager {
  private shortcuts: Map<string, Shortcut> = new Map();
  private enabled: boolean = true;
  private focusTrapStack: HTMLElement[] = [];

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * Initialize keyboard handling
   */
  init(): void {
    document.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Enable/disable keyboard handling
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Register a shortcut
   */
  register(shortcut: Shortcut): void {
    this.shortcuts.set(shortcut.id, shortcut);
  }

  /**
   * Register multiple shortcuts
   */
  registerAll(shortcuts: Shortcut[]): void {
    for (const s of shortcuts) {
      this.register(s);
    }
  }

  /**
   * Unregister a shortcut
   */
  unregister(id: string): void {
    this.shortcuts.delete(id);
  }

  /**
   * Get all shortcuts
   */
  getShortcuts(): Shortcut[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * Get shortcuts grouped by category
   */
  getShortcutsByCategory(): Map<string, Shortcut[]> {
    const grouped = new Map<string, Shortcut[]>();

    for (const shortcut of this.shortcuts.values()) {
      if (!grouped.has(shortcut.category)) {
        grouped.set(shortcut.category, []);
      }
      grouped.get(shortcut.category)!.push(shortcut);
    }

    return grouped;
  }

  /**
   * Handle keydown event
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.enabled) return;

    // Don't intercept if typing in input
    const target = event.target as HTMLElement;
    if (this.isInputElement(target)) {
      // Allow Escape to blur inputs
      if (event.key === 'Escape') {
        target.blur();
      }
      return;
    }

    // Check all shortcuts
    for (const shortcut of this.shortcuts.values()) {
      // Check condition
      if (shortcut.when && !shortcut.when()) continue;

      // Check if any key combo matches
      for (const combo of shortcut.keys) {
        if (matchesKeyCombo(event, combo)) {
          event.preventDefault();
          event.stopPropagation();
          shortcut.action();
          return;
        }
      }
    }
  }

  /**
   * Check if element is an input
   */
  private isInputElement(element: HTMLElement): boolean {
    const tagName = element.tagName.toLowerCase();
    return tagName === 'input' || 
           tagName === 'textarea' || 
           tagName === 'select' ||
           element.isContentEditable;
  }

  /**
   * Push a focus trap (for modals)
   */
  pushFocusTrap(container: HTMLElement): void {
    this.focusTrapStack.push(container);
    this.setupFocusTrap(container);
  }

  /**
   * Pop a focus trap
   */
  popFocusTrap(): void {
    const container = this.focusTrapStack.pop();
    if (container) {
      this.removeFocusTrap(container);
    }
  }

  /**
   * Setup focus trap for a container
   */
  private setupFocusTrap(container: HTMLElement): void {
    const focusables = this.getFocusables(container);
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    const trapHandler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', trapHandler);
    (container as any)._focusTrapHandler = trapHandler;

    // Focus first element
    first.focus();
  }

  /**
   * Remove focus trap
   */
  private removeFocusTrap(container: HTMLElement): void {
    const handler = (container as any)._focusTrapHandler;
    if (handler) {
      container.removeEventListener('keydown', handler);
      delete (container as any)._focusTrapHandler;
    }
  }

  /**
   * Get focusable elements in container
   */
  private getFocusables(container: HTMLElement): HTMLElement[] {
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    return Array.from(container.querySelectorAll(selector));
  }
}

/**
 * Default tsgit shortcuts
 */
export function getDefaultShortcuts(callbacks: {
  onCommandPalette?: () => void;
  onCommit?: () => void;
  onStage?: () => void;
  onStageAll?: () => void;
  onRefresh?: () => void;
  onUndo?: () => void;
  onSearch?: () => void;
  onToggleTheme?: () => void;
  onShowGraph?: () => void;
  onShowDiff?: () => void;
  onShowHistory?: () => void;
  onShowHelp?: () => void;
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onSelect?: () => void;
  onEscape?: () => void;
  onSwitchBranch?: () => void;
  onNextPanel?: () => void;
  onPrevPanel?: () => void;
}): Shortcut[] {
  return [
    // Command palette
    {
      id: 'commandPalette',
      keys: [
        parseKeyString('Ctrl+Shift+P'),
        parseKeyString('Ctrl+P'),
      ],
      description: 'Open command palette',
      category: 'General',
      action: callbacks.onCommandPalette || (() => {}),
    },

    // Git actions
    {
      id: 'commit',
      keys: [parseKeyString('Ctrl+Enter')],
      description: 'Create commit',
      category: 'Git',
      action: callbacks.onCommit || (() => {}),
    },
    {
      id: 'stage',
      keys: [parseKeyString('Ctrl+S')],
      description: 'Stage current file',
      category: 'Git',
      action: callbacks.onStage || (() => {}),
    },
    {
      id: 'stageAll',
      keys: [parseKeyString('Ctrl+Shift+S')],
      description: 'Stage all files',
      category: 'Git',
      action: callbacks.onStageAll || (() => {}),
    },
    {
      id: 'undo',
      keys: [parseKeyString('Ctrl+Z')],
      description: 'Undo last operation',
      category: 'Git',
      action: callbacks.onUndo || (() => {}),
    },
    {
      id: 'switchBranch',
      keys: [parseKeyString('Ctrl+B')],
      description: 'Switch branch',
      category: 'Git',
      action: callbacks.onSwitchBranch || (() => {}),
    },

    // View
    {
      id: 'refresh',
      keys: [
        { key: 'r' },
        parseKeyString('Ctrl+R'),
      ],
      description: 'Refresh',
      category: 'View',
      action: callbacks.onRefresh || (() => {}),
    },
    {
      id: 'showGraph',
      keys: [parseKeyString('Ctrl+G')],
      description: 'Show commit graph',
      category: 'View',
      action: callbacks.onShowGraph || (() => {}),
    },
    {
      id: 'showDiff',
      keys: [parseKeyString('Ctrl+D')],
      description: 'Show diff view',
      category: 'View',
      action: callbacks.onShowDiff || (() => {}),
    },
    {
      id: 'showHistory',
      keys: [parseKeyString('Ctrl+H')],
      description: 'Show history',
      category: 'View',
      action: callbacks.onShowHistory || (() => {}),
    },

    // Search
    {
      id: 'search',
      keys: [parseKeyString('Ctrl+F'), { key: '/' }],
      description: 'Focus search',
      category: 'Search',
      action: callbacks.onSearch || (() => {}),
    },

    // Settings
    {
      id: 'toggleTheme',
      keys: [parseKeyString('Ctrl+T')],
      description: 'Toggle dark/light mode',
      category: 'Settings',
      action: callbacks.onToggleTheme || (() => {}),
    },

    // Help
    {
      id: 'showHelp',
      keys: [{ key: '?' }, parseKeyString('F1')],
      description: 'Show help',
      category: 'Help',
      action: callbacks.onShowHelp || (() => {}),
    },

    // Navigation
    {
      id: 'navigateUp',
      keys: [{ key: 'arrowup' }, { key: 'k' }],
      description: 'Navigate up',
      category: 'Navigation',
      action: callbacks.onNavigateUp || (() => {}),
    },
    {
      id: 'navigateDown',
      keys: [{ key: 'arrowdown' }, { key: 'j' }],
      description: 'Navigate down',
      category: 'Navigation',
      action: callbacks.onNavigateDown || (() => {}),
    },
    {
      id: 'select',
      keys: [{ key: 'enter' }, { key: ' ' }],
      description: 'Select item',
      category: 'Navigation',
      action: callbacks.onSelect || (() => {}),
    },
    {
      id: 'escape',
      keys: [{ key: 'escape' }],
      description: 'Cancel/Close',
      category: 'Navigation',
      action: callbacks.onEscape || (() => {}),
    },
    {
      id: 'nextPanel',
      keys: [{ key: 'tab' }],
      description: 'Next panel',
      category: 'Navigation',
      action: callbacks.onNextPanel || (() => {}),
    },
    {
      id: 'prevPanel',
      keys: [parseKeyString('Shift+Tab')],
      description: 'Previous panel',
      category: 'Navigation',
      action: callbacks.onPrevPanel || (() => {}),
    },
  ];
}

/**
 * Render keyboard shortcuts help modal
 */
export function renderKeyboardHelpHTML(shortcuts: Shortcut[]): string {
  // Group by category
  const grouped = new Map<string, Shortcut[]>();
  for (const s of shortcuts) {
    if (!grouped.has(s.category)) {
      grouped.set(s.category, []);
    }
    grouped.get(s.category)!.push(s);
  }

  return `
    <div class="keyboard-help">
      <div class="keyboard-help-header">
        <h2>Keyboard Shortcuts</h2>
        <p>Use these shortcuts to navigate and perform actions quickly.</p>
      </div>
      <div class="keyboard-help-content">
        ${Array.from(grouped.entries()).map(([category, items]) => `
          <div class="keyboard-help-section">
            <h3>${category}</h3>
            <div class="keyboard-help-list">
              ${items.map(s => `
                <div class="keyboard-help-item">
                  <span class="keyboard-help-desc">${s.description}</span>
                  <span class="keyboard-help-keys">
                    ${s.keys.map(k => `<kbd>${formatKeyCombo(k)}</kbd>`).join(' or ')}
                  </span>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Keyboard help CSS
 */
export function getKeyboardHelpStyles(): string {
  return `
    .keyboard-help {
      max-height: 70vh;
      overflow-y: auto;
    }

    .keyboard-help-header {
      margin-bottom: var(--spacing-lg);
    }

    .keyboard-help-header h2 {
      margin: 0 0 var(--spacing-xs);
      font-size: var(--font-size-xl);
      color: var(--text-primary);
    }

    .keyboard-help-header p {
      color: var(--text-secondary);
      font-size: var(--font-size-sm);
      margin: 0;
    }

    .keyboard-help-content {
      display: grid;
      gap: var(--spacing-lg);
    }

    .keyboard-help-section h3 {
      font-size: var(--font-size-sm);
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-muted);
      margin: 0 0 var(--spacing-sm);
      letter-spacing: 0.5px;
    }

    .keyboard-help-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }

    .keyboard-help-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--spacing-sm);
      background: var(--bg-tertiary);
      border-radius: var(--border-radius);
    }

    .keyboard-help-desc {
      color: var(--text-primary);
      font-size: var(--font-size-sm);
    }

    .keyboard-help-keys {
      display: flex;
      gap: var(--spacing-xs);
      align-items: center;
      color: var(--text-muted);
      font-size: var(--font-size-xs);
    }

    .keyboard-help-keys kbd {
      display: inline-block;
      padding: 4px 8px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: 4px;
      font-family: var(--font-family-mono);
      font-size: var(--font-size-xs);
      color: var(--text-primary);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    }
  `;
}

/**
 * Singleton keyboard manager
 */
export const keyboardManager = new KeyboardManager();
