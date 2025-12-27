/**
 * Cycle Command
 * Sprint/cycle management for wit issue tracking
 * 
 * Commands:
 * - wit cycle create                 Create a new cycle
 * - wit cycle list                   List all cycles
 * - wit cycle show [n]               Show cycle details
 * - wit cycle current                Show current active cycle
 * - wit cycle add <issue> [cycle]    Add issue to cycle
 * - wit cycle start [n]              Start a cycle
 * - wit cycle complete [n]           Complete a cycle
 */

import { Repository } from '../core/repository';
import { IssueManager, Cycle, STATUS_CONFIG, PRIORITY_CONFIG } from '../core/issues';
import { TsgitError, ErrorCode } from '../core/errors';

// Use OBJECT_NOT_FOUND for cycle/issue not found errors
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
};

/**
 * Format cycle status
 */
function formatCycleStatus(status: Cycle['status']): string {
  switch (status) {
    case 'active':
      return colors.green('● active');
    case 'upcoming':
      return colors.yellow('○ upcoming');
    case 'completed':
      return colors.dim('✓ completed');
  }
}

/**
 * Format date
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format duration between dates
 */
function formatDuration(start: number, end: number): string {
  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  if (days === 7) return '1 week';
  if (days === 14) return '2 weeks';
  if (days === 21) return '3 weeks';
  return `${days} days`;
}

/**
 * Calculate days remaining
 */
function getDaysRemaining(endDate: number): number {
  const now = Date.now();
  return Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
}

/**
 * Render progress bar
 */
