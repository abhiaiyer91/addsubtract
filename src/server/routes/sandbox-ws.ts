/**
 * Sandbox Routes
 * 
 * REST endpoints for sandbox management.
 * WebSocket support requires @hono/node-ws adapter.
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

      // Execute command based on provider
      const result = await executeCommand(config.provider, {
        apiKey,
        command: body.command,
        args: body.args || [],
        timeout: body.timeout || 60000,
        cwd: body.cwd || '/workspace',
        config,
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

  return app;
}

/**
 * Execute a command in the sandbox
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
  }
): Promise<{
  success: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}> {
  const { apiKey, command, args, timeout, cwd, config } = options;
  const fullCommand = [command, ...args].join(' ');

  switch (provider) {
    case 'e2b': {
      try {
        const { Sandbox } = await import('@e2b/code-interpreter');
        const sandbox = await Sandbox.create({
          apiKey,
          timeoutMs: config.timeoutMinutes * 60 * 1000,
        });

        try {
          const result = await sandbox.commands.run(fullCommand, {
            cwd,
            timeoutMs: timeout,
          });

          return {
            success: result.exitCode === 0,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
          };
        } finally {
          await sandbox.kill();
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
        const sandbox = await daytona.create({
          language: config.defaultLanguage as 'typescript' | 'javascript' | 'python',
          autoStopInterval: config.daytonaAutoStop,
        });

        try {
          const result = await sandbox.process.commandRun(fullCommand, {
            cwd,
            timeout,
          });

          return {
            success: result.exitCode === 0,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
          };
        } finally {
          await sandbox.delete();
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
          // Provide helpful error message for common issues
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
          });
        });
      });
    }

    case 'vercel': {
      try {
        const { Sandbox } = await import('@vercel/sandbox');

        // Get Vercel project ID and team ID from config
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

        const sandbox = await Sandbox.create({
          projectId: vercelProjectId,
          teamId: vercelTeamId,
          accessToken: apiKey,
          timeout: config.timeoutMinutes * 60 * 1000,
          runtime: (config.vercelRuntime as 'node22' | 'python3.13') || 'node22',
        });

        try {
          const result = await sandbox.runCommand(command, args, {
            signal: AbortSignal.timeout(timeout),
          });

          return {
            success: result.exitCode === 0,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
          };
        } finally {
          await sandbox.stop();
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
