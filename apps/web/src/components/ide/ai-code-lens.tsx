import { useEffect, useRef } from 'react';
import type { editor, IDisposable } from 'monaco-editor';
import type { Monaco } from '@monaco-editor/react';
import {
  Lightbulb,
  AlertTriangle,
  TestTube,
  FileSymlink,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CodeLensHint {
  id: string;
  line: number;
  type: 'suggestion' | 'warning' | 'test' | 'reference' | 'ai';
  message: string;
  action?: {
    label: string;
    handler: () => void;
  };
}

interface AICodeLensProps {
  editor: editor.IStandaloneCodeEditor | null;
  monaco: Monaco | null;
  hints: CodeLensHint[];
  onHintClick?: (hint: CodeLensHint) => void;
}

const HINT_ICONS = {
  suggestion: Lightbulb,
  warning: AlertTriangle,
  test: TestTube,
  reference: FileSymlink,
  ai: Sparkles,
};

const HINT_COLORS = {
  suggestion: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  warning: 'text-red-400 bg-red-500/10 border-red-500/30',
  test: 'text-green-400 bg-green-500/10 border-green-500/30',
  reference: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  ai: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
};

/**
 * Renders AI-powered code lens hints in the Monaco editor
 * These appear as inline widgets above lines with helpful suggestions
 */
export function useAICodeLens({
  editor,
  monaco,
  hints,
  onHintClick,
}: AICodeLensProps) {
  const disposablesRef = useRef<IDisposable[]>([]);
  const decorationsRef = useRef<string[]>([]);
  const widgetsRef = useRef<editor.IContentWidget[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disposablesRef.current.forEach(d => d.dispose());
      disposablesRef.current = [];
    };
  }, []);

  // Update hints when they change
  useEffect(() => {
    if (!editor || !monaco) return;

    const model = editor.getModel();
    if (!model) return;

    // Clear old decorations
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);

    // Clear old widgets
    widgetsRef.current.forEach(w => editor.removeContentWidget(w));
    widgetsRef.current = [];

    // Create new decorations and widgets
    const newDecorations: editor.IModelDeltaDecoration[] = [];

    hints.forEach((hint, index) => {
      // Add glyph margin decoration
      newDecorations.push({
        range: new monaco.Range(hint.line, 1, hint.line, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: `ai-hint-glyph ai-hint-${hint.type}`,
          glyphMarginHoverMessage: { value: hint.message },
        },
      });

      // Create content widget for the hint
      const widgetId = `ai-hint-${index}`;
      const widget: editor.IContentWidget = {
        getId: () => widgetId,
        getDomNode: () => {
          const node = document.createElement('div');
          node.className = 'ai-code-lens-widget';
          node.innerHTML = createHintHTML(hint);
          
          // Add click handler
          node.addEventListener('click', () => {
            if (hint.action) {
              hint.action.handler();
            } else if (onHintClick) {
              onHintClick(hint);
            }
          });
          
          return node;
        },
        getPosition: () => ({
          position: { lineNumber: hint.line, column: 1 },
          preference: [monaco.editor.ContentWidgetPositionPreference.ABOVE],
        }),
      };

      // Only add widgets for important hints (not too many)
      if (hints.length <= 5 || hint.type === 'warning' || hint.type === 'ai') {
        editor.addContentWidget(widget);
        widgetsRef.current.push(widget);
      }
    });

    decorationsRef.current = editor.deltaDecorations([], newDecorations);

    // Add CSS for glyph margins if not already added
    addGlyphStyles();

  }, [editor, monaco, hints, onHintClick]);
}

function createHintHTML(hint: CodeLensHint): string {
  const iconSvg = getIconSVG(hint.type);
  const colorClass = HINT_COLORS[hint.type];
  
  return `
    <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs cursor-pointer transition-opacity opacity-60 hover:opacity-100 ${colorClass}">
      ${iconSvg}
      <span class="max-w-[200px] truncate">${escapeHtml(hint.message)}</span>
      ${hint.action ? `<span class="text-[10px] opacity-70">${escapeHtml(hint.action.label)}</span>` : ''}
    </div>
  `;
}

