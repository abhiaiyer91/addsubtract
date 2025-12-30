/**
 * Project Commands
 *
 * Manage Linear-style projects from the command line.
 *
 * Usage:
 *   wit project create <name>      Create a new project
 *   wit project list               List projects
 *   wit project view <name>        View project details
 *   wit project update <name>      Update a project
 *   wit project delete <name>      Delete a project
 *   wit project issues <name>      List issues in a project
 *   wit project progress <name>    Show project progress
 *   wit project complete <name>    Mark project as complete
 */

import { getApiClient, ApiError, getServerUrl } from '../api/client';
import { Repository } from '../core/repository';
import { parseRemoteUrl } from '../core/protocol';
import { TsgitError, ErrorCode } from '../core/errors';
import { colors } from '../utils/colors';

// Status colors and icons
const STATUS_CONFIG: Record<string, { icon: string; color: (s: string) => string }> = {
  backlog: { icon: '○', color: colors.dim },
  planned: { icon: '◐', color: colors.magenta },
  in_progress: { icon: '●', color: colors.blue },
  paused: { icon: '◑', color: colors.yellow },
  completed: { icon: '✓', color: colors.green },
  canceled: { icon: '✕', color: colors.red },
};

export const PROJECT_HELP = `
wit project - Manage projects (Linear-style)

Usage: wit project <command> [options]

Commands:
  create <name>       Create a new project
  list                List all projects
  view <name>         View project details
  update <name>       Update a project
  delete <name>       Delete a project
  issues <name>       List issues in a project
  progress <name>     Show project progress
  complete <name>     Mark project as complete

Options:
  -h, --help          Show this help message
  --description, -d   Project description
  --status, -s        Project status (backlog, planned, in_progress, paused, completed, canceled)
  --lead              Project lead username
  --start             Start date (YYYY-MM-DD)
  --target            Target date (YYYY-MM-DD)
  --color             Project color (hex, e.g., 3b82f6)
  --icon              Project icon (emoji)

Examples:
  wit project create "Auth System"
  wit project create "Q1 Features" -d "Features for Q1 2024" --status planned
  wit project list
  wit project list --status in_progress
  wit project view "Auth System"
  wit project update "Auth System" --status in_progress
  wit project issues "Auth System"
  wit project progress "Auth System"
  wit project complete "Auth System"
`;

/**
 * Parse owner and repo from remote URL
 */
function parseOwnerRepo(url: string): { owner: string; repo: string } {
  const parsed = parseRemoteUrl(url);
  let path = parsed.path;
  if (path.startsWith('/')) path = path.slice(1);
  if (path.endsWith('.git')) path = path.slice(0, -4);

  const parts = path.split('/');
  if (parts.length < 2) {
    throw new TsgitError(
      `Invalid remote URL: cannot parse owner/repo from ${url}`,
      ErrorCode.INVALID_ARGUMENT,
      ['Check that the remote URL is in the format: host/owner/repo']
    );
  }

  return {
    owner: parts[parts.length - 2],
    repo: parts[parts.length - 1],
  };
}

function getRemoteUrl(repo: Repository): string {
  const remote = repo.remotes.get('origin');
  if (!remote) {
    throw new TsgitError(
      'No remote origin configured',
      ErrorCode.OPERATION_FAILED,
      ['Add a remote with: wit remote add origin <url>']
    );
  }
  return remote.url;
}

/**
 * Parse command arguments
 */
function parseArgs(args: string[]): {
  flags: Record<string, string | boolean>;
  positional: string[];
} {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  const keyMap: Record<string, string> = {
    d: 'description',
    s: 'status',
  };

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
 * Format status with icon and color
 */
function formatStatus(status: string): string {
  const config = STATUS_CONFIG[status] || { icon: '?', color: colors.dim };
  return config.color(`${config.icon} ${status.replace('_', ' ')}`);
}

/**
 * Format progress bar
 */
function formatProgressBar(percentage: number, width: number = 20): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  const bar = colors.green('█'.repeat(filled)) + colors.dim('░'.repeat(empty));
  return `[${bar}] ${percentage}%`;
}

/**
 * Main handler for project command
 */
