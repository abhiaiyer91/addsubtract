/**
 * Sandbox Routes
 * 
 * REST endpoints and WebSocket PTY for sandbox management.
 * 
 * Features:
 * - Sandbox pooling for reuse across requests (reduces cold starts)
 * - Automatic idle timeout and cleanup
 * - Per-provider sandbox management
 * - WebSocket PTY for interactive terminal sessions
 */

import { Hono } from 'hono';
import type { WSContext } from 'hono/ws';
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
              // Vercel SDK expects executable and args separately
              // Wrap in shell to support full command strings from terminal UI
              const fullCmd = cmdArgs && cmdArgs.length > 0 ? `${cmd} ${cmdArgs.join(' ')}` : cmd;
              
              console.log('[Vercel Sandbox Pool] Executing command:', {
                originalCmd: cmd,
                originalArgs: cmdArgs,
                fullCmd,
              });
              
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const result = await instance.runCommand('/bin/sh', ['-c', fullCmd]) as any;
              // output() method gets stdout/stderr as strings
              const [stdoutStr, stderrStr] = await Promise.all([
                result.output('stdout'),
                result.output('stderr'),
              ]);
              
              console.log('[Vercel Sandbox Pool] Command result:', {
                exitCode: result.exitCode,
                stdoutLength: stdoutStr?.length ?? 0,
                stderrLength: stderrStr?.length ?? 0,
              });
              
              return {
                exitCode: result.exitCode as number,
                stdout: stdoutStr as string,
                stderr: stderrStr as string,
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
 * WebSocket PTY message types
 */
interface WsInitMessage {
  type: 'init';
  cols: number;
  rows: number;
  branch?: string;
}

interface WsInputMessage {
  type: 'input';
  data: string;
}

interface WsResizeMessage {
  type: 'resize';
  cols: number;
  rows: number;
}

type WsClientMessage = WsInitMessage | WsInputMessage | WsResizeMessage;

/**
 * Active PTY session tracking
 */
interface PtySession {
  sandboxId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sandbox: any;
  provider: SandboxProvider;
  cleanup: () => Promise<void>;
}

const ptySessions = new Map<string, PtySession>();

/**
 * Create sandbox WebSocket routes for interactive PTY terminal
 */
export function createSandboxWsRoutes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upgradeWebSocket: any
) {
  const app = new Hono();

  // WebSocket endpoint for interactive PTY terminal
  app.get(
    '/ws/:repoId',
    upgradeWebSocket(async (c: { req: { param: (name: string) => string; raw: Request } }) => {
      const repoId = c.req.param('repoId');
      let session: PtySession | null = null;
      let authenticated = false;
      let userId: string | null = null;

      return {
        async onOpen(_event: Event, ws: WSContext) {
          try {
            // Authenticate via cookie/session
            const auth = createAuth();
            const authSession = await auth.api.getSession({
              headers: c.req.raw.headers,
            });

            if (!authSession?.user?.id) {
              ws.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
              ws.close(1008, 'Authentication required');
              return;
            }

            authenticated = true;
            userId = authSession.user.id;

            // Check sandbox is ready
            const status = await sandboxConfigModel.getStatus(repoId);
            if (!status.ready) {
              ws.send(JSON.stringify({ 
                type: 'error', 
                message: status.configured 
                  ? 'Sandbox is not enabled or API key is missing' 
                  : 'Sandbox is not configured for this repository'
              }));
              ws.close(1008, 'Sandbox not ready');
              return;
            }

            ws.send(JSON.stringify({ type: 'ready' }));
          } catch (error) {
            console.error('[sandbox-ws] onOpen error:', error);
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: error instanceof Error ? error.message : 'Connection failed' 
            }));
            ws.close(1011, 'Internal error');
          }
        },

        async onMessage(event: MessageEvent, ws: WSContext) {
          if (!authenticated || !userId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
            return;
          }

          try {
            const msg = JSON.parse(event.data as string) as WsClientMessage;

            switch (msg.type) {
              case 'init': {
                // Initialize PTY session
                const config = await sandboxConfigModel.getConfig(repoId);
                if (!config) {
                  ws.send(JSON.stringify({ type: 'error', message: 'Sandbox not configured' }));
                  return;
                }

                let apiKey: string | undefined;
                if (config.provider !== 'docker') {
                  apiKey = await sandboxKeyModel.getDecryptedKey(repoId, config.provider) ?? undefined;
                  if (!apiKey) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Sandbox API key not found' }));
                    return;
                  }
                }

                // Create PTY session based on provider
                session = await createPtySession(
                  config.provider,
                  {
                    apiKey,
                    config,
                    repoId,
                    userId,
                    cols: msg.cols || 120,
                    rows: msg.rows || 30,
                  },
                  (data: string) => {
                    // Send output to client
                    ws.send(JSON.stringify({ type: 'data', data }));
                  },
                  (code: number) => {
                    // Process exited
                    ws.send(JSON.stringify({ type: 'exit', code }));
                  }
                );

                if (session) {
                  ptySessions.set(`${repoId}:${userId}`, session);
                  ws.send(JSON.stringify({ type: 'session', sessionId: session.sandboxId }));
                }
                break;
              }

              case 'input': {
                if (session) {
                  await sendPtyInput(session, msg.data);
                }
                break;
              }

              case 'resize': {
                if (session) {
                  await resizePty(session, msg.cols, msg.rows);
                }
                break;
              }
            }
          } catch (error) {
            console.error('[sandbox-ws] onMessage error:', error);
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: error instanceof Error ? error.message : 'Message handling failed' 
            }));
          }
        },

        async onClose() {
          if (session && userId) {
            ptySessions.delete(`${repoId}:${userId}`);
            try {
              await session.cleanup();
            } catch (error) {
              console.error('[sandbox-ws] cleanup error:', error);
            }
          }
        },

        onError(event: Event) {
          console.error('[sandbox-ws] WebSocket error:', event);
        },
      };
    })
  );

  return app;
}

