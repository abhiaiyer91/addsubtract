/**
 * File Tree Browser
 * Navigate repository files with a visual tree
 */

import * as path from 'path';
import { Repository } from '../core/repository';
import { Tree } from '../core/object';
import { walkDir, isDirectory, stat } from '../utils/fs';

/**
 * File tree node
 */
export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
  expanded?: boolean;
  size?: number;
  status?: 'modified' | 'staged' | 'untracked' | 'deleted' | 'clean';
  hash?: string;
}

/**
 * File icons based on extension
 */
const FILE_ICONS: Record<string, string> = {
  // Programming languages
  ts: '📘',
  tsx: '⚛️',
  js: '📒',
  jsx: '⚛️',
  py: '🐍',
  rb: '💎',
  go: '🔵',
  rs: '🦀',
  java: '☕',
  c: '©️',
  cpp: '➕',
  cs: '#️⃣',
  php: '🐘',
  swift: '🍎',
  kt: 'K',
  scala: 'S',

  // Web
  html: '🌐',
  css: '🎨',
  scss: '🎨',
  sass: '🎨',
  less: '🎨',
  vue: '💚',
  svelte: '🔥',

  // Data
  json: '📋',
  yaml: '📋',
  yml: '📋',
  xml: '📋',
  csv: '📊',
  sql: '🗃️',

  // Docs
  md: '📝',
  txt: '📄',
  pdf: '📕',
  doc: '📄',
  docx: '📄',

  // Config
  gitignore: '🙈',
  dockerignore: '🐳',
  env: '🔐',
  lock: '🔒',

  // Images
  png: '🖼️',
  jpg: '🖼️',
  jpeg: '🖼️',
  gif: '🖼️',
  svg: '🖼️',
  ico: '🖼️',

  // Other
  zip: '📦',
  tar: '📦',
  gz: '📦',

  // Default
  default: '📄',
};

/**
 * Folder icons
 */
const FOLDER_ICONS: Record<string, string> = {
  src: '📁',
  lib: '📚',
  test: '🧪',
  tests: '🧪',
  spec: '🧪',
  docs: '📖',
  dist: '📦',
  build: '🔨',
  node_modules: '📦',
  packages: '📦',
  components: '🧩',
  utils: '🔧',
  hooks: '🪝',
  styles: '🎨',
  assets: '🖼️',
  public: '🌐',
  config: '⚙️',
  scripts: '📜',
  default: '📂',
};

/**
 * Get icon for a file
 */
export function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  // Special files
  if (filename === 'package.json') return '📦';
  if (filename === 'tsconfig.json') return '📘';
  if (filename === 'Dockerfile') return '🐳';
  if (filename === 'Makefile') return '🔨';
  if (filename.startsWith('.git')) return '🔒';

  return FILE_ICONS[ext] || FILE_ICONS.default;
}

/**
 * Get icon for a folder
 */
export function getFolderIcon(foldername: string, expanded: boolean = false): string {
  const base = FOLDER_ICONS[foldername.toLowerCase()] || FOLDER_ICONS.default;
  return expanded ? '📂' : base;
}

/**
 * Build file tree from repository
 */
export function buildFileTree(repo: Repository): TreeNode {
  const status = repo.status();
  const statusMap = new Map<string, 'modified' | 'staged' | 'untracked' | 'deleted'>();

  // Build status map
  for (const file of status.staged) {
    statusMap.set(file, 'staged');
  }
  for (const file of status.modified) {
    statusMap.set(file, 'modified');
  }
  for (const file of status.untracked) {
    statusMap.set(file, 'untracked');
  }
  for (const file of status.deleted) {
    statusMap.set(file, 'deleted');
  }

  // Build tree from working directory
  const root: TreeNode = {
    name: path.basename(repo.workDir),
    path: '',
    type: 'directory',
    children: [],
    expanded: true,
  };

  const excludeDirs = ['.wit', 'node_modules', '.git', 'dist', 'build'];
  
  try {
    buildTreeRecursive(repo.workDir, root, '', statusMap, excludeDirs);
  } catch (error) {
    // Handle errors gracefully
  }

  // Sort children
  sortTree(root);

  return root;
}

