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
 * Render conflict resolver HTML - GitKraken-style 3-pane design
 */
export function renderConflictResolverHTML(file: ConflictFile): string {
  if (file.hunks.length === 0) {
    return `
      <div class="conflict-empty">
        <div class="conflict-empty-icon">✅</div>
        <h3>No Conflicts</h3>
        <p>This file has no merge conflicts to resolve</p>
      </div>
    `;
  }

  const unresolvedCount = file.hunks.filter(h => !h.isResolved).length;
  const resolvedCount = file.hunks.length - unresolvedCount;
  const progressPercent = Math.round((resolvedCount / file.hunks.length) * 100);

  return `
    <div class="conflict-resolver">
      <div class="conflict-header">
        <h3 class="conflict-title">
          <span class="conflict-title-icon">⚠️</span>
          ${escapeHtml(file.path)}
        </h3>
        <div class="conflict-progress">
          <div class="conflict-progress-bar">
            <div class="conflict-progress-fill" style="width: ${progressPercent}%"></div>
          </div>
          <span class="conflict-progress-text">${resolvedCount}/${file.hunks.length}</span>
        </div>
        ${unresolvedCount > 0 
          ? `<span class="conflict-badge warning">${unresolvedCount} conflict${unresolvedCount > 1 ? 's' : ''} remaining</span>`
          : `<span class="conflict-badge success">All resolved ✓</span>`
        }
      </div>

      <div class="conflict-hunks">
        ${file.hunks.map((hunk, index) => renderConflictHunkHTML(hunk, index, file.hunks.length)).join('')}
      </div>

      <div class="conflict-footer">
        <div class="conflict-footer-left">
          <button class="conflict-footer-btn secondary" id="conflict-reset" onclick="resetAllConflicts()">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 3a5 5 0 104.546 2.914.5.5 0 01.908-.417A6 6 0 118 2v1z"/>
              <path d="M8 4.466V.534a.25.25 0 01.41-.192l2.36 1.966a.25.25 0 010 .384L8.41 4.658A.25.25 0 018 4.466z"/>
            </svg>
            Reset All
          </button>
        </div>
        <div class="conflict-footer-right">
          <button class="conflict-footer-btn secondary" onclick="closeConflictResolver()">
            Cancel
          </button>
          <button class="conflict-footer-btn primary" id="conflict-apply" ${unresolvedCount > 0 ? 'disabled' : ''} onclick="applyResolution()">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
            </svg>
            Save Resolution
          </button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render a single conflict hunk - GitKraken-style 3-pane layout
 */
function renderConflictHunkHTML(hunk: ConflictHunk, index: number, total: number): string {
  const hasBase = hunk.base && hunk.base.length > 0;
  
  return `
    <div class="conflict-hunk ${hunk.isResolved ? 'resolved' : ''}" data-hunk="${hunk.id}">
      <div class="conflict-hunk-header">
        <span class="conflict-hunk-title">
          <span class="conflict-hunk-number">${index + 1}</span>
          Conflict ${index + 1} of ${total}
        </span>
        <span class="conflict-hunk-status">
          ${hunk.isResolved 
            ? `<span class="badge success">✓ ${capitalizeFirst(hunk.resolution)}</span>`
            : '<span class="badge warning">Needs Resolution</span>'
          }
        </span>
      </div>

      <div class="conflict-comparison ${hasBase ? '' : 'two-way'}">
        <!-- OURS / Current Branch -->
        <div class="conflict-side ours">
          <div class="conflict-side-header">
            <span class="conflict-side-label">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/>
              </svg>
              CURRENT
            </span>
            <button class="conflict-side-btn" onclick="resolveConflict(${hunk.id}, 'ours')">
              Accept Ours
            </button>
          </div>
          <pre class="conflict-code">${formatCodeWithLineNumbers(hunk.ours) || '<em>Empty</em>'}</pre>
        </div>

        ${hasBase ? `
        <!-- BASE / Original -->
        <div class="conflict-side base">
          <div class="conflict-side-header">
            <span class="conflict-side-label">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM0 8a8 8 0 1116 0A8 8 0 010 8z"/>
              </svg>
              BASE
            </span>
          </div>
          <pre class="conflict-code">${formatCodeWithLineNumbers(hunk.base!) || '<em>No base content</em>'}</pre>
        </div>
        ` : ''}

        <!-- THEIRS / Incoming Branch -->
        <div class="conflict-side theirs">
          <div class="conflict-side-header">
            <span class="conflict-side-label">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 16A8 8 0 108 0a8 8 0 000 16zm.25-11.25v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5a.75.75 0 011.5 0z"/>
              </svg>
              INCOMING
            </span>
            <button class="conflict-side-btn" onclick="resolveConflict(${hunk.id}, 'theirs')">
              Accept Theirs
            </button>
          </div>
          <pre class="conflict-code">${formatCodeWithLineNumbers(hunk.theirs) || '<em>Empty</em>'}</pre>
        </div>
      </div>

      <div class="conflict-actions">
        <button class="conflict-action-btn" onclick="resolveConflict(${hunk.id}, 'ours')">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4a4 4 0 100 8 4 4 0 000-8z"/>
          </svg>
          Keep Current
        </button>
        <button class="conflict-action-btn" onclick="resolveConflict(${hunk.id}, 'theirs')">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 4a4 4 0 100 8 4 4 0 000-8z"/>
          </svg>
          Keep Incoming
        </button>
        <button class="conflict-action-btn" onclick="resolveConflict(${hunk.id}, 'both')">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 8a.5.5 0 01.5-.5h13a.5.5 0 010 1h-13A.5.5 0 011 8zm4.646-2.146a.5.5 0 010-.708l2-2a.5.5 0 01.708.708L6.707 5.5H14.5a.5.5 0 010 1H6.707l1.647 1.646a.5.5 0 01-.708.708l-2-2zm4.708 4.292a.5.5 0 010 .708l-2 2a.5.5 0 01-.708-.708L9.293 10.5H1.5a.5.5 0 010-1h7.793l-1.647-1.646a.5.5 0 01.708-.708l2 2z"/>
          </svg>
          Keep Both
        </button>
        <button class="conflict-action-btn primary" onclick="editConflict(${hunk.id})">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 00-.064.108l-.558 1.953 1.953-.558a.253.253 0 00.108-.064l6.286-6.286z"/>
          </svg>
          Edit Manually
        </button>
      </div>

      ${hunk.isResolved ? `
        <div class="conflict-resolution">
          <div class="conflict-resolution-header">
            <span class="conflict-resolution-label">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 16A8 8 0 108 0a8 8 0 000 16zm3.78-9.72a.75.75 0 00-1.06-1.06L6.75 9.19 5.28 7.72a.75.75 0 00-1.06 1.06l2 2a.75.75 0 001.06 0l4.5-4.5z"/>
              </svg>
              Resolution Preview
            </span>
            <button class="conflict-side-btn" style="background: #ef4444" onclick="unresolveConflict(${hunk.id})">
              Undo
            </button>
          </div>
          <pre class="conflict-code resolved">${formatCodeWithLineNumbers(getResolvedHunkContent(hunk)) || '<em>Empty result</em>'}</pre>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Format code with subtle line styling
 */
function formatCodeWithLineNumbers(lines: string[]): string {
  if (!lines || lines.length === 0) return '';
  return lines.map(line => escapeHtml(line)).join('\n');
}

/**
 * Capitalize first letter
 */
function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
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
 * Get conflict resolver CSS - GitKraken-inspired 3-pane design
 */
export function getConflictResolverStyles(): string {
  return `
    /* ========================================
       CONFLICT RESOLVER - GitKraken Style
       ======================================== */
    
    .conflict-resolver {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--bg-primary, #0d1117);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
    }

    .conflict-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 24px;
      background: linear-gradient(180deg, #1c2128 0%, #161b22 100%);
      border-bottom: 1px solid #30363d;
    }

    .conflict-title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #e6edf3;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .conflict-title-icon {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #f85149 0%, #da3633 100%);
      border-radius: 6px;
      font-size: 14px;
    }

    .conflict-badge {
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .conflict-badge.warning {
      background: linear-gradient(135deg, rgba(210, 153, 34, 0.2) 0%, rgba(251, 191, 36, 0.15) 100%);
      color: #fbbf24;
      border: 1px solid rgba(251, 191, 36, 0.3);
    }

    .conflict-badge.success {
      background: linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(74, 222, 128, 0.15) 100%);
      color: #4ade80;
      border: 1px solid rgba(74, 222, 128, 0.3);
    }

    .conflict-progress {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-left: auto;
      margin-right: 16px;
    }

    .conflict-progress-bar {
      width: 120px;
      height: 6px;
      background: #21262d;
      border-radius: 3px;
      overflow: hidden;
    }

    .conflict-progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #22c55e 0%, #4ade80 100%);
      transition: width 0.3s ease;
      border-radius: 3px;
    }

    .conflict-progress-text {
      font-size: 12px;
      color: #8b949e;
    }

    /* Three-pane layout like GitKraken */
    .conflict-hunks {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .conflict-hunk {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      overflow: hidden;
      transition: all 0.2s ease;
    }

    .conflict-hunk:hover {
      border-color: #484f58;
    }

    .conflict-hunk.resolved {
      border-color: #22c55e;
      box-shadow: 0 0 0 1px rgba(34, 197, 94, 0.1);
    }

    .conflict-hunk-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: linear-gradient(180deg, #21262d 0%, #1c2128 100%);
      border-bottom: 1px solid #30363d;
    }

    .conflict-hunk-title {
      font-weight: 600;
      font-size: 14px;
      color: #e6edf3;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .conflict-hunk-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      background: #6366f1;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
    }

    .badge {
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }

    .badge.warning {
      background: rgba(251, 191, 36, 0.15);
      color: #fbbf24;
    }

    .badge.success {
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
    }

    /* GitKraken-style 3-column comparison */
    .conflict-comparison {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      min-height: 200px;
    }

    .conflict-comparison.two-way {
      grid-template-columns: 1fr 1fr;
    }

    .conflict-side {
      display: flex;
      flex-direction: column;
      border-right: 1px solid #30363d;
      overflow: hidden;
    }

    .conflict-side:last-child {
      border-right: none;
    }

    .conflict-side.ours .conflict-side-header {
      background: linear-gradient(90deg, rgba(236, 72, 153, 0.15) 0%, transparent 100%);
      border-left: 3px solid #ec4899;
    }

    .conflict-side.base .conflict-side-header {
      background: linear-gradient(90deg, rgba(139, 92, 246, 0.15) 0%, transparent 100%);
      border-left: 3px solid #8b5cf6;
    }

    .conflict-side.theirs .conflict-side-header {
      background: linear-gradient(90deg, rgba(34, 197, 94, 0.15) 0%, transparent 100%);
      border-left: 3px solid #22c55e;
    }

    .conflict-side.output .conflict-side-header {
      background: linear-gradient(90deg, rgba(99, 102, 241, 0.15) 0%, transparent 100%);
      border-left: 3px solid #6366f1;
    }

    .conflict-side-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: #1c2128;
      border-bottom: 1px solid #30363d;
      flex-shrink: 0;
    }

    .conflict-side-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .conflict-side.ours .conflict-side-label { color: #ec4899; }
    .conflict-side.base .conflict-side-label { color: #8b5cf6; }
    .conflict-side.theirs .conflict-side-label { color: #22c55e; }
    .conflict-side.output .conflict-side-label { color: #6366f1; }

    .conflict-side-btn {
      padding: 6px 12px;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      border: none;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      color: white;
      cursor: pointer;
      transition: all 0.15s ease;
      opacity: 0.8;
    }

    .conflict-side-btn:hover {
      opacity: 1;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
    }

    .conflict-side.ours .conflict-side-btn {
      background: linear-gradient(135deg, #ec4899 0%, #db2777 100%);
    }

    .conflict-side.theirs .conflict-side-btn {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
    }

    .conflict-code {
      flex: 1;
      margin: 0;
      padding: 12px 14px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
      line-height: 1.6;
      color: #e6edf3;
      background: #0d1117;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-all;
    }

    .conflict-code.resolved {
      background: linear-gradient(180deg, rgba(34, 197, 94, 0.05) 0%, transparent 100%);
    }

    .conflict-code em {
      color: #6e7681;
      font-style: italic;
    }

    .conflict-code .line-add {
      background: rgba(34, 197, 94, 0.15);
      display: inline-block;
      width: 100%;
      margin: 0 -14px;
      padding: 0 14px;
    }

    .conflict-code .line-del {
      background: rgba(248, 81, 73, 0.15);
      display: inline-block;
      width: 100%;
      margin: 0 -14px;
      padding: 0 14px;
    }

    /* Quick action buttons */
    .conflict-actions {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      background: #1c2128;
      border-top: 1px solid #30363d;
    }

    .conflict-action-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 10px 16px;
      background: #21262d;
      border: 1px solid #30363d;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 500;
      color: #8b949e;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .conflict-action-btn:hover {
      background: #30363d;
      color: #e6edf3;
      border-color: #484f58;
    }

    .conflict-action-btn.primary {
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      border-color: transparent;
      color: white;
    }

    .conflict-action-btn.primary:hover {
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
      transform: translateY(-1px);
    }

    /* Resolution preview */
    .conflict-resolution {
      border-top: 1px solid #30363d;
      background: #0d1117;
    }

    .conflict-resolution-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: linear-gradient(90deg, rgba(34, 197, 94, 0.1) 0%, transparent 100%);
      border-bottom: 1px solid #30363d;
    }

    .conflict-resolution-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 600;
      color: #4ade80;
    }

    .conflict-resolution-badge {
      padding: 2px 8px;
      background: rgba(34, 197, 94, 0.2);
      border-radius: 10px;
      font-size: 10px;
      color: #4ade80;
    }

    /* Footer */
    .conflict-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 24px;
      background: linear-gradient(180deg, #161b22 0%, #1c2128 100%);
      border-top: 1px solid #30363d;
    }

    .conflict-footer-left {
      display: flex;
      gap: 12px;
    }

    .conflict-footer-right {
      display: flex;
      gap: 12px;
    }

    .conflict-footer-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .conflict-footer-btn.secondary {
      background: #21262d;
      border: 1px solid #30363d;
      color: #8b949e;
    }

    .conflict-footer-btn.secondary:hover {
      background: #30363d;
      color: #e6edf3;
    }

    .conflict-footer-btn.primary {
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      border: none;
      color: white;
      box-shadow: 0 2px 8px rgba(34, 197, 94, 0.25);
    }

    .conflict-footer-btn.primary:hover {
      box-shadow: 0 4px 16px rgba(34, 197, 94, 0.35);
      transform: translateY(-1px);
    }

    .conflict-footer-btn.primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    /* Empty state */
    .conflict-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 40px;
      text-align: center;
      color: #8b949e;
    }

    .conflict-empty-icon {
      font-size: 64px;
      margin-bottom: 20px;
      opacity: 0.8;
    }

    .conflict-empty h3 {
      font-size: 18px;
      font-weight: 600;
      color: #e6edf3;
      margin: 0 0 8px 0;
    }

    .conflict-empty p {
      font-size: 14px;
      margin: 0;
    }

    .btn-sm {
      padding: 6px 12px;
      font-size: 12px;
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .conflict-comparison {
        grid-template-columns: 1fr;
      }
      
      .conflict-side {
        border-right: none;
        border-bottom: 1px solid #30363d;
      }
      
      .conflict-side:last-child {
        border-bottom: none;
      }
    }

    /* Animations */
    @keyframes resolveAnimation {
      0% { transform: scale(1); }
      50% { transform: scale(1.02); }
      100% { transform: scale(1); }
    }

    .conflict-hunk.just-resolved {
      animation: resolveAnimation 0.3s ease;
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
