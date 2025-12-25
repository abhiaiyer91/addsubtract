/**
 * Enhanced Web UI for tsgit
 * Full-featured dashboard with graph, diff viewer, file tree, and search
 */

import * as http from 'http';
import * as path from 'path';
import * as url from 'url';
import { Repository } from '../core/repository';
import { buildGraph, renderGraphHTML } from './graph';
import { renderDiffHTML, getDiffStyles, getWordDiffStyles } from './diff-viewer';
import { buildFileTree, renderFileTreeHTML, getFileTreeStyles } from './file-tree';
import { SearchEngine, renderSearchResultsHTML, getSearchStyles } from './search';
import { diff } from '../core/diff';

const DEFAULT_PORT = 3847;

/**
 * Enhanced Web UI Server
 */
export class EnhancedWebUI {
  private server: http.Server;
  private repo: Repository;
  private port: number;
  private searchEngine: SearchEngine;

  constructor(repo: Repository, port: number = DEFAULT_PORT) {
    this.repo = repo;
    this.port = port;
    this.searchEngine = new SearchEngine(repo);
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
  }

  /**
   * Handle incoming requests
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const parsedUrl = url.parse(req.url || '/', true);
    const pathname = parsedUrl.pathname || '/';

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      // Routing
      if (pathname === '/') {
        this.serveHTML(res);
      } else if (pathname === '/api/status') {
        this.serveJSON(res, this.getStatus());
      } else if (pathname === '/api/graph') {
        this.serveJSON(res, this.getGraph());
      } else if (pathname === '/api/graph/html') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.getGraphHTML());
      } else if (pathname === '/api/log') {
        this.serveJSON(res, this.getLog());
      } else if (pathname === '/api/branches') {
        this.serveJSON(res, this.getBranches());
      } else if (pathname === '/api/tree') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.getFileTreeHTML());
      } else if (pathname === '/api/diff') {
        const file = parsedUrl.query.file as string;
        const mode = (parsedUrl.query.mode as string) || 'split';
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.getDiffHTML(file, mode as any));
      } else if (pathname === '/api/search') {
        const query = parsedUrl.query.q as string || '';
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.getSearchHTML(query));
      } else if (pathname === '/api/file') {
        const filePath = parsedUrl.query.path as string;
        this.serveJSON(res, this.getFileContent(filePath));
      } else if (pathname === '/api/commit' && req.method === 'POST') {
        const body = await this.readBody(req);
        const { message, files } = JSON.parse(body);
        const hash = this.commit(message, files);
        this.serveJSON(res, { success: true, hash });
      } else if (pathname === '/api/add' && req.method === 'POST') {
        const body = await this.readBody(req);
        const { file } = JSON.parse(body);
        this.addFile(file);
        this.serveJSON(res, { success: true });
      } else if (pathname === '/api/checkout' && req.method === 'POST') {
        const body = await this.readBody(req);
        const { branch } = JSON.parse(body);
        this.checkout(branch);
        this.serveJSON(res, { success: true });
      } else if (pathname === '/api/undo' && req.method === 'POST') {
        this.undo();
        this.serveJSON(res, { success: true });
      } else if (pathname === '/api/history') {
        this.serveJSON(res, this.getHistory());
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }));
    }
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  private serveJSON(res: http.ServerResponse, data: any): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  // API Methods
  private getStatus(): any {
    const status = this.repo.status();
    const branch = this.repo.refs.getCurrentBranch();
    return {
      branch: branch || 'detached HEAD',
      staged: status.staged,
      modified: status.modified,
      untracked: status.untracked,
      deleted: status.deleted,
      clean: status.staged.length === 0 && status.modified.length === 0 &&
             status.untracked.length === 0 && status.deleted.length === 0,
    };
  }

  private getGraph(): any {
    const graph = buildGraph(this.repo, { maxCommits: 50 });
    return graph;
  }

  private getGraphHTML(): string {
    const graph = buildGraph(this.repo, { maxCommits: 50 });
    return renderGraphHTML(graph);
  }

  private getLog(): any {
    try {
      const commits = this.repo.log('HEAD', 50);
      return commits.map(commit => ({
        hash: commit.hash(),
        shortHash: commit.hash().slice(0, 8),
        message: commit.message,
        author: commit.author.name,
        email: commit.author.email,
        date: new Date(commit.author.timestamp * 1000).toISOString(),
      }));
    } catch {
      return [];
    }
  }

  private getBranches(): any {
    return this.repo.listBranches();
  }

  private getFileTreeHTML(): string {
    const tree = buildFileTree(this.repo);
    return renderFileTreeHTML(tree);
  }

  private getDiffHTML(filePath: string, mode: 'split' | 'unified'): string {
    if (!filePath) {
      return '<div class="no-diff">Select a file to view diff</div>';
    }

    try {
      // Get file content from index
      const entry = this.repo.index.get(filePath);
      const fullPath = path.join(this.repo.workDir, filePath);
      
      let oldContent = '';
      let newContent = '';

      // Try to get current content
      try {
        newContent = require('fs').readFileSync(fullPath, 'utf8');
      } catch {
        // File doesn't exist (deleted)
      }

      // Try to get indexed/committed content
      if (entry) {
        try {
          const blob = this.repo.objects.readBlob(entry.hash);
          oldContent = blob.toString();
        } catch {
          // Blob not found
        }
      }

      return renderDiffHTML(oldContent, newContent, filePath, mode);
    } catch (error) {
      return `<div class="diff-error">Error loading diff: ${error}</div>`;
    }
  }

  private getSearchHTML(query: string): string {
    if (!query) {
      return '<div class="search-empty">Enter a search query</div>';
    }

    const results = this.searchEngine.search(query);
    return renderSearchResultsHTML(results);
  }

  private getFileContent(filePath: string): any {
    if (!filePath) {
      return { error: 'No file specified' };
    }

    try {
      const fullPath = path.join(this.repo.workDir, filePath);
      const content = require('fs').readFileSync(fullPath, 'utf8');
      return { path: filePath, content };
    } catch (error) {
      return { error: 'File not found' };
    }
  }

  private addFile(file: string): void {
    if (file === '.') {
      this.repo.addAll();
    } else {
      this.repo.add(file);
    }
  }

  private commit(message: string, files?: string[]): string {
    if (files && files.length > 0) {
      for (const file of files) {
        this.repo.add(file);
      }
    }
    return this.repo.commit(message);
  }

  private checkout(branch: string): void {
    this.repo.checkout(branch);
  }

  private undo(): void {
    this.repo.journal.popEntry();
  }

  private getHistory(): any {
    const entries = this.repo.journal.history(20);
    return entries.map(entry => ({
      id: entry.id,
      operation: entry.operation,
      description: entry.description,
      timestamp: new Date(entry.timestamp).toISOString(),
    }));
  }

  /**
   * Serve the enhanced HTML dashboard
   */
  private serveHTML(res: http.ServerResponse): void {
    const repoName = path.basename(this.repo.workDir);
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>tsgit - ${repoName}</title>
  <style>
    :root {
      --bg-primary: #0d1117;
      --bg-secondary: #161b22;
      --bg-tertiary: #21262d;
      --text-primary: #c9d1d9;
      --text-secondary: #8b949e;
      --accent-green: #238636;
      --accent-green-light: #3fb950;
      --accent-red: #f85149;
      --accent-yellow: #d29922;
      --accent-blue: #58a6ff;
      --accent-purple: #a371f7;
      --border-color: #30363d;
    }
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.5;
      overflow: hidden;
      height: 100vh;
    }
    
