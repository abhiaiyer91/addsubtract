/**
 * Command Palette for tsgit
 * VS Code-style command palette with fuzzy search
 */

/**
 * Command category
 */
export type CommandCategory = 
  | 'file'
  | 'git'
  | 'branch'
  | 'commit'
  | 'diff'
  | 'search'
  | 'view'
  | 'settings'
  | 'help';

/**
 * Command definition
 */
export interface Command {
  id: string;
  name: string;
  description?: string;
  category: CommandCategory;
  shortcut?: string;
  icon?: string;
  action: () => void | Promise<void>;
  when?: () => boolean;
}

/**
 * Command search result
 */
export interface CommandSearchResult {
  command: Command;
  score: number;
  matches: number[];
}

/**
 * Category metadata
 */
const categoryMeta: Record<CommandCategory, { icon: string; label: string }> = {
  file: { icon: '📄', label: 'Files' },
  git: { icon: '🔧', label: 'Git' },
  branch: { icon: '🌿', label: 'Branches' },
  commit: { icon: '✓', label: 'Commits' },
  diff: { icon: '📝', label: 'Diff' },
  search: { icon: '🔍', label: 'Search' },
  view: { icon: '👁', label: 'View' },
  settings: { icon: '⚙️', label: 'Settings' },
  help: { icon: '❓', label: 'Help' },
};

/**
 * Command registry
 */
export class CommandRegistry {
  private commands: Map<string, Command> = new Map();

  /**
   * Register a command
   */
  register(command: Command): void {
    this.commands.set(command.id, command);
  }

  /**
   * Register multiple commands
   */
  registerAll(commands: Command[]): void {
    for (const cmd of commands) {
      this.register(cmd);
    }
  }

  /**
   * Get a command by id
   */
  get(id: string): Command | undefined {
    return this.commands.get(id);
  }

