/**
 * tsgit User Interface
 * Best-in-class UI components for git visualization
 */

// =============================================================================
// Main Interfaces
// =============================================================================

export { TsgitTUI, launchTUI } from './tui';
export { TsgitWebUI, launchWebUI } from './web';
export { EnhancedWebUI, launchEnhancedWebUI } from './web-enhanced';
export { UltimateWebUI, launchUltimateWebUI } from './web-ultimate';

// =============================================================================
// Theme System
// =============================================================================

export {
  Theme,
  ThemeColors,
  ThemeTypography,
  ThemeSpacing,
  ThemeEffects,
  themes,
  githubDark,
  githubLight,
  dracula,
  nord,
  oneDark,
  highContrast,
  monokai,
  getTheme,
  getThemeNames,
  generateThemeCSS,
  generateTerminalTheme,
  ThemeManager,
  themeManager,
} from './themes';

// =============================================================================
// Command Palette
// =============================================================================

export {
  Command,
  CommandCategory,
  CommandSearchResult,
  CommandRegistry,
  CommandPaletteController,
  fuzzySearch,
  highlightMatches,
  getDefaultCommands,
  renderCommandPaletteHTML,
  renderCommandListHTML,
  getCommandPaletteStyles,
} from './command-palette';

// =============================================================================
// Graph Visualization
// =============================================================================

export { 
  buildGraph, 
  renderGraph, 
  renderGraphHTML, 
  printGraph,
  GraphNode,
  GraphEdge,
  CommitGraph,
  GraphOptions,
} from './graph';

// =============================================================================
// Diff Viewer
// =============================================================================

export {
  renderDiffHTML,
  renderInteractiveDiff,
  toSplitView,
  highlightCode,
  detectLanguage,
  getDiffStyles,
  getWordDiffStyles,
  highlightWordDiff,
  DiffMode,
  SplitDiffLine,
} from './diff-viewer';

// =============================================================================
// File Tree
// =============================================================================

export {
  buildFileTree,
  buildTreeFromCommit,
  renderFileTreeHTML,
  renderFileTreeTerminal,
  getFileTreeStyles,
  getFileIcon,
  getFolderIcon,
  findNode,
  toggleNode,
  expandAll,
  collapseAll,
  TreeNode,
} from './file-tree';

// =============================================================================
// Search
// =============================================================================

export {
  SearchEngine,
  renderSearchResultsHTML,
  getSearchStyles,
  SearchResult,
  SearchResults,
  SearchOptions,
  CommitSearchResult,
  FileSearchResult,
  ContentSearchResult,
} from './search';

// =============================================================================
// Blame View
// =============================================================================

export {
  BlameLine,
  BlameResult,
  BlameViewer,
  generateBlame,
  parseBlame,
  renderBlameHTML,
  getBlameStyles,
  getAuthorColor,
  formatRelativeDate,
} from './blame-view';

// =============================================================================
// Timeline & Statistics
// =============================================================================

export {
  ActivityData,
  AuthorStats,
  RepoStats,
  calculateStats,
  generateHeatmapData,
  renderHeatmapHTML,
  renderTimelineHTML,
  renderStatsDashboardHTML,
  getTimelineStyles,
} from './timeline';

// =============================================================================
// Keyboard Navigation
// =============================================================================

export {
  KeyCombo,
  Shortcut,
  KeyboardManager,
  keyboardManager,
  parseKeyString,
  formatKeyCombo,
  matchesKeyCombo,
  getDefaultShortcuts,
  renderKeyboardHelpHTML,
  getKeyboardHelpStyles,
} from './keyboard';

// =============================================================================
// Conflict Resolution
// =============================================================================

export {
  ConflictSide,
  ConflictHunk,
  ConflictFile,
  ConflictResolver,
  parseConflictFile,
  resolveHunk,
  getResolvedHunkContent,
  generateResolvedContent,
  renderConflictResolverHTML,
  getConflictResolverStyles,
} from './conflict-resolver';

