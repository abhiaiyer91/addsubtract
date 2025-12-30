import { useRef, useEffect, useState, useCallback } from 'react';
import { Terminal, Trash2, Play, Square, Loader2, AlertCircle } from 'lucide-react';
import { useIDEStore } from '@/lib/ide-store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';

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
  const [sandboxOutput, setSandboxOutput] = useState<string[]>([]);
  const [commandInput, setCommandInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if sandbox is available for this repo
  const { data: sandboxStatus } = trpc.sandbox.getStatus.useQuery(
    { repoId: repoId! },
    { enabled: !!repoId }
  );

  const sandboxAvailable = sandboxStatus?.ready ?? false;

  // Execute command in sandbox
  const execMutation = trpc.sandbox.exec?.useMutation?.({
    onSuccess: (result) => {
      setSandboxOutput((prev) => [
        ...prev,
        `$ ${commandInput}`,
        result.stdout || '',
        result.stderr ? `\x1b[31m${result.stderr}\x1b[0m` : '',
        result.error ? `\x1b[31mError: ${result.error}\x1b[0m` : '',
        `\x1b[90mexit code: ${result.exitCode ?? 'unknown'}\x1b[0m`,
        '',
      ].filter(Boolean));
      setCommandInput('');
      setSandboxState('connected');
    },
    onError: (error) => {
      setSandboxOutput((prev) => [
        ...prev,
        `$ ${commandInput}`,
        `\x1b[31mError: ${error.message}\x1b[0m`,
        '',
      ]);
      setCommandInput('');
    },
  });

  // Auto-scroll to bottom when new output is added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [terminalOutputs, sandboxOutput]);

  // Handle command submission
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim() || !repoId) return;

    // Add to history
    setCommandHistory((prev) => [...prev, commandInput]);
    setHistoryIndex(-1);

    // Execute command
    setSandboxState('connecting');
    setSandboxOutput((prev) => [...prev, `$ ${commandInput}`]);
    
    // Use REST API for now (WebSocket would be for interactive PTY)
    fetch(`/api/sandbox/${repoId}/exec`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ command: commandInput }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text.startsWith('<') ? `Server returned ${res.status}` : text);
        }
        return res.json();
      })
      .then((result) => {
        setSandboxOutput((prev) => [
          ...prev,
          result.stdout || '',
          result.stderr ? `\x1b[31m${result.stderr}\x1b[0m` : '',
          result.error ? `\x1b[31mError: ${result.error}\x1b[0m` : '',
          `\x1b[90mexit code: ${result.exitCode ?? 'unknown'}\x1b[0m`,
          '',
        ].filter(Boolean));
        setSandboxState('connected');
      })
      .catch((error) => {
        setSandboxOutput((prev) => [
          ...prev,
          `\x1b[31mError: ${error.message}\x1b[0m`,
          '',
        ]);
        setSandboxState('error');
      });

    setCommandInput('');
  }, [commandInput, repoId]);

  // Handle keyboard navigation in history
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setCommandInput(commandHistory[commandHistory.length - 1 - newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setCommandInput(commandHistory[commandHistory.length - 1 - newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCommandInput('');
      }
    }
  }, [historyIndex, commandHistory]);

  // Clear sandbox output
  const clearSandboxOutput = useCallback(() => {
    setSandboxOutput([]);
  }, []);

  // Render ANSI codes (simple version)
  const renderAnsi = (text: string) => {
    // Simple ANSI color code handling
    return text
      .replace(/\x1b\[31m/g, '<span class="text-red-400">')
      .replace(/\x1b\[32m/g, '<span class="text-emerald-400">')
      .replace(/\x1b\[33m/g, '<span class="text-amber-400">')
      .replace(/\x1b\[90m/g, '<span class="text-zinc-500">')
      .replace(/\x1b\[0m/g, '</span>');
  };

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
                  Running
                </Badge>
              )}
              {sandboxState === 'connected' && (
                <Badge variant="outline" className="h-5 text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  Ready
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

        <Button
          variant="ghost"
          size="icon-sm"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={activeTab === 'output' ? clearTerminal : clearSandboxOutput}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
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
        /* Sandbox Tab - Interactive terminal */
        <div className="flex-1 flex flex-col">
          <ScrollArea className="flex-1">
            <div ref={scrollRef} className="p-3 font-mono text-xs space-y-0.5">
              {!sandboxAvailable ? (
                <div className="text-zinc-500">
                  {sandboxStatus?.provider === 'docker' && sandboxStatus?.dockerAvailable === false ? (
                    <>
                      <p className="text-amber-400">Docker sandbox is configured but Docker is not available.</p>
                      <p className="mt-2">
                        Either install Docker, ensure it's running, or switch to E2B/Daytona provider in{' '}
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
              ) : sandboxOutput.length === 0 ? (
                <div className="text-zinc-500">
                  <p className="text-emerald-400">Sandbox ready.</p>
                  <p className="mt-1">
                    Type a command below to execute it in an isolated environment.
                  </p>
                  <p className="text-zinc-600 mt-2">
                    Provider: {sandboxStatus?.provider?.toUpperCase()}
                  </p>
                </div>
              ) : (
                sandboxOutput.map((line, i) => (
                  <div 
                    key={i} 
                    className="text-zinc-400 whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: renderAnsi(line) }}
                  />
                ))
              )}
            </div>
          </ScrollArea>

          {/* Command input */}
          {sandboxAvailable && (
            <form onSubmit={handleSubmit} className="flex items-center gap-2 px-3 py-2 border-t border-zinc-800">
              <span className="text-emerald-400 text-xs">$</span>
              <input
                ref={inputRef}
                type="text"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter command..."
                disabled={sandboxState === 'connecting'}
                className="flex-1 bg-transparent text-xs text-zinc-300 placeholder:text-zinc-600 outline-none font-mono"
              />
              {sandboxState === 'connecting' && (
                <Loader2 className="h-3 w-3 text-zinc-500 animate-spin" />
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
