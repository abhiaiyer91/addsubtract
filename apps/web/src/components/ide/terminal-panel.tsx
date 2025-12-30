import { useRef, useEffect, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal, Trash2, Loader2, AlertCircle, Power, PowerOff } from 'lucide-react';
import { useIDEStore } from '@/lib/ide-store';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';
import '@xterm/xterm/css/xterm.css';

interface TerminalPanelProps {
  height: number;
  repoId?: string;
  owner?: string;
  repo?: string;
}

type TerminalTab = 'output' | 'sandbox';
type SandboxState = 'disconnected' | 'connecting' | 'connected' | 'error';

// Shared xterm theme
const xtermTheme = {
  background: '#09090b', // zinc-950
  foreground: '#e4e4e7', // zinc-200 - brighter for better readability
  cursor: '#f4f4f5', // zinc-100
  cursorAccent: '#09090b',
  selectionBackground: '#3f3f46', // zinc-700
  black: '#18181b',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#f4f4f5',
  brightBlack: '#71717a', // zinc-500
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#ffffff',
};

export function TerminalPanel({ height, repoId, owner, repo }: TerminalPanelProps) {
  const { terminalOutputs, clearTerminal } = useIDEStore();
  const [activeTab, setActiveTab] = useState<TerminalTab>('output');
  const [sandboxState, setSandboxState] = useState<SandboxState>('disconnected');
  
  // Output terminal refs (xterm.js for proper terminal rendering)
  const outputContainerRef = useRef<HTMLDivElement>(null);
  const outputXtermRef = useRef<XTerm | null>(null);
  const outputFitAddonRef = useRef<FitAddon | null>(null);
  const lastOutputCountRef = useRef(0);
  
  // Sandbox terminal refs
  const sandboxContainerRef = useRef<HTMLDivElement>(null);
  const sandboxXtermRef = useRef<XTerm | null>(null);
  const sandboxFitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Check if sandbox is available for this repo
  const { data: sandboxStatus } = trpc.sandbox.getStatus.useQuery(
    { repoId: repoId! },
    { enabled: !!repoId }
  );

  const sandboxAvailable = sandboxStatus?.ready ?? false;

  // Initialize output xterm.js terminal
  useEffect(() => {
    if (activeTab !== 'output' || !outputContainerRef.current || outputXtermRef.current) return;

    const xterm = new XTerm({
      theme: xtermTheme,
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: false,
      cursorStyle: 'bar',
      scrollback: 10000,
      tabStopWidth: 4,
      disableStdin: true, // Output terminal is read-only
      convertEol: true, // Convert \n to \r\n for proper line breaks
      scrollOnUserInput: true,
      fastScrollModifier: 'alt', // Hold alt for fast scrolling
      smoothScrollDuration: 0, // Instant scrolling for better responsiveness
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.open(outputContainerRef.current);
    
    outputXtermRef.current = xterm;
    outputFitAddonRef.current = fitAddon;

    // Fit after a short delay to ensure container has dimensions
    const fitTerminal = () => {
      try {
        fitAddon.fit();
      } catch (e) {
        // Ignore fit errors during initialization
      }
    };

    // Initial fit with multiple attempts for reliability
    requestAnimationFrame(() => {
      fitTerminal();
      // Second fit after layout settles
      setTimeout(fitTerminal, 100);
    });

    // Handle resize with ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(fitTerminal);
    });
    resizeObserver.observe(outputContainerRef.current);

    // Welcome message
    xterm.writeln('\x1b[90m─── Agent Terminal Output ───\x1b[0m');
    xterm.writeln('');

    // Write existing outputs
    for (const output of terminalOutputs) {
      writeOutputToXterm(xterm, output);
    }
    lastOutputCountRef.current = terminalOutputs.length;

    return () => {
      resizeObserver.disconnect();
      xterm.dispose();
      outputXtermRef.current = null;
      outputFitAddonRef.current = null;
    };
  }, [activeTab]); // Only depend on activeTab, not terminalOutputs

  // Write new outputs to xterm when they change
  useEffect(() => {
    if (!outputXtermRef.current || activeTab !== 'output') return;
    
    const xterm = outputXtermRef.current;
    const newOutputs = terminalOutputs.slice(lastOutputCountRef.current);
    
    for (const output of newOutputs) {
      writeOutputToXterm(xterm, output);
    }
    
    lastOutputCountRef.current = terminalOutputs.length;
  }, [terminalOutputs, activeTab]);

  // Helper to write terminal output with proper formatting
  const writeOutputToXterm = (xterm: XTerm, output: { command: string; output: string; exitCode?: number; isRunning: boolean }) => {
    // Command prompt
    xterm.writeln(`\x1b[32m❯\x1b[0m \x1b[1m${output.command}\x1b[0m`);
    
    // Output content - write as-is to preserve ANSI codes
    if (output.output) {
      // Split by lines and write each, handling both \n and \r\n
      const lines = output.output.split(/\r?\n/);
      for (const line of lines) {
        xterm.writeln(line);
      }
    }
    
    // Status indicator
    if (output.isRunning) {
      xterm.writeln('\x1b[33m⟳ running...\x1b[0m');
    } else if (output.exitCode !== undefined) {
      if (output.exitCode === 0) {
        xterm.writeln(`\x1b[32m✓ exit code: ${output.exitCode}\x1b[0m`);
      } else {
        xterm.writeln(`\x1b[31m✗ exit code: ${output.exitCode}\x1b[0m`);
      }
    }
    
    xterm.writeln(''); // Blank line between commands
  };

  // Initialize sandbox xterm.js terminal
  useEffect(() => {
    if (activeTab !== 'sandbox' || !sandboxContainerRef.current || sandboxXtermRef.current) return;
    if (!sandboxAvailable) return;

    const xterm = new XTerm({
      theme: xtermTheme,
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      tabStopWidth: 4,
      scrollOnUserInput: true,
      fastScrollModifier: 'alt',
      smoothScrollDuration: 0,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.open(sandboxContainerRef.current);
    
    sandboxXtermRef.current = xterm;
    sandboxFitAddonRef.current = fitAddon;

    // Fit after a short delay to ensure container has dimensions
    const fitTerminal = () => {
      try {
        fitAddon.fit();
      } catch (e) {
        // Ignore fit errors during initialization
      }
    };

    // Initial fit with multiple attempts for reliability
    requestAnimationFrame(() => {
      fitTerminal();
      setTimeout(fitTerminal, 100);
    });

    // Handle resize with ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(fitTerminal);
    });
    resizeObserver.observe(sandboxContainerRef.current);

    // Welcome message
    xterm.writeln('\x1b[1;36mSandbox Terminal\x1b[0m');
    xterm.writeln(`Repository: ${owner}/${repo}`);
    xterm.writeln('');
    xterm.writeln('Click "Connect" to start an interactive session.');
    xterm.writeln('');

    return () => {
      resizeObserver.disconnect();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      xterm.dispose();
      sandboxXtermRef.current = null;
      sandboxFitAddonRef.current = null;
    };
  }, [activeTab, sandboxAvailable, owner, repo]);

  // Handle resize when height changes
  useEffect(() => {
    requestAnimationFrame(() => {
      if (activeTab === 'output' && outputFitAddonRef.current) {
        outputFitAddonRef.current.fit();
      } else if (activeTab === 'sandbox' && sandboxFitAddonRef.current) {
        sandboxFitAddonRef.current.fit();
      }
    });
  }, [height, activeTab]);

  // Connect to sandbox WebSocket
  const connectToSandbox = useCallback(async () => {
    if (sandboxState === 'connecting' || sandboxState === 'connected') return;
    if (!sandboxXtermRef.current || !repoId) return;

    const xterm = sandboxXtermRef.current;
    setSandboxState('connecting');

    xterm.clear();
    xterm.writeln('\x1b[33mConnecting to sandbox...\x1b[0m');

    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const apiHost = apiUrl ? new URL(apiUrl).host : window.location.host;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${apiHost}/api/sandbox/ws/${repoId}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setSandboxState('connected');
        xterm.writeln('\x1b[32mConnected!\x1b[0m');
        xterm.writeln('');

        // Send initial config
        ws.send(JSON.stringify({
          type: 'init',
          cols: xterm.cols,
          rows: xterm.rows,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case 'data':
              xterm.write(msg.data);
              break;
            case 'error':
              xterm.writeln(`\x1b[31mError: ${msg.message}\x1b[0m`);
              break;
            case 'exit':
              xterm.writeln(`\x1b[33mSession ended (exit code: ${msg.code})\x1b[0m`);
              disconnectFromSandbox();
              break;
          }
        } catch {
          // Binary data or invalid JSON - write as-is
          xterm.write(event.data);
        }
      };

      ws.onclose = () => {
        xterm.writeln('\x1b[33mDisconnected\x1b[0m');
        setSandboxState('disconnected');
      };

      ws.onerror = () => {
        setSandboxState('error');
        xterm.writeln('\x1b[31mConnection failed\x1b[0m');
      };

      // Handle user input
      xterm.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'input', data }));
        }
      });

      // Handle resize
      xterm.onResize(({ cols, rows }) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
      });
    } catch (err) {
      setSandboxState('error');
      xterm.writeln(`\x1b[31mFailed to connect: ${err}\x1b[0m`);
    }
  }, [repoId, sandboxState]);

  // Disconnect from sandbox
  const disconnectFromSandbox = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setSandboxState('disconnected');
  }, []);

  // Clear output terminal
  const clearOutputTerminal = useCallback(() => {
    if (outputXtermRef.current) {
      outputXtermRef.current.clear();
      outputXtermRef.current.writeln('\x1b[90m─── Agent Terminal Output ───\x1b[0m');
      outputXtermRef.current.writeln('');
    }
    clearTerminal(); // Also clear the store
    lastOutputCountRef.current = 0;
  }, [clearTerminal]);

  // Clear sandbox terminal
  const clearSandboxTerminal = useCallback(() => {
    if (sandboxXtermRef.current) {
      sandboxXtermRef.current.clear();
    }
  }, []);

  return (
    <div className="flex flex-col border-t bg-zinc-950" style={{ height }}>
      {/* Header */}
      <div className="flex items-center justify-between h-8 px-3 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TerminalTab)}>
            <TabsList className="h-6 bg-transparent p-0 gap-1">
              <TabsTrigger 
                value="output" 
                className="h-6 px-2 text-xs data-[state=active]:bg-zinc-800"
              >
                Output
              </TabsTrigger>
              <TabsTrigger 
                value="sandbox" 
                className="h-6 px-2 text-xs data-[state=active]:bg-zinc-800"
                disabled={!sandboxAvailable}
              >
                Sandbox
                {sandboxAvailable && (
                  <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {activeTab === 'sandbox' && (
            <>
              {sandboxState === 'connecting' && (
                <Badge variant="outline" className="h-5 text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">
                  <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
                  Connecting
                </Badge>
              )}
              {sandboxState === 'connected' && (
                <Badge variant="outline" className="h-5 text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  Connected
                </Badge>
              )}
              {sandboxState === 'error' && (
                <Badge variant="outline" className="h-5 text-[10px] bg-red-500/10 text-red-400 border-red-500/20">
                  <AlertCircle className="h-2.5 w-2.5 mr-1" />
                  Error
                </Badge>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          {activeTab === 'sandbox' && sandboxAvailable && (
            <>
              {sandboxState === 'disconnected' || sandboxState === 'error' ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6 text-muted-foreground hover:text-emerald-400"
                  onClick={connectToSandbox}
                  title="Connect"
                >
                  <Power className="h-3 w-3" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="h-6 w-6 text-muted-foreground hover:text-red-400"
                  onClick={disconnectFromSandbox}
                  disabled={sandboxState === 'connecting'}
                  title="Disconnect"
                >
                  <PowerOff className="h-3 w-3" />
                </Button>
              )}
            </>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={activeTab === 'output' ? clearOutputTerminal : clearSandboxTerminal}
            title="Clear"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content - Terminal containers need explicit height for xterm scrolling */}
      {activeTab === 'output' ? (
        /* Output Tab - xterm.js terminal for agent command results */
        <div 
          ref={outputContainerRef} 
          className="flex-1 min-h-0"
          style={{ 
            padding: '4px',
            // Ensure xterm can calculate proper dimensions
            overflow: 'hidden',
          }}
        />
      ) : (
        /* Sandbox Tab - xterm.js Interactive terminal */
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {!sandboxAvailable ? (
            <div className="p-3 font-mono text-xs text-zinc-500">
              {sandboxStatus?.provider === 'docker' && sandboxStatus?.dockerAvailable === false ? (
                <>
                  <p className="text-amber-400">Docker sandbox is configured but Docker is not available.</p>
                  <p className="mt-2">
                    Either install Docker, ensure it's running, or switch to E2B/Daytona/Vercel provider in{' '}
                    <span className="text-zinc-300">Settings → Sandbox</span>.
                  </p>
                </>
              ) : (
                <>
                  <p>Sandbox is not configured for this repository.</p>
                  <p className="mt-2">
                    Go to <span className="text-zinc-300">Settings → Sandbox</span> to enable it.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div 
              ref={sandboxContainerRef} 
              className="flex-1 min-h-0 p-1"
              style={{ overflow: 'hidden' }}
            />
          )}
        </div>
      )}
    </div>
  );
}
