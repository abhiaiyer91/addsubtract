/**
 * wit status - Show wit platform status
 *
 * Displays the current state of all wit services.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

const WIT_DIR = path.join(os.homedir(), '.wit');
const PID_FILE = path.join(WIT_DIR, 'wit.pid');

export const STATUS_HELP = `
wit status - Show wit platform status

Usage: wit status [options]

Options:
  --json        Output as JSON
  -h, --help    Show this help message
`;

interface ServiceStatus {
  name: string;
  running: boolean;
  port?: number;
  url?: string;
  pid?: number;
}

export async function handlePlatformStatus(args: string[]): Promise<void> {
  if (args.includes('-h') || args.includes('--help')) {
    console.log(STATUS_HELP);
    return;
  }

  const asJson = args.includes('--json');

  // Load saved state
  let pids: Record<string, any> = {};
  if (fs.existsSync(PID_FILE)) {
    try {
      pids = JSON.parse(fs.readFileSync(PID_FILE, 'utf-8'));
    } catch {
      // Invalid PID file
    }
  }

  const options = pids.options || { port: 3000, dbPort: 5432 };

  // Check each service
  const services: ServiceStatus[] = [
    {
      name: 'Database',
      running: await isProcessRunning('wit-postgres', true),
      port: options.dbPort,
      url: `postgresql://localhost:${options.dbPort}/wit`,
    },
    {
      name: 'API Server',
      running: pids.server ? isProcessAlive(pids.server) : false,
      port: options.port,
      url: `http://localhost:${options.port}`,
      pid: pids.server,
    },
    {
      name: 'Web UI',
      running: pids.web ? isProcessAlive(pids.web) : false,
      port: 5173,
      url: 'http://localhost:5173',
      pid: pids.web,
    },
  ];

  if (asJson) {
    console.log(JSON.stringify({
      running: services.some(s => s.running),
      services,
      startedAt: pids.startedAt,
      dataDir: WIT_DIR,
    }, null, 2));
    return;
  }

  // Pretty print
  console.log(colors.bold('\n📊 wit platform status\n'));

  const allRunning = services.every(s => s.running);
  const someRunning = services.some(s => s.running);

  if (allRunning) {
    console.log(colors.green('  Status: Running ✓\n'));
  } else if (someRunning) {
    console.log(colors.yellow('  Status: Partial ⚠️\n'));
  } else {
    console.log(colors.red('  Status: Stopped\n'));
  }

  console.log(colors.bold('  Services:'));
  for (const service of services) {
    const status = service.running
      ? colors.green('●')
      : colors.red('○');
    const url = service.running && service.url
      ? colors.dim(` (${service.url})`)
      : '';
    console.log(`    ${status} ${service.name}${url}`);
  }

  if (pids.startedAt) {
    const uptime = getUptime(new Date(pids.startedAt));
    console.log(`\n  ${colors.dim(`Started: ${pids.startedAt}`)}`);
    console.log(`  ${colors.dim(`Uptime:  ${uptime}`)}`);
  }

  console.log(`\n  ${colors.dim(`Data:    ${WIT_DIR}`)}`);
  console.log();

  if (!someRunning) {
    console.log(colors.dim('  Start with: wit up\n'));
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function isProcessRunning(name: string, isDocker = false): Promise<boolean> {
  if (isDocker) {
    try {
      const { execSync } = await import('child_process');
      const result = execSync(`docker ps -q -f name=${name}`, { encoding: 'utf-8' });
      return result.trim().length > 0;
    } catch {
      return false;
    }
  }
  return false;
}

function getUptime(startTime: Date): string {
  const now = new Date();
  const diff = now.getTime() - startTime.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}


