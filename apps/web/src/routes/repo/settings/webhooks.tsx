import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Webhook,
  Plus,
  Trash2,
  Loader2,
  Check,
  X,
  Edit2,
  Send,
  Circle,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Loading } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { RepoLayout } from '../components/repo-layout';
import { SettingsLayout } from './layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime } from '@/lib/utils';

const WEBHOOK_EVENTS = [
  { value: 'push', label: 'Push', description: 'Branch or tag push' },
  { value: 'pull_request', label: 'Pull request', description: 'Opened, closed, or merged' },
  { value: 'pull_request_review', label: 'Pull request review', description: 'Review submitted' },
  { value: 'issue', label: 'Issue', description: 'Opened, closed, or updated' },
  { value: 'issue_comment', label: 'Issue comment', description: 'Comment created' },
  { value: 'create', label: 'Create', description: 'Branch or tag created' },
  { value: 'delete', label: 'Delete', description: 'Branch or tag deleted' },
  { value: 'fork', label: 'Fork', description: 'Repository forked' },
  { value: 'star', label: 'Star', description: 'Repository starred' },
];

interface WebhookData {
  id: string;
  url: string;
  secret: string | null;
  events: string[];
  isActive: boolean;
  lastDeliveryAt?: Date | string | null;
  lastDeliveryStatus?: number | null;
}

const DEFAULT_WEBHOOK: Omit<WebhookData, 'id' | 'lastDeliveryAt' | 'lastDeliveryStatus'> = {
  url: '',
  secret: null,
  events: ['push'],
  isActive: true,
};

