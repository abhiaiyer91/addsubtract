/**
 * Release Command
 * Create, list, view, edit, and manage releases with AI-powered release notes
 * 
 * Usage:
 * - wit release                     # List all releases
 * - wit release create <tag>        # Create a new release
 * - wit release create <tag> --generate  # Create with AI-generated notes
 * - wit release view <tag>          # View release details
 * - wit release edit <tag>          # Edit a release
 * - wit release delete <tag>        # Delete a release
 * - wit release publish <tag>       # Publish a draft release
 * - wit release notes <tag>         # Generate release notes (AI)
 * - wit release latest              # Show latest release
 */

import { Repository } from '../core/repository';
import { TsgitError, ErrorCode } from '../core/errors';
import { listTags, getTagInfo } from './tag';
import { colors } from '../utils/colors';

export interface ReleaseOptions {
  /** Create as draft release */
  draft?: boolean;
  /** Mark as pre-release */
  prerelease?: boolean;
  /** Release title */
  title?: string;
  /** Release body/notes */
  body?: string;
  /** Generate notes from commits */
  generate?: boolean;
  /** Previous tag for comparison */
  previous?: string;
  /** Output format */
  format?: 'text' | 'json' | 'markdown';
  /** Release notes style */
  style?: 'standard' | 'detailed' | 'minimal' | 'changelog';
  /** Force overwrite existing release */
  force?: boolean;
  /** Target commit/ref for the release */
  target?: string;
  /** Include stats in generated notes */
  includeStats?: boolean;
  /** Include contributors in generated notes */
  includeContributors?: boolean;
}

export const RELEASE_HELP = `
${colors.bold('wit release')} - Create and manage releases

${colors.bold('USAGE')}
  wit release                         List all releases
  wit release create <tag> [options]  Create a new release
  wit release view <tag>              View release details  
  wit release edit <tag> [options]    Edit a release
  wit release delete <tag>            Delete a release
  wit release publish <tag>           Publish a draft release
  wit release notes <tag> [options]   Generate AI release notes
  wit release latest                  Show the latest release

${colors.bold('CREATE OPTIONS')}
  -t, --title <title>     Release title (defaults to tag name)
  -m, --body <text>       Release notes body
  -g, --generate          Generate release notes from commits (AI)
  -p, --previous <tag>    Previous tag for comparison (defaults to last tag)
  -d, --draft             Create as draft release
  --prerelease            Mark as pre-release (e.g., beta, rc)
  --target <ref>          Target commit/branch for the tag
  --style <style>         Notes style: standard|detailed|minimal|changelog
  -f, --force             Overwrite existing release

${colors.bold('NOTES OPTIONS')}
  --style <style>         Output style: standard|detailed|minimal|changelog
  --no-stats              Exclude statistics from notes
  --no-contributors       Exclude contributors from notes
  --format <fmt>          Output format: text|json|markdown

${colors.bold('EXAMPLES')}
  ${colors.dim('# Create a release with AI-generated notes')}
  wit release create v1.2.0 --generate

  ${colors.dim('# Create a draft prerelease')}
  wit release create v2.0.0-beta.1 --draft --prerelease

  ${colors.dim('# Generate detailed release notes')}
  wit release notes v1.2.0 --style detailed

  ${colors.dim('# View the latest release')}
  wit release latest

  ${colors.dim('# Create release with custom notes')}
  wit release create v1.1.0 -t "Bug fixes" -m "Fixed critical issues"
`;

/**
 * Get commits between two refs
 */
