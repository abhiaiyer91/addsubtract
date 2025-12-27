/**
 * Enhanced Diff Viewer
 * Side-by-side diff, syntax highlighting, interactive staging
 */

import { diff, DiffLine, createHunks, DiffHunk, FileDiff } from '../core/diff';

/**
 * Diff display modes
 */
export type DiffMode = 'unified' | 'split' | 'inline';

/**
 * Syntax highlighting themes
 */
export interface SyntaxTheme {
  keyword: string;
  string: string;
  number: string;
  comment: string;
  function: string;
  variable: string;
  operator: string;
  punctuation: string;
}

const DARK_THEME: SyntaxTheme = {
  keyword: '#ff79c6',
  string: '#f1fa8c',
  number: '#bd93f9',
  comment: '#6272a4',
  function: '#50fa7b',
  variable: '#8be9fd',
  operator: '#ff79c6',
  punctuation: '#f8f8f2',
};

/**
 * Language patterns for syntax highlighting
 */
interface LanguagePatterns {
  keywords: RegExp;
  strings: RegExp;
  numbers: RegExp;
  comments: RegExp;
  functions: RegExp;
}

const LANGUAGES: Record<string, LanguagePatterns> = {
  typescript: {
    keywords: /\b(const|let|var|function|class|interface|type|export|import|from|return|if|else|for|while|switch|case|break|continue|new|this|super|extends|implements|async|await|try|catch|throw|finally|static|private|public|protected|readonly)\b/g,
    strings: /(["'`])(?:(?!\1)[^\\]|\\.)*\1/g,
    numbers: /\b\d+\.?\d*\b/g,
    comments: /\/\/.*$|\/\*[\s\S]*?\*\//gm,
    functions: /\b([a-zA-Z_]\w*)\s*(?=\()/g,
  },
  javascript: {
    keywords: /\b(const|let|var|function|class|export|import|from|return|if|else|for|while|switch|case|break|continue|new|this|super|extends|async|await|try|catch|throw|finally)\b/g,
    strings: /(["'`])(?:(?!\1)[^\\]|\\.)*\1/g,
    numbers: /\b\d+\.?\d*\b/g,
    comments: /\/\/.*$|\/\*[\s\S]*?\*\//gm,
    functions: /\b([a-zA-Z_]\w*)\s*(?=\()/g,
  },
  python: {
    keywords: /\b(def|class|import|from|return|if|elif|else|for|while|try|except|finally|with|as|lambda|yield|raise|pass|break|continue|and|or|not|in|is|None|True|False|self)\b/g,
    strings: /(["'])(?:(?!\1)[^\\]|\\.)*\1|"""[\s\S]*?"""|'''[\s\S]*?'''/g,
    numbers: /\b\d+\.?\d*\b/g,
    comments: /#.*$/gm,
    functions: /\b([a-zA-Z_]\w*)\s*(?=\()/g,
  },
  default: {
    keywords: /\b(function|class|return|if|else|for|while|switch|case|break|continue|new|this)\b/g,
    strings: /(["'`])(?:(?!\1)[^\\]|\\.)*\1/g,
    numbers: /\b\d+\.?\d*\b/g,
    comments: /\/\/.*$|#.*$|\/\*[\s\S]*?\*\//gm,
    functions: /\b([a-zA-Z_]\w*)\s*(?=\()/g,
  },
};

/**
 * Detect language from file extension
 */
export function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    hpp: 'cpp',
    css: 'css',
    html: 'html',
    json: 'json',
    md: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
  };
  return langMap[ext] || 'default';
}

/**
 * Apply syntax highlighting to code
 */
export function highlightCode(code: string, language: string): string {
  const patterns = LANGUAGES[language] || LANGUAGES.default;
  const theme = DARK_THEME;

  // Order matters: comments first, then strings, then others
  let result = escapeHtml(code);

  // Apply highlighting with spans
  result = result.replace(patterns.comments, match => 
    `<span style="color:${theme.comment}">${match}</span>`
  );
  result = result.replace(patterns.strings, match => 
    `<span style="color:${theme.string}">${match}</span>`
  );
  result = result.replace(patterns.keywords, match => 
    `<span style="color:${theme.keyword}">${match}</span>`
  );
  result = result.replace(patterns.numbers, match => 
    `<span style="color:${theme.number}">${match}</span>`
  );

  return result;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Split diff line for display
 */
export interface SplitDiffLine {
  leftLineNum: number | null;
  leftContent: string;
  leftType: 'add' | 'remove' | 'context' | 'empty';
  rightLineNum: number | null;
  rightContent: string;
  rightType: 'add' | 'remove' | 'context' | 'empty';
}

/**
 * Convert unified diff to split view
 */
export function toSplitView(lines: DiffLine[]): SplitDiffLine[] {
  const result: SplitDiffLine[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.type === 'context') {
      result.push({
        leftLineNum: line.oldLineNum || null,
        leftContent: line.content,
        leftType: 'context',
        rightLineNum: line.newLineNum || null,
        rightContent: line.content,
        rightType: 'context',
      });
      i++;
    } else if (line.type === 'remove') {
      // Look ahead for corresponding add
      const nextAdd = i + 1 < lines.length && lines[i + 1].type === 'add' ? lines[i + 1] : null;
      
      if (nextAdd) {
        result.push({
          leftLineNum: line.oldLineNum || null,
          leftContent: line.content,
          leftType: 'remove',
          rightLineNum: nextAdd.newLineNum || null,
          rightContent: nextAdd.content,
          rightType: 'add',
        });
        i += 2;
      } else {
        result.push({
          leftLineNum: line.oldLineNum || null,
          leftContent: line.content,
          leftType: 'remove',
          rightLineNum: null,
          rightContent: '',
          rightType: 'empty',
        });
        i++;
      }
    } else if (line.type === 'add') {
      result.push({
        leftLineNum: null,
        leftContent: '',
        leftType: 'empty',
        rightLineNum: line.newLineNum || null,
        rightContent: line.content,
        rightType: 'add',
      });
      i++;
    } else {
      i++;
    }
  }

  return result;
}

/**
 * Render diff as HTML with syntax highlighting
 */
export function renderDiffHTML(
  oldContent: string,
  newContent: string,
  filename: string,
  mode: DiffMode = 'split'
): string {
  const language = detectLanguage(filename);
  const diffLines = diff(oldContent, newContent);
  const hunks = createHunks(diffLines);

  if (mode === 'split') {
    return renderSplitDiff(diffLines, language);
  } else {
    return renderUnifiedDiff(hunks, language);
  }
}

/**
 * Render split/side-by-side diff
 */
function renderSplitDiff(lines: DiffLine[], language: string): string {
  const splitLines = toSplitView(lines);

  const rows = splitLines.map(line => {
    const leftClass = line.leftType === 'remove' ? 'diff-remove' : 
                      line.leftType === 'empty' ? 'diff-empty' : '';
    const rightClass = line.rightType === 'add' ? 'diff-add' : 
                       line.rightType === 'empty' ? 'diff-empty' : '';

    const leftNum = line.leftLineNum !== null ? line.leftLineNum : '';
    const rightNum = line.rightLineNum !== null ? line.rightLineNum : '';

    const leftCode = line.leftContent ? highlightCode(line.leftContent, language) : '&nbsp;';
    const rightCode = line.rightContent ? highlightCode(line.rightContent, language) : '&nbsp;';

    return `
      <tr>
        <td class="line-num ${leftClass}">${leftNum}</td>
        <td class="line-content ${leftClass}">${leftCode}</td>
        <td class="line-num ${rightClass}">${rightNum}</td>
        <td class="line-content ${rightClass}">${rightCode}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="diff-container split-diff">
      <table class="diff-table">
        <thead>
          <tr>
            <th colspan="2" class="diff-header-left">Original</th>
            <th colspan="2" class="diff-header-right">Modified</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Render unified diff
 */
function renderUnifiedDiff(hunks: DiffHunk[], language: string): string {
  let html = '<div class="diff-container unified-diff">';

  for (const hunk of hunks) {
    html += `<div class="diff-hunk-header">@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@</div>`;
    
    for (const line of hunk.lines) {
      const lineClass = line.type === 'add' ? 'diff-add' : 
                        line.type === 'remove' ? 'diff-remove' : 'diff-context';
      const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
      const lineNum = line.type === 'add' ? line.newLineNum : line.oldLineNum;
      const code = highlightCode(line.content, language);

      html += `
        <div class="diff-line ${lineClass}">
          <span class="line-num">${lineNum || ''}</span>
          <span class="line-prefix">${prefix}</span>
          <span class="line-content">${code}</span>
        </div>
      `;
    }
  }

  html += '</div>';
  return html;
}

/**
 * Get CSS styles for diff viewer
 */
export function getDiffStyles(): string {
  return `
    .diff-container {
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.5;
      background: #0d1117;
      border-radius: 8px;
      overflow: hidden;
    }

    .diff-table {
      width: 100%;
      border-collapse: collapse;
    }

    .diff-table th {
      background: #161b22;
      color: #8b949e;
      padding: 8px 16px;
      text-align: left;
      font-weight: 500;
      border-bottom: 1px solid #30363d;
    }

    .diff-header-left {
      border-right: 1px solid #30363d;
    }

    .diff-table td {
      padding: 0 8px;
      vertical-align: top;
      border-bottom: 1px solid #21262d;
    }

    .line-num {
      width: 50px;
      text-align: right;
      color: #484f58;
      padding-right: 12px;
      user-select: none;
    }

    .line-content {
      white-space: pre;
      color: #c9d1d9;
    }

    .diff-add {
      background: rgba(46, 160, 67, 0.15);
    }

    .diff-add .line-num {
      background: rgba(46, 160, 67, 0.25);
      color: #7ee787;
    }

    .diff-remove {
      background: rgba(248, 81, 73, 0.15);
    }

    .diff-remove .line-num {
      background: rgba(248, 81, 73, 0.25);
      color: #f85149;
    }

    .diff-empty {
      background: #161b22;
    }

    .diff-context {
      background: transparent;
    }

    .unified-diff .diff-line {
      display: flex;
      align-items: flex-start;
    }

    .unified-diff .line-prefix {
      width: 20px;
      text-align: center;
      color: #8b949e;
      user-select: none;
    }

    .diff-hunk-header {
      background: rgba(56, 139, 253, 0.15);
      color: #58a6ff;
      padding: 8px 16px;
      font-weight: 500;
    }

    /* Interactive staging */
    .diff-line.selectable {
      cursor: pointer;
    }

    .diff-line.selectable:hover {
      background: rgba(56, 139, 253, 0.1);
    }

    .diff-line.selected {
      background: rgba(56, 139, 253, 0.2) !important;
    }

    .diff-line .checkbox {
      width: 20px;
      margin-right: 8px;
    }

    .stage-button {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: #238636;
      color: white;
      border: none;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.2s;
    }

    .diff-line:hover .stage-button {
      opacity: 1;
    }

    .stage-button:hover {
      background: #2ea043;
    }
  `;
}

/**
 * Render interactive diff with staging capabilities
 */
export function renderInteractiveDiff(
  oldContent: string,
  newContent: string,
  filename: string,
  onStageHunk?: (hunkIndex: number) => void,
  onStageLine?: (lineIndex: number) => void
): string {
  const language = detectLanguage(filename);
  const diffLines = diff(oldContent, newContent);
  const hunks = createHunks(diffLines);

  let html = '<div class="diff-container interactive-diff">';

  hunks.forEach((hunk, hunkIndex) => {
    html += `
      <div class="diff-hunk" data-hunk="${hunkIndex}">
        <div class="diff-hunk-header">
          <span>@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@</span>
          <button class="stage-hunk-btn" onclick="stageHunk(${hunkIndex})">Stage Hunk</button>
        </div>
    `;

    hunk.lines.forEach((line, lineIndex) => {
      const lineClass = line.type === 'add' ? 'diff-add selectable' : 
                        line.type === 'remove' ? 'diff-remove selectable' : 'diff-context';
      const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
      const lineNum = line.type === 'add' ? line.newLineNum : line.oldLineNum;
      const code = highlightCode(line.content, language);

      const interactive = line.type !== 'context' ? `
        <input type="checkbox" class="line-checkbox" data-line="${lineIndex}">
      ` : '';

      html += `
        <div class="diff-line ${lineClass}" data-line="${lineIndex}">
          ${interactive}
          <span class="line-num">${lineNum || ''}</span>
          <span class="line-prefix">${prefix}</span>
          <span class="line-content">${code}</span>
          ${line.type !== 'context' ? `<button class="stage-button" onclick="stageLine(${hunkIndex}, ${lineIndex})">+</button>` : ''}
        </div>
      `;
    });

    html += '</div>';
  });

  html += '</div>';
  return html;
}

/**
 * Word-level diff highlighting
 */
export function highlightWordDiff(oldLine: string, newLine: string): { old: string; new: string } {
  const oldWords = oldLine.split(/(\s+)/);
  const newWords = newLine.split(/(\s+)/);
  
  let oldResult = '';
  let newResult = '';
  
  const maxLen = Math.max(oldWords.length, newWords.length);
  
  for (let i = 0; i < maxLen; i++) {
    const oldWord = oldWords[i] || '';
    const newWord = newWords[i] || '';
    
    if (oldWord === newWord) {
      oldResult += escapeHtml(oldWord);
      newResult += escapeHtml(newWord);
    } else {
      if (oldWord) {
        oldResult += `<span class="word-remove">${escapeHtml(oldWord)}</span>`;
      }
      if (newWord) {
        newResult += `<span class="word-add">${escapeHtml(newWord)}</span>`;
      }
    }
  }
  
  return { old: oldResult, new: newResult };
}

/**
 * Additional CSS for word-level diff
 */
export function getWordDiffStyles(): string {
  return `
    .word-add {
      background: rgba(46, 160, 67, 0.4);
      border-radius: 2px;
    }

    .word-remove {
      background: rgba(248, 81, 73, 0.4);
      border-radius: 2px;
    }
  `;
}

/**
 * Render a rename header for the diff view
 */
export function renderRenameHeader(fileDiff: FileDiff): string {
  if (!fileDiff.isRename) {
    return '';
  }

  return `
    <div class="diff-rename-header">
      <span class="rename-icon">↔</span>
      <span class="rename-label">Renamed:</span>
      <span class="rename-old-path">${escapeHtml(fileDiff.oldPath)}</span>
      <span class="rename-arrow">→</span>
      <span class="rename-new-path">${escapeHtml(fileDiff.newPath)}</span>
      <span class="rename-similarity">(${fileDiff.similarity}% similar)</span>
    </div>
  `;
}

/**
 * Get CSS styles for rename headers
 */
export function getRenameStyles(): string {
  return `
    .diff-rename-header {
      background: rgba(136, 87, 212, 0.15);
      border: 1px solid rgba(136, 87, 212, 0.3);
      border-radius: 6px;
      padding: 8px 12px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
    }

    .rename-icon {
      color: #a371f7;
      font-size: 16px;
    }

    .rename-label {
      color: #a371f7;
      font-weight: 500;
    }

    .rename-old-path {
      color: #f85149;
      font-family: monospace;
      text-decoration: line-through;
      opacity: 0.8;
    }

    .rename-arrow {
      color: #8b949e;
    }

    .rename-new-path {
      color: #7ee787;
      font-family: monospace;
    }

    .rename-similarity {
      color: #8b949e;
      margin-left: auto;
    }
  `;
}

/**
 * Render a complete FileDiff with rename support
 */
export function renderFileDiff(
  fileDiff: FileDiff,
  mode: DiffMode = 'split'
): string {
  let html = '<div class="file-diff-container">';
  
  // Add rename header if applicable
  if (fileDiff.isRename) {
    html += renderRenameHeader(fileDiff);
  }
  
  // Render the file header
  const headerClass = fileDiff.isRename ? 'diff-header-rename' :
                      fileDiff.isNew ? 'diff-header-new' :
                      fileDiff.isDeleted ? 'diff-header-deleted' : 'diff-header-modified';
  
  html += `<div class="diff-file-header ${headerClass}">`;
  
  if (fileDiff.isRename) {
    html += `<span class="file-path">${escapeHtml(fileDiff.oldPath)} → ${escapeHtml(fileDiff.newPath)}</span>`;
  } else if (fileDiff.isNew) {
    html += `<span class="file-status-badge new">NEW</span>`;
    html += `<span class="file-path">${escapeHtml(fileDiff.newPath)}</span>`;
  } else if (fileDiff.isDeleted) {
    html += `<span class="file-status-badge deleted">DELETED</span>`;
    html += `<span class="file-path">${escapeHtml(fileDiff.oldPath)}</span>`;
  } else {
    html += `<span class="file-path">${escapeHtml(fileDiff.oldPath)}</span>`;
  }
  
  html += '</div>';
  
  // Render the diff content
  if (fileDiff.isBinary) {
    html += '<div class="binary-file-notice">Binary file - contents not shown</div>';
  } else if (fileDiff.hunks.length > 0) {
    // Flatten hunks to DiffLines for rendering
    const allLines: DiffLine[] = [];
    for (const hunk of fileDiff.hunks) {
      allLines.push(...hunk.lines);
    }
    
    const language = detectLanguage(fileDiff.newPath || fileDiff.oldPath);
    
    if (mode === 'split') {
      html += renderSplitDiffContent(allLines, language);
    } else {
      html += renderUnifiedDiffContent(fileDiff.hunks, language);
    }
  } else {
    html += '<div class="no-changes-notice">No content changes</div>';
  }
  
  html += '</div>';
  return html;
}

/**
 * Render split diff content
 */
function renderSplitDiffContent(lines: DiffLine[], language: string): string {
  const splitLines = toSplitView(lines);

  const rows = splitLines.map(line => {
    const leftClass = line.leftType === 'remove' ? 'diff-remove' : 
                      line.leftType === 'empty' ? 'diff-empty' : '';
    const rightClass = line.rightType === 'add' ? 'diff-add' : 
                       line.rightType === 'empty' ? 'diff-empty' : '';

    const leftNum = line.leftLineNum !== null ? line.leftLineNum : '';
    const rightNum = line.rightLineNum !== null ? line.rightLineNum : '';

    const leftCode = line.leftContent ? highlightCode(line.leftContent, language) : '&nbsp;';
    const rightCode = line.rightContent ? highlightCode(line.rightContent, language) : '&nbsp;';

    return `
      <tr>
        <td class="line-num ${leftClass}">${leftNum}</td>
        <td class="line-content ${leftClass}">${leftCode}</td>
        <td class="line-num ${rightClass}">${rightNum}</td>
        <td class="line-content ${rightClass}">${rightCode}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="diff-container split-diff">
      <table class="diff-table">
        <thead>
          <tr>
            <th colspan="2" class="diff-header-left">Original</th>
            <th colspan="2" class="diff-header-right">Modified</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Render unified diff content
 */
function renderUnifiedDiffContent(hunks: DiffHunk[], language: string): string {
  let html = '<div class="diff-container unified-diff">';

  for (const hunk of hunks) {
    html += `<div class="diff-hunk-header">@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@</div>`;
    
    for (const line of hunk.lines) {
      const lineClass = line.type === 'add' ? 'diff-add' : 
                        line.type === 'remove' ? 'diff-remove' : 'diff-context';
      const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
      const lineNum = line.type === 'add' ? line.newLineNum : line.oldLineNum;
      const code = highlightCode(line.content, language);

      html += `
        <div class="diff-line ${lineClass}">
          <span class="line-num">${lineNum || ''}</span>
          <span class="line-prefix">${prefix}</span>
          <span class="line-content">${code}</span>
        </div>
      `;
    }
  }

  html += '</div>';
  return html;
}

/**
 * Get additional CSS for file diff containers
 */
export function getFileDiffStyles(): string {
  return `
    .file-diff-container {
      margin-bottom: 16px;
      border: 1px solid #30363d;
      border-radius: 8px;
      overflow: hidden;
    }

    .diff-file-header {
      background: #161b22;
      padding: 8px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid #30363d;
    }

    .diff-header-new {
      background: rgba(46, 160, 67, 0.1);
    }

    .diff-header-deleted {
      background: rgba(248, 81, 73, 0.1);
    }

    .diff-header-rename {
      background: rgba(136, 87, 212, 0.1);
    }

    .file-status-badge {
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      text-transform: uppercase;
    }

    .file-status-badge.new {
      background: rgba(46, 160, 67, 0.2);
      color: #7ee787;
    }

    .file-status-badge.deleted {
      background: rgba(248, 81, 73, 0.2);
      color: #f85149;
    }

    .file-path {
      font-family: monospace;
      color: #c9d1d9;
    }

    .binary-file-notice,
    .no-changes-notice {
      padding: 16px;
      text-align: center;
      color: #8b949e;
      font-style: italic;
    }
  `;
}
