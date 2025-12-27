import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CircleDot,
  CheckCircle2,
  Circle,
  PlayCircle,
  Eye,
  XCircle,
  GripVertical,
  User,
  AlertCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { useSession } from '@/lib/auth-client';

// Issue status type
type IssueStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled';

// Status configuration
const STATUS_CONFIG: Record<IssueStatus, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
}> = {
  backlog: {
    label: 'Backlog',
    icon: Circle,
    color: 'text-slate-500',
    bgColor: 'bg-slate-500/10',
  },
  todo: {
    label: 'Todo',
    icon: CircleDot,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  in_progress: {
    label: 'In Progress',
    icon: PlayCircle,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  in_review: {
    label: 'In Review',
    icon: Eye,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  done: {
    label: 'Done',
    icon: CheckCircle2,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  canceled: {
    label: 'Canceled',
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
};

const STATUSES: IssueStatus[] = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'];

interface KanbanIssue {
  id: string;
  number: number;
  title: string;
  state: string;
  status: string;
  createdAt: Date | string;
  author: { username?: string | null; avatarUrl?: string | null } | null;
  labels: Array<{ id: string; name: string; color: string }>;
  assignee?: { username?: string | null; avatarUrl?: string | null } | null;
}

interface KanbanBoardProps {
  repoId: string;
  owner: string;
  repo: string;
  groupedIssues: Record<string, KanbanIssue[]>;
  onStatusChange?: (issueId: string, newStatus: IssueStatus) => void;
}

export function KanbanBoard({
  repoId,
  owner,
  repo,
  groupedIssues,
  onStatusChange,
}: KanbanBoardProps) {
  const [draggedIssue, setDraggedIssue] = useState<KanbanIssue | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<IssueStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const { data: session } = useSession();
  const isAuthenticated = !!session?.user;

  const utils = trpc.useUtils();
  const updateStatus = trpc.issues.updateStatus.useMutation({
    onSuccess: () => {
      utils.issues.listGroupedByStatus.invalidate({ repoId });
      setError(null);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleDragStart = (e: React.DragEvent, issue: KanbanIssue) => {
    if (!isAuthenticated) {
      setError('You must be logged in to move issues');
      return;
    }
    setDraggedIssue(issue);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', issue.id);
  };

  const handleDragOver = (e: React.DragEvent, status: IssueStatus) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, newStatus: IssueStatus) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (!isAuthenticated) {
      setError('You must be logged in to move issues');
      setDraggedIssue(null);
      return;
    }

    if (draggedIssue && draggedIssue.status !== newStatus) {
      try {
        await updateStatus.mutateAsync({
          issueId: draggedIssue.id,
          status: newStatus,
        });
        onStatusChange?.(draggedIssue.id, newStatus);
      } catch (error) {
        console.error('Failed to update issue status:', error);
      }
    }

    setDraggedIssue(null);
  };

  const handleDragEnd = () => {
    setDraggedIssue(null);
    setDragOverColumn(null);
  };

  return (
    <div className="space-y-4">
      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
          <button 
            onClick={() => setError(null)} 
            className="ml-auto text-red-500 hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}
      
      {/* Auth warning */}
      {!isAuthenticated && (
        <div className="flex items-center gap-2 p-3 text-sm text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400 rounded-lg">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>Log in to drag and drop issues between columns</span>
        </div>
      )}
      
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUSES.map((status) => {
          const config = STATUS_CONFIG[status];
          const issues = groupedIssues[status] || [];
          const Icon = config.icon;
          const isDropTarget = dragOverColumn === status;

          return (
            <div
              key={status}
              className={cn(
                'flex-shrink-0 w-72 flex flex-col rounded-lg border bg-card',
                isDropTarget && 'ring-2 ring-primary ring-offset-2'
              )}
              onDragOver={(e) => handleDragOver(e, status)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, status)}
            >
              {/* Column header */}
              <div className={cn('px-3 py-2 border-b rounded-t-lg', config.bgColor)}>
                <div className="flex items-center gap-2">
                  <Icon className={cn('h-4 w-4', config.color)} />
                  <span className="font-medium text-sm">{config.label}</span>
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {issues.length}
                  </Badge>
                </div>
              </div>

              {/* Column content */}
              <div className="flex-1 p-2 space-y-2 min-h-[200px] overflow-y-auto max-h-[calc(100vh-300px)]">
                {issues.length === 0 ? (
                  <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">
                    No issues
                  </div>
                ) : (
                  issues.map((issue) => (
                    <KanbanCard
                      key={issue.id}
                      issue={issue}
                      owner={owner}
                      repo={repo}
                      onDragStart={(e) => handleDragStart(e, issue)}
                      onDragEnd={handleDragEnd}
                      isDragging={draggedIssue?.id === issue.id}
                      isAuthenticated={isAuthenticated}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface KanbanCardProps {
  issue: KanbanIssue;
  owner: string;
  repo: string;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  isAuthenticated: boolean;
}

function KanbanCard({
  issue,
  owner,
  repo,
  onDragStart,
  onDragEnd,
  isDragging,
  isAuthenticated,
}: KanbanCardProps) {
  return (
    <div
      draggable={isAuthenticated}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        'group bg-background border rounded-lg p-3 transition-all',
        isAuthenticated && 'cursor-grab active:cursor-grabbing',
        !isAuthenticated && 'cursor-default',
        'hover:border-primary/50 hover:shadow-sm',
        isDragging && 'opacity-50 ring-2 ring-primary'
      )}
    >
      {/* Drag handle and issue number */}
      <div className="flex items-center gap-2 mb-2">
        <GripVertical className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        <span className="text-xs font-mono text-muted-foreground">#{issue.number}</span>
      </div>

      {/* Title */}
      <Link
        to={`/${owner}/${repo}/issues/${issue.number}`}
        className="block font-medium text-sm hover:text-primary transition-colors line-clamp-2"
        onClick={(e) => e.stopPropagation()}
      >
        {issue.title}
      </Link>

      {/* Labels */}
      {issue.labels && issue.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {issue.labels.slice(0, 3).map((label) => (
            <Badge
              key={label.id}
              variant="secondary"
              className="text-xs font-normal px-1.5 py-0"
              style={{
                backgroundColor: `#${label.color}20`,
                color: `#${label.color}`,
                borderColor: `#${label.color}40`,
              }}
            >
              {label.name}
            </Badge>
          ))}
          {issue.labels.length > 3 && (
            <Badge variant="secondary" className="text-xs font-normal px-1.5 py-0">
              +{issue.labels.length - 3}
            </Badge>
          )}
        </div>
      )}

      {/* Footer: Author and Assignee */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t">
        {/* Author */}
        {issue.author?.username && (
          <Link
            to={`/${issue.author.username}`}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            {issue.author.avatarUrl ? (
              <img
                src={issue.author.avatarUrl}
                alt={issue.author.username}
                className="h-4 w-4 rounded-full"
              />
            ) : (
              <User className="h-3 w-3" />
            )}
            <span>{issue.author.username}</span>
          </Link>
        )}

        {/* Assignee */}
        {issue.assignee?.avatarUrl && (
          <img
            src={issue.assignee.avatarUrl}
            alt={issue.assignee.username || 'Assignee'}
            className="h-5 w-5 rounded-full ring-2 ring-background"
            title={`Assigned to ${issue.assignee.username}`}
          />
        )}
      </div>
    </div>
  );
}