async function getCommitsBetweenTags(
  repo: Repository,
  fromTag: string | null,
  toTag: string
): Promise<Array<{
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  email: string;
  date: string;
}>> {
  const commits: Array<{
    sha: string;
    shortSha: string;
    message: string;
    author: string;
    email: string;
    date: string;
  }> = [];

  // Get the target commit hash
  const toHash = repo.refs.resolve(toTag);
  if (!toHash) {
    throw new TsgitError(
      `Cannot resolve '${toTag}'`,
      ErrorCode.REF_NOT_FOUND,
      ['Check that the tag exists']
    );
  }

  // Get the from commit hash (if specified)
  let fromHash: string | null = null;
  if (fromTag) {
    fromHash = repo.refs.resolve(fromTag);
  }

  // Walk the commit history
  const visited = new Set<string>();
  const queue: string[] = [toHash];

  while (queue.length > 0) {
    const hash = queue.shift()!;
    
    // Stop if we reached the from commit
    if (fromHash && hash === fromHash) {
      continue;
    }

    if (visited.has(hash)) {
      continue;
    }
    visited.add(hash);

    try {
      const obj = repo.objects.readObject(hash);
      if (obj.type !== 'commit') {
        // Might be a tag object, try to dereference
        if (obj.type === 'tag') {
          const tagContent = obj.serialize().toString('utf-8');
          const objectMatch = tagContent.match(/^object ([a-f0-9]+)/m);
          if (objectMatch) {
            queue.unshift(objectMatch[1]);
          }
        }
        continue;
      }

      const content = obj.serialize().toString('utf-8');
      
      // Parse commit
      const lines = content.split('\n');
      let author = '';
      let email = '';
      let date = '';
      const parents: string[] = [];
      let inMessage = false;
      const messageLines: string[] = [];

      for (const line of lines) {
        if (inMessage) {
          messageLines.push(line);
        } else if (line === '') {
          inMessage = true;
        } else if (line.startsWith('parent ')) {
          parents.push(line.slice(7));
        } else if (line.startsWith('author ')) {
          // Parse: author Name <email> timestamp timezone
          const match = line.match(/^author (.+) <(.+)> (\d+) ([+-]\d+)$/);
          if (match) {
            author = match[1];
            email = match[2];
            const timestamp = parseInt(match[3], 10);
            date = new Date(timestamp * 1000).toISOString();
          }
        }
      }

      commits.push({
        sha: hash,
        shortSha: hash.slice(0, 7),
        message: messageLines.join('\n').trim(),
        author,
        email,
        date,
      });

      // Add parents to queue
      for (const parent of parents) {
        if (!visited.has(parent) && parent !== fromHash) {
          queue.push(parent);
        }
      }
    } catch {
      // Skip invalid objects
      continue;
    }
  }

  // Sort by date (newest first)
  commits.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return commits;
}

/**
 * Find the previous tag before a given tag
 */
function findPreviousTag(repo: Repository, currentTag: string): string | null {
  const tags = listTags(repo);
  
  // Sort tags (try semver, fall back to alphabetical)
  const sortedTags = tags.sort((a, b) => {
    // Try semver comparison
    const aMatch = a.match(/v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?/);
    const bMatch = b.match(/v?(\d+)\.(\d+)\.(\d+)(?:-(.+))?/);
    
    if (aMatch && bMatch) {
      const aMajor = parseInt(aMatch[1], 10);
      const bMajor = parseInt(bMatch[1], 10);
      if (aMajor !== bMajor) return bMajor - aMajor;
      
      const aMinor = parseInt(aMatch[2], 10);
      const bMinor = parseInt(bMatch[2], 10);
      if (aMinor !== bMinor) return bMinor - aMinor;
      
      const aPatch = parseInt(aMatch[3], 10);
      const bPatch = parseInt(bMatch[3], 10);
      if (aPatch !== bPatch) return bPatch - aPatch;
      
      // Pre-release versions come before release
      if (aMatch[4] && !bMatch[4]) return 1;
      if (!aMatch[4] && bMatch[4]) return -1;
      
      return (bMatch[4] || '').localeCompare(aMatch[4] || '');
    }
    
    return b.localeCompare(a);
  });

  const currentIndex = sortedTags.indexOf(currentTag);
  if (currentIndex === -1 || currentIndex === sortedTags.length - 1) {
    return null;
  }

  return sortedTags[currentIndex + 1];
}

/**
 * Generate release notes using AI
 */
async function generateReleaseNotes(
  repo: Repository,
  tag: string,
  previousTag: string | null,
  options: ReleaseOptions
): Promise<{ title: string; body: string }> {
  console.log(colors.dim('Analyzing commits...'));

  const commits = await getCommitsBetweenTags(repo, previousTag, tag);
  
  if (commits.length === 0) {
    return {
      title: tag,
      body: 'No commits found for this release.',
    };
  }

  console.log(colors.dim(`Found ${commits.length} commits`));

  // Import and use the release notes tool
  const { generateReleaseNotesTool } = await import('../ai/tools/generate-release-notes.js');

  const result = await generateReleaseNotesTool.execute({
    version: tag,
    previousVersion: previousTag || undefined,
    commits,
    style: options.style || 'standard',
    includeStats: options.includeStats !== false,
    includeContributors: options.includeContributors !== false,
  });

  // Handle validation error case
  if ('error' in result) {
    throw new TsgitError(
      'Failed to generate release notes',
      ErrorCode.OPERATION_FAILED,
      ['Check that the commits have valid messages']
    );
  }

  return {
    title: result.title,
    body: result.body,
  };
}

