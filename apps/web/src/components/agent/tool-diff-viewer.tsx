import { useState, useMemo } from 'react';
import {
  FilePlus,
  FileEdit,
  FileX,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  ExternalLink,
  Maximize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'info';
  content: string;
  lineNumberOld?: number;
  lineNumberNew?: number;
}

interface ToolDiffViewerProps {
  filePath: string;
  changeType: 'create' | 'edit' | 'delete';
  beforeContent?: string;
  afterContent?: string;
  commitHash?: string;
  onOpenFile?: (path: string) => void;
  compact?: boolean;
}

function computeDiff(before: string = '', after: string = ''): DiffLine[] {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const result: DiffLine[] = [];
  
  // Simple line-by-line diff (in production, use a proper diff library)
  let oldLine = 1;
  let newLine = 1;
  
  // Create a map for quick lookup
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);
  
  const maxLines = Math.max(beforeLines.length, afterLines.length);
  
  for (let i = 0; i < maxLines; i++) {
    const beforeL = beforeLines[i];
    const afterL = afterLines[i];
    
    if (beforeL === afterL) {
      // Unchanged
      result.push({
        type: 'unchanged',
        content: beforeL || '',
        lineNumberOld: oldLine++,
        lineNumberNew: newLine++,
      });
    } else if (beforeL !== undefined && !afterSet.has(beforeL)) {
      // Removed
      result.push({
        type: 'removed',
        content: beforeL,
        lineNumberOld: oldLine++,
      });
      
      if (afterL !== undefined && !beforeSet.has(afterL)) {
        // Added at same position
        result.push({
          type: 'added',
          content: afterL,
          lineNumberNew: newLine++,
        });
      }
    } else if (afterL !== undefined && !beforeSet.has(afterL)) {
      // Added
      result.push({
        type: 'added',
        content: afterL,
        lineNumberNew: newLine++,
      });
    } else if (beforeL !== undefined) {
      result.push({
        type: 'unchanged',
        content: beforeL,
        lineNumberOld: oldLine++,
        lineNumberNew: newLine++,
      });
    } else if (afterL !== undefined) {
      result.push({
        type: 'added',
        content: afterL,
        lineNumberNew: newLine++,
      });
    }
  }
  
  return result;
}

function DiffLine({ line }: { line: DiffLine }) {
  return (
    <div className={cn(
      "flex font-mono text-xs leading-5",
      line.type === 'added' && "bg-green-500/10",
      line.type === 'removed' && "bg-red-500/10",
      line.type === 'info' && "bg-blue-500/10"
    )}>
      {/* Old line number */}
      <span className={cn(
        "w-10 flex-shrink-0 text-right pr-2 select-none",
        "text-zinc-600 border-r border-zinc-800"
      )}>
        {line.lineNumberOld || ''}
      </span>
      
      {/* New line number */}
      <span className={cn(
        "w-10 flex-shrink-0 text-right pr-2 select-none",
        "text-zinc-600 border-r border-zinc-800"
      )}>
        {line.lineNumberNew || ''}
      </span>
      
      {/* Change indicator */}
      <span className={cn(
        "w-5 flex-shrink-0 text-center select-none",
        line.type === 'added' && "text-green-400",
        line.type === 'removed' && "text-red-400",
        line.type === 'info' && "text-blue-400"
      )}>
        {line.type === 'added' && '+'}
        {line.type === 'removed' && '-'}
        {line.type === 'info' && '@'}
      </span>
      
      {/* Content */}
      <span className={cn(
        "flex-1 px-2 whitespace-pre",
        line.type === 'added' && "text-green-300",
        line.type === 'removed' && "text-red-300",
        line.type === 'unchanged' && "text-zinc-400",
        line.type === 'info' && "text-blue-300"
      )}>
        {line.content}
      </span>
    </div>
  );
}

