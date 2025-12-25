/**
 * Commit Graph Visualization
 * Renders beautiful ASCII/Unicode commit graphs
 */

import { Repository } from '../core/repository';
import { Commit } from '../core/object';

/**
 * Graph node representing a commit
 */
export interface GraphNode {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: Date;
  parents: string[];
  children: string[];
  column: number;
  row: number;
  branches: string[];
  tags: string[];
  isHead: boolean;
}

/**
 * Graph edge connecting commits
 */
export interface GraphEdge {
  from: string;
  to: string;
  fromColumn: number;
  toColumn: number;
  type: 'direct' | 'merge' | 'branch';
}

/**
 * Complete graph structure
 */
export interface CommitGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  maxColumns: number;
}

/**
 * Graph rendering options
 */
export interface GraphOptions {
  useUnicode?: boolean;
  useColors?: boolean;
  maxCommits?: number;
  showBranches?: boolean;
  showTags?: boolean;
}

const DEFAULT_OPTIONS: GraphOptions = {
  useUnicode: true,
  useColors: true,
  maxCommits: 50,
  showBranches: true,
  showTags: true,
};

/**
 * Unicode/ASCII characters for graph drawing
 */
const CHARS = {
  unicode: {
    commit: '●',
    commitHead: '◉',
    vertical: '│',
    horizontal: '─',
    topRight: '╮',
    topLeft: '╭',
    bottomRight: '╯',
    bottomLeft: '╰',
    cross: '┼',
    branchRight: '├',
    branchLeft: '┤',
    merge: '┴',
    split: '┬',
  },
  ascii: {
    commit: '*',
    commitHead: '@',
    vertical: '|',
    horizontal: '-',
    topRight: '\\',
    topLeft: '/',
    bottomRight: '/',
    bottomLeft: '\\',
    cross: '+',
    branchRight: '+',
    branchLeft: '+',
    merge: '+',
    split: '+',
  },
};

/**
 * Colors for graph columns
 */
const COLORS = [
  '\x1b[31m', // red
  '\x1b[32m', // green
  '\x1b[33m', // yellow
  '\x1b[34m', // blue
  '\x1b[35m', // magenta
  '\x1b[36m', // cyan
  '\x1b[91m', // bright red
  '\x1b[92m', // bright green
  '\x1b[93m', // bright yellow
  '\x1b[94m', // bright blue
];

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

/**
 * Build a commit graph from the repository
 */
export function buildGraph(repo: Repository, options: GraphOptions = {}): CommitGraph {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const columnMap = new Map<string, number>();
  const activeColumns: (string | null)[] = [];

  // Get all commits
  const commits = getAllCommits(repo, opts.maxCommits!);
  const headHash = repo.refs.resolve('HEAD');
  const branches = getBranchMap(repo);
  const tags = getTagMap(repo);

  // Process commits
  for (let row = 0; row < commits.length; row++) {
    const commit = commits[row];
    const hash = commit.hash();

    // Find or assign column
    let column = activeColumns.indexOf(hash);
    if (column === -1) {
      column = findFreeColumn(activeColumns);
      activeColumns[column] = hash;
    }

    // Create node
    const node: GraphNode = {
      hash,
      shortHash: hash.slice(0, 8),
      message: commit.message.split('\n')[0],
      author: commit.author.name,
      date: new Date(commit.author.timestamp * 1000),
      parents: commit.parentHashes,
      children: [],
      column,
      row,
      branches: branches.get(hash) || [],
      tags: tags.get(hash) || [],
      isHead: hash === headHash,
    };
    nodes.push(node);
    columnMap.set(hash, column);

    // Clear this column (commit is now processed)
    activeColumns[column] = null;

    // Handle parents
    for (let i = 0; i < commit.parentHashes.length; i++) {
      const parentHash = commit.parentHashes[i];
      
      // Find column for parent
      let parentColumn = activeColumns.indexOf(parentHash);
      if (parentColumn === -1) {
        if (i === 0) {
          // First parent takes our column
          parentColumn = column;
        } else {
          // Merge parent gets new column
          parentColumn = findFreeColumn(activeColumns);
        }
        activeColumns[parentColumn] = parentHash;
      }

      // Create edge
      edges.push({
        from: hash,
        to: parentHash,
        fromColumn: column,
        toColumn: parentColumn,
        type: i === 0 ? 'direct' : 'merge',
      });
    }
  }

  // Calculate max columns
  const maxColumns = Math.max(...nodes.map(n => n.column)) + 1;

  return { nodes, edges, maxColumns };
}

