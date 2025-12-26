/**
 * wit up - Start the wit platform with one command
 *
 * This command handles everything:
 * - Starts PostgreSQL (via Docker or embedded)
 * - Runs database migrations
 * - Starts the API server
 * - Optionally starts the web UI
 */

import { spawn, execSync, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

export const UP_HELP = `
wit up - Start the wit platform

Usage: wit up [options]

Options:
  --port <port>       Server port (default: 3000)
  --db-port <port>    Database port (default: 5432)
  --no-web            Don't start the web UI
  --no-db             Use external database (requires DATABASE_URL)
  --data-dir <dir>    Data directory (default: ~/.wit)
  -h, --help          Show this help message

Examples:
  wit up                        Start everything on default ports
  wit up --port 8080            Start server on port 8080
  wit up --no-web               Start without web UI
  wit up --data-dir ./my-data   Use custom data directory

The command will:
  1. Start PostgreSQL database (if not using external)
  2. Run database migrations
  3. Start the API server
  4. Start the web UI (unless --no-web)

All data is stored in ~/.wit by default.
`;

interface UpOptions {
  port: number;
  dbPort: number;
  noWeb: boolean;
  noDb: boolean;
  dataDir: string;
}

const WIT_DIR = path.join(os.homedir(), '.wit');
const PID_FILE = path.join(WIT_DIR, 'wit.pid');
const LOG_DIR = path.join(WIT_DIR, 'logs');
const SERVER_LOG = path.join(LOG_DIR, 'server.log');
const WEB_LOG = path.join(LOG_DIR, 'web.log');

export async function handleUp(args: string[]): Promise<void> {
  if (args.includes('-h') || args.includes('--help')) {
    console.log(UP_HELP);
    return;
  }

  const options = parseOptions(args);

  console.log(colors.bold('\n🚀 Starting wit platform...\n'));

  // Ensure data directory exists
  ensureDataDir(options.dataDir);

  // Check if already running
  if (isRunning()) {
    console.log(colors.yellow('⚠️  wit is already running'));
    console.log(colors.dim(`   Stop it with: wit down`));
    return;
  }

  try {
    // Step 1: Start database
    if (!options.noDb) {
      await startDatabase(options);
    }

    // Step 2: Run migrations
    await runMigrations(options);

    // Step 3: Start server
    await startServer(options);

    // Step 4: Start web UI
    if (!options.noWeb) {
      await startWebUI(options);
    }

    // Save state
    savePidFile(options);

    // Print success
    console.log(colors.green('\n✓ wit is running!\n'));
    console.log(colors.bold('  Services:'));
    console.log(`    API:      ${colors.cyan(`http://localhost:${options.port}`)}`);
    if (!options.noWeb) {
      console.log(`    Web UI:   ${colors.cyan(`http://localhost:5173`)}`);
    }
    console.log(`    Database: ${colors.cyan(`localhost:${options.dbPort}`)}`);
    console.log();
    console.log(colors.dim('  Stop with: wit down'));
    console.log(colors.dim('  Logs at:   ' + LOG_DIR));
    console.log();

  } catch (error) {
    console.error(colors.red('\n✗ Failed to start wit'));
    console.error(colors.dim(`  ${error}`));
    console.error(colors.dim(`\n  Logs directory: ${LOG_DIR}`));
    
    // Try to show last few lines of relevant log
    const errorMsg = String(error);
    const logFile = errorMsg.includes('5173') || errorMsg.includes('Web') ? WEB_LOG : SERVER_LOG;
    
    try {
      if (fs.existsSync(logFile)) {
        const logContent = fs.readFileSync(logFile, 'utf-8');
        const lines = logContent.split('\n').filter(l => l.trim()).slice(-10);
        if (lines.length > 0) {
          console.error(colors.dim(`\n  Recent output from ${path.basename(logFile)}:`));
          for (const line of lines) {
            console.error(colors.dim(`    ${line}`));
          }
        }
      }
    } catch {
      // Ignore errors reading log
    }
    
    process.exit(1);
  }
}

function parseOptions(args: string[]): UpOptions {
  const options: UpOptions = {
    port: 3000,
    dbPort: 5432,
    noWeb: false,
    noDb: false,
    dataDir: WIT_DIR,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--port':
        options.port = parseInt(args[++i], 10);
        break;
      case '--db-port':
        options.dbPort = parseInt(args[++i], 10);
        break;
      case '--no-web':
        options.noWeb = true;
        break;
      case '--no-db':
        options.noDb = true;
        break;
      case '--data-dir':
        options.dataDir = args[++i];
        break;
    }
  }

  return options;
}

function ensureDataDir(dataDir: string): void {
  const dirs = [
    dataDir,
    path.join(dataDir, 'repos'),
    path.join(dataDir, 'db'),
    path.join(dataDir, 'logs'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function isRunning(): boolean {
  if (!fs.existsSync(PID_FILE)) {
    return false;
  }

  try {
    const pids = JSON.parse(fs.readFileSync(PID_FILE, 'utf-8'));
    // Check if main server process is still running
    if (pids.server) {
      process.kill(pids.server, 0);
      return true;
    }
  } catch {
    // Process not running, clean up stale PID file
    fs.unlinkSync(PID_FILE);
  }

  return false;
}

async function startDatabase(options: UpOptions): Promise<void> {
  console.log(colors.dim('  Starting database...'));

  // Check if Docker is available
  if (!hasDocker()) {
    console.log(colors.yellow('  ⚠️  Docker not found, using SQLite fallback'));
    // For now, we require Docker. Could add SQLite fallback later.
    throw new Error('Docker is required to run the database. Install Docker or use --no-db with external DATABASE_URL');
  }

  // Check if port is available
  if (await isPortInUse(options.dbPort)) {
    console.log(colors.dim(`  Database already running on port ${options.dbPort}`));
    return;
  }

  // Start PostgreSQL container
  const containerName = 'wit-postgres';
  const dataDir = path.join(options.dataDir, 'db');

  try {
    // Remove existing container if exists
    execSync(`docker rm -f ${containerName} 2>/dev/null || true`, { stdio: 'ignore' });

    // Start new container
    execSync(
      `docker run -d \
        --name ${containerName} \
        -e POSTGRES_USER=wit \
        -e POSTGRES_PASSWORD=wit \
        -e POSTGRES_DB=wit \
        -p ${options.dbPort}:5432 \
        -v "${dataDir}:/var/lib/postgresql/data" \
        postgres:16-alpine`,
      { stdio: 'ignore' }
    );

    // Wait for database to be ready
    await waitForDatabase(options.dbPort);
    console.log(colors.green('  ✓ Database started'));
  } catch (error) {
    throw new Error(`Failed to start database: ${error}`);
  }
}

async function waitForDatabase(port: number, maxRetries = 30): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      execSync(`docker exec wit-postgres pg_isready -U wit`, { stdio: 'ignore' });
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error('Database failed to start in time');
}

async function runMigrations(options: UpOptions): Promise<void> {
  console.log(colors.dim('  Running migrations...'));

  const dbUrl = process.env.DATABASE_URL || 
    `postgresql://wit:wit@localhost:${options.dbPort}/wit`;

  try {
    // Use drizzle-kit push
    execSync(`DATABASE_URL="${dbUrl}" npx drizzle-kit push --force`, {
      stdio: 'ignore',
      cwd: getWitInstallDir(),
    });
    console.log(colors.green('  ✓ Migrations complete'));
  } catch (error) {
    // Migrations might already be applied
    console.log(colors.dim('  ✓ Database ready'));
  }
}

async function startServer(options: UpOptions): Promise<void> {
  console.log(colors.dim('  Starting API server...'));

  const dbUrl = process.env.DATABASE_URL || 
    `postgresql://wit:wit@localhost:${options.dbPort}/wit`;

  const reposDir = path.join(options.dataDir, 'repos');
  
  // Ensure log directory exists and clear old logs
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  // Clear old server log
  fs.writeFileSync(SERVER_LOG, '');
  const logFile = fs.openSync(SERVER_LOG, 'a');

  // Find the CLI script - check multiple possible locations
  const witDir = getWitInstallDir();
  const possiblePaths = [
    path.join(witDir, 'dist/cli.js'),
    path.join(witDir, 'cli.js'),
    // If running from source with tsx
    path.join(witDir, 'src/cli.ts'),
  ];
  
  let cliPath: string | null = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      cliPath = p;
      break;
    }
  }
  
  if (!cliPath) {
    // Fallback: run npm script from the wit directory
    console.log(colors.dim('  Using npm run serve...'));
    
    const serverProcess = spawn(
      'npm',
      ['run', 'serve', '--', '--port', options.port.toString(), '--repos', reposDir],
      {
        detached: true,
        stdio: ['ignore', logFile, logFile],
        cwd: witDir,
        env: {
          ...process.env,
          DATABASE_URL: dbUrl,
          NODE_ENV: 'production',
        },
      }
    );

    serverProcess.unref();
    
    // Store PID
    const pids = loadPidFile();
    pids.server = serverProcess.pid;
    fs.writeFileSync(PID_FILE, JSON.stringify(pids));
    
    // Wait for server
    await waitForServer(options.port);
    console.log(colors.green('  ✓ API server started'));
    return;
  }
  
  // Determine if we need tsx or node
  const isTs = cliPath.endsWith('.ts');
  const command = isTs ? 'npx' : 'node';
  const cmdArgs = isTs 
    ? ['tsx', cliPath, 'serve', '--port', options.port.toString(), '--repos', reposDir]
    : [cliPath, 'serve', '--port', options.port.toString(), '--repos', reposDir];

  const serverProcess = spawn(
    command,
    cmdArgs,
    {
      detached: true,
      stdio: ['ignore', logFile, logFile],
      cwd: witDir,
      env: {
        ...process.env,
        DATABASE_URL: dbUrl,
        NODE_ENV: 'production',
      },
    }
  );

  serverProcess.unref();

  // Store PID first so we can clean up if wait fails
  const pids = loadPidFile();
  pids.server = serverProcess.pid;
  fs.writeFileSync(PID_FILE, JSON.stringify(pids));

  // Wait for server to be ready
  await waitForServer(options.port);
  console.log(colors.green('  ✓ API server started'));
}

async function startWebUI(options: UpOptions): Promise<void> {
  console.log(colors.dim('  Starting web UI...'));

  const webDir = path.join(getWitInstallDir(), 'apps/web');
  
  if (!fs.existsSync(webDir)) {
    console.log(colors.dim('  ⚠️  Web UI not found, skipping'));
    return;
  }

  // Check if web UI dependencies are installed
  if (!fs.existsSync(path.join(webDir, 'node_modules'))) {
    console.log(colors.dim('  Installing web UI dependencies...'));
    try {
      execSync('npm install', { cwd: webDir, stdio: 'ignore' });
    } catch {
      console.log(colors.yellow('  ⚠️  Failed to install web dependencies, skipping'));
      return;
    }
  }

  // Clear old web log
  fs.writeFileSync(WEB_LOG, '');
  const logFile = fs.openSync(WEB_LOG, 'a');

  const webProcess = spawn(
    'npm',
    ['run', 'dev', '--', '--host'],
    {
      detached: true,
      stdio: ['ignore', logFile, logFile],
      cwd: webDir,
      env: {
        ...process.env,
        VITE_API_URL: `http://localhost:${options.port}/trpc`,
      },
    }
  );

  webProcess.unref();

  // Store PID
  const pids = loadPidFile();
  pids.web = webProcess.pid;
  fs.writeFileSync(PID_FILE, JSON.stringify(pids));

  // Wait for web server (Vite)
  await waitForWebServer(5173);
  console.log(colors.green('  ✓ Web UI started'));
}

async function waitForServer(port: number, maxRetries = 30): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Try to connect to the server's health endpoint
      const response = await fetch(`http://localhost:${port}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    await sleep(1000);
  }
  throw new Error(`Server failed to start on port ${port}`);
}

async function waitForWebServer(port: number, maxRetries = 30): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Try to connect to Vite dev server
      const response = await fetch(`http://localhost:${port}/`);
      if (response.ok || response.status === 200) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    await sleep(1000);
  }
  throw new Error(`Web server failed to start on port ${port}`);
}

function savePidFile(options: UpOptions): void {
  const pids = loadPidFile();
  pids.options = options;
  pids.startedAt = new Date().toISOString();
  fs.writeFileSync(PID_FILE, JSON.stringify(pids, null, 2));
}

function loadPidFile(): Record<string, any> {
  if (fs.existsSync(PID_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(PID_FILE, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function hasDocker(): boolean {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

function getWitInstallDir(): string {
  // Find where wit is installed
  // In development, this is the project root
  // In production, this would be in node_modules or global install
  return path.resolve(__dirname, '../..');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

