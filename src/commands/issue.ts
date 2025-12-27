/**
 * Issue Command
 * Linear-inspired issue tracking built into wit
 * 
 * Commands:
 * - wit issue create "Title"           Create a new issue
 * - wit issue list [--status todo]     List issues with filters
 * - wit issue show <id>                Show issue details
 * - wit issue edit <id>                Edit an issue
 * - wit issue close <id>               Close an issue
 * - wit issue reopen <id>              Reopen a closed issue
 * - wit issue delete <id>              Delete an issue
 * - wit issue assign <id> <user>       Assign issue to user
 * - wit issue label <id> <label>       Add label to issue
 * - wit issue comment <id> "text"      Add comment to issue
 * - wit issue board                    Show kanban board view
 */

import { Repository } from '../core/repository';
import { 
  IssueManager, 
  Issue, 
  IssueStatus, 
  IssuePriority, 
  IssueType,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
} from '../core/issues';
import { TsgitError, ErrorCode } from '../core/errors';

// Use OBJECT_NOT_FOUND for issue not found errors
const NOT_FOUND = ErrorCode.OBJECT_NOT_FOUND;

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  underline: (s: string) => `\x1b[4m${s}\x1b[0m`,
  bgGreen: (s: string) => `\x1b[42m\x1b[30m${s}\x1b[0m`,
  bgYellow: (s: string) => `\x1b[43m\x1b[30m${s}\x1b[0m`,
  bgRed: (s: string) => `\x1b[41m\x1b[30m${s}\x1b[0m`,
  bgBlue: (s: string) => `\x1b[44m\x1b[30m${s}\x1b[0m`,
  bgMagenta: (s: string) => `\x1b[45m\x1b[30m${s}\x1b[0m`,
  bgCyan: (s: string) => `\x1b[46m\x1b[30m${s}\x1b[0m`,
};

/**
 * Format status with color and icon
 */
function formatStatus(status: IssueStatus): string {
  const config = STATUS_CONFIG[status];
  const statusColors: Record<IssueStatus, (s: string) => string> = {
    backlog: colors.dim,
    todo: colors.yellow,
    in_progress: colors.blue,
    in_review: colors.magenta,
    done: colors.green,
    cancelled: colors.red,
  };
  return statusColors[status](`${config.icon} ${status.replace('_', ' ')}`);
}

/**
 * Format priority with color and icon
 */
function formatPriority(priority: IssuePriority): string {
  const config = PRIORITY_CONFIG[priority];
  const priorityColors: Record<IssuePriority, (s: string) => string> = {
    urgent: colors.red,
    high: colors.yellow,
    medium: colors.blue,
    low: colors.dim,
    none: colors.dim,
  };
  return priorityColors[priority](`${config.icon} ${priority}`);
}

/**
 * Format issue type with color
 */
function formatType(type: IssueType): string {
  const typeColors: Record<IssueType, (s: string) => string> = {
    bug: colors.red,
    feature: colors.green,
    improvement: colors.blue,
    task: colors.cyan,
    chore: colors.dim,
  };
  return typeColors[type](type);
}

/**
 * Format time ago
 */
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;
  
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Format issue for list display
 */
function formatIssueRow(issue: Issue, manager: IssueManager): string {
  const id = colors.cyan(manager.getDisplayId(issue).padEnd(8));
  const status = formatStatus(issue.status);
  const priority = formatPriority(issue.priority);
  const title = issue.title.length > 50 
    ? issue.title.slice(0, 47) + '...' 
    : issue.title;
  const assignee = issue.assignee ? colors.dim(`@${issue.assignee}`) : '';
  const labels = issue.labels.length > 0 
    ? colors.dim(`[${issue.labels.join(', ')}]`) 
    : '';
  
  return `${id} ${status.padEnd(24)} ${priority.padEnd(20)} ${title} ${assignee} ${labels}`;
}

/**
 * Format issue detail view
 */
