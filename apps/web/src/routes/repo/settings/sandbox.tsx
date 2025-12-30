import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Container,
  Server,
  Cloud,
  Box,
  Key,
  Loader2,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldAlert,
  Cpu,
  HardDrive,
  Clock,
  Network,
  ExternalLink,
  Info,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
import { Slider } from '@/components/ui/slider';
import { RepoLayout } from '../components/repo-layout';
import { SettingsLayout } from './layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

// Sandbox provider types
type SandboxProvider = 'e2b' | 'daytona' | 'docker';

interface ProviderInfo {
  value: SandboxProvider;
  label: string;
  description: string;
  icon: typeof Cloud;
  features: string[];
  docUrl: string;
  apiKeyPlaceholder?: string;
  apiKeyPrefix?: string;
}

const SANDBOX_PROVIDERS: ProviderInfo[] = [
  {
    value: 'e2b',
    label: 'E2B',
    description: 'Firecracker microVM sandboxes with ~150ms startup',
    icon: Zap,
    features: ['Firecracker microVMs', 'Fast startup (~150ms)', 'Code interpreter', 'Persistence'],
    docUrl: 'https://e2b.dev/docs',
    apiKeyPlaceholder: 'e2b_...',
    apiKeyPrefix: 'e2b_',
  },
  {
    value: 'daytona',
    label: 'Daytona',
    description: 'Cloud dev environments with full PTY support',
    icon: Cloud,
    features: ['Full PTY support', 'Git operations', 'LSP support', 'Snapshots'],
    docUrl: 'https://www.daytona.io/docs',
    apiKeyPlaceholder: 'dtn_...',
  },
  {
    value: 'docker',
    label: 'Docker',
    description: 'Self-hosted container isolation',
    icon: Box,
    features: ['Self-hosted', 'Full control', 'No external deps', 'Container isolation'],
    docUrl: 'https://docs.docker.com',
  },
];

const NETWORK_MODES = [
  { value: 'none', label: 'No Network', description: 'Most secure - no internet access' },
  { value: 'restricted', label: 'Restricted', description: 'Only allowed hosts' },
  { value: 'full', label: 'Full Access', description: 'Unrestricted internet access' },
];

const LANGUAGE_OPTIONS = [
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
];