    /* Layout */
    .app {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    
    header {
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 20px;
      flex-shrink: 0;
    }
    
    .logo {
      font-size: 20px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .logo-icon {
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, #238636, #3fb950);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .branch-badge {
      background: var(--bg-tertiary);
      color: var(--accent-blue);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
    }
    
    .branch-badge::before {
      content: '⎇ ';
    }
    
    .search-bar {
      flex: 1;
      max-width: 400px;
      position: relative;
    }
    
    .search-bar input {
      width: 100%;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 8px 12px 8px 36px;
      color: var(--text-primary);
      font-size: 14px;
    }
    
    .search-bar input:focus {
      outline: none;
      border-color: var(--accent-blue);
    }
    
    .search-bar::before {
      content: '🔍';
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      font-size: 14px;
    }
    
    .header-actions {
      display: flex;
      gap: 10px;
      margin-left: auto;
    }
    
    .main {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    
    /* Sidebar */
    .sidebar {
      width: 280px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }
    
    .sidebar-tabs {
      display: flex;
      border-bottom: 1px solid var(--border-color);
    }
    
    .sidebar-tab {
      flex: 1;
      padding: 12px;
      text-align: center;
      cursor: pointer;
      font-size: 13px;
      color: var(--text-secondary);
      transition: all 0.15s;
      border-bottom: 2px solid transparent;
    }
    
    .sidebar-tab:hover {
      color: var(--text-primary);
      background: var(--bg-tertiary);
    }
    
    .sidebar-tab.active {
      color: var(--text-primary);
      border-bottom-color: var(--accent-blue);
    }
    
    .sidebar-content {
      flex: 1;
      overflow-y: auto;
    }
    
    .sidebar-section {
      padding: 12px;
    }
    
    .sidebar-section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-secondary);
      margin-bottom: 8px;
    }
    
    /* Content Area */
    .content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    .content-tabs {
      display: flex;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      padding: 0 16px;
    }
    
    .content-tab {
      padding: 12px 16px;
      cursor: pointer;
      font-size: 13px;
      color: var(--text-secondary);
      border-bottom: 2px solid transparent;
      transition: all 0.15s;
    }
    
    .content-tab:hover {
      color: var(--text-primary);
    }
    
    .content-tab.active {
      color: var(--text-primary);
      border-bottom-color: var(--accent-blue);
    }
    
    .content-panel {
      flex: 1;
      overflow: auto;
      display: none;
    }
    
    .content-panel.active {
      display: block;
    }
    
    /* Graph Panel */
    .graph-container {
      padding: 16px;
    }
    
    .graph-row {
      display: flex;
      align-items: center;
      padding: 8px 0;
      cursor: pointer;
      border-radius: 6px;
      transition: background 0.15s;
    }
    
    .graph-row:hover {
      background: var(--bg-tertiary);
    }
    
    .graph-visual {
      flex-shrink: 0;
    }
    
    .graph-info {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      padding-left: 12px;
    }
    
    .commit-hash {
      font-family: monospace;
      color: var(--accent-blue);
      font-size: 13px;
    }
    
    .branch-tag {
      background: rgba(46, 160, 67, 0.2);
      color: var(--accent-green-light);
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
    }
    
    .tag-label {
      background: rgba(210, 153, 34, 0.2);
      color: var(--accent-yellow);
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
    }
    
    .commit-message {
      color: var(--text-primary);
      font-size: 14px;
    }
    
    .commit-meta {
      color: var(--text-secondary);
      font-size: 12px;
      margin-left: auto;
    }
    
    /* Buttons */
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.15s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    
    .btn-primary {
      background: var(--accent-green);
      color: white;
    }
    
    .btn-primary:hover {
      background: var(--accent-green-light);
    }
    
    .btn-secondary {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border-color);
    }
    
