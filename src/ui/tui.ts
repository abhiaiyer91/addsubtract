/**
 * Terminal User Interface (TUI) for wit
 * A beautiful, interactive terminal interface using OpenTUI
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Repository } from '../core/repository';
import { diff, DiffLine, DiffHunk, createHunks, isBinary } from '../core/diff';
import { StackManager } from '../core/stack';

// OpenTUI types (imported dynamically)
type CliRenderer = import('@opentui/core').CliRenderer;
type BoxRenderable = import('@opentui/core').BoxRenderable;
type TextRenderable = import('@opentui/core').TextRenderable;
type SelectRenderable = import('@opentui/core').SelectRenderable;
type InputRenderable = import('@opentui/core').InputRenderable;
type KeyEvent = import('@opentui/core').KeyEvent;

/**
 * Check if a command exists in PATH
 */
function commandExists(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check OpenTUI dependencies and provide helpful error messages
 */
function checkOpenTUIDependencies(): { ok: boolean; message?: string } {
  // Check for Zig (required for OpenTUI native bindings)
  if (!commandExists('zig')) {
    return {
      ok: false,
      message: `OpenTUI requires Zig to be installed for native bindings.

To install Zig:
  macOS:   brew install zig
  Linux:   See https://ziglang.org/download/
  Windows: winget install zig.zig

After installing Zig, run 'wit tui' again.`,
    };
  }

  return { ok: true };
}

/**
 * Dynamically import OpenTUI to allow graceful error handling
 */
async function importOpenTUI() {
  try {
    const core = await import('@opentui/core');
    return core;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    // Check for common native binding errors
    if (message.includes('Could not locate the bindings file') || 
        message.includes('dylib') || 
        message.includes('.so') ||
        message.includes('.dll') ||
        message.includes('ENOENT')) {
      throw new Error(`OpenTUI native bindings not found.

This usually means Zig is not installed or the bindings need to be rebuilt.

To fix:
  1. Install Zig: brew install zig (macOS) or see https://ziglang.org/download/
  2. Reinstall dependencies: npm install

Original error: ${message}`);
    }
    
    throw error;
  }
}

// Color constants
const COLORS = {
  primary: '#00BFFF',
  success: '#00FF00',
  warning: '#FFFF00',
  error: '#FF0000',
  info: '#00FFFF',
  muted: '#888888',
  white: '#FFFFFF',
  black: '#000000',
  headerBg: '#0044AA',
  panelBorder: '#00BFFF',
  selectedBg: '#004488',
};

/**
 * File entry for display
 */
interface FileEntry {
  name: string;
  description: string;
  path: string;
  status: 'staged' | 'modified' | 'untracked' | 'deleted';
}

/**
 * Commit entry for display
 */
interface CommitEntry {
  name: string;
  description: string;
  hash: string;
  message: string;
  date: string;
}

/**
 * TUI Application using OpenTUI
 */
export class TsgitTUI {
  private renderer!: CliRenderer;
  private repo: Repository;
  private stackManager: StackManager;
  
  // OpenTUI module (dynamically imported)
  private opentui!: typeof import('@opentui/core');

  // UI State
  private currentView: 'main' | 'log' | 'diff' | 'branches' | 'stacks' | 'input' = 'main';
  private selectedFile: string | null = null;
  private files: FileEntry[] = [];
  private commits: CommitEntry[] = [];
  private branches: string[] = [];
  private messageTimeout: NodeJS.Timeout | null = null;

  // UI Components
  private header!: TextRenderable;
  private statusText!: TextRenderable;
  private filesSelect!: SelectRenderable;
  private logSelect!: SelectRenderable;
  private diffText!: TextRenderable;
  private helpBar!: TextRenderable;
  private messageBox!: BoxRenderable;
  private messageText!: TextRenderable;

  // Modal components
  private modalContainer!: BoxRenderable;
  private branchSelect!: SelectRenderable;
  private inputBox!: BoxRenderable;
  private inputField!: InputRenderable;
  private inputLabel!: TextRenderable;
  private inputCallback: ((value: string | null) => void) | null = null;

  constructor(repo: Repository) {
    this.repo = repo;
    this.stackManager = new StackManager(repo, repo.gitDir);
  }

  /**
   * Initialize and run the TUI
   */
  async run(): Promise<void> {
    try {
      // Dynamically import OpenTUI
      this.opentui = await importOpenTUI();
      
      this.renderer = await this.opentui.createCliRenderer({
        targetFps: 30,
      });

      this.setupUI();
      this.setupKeyBindings();
      this.refresh();

      this.renderer.start();
    } catch (error) {
      console.error('Failed to initialize TUI:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  /**
   * Setup the UI layout
   */
  private setupUI(): void {
    const { BoxRenderable, TextRenderable, SelectRenderable, InputRenderable } = this.opentui;
    const root = this.renderer.root;

    // Main container with column layout
    const mainContainer = new BoxRenderable(this.renderer, {
      id: 'main-container',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: COLORS.black,
    });
    root.add(mainContainer);

    // Header
    this.header = new TextRenderable(this.renderer, {
      id: 'header',
      content: this.getHeaderContent(),
      fg: COLORS.white,
      bg: COLORS.headerBg,
      width: '100%',
      height: 3,
      paddingLeft: 1,
      paddingTop: 1,
    });
    mainContainer.add(this.header);

    // Content area (row layout)
    const contentArea = new BoxRenderable(this.renderer, {
      id: 'content-area',
      flexDirection: 'row',
      flexGrow: 1,
      width: '100%',
    });
    mainContainer.add(contentArea);

    // Left column
    const leftColumn = new BoxRenderable(this.renderer, {
      id: 'left-column',
      flexDirection: 'column',
      width: '50%',
      height: '100%',
    });
    contentArea.add(leftColumn);

    // Status box (top left)
    const statusBox = new BoxRenderable(this.renderer, {
      id: 'status-box',
      borderStyle: 'single',
      border: true,
      borderColor: COLORS.info,
      title: ' Status ',
      titleAlignment: 'left',
      height: '40%',
      width: '100%',
    });
    leftColumn.add(statusBox);

    this.statusText = new TextRenderable(this.renderer, {
      id: 'status-text',
      content: '',
      fg: COLORS.white,
      paddingLeft: 1,
      paddingTop: 1,
      width: '100%',
      height: '100%',
    });
    statusBox.add(this.statusText);

    // Log box (bottom left)
    const logBox = new BoxRenderable(this.renderer, {
      id: 'log-box',
      borderStyle: 'single',
      border: true,
      borderColor: COLORS.warning,
      title: ' Commit Log ',
      titleAlignment: 'left',
      flexGrow: 1,
      width: '100%',
    });
    leftColumn.add(logBox);

    this.logSelect = new SelectRenderable(this.renderer, {
      id: 'log-select',
      options: [],
      width: '100%',
      height: '100%',
      selectedBackgroundColor: COLORS.selectedBg,
    });
    logBox.add(this.logSelect);

    // Right column
    const rightColumn = new BoxRenderable(this.renderer, {
      id: 'right-column',
      flexDirection: 'column',
      width: '50%',
      height: '100%',
    });
    contentArea.add(rightColumn);

    // Files box (top right)
    const filesBox = new BoxRenderable(this.renderer, {
      id: 'files-box',
      borderStyle: 'single',
      border: true,
      borderColor: COLORS.success,
      title: ' Files ',
      titleAlignment: 'left',
      height: '40%',
      width: '100%',
    });
    rightColumn.add(filesBox);

    this.filesSelect = new SelectRenderable(this.renderer, {
      id: 'files-select',
      options: [],
      width: '100%',
      height: '100%',
      selectedBackgroundColor: COLORS.selectedBg,
    });
    filesBox.add(this.filesSelect);

    // Diff box (bottom right)
    const diffBox = new BoxRenderable(this.renderer, {
      id: 'diff-box',
      borderStyle: 'single',
      border: true,
      borderColor: '#FF00FF',
      title: ' Diff ',
      titleAlignment: 'left',
      flexGrow: 1,
      width: '100%',
    });
    rightColumn.add(diffBox);

    this.diffText = new TextRenderable(this.renderer, {
      id: 'diff-text',
      content: 'Select a file to view diff',
      fg: COLORS.muted,
      paddingLeft: 1,
      paddingTop: 1,
      width: '100%',
      height: '100%',
    });
    diffBox.add(this.diffText);

    // Help bar at bottom
    this.helpBar = new TextRenderable(this.renderer, {
      id: 'help-bar',
      content: ' q:quit  a:add  A:stage all  c:commit  s:switch  b:branch  z:stash  m:merge  p:push  ?:help',
      fg: COLORS.white,
      bg: COLORS.muted,
      width: '100%',
      height: 1,
    });
    mainContainer.add(this.helpBar);

    // Message box (floating, initially hidden)
    this.messageBox = new BoxRenderable(this.renderer, {
      id: 'message-box',
      borderStyle: 'single',
      border: true,
      borderColor: COLORS.white,
      backgroundColor: '#222222',
      position: 'absolute',
      top: '45%',
      left: '25%',
      width: '50%',
      height: 3,
      visible: false,
    });
    root.add(this.messageBox);

    this.messageText = new TextRenderable(this.renderer, {
      id: 'message-text',
      content: '',
      fg: COLORS.white,
      paddingLeft: 1,
      width: '100%',
    });
    this.messageBox.add(this.messageText);

    // Modal container (for branches, stacks, etc.)
    this.modalContainer = new BoxRenderable(this.renderer, {
      id: 'modal-container',
      position: 'absolute',
      top: '20%',
      left: '25%',
      width: '50%',
      height: '60%',
      visible: false,
      borderStyle: 'single',
      border: true,
      borderColor: COLORS.info,
      title: ' Branches (Esc to close) ',
      titleAlignment: 'center',
      backgroundColor: '#111111',
    });
    root.add(this.modalContainer);

    this.branchSelect = new SelectRenderable(this.renderer, {
      id: 'branch-select',
      options: [],
      width: '100%',
      height: '100%',
      selectedBackgroundColor: COLORS.selectedBg,
    });
    this.modalContainer.add(this.branchSelect);

    // Input modal
    this.inputBox = new BoxRenderable(this.renderer, {
      id: 'input-box',
      borderStyle: 'single',
      border: true,
      borderColor: COLORS.success,
      title: ' Input ',
      titleAlignment: 'center',
      backgroundColor: '#111111',
      position: 'absolute',
      top: '40%',
      left: '20%',
      width: '60%',
      height: 5,
      visible: false,
    });
    root.add(this.inputBox);

    this.inputLabel = new TextRenderable(this.renderer, {
      id: 'input-label',
      content: '',
      fg: COLORS.white,
      paddingLeft: 1,
      width: '100%',
      height: 1,
    });
    this.inputBox.add(this.inputLabel);

    this.inputField = new InputRenderable(this.renderer, {
      id: 'input-field',
      placeholder: 'Type here...',
      width: '100%',
      height: 1,
      focusedBackgroundColor: '#333333',
    });
    this.inputBox.add(this.inputField);

    // Setup event handlers
    this.setupEventHandlers();

    // Initial focus
    this.filesSelect.focus();
  }

  /**
   * Setup event handlers for UI components
   */
  private setupEventHandlers(): void {
    const { SelectRenderableEvents, InputRenderableEvents } = this.opentui;
    
    // File selection
    this.filesSelect.on(SelectRenderableEvents.ITEM_SELECTED, (index: number) => {
      if (this.files[index]) {
        this.selectedFile = this.files[index].path;
        this.showFileDiff(this.selectedFile);
      }
    });

    // Log selection
    this.logSelect.on(SelectRenderableEvents.ITEM_SELECTED, (index: number) => {
      if (this.commits[index]) {
        this.showCommitDetails(this.commits[index].hash);
      }
    });

    // Branch selection
    this.branchSelect.on(SelectRenderableEvents.ITEM_SELECTED, (index: number) => {
      if (this.branches[index]) {
        this.switchToBranch(this.branches[index]);
      }
    });

    // Input submission
    this.inputField.on(InputRenderableEvents.CHANGE, (value: string) => {
      if (this.inputCallback) {
        const callback = this.inputCallback;
        this.inputCallback = null;
        this.hideInput();
        callback(value);
      }
    });
  }

  /**
   * Setup keyboard bindings
   */
  private setupKeyBindings(): void {
    const keyHandler = this.renderer.keyInput;

    keyHandler.on('keypress', (key: KeyEvent) => {
      // Handle input mode separately
      if (this.currentView === 'input') {
        if (key.name === 'escape') {
          if (this.inputCallback) {
            const callback = this.inputCallback;
            this.inputCallback = null;
            this.hideInput();
            callback(null);
          }
        }
        return;
      }

      // Handle modal escape
      if (this.currentView === 'branches' || this.currentView === 'stacks') {
        if (key.name === 'escape') {
          this.hideModal();
          return;
        }
      }

      // Global key bindings
      switch (key.name) {
        case 'q':
          if (!key.ctrl) {
            this.quit();
          }
          break;
        case 'c':
          if (key.ctrl) {
            this.quit();
          } else if (key.shift) {
            this.showAmendDialog();
          } else {
            this.showCommitDialog();
          }
          break;
        case 'r':
          if (key.shift) {
            this.showResetMenu();
          } else {
            this.refresh();
            this.showMessage('Refreshed');
          }
          break;
        case 'a':
          if (key.shift) {
            this.stageAll();
          } else {
            this.addSelectedFile();
          }
          break;
        case 's':
          this.showBranchSelector();
          break;
        case 'b':
          this.showCreateBranchDialog();
          break;
        case 'z':
          this.showStashMenu();
          break;
        case 't':
          if (key.shift) {
            this.showStackSelector();
          } else {
            this.showTagMenu();
          }
          break;
        case 'm':
          this.showMergeMenu();
          break;
        case 'p':
          this.pushChanges();
          break;
        case 'l':
          this.pullChanges();
          break;
        case 'f':
          this.fetchChanges();
          break;
        case 'u':
          this.undoLastOperation();
          break;
        case 'w':
          this.wipCommit();
          break;
        case 'tab':
          this.focusNext();
          break;
        case '/':
        case '?':
          this.showHelp();
          break;
      }
    });
  }

  /**
   * Get header content
   */
  private getHeaderContent(): string {
    const branch = this.repo.refs.getCurrentBranch() || 'detached HEAD';
    const repoName = path.basename(this.repo.workDir);
    return `wit | ${repoName} | Branch: ${branch}`;
  }

  /**
   * Refresh all panels
   */
  refresh(): void {
    this.header.content = this.getHeaderContent();
    this.refreshStatus();
    this.refreshFiles();
    this.refreshLog();
  }

  /**
   * Refresh status panel
   */
  private refreshStatus(): void {
    try {
      const status = this.repo.status();
      let content = '';

      const branch = this.repo.refs.getCurrentBranch();
      content += `On branch: ${branch || 'detached HEAD'}\n\n`;

      if (status.staged.length > 0) {
        content += `Changes to be committed:\n`;
        for (const file of status.staged) {
          content += `  + ${file}\n`;
        }
        content += '\n';
      }

      if (status.modified.length > 0) {
        content += `Changes not staged:\n`;
        for (const file of status.modified) {
          content += `  ~ ${file}\n`;
        }
        content += '\n';
      }

      if (status.untracked.length > 0) {
        content += `Untracked files:\n`;
        for (const file of status.untracked) {
          content += `  ? ${file}\n`;
        }
        content += '\n';
      }

      if (status.deleted.length > 0) {
        content += `Deleted files:\n`;
        for (const file of status.deleted) {
          content += `  x ${file}\n`;
        }
      }

      if (
        status.staged.length === 0 &&
        status.modified.length === 0 &&
        status.untracked.length === 0 &&
        status.deleted.length === 0
      ) {
        content += 'Working tree clean';
      }

      this.statusText.content = content;
    } catch (error) {
      this.statusText.content = 'Error loading status';
      this.statusText.fg = COLORS.error;
    }
  }

  /**
   * Refresh files panel
   */
  private refreshFiles(): void {
    try {
      const status = this.repo.status();
      this.files = [];

      for (const file of status.staged) {
        this.files.push({
          name: `[S] ${file}`,
          description: 'Staged for commit',
          path: file,
          status: 'staged',
        });
      }
      for (const file of status.modified) {
        this.files.push({
          name: `[M] ${file}`,
          description: 'Modified',
          path: file,
          status: 'modified',
        });
      }
      for (const file of status.untracked) {
        this.files.push({
          name: `[?] ${file}`,
          description: 'Untracked',
          path: file,
          status: 'untracked',
        });
      }
      for (const file of status.deleted) {
        this.files.push({
          name: `[D] ${file}`,
          description: 'Deleted',
          path: file,
          status: 'deleted',
        });
      }

      this.filesSelect.options = this.files;
    } catch (error) {
      this.filesSelect.options = [{ name: 'Error loading files', description: '' }];
    }
  }

  /**
   * Refresh commit log panel
   */
  private refreshLog(): void {
    try {
      const commitObjs = this.repo.log('HEAD', 20);
      this.commits = [];

      for (const commit of commitObjs) {
        const hash = commit.hash().slice(0, 8);
        const message = commit.message.split('\n')[0].slice(0, 40);
        const date = new Date(commit.author.timestamp * 1000).toLocaleDateString();
        this.commits.push({
          name: `${hash} ${message}`,
          description: date,
          hash: commit.hash(),
          message: commit.message,
          date,
        });
      }

      if (this.commits.length === 0) {
        this.commits.push({
          name: 'No commits yet',
          description: '',
          hash: '',
          message: '',
          date: '',
        });
      }

      this.logSelect.options = this.commits;
    } catch (error) {
      this.logSelect.options = [{ name: 'No commits yet', description: '' }];
    }
  }

  /**
   * Show diff for a file
   */
  private showFileDiff(filePath: string): void {
    try {
      const fileDiff = this.computeFileDiff(filePath);

      if (!fileDiff) {
        this.diffText.content = `Diff for: ${filePath}\n\nNo changes to show`;
        this.diffText.fg = COLORS.muted;
        return;
      }

      if (fileDiff.isBinary) {
        this.diffText.content = `Diff for: ${filePath}\n\nBinary file - cannot display diff`;
        this.diffText.fg = COLORS.warning;
        return;
      }

      const content = this.formatDiffForDisplay(fileDiff, filePath);
      this.diffText.content = content;
      this.diffText.fg = COLORS.white;
    } catch (error) {
      this.diffText.content = `Error loading diff: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.diffText.fg = COLORS.error;
    }
  }

  /**
   * Compute the diff for a single file
   */
  private computeFileDiff(
    filePath: string
  ): { hunks: DiffHunk[]; isBinary: boolean; isNew: boolean; isDeleted: boolean } | null {
    const status = this.repo.status();
    const fullPath = path.join(this.repo.workDir, filePath);

    const isStaged = status.staged.some((f) => f === filePath || f.startsWith(filePath));
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
        if (!fs.existsSync(fullPath)) return null;
        const content = fs.readFileSync(fullPath);
        if (isBinary(content)) {
          return { hunks: [], isBinary: true, isNew: true, isDeleted: false };
        }
        newContent = content.toString('utf-8');
        return { hunks: createHunks(diff(oldContent, newContent)), isBinary: false, isNew: true, isDeleted: false };
      }

      if (isDeleted) {
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
   * Format diff hunks for display
   */
  private formatDiffForDisplay(
    fileDiff: { hunks: DiffHunk[]; isNew: boolean; isDeleted: boolean },
    filePath: string
  ): string {
    let content = `Diff for: ${filePath}\n`;

    if (fileDiff.isNew) {
      content += `(new file)\n`;
    } else if (fileDiff.isDeleted) {
      content += `(deleted)\n`;
    }

    content += '\n';

    if (fileDiff.hunks.length === 0) {
      content += 'No differences found';
      return content;
    }

    for (const hunk of fileDiff.hunks) {
      content += `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@\n`;

      for (const line of hunk.lines) {
        const lineNum = this.formatLineNumber(line);
        const truncatedContent = this.truncateLine(line.content, 60);

        switch (line.type) {
          case 'add':
            content += `${lineNum} + ${truncatedContent}\n`;
            break;
          case 'remove':
            content += `${lineNum} - ${truncatedContent}\n`;
            break;
          case 'context':
            content += `${lineNum}   ${truncatedContent}\n`;
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
   * Show commit details
   */
  private showCommitDetails(hash: string): void {
    if (!hash) return;

    try {
      const commit = this.repo.objects.readCommit(hash);
      let content = '';

      content += `Commit: ${hash}\n`;
      content += `Author: ${commit.author.name} <${commit.author.email}>\n`;
      content += `Date: ${new Date(commit.author.timestamp * 1000).toLocaleString()}\n`;
      content += `\n${commit.message}\n`;

      this.diffText.content = content;
      this.diffText.fg = COLORS.white;
    } catch (error) {
      this.diffText.content = 'Error loading commit';
      this.diffText.fg = COLORS.error;
    }
  }

  /**
   * Add selected file to staging
   */
  private addSelectedFile(): void {
    const index = this.filesSelect.getSelectedIndex();
    const file = this.files[index];

    if (file) {
      try {
        this.repo.add(file.path);
        this.showMessage(`Added: ${file.path}`);
        this.refresh();
      } catch (error) {
        this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
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
   * Show commit dialog
   */
  private showCommitDialog(): void {
    this.showInput('Commit message:', (value) => {
      if (value && value.trim()) {
        try {
          const hash = this.repo.commit(value.trim());
          this.showMessage(`Committed: ${hash.slice(0, 8)}`);
          this.refresh();
        } catch (error) {
          this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    });
  }

  /**
   * Show amend dialog
   */
  private showAmendDialog(): void {
    try {
      const headHash = this.repo.refs.resolve('HEAD');
      if (!headHash) {
        this.showMessage('No commits to amend');
        return;
      }

      const oldCommit = this.repo.objects.readCommit(headHash);

      this.showInput('New message (leave empty to keep):', (value) => {
        try {
          const newMessage = value?.trim() || oldCommit.message;

          if (oldCommit.parentHashes.length > 0) {
            const head = this.repo.refs.getHead();
            if (head.isSymbolic) {
              this.repo.refs.updateBranch(head.target.replace('refs/heads/', ''), oldCommit.parentHashes[0]);
            }
          }

          const hash = this.repo.commit(newMessage);
          this.showMessage(`Amended: ${hash.slice(0, 8)}`);
          this.refresh();
        } catch (error) {
          this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      });
    } catch (error) {
      this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Show branch selector
   */
  private showBranchSelector(): void {
    try {
      const branchList = this.repo.listBranches();
      this.branches = branchList.map((b) => b.name);

      this.branchSelect.options = branchList.map((b) => ({
        name: b.isCurrent ? `* ${b.name}` : `  ${b.name}`,
        description: b.isCurrent ? 'current' : '',
      }));

      this.modalContainer.title = ' Branches (Esc to close) ';
      this.showModal('branches');
      this.branchSelect.focus();
    } catch (error) {
      this.showMessage('Error loading branches');
    }
  }

  /**
   * Switch to a branch
   */
  private switchToBranch(branchName: string): void {
    const cleanName = branchName.replace(/^\*?\s*/, '').trim();
    try {
      this.repo.checkout(cleanName);
      this.hideModal();
      this.showMessage(`Switched to: ${cleanName}`);
      this.refresh();
    } catch (error) {
      this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Show create branch dialog
   */
  private showCreateBranchDialog(): void {
    this.showInput('Branch name:', (value) => {
      if (value && value.trim()) {
        try {
          this.repo.createBranch(value.trim());
          this.repo.checkout(value.trim());
          this.showMessage(`Created and switched to: ${value.trim()}`);
          this.refresh();
        } catch (error) {
          this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    });
  }

  /**
   * Show stash menu
   */
  private showStashMenu(): void {
    this.showMessage('Stash: z=save, Z=pop (use command palette for more)');
  }

  /**
   * Show tag menu
   */
  private showTagMenu(): void {
    this.showInput('Tag name:', (value) => {
      if (value && value.trim()) {
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
    });
  }

  /**
   * Show merge menu
   */
  private showMergeMenu(): void {
    const { SelectRenderableEvents } = this.opentui;
    
    try {
      const branchList = this.repo.listBranches().filter((b) => !b.isCurrent);
      if (branchList.length === 0) {
        this.showMessage('No other branches to merge');
        return;
      }

      this.branches = branchList.map((b) => b.name);
      this.branchSelect.options = branchList.map((b) => ({
        name: b.name,
        description: 'Merge into current branch',
      }));

      this.modalContainer.title = ' Merge Branch (Esc to close) ';
      this.showModal('branches');
      this.branchSelect.focus();

      // Override selection for merge
      this.branchSelect.removeAllListeners(SelectRenderableEvents.ITEM_SELECTED);
      this.branchSelect.once(SelectRenderableEvents.ITEM_SELECTED, (index: number) => {
        if (this.branches[index]) {
          try {
            this.repo.mergeManager.merge(this.branches[index]);
            this.hideModal();
            this.showMessage(`Merged: ${this.branches[index]}`);
            this.refresh();
          } catch (error) {
            this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
        // Restore original handler
        this.setupEventHandlers();
      });
    } catch (error) {
      this.showMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Push changes
   */
  private pushChanges(): void {
    this.showMessage('Push recorded (configure remotes for network sync)');
  }

  /**
   * Pull changes
   */
  private pullChanges(): void {
    this.showMessage('Pull recorded (configure remotes for network sync)');
    this.refresh();
  }

  /**
   * Fetch changes
   */
  private fetchChanges(): void {
    this.showMessage('Fetch recorded (configure remotes for network sync)');
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
    this.showMessage('Reset: use wit reset --soft/--mixed/--hard <commit>');
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
   * Show stack selector
   */
  private showStackSelector(): void {
    this.showMessage('Stacks: use wit stack commands');
  }

  /**
   * Show help
   */
  private showHelp(): void {
    const helpContent = `
wit TUI - Keyboard Shortcuts

Navigation:
  Tab        - Switch panels
  j/k        - Navigate items
  Enter      - Select item

Changes:
  a - Add selected file
  A - Stage all changes
  c - Create commit
  C - Amend last commit
  w - WIP commit

Branches:
  s - Switch branch
  b - Create new branch
  m - Merge branch

Other:
  t - Create tag
  T - Stacks menu
  z - Stash menu
  p - Push
  l - Pull
  f - Fetch
  u - Undo
  R - Reset menu
  r - Refresh
  q - Quit
  ? - This help

Press any key to close`;

    this.diffText.content = helpContent;
    this.diffText.fg = COLORS.white;
  }

  /**
   * Focus next panel
   */
  private focusNext(): void {
    const panels = [this.filesSelect, this.logSelect];
    const current = panels.findIndex((p) => p.focused);
    const next = (current + 1) % panels.length;
    panels[next].focus();
  }

  /**
   * Show a message
   */
  private showMessage(message: string): void {
    this.messageText.content = message;
    this.messageBox.visible = true;

    if (this.messageTimeout) {
      clearTimeout(this.messageTimeout);
    }

    this.messageTimeout = setTimeout(() => {
      this.messageBox.visible = false;
    }, 2000);
  }

  /**
   * Show modal
   */
  private showModal(view: 'branches' | 'stacks'): void {
    this.currentView = view;
    this.modalContainer.visible = true;
  }

  /**
   * Hide modal
   */
  private hideModal(): void {
    this.currentView = 'main';
    this.modalContainer.visible = false;
    this.filesSelect.focus();
  }

  /**
   * Show input dialog
   */
  private showInput(label: string, callback: (value: string | null) => void): void {
    this.currentView = 'input';
    this.inputLabel.content = label;
    this.inputBox.visible = true;
    this.inputCallback = callback;
    this.inputField.focus();
  }

  /**
   * Hide input dialog
   */
  private hideInput(): void {
    this.currentView = 'main';
    this.inputBox.visible = false;
    this.filesSelect.focus();
  }

  /**
   * Quit the application
   */
  private quit(): void {
    this.renderer.stop();
    process.exit(0);
  }
}

/**
 * Launch the TUI
 */
export async function launchTUI(): Promise<void> {
  // Check dependencies first
  const depCheck = checkOpenTUIDependencies();
  if (!depCheck.ok) {
    console.error('TUI dependency check failed:\n');
    console.error(depCheck.message);
    process.exit(1);
  }

  try {
    const repo = Repository.find();
    const tui = new TsgitTUI(repo);
    await tui.run();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    // Check for OpenTUI-specific errors
    if (message.includes('bindings') || message.includes('native') || message.includes('zig')) {
      console.error('TUI initialization failed:\n');
      console.error(message);
      console.error('\nMake sure Zig is installed and try reinstalling dependencies.');
    } else {
      console.error('Error:', message);
      console.error('Make sure you are in a wit repository');
    }
    process.exit(1);
  }
}
