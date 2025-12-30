import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Bot,
  Key,
  Trash2,
  Loader2,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldAlert,
  Tags,
  UserCheck,
  AlertTriangle,
  MessageSquare,
  History,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Megaphone,
  Twitter,
  GitMerge,
  Tag,
  Copy,
  X,
  ExternalLink,
  Rabbit,
  FileSearch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { formatDistanceToNow } from 'date-fns';
import { formatRelativeTime } from '@/lib/utils';

const AI_PROVIDERS = [
  { 
    value: 'anthropic', 
    label: 'Anthropic', 
    description: 'Claude (Recommended)',
    placeholder: 'sk-ant-...',
    prefix: 'sk-ant-',
  },
  { 
    value: 'openai', 
    label: 'OpenAI', 
    description: 'GPT-4',
    placeholder: 'sk-...',
    prefix: 'sk-',
  },
  { 
    value: 'coderabbit', 
    label: 'CodeRabbit', 
    description: 'AI Code Review',
    placeholder: 'cr-...',
    prefix: '',
  },
] as const;

type Provider = typeof AI_PROVIDERS[number]['value'];

const DEFAULT_PROMPT = `Analyze incoming issues and:
- Apply appropriate labels based on the issue type (bug, feature, documentation, etc.)
- Set priority based on urgency and impact described
- For bugs, look for severity indicators
- For features, consider if it's a small enhancement or major request`;

type ContentStatus = 'pending' | 'approved' | 'posted' | 'rejected';

interface MarketingContent {
  id: string;
  repoId: string;
  sourceType: 'pr_merged' | 'release_published';
  sourceId: string;
  sourceRef: string;
  tweet: string;
  thread: string[] | null;
  status: ContentStatus;
  postedAt: Date | null;
  postedUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function AgentsSettingsPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  // AI Keys state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<Provider>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);

  // Triage state
  const [showHistory, setShowHistory] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Marketing state
  const [marketingTab, setMarketingTab] = useState<ContentStatus | 'all'>('pending');
  const [editingContent, setEditingContent] = useState<MarketingContent | null>(null);
  const [editedTweet, setEditedTweet] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const utils = trpc.useUtils();

