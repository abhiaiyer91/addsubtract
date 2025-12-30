/**
 * Sandbox Terminal Component
 * 
 * An interactive terminal that connects to a sandbox environment.
 * Uses xterm.js for full terminal emulation with PTY support.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { Terminal, Power, PowerOff, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import 'xterm/css/xterm.css';

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
    <div className={cn('flex flex-col bg-zinc-950 rounded-lg border border-zinc-800', className)}>
      {/* Header */}
      <div className="flex items-center justify-between h-10 px-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-300">Sandbox Terminal</span>
          
          {sessionState === 'connected' && (
            <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              Connected
            </Badge>
          )}
          {sessionState === 'connecting' && (
            <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/20">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Connecting
            </Badge>
          )}
          {sessionState === 'error' && (
            <Badge variant="outline" className="text-xs bg-red-500/10 text-red-400 border-red-500/20">
              <AlertCircle className="h-3 w-3 mr-1" />
              Error
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {sessionState === 'disconnected' || sessionState === 'error' ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={connect}
            >
              <Power className="h-3.5 w-3.5" />
              Connect
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5 text-red-400 hover:text-red-300"
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
        className="flex-1 p-2"
        style={{ minHeight: '300px' }}
      />

      {/* Error message */}
      {error && (
        <div className="px-3 py-2 text-xs text-red-400 border-t border-zinc-800 bg-red-500/5">
          {error}
        </div>
      )}
    </div>
  );
}
