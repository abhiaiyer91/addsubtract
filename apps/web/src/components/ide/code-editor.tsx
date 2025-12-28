import { useRef, useCallback, useEffect, useState } from 'react';
import Editor, { OnMount, OnChange, Monaco } from '@monaco-editor/react';
import type { editor, languages, IDisposable } from 'monaco-editor';
import { Loader2, Sparkles } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { getLanguageFromPath, shouldTriggerCompletion } from '@/lib/completion-service';

interface CodeEditorProps {
  content: string;
  language: string;
  path: string;
  onChange: (content: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
  aiCompletionEnabled?: boolean;
}

// Map our language identifiers to Monaco language IDs
function getMonacoLanguage(language: string): string {
  const map: Record<string, string> = {
    typescript: 'typescript',
    tsx: 'typescript',
    javascript: 'javascript',
    jsx: 'javascript',
    python: 'python',
    ruby: 'ruby',
    go: 'go',
    rust: 'rust',
    java: 'java',
    kotlin: 'kotlin',
    swift: 'swift',
    cpp: 'cpp',
    c: 'c',
    csharp: 'csharp',
    php: 'php',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'scss',
    less: 'less',
    json: 'json',
    yaml: 'yaml',
    xml: 'xml',
    markdown: 'markdown',
    sql: 'sql',
    bash: 'shell',
    shell: 'shell',
    dockerfile: 'dockerfile',
    toml: 'ini',
    ini: 'ini',
    vue: 'html',
    svelte: 'html',
    text: 'plaintext',
  };
  return map[language] || 'plaintext';
}

// Type for completion mutation
type CompletionMutation = {
  mutateAsync: (params: {
    prefix: string;
    suffix: string;
    filePath: string;
    language: string;
    maxTokens?: number;
  }) => Promise<{ completion: string; cached: boolean }>;
};

export function CodeEditor({
  content,
  language,
  path,
  onChange,
  onSave,
  readOnly = false,
  aiCompletionEnabled = true,
}: CodeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const disposablesRef = useRef<IDisposable[]>([]);
  const [isCompletionLoading, setIsCompletionLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Get the completion mutation from tRPC (using any to bypass type check during development)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completionMutation = (trpc as any).completion?.getCompletion?.useMutation?.() as CompletionMutation | undefined;

  // Clean up disposables on unmount
  useEffect(() => {
    return () => {
      disposablesRef.current.forEach(d => d.dispose());
      disposablesRef.current = [];
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const handleEditorDidMount: OnMount = useCallback((editorInstance, monaco) => {
    editorRef.current = editorInstance;
    monacoRef.current = monaco;

    // Add Cmd/Ctrl+S keybinding for save
    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave?.();
    });

    // Register inline completion provider for AI completions
    if (aiCompletionEnabled && completionMutation) {
      const provider = registerInlineCompletionProvider(
        monaco,
        path,
        completionMutation,
        setIsCompletionLoading,
        abortControllerRef
      );
      if (provider) {
        disposablesRef.current.push(provider);
      }
    }

    // Focus the editor
    editorInstance.focus();
  }, [onSave, aiCompletionEnabled, path, completionMutation]);

  const handleChange: OnChange = useCallback((value) => {
    onChange(value || '');
  }, [onChange]);

  return (
    <div className="relative h-full w-full">
      <Editor
        height="100%"
        language={getMonacoLanguage(language)}
        value={content}
        path={path}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        theme="vs-dark"
        loading={
          <div className="flex items-center justify-center h-full bg-zinc-900">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
        options={{
          readOnly,
          minimap: { enabled: true, scale: 0.75 },
          fontSize: 13,
          fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'off',
          folding: true,
          glyphMargin: true,
          lineDecorationsWidth: 10,
          lineNumbersMinChars: 4,
          renderLineHighlight: 'line',
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
          padding: { top: 8, bottom: 8 },
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          smoothScrolling: true,
          bracketPairColorization: { enabled: true },
          guides: {
            bracketPairs: true,
            indentation: true,
          },
          // Enable inline suggestions (ghost text)
          inlineSuggest: {
            enabled: aiCompletionEnabled,
            mode: 'subwordSmart',
          },
          // Suggest options
          suggest: {
            preview: true,
            previewMode: 'subwordSmart',
          },
          // Quick suggestions
          quickSuggestions: true,
        }}
      />
      
      {/* AI completion indicator */}
      {isCompletionLoading && (
        <div className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-zinc-800/90 backdrop-blur-sm rounded-full border border-zinc-700 text-xs text-zinc-400">
          <Sparkles className="h-3 w-3 animate-pulse text-purple-400" />
          <span>AI thinking...</span>
        </div>
      )}
    </div>
  );
}

/**
 * Register the inline completion provider for AI suggestions
 */
function registerInlineCompletionProvider(
  monaco: Monaco,
  filePath: string,
  completionMutation: CompletionMutation,
  setIsLoading: (loading: boolean) => void,
  abortControllerRef: React.MutableRefObject<AbortController | null>
): IDisposable | null {
  let lastRequestId = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const requestCompletion = async (
    prefix: string,
    suffix: string,
    language: string,
    requestId: number
  ): Promise<string | null> => {
    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      setIsLoading(true);
      const result = await completionMutation.mutateAsync({
        prefix,
        suffix,
        filePath,
        language,
        maxTokens: 150,
      });

      // Check if this request is still the latest
      if (requestId !== lastRequestId) {
        return null;
      }

      return result.completion || null;
    } catch (error) {
      // Ignore abort errors
      const err = error as Error;
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        return null;
      }
      console.error('AI completion error:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Register the inline completion provider
  const provider: languages.InlineCompletionsProvider = {
    provideInlineCompletions: async (
      model: editor.ITextModel,
      position: { lineNumber: number; column: number },
      context: languages.InlineCompletionContext,
      _token: { isCancellationRequested: boolean }
    ): Promise<languages.InlineCompletions | null> => {
      // Get the text before and after the cursor
      const textBeforeCursor = model.getValueInRange({
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const textAfterCursor = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: model.getLineCount(),
        endColumn: model.getLineMaxColumn(model.getLineCount()),
      });

      // Determine trigger kind
      const triggerKind = context.triggerKind === monaco.languages.InlineCompletionTriggerKind.Explicit
        ? 'explicit'
        : 'automatic';

      // Check if we should trigger completion
      if (!shouldTriggerCompletion(textBeforeCursor, textAfterCursor, triggerKind)) {
        return null;
      }

      // Get language from file path
      const language = getLanguageFromPath(filePath);

      // Generate a request ID
      const requestId = ++lastRequestId;

      // Request completion with debouncing
      return new Promise((resolve) => {
        // Clear any existing debounce timer
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(async () => {
          const completion = await requestCompletion(
            textBeforeCursor,
            textAfterCursor,
            language,
            requestId
          );

          if (!completion || requestId !== lastRequestId) {
            resolve(null);
            return;
          }

          // Return inline completion
          resolve({
            items: [
              {
                insertText: completion,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: position.column,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column,
                },
              },
            ],
          });
        }, 400);
      });
    },
    
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    disposeInlineCompletions: () => {},
  };

  // Register for all languages
  return monaco.languages.registerInlineCompletionsProvider({ pattern: '**' }, provider);
}