  // Repository query
  const { data: repoData } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // AI Settings query
  const { data: aiSettings, isLoading: aiLoading } = trpc.repoAiKeys.getSettings.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo && authenticated }
  );

  // Triage Settings query
  const { data: triageSettings, isLoading: triageLoading } = trpc.triageAgent.getConfig.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo && authenticated }
  );

  // Triage runs query
  const { data: runs, isLoading: runsLoading } = trpc.triageAgent.getRuns.useQuery(
    { repoId: triageSettings?.repoId || '', limit: 10 },
    { enabled: !!triageSettings?.repoId && showHistory }
  );

  // Marketing content query
  const { data: marketingContent, isLoading: marketingLoading } = trpc.marketing.list.useQuery(
    {
      repoId: repoData?.repo.id!,
      status: marketingTab === 'all' ? undefined : marketingTab,
    },
    { enabled: !!repoData?.repo.id }
  );

  const { data: pendingCount } = trpc.marketing.pendingCount.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  );

  // Marketing agent config
  const { data: marketingConfig } = trpc.marketing.getConfig.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  );

  const isMarketingEnabled = marketingConfig?.config?.enabled ?? false;

  // AI Mutations
  const setKeyMutation = trpc.repoAiKeys.set.useMutation({
    onSuccess: () => {
      closeDialog();
      utils.repoAiKeys.getSettings.invalidate({ owner: owner!, repo: repo! });
      utils.triageAgent.getConfig.invalidate({ owner: owner!, repo: repo! });
    },
    onError: (err: { message: string }) => {
      setKeyError(err.message);
    },
  });

  const deleteKeyMutation = trpc.repoAiKeys.delete.useMutation({
    onSuccess: () => {
      utils.repoAiKeys.getSettings.invalidate({ owner: owner!, repo: repo! });
      utils.triageAgent.getConfig.invalidate({ owner: owner!, repo: repo! });
    },
  });

  // Triage Mutations
  const updateConfigMutation = trpc.triageAgent.updateConfig.useMutation({
    onSuccess: () => {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      utils.triageAgent.getConfig.invalidate({ owner: owner!, repo: repo! });
    },
  });

  const setEnabledMutation = trpc.triageAgent.setEnabled.useMutation({
    onSuccess: () => {
      utils.triageAgent.getConfig.invalidate({ owner: owner!, repo: repo! });
    },
  });

  const setMarketingEnabledMutation = trpc.marketing.setEnabled.useMutation({
    onSuccess: () => {
      utils.marketing.getConfig.invalidate({ repoId: repoData?.repo.id! });
    },
  });

  // Marketing Mutations
  const updateStatusMutation = trpc.marketing.updateStatus.useMutation({
    onSuccess: () => {
      utils.marketing.list.invalidate({ repoId: repoData?.repo.id! });
      utils.marketing.pendingCount.invalidate({ repoId: repoData?.repo.id! });
    },
  });

  const updateContentMutation = trpc.marketing.updateContent.useMutation({
    onSuccess: () => {
      setEditingContent(null);
      utils.marketing.list.invalidate({ repoId: repoData?.repo.id! });
    },
  });

  const deleteContentMutation = trpc.marketing.delete.useMutation({
    onSuccess: () => {
      utils.marketing.list.invalidate({ repoId: repoData?.repo.id! });
      utils.marketing.pendingCount.invalidate({ repoId: repoData?.repo.id! });
    },
  });

  // Initialize prompt from settings
  useEffect(() => {
    if (triageSettings?.config?.prompt !== undefined) {
      setPrompt(triageSettings.config.prompt || '');
    }
  }, [triageSettings?.config?.prompt]);

  // Dialog handlers
  const closeDialog = () => {
    setIsDialogOpen(false);
    setApiKey('');
    setShowKey(false);
    setKeyError(null);
  };

  const openDialog = (provider?: Provider) => {
    if (provider) {
      setSelectedProvider(provider);
    }
    setApiKey('');
    setKeyError(null);
    setIsDialogOpen(true);
  };

  const handleSubmitKey = (e: React.FormEvent) => {
    e.preventDefault();
    setKeyError(null);

    if (!apiKey.trim()) {
      setKeyError('API key is required');
      return;
    }

    const providerConfig = AI_PROVIDERS.find(p => p.value === selectedProvider);
    if (providerConfig && !apiKey.startsWith(providerConfig.prefix)) {
      setKeyError(`${providerConfig.label} API keys should start with "${providerConfig.prefix}"`);
      return;
    }

    if (!aiSettings?.repoId) return;

    setKeyMutation.mutate({
      repoId: aiSettings.repoId,
      provider: selectedProvider,
      apiKey: apiKey.trim(),
    });
  };

  const handleDeleteKey = (provider: Provider) => {
    if (!aiSettings?.repoId) return;

    const providerLabel = AI_PROVIDERS.find(p => p.value === provider)?.label || provider;
    if (confirm(`Remove ${providerLabel} API key? AI features using this key will stop working.`)) {
      deleteKeyMutation.mutate({ repoId: aiSettings.repoId, provider });
    }
  };

  // Triage handlers
  const handleToggleEnabled = async (enabled: boolean) => {
    if (!triageSettings?.repoId) return;
    setEnabledMutation.mutate({ repoId: triageSettings.repoId, enabled });
  };

  const handleToggleOption = async (option: string, value: boolean) => {
    if (!triageSettings?.repoId) return;
    updateConfigMutation.mutate({
      repoId: triageSettings.repoId,
      [option]: value,
    });
  };

  const handleSavePrompt = async () => {
    if (!triageSettings?.repoId) return;
    updateConfigMutation.mutate({
      repoId: triageSettings.repoId,
      prompt: prompt || null,
    });
  };

  // Marketing handlers
  const handleApprove = (id: string) => {
    updateStatusMutation.mutate({ id, status: 'approved' });
  };

  const handleReject = (id: string) => {
    updateStatusMutation.mutate({ id, status: 'rejected' });
  };

  const handleMarkPosted = (id: string, url?: string) => {
    updateStatusMutation.mutate({ id, status: 'posted', postedUrl: url });
  };

  const handleDeleteContent = (id: string) => {
    if (confirm('Delete this content?')) {
      deleteContentMutation.mutate({ id });
    }
  };

  const handleEditContent = (item: MarketingContent) => {
    setEditingContent(item);
    setEditedTweet(item.tweet);
  };

  const handleSaveEdit = () => {
    if (!editingContent) return;
    updateContentMutation.mutate({
      id: editingContent.id,
      tweet: editedTweet,
    });
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const isLoading = aiLoading || triageLoading;

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
        <Loading text="Loading agent settings..." />
      </RepoLayout>
    );
  }

  if (!aiSettings || !triageSettings) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Repository not found.</p>
        </div>
      </RepoLayout>
    );
  }

  // Only owners can manage agent settings
  if (!aiSettings.isOwner) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <SettingsLayout>
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Agents</h2>
              <p className="text-muted-foreground mt-1">
                Configure AI agents and API keys for this repository.
              </p>
            </div>

            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                Only the repository owner can view and manage agent settings.
              </AlertDescription>
            </Alert>
          </div>
        </SettingsLayout>
      </RepoLayout>
    );
  }

  const { keys, availability } = aiSettings;
  const config = triageSettings.config;
  const isTriageEnabled = config?.enabled ?? false;
  const isMutating = setKeyMutation.isPending || updateConfigMutation.isPending || setEnabledMutation.isPending;

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <SettingsLayout>
        <div className="space-y-8">
          <div>
            <h2 className="text-2xl font-bold">Agents</h2>
            <p className="text-muted-foreground mt-1">
              Configure AI-powered automation for your repository.
            </p>
          </div>

          {/* ==================== API KEYS SECTION ==================== */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Key className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle>API Keys</CardTitle>
                  <CardDescription>
                    Configure AI provider keys to enable agents
                  </CardDescription>
                </div>
                {availability?.available && (
                  <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <Check className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!availability?.available && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Add an API key to enable AI agents.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  {keys && keys.length > 0 ? (
                    <div className="flex items-center gap-2">
                      {keys.map((key: { id: string; provider: string; keyHint: string }) => {
                        const provider = AI_PROVIDERS.find(p => p.value === key.provider);
                        return (
                          <Badge key={key.id} variant="outline" className="gap-1">
                            {provider?.label} <span className="text-muted-foreground">{key.keyHint}</span>
                          </Badge>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No API keys configured</p>
                  )}
                </div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" onClick={() => openDialog()}>
                      <Key className="h-4 w-4 mr-2" />
                      {keys && keys.length > 0 ? 'Manage Keys' : 'Add Key'}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <form onSubmit={handleSubmitKey}>
                      <DialogHeader>
                        <DialogTitle>Add API Key</DialogTitle>
                        <DialogDescription>
                          Add an AI provider API key to enable agents.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
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
                                  {provider.label} ({provider.description})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

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
                              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>

                        {keys && keys.length > 0 && (
                          <div className="space-y-2">
                            <Label>Existing Keys</Label>
                            <div className="space-y-2">
                              {keys.map((key: { id: string; provider: string; keyHint: string }) => (
                                <div key={key.id} className="flex items-center justify-between p-2 rounded-md bg-muted">
                                  <span className="text-sm">
                                    {AI_PROVIDERS.find(p => p.value === key.provider)?.label} ({key.keyHint})
                                  </span>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteKey(key.provider as Provider)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {keyError && (
                          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                            {keyError}
                          </div>
                        )}
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={closeDialog}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={setKeyMutation.isPending}>
                          {setKeyMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Save Key
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>

          {/* ==================== AGENTS GRID ==================== */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* TRIAGE AGENT CARD */}
            <Card className="flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                      <Bot className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Triage Agent</CardTitle>
                      <CardDescription>Auto-categorize new issues</CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={isTriageEnabled}
                    onCheckedChange={handleToggleEnabled}
                    disabled={!triageSettings.aiAvailable || setEnabledMutation.isPending}
                  />
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Automatically labels, prioritizes, and assigns issues when they're created.
                </p>

                {isTriageEnabled && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Tags className="h-4 w-4 text-muted-foreground" />
                        Auto-assign labels
                      </span>
                      <Switch
                        checked={config?.autoAssignLabels ?? true}
                        onCheckedChange={(checked) => handleToggleOption('autoAssignLabels', checked)}
                        disabled={isMutating}
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                        Auto-set priority
                      </span>
                      <Switch
                        checked={config?.autoSetPriority ?? true}
                        onCheckedChange={(checked) => handleToggleOption('autoSetPriority', checked)}
                        disabled={isMutating}
                      />
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        Add explanation comment
                      </span>
                      <Switch
                        checked={config?.addTriageComment ?? true}
                        onCheckedChange={(checked) => handleToggleOption('addTriageComment', checked)}
                        disabled={isMutating}
                      />
                    </div>

                    <Separator />

                    <div className="space-y-2">
                      <Label className="text-xs">Custom Instructions</Label>
                      <Textarea
                        placeholder={DEFAULT_PROMPT}
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        rows={3}
                        className="text-xs"
                      />
                      <Button
                        onClick={handleSavePrompt}
                        disabled={updateConfigMutation.isPending}
                        size="sm"
                        variant="outline"
                        className="w-full"
                      >
                        {updateConfigMutation.isPending ? (
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        ) : saveSuccess ? (
                          <Check className="mr-2 h-3 w-3" />
                        ) : null}
                        {saveSuccess ? 'Saved' : 'Save Instructions'}
                      </Button>
                    </div>
                  </div>
                )}

                {!triageSettings.aiAvailable && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Add an API key above to enable this agent.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* MARKETING AGENT CARD */}
            <Card className="flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-pink-100 dark:bg-pink-900/30 rounded-lg">
                      <Megaphone className="h-5 w-5 text-pink-600 dark:text-pink-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Marketing Agent</CardTitle>
                      <CardDescription>Generate social content</CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={isMarketingEnabled}
                    onCheckedChange={(checked) => {
                      setMarketingEnabledMutation.mutate({
                        repoId: repoData?.repo.id!,
                        enabled: checked,
                      });
                    }}
                    disabled={!availability?.available || setMarketingEnabledMutation.isPending}
                  />
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Auto-generates tweets when PRs are merged or releases are published.
                </p>

                {isMarketingEnabled && availability?.available ? (
                  <div className="space-y-3">
                    {pendingCount && pendingCount.count > 0 && (
                      <Badge variant="secondary" className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                        {pendingCount.count} pending review
                      </Badge>
                    )}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-green-600" />
                      <span>Runs automatically on PR merge & release</span>
                    </div>

                    <Tabs value={marketingTab} onValueChange={(v) => setMarketingTab(v as typeof marketingTab)}>
                      <TabsList className="w-full grid grid-cols-3">
                        <TabsTrigger value="pending" className="text-xs">
                          Pending
                          {pendingCount && pendingCount.count > 0 && (
                            <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                              {pendingCount.count}
                            </Badge>
                          )}
                        </TabsTrigger>
                        <TabsTrigger value="approved" className="text-xs">Approved</TabsTrigger>
                        <TabsTrigger value="posted" className="text-xs">Posted</TabsTrigger>
                      </TabsList>
                    </Tabs>

                    <div className="mt-3">
                      {marketingLoading ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                      ) : !marketingContent || marketingContent.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          {marketingTab === 'pending' 
                            ? 'No pending content. Merge a PR or publish a release!' 
                            : `No ${marketingTab} content.`}
                        </p>
                      ) : (
                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                          {marketingContent.slice(0, 5).map((item: MarketingContent) => (
                            <MarketingContentRow
                              key={item.id}
                              item={item}
                              onApprove={() => handleApprove(item.id)}
                              onReject={() => handleReject(item.id)}
                              onMarkPosted={(url) => handleMarkPosted(item.id, url)}
                              onDelete={() => handleDeleteContent(item.id)}
                              onEdit={() => handleEditContent(item)}
                              onCopy={(text) => handleCopy(text, item.id)}
                              isCopied={copiedId === item.id}
                              isUpdating={updateStatusMutation.isPending}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Add an API key above to enable this agent.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </div>

          {/* CodeRabbit AI Review Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                    <Rabbit className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">CodeRabbit</CardTitle>
                    <CardDescription>AI-powered code review</CardDescription>
                  </div>
                </div>
                {keys?.some((k: { provider: string }) => k.provider === 'coderabbit') && (
                  <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <Check className="h-3 w-3 mr-1" />
                    Configured
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                CodeRabbit provides AI-powered code reviews for pull requests, detecting bugs, security issues, and suggesting improvements.
              </p>

              {keys?.some((k: { provider: string }) => k.provider === 'coderabbit') ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-green-600" />
                    <span>Runs automatically on PR creation and updates</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileSearch className="h-4 w-4 text-muted-foreground" />
                    <span>Reviews code for bugs, security, and best practices</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDialog('coderabbit')}
                    >
                      <Key className="h-4 w-4 mr-2" />
                      Update Key
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteKey('coderabbit')}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Add a CodeRabbit API key to enable AI code reviews.
                    </AlertDescription>
                  </Alert>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDialog('coderabbit')}
                    >
                      <Key className="h-4 w-4 mr-2" />
                      Add API Key
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                    >
                      <a href="https://coderabbit.ai" target="_blank" rel="noopener noreferrer">
                        Get API Key
                        <ExternalLink className="h-4 w-4 ml-2" />
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Triage History (collapsible) */}
          {isTriageEnabled && (
            <Card>
              <CardHeader className="cursor-pointer" onClick={() => setShowHistory(!showHistory)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <CardTitle className="text-base">Triage History</CardTitle>
                      <CardDescription>Recent agent activity</CardDescription>
                    </div>
                  </div>
                  {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </CardHeader>
              {showHistory && (
                <CardContent>
                  {runsLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : !runs || runs.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No triage runs yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {runs.map((run) => (
                        <div key={run.id} className="flex items-start justify-between p-3 rounded-md bg-muted/50">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {run.success ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-destructive" />
                              )}
                              <span className="text-sm font-medium">Issue triaged</span>
                            </div>
                            {run.assignedLabels && run.assignedLabels.length > 0 && (
                              <div className="flex items-center gap-1 flex-wrap">
                                {run.assignedLabels.map((label: string) => (
                                  <Badge key={label} variant="secondary" className="text-xs">{label}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          )}
        </div>

        {/* Edit Tweet Dialog */}
        <Dialog open={!!editingContent} onOpenChange={() => setEditingContent(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Tweet</DialogTitle>
              <DialogDescription>
                Modify the generated content before posting.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Textarea
                value={editedTweet}
                onChange={(e) => setEditedTweet(e.target.value)}
                rows={4}
                maxLength={280}
                className="resize-none"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{editedTweet.length}/280</span>
                {editedTweet.length > 280 && <span className="text-destructive">Too long!</span>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingContent(null)}>Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={updateContentMutation.isPending || editedTweet.length > 280}>
                {updateContentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SettingsLayout>
    </RepoLayout>
  );
}

interface MarketingContentRowProps {
  item: MarketingContent;
  onApprove: () => void;
  onReject: () => void;
  onMarkPosted: (url?: string) => void;
  onDelete: () => void;
  onEdit: () => void;
  onCopy: (text: string) => void;
  isCopied: boolean;
  isUpdating: boolean;
}

function MarketingContentRow({
  item,
  onApprove,
  onReject,
  onMarkPosted,
  onDelete,
  onEdit,
  onCopy,
  isCopied,
  isUpdating,
}: MarketingContentRowProps) {
  const isPR = item.sourceType === 'pr_merged';

  return (
    <div className="p-3 rounded-lg border bg-card text-card-foreground">
      <div className="flex items-start gap-2 mb-2">
        {isPR ? (
          <GitMerge className="h-4 w-4 text-purple-500 mt-0.5 flex-shrink-0" />
        ) : (
          <Tag className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium">
              {isPR ? `PR #${item.sourceRef}` : item.sourceRef}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(item.createdAt)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">{item.tweet}</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onCopy(item.tweet)}
          >
            {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onEdit}>
            Edit
          </Button>
        </div>

        <div className="flex items-center gap-1">
          {item.status === 'pending' && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                onClick={onReject}
                disabled={isUpdating}
              >
                <X className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
                onClick={onApprove}
                disabled={isUpdating}
              >
                <Check className="h-3 w-3 mr-1" />
                Approve
              </Button>
            </>
          )}

          {item.status === 'approved' && (
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => {
                const url = prompt('Posted URL (optional):');
                onMarkPosted(url || undefined);
              }}
              disabled={isUpdating}
            >
              <Twitter className="h-3 w-3 mr-1" />
              Posted
            </Button>
          )}

          {(item.status === 'rejected' || item.status === 'posted') && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