export function WebhooksPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookData | null>(null);
  const [formData, setFormData] = useState(DEFAULT_WEBHOOK);
  const [eventSelection, setEventSelection] = useState<'push' | 'all' | 'custom'>('push');
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  const { data: webhooks, isLoading: webhooksLoading } = trpc.webhooks.list.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  );

  const createWebhook = trpc.webhooks.create.useMutation({
    onSuccess: () => {
      closeDialog();
      utils.webhooks.list.invalidate({ repoId: repoData?.repo.id! });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const updateWebhook = trpc.webhooks.update.useMutation({
    onSuccess: () => {
      closeDialog();
      utils.webhooks.list.invalidate({ repoId: repoData?.repo.id! });
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const deleteWebhook = trpc.webhooks.delete.useMutation({
    onSuccess: () => {
      utils.webhooks.list.invalidate({ repoId: repoData?.repo.id! });
    },
  });

  const testWebhook = trpc.webhooks.test.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        alert(`Ping sent successfully! Status: ${data.statusCode}`);
      } else {
        alert(`Ping failed: ${data.message}`);
      }
      utils.webhooks.list.invalidate({ repoId: repoData?.repo.id! });
    },
    onError: (err) => {
      alert(`Error testing webhook: ${err.message}`);
    },
  });

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingWebhook(null);
    setFormData(DEFAULT_WEBHOOK);
    setEventSelection('push');
    setError(null);
  };

  const openCreateDialog = () => {
    setEditingWebhook(null);
    setFormData(DEFAULT_WEBHOOK);
    setEventSelection('push');
    setIsDialogOpen(true);
  };

  const openEditDialog = (webhook: WebhookData) => {
    setEditingWebhook(webhook);
    setFormData({
      url: webhook.url,
      secret: null, // Don't show existing secret
      events: webhook.events,
      isActive: webhook.isActive,
    });
    // Determine event selection mode
    if (webhook.events.length === 1 && webhook.events[0] === 'push') {
      setEventSelection('push');
    } else if (webhook.events.length === WEBHOOK_EVENTS.length) {
      setEventSelection('all');
    } else {
      setEventSelection('custom');
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.url.trim()) {
      setError('Payload URL is required');
      return;
    }

    if (!repoData?.repo.id) return;

    let events: string[];
    if (eventSelection === 'push') {
      events = ['push'];
    } else if (eventSelection === 'all') {
      events = WEBHOOK_EVENTS.map((e) => e.value);
    } else {
      events = formData.events;
    }

    if (events.length === 0) {
      setError('Select at least one event');
      return;
    }

    if (editingWebhook) {
      updateWebhook.mutate({
        id: editingWebhook.id,
        repoId: repoData.repo.id,
        url: formData.url.trim(),
        secret: formData.secret || undefined,
        events,
        isActive: formData.isActive,
      });
    } else {
      createWebhook.mutate({
        repoId: repoData.repo.id,
        url: formData.url.trim(),
        secret: formData.secret || undefined,
        events,
      });
    }
  };

  const handleEventToggle = (event: string) => {
    setFormData((prev) => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter((e) => e !== event)
        : [...prev.events, event],
    }));
  };

  const handleDeleteWebhook = (webhookId: string) => {
    if (!repoData?.repo.id) return;

    if (confirm('Delete this webhook?')) {
      deleteWebhook.mutate({ id: webhookId, repoId: repoData.repo.id });
    }
  };

  const handleTestWebhook = (webhookId: string) => {
    if (!repoData?.repo.id) return;
    testWebhook.mutate({ id: webhookId, repoId: repoData.repo.id });
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

  const isLoading = repoLoading || webhooksLoading;

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading webhooks..." />
      </RepoLayout>
    );
  }

  if (!repoData?.repo) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Repository not found.</p>
        </div>
      </RepoLayout>
    );
  }

  const isMutating = createWebhook.isPending || updateWebhook.isPending;

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <SettingsLayout>
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">Webhooks</h2>
            <p className="text-muted-foreground mt-1">
              Get notified when events happen in your repository.
            </p>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Webhooks</CardTitle>
                <CardDescription>
                  Webhooks allow external services to receive notifications.
                </CardDescription>
              </div>
              <Dialog open={isDialogOpen} onOpenChange={(open) => !open && closeDialog()}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-2" onClick={openCreateDialog}>
                    <Plus className="h-4 w-4" />
                    Add Webhook
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                  <form onSubmit={handleSubmit}>
                    <DialogHeader>
                      <DialogTitle>
                        {editingWebhook ? 'Edit Webhook' : 'Add Webhook'}
                      </DialogTitle>
                      <DialogDescription>
                        {editingWebhook
                          ? 'Update the webhook configuration.'
                          : 'Configure a new webhook to receive event notifications.'}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                      {/* Payload URL */}
                      <div className="space-y-2">
                        <Label htmlFor="url">Payload URL</Label>
                        <Input
                          id="url"
                          type="url"
                          placeholder="https://example.com/webhook"
                          value={formData.url}
                          onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                        />
                      </div>

                      {/* Secret */}
                      <div className="space-y-2">
                        <Label htmlFor="secret">Secret (optional)</Label>
                        <Input
                          id="secret"
                          type="password"
                          placeholder={editingWebhook ? 'Leave empty to keep current' : 'Enter a secret'}
                          value={formData.secret || ''}
                          onChange={(e) => setFormData({ ...formData, secret: e.target.value || null })}
                        />
                        <p className="text-xs text-muted-foreground">
                          Used to sign webhook payloads for verification.
                        </p>
                      </div>

                      {/* Events */}
                      <div className="space-y-3">
                        <Label>Which events trigger this webhook?</Label>
                        <div className="space-y-2">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="radio"
                              name="eventSelection"
                              checked={eventSelection === 'push'}
                              onChange={() => setEventSelection('push')}
                            />
                            <span>Just the push event</span>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="radio"
                              name="eventSelection"
                              checked={eventSelection === 'all'}
                              onChange={() => setEventSelection('all')}
                            />
                            <span>Send me everything</span>
                          </label>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="radio"
                              name="eventSelection"
                              checked={eventSelection === 'custom'}
                              onChange={() => setEventSelection('custom')}
                            />
                            <span>Let me select individual events</span>
                          </label>
                        </div>

                        {eventSelection === 'custom' && (
                          <div className="ml-6 mt-3 space-y-2 border rounded-lg p-3">
                            {WEBHOOK_EVENTS.map((event) => (
                              <label
                                key={event.value}
                                className="flex items-start gap-3 cursor-pointer"
                              >
                                <Checkbox
                                  checked={formData.events.includes(event.value)}
                                  onCheckedChange={() => handleEventToggle(event.value)}
                                />
                                <div>
                                  <div className="font-medium text-sm">{event.label}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {event.description}
                                  </div>
                                </div>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Active */}
                      {editingWebhook && (
                        <div className="flex items-center gap-3">
                          <Checkbox
                            id="isActive"
                            checked={formData.isActive}
                            onCheckedChange={(checked) =>
                              setFormData({ ...formData, isActive: !!checked })
                            }
                          />
                          <Label htmlFor="isActive" className="cursor-pointer">
                            Active
                          </Label>
                        </div>
                      )}

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
                        {editingWebhook ? 'Save Changes' : 'Add Webhook'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {!webhooks || webhooks.length === 0 ? (
                <EmptyState
                  icon={Webhook}
                  title="No webhooks"
                  description="Add a webhook to receive event notifications."
                />
              ) : (
                <div className="divide-y">
                  {webhooks.map((webhook: any) => (
                    <WebhookRow
                      key={webhook.id}
                      webhook={webhook}
                      onEdit={() => openEditDialog(webhook)}
                      onDelete={() => handleDeleteWebhook(webhook.id)}
                      onTest={() => handleTestWebhook(webhook.id)}
                      isDeleting={deleteWebhook.isPending}
                      isTesting={testWebhook.isPending}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </SettingsLayout>
    </RepoLayout>
  );
}

interface WebhookRowProps {
  webhook: WebhookData;
  onEdit: () => void;
  onDelete: () => void;
  onTest: () => void;
  isDeleting: boolean;
  isTesting: boolean;
}

function WebhookRow({ webhook, onEdit, onDelete, onTest, isDeleting, isTesting }: WebhookRowProps) {
  const eventLabels = webhook.events
    .map((e) => WEBHOOK_EVENTS.find((we) => we.value === e)?.label || e)
    .slice(0, 3);
  const moreCount = webhook.events.length - 3;

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-1 p-2 bg-muted rounded-md">
            <Webhook className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm truncate">{webhook.url}</span>
              {webhook.isActive ? (
                <Badge variant="secondary" className="gap-1 text-green-600">
                  <Circle className="h-2 w-2 fill-current" />
                  Active
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1 text-muted-foreground">
                  <Circle className="h-2 w-2" />
                  Inactive
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <span>Events: {eventLabels.join(', ')}</span>
              {moreCount > 0 && <span>+{moreCount} more</span>}
            </div>
            {webhook.lastDeliveryAt && (
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                <span>Last delivery: {formatRelativeTime(webhook.lastDeliveryAt)}</span>
                {webhook.lastDeliveryStatus !== null && webhook.lastDeliveryStatus !== undefined && (
                  <>
                    <span>·</span>
                    {webhook.lastDeliveryStatus >= 200 && webhook.lastDeliveryStatus < 300 ? (
                      <span className="text-green-600 flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        {webhook.lastDeliveryStatus}
                      </span>
                    ) : (
                      <span className="text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {webhook.lastDeliveryStatus}
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onTest}
            disabled={isTesting || !webhook.isActive}
            title={!webhook.isActive ? 'Activate webhook to test' : 'Send test ping'}
          >
            {isTesting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Edit2 className="h-4 w-4" />
          </Button>
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
      </div>
    </div>
  );
}
