import { Navigate } from 'react-router-dom';
import { useSession } from '../lib/auth-client';
import { trpc } from '../lib/trpc';
import { Loader2, ShieldAlert } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { data: session, isPending: sessionLoading } = useSession();
  const { data: access, isLoading: accessLoading } = trpc.admin.checkAccess.useQuery(
    undefined,
    { enabled: !!session?.user }
  );

  const isLoading = sessionLoading || (!!session?.user && accessLoading);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!session?.user) {
    return <Navigate to="/login" replace />;
  }

  // Logged in but not an admin
  if (!access?.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 text-center max-w-md p-8">
          <ShieldAlert className="h-16 w-16 text-destructive" />
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="text-muted-foreground">
            You don't have permission to access the admin portal.
            Please contact a system administrator if you believe this is an error.
          </p>
          <a
            href={import.meta.env.VITE_WEB_URL || 'http://localhost:5173'}
            className="text-primary hover:underline"
          >
            Return to main site
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
