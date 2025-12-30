import { useRef, useEffect, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal, Trash2, Loader2, AlertCircle, Power, PowerOff } from 'lucide-react';
import { useIDEStore } from '@/lib/ide-store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
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

export function TerminalPanel({ height, repoId, owner, repo }: TerminalPanelProps) {
  const { terminalOutputs, clearTerminal } = useIDEStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<TerminalTab>('output');
  const [sandboxState, setSandboxState] = useState<SandboxState>('disconnected');
  
  // xterm.js refs
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Check if sandbox is available for this repo
  const { data: sandboxStatus } = trpc.sandbox.getStatus.useQuery(
    { repoId: repoId! },
    { enabled: !!repoId }
  );

  const sandboxAvailable = sandboxStatus?.ready ?? false;

  // Initialize xterm.js when sandbox tab is active
  useEffect(() => {
    if (activeTab !== 'sandbox' || !terminalContainerRef.current || xtermRef.current) return;
    if (!sandboxAvailable) return;

    const xterm = new XTerm({
      theme: {
        background: '#09090b', // zinc-950
        foreground: '#a1a1aa', // zinc-400
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
        brightBlack: '#52525b',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      tabStopWidth: 4,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.open(terminalContainerRef.current);
    
    // Delay fit to ensure container has proper dimensions
    requestAnimationFrame(() => {
      fitAddon.fit();
    });

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Handle resize with ResizeObserver
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        fitAddon.fit();
      });
    });
    resizeObserver.observe(terminalContainerRef.current);

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
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [activeTab, sandboxAvailable, owner, repo]);

  // Handle resize when height changes
  useEffect(() => {
    if (fitAddonRef.current && activeTab === 'sandbox') {
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
      });
    }
  }, [height, activeTab]);

  // Connect to sandbox WebSocket
  const connectToSandbox = useCallback(async () => {
    if (sandboxState === 'connecting' || sandboxState === 'connected') return;
    if (!xtermRef.current || !repoId) return;

    const xterm = xtermRef.current;
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

  // Auto-scroll to bottom when new output is added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [terminalOutputs]);

  // Clear sandbox terminal
  const clearSandboxTerminal = useCallback(() => {
    if (xtermRef.current) {
      xtermRef.current.clear();
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
            onClick={activeTab === 'output' ? clearTerminal : clearSandboxTerminal}
            title="Clear"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'output' ? (
        /* Output Tab - Agent command results */
        <ScrollArea className="flex-1">
          <div ref={scrollRef} className="p-3 font-mono text-xs space-y-2">
            {terminalOutputs.length === 0 ? (
              <div className="text-zinc-500">
                Terminal output from agent commands will appear here...
              </div>
            ) : (
              terminalOutputs.map((output) => (
                <div key={output.id} className="space-y-1">
                  {/* Command */}
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400">$</span>
                    <span className="text-zinc-300">{output.command}</span>
                    {output.isRunning && (
                      <span className="text-amber-400 animate-pulse">running...</span>
                    )}
                  </div>

                  {/* Output */}
                  {output.output && (
                    <pre className="text-zinc-400 whitespace-pre-wrap pl-4">
                      {output.output}
                    </pre>
                  )}

                  {/* Exit code */}
                  {output.exitCode !== undefined && !output.isRunning && (
                    <div
                      className={cn(
                        'text-xs pl-4',
                        output.exitCode === 0 ? 'text-emerald-500' : 'text-red-500'
                      )}
                    >
                      exit code: {output.exitCode}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      ) : (
        /* Sandbox Tab - xterm.js Interactive terminal */
        <div className="flex-1 flex flex-col overflow-hidden">
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
              ref={terminalContainerRef} 
              className="flex-1 p-1"
            />
          )}
        </div>
      )}
    </div>
  );
}
