/**
 * Sandbox Settings Router
 *
 * Handles sandbox configuration for repositories.
 * Only repository owners can manage sandbox settings.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';
import {
  repoModel,
  sandboxConfigModel,
  sandboxKeyModel,
  sandboxSessionModel,
  isSandboxRepoOwner,
  type SandboxProvider,
} from '../../../db/models';

/**
 * Parse a command string into command and arguments
 * Handles quoted strings properly
 */
function parseCommand(cmd: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < cmd.length; i++) {
    const char = cmd[i];

    if (inQuote) {
      if (char === quoteChar) {
        inQuote = false;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = true;
      quoteChar = char;
    } else if (char === ' ') {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

// Schema definitions
const sandboxProviderSchema = z.enum(['e2b', 'daytona', 'docker', 'vercel']);
const networkModeSchema = z.enum(['none', 'restricted', 'full']);
const languageSchema = z.enum(['typescript', 'javascript', 'python']);
const vercelRuntimeSchema = z.enum(['node22', 'python3.13']);

// Sandbox settings input schema
const sandboxSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  provider: sandboxProviderSchema.optional(),
  networkMode: networkModeSchema.optional(),
  defaultLanguage: languageSchema.optional(),

  // Resource limits
  memoryMB: z.number().min(512).max(8192).optional(),
  cpuCores: z.number().min(1).max(4).optional(),
  timeoutMinutes: z.number().min(5).max(120).optional(),

  // E2B settings
  e2bTemplateId: z.string().optional(),

  // Daytona settings
  daytonaSnapshot: z.string().optional(),
  daytonaAutoStop: z.number().min(0).max(60).optional(),

  // Docker settings
  dockerImage: z.string().optional(),

  // Vercel settings
  vercelProjectId: z.string().optional(),
  vercelTeamId: z.string().optional(),
  vercelRuntime: vercelRuntimeSchema.optional(),
});

/**
 * Helper to get repo and verify ownership
 */
async function getRepoAndVerifyOwner(
  owner: string,
  repoName: string,
  userId: string
) {
  const result = await repoModel.findByPath(owner, repoName);

  if (!result) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Repository not found',
    });
  }

  const isOwner = result.repo.ownerId === userId;

  return { repo: result.repo, isOwner };
}

/**
 * Helper to verify repo owner by ID
 */
async function verifyRepoOwner(repoId: string, userId: string) {
  const repo = await repoModel.findById(repoId);

  if (!repo) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Repository not found',
    });
  }

  if (repo.ownerId !== userId) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the repository owner can manage sandbox settings',
    });
  }

  return repo;
}

