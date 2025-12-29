/**
 * Runner Commands
 *
 * Manage CI runners from the command line.
 *
 * Usage:
 *   wit runner start               Start a runner on this machine
 *   wit runner register            Register a new runner
 *   wit runner status              Check runner status
 *   wit runner list                List available runners (requires server)
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import type { RunnerClientConfig } from '../ci/runner';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

export const RUNNER_HELP = `
wit runner - Manage CI runners

Usage: wit runner <command> [options]

Commands:
  start                   Start a runner on this machine
  register                Register a new runner with the server
  status                  Check runner status
  list                    List available runners (requires server)
  configure               Configure runner settings

Options:
  -h, --help              Show this help message
  --server <url>          Server URL
  --token <token>         Registration or authentication token
  --name <name>           Runner name
  --work-dir <path>       Work directory for job execution
  --labels <labels>       Comma-separated labels (e.g., "gpu,docker")
  --max-jobs <n>          Maximum concurrent jobs (default: 1)
  --daemon                Run as daemon (background)
  --verbose               Verbose output

Examples:
  wit runner register --server https://git.example.com --token abc123
  wit runner start --daemon
  wit runner list --server https://git.example.com
`;

/**
 * Runner configuration file path
 */
function getConfigPath(): string {
  const witDir = process.env.WIT_DATA_DIR || path.join(os.homedir(), '.wit');
  return path.join(witDir, 'runner.json');
}

/**
 * Runner configuration
 */
interface RunnerConfigFile {
  serverUrl: string;
  runnerId: string;
  authToken: string;
  name: string;
  workDir: string;
  labels: string[];
  maxConcurrentJobs: number;
}

/**
 * Load runner configuration
 */
function loadConfig(): RunnerConfigFile | null {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Save runner configuration
 */
function saveConfig(config: RunnerConfigFile): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  // Secure the file since it contains auth token
  fs.chmodSync(configPath, 0o600);
}

/**
 * Main handler for runner command
 */
export async function handleRunner(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === '-h' || subcommand === '--help') {
    console.log(RUNNER_HELP);
    return;
  }

  try {
    switch (subcommand) {
      case 'start':
        await handleRunnerStart(args.slice(1));
        break;
      case 'register':
        await handleRunnerRegister(args.slice(1));
        break;
      case 'status':
        await handleRunnerStatus(args.slice(1));
        break;
      case 'list':
        await handleRunnerList(args.slice(1));
        break;
      case 'configure':
        await handleRunnerConfigure(args.slice(1));
        break;
      default:
        console.error(colors.red('error: ') + `Unknown subcommand: '${subcommand}'`);
        console.log(RUNNER_HELP);
        process.exit(1);
    }
  } catch (error) {
    console.error(colors.red('Error: ') + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}

/**
 * Parse arguments
 */
function parseArgs(args: string[]): {
  flags: Record<string, string | boolean>;
  positional: string[];
} {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[key] = args[i + 1];
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      const keyMap: Record<string, string> = {
        s: 'server',
        t: 'token',
        n: 'name',
        w: 'work-dir',
        l: 'labels',
        j: 'max-jobs',
        d: 'daemon',
        v: 'verbose',
      };
      const mappedKey = keyMap[key] || key;
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[mappedKey] = args[i + 1];
        i += 2;
      } else {
        flags[mappedKey] = true;
        i++;
      }
    } else {
      positional.push(arg);
      i++;
    }
  }

  return { flags, positional };
}

/**
 * Start the runner
 */
