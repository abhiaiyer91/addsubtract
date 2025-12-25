/**
 * Tag Command
 * Create, list, and delete tags
 * 
 * Usage:
 * - tsgit tag                    # List all tags
 * - tsgit tag v1.0.0             # Create lightweight tag
 * - tsgit tag -a v1.0.0 -m "msg" # Create annotated tag
 * - tsgit tag -d v1.0.0          # Delete tag
 * - tsgit tag -l "v1.*"          # List tags matching pattern
 * - tsgit tag -v v1.0.0          # Show tag details
 */

import * as path from 'path';
import { Repository } from '../core/repository';
import { Tag as TagObject } from '../core/object';
import { TsgitError, ErrorCode } from '../core/errors';
import { exists, readFileText, writeFile, readDir } from '../utils/fs';
import { Author } from '../core/types';

const colors = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

export interface TagOptions {
  annotated?: boolean;
  message?: string;
  delete?: boolean;
  list?: boolean;
  pattern?: string;
  verify?: boolean;
  force?: boolean;
}

/**
 * Create a lightweight tag
 */
export function createLightweightTag(repo: Repository, name: string, ref?: string, force?: boolean): string {
  // Resolve target
  const target = ref || 'HEAD';
  const hash = repo.refs.resolve(target);
  
  if (!hash) {
    throw new TsgitError(
      `Cannot resolve '${target}'`,
      ErrorCode.REFERENCE_NOT_FOUND,
      ['Check that the commit or reference exists']
    );
  }

  // Check if tag already exists
  if (repo.refs.tagExists(name) && !force) {
    throw new TsgitError(
      `Tag '${name}' already exists`,
      ErrorCode.OPERATION_FAILED,
      [
        `tsgit tag -d ${name}    # Delete existing tag first`,
        `tsgit tag -f ${name}    # Force overwrite`
      ]
    );
  }

  // Create or update tag
  repo.refs.createTag(name, hash);
  
  return hash;
}

/**
 * Create an annotated tag
 */
export function createAnnotatedTag(
  repo: Repository, 
  name: string, 
  message: string, 
  ref?: string, 
  force?: boolean
): string {
  // Resolve target
  const target = ref || 'HEAD';
  const targetHash = repo.refs.resolve(target);
  
  if (!targetHash) {
    throw new TsgitError(
      `Cannot resolve '${target}'`,
      ErrorCode.REFERENCE_NOT_FOUND,
      ['Check that the commit or reference exists']
    );
  }

  // Check if tag already exists
  if (repo.refs.tagExists(name) && !force) {
    throw new TsgitError(
      `Tag '${name}' already exists`,
      ErrorCode.OPERATION_FAILED,
      [
        `tsgit tag -d ${name}    # Delete existing tag first`,
        `tsgit tag -f ${name}    # Force overwrite`
      ]
    );
  }

  // Determine object type
  let objectType = 'commit';
  try {
    const obj = repo.objects.read(targetHash);
    objectType = obj.type;
  } catch {
    objectType = 'commit';
  }

  // Create tagger info
  const tagger: Author = {
    name: process.env.TSGIT_AUTHOR_NAME || process.env.GIT_AUTHOR_NAME || 'Anonymous',
    email: process.env.TSGIT_AUTHOR_EMAIL || process.env.GIT_AUTHOR_EMAIL || 'anonymous@example.com',
    timestamp: Math.floor(Date.now() / 1000),
    timezone: getTimezone(),
  };

  // Create tag object
  const tagObject = new TagObject(targetHash, objectType, name, tagger, message);
  const tagHash = repo.objects.writeObject(tagObject);

  // Create tag reference pointing to the tag object
  if (repo.refs.tagExists(name)) {
    repo.refs.deleteTag(name);
  }
  repo.refs.createTag(name, tagHash);

  return tagHash;
}

/**
 * Delete a tag
 */
export function deleteTag(repo: Repository, name: string): void {
  if (!repo.refs.tagExists(name)) {
    throw new TsgitError(
      `Tag '${name}' not found`,
      ErrorCode.REFERENCE_NOT_FOUND,
      ['tsgit tag    # List available tags']
    );
  }

  repo.refs.deleteTag(name);
}

/**
 * List tags, optionally matching a pattern
 */
export function listTags(repo: Repository, pattern?: string): string[] {
  const tags = repo.refs.listTags();
  
  if (!pattern) {
    return tags.sort();
  }

  // Convert glob pattern to regex
  const regex = new RegExp(
    '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
  );

  return tags.filter(tag => regex.test(tag)).sort();
}

/**
 * Get tag information
 */