/**
 * List all releases (from tags)
 */
function listReleases(repo: Repository): void {
  const tags = listTags(repo);

  if (tags.length === 0) {
    console.log(colors.dim('No releases found'));
    console.log(colors.dim('Create a release with: wit release create <tag>'));
    return;
  }

  // Sort tags by semver if possible
  const sortedTags = [...tags].sort((a, b) => {
    const aMatch = a.match(/v?(\d+)\.(\d+)\.(\d+)/);
    const bMatch = b.match(/v?(\d+)\.(\d+)\.(\d+)/);
    
    if (aMatch && bMatch) {
      const aMajor = parseInt(aMatch[1], 10);
      const bMajor = parseInt(bMatch[1], 10);
      if (aMajor !== bMajor) return bMajor - aMajor;
      
      const aMinor = parseInt(aMatch[2], 10);
      const bMinor = parseInt(bMatch[2], 10);
      if (aMinor !== bMinor) return bMinor - aMinor;
      
      const aPatch = parseInt(aMatch[3], 10);
      const bPatch = parseInt(bMatch[3], 10);
      return bPatch - aPatch;
    }
    
    return b.localeCompare(a);
  });

  console.log(colors.bold('Releases'));
  console.log();

  for (let i = 0; i < sortedTags.length; i++) {
    const tag = sortedTags[i];
    const info = getTagInfo(repo, tag);
    
    const isLatest = i === 0;
    const isPrerelease = tag.match(/-(alpha|beta|rc|pre)/i);

    let line = '';
    
    // Tag name with styling
    if (isLatest) {
      line += colors.green(tag);
      line += colors.dim(' (latest)');
    } else if (isPrerelease) {
      line += colors.yellow(tag);
      line += colors.dim(' (pre-release)');
    } else {
      line += tag;
    }

    // Show commit info
    line += colors.dim(` ${info.targetHash.slice(0, 7)}`);

    // Show date if annotated
    if (info.date) {
      line += colors.dim(` ${formatDate(info.date)}`);
    }

    console.log(line);

    // Show message if annotated and has one
    if (info.message && info.message.trim()) {
      const firstLine = info.message.split('\n')[0];
      console.log(colors.dim(`  ${firstLine}`));
    }
  }
}

/**
 * View a specific release
 */
function viewRelease(repo: Repository, tag: string): void {
  if (!repo.refs.tagExists(tag)) {
    throw new TsgitError(
      `Release '${tag}' not found`,
      ErrorCode.REF_NOT_FOUND,
      [
        'wit release                # List all releases',
        `wit release create ${tag}  # Create this release`,
      ]
    );
  }

  const info = getTagInfo(repo, tag);
  
  console.log(colors.bold(`Release ${colors.green(tag)}`));
  console.log();
  console.log(`${colors.dim('Commit:')} ${info.targetHash.slice(0, 8)}`);
  console.log(`${colors.dim('Type:')} ${info.isAnnotated ? 'Annotated' : 'Lightweight'}`);

  if (info.tagger) {
    console.log(`${colors.dim('Author:')} ${info.tagger.name} <${info.tagger.email}>`);
  }

  if (info.date) {
    console.log(`${colors.dim('Date:')} ${info.date.toLocaleString()}`);
  }

  if (info.message) {
    console.log();
    console.log(colors.bold('Release Notes'));
    console.log();
    console.log(info.message);
  }
}

/**
 * Create a new release
 */