export const sandboxRouter = router({
  /**
   * Get sandbox settings for a repository
   */
  getSettings: protectedProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const { repo, isOwner } = await getRepoAndVerifyOwner(
        input.owner,
        input.repo,
        ctx.user.id
      );

      // Get config from database
      const config = await sandboxConfigModel.getConfig(repo.id);

      // Non-owners get limited info
      if (!isOwner) {
        return {
          isOwner: false,
          repoId: repo.id,
          enabled: config?.enabled ?? false,
          provider: config?.provider ?? 'e2b',
        };
      }

      // Get API keys metadata
      const keys = await sandboxKeyModel.listKeys(repo.id);
      const currentProviderKey = keys.find((k) => k.provider === (config?.provider ?? 'e2b'));

      // Check Docker availability if Docker provider is selected/default
      let dockerAvailable: boolean | undefined;
      const provider = config?.provider ?? 'e2b';
      if (provider === 'docker') {
        try {
          const { execSync } = await import('child_process');
          execSync('docker version', { stdio: 'ignore', timeout: 5000 });
          dockerAvailable = true;
        } catch {
          dockerAvailable = false;
        }
      }

      // Return full settings for owners
      if (!config) {
        // Return defaults if no config exists
        return {
          isOwner: true,
          repoId: repo.id,
          enabled: false,
          provider: 'e2b' as const,
          hasApiKey: false,
          apiKeyHint: undefined,
          networkMode: 'none' as const,
          defaultLanguage: 'typescript' as const,
          memoryMB: 2048,
          cpuCores: 1,
          timeoutMinutes: 60,
          e2bTemplateId: undefined,
          daytonaSnapshot: undefined,
          daytonaAutoStop: 15,
          dockerImage: 'wit-sandbox:latest',
          vercelProjectId: undefined,
          vercelTeamId: undefined,
          vercelRuntime: 'node22' as const,
          dockerAvailable,
        };
      }

      return {
        isOwner: true,
        repoId: repo.id,
        enabled: config.enabled,
        provider: config.provider,
        hasApiKey: !!currentProviderKey,
        apiKeyHint: currentProviderKey?.keyHint,
        networkMode: config.networkMode,
        defaultLanguage: config.defaultLanguage,
        memoryMB: config.memoryMB,
        cpuCores: config.cpuCores,
        timeoutMinutes: config.timeoutMinutes,
        e2bTemplateId: config.e2bTemplateId ?? undefined,
        daytonaSnapshot: config.daytonaSnapshot ?? undefined,
        daytonaAutoStop: config.daytonaAutoStop,
        dockerImage: config.dockerImage,
        vercelProjectId: config.vercelProjectId ?? undefined,
        vercelTeamId: config.vercelTeamId ?? undefined,
        vercelRuntime: config.vercelRuntime ?? 'node22',
        dockerAvailable,
      };
    }),

  /**
   * Update sandbox settings
   */
  updateSettings: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        settings: sandboxSettingsSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      await verifyRepoOwner(input.repoId, ctx.user.id);

      const updatedConfig = await sandboxConfigModel.upsertConfig(
        input.repoId,
        ctx.user.id,
        input.settings
      );

      // Check if provider has API key
      const hasApiKey =
        updatedConfig.provider === 'docker' ||
        (await sandboxKeyModel.hasKey(input.repoId, updatedConfig.provider));

      return {
        success: true,
        settings: {
          enabled: updatedConfig.enabled,
          provider: updatedConfig.provider,
          hasApiKey,
          networkMode: updatedConfig.networkMode,
          defaultLanguage: updatedConfig.defaultLanguage,
          memoryMB: updatedConfig.memoryMB,
          cpuCores: updatedConfig.cpuCores,
          timeoutMinutes: updatedConfig.timeoutMinutes,
          e2bTemplateId: updatedConfig.e2bTemplateId ?? undefined,
          daytonaSnapshot: updatedConfig.daytonaSnapshot ?? undefined,
          daytonaAutoStop: updatedConfig.daytonaAutoStop,
          dockerImage: updatedConfig.dockerImage,
        },
      };
    }),

  /**
   * Enable or disable sandbox
   */
  setEnabled: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        enabled: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await verifyRepoOwner(input.repoId, ctx.user.id);

      // Get current config to check provider
      const currentConfig = await sandboxConfigModel.getConfig(input.repoId);
      const provider = currentConfig?.provider ?? 'e2b';

      // Check if API key is required
      if (input.enabled && provider !== 'docker') {
        const hasApiKey = await sandboxKeyModel.hasKey(input.repoId, provider);
        if (!hasApiKey) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `${provider.toUpperCase()} API key is required to enable sandbox`,
          });
        }
      }

      const updatedConfig = await sandboxConfigModel.setEnabled(
        input.repoId,
        ctx.user.id,
        input.enabled
      );

      return { success: true, enabled: updatedConfig.enabled };
    }),

  /**
   * Set sandbox provider API key
   */
  setApiKey: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        provider: z.enum(['e2b', 'daytona', 'vercel']),
        apiKey: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await verifyRepoOwner(input.repoId, ctx.user.id);

      // Validate API key format
      if (input.provider === 'e2b' && !input.apiKey.startsWith('e2b_')) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'E2B API keys should start with "e2b_"',
        });
      }

      // Store encrypted API key
      const keyInfo = await sandboxKeyModel.setKey(
        input.repoId,
        input.provider,
        input.apiKey,
        ctx.user.id
      );

      // Update config to use this provider
      await sandboxConfigModel.upsertConfig(input.repoId, ctx.user.id, {
        provider: input.provider,
      });

      return { success: true, keyHint: keyInfo.keyHint };
    }),

  /**
   * Delete sandbox provider API key
   */
  deleteApiKey: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        provider: z.enum(['e2b', 'daytona', 'vercel']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await verifyRepoOwner(input.repoId, ctx.user.id);

      const deleted = await sandboxKeyModel.deleteKey(input.repoId, input.provider);

      if (!deleted) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'API key not found',
        });
      }

      // Get current config
      const currentConfig = await sandboxConfigModel.getConfig(input.repoId);

      // Disable sandbox if this was the active provider
      if (currentConfig?.provider === input.provider) {
        await sandboxConfigModel.setEnabled(input.repoId, ctx.user.id, false);
      }

      return { success: true };
    }),

  /**
   * Get sandbox status for a repository
   */
  getStatus: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
      })
    )
    .query(async ({ input }) => {
      return sandboxConfigModel.getStatus(input.repoId);
    }),

  /**
   * List active sandbox sessions for a repository
   */
  listSessions: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        activeOnly: z.boolean().optional().default(true),
        limit: z.number().min(1).max(100).optional().default(50),
        offset: z.number().min(0).optional().default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      // Verify user has access to repo (owner or collaborator)
      const repo = await repoModel.findById(input.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      if (input.activeOnly) {
        return sandboxSessionModel.getActiveSessions(input.repoId);
      }

      return sandboxSessionModel.getSessionHistory(input.repoId, {
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * Get user's active sandbox sessions across all repos
   */
  myActiveSessions: protectedProcedure.query(async ({ ctx }) => {
    return sandboxSessionModel.getUserActiveSessions(ctx.user.id);
  }),

  /**
   * Execute a command in the sandbox
   */
  exec: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        command: z.string().min(1),
        args: z.array(z.string()).optional(),
        timeout: z.number().min(1000).max(120000).optional().default(60000),
        cwd: z.string().optional().default('/workspace'),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Check sandbox is ready
      const status = await sandboxConfigModel.getStatus(input.repoId);
      if (!status.ready) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: status.configured
            ? 'Sandbox is not enabled or API key is missing'
            : 'Sandbox is not configured for this repository',
        });
      }

      // Get config and API key
      const config = await sandboxConfigModel.getConfig(input.repoId);
      if (!config) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Sandbox not configured',
        });
      }

      let apiKey: string | undefined;
      if (config.provider !== 'docker') {
        apiKey = (await sandboxKeyModel.getDecryptedKey(input.repoId, config.provider)) ?? undefined;
        if (!apiKey) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Sandbox API key not found for provider: ${config.provider}`,
          });
        }
        // Validate the key is not empty/whitespace
        if (!apiKey.trim()) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Sandbox API key is empty for provider: ${config.provider}`,
          });
        }
      }

      // Execute based on provider
      const fullCommand = input.args?.length
        ? `${input.command} ${input.args.join(' ')}`
        : input.command;

      try {
        switch (config.provider) {
          case 'e2b': {
            const { Sandbox } = await import('@e2b/code-interpreter');
            const sandbox = await Sandbox.create({
              apiKey,
              timeoutMs: config.timeoutMinutes * 60 * 1000,
            });

            try {
              const result = await sandbox.commands.run(fullCommand, {
                cwd: input.cwd,
                timeoutMs: input.timeout,
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
          }

          case 'daytona': {
            const { Daytona } = await import('@daytonaio/sdk');
            const daytona = new Daytona({ apiKey });
            const sandbox = await daytona.create({
              language: config.defaultLanguage as 'typescript' | 'javascript' | 'python',
              autoStopInterval: config.daytonaAutoStop,
            });

            try {
              const result = await sandbox.process.commandRun(fullCommand, {
                cwd: input.cwd,
                timeout: input.timeout,
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
          }

          case 'vercel': {
            const { Sandbox } = await import('@vercel/sandbox');

            // Get Vercel project ID and team ID from config
            const vercelProjectId = config.vercelProjectId;
            const vercelTeamId = config.vercelTeamId;
            if (!vercelProjectId) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Vercel Project ID is not configured',
              });
            }
            if (!vercelTeamId) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Vercel Team ID is not configured. This is required when using a personal access token.',
              });
            }
            if (!apiKey) {
              throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Vercel access token is not configured',
              });
            }

            try {
              // Debug: Log that we're attempting to create sandbox (without exposing full key)
              console.log('[Vercel Sandbox] Creating sandbox with:', {
                projectId: vercelProjectId,
                teamId: vercelTeamId,
                hasToken: !!apiKey,
                tokenLength: apiKey?.length,
                tokenPrefix: apiKey?.substring(0, 10) + '...',
                timeout: config.timeoutMinutes * 60 * 1000,
                runtime: config.vercelRuntime || 'node22',
              });

              const sandbox = await Sandbox.create({
                projectId: vercelProjectId,
                teamId: vercelTeamId,
                token: apiKey,
                timeout: config.timeoutMinutes * 60 * 1000,
                runtime: (config.vercelRuntime as 'node22' | 'python3.13') || 'node22',
              });

              try {
                // Vercel SDK requires command and args to be separate
                // Parse command string if no args provided
                let execCommand = input.command;
                let execArgs = input.args || [];

                if (execArgs.length === 0 && input.command.includes(' ')) {
                  const parsed = parseCommand(input.command);
                  execCommand = parsed[0];
                  execArgs = parsed.slice(1);
                }

                const result = await sandbox.runCommand(execCommand, execArgs, {
                  signal: AbortSignal.timeout(input.timeout),
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
            } catch (vercelError) {
              // Wrap Vercel SDK errors with more context
              const errorMsg = vercelError instanceof Error ? vercelError.message : String(vercelError);
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: `Vercel Sandbox error: ${errorMsg}`,
                cause: vercelError,
              });
            }
          }

          case 'docker': {
            const { spawn, execSync } = await import('child_process');

            // Check if Docker is available
            try {
              execSync('docker version', { stdio: 'ignore', timeout: 5000 });
            } catch {
              throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Docker is not available. Either Docker is not installed, not running, or the Docker socket is not accessible. Consider using E2B or Daytona provider instead.',
              });
            }

            return new Promise((resolve) => {
              const dockerArgs = [
                'run',
                '--rm',
                '-w',
                input.cwd,
                '--network',
                config.networkMode === 'none' ? 'none' : 'bridge',
                '--memory',
                `${config.memoryMB}m`,
                '--cpus',
                `${config.cpuCores}`,
                '--security-opt',
                'no-new-privileges',
                config.dockerImage,
                'sh',
                '-c',
                fullCommand,
              ];

              let stdout = '';
              let stderr = '';

              const child = spawn('docker', dockerArgs, { shell: false });

              const timer = setTimeout(() => {
                child.kill('SIGTERM');
                resolve({
                  success: false,
                  error: 'Command timed out',
                  exitCode: -1,
                });
              }, input.timeout);

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
                  exitCode: -1,
                });
              });

              child.on('close', (code) => {
                clearTimeout(timer);
                resolve({
                  success: code === 0,
                  exitCode: code ?? -1,
                  stdout: stdout || undefined,
                  stderr: stderr || undefined,
                });
              });
            });
          }

          default:
            throw new TRPCError({
              code: 'BAD_REQUEST',
              message: `Unknown provider: ${config.provider}`,
            });
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: `${config.provider.toUpperCase()} SDK not installed`,
          });
        }
        throw error;
      }
    }),
});