/**
 * Recursively build tree
 */
function buildTreeRecursive(
  basePath: string,
  node: TreeNode,
  relativePath: string,
  statusMap: Map<string, string>,
  excludeDirs: string[]
): void {
  const fullPath = path.join(basePath, relativePath);
  
  try {
    const entries = require('fs').readdirSync(fullPath);

    for (const entry of entries) {
      // Skip hidden files and excluded directories
      if (entry.startsWith('.') && entry !== '.env') continue;
      if (excludeDirs.includes(entry)) continue;

      const entryPath = relativePath ? `${relativePath}/${entry}` : entry;
      const entryFullPath = path.join(fullPath, entry);

      try {
        const stats = stat(entryFullPath);

        if (stats.isDirectory()) {
          const dirNode: TreeNode = {
            name: entry,
            path: entryPath,
            type: 'directory',
            children: [],
            expanded: false,
          };

          buildTreeRecursive(basePath, dirNode, entryPath, statusMap, excludeDirs);
          node.children!.push(dirNode);
        } else {
          const fileNode: TreeNode = {
            name: entry,
            path: entryPath,
            type: 'file',
            size: stats.size,
            status: statusMap.get(entryPath) as any || 'clean',
          };
          node.children!.push(fileNode);
        }
      } catch {
        // Skip entries we can't stat
      }
    }
  } catch {
    // Handle directory read errors
  }
}

/**
 * Sort tree (directories first, then alphabetically)
 */
function sortTree(node: TreeNode): void {
  if (!node.children) return;

  node.children.sort((a, b) => {
    if (a.type === b.type) {
      return a.name.localeCompare(b.name);
    }
    return a.type === 'directory' ? -1 : 1;
  });

  for (const child of node.children) {
    if (child.type === 'directory') {
      sortTree(child);
    }
  }
}

/**
 * Build tree from a commit
 */
export function buildTreeFromCommit(repo: Repository, commitHash: string): TreeNode {
  const commit = repo.objects.readCommit(commitHash);
  const root: TreeNode = {
    name: commitHash.slice(0, 8),
    path: '',
    type: 'directory',
    children: [],
    expanded: true,
  };

  buildTreeFromTreeObject(repo, commit.treeHash, '', root);
  sortTree(root);

  return root;
}

/**
 * Build tree from tree object
 */
function buildTreeFromTreeObject(
  repo: Repository,
  treeHash: string,
  prefix: string,
  parentNode: TreeNode
): void {
  const tree = repo.objects.readTree(treeHash);

  for (const entry of tree.entries) {
    const entryPath = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.mode === '40000') {
      const dirNode: TreeNode = {
        name: entry.name,
        path: entryPath,
        type: 'directory',
        children: [],
        expanded: false,
        hash: entry.hash,
      };

      buildTreeFromTreeObject(repo, entry.hash, entryPath, dirNode);
      parentNode.children!.push(dirNode);
    } else {
      const fileNode: TreeNode = {
        name: entry.name,
        path: entryPath,
        type: 'file',
        hash: entry.hash,
        status: 'clean',
      };
      parentNode.children!.push(fileNode);
    }
  }
}

/**
 * Render file tree as HTML
 */
export function renderFileTreeHTML(tree: TreeNode, depth: number = 0): string {
  const indent = depth * 20;
  let html = '';

  if (depth > 0) {
    const icon = tree.type === 'directory' 
      ? getFolderIcon(tree.name, tree.expanded) 
      : getFileIcon(tree.name);
    
    const statusClass = tree.status ? `status-${tree.status}` : '';
    const expandIcon = tree.type === 'directory' 
      ? (tree.expanded ? '▼' : '▶') 
      : '';

    html += `
      <div class="tree-item ${tree.type} ${statusClass}" 
           data-path="${tree.path}" 
           style="padding-left: ${indent}px">
        <span class="expand-icon">${expandIcon}</span>
        <span class="file-icon">${icon}</span>
        <span class="file-name">${tree.name}</span>
        ${tree.size ? `<span class="file-size">${formatSize(tree.size)}</span>` : ''}
        ${tree.status && tree.status !== 'clean' ? `<span class="status-badge">${getStatusBadge(tree.status)}</span>` : ''}
      </div>
    `;
  }

  if (tree.children && (tree.expanded || depth === 0)) {
    for (const child of tree.children) {
      html += renderFileTreeHTML(child, depth + 1);
    }
  }

  return html;
}