/**
 * Get all commits up to a limit
 */
function getAllCommits(repo: Repository, limit: number): Commit[] {
  const commits: Commit[] = [];
  const seen = new Set<string>();
  const queue: string[] = [];

  // Start from all branch heads
  const branches = repo.refs.listBranches();
  for (const branch of branches) {
    const hash = repo.refs.resolve(branch);
    if (hash && !seen.has(hash)) {
      queue.push(hash);
      seen.add(hash);
    }
  }

  // BFS to get commits in topological order
  while (queue.length > 0 && commits.length < limit) {
    const hash = queue.shift()!;
    
    try {
      const commit = repo.objects.readCommit(hash);
      commits.push(commit);

      for (const parentHash of commit.parentHashes) {
        if (!seen.has(parentHash)) {
          queue.push(parentHash);
          seen.add(parentHash);
        }
      }
    } catch {
      // Commit not found, skip
    }
  }

  // Sort by timestamp (newest first)
  commits.sort((a, b) => b.author.timestamp - a.author.timestamp);

  return commits;
}

/**
 * Find a free column or create new one
 */
function findFreeColumn(columns: (string | null)[]): number {
  const index = columns.indexOf(null);
  if (index !== -1) return index;
  columns.push(null);
  return columns.length - 1;
}

/**
 * Get map of commit hash to branch names
 */
function getBranchMap(repo: Repository): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const branches = repo.refs.listBranches();
  
  for (const branch of branches) {
    const hash = repo.refs.resolve(branch);
    if (hash) {
      const existing = map.get(hash) || [];
      existing.push(branch);
      map.set(hash, existing);
    }
  }
  
  return map;
}

/**
 * Get map of commit hash to tag names
 */
function getTagMap(repo: Repository): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const tags = repo.refs.listTags();
  
  for (const tag of tags) {
    const hash = repo.refs.resolve(tag);
    if (hash) {
      const existing = map.get(hash) || [];
      existing.push(tag);
      map.set(hash, existing);
    }
  }
  
  return map;
}

/**
 * Render the graph as ASCII/Unicode art
 */
export function renderGraph(graph: CommitGraph, options: GraphOptions = {}): string[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const chars = opts.useUnicode ? CHARS.unicode : CHARS.ascii;
  const lines: string[] = [];

  // Track active columns for each row
  const activeColumns: boolean[] = new Array(graph.maxColumns).fill(false);

  for (let row = 0; row < graph.nodes.length; row++) {
    const node = graph.nodes[row];
    const nodeEdges = graph.edges.filter(e => e.from === node.hash);
    
    // Update active columns
    activeColumns[node.column] = true;
    
    // Build graph part
    let graphPart = '';
    for (let col = 0; col < graph.maxColumns; col++) {
      if (col === node.column) {
        // This is the commit
        const char = node.isHead ? chars.commitHead : chars.commit;
        graphPart += colorize(char, col, opts.useColors!);
      } else if (activeColumns[col]) {
        // Active branch line
        graphPart += colorize(chars.vertical, col, opts.useColors!);
      } else {
        graphPart += ' ';
      }
      graphPart += ' ';
    }

    // Build info part
    let infoPart = '';
    
    // Short hash
    infoPart += opts.useColors ? `\x1b[33m${node.shortHash}${RESET}` : node.shortHash;
    
    // Branches
    if (opts.showBranches && node.branches.length > 0) {
      const branchStr = node.branches.map(b => {
        if (opts.useColors) {
          return node.isHead ? `${BOLD}\x1b[32m${b}${RESET}` : `\x1b[32m${b}${RESET}`;
        }
        return b;
      }).join(', ');
      infoPart += ` (${branchStr})`;
    }
    
    // Tags
    if (opts.showTags && node.tags.length > 0) {
      const tagStr = node.tags.map(t => {
        return opts.useColors ? `\x1b[33m${t}${RESET}` : t;
      }).join(', ');
      infoPart += ` [${tagStr}]`;
    }
    
    // Message
    infoPart += ` ${node.message}`;
    
    // Author and date
    const dateStr = formatDate(node.date);
    if (opts.useColors) {
      infoPart += ` ${RESET}\x1b[90m- ${node.author}, ${dateStr}${RESET}`;
    } else {
      infoPart += ` - ${node.author}, ${dateStr}`;
    }

    lines.push(graphPart + infoPart);

    // Draw connecting lines for edges
    const incomingEdges = graph.edges.filter(e => e.to === node.hash);
    for (const edge of incomingEdges) {
      if (edge.fromColumn !== edge.toColumn) {
        // Need to draw merge/branch line
        // This would be a connecting line row
      }
    }

    // Update active columns based on edges
    for (const edge of nodeEdges) {
      if (edge.toColumn !== node.column) {
        activeColumns[edge.toColumn] = true;
      }
    }
    
    // Check if this column continues
    const hasChildInColumn = graph.edges.some(e => 
      e.to === node.hash && e.fromColumn === node.column
    );
    if (!hasChildInColumn) {
      // Check if any future commit needs this column
      const hasParentInColumn = nodeEdges.some(e => e.toColumn === node.column);
      if (!hasParentInColumn) {
        activeColumns[node.column] = false;
      }
    }
  }

  return lines;
}