function formatIssueDetail(issue: Issue, manager: IssueManager): string {
  const lines: string[] = [];
  
  // Header
  lines.push(colors.bold(colors.cyan(manager.getDisplayId(issue))) + ' ' + colors.bold(issue.title));
  lines.push('');
  
  // Status line
  lines.push(`${colors.dim('Status:')}     ${formatStatus(issue.status)}`);
  lines.push(`${colors.dim('Priority:')}   ${formatPriority(issue.priority)}`);
  lines.push(`${colors.dim('Type:')}       ${formatType(issue.type)}`);
  
  if (issue.assignee) {
    lines.push(`${colors.dim('Assignee:')}   @${issue.assignee}`);
  }
  
  if (issue.labels.length > 0) {
    lines.push(`${colors.dim('Labels:')}     ${issue.labels.map(l => colors.cyan(l)).join(', ')}`);
  }
  
  if (issue.estimate) {
    lines.push(`${colors.dim('Estimate:')}   ${issue.estimate} points`);
  }
  
  lines.push('');
  lines.push(`${colors.dim('Created:')}    ${formatTimeAgo(issue.createdAt)} by ${issue.createdBy}`);
  lines.push(`${colors.dim('Updated:')}    ${formatTimeAgo(issue.updatedAt)}`);
  
  if (issue.closedAt) {
    lines.push(`${colors.dim('Closed:')}     ${formatTimeAgo(issue.closedAt)}`);
  }
  
  // Description
  if (issue.description) {
    lines.push('');
    lines.push(colors.dim('─'.repeat(60)));
    lines.push('');
    lines.push(issue.description);
  }
  
  // Linked commits
  if (issue.linkedCommits.length > 0) {
    lines.push('');
    lines.push(colors.dim('─'.repeat(60)));
    lines.push('');
    lines.push(colors.bold('Linked Commits:'));
    for (const commit of issue.linkedCommits.slice(0, 5)) {
      lines.push(`  ${colors.yellow(commit.slice(0, 8))}`);
    }
    if (issue.linkedCommits.length > 5) {
      lines.push(colors.dim(`  ... and ${issue.linkedCommits.length - 5} more`));
    }
  }
  
  return lines.join('\n');
}

/**
 * Format kanban board
 */
function formatBoard(issues: Issue[], manager: IssueManager): string {
  const columns: Record<IssueStatus, Issue[]> = {
    backlog: [],
    todo: [],
    in_progress: [],
    in_review: [],
    done: [],
    cancelled: [],
  };
  
  // Group issues by status
  for (const issue of issues) {
    columns[issue.status].push(issue);
  }
  
  const lines: string[] = [];
  const columnWidth = 25;
  const displayColumns: IssueStatus[] = ['todo', 'in_progress', 'in_review', 'done'];
  
  // Header
  lines.push('');
  lines.push(colors.bold('  Issue Board'));
  lines.push('');
  
  // Column headers
  let header = '  ';
  for (const status of displayColumns) {
    const config = STATUS_CONFIG[status];
    const label = `${config.icon} ${status.replace('_', ' ').toUpperCase()}`;
    header += colors.bold(label.padEnd(columnWidth));
  }
  lines.push(header);
  lines.push('  ' + colors.dim('─'.repeat(columnWidth * displayColumns.length)));
  
  // Find max items
  const maxItems = Math.max(...displayColumns.map(s => columns[s].length), 1);
  
  // Rows
  for (let i = 0; i < maxItems; i++) {
    let row = '  ';
    for (const status of displayColumns) {
      const issue = columns[status][i];
      if (issue) {
        const id = colors.cyan(manager.getDisplayId(issue));
        const title = issue.title.length > 15 
          ? issue.title.slice(0, 12) + '...' 
          : issue.title;
        const priorityIcon = PRIORITY_CONFIG[issue.priority].icon;
        row += `${priorityIcon} ${id} ${title}`.padEnd(columnWidth + 10); // Extra for color codes
      } else {
        row += ''.padEnd(columnWidth);
      }
    }
    lines.push(row);
  }
  
  // Footer summary
  lines.push('');
  lines.push(colors.dim(`  Total: ${issues.length} issues`));
  
  return lines.join('\n');
}

