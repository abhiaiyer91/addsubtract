/**
 * Terminal Block Component - Warp-style command block
 * 
 * Each command and its output is displayed as a distinct visual block,
 * similar to Warp terminal's block-based UI.
 */

import { useState, useRef, useEffect } from 'react';
import { Check, Copy, ChevronRight, Clock, Terminal, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TerminalBlockData {
  id: string;
  command: string;
  output: string;
  exitCode?: number;
  isRunning: boolean;
  timestamp: Date;
  cwd?: string;
}

interface TerminalBlockProps {
  block: TerminalBlockData;
  isLatest?: boolean;
}

export function TerminalBlock({ block, isLatest }: TerminalBlockProps) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const outputRef = useRef<HTMLPreElement>(null);

  // Auto-scroll to bottom when output updates for latest block
  useEffect(() => {
    if (isLatest && block.isRunning && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [block.output, isLatest, block.isRunning]);

  const copyCommand = async () => {
    await navigator.clipboard.writeText(block.command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyOutput = async () => {
    await navigator.clipboard.writeText(block.output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: false 
    });
  };

  const getStatusIcon = () => {
    if (block.isRunning) {
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />;
    }
    if (block.exitCode === 0) {
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
    }
    if (block.exitCode !== undefined) {
      return <AlertCircle className="h-3.5 w-3.5 text-red-400" />;
    }
    return null;
  };

  const getStatusColor = () => {
    if (block.isRunning) return 'border-l-amber-500/50';
    if (block.exitCode === 0) return 'border-l-emerald-500/50';
    if (block.exitCode !== undefined && block.exitCode !== 0) return 'border-l-red-500/50';
    return 'border-l-zinc-700';
  };

  // Parse ANSI codes to styled spans (simplified version)
  const parseAnsiOutput = (text: string) => {
    // Remove ANSI escape codes for now - could be enhanced with a proper parser
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  };

  return (
    <div 
      className={cn(
        "terminal-block group relative",
        "bg-zinc-900/50 hover:bg-zinc-900/70 transition-colors",
        "border-l-2 rounded-r-lg",
        getStatusColor(),
        isLatest && block.isRunning && "animate-pulse-subtle"
      )}
    >
      {/* Command Header */}
      <div 
        className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Expand/Collapse */}
        <ChevronRight 
          className={cn(
            "h-3.5 w-3.5 text-zinc-500 transition-transform duration-200",
            isExpanded && "rotate-90"
          )} 
        />
        
        {/* Status Icon */}
        {getStatusIcon()}
        
        {/* Command */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <span className="text-emerald-400 font-mono text-sm">$</span>
          <code className="text-zinc-100 font-mono text-sm truncate font-medium">
            {block.command}
          </code>
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {block.cwd && (
            <span className="text-[10px] text-zinc-500 font-mono max-w-[150px] truncate">
              {block.cwd}
            </span>
          )}
          <span className="text-[10px] text-zinc-500 flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {formatTime(block.timestamp)}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); copyCommand(); }}
            className="p-1 rounded hover:bg-zinc-700/50 text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Copy command"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>

        {/* Exit Code Badge */}
        {!block.isRunning && block.exitCode !== undefined && (
          <span className={cn(
            "text-[10px] font-mono px-1.5 py-0.5 rounded",
            block.exitCode === 0 
              ? "bg-emerald-500/10 text-emerald-400" 
              : "bg-red-500/10 text-red-400"
          )}>
            {block.exitCode === 0 ? 'OK' : `exit ${block.exitCode}`}
          </span>
        )}
      </div>

      {/* Output */}
      {isExpanded && block.output && (
        <div className="relative border-t border-zinc-800/50">
          <pre 
            ref={outputRef}
            className={cn(
              "px-4 py-3 text-xs font-mono text-zinc-300 leading-relaxed overflow-x-auto",
              "max-h-[300px] overflow-y-auto",
              "scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent"
            )}
          >
            {parseAnsiOutput(block.output)}
          </pre>
          
          {/* Copy output button */}
          <button
            onClick={copyOutput}
            className={cn(
              "absolute top-2 right-2 p-1.5 rounded",
              "bg-zinc-800/80 hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300",
              "opacity-0 group-hover:opacity-100 transition-all"
            )}
            title="Copy output"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Empty state when no commands have been run
 */
export function TerminalEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center mb-4 shadow-lg">
        <Terminal className="h-8 w-8 text-zinc-500" />
      </div>
      <h3 className="text-zinc-300 font-medium text-sm mb-2">No commands yet</h3>
      <p className="text-zinc-500 text-xs max-w-xs">
        Commands you run will appear here as blocks. Type a command below to get started.
      </p>
    </div>
  );
}

/**
 * Typing indicator when waiting for output
 */
export function TerminalTypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-2">
      <div className="flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-xs text-zinc-500">Running...</span>
    </div>
  );
}
