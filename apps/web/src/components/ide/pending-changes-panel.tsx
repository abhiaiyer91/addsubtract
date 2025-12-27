import { Check, X, FileEdit, FilePlus, FileX, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { useIDEStore, type PendingChange } from '@/lib/ide-store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface PendingChangesPanelProps {
  repoId: string;
}

function ChangeIcon({ type }: { type: PendingChange['type'] }) {
  switch (type) {
    case 'create':
      return <FilePlus className="h-3.5 w-3.5 text-emerald-500" />;
    case 'edit':
      return <FileEdit className="h-3.5 w-3.5 text-amber-500" />;
    case 'delete':
      return <FileX className="h-3.5 w-3.5 text-red-500" />;
  }
}

function ChangeCard({
  change,
  onApprove,
  onReject,
}: {
  change: PendingChange;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const fileName = change.path.split('/').pop() || change.path;

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        <ChangeIcon type={change.type} />
        <span className="flex-1 text-sm truncate font-medium" title={change.path}>
          {fileName}
        </span>
        {change.status === 'pending' ? (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
              onClick={(e) => {
                e.stopPropagation();
                onApprove();
              }}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-6 w-6 text-red-500 hover:text-red-400 hover:bg-red-500/10"
              onClick={(e) => {
                e.stopPropagation();
                onReject();
              }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <span
            className={cn(
              'text-xs px-1.5 py-0.5 rounded',
              change.status === 'approved'
                ? 'bg-emerald-500/10 text-emerald-500'
                : 'bg-red-500/10 text-red-500'
            )}
          >
            {change.status}
          </span>
        )}
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>

      {/* Details */}
      {expanded && (
        <div className="border-t px-3 py-2 space-y-2">
          <div className="text-xs text-muted-foreground">{change.path}</div>
          {change.description && (
            <p className="text-xs text-muted-foreground">{change.description}</p>
          )}
          {change.diff && (
            <pre className="text-xs bg-muted/50 rounded p-2 overflow-x-auto max-h-48">
              {change.diff}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function PendingChangesPanel({ repoId }: PendingChangesPanelProps) {
  // Silence unused variable warning - repoId will be used for API calls
  void repoId;
  
  const { pendingChanges, approveChange, rejectChange, clearPendingChanges } =
    useIDEStore();

  const pending = pendingChanges.filter((c) => c.status === 'pending');
  const resolved = pendingChanges.filter((c) => c.status !== 'pending');

  const handleApprove = (change: PendingChange) => {
    // TODO: Call API to apply the change to the filesystem
    // For now, just update local state
    approveChange(change.id);
  };

  const handleReject = (change: PendingChange) => {
    // Just update local state
    rejectChange(change.id);
  };

  const handleApproveAll = () => {
    for (const change of pending) {
      handleApprove(change);
    }
  };

  const handleRejectAll = () => {
    for (const change of pending) {
      handleReject(change);
    }
  };

  if (pendingChanges.length === 0) return null;

  return (
    <div className="border-b">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-amber-500/5 border-b">
        <div className="flex items-center gap-2">
          <FileEdit className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-medium">Pending Changes</span>
          <span className="text-xs text-muted-foreground">({pending.length})</span>
        </div>
        {pending.length > 0 && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-emerald-500 hover:text-emerald-400"
              onClick={handleApproveAll}
            >
              Approve all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-red-500 hover:text-red-400"
              onClick={handleRejectAll}
            >
              Reject all
            </Button>
          </div>
        )}
      </div>

      {/* Changes list */}
      <ScrollArea className="max-h-64">
        <div className="p-2 space-y-2">
          {pending.map((change) => (
            <ChangeCard
              key={change.id}
              change={change}
              onApprove={() => handleApprove(change)}
              onReject={() => handleReject(change)}
            />
          ))}
          {resolved.length > 0 && pending.length > 0 && (
            <div className="border-t pt-2 mt-2">
              <div className="text-xs text-muted-foreground mb-2">Resolved</div>
              {resolved.slice(-3).map((change) => (
                <ChangeCard
                  key={change.id}
                  change={change}
                  onApprove={() => {}}
                  onReject={() => {}}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Clear button */}
      {resolved.length > 0 && pending.length === 0 && (
        <div className="px-3 py-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={clearPendingChanges}
          >
            Clear resolved changes
          </Button>
        </div>
      )}
    </div>
  );
}
