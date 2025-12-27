import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface OpenFile {
  path: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  language: string;
}

export interface PendingChange {
  id: string;
  path: string;
  type: 'create' | 'edit' | 'delete';
  content?: string;
  diff?: string;
  description?: string;
  timestamp: Date;
  status: 'pending' | 'approved' | 'rejected';
}

export interface TerminalOutput {
  id: string;
  command: string;
  output: string;
  exitCode?: number;
  timestamp: Date;
  isRunning: boolean;
}

export interface AgentToolResult {
  toolName: string;
  success: boolean;
  filePath?: string;
  content?: string;
  message?: string;
  command?: string;
  output?: string;
}

interface IDEState {
  // Mode
  isIDEMode: boolean;
  setIDEMode: (enabled: boolean) => void;
  toggleIDEMode: () => void;

  // Files
  openFiles: OpenFile[];
  activeFilePath: string | null;
  openFile: (path: string, content: string, language: string) => void;
  openOrUpdateFile: (path: string, content: string, language: string) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string) => void;
  updateFileContent: (path: string, content: string) => void;
  markFileSaved: (path: string) => void;

  // Agent tool results
  processAgentToolResult: (result: AgentToolResult) => void;

  // Agent changes
  pendingChanges: PendingChange[];
  addPendingChange: (change: Omit<PendingChange, 'id' | 'timestamp' | 'status'>) => void;
  approveChange: (id: string) => void;
  rejectChange: (id: string) => void;
  clearPendingChanges: () => void;

  // Terminal
  terminalOutputs: TerminalOutput[];
  addTerminalOutput: (output: Omit<TerminalOutput, 'id' | 'timestamp'>) => void;
  updateTerminalOutput: (id: string, update: Partial<TerminalOutput>) => void;
  clearTerminal: () => void;

  // Layout
  sidebarWidth: number;
  chatWidth: number;
  terminalHeight: number;
  setSidebarWidth: (width: number) => void;
  setChatWidth: (width: number) => void;
  setTerminalHeight: (height: number) => void;
  showTerminal: boolean;
  setShowTerminal: (show: boolean) => void;
  showFileTree: boolean;
  setShowFileTree: (show: boolean) => void;
}

