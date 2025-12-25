/**
 * Ultimate Web UI for tsgit
 * Best-in-class dashboard integrating all UI components
 */

import * as http from 'http';
import * as path from 'path';
import * as url from 'url';
import { Repository } from '../core/repository';
import { buildGraph, renderGraphHTML } from './graph';
import { renderDiffHTML, getDiffStyles, getWordDiffStyles } from './diff-viewer';
import { buildFileTree, renderFileTreeHTML, getFileTreeStyles } from './file-tree';
import { SearchEngine, renderSearchResultsHTML, getSearchStyles } from './search';
import { generateThemeCSS, getTheme, getThemeNames, Theme } from './themes';
import { getCommandPaletteStyles } from './command-palette';
import { generateBlame, renderBlameHTML, getBlameStyles } from './blame-view';
import { calculateStats, renderStatsDashboardHTML, renderTimelineHTML, getTimelineStyles } from './timeline';
import { getKeyboardHelpStyles, getDefaultShortcuts, renderKeyboardHelpHTML } from './keyboard';
import { getConflictResolverStyles } from './conflict-resolver';
import { getVirtualScrollStyles, getListStyles } from './virtual-scroll';
import { getStashStyles } from './stash';
import { compareBranches, renderBranchComparisonHTML, getBranchCompareStyles } from './branch-compare';

const DEFAULT_PORT = 3847;

/**
 * Ultimate Web UI Server
 */
export class UltimateWebUI {
  private server: http.Server;
  private repo: Repository;
  private port: number;
  private searchEngine: SearchEngine;
  private currentTheme: Theme;

