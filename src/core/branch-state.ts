/**
 * Branch State Manager
 * Automatically saves and restores working directory state per branch
 * Enables seamless branch switching without losing uncommitted changes
 */

import * as path from 'path';
import { exists, readFile, writeFile, mkdirp, walkDir, stat } from '../utils/fs';
import { compress, decompress } from '../utils/compression';

/**
 * Represents the state of a file in the working directory
 */
export interface FileState {
  path: string;
  content: string;  // Base64 encoded for binary safety
  mode: string;
  mtime: number;
  isStaged: boolean;
}

/**
 * Complete state of a branch's working directory
 */
export interface BranchState {
  branch: string;
  savedAt: number;
  files: FileState[];
  stagedPaths: string[];
  message?: string;
}

/**
 * Branch state manager configuration
 */
export interface BranchStateConfig {
  autoSave: boolean;     // Automatically save state on branch switch
  autoRestore: boolean;  // Automatically restore state on branch switch
  maxStates: number;     // Maximum states to keep per branch
}

const DEFAULT_CONFIG: BranchStateConfig = {
  autoSave: true,
  autoRestore: true,
  maxStates: 5,
};

/**
 * Manages working directory state per branch
 */
export class BranchStateManager {
  private statesDir: string;
  private config: BranchStateConfig;

