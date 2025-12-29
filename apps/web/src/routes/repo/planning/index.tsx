/**
 * Planning Sessions List Page
 * 
 * Displays all planning sessions for a repository.
 */

import { useParams } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import { PlanningSessionList } from '@/components/planning';
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
    <div className="container max-w-4xl py-6">
      <PlanningSessionList
        repoId={repoData.id}
        owner={owner!}
        repoName={repo!}
      />
    </div>
  );
}
