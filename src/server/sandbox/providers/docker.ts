/**
 * Docker Sandbox Provider
 *
 * Provides local container-based isolation via Docker.
 * Features:
 * - Full PTY support via docker exec
 * - Resource limits (CPU, memory, disk)
 * - Network isolation
 * - Volume mounting for repository access
 * - Self-hosted, no external dependencies
 *
 * Requires Docker to be installed and accessible.
 */

import { spawn, ChildProcess } from 'child_process';
import { PassThrough } from 'stream';
import * as path from 'path';
import type {
  SandboxSession,
  SandboxSessionConfig,
  SandboxStats,
  SandboxInfo,
  CommandResult,
  DockerProviderConfig,
} from '../types';
import { BaseSandboxProvider, BaseSandboxSession } from '../base-provider';

/**
 * Docker Sandbox Session
 */
class DockerSandboxSession extends BaseSandboxSession {
  readonly id: string;
  readonly userId: string;
  readonly providerId: string;
  readonly providerType = 'docker' as const;

  private containerId: string;
  private dockerHost?: string;
  private ptyProcess: ChildProcess | null = null;
  private _stdin: PassThrough;
  private _stdout: PassThrough;
  private _stderr: PassThrough;

  constructor(
    sessionId: string,
    userId: string,
    containerId: string,
    dockerHost?: string
  ) {
    super();
    this.id = sessionId;
    this.userId = userId;
    this.containerId = containerId;
    this.providerId = containerId;
    this.dockerHost = dockerHost;

    this._stdin = new PassThrough();
    this._stdout = new PassThrough();
    this._stderr = new PassThrough();

    this.setState('running');
  }

  get stdin(): NodeJS.WritableStream {
    return this._stdin;
  }

  get stdout(): NodeJS.ReadableStream {
    return this._stdout;
  }

  get stderr(): NodeJS.ReadableStream {
    return this._stderr;
  }

  private getDockerArgs(): string[] {
    const args: string[] = [];
    if (this.dockerHost) {
      args.push('-H', this.dockerHost);
    }
    return args;
  }

