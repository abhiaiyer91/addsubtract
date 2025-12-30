import { useState } from 'react';
import {
  History,
  Undo2,
  Redo2,
  FileCode,
  FilePlus,
  FileX,
  FileEdit,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface AgentChange {
  id: string;
  type: 'create' | 'edit' | 'delete';
  filePath: string;
  timestamp: Date;
  description?: string;
  beforeContent?: string;
  afterContent?: string;
  commitHash?: string;
  isUndone?: boolean;
}

interface AgentChangesHistoryProps {
  changes: AgentChange[];
  onUndo: (changeId: string) => Promise<void>;
  onRedo: (changeId: string) => Promise<void>;
  onPreview: (change: AgentChange) => void;
}

const TYPE_ICONS: Record<AgentChange['type'], React.ElementType> = {
  create: FilePlus,
  edit: FileEdit,
  delete: FileX,
};

const TYPE_LABELS: Record<AgentChange['type'], string> = {
  create: 'Created',
  edit: 'Edited',
  delete: 'Deleted',
};

const TYPE_COLORS: Record<AgentChange['type'], string> = {
  create: 'text-green-400',
  edit: 'text-amber-400',
  delete: 'text-red-400',
};

function ChangeItem({
  change,
  onUndo,
  onRedo,
  onPreview,
  isLoading,
}: {
  change: AgentChange;
  onUndo: () => void;
  onRedo: () => void;
  onPreview: () => void;
  isLoading: boolean;
}) {
  const Icon = TYPE_ICONS[change.type];
  const label = TYPE_LABELS[change.type];
  const color = TYPE_COLORS[change.type];
  
  const timeAgo = getTimeAgo(change.timestamp);
  
  return (
    <div className={cn(
      "flex items-start gap-3 p-3 rounded-lg border transition-colors",
      change.isUndone 
        ? "bg-zinc-900/30 border-zinc-800/50 opacity-60" 
        : "bg-zinc-900/50 border-zinc-800 hover:bg-zinc-800/50"
    )}>
      {/* Icon */}
      <div className={cn(
        "w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0",
        change.isUndone ? "bg-zinc-800/50" : "bg-zinc-800"
      )}>
        <Icon className={cn("h-4 w-4", change.isUndone ? "text-zinc-600" : color)} />
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-medium", change.isUndone && "line-through text-zinc-500")}>
            {label}
          </span>
          <code className="text-xs text-zinc-400 font-mono truncate max-w-[200px]">
            {change.filePath}
          </code>
        </div>
        {change.description && (
          <p className="text-xs text-zinc-500 mt-0.5">{change.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-zinc-600 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {timeAgo}
          </span>
          {change.commitHash && (
            <span className="text-xs text-zinc-600 font-mono">
              {change.commitHash.slice(0, 7)}
            </span>
          )}
          {change.isUndone && (
            <span className="text-xs text-amber-500 flex items-center gap-1">
              <Undo2 className="h-3 w-3" />
              Undone
            </span>
          )}
        </div>
      </div>
      
      {/* Actions */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-zinc-500 hover:text-zinc-300"
          onClick={onPreview}
          title="Preview changes"
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
        
        {change.isUndone ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-zinc-500 hover:text-emerald-400"
            onClick={onRedo}
            disabled={isLoading}
            title="Redo this change"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-zinc-500 hover:text-amber-400"
            onClick={onUndo}
            disabled={isLoading}
            title="Undo this change"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function DiffPreview({ change, onClose }: { change: AgentChange | null; onClose: () => void }) {
  if (!change) return null;
  
  return (
    <Dialog open={!!change} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCode className="h-5 w-5" />
            {change.filePath}
          </DialogTitle>
          <DialogDescription>
            {TYPE_LABELS[change.type]} by AI agent
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden rounded-lg border border-zinc-800">
          <div className="grid grid-cols-2 divide-x divide-zinc-800 h-full max-h-[50vh]">
            {/* Before */}
            <div className="flex flex-col">
              <div className="px-3 py-1.5 bg-red-500/10 border-b border-zinc-800 text-xs font-medium text-red-400">
                Before
              </div>
              <ScrollArea className="flex-1">
                <pre className="p-3 text-xs font-mono text-zinc-400">
                  {change.beforeContent || '(empty)'}
                </pre>
              </ScrollArea>
            </div>
            
            {/* After */}
            <div className="flex flex-col">
              <div className="px-3 py-1.5 bg-green-500/10 border-b border-zinc-800 text-xs font-medium text-green-400">
                After
              </div>
              <ScrollArea className="flex-1">
                <pre className="p-3 text-xs font-mono text-zinc-400">
                  {change.afterContent || '(empty)'}
                </pre>
              </ScrollArea>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AgentChangesHistory({
  changes,
  onUndo,
  onRedo,
}: AgentChangesHistoryProps) {
  const [expanded, setExpanded] = useState(true);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [previewChange, setPreviewChange] = useState<AgentChange | null>(null);
  
  const activeChanges = changes.filter(c => !c.isUndone);
  const undoneChanges = changes.filter(c => c.isUndone);
  
  const handleUndo = async (changeId: string) => {
    setLoadingId(changeId);
    try {
      await onUndo(changeId);
    } finally {
      setLoadingId(null);
    }
  };
  
  const handleRedo = async (changeId: string) => {
    setLoadingId(changeId);
    try {
      await onRedo(changeId);
    } finally {
      setLoadingId(null);
    }
  };
  
  if (changes.length === 0) {
    return null;
  }
  
  return (
    <>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 overflow-hidden">
        {/* Header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full px-4 py-2 hover:bg-zinc-800/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-zinc-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-zinc-500" />
            )}
            <History className="h-4 w-4 text-zinc-400" />
            <span className="text-sm font-medium text-zinc-300">Agent Changes</span>
            <span className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">
              {activeChanges.length}
            </span>
          </div>
          
          {activeChanges.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-amber-400 hover:text-amber-300"
              onClick={(e) => {
                e.stopPropagation();
                // Undo all changes
              }}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Undo All
            </Button>
          )}
        </button>
        
        {/* Changes list */}
        {expanded && (
          <div className="p-2 space-y-2 max-h-64 overflow-y-auto">
            {/* Active changes */}
            {activeChanges.map((change) => (
              <ChangeItem
                key={change.id}
                change={change}
                onUndo={() => handleUndo(change.id)}
                onRedo={() => handleRedo(change.id)}
                onPreview={() => setPreviewChange(change)}
                isLoading={loadingId === change.id}
              />
            ))}
            
            {/* Undone changes */}
            {undoneChanges.length > 0 && (
              <>
                <div className="flex items-center gap-2 pt-2">
                  <div className="h-px flex-1 bg-zinc-800" />
                  <span className="text-xs text-zinc-600">Undone</span>
                  <div className="h-px flex-1 bg-zinc-800" />
                </div>
                {undoneChanges.map((change) => (
                  <ChangeItem
                    key={change.id}
                    change={change}
                    onUndo={() => handleUndo(change.id)}
                    onRedo={() => handleRedo(change.id)}
                    onPreview={() => setPreviewChange(change)}
                    isLoading={loadingId === change.id}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>
      
      {/* Diff preview modal */}
      <DiffPreview 
        change={previewChange} 
        onClose={() => setPreviewChange(null)} 
      />
    </>
  );
}

// Helper function
function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Hook to manage agent changes with undo/redo capability
 */
export function useAgentChangesHistory() {
  const [changes, setChanges] = useState<AgentChange[]>([]);
  
  const addChange = (change: Omit<AgentChange, 'id' | 'timestamp' | 'isUndone'>) => {
    setChanges(prev => [
      {
        ...change,
        id: `change-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date(),
        isUndone: false,
      },
      ...prev,
    ]);
  };
  
  const undoChange = (changeId: string) => {
    setChanges(prev => prev.map(c => 
      c.id === changeId ? { ...c, isUndone: true } : c
    ));
  };
  
  const redoChange = (changeId: string) => {
    setChanges(prev => prev.map(c => 
      c.id === changeId ? { ...c, isUndone: false } : c
    ));
  };
  
  const clearHistory = () => {
    setChanges([]);
  };
  
  return {
    changes,
    addChange,
    undoChange,
    redoChange,
    clearHistory,
  };
}