/**
 * Parse command line arguments
 */
function parseArgs(args: string[]): { flags: Record<string, string | boolean>; positional: string[] } {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      // Check if next arg is a value or another flag
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[key] = args[i + 1];
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const shortFlags: Record<string, string> = {
        's': 'status',
        'p': 'priority',
        't': 'type',
        'l': 'label',
        'a': 'assignee',
        'm': 'message',
      };
      const key = shortFlags[arg[1]] || arg[1];
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[key] = args[i + 1];
        i += 2;
      } else {
        flags[key] = true;
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
 * CLI handler for issue command
 */
export function handleIssue(args: string[]): void {
  const repo = Repository.find();
  const manager = new IssueManager(repo.gitDir);
  manager.init();

  const subcommand = args[0] || 'list';
  const subArgs = args.slice(1);
  const { flags, positional } = parseArgs(subArgs);

  try {
    switch (subcommand) {
      case 'create':
      case 'new':
      case 'add': {
        const title = positional.join(' ') || (flags.title as string);
        
        if (!title) {
          throw new TsgitError(
            'Issue title is required',
            ErrorCode.INVALID_ARGUMENT,
            ['wit issue create "Fix the login bug"']
          );
        }
        
        const issue = manager.create({
          title,
          description: flags.description as string || flags.message as string,
          type: (flags.type as IssueType) || 'task',
          priority: (flags.priority as IssuePriority) || 'none',
          status: (flags.status as IssueStatus) || 'backlog',
          labels: flags.label ? [(flags.label as string)] : [],
          assignee: flags.assignee as string,
        });
        
        console.log(colors.green('✓') + ` Created issue ${colors.cyan(manager.getDisplayId(issue))}`);
        console.log(colors.dim(`  ${issue.title}`));
        break;
      }

      case 'list':
      case 'ls': {
        const statusFilter = flags.status as IssueStatus | undefined;
        const priorityFilter = flags.priority as IssuePriority | undefined;
        const typeFilter = flags.type as IssueType | undefined;
        const assigneeFilter = flags.assignee as string | undefined;
        const searchFilter = flags.search as string | undefined;
        
        // Default to showing open issues unless --all is specified
        const showAll = flags.all === true;
        const defaultStatuses: IssueStatus[] = ['backlog', 'todo', 'in_progress', 'in_review'];
        
        const issues = manager.list({
          status: statusFilter ? statusFilter : (showAll ? undefined : defaultStatuses),
          priority: priorityFilter,
          type: typeFilter,
          assignee: assigneeFilter,
          search: searchFilter,
          sortBy: 'priority',
          sortOrder: 'desc',
        });
        
        if (issues.length === 0) {
          console.log(colors.dim('No issues found'));
          if (!showAll) {
            console.log(colors.dim('Use --all to show closed issues'));
          }
        } else {
          console.log('');
          console.log(colors.bold(`  ${issues.length} issue${issues.length === 1 ? '' : 's'}`));
          console.log('');
          for (const issue of issues) {
            console.log('  ' + formatIssueRow(issue, manager));
          }
          console.log('');
        }
        break;
      }

      case 'show':
      case 'view': {
        const id = positional[0];
        if (!id) {
          throw new TsgitError(
            'Issue ID is required',
            ErrorCode.INVALID_ARGUMENT,
            ['wit issue show WIT-1']
          );
        }
        
        const issue = manager.get(id);
        if (!issue) {
          throw new TsgitError(
            `Issue not found: ${id}`,
            NOT_FOUND,
            ['wit issue list    # List all issues']
          );
        }
        
        console.log('');
        console.log(formatIssueDetail(issue, manager));
        console.log('');
        
        // Show comments if any
        const comments = manager.getComments(id);
        if (comments.length > 0) {
          console.log(colors.dim('─'.repeat(60)));
          console.log('');
          console.log(colors.bold('Comments:'));
          for (const comment of comments) {
            console.log('');
            console.log(`  ${colors.bold(comment.author)} ${colors.dim(formatTimeAgo(comment.createdAt))}`);
            console.log(`  ${comment.content}`);
          }
          console.log('');
        }
        break;
      }

      case 'edit':
      case 'update': {
        const id = positional[0];
        if (!id) {
          throw new TsgitError(
            'Issue ID is required',
            ErrorCode.INVALID_ARGUMENT,
            ['wit issue edit WIT-1 --status in_progress']
          );
        }
        
        const updates: Parameters<typeof manager.update>[1] = {};
        
        if (flags.title) updates.title = flags.title as string;
        if (flags.description || flags.message) {
          updates.description = (flags.description || flags.message) as string;
        }
        if (flags.status) updates.status = flags.status as IssueStatus;
        if (flags.priority) updates.priority = flags.priority as IssuePriority;
        if (flags.type) updates.type = flags.type as IssueType;
        if (flags.assignee) updates.assignee = flags.assignee as string;
        if (flags.estimate) updates.estimate = parseInt(flags.estimate as string, 10);
        
        const issue = manager.update(id, updates);
        if (!issue) {
          throw new TsgitError(
            `Issue not found: ${id}`,
            NOT_FOUND,
            ['wit issue list    # List all issues']
          );
        }
        
        console.log(colors.green('✓') + ` Updated ${colors.cyan(manager.getDisplayId(issue))}`);
        break;
      }

      case 'close':
      case 'done':
      case 'complete': {
        const id = positional[0];
        if (!id) {
          throw new TsgitError(
            'Issue ID is required',
            ErrorCode.INVALID_ARGUMENT,
            ['wit issue close WIT-1']
          );
        }
        
        const issue = manager.close(id);
        if (!issue) {
          throw new TsgitError(
            `Issue not found: ${id}`,
            NOT_FOUND,
            ['wit issue list    # List all issues']
          );
        }
        
        console.log(colors.green('✓') + ` Closed ${colors.cyan(manager.getDisplayId(issue))}`);
        console.log(colors.dim(`  ${issue.title}`));
        break;
      }

      case 'reopen': {
        const id = positional[0];
        if (!id) {
          throw new TsgitError(
            'Issue ID is required',
            ErrorCode.INVALID_ARGUMENT,
            ['wit issue reopen WIT-1']
          );
        }
        
        const issue = manager.update(id, { status: 'todo' });
        if (!issue) {
          throw new TsgitError(
            `Issue not found: ${id}`,
            NOT_FOUND,
            ['wit issue list --all    # List all issues including closed']
          );
        }
        
        console.log(colors.green('✓') + ` Reopened ${colors.cyan(manager.getDisplayId(issue))}`);
        break;
      }

      case 'delete':
      case 'rm': {
        const id = positional[0];
        if (!id) {
          throw new TsgitError(
            'Issue ID is required',
            ErrorCode.INVALID_ARGUMENT,
            ['wit issue delete WIT-1']
          );
        }
        
        // Get issue first to show title
        const issue = manager.get(id);
        if (!issue) {
          throw new TsgitError(
            `Issue not found: ${id}`,
            NOT_FOUND,
            ['wit issue list --all    # List all issues']
          );
        }
        
        const displayId = manager.getDisplayId(issue);
        const deleted = manager.delete(id);
        
        if (deleted) {
          console.log(colors.green('✓') + ` Deleted ${colors.cyan(displayId)}`);
          console.log(colors.dim(`  ${issue.title}`));
        }
        break;
      }

      case 'assign': {
        const id = positional[0];
        const assignee = positional[1];
        
        if (!id) {
          throw new TsgitError(
            'Issue ID is required',
            ErrorCode.INVALID_ARGUMENT,
            ['wit issue assign WIT-1 @username']
          );
        }
        
        // Allow unassigning with 'none' or empty
        const assigneeValue = assignee === 'none' || assignee === '' 
          ? undefined 
          : assignee?.replace('@', '');
        
        const issue = manager.update(id, { assignee: assigneeValue });
        if (!issue) {
          throw new TsgitError(
            `Issue not found: ${id}`,
            NOT_FOUND
          );
        }
        
        if (assigneeValue) {
          console.log(colors.green('✓') + ` Assigned ${colors.cyan(manager.getDisplayId(issue))} to @${assigneeValue}`);
        } else {
          console.log(colors.green('✓') + ` Unassigned ${colors.cyan(manager.getDisplayId(issue))}`);
        }
        break;
      }

      case 'label': {
        const id = positional[0];
        const label = positional[1];
        
        if (!id || !label) {
          throw new TsgitError(
            'Issue ID and label are required',
            ErrorCode.INVALID_ARGUMENT,
            ['wit issue label WIT-1 bug']
          );
        }
        
        const added = manager.addLabel(id, label);
        if (!added) {
          throw new TsgitError(
            `Issue not found: ${id}`,
            NOT_FOUND
          );
        }
        
        const issue = manager.get(id)!;
        console.log(colors.green('✓') + ` Added label "${label}" to ${colors.cyan(manager.getDisplayId(issue))}`);
        break;
      }

      case 'unlabel': {
        const id = positional[0];
        const label = positional[1];
        
        if (!id || !label) {
          throw new TsgitError(
            'Issue ID and label are required',
            ErrorCode.INVALID_ARGUMENT,
            ['wit issue unlabel WIT-1 bug']
          );
        }
        
        const removed = manager.removeLabel(id, label);
        if (!removed) {
          throw new TsgitError(
            `Issue not found: ${id}`,
            NOT_FOUND
          );
        }
        
        const issue = manager.get(id)!;
        console.log(colors.green('✓') + ` Removed label "${label}" from ${colors.cyan(manager.getDisplayId(issue))}`);
        break;
      }

      case 'comment': {
        const id = positional[0];
        const content = positional.slice(1).join(' ') || (flags.message as string);
        
        if (!id || !content) {
          throw new TsgitError(
            'Issue ID and comment text are required',
            ErrorCode.INVALID_ARGUMENT,
            ['wit issue comment WIT-1 "This looks good!"']
          );
        }
        
        const comment = manager.addComment(id, content);
        if (!comment) {
          throw new TsgitError(
            `Issue not found: ${id}`,
            NOT_FOUND
          );
        }
        
        const issue = manager.get(id)!;
        console.log(colors.green('✓') + ` Added comment to ${colors.cyan(manager.getDisplayId(issue))}`);
        break;
      }

      case 'start': {
        // Shortcut to move issue to in_progress
        const id = positional[0];
        if (!id) {
          throw new TsgitError(
            'Issue ID is required',
            ErrorCode.INVALID_ARGUMENT,
            ['wit issue start WIT-1']
          );
        }
        
        const issue = manager.update(id, { status: 'in_progress' });
        if (!issue) {
          throw new TsgitError(
            `Issue not found: ${id}`,
            NOT_FOUND
          );
        }
        
        console.log(colors.green('✓') + ` Started working on ${colors.cyan(manager.getDisplayId(issue))}`);
        console.log(colors.dim(`  ${issue.title}`));
        
        // Suggest creating a branch
        const branchName = `${manager.getDisplayId(issue).toLowerCase()}/${issue.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`;
        console.log('');
        console.log(colors.dim(`  Tip: Create a branch with:`));
        console.log(colors.cyan(`    wit checkout -b ${branchName}`));
        break;
      }

      case 'review': {
        // Shortcut to move issue to in_review
        const id = positional[0];
        if (!id) {
          throw new TsgitError(
            'Issue ID is required',
            ErrorCode.INVALID_ARGUMENT,
            ['wit issue review WIT-1']
          );
        }
        
        const issue = manager.update(id, { status: 'in_review' });
        if (!issue) {
          throw new TsgitError(
            `Issue not found: ${id}`,
            NOT_FOUND
          );
        }
        
        console.log(colors.green('✓') + ` Moved ${colors.cyan(manager.getDisplayId(issue))} to review`);
        break;
      }

      case 'board':
      case 'kanban': {
        const issues = manager.list({
          sortBy: 'priority',
          sortOrder: 'desc',
        });
        
        console.log(formatBoard(issues, manager));
        break;
      }

      case 'stats':
      case 'summary': {
        const stats = manager.getStats();
        
        console.log('');
        console.log(colors.bold('  Issue Statistics'));
        console.log('');
        console.log(`  ${colors.dim('Total:')}      ${stats.total}`);
        console.log(`  ${colors.dim('Open:')}       ${colors.yellow(String(stats.open))}`);
        console.log(`  ${colors.dim('Closed:')}     ${colors.green(String(stats.closed))}`);
        console.log('');
        console.log(colors.bold('  By Status:'));
        for (const [status, count] of Object.entries(stats.byStatus)) {
          if (count > 0) {
            console.log(`    ${formatStatus(status as IssueStatus).padEnd(30)} ${count}`);
          }
        }
        console.log('');
        console.log(colors.bold('  By Priority:'));
        for (const [priority, count] of Object.entries(stats.byPriority)) {
          if (count > 0) {
            console.log(`    ${formatPriority(priority as IssuePriority).padEnd(25)} ${count}`);
          }
        }
        console.log('');
        break;
      }

      case 'labels': {
        const labels = manager.getLabels();
        
        console.log('');
        console.log(colors.bold('  Labels'));
        console.log('');
        for (const label of labels) {
          console.log(`  ${colors.cyan(label.name.padEnd(15))} ${colors.dim(label.description || '')}`);
        }
        console.log('');
        break;
      }

      default: {
        // Check if it looks like an issue ID (shortcut for wit issue show)
        if (subcommand.match(/^(WIT-)?#?\d+$/i)) {
          const issue = manager.get(subcommand);
          if (issue) {
            console.log('');
            console.log(formatIssueDetail(issue, manager));
            console.log('');
          } else {
            throw new TsgitError(
              `Issue not found: ${subcommand}`,
              NOT_FOUND
            );
          }
        } else {
          console.error(colors.red('error: ') + `Unknown issue subcommand: ${subcommand}`);
          console.error('');
          console.error('Usage:');
          console.error('  wit issue create "Title"          Create a new issue');
          console.error('  wit issue list [--status todo]    List issues');
          console.error('  wit issue show <id>               Show issue details');
          console.error('  wit issue edit <id> [--status]    Edit an issue');
          console.error('  wit issue close <id>              Close an issue');
          console.error('  wit issue start <id>              Start working on issue');
          console.error('  wit issue review <id>             Move to review');
          console.error('  wit issue assign <id> <user>      Assign to user');
          console.error('  wit issue label <id> <label>      Add label');
          console.error('  wit issue comment <id> "text"     Add comment');
          console.error('  wit issue board                   Show kanban board');
          console.error('  wit issue stats                   Show statistics');
          console.error('');
          console.error('Options:');
          console.error('  --status, -s     Filter by status (backlog, todo, in_progress, in_review, done)');
          console.error('  --priority, -p   Set/filter priority (urgent, high, medium, low, none)');
          console.error('  --type, -t       Set/filter type (feature, bug, improvement, task, chore)');
          console.error('  --assignee, -a   Filter by assignee');
          console.error('  --label, -l      Filter by label');
          console.error('  --all            Show all issues including closed');
          process.exit(1);
        }
      }
    }
  } catch (error) {
    if (error instanceof TsgitError) {
      console.error(error.format());
    } else if (error instanceof Error) {
      console.error(colors.red('error: ') + error.message);
    }
    process.exit(1);
  }
}