/**
 * Create a PTY session for the given provider
 */
async function createPtySession(
  provider: SandboxProvider,
  options: {
    apiKey?: string;
    config: NonNullable<Awaited<ReturnType<typeof sandboxConfigModel.getConfig>>>;
    repoId: string;
    userId: string;
    cols: number;
    rows: number;
  },
  onData: (data: string) => void,
  onExit: (code: number) => void
): Promise<PtySession | null> {
  const { apiKey, config, cols, rows } = options;

  switch (provider) {
    case 'vercel': {
      try {
        const { Sandbox } = await import('@vercel/sandbox');

        const vercelProjectId = config.vercelProjectId;
        const vercelTeamId = config.vercelTeamId;
        if (!vercelProjectId || !vercelTeamId || !apiKey) {
          throw new Error('Vercel configuration incomplete');
        }

        const VERCEL_MAX_TIMEOUT_MS = 2700000;
        const requestedTimeout = config.timeoutMinutes * 60 * 1000;
        const sandboxTimeout = Math.min(requestedTimeout, VERCEL_MAX_TIMEOUT_MS);

        const sandbox = await Sandbox.create({
          projectId: vercelProjectId,
          teamId: vercelTeamId,
          token: apiKey,
          timeout: sandboxTimeout,
          runtime: (config.vercelRuntime as 'node22' | 'python3.13') || 'node22',
        });

        // Start an interactive shell
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const shell = await (sandbox as any).shells.create();
        
        // Set up output streaming
        shell.onOutput((data: string) => {
          onData(data);
        });

        // Handle shell exit
        shell.onExit((code: number) => {
          onExit(code);
        });

        // Resize terminal
        await shell.resize({ cols, rows });

        return {
          sandboxId: sandbox.sandboxId,
          sandbox: { sandbox, shell },
          provider: 'vercel',
          cleanup: async () => {
            await shell.kill();
            await sandbox.stop();
          },
        };
      } catch (error) {
        console.error('[vercel-pty] Failed to create PTY session:', error);
        // Fall back to shell command execution
        return createFallbackPtySession(provider, options, onData, onExit);
      }
    }

    case 'e2b': {
      try {
        const { Sandbox } = await import('@e2b/code-interpreter');

        const sandbox = await Sandbox.create({
          apiKey,
          timeoutMs: config.timeoutMinutes * 60 * 1000,
        });

        // E2B supports interactive terminals via commands API
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sbx = sandbox as any;
        
        // Try to use terminal API if available, otherwise fall back
        if (sbx.terminal?.start) {
          const terminal = await sbx.terminal.start({
            cols,
            rows,
            onData: (data: Uint8Array | string) => {
              if (typeof data === 'string') {
                onData(data);
              } else {
                onData(new TextDecoder().decode(data));
              }
            },
            onExit: () => {
              onExit(0);
            },
          });

          return {
            sandboxId: sandbox.sandboxId,
            sandbox: { sandbox, terminal },
            provider: 'e2b',
            cleanup: async () => {
              terminal.kill?.();
              await sandbox.kill();
            },
          };
        } else {
          // Fall back to command execution mode
          return createFallbackPtySession(provider, options, onData, onExit);
        }
      } catch (error) {
        console.error('[e2b-pty] Failed to create PTY session:', error);
        return createFallbackPtySession(provider, options, onData, onExit);
      }
    }

    case 'daytona': {
      try {
        const { Daytona } = await import('@daytonaio/sdk');
        const daytona = new Daytona({ apiKey });

        const sandbox = await daytona.create({
          language: config.defaultLanguage as 'typescript' | 'javascript' | 'python',
          autoStopInterval: config.daytonaAutoStop,
        });

        // Daytona supports PTY
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sbx = sandbox as any;
        const pty = await sbx.process.createPty({
          id: `pty_${Date.now()}`,
          cols,
          rows,
          onData: (data: string | Uint8Array) => {
            if (typeof data === 'string') {
              onData(data);
            } else {
              onData(new TextDecoder().decode(data));
            }
          },
        });

        await pty.waitForConnection();

        return {
          sandboxId: sbx.id,
          sandbox: { sandbox, pty },
          provider: 'daytona',
          cleanup: async () => {
            await sbx.delete();
          },
        };
      } catch (error) {
        console.error('[daytona-pty] Failed to create PTY session:', error);
        return createFallbackPtySession(provider, options, onData, onExit);
      }
    }

    case 'docker': {
      return createDockerPtySession(options, onData, onExit);
    }

    default:
      return null;
  }
}

