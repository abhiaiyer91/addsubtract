import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Bot,
  Loader2,
  Check,
  AlertCircle,
  ShieldAlert,
  Tags,
  UserCheck,
  AlertTriangle,
  MessageSquare,
  History,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loading } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RepoLayout } from '../components/repo-layout';
import { SettingsLayout } from './layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatDistanceToNow } from 'date-fns';

const DEFAULT_PROMPT = `Analyze incoming issues and:
- Apply appropriate labels based on the issue type (bug, feature, documentation, etc.)
- Set priority based on urgency and impact described
- For bugs, look for severity indicators
- For features, consider if it's a small enhancement or major request`;

export function TriageAgentSettingsPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  const [showHistory, setShowHistory] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const utils = trpc.useUtils();

  // Get triage agent configuration
  const { data: settings, isLoading } = trpc.triageAgent.getConfig.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo && authenticated }
  );

  // Get recent triage runs
  const { data: runs, isLoading: runsLoading } = trpc.triageAgent.getRuns.useQuery(
    { repoId: settings?.repoId || '', limit: 10 },
    { enabled: !!settings?.repoId && showHistory }
  );

  // Update config mutation
  const updateConfigMutation = trpc.triageAgent.updateConfig.useMutation({
    onSuccess: () => {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      utils.triageAgent.getConfig.invalidate({ owner: owner!, repo: repo! });
    },
  });

  // Set enabled mutation
  const setEnabledMutation = trpc.triageAgent.setEnabled.useMutation({
    onSuccess: () => {
      utils.triageAgent.getConfig.invalidate({ owner: owner!, repo: repo! });
    },
  });

  // Initialize prompt from settings
  useEffect(() => {
    if (settings?.config?.prompt !== undefined) {
      setPrompt(settings.config.prompt || '');
    }
  }, [settings?.config?.prompt]);

  const handleToggleEnabled = async (enabled: boolean) => {
    if (!settings?.repoId) return;
    setEnabledMutation.mutate({ repoId: settings.repoId, enabled });
  };

  const handleToggleOption = async (option: string, value: boolean) => {
    if (!settings?.repoId) return;
    updateConfigMutation.mutate({
      repoId: settings.repoId,
      [option]: value,
    });
  };

  const handleSavePrompt = async () => {
    if (!settings?.repoId) return;
    updateConfigMutation.mutate({
      repoId: settings.repoId,
      prompt: prompt || null,
    });
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
        <Loading text="Loading triage agent settings..." />
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

  // Only owners can manage triage agent
  if (!settings.hasAccess) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <SettingsLayout>
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold">Triage Agent</h2>
              <p className="text-muted-foreground mt-1">
                Automatically triage new issues using AI.
              </p>
            </div>

            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                Only the repository owner can configure the triage agent.
              </AlertDescription>
            </Alert>
          </div>
        </SettingsLayout>
      </RepoLayout>
    );
  }

  const config = settings.config;
  const isEnabled = config?.enabled ?? false;
  const isMutating = updateConfigMutation.isPending || setEnabledMutation.isPending;

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <SettingsLayout>
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">Triage Agent</h2>
            <p className="text-muted-foreground mt-1">
              Configure an AI agent to automatically triage new issues.
            </p>
          </div>

          {/* AI Availability Alert */}
          {!settings.aiAvailable && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                AI API keys must be configured before enabling the triage agent.{' '}
                <a href={`/${owner}/${repo}/settings/ai`} className="underline">
                  Configure AI keys
                </a>
              </AlertDescription>
            </Alert>
          )}

          {/* Enable/Disable Toggle */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-md">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Enable Triage Agent</CardTitle>
                    <CardDescription>
                      Automatically analyze and categorize new issues when they are created.
                    </CardDescription>
                  </div>
                </div>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={handleToggleEnabled}
                  disabled={!settings.aiAvailable || setEnabledMutation.isPending}
                />
              </div>
            </CardHeader>
          </Card>

          {/* Configuration Options */}
          <Card>
            <CardHeader>
              <CardTitle>Triage Actions</CardTitle>
              <CardDescription>
                Choose what actions the triage agent should perform on new issues.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Tags className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label>Auto-assign labels</Label>
                    <p className="text-sm text-muted-foreground">
                      Apply relevant labels based on issue content
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config?.autoAssignLabels ?? true}
                  onCheckedChange={(checked) => handleToggleOption('autoAssignLabels', checked)}
                  disabled={!isEnabled || isMutating}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label>Auto-set priority</Label>
                    <p className="text-sm text-muted-foreground">
                      Set priority based on urgency and impact
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config?.autoSetPriority ?? true}
                  onCheckedChange={(checked) => handleToggleOption('autoSetPriority', checked)}
                  disabled={!isEnabled || isMutating}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label>Auto-assign users</Label>
                    <p className="text-sm text-muted-foreground">
                      Assign issues to team members based on expertise
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config?.autoAssignUsers ?? false}
                  onCheckedChange={(checked) => handleToggleOption('autoAssignUsers', checked)}
                  disabled={!isEnabled || isMutating}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <Label>Add triage comment</Label>
                    <p className="text-sm text-muted-foreground">
                      Post a comment explaining triage decisions
                    </p>
                  </div>
                </div>
                <Switch
                  checked={config?.addTriageComment ?? true}
                  onCheckedChange={(checked) => handleToggleOption('addTriageComment', checked)}
                  disabled={!isEnabled || isMutating}
                />
              </div>
            </CardContent>
          </Card>

          {/* Custom Prompt */}
          <Card>
            <CardHeader>
              <CardTitle>Custom Instructions</CardTitle>
              <CardDescription>
                Provide custom instructions to guide how the agent triages issues.
                Leave empty to use the default behavior.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder={DEFAULT_PROMPT}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={6}
                disabled={!isEnabled}
                className="font-mono text-sm"
              />
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Examples: team expertise, label naming conventions, priority criteria
                </p>
                <Button
                  onClick={handleSavePrompt}
                  disabled={!isEnabled || updateConfigMutation.isPending}
                  size="sm"
                >
                  {updateConfigMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : saveSuccess ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : null}
                  {saveSuccess ? 'Saved' : 'Save Instructions'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Triage Runs */}
          <Card>
            <CardHeader>
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center justify-between w-full text-left"
              >
                <div className="flex items-center gap-3">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">Recent Triage History</CardTitle>
                    <CardDescription>
                      View recent triage agent activity
                    </CardDescription>
                  </div>
                </div>
                {showHistory ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </CardHeader>
            {showHistory && (
              <CardContent>
                {runsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : !runs || runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No triage runs yet. Create an issue to see the agent in action.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {runs.map((run) => (
                      <div
                        key={run.id}
                        className="flex items-start justify-between p-3 rounded-md bg-muted/50"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {run.success ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-destructive" />
                            )}
                            <span className="text-sm font-medium">
                              Issue triaged
                            </span>
                          </div>
                          {run.assignedLabels && run.assignedLabels.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              <Tags className="h-3 w-3 text-muted-foreground" />
                              {run.assignedLabels.map((label: string) => (
                                <Badge key={label} variant="secondary" className="text-xs">
                                  {label}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {run.assignedPriority && (
                            <div className="flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                Priority: {run.assignedPriority}
                              </span>
                            </div>
                          )}
                          {run.errorMessage && (
                            <p className="text-xs text-destructive">{run.errorMessage}</p>
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

          {/* Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">How It Works</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                When enabled, the triage agent automatically analyzes new issues when they are created.
                It reads the issue title and description, then takes actions based on your configuration.
              </p>
              <p>
                The agent uses your repository's labels and collaborator list to make intelligent
                decisions. Custom instructions help tailor the agent to your team's workflow.
              </p>
              <p>
                <strong>Note:</strong> The triage agent uses your configured AI API keys.
                Usage will count against your API quota.
              </p>
            </CardContent>
          </Card>
        </div>
      </SettingsLayout>
    </RepoLayout>
  );
}
