import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AppWindow,
  ChevronLeft,
  Shield,
  ExternalLink,
  Loader2,
  BadgeCheck,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime } from '@/lib/utils';

// Scope descriptions for display
const SCOPE_DESCRIPTIONS: Record<string, string> = {
  'user:read': 'Read your user profile',
  'user:email': 'Read your email address',
  'repo:read': 'Read repositories',
  'repo:write': 'Write to repositories',
  'repo:admin': 'Administer repositories',
  'org:read': 'Read organization membership',
  'org:write': 'Manage organization membership',
  'workflow:read': 'Read workflow runs',
  'workflow:write': 'Trigger workflows',
  'issue:read': 'Read issues',
  'issue:write': 'Create/edit issues',
  'pull:read': 'Read pull requests',
  'pull:write': 'Create/edit pull requests',
  'webhook:read': 'Read webhooks',
  'webhook:write': 'Manage webhooks',
};

export function AuthorizedAppsPage() {
  const { data: session, isPending: sessionPending } = useSession();
  const user = session?.user;

  const utils = trpc.useUtils();

  const { data: authorizations, isLoading: authsLoading } = trpc.oauthApps.authorizations.useQuery(
    undefined,
    { enabled: !!user }
  );

  const revokeAuth = trpc.oauthApps.revokeAuthorization.useMutation({
    onSuccess: () => {
      utils.oauthApps.authorizations.invalidate();
    },
  });

  if (sessionPending) {
    return <Loading text="Loading..." />;
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Please sign in to access settings.</p>
      </div>
    );
  }

  return (
    <div className="container max-w-[1200px] mx-auto py-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link to="/settings" className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" />
          Settings
        </Link>
        <span className="text-muted-foreground">/</span>
        <span>Authorized Apps</span>
      </div>

      <div>
        <h1 className="text-3xl font-bold">Authorized Applications</h1>
        <p className="text-muted-foreground mt-1">
          Applications you've granted access to your wit account.
        </p>
      </div>

      <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex gap-3">
        <Shield className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-blue-500">Manage your connected apps</p>
          <p className="text-muted-foreground mt-1">
            These applications have access to your wit account based on the permissions you granted.
            You can revoke access at any time.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connected Applications</CardTitle>
          <CardDescription>
            Applications that can access your account data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {authsLoading ? (
            <div className="py-8">
              <Loading text="Loading authorized apps..." />
            </div>
          ) : !authorizations || authorizations.length === 0 ? (
            <EmptyState
              icon={AppWindow}
              title="No authorized apps"
              description="You haven't authorized any third-party applications yet."
            />
          ) : (
            <div className="divide-y">
              {authorizations.map((auth) => (
                <AuthorizedAppRow
                  key={auth.id}
                  authorization={auth}
                  onRevoke={() => revokeAuth.mutate({ authorizationId: auth.id })}
                  isRevoking={revokeAuth.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface AuthorizedAppRowProps {
  authorization: {
    id: string;
    app: {
      id: string;
      name: string;
      description: string | null;
      logoUrl: string | null;
      websiteUrl: string | null;
      isVerified: boolean;
    } | null;
    scopes: string[];
    createdAt: Date | string;
    updatedAt: Date | string;
  };
  onRevoke: () => void;
  isRevoking: boolean;
}

function AuthorizedAppRow({ authorization, onRevoke, isRevoking }: AuthorizedAppRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!authorization.app) return null;

  const app = authorization.app;

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-1 p-2 bg-muted rounded-md">
            {app.logoUrl ? (
              <img src={app.logoUrl} alt={app.name} className="h-8 w-8 rounded" />
            ) : (
              <AppWindow className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{app.name}</span>
              {app.isVerified && (
                <Badge variant="success" className="text-xs gap-1">
                  <BadgeCheck className="h-3 w-3" />
                  Verified
                </Badge>
              )}
            </div>
            {app.description && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {app.description}
              </p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span>Authorized {formatRelativeTime(authorization.createdAt)}</span>
              {app.websiteUrl && (
                <a
                  href={app.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  Visit website
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {/* Scopes */}
            <div className="mt-3">
              <button
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? 'Hide' : 'View'} permissions ({authorization.scopes.length})
              </button>
              {isExpanded && (
                <div className="mt-2 space-y-1">
                  {authorization.scopes.map((scope) => (
                    <div key={scope} className="flex items-center gap-2 text-sm">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {scope}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        {SCOPE_DESCRIPTIONS[scope] || scope}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <X className="mr-1 h-4 w-4" />
              Revoke
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke Access?</AlertDialogTitle>
              <AlertDialogDescription>
                This will revoke "{app.name}"'s access to your account. The app will no
                longer be able to access your data. You can re-authorize the app later if needed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onRevoke}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isRevoking}
              >
                {isRevoking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Revoke Access
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
