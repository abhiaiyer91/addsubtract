import { useState } from 'react';
import {
  Sparkles,
  Key,
  Trash2,
  Loader2,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  ExternalLink,
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
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

const AI_PROVIDERS = [
  { 
    value: 'anthropic', 
    label: 'Anthropic', 
    description: 'Claude models for code generation',
    placeholder: 'sk-ant-...',
    prefix: 'sk-ant-',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  { 
    value: 'openrouter', 
    label: 'OpenRouter', 
    description: 'Access any model (Claude, GPT, Llama, etc.)',
    placeholder: 'sk-or-...',
    prefix: 'sk-or-',
    docsUrl: 'https://openrouter.ai/keys',
  },
  { 
    value: 'openai', 
    label: 'OpenAI', 
    description: 'GPT-4, embeddings for semantic search',
    placeholder: 'sk-...',
    prefix: 'sk-',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
] as const;

type Provider = typeof AI_PROVIDERS[number]['value'];

export function UserAIKeysPage() {
  const { data: session, isPending: sessionPending } = useSession();
  const authenticated = !!session?.user;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  // Get user AI settings
  const { data: settings, isLoading } = trpc.userAiKeys.getSettings.useQuery(
    undefined,
    { enabled: authenticated }
  );

  const setKeyMutation = trpc.userAiKeys.set.useMutation({
    onSuccess: () => {
      closeDialog();
      utils.userAiKeys.getSettings.invalidate();
    },
    onError: (err: { message: string }) => {
      setError(err.message);
    },
  });

  const deleteKeyMutation = trpc.userAiKeys.delete.useMutation({
    onSuccess: () => {
      utils.userAiKeys.getSettings.invalidate();
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

    setKeyMutation.mutate({
      provider: selectedProvider,
      apiKey: apiKey.trim(),
    });
  };

  const handleDelete = (provider: Provider) => {
    const providerLabel = AI_PROVIDERS.find(p => p.value === provider)?.label || provider;
    if (confirm(`Remove ${providerLabel} API key? AI features using this key will stop working.`)) {
      deleteKeyMutation.mutate({ provider });
    }
  };

  if (sessionPending) {
    return <Loading text="Loading..." />;
  }

  if (!authenticated) {
    return (
      <div className="container max-w-[800px] mx-auto py-8">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Please sign in to access settings.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="container max-w-[800px] mx-auto py-8">
        <Loading text="Loading AI settings..." />
      </div>
    );
  }

  const isMutating = setKeyMutation.isPending;
  const { keys, availability } = settings || { keys: [], availability: null };

  return (
    <div className="container max-w-[800px] mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">AI Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure AI API keys to enable AI-powered features like semantic code search, 
          code generation, and intelligent suggestions.
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
                {availability.source === 'user' 
                  ? ' using your personal API key.' 
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
              Your API keys are encrypted and stored securely. They will be used for AI features across all repositories.
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
                    Add an AI provider API key to enable AI features.
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
                      <a 
                        href={AI_PROVIDERS.find(p => p.value === selectedProvider)?.docsUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {AI_PROVIDERS.find(p => p.value === selectedProvider)?.label} dashboard
                        <ExternalLink className="h-3 w-3" />
                      </a>
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
              description="Add an API key to enable AI-powered features like semantic code search, code review, and more."
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

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Semantic Code Search</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              Requires an <strong>OpenAI API key</strong> for generating embeddings. 
              Search code by meaning, not just keywords.
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Code Features</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              PR descriptions, code review, and the Agent assistant work with 
              Anthropic, OpenRouter, or OpenAI keys.
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-base">OpenRouter</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p>
              <strong>OpenRouter</strong> gives you access to any AI model (Claude, GPT, Llama, Mistral, and more) 
              through a single API key. Perfect for trying different models.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">About AI API Keys</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Your keys are encrypted at rest and are only used for AI requests you initiate.
            Keys are never shared or exposed to other users.
          </p>
          <p>
            You are responsible for any API usage charges from your AI provider.
            If the server has global keys configured, those will be used as a fallback.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
