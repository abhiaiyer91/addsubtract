/**
 * Sandbox Routes
 * 
 * REST endpoints for sandbox management.
 * WebSocket support requires @hono/node-ws adapter.
 * 
 * Features:
 * - Sandbox pooling for reuse across requests (reduces cold starts)
 * - Automatic idle timeout and cleanup
 * - Per-provider sandbox management
 * 
 * For interactive terminals:
 * 1. Install: npm install @hono/node-ws
 * 2. Update server to use createNodeWebSocket
 * 3. Use upgradeWebSocket from @hono/node-ws
 */

import { Hono } from 'hono';
import {
  sandboxConfigModel,
  sandboxKeyModel,
  sandboxSessionModel,
  type SandboxProvider,
} from '../../db/models/sandbox';
import { repoModel } from '../../db/models';
import { createAuth } from '../../lib/auth';
import { getSandboxPool, type PooledSandbox } from '../sandbox/pool';

/**
 * Create sandbox REST routes
 */
export function createSandboxRoutes() {
  const app = new Hono();

  // Get sandbox status for a repository
  app.get('/:repoId/status', async (c) => {
    const repoId = c.req.param('repoId');
    
    try {
      const status = await sandboxConfigModel.getStatus(repoId);
      return c.json(status);
    } catch (error) {
      return c.json({ error: 'Failed to get status' }, 500);
    }
  });

  // Execute a command in a sandbox (non-interactive)
  app.post('/:repoId/exec', async (c) => {
    const repoId = c.req.param('repoId');
    
    // Authenticate
    const auth = createAuth();
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user?.id) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const userId = session.user.id;

    // Check sandbox is ready
    const status = await sandboxConfigModel.getStatus(repoId);
    if (!status.ready) {
      return c.json({ 
        error: status.configured 
          ? 'Sandbox is not enabled or API key is missing' 
          : 'Sandbox is not configured for this repository'
      }, 400);
    }

    // Get request body
    const body = await c.req.json<{
      command: string;
      args?: string[];
      timeout?: number;
      cwd?: string;
    }>();

    if (!body.command) {
      return c.json({ error: 'Command is required' }, 400);
    }

    try {
      // Get config and API key
      const config = await sandboxConfigModel.getConfig(repoId);
      if (!config) {
        return c.json({ error: 'Sandbox not configured' }, 400);
      }

      let apiKey: string | undefined;
      if (config.provider !== 'docker') {
        apiKey = await sandboxKeyModel.getDecryptedKey(repoId, config.provider) ?? undefined;
        if (!apiKey) {
          return c.json({ error: 'Sandbox API key not found' }, 400);
        }
      }

      // Execute command based on provider (with sandbox pooling)
      const result = await executeCommand(config.provider, {
        apiKey,
        command: body.command,
        args: body.args || [],
        timeout: body.timeout || 60000,
        cwd: body.cwd || '/workspace',
        config,
        repoId,
        userId,
      });

      return c.json(result);
    } catch (error) {
      console.error('Sandbox exec error:', error);
      return c.json({ 
        error: error instanceof Error ? error.message : 'Execution failed',
        success: false,
      }, 500);
    }
  });

  // List active sandbox sessions for a repository
  app.get('/:repoId/sessions', async (c) => {
    const repoId = c.req.param('repoId');
    
    // Authenticate
    const auth = createAuth();
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user?.id) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    try {
      const sessions = await sandboxSessionModel.getActiveSessions(repoId);
      return c.json({ sessions });
    } catch (error) {
      return c.json({ error: 'Failed to list sessions' }, 500);
    }
  });

  // Get sandbox pool statistics
  app.get('/pool/stats', async (c) => {
    const auth = createAuth();
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user?.id) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const pool = getSandboxPool();
    return c.json(pool.getStats());
  });

  // Clear sandbox pool for a repository (force new sandbox on next request)
  app.delete('/:repoId/pool', async (c) => {
    const repoId = c.req.param('repoId');
    
    const auth = createAuth();
    const session = await auth.api.getSession({
      headers: c.req.raw.headers,
    });

    if (!session?.user?.id) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const userId = session.user.id;
    const pool = getSandboxPool();
    const stats = pool.getStats();
    
    // Find and remove all sandboxes for this repo/user combination
    let removed = 0;
    for (const key of stats.keys) {
      if (key.includes(repoId) && key.includes(userId)) {
        const sandbox = pool.get(key);
        if (sandbox) {
          await pool.remove(key, sandbox.id);
          removed++;
        }
      }
    }

    return c.json({ 
      success: true, 
      removed,
      message: removed > 0 
        ? `Removed ${removed} pooled sandbox(es)` 
        : 'No pooled sandboxes found for this repository'
    });
  });

  return app;
}

/**
 * Execute a command in the sandbox (with pooling)
 * 
 * Sandboxes are pooled and reused across requests to reduce cold start latency.
 * After execution, the sandbox is released back to the pool for reuse.
 */