    .btn-secondary:hover {
      background: var(--border-color);
    }
    
    /* File Tree */
    .file-tree {
      font-size: 13px;
    }
    
    ${getFileTreeStyles()}
    
    /* Diff Viewer */
    ${getDiffStyles()}
    ${getWordDiffStyles()}
    
    /* Search */
    ${getSearchStyles()}
    
    /* Status List */
    .status-list {
      list-style: none;
    }
    
    .status-item {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      cursor: pointer;
      border-radius: 6px;
      transition: background 0.15s;
    }
    
    .status-item:hover {
      background: var(--bg-tertiary);
    }
    
    .status-icon {
      width: 24px;
      text-align: center;
      margin-right: 8px;
    }
    
    .status-item.staged .status-icon { color: var(--accent-green-light); }
    .status-item.modified .status-icon { color: var(--accent-yellow); }
    .status-item.untracked .status-icon { color: var(--text-secondary); }
    .status-item.deleted .status-icon { color: var(--accent-red); }
    
    .status-path {
      flex: 1;
      font-size: 13px;
    }
    
    .status-actions {
      opacity: 0;
      transition: opacity 0.15s;
    }
    
    .status-item:hover .status-actions {
      opacity: 1;
    }
    
    /* Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    
    .modal-overlay.open {
      display: flex;
    }
    
    .modal {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      width: 500px;
      max-width: 90%;
      max-height: 90%;
      overflow: hidden;
    }
    
    .modal-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .modal-title {
      font-size: 16px;
      font-weight: 600;
    }
    
    .modal-close {
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 20px;
      padding: 4px;
    }
    
    .modal-close:hover {
      color: var(--text-primary);
    }
    
    .modal-body {
      padding: 20px;
    }
    
    .modal-footer {
      padding: 16px 20px;
      border-top: 1px solid var(--border-color);
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    
    .form-group {
      margin-bottom: 16px;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      font-size: 13px;
    }
    
    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 10px 12px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 14px;
      font-family: inherit;
    }
    
    .form-group textarea {
      min-height: 120px;
      resize: vertical;
    }
    
    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: var(--accent-blue);
    }
    
    /* Toast */
    .toast-container {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2000;
    }
    