  /**
   * Get all commands
   */
  getAll(): Command[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get commands available based on current context
   */
  getAvailable(): Command[] {
    return this.getAll().filter(cmd => !cmd.when || cmd.when());
  }

  /**
   * Execute a command
   */
  async execute(id: string): Promise<void> {
    const command = this.commands.get(id);
    if (command) {
      await command.action();
    }
  }

  /**
   * Unregister a command
   */
  unregister(id: string): void {
    this.commands.delete(id);
  }
}

/**
 * Fuzzy search implementation
 */
export function fuzzySearch(query: string, commands: Command[]): CommandSearchResult[] {
  if (!query) {
    return commands.map(cmd => ({ command: cmd, score: 0, matches: [] }));
  }

  const queryLower = query.toLowerCase();
  const results: CommandSearchResult[] = [];

  for (const command of commands) {
    const nameLower = command.name.toLowerCase();
    const result = fuzzyMatch(queryLower, nameLower);

    if (result.score > 0) {
      results.push({
        command,
        score: result.score,
        matches: result.matches,
      });
    }
  }

  // Sort by score (higher is better)
  results.sort((a, b) => b.score - a.score);

  return results;
}

/**
 * Fuzzy match algorithm
 */
function fuzzyMatch(query: string, text: string): { score: number; matches: number[] } {
  if (query.length === 0) return { score: 1, matches: [] };
  if (query.length > text.length) return { score: 0, matches: [] };

  const matches: number[] = [];
  let score = 0;
  let queryIndex = 0;
  let lastMatchIndex = -1;
  let consecutiveBonus = 0;

  for (let i = 0; i < text.length && queryIndex < query.length; i++) {
    if (text[i] === query[queryIndex]) {
      matches.push(i);
      
      // Bonus for consecutive matches
      if (lastMatchIndex === i - 1) {
        consecutiveBonus += 10;
      } else {
        consecutiveBonus = 0;
      }

      // Bonus for matching at start
      if (i === 0) {
        score += 25;
      }

      // Bonus for matching after separator
      if (i > 0 && (text[i - 1] === ' ' || text[i - 1] === ':' || text[i - 1] === '-')) {
        score += 15;
      }

      score += 10 + consecutiveBonus;
      lastMatchIndex = i;
      queryIndex++;
    }
  }

  // All query characters must match
  if (queryIndex !== query.length) {
    return { score: 0, matches: [] };
  }

  // Bonus for shorter text (more specific match)
  score += Math.max(0, 50 - text.length);

  // Bonus for exact match
  if (text === query) {
    score += 100;
  }

  return { score, matches };
}

/**
 * Highlight matched characters in text
 */
export function highlightMatches(text: string, matches: number[]): string {
  if (matches.length === 0) return escapeHtml(text);

  const matchSet = new Set(matches);
  let result = '';
  let inMatch = false;

  for (let i = 0; i < text.length; i++) {
    const isMatch = matchSet.has(i);
    
    if (isMatch && !inMatch) {
      result += '<mark>';
      inMatch = true;
    } else if (!isMatch && inMatch) {
      result += '</mark>';
      inMatch = false;
    }
    
    result += escapeHtml(text[i]);
  }

  if (inMatch) {
    result += '</mark>';
  }

  return result;
}

/**
 * Escape HTML characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Get default tsgit commands
 */
export function getDefaultCommands(callbacks: {
  onCommit?: () => void;
  onStage?: () => void;
  onStageAll?: () => void;
  onUnstage?: () => void;
  onSwitchBranch?: () => void;
  onCreateBranch?: () => void;
  onDeleteBranch?: () => void;
  onPush?: () => void;
  onPull?: () => void;
  onFetch?: () => void;
  onStash?: () => void;
  onStashPop?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onRefresh?: () => void;
  onSearch?: () => void;
  onToggleTheme?: () => void;
  onOpenSettings?: () => void;
  onShowGraph?: () => void;
  onShowDiff?: () => void;
  onShowHistory?: () => void;
  onShowHelp?: () => void;
  onAmend?: () => void;
  onRevert?: () => void;
  onCherry?: () => void;
  onMerge?: () => void;
  onRebase?: () => void;
}): Command[] {
  return [
    // Git commands
    {
      id: 'git.commit',
      name: 'Git: Commit',
      description: 'Create a new commit',
      category: 'commit',
      shortcut: 'Ctrl+Enter',
      icon: '✓',
      action: callbacks.onCommit || (() => {}),
    },
    {
      id: 'git.stage',
      name: 'Git: Stage File',
      description: 'Stage the current file',
      category: 'git',
      shortcut: 'Ctrl+S',
      icon: '+',
      action: callbacks.onStage || (() => {}),
    },
    {
      id: 'git.stageAll',
      name: 'Git: Stage All Changes',
      description: 'Stage all modified files',
      category: 'git',
      shortcut: 'Ctrl+Shift+S',
      icon: '++',
      action: callbacks.onStageAll || (() => {}),
    },
    {
      id: 'git.unstage',
      name: 'Git: Unstage File',
      description: 'Unstage the current file',
      category: 'git',
      icon: '-',
      action: callbacks.onUnstage || (() => {}),
    },
    {
      id: 'git.amend',
      name: 'Git: Amend Last Commit',
      description: 'Amend the last commit',
      category: 'commit',
      icon: '✏️',
      action: callbacks.onAmend || (() => {}),
    },
    {
      id: 'git.revert',
      name: 'Git: Revert Commit',
      description: 'Revert a commit',
      category: 'commit',
      icon: '↩',
      action: callbacks.onRevert || (() => {}),
    },
    {
      id: 'git.cherry',
      name: 'Git: Cherry Pick',
      description: 'Cherry pick a commit',
      category: 'commit',
      icon: '🍒',
      action: callbacks.onCherry || (() => {}),
    },

    // Branch commands
    {
      id: 'branch.switch',
      name: 'Branch: Switch',
      description: 'Switch to another branch',
      category: 'branch',
      shortcut: 'Ctrl+B',
      icon: '🌿',
      action: callbacks.onSwitchBranch || (() => {}),
    },
    {
      id: 'branch.create',
      name: 'Branch: Create New',
      description: 'Create a new branch',
      category: 'branch',
      shortcut: 'Ctrl+Shift+B',
      icon: '+',
      action: callbacks.onCreateBranch || (() => {}),
    },
    {
      id: 'branch.delete',
      name: 'Branch: Delete',
      description: 'Delete a branch',
      category: 'branch',
      icon: '🗑',
      action: callbacks.onDeleteBranch || (() => {}),
    },
    {
      id: 'branch.merge',
      name: 'Branch: Merge',
      description: 'Merge another branch into current',
      category: 'branch',
      icon: '🔀',
      action: callbacks.onMerge || (() => {}),
    },
    {
      id: 'branch.rebase',
      name: 'Branch: Rebase',
      description: 'Rebase current branch',
      category: 'branch',
      icon: '📐',
      action: callbacks.onRebase || (() => {}),
    },

    // Stash commands
    {
      id: 'stash.save',
      name: 'Stash: Save Changes',
      description: 'Stash current changes',
      category: 'git',
      shortcut: 'Ctrl+Shift+Z',
      icon: '📦',
      action: callbacks.onStash || (() => {}),
    },
    {
      id: 'stash.pop',
      name: 'Stash: Pop',
      description: 'Pop the latest stash',
      category: 'git',
      icon: '📤',
      action: callbacks.onStashPop || (() => {}),
    },

    // Remote commands
    {
      id: 'remote.push',
      name: 'Remote: Push',
      description: 'Push to remote repository',
      category: 'git',
      shortcut: 'Ctrl+P',
      icon: '⬆',
      action: callbacks.onPush || (() => {}),
    },
    {
      id: 'remote.pull',
      name: 'Remote: Pull',
      description: 'Pull from remote repository',
      category: 'git',
      shortcut: 'Ctrl+L',
      icon: '⬇',
      action: callbacks.onPull || (() => {}),
    },
    {
      id: 'remote.fetch',
      name: 'Remote: Fetch',
      description: 'Fetch from remote repository',
      category: 'git',
      icon: '🔄',
      action: callbacks.onFetch || (() => {}),
    },

    // View commands
    {
      id: 'view.graph',
      name: 'View: Commit Graph',
      description: 'Show the commit graph',
      category: 'view',
      shortcut: 'Ctrl+G',
      icon: '📊',
      action: callbacks.onShowGraph || (() => {}),
    },
    {
      id: 'view.diff',
      name: 'View: Diff',
      description: 'Show diff viewer',
      category: 'view',
      shortcut: 'Ctrl+D',
      icon: '📝',
      action: callbacks.onShowDiff || (() => {}),
    },
    {
      id: 'view.history',
      name: 'View: History',
      description: 'Show operation history',
      category: 'view',
      shortcut: 'Ctrl+H',
      icon: '🕐',
      action: callbacks.onShowHistory || (() => {}),
    },

    // Edit commands
    {
      id: 'edit.undo',
      name: 'Undo Last Operation',
      description: 'Undo the last git operation',
      category: 'git',
      shortcut: 'Ctrl+Z',
      icon: '↩',
      action: callbacks.onUndo || (() => {}),
    },
    {
      id: 'edit.redo',
      name: 'Redo Operation',
      description: 'Redo the last undone operation',
      category: 'git',
      shortcut: 'Ctrl+Shift+Z',
      icon: '↪',
      action: callbacks.onRedo || (() => {}),
    },

    // Search commands
    {
      id: 'search.open',
      name: 'Search: Open',
      description: 'Open search panel',
      category: 'search',
      shortcut: 'Ctrl+F',
      icon: '🔍',
      action: callbacks.onSearch || (() => {}),
    },

    // Settings commands
    {
      id: 'settings.toggleTheme',
      name: 'Settings: Toggle Dark/Light Mode',
      description: 'Switch between dark and light theme',
      category: 'settings',
      shortcut: 'Ctrl+T',
      icon: '🌓',
      action: callbacks.onToggleTheme || (() => {}),
    },
    {
      id: 'settings.open',
      name: 'Settings: Open',
      description: 'Open settings panel',
      category: 'settings',
      shortcut: 'Ctrl+,',
      icon: '⚙️',
      action: callbacks.onOpenSettings || (() => {}),
    },

    // Utility commands
    {
      id: 'refresh',
      name: 'Refresh',
      description: 'Refresh the current view',
      category: 'view',
      shortcut: 'R',
      icon: '🔄',
      action: callbacks.onRefresh || (() => {}),
    },
    {
      id: 'help',
      name: 'Show Help',
      description: 'Show keyboard shortcuts and help',
      category: 'help',
      shortcut: '?',
      icon: '❓',
      action: callbacks.onShowHelp || (() => {}),
    },
  ];
}

/**
 * Render command palette HTML
 */
export function renderCommandPaletteHTML(): string {
  return `
    <div class="command-palette-overlay" id="command-palette-overlay">
      <div class="command-palette">
        <div class="command-palette-header">
          <input 
            type="text" 
            class="command-palette-input" 
            id="command-palette-input"
            placeholder="Type a command..."
            autocomplete="off"
            spellcheck="false"
          >
        </div>
        <div class="command-palette-results" id="command-palette-results"></div>
        <div class="command-palette-footer">
          <span><kbd>↑↓</kbd> Navigate</span>
          <span><kbd>Enter</kbd> Execute</span>
          <span><kbd>Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render command list HTML
 */
export function renderCommandListHTML(results: CommandSearchResult[]): string {
  if (results.length === 0) {
    return '<div class="command-palette-empty">No commands found</div>';
  }

  // Group by category
  const grouped = new Map<CommandCategory, CommandSearchResult[]>();
  for (const result of results) {
    const category = result.command.category;
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(result);
  }

  let html = '';
  let index = 0;

  for (const [category, categoryResults] of grouped) {
    const meta = categoryMeta[category];
    html += `<div class="command-palette-group">
      <div class="command-palette-group-label">
        <span class="command-palette-group-icon">${meta.icon}</span>
        ${meta.label}
      </div>`;

    for (const result of categoryResults) {
      const { command, matches } = result;
      const highlightedName = highlightMatches(command.name, matches);

      html += `
        <div class="command-palette-item" data-command="${command.id}" data-index="${index}">
          <span class="command-palette-item-icon">${command.icon || ''}</span>
          <div class="command-palette-item-content">
            <span class="command-palette-item-name">${highlightedName}</span>
            ${command.description ? `<span class="command-palette-item-desc">${command.description}</span>` : ''}
          </div>
          ${command.shortcut ? `<span class="command-palette-item-shortcut"><kbd>${command.shortcut}</kbd></span>` : ''}
        </div>
      `;
      index++;
    }

    html += '</div>';
  }

  return html;
}

/**
 * Get command palette CSS
 */
export function getCommandPaletteStyles(): string {
  return `
    .command-palette-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--bg-overlay);
      backdrop-filter: var(--blur);
      display: none;
      align-items: flex-start;
      justify-content: center;
      padding-top: 15vh;
      z-index: 9999;
    }

    .command-palette-overlay.open {
      display: flex;
    }

    .command-palette {
      width: 560px;
      max-width: 90vw;
      max-height: 60vh;
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      border-radius: var(--border-radius-lg);
      box-shadow: var(--shadow-xl);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      animation: commandPaletteSlide 0.15s ease;
    }

    @keyframes commandPaletteSlide {
      from {
        opacity: 0;
        transform: translateY(-10px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    .command-palette-header {
      padding: var(--spacing-md);
      border-bottom: 1px solid var(--border-default);
    }

    .command-palette-input {
      width: 100%;
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--border-radius);
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-family: var(--font-family);
      outline: none;
      transition: border-color var(--transition-fast);
    }

    .command-palette-input:focus {
      border-color: var(--border-focus);
    }

    .command-palette-input::placeholder {
      color: var(--text-muted);
    }

    .command-palette-results {
      flex: 1;
      overflow-y: auto;
      padding: var(--spacing-sm);
    }

    .command-palette-group {
      margin-bottom: var(--spacing-sm);
    }

    .command-palette-group-label {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-xs) var(--spacing-sm);
      font-size: var(--font-size-xs);
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-muted);
      letter-spacing: 0.5px;
    }

    .command-palette-group-icon {
      font-size: 12px;
    }

    .command-palette-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--border-radius);
      cursor: pointer;
      transition: background var(--transition-fast);
    }

    .command-palette-item:hover,
    .command-palette-item.selected {
      background: var(--bg-tertiary);
    }

    .command-palette-item.selected {
      outline: 1px solid var(--border-focus);
    }

    .command-palette-item-icon {
      width: 24px;
      text-align: center;
      font-size: 16px;
    }

    .command-palette-item-content {
      flex: 1;
      min-width: 0;
    }

    .command-palette-item-name {
      color: var(--text-primary);
      font-size: var(--font-size-base);
    }

    .command-palette-item-name mark {
      background: var(--accent-warning);
      color: var(--text-inverse);
      padding: 0 2px;
      border-radius: 2px;
    }

    .command-palette-item-desc {
      display: block;
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .command-palette-item-shortcut {
      color: var(--text-muted);
      font-size: var(--font-size-xs);
    }

    .command-palette-item-shortcut kbd {
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: 3px;
      padding: 2px 6px;
      font-family: var(--font-family-mono);
      font-size: var(--font-size-xs);
    }

    .command-palette-empty {
      text-align: center;
      padding: var(--spacing-xl);
      color: var(--text-muted);
    }

    .command-palette-footer {
      display: flex;
      gap: var(--spacing-md);
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--bg-secondary);
      border-top: 1px solid var(--border-default);
      font-size: var(--font-size-xs);
      color: var(--text-muted);
    }

    .command-palette-footer kbd {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: 3px;
      padding: 1px 4px;
      font-family: var(--font-family-mono);
      font-size: 10px;
      margin-right: 4px;
    }
  `;
}

/**
 * Command palette controller (for web UI)
 */
export class CommandPaletteController {
  private registry: CommandRegistry;
  private overlay: HTMLElement | null = null;
  private input: HTMLInputElement | null = null;
  private results: HTMLElement | null = null;
  private selectedIndex: number = 0;
  private filteredCommands: CommandSearchResult[] = [];

  constructor(registry: CommandRegistry) {
    this.registry = registry;
  }

  /**
   * Initialize the command palette
   */
  init(container: HTMLElement): void {
    container.insertAdjacentHTML('beforeend', renderCommandPaletteHTML());
    
    this.overlay = document.getElementById('command-palette-overlay');
    this.input = document.getElementById('command-palette-input') as HTMLInputElement;
    this.results = document.getElementById('command-palette-results');

    if (!this.overlay || !this.input || !this.results) return;

    // Input handling
    this.input.addEventListener('input', () => this.handleInput());
    this.input.addEventListener('keydown', (e) => this.handleKeydown(e));

    // Close on overlay click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    });

    // Result click handling
    this.results.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.command-palette-item') as HTMLElement;
      if (item) {
        const commandId = item.dataset.command;
        if (commandId) {
          this.executeCommand(commandId);
        }
      }
    });

    // Initial render
    this.updateResults('');
  }

  /**
   * Open the command palette
   */
  open(): void {
    if (!this.overlay || !this.input) return;
    
    this.overlay.classList.add('open');
    this.input.value = '';
    this.selectedIndex = 0;
    this.updateResults('');
    this.input.focus();
  }

  /**
   * Close the command palette
   */
  close(): void {
    if (!this.overlay) return;
    this.overlay.classList.remove('open');
  }

  /**
   * Toggle the command palette
   */
  toggle(): void {
    if (this.overlay?.classList.contains('open')) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Handle input changes
   */
  private handleInput(): void {
    if (!this.input) return;
    const query = this.input.value;
    this.selectedIndex = 0;
    this.updateResults(query);
  }

  /**
   * Handle keyboard navigation
   */
  private handleKeydown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectNext();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.selectPrev();
        break;
      case 'Enter':
        e.preventDefault();
        this.executeSelected();
        break;
      case 'Escape':
        e.preventDefault();
        this.close();
        break;
    }
  }

  /**
   * Update results based on query
   */
  private updateResults(query: string): void {
    if (!this.results) return;

    const commands = this.registry.getAvailable();
    this.filteredCommands = fuzzySearch(query, commands);
    this.results.innerHTML = renderCommandListHTML(this.filteredCommands);
    this.updateSelection();
  }

  /**
   * Select next item
   */
  private selectNext(): void {
    if (this.filteredCommands.length === 0) return;
    this.selectedIndex = (this.selectedIndex + 1) % this.filteredCommands.length;
    this.updateSelection();
  }

  /**
   * Select previous item
   */
  private selectPrev(): void {
    if (this.filteredCommands.length === 0) return;
    this.selectedIndex = (this.selectedIndex - 1 + this.filteredCommands.length) % this.filteredCommands.length;
    this.updateSelection();
  }

  /**
   * Update visual selection
   */
  private updateSelection(): void {
    if (!this.results) return;

    const items = this.results.querySelectorAll('.command-palette-item');
    items.forEach((item, index) => {
      item.classList.toggle('selected', index === this.selectedIndex);
      if (index === this.selectedIndex) {
        item.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  /**
   * Execute selected command
   */
  private executeSelected(): void {
    if (this.filteredCommands.length === 0) return;
    const command = this.filteredCommands[this.selectedIndex];
    if (command) {
      this.executeCommand(command.command.id);
    }
  }

  /**
   * Execute a command by id
   */
  private async executeCommand(id: string): Promise<void> {
    this.close();
    await this.registry.execute(id);
  }
}