export function getTagInfo(repo: Repository, name: string): {
  name: string;
  hash: string;
  targetHash: string;
  isAnnotated: boolean;
  message?: string;
  tagger?: Author;
  date?: Date;
} {
  if (!repo.refs.tagExists(name)) {
    throw new TsgitError(
      `Tag '${name}' not found`,
      ErrorCode.REFERENCE_NOT_FOUND,
      ['tsgit tag    # List available tags']
    );
  }

  const hash = repo.refs.resolve(name)!;
  
  try {
    const obj = repo.objects.read(hash);
    
    if (obj.type === 'tag') {
      const tagObj = obj as TagObject;
      return {
        name,
        hash,
        targetHash: tagObj.objectHash,
        isAnnotated: true,
        message: tagObj.message,
        tagger: tagObj.tagger,
        date: new Date(tagObj.tagger.timestamp * 1000),
      };
    }
  } catch {
    // Not a tag object, it's lightweight
  }

  // Lightweight tag
  return {
    name,
    hash,
    targetHash: hash,
    isAnnotated: false,
  };
}

/**
 * Get timezone string
 */
function getTimezone(): string {
  const offset = new Date().getTimezoneOffset();
  const sign = offset <= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
  const minutes = (Math.abs(offset) % 60).toString().padStart(2, '0');
  return `${sign}${hours}${minutes}`;
}

/**
 * CLI handler for tag command
 */
export function handleTag(args: string[]): void {
  const repo = Repository.find();
  const options: TagOptions = {};
  const positional: string[] = [];

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-a' || arg === '--annotate') {
      options.annotated = true;
    } else if (arg === '-m' || arg === '--message') {
      if (i + 1 < args.length) {
        options.message = args[++i];
        options.annotated = true;  // -m implies -a
      }
    } else if (arg === '-d' || arg === '--delete') {
      options.delete = true;
    } else if (arg === '-l' || arg === '--list') {
      options.list = true;
      if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        options.pattern = args[++i];
      }
    } else if (arg === '-v' || arg === '--verify') {
      options.verify = true;
    } else if (arg === '-f' || arg === '--force') {
      options.force = true;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
  }

  try {
    // Delete tag
    if (options.delete) {
      if (positional.length === 0) {
        throw new TsgitError(
          'No tag name specified',
          ErrorCode.OPERATION_FAILED,
          ['tsgit tag -d <tagname>']
        );
      }

      for (const tagName of positional) {
        deleteTag(repo, tagName);
        console.log(colors.green('✓') + ` Deleted tag '${tagName}'`);
      }
      return;
    }

    // Verify/show tag
    if (options.verify) {
      if (positional.length === 0) {
        throw new TsgitError(
          'No tag name specified',
          ErrorCode.OPERATION_FAILED,
          ['tsgit tag -v <tagname>']
        );
      }

      for (const tagName of positional) {
        const info = getTagInfo(repo, tagName);
        
        console.log(colors.bold(`tag ${info.name}`));
        console.log(`Target: ${colors.yellow(info.targetHash.slice(0, 8))}`);
        console.log(`Type: ${info.isAnnotated ? 'annotated' : 'lightweight'}`);
        
        if (info.isAnnotated && info.tagger) {
          console.log(`Tagger: ${info.tagger.name} <${info.tagger.email}>`);
          console.log(`Date: ${info.date?.toLocaleString()}`);
          if (info.message) {
            console.log();
            console.log(info.message);
          }
        }
        console.log();
      }
      return;
    }

    // List tags
    if (options.list || positional.length === 0) {
      const tags = listTags(repo, options.pattern);
      
      if (tags.length === 0) {
        console.log(colors.dim('No tags'));
      } else {
        for (const tag of tags) {
          console.log(tag);
        }
      }
      return;
    }

    // Create tag
    const tagName = positional[0];
    const ref = positional[1];  // Optional target

    if (options.annotated) {
      if (!options.message) {
        throw new TsgitError(
          'Annotated tag requires a message',
          ErrorCode.OPERATION_FAILED,
          ['tsgit tag -a <tagname> -m "message"']
        );
      }

      const hash = createAnnotatedTag(repo, tagName, options.message, ref, options.force);
      console.log(colors.green('✓') + ` Created annotated tag '${tagName}'`);
      console.log(colors.dim(`  Object: ${hash.slice(0, 8)}`));
    } else {
      const hash = createLightweightTag(repo, tagName, ref, options.force);
      console.log(colors.green('✓') + ` Created tag '${tagName}'`);
      console.log(colors.dim(`  Points to: ${hash.slice(0, 8)}`));
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
