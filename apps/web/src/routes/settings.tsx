import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Check, Key, Ticket, ChevronRight, AppWindow, Shield, Bell, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loading } from '@/components/ui/loading';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

export function SettingsPage() {
  const { data: session, isPending } = useSession();
  const user = session?.user;
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    bio: '',
    location: '',
    website: '',
    avatarUrl: '',
  });

  const updateProfile = trpc.users.update.useMutation({
    onSuccess: () => {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
  });

  // Update form when user data loads
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        bio: (user as any).bio || '',
        location: (user as any).location || '',
        website: (user as any).website || '',
        avatarUrl: user.image || '',
      });
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate({
      name: formData.name || undefined,
      bio: formData.bio || undefined,
      location: formData.location || undefined,
      website: formData.website || undefined,
      avatarUrl: formData.avatarUrl || undefined,
    });
  };

  if (isPending) {
    return <Loading text="Loading settings..." />;
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Please sign in to access settings.</p>
      </div>
    );
  }

  return (
    <div className="container max-w-[1200px] mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>
            Update your public profile information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex items-center gap-6">
              <Avatar className="h-20 w-20">
                <AvatarImage src={formData.avatarUrl || user.image || undefined} />
                <AvatarFallback className="text-2xl">
                  {(user.username || user.name || 'U').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <Label htmlFor="avatarUrl">Avatar URL</Label>
                <Input
                  id="avatarUrl"
                  type="url"
                  value={formData.avatarUrl}
                  onChange={(e) => setFormData({ ...formData, avatarUrl: e.target.value })}
                  placeholder="https://example.com/avatar.png"
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Your full name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                placeholder="Tell us about yourself"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="San Francisco, CA"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="url"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="https://example.com"
              />
            </div>

            <div className="flex items-center gap-4">
              <Button type="submit" disabled={updateProfile.isPending}>
                {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save changes
              </Button>
              {saveSuccess && (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <Check className="h-4 w-4" />
                  Saved successfully
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Configure how and when you receive notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Link
            to="/settings/notifications"
            className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-md group-hover:bg-background">
                <Bell className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <div className="font-medium">Email Notifications</div>
                <div className="text-sm text-muted-foreground">
                  Choose which notifications you receive by email
                </div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>
            Manage your authentication methods and access tokens.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Link
            to="/settings/keys"
            className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-md group-hover:bg-background">
                <Key className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <div className="font-medium">SSH Keys</div>
                <div className="text-sm text-muted-foreground">
                  Manage SSH keys for secure Git operations
                </div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <Link
            to="/settings/tokens"
            className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-md group-hover:bg-background">
                <Ticket className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <div className="font-medium">Personal Access Tokens</div>
                <div className="text-sm text-muted-foreground">
                  Generate tokens for API and Git access
                </div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
          <Link
            to="/settings/authorized-apps"
            className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-md group-hover:bg-background">
                <Shield className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <div className="font-medium">Authorized Applications</div>
                <div className="text-sm text-muted-foreground">
                  Manage third-party apps with access to your account
                </div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Settings</CardTitle>
          <CardDescription>
            Configure AI API keys for enhanced features.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Link
            to="/settings/ai"
            className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-md group-hover:bg-background">
                <Sparkles className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <div className="font-medium">AI API Keys</div>
                <div className="text-sm text-muted-foreground">
                  Enable semantic search, code review, and AI features
                </div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Developer Settings</CardTitle>
          <CardDescription>
            Build integrations and applications with wit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Link
            to="/settings/oauth-apps"
            className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-muted rounded-md group-hover:bg-background">
                <AppWindow className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <div className="font-medium">OAuth Apps</div>
                <div className="text-sm text-muted-foreground">
                  Register and manage OAuth applications
                </div>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Irreversible and destructive actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive">Delete account</Button>
        </CardContent>
      </Card>
    </div>
  );
}