/**
 * Apply color to text based on column
 */
function colorize(text: string, column: number, useColors: boolean): string {
  if (!useColors) return text;
  const color = COLORS[column % COLORS.length];
  return `${color}${text}${RESET}`;
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return 'today';
  } else if (diffDays === 1) {
    return 'yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months > 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString();
  }
}

/**
 * Render graph as HTML for web UI - GitKraken-inspired smooth curves
 */
export function renderGraphHTML(graph: CommitGraph): string {
  const rows: string[] = [];
  
  // Beautiful gradient-inspired color palette
  const cssColors = [
    '#6366f1', // Indigo
    '#22c55e', // Green
    '#f59e0b', // Amber
    '#ec4899', // Pink
    '#8b5cf6', // Purple
    '#06b6d4', // Cyan
    '#ef4444', // Red
    '#84cc16', // Lime
  ];

  const ROW_HEIGHT = 40;
  const COLUMN_WIDTH = 28;
  const NODE_RADIUS = 5;
  const HEAD_RADIUS = 7;

  for (let nodeIndex = 0; nodeIndex < graph.nodes.length; nodeIndex++) {
    const node = graph.nodes[nodeIndex];
    const graphWidth = Math.max(120, (graph.maxColumns + 1) * COLUMN_WIDTH);
    const cx = node.column * COLUMN_WIDTH + 14;
    const cy = ROW_HEIGHT / 2;
    
    // Build SVG with smooth bezier curves
    let paths = '';
    
    // Draw edges going DOWN from this node (to parents)
    const outgoingEdges = graph.edges.filter(e => e.from === node.hash);
    for (const edge of outgoingEdges) {
      const x1 = edge.fromColumn * COLUMN_WIDTH + 14;
      const x2 = edge.toColumn * COLUMN_WIDTH + 14;
      const color = cssColors[edge.fromColumn % cssColors.length];
      
      if (x1 === x2) {
        // Straight line down
        paths += `<line x1="${x1}" y1="${cy + NODE_RADIUS}" x2="${x2}" y2="${ROW_HEIGHT}" 
                  stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`;
      } else {
        // Beautiful S-curve for merge/branch (GitKraken style)
        const midY = cy + (ROW_HEIGHT - cy) / 2 + 4;
        const ctrlOffset = Math.abs(x2 - x1) * 0.4;
        paths += `<path d="M${x1} ${cy + NODE_RADIUS} 
                          C${x1} ${midY}, ${x2} ${midY}, ${x2} ${ROW_HEIGHT}" 
                  fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`;
      }
    }
    
    // Draw incoming edges from above (from children)
    if (nodeIndex > 0) {
      const incomingEdges = graph.edges.filter(e => e.to === node.hash);
      for (const edge of incomingEdges) {
        const x1 = edge.fromColumn * COLUMN_WIDTH + 14;
        const x2 = edge.toColumn * COLUMN_WIDTH + 14;
        const color = cssColors[edge.fromColumn % cssColors.length];
        
        if (x1 === x2) {
          // Straight line from top
          paths += `<line x1="${x1}" y1="0" x2="${x2}" y2="${cy - NODE_RADIUS}" 
                    stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`;
        } else {
          // S-curve from a different column
          const midY = cy / 2;
          paths += `<path d="M${x1} 0 
                            C${x1} ${midY}, ${x2} ${midY}, ${x2} ${cy - NODE_RADIUS}" 
                    fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`;
        }
      }
    }
    
    // Draw the commit node
    const nodeColor = cssColors[node.column % cssColors.length];
    const radius = node.isHead ? HEAD_RADIUS : NODE_RADIUS;
    
    let nodeElement = '';
    if (node.isHead) {
      // HEAD commit gets a special double-ring effect
      nodeElement = `
        <circle cx="${cx}" cy="${cy}" r="${radius + 3}" fill="${nodeColor}" opacity="0.25"/>
        <circle cx="${cx}" cy="${cy}" r="${radius}" fill="${nodeColor}"/>
        <circle cx="${cx}" cy="${cy}" r="${radius - 2}" fill="#0d1117"/>
        <circle cx="${cx}" cy="${cy}" r="${radius - 3}" fill="${nodeColor}"/>
      `;
    } else {
      // Regular commit node with subtle shadow effect
      nodeElement = `
        <circle cx="${cx}" cy="${cy}" r="${radius + 1}" fill="${nodeColor}" opacity="0.3"/>
        <circle cx="${cx}" cy="${cy}" r="${radius}" fill="${nodeColor}"/>
      `;
    }
    
    const graphSvg = `
      <svg width="${graphWidth}" height="${ROW_HEIGHT}" class="graph-svg">
        <defs>
          <filter id="glow-${nodeIndex}" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        ${paths}
        <g class="graph-node" filter="url(#glow-${nodeIndex})">${nodeElement}</g>
      </svg>
    `;

    // Build decorations (branches and tags)
    let decorations = '';
    if (node.branches.length > 0) {
      decorations += node.branches.map(b => 
        `<span class="branch-label${node.isHead && b === graph.nodes[0]?.branches[0] ? ' current' : ''}">${escapeHtml(b)}</span>`
      ).join('');
    }
    if (node.tags.length > 0) {
      decorations += node.tags.map(t => 
        `<span class="tag-label">🏷 ${escapeHtml(t)}</span>`
      ).join('');
    }

    rows.push(`
      <div class="graph-row" data-hash="${node.hash}">
        <div class="graph-visual" style="width: ${graphWidth}px;">${graphSvg}</div>
        <div class="graph-info">
          <span class="commit-hash">${node.shortHash}</span>
          ${decorations}
          <span class="commit-message">${escapeHtml(node.message)}</span>
          <span class="commit-author">${escapeHtml(node.author)}</span>
          <span class="commit-time">${formatDate(node.date)}</span>
        </div>
      </div>
    `);
  }

  return rows.join('\n');
}

