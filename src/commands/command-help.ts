/**
 * Command Help System
 * Provides --help text for each CLI command
 */

export interface CommandHelp {
  name: string;
  summary: string;
  usage: string;
  description?: string;
  options?: { flag: string; description: string }[];
  examples?: { command: string; description: string }[];
  seeAlso?: string[];
}

/**
 * Help text for all commands
 */
export const COMMAND_HELP: Record<string, CommandHelp> = {
  // ============ Core Commands ============
  init: {
    name: 'init',
    summary: 'Create an empty wit repository',
    usage: 'wit init [<directory>]',
    description: 'Initialize a new wit repository in the specified directory, or the current directory if not specified.',
    options: [
      { flag: '<directory>', description: 'Directory to initialize (defaults to current directory)' },
    ],
    examples: [
      { command: 'wit init', description: 'Initialize in current directory' },
      { command: 'wit init my-project', description: 'Initialize in my-project directory' },
    ],
    seeAlso: ['clone', 'status'],
  },

  add: {
    name: 'add',
    summary: 'Add file contents to the index (staging area)',
    usage: 'wit add <file>...',
    description: 'Add file contents to the index. This prepares the content staged for the next commit.',
    options: [
      { flag: '<file>...', description: 'Files to add. Use "." to add all files' },
    ],
    examples: [
      { command: 'wit add file.ts', description: 'Stage a specific file' },
      { command: 'wit add .', description: 'Stage all files in current directory' },
      { command: 'wit add src/', description: 'Stage all files in src directory' },
      { command: 'wit add *.ts', description: 'Stage all TypeScript files' },
    ],
    seeAlso: ['status', 'commit', 'restore'],
  },

  commit: {
    name: 'commit',
    summary: 'Record changes to the repository',
    usage: 'wit commit [options] [<file>...] -m <message>',
    description: 'Create a new commit containing the current contents of the index with the given log message.',
    options: [
      { flag: '-m, --message <msg>', description: 'Commit message (required)' },
      { flag: '-a, --all', description: 'Stage and commit all tracked changes' },
      { flag: '--amend', description: 'Amend the previous commit' },
      { flag: '--allow-empty', description: 'Allow creating empty commits' },
      { flag: '--author <author>', description: 'Override author (format: "Name <email>")' },
      { flag: '--dry-run', description: 'Show what would be committed without committing' },
    ],
    examples: [
      { command: 'wit commit -m "Add feature"', description: 'Commit staged changes' },
      { command: 'wit commit -a -m "Update all"', description: 'Stage and commit all changes' },
      { command: 'wit commit file.ts -m "Fix bug"', description: 'Commit specific file' },
      { command: 'wit commit --amend -m "New msg"', description: 'Fix last commit message' },
    ],
    seeAlso: ['add', 'status', 'amend', 'uncommit'],
  },

  status: {
    name: 'status',
    summary: 'Show the working tree status',
    usage: 'wit status',
    description: 'Display paths that have differences between the index and the current HEAD, paths that have differences between the working tree and the index, and paths that are not tracked.',
    examples: [
      { command: 'wit status', description: 'Show current status' },
    ],
    seeAlso: ['add', 'commit', 'diff'],
  },

  log: {
    name: 'log',
    summary: 'Show commit logs',
    usage: 'wit log [options] [<ref>]',
    description: 'Show the commit logs starting from the specified reference (defaults to HEAD).',
    options: [
      { flag: '<ref>', description: 'Starting reference (defaults to HEAD)' },
      { flag: '--oneline', description: 'Show each commit on a single line' },
      { flag: '-n <number>', description: 'Limit the number of commits to show' },
    ],
    examples: [
      { command: 'wit log', description: 'Show commit history' },
      { command: 'wit log --oneline', description: 'Show condensed history' },
      { command: 'wit log -n 5', description: 'Show last 5 commits' },
      { command: 'wit log main', description: 'Show commits on main branch' },
    ],
    seeAlso: ['show', 'reflog', 'graph'],
  },

  diff: {
    name: 'diff',
    summary: 'Show changes between commits, index, and working tree',
    usage: 'wit diff [options]',
    description: 'Show changes between the working tree and the index, or between the index and HEAD.',
    options: [
      { flag: '--staged, --cached', description: 'Show changes between index and HEAD' },
    ],
    examples: [
      { command: 'wit diff', description: 'Show unstaged changes' },
      { command: 'wit diff --staged', description: 'Show staged changes' },
    ],
    seeAlso: ['status', 'add', 'commit'],
  },

  // ============ Branch & Navigation ============
  branch: {
    name: 'branch',
    summary: 'List, create, or delete branches',
    usage: 'wit branch [options] [<name>]',
    description: 'Manage branches. Without arguments, lists existing branches with the current branch highlighted.',
    options: [
      { flag: '<name>', description: 'Name of branch to create' },
      { flag: '-d, --delete <name>', description: 'Delete a branch' },
    ],
    examples: [
      { command: 'wit branch', description: 'List all branches' },
      { command: 'wit branch feature', description: 'Create a new branch' },
      { command: 'wit branch -d old-feature', description: 'Delete a branch' },
    ],
    seeAlso: ['switch', 'checkout', 'cleanup'],
  },

  switch: {
    name: 'switch',
    summary: 'Switch branches',
    usage: 'wit switch [options] <branch>',
    description: 'Switch to a specified branch. Unlike checkout, this command is only for switching branches.',
    options: [
      { flag: '<branch>', description: 'Branch to switch to' },
      { flag: '-c, --create', description: 'Create a new branch and switch to it' },
      { flag: '-f, --force', description: 'Force switch even with uncommitted changes' },
    ],
    examples: [
      { command: 'wit switch main', description: 'Switch to main branch' },
      { command: 'wit switch -c feature', description: 'Create and switch to new branch' },
      { command: 'wit switch -f other', description: 'Force switch discarding changes' },
    ],
    seeAlso: ['branch', 'checkout', 'restore'],
  },

  checkout: {
    name: 'checkout',
    summary: 'Switch branches or restore working tree files',
    usage: 'wit checkout [options] <branch>',
    description: 'Switch to a branch or restore files. For clarity, prefer "switch" for branches and "restore" for files.',
    options: [
      { flag: '<branch>', description: 'Branch or commit to checkout' },
      { flag: '-b', description: 'Create a new branch and check it out' },
    ],
    examples: [
      { command: 'wit checkout main', description: 'Switch to main branch' },
      { command: 'wit checkout -b feature', description: 'Create and switch to branch' },
    ],
    seeAlso: ['switch', 'restore', 'branch'],
  },

  restore: {
    name: 'restore',
    summary: 'Restore working tree files',
    usage: 'wit restore [options] <file>...',
    description: 'Restore specified paths in the working tree with some contents from a restore source.',
    options: [
      { flag: '<file>...', description: 'Files to restore' },
      { flag: '--staged', description: 'Unstage the file (restore from HEAD to index)' },
      { flag: '--source <ref>', description: 'Restore from a specific commit' },
    ],
    examples: [
      { command: 'wit restore file.ts', description: 'Discard changes to file' },
      { command: 'wit restore --staged file.ts', description: 'Unstage a file' },
      { command: 'wit restore --source HEAD~1 file.ts', description: 'Restore from previous commit' },
    ],
    seeAlso: ['switch', 'reset', 'checkout'],
  },

  // ============ Merge & Conflict Resolution ============
  merge: {
    name: 'merge',
    summary: 'Join two or more development histories together',
    usage: 'wit merge [options] <branch>',
    description: 'Merge the specified branch into the current branch. If conflicts occur, resolve them and use --continue.',
    options: [
      { flag: '<branch>', description: 'Branch to merge into current branch' },
      { flag: '-m <message>', description: 'Merge commit message' },
      { flag: '--abort', description: 'Abort the current merge operation' },
      { flag: '--continue', description: 'Continue after resolving conflicts' },
      { flag: '--conflicts', description: 'Show current conflicts' },
    ],
    examples: [
      { command: 'wit merge feature', description: 'Merge feature branch' },
      { command: 'wit merge -m "Merge feature" feature', description: 'Merge with message' },
      { command: 'wit merge --conflicts', description: 'View current conflicts' },
      { command: 'wit merge --abort', description: 'Abort the merge' },
    ],
    seeAlso: ['branch', 'rebase', 'cherry-pick'],
  },

  // ============ Undo & History ============
  undo: {
    name: 'undo',
    summary: 'Undo the last operation',
    usage: 'wit undo [options]',
    description: 'Undo the last wit operation. This is a wit-specific feature not found in git.',
    options: [
      { flag: '-n <steps>', description: 'Number of operations to undo' },
      { flag: '--dry-run', description: 'Show what would be undone without doing it' },
    ],
    examples: [
      { command: 'wit undo', description: 'Undo the last operation' },
      { command: 'wit undo -n 3', description: 'Undo the last 3 operations' },
      { command: 'wit undo --dry-run', description: 'Preview undo without executing' },
    ],
    seeAlso: ['history', 'reset', 'uncommit'],
  },

  history: {
    name: 'history',
    summary: 'Show operation history',
    usage: 'wit history [options]',
    description: 'Show the history of wit operations that can be undone.',
    options: [
      { flag: '-n <limit>', description: 'Limit the number of entries shown' },
    ],
    examples: [
      { command: 'wit history', description: 'Show operation history' },
      { command: 'wit history -n 5', description: 'Show last 5 operations' },
    ],
    seeAlso: ['undo', 'reflog'],
  },

  uncommit: {
    name: 'uncommit',
    summary: 'Undo the last commit, keeping changes staged',
    usage: 'wit uncommit [options]',
    description: 'Undo the last commit but keep all changes staged. Equivalent to "git reset --soft HEAD~1".',
    options: [
      { flag: '--hard', description: 'Also discard changes (like reset --hard)' },
    ],
    examples: [
      { command: 'wit uncommit', description: 'Undo last commit, keep changes staged' },
      { command: 'wit uncommit --hard', description: 'Undo and discard changes' },
    ],
    seeAlso: ['undo', 'reset', 'amend'],
  },

  reset: {
    name: 'reset',
    summary: 'Reset current HEAD to a specified state',
    usage: 'wit reset [options] [<commit>] [<file>...]',
    description: 'Reset the current HEAD to the specified state. Can also unstage files.',
    options: [
      { flag: '<commit>', description: 'Target commit (defaults to HEAD)' },
      { flag: '<file>...', description: 'Files to unstage' },
      { flag: '--soft', description: 'Keep changes staged' },
      { flag: '--mixed', description: 'Keep changes unstaged (default)' },
      { flag: '--hard', description: 'Discard all changes' },
    ],
    examples: [
      { command: 'wit reset HEAD~1', description: 'Undo last commit, keep changes unstaged' },
      { command: 'wit reset --soft HEAD~1', description: 'Undo last commit, keep staged' },
      { command: 'wit reset --hard HEAD~1', description: 'Undo last commit, discard changes' },
      { command: 'wit reset file.ts', description: 'Unstage a file' },
    ],
    seeAlso: ['undo', 'uncommit', 'restore'],
  },

  stash: {
    name: 'stash',
    summary: 'Stash changes in a dirty working directory',
    usage: 'wit stash [save|list|pop|apply|drop|clear|show] [options]',
    description: 'Save working directory changes temporarily. Use pop to restore them later.',
    options: [
      { flag: 'save [-m <msg>]', description: 'Save changes to stash' },
      { flag: 'list', description: 'List all stashes' },
      { flag: 'pop [<n>]', description: 'Apply and remove stash' },
      { flag: 'apply [<n>]', description: 'Apply stash without removing' },
      { flag: 'drop [<n>]', description: 'Remove a stash' },
      { flag: 'clear', description: 'Remove all stashes' },
      { flag: 'show [<n>]', description: 'Show stash contents' },
    ],
    examples: [
      { command: 'wit stash', description: 'Stash current changes' },
      { command: 'wit stash save -m "WIP: feature"', description: 'Stash with message' },
      { command: 'wit stash list', description: 'List all stashes' },
      { command: 'wit stash pop', description: 'Apply and remove latest stash' },
      { command: 'wit stash apply 1', description: 'Apply stash@{1} without removing' },
    ],
    seeAlso: ['wip', 'snapshot', 'switch'],
  },

  // ============ Debugging & Inspection ============
  show: {
    name: 'show',
    summary: 'Show various types of objects',
    usage: 'wit show [<commit>] [<commit>:<file>]',
    description: 'Show commit details, file content at a commit, or tag information.',
    options: [
      { flag: '<commit>', description: 'Commit to show (defaults to HEAD)' },
      { flag: '<commit>:<file>', description: 'Show file content at specific commit' },
    ],
    examples: [
      { command: 'wit show', description: 'Show HEAD commit' },
      { command: 'wit show abc1234', description: 'Show specific commit' },
      { command: 'wit show HEAD~1:file.ts', description: 'Show file from previous commit' },
      { command: 'wit show v1.0', description: 'Show tag information' },
    ],
    seeAlso: ['log', 'diff', 'cat-file'],
  },

  bisect: {
    name: 'bisect',
    summary: 'Use binary search to find the commit that introduced a bug',
    usage: 'wit bisect <start|good|bad|reset>',
    description: 'Perform a binary search through commit history to find which commit introduced a bug.',
    options: [
      { flag: 'start [<bad>] [<good>]', description: 'Start bisect session' },
      { flag: 'good [<commit>]', description: 'Mark a commit as good' },
      { flag: 'bad [<commit>]', description: 'Mark a commit as bad' },
      { flag: 'reset', description: 'End bisect session' },
    ],
    examples: [
      { command: 'wit bisect start HEAD v1.0', description: 'Start bisecting between HEAD and v1.0' },
      { command: 'wit bisect good', description: 'Mark current commit as good' },
      { command: 'wit bisect bad', description: 'Mark current commit as bad' },
      { command: 'wit bisect reset', description: 'End bisect session' },
    ],
    seeAlso: ['log', 'show', 'blame'],
  },

  clean: {
    name: 'clean',
    summary: 'Remove untracked files from the working tree',
    usage: 'wit clean [options]',
    description: 'Remove untracked files from the working directory. Use -n to preview first.',
    options: [
      { flag: '-n, --dry-run', description: 'Preview files that would be deleted' },
      { flag: '-f, --force', description: 'Actually delete the files' },
      { flag: '-d', description: 'Also remove untracked directories' },
    ],
    examples: [
      { command: 'wit clean -n', description: 'Preview untracked files to delete' },
      { command: 'wit clean -f', description: 'Delete untracked files' },
      { command: 'wit clean -fd', description: 'Delete untracked files and directories' },
    ],
    seeAlso: ['status', 'restore'],
  },

  blame: {
    name: 'blame',
    summary: 'Show what revision and author last modified each line of a file',
    usage: 'wit blame <file>',
    description: 'Show who changed each line of a file and when.',
    options: [
      { flag: '<file>', description: 'File to blame' },
    ],
    examples: [
      { command: 'wit blame src/main.ts', description: 'Show blame for a file' },
    ],
    seeAlso: ['log', 'show', 'diff'],
  },

  // ============ Tags ============
  tag: {
    name: 'tag',
    summary: 'Create, list, or delete tags',
    usage: 'wit tag [options] [<name>] [<commit>]',
    description: 'Create, list, or delete tags. Tags mark specific points in history as important.',
    options: [
      { flag: '<name>', description: 'Tag name' },
      { flag: '<commit>', description: 'Commit to tag (defaults to HEAD)' },
      { flag: '-a', description: 'Create an annotated tag' },
      { flag: '-m <message>', description: 'Tag message (for annotated tags)' },
      { flag: '-d <name>', description: 'Delete a tag' },
      { flag: '-l', description: 'List tags' },
    ],
    examples: [
      { command: 'wit tag', description: 'List all tags' },
      { command: 'wit tag v1.0', description: 'Create lightweight tag' },
      { command: 'wit tag -a v1.0 -m "Version 1.0"', description: 'Create annotated tag' },
      { command: 'wit tag -d v1.0', description: 'Delete a tag' },
    ],
    seeAlso: ['branch', 'log', 'show'],
  },

  // ============ History Rewriting ============
  'cherry-pick': {
    name: 'cherry-pick',
    summary: 'Apply changes from specific commits',
    usage: 'wit cherry-pick [options] <commit>...',
    description: 'Apply the changes introduced by some existing commits. Creates new commits with those changes.',
    options: [
      { flag: '<commit>...', description: 'Commits to cherry-pick' },
      { flag: '--continue', description: 'Continue after resolving conflicts' },
      { flag: '--abort', description: 'Abort the operation' },
      { flag: '--skip', description: 'Skip the current commit' },
      { flag: '-n, --no-commit', description: 'Apply changes without committing' },
    ],
    examples: [
      { command: 'wit cherry-pick abc1234', description: 'Cherry-pick a single commit' },
      { command: 'wit cherry-pick abc1234 def5678', description: 'Cherry-pick multiple commits' },
      { command: 'wit cherry-pick --continue', description: 'Continue after resolving conflicts' },
    ],
    seeAlso: ['rebase', 'revert', 'merge'],
  },

  rebase: {
    name: 'rebase',
    summary: 'Reapply commits on top of another base',
    usage: 'wit rebase [options] <branch>',
    description: 'Move or combine commits from one branch onto another. Creates a cleaner history than merge.',
    options: [
      { flag: '<branch>', description: 'Branch to rebase onto' },
      { flag: '--onto <new-base>', description: 'Rebase onto a specific base' },
      { flag: '--continue', description: 'Continue after resolving conflicts' },
      { flag: '--abort', description: 'Abort the rebase' },
      { flag: '--skip', description: 'Skip the current commit' },
    ],
    examples: [
      { command: 'wit rebase main', description: 'Rebase current branch onto main' },
      { command: 'wit rebase --onto main feature~3 feature', description: 'Rebase last 3 commits of feature onto main' },
      { command: 'wit rebase --continue', description: 'Continue after resolving conflicts' },
      { command: 'wit rebase --abort', description: 'Abort the rebase' },
    ],
    seeAlso: ['merge', 'cherry-pick', 'reset'],
  },

  revert: {
    name: 'revert',
    summary: 'Revert some existing commits',
    usage: 'wit revert [options] <commit>...',
    description: 'Create new commits that undo the changes from existing commits. Preserves history.',
    options: [
      { flag: '<commit>...', description: 'Commits to revert' },
      { flag: '-n, --no-commit', description: 'Revert without committing' },
      { flag: '-m <parent>', description: 'Mainline parent for merge commits' },
      { flag: '--continue', description: 'Continue after resolving conflicts' },
      { flag: '--abort', description: 'Abort the operation' },
    ],
    examples: [
      { command: 'wit revert abc1234', description: 'Revert a commit' },
      { command: 'wit revert HEAD~3..HEAD', description: 'Revert last 3 commits' },
      { command: 'wit revert -n abc1234', description: 'Revert without committing' },
    ],
    seeAlso: ['reset', 'cherry-pick', 'undo'],
  },

  // ============ Remote Operations ============
  remote: {
    name: 'remote',
    summary: 'Manage set of tracked repositories',
    usage: 'wit remote [options] [<command>] [<args>]',
    description: 'Manage the set of remotes. Remotes are versions of the repository hosted elsewhere.',
    options: [
      { flag: '-v, --verbose', description: 'Show remote URLs' },
      { flag: 'add <name> <url>', description: 'Add a new remote' },
      { flag: 'remove <name>', description: 'Remove a remote' },
      { flag: 'rename <old> <new>', description: 'Rename a remote' },
      { flag: 'get-url <name>', description: 'Get remote URL' },
      { flag: 'set-url <name> <url>', description: 'Set remote URL' },
    ],
    examples: [
      { command: 'wit remote', description: 'List remotes' },
      { command: 'wit remote -v', description: 'List remotes with URLs' },
      { command: 'wit remote add origin https://github.com/user/repo', description: 'Add remote' },
      { command: 'wit remote remove origin', description: 'Remove remote' },
    ],
    seeAlso: ['fetch', 'pull', 'push', 'clone'],
  },

  clone: {
    name: 'clone',
    summary: 'Clone a repository into a new directory',
    usage: 'wit clone [options] <repository> [<directory>]',
    description: 'Clone a repository into a new directory. Creates remote-tracking branches for each branch.',
    options: [
      { flag: '<repository>', description: 'Repository to clone (path or URL)' },
      { flag: '<directory>', description: 'Target directory (defaults to repo name)' },
      { flag: '--depth <n>', description: 'Create a shallow clone with n commits' },
      { flag: '--branch <name>', description: 'Checkout specific branch' },
    ],
    examples: [
      { command: 'wit clone ./source ./dest', description: 'Clone local repository' },
      { command: 'wit clone https://github.com/user/repo', description: 'Clone from URL' },
      { command: 'wit clone --depth 1 repo', description: 'Shallow clone' },
    ],
    seeAlso: ['init', 'fetch', 'pull'],
  },

  fetch: {
    name: 'fetch',
    summary: 'Download objects and refs from another repository',
    usage: 'wit fetch [options] [<remote>] [<branch>]',
    description: 'Fetch branches and tags from the remote repository without merging.',
    options: [
      { flag: '<remote>', description: 'Remote to fetch from (defaults to origin)' },
      { flag: '<branch>', description: 'Specific branch to fetch' },
      { flag: '--all', description: 'Fetch from all remotes' },
      { flag: '--prune', description: 'Remove deleted remote branches' },
    ],
    examples: [
      { command: 'wit fetch', description: 'Fetch from origin' },
      { command: 'wit fetch upstream', description: 'Fetch from specific remote' },
      { command: 'wit fetch --all', description: 'Fetch from all remotes' },
    ],
    seeAlso: ['pull', 'push', 'remote'],
  },

  pull: {
    name: 'pull',
    summary: 'Fetch from and integrate with another repository or local branch',
    usage: 'wit pull [options] [<remote>] [<branch>]',
    description: 'Fetch from a remote and merge into the current branch.',
    options: [
      { flag: '<remote>', description: 'Remote to pull from (defaults to origin)' },
      { flag: '<branch>', description: 'Remote branch to pull' },
      { flag: '--rebase', description: 'Rebase instead of merge' },
      { flag: '--ff-only', description: 'Only fast-forward merges' },
    ],
    examples: [
      { command: 'wit pull', description: 'Pull from tracking branch' },
      { command: 'wit pull origin main', description: 'Pull specific branch' },
      { command: 'wit pull --rebase', description: 'Pull with rebase' },
    ],
    seeAlso: ['fetch', 'merge', 'rebase'],
  },

  push: {
    name: 'push',
    summary: 'Update remote refs along with associated objects',
    usage: 'wit push [options] [<remote>] [<branch>]',
    description: 'Push local branch commits to the remote repository.',
    options: [
      { flag: '<remote>', description: 'Remote to push to (defaults to origin)' },
      { flag: '<branch>', description: 'Branch to push' },
      { flag: '-u, --set-upstream', description: 'Set upstream tracking reference' },
      { flag: '--force', description: 'Force push (overwrite remote)' },
      { flag: '--all', description: 'Push all branches' },
      { flag: '--tags', description: 'Push all tags' },
    ],
    examples: [
      { command: 'wit push', description: 'Push to tracking branch' },
      { command: 'wit push -u origin main', description: 'Push and set upstream' },
      { command: 'wit push --force', description: 'Force push' },
      { command: 'wit push --tags', description: 'Push all tags' },
    ],
    seeAlso: ['fetch', 'pull', 'remote', 'github'],
  },

  // ============ GitHub Integration ============
  github: {
    name: 'github',
    summary: 'Manage GitHub authentication',
    usage: 'wit github <subcommand>',
    description: 'Authenticate with GitHub to enable push/pull operations for private repositories and increase API rate limits.',
    options: [
      { flag: 'login', description: 'Authenticate with GitHub using device flow' },
      { flag: 'logout', description: 'Remove stored GitHub credentials' },
      { flag: 'status', description: 'Show current authentication status' },
      { flag: 'token', description: 'Print the current access token (for scripting)' },
    ],
    examples: [
      { command: 'wit github login', description: 'Start interactive GitHub login' },
      { command: 'wit github status', description: 'Check if you are logged in' },
      { command: 'wit github logout', description: 'Log out from GitHub' },
      { command: 'wit github token', description: 'Get token for scripting' },
    ],
    seeAlso: ['push', 'pull', 'clone', 'remote'],
  },

  // ============ Advanced Features ============
  hooks: {
    name: 'hooks',
    summary: 'Manage repository hooks',
    usage: 'wit hooks [list|add|remove|run] [<args>]',
    description: 'Manage Git-style hooks that run at various points in the workflow.',
    options: [
      { flag: 'list', description: 'List all hooks' },
      { flag: 'add <hook> <script>', description: 'Add a hook script' },
      { flag: 'remove <hook>', description: 'Remove a hook' },
      { flag: 'run <hook>', description: 'Manually run a hook' },
    ],
    examples: [
      { command: 'wit hooks list', description: 'List all hooks' },
      { command: 'wit hooks add pre-commit "npm test"', description: 'Add pre-commit hook' },
    ],
    seeAlso: ['commit'],
  },

  submodule: {
    name: 'submodule',
    summary: 'Initialize, update or inspect submodules',
    usage: 'wit submodule [add|update|status|init] [<args>]',
    description: 'Manage submodules - repositories nested inside your repository.',
    options: [
      { flag: 'add <url> [<path>]', description: 'Add a submodule' },
      { flag: 'update', description: 'Update submodules' },
      { flag: 'status', description: 'Show submodule status' },
      { flag: 'init', description: 'Initialize submodules' },
    ],
    examples: [
      { command: 'wit submodule add https://github.com/lib/util libs/util', description: 'Add submodule' },
      { command: 'wit submodule update', description: 'Update submodules' },
    ],
    seeAlso: ['clone', 'init'],
  },

  worktree: {
    name: 'worktree',
    summary: 'Manage multiple working trees',
    usage: 'wit worktree [list|add|remove|prune] [<args>]',
    description: 'Manage multiple working trees attached to the same repository.',
    options: [
      { flag: 'list', description: 'List working trees' },
      { flag: 'add <path> [<branch>]', description: 'Add a working tree' },
      { flag: 'remove <path>', description: 'Remove a working tree' },
      { flag: 'prune', description: 'Prune stale working tree info' },
    ],
    examples: [
      { command: 'wit worktree list', description: 'List all working trees' },
      { command: 'wit worktree add ../feature-tree feature', description: 'Add working tree for branch' },
    ],
    seeAlso: ['branch', 'switch'],
  },

  reflog: {
    name: 'reflog',
    summary: 'Manage reflog information',
    usage: 'wit reflog [show|expire] [<ref>]',
    description: 'Reference logs record when refs were updated. Useful for recovering lost commits.',
    options: [
      { flag: 'show [<ref>]', description: 'Show reflog (default)' },
      { flag: 'expire', description: 'Prune older reflog entries' },
      { flag: '<ref>', description: 'Reference to show (defaults to HEAD)' },
    ],
    examples: [
      { command: 'wit reflog', description: 'Show HEAD reflog' },
      { command: 'wit reflog show main', description: 'Show reflog for main branch' },
    ],
    seeAlso: ['log', 'history', 'undo'],
  },

  gc: {
    name: 'gc',
    summary: 'Cleanup unnecessary files and optimize the local repository',
    usage: 'wit gc [options]',
    description: 'Run housekeeping tasks: compress objects, remove unreachable objects, etc.',
    options: [
      { flag: '--aggressive', description: 'More thorough optimization' },
      { flag: '--prune', description: 'Prune loose objects older than 2 weeks' },
      { flag: '--dry-run', description: 'Show what would be done' },
    ],
    examples: [
      { command: 'wit gc', description: 'Run garbage collection' },
      { command: 'wit gc --aggressive', description: 'Thorough optimization' },
    ],
    seeAlso: ['fsck', 'prune'],
  },

  // ============ Quality of Life ============
  amend: {
    name: 'amend',
    summary: 'Quickly fix the last commit',
    usage: 'wit amend [options]',
    description: 'Amend the last commit with staged changes or a new message. Shortcut for "commit --amend".',
    options: [
      { flag: '-m, --message <msg>', description: 'New commit message' },
      { flag: '-a, --all', description: 'Stage all tracked changes' },
    ],
    examples: [
      { command: 'wit amend -m "Fixed message"', description: 'Fix commit message' },
      { command: 'wit amend -a', description: 'Add missed changes to last commit' },
      { command: 'wit amend', description: 'Amend with staged changes' },
    ],
    seeAlso: ['commit', 'uncommit', 'fixup'],
  },

  wip: {
    name: 'wip',
    summary: 'Quick WIP commit with auto-generated message',
    usage: 'wit wip [options]',
    description: 'Create a work-in-progress commit with an auto-generated message. Great for quick saves.',
    options: [
      { flag: '-a, --all', description: 'Stage all tracked changes' },
      { flag: '-m, --message <msg>', description: 'Custom message (appended to WIP)' },
    ],
    examples: [
      { command: 'wit wip', description: 'Quick WIP commit of staged changes' },
      { command: 'wit wip -a', description: 'Stage all and WIP commit' },
      { command: 'wit wip -m "feature progress"', description: 'WIP with custom note' },
    ],
    seeAlso: ['commit', 'stash', 'snapshot'],
  },

  fixup: {
    name: 'fixup',
    summary: 'Create a fixup commit for later squashing',
    usage: 'wit fixup [options] <commit>',
    description: 'Create a fixup commit that can be squashed into a previous commit during rebase.',
    options: [
      { flag: '<commit>', description: 'Commit to fix up' },
      { flag: '-a, --all', description: 'Stage all tracked changes' },
      { flag: '--amend', description: 'Immediately amend instead of creating fixup' },
    ],
    examples: [
      { command: 'wit fixup HEAD~2', description: 'Create fixup for 2 commits ago' },
      { command: 'wit fixup abc1234', description: 'Create fixup for specific commit' },
    ],
    seeAlso: ['amend', 'rebase', 'commit'],
  },

  cleanup: {
    name: 'cleanup',
    summary: 'Find and delete merged/stale branches',
    usage: 'wit cleanup [options]',
    description: 'Analyze branches and suggest or delete merged/stale branches.',
    options: [
      { flag: '--dry-run', description: 'Preview what would be deleted' },
      { flag: '--force', description: 'Delete without confirmation' },
      { flag: '--merged', description: 'Only delete merged branches' },
      { flag: '--stale', description: 'Only delete stale branches' },
      { flag: '--all', description: 'Delete both merged and stale' },
    ],
    examples: [
      { command: 'wit cleanup --dry-run', description: 'Preview branch cleanup' },
      { command: 'wit cleanup --merged', description: 'Delete merged branches' },
      { command: 'wit cleanup --all --force', description: 'Force delete all cleanup candidates' },
    ],
    seeAlso: ['branch', 'gc'],
  },

  stats: {
    name: 'stats',
    summary: 'Repository statistics dashboard',
    usage: 'wit stats [options]',
    description: 'Display repository statistics including commits, contributors, and file changes.',
    options: [
      { flag: '--all', description: 'Show all statistics' },
    ],
    examples: [
      { command: 'wit stats', description: 'Show repository statistics' },
      { command: 'wit stats --all', description: 'Show detailed statistics' },
    ],
    seeAlso: ['log', 'blame'],
  },

  snapshot: {
    name: 'snapshot',
    summary: 'Create/restore quick checkpoints',
    usage: 'wit snapshot [create|restore|list|delete] [<name>]',
    description: 'Manage quick snapshots of your working directory. Faster and simpler than stash.',
    options: [
      { flag: 'create [<name>]', description: 'Create a snapshot' },
      { flag: 'restore <name>', description: 'Restore a snapshot' },
      { flag: 'list', description: 'List all snapshots' },
      { flag: 'delete <name>', description: 'Delete a snapshot' },
    ],
    examples: [
      { command: 'wit snapshot create', description: 'Create quick snapshot' },
      { command: 'wit snapshot create before-refactor', description: 'Create named snapshot' },
      { command: 'wit snapshot restore before-refactor', description: 'Restore snapshot' },
      { command: 'wit snapshot list', description: 'List all snapshots' },
    ],
    seeAlso: ['stash', 'wip', 'commit'],
  },

  // ============ Monorepo Support ============
  scope: {
    name: 'scope',
    summary: 'Manage repository scope for monorepo operations',
    usage: 'wit scope [set|use|clear|show] [<args>]',
    description: 'Limit operations to specific paths in a monorepo. Improves performance for large repos.',
    options: [
      { flag: 'set <path>...', description: 'Set scope to specific paths' },
      { flag: 'use <preset>', description: 'Use a preset scope (frontend, backend, docs)' },
      { flag: 'clear', description: 'Clear scope restrictions' },
      { flag: 'show', description: 'Show current scope (default)' },
    ],
    examples: [
      { command: 'wit scope', description: 'Show current scope' },
      { command: 'wit scope set packages/core', description: 'Scope to core package' },
      { command: 'wit scope use frontend', description: 'Use frontend preset' },
      { command: 'wit scope clear', description: 'Clear scope' },
    ],
    seeAlso: ['status', 'add', 'diff'],
  },

  // ============ AI-Powered Features ============
  ai: {
    name: 'ai',
    summary: 'AI-powered git assistance',
    usage: 'wit ai <subcommand|query>',
    description: 'Use AI for commit messages, code review, explanations, and natural language commands.',
    options: [
      { flag: '<query>', description: 'Natural language git command' },
      { flag: 'commit [-a] [-x]', description: 'Generate commit message' },
      { flag: 'review', description: 'AI code review' },
      { flag: 'explain [<ref>]', description: 'Explain a commit' },
      { flag: 'resolve [<file>]', description: 'AI-assisted conflict resolution' },
      { flag: 'status', description: 'Show AI configuration' },
    ],
    examples: [
      { command: 'wit ai "what files changed?"', description: 'Natural language query' },
      { command: 'wit ai commit', description: 'Generate commit message' },
      { command: 'wit ai commit -a -x', description: 'Auto-stage and execute' },
      { command: 'wit ai review', description: 'Review staged changes' },
      { command: 'wit ai explain HEAD~1', description: 'Explain previous commit' },
    ],
    seeAlso: ['commit', 'diff', 'status'],
  },

  // ============ Visual Interface ============
  ui: {
    name: 'ui',
    summary: 'Launch interactive terminal UI (TUI)',
    usage: 'wit ui',
    description: 'Launch an interactive terminal-based user interface for managing your repository.',
    examples: [
      { command: 'wit ui', description: 'Launch terminal UI' },
    ],
    seeAlso: ['web', 'graph'],
  },

  web: {
    name: 'web',
    summary: 'Launch web UI in browser',
    usage: 'wit web [--port <n>]',
    description: 'Launch a web-based user interface in your browser.',
    options: [
      { flag: '--port <n>', description: 'Port number (default: 3847)' },
    ],
    examples: [
      { command: 'wit web', description: 'Launch web UI' },
      { command: 'wit web --port 8080', description: 'Launch on custom port' },
    ],
    seeAlso: ['ui', 'graph'],
  },

  graph: {
    name: 'graph',
    summary: 'Show commit graph in terminal',
    usage: 'wit graph [options]',
    description: 'Display a visual commit graph in the terminal.',
    options: [
      { flag: '-n <number>', description: 'Number of commits to show (default: 20)' },
    ],
    examples: [
      { command: 'wit graph', description: 'Show commit graph' },
      { command: 'wit graph -n 50', description: 'Show last 50 commits' },
    ],
    seeAlso: ['log', 'ui'],
  },

  // ============ Plumbing Commands ============
  'cat-file': {
    name: 'cat-file',
    summary: 'Provide content or type info for repository objects',
    usage: 'wit cat-file [options] <object>',
    description: 'Low-level command to inspect objects in the object database.',
    options: [
      { flag: '<object>', description: 'Object hash to inspect' },
      { flag: '-t, --type', description: 'Show object type' },
      { flag: '-p, --print', description: 'Pretty-print object content' },
      { flag: '--size', description: 'Show object size' },
    ],
    examples: [
      { command: 'wit cat-file -t abc1234', description: 'Show object type' },
      { command: 'wit cat-file -p abc1234', description: 'Pretty-print object' },
    ],
    seeAlso: ['hash-object', 'ls-tree', 'show'],
  },

  'hash-object': {
    name: 'hash-object',
    summary: 'Compute object ID and optionally create a blob from a file',
    usage: 'wit hash-object [options] <file>',
    description: 'Low-level command to compute the hash of a file and optionally store it.',
    options: [
      { flag: '<file>', description: 'File to hash' },
      { flag: '-w, --write', description: 'Write the object to the database' },
      { flag: '--stdin', description: 'Read from stdin' },
    ],
    examples: [
      { command: 'wit hash-object file.txt', description: 'Compute hash of file' },
      { command: 'wit hash-object -w file.txt', description: 'Store file as blob' },
    ],
    seeAlso: ['cat-file', 'add'],
  },

  'ls-files': {
    name: 'ls-files',
    summary: 'Show information about files in the index',
    usage: 'wit ls-files [options]',
    description: 'Low-level command to show files tracked in the index.',
    options: [
      { flag: '-s, --stage', description: 'Show staged contents mode, hash, and stage number' },
    ],
    examples: [
      { command: 'wit ls-files', description: 'List indexed files' },
      { command: 'wit ls-files --stage', description: 'Show with staging info' },
    ],
    seeAlso: ['ls-tree', 'status'],
  },

  'ls-tree': {
    name: 'ls-tree',
    summary: 'List the contents of a tree object',
    usage: 'wit ls-tree [options] <tree-ish>',
    description: 'Low-level command to list contents of a tree object.',
    options: [
      { flag: '<tree-ish>', description: 'Tree or commit to list' },
      { flag: '-r, --recursive', description: 'Recurse into subtrees' },
      { flag: '--name-only', description: 'Show only file names' },
    ],
    examples: [
      { command: 'wit ls-tree HEAD', description: 'List files in HEAD' },
      { command: 'wit ls-tree -r HEAD', description: 'List all files recursively' },
    ],
    seeAlso: ['ls-files', 'cat-file'],
  },

  'rev-parse': {
    name: 'rev-parse',
    summary: 'Pick out and massage parameters',
    usage: 'wit rev-parse [options] <ref>',
    description: 'Low-level command to parse revision specifications.',
    options: [
      { flag: '<ref>', description: 'Reference to parse' },
      { flag: '--short', description: 'Output short hash' },
      { flag: '--verify', description: 'Verify ref exists' },
      { flag: '--abbrev-ref', description: 'Output branch name if possible' },
    ],
    examples: [
      { command: 'wit rev-parse HEAD', description: 'Get HEAD hash' },
      { command: 'wit rev-parse --short HEAD', description: 'Get short hash' },
      { command: 'wit rev-parse --abbrev-ref HEAD', description: 'Get branch name' },
    ],
    seeAlso: ['show-ref', 'symbolic-ref'],
  },

  'update-ref': {
    name: 'update-ref',
    summary: 'Update the object name stored in a ref safely',
    usage: 'wit update-ref <ref> <newvalue>',
    description: 'Low-level command to update a reference.',
    options: [
      { flag: '<ref>', description: 'Reference to update' },
      { flag: '<newvalue>', description: 'New hash value' },
      { flag: '-d', description: 'Delete the reference' },
    ],
    examples: [
      { command: 'wit update-ref refs/heads/main abc1234', description: 'Update main to hash' },
      { command: 'wit update-ref -d refs/heads/old', description: 'Delete reference' },
    ],
    seeAlso: ['symbolic-ref', 'show-ref'],
  },

  'symbolic-ref': {
    name: 'symbolic-ref',
    summary: 'Read, modify and delete symbolic refs',
    usage: 'wit symbolic-ref [options] <name> [<ref>]',
    description: 'Low-level command to manage symbolic references like HEAD.',
    options: [
      { flag: '<name>', description: 'Symbolic reference name' },
      { flag: '<ref>', description: 'Target reference (for setting)' },
      { flag: '-d', description: 'Delete the symbolic reference' },
      { flag: '--short', description: 'Show shortened name' },
    ],
    examples: [
      { command: 'wit symbolic-ref HEAD', description: 'Show what HEAD points to' },
      { command: 'wit symbolic-ref HEAD refs/heads/main', description: 'Set HEAD to main' },
    ],
    seeAlso: ['update-ref', 'rev-parse'],
  },

  'for-each-ref': {
    name: 'for-each-ref',
    summary: 'Output information on each ref',
    usage: 'wit for-each-ref [options] [<pattern>...]',
    description: 'Low-level command to iterate over refs with formatting.',
    options: [
      { flag: '<pattern>', description: 'Pattern to filter refs' },
      { flag: '--format <fmt>', description: 'Format string for output' },
      { flag: '--sort <key>', description: 'Sort by key' },
    ],
    examples: [
      { command: 'wit for-each-ref refs/heads', description: 'List all branches' },
      { command: 'wit for-each-ref --format="%(refname)"', description: 'Custom format' },
    ],
    seeAlso: ['show-ref', 'branch'],
  },

  'show-ref': {
    name: 'show-ref',
    summary: 'List references in a local repository',
    usage: 'wit show-ref [options] [<pattern>...]',
    description: 'Low-level command to list references.',
    options: [
      { flag: '<pattern>', description: 'Pattern to filter refs' },
      { flag: '--heads', description: 'Show only branches' },
      { flag: '--tags', description: 'Show only tags' },
      { flag: '--verify', description: 'Verify ref exists' },
    ],
    examples: [
      { command: 'wit show-ref', description: 'List all refs' },
      { command: 'wit show-ref --heads', description: 'List branches only' },
    ],
    seeAlso: ['for-each-ref', 'rev-parse'],
  },

  fsck: {
    name: 'fsck',
    summary: 'Verify the connectivity and validity of objects',
    usage: 'wit fsck [options]',
    description: 'Low-level command to verify object database integrity.',
    options: [
      { flag: '--full', description: 'Check all objects' },
      { flag: '--unreachable', description: 'Show unreachable objects' },
    ],
    examples: [
      { command: 'wit fsck', description: 'Check object database' },
      { command: 'wit fsck --full', description: 'Full integrity check' },
    ],
    seeAlso: ['gc', 'cat-file'],
  },
};