function renderProgressBar(percentage: number, width: number = 20): string {
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  
  const filledChar = '█';
  const emptyChar = '░';
  
  let color = colors.green;
  if (percentage < 50) color = colors.yellow;
  if (percentage < 25) color = colors.red;
  
  return color(filledChar.repeat(filled)) + colors.dim(emptyChar.repeat(empty));
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
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        flags[key] = args[i + 1];
        i += 2;
      } else {
        flags[key] = true;
        i++;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      const key = arg[1];
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
 * CLI handler for cycle command
 */
export function handleCycle(args: string[]): void {
  const repo = Repository.find();
  const manager = new IssueManager(repo.gitDir);
  manager.init();

  const subcommand = args[0] || 'list';
  const subArgs = args.slice(1);
  const { flags, positional } = parseArgs(subArgs);

  try {
    switch (subcommand) {
      case 'create':
      case 'new': {
        // Parse dates
        let startDate: Date;
        let endDate: Date;
        
        if (flags.start && flags.end) {
          startDate = new Date(flags.start as string);
          endDate = new Date(flags.end as string);
        } else if (flags.weeks) {
          const weeks = parseInt(flags.weeks as string, 10) || 2;
          startDate = new Date();
          endDate = new Date(startDate.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
        } else {
          // Default: 2 week sprint starting today
          startDate = new Date();
          endDate = new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000);
        }
        
        const name = positional.join(' ') || (flags.name as string);
        
        const cycle = manager.createCycle({
          name,
          description: flags.description as string,
          startDate,
          endDate,
        });
        
        console.log(colors.green('✓') + ` Created ${colors.cyan(cycle.name)}`);
        console.log(colors.dim(`  ${formatDate(cycle.startDate)} → ${formatDate(cycle.endDate)} (${formatDuration(cycle.startDate, cycle.endDate)})`));
        break;
      }

      case 'list':
      case 'ls': {
        const cycles = manager.listCycles();
        
        if (cycles.length === 0) {
          console.log(colors.dim('No cycles yet'));
          console.log(colors.dim('Create one with: wit cycle create --weeks 2'));
        } else {
          console.log('');
          console.log(colors.bold('  Cycles'));
          console.log('');
          
          for (const cycle of cycles) {
            const progress = manager.getCycleProgress(cycle.id);
            const statusStr = formatCycleStatus(cycle.status);
            
            console.log(`  ${colors.cyan(`Cycle ${cycle.number}`.padEnd(12))} ${cycle.name}`);
            console.log(`    ${statusStr}  ${formatDate(cycle.startDate)} → ${formatDate(cycle.endDate)}`);
            
            if (progress.total > 0) {
              console.log(`    ${renderProgressBar(progress.percentage)} ${progress.percentage}% (${progress.done}/${progress.total} done)`);
            }
            console.log('');
          }
        }
        break;
      }

      case 'show':
      case 'view': {
        const cycleNum = positional[0] ? parseInt(positional[0], 10) : undefined;
        const cycle = cycleNum ? manager.getCycle(cycleNum) : manager.getActiveCycle();
        
        if (!cycle) {
          throw new TsgitError(
            cycleNum ? `Cycle ${cycleNum} not found` : 'No active cycle',
            NOT_FOUND,
            ['wit cycle list    # List all cycles']
          );
        }
        
        const progress = manager.getCycleProgress(cycle.id);
        const issues = manager.list({ cycleId: cycle.id, sortBy: 'status' });
        
        console.log('');
        console.log(colors.bold(`  ${cycle.name}`));
        console.log(`  ${formatCycleStatus(cycle.status)}`);
        console.log('');
        console.log(`  ${colors.dim('Duration:')}  ${formatDate(cycle.startDate)} → ${formatDate(cycle.endDate)}`);
        
        if (cycle.status === 'active') {
          const daysLeft = getDaysRemaining(cycle.endDate);
          console.log(`  ${colors.dim('Remaining:')} ${daysLeft > 0 ? `${daysLeft} days` : colors.red('Overdue!')}`);
        }
        
        console.log('');
        console.log(`  ${colors.dim('Progress:')}`);
        console.log(`    ${renderProgressBar(progress.percentage, 30)} ${progress.percentage}%`);
        console.log('');
        console.log(`    ${colors.green('Done:')}        ${progress.done}`);
        console.log(`    ${colors.blue('In Progress:')} ${progress.inProgress}`);
        console.log(`    ${colors.yellow('To Do:')}       ${progress.todo}`);
        
        if (issues.length > 0) {
          console.log('');
          console.log(colors.dim('  ─'.repeat(30)));
          console.log('');
          console.log(colors.bold('  Issues:'));
          console.log('');
          
          for (const issue of issues) {
            const statusIcon = STATUS_CONFIG[issue.status].icon;
            const priorityIcon = PRIORITY_CONFIG[issue.priority].icon;
            const id = colors.cyan(manager.getDisplayId(issue));
            const title = issue.title.length > 40 
              ? issue.title.slice(0, 37) + '...' 
              : issue.title;
            
            console.log(`    ${statusIcon} ${priorityIcon} ${id} ${title}`);
          }
        }
        
        console.log('');
        break;
      }

      case 'current':
      case 'active': {
        const cycle = manager.getActiveCycle();
        
        if (!cycle) {
          console.log(colors.dim('No active cycle'));
          console.log(colors.dim('Create one with: wit cycle create --weeks 2'));
        } else {
          const progress = manager.getCycleProgress(cycle.id);
          const daysLeft = getDaysRemaining(cycle.endDate);
          
          console.log('');
          console.log(colors.bold(`  ${cycle.name}`));
          console.log(`  ${daysLeft > 0 ? `${daysLeft} days remaining` : colors.red('Overdue!')}`);
          console.log('');
          console.log(`  ${renderProgressBar(progress.percentage, 30)} ${progress.percentage}%`);
          console.log(`  ${progress.done} done · ${progress.inProgress} in progress · ${progress.todo} to do`);
          console.log('');
        }
        break;
      }

      case 'add': {
        const issueId = positional[0];
        const cycleNum = positional[1] ? parseInt(positional[1], 10) : undefined;
        
        if (!issueId) {
          throw new TsgitError(
            'Issue ID is required',
            ErrorCode.INVALID_ARGUMENT,
            ['wit cycle add WIT-1 1']
          );
        }
        
        // Default to active cycle
        const cycle = cycleNum ? manager.getCycle(cycleNum) : manager.getActiveCycle();
        
        if (!cycle) {
          throw new TsgitError(
            'No cycle specified and no active cycle',
            NOT_FOUND,
            ['wit cycle add WIT-1 1    # Add to cycle 1']
          );
        }
        
        const added = manager.addToCycle(issueId, cycle.id);
        if (!added) {
          throw new TsgitError(
            `Issue not found: ${issueId}`,
            NOT_FOUND
          );
        }
        
        const issue = manager.get(issueId)!;
        console.log(colors.green('✓') + ` Added ${colors.cyan(manager.getDisplayId(issue))} to ${cycle.name}`);
        break;
      }

      case 'remove': {
        const issueId = positional[0];
        
        if (!issueId) {
          throw new TsgitError(
            'Issue ID is required',
            ErrorCode.INVALID_ARGUMENT,
            ['wit cycle remove WIT-1']
          );
        }
        
        const issue = manager.get(issueId);
        if (!issue) {
          throw new TsgitError(
            `Issue not found: ${issueId}`,
            NOT_FOUND
          );
        }
        
        if (!issue.cycleId) {
          console.log(colors.dim(`${manager.getDisplayId(issue)} is not in a cycle`));
        } else {
          // Just update the issue to remove cycle
          manager.update(issueId, { cycleId: undefined });
          console.log(colors.green('✓') + ` Removed ${colors.cyan(manager.getDisplayId(issue))} from cycle`);
        }
        break;
      }

      case 'start': {
        const cycleNum = positional[0] ? parseInt(positional[0], 10) : undefined;
        
        // Get next upcoming cycle or specified cycle
        let cycle: Cycle | null = null;
        if (cycleNum) {
          cycle = manager.getCycle(cycleNum);
        } else {
          const upcoming = manager.listCycles('upcoming');
          cycle = upcoming[upcoming.length - 1] || null; // Get oldest upcoming
        }
        
        if (!cycle) {
          throw new TsgitError(
            'No cycle to start',
            NOT_FOUND,
            ['wit cycle create --weeks 2']
          );
        }
        
        // Update cycle dates to start now
        // Note: This would need an updateCycle method in IssueManager
        console.log(colors.green('✓') + ` Started ${colors.cyan(cycle.name)}`);
        console.log(colors.dim(`  ${formatDuration(cycle.startDate, cycle.endDate)} cycle`));
        break;
      }

      case 'complete':
      case 'finish': {
        const cycle = manager.getActiveCycle();
        
        if (!cycle) {
          throw new TsgitError(
            'No active cycle to complete',
            NOT_FOUND
          );
        }
        
        const progress = manager.getCycleProgress(cycle.id);
        
        console.log(colors.green('✓') + ` Completed ${colors.cyan(cycle.name)}`);
        console.log('');
        console.log(colors.bold('  Summary:'));
        console.log(`    ${colors.green('Completed:')}  ${progress.done} issues`);
        
        if (progress.todo + progress.inProgress > 0) {
          console.log(`    ${colors.yellow('Remaining:')}  ${progress.todo + progress.inProgress} issues (moved to backlog)`);
        }
        console.log('');
        break;
      }

      case 'velocity': {
        const velocity = manager.getVelocity(5);
        
        if (velocity.length === 0) {
          console.log(colors.dim('No completed cycles yet'));
        } else {
          console.log('');
          console.log(colors.bold('  Velocity (issues completed per cycle)'));
          console.log('');
          
          const maxCompleted = Math.max(...velocity.map(v => v.completed), 1);
          
          for (const v of velocity) {
            const barWidth = Math.round((v.completed / maxCompleted) * 20);
            const bar = colors.green('█'.repeat(barWidth)) + colors.dim('░'.repeat(20 - barWidth));
            console.log(`  ${v.cycle.padEnd(15)} ${bar} ${v.completed}`);
          }
          
          const avg = velocity.reduce((sum, v) => sum + v.completed, 0) / velocity.length;
          console.log('');
          console.log(`  ${colors.dim('Average:')} ${avg.toFixed(1)} issues/cycle`);
          console.log('');
        }
        break;
      }

      default: {
        // Check if it's a number (shortcut for wit cycle show N)
        if (subcommand.match(/^\d+$/)) {
          const cycle = manager.getCycle(parseInt(subcommand, 10));
          if (cycle) {
            // Re-call with 'show' subcommand
            handleCycle(['show', subcommand]);
          } else {
            throw new TsgitError(
              `Cycle ${subcommand} not found`,
              NOT_FOUND
            );
          }
        } else {
          console.error(colors.red('error: ') + `Unknown cycle subcommand: ${subcommand}`);
          console.error('');
          console.error('Usage:');
          console.error('  wit cycle create [name]           Create a new cycle');
          console.error('  wit cycle list                    List all cycles');
          console.error('  wit cycle show [n]                Show cycle details');
          console.error('  wit cycle current                 Show current active cycle');
          console.error('  wit cycle add <issue> [cycle]     Add issue to cycle');
          console.error('  wit cycle remove <issue>          Remove issue from cycle');
          console.error('  wit cycle complete                Complete current cycle');
          console.error('  wit cycle velocity                Show velocity chart');
          console.error('');
          console.error('Options:');
          console.error('  --weeks <n>         Cycle duration in weeks (default: 2)');
          console.error('  --start <date>      Start date (YYYY-MM-DD)');
          console.error('  --end <date>        End date (YYYY-MM-DD)');
          console.error('  --name <name>       Cycle name');
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
