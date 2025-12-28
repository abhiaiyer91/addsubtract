import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  AppWindow,
  Shield,
  Check,
  X,
  Loader2,
  BadgeCheck,
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loading } from '@/components/ui/loading';
import { useSession } from '@/lib/auth-client';

// Scope descriptions for display
const SCOPE_DESCRIPTIONS: Record<string, { title: string; description: string; icon: string }> = {
  'user:read': {
    title: 'Read your profile',
    description: 'Access your username, bio, and public information',
    icon: '👤',
  },
  'user:email': {
    title: 'Read your email',
    description: 'Access your email address',
    icon: '📧',
  },
  'repo:read': {
    title: 'Read repositories',
    description: 'Access code, commits, and repository information',
    icon: '📖',
  },
  'repo:write': {
    title: 'Write to repositories',
    description: 'Push code, create branches, and edit files',
    icon: '✏️',
  },
  'repo:admin': {
    title: 'Administer repositories',
    description: 'Manage settings, collaborators, and delete repositories',
    icon: '⚙️',
  },
  'org:read': {
    title: 'Read organizations',
    description: 'Access organization membership and teams',
    icon: '🏢',
  },
  'org:write': {
    title: 'Manage organizations',
    description: 'Invite members and manage teams',
    icon: '👥',
  },
  'workflow:read': {
    title: 'Read workflows',
    description: 'View workflow runs and logs',
    icon: '🔄',
  },
  'workflow:write': {
    title: 'Manage workflows',
    description: 'Trigger and cancel workflow runs',
    icon: '▶️',
  },
  'issue:read': {
    title: 'Read issues',
    description: 'View issues and comments',
    icon: '📋',
  },
  'issue:write': {
    title: 'Manage issues',
    description: 'Create, edit, and close issues',
    icon: '✅',
  },
  'pull:read': {
    title: 'Read pull requests',
    description: 'View pull requests, reviews, and comments',
    icon: '🔀',
  },
  'pull:write': {
    title: 'Manage pull requests',
    description: 'Create, edit, and merge pull requests',
    icon: '🚀',
  },
  'webhook:read': {
    title: 'Read webhooks',
    description: 'View webhook configurations',
    icon: '🔗',
  },
  'webhook:write': {
    title: 'Manage webhooks',
    description: 'Create, edit, and delete webhooks',
    icon: '⚡',
  },
};

export function OAuthAuthorizePage() {
  const [searchParams] = useSearchParams();
  const { data: session, isPending: sessionPending } = useSession();
  const user = session?.user;

  const [appData, setAppData] = useState<{
    app: {
      id: string;
      name: string;
      description: string | null;
      logoUrl: string | null;
      websiteUrl: string | null;
      isVerified: boolean;
    };
    scopes: Array<{ name: string; description: string }>;
    existingAuthorization: {
      scopes: string[];
      createdAt: string;
    } | null;
    approveUrl: string;
    denyUrl: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorizing, setIsAuthorizing] = useState(false);

  // Get query parameters
  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const responseType = searchParams.get('response_type');
  const scope = searchParams.get('scope');
  const state = searchParams.get('state');

  useEffect(() => {
    async function fetchAppData() {
      if (!clientId || !redirectUri || !scope) {
        setError('Missing required parameters');
        setIsLoading(false);
        return;
      }

      if (responseType !== 'code') {
        setError('Only response_type=code is supported');
        setIsLoading(false);
        return;
      }

      try {
        // Fetch app data from the OAuth authorize endpoint
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: responseType,
          scope: scope,
          ...(state && { state }),
        });

        const response = await fetch(`/oauth/authorize?${params}`, {
          headers: {
            Accept: 'application/json',
          },
          credentials: 'include',
        });

        if (!response.ok) {
          const data = await response.json();
          setError(data.error_description || data.error || 'Failed to load app data');
          setIsLoading(false);
          return;
        }

        const data = await response.json();
        setAppData(data);
      } catch (err) {
        setError('Failed to load authorization request');
      } finally {
        setIsLoading(false);
      }
    }

    if (user) {
      fetchAppData();
    } else if (!sessionPending) {
      setIsLoading(false);
    }
  }, [clientId, redirectUri, responseType, scope, state, user, sessionPending]);

  const handleAuthorize = async () => {
    if (!appData) return;

    setIsAuthorizing(true);
    
    // Redirect to the approve URL (the server handles the rest)
    window.location.href = appData.approveUrl;
  };

  const handleDeny = () => {
    if (!appData) return;
    window.location.href = appData.denyUrl;
  };

  if (sessionPending || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loading text="Loading..." />
      </div>
    );
  }

  if (!user) {
    // Redirect to login with return URL
    const returnUrl = encodeURIComponent(window.location.href);
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <CardTitle>Sign in Required</CardTitle>
            <CardDescription>
              You need to sign in to authorize this application.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild className="w-full">
              <Link to={`/login?returnTo=${returnUrl}`}>Sign In</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <CardTitle>Authorization Error</CardTitle>
            <CardDescription className="text-destructive">{error}</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button variant="outline" onClick={() => window.history.back()}>
              Go Back
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (!appData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loading text="Loading authorization request..." />
      </div>
    );
  }

  const { app, scopes, existingAuthorization } = appData;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            {app.logoUrl ? (
              <img src={app.logoUrl} alt={app.name} className="h-16 w-16 rounded-xl" />
            ) : (
              <div className="p-4 bg-muted rounded-xl">
                <AppWindow className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-center gap-2">
              <CardTitle className="text-xl">{app.name}</CardTitle>
              {app.isVerified && (
                <Badge variant="success" className="gap-1">
                  <BadgeCheck className="h-3 w-3" />
                  Verified
                </Badge>
              )}
            </div>
            {app.description && (
              <CardDescription className="mt-2">{app.description}</CardDescription>
            )}
            {app.websiteUrl && (
              <a
                href={app.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 mt-2"
              >
                {app.websiteUrl}
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">{app.name}</strong> wants to access your Wit account
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Signed in as <strong>{user.email}</strong>
            </p>
          </div>

          <Separator />

          {/* Permissions */}
          <div>
            <h3 className="text-sm font-medium mb-3">This will allow {app.name} to:</h3>
            <div className="space-y-2">
              {scopes.map((scope) => {
                const scopeInfo = SCOPE_DESCRIPTIONS[scope.name] || {
                  title: scope.name,
                  description: scope.description,
                  icon: '🔑',
                };
                return (
                  <div
                    key={scope.name}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                  >
                    <span className="text-lg">{scopeInfo.icon}</span>
                    <div>
                      <div className="text-sm font-medium">{scopeInfo.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {scopeInfo.description}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {existingAuthorization && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm">
              <p className="text-blue-500">
                You've previously authorized this app. This will update your permissions.
              </p>
            </div>
          )}

          {!app.isVerified && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-sm">
              <div className="flex gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-500">Unverified Application</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    This app hasn't been verified by Wit. Make sure you trust the developer before authorizing.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleDeny}
          >
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={handleAuthorize}
            disabled={isAuthorizing}
          >
            {isAuthorizing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Authorize
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