/**
 * Create a Docker-based PTY session using docker exec -it
 */
async function createDockerPtySession(
  options: {
    config: NonNullable<Awaited<ReturnType<typeof sandboxConfigModel.getConfig>>>;
    repoId: string;
    userId: string;
    cols: number;
    rows: number;
  },
  onData: (data: string) => void,
  onExit: (code: number) => void
): Promise<PtySession | null> {
  const { spawn, execSync } = await import('child_process');
  const { config, cols, rows } = options;

  // Check if Docker is available
  try {
    execSync('docker version', { stdio: 'ignore', timeout: 5000 });
  } catch {
    return null;
  }

  // Start a container with an interactive shell
  const containerName = `wit-sandbox-${options.repoId.slice(0, 8)}-${Date.now()}`;
  
  const dockerArgs = [
    'run',
    '-it',
    '--rm',
    '--name', containerName,
    '-w', '/workspace',
    '--network', config.networkMode === 'none' ? 'none' : 'bridge',
    '--memory', `${config.memoryMB}m`,
    '--cpus', `${config.cpuCores}`,
    '--security-opt', 'no-new-privileges',
    '-e', `TERM=xterm-256color`,
    '-e', `COLUMNS=${cols}`,
    '-e', `LINES=${rows}`,
    config.dockerImage,
    '/bin/sh',
  ];

  const child = spawn('docker', dockerArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (data: Buffer) => {
    onData(data.toString());
  });

  child.stderr?.on('data', (data: Buffer) => {
    onData(data.toString());
  });

  child.on('exit', (code) => {
    onExit(code ?? 0);
  });

  return {
    sandboxId: containerName,
    sandbox: { child, containerName },
    provider: 'docker',
    cleanup: async () => {
      child.kill();
      // Try to stop container if still running
      try {
        execSync(`docker stop ${containerName}`, { stdio: 'ignore', timeout: 5000 });
      } catch {
        // Ignore - container may already be stopped
      }
    },
  };
}

/**
 * Fallback PTY session state container
 * Using an object to ensure state is shared by reference, not copied
 */
interface FallbackPtyState {
  inputBuffer: string;
  poolKey: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pool: any;
  onData: (data: string) => void;
  provider: SandboxProvider;
  options: {
    apiKey?: string;
    config: NonNullable<Awaited<ReturnType<typeof sandboxConfigModel.getConfig>>>;
    repoId: string;
    userId: string;
    cols: number;
    rows: number;
  };
}

/**
 * Fallback PTY session using command execution
 * For providers that don't support native PTY
 */
