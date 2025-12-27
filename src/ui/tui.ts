/**
 * Terminal User Interface (TUI) for wit
 * A beautiful, interactive terminal interface
 */

import * as blessed from 'blessed';
import * as path from 'path';
import { Repository } from '../core/repository';
import { Commit } from '../core/object';
import { diff, DiffLine } from '../core/diff';
import { StackManager, StackNode } from '../core/stack';

// Type augmentation for blessed
declare module 'blessed' {
  interface ListElement {
    selected: number;
    items: blessed.Widgets.BlessedElement[];
  }
}

/**
 * TUI Application
 */
export class TsgitTUI {
  private screen: blessed.Widgets.Screen;
  private repo: Repository;
  
  // UI Components
  private header!: blessed.Widgets.BoxElement;
  private statusBox!: blessed.Widgets.BoxElement;
  private filesBox!: blessed.Widgets.ListElement;
  private logBox!: blessed.Widgets.ListElement;
  private diffBox!: blessed.Widgets.BoxElement;
  private branchBox!: blessed.Widgets.ListElement;
  private stackBox!: blessed.Widgets.ListElement;
  private helpBox!: blessed.Widgets.BoxElement;
  private commandInput!: blessed.Widgets.TextboxElement;
  private messageBox!: blessed.Widgets.MessageElement;

  private currentView: 'main' | 'log' | 'diff' | 'branches' | 'stacks' = 'main';
  private selectedFile: string | null = null;
  private stackManager: StackManager;

