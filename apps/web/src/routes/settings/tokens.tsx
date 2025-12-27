import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Ticket, Plus, Trash2, Loader2, ChevronLeft, Copy, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatDate, formatRelativeTime } from '@/lib/utils';

const SCOPES = [
  { name: 'repo:read', description: 'Clone and pull repositories' },
  { name: 'repo:write', description: 'Push to repositories' },
  { name: 'repo:admin', description: 'Manage repository settings, collaborators, and deletion' },
  { name: 'user:read', description: 'Read your profile information' },
  { name: 'user:write', description: 'Update your profile' },
];

const EXPIRY_OPTIONS = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
  { value: 'never', label: 'No expiration' },
];

export function TokensPage() {
  const { data: session, isPending: sessionPending } = useSession();
  const user = session?.user;

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [expiresIn, setExpiresIn] = useState('30');
  const [error, setError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const utils = trpc.useUtils();

  const { data: tokens, isLoading: tokensLoading } = trpc.tokens.list.useQuery(
    undefined,
    { enabled: !!user }
  );

  const createToken = trpc.tokens.create.useMutation({
    onSuccess: (data) => {
      setNewToken(data.token);
      setName('');
      setSelectedScopes([]);
      setExpiresIn('30');
      setError(null);
      utils.tokens.list.invalidate();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const deleteToken = trpc.tokens.delete.useMutation({
    onSuccess: () => {
      utils.tokens.list.invalidate();
    },
  });

  const handleCreateToken = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (selectedScopes.length === 0) {
      setError('Select at least one scope');
      return;
    }

    createToken.mutate({
      name: name.trim(),
      scopes: selectedScopes as any,
      expiresInDays: expiresIn === 'never' ? undefined : parseInt(expiresIn),
    });
  };

  const handleDeleteToken = (id: string) => {
    if (confirm('Are you sure you want to revoke this token? This action cannot be undone.')) {
      deleteToken.mutate({ id });
    }
  };

  const handleScopeToggle = (scope: string) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleCopyToken = async () => {
    if (newToken) {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCloseNewTokenDialog = () => {
    setNewToken(null);
    setIsCreateDialogOpen(false);
  };

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

  const isLoading = tokensLoading;

  return (
    <div className="container max-w-6xl mx-auto py-8 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link to="/settings" className="text-muted-foreground hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="h-4 w-4" />
          Settings
        </Link>
        <span className="text-muted-foreground">/</span>
        <span>Personal Access Tokens</span>
      </div>

      <div>
        <h1 className="text-3xl font-bold">Personal Access Tokens</h1>
        <p className="text-muted-foreground mt-1">
          Generate tokens to authenticate with the API or Git over HTTPS.
        </p>
      </div>

      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-amber-500">Treat tokens like passwords</p>
          <p className="text-muted-foreground mt-1">
            Tokens provide access to your account. Never share them or commit them to repositories.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Your Tokens</CardTitle>
            <CardDescription>
              Tokens you've created to access the API.
            </CardDescription>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
            if (!open) {
              handleCloseNewTokenDialog();
            } else {
              setIsCreateDialogOpen(true);
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Generate Token
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              {newToken ? (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-green-500">
                      <Check className="h-5 w-5" />
                      Token Created
                    </DialogTitle>
                    <DialogDescription>
                      Make sure to copy your personal access token now. You won't be able to see it again!
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={newToken}
                        className="font-mono text-sm"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopyToken}
                      >
                        {copied ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Store this token securely. It won't be shown again.
                    </p>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCloseNewTokenDialog}>Done</Button>
                  </DialogFooter>
                </>
              ) : (
                <form onSubmit={handleCreateToken}>
                  <DialogHeader>
                    <DialogTitle>Generate New Token</DialogTitle>
                    <DialogDescription>
                      Create a new personal access token with specific permissions.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Token Name</Label>
                      <Input
                        id="name"
                        placeholder="CI Pipeline"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        A descriptive name for this token.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Expiration</Label>
                      <Select value={expiresIn} onValueChange={setExpiresIn}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EXPIRY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3">
                      <Label>Scopes</Label>
                      <div className="space-y-2">
                        {SCOPES.map((scope) => (
                          <label
                            key={scope.name}
                            className="flex items-start gap-3 p-3 rounded-md border hover:bg-muted/50 cursor-pointer"
                          >
                            <Checkbox
                              checked={selectedScopes.includes(scope.name)}
                              onCheckedChange={() => handleScopeToggle(scope.name)}
                            />
                            <div>
                              <div className="font-medium text-sm">{scope.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {scope.description}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {error && (
                      <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                        {error}
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createToken.isPending}>
                      {createToken.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Generate Token
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8">
              <Loading text="Loading tokens..." />
            </div>
          ) : !tokens || tokens.length === 0 ? (
            <EmptyState
              icon={Ticket}
              title="No tokens"
              description="Generate a personal access token to authenticate with the API."
            />
          ) : (
            <div className="divide-y">
              {tokens.map((token) => (
                <TokenRow
                  key={token.id}
                  token={token}
                  onDelete={() => handleDeleteToken(token.id)}
                  isDeleting={deleteToken.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface TokenRowProps {
  token: {
    id: string;
    name: string;
    tokenPrefix: string;
    scopes: string[];
    createdAt: Date | string;
    expiresAt: Date | string | null;
    lastUsedAt: Date | string | null;
  };
  onDelete: () => void;
  isDeleting: boolean;
}

function TokenRow({ token, onDelete, isDeleting }: TokenRowProps) {
  const isExpired = token.expiresAt && new Date(token.expiresAt) < new Date();

  return (
    <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <div className="mt-1 p-2 bg-muted rounded-md">
          <Ticket className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-medium">{token.name}</span>
            {isExpired && (
              <Badge variant="destructive" className="text-xs">
                Expired
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {token.scopes.map((scope) => (
              <Badge key={scope} variant="secondary" className="text-xs font-normal">
                {scope}
              </Badge>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            <code className="font-mono">{token.tokenPrefix}...</code>
            <span>·</span>
            <span>Created {formatDate(token.createdAt)}</span>
            {token.expiresAt && (
              <>
                <span>·</span>
                <span className={isExpired ? 'text-destructive' : ''}>
                  {isExpired ? 'Expired' : 'Expires'} {formatDate(token.expiresAt)}
                </span>
              </>
            )}
            {token.lastUsedAt && (
              <>
                <span>·</span>
                <span>Last used {formatRelativeTime(token.lastUsedAt)}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={onDelete}
        disabled={isDeleting}
      >
        {isDeleting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
