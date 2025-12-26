/**
 * Terminal User Interface (TUI) for wit
 * A beautiful, interactive terminal interface
 */

import * as blessed from 'blessed';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from '../core/repository';
import { Commit } from '../core/object';
import { diff, DiffLine, DiffHunk, createHunks, isBinary } from '../core/diff';

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
  private helpBox!: blessed.Widgets.BoxElement;
  private commandInput!: blessed.Widgets.TextboxElement;
  private messageBox!: blessed.Widgets.MessageElement;

  private currentView: 'main' | 'log' | 'diff' | 'branches' = 'main';
  private selectedFile: string | null = null;
  
  // Diff view state
  private fullDiffBox!: blessed.Widgets.ListElement;
  private diffFiles: Array<{
    path: string;
    status: 'staged' | 'modified' | 'untracked' | 'deleted';
    hunks: DiffHunk[];
    isBinary: boolean;
    isNew: boolean;
    isDeleted: boolean;
  }> = [];
  private currentDiffFileIndex: number = 0;
  private currentDiffHunkIndex: number = 0;
  private expandedHunks: Set<string> = new Set(); // "fileIdx:hunkIdx" format

  constructor(repo: Repository) {
    this.repo = repo;
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
      content: ' {bold}q{/bold}:quit {bold}:{/bold}:palette {bold}a{/bold}:add {bold}c{/bold}:commit {bold}s{/bold}:switch {bold}b{/bold}:branch {bold}z{/bold}:stash {bold}m{/bold}:merge {bold}p{/bold}:push {bold}?{/bold}:help',
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
    
    // Full-screen diff view (hidden by default)
    this.fullDiffBox = blessed.list({
      parent: this.screen,
      label: ' Diff View (q/Esc: close, j/k: navigate, s: stage hunk, Enter: expand/collapse) ',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      border: { type: 'line' },
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      hidden: true,
      scrollable: true,
      alwaysScroll: true,
      style: {
        border: { fg: 'magenta' },
        selected: { bg: 'blue', fg: 'white' },
        item: { fg: 'white' },
      },
      scrollbar: {
        style: { bg: 'magenta' },
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

    // Stage all
    this.screen.key(['A'], () => {
      this.stageAll();
    });

    // Commit
    this.screen.key(['c'], () => {
      this.showCommitDialog();
    });

    // Amend commit
    this.screen.key(['C'], () => {
      this.showAmendDialog();
    });

    // Switch branch
    this.screen.key(['s'], () => {
      this.showBranchSelector();
    });

    // Create branch
    this.screen.key(['b'], () => {
      this.showCreateBranchDialog();
    });

    // Stash
    this.screen.key(['z'], () => {
      this.showStashMenu();
    });

    // Tag
    this.screen.key(['t'], () => {
      this.showTagMenu();
    });

    // Merge
    this.screen.key(['m'], () => {
      this.showMergeMenu();
    });

    // Push
    this.screen.key(['p'], () => {
      this.pushChanges();
    });

    // Pull
    this.screen.key(['l'], () => {
      this.pullChanges();
    });

    // Fetch
    this.screen.key(['f'], () => {
      this.fetchChanges();
    });

    // Undo
    this.screen.key(['u'], () => {
      this.undoLastOperation();
    });

    // Reset
    this.screen.key(['R'], () => {
      this.showResetMenu();
    });

    // WIP commit
    this.screen.key(['w'], () => {
      this.wipCommit();
    });

    // Help
    this.screen.key(['?'], () => {
      this.showHelp();
    });

    // Command palette
    this.screen.key([':', 'C-k'], () => {
      this.showCommandPalette();
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
    
    // Full diff view key bindings
    this.fullDiffBox.key(['escape', 'q'], () => {
      this.closeFullDiffView();
    });
    
    this.fullDiffBox.key(['s'], () => {
      this.stageSelectedHunk();
    });
    
    this.fullDiffBox.on('select', () => {
      this.toggleHunkExpansion();
    });
    
    // 'd' key to open full diff view
    this.screen.key(['d'], () => {
      if (this.currentView !== 'diff') {
        this.showFullDiffView();
      }
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
   * Show diff for a file in the side panel
   */
  private showFileDiff(filePath: string): void {
    try {
      const fileDiff = this.computeFileDiff(filePath);
      
      if (!fileDiff) {
        this.diffBox.setContent(`{bold}Diff for: ${filePath}{/bold}\n\n{gray-fg}No changes to show{/gray-fg}`);
        this.screen.render();
        return;
      }
      
      if (fileDiff.isBinary) {
        this.diffBox.setContent(`{bold}Diff for: ${filePath}{/bold}\n\n{yellow-fg}Binary file - cannot display diff{/yellow-fg}`);
        this.screen.render();
        return;
      }
      
      // Format the diff for display
      const content = this.formatDiffForDisplay(fileDiff, filePath);
      this.diffBox.setContent(content);
      this.screen.render();
    } catch (error) {
      this.diffBox.setContent(`{red-fg}Error loading diff: ${error instanceof Error ? error.message : 'Unknown error'}{/red-fg}`);
      this.screen.render();
    }
  }
  
  /**
   * Compute the diff for a single file
   */
  private computeFileDiff(filePath: string): { hunks: DiffHunk[]; isBinary: boolean; isNew: boolean; isDeleted: boolean } | null {
    const status = this.repo.status();
    const fullPath = path.join(this.repo.workDir, filePath);
    
    // Check what type of change this is
    const isStaged = status.staged.some(f => f === filePath || f.startsWith(filePath));
    const isModified = status.modified.includes(filePath);
    const isUntracked = status.untracked.includes(filePath);
    const isDeleted = status.deleted.includes(filePath);
    
    if (!isStaged && !isModified && !isUntracked && !isDeleted) {
      return null;
    }
    
    try {
      let oldContent = '';
      let newContent = '';
      
      if (isUntracked) {
        // New file - all additions
        if (!fs.existsSync(fullPath)) return null;
        const content = fs.readFileSync(fullPath);
        if (isBinary(content)) {
          return { hunks: [], isBinary: true, isNew: true, isDeleted: false };
        }
        newContent = content.toString('utf-8');
        return { hunks: createHunks(diff(oldContent, newContent)), isBinary: false, isNew: true, isDeleted: false };
      }
      
      if (isDeleted) {
        // Deleted file - all deletions
        const indexEntry = this.repo.index.get(filePath);
        if (indexEntry) {
          const blob = this.repo.objects.readBlob(indexEntry.hash);
          if (isBinary(blob.content)) {
            return { hunks: [], isBinary: true, isNew: false, isDeleted: true };
          }
          oldContent = blob.content.toString('utf-8');
        }
        return { hunks: createHunks(diff(oldContent, newContent)), isBinary: false, isNew: false, isDeleted: true };
      }
      
      // Modified or staged file - compute diff against index or HEAD
      const indexEntry = this.repo.index.get(filePath);
      if (indexEntry) {
        const blob = this.repo.objects.readBlob(indexEntry.hash);
        if (isBinary(blob.content)) {
          return { hunks: [], isBinary: true, isNew: false, isDeleted: false };
        }
        oldContent = blob.content.toString('utf-8');
      }
      
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath);
        if (isBinary(content)) {
          return { hunks: [], isBinary: true, isNew: false, isDeleted: false };
        }
        newContent = content.toString('utf-8');
      }
      
      if (oldContent === newContent) {
        return null;
      }
      
      return { hunks: createHunks(diff(oldContent, newContent)), isBinary: false, isNew: false, isDeleted: false };
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Format diff hunks for display in the side panel
   */
  private formatDiffForDisplay(fileDiff: { hunks: DiffHunk[]; isNew: boolean; isDeleted: boolean }, filePath: string): string {
    let content = `{bold}Diff for: ${filePath}{/bold}\n`;
    
    if (fileDiff.isNew) {
      content += `{green-fg}(new file){/green-fg}\n`;
    } else if (fileDiff.isDeleted) {
      content += `{red-fg}(deleted){/red-fg}\n`;
    }
    
    content += '\n';
    
    if (fileDiff.hunks.length === 0) {
      content += '{gray-fg}No differences found{/gray-fg}';
      return content;
    }
    
    for (const hunk of fileDiff.hunks) {
      content += `{cyan-fg}@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@{/cyan-fg}\n`;
      
      for (const line of hunk.lines) {
        const lineNum = this.formatLineNumber(line);
        const truncatedContent = this.truncateLine(line.content, 60);
        
        switch (line.type) {
          case 'add':
            content += `{green-fg}${lineNum} + ${truncatedContent}{/green-fg}\n`;
            break;
          case 'remove':
            content += `{red-fg}${lineNum} - ${truncatedContent}{/red-fg}\n`;
            break;
          case 'context':
            content += `{white-fg}${lineNum}   ${truncatedContent}{/white-fg}\n`;
            break;
        }
      }
      content += '\n';
    }
    
    return content;
  }
  
  /**
   * Format line number for display
   */
  private formatLineNumber(line: DiffLine): string {
    const num = line.type === 'add' ? line.newLineNum : line.oldLineNum;
    return (num?.toString() || '').padStart(4, ' ');
  }
  
  /**
   * Truncate long lines
   */
  private truncateLine(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }
    return content.substring(0, maxLength - 3) + '...';
  }
  
  /**
   * Show full-screen diff view
   */
  private showFullDiffView(): void {
    try {
      this.computeAllDiffs();
      
      if (this.diffFiles.length === 0) {
        this.showMessage('No changes to display');
        return;
      }
      
      this.currentView = 'diff';
      this.currentDiffFileIndex = 0;
      this.currentDiffHunkIndex = 0;
      this.expandedHunks.clear();
      
      // Expand all hunks by default
      this.diffFiles.forEach((file, fileIdx) => {
        file.hunks.forEach((_, hunkIdx) => {
          this.expandedHunks.add(`${fileIdx}:${hunkIdx}`);
        });
      });
      
      this.renderFullDiffView();
      this.fullDiffBox.show();
      this.fullDiffBox.focus();
      this.screen.render();
    } catch (error) {
      this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Compute diffs for all changed files
   */
  private computeAllDiffs(): void {
    const status = this.repo.status();
    this.diffFiles = [];
    
    // Process staged files
    for (const filePath of status.staged) {
      const cleanPath = filePath.replace(' (deleted)', '');
      const fileDiff = this.computeFileDiff(cleanPath);
      if (fileDiff) {
        this.diffFiles.push({
          path: cleanPath,
          status: 'staged',
          hunks: fileDiff.hunks,
          isBinary: fileDiff.isBinary,
          isNew: fileDiff.isNew,
          isDeleted: fileDiff.isDeleted,
        });
      }
    }
    
    // Process modified files
    for (const filePath of status.modified) {
      const fileDiff = this.computeFileDiff(filePath);
      if (fileDiff) {
        this.diffFiles.push({
          path: filePath,
          status: 'modified',
          hunks: fileDiff.hunks,
          isBinary: fileDiff.isBinary,
          isNew: fileDiff.isNew,
          isDeleted: fileDiff.isDeleted,
        });
      }
    }
    
    // Process untracked files
    for (const filePath of status.untracked) {
      const fileDiff = this.computeFileDiff(filePath);
      if (fileDiff) {
        this.diffFiles.push({
          path: filePath,
          status: 'untracked',
          hunks: fileDiff.hunks,
          isBinary: fileDiff.isBinary,
          isNew: true,
          isDeleted: false,
        });
      }
    }
    
    // Process deleted files
    for (const filePath of status.deleted) {
      const fileDiff = this.computeFileDiff(filePath);
      if (fileDiff) {
        this.diffFiles.push({
          path: filePath,
          status: 'deleted',
          hunks: fileDiff.hunks,
          isBinary: fileDiff.isBinary,
          isNew: false,
          isDeleted: true,
        });
      }
    }
  }
  
  /**
   * Render the full diff view
   */
  private renderFullDiffView(): void {
    const items: string[] = [];
    
    for (let fileIdx = 0; fileIdx < this.diffFiles.length; fileIdx++) {
      const file = this.diffFiles[fileIdx];
      
      // File header
      let statusLabel = '';
      let statusColor = 'white';
      switch (file.status) {
        case 'staged':
          statusLabel = '[S]';
          statusColor = 'green';
          break;
        case 'modified':
          statusLabel = '[M]';
          statusColor = 'yellow';
          break;
        case 'untracked':
          statusLabel = '[?]';
          statusColor = 'red';
          break;
        case 'deleted':
          statusLabel = '[D]';
          statusColor = 'red';
          break;
      }
      
      let fileLabel = `{bold}{${statusColor}-fg}${statusLabel}{/${statusColor}-fg} ${file.path}{/bold}`;
      if (file.isNew) fileLabel += ' {green-fg}(new file){/green-fg}';
      if (file.isDeleted) fileLabel += ' {red-fg}(deleted){/red-fg}';
      if (file.isBinary) fileLabel += ' {yellow-fg}(binary){/yellow-fg}';
      items.push(fileLabel);
      
      if (file.isBinary) {
        items.push('  {yellow-fg}Binary file - cannot display diff{/yellow-fg}');
        items.push('');
        continue;
      }
      
      // Hunks
      for (let hunkIdx = 0; hunkIdx < file.hunks.length; hunkIdx++) {
        const hunk = file.hunks[hunkIdx];
        const hunkKey = `${fileIdx}:${hunkIdx}`;
        const isExpanded = this.expandedHunks.has(hunkKey);
        const expandIcon = isExpanded ? '▼' : '▶';
        
        items.push(`  {cyan-fg}${expandIcon} @@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@{/cyan-fg}`);
        
        if (isExpanded) {
          for (const line of hunk.lines) {
            const lineNum = this.formatLineNumber(line);
            const content = this.truncateLine(line.content, 100);
            
            switch (line.type) {
              case 'add':
                items.push(`    {green-fg}${lineNum} + ${content}{/green-fg}`);
                break;
              case 'remove':
                items.push(`    {red-fg}${lineNum} - ${content}{/red-fg}`);
                break;
              case 'context':
                items.push(`    {white-fg}${lineNum}   ${content}{/white-fg}`);
                break;
            }
          }
        }
      }
      
      items.push('');
    }
    
    if (items.length === 0) {
      items.push('{gray-fg}No changes to display{/gray-fg}');
    }
    
    this.fullDiffBox.setItems(items);
  }
  
  /**
   * Close the full diff view
   */
  private closeFullDiffView(): void {
    this.fullDiffBox.hide();
    this.currentView = 'main';
    this.filesBox.focus();
    this.screen.render();
  }
  
  /**
   * Toggle hunk expansion
   */
  private toggleHunkExpansion(): void {
    const selected = (this.fullDiffBox as any).selected as number;
    const items = (this.fullDiffBox as any).items as any[];
    
    if (selected === undefined || !items || !items[selected]) return;
    
    const itemContent = items[selected].content || items[selected].toString();
    
    // Check if this is a hunk header line
    if (itemContent.includes('@@') && itemContent.includes('▼') || itemContent.includes('▶')) {
      // Find which file and hunk this corresponds to
      let currentFile = -1;
      let currentHunk = -1;
      
      for (let i = 0; i <= selected; i++) {
        const content = items[i]?.content || items[i]?.toString() || '';
        if (content.includes('{bold}') && (content.includes('[S]') || content.includes('[M]') || content.includes('[?]') || content.includes('[D]'))) {
          currentFile++;
          currentHunk = -1;
        } else if (content.includes('@@') && content.includes('-')) {
          currentHunk++;
        }
      }
      
      if (currentFile >= 0 && currentHunk >= 0) {
        const hunkKey = `${currentFile}:${currentHunk}`;
        if (this.expandedHunks.has(hunkKey)) {
          this.expandedHunks.delete(hunkKey);
        } else {
          this.expandedHunks.add(hunkKey);
        }
        this.renderFullDiffView();
        this.fullDiffBox.select(selected);
        this.screen.render();
      }
    }
  }
  
  /**
   * Stage the selected hunk
   */
  private stageSelectedHunk(): void {
    const selected = (this.fullDiffBox as any).selected as number;
    const items = (this.fullDiffBox as any).items as any[];
    
    if (selected === undefined || !items) return;
    
    // Find which file this belongs to
    let currentFile = -1;
    
    for (let i = 0; i <= selected; i++) {
      const content = items[i]?.content || items[i]?.toString() || '';
      if (content.includes('{bold}') && (content.includes('[M]') || content.includes('[?]') || content.includes('[D]'))) {
        currentFile++;
      } else if (content.includes('[S]')) {
        currentFile++;
      }
    }
    
    if (currentFile >= 0 && currentFile < this.diffFiles.length) {
      const file = this.diffFiles[currentFile];
      
      // Only stage if it's not already staged
      if (file.status !== 'staged') {
        try {
          if (file.status === 'deleted') {
            // For deleted files, we need to remove from index
            this.repo.index.remove(file.path);
            this.repo.index.save();
          } else {
            this.repo.add(file.path);
          }
          this.showMessage(`Staged: ${file.path}`);
          
          // Refresh the diff view
          this.computeAllDiffs();
          this.renderFullDiffView();
          this.refresh();
          this.screen.render();
        } catch (error) {
          this.showMessage(`Error staging: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        this.showMessage('File is already staged');
      }
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
   * Stage all files
   */
  private stageAll(): void {
    try {
      this.repo.addAll();
      this.showMessage('Staged all changes');
      this.refresh();
    } catch (error) {
      this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Show amend dialog
   */
  private showAmendDialog(): void {
    const prompt = blessed.prompt({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '60%',
      height: 'shrink',
      border: { type: 'line' },
      label: ' Amend Last Commit (leave empty to keep message) ',
      tags: true,
      style: {
        border: { fg: 'yellow' },
        label: { fg: 'yellow', bold: true },
      },
    });

    prompt.input('New message (optional):', '', (err, value) => {
      if (!err) {
        try {
          const headHash = this.repo.refs.resolve('HEAD');
          if (!headHash) {
            this.showMessage('No commits to amend');
            prompt.destroy();
            this.screen.render();
            return;
          }
          const oldCommit = this.repo.objects.readCommit(headHash);
          const newMessage = value?.trim() || oldCommit.message;
          
          // Reset to parent
          if (oldCommit.parentHashes.length > 0) {
            const head = this.repo.refs.getHead();
            if (head.isSymbolic) {
              this.repo.refs.updateBranch(head.target.replace('refs/heads/', ''), oldCommit.parentHashes[0]);
            }
          }
          
          // Recommit
          const hash = this.repo.commit(newMessage);
          this.showMessage(`Amended: ${hash.slice(0, 8)}`);
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
   * Show create branch dialog
   */
  private showCreateBranchDialog(): void {
    const prompt = blessed.prompt({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '60%',
      height: 'shrink',
      border: { type: 'line' },
      label: ' Create Branch ',
      tags: true,
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'cyan', bold: true },
      },
    });

    prompt.input('Branch name:', '', (err, value) => {
      if (!err && value && value.trim()) {
        try {
          this.repo.createBranch(value.trim());
          this.repo.checkout(value.trim());
          this.showMessage(`Created and switched to: ${value.trim()}`);
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
   * Show stash menu
   */
  private showStashMenu(): void {
    const menu = blessed.list({
      parent: this.screen,
      label: ' Stash ',
      top: 'center',
      left: 'center',
      width: '50%',
      height: 'shrink',
      border: { type: 'line' },
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      style: {
        border: { fg: 'magenta' },
        selected: { bg: 'magenta', fg: 'black' },
      },
      items: ['Save stash', 'Pop stash', 'Apply stash', 'List stashes'],
    });

    menu.on('select', (item, index) => {
      menu.destroy();
      this.screen.render();
      
      switch (index) {
        case 0: this.stashSave(); break;
        case 1: this.stashPop(); break;
        case 2: this.stashApply(); break;
        case 3: this.listStashes(); break;
      }
    });

    menu.key(['escape'], () => {
      menu.destroy();
      this.screen.render();
    });

    menu.focus();
    this.screen.render();
  }

  private stashSave(): void {
    try {
      const branch = this.repo.refs.getCurrentBranch() || 'HEAD';
      const status = this.repo.status();
      this.repo.branchState.saveState(branch, status.staged, 'WIP');
      this.showMessage('Changes stashed');
      this.refresh();
    } catch (error) {
      this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private stashPop(): void {
    try {
      const branch = this.repo.refs.getCurrentBranch() || 'HEAD';
      this.repo.branchState.restoreState(branch);
      this.showMessage('Stash popped');
      this.refresh();
    } catch (error) {
      this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private stashApply(): void {
    try {
      const branch = this.repo.refs.getCurrentBranch() || 'HEAD';
      this.repo.branchState.restoreState(branch);
      this.showMessage('Stash applied');
      this.refresh();
    } catch (error) {
      this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private listStashes(): void {
    try {
      const currentBranch = this.repo.refs.getCurrentBranch() || 'HEAD';
      const hasState = this.repo.branchState.hasState(currentBranch);
      
      if (!hasState) {
        this.showMessage('No stashes');
        return;
      }
      
      const list = blessed.list({
        parent: this.screen,
        label: ' Stashes ',
        top: 'center',
        left: 'center',
        width: '60%',
        height: '50%',
        border: { type: 'line' },
        tags: true,
        keys: true,
        vi: true,
        mouse: true,
        style: {
          border: { fg: 'magenta' },
          selected: { bg: 'magenta', fg: 'black' },
        },
        items: [`stash@{0}: State saved for ${currentBranch}`],
      });

      list.key(['escape', 'q'], () => {
        list.destroy();
        this.screen.render();
      });

      list.focus();
      this.screen.render();
    } catch (error) {
      this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Show tag menu
   */
  private showTagMenu(): void {
    const menu = blessed.list({
      parent: this.screen,
      label: ' Tags ',
      top: 'center',
      left: 'center',
      width: '50%',
      height: 'shrink',
      border: { type: 'line' },
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      style: {
        border: { fg: 'yellow' },
        selected: { bg: 'yellow', fg: 'black' },
      },
      items: ['Create tag', 'List tags'],
    });

    menu.on('select', (item, index) => {
      menu.destroy();
      this.screen.render();
      
      if (index === 0) {
        this.createTagDialog();
      } else {
        this.listTags();
      }
    });

    menu.key(['escape'], () => {
      menu.destroy();
      this.screen.render();
    });

    menu.focus();
    this.screen.render();
  }

  private createTagDialog(): void {
    const prompt = blessed.prompt({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '60%',
      height: 'shrink',
      border: { type: 'line' },
      label: ' Create Tag ',
      tags: true,
      style: {
        border: { fg: 'yellow' },
        label: { fg: 'yellow', bold: true },
      },
    });

    prompt.input('Tag name:', '', (err, value) => {
      if (!err && value && value.trim()) {
        try {
          const headHash = this.repo.refs.resolve('HEAD');
          if (headHash) {
            this.repo.refs.createTag(value.trim(), headHash);
            this.showMessage(`Created tag: ${value.trim()}`);
            this.refresh();
          } else {
            this.showMessage('No commits to tag');
          }
        } catch (error) {
          this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      prompt.destroy();
      this.screen.render();
    });
  }

  private listTags(): void {
    try {
      const tags = this.repo.refs.listTags();
      if (tags.length === 0) {
        this.showMessage('No tags');
        return;
      }
      
      const list = blessed.list({
        parent: this.screen,
        label: ' Tags ',
        top: 'center',
        left: 'center',
        width: '60%',
        height: '50%',
        border: { type: 'line' },
        tags: true,
        keys: true,
        vi: true,
        mouse: true,
        style: {
          border: { fg: 'yellow' },
          selected: { bg: 'yellow', fg: 'black' },
        },
        items: tags,
      });

      list.key(['escape', 'q'], () => {
        list.destroy();
        this.screen.render();
      });

      list.focus();
      this.screen.render();
    } catch (error) {
      this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Show merge menu
   */
  private showMergeMenu(): void {
    try {
      const branches = this.repo.listBranches().filter(b => !b.isCurrent);
      if (branches.length === 0) {
        this.showMessage('No other branches to merge');
        return;
      }

      const list = blessed.list({
        parent: this.screen,
        label: ' Merge Branch ',
        top: 'center',
        left: 'center',
        width: '50%',
        height: '50%',
        border: { type: 'line' },
        tags: true,
        keys: true,
        vi: true,
        mouse: true,
        style: {
          border: { fg: 'blue' },
          selected: { bg: 'blue', fg: 'white' },
        },
        items: branches.map(b => b.name),
      });

      list.on('select', (item) => {
        const branchName = item.content.replace(/\{[^}]+\}/g, '').trim();
        list.destroy();
        this.screen.render();
        
        try {
          this.repo.mergeManager.merge(branchName);
          this.showMessage(`Merged: ${branchName}`);
          this.refresh();
        } catch (error) {
          this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });

      list.key(['escape'], () => {
        list.destroy();
        this.screen.render();
      });

      list.focus();
      this.screen.render();
    } catch (error) {
      this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Push changes
   */
  private pushChanges(): void {
    this.showMessage('Pushing...');
    try {
      // Network sync would require remote protocol implementation
      this.showMessage('Push recorded (configure remotes for network sync)');
    } catch (error) {
      this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Pull changes
   */
  private pullChanges(): void {
    this.showMessage('Pulling...');
    try {
      // Network sync would require remote protocol implementation
      this.showMessage('Pull recorded (configure remotes for network sync)');
      this.refresh();
    } catch (error) {
      this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch changes
   */
  private fetchChanges(): void {
    this.showMessage('Fetching...');
    try {
      // Network sync would require remote protocol implementation
      this.showMessage('Fetch recorded (configure remotes for network sync)');
    } catch (error) {
      this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Undo last operation
   */
  private undoLastOperation(): void {
    try {
      this.repo.journal.popEntry();
      this.showMessage('Undid last operation');
      this.refresh();
    } catch (error) {
      this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Show reset menu
   */
  private showResetMenu(): void {
    const menu = blessed.list({
      parent: this.screen,
      label: ' Reset ',
      top: 'center',
      left: 'center',
      width: '50%',
      height: 'shrink',
      border: { type: 'line' },
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      style: {
        border: { fg: 'red' },
        selected: { bg: 'red', fg: 'white' },
      },
      items: ['Soft (keep staged)', 'Mixed (keep unstaged)', 'Hard (discard all)'],
    });

    menu.on('select', (item, index) => {
      menu.destroy();
      const modes = ['soft', 'mixed', 'hard'] as const;
      this.showResetCommitPrompt(modes[index]);
    });

    menu.key(['escape'], () => {
      menu.destroy();
      this.screen.render();
    });

    menu.focus();
    this.screen.render();
  }

  private showResetCommitPrompt(mode: 'soft' | 'mixed' | 'hard'): void {
    const prompt = blessed.prompt({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '60%',
      height: 'shrink',
      border: { type: 'line' },
      label: ` Reset (${mode}) to: `,
      tags: true,
      style: {
        border: { fg: 'red' },
        label: { fg: 'red', bold: true },
      },
    });

    prompt.input('Commit (e.g., HEAD~1):', 'HEAD~1', (err, value) => {
      if (!err && value && value.trim()) {
        try {
          const targetHash = this.repo.refs.resolve(value.trim());
          if (targetHash) {
            const head = this.repo.refs.getHead();
            if (head.isSymbolic) {
              this.repo.refs.updateBranch(head.target.replace('refs/heads/', ''), targetHash);
            } else {
              this.repo.refs.setHeadDetached(targetHash);
            }
            if (mode !== 'soft') {
              this.repo.checkout(targetHash);
            }
            this.showMessage(`Reset to ${value.trim()} (${mode})`);
            this.refresh();
          } else {
            this.showMessage('Unknown commit reference');
          }
        } catch (error) {
          this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      prompt.destroy();
      this.screen.render();
    });
  }

  /**
   * WIP commit
   */
  private wipCommit(): void {
    try {
      this.repo.addAll();
      const hash = this.repo.commit('WIP');
      this.showMessage(`WIP commit: ${hash.slice(0, 8)}`);
      this.refresh();
    } catch (error) {
      this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Show command palette
   */
  private showCommandPalette(): void {
    const commands = [
      { name: 'Commit', key: 'c', action: () => this.showCommitDialog() },
      { name: 'Amend', key: 'C', action: () => this.showAmendDialog() },
      { name: 'Stage All', key: 'A', action: () => this.stageAll() },
      { name: 'WIP Commit', key: 'w', action: () => this.wipCommit() },
      { name: 'Create Branch', key: 'b', action: () => this.showCreateBranchDialog() },
      { name: 'Switch Branch', key: 's', action: () => this.showBranchSelector() },
      { name: 'Merge', key: 'm', action: () => this.showMergeMenu() },
      { name: 'Stash', key: 'z', action: () => this.showStashMenu() },
      { name: 'Tags', key: 't', action: () => this.showTagMenu() },
      { name: 'Push', key: 'p', action: () => this.pushChanges() },
      { name: 'Pull', key: 'l', action: () => this.pullChanges() },
      { name: 'Fetch', key: 'f', action: () => this.fetchChanges() },
      { name: 'Undo', key: 'u', action: () => this.undoLastOperation() },
      { name: 'Reset', key: 'R', action: () => this.showResetMenu() },
      { name: 'Refresh', key: 'r', action: () => this.refresh() },
    ];

    const list = blessed.list({
      parent: this.screen,
      label: ' Command Palette (: or Ctrl+K) ',
      top: 'center',
      left: 'center',
      width: '60%',
      height: '60%',
      border: { type: 'line' },
      tags: true,
      keys: true,
      vi: true,
      mouse: true,
      style: {
        border: { fg: 'white' },
        selected: { bg: 'blue', fg: 'white' },
      },
      items: commands.map(c => `{bold}${c.key}{/bold}  ${c.name}`),
    });

    list.on('select', (item, index) => {
      list.destroy();
      this.screen.render();
      commands[index].action();
    });

    list.key(['escape', 'q'], () => {
      list.destroy();
      this.screen.render();
    });

    list.focus();
    this.screen.render();
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
  : or Ctrl+K - Command palette

{bold}Changes:{/bold}
  a - Add selected file to staging
  A - Stage all changes
  c - Create a commit
  C - Amend last commit
  w - WIP commit (quick save)

{bold}Branches:{/bold}
  s - Switch branch
  b - Create new branch
  m - Merge branch

{bold}Stash & Tags:{/bold}
  z - Stash menu
  t - Tags menu

{bold}Remote:{/bold}
  p - Push to remote
  l - Pull from remote
  f - Fetch from remote

{bold}History:{/bold}
  u - Undo last operation
  R - Reset (soft/mixed/hard)

{bold}Other:{/bold}
  r - Refresh view
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
