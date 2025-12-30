/**
 * Stack Command - Stacked Diffs Support
 * 
 * Usage:
 *   wit stack create <name>     Start a new stack from current branch
 *   wit stack push [name]       Create a new branch on top of the stack
 *   wit stack list              Show all stacks
 *   wit stack show              Show current stack with visualization
 *   wit stack sync              Rebase entire stack when base changes
 *   wit stack submit            Push all branches for review
 *   wit stack pop               Remove top branch from stack
 *   wit stack delete <name>     Delete a stack (keeps branches)
 *   wit stack up                Move to child branch in stack
 *   wit stack down              Move to parent branch in stack
 *   wit stack goto <n|branch>   Jump to specific branch in stack
 */

import { Repository } from '../core/repository';
import { StackManager } from '../core/stack';
import { TsgitError } from '../core/errors';
import { colors } from '../utils/colors';

const HELP = `
wit stack - Manage stacked diffs

Stacked diffs allow you to break down large features into smaller,
dependent branches that build on top of each other.

Usage: wit stack <command> [options]

Commands:
  create <name> [-d <desc>]   Start a new stack from current branch
  push [branch-name]          Create a new branch on top of the stack
  pop                         Remove top branch from stack (keeps branch)
  list                        Show all stacks
  show [stack-name]           Show stack visualization
  sync                        Rebase entire stack when base changes
  submit [--force]            Push all stack branches to remote
  delete <name>               Delete a stack (keeps branches)
  
Navigation:
  up                          Move to child branch in stack
  down                        Move to parent branch in stack
  goto <n|branch>             Jump to specific branch in stack

Examples:
  wit stack create auth-feature
  wit stack push              # Creates auth-feature/part-1
  wit commit -m "Add login"
  wit stack push              # Creates auth-feature/part-2
  wit commit -m "Add logout"
  wit stack show              # See the stack
  wit stack sync              # Rebase after main updated
  wit stack submit            # Push all for review

Stack Workflow:
  1. Start on main (or your base branch)
  2. Create a stack: wit stack create feature-name
  3. Push first change: wit stack push
  4. Commit your changes
  5. Push more changes: wit stack push
  6. Repeat steps 4-5
  7. Sync when base updates: wit stack sync
  8. Submit for review: wit stack submit
`;

/**
 * Main handler for stack commands
 */
