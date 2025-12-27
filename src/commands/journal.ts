/**
 * Journal Commands
 *
 * Notion-like documentation for repositories.
 *
 * Usage:
 *   wit journal                    List all pages (root level)
 *   wit journal create <title>     Create a new page
 *   wit journal view <slug>        View a page
 *   wit journal edit <slug>        Edit a page
 *   wit journal delete <slug>      Delete a page
 *   wit journal tree               Show page hierarchy
 *   wit journal search <query>     Search pages
 *   wit journal publish <slug>     Publish a page
 *   wit journal archive <slug>     Archive a page
 *   wit journal history <slug>     View page history
 */

import { getApiClient, ApiError, getServerUrl } from '../api/client';
import { Repository } from '../core/repository';
import { parseRemoteUrl } from '../core/protocol';
import { TsgitError, ErrorCode } from '../core/errors';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
  blue: (s: string) => `\x1b[34m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

// Status colors and icons
const STATUS_CONFIG: Record<string, { icon: string; color: (s: string) => string }> = {
  draft: { icon: '○', color: colors.dim },
  published: { icon: '●', color: colors.green },
  archived: { icon: '◌', color: colors.yellow },
};

export const JOURNAL_HELP = `
wit journal - Repository documentation (Notion-like)

Usage: wit journal <command> [options]

Commands:
  (no command)        List all pages (root level)
  list                List all pages (with options)
  create <title>      Create a new page
  view <slug>         View page content
  edit <slug>         Update a page
  delete <slug>       Delete a page (and children)
  tree                Show page hierarchy
  search <query>      Search pages by title or content
  publish <slug>      Publish a draft page
  unpublish <slug>    Revert to draft
  archive <slug>      Archive a page
  move <slug>         Move page to different parent
  history <slug>      View page version history
  restore <slug> <v>  Restore page to version

Options:
  -h, --help          Show this help message
  --content, -c       Page content (markdown)
  --icon, -i          Page icon (emoji)
  --parent, -p        Parent page slug
  --status, -s        Filter by status (draft, published, archived)

Examples:
  wit journal                               # List root pages
  wit journal create "Getting Started"      # Create a page
  wit journal create "API Docs" -p getting-started  # Create nested page
  wit journal view getting-started          # View page
  wit journal edit getting-started -c "# Welcome"   # Update content
  wit journal tree                          # Show hierarchy
  wit journal search "authentication"       # Search pages
  wit journal publish getting-started       # Publish page
  wit journal history getting-started       # View history
  wit journal restore getting-started 3     # Restore to version 3
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
    c: 'content',
    i: 'icon',
    p: 'parent',
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
  return config.color(`${config.icon} ${status}`);
}

/**
 * Format date
 */
function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Print tree recursively
 */
function printTree(
  pages: Array<{ title: string; slug: string; status: string; icon?: string; children: any[] }>,
  indent: string = '',
  isLast: boolean = true
): void {
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const isLastItem = i === pages.length - 1;
    const prefix = indent + (isLastItem ? '└── ' : '├── ');
    const icon = page.icon || '📄';
    const statusIcon = STATUS_CONFIG[page.status]?.icon || '?';
    
    console.log(`${prefix}${statusIcon} ${icon} ${page.title} ${colors.dim(`(${page.slug})`)}`);
    
    if (page.children && page.children.length > 0) {
      const childIndent = indent + (isLastItem ? '    ' : '│   ');
      printTree(page.children, childIndent, isLastItem);
    }
  }
}

/**
 * Main handler for journal command
 */