export function SandboxSettingsPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  // State
  const [isEnabled, setIsEnabled] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<SandboxProvider>('e2b');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Resource limits
  const [memoryMB, setMemoryMB] = useState(2048);
  const [cpuCores, setCpuCores] = useState(1);
  const [timeoutMinutes, setTimeoutMinutes] = useState(60);
  const [networkMode, setNetworkMode] = useState<'none' | 'restricted' | 'full'>('none');
  const [defaultLanguage, setDefaultLanguage] = useState('typescript');

  // Provider-specific settings
  const [e2bTemplateId, setE2bTemplateId] = useState('');
  const [daytonaSnapshot, setDaytonaSnapshot] = useState('');
  const [daytonaAutoStop, setDaytonaAutoStop] = useState(15);
  const [dockerImage, setDockerImage] = useState('wit-sandbox:latest');

  const utils = trpc.useUtils();

  // Query sandbox settings
  const { data: sandboxSettings, isLoading } = trpc.sandbox.getSettings.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo && authenticated }
  );

  const settings = sandboxSettings;

  // Initialize state from settings
  useEffect(() => {
    if (settings) {
      setIsEnabled(settings.enabled ?? false);
      setSelectedProvider(settings.provider ?? 'e2b');
      setMemoryMB(settings.memoryMB ?? 2048);
      setCpuCores(settings.cpuCores ?? 1);
      setTimeoutMinutes(settings.timeoutMinutes ?? 60);
      setNetworkMode(settings.networkMode ?? 'none');
      setDefaultLanguage(settings.defaultLanguage ?? 'typescript');
      setE2bTemplateId(settings.e2bTemplateId ?? '');
      setDaytonaSnapshot(settings.daytonaSnapshot ?? '');
      setDaytonaAutoStop(settings.daytonaAutoStop ?? 15);
      setDockerImage(settings.dockerImage ?? 'wit-sandbox:latest');
    }
  }, [settings]);

  // Mutations
  const updateSettingsMutation = trpc.sandbox.updateSettings.useMutation({
    onSuccess: () => {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      utils.sandbox.getSettings.invalidate({ owner: owner!, repo: repo! });
    },
  });

  const setEnabledMutation = trpc.sandbox.setEnabled.useMutation({
    onSuccess: () => {
      utils.sandbox.getSettings.invalidate({ owner: owner!, repo: repo! });
    },
    onError: (err) => {
      setKeyError(err.message);
    },
  });

  const setApiKeyMutation = trpc.sandbox.setApiKey.useMutation({
    onSuccess: () => {
      closeDialog();
      utils.sandbox.getSettings.invalidate({ owner: owner!, repo: repo! });
    },
    onError: (err) => {
      setKeyError(err.message);
    },
  });

  const deleteApiKeyMutation = trpc.sandbox.deleteApiKey.useMutation({
    onSuccess: () => {
      utils.sandbox.getSettings.invalidate({ owner: owner!, repo: repo! });
    },
  });

  const handleSave = async () => {
    if (!settings?.repoId) return;

    updateSettingsMutation.mutate({
      repoId: settings.repoId,
      settings: {
        provider: selectedProvider,
        memoryMB,
        cpuCores,
        timeoutMinutes,
        networkMode,
        defaultLanguage,
        e2bTemplateId: e2bTemplateId || undefined,
        daytonaSnapshot: daytonaSnapshot || undefined,
        daytonaAutoStop,
        dockerImage,
      },
    });
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    if (!settings?.repoId) return;
    setIsEnabled(enabled);
    setEnabledMutation.mutate({ repoId: settings.repoId, enabled });
  };

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setKeyError(null);

    if (!apiKey.trim()) {
      setKeyError('API key is required');
      return;
    }

    const provider = SANDBOX_PROVIDERS.find((p) => p.value === selectedProvider);
    if (provider?.apiKeyPrefix && !apiKey.startsWith(provider.apiKeyPrefix)) {
      setKeyError(`${provider.label} API keys should start with "${provider.apiKeyPrefix}"`);
      return;
    }

    if (!settings?.repoId) return;

    setApiKeyMutation.mutate({
      repoId: settings.repoId,
      provider: selectedProvider as 'e2b' | 'daytona',
      apiKey: apiKey.trim(),
    });
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setApiKey('');
    setShowKey(false);
    setKeyError(null);
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
        <Loading text="Loading sandbox settings..." />
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

  if (!settings.isOwner) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <SettingsLayout>
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Sandbox</h2>
              <p className="text-muted-foreground mt-1">
                Configure code execution sandbox settings.
              </p>
            </div>

            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                Only the repository owner can view and manage sandbox settings.
              </AlertDescription>
            </Alert>
          </div>
        </SettingsLayout>
      </RepoLayout>
    );
  }

  const currentProvider = SANDBOX_PROVIDERS.find((p) => p.value === selectedProvider)!;

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <SettingsLayout>
        <div className="space-y-8">
          <div>
            <h2 className="text-2xl font-bold">Sandbox</h2>
            <p className="text-muted-foreground mt-1">
              Configure code execution sandbox for safe terminal access and AI agent execution.
            </p>
          </div>

          {/* Enable/Disable Toggle */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-md">
                    <Container className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Enable Sandbox</CardTitle>
                    <CardDescription>
                      Allow terminal access and code execution in isolated environments.
                    </CardDescription>
                  </div>
                </div>
                <Switch checked={isEnabled} onCheckedChange={handleToggleEnabled} />
              </div>
            </CardHeader>
          </Card>

          {/* Provider Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Server className="h-4 w-4" />
                Sandbox Provider
              </CardTitle>
              <CardDescription>
                Choose where code execution happens. Each provider offers different tradeoffs.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                {SANDBOX_PROVIDERS.map((provider) => {
                  const Icon = provider.icon;
                  const isSelected = selectedProvider === provider.value;

                  return (
                    <div
                      key={provider.value}
                      className={`relative flex items-start gap-4 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-muted hover:border-muted-foreground/50'
                      }`}
                      onClick={() => setSelectedProvider(provider.value)}
                    >
                      <div
                        className={`p-2 rounded-md ${
                          isSelected ? 'bg-primary/10' : 'bg-muted'
                        }`}
                      >
                        <Icon
                          className={`h-5 w-5 ${
                            isSelected ? 'text-primary' : 'text-muted-foreground'
                          }`}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{provider.label}</span>
                          {isSelected && (
                            <Badge variant="secondary" className="text-xs">
                              Selected
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {provider.description}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {provider.features.map((feature) => (
                            <Badge key={feature} variant="outline" className="text-xs">
                              {feature}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <a
                        href={provider.docUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* API Key Configuration */}
          {selectedProvider !== 'docker' && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    {currentProvider.label} API Key
                  </CardTitle>
                  <CardDescription>
                    Required to use {currentProvider.label} sandbox provider.
                  </CardDescription>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2" onClick={() => setIsDialogOpen(true)}>
                      <Key className="h-4 w-4" />
                      {settings.hasApiKey ? 'Update Key' : 'Add API Key'}
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <form onSubmit={handleSaveApiKey}>
                      <DialogHeader>
                        <DialogTitle>Configure {currentProvider.label} API Key</DialogTitle>
                        <DialogDescription>
                          Add your API key to enable sandbox functionality.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="apiKey">API Key</Label>
                          <div className="relative">
                            <Input
                              id="apiKey"
                              type={showKey ? 'text' : 'password'}
                              placeholder={currentProvider.apiKeyPlaceholder || 'Enter API key...'}
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
                              href={currentProvider.docUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              {currentProvider.label} dashboard
                            </a>
                          </p>
                        </div>

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
                        <Button type="submit" disabled={setApiKeyMutation.isPending}>
                          {setApiKeyMutation.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          Save Key
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {settings.hasApiKey ? (
                  <Alert>
                    <Check className="h-4 w-4" />
                    <AlertDescription>
                      API key configured. Sandbox is ready to use.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      API key required. Add your {currentProvider.label} API key to enable
                      sandbox functionality.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          )}

          {/* Provider-Specific Settings */}
          {selectedProvider === 'e2b' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">E2B Settings</CardTitle>
                <CardDescription>Configure E2B-specific options.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="e2bTemplate">Template ID (optional)</Label>
                  <Input
                    id="e2bTemplate"
                    placeholder="Custom template ID"
                    value={e2bTemplateId}
                    onChange={(e) => setE2bTemplateId(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Leave empty to use the default template. Create custom templates with{' '}
                    <code className="text-xs bg-muted px-1 py-0.5 rounded">e2b template</code>.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {selectedProvider === 'daytona' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Daytona Settings</CardTitle>
                <CardDescription>Configure Daytona-specific options.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="daytonaSnapshot">Snapshot (optional)</Label>
                  <Input
                    id="daytonaSnapshot"
                    placeholder="Snapshot name or ID"
                    value={daytonaSnapshot}
                    onChange={(e) => setDaytonaSnapshot(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Pre-configured environment snapshot for faster startup.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Default Language</Label>
                  <Select value={defaultLanguage} onValueChange={setDefaultLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGE_OPTIONS.map((lang) => (
                        <SelectItem key={lang.value} value={lang.value}>
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Auto-stop Interval</Label>
                    <span className="text-sm text-muted-foreground">
                      {daytonaAutoStop === 0 ? 'Never' : `${daytonaAutoStop} minutes`}
                    </span>
                  </div>
                  <Slider
                    value={[daytonaAutoStop]}
                    onValueChange={([value]) => setDaytonaAutoStop(value)}
                    min={0}
                    max={60}
                    step={5}
                  />
                  <p className="text-xs text-muted-foreground">
                    Automatically stop idle sandboxes to save resources.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {selectedProvider === 'docker' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Docker Settings</CardTitle>
                <CardDescription>Configure Docker-specific options.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {(settings as any).dockerAvailable === false && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Docker is not available on this server.</strong> The sandbox will not work until Docker is installed and running. Consider using E2B or Daytona as cloud-based alternatives.
                    </AlertDescription>
                  </Alert>
                )}

                {(settings as any).dockerAvailable === true && (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <AlertDescription>
                      Docker is available and ready to use.
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="dockerImage">Sandbox Image</Label>
                  <Input
                    id="dockerImage"
                    placeholder="wit-sandbox:latest"
                    value={dockerImage}
                    onChange={(e) => setDockerImage(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Docker image to use for sandboxes. Must be available on the server.
                  </p>
                </div>

                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    Docker provider requires Docker to be installed on the server. No external
                    API keys needed.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Resource Limits */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                Resource Limits
              </CardTitle>
              <CardDescription>
                Configure resource limits for sandbox sessions.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Memory */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    Memory Limit
                  </Label>
                  <span className="text-sm font-medium">{memoryMB} MB</span>
                </div>
                <Slider
                  value={[memoryMB]}
                  onValueChange={([value]) => setMemoryMB(value)}
                  min={512}
                  max={8192}
                  step={512}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum memory per sandbox. Higher values allow more complex operations.
                </p>
              </div>

              {/* CPU */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-muted-foreground" />
                    CPU Cores
                  </Label>
                  <span className="text-sm font-medium">{cpuCores} core(s)</span>
                </div>
                <Slider
                  value={[cpuCores]}
                  onValueChange={([value]) => setCpuCores(value)}
                  min={1}
                  max={4}
                  step={1}
                />
              </div>

              {/* Timeout */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Session Timeout
                  </Label>
                  <span className="text-sm font-medium">{timeoutMinutes} minutes</span>
                </div>
                <Slider
                  value={[timeoutMinutes]}
                  onValueChange={([value]) => setTimeoutMinutes(value)}
                  min={5}
                  max={120}
                  step={5}
                />
                <p className="text-xs text-muted-foreground">
                  Maximum duration for a single sandbox session.
                </p>
              </div>

              {/* Network Mode */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Network className="h-4 w-4 text-muted-foreground" />
                  Network Access
                </Label>
                <Select
                  value={networkMode}
                  onValueChange={(v) => setNetworkMode(v as typeof networkMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NETWORK_MODES.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>
                        <div>
                          <span>{mode.label}</span>
                          <span className="text-muted-foreground ml-2 text-xs">
                            - {mode.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Controls network access from sandbox. "No Network" is recommended for security.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button 
              onClick={handleSave} 
              disabled={!isEnabled || updateSettingsMutation.isPending}
            >
              {updateSettingsMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Saved
                </>
              ) : (
                'Save Settings'
              )}
            </Button>
          </div>

          {/* Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">About Sandboxes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                Sandboxes provide isolated environments for safe code execution. Users can
                access terminal sessions via SSH or the web interface, and AI agents run
                code safely without affecting the host system.
              </p>
              <p>
                <strong>E2B</strong> uses Firecracker microVMs for strong isolation with fast
                startup times. <strong>Daytona</strong> provides full development environments
                with IDE-like features. <strong>Docker</strong> offers self-hosted container
                isolation.
              </p>
              <p>
                API keys are encrypted and stored securely. You are responsible for any usage
                charges from your sandbox provider.
              </p>
            </CardContent>
          </Card>
        </div>
      </SettingsLayout>
    </RepoLayout>
  );
}
