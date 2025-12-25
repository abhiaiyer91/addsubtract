/**
 * tsgit User Interface
 * Export all UI components
 */

// Main interfaces
export { TsgitTUI, launchTUI } from './tui';
export { TsgitWebUI, launchWebUI } from './web';
export { EnhancedWebUI, launchEnhancedWebUI } from './web-enhanced';

// Graph visualization
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

// Diff viewer
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

// File tree
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

// Search
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