async function handleRunnerStart(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const daemon = !!flags.daemon;
  const verbose = !!flags.verbose;

  // Load configuration
  const config = loadConfig();
  
  if (!config) {
    console.error(colors.red('Runner not configured.'));
    console.log('Run ' + colors.cyan('wit runner register') + ' first to set up the runner.');
    process.exit(1);
  }

  console.log(colors.bold('Starting CI Runner'));
  console.log(colors.dim(`Name: ${config.name}`));
  console.log(colors.dim(`Server: ${config.serverUrl}`));
  console.log(colors.dim(`Work directory: ${config.workDir}`));
  console.log(colors.dim(`Labels: ${config.labels.join(', ') || 'none'}`));
  console.log(colors.dim(`Max concurrent jobs: ${config.maxConcurrentJobs}`));
  console.log();

  // Import the runner client
  const { RunnerClient } = await import('../ci/runner');

  // Build runner client config
  const clientConfig: RunnerClientConfig = {
    serverUrl: config.serverUrl,
    authToken: config.authToken,
    runnerId: config.runnerId,
    workDir: config.workDir,
    pollInterval: 30,
    labels: config.labels,
    capabilities: {
      os: os.platform() === 'darwin' ? 'macos' : os.platform() === 'win32' ? 'windows' : 'linux',
      arch: os.arch(),
      cpuCores: os.cpus().length,
      memoryGB: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
      hasDocker: false, // TODO: Detect Docker
      labels: config.labels,
    },
    daemon,
    verbose,
  };

  const client = new RunnerClient(clientConfig);

  // Handle graceful shutdown
  const shutdown = () => {
    console.log('\nShutting down runner...');
    client.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(colors.green('✓') + ' Runner started. Waiting for jobs...\n');
  console.log(colors.dim('Press Ctrl+C to stop'));

  // Start the runner
  await client.start();
}

/**
 * Register a new runner
 */
async function handleRunnerRegister(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  
  const serverUrl = flags.server as string;
  const token = flags.token as string;
  const name = (flags.name as string) || `runner-${os.hostname()}`;
  const workDir = (flags['work-dir'] as string) || path.join(os.homedir(), '.wit', 'runner-work');
  const labelsStr = flags.labels as string;
  const labels = labelsStr ? labelsStr.split(',').map(l => l.trim()) : [];
  const maxJobs = parseInt(flags['max-jobs'] as string) || 1;

  if (!serverUrl) {
    console.error(colors.red('error: ') + 'Server URL required (--server)');
    process.exit(1);
  }

  if (!token) {
    console.error(colors.red('error: ') + 'Registration token required (--token)');
    console.log();
    console.log('Get a registration token from your server:');
    console.log(colors.dim('  1. Go to Settings > CI/CD > Runners'));
    console.log(colors.dim('  2. Click "New Runner"'));
    console.log(colors.dim('  3. Copy the registration token'));
    process.exit(1);
  }

  console.log(colors.bold('Registering Runner'));
  console.log(colors.dim(`Server: ${serverUrl}`));
  console.log(colors.dim(`Name: ${name}`));
  console.log(colors.dim(`Work directory: ${workDir}`));
  console.log();

  // Make registration request
  const response = await fetch(`${serverUrl}/trpc/runners.register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      registrationToken: token,
      name,
      capabilities: {
        os: os.platform() === 'darwin' ? 'macos' : os.platform() === 'win32' ? 'windows' : 'linux',
        arch: os.arch(),
        cpuCores: os.cpus().length,
        memoryGB: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
        hasDocker: false,
        labels,
      },
      maxConcurrentJobs: maxJobs,
      workDir,
      acceptForkJobs: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Registration failed: ${error}`);
  }

  const result = await response.json() as { result: { data: { runnerId: string; authToken: string; name: string } } };
  const { runnerId, authToken, name: registeredName } = result.result.data;

  // Save configuration
  saveConfig({
    serverUrl,
    runnerId,
    authToken,
    name: registeredName,
    workDir,
    labels,
    maxConcurrentJobs: maxJobs,
  });

  console.log(colors.green('✓') + ' Runner registered successfully!');
  console.log();
  console.log(`Runner ID: ${colors.cyan(runnerId)}`);
  console.log(`Name: ${colors.cyan(registeredName)}`);
  console.log();
  console.log('Start the runner with:');
  console.log(colors.cyan('  wit runner start'));
}

/**
 * Check runner status
 */
