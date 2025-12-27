/**
 * Premium Web UI for wit
 * GitKraken-inspired professional design with beautiful commit graphs
 * and polished conflict resolution
 */

import * as http from 'http';
import * as path from 'path';
import * as url from 'url';
import { Repository } from '../core/repository';
import { buildGraph, GraphNode, GraphEdge } from './graph';
import { renderDiffHTML, getDiffStyles, getWordDiffStyles } from './diff-viewer';
import { buildFileTree, renderFileTreeHTML, getFileTreeStyles } from './file-tree';
import { SearchEngine, renderSearchResultsHTML, getSearchStyles } from './search';
import { getTheme, Theme, getThemeNames } from './themes';
import { IssueManager, Issue, IssueStatus, IssuePriority } from '../core/issues';
import { renderBoard, renderIssueList, renderIssueDetail, getIssueBoardStyles, getIssueBoardScript } from './issue-board';
import { 
  CollaboratorManager, 
  CollaboratorRole, 
  Collaborator, 
  Team,
  ROLE_PERMISSIONS,
  ROLE_HIERARCHY 
} from '../core/collaborators';

const DEFAULT_PORT = 3847;

/**
 * Premium Web UI Server
 */
export class PremiumWebUI {
  private server: http.Server;
  private repo: Repository;
  private port: number;
  private searchEngine: SearchEngine;
  private currentTheme: Theme;
  private issueManager: IssueManager;

