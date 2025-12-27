import { useRef, useEffect } from 'react';
import { Terminal, Trash2 } from 'lucide-react';
import { useIDEStore } from '@/lib/ide-store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface TerminalPanelProps {
  height: number;
}

export function TerminalPanel({ height }: TerminalPanelProps) {
  const { terminalOutputs, clearTerminal } = useIDEStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new output is added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [terminalOutputs]);

  return (
    <div className="flex flex-col border-t bg-zinc-950" style={{ height }}>
      {/* Header */}
      <div className="flex items-center justify-between h-8 px-3 border-b border-zinc-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Terminal</span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={clearTerminal}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Output */}
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
    </div>
  );
}