/**
 * Get CSS styles for the graph (for standalone use)
 */
export function getGraphStyles(): string {
  return `
    .graph-row {
      display: flex;
      align-items: center;
      padding: 4px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    
    .graph-row:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    
    .graph-row.selected {
      background: rgba(99, 102, 241, 0.15);
    }
    
    .graph-visual {
      flex-shrink: 0;
    }
    
    .graph-svg {
      overflow: visible;
      display: block;
    }
    
    .graph-node {
      transition: transform 0.15s ease;
    }
    
    .graph-row:hover .graph-node {
      transform: scale(1.15);
    }
    
    .graph-info {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 10px;
      padding-left: 12px;
      overflow: hidden;
    }
    
    .commit-hash {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      color: #58a6ff;
      flex-shrink: 0;
    }
    
    .branch-label {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 10px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.15) 100%);
      border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
      color: #a5b4fc;
      flex-shrink: 0;
    }
    
    .branch-label.current {
      background: linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(74, 222, 128, 0.15) 100%);
      border-color: rgba(74, 222, 128, 0.3);
      color: #86efac;
    }
    
    .tag-label {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 10px;
      background: rgba(251, 191, 36, 0.15);
      border: 1px solid rgba(251, 191, 36, 0.25);
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
      color: #fcd34d;
      flex-shrink: 0;
    }
    
    .commit-message {
      flex: 1;
      font-size: 13px;
      color: #e6edf3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .commit-author {
      font-size: 12px;
      color: #8b949e;
      white-space: nowrap;
      flex-shrink: 0;
    }
    
    .commit-time {
      font-size: 12px;
      color: #6e7681;
      white-space: nowrap;
      flex-shrink: 0;
    }
  `;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Print graph to console
 */
export function printGraph(repo: Repository, options: GraphOptions = {}): void {
  const graph = buildGraph(repo, options);
  const lines = renderGraph(graph, options);
  
  for (const line of lines) {
    console.log(line);
  }
}