  /**
   * Initialize PTY session via docker exec
   */
  async initPty(cols: number = 120, rows: number = 30): Promise<void> {
    if (this.ptyProcess) return;

    // Start interactive shell in container
    const args = [
      ...this.getDockerArgs(),
      'exec',
      '-it',
      '-e', `COLUMNS=${cols}`,
      '-e', `LINES=${rows}`,
      this.containerId,
      '/bin/bash',
      '-l',
    ];

    this.ptyProcess = spawn('docker', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Pipe container output to our streams
    this.ptyProcess.stdout?.on('data', (data) => {
      this._stdout.write(data);
      this.emit('data', data);
    });

    this.ptyProcess.stderr?.on('data', (data) => {
      this._stderr.write(data);
    });

    // Pipe stdin to container
    this._stdin.pipe(this.ptyProcess.stdin!);

    this.ptyProcess.on('exit', (code) => {
      this.ptyProcess = null;
      this.emit('exit', code || 0);
    });

    this.ptyProcess.on('error', (err) => {
      this.emit('error', err);
    });
  }

  async exec(
    command: string,
    args?: string[],
    options?: { timeout?: number; cwd?: string }
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      const execArgs = [
        ...this.getDockerArgs(),
        'exec',
      ];

      if (options?.cwd) {
        execArgs.push('-w', options.cwd);
      }

      execArgs.push(this.containerId);

      // Add command and args
      if (args?.length) {
        execArgs.push(command, ...args);
      } else {
        execArgs.push('/bin/sh', '-c', command);
      }

      const proc = spawn('docker', execArgs, {
        timeout: options?.timeout,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
        this._stdout.write(data);
        this.emit('data', data);
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
        this._stderr.write(data);
      });

      proc.on('close', (code) => {
        resolve({
          exitCode: code || 0,
          stdout,
          stderr,
        });
      });

      proc.on('error', (err) => {
        resolve({
          exitCode: 1,
          stdout,
          stderr: err.message,
        });
      });
    });
  }

  sendInput(data: string | Buffer): void {
    this._stdin.write(data);
  }

  async resize(_cols: number, _rows: number): Promise<void> {
    // Docker doesn't support PTY resize via CLI easily
    // Would need to use Docker API directly for this
    // For now, this is a no-op
  }

  async pause(): Promise<void> {
    this.setState('paused');
    await this.dockerCommand(['pause', this.containerId]);
  }

  async resume(): Promise<void> {
    await this.dockerCommand(['unpause', this.containerId]);
    this.setState('running');
  }

  async stop(): Promise<void> {
    this.setState('stopping');

    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }

    await this.dockerCommand(['stop', '-t', '10', this.containerId]);
    this.setState('stopped');
    this.emit('exit', 0);
  }

  async kill(): Promise<void> {
    if (this.ptyProcess) {
      this.ptyProcess.kill('SIGKILL');
      this.ptyProcess = null;
    }

    await this.dockerCommand(['rm', '-f', this.containerId]);
    this.setState('stopped');
    this.emit('exit', -1);
  }

  async getStats(): Promise<SandboxStats> {
    try {
      const result = await this.dockerCommand([
        'stats',
        '--no-stream',
        '--format',
        '{{json .}}',
        this.containerId,
      ]);

      const stats = JSON.parse(result.stdout);

      // Parse Docker stats output
      const parseMemory = (mem: string): number => {
        const match = mem.match(/([\d.]+)(\w+)/);
        if (!match) return 0;
        const value = parseFloat(match[1]);
        const unit = match[2].toUpperCase();
        switch (unit) {
          case 'GIB':
          case 'GB':
            return value * 1024 * 1024 * 1024;
          case 'MIB':
          case 'MB':
            return value * 1024 * 1024;
          case 'KIB':
          case 'KB':
            return value * 1024;
          default:
            return value;
        }
      };

      const parseCpu = (cpu: string): number => {
        return parseFloat(cpu.replace('%', '')) || 0;
      };

      return {
        memoryBytes: parseMemory(stats.MemUsage?.split('/')[0] || '0'),
        cpuPercent: parseCpu(stats.CPUPerc || '0'),
        diskBytes: 0, // Docker stats doesn't include disk
        networkRxBytes: 0, // Would need to parse NetIO
        networkTxBytes: 0,
        uptimeSeconds: Math.floor((Date.now() - this.createdAt.getTime()) / 1000),
      };
    } catch {
      return {
        memoryBytes: 0,
        cpuPercent: 0,
        diskBytes: 0,
        networkRxBytes: 0,
        networkTxBytes: 0,
        uptimeSeconds: Math.floor((Date.now() - this.createdAt.getTime()) / 1000),
      };
    }
  }

  async setTimeout(_timeoutMs: number): Promise<void> {
    // Docker containers don't have built-in timeout
    // Would need to implement via external monitoring
    console.warn('setTimeout not fully supported for Docker containers');
  }

  async getInfo(): Promise<SandboxInfo> {
    const result = await this.dockerCommand([
      'inspect',
      '--format',
      '{{json .}}',
      this.containerId,
    ]);

    const info = JSON.parse(result.stdout);

    return {
      id: this.id,
      providerId: this.containerId,
      state: this.state,
      createdAt: new Date(info.Created),
      metadata: info.Config?.Labels || {},
    };
  }

  private async dockerCommand(args: string[]): Promise<CommandResult> {
    return new Promise((resolve) => {
      const proc = spawn('docker', [...this.getDockerArgs(), ...args]);

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          exitCode: code || 0,
          stdout,
          stderr,
        });
      });

      proc.on('error', (err) => {
        resolve({
          exitCode: 1,
          stdout,
          stderr: err.message,
        });
      });
    });
  }
}

/**
 * Docker Sandbox Provider
 */
export class DockerProvider extends BaseSandboxProvider {
  readonly type = 'docker' as const;
  readonly name = 'Docker';

  private repoRoot: string = '';

  constructor(config: DockerProviderConfig) {
    super(config);
  }

  private get dockerConfig(): DockerProviderConfig {
    return this.config as DockerProviderConfig;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Verify Docker is available
    try {
      await this.runDocker(['version']);
    } catch {
      throw new Error(
        'Docker is not available. Make sure Docker is installed and running.'
      );
    }

    // Pull/verify the sandbox image
    const image = this.dockerConfig.options?.image || 'wit-sandbox:latest';
    try {
      await this.runDocker(['image', 'inspect', image]);
    } catch {
      // Image doesn't exist locally, try to pull or build
      console.log(`Sandbox image ${image} not found locally`);
      // For now, we'll let container creation fail if image doesn't exist
    }

    this.initialized = true;
  }