  constructor(repo: Repository, port: number = DEFAULT_PORT) {
    this.repo = repo;
    this.port = port;
    this.searchEngine = new SearchEngine(repo);
    this.currentTheme = getTheme('github-dark');
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
      switch (pathname) {
        case '/':
          this.serveHTML(res);
          break;
        case '/api/status':
          this.serveJSON(res, this.getStatus());
          break;
        case '/api/graph':
          this.serveJSON(res, this.getGraph());
          break;
        case '/api/graph/html':
          this.serveText(res, this.getGraphHTML(), 'text/html');
          break;
        case '/api/log':
          this.serveJSON(res, this.getLog());
          break;
        case '/api/branches':
          this.serveJSON(res, this.getBranches());
          break;
        case '/api/tree':
          this.serveText(res, this.getFileTreeHTML(), 'text/html');
          break;
        case '/api/diff':
          const file = parsedUrl.query.file as string;
          const mode = (parsedUrl.query.mode as string) || 'split';
          this.serveText(res, this.getDiffHTML(file, mode as any), 'text/html');
          break;
        case '/api/blame':
          const blamePath = parsedUrl.query.file as string;
          this.serveText(res, this.getBlameHTML(blamePath), 'text/html');
          break;
        case '/api/search':
          const query = parsedUrl.query.q as string || '';
          this.serveText(res, this.getSearchHTML(query), 'text/html');
          break;
        case '/api/stats':
          this.serveText(res, this.getStatsHTML(), 'text/html');
          break;
        case '/api/timeline':
          this.serveText(res, this.getTimelineHTMLResponse(), 'text/html');
          break;
        case '/api/compare':
          const base = parsedUrl.query.base as string;
          const compare = parsedUrl.query.compare as string;
          this.serveText(res, this.getCompareHTML(base, compare), 'text/html');
          break;
        case '/api/themes':
          this.serveJSON(res, getThemeNames());
          break;
        case '/api/keyboard':
          this.serveText(res, this.getKeyboardHelpHTMLResponse(), 'text/html');
          break;
        case '/api/file':
          const filePath = parsedUrl.query.path as string;
          this.serveJSON(res, this.getFileContent(filePath));
          break;
        case '/api/history':
          this.serveJSON(res, this.getHistory());
          break;
        case '/api/commit':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { message, files } = JSON.parse(body);
            const hash = this.commit(message, files);
            this.serveJSON(res, { success: true, hash });
          }
          break;
        case '/api/add':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { file: addFile } = JSON.parse(body);
            this.addFile(addFile);
            this.serveJSON(res, { success: true });
          }
          break;
        case '/api/checkout':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { branch } = JSON.parse(body);
            this.checkout(branch);
            this.serveJSON(res, { success: true });
          }
          break;
        case '/api/undo':
          if (req.method === 'POST') {
            this.undo();
            this.serveJSON(res, { success: true });
          }
          break;
        case '/api/theme':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { theme } = JSON.parse(body);
            this.currentTheme = getTheme(theme);
            this.serveJSON(res, { success: true, theme: this.currentTheme.name });
          }
          break;
        default:
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

  private serveText(res: http.ServerResponse, data: string, contentType: string): void {
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
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
    return buildGraph(this.repo, { maxCommits: 50 });
  }

  private getGraphHTML(): string {
    const graph = buildGraph(this.repo, { maxCommits: 50 });
    return renderGraphHTML(graph) || '<div class="empty-state"><p>No commits yet</p></div>';
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
      return '<div class="empty-state">Select a file to view diff</div>';
    }

    try {
      const entry = this.repo.index.get(filePath);
      const fullPath = path.join(this.repo.workDir, filePath);
      
      let oldContent = '';
      let newContent = '';

      try {
        newContent = require('fs').readFileSync(fullPath, 'utf8');
      } catch {}

      if (entry) {
        try {
          const blob = this.repo.objects.readBlob(entry.hash);
          oldContent = blob.toString();
        } catch {}
      }

      return renderDiffHTML(oldContent, newContent, filePath, mode);
    } catch (error) {
      return `<div class="error">Error loading diff: ${error}</div>`;
    }
  }

  private getBlameHTML(filePath: string): string {
    if (!filePath) {
      return '<div class="empty-state">Select a file to view blame</div>';
    }

    try {
      const blame = generateBlame(this.repo, filePath);
      return renderBlameHTML(blame);
    } catch (error) {
      return `<div class="error">Error loading blame: ${error}</div>`;
    }
  }

  private getSearchHTML(query: string): string {
    if (!query) {
      return '<div class="empty-state">Enter a search query</div>';
    }
    const results = this.searchEngine.search(query);
    return renderSearchResultsHTML(results);
  }

  private getStatsHTML(): string {
    const stats = calculateStats(this.repo);
    return renderStatsDashboardHTML(stats);
  }

  private getTimelineHTMLResponse(): string {
    try {
      const commits = this.repo.log('HEAD', 30);
      return renderTimelineHTML(commits);
    } catch {
      return '<div class="empty-state">No commits yet</div>';
    }
  }

  private getCompareHTML(base: string, compare: string): string {
    if (!base || !compare) {
      return '<div class="empty-state">Select branches to compare</div>';
    }
    const comparison = compareBranches(this.repo, base, compare);
    return renderBranchComparisonHTML(comparison);
  }

  private getKeyboardHelpHTMLResponse(): string {
    const shortcuts = getDefaultShortcuts({});
    return renderKeyboardHelpHTML(shortcuts);
  }

  private getFileContent(filePath: string): any {
    if (!filePath) {
      return { error: 'No file specified' };
    }
    try {
      const fullPath = path.join(this.repo.workDir, filePath);
      const content = require('fs').readFileSync(fullPath, 'utf8');
      return { path: filePath, content };
    } catch {
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
   * Generate all component styles
   */
  private getAllStyles(): string {
    return `
      ${generateThemeCSS(this.currentTheme)}
      
      /* Reset */
      *, *::before, *::after { box-sizing: border-box; }
      
      body {
        font-family: var(--font-family);
        font-size: var(--font-size-base);
        line-height: var(--line-height);
        color: var(--text-primary);
        background: var(--bg-primary);
        margin: 0;
        overflow: hidden;
        height: 100vh;
      }

      /* Scrollbar */
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-track { background: var(--bg-primary); }
      ::-webkit-scrollbar-thumb { background: var(--bg-tertiary); border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: var(--border-default); }

      /* Buttons */
      .btn {
        display: inline-flex;
        align-items: center;
        gap: var(--spacing-xs);
        padding: var(--spacing-sm) var(--spacing-md);
        font-family: inherit;
        font-size: var(--font-size-sm);
        font-weight: 500;
        border: none;
        border-radius: var(--border-radius);
        cursor: pointer;
        transition: all var(--transition-fast);
      }
      .btn:focus { outline: 2px solid var(--border-focus); outline-offset: 2px; }
      .btn-primary { background: var(--accent-success); color: var(--text-inverse); }
      .btn-primary:hover { filter: brightness(1.1); }
      .btn-secondary { background: var(--bg-tertiary); color: var(--text-primary); border: 1px solid var(--border-default); }
      .btn-secondary:hover { background: var(--border-default); }

      /* Empty state */
      .empty-state { text-align: center; padding: var(--spacing-xxl); color: var(--text-muted); }

      /* Component styles */
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

  /**
   * Serve the ultimate HTML dashboard
   */
  private serveHTML(res: http.ServerResponse): void {
    const repoName = path.basename(this.repo.workDir);
    const themeNames = getThemeNames();
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>tsgit - ${repoName}</title>
  <style>
    ${this.getAllStyles()}
    
    /* App Layout */
    .app { display: flex; flex-direction: column; height: 100vh; }
    
    header {
      display: flex;
      align-items: center;
      gap: var(--spacing-lg);
      padding: var(--spacing-sm) var(--spacing-lg);
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-default);
      flex-shrink: 0;
    }
    
    .logo {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      font-size: var(--font-size-lg);
      font-weight: 700;
    }
    
    .logo-icon {
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, var(--accent-success), var(--accent-primary));
      border-radius: var(--border-radius);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }
    
    .branch-badge {
      background: var(--bg-tertiary);
      color: var(--accent-success);
      padding: var(--spacing-xs) var(--spacing-md);
      border-radius: var(--border-radius-full);
      font-size: var(--font-size-sm);
      font-weight: 500;
    }
    
    .search-bar {
      flex: 1;
      max-width: 400px;
      position: relative;
    }
    
    .search-bar input {
      width: 100%;
      padding: var(--spacing-sm) var(--spacing-md) var(--spacing-sm) 36px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--border-radius);
      color: var(--text-primary);
      font-size: var(--font-size-sm);
    }
    
    .search-bar input:focus {
      outline: none;
      border-color: var(--border-focus);
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
      gap: var(--spacing-sm);
      margin-left: auto;
    }
    
    .theme-select {
      padding: var(--spacing-xs) var(--spacing-sm);
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--border-radius);
      color: var(--text-primary);
      font-size: var(--font-size-sm);
      cursor: pointer;
    }
    
    .main {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    
    .sidebar {
      width: 280px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border-default);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }
    
    .sidebar-tabs {
      display: flex;
      border-bottom: 1px solid var(--border-default);
    }
    
    .sidebar-tab {
      flex: 1;
      padding: var(--spacing-sm);
      text-align: center;
      cursor: pointer;
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
      border-bottom: 2px solid transparent;
      transition: all var(--transition-fast);
    }
    
    .sidebar-tab:hover { color: var(--text-primary); background: var(--bg-tertiary); }
    .sidebar-tab.active { color: var(--text-primary); border-bottom-color: var(--accent-primary); }
    
    .sidebar-content { flex: 1; overflow-y: auto; }
    .sidebar-panel { display: none; }
    .sidebar-panel.active { display: block; }
    
    .sidebar-section { padding: var(--spacing-md); }
    .sidebar-section-title {
      font-size: var(--font-size-xs);
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: var(--spacing-sm);
      letter-spacing: 0.5px;
    }
    
    .content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    .content-tabs {
      display: flex;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-default);
      padding: 0 var(--spacing-md);
    }
    
    .content-tab {
      padding: var(--spacing-sm) var(--spacing-md);
      cursor: pointer;
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
      border-bottom: 2px solid transparent;
      transition: all var(--transition-fast);
    }
    
    .content-tab:hover { color: var(--text-primary); }
    .content-tab.active { color: var(--text-primary); border-bottom-color: var(--accent-primary); }
    
    .content-panel { flex: 1; overflow: auto; display: none; padding: var(--spacing-md); }
    .content-panel.active { display: block; }
    
    .status-list { list-style: none; padding: 0; margin: 0; }
    .status-item {
      display: flex;
      align-items: center;
      padding: var(--spacing-sm) var(--spacing-md);
      cursor: pointer;
      border-radius: var(--border-radius);
      transition: background var(--transition-fast);
    }
    .status-item:hover { background: var(--bg-tertiary); }
    .status-icon { width: 20px; text-align: center; margin-right: var(--spacing-sm); font-weight: 600; }
    .status-item.staged .status-icon { color: var(--git-added); }
    .status-item.modified .status-icon { color: var(--git-modified); }
    .status-item.untracked .status-icon { color: var(--git-untracked); }
    .status-item.deleted .status-icon { color: var(--git-deleted); }
    .status-path { flex: 1; font-size: var(--font-size-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .status-actions { opacity: 0; transition: opacity var(--transition-fast); }
    .status-item:hover .status-actions { opacity: 1; }
    
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: var(--bg-overlay);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal-overlay.open { display: flex; }
    .modal {
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      border-radius: var(--border-radius-lg);
      width: 500px;
      max-width: 90vw;
      max-height: 90vh;
      overflow: hidden;
    }
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-md) var(--spacing-lg);
      border-bottom: 1px solid var(--border-default);
    }
    .modal-title { font-size: var(--font-size-lg); font-weight: 600; }
    .modal-close { background: none; border: none; color: var(--text-secondary); cursor: pointer; font-size: 24px; }
    .modal-close:hover { color: var(--text-primary); }
    .modal-body { padding: var(--spacing-lg); max-height: 60vh; overflow-y: auto; }
    .modal-footer { display: flex; justify-content: flex-end; gap: var(--spacing-sm); padding: var(--spacing-md) var(--spacing-lg); border-top: 1px solid var(--border-default); }
    
    .form-group { margin-bottom: var(--spacing-md); }
    .form-group label { display: block; margin-bottom: var(--spacing-xs); font-weight: 500; font-size: var(--font-size-sm); }
    .form-group input, .form-group textarea {
      width: 100%;
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: var(--border-radius);
      color: var(--text-primary);
      font-family: inherit;
      font-size: var(--font-size-base);
    }
    .form-group textarea { min-height: 100px; resize: vertical; }
    .form-group input:focus, .form-group textarea:focus { outline: none; border-color: var(--border-focus); }
    
    .toast-container { position: fixed; bottom: var(--spacing-lg); right: var(--spacing-lg); z-index: 2000; }
    .toast {
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      border-radius: var(--border-radius);
      padding: var(--spacing-sm) var(--spacing-md);
      margin-top: var(--spacing-sm);
      animation: slideIn 0.3s ease;
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
    }
    .toast.success { border-left: 3px solid var(--accent-success); }
    .toast.error { border-left: 3px solid var(--accent-danger); }
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    
    .shortcuts-bar {
      position: fixed;
      bottom: var(--spacing-sm);
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--border-radius);
      padding: var(--spacing-xs) var(--spacing-md);
      font-size: var(--font-size-xs);
      color: var(--text-muted);
      display: flex;
      gap: var(--spacing-md);
    }
    .shortcuts-bar kbd {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-default);
      border-radius: 3px;
      padding: 1px 4px;
      font-family: var(--font-family-mono);
      font-size: 10px;
      margin-right: 4px;
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
        <input type="text" id="search-input" placeholder="Search (Ctrl+P)">
      </div>
      <div class="header-actions">
        <select class="theme-select" id="theme-select" onchange="changeTheme(this.value)">
          ${themeNames.map(t => `<option value="${t}" ${t === this.currentTheme.name ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <button class="btn btn-secondary" onclick="showKeyboardHelp()">?</button>
        <button class="btn btn-secondary" onclick="refresh()">↻</button>
        <button class="btn btn-secondary" onclick="undoLast()">↩</button>
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
              <div class="sidebar-section-title">Staged</div>
              <ul class="status-list" id="staged-list"></ul>
            </div>
            <div class="sidebar-section">
              <div class="sidebar-section-title">Changes</div>
              <ul class="status-list" id="changes-list"></ul>
            </div>
          </div>
          <div id="sidebar-files" class="sidebar-panel">
            <div class="file-tree" id="file-tree"></div>
          </div>
          <div id="sidebar-branches" class="sidebar-panel">
            <ul class="status-list" id="branch-list"></ul>
          </div>
        </div>
      </aside>
      
      <main class="content">
        <div class="content-tabs">
          <div class="content-tab active" data-tab="graph">📊 Graph</div>
          <div class="content-tab" data-tab="diff">📝 Diff</div>
          <div class="content-tab" data-tab="blame">👤 Blame</div>
          <div class="content-tab" data-tab="timeline">📅 Timeline</div>
          <div class="content-tab" data-tab="stats">📈 Stats</div>
          <div class="content-tab" data-tab="compare">🔀 Compare</div>
          <div class="content-tab" data-tab="search">🔍 Search</div>
        </div>
        
        <div id="panel-graph" class="content-panel active">
          <div id="graph-container"></div>
        </div>
        <div id="panel-diff" class="content-panel">
          <div id="diff-container"></div>
        </div>
        <div id="panel-blame" class="content-panel">
          <div id="blame-container"></div>
        </div>
        <div id="panel-timeline" class="content-panel">
          <div id="timeline-container"></div>
        </div>
        <div id="panel-stats" class="content-panel">
          <div id="stats-container"></div>
        </div>
        <div id="panel-compare" class="content-panel">
          <div style="padding:var(--spacing-md);display:flex;gap:var(--spacing-md);margin-bottom:var(--spacing-md);">
            <select id="compare-base" class="theme-select"></select>
            <span style="color:var(--text-muted);">←</span>
            <select id="compare-target" class="theme-select"></select>
            <button class="btn btn-primary" onclick="compareBranches()">Compare</button>
          </div>
          <div id="compare-container"></div>
        </div>
        <div id="panel-search" class="content-panel">
          <div id="search-results"></div>
        </div>
      </main>
    </div>
    
    <div class="shortcuts-bar">
      <span><kbd>Ctrl+P</kbd> Search</span>
      <span><kbd>Ctrl+Enter</kbd> Commit</span>
      <span><kbd>R</kbd> Refresh</span>
      <span><kbd>?</kbd> Help</span>
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
  
  <!-- Keyboard Help Modal -->
  <div class="modal-overlay" id="keyboard-modal">
    <div class="modal" style="width:600px;">
      <div class="modal-header">
        <span class="modal-title">Keyboard Shortcuts</span>
        <button class="modal-close" onclick="closeModal('keyboard-modal')">&times;</button>
      </div>
      <div class="modal-body" id="keyboard-content"></div>
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
        document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('sidebar-' + tab.dataset.tab).classList.add('active');
        
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
        if (tab.dataset.tab === 'timeline') loadTimeline();
        if (tab.dataset.tab === 'stats') loadStats();
        if (tab.dataset.tab === 'compare') loadCompareSelectors();
      });
    });
    
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
    
    async function loadStatus() {
      const status = await fetchAPI('/api/status');
      document.getElementById('branch-badge').textContent = status.branch;
      
      document.getElementById('staged-list').innerHTML = status.staged.map(f =>
        '<li class="status-item staged" onclick="selectFile(\\'' + f + '\\')">' +
        '<span class="status-icon">✓</span><span class="status-path">' + f + '</span></li>'
      ).join('') || '<li class="empty-state" style="padding:var(--spacing-md);">No staged files</li>';
      
      const changes = [
        ...status.modified.map(f => ({ path: f, type: 'modified', icon: '~' })),
        ...status.untracked.map(f => ({ path: f, type: 'untracked', icon: '?' })),
        ...status.deleted.map(f => ({ path: f, type: 'deleted', icon: '✗' })),
      ];
      
      document.getElementById('changes-list').innerHTML = changes.map(f =>
        '<li class="status-item ' + f.type + '" onclick="selectFile(\\'' + f.path + '\\')">' +
        '<span class="status-icon">' + f.icon + '</span>' +
        '<span class="status-path">' + f.path + '</span>' +
        '<div class="status-actions"><button class="btn btn-primary" style="padding:2px 8px;font-size:11px;" onclick="event.stopPropagation();stageFile(\\'' + f.path + '\\')">Stage</button></div></li>'
      ).join('') || '<li class="empty-state" style="padding:var(--spacing-md);">Working tree clean</li>';
    }
    
    async function loadGraph() {
      const html = await fetchHTML('/api/graph/html');
      document.getElementById('graph-container').innerHTML = html || '<div class="empty-state">No commits yet</div>';
    }
    
    async function loadFileTree() {
      const html = await fetchHTML('/api/tree');
      document.getElementById('file-tree').innerHTML = html;
    }
    
    async function loadBranches() {
      const branches = await fetchAPI('/api/branches');
      document.getElementById('branch-list').innerHTML = branches.map(b =>
        '<li class="status-item ' + (b.isCurrent ? 'staged' : '') + '" onclick="switchBranch(\\'' + b.name + '\\')">' +
        '<span class="status-icon">' + (b.isCurrent ? '●' : '○') + '</span>' +
        '<span class="status-path">' + b.name + '</span></li>'
      ).join('');
      
      // Also update compare selectors
      loadCompareSelectors();
    }
    
    async function loadCompareSelectors() {
      const branches = await fetchAPI('/api/branches');
      const base = document.getElementById('compare-base');
      const target = document.getElementById('compare-target');
      
      const options = branches.map(b => '<option value="' + b.name + '">' + b.name + '</option>').join('');
      base.innerHTML = options;
      target.innerHTML = options;
      
      if (branches.length > 1) {
        target.selectedIndex = 1;
      }
    }
    
    async function loadTimeline() {
      const html = await fetchHTML('/api/timeline');
      document.getElementById('timeline-container').innerHTML = html;
    }
    
    async function loadStats() {
      const html = await fetchHTML('/api/stats');
      document.getElementById('stats-container').innerHTML = html;
    }
    
    async function selectFile(path) {
      selectedFile = path;
      document.querySelectorAll('.content-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.content-panel').forEach(p => p.classList.remove('active'));
      document.querySelector('[data-tab="diff"]').classList.add('active');
      document.getElementById('panel-diff').classList.add('active');
      
      const html = await fetchHTML('/api/diff?file=' + encodeURIComponent(path));
      document.getElementById('diff-container').innerHTML = html;
    }
    
    async function selectBlame(path) {
      selectedFile = path;
      document.querySelectorAll('.content-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.content-panel').forEach(p => p.classList.remove('active'));
      document.querySelector('[data-tab="blame"]').classList.add('active');
      document.getElementById('panel-blame').classList.add('active');
      
      const html = await fetchHTML('/api/blame?file=' + encodeURIComponent(path));
      document.getElementById('blame-container').innerHTML = html;
    }
    
    async function stageFile(file) {
      await fetchAPI('/api/add', { method: 'POST', body: JSON.stringify({ file }) });
      showToast('Staged: ' + file, 'success');
      loadStatus();
    }
    
    async function switchBranch(branch) {
      await fetchAPI('/api/checkout', { method: 'POST', body: JSON.stringify({ branch }) });
      showToast('Switched to: ' + branch, 'success');
      refresh();
    }
    
    async function compareBranches() {
      const base = document.getElementById('compare-base').value;
      const target = document.getElementById('compare-target').value;
      const html = await fetchHTML('/api/compare?base=' + encodeURIComponent(base) + '&compare=' + encodeURIComponent(target));
      document.getElementById('compare-container').innerHTML = html;
    }
    
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
    
    async function undoLast() {
      try {
        await fetchAPI('/api/undo', { method: 'POST' });
        showToast('Undone', 'success');
        refresh();
      } catch (e) {
        showToast('Nothing to undo', 'error');
      }
    }
    
    async function changeTheme(theme) {
      await fetchAPI('/api/theme', { method: 'POST', body: JSON.stringify({ theme }) });
      location.reload();
    }
    
    async function showKeyboardHelp() {
      const html = await fetchHTML('/api/keyboard');
      document.getElementById('keyboard-content').innerHTML = html;
      document.getElementById('keyboard-modal').classList.add('open');
    }
    
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
    
    function refresh() {
      loadStatus();
      loadGraph();
    }
    
    function showToast(message, type = 'success') {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = 'toast ' + type;
      toast.textContent = message;
      container.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') e.target.blur();
        return;
      }
      
      if (e.ctrlKey && e.key === 'p') { e.preventDefault(); document.getElementById('search-input').focus(); }
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); openCommitModal(); }
      if (e.key === 'r' || e.key === 'R') { refresh(); showToast('Refreshed', 'success'); }
      if (e.key === '?') { showKeyboardHelp(); }
      if (e.key === 'Escape') { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open')); }
    });
    
    // Initialize
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
        console.log(`\n🚀 tsgit Ultimate Web UI is running!\n`);
        console.log(`   Open in browser: \x1b[36mhttp://localhost:${this.port}\x1b[0m`);
        console.log(`\n   Features:`);
        console.log(`   • 7 beautiful themes (GitHub Dark/Light, Dracula, Nord, etc.)`);
        console.log(`   • Interactive commit graph`);
        console.log(`   • Side-by-side diff viewer with syntax highlighting`);
        console.log(`   • Git blame visualization`);
        console.log(`   • Activity timeline & contribution heatmap`);
        console.log(`   • Repository statistics dashboard`);
        console.log(`   • Branch comparison view`);
        console.log(`   • Full-text search (commits, files, content)`);
        console.log(`   • Comprehensive keyboard shortcuts`);
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
 * Launch ultimate Web UI
 */
export async function launchUltimateWebUI(port: number = DEFAULT_PORT): Promise<void> {
  try {
    const repo = Repository.find();
    const webUI = new UltimateWebUI(repo, port);
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