export function ToolDiffViewer({
  filePath,
  changeType,
  beforeContent,
  afterContent,
  commitHash,
  onOpenFile,
  compact = false,
}: ToolDiffViewerProps) {
  const [expanded, setExpanded] = useState(!compact);
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const diffLines = useMemo(() => {
    if (changeType === 'create') {
      return (afterContent || '').split('\n').map((line, i) => ({
        type: 'added' as const,
        content: line,
        lineNumberNew: i + 1,
      }));
    }
    if (changeType === 'delete') {
      return (beforeContent || '').split('\n').map((line, i) => ({
        type: 'removed' as const,
        content: line,
        lineNumberOld: i + 1,
      }));
    }
    return computeDiff(beforeContent, afterContent);
  }, [beforeContent, afterContent, changeType]);

  const stats = useMemo(() => {
    const added = diffLines.filter(l => l.type === 'added').length;
    const removed = diffLines.filter(l => l.type === 'removed').length;
    return { added, removed };
  }, [diffLines]);

  const handleCopy = async () => {
    const content = changeType === 'delete' ? beforeContent : afterContent;
    if (content) {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const Icon = changeType === 'create' ? FilePlus : changeType === 'delete' ? FileX : FileEdit;
  const colorClass = changeType === 'create' ? 'text-green-400' : changeType === 'delete' ? 'text-red-400' : 'text-amber-400';
  const bgClass = changeType === 'create' ? 'bg-green-500/10' : changeType === 'delete' ? 'bg-red-500/10' : 'bg-amber-500/10';

  const diffContent = (
    <div className="rounded-lg border border-zinc-800 overflow-hidden bg-zinc-950">
      {/* Header */}
      <div className={cn("flex items-center gap-2 px-3 py-2 border-b border-zinc-800", bgClass)}>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 flex-1 text-left"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-zinc-500" />
          )}
          <Icon className={cn("h-4 w-4", colorClass)} />
          <span className="text-sm font-mono text-zinc-200 truncate">{filePath}</span>
        </button>
        
        {/* Stats */}
        <div className="flex items-center gap-2 text-xs">
          {stats.added > 0 && (
            <span className="text-green-400">+{stats.added}</span>
          )}
          {stats.removed > 0 && (
            <span className="text-red-400">-{stats.removed}</span>
          )}
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-1">
          {commitHash && (
            <span className="text-xs text-zinc-600 font-mono">{commitHash.slice(0, 7)}</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
            onClick={handleCopy}
          >
            {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          </Button>
          {onOpenFile && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
              onClick={() => onOpenFile(filePath)}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
          {!fullscreen && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-zinc-500 hover:text-zinc-300"
              onClick={() => setFullscreen(true)}
            >
              <Maximize2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
      
      {/* Diff content */}
      {expanded && (
        <div className={cn(
          "overflow-auto",
          fullscreen ? "max-h-[70vh]" : "max-h-64"
        )}>
          {diffLines.length === 0 ? (
            <div className="p-4 text-center text-sm text-zinc-500">
              No changes to display
            </div>
          ) : (
            diffLines.map((line, i) => (
              <DiffLine key={i} line={line} />
            ))
          )}
        </div>
      )}
    </div>
  );

  if (fullscreen) {
    return (
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden p-0">
          <DialogHeader className="px-4 py-3 border-b border-zinc-800">
            <DialogTitle className="flex items-center gap-2">
              <Icon className={cn("h-5 w-5", colorClass)} />
              {filePath}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 overflow-auto">
            {diffContent}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return diffContent;
}

/**
 * Compact diff badge for showing in tool call lists
 */
export function DiffBadge({ 
  added, 
  removed 
}: { 
  added: number; 
  removed: number 
}) {
  if (added === 0 && removed === 0) return null;
  
  return (
    <span className="flex items-center gap-1 text-xs">
      {added > 0 && <span className="text-green-400">+{added}</span>}
      {removed > 0 && <span className="text-red-400">-{removed}</span>}
    </span>
  );
}