export async function handleJournal(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (subcommand === '-h' || subcommand === '--help') {
    console.log(JOURNAL_HELP);
    return;
  }

  try {
    // Default to list if no subcommand or if first arg is a flag
    if (!subcommand || subcommand.startsWith('-')) {
      await handleJournalList(args);
      return;
    }

    switch (subcommand) {
      case 'list':
        await handleJournalList(args.slice(1));
        break;
      case 'create':
        await handleJournalCreate(args.slice(1));
        break;
      case 'view':
        await handleJournalView(args.slice(1));
        break;
      case 'edit':
        await handleJournalEdit(args.slice(1));
        break;
      case 'delete':
        await handleJournalDelete(args.slice(1));
        break;
      case 'tree':
        await handleJournalTree(args.slice(1));
        break;
      case 'search':
        await handleJournalSearch(args.slice(1));
        break;
      case 'publish':
        await handleJournalPublish(args.slice(1));
        break;
      case 'unpublish':
        await handleJournalUnpublish(args.slice(1));
        break;
      case 'archive':
        await handleJournalArchive(args.slice(1));
        break;
      case 'move':
        await handleJournalMove(args.slice(1));
        break;
      case 'history':
        await handleJournalHistory(args.slice(1));
        break;
      case 'restore':
        await handleJournalRestore(args.slice(1));
        break;
      default:
        // Treat as a slug and show the page
        await handleJournalView([subcommand, ...args.slice(1)]);
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
 * List journal pages
 */
async function handleJournalList(args: string[]): Promise<void> {
  const repo = Repository.find();
  const api = getApiClient();
  const { flags } = parseArgs(args);

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const statusFilter = flags.status as string | undefined;
  const parentFilter = flags.parent as string | undefined;

  const pages = await api.journal.list(owner, repoName, {
    status: statusFilter as 'draft' | 'published' | 'archived' | undefined,
    parentId: parentFilter === undefined ? null : parentFilter,
  });

  if (pages.length === 0) {
    console.log(colors.dim('No journal pages yet'));
    console.log(colors.dim('Create one with: wit journal create "Page Title"'));
    return;
  }

  console.log(`\n${colors.bold('Journal Pages:')}\n`);

  for (const page of pages) {
    const statusStr = formatStatus(page.status);
    const icon = page.icon || '📄';
    const date = formatDate(page.updatedAt);
    
    console.log(`  ${statusStr}  ${icon} ${colors.bold(page.title)}`);
    console.log(`      ${colors.dim(page.slug)} · ${colors.dim(date)}`);
  }
  console.log();
}

/**
 * Create a new journal page
 */
async function handleJournalCreate(args: string[]): Promise<void> {
  const repo = Repository.find();
  const api = getApiClient();
  const { flags, positional } = parseArgs(args);

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const title = positional[0];
  if (!title) {
    console.error(colors.red('error: ') + 'Page title required');
    console.error('usage: wit journal create "Page Title"');
    process.exit(1);
  }

  console.log(`Creating page: ${colors.bold(title)}`);

  // Get parent page ID if slug provided
  let parentId: string | undefined;
  if (flags.parent) {
    const parentPage = await api.journal.get(owner, repoName, flags.parent as string);
    parentId = parentPage.id;
  }

  const pageData: {
    title: string;
    slug?: string;
    content?: string;
    icon?: string;
    parentId?: string;
  } = {
    title,
    content: flags.content as string | undefined,
    icon: flags.icon as string | undefined,
    parentId,
  };

  const page = await api.journal.create(owner, repoName, pageData);
  
  console.log(colors.green('✓') + ` Created page "${page.title}"`);
  console.log(`  ${colors.dim('Slug:')} ${page.slug}`);
  console.log(`  ${colors.dim('Status:')} ${page.status}`);
  console.log(`  ${colors.dim(`${getServerUrl()}/${owner}/${repoName}/journal/${page.slug}`)}`);
}

/**
 * View a journal page
 */
async function handleJournalView(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const slug = positional[0];

  if (!slug) {
    console.error(colors.red('error: ') + 'Page slug required');
    console.error('usage: wit journal view <slug>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const page = await api.journal.get(owner, repoName, slug);

  console.log();
  if (page.icon) {
    console.log(`${page.icon} ${colors.bold(page.title)}`);
  } else {
    console.log(colors.bold(page.title));
  }
  console.log(colors.dim('═'.repeat(60)));
  
  console.log();
  console.log(`${colors.dim('Status:')}    ${formatStatus(page.status)}`);
  console.log(`${colors.dim('Author:')}    ${page.author.name}`);
  console.log(`${colors.dim('Created:')}   ${formatDate(page.createdAt)}`);
  console.log(`${colors.dim('Updated:')}   ${formatDate(page.updatedAt)}`);
  if (page.publishedAt) {
    console.log(`${colors.dim('Published:')} ${formatDate(page.publishedAt)}`);
  }
  
  console.log();
  console.log(colors.dim('─'.repeat(60)));
  console.log();
  
  if (page.content) {
    console.log(page.content);
  } else {
    console.log(colors.dim('(No content)'));
  }
  
  console.log();
}

/**
 * Edit a journal page
 */
async function handleJournalEdit(args: string[]): Promise<void> {
  const { flags, positional } = parseArgs(args);
  const slug = positional[0];

  if (!slug) {
    console.error(colors.red('error: ') + 'Page slug required');
    console.error('usage: wit journal edit <slug> --content "New content"');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const updates: {
    title?: string;
    content?: string;
    icon?: string | null;
  } = {};
  
  if (flags.title) updates.title = flags.title as string;
  if (flags.content) updates.content = flags.content as string;
  if (flags.icon !== undefined) {
    updates.icon = flags.icon === true ? null : (flags.icon as string);
  }

  if (Object.keys(updates).length === 0) {
    console.error(colors.red('error: ') + 'No updates specified');
    console.error('usage: wit journal edit <slug> --content "New content" --title "New Title"');
    process.exit(1);
  }

  const page = await api.journal.update(owner, repoName, slug, updates);
  
  console.log(colors.green('✓') + ` Updated page "${page.title}"`);
  console.log(`  ${colors.dim('Slug:')} ${page.slug}`);
}

/**
 * Delete a journal page
 */
async function handleJournalDelete(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const slug = positional[0];

  if (!slug) {
    console.error(colors.red('error: ') + 'Page slug required');
    console.error('usage: wit journal delete <slug>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  // Confirm unless --force is passed
  if (!flags.force) {
    console.log(colors.yellow('warning: ') + `This will delete page "${slug}" and all its children.`);
    console.log('Use --force to confirm.');
    process.exit(1);
  }

  await api.journal.delete(owner, repoName, slug);
  console.log(colors.yellow('✓') + ` Deleted page "${slug}"`);
}

/**
 * Show page tree
 */
async function handleJournalTree(args: string[]): Promise<void> {
  const repo = Repository.find();
  const api = getApiClient();
  const { flags } = parseArgs(args);

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const statusFilter = flags.status as string | undefined;
  
  const tree = await api.journal.tree(owner, repoName, {
    status: statusFilter as 'draft' | 'published' | 'archived' | undefined,
  });

  if (tree.length === 0) {
    console.log(colors.dim('No journal pages yet'));
    console.log(colors.dim('Create one with: wit journal create "Page Title"'));
    return;
  }

  console.log(`\n${colors.bold('Journal Tree:')}\n`);
  printTree(tree);
  console.log();
}

/**
 * Search pages
 */
async function handleJournalSearch(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const query = positional[0];

  if (!query) {
    console.error(colors.red('error: ') + 'Search query required');
    console.error('usage: wit journal search <query>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const pages = await api.journal.search(owner, repoName, query, {
    status: flags.status as 'draft' | 'published' | 'archived' | undefined,
    limit: 20,
  });

  if (pages.length === 0) {
    console.log(colors.dim(`No pages matching "${query}"`));
    return;
  }

  console.log(`\n${colors.bold(`Search results for "${query}":`)}\n`);

  for (const page of pages) {
    const statusStr = formatStatus(page.status);
    const icon = page.icon || '📄';
    
    console.log(`  ${statusStr}  ${icon} ${colors.bold(page.title)}`);
    console.log(`      ${colors.dim(page.slug)}`);
    
    // Show content snippet if available
    if (page.content) {
      const snippet = page.content.slice(0, 100).replace(/\n/g, ' ');
      console.log(`      ${colors.dim(snippet)}${page.content.length > 100 ? '...' : ''}`);
    }
  }
  console.log();
}

/**
 * Publish a page
 */
async function handleJournalPublish(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const slug = positional[0];

  if (!slug) {
    console.error(colors.red('error: ') + 'Page slug required');
    console.error('usage: wit journal publish <slug>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const page = await api.journal.publish(owner, repoName, slug);
  
  console.log(colors.green('✓') + ` Published "${page.title}"`);
  console.log(`  ${colors.dim(`${getServerUrl()}/${owner}/${repoName}/journal/${page.slug}`)}`);
}

/**
 * Unpublish a page
 */
async function handleJournalUnpublish(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const slug = positional[0];

  if (!slug) {
    console.error(colors.red('error: ') + 'Page slug required');
    console.error('usage: wit journal unpublish <slug>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const page = await api.journal.unpublish(owner, repoName, slug);
  
  console.log(colors.yellow('✓') + ` Unpublished "${page.title}" (now draft)`);
}

/**
 * Archive a page
 */
async function handleJournalArchive(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const slug = positional[0];

  if (!slug) {
    console.error(colors.red('error: ') + 'Page slug required');
    console.error('usage: wit journal archive <slug>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const page = await api.journal.archive(owner, repoName, slug);
  
  console.log(colors.yellow('✓') + ` Archived "${page.title}"`);
}

/**
 * Move a page
 */
async function handleJournalMove(args: string[]): Promise<void> {
  const { positional, flags } = parseArgs(args);
  const slug = positional[0];

  if (!slug) {
    console.error(colors.red('error: ') + 'Page slug required');
    console.error('usage: wit journal move <slug> --parent <parent-slug>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  // Get parent page ID if slug provided
  let newParentId: string | null = null;
  if (flags.parent && flags.parent !== 'root') {
    const parentPage = await api.journal.get(owner, repoName, flags.parent as string);
    newParentId = parentPage.id;
  }

  const page = await api.journal.move(owner, repoName, slug, { newParentId });
  
  console.log(colors.green('✓') + ` Moved "${page.title}"`);
  if (flags.parent === 'root') {
    console.log(`  ${colors.dim('Now at root level')}`);
  } else if (flags.parent) {
    console.log(`  ${colors.dim(`Now under: ${flags.parent}`)}`);
  }
}

/**
 * View page history
 */
async function handleJournalHistory(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const slug = positional[0];

  if (!slug) {
    console.error(colors.red('error: ') + 'Page slug required');
    console.error('usage: wit journal history <slug>');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const history = await api.journal.history(owner, repoName, slug);

  if (history.length === 0) {
    console.log(colors.dim('No history available'));
    return;
  }

  console.log(`\n${colors.bold('Page History:')}\n`);

  for (const entry of history) {
    const date = formatDate(entry.createdAt);
    const description = entry.changeDescription || 'No description';
    
    console.log(`  ${colors.cyan(`v${entry.version}`)} · ${date}`);
    console.log(`      ${colors.dim(description)}`);
    console.log(`      ${colors.dim(`by ${entry.authorId}`)}`);
  }
  
  console.log();
  console.log(colors.dim(`Restore with: wit journal restore ${slug} <version>`));
  console.log();
}

/**
 * Restore page to version
 */
async function handleJournalRestore(args: string[]): Promise<void> {
  const { positional } = parseArgs(args);
  const slug = positional[0];
  const version = positional[1];

  if (!slug || !version) {
    console.error(colors.red('error: ') + 'Page slug and version required');
    console.error('usage: wit journal restore <slug> <version>');
    process.exit(1);
  }

  const versionNum = parseInt(version, 10);
  if (isNaN(versionNum)) {
    console.error(colors.red('error: ') + 'Version must be a number');
    process.exit(1);
  }

  const repo = Repository.find();
  const api = getApiClient();

  const remoteUrl = getRemoteUrl(repo);
  const { owner, repo: repoName } = parseOwnerRepo(remoteUrl);

  const page = await api.journal.restoreVersion(owner, repoName, slug, versionNum);
  
  console.log(colors.green('✓') + ` Restored "${page.title}" to version ${versionNum}`);
}
