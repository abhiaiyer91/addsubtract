import { useState } from 'react';
import { trpc } from '../lib/trpc';
import { formatDate, formatNumber } from '../lib/utils';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Lock,
  Globe,
  Star,
  GitFork,
} from 'lucide-react';

export function RepositoriesPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [privateFilter, setPrivateFilter] = useState<boolean | undefined>();
  const limit = 20;

  const { data, isLoading } = trpc.admin.listRepositories.useQuery({
    limit,
    offset: page * limit,
    search: search || undefined,
    isPrivate: privateFilter,
  });

  const totalPages = Math.ceil((data?.total ?? 0) / limit);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Repositories</h1>
          <p className="text-muted-foreground">
            View and manage all repositories
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          {data?.total ?? 0} total repositories
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search repositories..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="w-full pl-10 pr-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <select
          value={privateFilter === undefined ? '' : privateFilter.toString()}
          onChange={(e) => {
            setPrivateFilter(e.target.value === '' ? undefined : e.target.value === 'true');
            setPage(0);
          }}
          className="px-4 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All Visibility</option>
          <option value="false">Public</option>
          <option value="true">Private</option>
        </select>
      </div>

      {/* Repositories Table */}
      <div className="bg-card rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Repository</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Visibility</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Stars</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Forks</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Issues</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">PRs</th>
              <th className="text-left px-6 py-3 text-sm font-medium text-muted-foreground">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              [...Array(10)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-6 py-4">
                    <div className="h-5 bg-muted rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : data?.repos.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                  No repositories found
                </td>
              </tr>
            ) : (
              data?.repos.map((repo) => (
                <tr key={repo.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-medium">{repo.name}</p>
                      <p className="text-sm text-muted-foreground truncate max-w-md">
                        {repo.description || 'No description'}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {repo.isPrivate ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500">
                        <Lock className="h-3 w-3" />
                        Private
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-500">
                        <Globe className="h-3 w-3" />
                        Public
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-sm">
                      <Star className="h-4 w-4 text-amber-500" />
                      {formatNumber(repo.starsCount)}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-sm">
                      <GitFork className="h-4 w-4 text-muted-foreground" />
                      {formatNumber(repo.forksCount)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">{repo.openIssuesCount}</td>
                  <td className="px-6 py-4 text-sm">{repo.openPrsCount}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {formatDate(repo.createdAt)}
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
