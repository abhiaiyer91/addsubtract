import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Sparkles,
  Key,
  Trash2,
  Loader2,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { RepoLayout } from '../components/repo-layout';
import { SettingsLayout } from './layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

const AI_PROVIDERS = [
  { 
    value: 'anthropic', 
    label: 'Anthropic', 
    description: 'Claude Opus 4.5 (Recommended)',
    placeholder: 'sk-ant-...',
    prefix: 'sk-ant-',
  },
  { 
    value: 'openai', 
    label: 'OpenAI', 
    description: 'GPT 5.2',
    placeholder: 'sk-...',
    prefix: 'sk-',
  },
] as const;

type Provider = typeof AI_PROVIDERS[number]['value'];

export function RepoAISettingsPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  // Single query to get all AI settings at once - no cascading queries
  const { data: settings, isLoading } = trpc.repoAiKeys.getSettings.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo && authenticated }
  );

  const setKeyMutation = trpc.repoAiKeys.set.useMutation({
    onSuccess: () => {
      closeDialog();
      utils.repoAiKeys.getSettings.invalidate({ owner: owner!, repo: repo! });
    },
    onError: (err: { message: string }) => {
      setError(err.message);
    },
  });

  const deleteKeyMutation = trpc.repoAiKeys.delete.useMutation({
    onSuccess: () => {
      utils.repoAiKeys.getSettings.invalidate({ owner: owner!, repo: repo! });
    },
  });

  const closeDialog = () => {
    setIsDialogOpen(false);
    setApiKey('');
    setShowKey(false);
    setError(null);
  };

  const openDialog = (provider?: Provider) => {
    if (provider) {
      setSelectedProvider(provider);
    }
    setApiKey('');
    setError(null);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!apiKey.trim()) {
      setError('API key is required');
      return;
    }

    const providerConfig = AI_PROVIDERS.find(p => p.value === selectedProvider);
    if (providerConfig && !apiKey.startsWith(providerConfig.prefix)) {
      setError(`${providerConfig.label} API keys should start with "${providerConfig.prefix}"`);
      return;
    }

    if (!settings?.repoId) return;

    setKeyMutation.mutate({
      repoId: settings.repoId,
      provider: selectedProvider,
      apiKey: apiKey.trim(),
    });
  };

  const handleDelete = (provider: Provider) => {
    if (!settings?.repoId) return;

    const providerLabel = AI_PROVIDERS.find(p => p.value === provider)?.label || provider;
    if (confirm(`Remove ${providerLabel} API key? AI features using this key will stop working.`)) {
      deleteKeyMutation.mutate({ repoId: settings.repoId, provider });
    }
  };

  if (!authenticated) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Please sign in to access settings.</p>
        </div>
      </RepoLayout>
    );
  }

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading AI settings..." />
      </RepoLayout>
    );
  }

  if (!settings) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Repository not found.</p>
        </div>
      </RepoLayout>
    );
  }

  // Only owners can view/manage AI keys
  if (!settings.isOwner) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <SettingsLayout>
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">AI Settings</h2>
              <p className="text-muted-foreground mt-1">
                Configure AI API keys for this repository.
              </p>
            </div>

            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                Only the repository owner can view and manage AI API keys.
              </AlertDescription>
            </Alert>
          </div>
        </SettingsLayout>
      </RepoLayout>
    );
  }

  const isMutating = setKeyMutation.isPending;
  const { keys, availability } = settings;

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <SettingsLayout>
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">AI Settings</h2>
            <p className="text-muted-foreground mt-1">
              Configure AI API keys to enable AI-powered features for this repository.
            </p>
          </div>

          {/* Status Alert */}
          {availability && (
            <Alert variant={availability.available ? 'default' : 'destructive'}>
              {availability.available ? (
                <>
                  <Check className="h-4 w-4" />
                  <AlertDescription>
                    AI features are enabled
                    {availability.source === 'repository' 
                      ? ' using your repository API key.' 
                      : ' using server-provided keys.'}
                  </AlertDescription>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    AI features are not available. Add an API key below to enable them.
                  </AlertDescription>
                </>
              )}
            </Alert>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>API Keys</CardTitle>
                <CardDescription>
                  Your API keys are encrypted and stored securely. Only repository owners can view this page.
                </CardDescription>
              </div>
              <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2" onClick={() => openDialog()}>
                    <Key className="h-4 w-4" />
                    Add API Key
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <form onSubmit={handleSubmit}>
                    <DialogHeader>
                      <DialogTitle>Add API Key</DialogTitle>
                      <DialogDescription>
                        Add an AI provider API key to enable AI features for this repository.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      {/* Provider Selection */}
                      <div className="space-y-2">
                        <Label htmlFor="provider">Provider</Label>
                        <Select 
                          value={selectedProvider} 
                          onValueChange={(v) => setSelectedProvider(v as Provider)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a provider" />
                          </SelectTrigger>
                          <SelectContent>
                            {AI_PROVIDERS.map((provider) => (
                              <SelectItem key={provider.value} value={provider.value}>
                                <div className="flex items-center gap-2">
                                  <span>{provider.label}</span>
                                  <span className="text-muted-foreground text-xs">
                                    ({provider.description})
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* API Key Input */}
                      <div className="space-y-2">
                        <Label htmlFor="apiKey">API Key</Label>
                        <div className="relative">
                          <Input
                            id="apiKey"
                            type={showKey ? 'text' : 'password'}
                            placeholder={AI_PROVIDERS.find(p => p.value === selectedProvider)?.placeholder}
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="pr-10"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                            onClick={() => setShowKey(!showKey)}
                          >
                            {showKey ? (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <Eye className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Get your API key from the{' '}
                          {selectedProvider === 'openai' ? (
                            <a 
                              href="https://platform.openai.com/api-keys" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              OpenAI dashboard
                            </a>
                          ) : (
                            <a 
                              href="https://console.anthropic.com/settings/keys" 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              Anthropic console
                            </a>
                          )}
                        </p>
                      </div>

                      {error && (
                        <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                          {error}
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={closeDialog}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isMutating}>
                        {isMutating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Save Key
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {!keys || keys.length === 0 ? (
                <EmptyState
                  icon={Sparkles}
                  title="No API keys configured"
                  description="Add an API key to enable AI-powered features like code review, chat, and more."
                />
              ) : (
                <div className="divide-y">
                  {keys.map((key: { id: string; provider: string; keyHint: string }) => {
                    const provider = AI_PROVIDERS.find(p => p.value === key.provider);
                    return (
                      <div key={key.id} className="py-4 first:pt-0 last:pb-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-muted rounded-md">
                              <Key className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{provider?.label || key.provider}</span>
                                <Badge variant="secondary">{key.keyHint}</Badge>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {provider?.description}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openDialog(key.provider as Provider)}
                            >
                              Update
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(key.provider as Provider)}
                              disabled={deleteKeyMutation.isPending}
                            >
                              {deleteKeyMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">About AI API Keys</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                AI API keys enable features like intelligent code review, the Ask AI assistant, 
                and automated suggestions throughout your repository.
              </p>
              <p>
                Your keys are encrypted at rest and are only used for AI requests made within 
                this repository. Keys are never shared or exposed to other users.
              </p>
              <p>
                You are responsible for any API usage charges from your AI provider.
              </p>
            </CardContent>
          </Card>
        </div>
      </SettingsLayout>
    </RepoLayout>
  );
}
