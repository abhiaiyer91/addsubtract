/**
 * Planning Dashboard Page
 * 
 * Main planning workflow dashboard for a repository.
 * Features templates, session management, and execution monitoring.
 */

import { useParams } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { PlanningDashboard } from '@/components/planning';
import { Loader2 } from 'lucide-react';

export default function PlanningPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();

  // Get repository ID
  const { data: repoData, isLoading } = trpc.repos.getByOwnerAndName.useQuery(
    { owner: owner!, name: repo! },
    { enabled: !!owner && !!repo }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!repoData) {
    return (
      <div className="text-center py-20 text-zinc-500">
        Repository not found
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <PlanningDashboard
        repoId={repoData.id}
        owner={owner!}
        repoName={repo!}
      />
    </div>
  );
}