  constructor(repo: Repository) {
    this.repo = repo;
    this.stackManager = new StackManager(repo, repo.gitDir);
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'wit - Visual Interface',
      fullUnicode: true,
    });

    this.setupUI();
    this.setupKeyBindings();
    this.refresh();
  }

  /**
   * Setup the UI layout
   */
  private setupUI(): void {
    // Header
    this.header = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: this.getHeaderContent(),
      tags: true,
      style: {
        fg: 'white',
        bg: 'blue',
        bold: true,
      },
    });

    // Status box (left panel)
    this.statusBox = blessed.box({
      parent: this.screen,
      label: ' Status ',
      top: 3,
      left: 0,
      width: '50%',
      height: '40%-3',
      border: { type: 'line' },
      tags: true,
      style: {
        border: { fg: 'cyan' },
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        style: { bg: 'cyan' },
      },
    });

    // Files list (right panel top)
    this.filesBox = blessed.list({
      parent: this.screen,
      label: ' Files ',
      top: 3,
      left: '50%',
      width: '50%',
      height: '40%-3',
      border: { type: 'line' },
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      style: {
        border: { fg: 'green' },
        selected: { bg: 'green', fg: 'black' },
        item: { fg: 'white' },
      },
      scrollbar: {
        style: { bg: 'green' },
      },
    });

    // Log box (bottom left)
    this.logBox = blessed.list({
      parent: this.screen,
      label: ' Commit Log ',
      top: '40%',
      left: 0,
      width: '50%',
      height: '50%',
      border: { type: 'line' },
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      style: {
        border: { fg: 'yellow' },
        selected: { bg: 'yellow', fg: 'black' },
        item: { fg: 'white' },
      },
      scrollbar: {
        style: { bg: 'yellow' },
      },
    });

    // Diff box (bottom right)
    this.diffBox = blessed.box({
      parent: this.screen,
      label: ' Diff ',
      top: '40%',
      left: '50%',
      width: '50%',
      height: '50%',
      border: { type: 'line' },
      tags: true,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      style: {
        border: { fg: 'magenta' },
        label: { fg: 'magenta', bold: true },
      },
      scrollbar: {
        style: { bg: 'magenta' },
      },
    });

    // Help bar at bottom
    this.helpBox = blessed.box({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: ' {bold}q{/bold}:quit  {bold}r{/bold}:refresh  {bold}a{/bold}:add  {bold}c{/bold}:commit  {bold}s{/bold}:switch  {bold}t{/bold}:stacks  {bold}p{/bold}:push  {bold}l{/bold}:pull  {bold}?{/bold}:help',
      tags: true,
      style: {
        fg: 'white',
        bg: 'gray',
      },
    });

    // Branch list (hidden by default)
    this.branchBox = blessed.list({
      parent: this.screen,
      label: ' Branches ',
      top: 'center',
      left: 'center',
      width: '50%',
      height: '50%',
      border: { type: 'line' },
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      hidden: true,
      style: {
        border: { fg: 'cyan' },
        selected: { bg: 'cyan', fg: 'black' },
      },
    });

    // Stack list (hidden by default)
    this.stackBox = blessed.list({
      parent: this.screen,
      label: ' Stacked Diffs ',
      top: 'center',
      left: 'center',
      width: '60%',
      height: '60%',
      border: { type: 'line' },
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      hidden: true,
      style: {
        border: { fg: 'magenta' },
        selected: { bg: 'magenta', fg: 'black' },
      },
    });

    // Message box for notifications
    this.messageBox = blessed.message({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '50%',
      height: 'shrink',
      border: { type: 'line' },
      hidden: true,
      style: {
        border: { fg: 'white' },
      },
    });
  }

  /**
   * Setup keyboard bindings
   */
  private setupKeyBindings(): void {
    // Quit
    this.screen.key(['q', 'C-c'], () => {
      this.quit();
    });

    // Refresh
    this.screen.key(['r'], () => {
      this.refresh();
      this.showMessage('Refreshed');
    });

    // Add file
    this.screen.key(['a'], () => {
      this.addSelectedFile();
    });

    // Commit
    this.screen.key(['c'], () => {
      this.showCommitDialog();
    });

    // Switch branch
    this.screen.key(['s'], () => {
      this.showBranchSelector();
    });

    // Help
    this.screen.key(['?'], () => {
      this.showHelp();
    });

    // Stacks
    this.screen.key(['t'], () => {
      this.showStackSelector();
    });

    // Tab between panels
    this.screen.key(['tab'], () => {
      this.focusNext();
    });

    // Focus handlers for file list
    this.filesBox.on('select', (item) => {
      if (item) {
        this.selectedFile = item.content.replace(/\{[^}]+\}/g, '').trim();
        this.showFileDiff(this.selectedFile);
      }
    });

    // Focus handlers for log list
    this.logBox.on('select', (item) => {
      if (item) {
        const hash = item.content.split(' ')[0].replace(/\{[^}]+\}/g, '');
        this.showCommitDetails(hash);
      }
    });

    // Branch selection
    this.branchBox.on('select', (item) => {
      if (item) {
        const branchName = item.content.replace(/\{[^}]+\}/g, '').replace('* ', '').trim();
        this.switchToBranch(branchName);
      }
    });

    this.branchBox.key(['escape'], () => {
      this.branchBox.hide();
      this.screen.render();
    });

    // Stack selection
    this.stackBox.on('select', (item) => {
      if (item) {
        const content = item.content.replace(/\{[^}]+\}/g, '').trim();
        // Handle stack actions based on content
        if (content.startsWith('[CREATE]')) {
          this.showCreateStackDialog();
        } else if (content.startsWith('[PUSH]')) {
          this.pushToStack();
        } else if (content.startsWith('[SYNC]')) {
          this.syncCurrentStack();
        } else if (content.startsWith('[UP]')) {
          this.stackNavigateUp();
        } else if (content.startsWith('[DOWN]')) {
          this.stackNavigateDown();
        } else {
          // It's a stack name, show its details
          const stackName = content.replace(/^\*\s*/, '').split(' ')[0];
          this.showStackDetails(stackName);
        }
      }
    });

    this.stackBox.key(['escape'], () => {
      this.stackBox.hide();
      this.screen.render();
    });
  }

  /**
   * Get header content
   */
  private getHeaderContent(): string {
    const branch = this.repo.refs.getCurrentBranch() || 'detached HEAD';
    const repoName = path.basename(this.repo.workDir);
    return ` {bold}wit{/bold} │ ${repoName} │ Branch: {green-fg}${branch}{/green-fg}`;
  }

  /**
   * Refresh all panels
   */
  refresh(): void {
    this.header.setContent(this.getHeaderContent());
    this.refreshStatus();
    this.refreshFiles();
    this.refreshLog();
    this.screen.render();
  }

  /**
   * Refresh status panel
   */
  private refreshStatus(): void {
    try {
      const status = this.repo.status();
      let content = '';

      const branch = this.repo.refs.getCurrentBranch();
      content += `{bold}On branch:{/bold} {green-fg}${branch || 'detached HEAD'}{/green-fg}\n\n`;

      if (status.staged.length > 0) {
        content += `{bold}{green-fg}Changes to be committed:{/green-fg}{/bold}\n`;
        for (const file of status.staged) {
          content += `  {green-fg}✓ ${file}{/green-fg}\n`;
        }
        content += '\n';
      }

      if (status.modified.length > 0) {
        content += `{bold}{yellow-fg}Changes not staged:{/yellow-fg}{/bold}\n`;
        for (const file of status.modified) {
          content += `  {yellow-fg}~ ${file}{/yellow-fg}\n`;
        }
        content += '\n';
      }

      if (status.untracked.length > 0) {
        content += `{bold}{red-fg}Untracked files:{/red-fg}{/bold}\n`;
        for (const file of status.untracked) {
          content += `  {red-fg}? ${file}{/red-fg}\n`;
        }
        content += '\n';
      }

      if (status.deleted.length > 0) {
        content += `{bold}{red-fg}Deleted files:{/red-fg}{/bold}\n`;
        for (const file of status.deleted) {
          content += `  {red-fg}✗ ${file}{/red-fg}\n`;
        }
      }

      if (status.staged.length === 0 && status.modified.length === 0 && 
          status.untracked.length === 0 && status.deleted.length === 0) {
        content += '{bold}Working tree clean{/bold}';
      }

      this.statusBox.setContent(content);
    } catch (error) {
      this.statusBox.setContent('{red-fg}Error loading status{/red-fg}');
    }
  }

  /**
   * Refresh files panel
   */
  private refreshFiles(): void {
    try {
      const status = this.repo.status();
      const items: string[] = [];

      for (const file of status.staged) {
        items.push(`{green-fg}[S]{/green-fg} ${file}`);
      }
      for (const file of status.modified) {
        items.push(`{yellow-fg}[M]{/yellow-fg} ${file}`);
      }
      for (const file of status.untracked) {
        items.push(`{red-fg}[?]{/red-fg} ${file}`);
      }
      for (const file of status.deleted) {
        items.push(`{red-fg}[D]{/red-fg} ${file}`);
      }

      this.filesBox.setItems(items);
    } catch (error) {
      this.filesBox.setItems(['{red-fg}Error loading files{/red-fg}']);
    }
  }

  /**
   * Refresh commit log panel
   */
  private refreshLog(): void {
    try {
      const commits = this.repo.log('HEAD', 20);
      const items: string[] = [];

      for (const commit of commits) {
        const hash = commit.hash().slice(0, 8);
        const message = commit.message.split('\n')[0].slice(0, 40);
        const date = new Date(commit.author.timestamp * 1000).toLocaleDateString();
        items.push(`{yellow-fg}${hash}{/yellow-fg} ${message} {gray-fg}(${date}){/gray-fg}`);
      }

      if (items.length === 0) {
        items.push('{gray-fg}No commits yet{/gray-fg}');
      }

      this.logBox.setItems(items);
    } catch (error) {
      this.logBox.setItems(['{gray-fg}No commits yet{/gray-fg}']);
    }
  }

  /**
   * Show diff for a file
   */
  private showFileDiff(filePath: string): void {
    try {
      // For now, show a placeholder
      // In a real implementation, would compute the actual diff
      const content = `{bold}Diff for: ${filePath}{/bold}\n\n` +
        `{gray-fg}Select a modified file to see changes{/gray-fg}`;
      
      this.diffBox.setContent(content);
      this.screen.render();
    } catch (error) {
      this.diffBox.setContent('{red-fg}Error loading diff{/red-fg}');
      this.screen.render();
    }
  }

  /**
   * Show commit details
   */
  private showCommitDetails(hash: string): void {
    try {
      const commit = this.repo.objects.readCommit(hash);
      let content = '';
      
      content += `{bold}{yellow-fg}Commit: ${hash}{/yellow-fg}{/bold}\n`;
      content += `Author: ${commit.author.name} <${commit.author.email}>\n`;
      content += `Date: ${new Date(commit.author.timestamp * 1000).toLocaleString()}\n`;
      content += `\n${commit.message}\n`;

      this.diffBox.setContent(content);
      this.screen.render();
    } catch (error) {
      this.diffBox.setContent('{red-fg}Error loading commit{/red-fg}');
      this.screen.render();
    }
  }

  /**
   * Add the selected file
   */
  private addSelectedFile(): void {
    const selected = (this.filesBox as any).selected as number;
    const items = (this.filesBox as any).items as any[];
    
    if (selected !== undefined && items && items[selected]) {
      const item = items[selected].content || items[selected].toString();
      const filePath = item.replace(/\{[^}]+\}/g, '').replace(/^\[[^\]]+\]\s*/, '').trim();
      
      try {
        this.repo.add(filePath);
        this.showMessage(`Added: ${filePath}`);
        this.refresh();
      } catch (error) {
        this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * Show commit dialog
   */
  private showCommitDialog(): void {
    const prompt = blessed.prompt({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '60%',
      height: 'shrink',
      border: { type: 'line' },
      label: ' Commit Message ',
      tags: true,
      style: {
        border: { fg: 'green' },
        label: { fg: 'green', bold: true },
      },
    });

    prompt.input('Enter commit message:', '', (err, value) => {
      if (!err && value && value.trim()) {
        try {
          const hash = this.repo.commit(value.trim());
          this.showMessage(`Committed: ${hash.slice(0, 8)}`);
          this.refresh();
        } catch (error) {
          this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      prompt.destroy();
      this.screen.render();
    });
  }

  /**
   * Show branch selector
   */
  private showBranchSelector(): void {
    try {
      const branches = this.repo.listBranches();
      const items: string[] = [];

      for (const branch of branches) {
        const prefix = branch.isCurrent ? '{green-fg}* ' : '  ';
        const suffix = branch.isCurrent ? '{/green-fg}' : '';
        items.push(`${prefix}${branch.name}${suffix}`);
      }

      this.branchBox.setItems(items);
      this.branchBox.show();
      this.branchBox.focus();
      this.screen.render();
    } catch (error) {
      this.showMessage('Error loading branches');
    }
  }

  /**
   * Switch to a branch
   */
  private switchToBranch(branchName: string): void {
    try {
      this.repo.checkout(branchName);
      this.branchBox.hide();
      this.showMessage(`Switched to: ${branchName}`);
      this.refresh();
    } catch (error) {
      this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Focus next panel
   */
  private focusNext(): void {
    const panels = [this.filesBox, this.logBox, this.diffBox];
    const current = panels.findIndex(p => p === this.screen.focused);
    const next = (current + 1) % panels.length;
    panels[next].focus();
    this.screen.render();
  }

  /**
   * Show stack selector
   */
  private showStackSelector(): void {
    try {
      const stacks = this.stackManager.listStacks();
      const currentStack = this.stackManager.getCurrentStack();
      const items: string[] = [];

      // Header
      items.push('{bold}{magenta-fg}── Stacked Diffs ──{/magenta-fg}{/bold}');
      items.push('');

      if (stacks.length === 0) {
        items.push('{gray-fg}No stacks yet{/gray-fg}');
        items.push('');
      } else {
        for (const stackName of stacks) {
          const stack = this.stackManager.getStack(stackName);
          if (!stack) continue;

          const isCurrent = currentStack?.name === stackName;
          const prefix = isCurrent ? '{green-fg}* ' : '  ';
          const suffix = isCurrent ? '{/green-fg}' : '';
          const branchCount = stack.branches.length;
          items.push(`${prefix}${stackName} {gray-fg}(${branchCount} branch${branchCount !== 1 ? 'es' : ''})${suffix}{/gray-fg}`);
        }
        items.push('');
      }

      // Actions
      items.push('{bold}Actions:{/bold}');
      items.push('{cyan-fg}[CREATE]{/cyan-fg} Create new stack');
      
      if (currentStack) {
        items.push('{cyan-fg}[PUSH]{/cyan-fg} Push new branch to stack');
        items.push('{cyan-fg}[SYNC]{/cyan-fg} Sync current stack');
        items.push('{cyan-fg}[UP]{/cyan-fg} Navigate up in stack');
        items.push('{cyan-fg}[DOWN]{/cyan-fg} Navigate down in stack');
      }

      this.stackBox.setItems(items);
      this.stackBox.show();
      this.stackBox.focus();
      this.screen.render();
    } catch (error) {
      this.showMessage('Error loading stacks');
    }
  }

  /**
   * Show create stack dialog
   */
  private showCreateStackDialog(): void {
    this.stackBox.hide();

    const prompt = blessed.prompt({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '60%',
      height: 'shrink',
      border: { type: 'line' },
      label: ' Create Stack ',
      tags: true,
      style: {
        border: { fg: 'magenta' },
        label: { fg: 'magenta', bold: true },
      },
    });

    prompt.input('Stack name:', '', (err, value) => {
      if (!err && value && value.trim()) {
        try {
          this.stackManager.create(value.trim());
          this.showMessage(`Created stack: ${value.trim()}`);
          this.refresh();
        } catch (error) {
          this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      prompt.destroy();
      this.screen.render();
    });
  }

  /**
   * Push new branch to current stack
   */
  private pushToStack(): void {
    this.stackBox.hide();

    const prompt = blessed.prompt({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '60%',
      height: 'shrink',
      border: { type: 'line' },
      label: ' Push to Stack ',
      tags: true,
      style: {
        border: { fg: 'magenta' },
        label: { fg: 'magenta', bold: true },
      },
    });

    prompt.input('Branch name (leave empty for auto):', '', (err, value) => {
      try {
        const branchName = value && value.trim() ? value.trim() : undefined;
        const { branch } = this.stackManager.push(branchName);
        this.showMessage(`Created: ${branch}`);
        this.refresh();
      } catch (error) {
        this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
      prompt.destroy();
      this.screen.render();
    });
  }

  /**
   * Sync current stack
   */
  private syncCurrentStack(): void {
    this.stackBox.hide();
    try {
      const result = this.stackManager.sync();
      if (result.success) {
        this.showMessage(`Stack synced: ${result.synced.length} branches updated`);
      } else {
        this.showMessage(`Sync failed: ${result.message || 'conflicts detected'}`);
      }
      this.refresh();
    } catch (error) {
      this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Navigate up in stack
   */
  private stackNavigateUp(): void {
    this.stackBox.hide();
    try {
      const branch = this.stackManager.up();
      this.showMessage(`Switched to: ${branch}`);
      this.refresh();
    } catch (error) {
      this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Navigate down in stack
   */
  private stackNavigateDown(): void {
    this.stackBox.hide();
    try {
      const branch = this.stackManager.down();
      this.showMessage(`Switched to: ${branch}`);
      this.refresh();
    } catch (error) {
      this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Show stack details
   */
  private showStackDetails(stackName: string): void {
    try {
      const nodes = this.stackManager.visualize(stackName);
      if (nodes.length === 0) {
        this.showMessage('Stack not found or empty');
        return;
      }

      let content = `{bold}{magenta-fg}Stack: ${stackName}{/magenta-fg}{/bold}\n\n`;

      // Show branches from top to bottom
      for (let i = nodes.length - 1; i >= 0; i--) {
        const node = nodes[i];
        const currentIndicator = node.isCurrent ? '{green-fg}● ' : '  ';
        const statusColor = node.status === 'synced' ? 'green' : 
                           node.status === 'behind' ? 'yellow' :
                           node.status === 'ahead' ? 'cyan' : 'red';
        const statusIcon = node.status === 'synced' ? '✓' : 
                          node.status === 'behind' ? '↓' :
                          node.status === 'ahead' ? '↑' : '↕';
        
        content += `${currentIndicator}{${statusColor}-fg}${statusIcon}{/${statusColor}-fg} ${node.branch}`;
        if (node.isCurrent) content += '{/green-fg}';
        content += '\n';
        content += `    {gray-fg}${node.commit} ${node.message.slice(0, 40)}{/gray-fg}\n`;
        if (i > 0) content += '    │\n';
      }

      content += '\n{gray-fg}Press any key to close{/gray-fg}';

      const detailBox = blessed.box({
        parent: this.screen,
        top: 'center',
        left: 'center',
        width: '70%',
        height: '70%',
        content: content,
        tags: true,
        border: { type: 'line' },
        scrollable: true,
        style: {
          border: { fg: 'magenta' },
          bg: 'black',
        },
      });

      detailBox.key(['escape', 'q', 'enter', 'space'], () => {
        detailBox.destroy();
        this.stackBox.hide();
        this.screen.render();
      });

      detailBox.focus();
      this.screen.render();
    } catch (error) {
      this.showMessage('Error loading stack details');
    }
  }

  /**
   * Show help dialog
   */
  private showHelp(): void {
    const helpContent = `
{bold}wit Terminal UI - Keyboard Shortcuts{/bold}

{bold}Navigation:{/bold}
  Tab        - Switch between panels
  ↑/↓ or j/k - Navigate items
  Enter      - Select item

{bold}Actions:{/bold}
  a - Add selected file to staging
  c - Create a commit
  s - Switch branch
  t - Stacked diffs menu
  r - Refresh view
  
{bold}Other:{/bold}
  q - Quit
  ? - Show this help

{gray-fg}Press any key to close{/gray-fg}
`;

    const helpDialog = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '60%',
      height: '60%',
      content: helpContent,
      tags: true,
      border: { type: 'line' },
      style: {
        border: { fg: 'white' },
        bg: 'black',
      },
    });

    helpDialog.key(['escape', 'q', 'enter', 'space'], () => {
      helpDialog.destroy();
      this.screen.render();
    });

    helpDialog.focus();
    this.screen.render();
  }

  /**
   * Show a message
   */
  private showMessage(message: string): void {
    this.messageBox.display(message, 2, () => {
      this.screen.render();
    });
  }

  /**
   * Quit the application
   */
  private quit(): void {
    this.screen.destroy();
    process.exit(0);
  }

  /**
   * Run the TUI
   */
  run(): void {
    this.filesBox.focus();
    this.screen.render();
  }
}

/**
 * Launch the TUI
 */
export function launchTUI(): void {
  try {
    const repo = Repository.find();
    const tui = new TsgitTUI(repo);
    tui.run();
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Make sure you are in a wit repository');
    process.exit(1);
  }
}