  constructor(
    private gitDir: string,
    private workDir: string,
    config: Partial<BranchStateConfig> = {}
  ) {
    this.statesDir = path.join(gitDir, 'branch-states');
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize branch state directories
   */
  init(): void {
    mkdirp(this.statesDir);
  }

  /**
   * Get the state file path for a branch
   */
  private getBranchStatePath(branchName: string): string {
    // Sanitize branch name for filesystem
    const safeName = branchName.replace(/[\/\\:*?"<>|]/g, '_');
    return path.join(this.statesDir, `${safeName}.json`);
  }

  /**
   * Get the state history path for a branch
   */
  private getBranchHistoryPath(branchName: string): string {
    const safeName = branchName.replace(/[\/\\:*?"<>|]/g, '_');
    return path.join(this.statesDir, `${safeName}.history.json`);
  }

  /**
   * Check if a branch has saved state
   */
  hasState(branchName: string): boolean {
    return exists(this.getBranchStatePath(branchName));
  }

  /**
   * Save the current working directory state for a branch
   */
  saveState(
    branchName: string,
    stagedPaths: string[],
    message?: string
  ): void {
    const files: FileState[] = [];
    const excludeDirs = ['.wit/', 'node_modules/', '.git/'];

    // Walk working directory and capture modified files
    const allFiles = walkDir(this.workDir, excludeDirs);

    for (const filePath of allFiles) {
      const relativePath = path.relative(this.workDir, filePath);
      
      try {
        const content = readFile(filePath);
        const stats = stat(filePath);

        files.push({
          path: relativePath,
          content: content.toString('base64'),
          mode: (stats.mode & 0o777).toString(8).padStart(6, '0'),
          mtime: stats.mtimeMs,
          isStaged: stagedPaths.includes(relativePath),
        });
      } catch {
        // Skip files that can't be read
      }
    }

    const state: BranchState = {
      branch: branchName,
      savedAt: Date.now(),
      files,
      stagedPaths,
      message,
    };

    // Save current state
    const statePath = this.getBranchStatePath(branchName);
    const compressed = compress(Buffer.from(JSON.stringify(state)));
    writeFile(statePath, compressed);

    // Update history
    this.addToHistory(branchName, state);
  }

  /**
   * Add state to history
   */
  private addToHistory(branchName: string, state: BranchState): void {
    const historyPath = this.getBranchHistoryPath(branchName);
    let history: { states: BranchState[] } = { states: [] };

    if (exists(historyPath)) {
      try {
        const content = readFile(historyPath).toString('utf8');
        history = JSON.parse(content);
      } catch {
        history = { states: [] };
      }
    }

    // Add new state to history
    history.states.unshift(state);

    // Trim to max states
    if (history.states.length > this.config.maxStates) {
      history.states = history.states.slice(0, this.config.maxStates);
    }

    writeFile(historyPath, JSON.stringify(history, null, 2));
  }

  /**
   * Restore the saved state for a branch
   */
  restoreState(branchName: string): BranchState | null {
    const statePath = this.getBranchStatePath(branchName);

    if (!exists(statePath)) {
      return null;
    }

    try {
      const compressed = readFile(statePath);
      const content = decompress(compressed).toString('utf8');
      const state = JSON.parse(content) as BranchState;

      // Restore files
      for (const file of state.files) {
        const fullPath = path.join(this.workDir, file.path);
        const content = Buffer.from(file.content, 'base64');
        
        mkdirp(path.dirname(fullPath));
        writeFile(fullPath, content);
      }

      return state;
    } catch (error) {
      console.error(`Failed to restore state for branch ${branchName}:`, error);
      return null;
    }
  }

  /**
   * Clear saved state for a branch
   */
  clearState(branchName: string): void {
    const statePath = this.getBranchStatePath(branchName);
    
    if (exists(statePath)) {
      require('fs').unlinkSync(statePath);
    }
  }

  /**
   * Get saved state info without restoring
   */
  getStateInfo(branchName: string): {
    exists: boolean;
    savedAt?: number;
    fileCount?: number;
    stagedCount?: number;
    message?: string;
  } {
    const statePath = this.getBranchStatePath(branchName);

    if (!exists(statePath)) {
      return { exists: false };
    }

    try {
      const compressed = readFile(statePath);
      const content = decompress(compressed).toString('utf8');
      const state = JSON.parse(content) as BranchState;

      return {
        exists: true,
        savedAt: state.savedAt,
        fileCount: state.files.length,
        stagedCount: state.stagedPaths.length,
        message: state.message,
      };
    } catch {
      return { exists: false };
    }
  }

  /**
   * Get state history for a branch
   */
  getHistory(branchName: string): BranchState[] {
    const historyPath = this.getBranchHistoryPath(branchName);

    if (!exists(historyPath)) {
      return [];
    }

    try {
      const content = readFile(historyPath).toString('utf8');
      const history = JSON.parse(content);
      return history.states || [];
    } catch {
      return [];
    }
  }

  /**
   * List all branches with saved state
   */
  listSavedBranches(): string[] {
    if (!exists(this.statesDir)) {
      return [];
    }

    const files = require('fs').readdirSync(this.statesDir) as string[];
    return files
      .filter((f: string) => f.endsWith('.json') && !f.includes('.history.'))
      .map((f: string) => f.replace('.json', ''));
  }

  /**
   * Handle branch switch with automatic state management
   */
  onBranchSwitch(
    fromBranch: string | null,
    toBranch: string,
    stagedPaths: string[],
    hasChanges: boolean
  ): { savedFrom: boolean; restoredTo: boolean } {
    let savedFrom = false;
    let restoredTo = false;

    // Save current state if there are changes
    if (this.config.autoSave && fromBranch && hasChanges) {
      this.saveState(fromBranch, stagedPaths);
      savedFrom = true;
    }

    // Restore state for target branch if exists
    if (this.config.autoRestore && this.hasState(toBranch)) {
      this.restoreState(toBranch);
      restoredTo = true;
    }

    return { savedFrom, restoredTo };
  }

  /**
   * Get configuration
   */
  getConfig(): BranchStateConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<BranchStateConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Format branch state info for display
 */
export function formatBranchStateInfo(info: {
  exists: boolean;
  savedAt?: number;
  fileCount?: number;
  stagedCount?: number;
  message?: string;
}): string {
  if (!info.exists) {
    return 'No saved state';
  }

  const date = new Date(info.savedAt!);
  let output = `Saved: ${date.toLocaleString()}\n`;
  output += `  Files: ${info.fileCount}\n`;
  output += `  Staged: ${info.stagedCount}\n`;
  
  if (info.message) {
    output += `  Message: ${info.message}\n`;
  }

  return output;
}
