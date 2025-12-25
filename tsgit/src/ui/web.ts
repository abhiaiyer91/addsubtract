/**
 * Web-based User Interface for tsgit
 * A beautiful, modern web dashboard
 */

import * as http from 'http';
import * as path from 'path';
import * as url from 'url';
import { Repository } from '../core/repository';
import { TsgitError } from '../core/errors';

const DEFAULT_PORT = 3847;

/**
 * Web UI Server
 */
export class TsgitWebUI {
  private server: http.Server;
  private repo: Repository;
  private port: number;

  constructor(repo: Repository, port: number = DEFAULT_PORT) {
    this.repo = repo;
    this.port = port;
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
  }

  /**
   * Handle incoming requests
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const parsedUrl = url.parse(req.url || '/', true);
    const pathname = parsedUrl.pathname || '/';

    // Set CORS headers for API
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      if (pathname === '/') {
        this.serveHTML(res);
      } else if (pathname === '/api/status') {
        this.serveJSON(res, this.getStatus());
      } else if (pathname === '/api/log') {
        this.serveJSON(res, this.getLog());
      } else if (pathname === '/api/branches') {
        this.serveJSON(res, this.getBranches());
      } else if (pathname === '/api/diff') {
        const file = parsedUrl.query.file as string;
        this.serveJSON(res, this.getDiff(file));
      } else if (pathname === '/api/add' && req.method === 'POST') {
        const body = await this.readBody(req);
        const { file } = JSON.parse(body);
        this.addFile(file);
        this.serveJSON(res, { success: true });
      } else if (pathname === '/api/commit' && req.method === 'POST') {
        const body = await this.readBody(req);
        const { message } = JSON.parse(body);
        const hash = this.commit(message);
        this.serveJSON(res, { success: true, hash });
      } else if (pathname === '/api/checkout' && req.method === 'POST') {
        const body = await this.readBody(req);
        const { branch } = JSON.parse(body);
        this.checkout(branch);
        this.serveJSON(res, { success: true });
      } else if (pathname === '/api/history') {
        this.serveJSON(res, this.getHistory());
      } else if (pathname === '/api/undo' && req.method === 'POST') {
        this.undo();
        this.serveJSON(res, { success: true });
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

  /**
   * Read request body
   */
  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  /**
   * Serve JSON response
   */
  private serveJSON(res: http.ServerResponse, data: any): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  /**
   * Get repository status
   */
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

  /**
   * Get commit log
   */
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

  /**
   * Get branches
   */
  private getBranches(): any {
    const branches = this.repo.listBranches();
    return branches;
  }

  /**
   * Get diff for a file
   */
  private getDiff(file?: string): any {
    // Placeholder - would implement actual diff
    return { file, diff: 'Diff not implemented yet' };
  }

  /**
   * Add a file
   */
  private addFile(file: string): void {
    this.repo.add(file);
  }

  /**
   * Create a commit
   */
  private commit(message: string): string {
    return this.repo.commit(message);
  }

  /**
   * Checkout a branch
   */
  private checkout(branch: string): void {
    this.repo.checkout(branch);
  }

  /**
   * Get operation history
   */
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
   * Undo last operation
   */
  private undo(): void {
    this.repo.journal.popEntry();
  }