/**
 * Format command help for display
 */
export function formatCommandHelp(help: CommandHelp): string {
  const lines: string[] = [];
  
  // Header
  lines.push(`wit ${help.name} - ${help.summary}`);
  lines.push('');
  
  // Usage
  lines.push('Usage:');
  lines.push(`  ${help.usage}`);
  lines.push('');
  
  // Description
  if (help.description) {
    lines.push('Description:');
    lines.push(`  ${help.description}`);
    lines.push('');
  }
  
  // Options
  if (help.options && help.options.length > 0) {
    lines.push('Options:');
    const maxFlagLen = Math.max(...help.options.map(o => o.flag.length));
    for (const opt of help.options) {
      const padding = ' '.repeat(maxFlagLen - opt.flag.length + 2);
      lines.push(`  ${opt.flag}${padding}${opt.description}`);
    }
    lines.push('');
  }
  
  // Examples
  if (help.examples && help.examples.length > 0) {
    lines.push('Examples:');
    for (const ex of help.examples) {
      lines.push(`  ${ex.command}`);
      lines.push(`      ${ex.description}`);
    }
    lines.push('');
  }
  
  // See also
  if (help.seeAlso && help.seeAlso.length > 0) {
    lines.push('See also:');
    lines.push(`  ${help.seeAlso.map(c => `wit ${c}`).join(', ')}`);
  }
  
  return lines.join('\n');
}

/**
 * Print help for a command
 */
export function printCommandHelp(command: string): boolean {
  const help = COMMAND_HELP[command];
  if (help) {
    console.log(formatCommandHelp(help));
    return true;
  }
  return false;
}

/**
 * Check if args contain --help or -h
 */
export function hasHelpFlag(args: string[]): boolean {
  return args.includes('--help') || args.includes('-h');
}
