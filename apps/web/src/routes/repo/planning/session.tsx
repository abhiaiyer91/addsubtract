/**
 * Planning Session Detail Page
 * 
 * Shows a single planning session with chat, tasks, and execution.
 * Features enhanced navigation, breadcrumbs, and session info.
 */

import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Target, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlanningSession } from '@/components/planning';
import { trpc } from '@/lib/trpc';
import { Loader2 } from 'lucide-react';

export default function PlanningSessionPage() {
  const { owner, repo, sessionId } = useParams<{ owner: string; repo: string; sessionId: string }>();
  const navigate = useNavigate();

  // Get repository ID
  const { data: repoData, isLoading: repoLoading } = trpc.repos.getByOwnerAndName.useQuery(
    { owner: owner!, name: repo! },
    { enabled: !!owner && !!repo }
  );

  // Get session info for breadcrumb
  const { data: session, isLoading: sessionLoading } = trpc.planningWorkflow.getSession.useQuery(
    { sessionId: sessionId! },
    { enabled: !!sessionId }
  );

  const isLoading = repoLoading || sessionLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 bg-zinc-950 min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!repoData) {
    return (
      <div className="text-center py-20 text-zinc-500 bg-zinc-950 min-h-screen">
        Repository not found
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-950">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-2 text-sm">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate(`/${owner}/${repo}`)}
            className="text-zinc-500 hover:text-zinc-300"
          >
            <Home className="h-4 w-4" />
          </Button>
          <ChevronRight className="h-4 w-4 text-zinc-700" />
          <Link 
            to={`/${owner}/${repo}/planning`}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Planning
          </Link>
          <ChevronRight className="h-4 w-4 text-zinc-700" />
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Target className="h-3 w-3 text-white" />
            </div>
            <span className="text-zinc-200 font-medium truncate max-w-[200px]">
              {session?.title || 'Session'}
            </span>
          </div>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => navigate(`/${owner}/${repo}/planning`)}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Dashboard
        </Button>
      </div>

      {/* Planning session */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <PlanningSession
          sessionId={sessionId}
          repoId={repoData.id}
          onClose={() => navigate(`/${owner}/${repo}/planning`)}
        />
      </div>
    </div>
  );
}