async function createRelease(
  repo: Repository,
  tag: string,
  options: ReleaseOptions
): Promise<void> {
  // Check if tag already exists
  if (repo.refs.tagExists(tag) && !options.force) {
    throw new TsgitError(
      `Release '${tag}' already exists`,
      ErrorCode.OPERATION_FAILED,
      [
        `wit release view ${tag}     # View existing release`,
        `wit release delete ${tag}   # Delete existing release`,
        `wit release create ${tag} -f  # Force overwrite`,
      ]
    );
  }

  let title = options.title || tag;
  let body = options.body || '';

  // Generate release notes if requested
  if (options.generate) {
    console.log(colors.cyan('Generating release notes...'));
    
    const previousTag = options.previous || findPreviousTag(repo, tag);
    if (previousTag) {
      console.log(colors.dim(`Comparing with ${previousTag}`));
    }

    const generated = await generateReleaseNotes(repo, tag, previousTag, options);
    title = generated.title;
    body = generated.body;
  }

  // Determine target
  const target = options.target || 'HEAD';
  const targetHash = repo.refs.resolve(target);
  if (!targetHash) {
    throw new TsgitError(
      `Cannot resolve target '${target}'`,
      ErrorCode.REF_NOT_FOUND,
      ['Check that the commit or branch exists']
    );
  }

  // Delete existing tag if forcing
  if (repo.refs.tagExists(tag)) {
    repo.refs.deleteTag(tag);
  }

  // Create annotated tag with release notes
  const { createAnnotatedTag } = await import('./tag.js');
  const message = body ? `${title}\n\n${body}` : title;
  createAnnotatedTag(repo, tag, message, target, true);

  console.log();
  console.log(colors.green('✓') + ` Created release ${colors.bold(tag)}`);
  console.log(colors.dim(`  Commit: ${targetHash.slice(0, 8)}`));
  
  if (options.draft) {
    console.log(colors.yellow('  Status: Draft'));
  }
  if (options.prerelease) {
    console.log(colors.yellow('  Status: Pre-release'));
  }

  // Show preview of notes if generated
  if (options.generate && body) {
    console.log();
    console.log(colors.bold('Release Notes Preview'));
    console.log(colors.dim('─'.repeat(40)));
    const preview = body.split('\n').slice(0, 10).join('\n');
    console.log(preview);
    if (body.split('\n').length > 10) {
      console.log(colors.dim('...'));
    }
  }
}

/**
 * Delete a release
 */
async function deleteRelease(repo: Repository, tag: string): Promise<void> {
  if (!repo.refs.tagExists(tag)) {
    throw new TsgitError(
      `Release '${tag}' not found`,
      ErrorCode.REF_NOT_FOUND,
      ['wit release  # List all releases']
    );
  }

  repo.refs.deleteTag(tag);
  console.log(colors.green('✓') + ` Deleted release '${tag}'`);
}

/**
 * Generate and display release notes
 */
async function showReleaseNotes(
  repo: Repository,
  tag: string,
  options: ReleaseOptions
): Promise<void> {
  const previousTag = options.previous || findPreviousTag(repo, tag);
  
  console.log(colors.bold(`Release Notes for ${tag}`));
  if (previousTag) {
    console.log(colors.dim(`Changes since ${previousTag}`));
  }
  console.log();

  const { title, body } = await generateReleaseNotes(repo, tag, previousTag, options);

  if (options.format === 'json') {
    // Get the full structured output
    const commits = await getCommitsBetweenTags(repo, previousTag, tag);
    const { generateReleaseNotesTool } = await import('../ai/tools/generate-release-notes.js');
    const result = await generateReleaseNotesTool.execute({
      version: tag,
      previousVersion: previousTag || undefined,
      commits,
      style: options.style || 'standard',
      includeStats: options.includeStats !== false,
      includeContributors: options.includeContributors !== false,
    });
    console.log(JSON.stringify(result, null, 2));
  } else if (options.format === 'markdown') {
    console.log(`# ${title}`);
    console.log();
    console.log(body);
  } else {
    console.log(colors.bold(title));
    console.log();
    console.log(body);
  }
}

/**
 * Show the latest release
 */
function showLatestRelease(repo: Repository): void {
  const tags = listTags(repo);
  
  if (tags.length === 0) {
    console.log(colors.dim('No releases found'));
    return;
  }

  // Sort and get latest
  const sortedTags = [...tags].sort((a, b) => {
    const aMatch = a.match(/v?(\d+)\.(\d+)\.(\d+)/);
    const bMatch = b.match(/v?(\d+)\.(\d+)\.(\d+)/);
    
    if (aMatch && bMatch) {
      const aMajor = parseInt(aMatch[1], 10);
      const bMajor = parseInt(bMatch[1], 10);
      if (aMajor !== bMajor) return bMajor - aMajor;
      
      const aMinor = parseInt(aMatch[2], 10);
      const bMinor = parseInt(bMatch[2], 10);
      if (aMinor !== bMinor) return bMinor - aMinor;
      
      const aPatch = parseInt(aMatch[3], 10);
      const bPatch = parseInt(bMatch[3], 10);
      return bPatch - aPatch;
    }
    
    return b.localeCompare(a);
  });

  viewRelease(repo, sortedTags[0]);
}