async function createFallbackPtySession(
  provider: SandboxProvider,
  options: {
    apiKey?: string;
    config: NonNullable<Awaited<ReturnType<typeof sandboxConfigModel.getConfig>>>;
    repoId: string;
    userId: string;
    cols: number;
    rows: number;
  },
  onData: (data: string) => void,
  _onExit: (code: number) => void
): Promise<PtySession | null> {
  // Create a simple command-based session
  // This doesn't support full PTY but allows basic command execution
  onData('\x1b[33mNote: This provider has limited terminal support.\x1b[0m\r\n');
  onData('\x1b[33mTUI applications may not work correctly.\x1b[0m\r\n\r\n');
  onData('$ ');

  const pool = getSandboxPool();
  const poolKey = `${provider}:${options.repoId}:${options.userId}`;
  
  // Use an object to ensure state is shared by reference
  const state: FallbackPtyState = {
    inputBuffer: '',
    poolKey,
    pool,
    onData,
    provider,
    options,
  };

  return {
    sandboxId: `fallback-${Date.now()}`,
    sandbox: state,
    provider,
    cleanup: async () => {
      // Nothing to clean up for fallback
    },
  };
}

/**
 * Check if this is a fallback PTY session (no native PTY support)
 */
function isFallbackSession(session: PtySession): boolean {
  // Fallback sessions have specific properties in their sandbox object
  return 'inputBuffer' in session.sandbox && 'onData' in session.sandbox;
}

/**
 * Send input to PTY session
 */
async function sendPtyInput(session: PtySession, data: string): Promise<void> {
  // Handle fallback mode first - this applies to any provider that fell back
  if (isFallbackSession(session)) {
    const state = session.sandbox as FallbackPtyState;
    
    // Handle special characters
    for (const char of data) {
      // Check for Enter key (carriage return or newline)
      if (char === '\r' || char === '\n') {
        const command = state.inputBuffer.trim();
        state.inputBuffer = '';
        state.onData('\r\n');
        
        if (command) {
          try {
            const result = await executeCommand(state.provider, {
              apiKey: state.options.apiKey,
              command,
              args: [],
              timeout: 60000,
              cwd: '/workspace',
              config: state.options.config,
              repoId: state.options.repoId,
              userId: state.options.userId,
            });
            
            if (result.stdout) {
              state.onData(result.stdout.replace(/\n/g, '\r\n'));
            }
            if (result.stderr) {
              state.onData(`\x1b[31m${result.stderr.replace(/\n/g, '\r\n')}\x1b[0m`);
            }
            if (result.error) {
              state.onData(`\x1b[31mError: ${result.error}\x1b[0m\r\n`);
            }
          } catch (error) {
            state.onData(`\x1b[31mError: ${error instanceof Error ? error.message : 'Command failed'}\x1b[0m\r\n`);
          }
        }
        state.onData('$ ');
      }
      // Handle backspace (DEL character \x7f or backspace \x08)
      else if (char === '\x7f' || char === '\x08') {
        if (state.inputBuffer.length > 0) {
          state.inputBuffer = state.inputBuffer.slice(0, -1);
          // Send backspace sequence: move cursor back, write space, move cursor back
          state.onData('\b \b');
        }
      }
      // Handle Ctrl+C
      else if (char === '\x03') {
        state.inputBuffer = '';
        state.onData('^C\r\n$ ');
      }
      // Handle Ctrl+U (clear line)
      else if (char === '\x15') {
        // Clear the entire line visually
        const clearCount = state.inputBuffer.length;
        state.inputBuffer = '';
        state.onData('\r$ ' + ' '.repeat(clearCount) + '\r$ ');
      }
      // Regular character
      else {
        state.inputBuffer += char;
        // Echo the character
        state.onData(char);
      }
    }
    return;
  }

  // Native PTY mode for each provider
  switch (session.provider) {
    case 'vercel': {
      const { shell } = session.sandbox;
      await shell.write(data);
      break;
    }

    case 'e2b': {
      const { terminal } = session.sandbox;
      terminal.sendData(data);
      break;
    }

    case 'daytona': {
      const { pty } = session.sandbox;
      await pty.sendInput(data);
      break;
    }

    case 'docker': {
      const { child } = session.sandbox;
      child.stdin?.write(data);
      break;
    }
  }
}

/**
 * Resize PTY session
 */
async function resizePty(session: PtySession, cols: number, rows: number): Promise<void> {
  // Fallback sessions don't support resize
  if (isFallbackSession(session)) {
    return;
  }

  switch (session.provider) {
    case 'vercel': {
      const { shell } = session.sandbox;
      await shell.resize({ cols, rows });
      break;
    }

    case 'e2b': {
      const { terminal } = session.sandbox;
      terminal.resize(cols, rows);
      break;
    }

    case 'daytona': {
      const { pty } = session.sandbox;
      await pty.resize(cols, rows);
      break;
    }

    case 'docker': {
      // Docker resize requires docker exec with stty
      // For simplicity, we skip resize for Docker PTY
      break;
    }
  }
}
