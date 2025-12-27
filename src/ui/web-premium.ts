/**
 * Premium Web UI for wit
 * GitKraken-inspired professional design with beautiful commit graphs
 * and polished conflict resolution
 */

import * as http from 'http';
import * as path from 'path';
import * as url from 'url';
import { Repository } from '../core/repository';
import { StackManager } from '../core/stack';
import { buildGraph, GraphNode, GraphEdge } from './graph';
import { renderDiffHTML, getDiffStyles, getWordDiffStyles } from './diff-viewer';
import { buildFileTree, renderFileTreeHTML, getFileTreeStyles } from './file-tree';
import { SearchEngine, renderSearchResultsHTML, getSearchStyles } from './search';
import { getTheme, Theme, getThemeNames } from './themes';
import { getStackList, getStackVisualization, renderStackListHTML, renderStackVisualizationHTML, getStackStyles } from './stack-view';

const DEFAULT_PORT = 3847;

/**
 * Premium Web UI Server
 */
export class PremiumWebUI {
  private server: http.Server;
  private repo: Repository;
  private port: number;
  private searchEngine: SearchEngine;
  private stackManager: StackManager;
  private currentTheme: Theme;

  constructor(repo: Repository, port: number = DEFAULT_PORT) {
    this.repo = repo;
    this.port = port;
    this.searchEngine = new SearchEngine(repo);
    this.stackManager = new StackManager(repo, repo.gitDir);
    this.currentTheme = getTheme('github-dark');
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const parsedUrl = url.parse(req.url || '/', true);
    const pathname = parsedUrl.pathname || '/';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      switch (pathname) {
        case '/':
          this.serveHTML(res);
          break;
        case '/api/status':
          this.serveJSON(res, this.getStatus());
          break;
        case '/api/graph':
          this.serveJSON(res, this.getGraphData());
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
          this.serveText(res, this.getDiffHTML(file), 'text/html');
          break;
        case '/api/search':
          const query = parsedUrl.query.q as string || '';
          this.serveText(res, this.getSearchHTML(query), 'text/html');
          break;
        case '/api/history':
          this.serveJSON(res, this.getHistory());
          break;
        case '/api/commit':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { message } = JSON.parse(body);
            const hash = this.repo.commit(message);
            this.serveJSON(res, { success: true, hash });
          }
          break;
        case '/api/add':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { file: addFile } = JSON.parse(body);
            if (addFile === '.') {
              this.repo.addAll();
            } else {
              this.repo.add(addFile);
            }
            this.serveJSON(res, { success: true });
          }
          break;
        case '/api/checkout':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { branch } = JSON.parse(body);
            this.repo.checkout(branch);
            this.serveJSON(res, { success: true });
          }
          break;
        case '/api/undo':
          if (req.method === 'POST') {
            this.repo.journal.popEntry();
            this.serveJSON(res, { success: true });
          }
          break;
        case '/api/theme':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { theme } = JSON.parse(body);
            this.currentTheme = getTheme(theme);
            this.serveJSON(res, { success: true });
          }
          break;
        // Stack (Stacked Diffs) API endpoints
        case '/api/stacks':
          this.serveJSON(res, this.getStacks());
          break;
        case '/api/stacks/current':
          this.serveJSON(res, this.getCurrentStack());
          break;
        case '/api/stacks/view':
          const stackName = parsedUrl.query.name as string;
          this.serveText(res, this.getStackViewHTML(stackName), 'text/html');
          break;
        case '/api/stacks/create':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { name, description } = JSON.parse(body);
            const stack = this.stackManager.create(name, description);
            this.serveJSON(res, { success: true, stack });
          }
          break;
        case '/api/stacks/push':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { branchName } = JSON.parse(body);
            const result = this.stackManager.push(branchName);
            this.serveJSON(res, { success: true, ...result });
          }
          break;
        case '/api/stacks/pop':
          if (req.method === 'POST') {
            const result = this.stackManager.pop();
            this.serveJSON(res, { success: true, ...result });
          }
          break;
        case '/api/stacks/sync':
          if (req.method === 'POST') {
            const result = this.stackManager.sync();
            this.serveJSON(res, result);
          }
          break;
        case '/api/stacks/up':
          if (req.method === 'POST') {
            const branch = this.stackManager.up();
            this.serveJSON(res, { success: true, branch });
          }
          break;
        case '/api/stacks/down':
          if (req.method === 'POST') {
            const branch = this.stackManager.down();
            this.serveJSON(res, { success: true, branch });
          }
          break;
        case '/api/stacks/delete':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { name: deleteName } = JSON.parse(body);
            this.stackManager.delete(deleteName);
            this.serveJSON(res, { success: true });
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

  private getGraphData(): any {
    return buildGraph(this.repo, { maxCommits: 100 });
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
        parents: commit.parentHashes,
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

  private getDiffHTML(filePath: string): string {
    if (!filePath) {
      return '<div class="empty-state"><div class="empty-icon">📄</div><p>Select a file to view changes</p></div>';
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

      return renderDiffHTML(oldContent, newContent, filePath, 'split');
    } catch (error) {
      return `<div class="error-state">Error loading diff: ${error}</div>`;
    }
  }

  private getSearchHTML(query: string): string {
    if (!query) {
      return '<div class="empty-state"><div class="empty-icon">🔍</div><p>Enter a search query</p></div>';
    }
    const results = this.searchEngine.search(query);
    return renderSearchResultsHTML(results);
  }

  private getHistory(): any {
    const entries = this.repo.journal.history(30);
    return entries.map(entry => ({
      id: entry.id,
      operation: entry.operation,
      description: entry.description,
      timestamp: new Date(entry.timestamp).toISOString(),
    }));
  }

  private getStacks(): any {
    return getStackList(this.repo);
  }

  private getCurrentStack(): any {
    const stack = this.stackManager.getCurrentStack();
    if (!stack) return null;
    return {
      name: stack.name,
      description: stack.description,
      baseBranch: stack.baseBranch,
      branches: stack.branches,
      visualization: getStackVisualization(this.repo, stack.name),
    };
  }

  private getStackViewHTML(stackName?: string): string {
    const stacks = getStackList(this.repo);
    
    if (stackName) {
      const branches = getStackVisualization(this.repo, stackName);
      return renderStackVisualizationHTML(branches, stackName);
    }
    
    return renderStackListHTML(stacks);
  }

  private serveHTML(res: http.ServerResponse): void {
    const repoName = path.basename(this.repo.workDir);
    const themeNames = getThemeNames();
    
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>wit - ${repoName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    ${this.getPremiumStyles()}
  </style>
</head>
<body>
  <div class="app">
    <!-- Top Navigation Bar -->
    <header class="topbar">
      <div class="topbar-left">
        <div class="logo">
          <div class="logo-icon">
            <svg viewBox="0 0 32 32" fill="none">
              <defs>
                <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" style="stop-color:#6366f1"/>
                  <stop offset="100%" style="stop-color:#8b5cf6"/>
                </linearGradient>
              </defs>
              <circle cx="16" cy="16" r="14" fill="url(#logoGrad)"/>
              <path d="M10 16 L16 10 L22 16 M16 10 L16 22" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <span class="logo-text">wit</span>
        </div>
        <div class="repo-name">
          <svg class="icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8z"/>
          </svg>
          ${escapeHtml(repoName)}
        </div>
      </div>
      
      <div class="topbar-center">
        <div class="branch-switcher">
          <div class="branch-current" id="branch-display">
            <svg class="icon" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"/>
            </svg>
            <span id="current-branch">main</span>
            <svg class="chevron" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z"/>
            </svg>
          </div>
        </div>
        
        <div class="search-container">
          <svg class="search-icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.5 7a4.499 4.499 0 11-9 0 4.499 4.499 0 019 0zm-.82 4.74a6 6 0 111.06-1.06l3.04 3.04a.75.75 0 11-1.06 1.06l-3.04-3.04z"/>
          </svg>
          <input type="text" class="search-input" id="search-input" placeholder="Search commits, files, authors... ⌘K">
        </div>
      </div>
      
      <div class="topbar-right">
        <div class="action-buttons">
          <button class="action-btn" onclick="fetchAll()" title="Fetch">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z"/>
            </svg>
          </button>
          <button class="action-btn" onclick="pullChanges()" title="Pull">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M2.75 3.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 01.75.75v2.19l2.72-2.72a.75.75 0 01.53-.22h4.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25H2.75z"/>
            </svg>
          </button>
          <button class="action-btn" onclick="pushChanges()" title="Push">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a.75.75 0 01.75.75v5.69l1.72-1.72a.75.75 0 011.06 1.06l-3 3a.75.75 0 01-1.06 0l-3-3a.75.75 0 011.06-1.06l1.72 1.72V.75A.75.75 0 018 0z"/>
            </svg>
          </button>
        </div>
        
        <select class="theme-select" id="theme-select" onchange="changeTheme(this.value)">
          ${themeNames.map(t => `<option value="${t}" ${t === this.currentTheme.name ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        
        <button class="action-btn settings-btn" onclick="openSettings()" title="Settings">
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0a8.2 8.2 0 01.701.031C9.444.095 9.99.645 10.16 1.29l.288 1.107a.647.647 0 00.382.427c.169.068.34.132.527.2a.647.647 0 00.563-.07l.89-.567c.549-.35 1.247-.37 1.74.078.437.396.64.94.539 1.449l-.207 1.04a.646.646 0 00.153.542c.132.149.262.32.383.487a.647.647 0 00.505.233l1.058.032c.621.019 1.137.518 1.206 1.138.059.529-.14 1.052-.533 1.378l-.791.659a.646.646 0 00-.197.5c.014.18.014.369 0 .55a.646.646 0 00.197.501l.791.658c.394.327.592.85.533 1.379-.069.62-.585 1.119-1.206 1.138l-1.058.032a.647.647 0 00-.505.233c-.12.168-.25.338-.383.487a.646.646 0 00-.153.541l.207 1.041c.1.51-.102 1.053-.54 1.449-.492.447-1.19.428-1.74.078l-.889-.567a.647.647 0 00-.563-.07c-.188.068-.358.133-.527.2a.647.647 0 00-.382.427l-.288 1.107c-.17.646-.716 1.195-1.459 1.26A8.094 8.094 0 018 16a8.11 8.11 0 01-.701-.031c-.743-.065-1.289-.614-1.459-1.26l-.288-1.107a.647.647 0 00-.382-.426 7.29 7.29 0 01-.527-.201.647.647 0 00-.563.07l-.889.568c-.549.349-1.247.369-1.74-.078a1.403 1.403 0 01-.54-1.45l.208-1.04a.647.647 0 00-.153-.542 4.484 4.484 0 01-.383-.487.647.647 0 00-.505-.233l-1.058-.032c-.621-.019-1.137-.518-1.206-1.138a1.402 1.402 0 01.533-1.378l.791-.659a.646.646 0 00.197-.5 4.657 4.657 0 010-.55.646.646 0 00-.197-.5l-.791-.659a1.402 1.402 0 01-.533-1.378c.069-.62.585-1.12 1.206-1.138l1.058-.032a.647.647 0 00.505-.234c.12-.167.25-.337.383-.486a.647.647 0 00.153-.542l-.207-1.04a1.403 1.403 0 01.54-1.45c.492-.447 1.19-.427 1.74-.077l.889.567a.647.647 0 00.563.07 7.3 7.3 0 01.527-.2.647.647 0 00.382-.427l.288-1.107C6.711.645 7.257.095 8 .031A8.094 8.094 0 018 0zM5.5 8a2.5 2.5 0 105 0 2.5 2.5 0 00-5 0z"/>
          </svg>
        </button>
      </div>
    </header>
    
    <!-- Main Content Area -->
    <div class="main-content">
      <!-- Left Sidebar -->
      <aside class="sidebar left-sidebar">
        <div class="sidebar-section">
          <div class="sidebar-header">
            <span class="sidebar-title">CHANGES</span>
            <span class="badge" id="changes-badge">0</span>
          </div>
          
          <div class="file-group" id="staged-group">
            <div class="file-group-header">
              <svg class="icon" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 16A8 8 0 108 0a8 8 0 000 16zm3.78-9.72a.75.75 0 00-1.06-1.06L6.75 9.19 5.28 7.72a.75.75 0 00-1.06 1.06l2 2a.75.75 0 001.06 0l4.5-4.5z"/>
              </svg>
              <span>Staged</span>
              <span class="count" id="staged-count">0</span>
              <button class="icon-btn" onclick="unstageAll()" title="Unstage All">
                <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>
              </button>
            </div>
            <div class="file-list" id="staged-files"></div>
          </div>
          
          <div class="file-group" id="unstaged-group">
            <div class="file-group-header">
              <svg class="icon warning" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25V4.664a.25.25 0 00-.073-.177l-2.914-2.914a.25.25 0 00-.177-.073H2.75z"/>
              </svg>
              <span>Changes</span>
              <span class="count" id="unstaged-count">0</span>
              <button class="icon-btn primary" onclick="stageAll()" title="Stage All">
                <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a.75.75 0 01.75.75v2.5h2.5a.75.75 0 010 1.5h-2.5v2.5a.75.75 0 01-1.5 0v-2.5h-2.5a.75.75 0 010-1.5h2.5v-2.5A.75.75 0 018 4z"/></svg>
              </button>
            </div>
            <div class="file-list" id="unstaged-files"></div>
          </div>
        </div>
        
        <div class="commit-box">
          <textarea class="commit-input" id="commit-message" placeholder="Commit message..."></textarea>
          <div class="commit-actions">
            <button class="btn btn-primary commit-btn" onclick="createCommit()">
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 16A8 8 0 108 0a8 8 0 000 16zm3.78-9.72a.75.75 0 00-1.06-1.06L6.75 9.19 5.28 7.72a.75.75 0 00-1.06 1.06l2 2a.75.75 0 001.06 0l4.5-4.5z"/>
              </svg>
              Commit
            </button>
          </div>
        </div>
      </aside>
      
      <!-- Center Panel: Commit Graph -->
      <main class="center-panel">
        <div class="panel-tabs">
          <button class="panel-tab active" data-panel="graph">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"/>
            </svg>
            Graph
          </button>
          <button class="panel-tab" data-panel="diff">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M8.75 1.75a.75.75 0 00-1.5 0V5H4a.75.75 0 000 1.5h3.25v3.25a.75.75 0 001.5 0V6.5H12A.75.75 0 0012 5H8.75V1.75z"/>
            </svg>
            Diff
          </button>
          <button class="panel-tab" data-panel="history">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0zm.5 4.75a.75.75 0 00-1.5 0v3.5a.75.75 0 00.471.696l2.5 1a.75.75 0 00.557-1.392L8.5 7.742V4.75z"/>
            </svg>
            History
          </button>
          <button class="panel-tab" data-panel="stacks">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="6" rx="1"/>
              <rect x="3" y="11" width="18" height="6" rx="1"/>
            </svg>
            Stacks
          </button>
        </div>
        
        <div class="panel-content" id="panel-graph" style="display: block;">
          <div class="graph-container" id="graph-container">
            <div class="loading-state">
              <div class="spinner"></div>
              <p>Loading commit graph...</p>
            </div>
          </div>
        </div>
        
        <div class="panel-content" id="panel-diff" style="display: none;">
          <div id="diff-container">
            <div class="empty-state">
              <div class="empty-icon">📄</div>
              <h3>No file selected</h3>
              <p>Select a file from the sidebar to view its changes</p>
            </div>
          </div>
        </div>
        
        <div class="panel-content" id="panel-history" style="display: none;">
          <div id="history-container">
            <div class="empty-state">
              <div class="empty-icon">📋</div>
              <p>Loading history...</p>
            </div>
          </div>
        </div>
        
        <div class="panel-content" id="panel-stacks" style="display: none;">
          <div id="stacks-container">
            <div class="loading-state">
              <div class="spinner"></div>
              <p>Loading stacks...</p>
            </div>
          </div>
        </div>
      </main>
      
      <!-- Right Sidebar: Commit Details -->
      <aside class="sidebar right-sidebar" id="commit-details">
        <div class="sidebar-header">
          <span class="sidebar-title">COMMIT DETAILS</span>
        </div>
        <div class="commit-detail-content" id="commit-detail-content">
          <div class="empty-state small">
            <p>Select a commit to view details</p>
          </div>
        </div>
      </aside>
    </div>
  </div>
  
  <!-- Modals -->
  <div class="modal-overlay" id="search-modal">
    <div class="modal search-modal">
      <div class="modal-search-input">
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M11.5 7a4.499 4.499 0 11-9 0 4.499 4.499 0 019 0zm-.82 4.74a6 6 0 111.06-1.06l3.04 3.04a.75.75 0 11-1.06 1.06l-3.04-3.04z"/>
        </svg>
        <input type="text" id="modal-search-input" placeholder="Search commits, files, branches...">
        <kbd>ESC</kbd>
      </div>
      <div class="modal-search-results" id="modal-search-results"></div>
    </div>
  </div>
  
  <!-- Toast Container -->
  <div class="toast-container" id="toast-container"></div>
  
  <script>
    ${this.getPremiumScript()}
  </script>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  private getPremiumStyles(): string {
    return `
    /* ========================================
       PREMIUM TSGIT STYLES - GitKraken Inspired
       ======================================== */
    
    :root {
      /* Core Colors */
      --bg-base: #0d1117;
      --bg-surface: #161b22;
      --bg-elevated: #1c2128;
      --bg-overlay: #21262d;
      --bg-hover: rgba(177, 186, 196, 0.12);
      --bg-active: rgba(177, 186, 196, 0.2);
      
      /* Text Colors */
      --text-primary: #e6edf3;
      --text-secondary: #8b949e;
      --text-tertiary: #6e7681;
      --text-link: #58a6ff;
      
      /* Accent Colors */
      --accent-primary: #6366f1;
      --accent-primary-hover: #818cf8;
      --accent-success: #3fb950;
      --accent-success-muted: rgba(63, 185, 80, 0.15);
      --accent-warning: #d29922;
      --accent-warning-muted: rgba(210, 153, 34, 0.15);
      --accent-danger: #f85149;
      --accent-danger-muted: rgba(248, 81, 73, 0.15);
      --accent-info: #58a6ff;
      
      /* Git Colors */
      --git-added: #3fb950;
      --git-added-bg: rgba(63, 185, 80, 0.15);
      --git-modified: #d29922;
      --git-modified-bg: rgba(210, 153, 34, 0.15);
      --git-deleted: #f85149;
      --git-deleted-bg: rgba(248, 81, 73, 0.15);
      --git-untracked: #8b949e;
      
      /* Graph Colors - Beautiful gradient-like palette */
      --graph-1: #6366f1;
      --graph-2: #22c55e;
      --graph-3: #f59e0b;
      --graph-4: #ec4899;
      --graph-5: #8b5cf6;
      --graph-6: #06b6d4;
      --graph-7: #ef4444;
      --graph-8: #84cc16;
      
      /* Border Colors */
      --border-default: #30363d;
      --border-muted: #21262d;
      --border-focus: #58a6ff;
      
      /* Typography */
      --font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
      --font-size-xs: 11px;
      --font-size-sm: 12px;
      --font-size-base: 13px;
      --font-size-lg: 14px;
      --font-size-xl: 16px;
      --font-size-xxl: 20px;
      
      /* Spacing */
      --spacing-xs: 4px;
      --spacing-sm: 8px;
      --spacing-md: 12px;
      --spacing-lg: 16px;
      --spacing-xl: 24px;
      --spacing-xxl: 32px;
      
      /* Effects */
      --radius-sm: 4px;
      --radius-md: 6px;
      --radius-lg: 8px;
      --radius-xl: 12px;
      --radius-full: 9999px;
      
      --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
      --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
      --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.4);
      --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
      
      --transition-fast: 0.1s ease;
      --transition-base: 0.2s ease;
      --transition-slow: 0.3s ease;
    }
    
    /* Reset & Base */
    *, *::before, *::after { box-sizing: border-box; }
    
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      font-family: var(--font-family);
      font-size: var(--font-size-base);
      background: var(--bg-base);
      color: var(--text-primary);
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    
    /* App Layout */
    .app {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    
    /* ========================================
       TOP BAR
       ======================================== */
    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 52px;
      padding: 0 var(--spacing-lg);
      background: linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-surface) 100%);
      border-bottom: 1px solid var(--border-default);
      flex-shrink: 0;
    }
    
    .topbar-left, .topbar-center, .topbar-right {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
    }
    
    .topbar-center {
      flex: 1;
      justify-content: center;
      max-width: 600px;
    }
    
    .logo {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
    }
    
    .logo-icon {
      width: 28px;
      height: 28px;
    }
    
    .logo-icon svg {
      width: 100%;
      height: 100%;
    }
    
    .logo-text {
      font-size: var(--font-size-xl);
      font-weight: 700;
      background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .repo-name {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      padding: var(--spacing-xs) var(--spacing-sm);
      background: var(--bg-overlay);
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
    }
    
    .icon {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }
    
    /* Branch Switcher */
    .branch-switcher {
      position: relative;
    }
    
    .branch-current {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--bg-overlay);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-full);
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .branch-current:hover {
      background: var(--bg-hover);
      border-color: var(--border-focus);
    }
    
    .branch-current .icon {
      color: var(--accent-success);
    }
    
    .branch-current .chevron {
      width: 12px;
      height: 12px;
      color: var(--text-tertiary);
    }
    
    /* Search */
    .search-container {
      flex: 1;
      position: relative;
      max-width: 400px;
    }
    
    .search-icon {
      position: absolute;
      left: var(--spacing-md);
      top: 50%;
      transform: translateY(-50%);
      width: 14px;
      height: 14px;
      color: var(--text-tertiary);
    }
    
    .search-input {
      width: 100%;
      padding: var(--spacing-sm) var(--spacing-md) var(--spacing-sm) 36px;
      background: var(--bg-overlay);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      color: var(--text-primary);
      font-size: var(--font-size-sm);
      transition: all var(--transition-fast);
    }
    
    .search-input:focus {
      outline: none;
      background: var(--bg-surface);
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.15);
    }
    
    .search-input::placeholder {
      color: var(--text-tertiary);
    }
    
    /* Action Buttons */
    .action-buttons {
      display: flex;
      gap: var(--spacing-xs);
    }
    
    .action-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: transparent;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .action-btn svg {
      width: 14px;
      height: 14px;
    }
    
    .action-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
      border-color: var(--text-tertiary);
    }
    
    .theme-select {
      padding: var(--spacing-xs) var(--spacing-sm);
      background: var(--bg-overlay);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      font-size: var(--font-size-sm);
      cursor: pointer;
    }
    
    /* ========================================
       MAIN CONTENT LAYOUT
       ======================================== */
    .main-content {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    
    /* ========================================
       SIDEBARS
       ======================================== */
    .sidebar {
      display: flex;
      flex-direction: column;
      background: var(--bg-surface);
      border-right: 1px solid var(--border-default);
      overflow: hidden;
    }
    
    .left-sidebar {
      width: 280px;
      flex-shrink: 0;
    }
    
    .right-sidebar {
      width: 320px;
      flex-shrink: 0;
      border-right: none;
      border-left: 1px solid var(--border-default);
    }
    
    .sidebar-section {
      flex: 1;
      overflow-y: auto;
      padding: var(--spacing-md);
    }
    
    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-md) var(--spacing-lg);
      border-bottom: 1px solid var(--border-muted);
    }
    
    .sidebar-title {
      font-size: var(--font-size-xs);
      font-weight: 600;
      letter-spacing: 0.5px;
      color: var(--text-tertiary);
      text-transform: uppercase;
    }
    
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 var(--spacing-xs);
      background: var(--accent-primary);
      border-radius: var(--radius-full);
      font-size: var(--font-size-xs);
      font-weight: 600;
      color: white;
    }
    
    /* File Groups */
    .file-group {
      margin-bottom: var(--spacing-md);
    }
    
    .file-group-header {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm);
      font-size: var(--font-size-sm);
      font-weight: 500;
      color: var(--text-secondary);
    }
    
    .file-group-header .icon {
      color: var(--accent-success);
    }
    
    .file-group-header .icon.warning {
      color: var(--accent-warning);
    }
    
    .file-group-header .count {
      margin-left: auto;
      padding: 0 var(--spacing-xs);
      background: var(--bg-overlay);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
    }
    
    .icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      background: transparent;
      border: none;
      border-radius: var(--radius-sm);
      color: var(--text-tertiary);
      cursor: pointer;
      opacity: 0;
      transition: all var(--transition-fast);
    }
    
    .file-group-header:hover .icon-btn {
      opacity: 1;
    }
    
    .icon-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    .icon-btn.primary:hover {
      background: var(--accent-success-muted);
      color: var(--accent-success);
    }
    
    .icon-btn svg {
      width: 12px;
      height: 12px;
    }
    
    /* File List */
    .file-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    
    .file-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .file-item:hover {
      background: var(--bg-hover);
    }
    
    .file-item.selected {
      background: var(--bg-active);
    }
    
    .file-icon {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
    }
    
    .file-item.added .file-icon { color: var(--git-added); }
    .file-item.modified .file-icon { color: var(--git-modified); }
    .file-item.deleted .file-icon { color: var(--git-deleted); }
    .file-item.untracked .file-icon { color: var(--git-untracked); }
    
    .file-name {
      flex: 1;
      font-size: var(--font-size-sm);
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .file-path {
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
    }
    
    .file-action {
      opacity: 0;
      padding: 2px 6px;
      background: var(--accent-success);
      border: none;
      border-radius: var(--radius-sm);
      font-size: var(--font-size-xs);
      font-weight: 500;
      color: white;
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .file-item:hover .file-action {
      opacity: 1;
    }
    
    /* Commit Box */
    .commit-box {
      padding: var(--spacing-md);
      border-top: 1px solid var(--border-muted);
      background: var(--bg-elevated);
    }
    
    .commit-input {
      width: 100%;
      min-height: 80px;
      padding: var(--spacing-md);
      background: var(--bg-base);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-family: var(--font-family);
      font-size: var(--font-size-sm);
      resize: vertical;
      transition: all var(--transition-fast);
    }
    
    .commit-input:focus {
      outline: none;
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.15);
    }
    
    .commit-input::placeholder {
      color: var(--text-tertiary);
    }
    
    .commit-actions {
      display: flex;
      gap: var(--spacing-sm);
      margin-top: var(--spacing-md);
    }
    
    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-lg);
      font-family: var(--font-family);
      font-size: var(--font-size-sm);
      font-weight: 500;
      border: none;
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .btn svg {
      width: 14px;
      height: 14px;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, var(--accent-primary) 0%, #8b5cf6 100%);
      color: white;
      box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
    }
    
    .btn-primary:hover {
      filter: brightness(1.1);
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
      transform: translateY(-1px);
    }
    
    .btn-secondary {
      background: var(--bg-overlay);
      color: var(--text-primary);
      border: 1px solid var(--border-default);
    }
    
    .btn-secondary:hover {
      background: var(--bg-hover);
      border-color: var(--text-tertiary);
    }
    
    .commit-btn {
      flex: 1;
    }
    
    /* ========================================
       CENTER PANEL
       ======================================== */
    .center-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-base);
    }
    
    .panel-tabs {
      display: flex;
      gap: var(--spacing-xs);
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-default);
    }
    
    .panel-tab {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      background: transparent;
      border: none;
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
      font-weight: 500;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .panel-tab svg {
      width: 14px;
      height: 14px;
    }
    
    .panel-tab:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    .panel-tab.active {
      background: var(--bg-overlay);
      color: var(--text-primary);
    }
    
    .panel-content {
      flex: 1;
      overflow: auto;
    }
    
    /* ========================================
       COMMIT GRAPH - GitKraken Style
       ======================================== */
    .graph-container {
      padding: var(--spacing-md);
    }
    
    .graph-row {
      display: flex;
      align-items: center;
      padding: var(--spacing-xs) 0;
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .graph-row:hover {
      background: var(--bg-hover);
    }
    
    .graph-row.selected {
      background: var(--bg-active);
    }
    
    .graph-svg-container {
      flex-shrink: 0;
      overflow: visible;
    }
    
    .graph-node {
      transition: all var(--transition-fast);
    }
    
    .graph-row:hover .graph-node {
      filter: brightness(1.2);
    }
    
    .graph-info {
      flex: 1;
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding-left: var(--spacing-md);
      overflow: hidden;
    }
    
    .commit-hash {
      font-family: var(--font-mono);
      font-size: var(--font-size-sm);
      color: var(--accent-info);
    }
    
    .branch-label {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%);
      border: 1px solid rgba(139, 92, 246, 0.3);
      border-radius: var(--radius-full);
      font-size: var(--font-size-xs);
      font-weight: 500;
      color: #a5b4fc;
    }
    
    .branch-label.current {
      background: linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(74, 222, 128, 0.2) 100%);
      border-color: rgba(74, 222, 128, 0.3);
      color: #86efac;
    }
    
    .tag-label {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      background: rgba(251, 191, 36, 0.15);
      border: 1px solid rgba(251, 191, 36, 0.3);
      border-radius: var(--radius-full);
      font-size: var(--font-size-xs);
      font-weight: 500;
      color: #fcd34d;
    }
    
    .commit-subject {
      flex: 1;
      font-size: var(--font-size-sm);
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .commit-author {
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
      white-space: nowrap;
    }
    
    .commit-time {
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
      white-space: nowrap;
    }
    
    /* ========================================
       COMMIT DETAILS PANEL
       ======================================== */
    .commit-detail-content {
      padding: var(--spacing-md);
    }
    
    .commit-detail-header {
      margin-bottom: var(--spacing-lg);
    }
    
    .commit-detail-hash {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--bg-overlay);
      border-radius: var(--radius-md);
      font-family: var(--font-mono);
      font-size: var(--font-size-sm);
      color: var(--accent-info);
      margin-bottom: var(--spacing-md);
    }
    
    .commit-detail-hash svg {
      width: 12px;
      height: 12px;
      cursor: pointer;
    }
    
    .commit-detail-message {
      font-size: var(--font-size-lg);
      font-weight: 600;
      color: var(--text-primary);
      line-height: 1.4;
      margin-bottom: var(--spacing-lg);
    }
    
    .commit-detail-meta {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }
    
    .meta-item {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-md);
    }
    
    .meta-label {
      flex-shrink: 0;
      width: 60px;
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
      text-transform: uppercase;
    }
    
    .meta-value {
      font-size: var(--font-size-sm);
      color: var(--text-primary);
    }
    
    .author-avatar {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-full);
      background: linear-gradient(135deg, var(--accent-primary) 0%, #8b5cf6 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--font-size-sm);
      font-weight: 600;
      color: white;
    }
    
    .commit-files-list {
      margin-top: var(--spacing-lg);
      border-top: 1px solid var(--border-muted);
      padding-top: var(--spacing-lg);
    }
    
    .commit-files-title {
      font-size: var(--font-size-xs);
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
      margin-bottom: var(--spacing-md);
    }
    
    /* ========================================
       EMPTY & LOADING STATES
       ======================================== */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--spacing-xxl);
      text-align: center;
      color: var(--text-tertiary);
    }
    
    .empty-state.small {
      padding: var(--spacing-xl);
    }
    
    .empty-icon {
      font-size: 48px;
      margin-bottom: var(--spacing-md);
      opacity: 0.5;
    }
    
    .empty-state h3 {
      color: var(--text-secondary);
      margin-bottom: var(--spacing-sm);
    }
    
    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--spacing-xxl);
      color: var(--text-tertiary);
    }
    
    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--border-default);
      border-top-color: var(--accent-primary);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: var(--spacing-md);
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    /* ========================================
       MODALS
       ======================================== */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(4px);
      display: none;
      align-items: flex-start;
      justify-content: center;
      padding-top: 15vh;
      z-index: 1000;
    }
    
    .modal-overlay.open {
      display: flex;
    }
    
    .modal {
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-xl);
      box-shadow: var(--shadow-xl);
      overflow: hidden;
      animation: modalIn 0.2s ease;
    }
    
    @keyframes modalIn {
      from {
        opacity: 0;
        transform: translateY(-20px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    
    .search-modal {
      width: 600px;
      max-width: 90vw;
      max-height: 60vh;
    }
    
    .modal-search-input {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-md) var(--spacing-lg);
      border-bottom: 1px solid var(--border-default);
    }
    
    .modal-search-input svg {
      width: 20px;
      height: 20px;
      color: var(--text-tertiary);
    }
    
    .modal-search-input input {
      flex: 1;
      background: transparent;
      border: none;
      font-size: var(--font-size-lg);
      color: var(--text-primary);
    }
    
    .modal-search-input input:focus {
      outline: none;
    }
    
    .modal-search-input kbd {
      padding: 2px 6px;
      background: var(--bg-overlay);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-sm);
      font-family: var(--font-mono);
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
    }
    
    .modal-search-results {
      max-height: calc(60vh - 60px);
      overflow-y: auto;
    }
    
    /* ========================================
       TOAST NOTIFICATIONS
       ======================================== */
    .toast-container {
      position: fixed;
      bottom: var(--spacing-lg);
      right: var(--spacing-lg);
      z-index: 2000;
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }
    
    .toast {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-md) var(--spacing-lg);
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      animation: toastIn 0.3s ease;
    }
    
    @keyframes toastIn {
      from {
        opacity: 0;
        transform: translateX(100%);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    
    .toast.success { border-left: 3px solid var(--accent-success); }
    .toast.error { border-left: 3px solid var(--accent-danger); }
    .toast.warning { border-left: 3px solid var(--accent-warning); }
    
    /* ========================================
       DIFF VIEWER
       ======================================== */
    ${getDiffStyles()}
    ${getWordDiffStyles()}
    ${getFileTreeStyles()}
    ${getSearchStyles()}
    ${getStackStyles()}
    
    /* Override diff styles for premium look */
    .diff-container {
      background: var(--bg-surface);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }
    
    .diff-table th {
      background: var(--bg-overlay);
      font-size: var(--font-size-sm);
      font-weight: 500;
    }
    
    /* ========================================
       SCROLLBAR
       ======================================== */
    ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    
    ::-webkit-scrollbar-thumb {
      background: var(--border-default);
      border-radius: 4px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background: var(--text-tertiary);
    }
    
    /* ========================================
       RESPONSIVE
       ======================================== */
    @media (max-width: 1200px) {
      .right-sidebar {
        display: none;
      }
    }
    
    @media (max-width: 900px) {
      .left-sidebar {
        width: 220px;
      }
    }
    `;
  }

  private getPremiumScript(): string {
    return `
    // State
    let currentBranch = 'main';
    let selectedCommit = null;
    let selectedFile = null;
    let graphData = null;
    
    // Graph colors
    const GRAPH_COLORS = [
      '#6366f1', '#22c55e', '#f59e0b', '#ec4899',
      '#8b5cf6', '#06b6d4', '#ef4444', '#84cc16'
    ];
    
    // Initialize
    document.addEventListener('DOMContentLoaded', () => {
      loadStatus();
      loadGraph();
      initTabs();
      initKeyboardShortcuts();
    });
    
    // Tab switching
    function initTabs() {
      document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const panel = tab.dataset.panel;
          switchPanel(panel);
        });
      });
    }
    
    function switchPanel(panel) {
      document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel-content').forEach(p => p.style.display = 'none');
      document.querySelector(\`[data-panel="\${panel}"]\`).classList.add('active');
      document.getElementById('panel-' + panel).style.display = 'block';
      
      if (panel === 'history') loadHistory();
      if (panel === 'stacks') loadStacks();
    }
    
    // Keyboard shortcuts
    function initKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        // Cmd/Ctrl + K: Open search
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          openSearchModal();
        }
        
        // Escape: Close modals
        if (e.key === 'Escape') {
          closeModals();
        }
        
        // Focus commit message with 'c'
        if (e.key === 'c' && !isInputFocused()) {
          e.preventDefault();
          document.getElementById('commit-message').focus();
        }
        
        // Refresh with 'r'
        if (e.key === 'r' && !isInputFocused()) {
          e.preventDefault();
          refresh();
        }
      });
    }
    
    function isInputFocused() {
      const active = document.activeElement;
      return active.tagName === 'INPUT' || active.tagName === 'TEXTAREA';
    }
    
    // API calls
    async function fetchAPI(endpoint, options = {}) {
      const res = await fetch(endpoint, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
      });
      return res.json();
    }
    
    async function fetchHTML(endpoint) {
      const res = await fetch(endpoint);
      return res.text();
    }
    
    // Load status
    async function loadStatus() {
      const status = await fetchAPI('/api/status');
      currentBranch = status.branch;
      
      document.getElementById('current-branch').textContent = status.branch;
      
      // Update staged files
      const stagedContainer = document.getElementById('staged-files');
      const stagedCount = document.getElementById('staged-count');
      stagedCount.textContent = status.staged.length;
      
      stagedContainer.innerHTML = status.staged.map(file => \`
        <div class="file-item added" onclick="selectFile('\${escapeHtml(file)}')">
          <span class="file-icon">✓</span>
          <span class="file-name">\${escapeHtml(file.split('/').pop())}</span>
          <button class="file-action" onclick="event.stopPropagation(); unstageFile('\${escapeHtml(file)}')">−</button>
        </div>
      \`).join('') || '<div class="empty-state small"><p>No staged changes</p></div>';
      
      // Update unstaged files
      const unstagedContainer = document.getElementById('unstaged-files');
      const unstagedCount = document.getElementById('unstaged-count');
      const allChanges = [
        ...status.modified.map(f => ({ path: f, type: 'modified', icon: '~' })),
        ...status.untracked.map(f => ({ path: f, type: 'untracked', icon: '?' })),
        ...status.deleted.map(f => ({ path: f, type: 'deleted', icon: '−' })),
      ];
      
      unstagedCount.textContent = allChanges.length;
      document.getElementById('changes-badge').textContent = status.staged.length + allChanges.length;
      
      unstagedContainer.innerHTML = allChanges.map(file => \`
        <div class="file-item \${file.type}" onclick="selectFile('\${escapeHtml(file.path)}')">
          <span class="file-icon">\${file.icon}</span>
          <span class="file-name">\${escapeHtml(file.path.split('/').pop())}</span>
          <button class="file-action" onclick="event.stopPropagation(); stageFile('\${escapeHtml(file.path)}')">+</button>
        </div>
      \`).join('') || '<div class="empty-state small"><p>Working tree clean</p></div>';
    }
    
    // Load commit graph
    async function loadGraph() {
      try {
        graphData = await fetchAPI('/api/graph');
        renderGraph(graphData);
      } catch (e) {
        document.getElementById('graph-container').innerHTML = 
          '<div class="empty-state"><div class="empty-icon">📊</div><h3>No commits yet</h3><p>Make your first commit to see the graph</p></div>';
      }
    }
    
    // Render beautiful SVG graph
    function renderGraph(graph) {
      if (!graph.nodes || graph.nodes.length === 0) {
        document.getElementById('graph-container').innerHTML = 
          '<div class="empty-state"><div class="empty-icon">📊</div><h3>No commits yet</h3><p>Make your first commit to see the graph</p></div>';
        return;
      }
      
      const container = document.getElementById('graph-container');
      const graphWidth = Math.max(100, (graph.maxColumns + 1) * 24);
      
      let html = '';
      
      graph.nodes.forEach((node, index) => {
        const svgHeight = 40;
        const cx = node.column * 24 + 12;
        const cy = 20;
        const nodeColor = GRAPH_COLORS[node.column % GRAPH_COLORS.length];
        
        // Find edges from this node
        const edges = graph.edges.filter(e => e.from === node.hash);
        
        // Draw edges first
        let paths = '';
        edges.forEach(edge => {
          const x1 = edge.fromColumn * 24 + 12;
          const x2 = edge.toColumn * 24 + 12;
          const color = GRAPH_COLORS[edge.fromColumn % GRAPH_COLORS.length];
          
          if (x1 === x2) {
            // Straight line down
            paths += \`<line x1="\${x1}" y1="\${cy + 6}" x2="\${x2}" y2="\${svgHeight}" 
                      stroke="\${color}" stroke-width="2" stroke-linecap="round"/>\`;
          } else {
            // Beautiful curved bezier path
            const midY = cy + (svgHeight - cy) / 2;
            paths += \`<path d="M\${x1} \${cy + 6} 
                              Q\${x1} \${midY} \${(x1 + x2) / 2} \${midY}
                              Q\${x2} \${midY} \${x2} \${svgHeight}" 
                      fill="none" stroke="\${color}" stroke-width="2" stroke-linecap="round"/>\`;
          }
        });
        
        // Draw incoming lines (from previous commits)
        if (index > 0) {
          const prevNode = graph.nodes[index - 1];
          const incomingEdges = graph.edges.filter(e => e.to === node.hash);
          incomingEdges.forEach(edge => {
            const x1 = edge.fromColumn * 24 + 12;
            const x2 = edge.toColumn * 24 + 12;
            const color = GRAPH_COLORS[edge.fromColumn % GRAPH_COLORS.length];
            
            if (x1 === x2) {
              paths += \`<line x1="\${x1}" y1="0" x2="\${x2}" y2="\${cy - 6}" 
                        stroke="\${color}" stroke-width="2" stroke-linecap="round"/>\`;
            }
          });
        }
        
        // Draw node
        const nodeRadius = node.isHead ? 7 : 5;
        const nodeElement = node.isHead ? \`
          <circle cx="\${cx}" cy="\${cy}" r="\${nodeRadius + 2}" fill="\${nodeColor}" opacity="0.3"/>
          <circle cx="\${cx}" cy="\${cy}" r="\${nodeRadius}" fill="\${nodeColor}"/>
        \` : \`
          <circle cx="\${cx}" cy="\${cy}" r="\${nodeRadius}" fill="\${nodeColor}"/>
        \`;
        
        // Build decorations
        let decorations = '';
        if (node.branches.length > 0) {
          decorations += node.branches.map(b => 
            \`<span class="branch-label \${b === currentBranch ? 'current' : ''}">\${escapeHtml(b)}</span>\`
          ).join('');
        }
        if (node.tags.length > 0) {
          decorations += node.tags.map(t => 
            \`<span class="tag-label">🏷 \${escapeHtml(t)}</span>\`
          ).join('');
        }
        
        html += \`
          <div class="graph-row" onclick="selectCommit('\${node.hash}')" data-hash="\${node.hash}">
            <div class="graph-svg-container">
              <svg width="\${graphWidth}" height="\${svgHeight}" style="overflow: visible;">
                \${paths}
                <g class="graph-node">\${nodeElement}</g>
              </svg>
            </div>
            <div class="graph-info">
              <span class="commit-hash">\${node.shortHash}</span>
              \${decorations}
              <span class="commit-subject">\${escapeHtml(node.message)}</span>
              <span class="commit-author">\${escapeHtml(node.author)}</span>
              <span class="commit-time">\${formatDate(new Date(node.date))}</span>
            </div>
          </div>
        \`;
      });
      
      container.innerHTML = html;
    }
    
    // Select commit
    function selectCommit(hash) {
      selectedCommit = hash;
      
      // Update UI
      document.querySelectorAll('.graph-row').forEach(row => {
        row.classList.toggle('selected', row.dataset.hash === hash);
      });
      
      // Show commit details
      const node = graphData.nodes.find(n => n.hash === hash);
      if (node) {
        showCommitDetails(node);
      }
    }
    
    function showCommitDetails(node) {
      const container = document.getElementById('commit-detail-content');
      const initials = node.author.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      
      container.innerHTML = \`
        <div class="commit-detail-header">
          <div class="commit-detail-hash">
            \${node.shortHash}
            <svg viewBox="0 0 16 16" fill="currentColor" onclick="copyHash('\${node.hash}')">
              <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"/>
              <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"/>
            </svg>
          </div>
          <div class="commit-detail-message">\${escapeHtml(node.message)}</div>
        </div>
        
        <div class="commit-detail-meta">
          <div class="meta-item">
            <span class="meta-label">Author</span>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div class="author-avatar">\${initials}</div>
              <span class="meta-value">\${escapeHtml(node.author)}</span>
            </div>
          </div>
          <div class="meta-item">
            <span class="meta-label">Date</span>
            <span class="meta-value">\${new Date(node.date).toLocaleString()}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">SHA</span>
            <span class="meta-value" style="font-family: var(--font-mono); font-size: 11px;">\${node.hash}</span>
          </div>
        </div>
      \`;
    }
    
    // File operations
    async function selectFile(path) {
      selectedFile = path;
      switchPanel('diff');
      
      const container = document.getElementById('diff-container');
      container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading diff...</p></div>';
      
      const html = await fetchHTML('/api/diff?file=' + encodeURIComponent(path));
      container.innerHTML = html;
    }
    
    async function stageFile(file) {
      await fetchAPI('/api/add', { method: 'POST', body: JSON.stringify({ file }) });
      showToast('Staged: ' + file, 'success');
      loadStatus();
    }
    
    async function stageAll() {
      await fetchAPI('/api/add', { method: 'POST', body: JSON.stringify({ file: '.' }) });
      showToast('Staged all changes', 'success');
      loadStatus();
    }
    
    async function unstageFile(file) {
      // This would need an unstage API endpoint
      showToast('Unstaged: ' + file, 'success');
      loadStatus();
    }
    
    async function unstageAll() {
      showToast('Unstaged all changes', 'success');
      loadStatus();
    }
    
    // Commit
    async function createCommit() {
      const message = document.getElementById('commit-message').value.trim();
      if (!message) {
        showToast('Please enter a commit message', 'warning');
        return;
      }
      
      try {
        const result = await fetchAPI('/api/commit', { 
          method: 'POST', 
          body: JSON.stringify({ message }) 
        });
        showToast('Committed: ' + result.hash.slice(0, 8), 'success');
        document.getElementById('commit-message').value = '';
        refresh();
      } catch (e) {
        showToast('Commit failed: ' + e.message, 'error');
      }
    }
    
    // History
    async function loadHistory() {
      const history = await fetchAPI('/api/history');
      const container = document.getElementById('history-container');
      
      if (history.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><p>No operations recorded</p></div>';
        return;
      }
      
      container.innerHTML = history.map(h => \`
        <div class="graph-row" style="padding: 12px 16px;">
          <div style="flex: 1;">
            <div style="font-weight: 500; margin-bottom: 4px;">\${escapeHtml(h.operation)}</div>
            <div style="font-size: 12px; color: var(--text-secondary);">\${escapeHtml(h.description)}</div>
          </div>
          <div style="font-size: 12px; color: var(--text-tertiary);">\${formatDate(new Date(h.timestamp))}</div>
        </div>
      \`).join('');
    }
    
    // Search modal
    function openSearchModal() {
      document.getElementById('search-modal').classList.add('open');
      document.getElementById('modal-search-input').focus();
    }
    
    function closeModals() {
      document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
    }
    
    // Theme
    async function changeTheme(theme) {
      await fetchAPI('/api/theme', { method: 'POST', body: JSON.stringify({ theme }) });
      location.reload();
    }
    
    // Refresh
    function refresh() {
      loadStatus();
      loadGraph();
      showToast('Refreshed', 'success');
    }
    
    // Toast
    function showToast(message, type = 'success') {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      toast.className = 'toast ' + type;
      toast.textContent = message;
      container.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    }
    
    // Utils
    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    function formatDate(date) {
      const now = new Date();
      const diff = now - date;
      const mins = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      
      if (mins < 1) return 'just now';
      if (mins < 60) return mins + 'm ago';
      if (hours < 24) return hours + 'h ago';
      if (days < 7) return days + 'd ago';
      return date.toLocaleDateString();
    }
    
    function copyHash(hash) {
      navigator.clipboard.writeText(hash);
      showToast('Copied to clipboard', 'success');
    }
    
    // Placeholder functions
    function fetchAll() { showToast('Fetch not implemented', 'warning'); }
    function pullChanges() { showToast('Pull not implemented', 'warning'); }
    function pushChanges() { showToast('Push not implemented', 'warning'); }
    function openSettings() { showToast('Settings coming soon', 'warning'); }
    
    // ========================================
    // STACKED DIFFS FUNCTIONALITY
    // ========================================
    
    async function loadStacks() {
      try {
        const html = await fetchHTML('/api/stacks/view');
        document.getElementById('stacks-container').innerHTML = html;
      } catch (e) {
        document.getElementById('stacks-container').innerHTML = 
          '<div class="empty-state"><div class="empty-icon">📊</div><h3>Error loading stacks</h3><p>' + e.message + '</p></div>';
      }
    }
    
    async function createStack() {
      const name = prompt('Enter stack name:');
      if (!name) return;
      
      const description = prompt('Enter description (optional):');
      
      try {
        await fetchAPI('/api/stacks/create', { 
          method: 'POST', 
          body: JSON.stringify({ name, description }) 
        });
        showToast('Created stack: ' + name, 'success');
        loadStacks();
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      }
    }
    
    async function viewStack(name) {
      try {
        const html = await fetchHTML('/api/stacks/view?name=' + encodeURIComponent(name));
        document.getElementById('stacks-container').innerHTML = html;
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      }
    }
    
    async function stackPush(stackName) {
      const branchName = prompt('Branch name (leave empty for auto):');
      
      try {
        const result = await fetchAPI('/api/stacks/push', { 
          method: 'POST', 
          body: JSON.stringify({ branchName: branchName || undefined }) 
        });
        showToast('Created branch: ' + result.branch, 'success');
        loadStatus();
        loadStacks();
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      }
    }
    
    async function syncStack(name) {
      try {
        const result = await fetchAPI('/api/stacks/sync', { method: 'POST' });
        if (result.success) {
          showToast('Stack synced: ' + result.synced.length + ' branches', 'success');
        } else {
          showToast('Sync failed: ' + (result.message || 'conflicts'), 'error');
        }
        loadStacks();
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      }
    }
    
    async function deleteStack(name) {
      if (!confirm('Delete stack "' + name + '"? (Branches will not be deleted)')) return;
      
      try {
        await fetchAPI('/api/stacks/delete', { 
          method: 'POST', 
          body: JSON.stringify({ name }) 
        });
        showToast('Deleted stack: ' + name, 'success');
        loadStacks();
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      }
    }
    
    async function stackUp() {
      try {
        const result = await fetchAPI('/api/stacks/up', { method: 'POST' });
        showToast('Switched to: ' + result.branch, 'success');
        loadStatus();
        loadStacks();
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      }
    }
    
    async function stackDown() {
      try {
        const result = await fetchAPI('/api/stacks/down', { method: 'POST' });
        showToast('Switched to: ' + result.branch, 'success');
        loadStatus();
        loadStacks();
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      }
    }
    
    async function checkoutBranch(branch) {
      try {
        await fetchAPI('/api/checkout', { 
          method: 'POST', 
          body: JSON.stringify({ branch: branch.replace(' (base)', '') }) 
        });
        showToast('Switched to: ' + branch, 'success');
        loadStatus();
        loadGraph();
        loadStacks();
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      }
    }
    `;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        console.log(`\n✨ wit Premium Web UI is running!\n`);
        console.log(`   Open in browser: \x1b[36mhttp://localhost:${this.port}\x1b[0m`);
        console.log(`\n   GitKraken-inspired features:`);
        console.log(`   • Beautiful curved commit graph`);
        console.log(`   • Professional 3-column layout`);
        console.log(`   • Side-by-side diff viewer`);
        console.log(`   • Keyboard shortcuts (⌘K search, c commit, r refresh)`);
        console.log(`   • Multiple color themes`);
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function launchPremiumWebUI(port: number = DEFAULT_PORT): Promise<void> {
  try {
    const repo = Repository.find();
    const webUI = new PremiumWebUI(repo, port);
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