export function handleStack(args: string[]): void {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(HELP);
    return;
  }

  const repo = Repository.find();
  const manager = new StackManager(repo, repo.gitDir);
  const subcommand = args[0];
  const subArgs = args.slice(1);

  try {
    switch (subcommand) {
      case 'create':
        handleCreate(manager, subArgs);
        break;

      case 'push':
        handlePush(manager, subArgs);
        break;

      case 'pop':
        handlePop(manager);
        break;

      case 'list':
      case 'ls':
        handleList(manager);
        break;

      case 'show':
        handleShow(manager, subArgs);
        break;

      case 'sync':
        handleSync(manager);
        break;

      case 'submit':
        handleSubmit(manager, subArgs);
        break;

      case 'delete':
      case 'rm':
        handleDelete(manager, subArgs);
        break;

      case 'up':
        handleUp(manager);
        break;

      case 'down':
        handleDown(manager);
        break;

      case 'goto':
        handleGoto(manager, subArgs);
        break;

      case 'reorder':
        handleReorder(manager, subArgs);
        break;

      default:
        console.error(`Unknown stack command: ${subcommand}`);
        console.error('Run "wit stack --help" for usage information');
        process.exit(1);
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

/**
 * Create a new stack
 */
function handleCreate(manager: StackManager, args: string[]): void {
  if (args.length === 0) {
    console.error('error: Stack name is required');
    console.error('Usage: wit stack create <name> [-d <description>]');
    process.exit(1);
  }

  const name = args[0];
  let description: string | undefined;

  // Parse -d flag
  const descIndex = args.indexOf('-d');
  if (descIndex !== -1 && args[descIndex + 1]) {
    description = args[descIndex + 1];
  }

  const stack = manager.create(name, description);
  
  console.log(colors.green('') + ` Created stack '${colors.cyan(name)}'`);
  console.log(`  Base branch: ${colors.yellow(stack.baseBranch)}`);
  if (description) {
    console.log(`  Description: ${description}`);
  }
  console.log('');
  console.log('Next steps:');
  console.log(`  ${colors.dim('wit stack push')}     # Create first branch in stack`);
  console.log(`  ${colors.dim('wit commit -m "..."')} # Make your changes`);
  console.log(`  ${colors.dim('wit stack push')}     # Create next branch`);
}

/**
 * Push a new branch onto the stack
 */
function handlePush(manager: StackManager, args: string[]): void {
  const branchName = args[0];
  const { stack, branch } = manager.push(branchName);
  
  console.log(colors.green('') + ` Created branch '${colors.cyan(branch)}'`);
  console.log(`  Stack: ${stack.name}`);
  console.log(`  Position: ${stack.branches.length} of ${stack.branches.length}`);
  console.log('');
  console.log('Next steps:');
  console.log(`  ${colors.dim('# Make your changes')}`);
  console.log(`  ${colors.dim('wit add . && wit commit -m "..."')}`);
  console.log(`  ${colors.dim('wit stack push')}  # Continue the stack`);
}

/**
 * Pop the top branch from the stack
 */
function handlePop(manager: StackManager): void {
  const { stack, branch } = manager.pop();
  
  console.log(colors.yellow('') + ` Removed '${colors.cyan(branch)}' from stack`);
  console.log(`  Stack: ${stack.name}`);
  console.log(`  Remaining branches: ${stack.branches.length}`);
  console.log('');
  console.log(colors.dim('Note: The branch still exists, only removed from stack tracking'));
}

/**
 * List all stacks
 */
function handleList(manager: StackManager): void {
  const stacks = manager.listStacks();
  
  if (stacks.length === 0) {
    console.log('No stacks found');
    console.log('');
    console.log('Create a new stack:');
    console.log(`  ${colors.dim('wit stack create <name>')}`);
    return;
  }

  const currentStack = manager.getCurrentStack();

  console.log(colors.bold('Stacks:\n'));

  for (const stackName of stacks) {
    const stack = manager.getStack(stackName);
    if (!stack) continue;

    const isCurrent = currentStack?.name === stackName;
    const prefix = isCurrent ? colors.green('* ') : '  ';
    const name = isCurrent ? colors.green(stackName) : stackName;
    
    console.log(`${prefix}${name}`);
    console.log(`    Base: ${colors.yellow(stack.baseBranch)}`);
    console.log(`    Branches: ${stack.branches.length}`);
    if (stack.description) {
      console.log(`    ${colors.dim(stack.description)}`);
    }
    console.log('');
  }
}

/**
 * Show stack visualization
 */
function handleShow(manager: StackManager, args: string[]): void {
  const stackName = args[0];
  const nodes = manager.visualize(stackName);
  
  if (nodes.length === 0) {
    if (stackName) {
      console.error(`Stack '${stackName}' not found`);
    } else {
      console.error('Not currently on a stacked branch');
      console.error('Run "wit stack list" to see available stacks');
    }
    process.exit(1);
  }

  const stack = stackName ? manager.getStack(stackName) : manager.getCurrentStack();
  
  console.log(colors.bold(`Stack: ${stack?.name || 'unknown'}\n`));

  // Draw the stack visualization
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    // isLast and isFirst available: i === nodes.length - 1, i === 0
    
    // Branch line
    const prefix = node.isCurrent ? colors.green('') : ' ';
    const branchName = node.isCurrent ? colors.green(node.branch) : node.branch;
    
    // Status indicator
    let statusIcon = '';
    switch (node.status) {
      case 'synced':
        statusIcon = colors.green('');
        break;
      case 'behind':
        statusIcon = colors.yellow(`${node.behindBy || 0}`);
        break;
      case 'ahead':
        statusIcon = colors.cyan(`${node.aheadBy || 0}`);
        break;
      case 'diverged':
        statusIcon = colors.red('');
        break;
    }

    console.log(`${prefix} ${branchName} ${statusIcon}`);
    console.log(`  ${colors.dim(node.commit)} ${colors.dim(node.message.slice(0, 50))}`);
    
    // Draw connector
    if (!isFirst) {
      console.log('  │');
    }
  }

  console.log('');
  console.log(colors.dim('Legend: synced | behind | ahead | diverged'));
}

/**
 * Sync the entire stack
 */
function handleSync(manager: StackManager): void {
  console.log('Syncing stack...\n');
  
  const result = manager.sync();
  
  if (result.success) {
    console.log(colors.green('') + ' Stack synced successfully');
    if (result.synced.length > 0) {
      console.log('\nRebased branches:');
      for (const branch of result.synced) {
        console.log(`  ${colors.green('')} ${branch}`);
      }
    }
  } else {
    console.error(colors.red('') + ' Sync failed');
    if (result.message) {
      console.error(`  ${result.message}`);
    }
    if (result.conflicts.length > 0) {
      console.error('\nConflicts in:');
      for (const conflict of result.conflicts) {
        console.error(`  ${colors.red(conflict.branch)}`);
        for (const file of conflict.files) {
          console.error(`    - ${file}`);
        }
      }
      console.error('\nResolve conflicts and run:');
      console.error('  wit rebase --continue');
      console.error('  wit stack sync');
    }
    process.exit(1);
  }
}

/**
 * Submit all branches for review
 */
function handleSubmit(manager: StackManager, args: string[]): void {
  const force = args.includes('--force') || args.includes('-f');
  
  console.log('Submitting stack for review...\n');
  
  const result = manager.submit('origin', force);
  
  if (result.success) {
    console.log(colors.green('') + ' All branches ready for review');
    for (const branch of result.pushed) {
      console.log(`  ${colors.green('')} ${branch}`);
    }
    console.log('');
    console.log(colors.dim('Note: Use "wit push" to actually push branches to remote'));
  } else {
    console.error(colors.yellow('') + ' Some branches could not be submitted');
    for (const { branch, error } of result.failed) {
      console.error(`  ${colors.red('')} ${branch}: ${error}`);
    }
    process.exit(1);
  }
}

/**
 * Delete a stack
 */
function handleDelete(manager: StackManager, args: string[]): void {
  if (args.length === 0) {
    console.error('error: Stack name is required');
    console.error('Usage: wit stack delete <name>');
    process.exit(1);
  }

  const name = args[0];
  const stack = manager.getStack(name);
  
  if (!stack) {
    console.error(`Stack '${name}' not found`);
    process.exit(1);
  }

  manager.delete(name);
  
  console.log(colors.green('') + ` Deleted stack '${name}'`);
  if (stack.branches.length > 0) {
    console.log('');
    console.log(colors.dim('The following branches still exist:'));
    for (const branch of stack.branches) {
      console.log(`  ${branch}`);
    }
    console.log(colors.dim('\nUse "wit branch -d <name>" to delete them'));
  }
}

/**
 * Move up in the stack
 */
function handleUp(manager: StackManager): void {
  const branch = manager.up();
  console.log(colors.green('') + ` Switched to ${colors.cyan(branch)}`);
}

/**
 * Move down in the stack
 */
function handleDown(manager: StackManager): void {
  const branch = manager.down();
  console.log(colors.green('') + ` Switched to ${colors.cyan(branch)}`);
}

/**
 * Go to a specific branch in the stack
 */
function handleGoto(manager: StackManager, args: string[]): void {
  if (args.length === 0) {
    console.error('error: Branch name or index is required');
    console.error('Usage: wit stack goto <branch|index>');
    process.exit(1);
  }

  const target = args[0];
  const index = parseInt(target, 10);
  
  const branch = !isNaN(index) 
    ? manager.goto(index)
    : manager.goto(target);
    
  console.log(colors.green('') + ` Switched to ${colors.cyan(branch)}`);
}

/**
 * Reorder branches in the stack
 */
function handleReorder(manager: StackManager, args: string[]): void {
  if (args.length === 0) {
    console.error('error: New branch order is required');
    console.error('Usage: wit stack reorder <branch1> <branch2> ...');
    console.error('');
    console.error('Example: wit stack reorder feature/part-2 feature/part-1 feature/part-3');
    process.exit(1);
  }

  const stack = manager.reorder(args);
  
  console.log(colors.green('') + ' Stack reordered');
  console.log('');
  console.log('New order:');
  for (let i = 0; i < stack.branches.length; i++) {
    console.log(`  ${i + 1}. ${stack.branches[i]}`);
  }
  console.log('');
  console.log(colors.yellow('') + ' Run "wit stack sync" to rebase branches to new order');
}

// Export for CLI
export { StackManager } from '../core/stack';