  /**
   * Serve the main HTML page
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
      --accent-red: #da3633;
      --accent-yellow: #d29922;
      --accent-blue: #58a6ff;
      --accent-purple: #a371f7;
      --border-color: #30363d;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
    }
    
    header {
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 24px;
      font-weight: 600;
    }
    
    .logo svg {
      width: 32px;
      height: 32px;
      fill: var(--accent-green-light);
    }
    
    .branch-badge {
      background: var(--bg-tertiary);
      color: var(--accent-blue);
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .branch-badge::before {
      content: '⎇';
    }
    
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 20px;
    }
    
    .panel {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      overflow: hidden;
    }
    
    .panel-header {
      background: var(--bg-tertiary);
      padding: 12px 16px;
      font-weight: 600;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .panel-content {
      padding: 16px;
      max-height: 400px;
      overflow-y: auto;
    }
    
    .file-list {
      list-style: none;
    }
    
    .file-item {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      border-radius: 6px;
      margin-bottom: 4px;
      cursor: pointer;
      transition: background 0.2s;
    }
    
    .file-item:hover {
      background: var(--bg-tertiary);
    }
    
    .file-item .icon {
      width: 20px;
      margin-right: 10px;
      text-align: center;
    }
    
    .file-item.staged .icon { color: var(--accent-green-light); }
    .file-item.modified .icon { color: var(--accent-yellow); }
    .file-item.untracked .icon { color: var(--accent-red); }
    .file-item.deleted .icon { color: var(--accent-red); }
    
    .file-item .actions {
      margin-left: auto;
      opacity: 0;
      transition: opacity 0.2s;
    }
    
    .file-item:hover .actions {
      opacity: 1;
    }
    
    .btn {
      padding: 6px 12px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.2s;
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
    
    .btn-danger {
      background: var(--accent-red);
      color: white;
    }
    
    .commit-list {
      list-style: none;
    }
    
    .commit-item {
      padding: 12px;
      border-bottom: 1px solid var(--border-color);
    }
    
    .commit-item:last-child {
      border-bottom: none;
    }
    
    .commit-hash {
      font-family: 'Consolas', 'Monaco', monospace;
      color: var(--accent-blue);
      font-size: 13px;
    }
    
    .commit-message {
      margin-top: 4px;
      font-size: 14px;
    }
    
    .commit-meta {
      margin-top: 4px;
      font-size: 12px;
      color: var(--text-secondary);
    }
    
    .actions-bar {
      display: flex;
      gap: 10px;
      padding: 16px 24px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
    }
    
    .btn-large {
      padding: 10px 20px;
      font-size: 14px;
    }
    
    .empty-state {
      text-align: center;
      padding: 40px;
      color: var(--text-secondary);
    }
    
    .empty-state svg {
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
      opacity: 0.5;
    }
    
    .modal {
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
    
    .modal.open {
      display: flex;
    }
    
    .modal-content {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      width: 500px;
      max-width: 90%;
    }
    
    .modal-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
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
    }
    
    .form-group textarea {
      min-height: 100px;
      resize: vertical;
    }
    
    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 12px 20px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      display: none;
      animation: slideIn 0.3s ease;
    }
    
    .toast.show {
      display: block;
    }
    
    .toast.success {
      border-color: var(--accent-green);
    }
    
    .toast.error {
      border-color: var(--accent-red);
    }
    
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    .branch-list {
      list-style: none;
    }
    
    .branch-item {
      display: flex;
      align-items: center;
      padding: 10px 12px;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.2s;
    }
    
    .branch-item:hover {
      background: var(--bg-tertiary);
    }
    
    .branch-item.current {
      color: var(--accent-green-light);
    }
    
    .branch-item .actions {
      margin-left: auto;
    }
    
    .history-list {
      list-style: none;
    }
    
    .history-item {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .history-item:last-child {
      border-bottom: none;
    }
    
    .tabs {
      display: flex;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-secondary);
      padding: 0 20px;
    }
    
    .tab {
      padding: 12px 16px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      color: var(--text-secondary);
      transition: all 0.2s;
    }
    
    .tab:hover {
      color: var(--text-primary);
    }
    
    .tab.active {
      color: var(--text-primary);
      border-bottom-color: var(--accent-blue);
    }
    
    .tab-content {
      display: none;
    }
    
    .tab-content.active {
      display: block;
    }
    
    .close-btn {
      background: none;
      border: none;
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 20px;
    }
    
    .close-btn:hover {
      color: var(--text-primary);
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">
      <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-4h2v2h-2zm0-2h2V7h-2z"/></svg>
      tsgit
    </div>
    <div class="branch-badge" id="branch-badge">main</div>
  </header>
  
  <div class="tabs">
    <div class="tab active" data-tab="changes">Changes</div>
    <div class="tab" data-tab="log">History</div>
    <div class="tab" data-tab="branches">Branches</div>
    <div class="tab" data-tab="operations">Operations</div>
  </div>
  
  <div class="actions-bar">
    <button class="btn btn-primary btn-large" onclick="openCommitModal()">
      ✓ Commit
    </button>
    <button class="btn btn-secondary btn-large" onclick="refresh()">
      ↻ Refresh
    </button>
    <button class="btn btn-secondary btn-large" onclick="addAll()">
      + Stage All
    </button>
    <button class="btn btn-secondary btn-large" onclick="undoLast()">
      ↩ Undo
    </button>
  </div>
  
  <div class="container">
    <div class="tab-content active" id="tab-changes">
      <div class="grid">
        <div class="panel">
          <div class="panel-header">
            <span>📁 Working Directory</span>
            <span id="file-count">0 files</span>
          </div>
          <div class="panel-content">
            <ul class="file-list" id="file-list"></ul>
            <div class="empty-state" id="clean-state" style="display: none;">
              <p>✓ Working tree clean</p>
            </div>
          </div>
        </div>
        
        <div class="panel">
          <div class="panel-header">
            <span>📝 Staged Changes</span>
            <span id="staged-count">0 files</span>
          </div>
          <div class="panel-content">
            <ul class="file-list" id="staged-list"></ul>
            <div class="empty-state" id="no-staged" style="display: none;">
              <p>No files staged for commit</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="tab-content" id="tab-log">
      <div class="panel">
        <div class="panel-header">
          <span>📜 Commit History</span>
        </div>
        <div class="panel-content">
          <ul class="commit-list" id="commit-list"></ul>
        </div>
      </div>
    </div>
    
    <div class="tab-content" id="tab-branches">
      <div class="panel">
        <div class="panel-header">
          <span>⎇ Branches</span>
          <button class="btn btn-primary" onclick="openNewBranchModal()">+ New Branch</button>
        </div>
        <div class="panel-content">
          <ul class="branch-list" id="branch-list"></ul>
        </div>
      </div>
    </div>
    
    <div class="tab-content" id="tab-operations">
      <div class="panel">
        <div class="panel-header">
          <span>🕐 Operation History</span>
          <button class="btn btn-secondary" onclick="undoLast()">↩ Undo Last</button>
        </div>
        <div class="panel-content">
          <ul class="history-list" id="history-list"></ul>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Commit Modal -->
  <div class="modal" id="commit-modal">
    <div class="modal-content">
      <div class="modal-header">
        <h3>Create Commit</h3>
        <button class="close-btn" onclick="closeModal('commit-modal')">&times;</button>
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
  
  <!-- Toast -->
  <div class="toast" id="toast"></div>
  
  <script>
    const API = '';
    
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        
        // Refresh the active tab
        if (tab.dataset.tab === 'log') loadLog();
        if (tab.dataset.tab === 'branches') loadBranches();
        if (tab.dataset.tab === 'operations') loadHistory();
      });
    });
    
    // API calls
    async function fetchAPI(endpoint, options = {}) {
      const res = await fetch(API + endpoint, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers }
      });
      return res.json();
    }
    
    // Load status
    async function loadStatus() {
      const status = await fetchAPI('/api/status');
      
      document.getElementById('branch-badge').textContent = status.branch;
      
      const fileList = document.getElementById('file-list');
      const stagedList = document.getElementById('staged-list');
      const cleanState = document.getElementById('clean-state');
      const noStaged = document.getElementById('no-staged');
      
      fileList.innerHTML = '';
      stagedList.innerHTML = '';
      
      // Staged files
      status.staged.forEach(file => {
        stagedList.innerHTML += \`
          <li class="file-item staged">
            <span class="icon">✓</span>
            <span>\${file}</span>
          </li>
        \`;
      });
      
      // Modified files
      status.modified.forEach(file => {
        fileList.innerHTML += \`
          <li class="file-item modified">
            <span class="icon">~</span>
            <span>\${file}</span>
            <div class="actions">
              <button class="btn btn-primary" onclick="stageFile('\${file}')">Stage</button>
            </div>
          </li>
        \`;
      });
      
      // Untracked files
      status.untracked.forEach(file => {
        fileList.innerHTML += \`
          <li class="file-item untracked">
            <span class="icon">?</span>
            <span>\${file}</span>
            <div class="actions">
              <button class="btn btn-primary" onclick="stageFile('\${file}')">Stage</button>
            </div>
          </li>
        \`;
      });
      
      // Deleted files
      status.deleted.forEach(file => {
        fileList.innerHTML += \`
          <li class="file-item deleted">
            <span class="icon">✗</span>
            <span>\${file}</span>
          </li>
        \`;
      });
      
      const totalFiles = status.modified.length + status.untracked.length + status.deleted.length;
      document.getElementById('file-count').textContent = totalFiles + ' files';
      document.getElementById('staged-count').textContent = status.staged.length + ' files';
      
      cleanState.style.display = status.clean ? 'block' : 'none';
      noStaged.style.display = status.staged.length === 0 ? 'block' : 'none';
    }
    
    // Load commit log
    async function loadLog() {
      const commits = await fetchAPI('/api/log');
      const list = document.getElementById('commit-list');
      
      list.innerHTML = commits.map(c => \`
        <li class="commit-item">
          <span class="commit-hash">\${c.shortHash}</span>
          <div class="commit-message">\${c.message.split('\\n')[0]}</div>
          <div class="commit-meta">\${c.author} • \${new Date(c.date).toLocaleString()}</div>
        </li>
      \`).join('');
      
      if (commits.length === 0) {
        list.innerHTML = '<div class="empty-state">No commits yet</div>';
      }
    }
    
    // Load branches
    async function loadBranches() {
      const branches = await fetchAPI('/api/branches');
      const list = document.getElementById('branch-list');
      
      list.innerHTML = branches.map(b => \`
        <li class="branch-item \${b.isCurrent ? 'current' : ''}">
          <span>\${b.isCurrent ? '● ' : ''}\${b.name}</span>
          \${!b.isCurrent ? \`
            <div class="actions">
              <button class="btn btn-secondary" onclick="switchBranch('\${b.name}')">Switch</button>
            </div>
          \` : ''}
        </li>
      \`).join('');
    }
    
    // Load operation history
    async function loadHistory() {
      const history = await fetchAPI('/api/history');
      const list = document.getElementById('history-list');
      
      list.innerHTML = history.map(h => \`
        <li class="history-item">
          <span>\${h.operation}: \${h.description}</span>
          <span style="color: var(--text-secondary); font-size: 12px;">
            \${new Date(h.timestamp).toLocaleString()}
          </span>
        </li>
      \`).join('');
      
      if (history.length === 0) {
        list.innerHTML = '<div class="empty-state">No operations recorded</div>';
      }
    }
    
    // Stage a file
    async function stageFile(file) {
      try {
        await fetchAPI('/api/add', {
          method: 'POST',
          body: JSON.stringify({ file })
        });
        showToast('File staged: ' + file, 'success');
        loadStatus();
      } catch (e) {
        showToast('Error staging file', 'error');
      }
    }
    
    // Stage all files
    async function addAll() {
      try {
        await fetchAPI('/api/add', {
          method: 'POST',
          body: JSON.stringify({ file: '.' })
        });
        showToast('All files staged', 'success');
        loadStatus();
      } catch (e) {
        showToast('Error staging files', 'error');
      }
    }
    
    // Open commit modal
    function openCommitModal() {
      document.getElementById('commit-modal').classList.add('open');
      document.getElementById('commit-message').focus();
    }
    
    // Close modal
    function closeModal(id) {
      document.getElementById(id).classList.remove('open');
    }
    
    // Create commit
    async function createCommit() {
      const message = document.getElementById('commit-message').value.trim();
      if (!message) {
        showToast('Please enter a commit message', 'error');
        return;
      }
      
      try {
        const result = await fetchAPI('/api/commit', {
          method: 'POST',
          body: JSON.stringify({ message })
        });
        showToast('Committed: ' + result.hash.slice(0, 8), 'success');
        closeModal('commit-modal');
        document.getElementById('commit-message').value = '';
        loadStatus();
        loadLog();
      } catch (e) {
        showToast('Error creating commit', 'error');
      }
    }
    
    // Switch branch
    async function switchBranch(branch) {
      try {
        await fetchAPI('/api/checkout', {
          method: 'POST',
          body: JSON.stringify({ branch })
        });
        showToast('Switched to: ' + branch, 'success');
        loadStatus();
        loadBranches();
      } catch (e) {
        showToast('Error switching branch', 'error');
      }
    }
    
    // Undo last operation
    async function undoLast() {
      try {
        await fetchAPI('/api/undo', { method: 'POST' });
        showToast('Undone last operation', 'success');
        refresh();
      } catch (e) {
        showToast('Nothing to undo', 'error');
      }
    }
    
    // Refresh all
    function refresh() {
      loadStatus();
      showToast('Refreshed', 'success');
    }
    
    // Show toast notification
    function showToast(message, type = 'success') {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.className = 'toast show ' + type;
      setTimeout(() => {
        toast.classList.remove('show');
      }, 3000);
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      if (e.key === 'c') openCommitModal();
      if (e.key === 'r') refresh();
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('open'));
      }
    });
    
    // Initial load
    loadStatus();
  </script>
</body>
</html>`;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  /**
   * Start the server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, () => {
        console.log(`\n🚀 tsgit Web UI is running!\n`);
        console.log(`   Open in browser: http://localhost:${this.port}`);
        console.log(`   Press Ctrl+C to stop\n`);
        resolve();
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.error(`Port ${this.port} is already in use. Try a different port with --port <number>`);
        }
        reject(err);
      });
    });
  }

  /**
   * Stop the server
   */
  stop(): void {
    this.server.close();
  }
}

/**
 * Launch the Web UI
 */
export async function launchWebUI(port: number = DEFAULT_PORT): Promise<void> {
  try {
    const repo = Repository.find();
    const webUI = new TsgitWebUI(repo, port);
    await webUI.start();
    
    // Keep running until Ctrl+C
    process.on('SIGINT', () => {
      console.log('\nShutting down...');
      webUI.stop();
      process.exit(0);
    });
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Make sure you are in a tsgit repository');
    process.exit(1);
  }
}