function getIconSVG(type: CodeLensHint['type']): string {
  const svgs: Record<string, string> = {
    suggestion: '<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/></svg>',
    warning: '<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    test: '<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2v6a2 2 0 0 0 2 2h6"/><path d="M4.5 22V4.5a2 2 0 0 1 2-2h8.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V22a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><path d="m9 15 2 2 4-4"/></svg>',
    reference: '<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4"/><polyline points="14 2 14 8 20 8"/><path d="m3 12.5 5 5"/><path d="m8 12.5-5 5"/></svg>',
    ai: '<svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/></svg>',
  };
  return svgs[type] || svgs.ai;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function addGlyphStyles() {
  const styleId = 'ai-code-lens-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .ai-hint-glyph {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 4px;
      cursor: pointer;
    }
    .ai-hint-suggestion { background: rgba(251, 191, 36, 0.2); }
    .ai-hint-warning { background: rgba(239, 68, 68, 0.2); }
    .ai-hint-test { background: rgba(34, 197, 94, 0.2); }
    .ai-hint-reference { background: rgba(59, 130, 246, 0.2); }
    .ai-hint-ai { background: rgba(168, 85, 247, 0.2); }
    
    .ai-code-lens-widget {
      margin-left: 30px;
      margin-bottom: 2px;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Analyze code and generate AI hints
 * This is a simple heuristic-based analyzer - in production, 
 * this would call an AI service
 */
export function analyzeCodeForHints(
  code: string, 
  filePath: string,
  language: string
): CodeLensHint[] {
  const hints: CodeLensHint[] = [];
  const lines = code.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    // Detect TODO/FIXME comments
    if (trimmed.match(/\/\/\s*(TODO|FIXME|HACK|XXX)/i)) {
      hints.push({
        id: `todo-${lineNum}`,
        line: lineNum,
        type: 'suggestion',
        message: 'AI can help resolve this TODO',
        action: { label: 'Fix with AI', handler: () => {} },
      });
    }

    // Detect console.log in production code
    if (trimmed.includes('console.log') && !filePath.includes('test')) {
      hints.push({
        id: `console-${lineNum}`,
        line: lineNum,
        type: 'warning',
        message: 'Consider removing console.log',
        action: { label: 'Remove', handler: () => {} },
      });
    }

    // Detect empty catch blocks
    if (trimmed.match(/catch\s*\([^)]*\)\s*{\s*}/)) {
      hints.push({
        id: `catch-${lineNum}`,
        line: lineNum,
        type: 'warning',
        message: 'Empty catch block - errors will be silently ignored',
        action: { label: 'Add handler', handler: () => {} },
      });
    }

    // Detect functions without JSDoc (for TypeScript/JavaScript)
    if (language === 'typescript' || language === 'javascript') {
      if (trimmed.match(/^(export\s+)?(async\s+)?function\s+\w+/)) {
        // Check if previous line has JSDoc
        const prevLine = lines[index - 1]?.trim() || '';
        if (!prevLine.endsWith('*/')) {
          hints.push({
            id: `jsdoc-${lineNum}`,
            line: lineNum,
            type: 'ai',
            message: 'Generate documentation',
            action: { label: 'Add docs', handler: () => {} },
          });
        }
      }
    }

    // Detect test file without tests
    if (filePath.includes('test') || filePath.includes('spec')) {
      if (trimmed.match(/^(describe|it|test)\s*\(/)) {
        hints.push({
          id: `test-${lineNum}`,
          line: lineNum,
          type: 'test',
          message: 'AI can generate more test cases',
          action: { label: 'Generate tests', handler: () => {} },
        });
      }
    }
  });

  // Limit hints to avoid cluttering
  return hints.slice(0, 10);
}

/**
 * Quick actions panel that appears when clicking a code lens
 */
export function CodeLensQuickActions({
  hint,
  position,
  onAction,
  onDismiss,
}: {
  hint: CodeLensHint | null;
  position: { x: number; y: number } | null;
  onAction: (action: string) => void;
  onDismiss: () => void;
}) {
  if (!hint || !position) return null;

  const Icon = HINT_ICONS[hint.type];
  const colorClass = HINT_COLORS[hint.type];

  const actions = [
    { id: 'fix', label: 'Fix with AI', icon: Sparkles },
    { id: 'explain', label: 'Explain', icon: Lightbulb },
    { id: 'ignore', label: 'Ignore', icon: ChevronRight },
  ];

  return (
    <div
      className="fixed z-50 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl p-2 min-w-[180px]"
      style={{ left: position.x, top: position.y }}
    >
      <div className={cn("flex items-center gap-2 px-2 py-1.5 rounded-md mb-1", colorClass)}>
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{hint.message}</span>
      </div>
      
      <div className="space-y-0.5">
        {actions.map(action => (
          <button
            key={action.id}
            onClick={() => {
              onAction(action.id);
              onDismiss();
            }}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors"
          >
            <action.icon className="h-3.5 w-3.5 text-zinc-500" />
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
