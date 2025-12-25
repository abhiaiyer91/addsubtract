/**
 * Visual Merge Conflict Resolution UI for tsgit
 * Interactive 3-way merge with visual diff
 */

/**
 * Conflict marker types
 */
export type ConflictSide = 'ours' | 'theirs' | 'both' | 'neither';

/**
 * Conflict hunk
 */
export interface ConflictHunk {
  id: number;
  startLine: number;
  endLine: number;
  ours: string[];
  base?: string[];
  theirs: string[];
  resolution: ConflictSide | 'custom';
  customResolution?: string[];
  isResolved: boolean;
}

/**
 * Parsed conflict file
 */
export interface ConflictFile {
  path: string;
  originalContent: string;
  hunks: ConflictHunk[];
  lines: string[];
  hasUnresolvedConflicts: boolean;
}

/**
 * Conflict markers
 */
const MARKERS = {
  OURS_START: '<<<<<<<',
  BASE_DIVIDER: '|||||||',
  SEPARATOR: '=======',
  THEIRS_END: '>>>>>>>',
};

/**
 * Parse conflict markers from file content
 */
export function parseConflictFile(path: string, content: string): ConflictFile {
  const lines = content.split('\n');
  const hunks: ConflictHunk[] = [];
  const resultLines: string[] = [];

  let i = 0;
  let hunkId = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith(MARKERS.OURS_START)) {
      // Start of conflict
      const hunk: ConflictHunk = {
        id: hunkId++,
        startLine: resultLines.length,
        endLine: 0,
        ours: [],
        theirs: [],
        resolution: 'ours',
        isResolved: false,
      };

      i++; // Skip marker line

      // Collect "ours" lines
      while (i < lines.length && !lines[i].startsWith(MARKERS.BASE_DIVIDER) && !lines[i].startsWith(MARKERS.SEPARATOR)) {
        hunk.ours.push(lines[i]);
        i++;
      }

      // Check for base (3-way diff)
      if (lines[i]?.startsWith(MARKERS.BASE_DIVIDER)) {
        i++; // Skip marker
        hunk.base = [];
        while (i < lines.length && !lines[i].startsWith(MARKERS.SEPARATOR)) {
          hunk.base.push(lines[i]);
          i++;
        }
      }

      // Skip separator
      if (lines[i]?.startsWith(MARKERS.SEPARATOR)) {
        i++;
      }

      // Collect "theirs" lines
      while (i < lines.length && !lines[i].startsWith(MARKERS.THEIRS_END)) {
        hunk.theirs.push(lines[i]);
        i++;
      }

      // Skip end marker
      if (lines[i]?.startsWith(MARKERS.THEIRS_END)) {
        i++;
      }

      hunk.endLine = resultLines.length;
      hunks.push(hunk);

      // Add placeholder for conflict
      resultLines.push(`<<<CONFLICT:${hunk.id}>>>`);
    } else {
      resultLines.push(line);
      i++;
    }
  }

  return {
    path,
    originalContent: content,
    hunks,
    lines: resultLines,
    hasUnresolvedConflicts: hunks.length > 0,
  };
}

/**
 * Resolve a conflict hunk
 */
export function resolveHunk(hunk: ConflictHunk, resolution: ConflictSide | 'custom', customLines?: string[]): void {
  hunk.resolution = resolution;
  if (resolution === 'custom' && customLines) {
    hunk.customResolution = customLines;
  }
  hunk.isResolved = true;
}

/**
 * Get resolved content for a hunk
 */
export function getResolvedHunkContent(hunk: ConflictHunk): string[] {
  switch (hunk.resolution) {
    case 'ours':
      return hunk.ours;
    case 'theirs':
      return hunk.theirs;
    case 'both':
      return [...hunk.ours, ...hunk.theirs];
    case 'neither':
      return [];
    case 'custom':
      return hunk.customResolution || [];
    default:
      return hunk.ours;
  }
}

/**
 * Generate resolved file content
 */
export function generateResolvedContent(file: ConflictFile): string {
  const resultLines: string[] = [];

  for (const line of file.lines) {
    const match = line.match(/<<<CONFLICT:(\d+)>>>/);
    if (match) {
      const hunkId = parseInt(match[1], 10);
      const hunk = file.hunks.find(h => h.id === hunkId);
      if (hunk) {
        resultLines.push(...getResolvedHunkContent(hunk));
      }
    } else {
      resultLines.push(line);
    }
  }

  return resultLines.join('\n');
}

/**
 * Render conflict resolver HTML
 */
