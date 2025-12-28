import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { formatDate, formatDateTime } from '../lib/utils';
import {
  ArrowLeft,
  Shield,
  ShieldAlert,
  Ban,
  CheckCircle,
  GitBranch,
  GitPullRequest,
  CircleDot,
  Loader2,
} from 'lucide-react';

export function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const [suspendReason, setSuspendReason] = useState('');
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);

  const { data: user, isLoading, refetch } = trpc.admin.getUser.useQuery(
    { userId: userId! },
    { enabled: !!userId }
  );
  
  const { data: access } = trpc.admin.checkAccess.useQuery();

  const suspendMutation = trpc.admin.suspendUser.useMutation({
    onSuccess: () => {
      refetch();
      setShowSuspendDialog(false);
      setSuspendReason('');
    },
  });

  const unsuspendMutation = trpc.admin.unsuspendUser.useMutation({
    onSuccess: () => refetch(),
  });

  const updateRoleMutation = trpc.admin.updateUserRole.useMutation({
    onSuccess: () => refetch(),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold">User not found</h2>
        <Link to="/users" className="text-primary hover:underline mt-2 inline-block">
          Back to users
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/users" className="p-2 hover:bg-muted rounded-lg transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">{user.name}</h1>
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
              user.role === 'superadmin'
                ? 'bg-purple-500/10 text-purple-500'
                : user.role === 'admin'
                ? 'bg-blue-500/10 text-blue-500'
                : 'bg-muted text-muted-foreground'
            }`}>
              {user.role === 'superadmin' && <ShieldAlert className="h-3 w-3" />}
              {user.role === 'admin' && <Shield className="h-3 w-3" />}
              {user.role}
            </span>
            {user.suspended && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
                <Ban className="h-3 w-3" />
                Suspended
              </span>
            )}
          </div>
          <p className="text-muted-foreground">{user.email}</p>
          {user.username && <p className="text-sm text-muted-foreground">@{user.username}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* User Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <GitBranch className="h-4 w-4" />
                <span className="text-sm">Repositories</span>
              </div>
              <p className="text-2xl font-bold">{user.repoCount}</p>
            </div>
            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <GitPullRequest className="h-4 w-4" />
                <span className="text-sm">Pull Requests</span>
              </div>
              <p className="text-2xl font-bold">{user.prCount}</p>
            </div>
            <div className="bg-card rounded-lg border p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <CircleDot className="h-4 w-4" />
                <span className="text-sm">Issues</span>
              </div>
              <p className="text-2xl font-bold">{user.issueCount}</p>
            </div>
          </div>

          {/* Details */}
          <div className="bg-card rounded-lg border p-6">
            <h3 className="text-lg font-semibold mb-4">Account Details</h3>
            <dl className="space-y-4">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">User ID</dt>
                <dd className="font-mono text-sm">{user.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Created</dt>
                <dd>{formatDateTime(user.createdAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Last Updated</dt>
                <dd>{formatDateTime(user.updatedAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Last Active</dt>
                <dd>{user.lastActive ? formatDateTime(user.lastActive) : 'Never'}</dd>
              </div>
              {user.suspended && (
                <>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Suspended At</dt>
                    <dd className="text-destructive">
                      {user.suspendedAt ? formatDateTime(user.suspendedAt) : '-'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Suspension Reason</dt>
                    <dd className="text-destructive">{user.suspendedReason || '-'}</dd>
                  </div>
                </>
              )}
            </dl>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-6">
          <div className="bg-card rounded-lg border p-6">
            <h3 className="text-lg font-semibold mb-4">Actions</h3>
            <div className="space-y-3">
              {/* Suspend/Unsuspend */}
              {user.suspended ? (
                <button
                  onClick={() => unsuspendMutation.mutate({ userId: user.id })}
                  disabled={unsuspendMutation.isPending}
                  className="flex items-center gap-2 w-full px-4 py-2 bg-green-500/10 text-green-500 rounded-lg hover:bg-green-500/20 transition-colors disabled:opacity-50"
                >
                  {unsuspendMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  Unsuspend User
                </button>
              ) : (
                <button
                  onClick={() => setShowSuspendDialog(true)}
                  className="flex items-center gap-2 w-full px-4 py-2 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors"
                >
                  <Ban className="h-4 w-4" />
                  Suspend User
                </button>
              )}

              {/* Role Management (superadmin only) */}
              {access?.isSuperAdmin && (
                <div className="pt-4 border-t">
                  <label className="text-sm text-muted-foreground block mb-2">
                    Change Role
                  </label>
                  <select
                    value={user.role}
                    onChange={(e) => {
                      if (confirm(`Change ${user.name}'s role to ${e.target.value}?`)) {
                        updateRoleMutation.mutate({
                          userId: user.id,
                          role: e.target.value as 'user' | 'admin' | 'superadmin',
                        });
                      }
                    }}
                    disabled={updateRoleMutation.isPending}
                    className="w-full px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">Super Admin</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Suspend Dialog */}
      {showSuspendDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-lg border p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Suspend User</h3>
            <p className="text-muted-foreground mb-4">
              This will prevent {user.name} from accessing their account.
            </p>
            <div className="mb-4">
              <label className="text-sm text-muted-foreground block mb-2">
                Reason for suspension
              </label>
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Enter reason..."
                className="w-full px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary min-h-24"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSuspendDialog(false)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  suspendMutation.mutate({
                    userId: user.id,
                    reason: suspendReason,
                  });
                }}
                disabled={!suspendReason.trim() || suspendMutation.isPending}
                className="flex-1 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {suspendMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                ) : (
                  'Suspend'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