async function executeCommand(
  provider: SandboxProvider,
  options: {
    apiKey?: string;
    command: string;
    args: string[];
    timeout: number;
    cwd: string;
    config: NonNullable<Awaited<ReturnType<typeof sandboxConfigModel.getConfig>>>;
    repoId: string;
    userId: string;
  }
): Promise<{
  success: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
  pooled?: boolean;
}> {
  const { apiKey, command, args, timeout, cwd, config, repoId, userId } = options;
  const fullCommand = [command, ...args].join(' ');
  const pool = getSandboxPool();
  const poolKey = `${provider}:${repoId}:${userId}`;

  switch (provider) {
    case 'e2b': {
      try {
        const { Sandbox } = await import('@e2b/code-interpreter');
        
        // Try to get from pool or create new
        const sandbox = await pool.acquire<PooledSandbox>(poolKey, async () => {
          const instance = await Sandbox.create({
            apiKey,
            timeoutMs: config.timeoutMinutes * 60 * 1000,
          });
          
          return {
            id: instance.sandboxId,
            provider: 'e2b',
            instance,
            createdAt: new Date(),
            lastUsedAt: new Date(),
            useCount: 0,
            stop: () => instance.kill(),
            runCommand: async (cmd: string, cmdArgs?: string[], opts?: { signal?: AbortSignal }) => {
              const fullCmd = cmdArgs ? [cmd, ...cmdArgs].join(' ') : cmd;
              const result = await instance.commands.run(fullCmd, {
                cwd,
                timeoutMs: opts?.signal ? timeout : undefined,
              });
              return {
                exitCode: result.exitCode,
                stdout: result.stdout,
                stderr: result.stderr,
              };
            },
          };
        });

        try {
          const result = await sandbox.runCommand(command, args, {
            signal: AbortSignal.timeout(timeout),
          });

          // Release back to pool for reuse
          pool.release(poolKey, sandbox);

          return {
            success: result.exitCode === 0,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            pooled: sandbox.useCount > 1,
          };
        } catch (error) {
          // On error, remove from pool (sandbox may be in bad state)
          await pool.remove(poolKey, sandbox.id);
          throw error;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
          return {
            success: false,
            error: 'E2B SDK not installed. Install with: npm install @e2b/code-interpreter',
          };
        }
        throw error;
      }
    }

    case 'daytona': {
      try {
        const { Daytona } = await import('@daytonaio/sdk');
        const daytona = new Daytona({ apiKey });
        
        const sandbox = await pool.acquire<PooledSandbox>(poolKey, async () => {
          const instance = await daytona.create({
            language: config.defaultLanguage as 'typescript' | 'javascript' | 'python',
            autoStopInterval: config.daytonaAutoStop,
          });
          
          return {
            id: instance.id,
            provider: 'daytona',
            instance,
            createdAt: new Date(),
            lastUsedAt: new Date(),
            useCount: 0,
            stop: () => instance.delete(),
            runCommand: async (cmd: string, cmdArgs?: string[], opts?: { signal?: AbortSignal }) => {
              const fullCmd = cmdArgs ? [cmd, ...cmdArgs].join(' ') : cmd;
              const result = await instance.process.commandRun(fullCmd, {
                cwd,
                timeout,
              });
              return {
                exitCode: result.exitCode,
                stdout: result.stdout,
                stderr: result.stderr,
              };
            },
          };
        });

        try {
          const result = await sandbox.runCommand(command, args, {
            signal: AbortSignal.timeout(timeout),
          });

          pool.release(poolKey, sandbox);

          return {
            success: result.exitCode === 0,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            pooled: sandbox.useCount > 1,
          };
        } catch (error) {
          await pool.remove(poolKey, sandbox.id);
          throw error;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
          return {
            success: false,
            error: 'Daytona SDK not installed. Install with: npm install @daytonaio/sdk',
          };
        }
        throw error;
      }
    }

    case 'docker': {
      // Docker containers are ephemeral by design (--rm flag)
      // Pooling doesn't apply here - each command runs in a fresh container
      const { spawn, execSync } = await import('child_process');
      
      // Check if Docker is available
      try {
        execSync('docker version', { stdio: 'ignore', timeout: 5000 });
      } catch {
        return {
          success: false,
          error: 'Docker is not available. Either Docker is not installed, not running, or the Docker socket is not accessible. Consider using E2B or Daytona provider instead.',
        };
      }
      
      return new Promise((resolve) => {
        const dockerArgs = [
          'run',
          '--rm',
          '-w', cwd,
          '--network', config.networkMode === 'none' ? 'none' : 'bridge',
          '--memory', `${config.memoryMB}m`,
          '--cpus', `${config.cpuCores}`,
          '--security-opt', 'no-new-privileges',
          config.dockerImage,
          'sh', '-c', fullCommand,
        ];

        let stdout = '';
        let stderr = '';

        const child = spawn('docker', dockerArgs, { shell: false });

        const timer = setTimeout(() => {
          child.kill('SIGTERM');
          resolve({
            success: false,
            error: 'Command timed out',
          });
        }, timeout);

        child.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        child.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        child.on('error', (err) => {
          clearTimeout(timer);
          let errorMsg = err.message;
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            errorMsg = 'Docker CLI not found. Install Docker or use E2B/Daytona provider.';
          } else if ((err as NodeJS.ErrnoException).code === 'EACCES') {
            errorMsg = 'Permission denied accessing Docker. Check Docker socket permissions.';
          }
          resolve({
            success: false,
            error: errorMsg,
          });
        });

        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({
            success: code === 0,
            exitCode: code ?? undefined,
            stdout: stdout || undefined,
            stderr: stderr || undefined,
            pooled: false,
          });
        });
      });
    }

    case 'vercel': {
      try {
        const { Sandbox } = await import('@vercel/sandbox');

        const vercelProjectId = config.vercelProjectId;
        const vercelTeamId = config.vercelTeamId;
        if (!vercelProjectId) {
          return {
            success: false,
            error: 'Vercel Project ID is not configured',
          };
        }
        if (!vercelTeamId) {
          return {
            success: false,
            error: 'Vercel Team ID is not configured. This is required when using a personal access token.',
          };
        }
        if (!apiKey) {
          return {
            success: false,
            error: 'Vercel access token is not configured',
          };
        }

        // Vercel sandbox max timeout is 2,700,000 ms (45 minutes)
        const VERCEL_MAX_TIMEOUT_MS = 2700000;
        const requestedTimeout = config.timeoutMinutes * 60 * 1000;
        const sandboxTimeout = Math.min(requestedTimeout, VERCEL_MAX_TIMEOUT_MS);

        const sandbox = await pool.acquire<PooledSandbox>(poolKey, async () => {
          console.log('[Vercel Sandbox] Creating new pooled sandbox:', {
            projectId: vercelProjectId,
            teamId: vercelTeamId,
            timeout: sandboxTimeout,
            runtime: config.vercelRuntime || 'node22',
          });

          const instance = await Sandbox.create({
            projectId: vercelProjectId,
            teamId: vercelTeamId,
            token: apiKey,
            timeout: sandboxTimeout,
            runtime: (config.vercelRuntime as 'node22' | 'python3.13') || 'node22',
          });
          
          return {
            id: instance.sandboxId,
            provider: 'vercel',
            instance,
            createdAt: new Date(),
            lastUsedAt: new Date(),
            useCount: 0,
            stop: () => instance.stop(),
            runCommand: async (cmd: string, cmdArgs?: string[], _opts?: { signal?: AbortSignal }) => {
              // Vercel SDK expects an object with cmd/args, not positional arguments
              const result = await instance.runCommand({
                cmd,
                args: cmdArgs || [],
              });
              return {
                exitCode: result.exitCode,
                stdout: result.stdout,
                stderr: result.stderr,
              };
            },
          };
        });

        try {
          const result = await sandbox.runCommand(command, args, {
            signal: AbortSignal.timeout(timeout),
          });

          // Release back to pool for reuse
          pool.release(poolKey, sandbox);

          console.log('[Vercel Sandbox] Command completed, sandbox released to pool:', {
            sandboxId: sandbox.id,
            useCount: sandbox.useCount,
            pooled: sandbox.useCount > 1,
          });

          return {
            success: result.exitCode === 0,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            pooled: sandbox.useCount > 1,
          };
        } catch (error) {
          // On error, remove from pool
          console.error('[Vercel Sandbox] Command failed, removing from pool:', error);
          await pool.remove(poolKey, sandbox.id);
          throw error;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
          return {
            success: false,
            error: 'Vercel Sandbox SDK not installed. Install with: npm install @vercel/sandbox',
          };
        }
        throw error;
      }
    }

    default: {
      return {
        success: false,
        error: `Unknown sandbox provider: ${provider}`,
      };
    }
  }
}

/**
 * WebSocket support instructions:
 * 
 * To enable interactive terminal support:
 * 
 * 1. Install the WebSocket adapter:
 *    npm install @hono/node-ws
 * 
 * 2. Update server/index.ts:
 *    import { createNodeWebSocket } from '@hono/node-ws';
 *    
 *    const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
 *    
 *    // Pass upgradeWebSocket to createSandboxRoutes
 *    const sandboxRoutes = createSandboxRoutes({ upgradeWebSocket });
 *    app.route('/api/sandbox', sandboxRoutes);
 * 
 * 3. Add WebSocket endpoint in this file:
 *    app.get('/:repoId/ws', upgradeWebSocket((c) => ({
 *      onOpen(event, ws) { ... },
 *      onMessage(event, ws) { ... },
 *      onClose() { ... },
 *    })));
 */
