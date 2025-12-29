/**
 * Planning Session Detail Page
 * 
 * Shows a single planning session with chat, tasks, and execution.
 */

import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PlanningSession } from '@/components/planning';
import { trpc } from '@/lib/trpc';
import { Loader2 } from 'lucide-react';

export default function PlanningSessionPage() {
  const { owner, repo, sessionId } = useParams<{ owner: string; repo: string; sessionId: string }>();
  const navigate = useNavigate();

  // Get repository ID
  const { data: repoData, isLoading } = trpc.repos.getByOwnerAndName.useQuery(
    { owner: owner!, name: repo! },
    { enabled: !!owner && !!repo }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!repoData) {
    return (
      <div className="text-center py-12 text-zinc-500">
        Repository not found
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      {/* Back button */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800 bg-zinc-900/30">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => navigate(`/${owner}/${repo}/planning`)}
        >
          <ArrowLeft className="h-4 w-4" />
          All Sessions
        </Button>
      </div>

      {/* Planning session */}
      <div className="flex-1 min-h-0">
        <PlanningSession
          sessionId={sessionId}
          repoId={repoData.id}
          onClose={() => navigate(`/${owner}/${repo}/planning`)}
        />
      </div>
    </div>
  );
}
