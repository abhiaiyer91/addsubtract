/**
 * Sandbox Terminal Component
 * 
 * An interactive terminal that connects to a sandbox environment.
 * Uses xterm.js for full terminal emulation with PTY support.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Terminal, Power, PowerOff, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import '@xterm/xterm/css/xterm.css';

interface SandboxTerminalProps {
  repoId: string;
  owner: string;
  repo: string;
  branch?: string;
  className?: string;
  onSessionStart?: (sessionId: string) => void;
  onSessionEnd?: () => void;
}

type SessionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export function SandboxTerminal({
  repoId,
  owner,
  repo,
  branch,
  className,
  onSessionStart,
  onSessionEnd,
}: SandboxTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>('disconnected');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Initialize xterm
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    // Premium terminal theme inspired by best-in-class terminals
    const xtermTheme = {
      background: '#0c0c0f',
      foreground: '#e8e8ed',
      cursor: '#10b981',
      cursorAccent: '#0c0c0f',
      selectionBackground: 'rgba(16, 185, 129, 0.25)',
      selectionForeground: '#ffffff',
      black: '#1a1a1f',
      red: '#ff6b6b',
      green: '#10b981',
      yellow: '#fbbf24',
      blue: '#60a5fa',
      magenta: '#c084fc',
      cyan: '#22d3ee',
      white: '#e8e8ed',
      brightBlack: '#71717a',
      brightRed: '#fca5a5',
      brightGreen: '#34d399',
      brightYellow: '#fde047',
      brightBlue: '#93c5fd',
      brightMagenta: '#d8b4fe',
      brightCyan: '#67e8f9',
      brightWhite: '#ffffff',
    };

    const xterm = new XTerm({
      theme: xtermTheme,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 13,
      fontWeight: '400',
      fontWeightBold: '600',
      lineHeight: 1.5,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 2,
      scrollback: 10000,
      tabStopWidth: 4,
      allowProposedApi: true,
      macOptionIsMeta: true,
      macOptionClickForcesSelection: true,
      drawBoldTextInBrightColors: true,
      minimumContrastRatio: 4.5,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    xterm.loadAddon(fitAddon);
    xterm.loadAddon(webLinksAddon);
    xterm.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(terminalRef.current);

    // Welcome message
    xterm.writeln('\x1b[1;36mWit Sandbox Terminal\x1b[0m');
    xterm.writeln(`Repository: ${owner}/${repo}${branch ? ` (${branch})` : ''}`);
    xterm.writeln('');
    xterm.writeln('Click "Connect" to start a sandbox session.');
    xterm.writeln('');

    return () => {
      resizeObserver.disconnect();
      xterm.dispose();
      xtermRef.current = null;
    };
  }, [owner, repo, branch]);

  // Connect to sandbox
  const connect = useCallback(async () => {
    if (sessionState === 'connecting' || sessionState === 'connected') return;

    setSessionState('connecting');
    setError(null);

    const xterm = xtermRef.current;
    if (!xterm) return;

    xterm.clear();
    xterm.writeln('\x1b[33mConnecting to sandbox...\x1b[0m');

    try {
      // Get WebSocket URL for sandbox
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const apiHost = apiUrl ? new URL(apiUrl).host : window.location.host;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${apiHost}/api/sandbox/ws/${repoId}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setSessionState('connected');
        xterm.writeln('\x1b[32mConnected!\x1b[0m');
        xterm.writeln('');

        // Send initial config
        ws.send(JSON.stringify({
          type: 'init',
          cols: xterm.cols,
          rows: xterm.rows,
          branch,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          switch (msg.type) {
            case 'session':
              setSessionId(msg.sessionId);
              onSessionStart?.(msg.sessionId);
              break;
            case 'data':
              xterm.write(msg.data);
              break;
            case 'error':
              setError(msg.message);
              xterm.writeln(`\x1b[31mError: ${msg.message}\x1b[0m`);
              break;
            case 'exit':
              xterm.writeln(`\x1b[33mSession ended (exit code: ${msg.code})\x1b[0m`);
              disconnect();
              break;
          }
        } catch {
          // Binary data or invalid JSON - write as-is
          xterm.write(event.data);
        }
      };

      ws.onclose = () => {
        if (sessionState === 'connected') {
          xterm.writeln('\x1b[33mDisconnected\x1b[0m');
        }
        setSessionState('disconnected');
        setSessionId(null);
        onSessionEnd?.();
      };

      ws.onerror = () => {
        setSessionState('error');
        setError('Connection failed');
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
      setSessionState('error');
      setError(err instanceof Error ? err.message : 'Failed to connect');
      xterm.writeln(`\x1b[31mFailed to connect: ${err}\x1b[0m`);
    }
  }, [repoId, branch, sessionState, onSessionStart, onSessionEnd]);

  // Disconnect from sandbox
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setSessionState('disconnected');
    setSessionId(null);
    onSessionEnd?.();
  }, [onSessionEnd]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return (
    <div className={cn('terminal-container flex flex-col bg-[#0c0c0f] rounded-xl border border-zinc-800/50 overflow-hidden shadow-2xl shadow-black/20', className)}>
      {/* Premium Header */}
      <div className="terminal-header flex items-center justify-between h-10 px-3 border-b border-zinc-800/50 bg-gradient-to-b from-zinc-900/80 to-zinc-900/40">
        <div className="flex items-center gap-3">
          {/* Traffic light buttons */}
          <div className="flex items-center gap-1.5 mr-1">
            <button 
              className="w-3 h-3 rounded-full bg-zinc-700 hover:bg-red-500 transition-colors group relative"
              title="Close"
            >
              <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 text-red-900 text-[8px] font-bold">×</span>
            </button>
            <button 
              className="w-3 h-3 rounded-full bg-zinc-700 hover:bg-yellow-500 transition-colors group relative"
              title="Minimize"
            >
              <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 text-yellow-900 text-[8px] font-bold">−</span>
            </button>
            <button 
              className="w-3 h-3 rounded-full bg-zinc-700 hover:bg-green-500 transition-colors group relative"
              title="Maximize"
            >
              <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 text-green-900 text-[8px] font-bold">+</span>
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-zinc-500" />
            <span className="text-sm font-medium text-zinc-300">Sandbox Terminal</span>
          </div>
          
          {sessionState === 'connected' && (
            <Badge variant="outline" className="h-5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-sm shadow-emerald-500/10">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
              Connected
            </Badge>
          )}
          {sessionState === 'connecting' && (
            <Badge variant="outline" className="h-5 text-[10px] font-medium bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-sm shadow-amber-500/10">
              <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
              Connecting
            </Badge>
          )}
          {sessionState === 'error' && (
            <Badge variant="outline" className="h-5 text-[10px] font-medium bg-red-500/10 text-red-400 border-red-500/30 shadow-sm shadow-red-500/10">
              <AlertCircle className="h-2.5 w-2.5 mr-1" />
              Error
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          {sessionState === 'disconnected' || sessionState === 'error' ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10"
              onClick={connect}
            >
              <Power className="h-3.5 w-3.5" />
              Connect
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
              onClick={disconnect}
              disabled={sessionState === 'connecting'}
            >
              <PowerOff className="h-3.5 w-3.5" />
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {/* Terminal */}
      <div 
        ref={terminalRef} 
        className="terminal-content flex-1"
        style={{ minHeight: '300px' }}
      />

      {/* Error message */}
      {error && (
        <div className="px-4 py-2.5 text-xs text-red-400 border-t border-red-500/20 bg-red-500/5 flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