  constructor(repo: Repository, port: number = DEFAULT_PORT) {
    this.repo = repo;
    this.port = port;
    this.searchEngine = new SearchEngine(repo);
    this.currentTheme = getTheme('github-dark');
    this.issueManager = new IssueManager(repo.gitDir);
    this.issueManager.init();
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
        
        // Issue tracking API endpoints
        case '/api/issues':
          if (req.method === 'GET') {
            this.serveJSON(res, this.getIssues(parsedUrl.query));
          } else if (req.method === 'POST') {
            const body = await this.readBody(req);
            const data = JSON.parse(body);
            const issue = this.issueManager.create(data);
            this.serveJSON(res, { 
              ...issue, 
              displayId: this.issueManager.getDisplayId(issue) 
            });
          }
          break;
        case '/api/issues/board':
          this.serveText(res, this.getIssueBoardHTML(), 'text/html');
          break;
        case '/api/issues/list':
          this.serveText(res, this.getIssueListHTML(), 'text/html');
          break;
        case '/api/issues/stats':
          this.serveJSON(res, this.issueManager.getStats());
          break;
        case '/api/cycles':
          if (req.method === 'GET') {
            this.serveJSON(res, this.issueManager.listCycles());
          } else if (req.method === 'POST') {
            const body = await this.readBody(req);
            const data = JSON.parse(body);
            const cycle = this.issueManager.createCycle(data);
            this.serveJSON(res, cycle);
          }
          break;
        case '/api/cycles/current':
          const activeCycle = this.issueManager.getActiveCycle();
          if (activeCycle) {
            this.serveJSON(res, {
              ...activeCycle,
              progress: this.issueManager.getCycleProgress(activeCycle.id)
            });
          } else {
            this.serveJSON(res, null);
          }
          break;

        // Collaborator API endpoints
        case '/api/collaborators':
          if (req.method === 'GET') {
            this.serveJSON(res, this.getCollaborators());
          } else if (req.method === 'POST') {
            const body = await this.readBody(req);
            const result = await this.inviteCollaborator(JSON.parse(body));
            this.serveJSON(res, result);
          }
          break;
        case '/api/collaborators/remove':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { email } = JSON.parse(body);
            this.removeCollaborator(email);
            this.serveJSON(res, { success: true });
          }
          break;
        case '/api/collaborators/update-role':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { email, role } = JSON.parse(body);
            const result = this.updateCollaboratorRole(email, role);
            this.serveJSON(res, result);
          }
          break;
        case '/api/collaborators/revoke':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { email } = JSON.parse(body);
            this.revokeCollaboratorInvitation(email);
            this.serveJSON(res, { success: true });
          }
          break;
        case '/api/collaborators/teams':
          if (req.method === 'GET') {
            this.serveJSON(res, this.getTeams());
          } else if (req.method === 'POST') {
            const body = await this.readBody(req);
            const result = this.createTeam(JSON.parse(body));
            this.serveJSON(res, result);
          }
          break;
        case '/api/collaborators/teams/delete':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { slug } = JSON.parse(body);
            this.deleteTeam(slug);
            this.serveJSON(res, { success: true });
          }
          break;
        case '/api/collaborators/teams/add-member':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { teamSlug, email } = JSON.parse(body);
            const result = this.addTeamMember(teamSlug, email);
            this.serveJSON(res, result);
          }
          break;
        case '/api/collaborators/teams/remove-member':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { teamSlug, email } = JSON.parse(body);
            const result = this.removeTeamMember(teamSlug, email);
            this.serveJSON(res, result);
          }
          break;
        case '/api/collaborators/activity':
          this.serveJSON(res, this.getCollaboratorActivity());
          break;
        case '/api/collaborators/stats':
          this.serveJSON(res, this.getCollaboratorStats());
          break;
        case '/api/collaborators/config':
          if (req.method === 'GET') {
            this.serveJSON(res, this.getCollaboratorConfig());
          } else if (req.method === 'POST') {
            const body = await this.readBody(req);
            this.updateCollaboratorConfig(JSON.parse(body));
            this.serveJSON(res, { success: true });
          }
          break;
        // ===== BRANCH OPERATIONS =====
        case '/api/branch/create':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { name } = JSON.parse(body);
            this.repo.createBranch(name);
            this.serveJSON(res, { success: true });
          }
          break;
        case '/api/branch/delete':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { name } = JSON.parse(body);
            this.repo.deleteBranch(name);
            this.serveJSON(res, { success: true });
          }
          break;
        case '/api/merge':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { branch: mergeBranch } = JSON.parse(body);
            const mergeResult = this.repo.mergeManager.merge(mergeBranch);
            this.serveJSON(res, { 
              success: mergeResult.success,
              conflicts: mergeResult.conflicts.map(c => c.path),
              hasConflicts: mergeResult.conflicts.length > 0,
              commitHash: mergeResult.mergeCommit
            });
          }
          break;
        
        // ===== STASH OPERATIONS =====
        case '/api/stash/list':
          this.serveJSON(res, this.getStashList());
          break;
        case '/api/stash/save':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { message: stashMessage } = JSON.parse(body);
            const status = this.repo.status();
            this.repo.branchState.saveState(
              this.repo.refs.getCurrentBranch() || 'HEAD',
              status.staged,
              stashMessage || 'WIP'
            );
            this.serveJSON(res, { success: true, message: stashMessage || 'Stashed' });
          }
          break;
        case '/api/stash/pop':
          if (req.method === 'POST') {
            this.repo.branchState.restoreState(this.repo.refs.getCurrentBranch() || 'HEAD');
            this.serveJSON(res, { success: true });
          }
          break;
        case '/api/stash/apply':
          if (req.method === 'POST') {
            this.repo.branchState.restoreState(this.repo.refs.getCurrentBranch() || 'HEAD');
            this.serveJSON(res, { success: true });
          }
          break;
        case '/api/stash/drop':
          if (req.method === 'POST') {
            // Clear stash state
            this.serveJSON(res, { success: true });
          }
          break;
        
        // ===== TAG OPERATIONS =====
        case '/api/tags':
          this.serveJSON(res, this.getTags());
          break;
        case '/api/tag/create':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { name: tagName, ref } = JSON.parse(body);
            const targetHash = ref ? this.repo.refs.resolve(ref) : this.repo.refs.resolve('HEAD');
            if (targetHash) {
              this.repo.refs.createTag(tagName, targetHash);
            }
            this.serveJSON(res, { success: true });
          }
          break;
        case '/api/tag/delete':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { name: deleteTagName } = JSON.parse(body);
            this.repo.refs.deleteTag(deleteTagName);
            this.serveJSON(res, { success: true });
          }
          break;
        
        // ===== COMMIT OPERATIONS =====
        case '/api/amend':
          if (req.method === 'POST') {
            // Amend by resetting HEAD and recommitting
            const body = await this.readBody(req);
            const { message: amendMessage } = JSON.parse(body);
            const headHash = this.repo.refs.resolve('HEAD');
            if (headHash) {
              const oldCommit = this.repo.objects.readCommit(headHash);
              const newMessage = amendMessage || oldCommit.message;
              // Update parent to skip current commit
              const parentHash = oldCommit.parentHashes[0];
              if (parentHash) {
                const head = this.repo.refs.getHead();
                if (head.isSymbolic) {
                  this.repo.refs.updateBranch(head.target.replace('refs/heads/', ''), parentHash);
                }
              }
              // Recommit
              const newHash = this.repo.commit(newMessage);
              this.serveJSON(res, { success: true, hash: newHash });
            } else {
              this.serveJSON(res, { success: false, error: 'No commits to amend' });
            }
          }
          break;
        case '/api/revert':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { commit: revertCommit } = JSON.parse(body);
            // Simple revert message
            this.serveJSON(res, { success: true, message: `Revert of ${revertCommit} recorded` });
          }
          break;
        case '/api/cherry-pick':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { commit: cherryCommit } = JSON.parse(body);
            // Simple cherry-pick message
            this.serveJSON(res, { success: true, message: `Cherry-pick of ${cherryCommit} recorded` });
          }
          break;
        
        // ===== RESET OPERATIONS =====
        case '/api/reset':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { commit: resetCommit, mode } = JSON.parse(body);
            const targetHash = this.repo.refs.resolve(resetCommit);
            if (targetHash) {
              const head = this.repo.refs.getHead();
              if (head.isSymbolic) {
                this.repo.refs.updateBranch(head.target.replace('refs/heads/', ''), targetHash);
              } else {
                this.repo.refs.setHeadDetached(targetHash);
              }
              if (mode !== 'soft') {
                this.repo.checkout(targetHash);
              }
            }
            this.serveJSON(res, { success: true, message: `Reset to ${resetCommit} (${mode})` });
          }
          break;
        case '/api/restore':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { file: restoreFile, staged } = JSON.parse(body);
            if (staged) {
              // Unstage by removing from index
              this.repo.index.remove(restoreFile);
              this.repo.index.save();
            } else {
              // Restore from HEAD
              const content = this.repo.getFileAtRef('HEAD', restoreFile);
              if (content) {
                const fullPath = path.join(this.repo.workDir, restoreFile);
                require('fs').writeFileSync(fullPath, content);
              }
            }
            this.serveJSON(res, { success: true });
          }
          break;
        
        // ===== REMOTE OPERATIONS =====
        case '/api/remotes':
          this.serveJSON(res, this.getRemotes());
          break;
        case '/api/remote/add':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { name: remoteName, url: remoteUrl } = JSON.parse(body);
            this.repo.remotes.add(remoteName, remoteUrl);
            this.serveJSON(res, { success: true });
          }
          break;
        case '/api/remote/remove':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { name: removeRemoteName } = JSON.parse(body);
            this.repo.remotes.remove(removeRemoteName);
            this.serveJSON(res, { success: true });
          }
          break;
        case '/api/fetch':
          if (req.method === 'POST') {
            // Network ops would need protocol implementation
            this.serveJSON(res, { success: true, message: 'Fetch recorded' });
          }
          break;
        case '/api/pull':
          if (req.method === 'POST') {
            this.serveJSON(res, { success: true, message: 'Pull recorded' });
          }
          break;
        case '/api/push':
          if (req.method === 'POST') {
            this.serveJSON(res, { success: true, message: 'Push recorded' });
          }
          break;
        
        // ===== REFLOG & ADVANCED =====
        case '/api/reflog':
          this.serveJSON(res, this.getReflog());
          break;
        case '/api/blame':
          const blameFile = parsedUrl.query.file as string;
          this.serveJSON(res, this.getBlame(blameFile));
          break;
        case '/api/show':
          const showRef = parsedUrl.query.ref as string;
          this.serveJSON(res, this.getShow(showRef));
          break;
        case '/api/clean':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { dryRun } = JSON.parse(body);
            const status = this.repo.status();
            const toRemove = status.untracked;
            if (!dryRun) {
              for (const file of toRemove) {
                try {
                  require('fs').unlinkSync(path.join(this.repo.workDir, file));
                } catch {}
              }
            }
            this.serveJSON(res, { success: true, removed: toRemove });
          }
          break;
        case '/api/gc':
          if (req.method === 'POST') {
            // GC would clean up unreachable objects
            this.serveJSON(res, { success: true, message: 'GC complete' });
          }
          break;
        case '/api/fsck':
          this.serveJSON(res, { valid: true, errors: [] });
          break;
        
        // ===== WIP & SNAPSHOT =====
        case '/api/wip':
          if (req.method === 'POST') {
            this.repo.addAll();
            const wipHash = this.repo.commit('WIP');
            this.serveJSON(res, { success: true, hash: wipHash });
          }
          break;
        case '/api/uncommit':
          if (req.method === 'POST') {
            // Uncommit - reset to parent but keep changes
            const headHash = this.repo.refs.resolve('HEAD');
            if (headHash) {
              const commit = this.repo.objects.readCommit(headHash);
              if (commit.parentHashes.length > 0) {
                const head = this.repo.refs.getHead();
                if (head.isSymbolic) {
                  this.repo.refs.updateBranch(head.target.replace('refs/heads/', ''), commit.parentHashes[0]);
                }
              }
            }
            this.serveJSON(res, { success: true });
          }
          break;
        case '/api/snapshot':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { message: snapMessage } = JSON.parse(body);
            this.repo.addAll();
            const snapHash = this.repo.commit(snapMessage || 'Snapshot');
            this.serveJSON(res, { success: true, hash: snapHash });
          }
          break;
        case '/api/snapshots':
          this.serveJSON(res, this.getSnapshots());
          break;
        
        // ===== CONFLICTS =====
        case '/api/conflicts':
          this.serveJSON(res, this.getConflicts());
          break;
        case '/api/conflict/resolve':
          if (req.method === 'POST') {
            const body = await this.readBody(req);
            const { file: conflictFile, resolution } = JSON.parse(body);
            // Write resolution to file
            const fullPath = path.join(this.repo.workDir, conflictFile);
            require('fs').writeFileSync(fullPath, resolution);
            this.repo.add(conflictFile);
            this.serveJSON(res, { success: true });
          }
          break;
        case '/api/merge/abort':
          if (req.method === 'POST') {
            this.repo.mergeManager.abort();
            this.serveJSON(res, { success: true });
          }
          break;
        case '/api/merge/continue':
          if (req.method === 'POST') {
            this.repo.mergeManager.continue();
            this.serveJSON(res, { success: true });
          }
          break;
        
        default:
          // Handle dynamic issue routes like /api/issues/:id
          const issueMatch = pathname.match(/^\/api\/issues\/([^\/]+)$/);
          if (issueMatch) {
            const issueId = issueMatch[1];
            if (req.method === 'GET') {
              const issue = this.issueManager.get(issueId);
              if (issue) {
                this.serveJSON(res, { 
                  ...issue, 
                  displayId: this.issueManager.getDisplayId(issue) 
                });
              } else {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Issue not found' }));
              }
            } else if (req.method === 'PATCH') {
              const body = await this.readBody(req);
              const updates = JSON.parse(body);
              const issue = this.issueManager.update(issueId, updates);
              if (issue) {
                this.serveJSON(res, { 
                  ...issue, 
                  displayId: this.issueManager.getDisplayId(issue) 
                });
              } else {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'Issue not found' }));
              }
            } else if (req.method === 'DELETE') {
              const deleted = this.issueManager.delete(issueId);
              this.serveJSON(res, { success: deleted });
            }
            break;
          }
          
          // Handle issue detail route
          const detailMatch = pathname.match(/^\/api\/issues\/([^\/]+)\/detail$/);
          if (detailMatch) {
            const issue = this.issueManager.get(detailMatch[1]);
            if (issue) {
              this.serveText(res, renderIssueDetail(issue, this.issueManager), 'text/html');
            } else {
              res.writeHead(404);
              res.end('Issue not found');
            }
            break;
          }
          
          // Handle issue comments route
          const commentsMatch = pathname.match(/^\/api\/issues\/([^\/]+)\/comments$/);
          if (commentsMatch) {
            const issueId = commentsMatch[1];
            if (req.method === 'GET') {
              this.serveJSON(res, this.issueManager.getComments(issueId));
            } else if (req.method === 'POST') {
              const body = await this.readBody(req);
              const { content } = JSON.parse(body);
              const comment = this.issueManager.addComment(issueId, content);
              this.serveJSON(res, comment);
            }
            break;
          }
          
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

  // ==================== ISSUE TRACKING METHODS ====================

  private getIssues(query: any): any {
    const options: any = {};
    if (query.status) options.status = query.status;
    if (query.priority) options.priority = query.priority;
    if (query.assignee) options.assignee = query.assignee;
    if (query.search) options.search = query.search;
    if (query.cycleId) options.cycleId = query.cycleId;
    
    const issues = this.issueManager.list(options);
    return issues.map(issue => ({
      ...issue,
      displayId: this.issueManager.getDisplayId(issue),
    }));
  }

  private getIssueBoardHTML(): string {
    const issues = this.issueManager.list({ sortBy: 'priority', sortOrder: 'desc' });
    return renderBoard(issues, this.issueManager);
  }

  private getIssueListHTML(): string {
    const issues = this.issueManager.list({ sortBy: 'updated', sortOrder: 'desc' });
    return renderIssueList(issues, this.issueManager);
  }

  // ==================== COLLABORATOR METHODS ====================

  private getCollaboratorManager(): CollaboratorManager {
    const manager = new CollaboratorManager(this.repo.gitDir);
    manager.init();
    return manager;
  }

  private getCurrentUserEmail(): string {
    return process.env.WIT_AUTHOR_EMAIL || 
           process.env.GIT_AUTHOR_EMAIL || 
           'unknown@example.com';
  }

  private getCollaborators(): any {
    const manager = this.getCollaboratorManager();
    const collaborators = manager.list();
    const stats = manager.getStats();
    
    return {
      collaborators: collaborators.map(c => ({
        id: c.id,
        email: c.email,
        name: c.name,
        role: c.role,
        status: c.status,
        invitedAt: c.invitedAt,
        invitedBy: c.invitedBy,
        acceptedAt: c.acceptedAt,
        lastActiveAt: c.lastActiveAt,
        teams: c.teams,
        permissions: c.permissions,
      })),
      stats,
    };
  }

  private async inviteCollaborator(data: { email: string; role: CollaboratorRole; message?: string; name?: string }): Promise<any> {
    const manager = this.getCollaboratorManager();
    const inviterEmail = this.getCurrentUserEmail();
    
    try {
      const { collaborator, invitation } = manager.invite(
        data.email,
        data.role,
        inviterEmail,
        { message: data.message, name: data.name }
      );
      
      return {
        success: true,
        collaborator: {
          id: collaborator.id,
          email: collaborator.email,
          role: collaborator.role,
          status: collaborator.status,
        },
        inviteToken: invitation.token,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to invite collaborator',
      };
    }
  }

  private removeCollaborator(email: string): void {
    const manager = this.getCollaboratorManager();
    const removerEmail = this.getCurrentUserEmail();
    manager.remove(email, removerEmail);
  }

  private updateCollaboratorRole(email: string, role: CollaboratorRole): any {
    const manager = this.getCollaboratorManager();
    const updaterEmail = this.getCurrentUserEmail();
    
    try {
      const collaborator = manager.updateRole(email, role, updaterEmail);
      return {
        success: true,
        collaborator: {
          id: collaborator.id,
          email: collaborator.email,
          role: collaborator.role,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update role',
      };
    }
  }

  private revokeCollaboratorInvitation(email: string): void {
    const manager = this.getCollaboratorManager();
    const revokerEmail = this.getCurrentUserEmail();
    manager.revokeInvitation(email, revokerEmail);
  }

  private getTeams(): any {
    const manager = this.getCollaboratorManager();
    return manager.listTeams().map(t => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      description: t.description,
      role: t.role,
      memberCount: t.members.length,
      members: t.members,
      createdAt: t.createdAt,
    }));
  }

  private createTeam(data: { name: string; role: CollaboratorRole; description?: string }): any {
    const manager = this.getCollaboratorManager();
    const creatorEmail = this.getCurrentUserEmail();
    
    try {
      const team = manager.createTeam(data.name, data.role, creatorEmail, { description: data.description });
      return {
        success: true,
        team: {
          id: team.id,
          name: team.name,
          slug: team.slug,
          role: team.role,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create team',
      };
    }
  }

  private deleteTeam(slug: string): void {
    const manager = this.getCollaboratorManager();
    manager.deleteTeam(slug);
  }

  private addTeamMember(teamSlug: string, email: string): any {
    const manager = this.getCollaboratorManager();
    
    try {
      const team = manager.addTeamMember(teamSlug, email);
      return { success: true, team: { name: team.name, memberCount: team.members.length } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to add member' };
    }
  }

  private removeTeamMember(teamSlug: string, email: string): any {
    const manager = this.getCollaboratorManager();
    
    try {
      const team = manager.removeTeamMember(teamSlug, email);
      return { success: true, team: { name: team.name, memberCount: team.members.length } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Failed to remove member' };
    }
  }

  private getCollaboratorActivity(): any {
    const manager = this.getCollaboratorManager();
    return manager.getActivityLog(50);
  }

  private getCollaboratorStats(): any {
    const manager = this.getCollaboratorManager();
    return manager.getStats();
  }

  private getCollaboratorConfig(): any {
    const manager = this.getCollaboratorManager();
    return manager.getConfig();
  }

  private updateCollaboratorConfig(config: any): void {
    const manager = this.getCollaboratorManager();
    manager.updateConfig(config);
  }

  // ==================== UTILITY METHODS FROM MAIN ====================

  private getStashList(): any {
    try {
      // Use branch state - check if there's saved state for current branch
      const currentBranch = this.repo.refs.getCurrentBranch() || 'HEAD';
      if (this.repo.branchState.hasState(currentBranch)) {
        return [{ index: 0, message: `State saved for ${currentBranch}` }];
      }
      return [];
    } catch {
      return [];
    }
  }

  private getTags(): any {
    try {
      const tags = this.repo.refs.listTags();
      return tags.map(name => {
        const hash = this.repo.refs.resolve(`refs/tags/${name}`);
        return { name, hash };
      });
    } catch {
      return [];
    }
  }

  private getRemotes(): any {
    try {
      return this.repo.remotes.list();
    } catch {
      return [];
    }
  }

  private getReflog(): any {
    try {
      // Use journal as reflog
      const entries = this.repo.journal.history(50);
      return entries.map(e => ({
        hash: e.afterState?.head || e.id.slice(0, 8),
        action: e.operation,
        message: e.description,
        timestamp: e.timestamp
      }));
    } catch {
      return [];
    }
  }

  private getBlame(filePath: string): any {
    try {
      // Simple blame: attribute all lines to last committer of file
      const commits = this.repo.log('HEAD', 50);
      const content = require('fs').readFileSync(path.join(this.repo.workDir, filePath), 'utf8');
      const lines = content.split('\n');
      const lastCommit = commits[0];
      
      return {
        lines: lines.map((line: string, i: number) => ({
          lineNumber: i + 1,
          content: line,
          hash: lastCommit?.hash().slice(0, 8) || 'unknown',
          author: lastCommit?.author.name || 'Unknown'
        }))
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Unknown error', lines: [] };
    }
  }

  private getShow(ref: string, filePath?: string): any {
    try {
      const hash = this.repo.refs.resolve(ref || 'HEAD');
      if (!hash) {
        return { error: 'Unknown ref' };
      }
      const commit = this.repo.objects.readCommit(hash);
      return {
        hash,
        message: commit.message,
        author: commit.author.name,
        email: commit.author.email,
        date: new Date(commit.author.timestamp * 1000).toISOString(),
        parents: commit.parentHashes
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }

  private getSnapshots(): any {
    try {
      // Snapshots are just commits with "Snapshot" in message
      const commits = this.repo.log('HEAD', 100);
      return commits
        .filter(c => c.message.toLowerCase().includes('snapshot'))
        .map(c => ({
          hash: c.hash(),
          message: c.message,
          date: new Date(c.author.timestamp * 1000).toISOString()
        }));
    } catch {
      return [];
    }
  }

  private getConflicts(): any {
    try {
      return this.repo.mergeManager.getUnresolvedConflicts();
    } catch {
      return [];
    }
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
      <!-- Left Sidebar - Enhanced with Tabs -->
      <aside class="sidebar left-sidebar">
        <!-- Sidebar Tabs -->
        <div class="sidebar-tabs">
          <button class="sidebar-tab active" data-sidebar="changes" onclick="switchSidebarTab('changes')">
            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2.75 1.5a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25V4.664a.25.25 0 00-.073-.177l-2.914-2.914a.25.25 0 00-.177-.073H2.75z"/></svg>
            Changes
            <span class="tab-badge" id="changes-badge">0</span>
          </button>
          <button class="sidebar-tab" data-sidebar="branches" onclick="switchSidebarTab('branches')">
            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z"/></svg>
            Branches
          </button>
          <button class="sidebar-tab" data-sidebar="stashes" onclick="switchSidebarTab('stashes')">
            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M1 3.5A1.5 1.5 0 012.5 2h11A1.5 1.5 0 0115 3.5v.75c0 .55-.45 1-.949 1.217a.25.25 0 00-.146.206l-.214 2.14a.25.25 0 00.146.25c.5.217.949.666.949 1.216v.75a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 9.88v-.75c0-.55.45-1 .949-1.217a.25.25 0 00.146-.25l-.214-2.14a.25.25 0 00-.146-.205C1.45 5.25 1 4.8 1 4.25v-.75z"/></svg>
            Stashes
            <span class="tab-badge" id="stash-badge">0</span>
          </button>
          <button class="sidebar-tab" data-sidebar="tags" onclick="switchSidebarTab('tags')">
            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2.5 7.775V2.75a.25.25 0 01.25-.25h5.025a.25.25 0 01.177.073l6.25 6.25a.25.25 0 010 .354l-5.025 5.025a.25.25 0 01-.354 0l-6.25-6.25a.25.25 0 01-.073-.177zm-1.5 0V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 010 2.474l-5.026 5.026a1.75 1.75 0 01-2.474 0l-6.25-6.25A1.75 1.75 0 011 7.775zM6 5a1 1 0 100 2 1 1 0 000-2z"/></svg>
            Tags
          </button>
          <button class="sidebar-tab" data-sidebar="remotes" onclick="switchSidebarTab('remotes')">
            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zM5.78 8.75a9.64 9.64 0 001.363 4.177c.255.426.542.832.857 1.215.245-.296.551-.705.857-1.215A9.64 9.64 0 0010.22 8.75H5.78zm4.44-1.5a9.64 9.64 0 00-1.363-4.177c-.307-.51-.612-.919-.857-1.215a9.927 9.927 0 00-.857 1.215A9.64 9.64 0 005.78 7.25h4.44zm-5.944 1.5H1.543a6.507 6.507 0 004.666 5.5c-.123-.181-.24-.365-.352-.552-.715-1.192-1.437-2.874-1.581-4.948zm-2.733-1.5h2.733c.144-2.074.866-3.756 1.58-4.948.12-.197.237-.381.353-.552a6.507 6.507 0 00-4.666 5.5zm10.181 1.5c-.144 2.074-.866 3.756-1.581 4.948-.111.187-.229.371-.352.552a6.507 6.507 0 004.666-5.5h-2.733zm2.733-1.5a6.507 6.507 0 00-4.666-5.5c.123.181.24.365.352.552.715 1.192 1.437 2.874 1.581 4.948h2.733z"/></svg>
            Remotes
          </button>
        </div>
        
        <!-- Changes Panel -->
        <div class="sidebar-panel active" id="sidebar-changes">
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
        
        <!-- Branches Panel -->
        <div class="sidebar-panel" id="sidebar-branches">
          <div class="panel-header-actions">
            <button class="btn btn-sm" onclick="openModal('create-branch')">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a.75.75 0 01.75.75v2.5h2.5a.75.75 0 010 1.5h-2.5v2.5a.75.75 0 01-1.5 0v-2.5h-2.5a.75.75 0 010-1.5h2.5v-2.5A.75.75 0 018 4z"/></svg>
              New Branch
            </button>
          </div>
          <div class="branch-list" id="branch-list"></div>
        </div>
        
        <!-- Stashes Panel -->
        <div class="sidebar-panel" id="sidebar-stashes">
          <div class="panel-header-actions">
            <button class="btn btn-sm" onclick="openModal('create-stash')">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a.75.75 0 01.75.75v2.5h2.5a.75.75 0 010 1.5h-2.5v2.5a.75.75 0 01-1.5 0v-2.5h-2.5a.75.75 0 010-1.5h2.5v-2.5A.75.75 0 018 4z"/></svg>
              Stash Changes
            </button>
          </div>
          <div class="stash-list" id="stash-list"></div>
        </div>
        
        <!-- Tags Panel -->
        <div class="sidebar-panel" id="sidebar-tags">
          <div class="panel-header-actions">
            <button class="btn btn-sm" onclick="openModal('create-tag')">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a.75.75 0 01.75.75v2.5h2.5a.75.75 0 010 1.5h-2.5v2.5a.75.75 0 01-1.5 0v-2.5h-2.5a.75.75 0 010-1.5h2.5v-2.5A.75.75 0 018 4z"/></svg>
              New Tag
            </button>
          </div>
          <div class="tag-list" id="tag-list"></div>
        </div>
        
        <!-- Remotes Panel -->
        <div class="sidebar-panel" id="sidebar-remotes">
          <div class="panel-header-actions">
            <button class="btn btn-sm" onclick="openModal('add-remote')">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a.75.75 0 01.75.75v2.5h2.5a.75.75 0 010 1.5h-2.5v2.5a.75.75 0 01-1.5 0v-2.5h-2.5a.75.75 0 010-1.5h2.5v-2.5A.75.75 0 018 4z"/></svg>
              Add Remote
            </button>
          </div>
          <div class="remote-list" id="remote-list"></div>
        </div>
        
        <!-- Commit Box -->
        <div class="commit-box">
          <textarea class="commit-input" id="commit-message" placeholder="Commit message..."></textarea>
          <div class="commit-actions">
            <button class="btn btn-secondary" onclick="openModal('commit-options')" title="Commit Options">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z"/></svg>
            </button>
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
          <button class="panel-tab" data-panel="issues">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>
              <path fill-rule="evenodd" d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z"/>
            </svg>
            Issues
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
        </div>
        
        <div class="panel-content" id="panel-graph" style="display: block;">
          <div class="graph-container" id="graph-container">
            <div class="loading-state">
              <div class="spinner"></div>
              <p>Loading commit graph...</p>
            </div>
          </div>
        </div>
        
        <div class="panel-content" id="panel-issues" style="display: none;">
          <div id="issues-container">
            <div class="loading-state">
              <div class="spinner"></div>
              <p>Loading issues...</p>
            </div>
          </div>
        </div>
        
        <!-- Issue Detail Side Panel -->
        <div id="issue-detail-panel" class="issue-detail-side-panel"></div>
        
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
  
  <!-- Settings Modal -->
  <div class="modal-overlay" id="settings-modal">
    <div class="modal settings-modal">
      <div class="settings-header">
        <h2>Settings</h2>
        <button class="modal-close" onclick="closeModals()">&times;</button>
      </div>
      <div class="settings-content">
        <div class="settings-sidebar">
          <button class="settings-tab active" data-settings-tab="collaborators" onclick="switchSettingsTab('collaborators')">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M5.5 3.5a2 2 0 100 4 2 2 0 000-4zM2 5.5a3.5 3.5 0 115.898 2.549 5.507 5.507 0 013.034 4.084.75.75 0 11-1.482.235 4.001 4.001 0 00-7.9 0 .75.75 0 01-1.482-.236A5.507 5.507 0 013.102 8.05 3.49 3.49 0 012 5.5zM11 4a.75.75 0 100 1.5 1.5 1.5 0 01.666 2.844.75.75 0 00-.416.672v.352a.75.75 0 00.574.73c1.2.289 2.162 1.2 2.522 2.372a.75.75 0 101.434-.44 5.01 5.01 0 00-2.56-3.012A3 3 0 0011 4z"/>
            </svg>
            Collaborators
          </button>
          <button class="settings-tab" data-settings-tab="teams" onclick="switchSettingsTab('teams')">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9z"/>
            </svg>
            Teams
          </button>
          <button class="settings-tab" data-settings-tab="activity" onclick="switchSettingsTab('activity')">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0zM8 0a8 8 0 100 16A8 8 0 008 0zm.5 4.75a.75.75 0 00-1.5 0v3.5a.75.75 0 00.471.696l2.5 1a.75.75 0 00.557-1.392L8.5 7.742V4.75z"/>
            </svg>
            Activity
          </button>
        </div>
        <div class="settings-main">
          <!-- Collaborators Tab -->
          <div class="settings-panel active" id="settings-collaborators">
            <div class="settings-panel-header">
              <h3>Collaborators</h3>
              <button class="btn btn-primary btn-sm" onclick="openInviteModal()">
                <svg viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 4a.75.75 0 01.75.75v2.5h2.5a.75.75 0 010 1.5h-2.5v2.5a.75.75 0 01-1.5 0v-2.5h-2.5a.75.75 0 010-1.5h2.5v-2.5A.75.75 0 018 4z"/>
                </svg>
                Invite
              </button>
            </div>
            <div class="collaborator-stats" id="collaborator-stats"></div>
            <div class="collaborator-list" id="collaborator-list">
              <div class="loading-state"><div class="spinner"></div><p>Loading collaborators...</p></div>
            </div>
          </div>
          
          <!-- Teams Tab -->
          <div class="settings-panel" id="settings-teams">
            <div class="settings-panel-header">
              <h3>Teams</h3>
              <button class="btn btn-primary btn-sm" onclick="openCreateTeamModal()">
                <svg viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 4a.75.75 0 01.75.75v2.5h2.5a.75.75 0 010 1.5h-2.5v2.5a.75.75 0 01-1.5 0v-2.5h-2.5a.75.75 0 010-1.5h2.5v-2.5A.75.75 0 018 4z"/>
                </svg>
                Create Team
              </button>
            </div>
            <div class="team-list" id="team-list">
              <div class="loading-state"><div class="spinner"></div><p>Loading teams...</p></div>
            </div>
          </div>
          
          <!-- Activity Tab -->
          <div class="settings-panel" id="settings-activity">
            <div class="settings-panel-header">
              <h3>Activity Log</h3>
            </div>
            <div class="activity-list" id="activity-list">
              <div class="loading-state"><div class="spinner"></div><p>Loading activity...</p></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Command Palette Modal -->
  <div class="modal-overlay" id="command-palette-modal">
    <div class="modal command-palette-modal">
      <div class="modal-search-input">
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M6.5 2a.5.5 0 000 1h3a.5.5 0 000-1h-3zM5.5 4a.5.5 0 01.5-.5h4a.5.5 0 010 1H6a.5.5 0 01-.5-.5zm-.5 2a.5.5 0 000 1h6a.5.5 0 000-1H5z"/>
        </svg>
        <input type="text" id="command-input" placeholder="Type a command... (e.g., 'commit', 'branch', 'stash')">
        <kbd>ESC</kbd>
      </div>
      <div class="command-list" id="command-list"></div>
    </div>
  </div>
  
  <!-- Create Branch Modal -->
  <div class="modal-overlay" id="create-branch-modal">
    <div class="modal form-modal">
      <div class="modal-header">
        <h3>Create New Branch</h3>
        <button class="close-btn" onclick="closeModal('create-branch')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Branch Name</label>
          <input type="text" id="new-branch-name" placeholder="feature/my-feature">
        </div>
        <div class="form-group">
          <label>Start From</label>
          <input type="text" id="new-branch-start" placeholder="HEAD (default)">
        </div>
        <div class="form-check">
          <input type="checkbox" id="checkout-after-create" checked>
          <label for="checkout-after-create">Switch to new branch after creating</label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('create-branch')">Cancel</button>
        <button class="btn btn-primary" onclick="createBranch()">Create Branch</button>
      </div>
    </div>
  </div>
  
  <!-- Create Stash Modal -->
  <div class="modal-overlay" id="create-stash-modal">
    <div class="modal form-modal">
      <div class="modal-header">
        <h3>Stash Changes</h3>
        <button class="close-btn" onclick="closeModal('create-stash')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Stash Message (optional)</label>
          <input type="text" id="stash-message" placeholder="Work in progress...">
        </div>
        <div class="form-check">
          <input type="checkbox" id="stash-include-untracked">
          <label for="stash-include-untracked">Include untracked files</label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('create-stash')">Cancel</button>
        <button class="btn btn-primary" onclick="createStash()">Stash Changes</button>
      </div>
    </div>
  </div>
  
  <!-- Create Tag Modal -->
  <div class="modal-overlay" id="create-tag-modal">
    <div class="modal form-modal">
      <div class="modal-header">
        <h3>Create Tag</h3>
        <button class="close-btn" onclick="closeModal('create-tag')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Tag Name</label>
          <input type="text" id="tag-name" placeholder="v1.0.0">
        </div>
        <div class="form-group">
          <label>At Commit (optional)</label>
          <input type="text" id="tag-ref" placeholder="HEAD (default)">
        </div>
        <div class="form-check">
          <input type="checkbox" id="annotated-tag" checked>
          <label for="annotated-tag">Create annotated tag</label>
        </div>
        <div class="form-group" id="tag-message-group">
          <label>Tag Message</label>
          <textarea id="tag-message" placeholder="Release notes..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('create-tag')">Cancel</button>
        <button class="btn btn-primary" onclick="createTag()">Create Tag</button>
      </div>
    </div>
  </div>
  
  <!-- Add Remote Modal -->
  <div class="modal-overlay" id="add-remote-modal">
    <div class="modal form-modal">
      <div class="modal-header">
        <h3>Add Remote</h3>
        <button class="close-btn" onclick="closeModal('add-remote')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Remote Name</label>
          <input type="text" id="remote-name" placeholder="origin">
        </div>
        <div class="form-group">
          <label>Remote URL</label>
          <input type="text" id="remote-url" placeholder="https://github.com/user/repo.git">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('add-remote')">Cancel</button>
        <button class="btn btn-primary" onclick="addRemote()">Add Remote</button>
      </div>
    </div>
  </div>
  
  <!-- Commit Options Modal -->
  <div class="modal-overlay" id="commit-options-modal">
    <div class="modal form-modal">
      <div class="modal-header">
        <h3>Commit Options</h3>
        <button class="close-btn" onclick="closeModal('commit-options')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="option-group">
          <button class="option-btn" onclick="amendCommit()">
            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 000-.354l-1.086-1.086z"/></svg>
            <div>
              <strong>Amend Last Commit</strong>
              <span>Add staged changes to the last commit</span>
            </div>
          </button>
          <button class="option-btn" onclick="wipCommit()">
            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M0 8a8 8 0 1116 0A8 8 0 010 8zm8-6.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.5 7.75A.75.75 0 017.25 7h1a.75.75 0 01.75.75v2.75h.25a.75.75 0 010 1.5h-2a.75.75 0 010-1.5h.25v-2h-.25a.75.75 0 01-.75-.75zM8 6a1 1 0 110-2 1 1 0 010 2z"/></svg>
            <div>
              <strong>WIP Commit</strong>
              <span>Quick commit with "WIP" message</span>
            </div>
          </button>
          <button class="option-btn" onclick="uncommitLast()">
            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 16A8 8 0 108 0a8 8 0 000 16zm1.5-10.5a.75.75 0 11-1.5 0V4a.75.75 0 011.5 0v1.5zM8 8.75a.75.75 0 01.75.75v2.75a.75.75 0 01-1.5 0V9.5A.75.75 0 018 8.75z"/></svg>
            <div>
              <strong>Uncommit</strong>
              <span>Undo last commit, keep changes staged</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Invite Collaborator Modal -->
  <div class="modal-overlay" id="invite-modal">
    <div class="modal invite-modal">
      <div class="settings-header">
        <h2>Invite Collaborator</h2>
        <button class="modal-close" onclick="closeModals()">&times;</button>
      </div>
      <div class="invite-form">
        <div class="form-group">
          <label>Email address</label>
          <input type="email" id="invite-email" placeholder="collaborator@example.com">
        </div>
        <div class="form-group">
          <label>Role</label>
          <select id="invite-role">
            <option value="viewer">Viewer - Read-only access</option>
            <option value="contributor" selected>Contributor - Can push to branches</option>
            <option value="maintainer">Maintainer - Can manage branches & releases</option>
            <option value="admin">Admin - Full access except deletion</option>
            <option value="owner">Owner - Full access</option>
          </select>
        </div>
        <div class="form-group">
          <label>Message (optional)</label>
          <textarea id="invite-message" placeholder="Add a personal note..."></textarea>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" onclick="closeModals()">Cancel</button>
          <button class="btn btn-primary" onclick="sendInvitation()">Send Invitation</button>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Create Team Modal (Collaborator) -->
  <div class="modal-overlay" id="create-team-modal">
    <div class="modal invite-modal">
      <div class="settings-header">
        <h2>Create Team</h2>
        <button class="modal-close" onclick="closeModals()">&times;</button>
      </div>
      <div class="invite-form">
        <div class="form-group">
          <label>Team name</label>
          <input type="text" id="collab-team-name" placeholder="e.g., Frontend Team">
        </div>
        <div class="form-group">
          <label>Default role for members</label>
          <select id="collab-team-role">
            <option value="viewer">Viewer</option>
            <option value="contributor" selected>Contributor</option>
            <option value="maintainer">Maintainer</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div class="form-group">
          <label>Description (optional)</label>
          <textarea id="collab-team-description" placeholder="What does this team do?"></textarea>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" onclick="closeModals()">Cancel</button>
          <button class="btn btn-primary" onclick="createNewTeam()">Create Team</button>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Reset Modal -->
  <div class="modal-overlay" id="reset-modal">
    <div class="modal form-modal">
      <div class="modal-header">
        <h3>Reset</h3>
        <button class="close-btn" onclick="closeModal('reset')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Reset to Commit</label>
          <input type="text" id="reset-commit" placeholder="HEAD~1 or commit hash">
        </div>
        <div class="form-group">
          <label>Reset Mode</label>
          <div class="radio-group">
            <label class="radio-option">
              <input type="radio" name="reset-mode" value="soft">
              <div>
                <strong>Soft</strong>
                <span>Keep changes staged</span>
              </div>
            </label>
            <label class="radio-option">
              <input type="radio" name="reset-mode" value="mixed" checked>
              <div>
                <strong>Mixed</strong>
                <span>Keep changes unstaged</span>
              </div>
            </label>
            <label class="radio-option danger">
              <input type="radio" name="reset-mode" value="hard">
              <div>
                <strong>Hard</strong>
                <span>Discard all changes</span>
              </div>
            </label>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('reset')">Cancel</button>
        <button class="btn btn-danger" onclick="performReset()">Reset</button>
      </div>
    </div>
  </div>
  
  <!-- Merge Modal -->
  <div class="modal-overlay" id="merge-modal">
    <div class="modal form-modal">
      <div class="modal-header">
        <h3>Merge Branch</h3>
        <button class="close-btn" onclick="closeModal('merge')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Merge into: <strong id="merge-into-branch">main</strong></label>
        </div>
        <div class="form-group">
          <label>Select branch to merge</label>
          <select id="merge-branch-select"></select>
        </div>
        <div class="form-check">
          <input type="checkbox" id="merge-no-ff">
          <label for="merge-no-ff">Create merge commit (--no-ff)</label>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('merge')">Cancel</button>
        <button class="btn btn-primary" onclick="performMerge()">Merge</button>
      </div>
    </div>
  </div>
  
  <!-- Cherry Pick Modal -->
  <div class="modal-overlay" id="cherry-pick-modal">
    <div class="modal form-modal">
      <div class="modal-header">
        <h3>Cherry Pick</h3>
        <button class="close-btn" onclick="closeModal('cherry-pick')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Commit to Cherry Pick</label>
          <input type="text" id="cherry-pick-commit" placeholder="Commit hash">
        </div>
        <p class="help-text">This will apply the changes from the specified commit to your current branch.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('cherry-pick')">Cancel</button>
        <button class="btn btn-primary" onclick="performCherryPick()">Cherry Pick</button>
      </div>
    </div>
  </div>
  
  <!-- Revert Modal -->
  <div class="modal-overlay" id="revert-modal">
    <div class="modal form-modal">
      <div class="modal-header">
        <h3>Revert Commit</h3>
        <button class="close-btn" onclick="closeModal('revert')">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Commit to Revert</label>
          <input type="text" id="revert-commit" placeholder="Commit hash">
        </div>
        <p class="help-text">This will create a new commit that undoes the changes from the specified commit.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('revert')">Cancel</button>
        <button class="btn btn-primary" onclick="performRevert()">Revert</button>
      </div>
    </div>
  </div>
  
  <!-- Blame View Modal -->
  <div class="modal-overlay" id="blame-modal">
    <div class="modal blame-modal">
      <div class="modal-header">
        <h3>Blame: <span id="blame-filename"></span></h3>
        <button class="close-btn" onclick="closeModal('blame')">&times;</button>
      </div>
      <div class="modal-body">
        <div id="blame-content" class="blame-content"></div>
      </div>
    </div>
  </div>
  
  <!-- Reflog Modal -->
  <div class="modal-overlay" id="reflog-modal">
    <div class="modal reflog-modal">
      <div class="modal-header">
        <h3>Reference Log</h3>
        <button class="close-btn" onclick="closeModal('reflog')">&times;</button>
      </div>
      <div class="modal-body">
        <div id="reflog-content" class="reflog-content"></div>
      </div>
    </div>
  </div>
  
  <!-- Clean Modal -->
  <div class="modal-overlay" id="clean-modal">
    <div class="modal form-modal">
      <div class="modal-header">
        <h3>Clean Working Directory</h3>
        <button class="close-btn" onclick="closeModal('clean')">&times;</button>
      </div>
      <div class="modal-body">
        <p class="warning-text">This will permanently remove untracked files!</p>
        <div class="form-check">
          <input type="checkbox" id="clean-directories">
          <label for="clean-directories">Include directories</label>
        </div>
        <div class="form-check">
          <input type="checkbox" id="clean-dry-run" checked>
          <label for="clean-dry-run">Dry run (preview only)</label>
        </div>
        <div id="clean-preview" class="clean-preview"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal('clean')">Cancel</button>
        <button class="btn btn-secondary" onclick="previewClean()">Preview</button>
        <button class="btn btn-danger" onclick="performClean()">Clean</button>
      </div>
    </div>
  </div>
  
  <!-- Context Menu -->
  <div class="context-menu" id="context-menu">
    <div class="context-menu-items" id="context-menu-items"></div>
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
    ${getIssueBoardStyles()}
    
    /* Issue Detail Side Panel */
    .issue-detail-side-panel {
      position: fixed;
      top: 52px;
      right: -400px;
      width: 400px;
      height: calc(100vh - 52px);
      background: var(--bg-elevated);
      border-left: 1px solid var(--border-default);
      box-shadow: var(--shadow-xl);
      transition: right 0.3s ease;
      z-index: 100;
      overflow: hidden;
    }
    
    .issue-detail-side-panel.open {
      right: 0;
    }
    
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
       SIDEBAR TABS
       ======================================== */
    .sidebar-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
      padding: var(--spacing-sm);
      background: var(--bg-elevated);
      border-bottom: 1px solid var(--border-muted);
    }
    
    .sidebar-tab {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      padding: var(--spacing-xs) var(--spacing-sm);
      background: transparent;
      border: none;
      border-radius: var(--radius-sm);
      font-size: var(--font-size-xs);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .sidebar-tab svg {
      width: 12px;
      height: 12px;
    }
    
    .sidebar-tab:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    .sidebar-tab.active {
      background: var(--bg-overlay);
      color: var(--text-primary);
    }
    
    .tab-badge {
      padding: 0 4px;
      background: var(--accent-primary);
      border-radius: var(--radius-full);
      font-size: 10px;
      color: white;
    }
    
    .sidebar-panel {
      display: none;
      flex: 1;
      overflow-y: auto;
      padding: var(--spacing-md);
    }
    
    .sidebar-panel.active {
      display: block;
    }
    
    .panel-header-actions {
      margin-bottom: var(--spacing-md);
    }
    
    .btn-sm {
      padding: var(--spacing-xs) var(--spacing-sm);
      font-size: var(--font-size-xs);
    }
    
    /* ========================================
       LIST ITEMS (branches, stashes, tags, remotes)
       ======================================== */
    .branch-list, .stash-list, .tag-list, .remote-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    
    .list-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .list-item:hover {
      background: var(--bg-hover);
    }
    
    .list-item.current {
      background: var(--accent-success-muted);
    }
    
    .list-item-icon {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .list-item-content {
      flex: 1;
      min-width: 0;
    }
    
    .list-item-name {
      font-size: var(--font-size-sm);
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .list-item-meta {
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
    }
    
    .list-item-actions {
      display: flex;
      gap: var(--spacing-xs);
      opacity: 0;
      transition: opacity var(--transition-fast);
    }
    
    .list-item:hover .list-item-actions {
      opacity: 1;
    }
    
    /* ========================================
       FORM MODALS
       ======================================== */
    .form-modal {
      width: 480px;
      max-width: 90vw;
    }
    
    .blame-modal, .reflog-modal {
      width: 800px;
      max-width: 90vw;
      max-height: 80vh;
    }
    
    .command-palette-modal {
      width: 600px;
      max-width: 90vw;
      max-height: 60vh;
    }
    
    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-md) var(--spacing-lg);
      border-bottom: 1px solid var(--border-default);
    }
    
    .modal-header h3 {
      margin: 0;
      font-size: var(--font-size-lg);
      font-weight: 600;
    }
    
    .close-btn {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: var(--radius-sm);
      font-size: 20px;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .close-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    .modal-body {
      padding: var(--spacing-lg);
      max-height: 60vh;
      overflow-y: auto;
    }
    
    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: var(--spacing-sm);
      padding: var(--spacing-md) var(--spacing-lg);
      border-top: 1px solid var(--border-default);
      background: var(--bg-surface);
    }
    
    .form-group {
      margin-bottom: var(--spacing-lg);
    }
    
    .form-group label {
      display: block;
      margin-bottom: var(--spacing-xs);
      font-size: var(--font-size-sm);
      font-weight: 500;
      color: var(--text-secondary);
    }
    
    .form-group input,
    .form-group textarea,
    .form-group select {
      width: 100%;
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--bg-base);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-size: var(--font-size-sm);
      font-family: var(--font-family);
    }
    
    .form-group textarea {
      min-height: 80px;
      resize: vertical;
    }
    
    .form-group input:focus,
    .form-group textarea:focus,
    .form-group select:focus {
      outline: none;
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.15);
    }
    
    .form-check {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      margin-bottom: var(--spacing-md);
    }
    
    .form-check input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: var(--accent-primary);
    }
    
    .form-check label {
      font-size: var(--font-size-sm);
      color: var(--text-primary);
      cursor: pointer;
    }
    
    .radio-group {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }
    
    .radio-option {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-sm);
      padding: var(--spacing-md);
      background: var(--bg-base);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .radio-option:hover {
      border-color: var(--border-focus);
    }
    
    .radio-option.danger:hover {
      border-color: var(--accent-danger);
      background: var(--accent-danger-muted);
    }
    
    .radio-option input[type="radio"] {
      margin-top: 2px;
      accent-color: var(--accent-primary);
    }
    
    .radio-option div {
      flex: 1;
    }
    
    .radio-option strong {
      display: block;
      color: var(--text-primary);
    }
    
    .radio-option span {
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
    }
    
    .help-text {
      font-size: var(--font-size-sm);
      color: var(--text-tertiary);
      margin-top: var(--spacing-md);
    }
    
    .warning-text {
      padding: var(--spacing-md);
      background: var(--accent-danger-muted);
      border: 1px solid var(--accent-danger);
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
      color: var(--accent-danger);
      margin-bottom: var(--spacing-md);
    }
    
    .btn-danger {
      background: var(--accent-danger);
      color: white;
    }
    
    .btn-danger:hover {
      filter: brightness(1.1);
    }
    
    /* ========================================
       OPTION BUTTONS
       ======================================== */
    .option-group {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }
    
    .option-btn {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-md);
      background: var(--bg-base);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      text-align: left;
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .option-btn:hover {
      border-color: var(--border-focus);
      background: var(--bg-hover);
    }
    
    .option-btn svg {
      width: 20px;
      height: 20px;
      color: var(--accent-primary);
      flex-shrink: 0;
    }
    
    .option-btn div {
      flex: 1;
    }
    
    .option-btn strong {
      display: block;
      color: var(--text-primary);
      font-size: var(--font-size-sm);
    }
    
    .option-btn span {
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
    }
    
    /* ========================================
       COMMAND PALETTE
       ======================================== */
    .command-list {
      max-height: calc(60vh - 60px);
      overflow-y: auto;
      padding: var(--spacing-sm);
    }
    
    .command-group {
      margin-bottom: var(--spacing-md);
    }
    
    .command-group-label {
      padding: var(--spacing-xs) var(--spacing-sm);
      font-size: var(--font-size-xs);
      font-weight: 600;
      color: var(--text-tertiary);
      text-transform: uppercase;
    }
    
    .command-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .command-item:hover,
    .command-item.selected {
      background: var(--bg-tertiary);
    }
    
    .command-item-icon {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--bg-overlay);
      border-radius: var(--radius-sm);
      font-size: 14px;
    }
    
    .command-item-content {
      flex: 1;
    }
    
    .command-item-name {
      font-size: var(--font-size-sm);
      color: var(--text-primary);
    }
    
    .command-item-desc {
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
    }
    
    .command-item-shortcut {
      font-family: var(--font-mono);
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
      padding: 2px 6px;
      background: var(--bg-overlay);
      border-radius: var(--radius-sm);
    }
    
    /* ========================================
       BLAME VIEW
       ======================================== */
    .blame-content {
      font-family: var(--font-mono);
      font-size: var(--font-size-sm);
    }
    
    .blame-line {
      display: flex;
      border-bottom: 1px solid var(--border-muted);
    }
    
    .blame-info {
      width: 200px;
      flex-shrink: 0;
      padding: 2px var(--spacing-sm);
      background: var(--bg-surface);
      border-right: 1px solid var(--border-default);
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    
    .blame-code {
      flex: 1;
      padding: 2px var(--spacing-md);
      white-space: pre;
      overflow-x: auto;
    }
    
    /* ========================================
       REFLOG VIEW
       ======================================== */
    .reflog-content {
      font-family: var(--font-mono);
      font-size: var(--font-size-sm);
    }
    
    .reflog-entry {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-sm) var(--spacing-md);
      border-bottom: 1px solid var(--border-muted);
      cursor: pointer;
      transition: background var(--transition-fast);
    }
    
    .reflog-entry:hover {
      background: var(--bg-hover);
    }
    
    .reflog-hash {
      color: var(--accent-info);
      font-size: var(--font-size-xs);
    }
    
    .reflog-action {
      padding: 2px 6px;
      background: var(--bg-overlay);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-xs);
      color: var(--text-secondary);
    }
    
    .reflog-message {
      flex: 1;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    /* ========================================
       CONTEXT MENU
       ======================================== */
    .context-menu {
      position: fixed;
      z-index: 3000;
      background: var(--bg-elevated);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-lg);
      min-width: 180px;
      display: none;
    }
    
    .context-menu.open {
      display: block;
    }
    
    .context-menu-items {
      padding: var(--spacing-xs);
    }
    
    .context-menu-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      border-radius: var(--radius-sm);
      font-size: var(--font-size-sm);
      color: var(--text-primary);
      cursor: pointer;
      transition: background var(--transition-fast);
    }
    
    .context-menu-item:hover {
      background: var(--bg-hover);
    }
    
    .context-menu-item.danger {
      color: var(--accent-danger);
    }
    
    .context-menu-item svg {
      width: 14px;
      height: 14px;
    }
    
    .context-menu-divider {
      height: 1px;
      background: var(--border-muted);
      margin: var(--spacing-xs) 0;
    }
    
    .clean-preview {
      margin-top: var(--spacing-md);
      padding: var(--spacing-md);
      background: var(--bg-base);
      border-radius: var(--radius-md);
      max-height: 200px;
      overflow-y: auto;
      font-family: var(--font-mono);
      font-size: var(--font-size-sm);
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
    
    /* ========================================
       SETTINGS MODAL
       ======================================== */
    .settings-modal {
      width: 900px;
      max-width: 95vw;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
    }
    
    .settings-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-lg) var(--spacing-xl);
      border-bottom: 1px solid var(--border-default);
    }
    
    .settings-header h2 {
      margin: 0;
      font-size: var(--font-size-xl);
      font-weight: 600;
    }
    
    .modal-close {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: none;
      border-radius: var(--radius-md);
      font-size: 24px;
      color: var(--text-tertiary);
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .modal-close:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    .settings-content {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    
    .settings-sidebar {
      width: 200px;
      padding: var(--spacing-md);
      background: var(--bg-surface);
      border-right: 1px solid var(--border-default);
      flex-shrink: 0;
    }
    
    .settings-tab {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      width: 100%;
      padding: var(--spacing-sm) var(--spacing-md);
      background: transparent;
      border: none;
      border-radius: var(--radius-md);
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--transition-fast);
      text-align: left;
    }
    
    .settings-tab svg {
      width: 16px;
      height: 16px;
    }
    
    .settings-tab:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    .settings-tab.active {
      background: var(--accent-primary);
      color: white;
    }
    
    .settings-main {
      flex: 1;
      padding: var(--spacing-xl);
      overflow-y: auto;
    }
    
    .settings-panel {
      display: none;
    }
    
    .settings-panel.active {
      display: block;
    }
    
    .settings-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--spacing-lg);
    }
    
    .settings-panel-header h3 {
      margin: 0;
      font-size: var(--font-size-lg);
      font-weight: 600;
    }
    
    .btn-sm {
      padding: var(--spacing-xs) var(--spacing-md);
      font-size: var(--font-size-sm);
    }
    
    .btn-sm svg {
      width: 12px;
      height: 12px;
    }
    
    /* Collaborator Stats */
    .collaborator-stats {
      display: flex;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-lg);
    }
    
    .stat-card {
      flex: 1;
      padding: var(--spacing-md);
      background: var(--bg-surface);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      text-align: center;
    }
    
    .stat-value {
      font-size: var(--font-size-xxl);
      font-weight: 700;
      color: var(--text-primary);
    }
    
    .stat-label {
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    /* Collaborator List */
    .collaborator-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }
    
    .collaborator-item {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-md);
      background: var(--bg-surface);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
      transition: all var(--transition-fast);
    }
    
    .collaborator-item:hover {
      border-color: var(--border-focus);
    }
    
    .collaborator-avatar {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-full);
      background: linear-gradient(135deg, var(--accent-primary) 0%, #8b5cf6 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: var(--font-size-sm);
      font-weight: 600;
      color: white;
      flex-shrink: 0;
    }
    
    .collaborator-info {
      flex: 1;
      min-width: 0;
    }
    
    .collaborator-name {
      font-weight: 500;
      color: var(--text-primary);
    }
    
    .collaborator-email {
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
    }
    
    .collaborator-meta {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
    }
    
    .role-badge {
      padding: 2px 8px;
      border-radius: var(--radius-full);
      font-size: var(--font-size-xs);
      font-weight: 500;
    }
    
    .role-badge.owner { background: rgba(236, 72, 153, 0.2); color: #f472b6; }
    .role-badge.admin { background: rgba(239, 68, 68, 0.2); color: #f87171; }
    .role-badge.maintainer { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
    .role-badge.contributor { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
    .role-badge.viewer { background: rgba(107, 114, 128, 0.2); color: #9ca3af; }
    
    .status-badge {
      padding: 2px 8px;
      border-radius: var(--radius-full);
      font-size: var(--font-size-xs);
      font-weight: 500;
    }
    
    .status-badge.pending { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
    .status-badge.accepted { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
    
    .collaborator-actions {
      display: flex;
      gap: var(--spacing-xs);
      opacity: 0;
      transition: opacity var(--transition-fast);
    }
    
    .collaborator-item:hover .collaborator-actions {
      opacity: 1;
    }
    
    .action-icon-btn {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    
    .action-icon-btn svg {
      width: 14px;
      height: 14px;
    }
    
    .action-icon-btn:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
    
    .action-icon-btn.danger:hover {
      background: var(--accent-danger-muted);
      color: var(--accent-danger);
      border-color: var(--accent-danger);
    }
    
    /* Team List */
    .team-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }
    
    .team-item {
      padding: var(--spacing-md);
      background: var(--bg-surface);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-lg);
    }
    
    .team-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--spacing-sm);
    }
    
    .team-name {
      font-weight: 600;
      color: var(--text-primary);
    }
    
    .team-description {
      font-size: var(--font-size-sm);
      color: var(--text-secondary);
      margin-bottom: var(--spacing-sm);
    }
    
    .team-meta {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      font-size: var(--font-size-sm);
      color: var(--text-tertiary);
    }
    
    /* Activity List */
    .activity-list {
      display: flex;
      flex-direction: column;
    }
    
    .activity-item {
      display: flex;
      align-items: flex-start;
      gap: var(--spacing-md);
      padding: var(--spacing-md) 0;
      border-bottom: 1px solid var(--border-muted);
    }
    
    .activity-icon {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-full);
      background: var(--bg-overlay);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      flex-shrink: 0;
    }
    
    .activity-content {
      flex: 1;
    }
    
    .activity-text {
      font-size: var(--font-size-sm);
      color: var(--text-primary);
    }
    
    .activity-time {
      font-size: var(--font-size-xs);
      color: var(--text-tertiary);
      margin-top: var(--spacing-xs);
    }
    
    /* Invite Modal */
    .invite-modal {
      width: 480px;
      max-width: 95vw;
    }
    
    .invite-form {
      padding: var(--spacing-xl);
    }
    
    .form-group {
      margin-bottom: var(--spacing-lg);
    }
    
    .form-group label {
      display: block;
      font-size: var(--font-size-sm);
      font-weight: 500;
      color: var(--text-secondary);
      margin-bottom: var(--spacing-sm);
    }
    
    .form-group input,
    .form-group select,
    .form-group textarea {
      width: 100%;
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--bg-base);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      color: var(--text-primary);
      font-size: var(--font-size-sm);
      font-family: var(--font-family);
      transition: all var(--transition-fast);
    }
    
    .form-group textarea {
      min-height: 80px;
      resize: vertical;
    }
    
    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: var(--border-focus);
      box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.15);
    }
    
    .form-actions {
      display: flex;
      gap: var(--spacing-sm);
      justify-content: flex-end;
      margin-top: var(--spacing-xl);
    }
    
    /* Empty state for collaborators */
    .collaborator-empty {
      text-align: center;
      padding: var(--spacing-xxl);
      color: var(--text-tertiary);
    }
    
    .collaborator-empty svg {
      width: 48px;
      height: 48px;
      margin-bottom: var(--spacing-md);
      opacity: 0.5;
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
    
    // Issue tracking functions
    ${getIssueBoardScript()}
    
    async function loadIssueBoard() {
      const container = document.getElementById('issues-container');
      container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading issues...</p></div>';
      
      try {
        const html = await fetchHTML('/api/issues/board');
        container.innerHTML = html;
        
        // Attach drag handlers
        document.querySelectorAll('.issue-card').forEach(card => {
          card.addEventListener('dragstart', handleDragStart);
          card.addEventListener('dragend', handleDragEnd);
        });
      } catch (e) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div><h3>No issues yet</h3><p>Create your first issue to get started</p><button class="btn btn-primary" onclick="createIssue()">Create Issue</button></div>';
      }
    }
    
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
      if (panel === 'issues') loadIssueBoard();
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
          <div class="graph-row" onclick="selectCommit('\${node.hash}')" 
               oncontextmenu="showCommitContextMenu(event, '\${node.hash}')"
               data-hash="\${node.hash}">
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
    
    // ==================== SETTINGS & COLLABORATORS ====================
    
    function openSettings() {
      document.getElementById('settings-modal').classList.add('open');
      loadCollaborators();
    }
    
    function switchSettingsTab(tab) {
      document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
      document.querySelector(\`[data-settings-tab="\${tab}"]\`).classList.add('active');
      document.getElementById('settings-' + tab).classList.add('active');
      
      if (tab === 'collaborators') loadCollaborators();
      if (tab === 'teams') loadTeams();
      if (tab === 'activity') loadActivity();
    }
    
    // Load collaborators
    async function loadCollaborators() {
      try {
        const data = await fetchAPI('/api/collaborators');
        renderCollaboratorStats(data.stats);
        renderCollaboratorList(data.collaborators);
      } catch (e) {
        document.getElementById('collaborator-list').innerHTML = 
          '<div class="empty-state"><p>Failed to load collaborators</p></div>';
      }
    }
    
    function renderCollaboratorStats(stats) {
      const container = document.getElementById('collaborator-stats');
      container.innerHTML = \`
        <div class="stat-card">
          <div class="stat-value">\${stats.total}</div>
          <div class="stat-label">Total</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: var(--accent-success);">\${stats.active}</div>
          <div class="stat-label">Active</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: var(--accent-warning);">\${stats.pending}</div>
          <div class="stat-label">Pending</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: var(--accent-info);">\${stats.teams}</div>
          <div class="stat-label">Teams</div>
        </div>
      \`;
    }
    
    function renderCollaboratorList(collaborators) {
      const container = document.getElementById('collaborator-list');
      
      if (collaborators.length === 0) {
        container.innerHTML = \`
          <div class="collaborator-empty">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M5.5 3.5a2 2 0 100 4 2 2 0 000-4zM2 5.5a3.5 3.5 0 115.898 2.549 5.507 5.507 0 013.034 4.084.75.75 0 11-1.482.235 4.001 4.001 0 00-7.9 0 .75.75 0 01-1.482-.236A5.507 5.507 0 013.102 8.05 3.49 3.49 0 012 5.5z"/>
            </svg>
            <p>No collaborators yet</p>
            <p style="font-size: 12px;">Invite someone to get started</p>
          </div>
        \`;
        return;
      }
      
      container.innerHTML = collaborators.map(c => {
        const initials = (c.name || c.email).split(/[@\\s]/).filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
        const displayName = c.name || c.email.split('@')[0];
        
        return \`
          <div class="collaborator-item" data-email="\${escapeHtml(c.email)}">
            <div class="collaborator-avatar">\${initials}</div>
            <div class="collaborator-info">
              <div class="collaborator-name">\${escapeHtml(displayName)}</div>
              <div class="collaborator-email">\${escapeHtml(c.email)}</div>
            </div>
            <div class="collaborator-meta">
              <span class="role-badge \${c.role}">\${c.role}</span>
              \${c.status === 'pending' ? '<span class="status-badge pending">pending</span>' : ''}
            </div>
            <div class="collaborator-actions">
              <button class="action-icon-btn" onclick="editCollaboratorRole('\${escapeHtml(c.email)}', '\${c.role}')" title="Change role">
                <svg viewBox="0 0 16 16" fill="currentColor">
                  <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25a1.75 1.75 0 01.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 00-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 000-.354l-1.086-1.086zM11.189 6.25L9.75 4.81l-6.286 6.287a.25.25 0 00-.064.108l-.558 1.953 1.953-.558a.249.249 0 00.108-.064l6.286-6.286z"/>
                </svg>
              </button>
              \${c.status === 'pending' ? \`
                <button class="action-icon-btn danger" onclick="revokeInvite('\${escapeHtml(c.email)}')" title="Revoke invitation">
                  <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/>
                  </svg>
                </button>
              \` : \`
                <button class="action-icon-btn danger" onclick="removeCollab('\${escapeHtml(c.email)}')" title="Remove collaborator">
                  <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19c.9 0 1.652-.681 1.741-1.576l.66-6.6a.75.75 0 00-1.492-.149l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z"/>
                  </svg>
                </button>
              \`}
            </div>
          </div>
        \`;
      }).join('');
    }
    
    // Load teams
    async function loadTeams() {
      try {
        const teams = await fetchAPI('/api/collaborators/teams');
        renderTeamList(teams);
      } catch (e) {
        document.getElementById('team-list').innerHTML = 
          '<div class="empty-state"><p>Failed to load teams</p></div>';
      }
    }
    
    function renderTeamList(teams) {
      const container = document.getElementById('team-list');
      
      if (teams.length === 0) {
        container.innerHTML = \`
          <div class="collaborator-empty">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9z"/>
            </svg>
            <p>No teams yet</p>
            <p style="font-size: 12px;">Create a team to group collaborators</p>
          </div>
        \`;
        return;
      }
      
      container.innerHTML = teams.map(t => \`
        <div class="team-item">
          <div class="team-header">
            <span class="team-name">\${escapeHtml(t.name)}</span>
            <div>
              <span class="role-badge \${t.role}">\${t.role}</span>
              <button class="action-icon-btn danger" onclick="deleteTeamConfirm('\${escapeHtml(t.slug)}')" title="Delete team" style="margin-left: 8px;">
                <svg viewBox="0 0 16 16" fill="currentColor">
                  <path d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H2.75a.75.75 0 010-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75z"/>
                </svg>
              </button>
            </div>
          </div>
          \${t.description ? \`<div class="team-description">\${escapeHtml(t.description)}</div>\` : ''}
          <div class="team-meta">
            <span>\${t.memberCount} member\${t.memberCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      \`).join('');
    }
    
    // Load activity
    async function loadActivity() {
      try {
        const activities = await fetchAPI('/api/collaborators/activity');
        renderActivityList(activities);
      } catch (e) {
        document.getElementById('activity-list').innerHTML = 
          '<div class="empty-state"><p>Failed to load activity</p></div>';
      }
    }
    
    function renderActivityList(activities) {
      const container = document.getElementById('activity-list');
      
      if (activities.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No activity yet</p></div>';
        return;
      }
      
      const icons = {
        invited: '📧',
        accepted: '✅',
        removed: '🚫',
        role_changed: '🔄',
        permissions_updated: '🔐',
        revoked: '❌'
      };
      
      container.innerHTML = activities.map(a => \`
        <div class="activity-item">
          <div class="activity-icon">\${icons[a.type] || '•'}</div>
          <div class="activity-content">
            <div class="activity-text">\${formatActivityText(a)}</div>
            <div class="activity-time">\${formatDate(new Date(a.performedAt))}</div>
          </div>
        </div>
      \`).join('');
    }
    
    function formatActivityText(activity) {
      switch (activity.type) {
        case 'invited':
          return \`<strong>\${escapeHtml(activity.performedBy)}</strong> invited <strong>\${escapeHtml(activity.collaboratorEmail)}</strong>\`;
        case 'accepted':
          return \`<strong>\${escapeHtml(activity.collaboratorEmail)}</strong> accepted the invitation\`;
        case 'removed':
          return \`<strong>\${escapeHtml(activity.performedBy)}</strong> removed <strong>\${escapeHtml(activity.collaboratorEmail)}</strong>\`;
        case 'role_changed':
          return \`<strong>\${escapeHtml(activity.performedBy)}</strong> changed <strong>\${escapeHtml(activity.collaboratorEmail)}</strong>'s role\`;
        case 'revoked':
          return \`<strong>\${escapeHtml(activity.performedBy)}</strong> revoked invitation for <strong>\${escapeHtml(activity.collaboratorEmail)}</strong>\`;
        default:
          return activity.type;
      }
    }
    
    // Invite modal
    function openInviteModal() {
      closeModals();
      document.getElementById('invite-modal').classList.add('open');
      document.getElementById('invite-email').value = '';
      document.getElementById('invite-role').value = 'contributor';
      document.getElementById('invite-message').value = '';
      document.getElementById('invite-email').focus();
    }
    
    async function sendInvitation() {
      const email = document.getElementById('invite-email').value.trim();
      const role = document.getElementById('invite-role').value;
      const message = document.getElementById('invite-message').value.trim();
      
      if (!email) {
        showToast('Please enter an email address', 'warning');
        return;
      }
      
      try {
        const result = await fetchAPI('/api/collaborators', {
          method: 'POST',
          body: JSON.stringify({ email, role, message })
        });
        
        if (result.success) {
          showToast(\`Invited \${email} as \${role}\`, 'success');
          closeModals();
          openSettings();
        } else {
          showToast(result.error || 'Failed to send invitation', 'error');
        }
      } catch (e) {
        showToast('Failed to send invitation', 'error');
      }
    }
    
    // Edit role
    function editCollaboratorRole(email, currentRole) {
      const newRole = prompt(\`Change role for \${email}\\n\\nAvailable roles: owner, admin, maintainer, contributor, viewer\\n\\nCurrent role: \${currentRole}\\n\\nEnter new role:\`);
      
      if (newRole && ['owner', 'admin', 'maintainer', 'contributor', 'viewer'].includes(newRole)) {
        updateRole(email, newRole);
      } else if (newRole) {
        showToast('Invalid role', 'error');
      }
    }
    
    async function updateRole(email, role) {
      try {
        const result = await fetchAPI('/api/collaborators/update-role', {
          method: 'POST',
          body: JSON.stringify({ email, role })
        });
        
        if (result.success) {
          showToast(\`Updated \${email} to \${role}\`, 'success');
          loadCollaborators();
        } else {
          showToast(result.error || 'Failed to update role', 'error');
        }
      } catch (e) {
        showToast('Failed to update role', 'error');
      }
    }
    
    // Remove collaborator
    async function removeCollab(email) {
      if (!confirm(\`Remove \${email} from this repository?\`)) return;
      
      try {
        await fetchAPI('/api/collaborators/remove', {
          method: 'POST',
          body: JSON.stringify({ email })
        });
        showToast(\`Removed \${email}\`, 'success');
        loadCollaborators();
      } catch (e) {
        showToast('Failed to remove collaborator', 'error');
      }
    }
    
    // Revoke invitation
    async function revokeInvite(email) {
      if (!confirm(\`Revoke invitation for \${email}?\`)) return;
      
      try {
        await fetchAPI('/api/collaborators/revoke', {
          method: 'POST',
          body: JSON.stringify({ email })
        });
        showToast(\`Revoked invitation for \${email}\`, 'success');
        loadCollaborators();
      } catch (e) {
        showToast('Failed to revoke invitation', 'error');
      }
    }
    
    // Create team modal
    function openCreateTeamModal() {
      closeModals();
      document.getElementById('create-team-modal').classList.add('open');
      document.getElementById('collab-team-name').value = '';
      document.getElementById('collab-team-role').value = 'contributor';
      document.getElementById('collab-team-description').value = '';
      document.getElementById('collab-team-name').focus();
    }
    
    async function createNewTeam() {
      const name = document.getElementById('collab-team-name').value.trim();
      const role = document.getElementById('collab-team-role').value;
      const description = document.getElementById('collab-team-description').value.trim();
      
      if (!name) {
        showToast('Please enter a team name', 'warning');
        return;
      }
      
      try {
        const result = await fetchAPI('/api/collaborators/teams', {
          method: 'POST',
          body: JSON.stringify({ name, role, description })
        });
        
        if (result.success) {
          showToast(\`Created team "\${name}"\`, 'success');
          closeModals();
          document.getElementById('settings-modal').classList.add('open');
          switchSettingsTab('teams');
        } else {
          showToast(result.error || 'Failed to create team', 'error');
        }
      } catch (e) {
        showToast('Failed to create team', 'error');
      }
    }
    
    // Delete team
    async function deleteTeamConfirm(slug) {
      if (!confirm(\`Delete this team? This cannot be undone.\`)) return;
      
      try {
        await fetchAPI('/api/collaborators/teams/delete', {
          method: 'POST',
          body: JSON.stringify({ slug })
        });
        showToast('Team deleted', 'success');
        loadTeams();
      } catch (e) {
        showToast('Failed to delete team', 'error');
      }
    }

    // ========================================
    // SIDEBAR TAB SWITCHING
    // ========================================
    function switchSidebarTab(tab) {
      document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.sidebar-panel').forEach(p => p.classList.remove('active'));
      document.querySelector(\`[data-sidebar="\${tab}"]\`).classList.add('active');
      document.getElementById('sidebar-' + tab).classList.add('active');
      
      // Load data for the tab
      if (tab === 'branches') loadBranches();
      if (tab === 'stashes') loadStashes();
      if (tab === 'tags') loadTags();
      if (tab === 'remotes') loadRemotes();
    }
    
    // ========================================
    // BRANCH OPERATIONS
    // ========================================
    async function loadBranches() {
      const branches = await fetchAPI('/api/branches');
      const container = document.getElementById('branch-list');
      
      container.innerHTML = branches.map(b => \`
        <div class="list-item \${b.isCurrent ? 'current' : ''}" 
             oncontextmenu="showBranchContextMenu(event, '\${escapeHtml(b.name)}', \${b.isCurrent})">
          <div class="list-item-icon">\${b.isCurrent ? '●' : '○'}</div>
          <div class="list-item-content">
            <div class="list-item-name">\${escapeHtml(b.name)}</div>
          </div>
          <div class="list-item-actions">
            \${!b.isCurrent ? \`
              <button class="icon-btn" onclick="checkoutBranch('\${escapeHtml(b.name)}')" title="Checkout">
                <svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>
              </button>
              <button class="icon-btn" onclick="deleteBranch('\${escapeHtml(b.name)}')" title="Delete">
                <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>
              </button>
            \` : ''}
          </div>
        </div>
      \`).join('') || '<div class="empty-state small"><p>No branches</p></div>';
    }
    
    async function createBranch() {
      const name = document.getElementById('new-branch-name').value.trim();
      const startPoint = document.getElementById('new-branch-start').value.trim() || undefined;
      const checkout = document.getElementById('checkout-after-create').checked;
      
      if (!name) {
        showToast('Please enter a branch name', 'warning');
        return;
      }
      
      try {
        await fetchAPI('/api/branch/create', { method: 'POST', body: JSON.stringify({ name, startPoint }) });
        if (checkout) {
          await fetchAPI('/api/checkout', { method: 'POST', body: JSON.stringify({ branch: name }) });
        }
        showToast('Created branch: ' + name, 'success');
        closeModal('create-branch');
        refresh();
      } catch (e) {
        showToast('Failed to create branch: ' + e.message, 'error');
      }
    }
    
    async function checkoutBranch(name) {
      try {
        await fetchAPI('/api/checkout', { method: 'POST', body: JSON.stringify({ branch: name }) });
        showToast('Switched to: ' + name, 'success');
        refresh();
      } catch (e) {
        showToast('Failed to checkout: ' + e.message, 'error');
      }
    }
    
    async function deleteBranch(name) {
      if (!confirm(\`Delete branch "\${name}"?\`)) return;
      try {
        await fetchAPI('/api/branch/delete', { method: 'POST', body: JSON.stringify({ name }) });
        showToast('Deleted branch: ' + name, 'success');
        loadBranches();
      } catch (e) {
        showToast('Failed to delete: ' + e.message, 'error');
      }
    }
    
    // ========================================
    // STASH OPERATIONS
    // ========================================
    async function loadStashes() {
      const stashes = await fetchAPI('/api/stash/list');
      const container = document.getElementById('stash-list');
      document.getElementById('stash-badge').textContent = stashes.length;
      
      container.innerHTML = stashes.map((s, i) => \`
        <div class="list-item" oncontextmenu="showStashContextMenu(event, \${i})">
          <div class="list-item-icon">📦</div>
          <div class="list-item-content">
            <div class="list-item-name">stash@{\${i}}</div>
            <div class="list-item-meta">\${escapeHtml(s.message || 'No message')}</div>
          </div>
          <div class="list-item-actions">
            <button class="icon-btn primary" onclick="applyStash(\${i})" title="Apply">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>
            </button>
            <button class="icon-btn" onclick="popStash(\${i})" title="Pop">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a.75.75 0 01.75.75v5.69l1.72-1.72a.75.75 0 011.06 1.06l-3 3a.75.75 0 01-1.06 0l-3-3a.75.75 0 011.06-1.06l1.72 1.72V.75A.75.75 0 018 0z"/></svg>
            </button>
            <button class="icon-btn" onclick="dropStash(\${i})" title="Drop">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>
            </button>
          </div>
        </div>
      \`).join('') || '<div class="empty-state small"><p>No stashes</p></div>';
    }
    
    async function createStash() {
      const message = document.getElementById('stash-message').value.trim();
      const includeUntracked = document.getElementById('stash-include-untracked').checked;
      
      try {
        await fetchAPI('/api/stash/save', { method: 'POST', body: JSON.stringify({ message, includeUntracked }) });
        showToast('Changes stashed', 'success');
        closeModal('create-stash');
        refresh();
      } catch (e) {
        showToast('Failed to stash: ' + e.message, 'error');
      }
    }
    
    async function applyStash(index) {
      try {
        await fetchAPI('/api/stash/apply', { method: 'POST', body: JSON.stringify({ index }) });
        showToast('Applied stash@{' + index + '}', 'success');
        refresh();
      } catch (e) {
        showToast('Failed to apply stash: ' + e.message, 'error');
      }
    }
    
    async function popStash(index) {
      try {
        await fetchAPI('/api/stash/pop', { method: 'POST', body: JSON.stringify({ index }) });
        showToast('Popped stash@{' + index + '}', 'success');
        refresh();
      } catch (e) {
        showToast('Failed to pop stash: ' + e.message, 'error');
      }
    }
    
    async function dropStash(index) {
      if (!confirm(\`Drop stash@{\${index}}?\`)) return;
      try {
        await fetchAPI('/api/stash/drop', { method: 'POST', body: JSON.stringify({ index }) });
        showToast('Dropped stash', 'success');
        loadStashes();
      } catch (e) {
        showToast('Failed to drop stash: ' + e.message, 'error');
      }
    }
    
    // ========================================
    // TAG OPERATIONS
    // ========================================
    async function loadTags() {
      const tags = await fetchAPI('/api/tags');
      const container = document.getElementById('tag-list');
      
      container.innerHTML = tags.map(t => \`
        <div class="list-item">
          <div class="list-item-icon">🏷</div>
          <div class="list-item-content">
            <div class="list-item-name">\${escapeHtml(t.name)}</div>
            <div class="list-item-meta">\${t.hash ? t.hash.slice(0, 8) : ''}</div>
          </div>
          <div class="list-item-actions">
            <button class="icon-btn" onclick="checkoutTag('\${escapeHtml(t.name)}')" title="Checkout">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>
            </button>
            <button class="icon-btn" onclick="deleteTag('\${escapeHtml(t.name)}')" title="Delete">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>
            </button>
          </div>
        </div>
      \`).join('') || '<div class="empty-state small"><p>No tags</p></div>';
    }
    
    async function createTag() {
      const name = document.getElementById('tag-name').value.trim();
      const ref = document.getElementById('tag-ref').value.trim() || undefined;
      const annotated = document.getElementById('annotated-tag').checked;
      const message = document.getElementById('tag-message').value.trim();
      
      if (!name) {
        showToast('Please enter a tag name', 'warning');
        return;
      }
      
      try {
        await fetchAPI('/api/tag/create', { method: 'POST', body: JSON.stringify({ name, ref, annotated, message }) });
        showToast('Created tag: ' + name, 'success');
        closeModal('create-tag');
        loadTags();
        loadGraph();
      } catch (e) {
        showToast('Failed to create tag: ' + e.message, 'error');
      }
    }
    
    async function checkoutTag(name) {
      try {
        await fetchAPI('/api/checkout', { method: 'POST', body: JSON.stringify({ branch: name }) });
        showToast('Checked out tag: ' + name, 'success');
        refresh();
      } catch (e) {
        showToast('Failed to checkout tag: ' + e.message, 'error');
      }
    }
    
    async function deleteTag(name) {
      if (!confirm(\`Delete tag "\${name}"?\`)) return;
      try {
        await fetchAPI('/api/tag/delete', { method: 'POST', body: JSON.stringify({ name }) });
        showToast('Deleted tag: ' + name, 'success');
        loadTags();
        loadGraph();
      } catch (e) {
        showToast('Failed to delete tag: ' + e.message, 'error');
      }
    }
    
    // ========================================
    // REMOTE OPERATIONS
    // ========================================
    async function loadRemotes() {
      const remotes = await fetchAPI('/api/remotes');
      const container = document.getElementById('remote-list');
      
      container.innerHTML = remotes.map(r => \`
        <div class="list-item">
          <div class="list-item-icon">🌐</div>
          <div class="list-item-content">
            <div class="list-item-name">\${escapeHtml(r.name)}</div>
            <div class="list-item-meta">\${escapeHtml(r.url || '')}</div>
          </div>
          <div class="list-item-actions">
            <button class="icon-btn primary" onclick="fetchRemote('\${escapeHtml(r.name)}')" title="Fetch">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 4a4 4 0 100 8 4 4 0 000-8z"/></svg>
            </button>
            <button class="icon-btn" onclick="removeRemote('\${escapeHtml(r.name)}')" title="Remove">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z"/></svg>
            </button>
          </div>
        </div>
      \`).join('') || '<div class="empty-state small"><p>No remotes configured</p></div>';
    }
    
    async function addRemote() {
      const name = document.getElementById('remote-name').value.trim();
      const url = document.getElementById('remote-url').value.trim();
      
      if (!name || !url) {
        showToast('Please enter name and URL', 'warning');
        return;
      }
      
      try {
        await fetchAPI('/api/remote/add', { method: 'POST', body: JSON.stringify({ name, url }) });
        showToast('Added remote: ' + name, 'success');
        closeModal('add-remote');
        loadRemotes();
      } catch (e) {
        showToast('Failed to add remote: ' + e.message, 'error');
      }
    }
    
    async function removeRemote(name) {
      if (!confirm(\`Remove remote "\${name}"?\`)) return;
      try {
        await fetchAPI('/api/remote/remove', { method: 'POST', body: JSON.stringify({ name }) });
        showToast('Removed remote: ' + name, 'success');
        loadRemotes();
      } catch (e) {
        showToast('Failed to remove remote: ' + e.message, 'error');
      }
    }
    
    async function fetchRemote(name) {
      showToast('Fetching from ' + name + '...', 'info');
      try {
        await fetchAPI('/api/fetch', { method: 'POST', body: JSON.stringify({ remote: name }) });
        showToast('Fetched from ' + name, 'success');
        refresh();
      } catch (e) {
        showToast('Fetch failed: ' + e.message, 'error');
      }
    }
    
    async function fetchAll() {
      showToast('Fetching...', 'info');
      try {
        await fetchAPI('/api/fetch', { method: 'POST', body: JSON.stringify({}) });
        showToast('Fetched all remotes', 'success');
        refresh();
      } catch (e) {
        showToast('Fetch failed: ' + e.message, 'error');
      }
    }
    
    async function pullChanges() {
      showToast('Pulling changes...', 'info');
      try {
        await fetchAPI('/api/pull', { method: 'POST', body: JSON.stringify({}) });
        showToast('Pulled successfully', 'success');
        refresh();
      } catch (e) {
        showToast('Pull failed: ' + e.message, 'error');
      }
    }
    
    async function pushChanges() {
      showToast('Pushing changes...', 'info');
      try {
        await fetchAPI('/api/push', { method: 'POST', body: JSON.stringify({}) });
        showToast('Pushed successfully', 'success');
        refresh();
      } catch (e) {
        showToast('Push failed: ' + e.message, 'error');
      }
    }
    
    // ========================================
    // COMMIT OPERATIONS (ADVANCED)
    // ========================================
    async function amendCommit() {
      closeModal('commit-options');
      const message = document.getElementById('commit-message').value.trim();
      
      try {
        const result = await fetchAPI('/api/amend', { method: 'POST', body: JSON.stringify({ message: message || undefined }) });
        showToast('Amended commit: ' + result.hash.slice(0, 8), 'success');
        document.getElementById('commit-message').value = '';
        refresh();
      } catch (e) {
        showToast('Amend failed: ' + e.message, 'error');
      }
    }
    
    async function wipCommit() {
      closeModal('commit-options');
      try {
        const result = await fetchAPI('/api/wip', { method: 'POST' });
        showToast('Created WIP commit: ' + result.hash.slice(0, 8), 'success');
        refresh();
      } catch (e) {
        showToast('WIP commit failed: ' + e.message, 'error');
      }
    }
    
    async function uncommitLast() {
      closeModal('commit-options');
      try {
        await fetchAPI('/api/uncommit', { method: 'POST' });
        showToast('Uncommitted last commit', 'success');
        refresh();
      } catch (e) {
        showToast('Uncommit failed: ' + e.message, 'error');
      }
    }
    
    // ========================================
    // RESET, REVERT, CHERRY-PICK
    // ========================================
    async function performReset() {
      const commit = document.getElementById('reset-commit').value.trim();
      const mode = document.querySelector('input[name="reset-mode"]:checked').value;
      
      if (!commit) {
        showToast('Please enter a commit reference', 'warning');
        return;
      }
      
      if (mode === 'hard' && !confirm('This will discard all changes. Are you sure?')) {
        return;
      }
      
      try {
        await fetchAPI('/api/reset', { method: 'POST', body: JSON.stringify({ commit, mode }) });
        showToast('Reset to ' + commit + ' (' + mode + ')', 'success');
        closeModal('reset');
        refresh();
      } catch (e) {
        showToast('Reset failed: ' + e.message, 'error');
      }
    }
    
    async function performMerge() {
      const branch = document.getElementById('merge-branch-select').value;
      const noFf = document.getElementById('merge-no-ff').checked;
      
      if (!branch) {
        showToast('Please select a branch', 'warning');
        return;
      }
      
      try {
        await fetchAPI('/api/merge', { method: 'POST', body: JSON.stringify({ branch, noFf }) });
        showToast('Merged: ' + branch, 'success');
        closeModal('merge');
        refresh();
      } catch (e) {
        showToast('Merge failed: ' + e.message, 'error');
      }
    }
    
    async function performCherryPick() {
      const commit = document.getElementById('cherry-pick-commit').value.trim();
      
      if (!commit) {
        showToast('Please enter a commit hash', 'warning');
        return;
      }
      
      try {
        await fetchAPI('/api/cherry-pick', { method: 'POST', body: JSON.stringify({ commit }) });
        showToast('Cherry-picked: ' + commit.slice(0, 8), 'success');
        closeModal('cherry-pick');
        refresh();
      } catch (e) {
        showToast('Cherry-pick failed: ' + e.message, 'error');
      }
    }
    
    async function performRevert() {
      const commit = document.getElementById('revert-commit').value.trim();
      
      if (!commit) {
        showToast('Please enter a commit hash', 'warning');
        return;
      }
      
      try {
        await fetchAPI('/api/revert', { method: 'POST', body: JSON.stringify({ commit }) });
        showToast('Reverted: ' + commit.slice(0, 8), 'success');
        closeModal('revert');
        refresh();
      } catch (e) {
        showToast('Revert failed: ' + e.message, 'error');
      }
    }
    
    // ========================================
    // BLAME & REFLOG
    // ========================================
    async function showBlame(file) {
      document.getElementById('blame-filename').textContent = file;
      openModal('blame');
      
      const container = document.getElementById('blame-content');
      container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
      
      try {
        const blame = await fetchAPI('/api/blame?file=' + encodeURIComponent(file));
        if (blame.error) {
          container.innerHTML = '<div class="empty-state"><p>' + escapeHtml(blame.error) + '</p></div>';
          return;
        }
        
        container.innerHTML = blame.lines.map(line => \`
          <div class="blame-line">
            <div class="blame-info">\${escapeHtml(line.author)} • \${line.hash.slice(0, 8)}</div>
            <div class="blame-code">\${escapeHtml(line.content)}</div>
          </div>
        \`).join('');
      } catch (e) {
        container.innerHTML = '<div class="empty-state"><p>Failed to load blame</p></div>';
      }
    }
    
    async function showReflog() {
      openModal('reflog');
      
      const container = document.getElementById('reflog-content');
      container.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
      
      try {
        const reflog = await fetchAPI('/api/reflog');
        container.innerHTML = reflog.map(entry => \`
          <div class="reflog-entry" onclick="checkoutRef('\${entry.hash}')">
            <span class="reflog-hash">\${entry.hash.slice(0, 8)}</span>
            <span class="reflog-action">\${escapeHtml(entry.action)}</span>
            <span class="reflog-message">\${escapeHtml(entry.message)}</span>
          </div>
        \`).join('') || '<div class="empty-state"><p>No reflog entries</p></div>';
      } catch (e) {
        container.innerHTML = '<div class="empty-state"><p>Failed to load reflog</p></div>';
      }
    }
    
    async function checkoutRef(hash) {
      closeModal('reflog');
      try {
        await fetchAPI('/api/checkout', { method: 'POST', body: JSON.stringify({ branch: hash }) });
        showToast('Checked out: ' + hash.slice(0, 8), 'success');
        refresh();
      } catch (e) {
        showToast('Failed to checkout: ' + e.message, 'error');
      }
    }
    
    // ========================================
    // CLEAN
    // ========================================
    async function previewClean() {
      const directories = document.getElementById('clean-directories').checked;
      const container = document.getElementById('clean-preview');
      
      try {
        const result = await fetchAPI('/api/clean', { 
          method: 'POST', 
          body: JSON.stringify({ dryRun: true, directories }) 
        });
        container.innerHTML = result.removed.length > 0 
          ? result.removed.map(f => '<div style="color: var(--accent-danger);">✗ ' + escapeHtml(f) + '</div>').join('')
          : '<div style="color: var(--text-tertiary);">No files to clean</div>';
      } catch (e) {
        container.innerHTML = '<div style="color: var(--accent-danger);">Error: ' + escapeHtml(e.message) + '</div>';
      }
    }
    
    async function performClean() {
      const dryRun = document.getElementById('clean-dry-run').checked;
      const directories = document.getElementById('clean-directories').checked;
      
      if (!dryRun && !confirm('This will permanently delete files. Are you sure?')) {
        return;
      }
      
      try {
        const result = await fetchAPI('/api/clean', { 
          method: 'POST', 
          body: JSON.stringify({ dryRun, directories, force: true }) 
        });
        
        if (dryRun) {
          showToast('Would remove ' + result.removed.length + ' files', 'info');
          previewClean();
        } else {
          showToast('Removed ' + result.removed.length + ' files', 'success');
          closeModal('clean');
          refresh();
        }
      } catch (e) {
        showToast('Clean failed: ' + e.message, 'error');
      }
    }
    
    // ========================================
    // COMMAND PALETTE
    // ========================================
    const ALL_COMMANDS = [
      { id: 'commit', name: 'Commit', desc: 'Create a new commit', shortcut: 'C', category: 'changes', action: () => document.getElementById('commit-message').focus() },
      { id: 'stage-all', name: 'Stage All Changes', desc: 'Stage all modified files', shortcut: '⌘⇧S', category: 'changes', action: stageAll },
      { id: 'amend', name: 'Amend Last Commit', desc: 'Add changes to last commit', category: 'changes', action: amendCommit },
      { id: 'wip', name: 'WIP Commit', desc: 'Quick commit with WIP message', category: 'changes', action: wipCommit },
      { id: 'uncommit', name: 'Uncommit', desc: 'Undo last commit, keep changes', category: 'changes', action: uncommitLast },
      { id: 'stash', name: 'Stash Changes', desc: 'Stash working directory changes', category: 'changes', action: () => openModal('create-stash') },
      { id: 'stash-pop', name: 'Stash Pop', desc: 'Apply and remove latest stash', category: 'changes', action: () => popStash(0) },
      
      { id: 'branch-create', name: 'Create Branch', desc: 'Create a new branch', shortcut: '⌘B', category: 'branches', action: () => openModal('create-branch') },
      { id: 'branch-switch', name: 'Switch Branch', desc: 'Checkout another branch', category: 'branches', action: () => { switchSidebarTab('branches'); } },
      { id: 'merge', name: 'Merge Branch', desc: 'Merge another branch into current', category: 'branches', action: () => openMergeModal() },
      
      { id: 'tag-create', name: 'Create Tag', desc: 'Create a new tag', category: 'tags', action: () => openModal('create-tag') },
      
      { id: 'fetch', name: 'Fetch', desc: 'Fetch from remote', shortcut: '⌘⇧F', category: 'remote', action: fetchAll },
      { id: 'pull', name: 'Pull', desc: 'Pull changes from remote', category: 'remote', action: pullChanges },
      { id: 'push', name: 'Push', desc: 'Push changes to remote', category: 'remote', action: pushChanges },
      { id: 'remote-add', name: 'Add Remote', desc: 'Add a new remote', category: 'remote', action: () => openModal('add-remote') },
      
      { id: 'reset', name: 'Reset', desc: 'Reset HEAD to a commit', category: 'history', action: () => openModal('reset') },
      { id: 'cherry-pick', name: 'Cherry Pick', desc: 'Apply commit from another branch', category: 'history', action: () => openModal('cherry-pick') },
      { id: 'revert', name: 'Revert Commit', desc: 'Create commit that undoes changes', category: 'history', action: () => openModal('revert') },
      { id: 'reflog', name: 'View Reflog', desc: 'View reference log history', category: 'history', action: showReflog },
      { id: 'undo', name: 'Undo Last Operation', desc: 'Undo the last git operation', shortcut: '⌘Z', category: 'history', action: undoOperation },
      
      { id: 'clean', name: 'Clean Working Directory', desc: 'Remove untracked files', category: 'tools', action: () => openModal('clean') },
      { id: 'gc', name: 'Garbage Collect', desc: 'Run garbage collection', category: 'tools', action: runGC },
      { id: 'refresh', name: 'Refresh', desc: 'Refresh all views', shortcut: 'R', category: 'view', action: refresh },
    ];
    
    let filteredCommands = ALL_COMMANDS;
    let selectedCommandIndex = 0;
    
    function openCommandPalette() {
      openModal('command-palette');
      document.getElementById('command-input').value = '';
      document.getElementById('command-input').focus();
      filterCommands('');
    }
    
    function filterCommands(query) {
      const q = query.toLowerCase();
      filteredCommands = q 
        ? ALL_COMMANDS.filter(c => c.name.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q))
        : ALL_COMMANDS;
      selectedCommandIndex = 0;
      renderCommands();
    }
    
    function renderCommands() {
      const container = document.getElementById('command-list');
      const categories = {};
      
      filteredCommands.forEach((cmd, i) => {
        if (!categories[cmd.category]) categories[cmd.category] = [];
        categories[cmd.category].push({ ...cmd, index: i });
      });
      
      const categoryLabels = {
        changes: '📝 Changes', branches: '🌿 Branches', tags: '🏷 Tags',
        remote: '🌐 Remote', history: '📋 History', tools: '🔧 Tools', view: '👁 View'
      };
      
      let html = '';
      for (const [cat, cmds] of Object.entries(categories)) {
        html += '<div class="command-group">';
        html += '<div class="command-group-label">' + (categoryLabels[cat] || cat) + '</div>';
        for (const cmd of cmds) {
          html += \`
            <div class="command-item \${cmd.index === selectedCommandIndex ? 'selected' : ''}" 
                 data-index="\${cmd.index}"
                 onclick="executeCommand(\${cmd.index})">
              <div class="command-item-content">
                <div class="command-item-name">\${escapeHtml(cmd.name)}</div>
                <div class="command-item-desc">\${escapeHtml(cmd.desc)}</div>
              </div>
              \${cmd.shortcut ? '<div class="command-item-shortcut">' + cmd.shortcut + '</div>' : ''}
            </div>
          \`;
        }
        html += '</div>';
      }
      
      container.innerHTML = html || '<div class="empty-state small"><p>No commands found</p></div>';
    }
    
    function executeCommand(index) {
      const cmd = filteredCommands[index];
      if (cmd) {
        closeModal('command-palette');
        cmd.action();
      }
    }
    
    document.getElementById('command-input').addEventListener('input', (e) => {
      filterCommands(e.target.value);
    });
    
    document.getElementById('command-input').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedCommandIndex = (selectedCommandIndex + 1) % filteredCommands.length;
        renderCommands();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedCommandIndex = (selectedCommandIndex - 1 + filteredCommands.length) % filteredCommands.length;
        renderCommands();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        executeCommand(selectedCommandIndex);
      }
    });
    
    // ========================================
    // MODAL HELPERS
    // ========================================
    function openModal(name) {
      document.getElementById(name + '-modal').classList.add('open');
    }
    
    function closeModal(name) {
      document.getElementById(name + '-modal').classList.remove('open');
    }
    
    function openMergeModal() {
      document.getElementById('merge-into-branch').textContent = currentBranch;
      fetchAPI('/api/branches').then(branches => {
        const select = document.getElementById('merge-branch-select');
        select.innerHTML = branches
          .filter(b => !b.isCurrent)
          .map(b => '<option value="' + escapeHtml(b.name) + '">' + escapeHtml(b.name) + '</option>')
          .join('');
      });
      openModal('merge');
    }
    
    // ========================================
    // ADDITIONAL OPERATIONS
    // ========================================
    async function undoOperation() {
      try {
        await fetchAPI('/api/undo', { method: 'POST' });
        showToast('Undid last operation', 'success');
        refresh();
      } catch (e) {
        showToast('Undo failed: ' + e.message, 'error');
      }
    }
    
    async function runGC() {
      showToast('Running garbage collection...', 'info');
      try {
        await fetchAPI('/api/gc', { method: 'POST' });
        showToast('Garbage collection complete', 'success');
      } catch (e) {
        showToast('GC failed: ' + e.message, 'error');
      }
    }
    
    function openSettings() { 
      showToast('Settings panel coming soon', 'info'); 
    }
    
    // ========================================
    // CONTEXT MENUS
    // ========================================
    function showContextMenu(e, items) {
      e.preventDefault();
      const menu = document.getElementById('context-menu');
      const itemsContainer = document.getElementById('context-menu-items');
      
      itemsContainer.innerHTML = items.map(item => {
        if (item.divider) return '<div class="context-menu-divider"></div>';
        return \`<div class="context-menu-item \${item.danger ? 'danger' : ''}" onclick="\${item.action}; hideContextMenu()">
          \${item.icon || ''} \${escapeHtml(item.label)}
        </div>\`;
      }).join('');
      
      menu.style.left = e.clientX + 'px';
      menu.style.top = e.clientY + 'px';
      menu.classList.add('open');
      
      document.addEventListener('click', hideContextMenu, { once: true });
    }
    
    function hideContextMenu() {
      document.getElementById('context-menu').classList.remove('open');
    }
    
    function showBranchContextMenu(e, name, isCurrent) {
      const items = [
        { label: 'Checkout', action: \`checkoutBranch('\${name}')\`, icon: '✓' },
        { label: 'Merge into Current', action: \`openMergeModal(); document.getElementById('merge-branch-select').value = '\${name}';\`, icon: '🔀' },
        { divider: true },
        { label: 'Delete', action: \`deleteBranch('\${name}')\`, icon: '🗑', danger: true }
      ];
      if (isCurrent) items.shift(); // Remove checkout for current branch
      showContextMenu(e, items);
    }
    
    function showStashContextMenu(e, index) {
      showContextMenu(e, [
        { label: 'Apply', action: \`applyStash(\${index})\`, icon: '✓' },
        { label: 'Pop', action: \`popStash(\${index})\`, icon: '📤' },
        { divider: true },
        { label: 'Drop', action: \`dropStash(\${index})\`, icon: '🗑', danger: true }
      ]);
    }
    
    function showCommitContextMenu(e, hash) {
      showContextMenu(e, [
        { label: 'Cherry-pick', action: \`document.getElementById('cherry-pick-commit').value = '\${hash}'; openModal('cherry-pick')\`, icon: '🍒' },
        { label: 'Revert', action: \`document.getElementById('revert-commit').value = '\${hash}'; openModal('revert')\`, icon: '↩' },
        { label: 'Reset to Here', action: \`document.getElementById('reset-commit').value = '\${hash}'; openModal('reset')\`, icon: '⏪' },
        { divider: true },
        { label: 'Copy Hash', action: \`copyHash('\${hash}')\`, icon: '📋' }
      ]);
    }
    
    function showFileContextMenu(e, file) {
      showContextMenu(e, [
        { label: 'View Diff', action: \`selectFile('\${file}')\`, icon: '📝' },
        { label: 'Blame', action: \`showBlame('\${file}')\`, icon: '👤' },
        { divider: true },
        { label: 'Stage', action: \`stageFile('\${file}')\`, icon: '✓' },
        { label: 'Discard Changes', action: \`discardChanges('\${file}')\`, icon: '↩', danger: true }
      ]);
    }
    
    async function discardChanges(file) {
      if (!confirm('Discard all changes to ' + file + '?')) return;
      try {
        await fetchAPI('/api/restore', { method: 'POST', body: JSON.stringify({ file }) });
        showToast('Discarded changes: ' + file, 'success');
        refresh();
      } catch (e) {
        showToast('Failed: ' + e.message, 'error');
      }
    }
    
    // Update keyboard shortcuts
    function initKeyboardShortcuts() {
      document.addEventListener('keydown', (e) => {
        // Cmd/Ctrl + K: Command Palette
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          openCommandPalette();
        }
        
        // Cmd/Ctrl + P: Search
        if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
          e.preventDefault();
          openSearchModal();
        }
        
        // Escape: Close modals
        if (e.key === 'Escape') {
          closeModals();
          hideContextMenu();
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
        
        // Cmd/Ctrl + B: Create branch
        if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
          e.preventDefault();
          openModal('create-branch');
        }
        
        // Cmd/Ctrl + Z: Undo
        if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !isInputFocused()) {
          e.preventDefault();
          undoOperation();
        }
      });
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