// =============================================================================
// Virtual Scrolling
// =============================================================================

export {
  VirtualScrollOptions,
  VirtualScroller,
  getVirtualScrollStyles,
  createCommitList,
  createFileList,
  getListStyles,
} from './virtual-scroll';

// =============================================================================
// Stash Management
// =============================================================================

export {
  StashEntry,
  StashManager,
  getStashList,
  renderStashListHTML,
  renderStashCreateModalHTML,
  getStashStyles,
} from './stash';

// =============================================================================
// Branch Comparison
// =============================================================================

export {
  BranchComparison,
  BranchComparer,
  compareBranches,
  renderBranchComparisonHTML,
  getBranchCompareStyles,
} from './branch-compare';

// =============================================================================
// Utility: Get All UI Styles
// =============================================================================

import { generateThemeCSS, githubDark } from './themes';
import { getCommandPaletteStyles } from './command-palette';
import { getDiffStyles, getWordDiffStyles } from './diff-viewer';
import { getFileTreeStyles } from './file-tree';
import { getSearchStyles } from './search';
import { getBlameStyles } from './blame-view';
import { getTimelineStyles } from './timeline';
import { getKeyboardHelpStyles } from './keyboard';
import { getConflictResolverStyles } from './conflict-resolver';
import { getVirtualScrollStyles, getListStyles } from './virtual-scroll';
import { getStashStyles } from './stash';
import { getBranchCompareStyles } from './branch-compare';

/**
 * Get all UI component styles bundled together
 */
export function getAllStyles(themeName: string = 'github-dark'): string {
  const { getTheme } = require('./themes');
  const theme = getTheme(themeName);

  return `
    /* Theme Variables */
    ${generateThemeCSS(theme)}

    /* Base Styles */
    *, *::before, *::after {
      box-sizing: border-box;
    }

    body {
      font-family: var(--font-family);
      font-size: var(--font-size-base);
      line-height: var(--line-height);
      color: var(--text-primary);
      background: var(--bg-primary);
      margin: 0;
      padding: 0;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-xs);
      padding: var(--spacing-sm) var(--spacing-md);
      font-family: var(--font-family);
      font-size: var(--font-size-sm);
      font-weight: 500;
      border: none;
      border-radius: var(--border-radius);
      cursor: pointer;
      transition: all var(--transition-fast);
    }

    .btn:focus {
      outline: 2px solid var(--border-focus);
      outline-offset: 2px;
    }

    .btn-primary {
      background: var(--accent-success);
      color: var(--text-inverse);
    }

    .btn-primary:hover {
      filter: brightness(1.1);
    }

    .btn-secondary {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border-default);
    }

    .btn-secondary:hover {
      background: var(--border-default);
    }

    /* Form Controls */
    input, textarea, select {
      font-family: var(--font-family);
      font-size: var(--font-size-base);
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--border-radius);
      color: var(--text-primary);
      transition: border-color var(--transition-fast);
    }

    input:focus, textarea:focus, select:focus {
      outline: none;
      border-color: var(--border-focus);
    }

    /* Scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }

    ::-webkit-scrollbar-track {
      background: var(--bg-primary);
    }

    ::-webkit-scrollbar-thumb {
      background: var(--bg-tertiary);
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: var(--border-default);
    }

    /* Component Styles */
    ${getCommandPaletteStyles()}
    ${getDiffStyles()}
    ${getWordDiffStyles()}
    ${getFileTreeStyles()}
    ${getSearchStyles()}
    ${getBlameStyles()}
    ${getTimelineStyles()}
    ${getKeyboardHelpStyles()}
    ${getConflictResolverStyles()}
    ${getVirtualScrollStyles()}
    ${getListStyles()}
    ${getStashStyles()}
    ${getBranchCompareStyles()}
  `;
}
