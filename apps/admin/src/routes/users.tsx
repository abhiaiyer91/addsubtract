import { useState } from 'react';
import { Link } from 'react-router-dom';
import { trpc } from '../lib/trpc';
import { formatDate, timeAgo } from '../lib/utils';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Shield,
  ShieldAlert,
  Ban,
  MoreHorizontal,
} from 'lucide-react';

export function UsersPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [roleFilter, setRoleFilter] = useState<'user' | 'admin' | 'superadmin' | undefined>();
  const [suspendedFilter, setSuspendedFilter] = useState<boolean | undefined>();
  const limit = 20;

  const { data, isLoading } = trpc.admin.listUsers.useQuery({
    limit,
    offset: page * limit,
    search: search || undefined,
    role: roleFilter,
    suspended: suspendedFilter,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground">
            Manage user accounts and permissions
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {data?.total ?? 0} total users
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, email, or username..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="w-full pl-10 pr-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <select
          value={roleFilter ?? ''}
          onChange={(e) => {
            setRoleFilter(e.target.value as any || undefined);
            setPage(0);
          }}
          className="px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All Roles</option>
          <option value="user">Users</option>
          <option value="admin">Admins</option>
          <option value="superadmin">Super Admins</option>
        </select>

        <select
          value={suspendedFilter === undefined ? '' : suspendedFilter.toString()}
          onChange={(e) => {
            setSuspendedFilter(e.target.value === '' ? undefined : e.target.value === 'true');
            setPage(0);
          }}
          className="px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All Status</option>
          <option value="false">Active</option>
          <option value="true">Suspended</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-card rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">User</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Role</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Status</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Repos</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">PRs</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Last Active</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Joined</th>
              <th className="w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              [...Array(10)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={8} className="px-6 py-4">
                    <div className="h-5 bg-muted rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : data?.users.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-muted-foreground">
                  No users found
                </td>
              </tr>
            ) : (
              data?.users.map((user) => (
                <tr key={user.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4">
                    <Link to={`/users/${user.id}`} className="flex items-center gap-3 hover:underline">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary">
                          {user.name?.charAt(0)?.toUpperCase() || user.email.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-6 py-4">
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
                  </td>
                  <td className="px-6 py-4">
                    {user.suspended ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
                        <Ban className="h-3 w-3" />
                        Suspended
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-500">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm">{user.repoCount}</td>
                  <td className="px-6 py-4 text-sm">{user.prCount}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {user.lastActive ? timeAgo(user.lastActive) : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      to={`/users/${user.id}`}
                      className="p-2 hover:bg-muted rounded-lg transition-colors"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