    .toast {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 12px 16px;
      margin-top: 8px;
      animation: slideIn 0.3s ease;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .toast.success {
      border-left: 3px solid var(--accent-green-light);
    }
    
    .toast.error {
      border-left: 3px solid var(--accent-red);
    }
    
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    
    /* Empty State */
    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-secondary);
    }
    
    .empty-state-icon {
      font-size: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }
    
    /* Split Pane */
    .split-pane {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    
    .split-left {
      width: 50%;
      border-right: 1px solid var(--border-color);
      overflow: auto;
    }
    
    .split-right {
      flex: 1;
      overflow: auto;
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
      background: var(--border-color);
    }
    
    /* Keyboard shortcuts hint */
    .shortcuts-hint {
      position: fixed;
      bottom: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 11px;
      color: var(--text-secondary);
    }
    
    kbd {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 3px;
      padding: 2px 6px;
      font-family: monospace;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="app">
    <header>
      <div class="logo">
        <div class="logo-icon">⚡</div>
        <span>tsgit</span>
      </div>
      <div class="branch-badge" id="branch-badge">main</div>
      <div class="search-bar">
        <input type="text" id="search-input" placeholder="Search commits, files, content... (Ctrl+P)">
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" onclick="refresh()">↻ Refresh</button>
        <button class="btn btn-secondary" onclick="undoLast()">↩ Undo</button>
        <button class="btn btn-primary" onclick="openCommitModal()">✓ Commit</button>
      </div>
    </header>
    
    <div class="main">
      <aside class="sidebar">
        <div class="sidebar-tabs">
          <div class="sidebar-tab active" data-tab="status">Status</div>
          <div class="sidebar-tab" data-tab="files">Files</div>
          <div class="sidebar-tab" data-tab="branches">Branches</div>
        </div>
        <div class="sidebar-content">
          <div id="sidebar-status" class="sidebar-panel active">
            <div class="sidebar-section">
              <div class="sidebar-section-title">Staged Changes</div>
              <ul class="status-list" id="staged-list"></ul>
            </div>
            <div class="sidebar-section">
              <div class="sidebar-section-title">Changes</div>
              <ul class="status-list" id="changes-list"></ul>
            </div>
          </div>
          <div id="sidebar-files" class="sidebar-panel" style="display:none;">
            <div class="file-tree" id="file-tree"></div>
          </div>
          <div id="sidebar-branches" class="sidebar-panel" style="display:none;">
            <ul class="status-list" id="branch-list"></ul>
          </div>
        </div>
      </aside>
      
      <main class="content">
        <div class="content-tabs">
          <div class="content-tab active" data-tab="graph">📊 Graph</div>
          <div class="content-tab" data-tab="diff">📝 Diff</div>
          <div class="content-tab" data-tab="search">🔍 Search</div>
          <div class="content-tab" data-tab="history">🕐 History</div>
        </div>
        
        <div id="panel-graph" class="content-panel active">
          <div class="graph-container" id="graph-container">
            <div class="empty-state">
              <div class="empty-state-icon">📊</div>
              <p>Loading commit graph...</p>
            </div>
          </div>
        </div>
        
        <div id="panel-diff" class="content-panel">
          <div id="diff-container">
            <div class="empty-state">
              <div class="empty-state-icon">📝</div>
              <p>Select a file from the sidebar to view diff</p>
            </div>
          </div>
        </div>
        
        <div id="panel-search" class="content-panel">
          <div id="search-results">
            <div class="empty-state">
              <div class="empty-state-icon">🔍</div>
              <p>Enter a search query in the search bar</p>
            </div>
          </div>
        </div>
        
        <div id="panel-history" class="content-panel">
          <div class="graph-container" id="history-container">
            <div class="empty-state">
              <div class="empty-state-icon">🕐</div>
              <p>Loading operation history...</p>
            </div>
          </div>
        </div>
      </main>
    </div>
    
    <div class="shortcuts-hint">
      <kbd>Ctrl+P</kbd> Search &nbsp; <kbd>Ctrl+Enter</kbd> Commit &nbsp; <kbd>R</kbd> Refresh
    </div>
  </div>
  
  <!-- Commit Modal -->
  <div class="modal-overlay" id="commit-modal">
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">Create Commit</span>
        <button class="modal-close" onclick="closeModal('commit-modal')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Commit Message</label>
          <textarea id="commit-message" placeholder="Describe your changes..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('commit-modal')">Cancel</button>
        <button class="btn btn-primary" onclick="createCommit()">Commit</button>
      </div>
    </div>
  </div>
  
  <div class="toast-container" id="toast-container"></div>
  
  <script>
    const API = '';
    let selectedFile = null;
    
    // Tab switching
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.sidebar-panel').forEach(p => p.style.display = 'none');
        tab.classList.add('active');
        document.getElementById('sidebar-' + tab.dataset.tab).style.display = 'block';
        
        if (tab.dataset.tab === 'files') loadFileTree();
        if (tab.dataset.tab === 'branches') loadBranches();
      });
    });
    
    document.querySelectorAll('.content-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.content-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.content-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
        
        if (tab.dataset.tab === 'graph') loadGraph();
        if (tab.dataset.tab === 'history') loadHistory();
      });
    });
    
    // API functions
    async function fetchAPI(endpoint, options = {}) {
      const res = await fetch(API + endpoint, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
      });
      return res.json();
    }
    
    async function fetchHTML(endpoint) {
      const res = await fetch(API + endpoint);
      return res.text();
    }
    
    // Load status
    async function loadStatus() {
      const status = await fetchAPI('/api/status');
      document.getElementById('branch-badge').textContent = status.branch;
      
      const stagedList = document.getElementById('staged-list');
      const changesList = document.getElementById('changes-list');
      
      stagedList.innerHTML = status.staged.map(f => \`
        <li class="status-item staged" onclick="selectFile('\${f}')">
          <span class="status-icon">✓</span>
          <span class="status-path">\${f}</span>
        </li>
      \`).join('') || '<li class="empty-state" style="padding:20px;">No staged changes</li>';
      
      const changes = [
        ...status.modified.map(f => ({ path: f, type: 'modified', icon: '~' })),
        ...status.untracked.map(f => ({ path: f, type: 'untracked', icon: '?' })),
        ...status.deleted.map(f => ({ path: f, type: 'deleted', icon: '✗' })),
      ];
      
      changesList.innerHTML = changes.map(f => \`
        <li class="status-item \${f.type}" onclick="selectFile('\${f.path}')">
          <span class="status-icon">\${f.icon}</span>
          <span class="status-path">\${f.path}</span>
          <div class="status-actions">
            <button class="btn btn-primary" style="padding:4px 8px;font-size:11px;" 
                    onclick="event.stopPropagation(); stageFile('\${f.path}')">Stage</button>
          </div>
        </li>
      \`).join('') || '<li class="empty-state" style="padding:20px;">Working tree clean</li>';
    }
    
    // Load graph
    async function loadGraph() {
      const html = await fetchHTML('/api/graph/html');
      document.getElementById('graph-container').innerHTML = html || '<div class="empty-state"><div class="empty-state-icon">📊</div><p>No commits yet</p></div>';
    }
    
    // Load file tree
    async function loadFileTree() {
      const html = await fetchHTML('/api/tree');
      document.getElementById('file-tree').innerHTML = html;
      
      // Add click handlers
      document.querySelectorAll('.tree-item.file').forEach(item => {
        item.addEventListener('click', () => {
          selectFile(item.dataset.path);
        });
      });
    }
    
    // Load branches
    async function loadBranches() {
      const branches = await fetchAPI('/api/branches');
      document.getElementById('branch-list').innerHTML = branches.map(b => \`
        <li class="status-item \${b.isCurrent ? 'staged' : ''}" onclick="\${b.isCurrent ? '' : "switchBranch('" + b.name + "')"}">
          <span class="status-icon">\${b.isCurrent ? '●' : '○'}</span>
          <span class="status-path">\${b.name}</span>
        </li>
      \`).join('');
    }
    
    // Load history
    async function loadHistory() {
      const history = await fetchAPI('/api/history');
      document.getElementById('history-container').innerHTML = history.length ? history.map(h => \`
        <div class="graph-row">
          <div class="graph-info">
            <span class="commit-hash">\${h.operation}</span>
            <span class="commit-message">\${h.description}</span>
            <span class="commit-meta">\${new Date(h.timestamp).toLocaleString()}</span>
          </div>
        </div>
      \`).join('') : '<div class="empty-state"><div class="empty-state-icon">🕐</div><p>No operations recorded</p></div>';
    }
    
    // Select file for diff
    async function selectFile(path) {
      selectedFile = path;
      document.querySelectorAll('.content-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.content-panel').forEach(p => p.classList.remove('active'));
      document.querySelector('[data-tab="diff"]').classList.add('active');
      document.getElementById('panel-diff').classList.add('active');
      
      const html = await fetchHTML('/api/diff?file=' + encodeURIComponent(path));
      document.getElementById('diff-container').innerHTML = html;
    }
    
    // Stage file
    async function stageFile(file) {
      await fetchAPI('/api/add', { method: 'POST', body: JSON.stringify({ file }) });
      showToast('Staged: ' + file, 'success');
      loadStatus();
    }
    
    // Switch branch
    async function switchBranch(branch) {
      await fetchAPI('/api/checkout', { method: 'POST', body: JSON.stringify({ branch }) });
      showToast('Switched to: ' + branch, 'success');
      refresh();
    }
    
    // Commit
    function openCommitModal() {
      document.getElementById('commit-modal').classList.add('open');
      document.getElementById('commit-message').focus();
    }
    
    function closeModal(id) {
      document.getElementById(id).classList.remove('open');
    }
    
    async function createCommit() {
      const message = document.getElementById('commit-message').value.trim();
      if (!message) { showToast('Enter a commit message', 'error'); return; }
      
      try {
        const result = await fetchAPI('/api/commit', { method: 'POST', body: JSON.stringify({ message }) });
        showToast('Committed: ' + result.hash.slice(0, 8), 'success');
        closeModal('commit-modal');
        document.getElementById('commit-message').value = '';
        refresh();
      } catch (e) {
        showToast('Commit failed', 'error');
      }
    }
    
    // Undo
    async function undoLast() {
      try {
        await fetchAPI('/api/undo', { method: 'POST' });
        showToast('Undone last operation', 'success');
        refresh();
      } catch (e) {
        showToast('Nothing to undo', 'error');
      }
    }
    
    // Search
    let searchTimeout;
    document.getElementById('search-input').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => performSearch(e.target.value), 300);
    });
    
    async function performSearch(query) {
      if (!query) return;
      
      document.querySelectorAll('.content-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.content-panel').forEach(p => p.classList.remove('active'));
      document.querySelector('[data-tab="search"]').classList.add('active');
      document.getElementById('panel-search').classList.add('active');
      
      const html = await fetchHTML('/api/search?q=' + encodeURIComponent(query));
      document.getElementById('search-results').innerHTML = html;
    }
    
    // Refresh
    function refresh() {
      loadStatus();
      loadGraph();
    }
    
    // Toast
    function showToast(message, type = 'success') {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = 'toast ' + type;
      toast.innerHTML = message;
      container.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        document.getElementById('search-input').focus();
      }
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        openCommitModal();
      }
      if (e.key === 'r' || e.key === 'R') {
        refresh();
        showToast('Refreshed', 'success');
      }
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
      }
    });
    
    // Initial load
    loadStatus();
    loadGraph();
  </script>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  /**
   * Start server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        console.log(`\n🚀 tsgit Enhanced Web UI is running!\n`);
        console.log(`   Open in browser: \x1b[36mhttp://localhost:${this.port}\x1b[0m`);
        console.log(`\n   Features:`);
        console.log(`   • Commit graph visualization`);
        console.log(`   • Side-by-side diff viewer`);
        console.log(`   • File tree browser`);
        console.log(`   • Search (commits, files, content)`);
        console.log(`   • Operation history with undo`);
        console.log(`\n   Press Ctrl+C to stop\n`);
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  stop(): void {
    this.server.close();
  }
}

/**
 * Launch enhanced Web UI
 */
export async function launchEnhancedWebUI(port: number = DEFAULT_PORT): Promise<void> {
  try {
    const repo = Repository.find();
    const webUI = new EnhancedWebUI(repo, port);
    await webUI.start();
    
    process.on('SIGINT', () => {
      console.log('\nShutting down...');
      webUI.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}