export function renderConflictResolverHTML(file: ConflictFile): string {
  if (file.hunks.length === 0) {
    return `
      <div class="conflict-empty">
        <div class="conflict-empty-icon">✓</div>
        <p>No conflicts in this file</p>
      </div>
    `;
  }

  const unresolvedCount = file.hunks.filter(h => !h.isResolved).length;

  return `
    <div class="conflict-resolver">
      <div class="conflict-header">
        <h3 class="conflict-title">📝 ${escapeHtml(file.path)}</h3>
        <div class="conflict-status">
          ${unresolvedCount > 0 
            ? `<span class="conflict-badge warning">${unresolvedCount} unresolved</span>`
            : `<span class="conflict-badge success">All resolved</span>`
          }
        </div>
      </div>

      <div class="conflict-hunks">
        ${file.hunks.map((hunk, index) => renderConflictHunkHTML(hunk, index, file.hunks.length)).join('')}
      </div>

      <div class="conflict-footer">
        <button class="btn btn-secondary" id="conflict-reset">Reset All</button>
        <button class="btn btn-primary" id="conflict-apply" ${unresolvedCount > 0 ? 'disabled' : ''}>
          Apply Resolution
        </button>
      </div>
    </div>
  `;
}

/**
 * Render a single conflict hunk
 */
