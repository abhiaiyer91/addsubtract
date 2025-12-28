import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { formatDateTime } from '../lib/utils';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  User,
  GitBranch,
  Flag,
  Settings,
  Shield,
} from 'lucide-react';

const actionIcons: Record<string, typeof User> = {
  'user': User,
  'repo': GitBranch,
  'feature_flag': Flag,
  'system_setting': Settings,
};

export function AuditLogsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [targetType, setTargetType] = useState<string | undefined>();
  const limit = 30;

  const { data, isLoading } = trpc.admin.getAuditLogs.useQuery({
    limit,
    offset: page * limit,
    targetType: targetType || undefined,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Audit Logs</h1>
          <p className="text-muted-foreground">
            Track all administrative actions
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {data?.total ?? 0} total entries
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <select
          value={targetType ?? ''}
          onChange={(e) => {
            setTargetType(e.target.value || undefined);
            setPage(0);
          }}
          className="px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All Types</option>
          <option value="user">User Actions</option>
          <option value="repo">Repository Actions</option>
          <option value="feature_flag">Feature Flags</option>
          <option value="system_setting">System Settings</option>
        </select>
      </div>

      {/* Logs */}
      <div className="space-y-4">
        {isLoading ? (
          [...Array(10)].map((_, i) => (
            <div key={i} className="bg-card rounded-lg border p-4">
              <div className="h-5 bg-muted rounded animate-pulse" />
            </div>
          ))
        ) : data?.logs.length === 0 ? (
          <div className="bg-card rounded-lg border p-12 text-center text-muted-foreground">
            No audit logs found
          </div>
        ) : (
          data?.logs.map((log) => {
            const Icon = actionIcons[log.targetType] || Shield;
            return (
              <div key={log.id} className="bg-card rounded-lg border p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{log.description}</p>
                      <span className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                        {log.action}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                      <span>
                        By: {log.adminName || log.adminEmail || 'Unknown'}
                      </span>
                      {log.targetId && (
                        <span>
                          Target: {log.targetId}
                        </span>
                      )}
                      <span>{formatDateTime(log.createdAt)}</span>
                    </div>
                    {log.ipAddress && (
                      <p className="text-xs text-muted-foreground mt-1">
                        IP: {log.ipAddress}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {page * limit + 1}-{Math.min((page + 1) * limit, data?.total ?? 0)} of {data?.total ?? 0}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-2 border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-2 border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
