import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { formatDateTime } from '../lib/utils';
import { Settings, Plus, Loader2, Trash2 } from 'lucide-react';

export function SettingsPage() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [formData, setFormData] = useState({
    key: '',
    value: '',
    description: '',
  });

  const utils = trpc.useUtils();
  const { data: settings, isLoading } = trpc.admin.getSettings.useQuery();
  const { data: access } = trpc.admin.checkAccess.useQuery();

  const setSettingMutation = trpc.admin.setSetting.useMutation({
    onSuccess: () => {
      utils.admin.getSettings.invalidate();
      setShowAddDialog(false);
      setFormData({ key: '', value: '', description: '' });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const value = JSON.parse(formData.value);
      setSettingMutation.mutate({
        key: formData.key,
        value,
        description: formData.description || undefined,
      });
    } catch {
      // Try as string if not valid JSON
      setSettingMutation.mutate({
        key: formData.key,
        value: formData.value,
        description: formData.description || undefined,
      });
    }
  };

  const canEdit = access?.isSuperAdmin;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">System Settings</h1>
          <p className="text-muted-foreground">
            Configure system-wide settings
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => setShowAddDialog(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Setting
          </button>
        )}
      </div>

      {!canEdit && (
        <div className="bg-amber-500/10 text-amber-500 px-4 py-3 rounded-lg">
          Only Super Admins can modify system settings.
        </div>
      )}

      {/* Settings List */}
      <div className="space-y-4">
        {isLoading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="bg-card rounded-lg border p-4">
              <div className="h-5 bg-muted rounded animate-pulse" />
            </div>
          ))
        ) : settings?.length === 0 ? (
          <div className="bg-card rounded-lg border p-12 text-center">
            <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No system settings configured</p>
            {canEdit && (
              <button
                onClick={() => setShowAddDialog(true)}
                className="mt-4 text-primary hover:underline"
              >
                Add your first setting
              </button>
            )}
          </div>
        ) : (
          settings?.map((setting) => (
            <div
              key={setting.key}
              className="bg-card rounded-lg border p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <code className="px-2 py-1 bg-muted rounded text-sm font-mono">
                      {setting.key}
                    </code>
                  </div>
                  {setting.description && (
                    <p className="text-sm text-muted-foreground mb-2">
                      {setting.description}
                    </p>
                  )}
                  <div className="bg-muted p-3 rounded-lg font-mono text-sm overflow-auto max-h-32">
                    {JSON.stringify(setting.value, null, 2)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Last updated {formatDateTime(setting.updatedAt)}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-lg border p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Add System Setting</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Key</label>
                <input
                  type="text"
                  value={formData.key}
                  onChange={(e) => setFormData(f => ({ ...f, key: e.target.value }))}
                  placeholder="my_setting_key"
                  className="w-full px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                  required
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Value (JSON or string)</label>
                <textarea
                  value={formData.value}
                  onChange={(e) => setFormData(f => ({ ...f, value: e.target.value }))}
                  placeholder='{"enabled": true}'
                  className="w-full px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary font-mono min-h-24"
                  required
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
                  placeholder="What does this setting control?"
                  className="w-full px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddDialog(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!formData.key.trim() || !formData.value.trim() || setSettingMutation.isPending}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {setSettingMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  ) : (
                    'Save'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
