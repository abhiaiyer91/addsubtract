import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/**
 * Editor context that provides information about the current editing state
 * to components that need it (like the agent chat panel)
 */

export interface EditorSelection {
  text: string;
  startLine: number;
  endLine: number;
  filePath: string;
}

export interface EditorState {
  // Current active file
  activeFilePath: string | null;
  activeFileContent: string | null;
  activeFileLanguage: string | null;
  
  // Current selection (if any)
  selection: EditorSelection | null;
  
  // Cursor position
  cursorLine: number | null;
  cursorColumn: number | null;
  
  // Visible range in editor
  visibleStartLine: number | null;
  visibleEndLine: number | null;
}

export interface EditorContextValue extends EditorState {
  // Update methods
  setActiveFile: (path: string | null, content: string | null, language: string | null) => void;
  setSelection: (selection: EditorSelection | null) => void;
  setCursorPosition: (line: number, column: number) => void;
  setVisibleRange: (startLine: number, endLine: number) => void;
  
  // Helper methods
  getContextForAgent: () => string;
  getSelectionOrVisibleCode: () => { code: string; context: string } | null;
}

const initialState: EditorState = {
  activeFilePath: null,
  activeFileContent: null,
  activeFileLanguage: null,
  selection: null,
  cursorLine: null,
  cursorColumn: null,
  visibleStartLine: null,
  visibleEndLine: null,
};

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorContextProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EditorState>(initialState);

  const setActiveFile = useCallback((
    path: string | null, 
    content: string | null, 
    language: string | null
  ) => {
    setState(prev => ({
      ...prev,
      activeFilePath: path,
      activeFileContent: content,
      activeFileLanguage: language,
      // Clear selection when file changes
      selection: path !== prev.activeFilePath ? null : prev.selection,
    }));
  }, []);

  const setSelection = useCallback((selection: EditorSelection | null) => {
    setState(prev => ({ ...prev, selection }));
  }, []);

  const setCursorPosition = useCallback((line: number, column: number) => {
    setState(prev => ({ ...prev, cursorLine: line, cursorColumn: column }));
  }, []);

  const setVisibleRange = useCallback((startLine: number, endLine: number) => {
    setState(prev => ({ ...prev, visibleStartLine: startLine, visibleEndLine: endLine }));
  }, []);

  /**
   * Generate a context string for the agent that describes what the user is looking at
   */
  const getContextForAgent = useCallback((): string => {
    const parts: string[] = [];

    if (state.activeFilePath) {
      parts.push(`Currently viewing: ${state.activeFilePath}`);
      
      if (state.activeFileLanguage) {
        parts.push(`Language: ${state.activeFileLanguage}`);
      }

      if (state.selection && state.selection.text.trim()) {
        parts.push(`\nSelected code (lines ${state.selection.startLine}-${state.selection.endLine}):`);
        parts.push('```');
        parts.push(state.selection.text);
        parts.push('```');
      } else if (state.cursorLine && state.activeFileContent) {
        // Show code around cursor
        const lines = state.activeFileContent.split('\n');
        const start = Math.max(0, state.cursorLine - 5);
        const end = Math.min(lines.length, state.cursorLine + 5);
        const contextLines = lines.slice(start, end);
        
        if (contextLines.length > 0) {
          parts.push(`\nCode around cursor (line ${state.cursorLine}):`);
          parts.push('```');
          parts.push(contextLines.join('\n'));
          parts.push('```');
        }
      }
    }

    return parts.join('\n');
  }, [state]);

  /**
   * Get either the selected code or the visible code for context
   */
  const getSelectionOrVisibleCode = useCallback((): { code: string; context: string } | null => {
    if (state.selection && state.selection.text.trim()) {
      return {
        code: state.selection.text,
        context: `Selected code from ${state.activeFilePath} (lines ${state.selection.startLine}-${state.selection.endLine})`,
      };
    }

    if (state.activeFileContent && state.visibleStartLine && state.visibleEndLine) {
      const lines = state.activeFileContent.split('\n');
      const visibleLines = lines.slice(state.visibleStartLine - 1, state.visibleEndLine);
      
      return {
        code: visibleLines.join('\n'),
        context: `Visible code from ${state.activeFilePath} (lines ${state.visibleStartLine}-${state.visibleEndLine})`,
      };
    }

    return null;
  }, [state]);

  const value: EditorContextValue = {
    ...state,
    setActiveFile,
    setSelection,
    setCursorPosition,
    setVisibleRange,
    getContextForAgent,
    getSelectionOrVisibleCode,
  };

  return (
    <EditorContext.Provider value={value}>
      {children}
    </EditorContext.Provider>
  );
}

export function useEditorContext() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditorContext must be used within an EditorContextProvider');
  }
  return context;
}

/**
 * Optional hook that returns null if not in an editor context
 */
export function useEditorContextOptional() {
  return useContext(EditorContext);
}