async function handleRunnerStatus(_args: string[]): Promise<void> {
  const config = loadConfig();

  if (!config) {
    console.log(colors.yellow('Runner not configured.'));
    console.log('Run ' + colors.cyan('wit runner register') + ' to set up the runner.');
    return;
  }

  console.log(colors.bold('Runner Status'));
  console.log();
  console.log(`Name:       ${colors.cyan(config.name)}`);
  console.log(`ID:         ${colors.dim(config.runnerId)}`);
  console.log(`Server:     ${config.serverUrl}`);
  console.log(`Work Dir:   ${config.workDir}`);
  console.log(`Labels:     ${config.labels.join(', ') || 'none'}`);
  console.log(`Max Jobs:   ${config.maxConcurrentJobs}`);
  console.log();

  // Try to ping the server
  try {
    const response = await fetch(`${config.serverUrl}/api/health`, { method: 'GET' });
    if (response.ok) {
      console.log(`Server:     ${colors.green('✓ Connected')}`);
    } else {
      console.log(`Server:     ${colors.yellow('⚠ Unreachable')}`);
    }
  } catch {
    console.log(`Server:     ${colors.red('✗ Offline')}`);
  }
}

/**
 * List runners from the server
 */
async function handleRunnerList(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const config = loadConfig();
  
  const serverUrl = (flags.server as string) || config?.serverUrl;
  
  if (!serverUrl) {
    console.error(colors.red('error: ') + 'Server URL required (--server or configure a runner first)');
    process.exit(1);
  }

  console.log(colors.bold('Available Runners'));
  console.log(colors.dim(`Server: ${serverUrl}`));
  console.log();

  try {
    const response = await fetch(`${serverUrl}/trpc/runners.list?input=${encodeURIComponent(JSON.stringify({}))}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list runners: ${response.statusText}`);
    }

    const result = await response.json() as { result: { data: any[] } };
    const runners = result.result.data;

    if (runners.length === 0) {
      console.log(colors.yellow('No runners found.'));
      return;
    }

    for (const runner of runners) {
      const statusIcon = runner.status === 'online' 
        ? colors.green('●')
        : runner.status === 'busy'
        ? colors.yellow('●')
        : colors.red('●');

      console.log(`${statusIcon} ${colors.bold(runner.name)}`);
      console.log(`  ID:       ${colors.dim(runner.id)}`);
      console.log(`  Status:   ${runner.status}`);
      console.log(`  OS:       ${runner.os}/${runner.arch}`);
      console.log(`  Labels:   ${runner.labels?.join(', ') || 'none'}`);
      console.log(`  Jobs:     ${runner.activeJobCount}/${runner.maxConcurrentJobs}`);
      if (runner.lastOnline) {
        console.log(`  Last online: ${new Date(runner.lastOnline).toLocaleString()}`);
      }
      console.log();
    }
  } catch (error) {
    console.error(colors.red('Error: ') + (error instanceof Error ? error.message : String(error)));
  }
}

/**
 * Configure runner settings
 */
async function handleRunnerConfigure(args: string[]): Promise<void> {
  const { flags } = parseArgs(args);
  const config = loadConfig();

  if (!config) {
    console.error(colors.red('Runner not configured.'));
    console.log('Run ' + colors.cyan('wit runner register') + ' first.');
    process.exit(1);
  }

  // Update configuration with provided flags
  if (flags.name) {
    config.name = flags.name as string;
  }
  if (flags['work-dir']) {
    config.workDir = flags['work-dir'] as string;
  }
  if (flags.labels) {
    config.labels = (flags.labels as string).split(',').map(l => l.trim());
  }
  if (flags['max-jobs']) {
    config.maxConcurrentJobs = parseInt(flags['max-jobs'] as string);
  }

  saveConfig(config);

  console.log(colors.green('✓') + ' Configuration updated');
  console.log();
  console.log(`Name:       ${config.name}`);
  console.log(`Work Dir:   ${config.workDir}`);
  console.log(`Labels:     ${config.labels.join(', ') || 'none'}`);
  console.log(`Max Jobs:   ${config.maxConcurrentJobs}`);
}