export async function handleProject(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === '-h' || subcommand === '--help') {
    console.log(PROJECT_HELP);
    return;
  }

  try {
    switch (subcommand) {
      case 'create':
        await handleProjectCreate(args.slice(1));
        break;
      case 'list':
        await handleProjectList(args.slice(1));
        break;
      case 'view':
        await handleProjectView(args.slice(1));
        break;
      case 'update':
        await handleProjectUpdate(args.slice(1));
        break;
      case 'delete':
        await handleProjectDelete(args.slice(1));
        break;
      case 'issues':
        await handleProjectIssues(args.slice(1));
        break;
      case 'progress':
        await handleProjectProgress(args.slice(1));
        break;
      case 'complete':
        await handleProjectComplete(args.slice(1));
        break;
      default:
        console.error(colors.red('error: ') + `Unknown subcommand: '${subcommand}'`);
        console.log(PROJECT_HELP);
        process.exit(1);
    }
  } catch (error) {
    if (error instanceof ApiError) {
      console.error(colors.red('error: ') + error.message);
      if (error.status === 0) {
        console.error(colors.dim('hint: Start the server with: wit serve'));
      }
      process.exit(1);
    }
    if (error instanceof TsgitError) {
      console.error(error.format());
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Create a new project
 */
async function handleProjectCreate(args: string[]): Promise<void> {
  const repo = Repository.find();
  const api = getApiClient();
  const { flags, positional } = parseArgs(args);

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const name = positional[0];
  if (!name) {
    console.error(colors.red('error: ') + 'Project name required');
    console.error('usage: wit project create "Project Name"');
    process.exit(1);
  }

  console.log(`Creating project: ${colors.bold(name)}`);

  const projectData: {
    name: string;
    description?: string;
    leadId?: string;
    startDate?: string;
    targetDate?: string;
  } = {
    name,
    description: flags.description as string | undefined,
    leadId: flags.lead as string | undefined,
  };

  if (flags.start) {
    projectData.startDate = new Date(flags.start as string).toISOString();
  }
  if (flags.target) {
    projectData.targetDate = new Date(flags.target as string).toISOString();
  }

  const project = await api.projects.create(owner, repoName, projectData);
  
  console.log(colors.green('✓') + ` Created project "${project.name}"`);
  if (projectData.startDate || projectData.targetDate) {
    const start = projectData.startDate ? new Date(projectData.startDate).toLocaleDateString() : 'not set';
    const target = projectData.targetDate ? new Date(projectData.targetDate).toLocaleDateString() : 'not set';
    console.log(`  ${colors.dim(`Timeline: ${start} → ${target}`)}`);
  }
  console.log(`  ${colors.dim(`${getServerUrl()}/${owner}/${repoName}/projects`)}`);
}

/**
 * List projects
 */
async function handleProjectList(args: string[]): Promise<void> {
  const repo = Repository.find();
  const api = getApiClient();
  const { flags } = parseArgs(args);

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const statusFilter = flags.status as string | undefined;

  const projects = await api.projects.list(owner, repoName, { status: statusFilter });

  if (projects.length === 0) {
    console.log(colors.dim('No projects yet'));
    console.log(colors.dim('Create one with: wit project create "Project Name"'));
    return;
  }

  console.log(`\n${colors.bold('Projects:')}\n`);

  for (const project of projects) {
    const statusStr = formatStatus(project.status);
    const timeline = project.targetDate 
      ? colors.dim(` → ${new Date(project.targetDate).toLocaleDateString()}`)
      : '';
    
    console.log(`  ${statusStr}  ${colors.bold(project.name)}${timeline}`);
    if (project.description) {
      console.log(`      ${colors.dim(project.description.slice(0, 60))}${project.description.length > 60 ? '...' : ''}`);
    }
  }
  console.log();
}

/**
 * View project details
 */
async function handleProjectView(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const name = positional[0];

  if (!name) {
    console.error(colors.red('error: ') + 'Project name required');
    console.error('usage: wit project view "Project Name"');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const project = await api.projects.get(owner, repoName, name);
  const progress = await api.projects.getProgress(owner, repoName, name);

  console.log();
  console.log(`${colors.bold(project.name)}`);
  console.log(colors.dim('─'.repeat(50)));
  
  console.log(`Status:      ${formatStatus(project.status)}`);
  
  if (project.description) {
    console.log(`Description: ${project.description}`);
  }
  
  if (project.leadId) {
    console.log(`Lead:        @${project.leadId}`);
  }
  
  if (project.startDate || project.targetDate) {
    const start = project.startDate ? new Date(project.startDate).toLocaleDateString() : 'not set';
    const target = project.targetDate ? new Date(project.targetDate).toLocaleDateString() : 'not set';
    console.log(`Timeline:    ${start} → ${target}`);
  }
  
  if (project.completedAt) {
    console.log(`Completed:   ${new Date(project.completedAt).toLocaleDateString()}`);
  }

  console.log();
  console.log(colors.bold('Progress:'));
  console.log(`  ${formatProgressBar(progress.percentage)}`);
  console.log(`  ${progress.completed}/${progress.total} issues completed`);
  
  console.log();
}

/**
 * Update a project
 */
async function handleProjectUpdate(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const name = positional[0];

  if (!name) {
    console.error(colors.red('error: ') + 'Project name required');
    console.error('usage: wit project update "Project Name" --status in_progress');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const updates: {
    name?: string;
    description?: string;
    status?: string;
    leadId?: string;
    startDate?: string;
    targetDate?: string;
  } = {};
  
  if (flags.name) updates.name = flags.name as string;
  if (flags.description) updates.description = flags.description as string;
  if (flags.status) updates.status = flags.status as string;
  if (flags.lead) updates.leadId = flags.lead as string;
  if (flags.start) updates.startDate = new Date(flags.start as string).toISOString();
  if (flags.target) updates.targetDate = new Date(flags.target as string).toISOString();

  if (Object.keys(updates).length === 0) {
    console.error(colors.red('error: ') + 'No updates specified');
    console.error('usage: wit project update "Name" --status in_progress');
    process.exit(1);
  }

  const project = await api.projects.update(owner, repoName, name, updates);
  
  console.log(colors.green('✓') + ` Updated project "${project.name}"`);
  if (updates.status) {
    console.log(`  Status: ${formatStatus(project.status)}`);
  }
}

/**
 * Delete a project
 */
async function handleProjectDelete(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const name = positional[0];

  if (!name) {
    console.error(colors.red('error: ') + 'Project name required');
    console.error('usage: wit project delete "Project Name"');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  // Confirm unless --force is passed
  if (!flags.force) {
    console.log(colors.yellow('warning: ') + `This will delete project "${name}" and unassign all issues.`);
    console.log('Use --force to confirm.');
    process.exit(1);
  }

  await api.projects.delete(owner, repoName, name);
  console.log(colors.yellow('✓') + ` Deleted project "${name}"`);
}

/**
 * List issues in a project
 */
async function handleProjectIssues(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const name = positional[0];

  if (!name) {
    console.error(colors.red('error: ') + 'Project name required');
    console.error('usage: wit project issues "Project Name"');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const issues = await api.projects.getIssues(owner, repoName, name);

  if (issues.length === 0) {
    console.log(colors.dim(`No issues in project "${name}"`));
    return;
  }

  console.log(`\n${colors.bold(`Issues in "${name}":`)}\n`);

  for (const issue of issues) {
    const stateIcon = issue.state === 'open' ? colors.green('●') : colors.red('●');
    const priorityStr = issue.priority && issue.priority !== 'none' 
      ? ` ${getPriorityIcon(issue.priority)}` 
      : '';
    
    console.log(`  ${stateIcon} #${issue.number} ${issue.title}${priorityStr}`);
    
    const meta: string[] = [];
    if (issue.assigneeId) meta.push(`@${issue.assigneeId}`);
    if (issue.status) meta.push(issue.status.replace('_', ' '));
    if (meta.length > 0) {
      console.log(`    ${colors.dim(meta.join(' · '))}`);
    }
  }
  console.log();
}

/**
 * Get priority icon
 */
function getPriorityIcon(priority: string): string {
  const icons: Record<string, string> = {
    urgent: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🔵',
  };
  return icons[priority] || '';
}

/**
 * Show project progress
 */
async function handleProjectProgress(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const name = positional[0];

  if (!name) {
    console.error(colors.red('error: ') + 'Project name required');
    console.error('usage: wit project progress "Project Name"');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const project = await api.projects.get(owner, repoName, name);
  const progress = await api.projects.getProgress(owner, repoName, name);

  console.log();
  console.log(`${colors.bold(project.name)} - Progress`);
  console.log(colors.dim('─'.repeat(50)));
  
  console.log();
  console.log(`  ${formatProgressBar(progress.percentage, 30)}`);
  console.log();
  console.log(`  ${colors.green('Completed:')}  ${progress.completed} issues`);
  console.log(`  ${colors.yellow('Remaining:')}  ${progress.total - progress.completed} issues`);
  console.log(`  ${colors.dim('Total:')}      ${progress.total} issues`);
  
  // Show timeline if set
  if (project.targetDate) {
    const target = new Date(project.targetDate);
    const now = new Date();
    const daysLeft = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    console.log();
    if (daysLeft < 0) {
      console.log(`  ${colors.red('Overdue:')}    ${Math.abs(daysLeft)} days past target`);
    } else if (daysLeft === 0) {
      console.log(`  ${colors.yellow('Due:')}        Today!`);
    } else {
      console.log(`  ${colors.dim('Due in:')}     ${daysLeft} days`);
    }
  }
  
  console.log();
}

/**
 * Mark project as complete
 */
async function handleProjectComplete(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const name = positional[0];

  if (!name) {
    console.error(colors.red('error: ') + 'Project name required');
    console.error('usage: wit project complete "Project Name"');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  // Get progress before completing
  const progress = await api.projects.getProgress(owner, repoName, name);
  
  // Complete the project
  const project = await api.projects.complete(owner, repoName, name);

  console.log(colors.green('✓') + ` Marked project "${project.name}" as complete`);
  console.log();
  console.log(colors.bold('  Summary:'));
  console.log(`    ${colors.green('Completed:')}  ${progress.completed} issues`);
  if (progress.total > progress.completed) {
    console.log(`    ${colors.yellow('Remaining:')}  ${progress.total - progress.completed} issues (still open)`);
  }
  console.log();
}
