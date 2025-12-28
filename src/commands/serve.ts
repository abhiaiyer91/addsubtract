import { startServer } from '../server';
import * as path from 'path';

/**
 * Help text for the serve command
 */
export const SERVE_HELP = `
wit serve - Start a Git HTTP server for hosting repositories

Usage: wit serve [options]

Options:
  --port <number>    Port to listen on (default: 3000)
  --repos <path>     Directory to store repositories (default: ./repos)
  --host <hostname>  Hostname to bind to (default: 0.0.0.0)
  --verbose          Enable verbose logging
  -h, --help         Show this help message

Examples:
  wit serve
    Start server on port 3000 with repos in ./repos

  wit serve --port 8080
    Start server on port 8080

  wit serve --repos /var/git/repos --port 3000
    Start server with custom repository directory

Once the server is running, you can:

  Clone a repository:
    wit clone http://localhost:3000/owner/repo.git

  Push to a repository (auto-creates if it doesn't exist):
    wit push origin main

  Fetch from a repository:
    wit fetch origin
`;

/**
 * Parse command line options
 */
function parseOptions(args: string[]): {
  port: number;
  reposDir: string;
  host: string;
  verbose: boolean;
  help: boolean;
} {
  const options = {
    port: parseInt(process.env.PORT || '3000', 10),
    reposDir: process.env.REPOS_DIR || './repos',
    host: process.env.HOST || '0.0.0.0',
    verbose: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--port':
      case '-p':
        if (i + 1 < args.length) {
          const port = parseInt(args[++i], 10);
          if (isNaN(port) || port < 1 || port > 65535) {
            console.error(`error: Invalid port number: ${args[i]}`);
            process.exit(1);
          }
          options.port = port;
        }
        break;

      case '--repos':
      case '-r':
        if (i + 1 < args.length) {
          options.reposDir = args[++i];
        }
        break;

      case '--host':
      case '-H':
        if (i + 1 < args.length) {
          options.host = args[++i];
        }
        break;

      case '--verbose':
      case '-v':
        options.verbose = true;
        break;

      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

/**
 * Handle the serve command
 */
export function handleServe(args: string[]): void {
  const options = parseOptions(args);

  if (options.help) {
    console.log(SERVE_HELP);
    return;
  }

  // Resolve the repos directory
  const reposDir = path.resolve(options.reposDir);

  // Start the server
  const server = startServer({
    port: options.port,
    reposDir: reposDir,
    host: options.host,
    verbose: options.verbose,
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down server...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down server...');
    await server.stop();
    process.exit(0);
  });
}