  async createSession(config: SandboxSessionConfig): Promise<SandboxSession> {
    await this.checkSessionLimits(config.userId);

    const mergedConfig = this.mergeWithDefaults(config);
    const opts = this.dockerConfig.options || {};

    // Build docker run command
    const dockerArgs = ['run', '-d'];

    // Set container name
    dockerArgs.push('--name', config.sessionId);

    // Labels for tracking
    dockerArgs.push(
      '--label', `wit.sessionId=${config.sessionId}`,
      '--label', `wit.userId=${config.userId}`,
    );
    if (config.repository) {
      dockerArgs.push('--label', `wit.repository=${config.repository}`);
    }

    // Resource limits
    if (mergedConfig.resources) {
      if (mergedConfig.resources.memoryMB) {
        dockerArgs.push('-m', `${mergedConfig.resources.memoryMB}m`);
      }
      if (mergedConfig.resources.cpuCores) {
        dockerArgs.push('--cpus', String(mergedConfig.resources.cpuCores));
      }
      if (mergedConfig.resources.maxProcesses) {
        dockerArgs.push('--pids-limit', String(mergedConfig.resources.maxProcesses));
      }
    }

    // Security options
    const security = opts.security || {};
    if (security.dropCapabilities !== false) {
      dockerArgs.push('--cap-drop=ALL');
      // Add back minimal required capabilities
      dockerArgs.push('--cap-add=CHOWN', '--cap-add=SETUID', '--cap-add=SETGID');
    }
    if (security.runAsNonRoot) {
      dockerArgs.push('--user', '1000:1000');
    }
    if (security.readOnlyRootFs) {
      dockerArgs.push('--read-only');
      dockerArgs.push('--tmpfs', '/tmp:rw,noexec,nosuid,size=100m');
    }

    // Network mode
    if (mergedConfig.networkMode === 'none' || security.noNetwork) {
      dockerArgs.push('--network', 'none');
    } else if (opts.network) {
      dockerArgs.push('--network', opts.network);
    }

    // Mount repository if specified
    if (config.repository && this.repoRoot) {
      const repoPath = path.join(this.repoRoot, config.repository);
      dockerArgs.push('-v', `${repoPath}:/workspace:rw`);
    }

    // Environment variables
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        dockerArgs.push('-e', `${key}=${value}`);
      }
    }

    // Working directory
    dockerArgs.push('-w', config.workdir || '/workspace');

    // Image
    const image = config.image || opts.image || 'wit-sandbox:latest';
    dockerArgs.push(image);

    // Keep container running
    dockerArgs.push('tail', '-f', '/dev/null');

    // Create container
    const result = await this.runDocker(dockerArgs);
    if (result.exitCode !== 0) {
      throw new Error(`Failed to create container: ${result.stderr}`);
    }

    const containerId = result.stdout.trim();

    const session = new DockerSandboxSession(
      config.sessionId,
      config.userId,
      containerId,
      opts.host
    );

    // Initialize PTY if requested
    if (config.pty) {
      await session.initPty(config.pty.cols, config.pty.rows);
    }

    this.registerSession(session);

    return session;
  }

  async getSession(sessionId: string): Promise<SandboxSession | null> {
    // First check local cache
    const cached = this.sessions.get(sessionId);
    if (cached) return cached;

    // Try to find existing container
    try {
      const result = await this.runDocker([
        'ps',
        '-a',
        '--filter', `name=${sessionId}`,
        '--format', '{{.ID}}',
      ]);

      if (result.stdout.trim()) {
        const containerId = result.stdout.trim();
        // Reconstruct session
        const session = new DockerSandboxSession(
          sessionId,
          'unknown', // Would need to get from labels
          containerId,
          this.dockerConfig.options?.host
        );
        this.registerSession(session);
        return session;
      }
    } catch {
      // Container not found
    }

    return null;
  }

  async listSessions(userId?: string): Promise<SandboxSession[]> {
    // Return locally tracked sessions
    return super.listSessions(userId);
  }

  async healthCheck(): Promise<{
    healthy: boolean;
    message?: string;
    details?: Record<string, unknown>;
  }> {
    if (!this.initialized) {
      return {
        healthy: false,
        message: 'Docker provider not initialized',
      };
    }

    try {
      const result = await this.runDocker(['info', '--format', '{{json .}}']);
      const info = JSON.parse(result.stdout);

      return {
        healthy: true,
        message: 'Docker provider is ready',
        details: {
          serverVersion: info.ServerVersion,
          containers: info.Containers,
          containersRunning: info.ContainersRunning,
          images: info.Images,
          driver: info.Driver,
          activeSessions: this.sessions.size,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        message: `Docker error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async runDocker(args: string[]): Promise<CommandResult> {
    return new Promise((resolve) => {
      const dockerArgs: string[] = [];

      // Add host if configured
      if (this.dockerConfig.options?.host) {
        dockerArgs.push('-H', this.dockerConfig.options.host);
      }

      const proc = spawn('docker', [...dockerArgs, ...args]);

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        resolve({
          exitCode: code || 0,
          stdout,
          stderr,
        });
      });

      proc.on('error', (err) => {
        resolve({
          exitCode: 1,
          stdout,
          stderr: err.message,
        });
      });
    });
  }
}