function renderConflictHunkHTML(hunk: ConflictHunk, index: number, total: number): string {
  return `
    <div class="conflict-hunk ${hunk.isResolved ? 'resolved' : ''}" data-hunk="${hunk.id}">
      <div class="conflict-hunk-header">
        <span class="conflict-hunk-title">Conflict ${index + 1} of ${total}</span>
        <span class="conflict-hunk-status">
          ${hunk.isResolved 
            ? `<span class="badge success">✓ Resolved (${hunk.resolution})</span>`
            : '<span class="badge warning">Unresolved</span>'
          }
        </span>
      </div>

      <div class="conflict-comparison">
        <div class="conflict-side ours">
          <div class="conflict-side-header">
            <span class="conflict-side-label">Ours (Current)</span>
            <button class="btn btn-sm" onclick="resolveConflict(${hunk.id}, 'ours')">Accept</button>
          </div>
          <pre class="conflict-code">${escapeHtml(hunk.ours.join('\n')) || '<em>No changes</em>'}</pre>
        </div>

        ${hunk.base ? `
          <div class="conflict-side base">
            <div class="conflict-side-header">
              <span class="conflict-side-label">Base (Original)</span>
            </div>
            <pre class="conflict-code">${escapeHtml(hunk.base.join('\n')) || '<em>No content</em>'}</pre>
          </div>
        ` : ''}

        <div class="conflict-side theirs">
          <div class="conflict-side-header">
            <span class="conflict-side-label">Theirs (Incoming)</span>
            <button class="btn btn-sm" onclick="resolveConflict(${hunk.id}, 'theirs')">Accept</button>
          </div>
          <pre class="conflict-code">${escapeHtml(hunk.theirs.join('\n')) || '<em>No changes</em>'}</pre>
        </div>
      </div>

      <div class="conflict-actions">
        <button class="btn btn-sm" onclick="resolveConflict(${hunk.id}, 'both')">Accept Both</button>
        <button class="btn btn-sm" onclick="resolveConflict(${hunk.id}, 'neither')">Accept Neither</button>
        <button class="btn btn-sm" onclick="editConflict(${hunk.id})">Edit Manually</button>
      </div>

      ${hunk.isResolved ? `
        <div class="conflict-resolution">
          <div class="conflict-side-header">
            <span class="conflict-side-label">Resolution</span>
            <button class="btn btn-sm" onclick="unresolveConflict(${hunk.id})">Undo</button>
          </div>
          <pre class="conflict-code resolved">${escapeHtml(getResolvedHunkContent(hunk).join('\n')) || '<em>Empty</em>'}</pre>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Escape HTML
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Get conflict resolver CSS
 */
export function getConflictResolverStyles(): string {
  return `
    .conflict-resolver {
      background: var(--bg-secondary);
      border-radius: var(--border-radius-lg);
      overflow: hidden;
    }

    .conflict-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-md) var(--spacing-lg);
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border-default);
    }

    .conflict-title {
      margin: 0;
      font-size: var(--font-size-lg);
      font-weight: 600;
      color: var(--text-primary);
    }

    .conflict-badge {
      padding: var(--spacing-xs) var(--spacing-sm);
      border-radius: var(--border-radius-full);
      font-size: var(--font-size-sm);
      font-weight: 500;
    }

    .conflict-badge.warning {
      background: rgba(210, 153, 34, 0.2);
      color: var(--accent-warning);
    }

    .conflict-badge.success {
      background: rgba(63, 185, 80, 0.2);
      color: var(--accent-success);
    }

    .conflict-hunks {
      padding: var(--spacing-md);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-lg);
    }

    .conflict-hunk {
      background: var(--bg-primary);
      border: 1px solid var(--border-default);
      border-radius: var(--border-radius);
      overflow: hidden;
    }

    .conflict-hunk.resolved {
      border-color: var(--accent-success);
    }

    .conflict-hunk-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border-default);
    }

    .conflict-hunk-title {
      font-weight: 500;
      color: var(--text-primary);
    }

    .badge {
      padding: 2px 8px;
      border-radius: var(--border-radius-full);
      font-size: var(--font-size-xs);
    }

    .badge.warning {
      background: rgba(210, 153, 34, 0.2);
      color: var(--accent-warning);
    }

    .badge.success {
      background: rgba(63, 185, 80, 0.2);
      color: var(--accent-success);
    }

    .conflict-comparison {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      background: var(--border-default);
    }

    .conflict-comparison.three-way {
      grid-template-columns: 1fr 1fr 1fr;
    }

    .conflict-side {
      background: var(--bg-primary);
    }

    .conflict-side.ours {
      border-left: 3px solid var(--git-modified);
    }

    .conflict-side.base {
      border-left: 3px solid var(--text-muted);
    }

    .conflict-side.theirs {
      border-left: 3px solid var(--accent-success);
    }

    .conflict-side-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-default);
    }

    .conflict-side-label {
      font-size: var(--font-size-sm);
      font-weight: 500;
      color: var(--text-secondary);
    }

    .conflict-code {
      margin: 0;
      padding: var(--spacing-md);
      font-family: var(--font-family-mono);
      font-size: var(--font-size-sm);
      line-height: 1.5;
      color: var(--text-primary);
      overflow-x: auto;
      max-height: 200px;
      overflow-y: auto;
    }

    .conflict-code.resolved {
      background: rgba(63, 185, 80, 0.05);
    }

    .conflict-code em {
      color: var(--text-muted);
      font-style: italic;
    }

    .conflict-actions {
      display: flex;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm) var(--spacing-md);
      background: var(--bg-tertiary);
      border-top: 1px solid var(--border-default);
    }

    .conflict-resolution {
      border-top: 1px solid var(--border-default);
    }

    .conflict-footer {
      display: flex;
      justify-content: flex-end;
      gap: var(--spacing-sm);
      padding: var(--spacing-md) var(--spacing-lg);
      background: var(--bg-tertiary);
      border-top: 1px solid var(--border-default);
    }

    .conflict-empty {
      text-align: center;
      padding: var(--spacing-xxl);
      color: var(--text-muted);
    }

    .conflict-empty-icon {
      font-size: 48px;
      margin-bottom: var(--spacing-md);
      color: var(--accent-success);
    }

    .btn-sm {
      padding: 4px 8px;
      font-size: var(--font-size-xs);
    }

    @media (max-width: 768px) {
      .conflict-comparison {
        grid-template-columns: 1fr;
      }
    }
  `;
}

/**
 * Conflict resolver controller
 */
export class ConflictResolver {
  private file: ConflictFile | null = null;
  private container: HTMLElement | null = null;
  private onResolve?: (content: string) => void;

  /**
   * Mount resolver to container
   */
  mount(container: HTMLElement): void {
    this.container = container;
  }

  /**
   * Load a conflict file
   */
  load(path: string, content: string, onResolve?: (content: string) => void): void {
    this.file = parseConflictFile(path, content);
    this.onResolve = onResolve;
    this.render();
  }

  /**
   * Resolve a hunk
   */
  resolveHunk(hunkId: number, resolution: ConflictSide): void {
    if (!this.file) return;

    const hunk = this.file.hunks.find(h => h.id === hunkId);
    if (hunk) {
      resolveHunk(hunk, resolution);
      this.file.hasUnresolvedConflicts = this.file.hunks.some(h => !h.isResolved);
      this.render();
    }
  }

  /**
   * Unresolve a hunk
   */
  unresolveHunk(hunkId: number): void {
    if (!this.file) return;

    const hunk = this.file.hunks.find(h => h.id === hunkId);
    if (hunk) {
      hunk.isResolved = false;
      hunk.resolution = 'ours';
      hunk.customResolution = undefined;
      this.file.hasUnresolvedConflicts = true;
      this.render();
    }
  }

  /**
   * Reset all resolutions
   */
  reset(): void {
    if (!this.file) return;

    for (const hunk of this.file.hunks) {
      hunk.isResolved = false;
      hunk.resolution = 'ours';
      hunk.customResolution = undefined;
    }
    this.file.hasUnresolvedConflicts = true;
    this.render();
  }

  /**
   * Apply resolution and get result
   */
  apply(): string | null {
    if (!this.file || this.file.hasUnresolvedConflicts) return null;

    const content = generateResolvedContent(this.file);
    if (this.onResolve) {
      this.onResolve(content);
    }
    return content;
  }

  /**
   * Render the UI
   */
  private render(): void {
    if (!this.container || !this.file) return;
    this.container.innerHTML = renderConflictResolverHTML(this.file);
  }
}