/**
 * Format a date for display
 */
function formatDate(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return 'today';
  } else if (days === 1) {
    return 'yesterday';
  } else if (days < 7) {
    return `${days} days ago`;
  } else if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  } else if (days < 365) {
    const months = Math.floor(days / 30);
    return `${months} month${months === 1 ? '' : 's'} ago`;
  } else {
    const years = Math.floor(days / 365);
    return `${years} year${years === 1 ? '' : 's'} ago`;
  }
}

/**
 * Parse release command arguments
 */
function parseReleaseArgs(args: string[]): {
  subcommand: string;
  tag?: string;
  options: ReleaseOptions;
} {
  const options: ReleaseOptions = {};
  let subcommand = 'list';
  let tag: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-t' || arg === '--title') {
      options.title = args[++i];
    } else if (arg === '-m' || arg === '--body' || arg === '--message') {
      options.body = args[++i];
    } else if (arg === '-g' || arg === '--generate') {
      options.generate = true;
    } else if (arg === '-p' || arg === '--previous') {
      options.previous = args[++i];
    } else if (arg === '-d' || arg === '--draft') {
      options.draft = true;
    } else if (arg === '--prerelease') {
      options.prerelease = true;
    } else if (arg === '--target') {
      options.target = args[++i];
    } else if (arg === '--style') {
      const style = args[++i] as any;
      if (['standard', 'detailed', 'minimal', 'changelog'].includes(style)) {
        options.style = style;
      }
    } else if (arg === '--format') {
      const format = args[++i] as any;
      if (['text', 'json', 'markdown'].includes(format)) {
        options.format = format;
      }
    } else if (arg === '-f' || arg === '--force') {
      options.force = true;
    } else if (arg === '--no-stats') {
      options.includeStats = false;
    } else if (arg === '--no-contributors') {
      options.includeContributors = false;
    } else if (arg === '-h' || arg === '--help') {
      console.log(RELEASE_HELP);
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  // Parse positional arguments
  if (positional.length > 0) {
    const cmd = positional[0];
    if (['create', 'view', 'edit', 'delete', 'publish', 'notes', 'latest', 'list'].includes(cmd)) {
      subcommand = cmd;
      tag = positional[1];
    } else {
      // First positional is a tag name (implied view)
      subcommand = 'view';
      tag = cmd;
    }
  }

  return { subcommand, tag, options };
}

/**
 * Main CLI handler for release command
 */
export async function handleRelease(args: string[]): Promise<void> {
  const { subcommand, tag, options } = parseReleaseArgs(args);

  try {
    const repo = Repository.find();

    switch (subcommand) {
      case 'list':
        listReleases(repo);
        break;

      case 'create':
        if (!tag) {
          throw new TsgitError(
            'No tag name specified',
            ErrorCode.OPERATION_FAILED,
            ['wit release create <tag>']
          );
        }
        await createRelease(repo, tag, options);
        break;

      case 'view':
        if (!tag) {
          throw new TsgitError(
            'No tag name specified',
            ErrorCode.OPERATION_FAILED,
            ['wit release view <tag>']
          );
        }
        viewRelease(repo, tag);
        break;

      case 'delete':
        if (!tag) {
          throw new TsgitError(
            'No tag name specified',
            ErrorCode.OPERATION_FAILED,
            ['wit release delete <tag>']
          );
        }
        await deleteRelease(repo, tag);
        break;

      case 'notes':
        if (!tag) {
          throw new TsgitError(
            'No tag name specified',
            ErrorCode.OPERATION_FAILED,
            ['wit release notes <tag>']
          );
        }
        await showReleaseNotes(repo, tag, options);
        break;

      case 'latest':
        showLatestRelease(repo);
        break;

      case 'edit':
        // Edit would typically open an editor or update via API
        // For now, suggest recreating with --force
        console.log(colors.yellow('Edit is not yet implemented locally.'));
        console.log(colors.dim('Use: wit release create <tag> --force'));
        break;

      case 'publish':
        // Publishing is a server-side concept
        console.log(colors.yellow('Publish is a server-side operation.'));
        console.log(colors.dim('Draft releases are managed through the web UI or API.'));
        break;

      default:
        console.log(RELEASE_HELP);
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
