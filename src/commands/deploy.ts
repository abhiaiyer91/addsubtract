/**
 * Deploy Command
 * 
 * Handles deployment to various platforms (Railway, Fly.io, etc.)
 * with configuration validation and environment setup.
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, printConfigSummary, features } from '../server/config';

// =============================================================================
// Types
// =============================================================================

interface DeployOptions {
  platform: 'railway' | 'fly' | 'docker';
  service?: string;
  environment?: string;
  detach?: boolean;
  noMigration?: boolean;
  verbose?: boolean;
}

interface DeployCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

// =============================================================================
// Pre-deployment Checks
// =============================================================================

function runPreDeployChecks(): DeployCheck[] {
  const checks: DeployCheck[] = [];

  // Check for package.json
  checks.push({
    name: 'package.json',
    status: fs.existsSync('package.json') ? 'pass' : 'fail',
    message: fs.existsSync('package.json') 
      ? 'Found package.json' 
      : 'Missing package.json - are you in the right directory?',
  });

  // Check for build script
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const hasBuild = !!pkg.scripts?.build;
    checks.push({
      name: 'build script',
      status: hasBuild ? 'pass' : 'fail',
      message: hasBuild ? 'Build script found' : 'Missing build script in package.json',
    });
  } catch {
    checks.push({
      name: 'build script',
      status: 'fail',
      message: 'Could not read package.json',
    });
  }

  // Check for railway.toml
  checks.push({
    name: 'railway.toml',
    status: fs.existsSync('railway.toml') ? 'pass' : 'warn',
    message: fs.existsSync('railway.toml') 
      ? 'Found railway.toml' 
      : 'No railway.toml - will use auto-detection',
  });

  // Check for nixpacks.toml
  checks.push({
    name: 'nixpacks.toml',
    status: fs.existsSync('nixpacks.toml') ? 'pass' : 'warn',
    message: fs.existsSync('nixpacks.toml') 
      ? 'Found nixpacks.toml' 
      : 'No nixpacks.toml - will use auto-detection',
  });

  // Check for DATABASE_URL
  const hasDb = !!process.env.DATABASE_URL;
  checks.push({
    name: 'DATABASE_URL',
    status: hasDb ? 'pass' : 'warn',
    message: hasDb 
      ? 'Database URL configured' 
      : 'DATABASE_URL not set - will need to configure in Railway',
  });

  // Check for auth secret
  const hasAuth = !!(process.env.BETTER_AUTH_SECRET || process.env.JWT_SECRET);
  checks.push({
    name: 'Auth Secret',
    status: hasAuth ? 'pass' : 'warn',
    message: hasAuth 
      ? 'Auth secret configured' 
      : 'No auth secret - will need to configure in Railway',
  });

  // Check git status
  try {
    const gitStatus = execSync('git status --porcelain', { encoding: 'utf8' });
    const isDirty = gitStatus.trim().length > 0;
    checks.push({
      name: 'Git Status',
      status: isDirty ? 'warn' : 'pass',
      message: isDirty 
        ? 'Uncommitted changes - deploy will use last commit' 
        : 'Working directory clean',
    });
  } catch {
    checks.push({
      name: 'Git Status',
      status: 'warn',
      message: 'Not a git repository or git not available',
    });
  }

  return checks;
}

function printChecks(checks: DeployCheck[]): boolean {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Pre-deployment Checks                                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  const icons = { pass: '✓', warn: '⚠', fail: '✗' };
  const colors = { pass: '\x1b[32m', warn: '\x1b[33m', fail: '\x1b[31m' };
  const reset = '\x1b[0m';

  let hasFailures = false;

  for (const check of checks) {
    const icon = icons[check.status];
    const color = colors[check.status];
    console.log(`  ${color}${icon}${reset} ${check.name}: ${check.message}`);
    if (check.status === 'fail') hasFailures = true;
  }

  console.log('');
  return !hasFailures;
}

// =============================================================================
// Railway Deployment
// =============================================================================

function checkRailwayCLI(): boolean {
  try {
    execSync('railway --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function installRailwayCLI(): void {
  console.log('Installing Railway CLI...');
  
  const platform = process.platform;
  
  if (platform === 'darwin') {
    try {
      execSync('brew install railway', { stdio: 'inherit' });
      return;
    } catch {
      // Fall through to npm install
    }
  }
  
  // Use npm as fallback
  execSync('npm install -g @railway/cli', { stdio: 'inherit' });
}

async function deployToRailway(options: DeployOptions): Promise<void> {
  console.log('\n🚂 Deploying to Railway...\n');

  // Check for Railway CLI
  if (!checkRailwayCLI()) {
    console.log('Railway CLI not found. Installing...');
    try {
      installRailwayCLI();
    } catch (error) {
      console.error('Failed to install Railway CLI. Please install manually:');
      console.error('  npm install -g @railway/cli');
      console.error('  # or');
      console.error('  brew install railway');
      process.exit(1);
    }
  }

  // Check if logged in
  try {
    execSync('railway whoami', { stdio: 'pipe' });
  } catch {
    console.log('Not logged in to Railway. Please authenticate:');
    execSync('railway login', { stdio: 'inherit' });
  }

  // Link to project if not already linked
  try {
    execSync('railway status', { stdio: 'pipe' });
  } catch {
    console.log('Not linked to a Railway project. Please link or create:');
    execSync('railway link', { stdio: 'inherit' });
  }

  // Run pre-deployment checks
  const checks = runPreDeployChecks();
  const checksPass = printChecks(checks);

  if (!checksPass) {
    console.error('Pre-deployment checks failed. Please fix the issues above.');
    process.exit(1);
  }

  // Show what will be deployed
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Deploying wit to Railway                                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (options.service) {
    console.log(`  Service: ${options.service}`);
  }
  console.log(`  Migration: ${options.noMigration ? 'skipped' : 'will run'}`);
  console.log('');

  // Deploy
  const deployArgs = ['up'];
  
  if (options.service) {
    deployArgs.push('--service', options.service);
  }
  
  if (options.detach) {
    deployArgs.push('--detach');
  }

  console.log(`Running: railway ${deployArgs.join(' ')}\n`);
  
  const deploy = spawn('railway', deployArgs, {
    stdio: 'inherit',
    shell: true,
  });

  await new Promise<void>((resolve, reject) => {
    deploy.on('close', (code) => {
      if (code === 0) {
        console.log('\n✓ Deployment initiated successfully!');
        console.log('\nView deployment status:');
        console.log('  railway status');
        console.log('  railway logs');
        resolve();
      } else {
        reject(new Error(`Deployment failed with code ${code}`));
      }
    });
    deploy.on('error', reject);
  });
}

// =============================================================================
// Docker Deployment
// =============================================================================

async function deployToDocker(options: DeployOptions): Promise<void> {
  console.log('\n🐳 Building Docker image...\n');

  // Check for Dockerfile
  if (!fs.existsSync('Dockerfile')) {
    console.error('No Dockerfile found. Please create one or use Railway/Fly.');
    process.exit(1);
  }

  // Run pre-deployment checks
  const checks = runPreDeployChecks();
  printChecks(checks);

  // Build image
  const tag = options.environment ? `wit:${options.environment}` : 'wit:latest';
  
  console.log(`Building image: ${tag}\n`);
  execSync(`docker build -t ${tag} .`, { stdio: 'inherit' });

  console.log(`\n✓ Image built successfully: ${tag}`);
  console.log('\nTo run locally:');
  console.log(`  docker run -p 3000:3000 --env-file .env ${tag}`);
  console.log('\nTo push to registry:');
  console.log(`  docker tag ${tag} your-registry/${tag}`);
  console.log(`  docker push your-registry/${tag}`);
}

// =============================================================================
// Environment Setup
// =============================================================================

function generateEnvExample(): void {
  const envExample = `# wit Environment Configuration
# Copy this file to .env and fill in the values

# =============================================================================
# Required for Production
# =============================================================================

# Database connection (PostgreSQL)
DATABASE_URL=postgresql://user:pass@host:5432/wit

# Authentication secret (min 32 characters)
# Generate with: openssl rand -hex 32
BETTER_AUTH_SECRET=

# Public URL of your wit instance
BETTER_AUTH_URL=https://your-domain.com

# =============================================================================
# Recommended
# =============================================================================

# Redis for distributed rate limiting and caching
REDIS_URL=redis://localhost:6379

# CORS origins (comma-separated)
CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com

# =============================================================================
# AI Features (Optional)
# =============================================================================

# OpenAI API key for AI features
OPENAI_API_KEY=

# Anthropic API key (alternative to OpenAI)
ANTHROPIC_API_KEY=

# =============================================================================
# Object Storage (Optional, for large repos)
# =============================================================================

# S3-compatible object storage
S3_BUCKET=
S3_ENDPOINT=
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# =============================================================================
# Vector Search (Optional, for semantic search)
# =============================================================================

# Qdrant vector database
QDRANT_URL=
QDRANT_API_KEY=

# Pinecone (alternative)
PINECONE_API_KEY=
PINECONE_INDEX=

# =============================================================================
# GitHub Integration (Optional)
# =============================================================================

# GitHub OAuth
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# =============================================================================
# Email (Optional)
# =============================================================================

# Resend for transactional emails
RESEND_API_KEY=
EMAIL_FROM_ADDRESS=notifications@your-domain.com
EMAIL_FROM_NAME=wit

# =============================================================================
# Server Configuration
# =============================================================================

# Server port (default: 3000)
PORT=3000

# Repository storage directory
REPOS_DIR=./repos

# Node environment
NODE_ENV=production

# Database connection pool settings
DB_POOL_MAX=20
DB_POOL_MIN=5
`;

  fs.writeFileSync('.env.example', envExample);
  console.log('Generated .env.example');
}

// =============================================================================
// Main Handler
// =============================================================================

export async function handleDeploy(args: string[]): Promise<void> {
  const options: DeployOptions = {
    platform: 'railway',
    detach: false,
    noMigration: false,
    verbose: false,
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case 'railway':
      case 'fly':
      case 'docker':
        options.platform = arg;
        break;
      case '--service':
      case '-s':
        options.service = args[++i];
        break;
      case '--environment':
      case '-e':
        options.environment = args[++i];
        break;
      case '--detach':
      case '-d':
        options.detach = true;
        break;
      case '--no-migration':
        options.noMigration = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case 'check':
        // Run checks only
        const checks = runPreDeployChecks();
        printChecks(checks);
        return;
      case 'config':
        // Print config summary
        try {
          loadConfig();
          printConfigSummary();
        } catch (error) {
          console.error((error as Error).message);
          process.exit(1);
        }
        return;
      case 'init':
        // Generate config files
        generateEnvExample();
        console.log('\n✓ Generated deployment configuration files');
        console.log('\nNext steps:');
        console.log('  1. Copy .env.example to .env and fill in values');
        console.log('  2. Run: wit deploy check');
        console.log('  3. Run: wit deploy railway');
        return;
      case '--help':
      case '-h':
        printHelp();
        return;
    }
  }

  // Run deployment
  switch (options.platform) {
    case 'railway':
      await deployToRailway(options);
      break;
    case 'docker':
      await deployToDocker(options);
      break;
    case 'fly':
      console.log('Fly.io deployment coming soon!');
      console.log('For now, use: flyctl launch');
      break;
  }
}

function printHelp(): void {
  console.log(`
wit deploy - Deploy wit to production

Usage: wit deploy [platform] [options]

Platforms:
  railway             Deploy to Railway (default)
  fly                 Deploy to Fly.io
  docker              Build Docker image

Commands:
  wit deploy init     Generate deployment configuration files
  wit deploy check    Run pre-deployment checks
  wit deploy config   Show current configuration

Options:
  -s, --service <n>   Deploy specific service (for monorepos)
  -e, --environment   Set deployment environment
  -d, --detach        Deploy without waiting for completion
  --no-migration      Skip database migrations
  -v, --verbose       Show detailed output
  -h, --help          Show this help message

Examples:
  wit deploy                    Deploy to Railway (default)
  wit deploy railway            Deploy to Railway
  wit deploy docker             Build Docker image
  wit deploy check              Run pre-deployment checks
  wit deploy init               Generate config files
  wit deploy -s wit-server      Deploy specific service
  wit deploy --detach           Deploy without waiting

Environment Variables (set in Railway dashboard):
  DATABASE_URL          PostgreSQL connection string (auto-provided)
  REDIS_URL             Redis connection string (auto-provided)
  BETTER_AUTH_SECRET    Authentication secret (required)
  BETTER_AUTH_URL       Public API URL (required)
  CORS_ORIGINS          Allowed origins for CORS
  OPENAI_API_KEY        For AI features (optional)

Railway Quick Start:
  1. Install CLI:     npm install -g @railway/cli
  2. Login:           railway login
  3. Initialize:      railway init
  4. Add Postgres:    railway add --database postgres
  5. Add Redis:       railway add --database redis
  6. Deploy:          wit deploy

For more information, see: docs/platform/railway-deployment.mdx
`);
}
