import { useRef, useCallback } from 'react';
import Editor, { OnMount, OnChange } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { Loader2 } from 'lucide-react';

interface CodeEditorProps {
  content: string;
  language: string;
  path: string;
  onChange: (content: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
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

export function CodeEditor({
  content,
  language,
  path,
  onChange,
  onSave,
  readOnly = false,
}: CodeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;

    // Add Cmd/Ctrl+S keybinding for save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave?.();
    });

    // Focus the editor
    editor.focus();
  }, [onSave]);

  const handleChange: OnChange = useCallback((value) => {
    onChange(value || '');
  }, [onChange]);

  return (
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
      }}
    />
  );
}