export const useIDEStore = create<IDEState>()(
  persist(
    (set, get) => ({
      // Mode
      isIDEMode: false,
      setIDEMode: (enabled) => set({ isIDEMode: enabled }),
      toggleIDEMode: () => set((state) => ({ isIDEMode: !state.isIDEMode })),

      // Files
      openFiles: [],
      activeFilePath: null,
      openFile: (path, content, language) => {
        const { openFiles } = get();
        const existing = openFiles.find((f) => f.path === path);
        if (existing) {
          set({ activeFilePath: path });
          return;
        }
        set({
          openFiles: [
            ...openFiles,
            {
              path,
              content,
              originalContent: content,
              isDirty: false,
              language,
            },
          ],
          activeFilePath: path,
        });
      },
      openOrUpdateFile: (path, content, language) => {
        const { openFiles } = get();
        const existing = openFiles.find((f) => f.path === path);
        if (existing) {
          // Update content and mark as from agent (not dirty since it's the new source of truth)
          set({
            openFiles: openFiles.map((f) =>
              f.path === path
                ? { ...f, content, originalContent: content, isDirty: false }
                : f
            ),
            activeFilePath: path,
          });
          return;
        }
        set({
          openFiles: [
            ...openFiles,
            {
              path,
              content,
              originalContent: content,
              isDirty: false,
              language,
            },
          ],
          activeFilePath: path,
        });
      },
      closeFile: (path) => {
        const { openFiles, activeFilePath } = get();
        const newFiles = openFiles.filter((f) => f.path !== path);
        const wasActive = activeFilePath === path;
        set({
          openFiles: newFiles,
          activeFilePath: wasActive
            ? newFiles[newFiles.length - 1]?.path || null
            : activeFilePath,
        });
      },
      setActiveFile: (path) => set({ activeFilePath: path }),
      updateFileContent: (path, content) => {
        const { openFiles } = get();
        set({
          openFiles: openFiles.map((f) =>
            f.path === path
              ? { ...f, content, isDirty: content !== f.originalContent }
              : f
          ),
        });
      },
      markFileSaved: (path) => {
        const { openFiles } = get();
        set({
          openFiles: openFiles.map((f) =>
            f.path === path
              ? { ...f, originalContent: f.content, isDirty: false }
              : f
          ),
        });
      },

      // Process agent tool results
      processAgentToolResult: (result) => {
        const { openOrUpdateFile, addPendingChange, addTerminalOutput, setShowTerminal } = get();

        // Handle file write/edit tools
        if (
          (result.toolName === 'wit-write-file' || result.toolName === 'wit-edit-file') &&
          result.success &&
          result.filePath &&
          result.content
        ) {
          // Determine language from file extension
          const ext = result.filePath.split('.').pop()?.toLowerCase() || '';
          const langMap: Record<string, string> = {
            ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
            py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
            html: 'html', css: 'css', scss: 'scss', json: 'json', yaml: 'yaml',
            md: 'markdown', sql: 'sql', sh: 'bash',
          };
          const language = langMap[ext] || 'text';

          // Add as pending change
          addPendingChange({
            path: result.filePath,
            type: result.toolName === 'wit-write-file' ? 'create' : 'edit',
            content: result.content,
            description: result.message,
          });

          // Auto-open the file in the editor
          openOrUpdateFile(result.filePath, result.content, language);
        }

        // Handle command execution
        if (result.toolName === 'wit-run-command' && result.command) {
          addTerminalOutput({
            command: result.command,
            output: result.output || '',
            exitCode: result.success ? 0 : 1,
            isRunning: false,
          });
          setShowTerminal(true);
        }

        // Handle file read (auto-open in editor)
        if (result.toolName === 'wit-read-file' && result.success && result.filePath && result.content) {
          const ext = result.filePath.split('.').pop()?.toLowerCase() || '';
          const langMap: Record<string, string> = {
            ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
            py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
            html: 'html', css: 'css', scss: 'scss', json: 'json', yaml: 'yaml',
            md: 'markdown', sql: 'sql', sh: 'bash',
          };
          const language = langMap[ext] || 'text';
          openOrUpdateFile(result.filePath, result.content, language);
        }
      },

      // Agent changes
      pendingChanges: [],
      addPendingChange: (change) => {
        const id = `change-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        set((state) => ({
          pendingChanges: [
            ...state.pendingChanges,
            { ...change, id, timestamp: new Date(), status: 'pending' },
          ],
        }));
      },
      approveChange: (id) => {
        set((state) => ({
          pendingChanges: state.pendingChanges.map((c) =>
            c.id === id ? { ...c, status: 'approved' } : c
          ),
        }));
      },
      rejectChange: (id) => {
        set((state) => ({
          pendingChanges: state.pendingChanges.map((c) =>
            c.id === id ? { ...c, status: 'rejected' } : c
          ),
        }));
      },
      clearPendingChanges: () => set({ pendingChanges: [] }),

      // Terminal
      terminalOutputs: [],
      addTerminalOutput: (output) => {
        const id = `term-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        set((state) => ({
          terminalOutputs: [
            ...state.terminalOutputs,
            { ...output, id, timestamp: new Date() },
          ],
        }));
        return id;
      },
      updateTerminalOutput: (id, update) => {
        set((state) => ({
          terminalOutputs: state.terminalOutputs.map((t) =>
            t.id === id ? { ...t, ...update } : t
          ),
        }));
      },
      clearTerminal: () => set({ terminalOutputs: [] }),

      // Layout
      sidebarWidth: 260,
      chatWidth: 420,
      terminalHeight: 200,
      setSidebarWidth: (width) => set({ sidebarWidth: width }),
      setChatWidth: (width) => set({ chatWidth: width }),
      setTerminalHeight: (height) => set({ terminalHeight: height }),
      showTerminal: false,
      setShowTerminal: (show) => set({ showTerminal: show }),
      showFileTree: true,
      setShowFileTree: (show) => set({ showFileTree: show }),
    }),
    {
      name: 'wit-ide-store',
      partialize: (state) => ({
        isIDEMode: state.isIDEMode,
        sidebarWidth: state.sidebarWidth,
        chatWidth: state.chatWidth,
        terminalHeight: state.terminalHeight,
        showTerminal: state.showTerminal,
        showFileTree: state.showFileTree,
      }),
    }
  )
);
