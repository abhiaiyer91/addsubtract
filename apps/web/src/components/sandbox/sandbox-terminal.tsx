/**
 * Sandbox Terminal Component - Warp-style
 * 
 * A modern, block-based terminal that connects to a sandbox environment.
 * Inspired by Warp terminal with visual command blocks and chat-like input.
 */

import { useEffect, useRef, useState, useCallback, KeyboardEvent } from 'react';
import { Terminal, Power, PowerOff, Loader2, AlertCircle, Trash2, Send, ArrowUp, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TerminalBlock, TerminalBlockData, TerminalEmptyState } from './terminal-block';

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
  const [sessionState, setSessionState] = useState<SessionState>('disconnected');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<TerminalBlockData[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [currentCwd, setCurrentCwd] = useState('~');
  
  const wsRef = useRef<WebSocket | null>(null);
  const blocksContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentBlockIdRef = useRef<string | null>(null);

  // Auto-scroll to bottom when new blocks are added
  useEffect(() => {
    if (blocksContainerRef.current) {
      blocksContainerRef.current.scrollTop = blocksContainerRef.current.scrollHeight;
    }
  }, [blocks]);

  // Focus input when connected
  useEffect(() => {
    if (sessionState === 'connected' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [sessionState]);

  // Connect to sandbox
  const connect = useCallback(async () => {
    if (sessionState === 'connecting' || sessionState === 'connected') return;

    setSessionState('connecting');
    setError(null);
    setBlocks([]);

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
        
        // Send initial config
        ws.send(JSON.stringify({
          type: 'init',
          cols: 120,
          rows: 30,
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
              // Append output to current block
              if (currentBlockIdRef.current) {
                setBlocks(prev => prev.map(block => 
                  block.id === currentBlockIdRef.current
                    ? { ...block, output: block.output + msg.data }
                    : block
                ));
              }
              break;
            case 'prompt':
              // Command finished, update block
              if (currentBlockIdRef.current) {
                setBlocks(prev => prev.map(block => 
                  block.id === currentBlockIdRef.current
                    ? { ...block, isRunning: false, exitCode: msg.exitCode ?? 0 }
                    : block
                ));
                currentBlockIdRef.current = null;
              }
              if (msg.cwd) {
                setCurrentCwd(msg.cwd);
              }
              break;
            case 'error':
              setError(msg.message);
              if (currentBlockIdRef.current) {
                setBlocks(prev => prev.map(block => 
                  block.id === currentBlockIdRef.current
                    ? { ...block, isRunning: false, exitCode: 1, output: block.output + `\nError: ${msg.message}` }
                    : block
                ));
                currentBlockIdRef.current = null;
              }
              break;
            case 'exit':
              if (currentBlockIdRef.current) {
                setBlocks(prev => prev.map(block => 
                  block.id === currentBlockIdRef.current
                    ? { ...block, isRunning: false, exitCode: msg.code }
                    : block
                ));
                currentBlockIdRef.current = null;
              }
              break;
          }
        } catch {
          // If not JSON, treat as raw output
          if (currentBlockIdRef.current) {
            setBlocks(prev => prev.map(block => 
              block.id === currentBlockIdRef.current
                ? { ...block, output: block.output + event.data }
                : block
            ));
          }
        }
      };

      ws.onclose = () => {
        if (sessionState === 'connected') {
          // Add disconnect message as a system block
        }
        setSessionState('disconnected');
        setSessionId(null);
        onSessionEnd?.();
      };

      ws.onerror = () => {
        setSessionState('error');
        setError('Connection failed. Make sure the sandbox is configured.');
      };

    } catch (err) {
      setSessionState('error');
      setError(err instanceof Error ? err.message : 'Failed to connect');
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

  // Send command
  const sendCommand = useCallback((command: string) => {
    if (!command.trim() || sessionState !== 'connected' || !wsRef.current) return;

    const blockId = `block-${Date.now()}`;
    currentBlockIdRef.current = blockId;

    // Add new block
    const newBlock: TerminalBlockData = {
      id: blockId,
      command: command.trim(),
      output: '',
      isRunning: true,
      timestamp: new Date(),
      cwd: currentCwd,
    };

    setBlocks(prev => [...prev, newBlock]);
    setCommandHistory(prev => [...prev, command.trim()]);
    setHistoryIndex(-1);
    setInputValue('');

    // Send to websocket
    wsRef.current.send(JSON.stringify({ 
      type: 'input', 
      data: command.trim() + '\n' 
    }));
  }, [sessionState, currentCwd]);

  // Handle input keydown
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendCommand(inputValue);
    } else if (e.key === 'ArrowUp' && inputValue === '') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown' && historyIndex !== -1) {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[newIndex]);
      } else {
        setHistoryIndex(-1);
        setInputValue('');
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      // Send Ctrl+C
      if (currentBlockIdRef.current && wsRef.current) {
        wsRef.current.send(JSON.stringify({ type: 'input', data: '\x03' }));
      }
    }
  };

  // Clear terminal
  const clearTerminal = () => {
    setBlocks([]);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return (
    <div className={cn(
      'terminal-container flex flex-col bg-[#0a0a0c] rounded-xl overflow-hidden',
      'border border-zinc-800/60 shadow-2xl shadow-black/40',
      className
    )}>
      {/* Premium Header */}
      <div className="terminal-header flex items-center justify-between h-11 px-4 border-b border-zinc-800/60 bg-gradient-to-b from-zinc-900/90 to-zinc-900/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {/* Traffic light buttons */}
          <div className="flex items-center gap-1.5 mr-2">
            <button 
              className="w-3 h-3 rounded-full bg-zinc-700/80 hover:bg-red-500 transition-all duration-200 group relative ring-1 ring-black/20"
              title="Close"
              onClick={disconnect}
            >
              <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 text-red-900 text-[8px] font-bold">×</span>
            </button>
            <button 
              className="w-3 h-3 rounded-full bg-zinc-700/80 hover:bg-yellow-500 transition-all duration-200 group relative ring-1 ring-black/20"
              title="Minimize"
            >
              <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 text-yellow-900 text-[8px] font-bold">−</span>
            </button>
            <button 
              className="w-3 h-3 rounded-full bg-zinc-700/80 hover:bg-green-500 transition-all duration-200 group relative ring-1 ring-black/20"
              title="Maximize"
            >
              <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 text-green-900 text-[8px] font-bold">+</span>
            </button>
          </div>
          
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-zinc-800/50">
              <Terminal className="h-3.5 w-3.5 text-zinc-400" />
              <span className="text-xs font-medium text-zinc-300">Sandbox</span>
            </div>
            
            {sessionState === 'connected' && (
              <Badge variant="outline" className="h-5 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-sm shadow-emerald-500/10 gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Connected
              </Badge>
            )}
            {sessionState === 'connecting' && (
              <Badge variant="outline" className="h-5 text-[10px] font-medium bg-amber-500/10 text-amber-400 border-amber-500/30 shadow-sm shadow-amber-500/10 gap-1.5">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                Connecting
              </Badge>
            )}
            {sessionState === 'error' && (
              <Badge variant="outline" className="h-5 text-[10px] font-medium bg-red-500/10 text-red-400 border-red-500/30 shadow-sm shadow-red-500/10 gap-1.5">
                <AlertCircle className="h-2.5 w-2.5" />
                Error
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {blocks.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
              onClick={clearTerminal}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
          
          {sessionState === 'disconnected' || sessionState === 'error' ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-3 text-xs gap-1.5 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all"
              onClick={connect}
            >
              <Power className="h-3.5 w-3.5" />
              Connect
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-3 text-xs gap-1.5 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
              onClick={disconnect}
              disabled={sessionState === 'connecting'}
            >
              <PowerOff className="h-3.5 w-3.5" />
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {/* Command Blocks Area */}
      <div 
        ref={blocksContainerRef}
        className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent"
        style={{ minHeight: '250px' }}
      >
        {sessionState === 'disconnected' && blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-zinc-800/80 to-zinc-900 flex items-center justify-center mb-4 shadow-lg ring-1 ring-zinc-700/50">
              <Terminal className="h-7 w-7 text-zinc-500" />
            </div>
            <h3 className="text-zinc-200 font-medium text-sm mb-2">Sandbox Terminal</h3>
            <p className="text-zinc-500 text-xs max-w-xs mb-4">
              {owner}/{repo}{branch ? ` (${branch})` : ''}
            </p>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
              onClick={connect}
            >
              <Power className="h-3.5 w-3.5 mr-2" />
              Connect to Sandbox
            </Button>
          </div>
        ) : blocks.length === 0 && sessionState === 'connected' ? (
          <TerminalEmptyState />
        ) : (
          blocks.map((block, index) => (
            <TerminalBlock 
              key={block.id} 
              block={block} 
              isLatest={index === blocks.length - 1}
            />
          ))
        )}
      </div>

      {/* Command Input Area - Warp-style */}
      {sessionState === 'connected' && (
        <div className="border-t border-zinc-800/60 bg-gradient-to-b from-zinc-900/50 to-zinc-900/80 p-3">
          <div className="flex items-start gap-3">
            {/* Prompt indicator */}
            <div className="flex items-center gap-2 pt-2">
              <span className="text-emerald-400 font-mono text-sm font-bold">$</span>
            </div>
            
            {/* Input area */}
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter a command..."
                className={cn(
                  "w-full bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2",
                  "text-sm font-mono text-zinc-100 placeholder:text-zinc-600",
                  "focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20",
                  "resize-none min-h-[40px] max-h-[120px]",
                  "transition-all duration-200"
                )}
                rows={1}
                disabled={currentBlockIdRef.current !== null}
              />
              
              {/* Keyboard hints */}
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                {inputValue && (
                  <kbd className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700/50">
                    Enter
                  </kbd>
                )}
                <kbd className="text-[10px] text-zinc-600 bg-zinc-800/50 px-1.5 py-0.5 rounded border border-zinc-700/30">
                  ↑↓
                </kbd>
              </div>
            </div>

            {/* Send button */}
            <Button
              size="sm"
              className={cn(
                "h-10 w-10 p-0 rounded-lg transition-all duration-200",
                inputValue 
                  ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" 
                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              )}
              onClick={() => sendCommand(inputValue)}
              disabled={!inputValue || currentBlockIdRef.current !== null}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Current working directory */}
          <div className="flex items-center gap-2 mt-2 px-1">
            <span className="text-[10px] text-zinc-600 font-mono">{currentCwd}</span>
            {commandHistory.length > 0 && (
              <span className="text-[10px] text-zinc-700">•</span>
            )}
            {commandHistory.length > 0 && (
              <span className="text-[10px] text-zinc-600">{commandHistory.length} commands</span>
            )}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="px-4 py-3 text-xs text-red-400 border-t border-red-500/20 bg-red-500/5 flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          <span>{error}</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 text-xs text-red-400 hover:text-red-300"
            onClick={() => setError(null)}
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
