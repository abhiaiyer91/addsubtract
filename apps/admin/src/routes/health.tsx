import { trpc } from '../lib/trpc';
import { formatBytes, formatDuration } from '../lib/utils';
import {
  Database,
  Server,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Cpu,
  HardDrive,
} from 'lucide-react';

export function HealthPage() {
  const { data: health, isLoading, refetch } = trpc.admin.getHealth.useQuery(undefined, {
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-48 bg-muted rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const isHealthy = health?.database.ok;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">System Health</h1>
          <p className="text-muted-foreground">
            Real-time system monitoring
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
            isHealthy
              ? 'bg-green-500/10 text-green-500'
              : 'bg-destructive/10 text-destructive'
          }`}>
            {isHealthy ? (
              <>
                <CheckCircle className="h-5 w-5" />
                All Systems Operational
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5" />
                Issues Detected
              </>
            )}
          </span>
          <button
            onClick={() => refetch()}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <Activity className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Database Status */}
        <div className="bg-card rounded-lg border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className={`p-2 rounded-lg ${
              health?.database.ok ? 'bg-green-500/10' : 'bg-destructive/10'
            }`}>
              <Database className={`h-5 w-5 ${
                health?.database.ok ? 'text-green-500' : 'text-destructive'
              }`} />
            </div>
            <div>
              <h3 className="font-semibold">Database</h3>
              <p className="text-sm text-muted-foreground">PostgreSQL</p>
            </div>
            <span className={`ml-auto px-2 py-1 rounded-full text-xs font-medium ${
              health?.database.ok
                ? 'bg-green-500/10 text-green-500'
                : 'bg-destructive/10 text-destructive'
            }`}>
              {health?.database.ok ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Latency</span>
              <span className="font-medium">{health?.database.latency ?? 0}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pool Size</span>
              <span className="font-medium">{health?.database.poolSize ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Idle Connections</span>
              <span className="font-medium">{health?.database.idleConnections ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Waiting Connections</span>
              <span className="font-medium">{health?.database.waitingConnections ?? 0}</span>
            </div>
          </div>
        </div>

        {/* Server Status */}
        <div className="bg-card rounded-lg border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Server className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h3 className="font-semibold">Server</h3>
              <p className="text-sm text-muted-foreground">Node.js {health?.server.nodeVersion}</p>
            </div>
            <span className="ml-auto px-2 py-1 rounded-full text-xs font-medium bg-green-500/10 text-green-500">
              Running
            </span>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Uptime
              </span>
              <span className="font-medium">{formatDuration(health?.server.uptime ?? 0)}</span>
            </div>
          </div>
        </div>

        {/* Memory Usage */}
        <div className="bg-card rounded-lg border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Cpu className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <h3 className="font-semibold">Memory</h3>
              <p className="text-sm text-muted-foreground">Node.js Process</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Heap Used</span>
              <span className="font-medium">{formatBytes(health?.server.memory.heapUsed ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Heap Total</span>
              <span className="font-medium">{formatBytes(health?.server.memory.heapTotal ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">External</span>
              <span className="font-medium">{formatBytes(health?.server.memory.external ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">RSS</span>
              <span className="font-medium">{formatBytes(health?.server.memory.rss ?? 0)}</span>
            </div>
            {/* Memory usage bar */}
            <div className="pt-2">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all"
                  style={{
                    width: `${Math.round((health?.server.memory.heapUsed ?? 0) / (health?.server.memory.heapTotal || 1) * 100)}%`
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1 text-right">
                {Math.round((health?.server.memory.heapUsed ?? 0) / (health?.server.memory.heapTotal || 1) * 100)}% heap used
              </p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-card rounded-lg border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <HardDrive className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <h3 className="font-semibold">Quick Info</h3>
              <p className="text-sm text-muted-foreground">System details</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Node Version</span>
              <span className="font-mono text-sm">{health?.server.nodeVersion}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Process ID</span>
              <span className="font-mono text-sm">{typeof process !== 'undefined' ? process.pid : 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Environment</span>
              <span className="font-mono text-sm">{import.meta.env.MODE}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
