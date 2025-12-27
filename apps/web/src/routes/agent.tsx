import { Navigate } from 'react-router-dom';
import { AgentChat } from '@/components/agent/agent-chat';
import { useSession } from '@/lib/auth-client';
import { Loading } from '@/components/ui/loading';

export function AgentPage() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return (
      <div className="h-[calc(100vh-12rem)] flex items-center justify-center">
        <Loading text="Loading..." />
      </div>
    );
  }

  // Require authentication
  if (!session?.user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="h-[calc(100vh-12rem)] -mx-4 sm:-mx-6 lg:-mx-8">
      <AgentChat />
    </div>
  );
}