/**
 * Format file size
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get status badge
 */
function getStatusBadge(status: string): string {
  const badges: Record<string, string> = {
    modified: 'M',
    staged: 'S',
    untracked: '?',
    deleted: 'D',
  };
  return badges[status] || '';
}

/**
 * Render file tree for terminal (ASCII)
 */
export function renderFileTreeTerminal(tree: TreeNode, prefix: string = ''): string[] {
  const lines: string[] = [];
  const children = tree.children || [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const isLast = i === children.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const icon = child.type === 'directory' ? '📁 ' : getFileIcon(child.name) + ' ';
    const statusMark = child.status && child.status !== 'clean' 
      ? ` [${child.status[0].toUpperCase()}]` 
      : '';

    lines.push(`${prefix}${connector}${icon}${child.name}${statusMark}`);

    if (child.type === 'directory' && child.children && child.expanded) {
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      lines.push(...renderFileTreeTerminal(child, newPrefix));
    }
  }

  return lines;
}

/**
 * Get CSS styles for file tree
 */
export function getFileTreeStyles(): string {
  return `
    .file-tree {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      line-height: 1.6;
    }

    .tree-item {
      display: flex;
      align-items: center;
      padding: 4px 8px;
      cursor: pointer;
      border-radius: 4px;
      transition: background 0.15s;
    }

    .tree-item:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    .tree-item.selected {
      background: rgba(56, 139, 253, 0.15);
    }

    .expand-icon {
      width: 16px;
      text-align: center;
      color: #8b949e;
      font-size: 10px;
    }

    .file-icon {
      margin-right: 6px;
    }

    .file-name {
      flex: 1;
      color: #c9d1d9;
    }

    .file-size {
      color: #8b949e;
      font-size: 11px;
      margin-left: 8px;
    }

    .status-badge {
      width: 18px;
      height: 18px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 600;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-left: 8px;
    }

    .status-modified .status-badge {
      background: rgba(210, 153, 34, 0.2);
      color: #d29922;
    }

    .status-staged .status-badge {
      background: rgba(46, 160, 67, 0.2);
      color: #3fb950;
    }

    .status-untracked .status-badge {
      background: rgba(139, 148, 158, 0.2);
      color: #8b949e;
    }

    .status-deleted .status-badge {
      background: rgba(248, 81, 73, 0.2);
      color: #f85149;
    }

    .tree-item.directory > .file-name {
      font-weight: 500;
    }
  `;
}

/**
 * Find node by path
 */
export function findNode(tree: TreeNode, targetPath: string): TreeNode | null {
  if (tree.path === targetPath) return tree;
  
  if (tree.children) {
    for (const child of tree.children) {
      const found = findNode(child, targetPath);
      if (found) return found;
    }
  }
  
  return null;
}

/**
 * Toggle node expansion
 */
export function toggleNode(tree: TreeNode, targetPath: string): boolean {
  const node = findNode(tree, targetPath);
  if (node && node.type === 'directory') {
    node.expanded = !node.expanded;
    return true;
  }
  return false;
}

/**
 * Expand all nodes
 */
export function expandAll(tree: TreeNode): void {
  if (tree.type === 'directory') {
    tree.expanded = true;
    if (tree.children) {
      for (const child of tree.children) {
        expandAll(child);
      }
    }
  }
}

/**
 * Collapse all nodes
 */
export function collapseAll(tree: TreeNode): void {
  if (tree.type === 'directory') {
    tree.expanded = false;
    if (tree.children) {
      for (const child of tree.children) {
        collapseAll(child);
      }
    }
  }
}
