import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Check, ArrowLeft, Mail, Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loading } from '@/components/ui/loading';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

interface NotificationPreference {
  key: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

const NOTIFICATION_CATEGORIES = [
  {
    title: 'Pull Requests',
    notifications: [
      {
        key: 'prReviewRequested',
        label: 'Review requested',
        description: 'When someone requests your review on a pull request',
        defaultEnabled: true,
      },
      {
        key: 'prReviewed',
        label: 'PR reviewed',
        description: 'When someone reviews your pull request',
        defaultEnabled: true,
      },
      {
        key: 'prMerged',
        label: 'PR merged',
        description: 'When your pull request is merged',
        defaultEnabled: true,
      },
      {
        key: 'prComment',
        label: 'PR comments',
        description: 'When someone comments on your pull request',
        defaultEnabled: true,
      },
    ],
  },
  {
    title: 'Issues',
    notifications: [
      {
        key: 'issueAssigned',
        label: 'Issue assigned',
        description: 'When you are assigned to an issue',
        defaultEnabled: true,
      },
      {
        key: 'issueComment',
        label: 'Issue comments',
        description: 'When someone comments on your issue',
        defaultEnabled: true,
      },
    ],
  },
  {
    title: 'Mentions',
    notifications: [
      {
        key: 'mention',
        label: 'Mentions',
        description: 'When someone mentions you with @username',
        defaultEnabled: true,
      },
    ],
  },
  {
    title: 'Repository Activity',
    notifications: [
      {
        key: 'repoPush',
        label: 'Push notifications',
        description: 'When changes are pushed to repositories you watch',
        defaultEnabled: false,
      },
      {
        key: 'repoStarred',
        label: 'Stars',
        description: 'When someone stars your repository',
        defaultEnabled: false,
      },
      {
        key: 'repoForked',
        label: 'Forks',
        description: 'When someone forks your repository',
        defaultEnabled: true,
      },
    ],
  },
  {
    title: 'CI/CD',
    notifications: [
      {
        key: 'ciFailed',
        label: 'CI failures',
        description: 'When a workflow run fails on your pull request',
        defaultEnabled: true,
      },
      {
        key: 'ciPassed',
        label: 'CI success',
        description: 'When a workflow run succeeds on your pull request',
        defaultEnabled: false,
      },
    ],
  },
];

export function NotificationSettingsPage() {
  const { data: session, isPending: sessionPending } = useSession();
  const user = session?.user;
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Fetch current preferences
  const { data: preferences, isLoading: prefsLoading } = trpc.notifications.getEmailPreferences.useQuery(
    undefined,
    { enabled: !!user }
  );
  
  const updatePreferences = trpc.notifications.updateEmailPreferences.useMutation({
    onSuccess: () => {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  // Local state for form
  const [formData, setFormData] = useState<Record<string, boolean>>({
    emailEnabled: true,
    prReviewRequested: true,
    prReviewed: true,
    prMerged: true,
    prComment: true,
    issueAssigned: true,
    issueComment: true,
    mention: true,
    repoPush: false,
    repoStarred: false,
    repoForked: true,
    ciFailed: true,
    ciPassed: false,
    digestEnabled: false,
  });
  const [digestFrequency, setDigestFrequency] = useState('daily');
  const [digestHour, setDigestHour] = useState(9);

  // Update form when preferences load
  useEffect(() => {
    if (preferences) {
      setFormData({
        emailEnabled: preferences.emailEnabled,
        prReviewRequested: preferences.prReviewRequested,
        prReviewed: preferences.prReviewed,
        prMerged: preferences.prMerged,
        prComment: preferences.prComment,
        issueAssigned: preferences.issueAssigned,
        issueComment: preferences.issueComment,
        mention: preferences.mention,
        repoPush: preferences.repoPush,
        repoStarred: preferences.repoStarred,
        repoForked: preferences.repoForked,
        ciFailed: preferences.ciFailed,
        ciPassed: preferences.ciPassed,
        digestEnabled: preferences.digestEnabled,
      });
      setDigestFrequency(preferences.digestFrequency);
      setDigestHour(preferences.digestHour);
    }
  }, [preferences]);

  const handleToggle = async (key: string, value: boolean) => {
    const newData = { ...formData, [key]: value };
    setFormData(newData);
    
    // Auto-save on toggle
    updatePreferences.mutate({ [key]: value });
  };

  const handleDigestChange = async (field: string, value: string | number) => {
    if (field === 'digestFrequency') {
      setDigestFrequency(value as string);
      updatePreferences.mutate({ digestFrequency: value as string });
    } else if (field === 'digestHour') {
      setDigestHour(value as number);
      updatePreferences.mutate({ digestHour: value as number });
    }
  };

  if (sessionPending || prefsLoading) {
    return <Loading text="Loading notification settings..." />;
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Please sign in to access settings.</p>
      </div>
    );
  }

  return (
    <div className="container max-w-[800px] mx-auto py-8 space-y-8">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/settings">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Email Notifications</h1>
          <p className="text-muted-foreground">Choose which notifications you want to receive by email</p>
        </div>
      </div>

      {/* Master Switch */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${formData.emailEnabled ? 'bg-primary/10' : 'bg-muted'}`}>
                {formData.emailEnabled ? (
                  <Mail className="h-6 w-6 text-primary" />
                ) : (
                  <BellOff className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div>
                <h3 className="font-semibold">Email notifications</h3>
                <p className="text-sm text-muted-foreground">
                  {formData.emailEnabled 
                    ? 'You will receive email notifications based on your preferences below'
                    : 'All email notifications are currently disabled'
                  }
                </p>
              </div>
            </div>
            <Switch
              checked={formData.emailEnabled}
              onCheckedChange={(checked) => handleToggle('emailEnabled', checked)}
              disabled={updatePreferences.isPending}
            />
          </div>
        </CardContent>
      </Card>

      {/* Individual Preferences */}
      <div className={formData.emailEnabled ? '' : 'opacity-50 pointer-events-none'}>
        {NOTIFICATION_CATEGORIES.map((category) => (
          <Card key={category.title} className="mb-4">
            <CardHeader>
              <CardTitle className="text-lg">{category.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {category.notifications.map((notification, index) => (
                <div key={notification.key}>
                  {index > 0 && <Separator className="my-4" />}
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label htmlFor={notification.key} className="font-medium cursor-pointer">
                        {notification.label}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {notification.description}
                      </p>
                    </div>
                    <Switch
                      id={notification.key}
                      checked={formData[notification.key] ?? notification.defaultEnabled}
                      onCheckedChange={(checked) => handleToggle(notification.key, checked)}
                      disabled={updatePreferences.isPending || !formData.emailEnabled}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        {/* Email Digest */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Email Digest</CardTitle>
            <CardDescription>
              Receive a summary of your notifications instead of individual emails
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="digestEnabled" className="font-medium cursor-pointer">
                  Enable digest emails
                </Label>
                <p className="text-sm text-muted-foreground">
                  Get a consolidated summary instead of individual notification emails
                </p>
              </div>
              <Switch
                id="digestEnabled"
                checked={formData.digestEnabled}
                onCheckedChange={(checked) => handleToggle('digestEnabled', checked)}
                disabled={updatePreferences.isPending || !formData.emailEnabled}
              />
            </div>
            
            {formData.digestEnabled && (
              <>
                <Separator />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="digestFrequency">Frequency</Label>
                    <Select
                      value={digestFrequency}
                      onValueChange={(value) => handleDigestChange('digestFrequency', value)}
                      disabled={updatePreferences.isPending}
                    >
                      <SelectTrigger id="digestFrequency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="digestHour">Time (UTC)</Label>
                    <Select
                      value={digestHour.toString()}
                      onValueChange={(value) => handleDigestChange('digestHour', parseInt(value))}
                      disabled={updatePreferences.isPending}
                    >
                      <SelectTrigger id="digestHour">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 24 }, (_, i) => (
                          <SelectItem key={i} value={i.toString()}>
                            {i.toString().padStart(2, '0')}:00
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Save indicator */}
      {(updatePreferences.isPending || saveSuccess) && (
        <div className="fixed bottom-4 right-4 bg-background border rounded-lg shadow-lg p-4 flex items-center gap-2">
          {updatePreferences.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Saving...</span>
            </>
          ) : (
            <>
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm text-green-600">Saved</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
