import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { formatDateTime } from '../lib/utils';
import {
  Plus,
  Edit2,
  Trash2,
  Loader2,
  Flag,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';

export function FeatureFlagsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingFlag, setEditingFlag] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    enabled: false,
    rolloutPercentage: 0,
  });

  const utils = trpc.useUtils();
  const { data: flags, isLoading } = trpc.admin.getFeatureFlags.useQuery();

  const upsertMutation = trpc.admin.upsertFeatureFlag.useMutation({
    onSuccess: () => {
      utils.admin.getFeatureFlags.invalidate();
      setShowCreateDialog(false);
      setEditingFlag(null);
      setFormData({ name: '', description: '', enabled: false, rolloutPercentage: 0 });
    },
  });

  const deleteMutation = trpc.admin.deleteFeatureFlag.useMutation({
    onSuccess: () => {
      utils.admin.getFeatureFlags.invalidate();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    upsertMutation.mutate(formData);
  };

  const startEditing = (flag: NonNullable<typeof flags>[number]) => {
    setEditingFlag(flag.id);
    setFormData({
      name: flag.name,
      description: flag.description || '',
      enabled: flag.enabled,
      rolloutPercentage: flag.rolloutPercentage ?? 0,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Feature Flags</h1>
          <p className="text-muted-foreground">
            Manage feature toggles and rollouts
          </p>
        </div>
        <button
          onClick={() => {
            setFormData({ name: '', description: '', enabled: false, rolloutPercentage: 0 });
            setShowCreateDialog(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Flag
        </button>
      </div>

      {/* Flags List */}
      <div className="space-y-4">
        {isLoading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="bg-card rounded-lg border p-4">
              <div className="h-5 bg-muted rounded animate-pulse" />
            </div>
          ))
        ) : flags?.length === 0 ? (
          <div className="bg-card rounded-lg border p-12 text-center">
            <Flag className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No feature flags yet</p>
            <button
              onClick={() => setShowCreateDialog(true)}
              className="mt-4 text-primary hover:underline"
            >
              Create your first flag
            </button>
          </div>
        ) : (
          flags?.map((flag) => (
            <div
              key={flag.id}
              className="bg-card rounded-lg border p-6 hover:shadow-md transition-shadow"
            >
              {editingFlag === flag.id ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <input
                    type="text"
                    value={formData.name}
                    disabled
                    className="w-full px-4 py-2 bg-muted border rounded-lg"
                  />
                  <input
                    type="text"
                    value={formData.description}
                    onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
                    placeholder="Description"
                    className="w-full px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.enabled}
                        onChange={(e) => setFormData(f => ({ ...f, enabled: e.target.checked }))}
                        className="rounded"
                      />
                      Enabled
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="text-sm text-muted-foreground">Rollout %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.rolloutPercentage}
                        onChange={(e) => setFormData(f => ({ ...f, rolloutPercentage: parseInt(e.target.value) || 0 }))}
                        className="w-20 px-2 py-1 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={upsertMutation.isPending}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {upsertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingFlag(null)}
                      className="px-4 py-2 border rounded-lg hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-primary/10">
                      {flag.enabled ? (
                        <ToggleRight className="h-5 w-5 text-green-500" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{flag.name}</p>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          flag.enabled
                            ? 'bg-green-500/10 text-green-500'
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {flag.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        {flag.rolloutPercentage !== null && flag.rolloutPercentage !== 100 && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-blue-500/10 text-blue-500">
                            {flag.rolloutPercentage}% rollout
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {flag.description || 'No description'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Created {formatDateTime(flag.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEditing(flag)}
                      className="p-2 hover:bg-muted rounded-lg transition-colors"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete flag "${flag.name}"?`)) {
                          deleteMutation.mutate({ name: flag.name });
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="p-2 hover:bg-destructive/10 text-destructive rounded-lg transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-lg border p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Create Feature Flag</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
                  placeholder="my_feature_flag"
                  className="w-full px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData(f => ({ ...f, description: e.target.value }))}
                  placeholder="What does this flag control?"
                  className="w-full px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData(f => ({ ...f, enabled: e.target.checked }))}
                    className="rounded"
                  />
                  Enabled
                </label>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-muted-foreground">Rollout %</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.rolloutPercentage}
                    onChange={(e) => setFormData(f => ({ ...f, rolloutPercentage: parseInt(e.target.value) || 0 }))}
                    className="w-20 px-2 py-1 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateDialog(false)}
                  className="flex-1 px-4 py-2 border rounded-lg hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!formData.name.trim() || upsertMutation.isPending}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {upsertMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  ) : (
                    'Create'
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
