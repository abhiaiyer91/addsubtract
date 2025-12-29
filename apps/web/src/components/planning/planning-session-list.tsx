/**
 * Planning Session List Component
 * 
 * Displays a list of planning sessions for a repository.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Loader2,
  Target,
  Clock,
  CheckCircle2,
  XCircle,
  Pencil,
  Play,
  MoreHorizontal,
  Trash2,
  RefreshCw,
  Layers,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

type SessionStatus = 'planning' | 'ready' | 'executing' | 'completed' | 'failed' | 'cancelled';

const STATUS_CONFIG: Record<SessionStatus, { icon: React.ElementType; label: string; color: string; bgColor: string }> = {
  planning: { icon: Pencil, label: 'Planning', color: 'text-blue-400', bgColor: 'bg-blue-500/10' },
  ready: { icon: Target, label: 'Ready', color: 'text-green-400', bgColor: 'bg-green-500/10' },
  executing: { icon: Loader2, label: 'Executing', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10' },
  completed: { icon: CheckCircle2, label: 'Completed', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' },
  failed: { icon: XCircle, label: 'Failed', color: 'text-red-400', bgColor: 'bg-red-500/10' },
  cancelled: { icon: XCircle, label: 'Cancelled', color: 'text-zinc-400', bgColor: 'bg-zinc-500/10' },
};

interface PlanningSessionListProps {
  repoId: string;
  owner: string;
  repoName: string;
}

export function PlanningSessionList({ repoId, owner, repoName }: PlanningSessionListProps) {
  const navigate = useNavigate();
  const [showNewSession, setShowNewSession] = useState(false);
  const [newPrompt, setNewPrompt] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const utils = trpc.useUtils();

  // Queries
  const { data: sessions, isLoading } = trpc.planningWorkflow.listSessionsByRepo.useQuery({
    repoId,
    limit: 50,
  });

  // Mutations
  const createSession = trpc.planningWorkflow.createSession.useMutation({
    onSuccess: (session) => {
      utils.planningWorkflow.listSessionsByRepo.invalidate({ repoId });
      setShowNewSession(false);
      setNewPrompt('');
      setNewTitle('');
      navigate(`/${owner}/${repoName}/planning/${session.id}`);
    },
  });

  const deleteSession = trpc.planningWorkflow.deleteSession.useMutation({
    onSuccess: () => {
      utils.planningWorkflow.listSessionsByRepo.invalidate({ repoId });
    },
  });

  const handleCreate = () => {
    if (!newPrompt.trim()) return;
    createSession.mutate({
      repoId,
      planningPrompt: newPrompt.trim(),
      title: newTitle.trim() || newPrompt.trim().slice(0, 50),
    });
  };

  const handleDelete = (sessionId: string) => {
    if (confirm('Are you sure you want to delete this planning session?')) {
      deleteSession.mutate({ sessionId });
    }
  };

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Planning Sessions</h2>
          <p className="text-sm text-zinc-500">
            Plan complex tasks and execute them with parallel coding agents.
          </p>
        </div>
        <Button onClick={() => setShowNewSession(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Session
        </Button>
      </div>

      {/* Session list */}
      {sessions && sessions.length > 0 ? (
        <div className="grid gap-3">
          {sessions.map((session) => {
            const statusConfig = STATUS_CONFIG[session.status as SessionStatus];
            const StatusIcon = statusConfig.icon;

            return (
              <Card
                key={session.id}
                className="bg-zinc-900/50 border-zinc-800 hover:bg-zinc-900/80 transition-colors cursor-pointer"
                onClick={() => navigate(`/${owner}/${repoName}/planning/${session.id}`)}
              >
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={cn(
                          'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                          statusConfig.bgColor
                        )}
                      >
                        <StatusIcon
                          className={cn(
                            'h-5 w-5',
                            statusConfig.color,
                            session.status === 'executing' && 'animate-spin'
                          )}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-medium text-zinc-200 truncate">
                            {session.title || 'Untitled Session'}
                          </h3>
                          <Badge
                            variant="secondary"
                            className={cn('text-xs', statusConfig.bgColor, statusConfig.color)}
                          >
                            {statusConfig.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-zinc-500 line-clamp-2">
                          {session.planningPrompt}
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-zinc-600">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDate(session.createdAt)}
                          </span>
                          <span>Iteration {session.iterationCount + 1}</span>
                        </div>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/${owner}/${repoName}/planning/${session.id}`);
                          }}
                        >
                          <Layers className="h-4 w-4 mr-2" />
                          Open
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-400"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(session.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="py-12">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/20">
                <Target className="h-8 w-8 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-100 mb-2">No Planning Sessions</h3>
              <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">
                Create a planning session to break down complex tasks and execute them with parallel
                coding agents.
              </p>
              <Button onClick={() => setShowNewSession(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Your First Session
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* New session dialog */}
      <Dialog open={showNewSession} onOpenChange={setShowNewSession}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Planning Session</DialogTitle>
            <DialogDescription>
              Describe what you want to build. The planning agent will help you break it down into
              parallelizable tasks.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-zinc-400">Title (optional)</label>
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g., Add user authentication"
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-400">What do you want to build?</label>
              <Textarea
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                placeholder="Describe your task in detail. Include requirements, constraints, and any specific implementation details..."
                className="mt-1 min-h-[150px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSession(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newPrompt.trim() || createSession.isPending}
              className="gap-2"
            >
              {createSession.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Start Planning
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
