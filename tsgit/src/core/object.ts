import { ObjectType, TreeEntry, Author } from './types';
import { hashObject } from '../utils/hash';

/**
 * Base class for all Git objects
 */
export abstract class GitObject {
  abstract readonly type: ObjectType;
  abstract serialize(): Buffer;

  /**
   * Compute the SHA-1 hash of this object
   */
  hash(): string {
    return hashObject(this.type, this.serialize());
  }
}

/**
 * Blob object - stores file contents
 */
export class Blob extends GitObject {
  readonly type: ObjectType = 'blob';

  constructor(public readonly content: Buffer) {
    super();
  }

  serialize(): Buffer {
    return this.content;
  }

  static deserialize(data: Buffer): Blob {
    return new Blob(data);
  }

  toString(): string {
    return this.content.toString('utf8');
  }
}

/**
 * Tree object - stores directory structure
 */
export class Tree extends GitObject {
  readonly type: ObjectType = 'tree';

  constructor(public readonly entries: TreeEntry[]) {
    super();
  }

  serialize(): Buffer {
    // Sort entries by name (Git does this)
    const sorted = [...this.entries].sort((a, b) => {
      // Directories (trees) should have a trailing slash for sorting
      const aName = a.mode === '40000' ? a.name + '/' : a.name;
      const bName = b.mode === '40000' ? b.name + '/' : b.name;
      return aName.localeCompare(bName);
    });

    const parts: Buffer[] = [];
    for (const entry of sorted) {
      // Format: "{mode} {name}\0{20-byte-hash}"
      const modeAndName = Buffer.from(`${entry.mode} ${entry.name}\0`);
      const hashBytes = Buffer.from(entry.hash, 'hex');
      parts.push(modeAndName, hashBytes);
    }

    return Buffer.concat(parts);
  }

  static deserialize(data: Buffer): Tree {
    const entries: TreeEntry[] = [];
    let offset = 0;

    while (offset < data.length) {
      // Find the space after mode
      const spaceIndex = data.indexOf(0x20, offset);
      if (spaceIndex === -1) break;

      const mode = data.slice(offset, spaceIndex).toString('utf8');

      // Find the null byte after name
      const nullIndex = data.indexOf(0, spaceIndex + 1);
      if (nullIndex === -1) break;

      const name = data.slice(spaceIndex + 1, nullIndex).toString('utf8');

      // Read the 20-byte hash
      const hashBytes = data.slice(nullIndex + 1, nullIndex + 21);
      const hash = hashBytes.toString('hex');

      entries.push({ mode, name, hash });
      offset = nullIndex + 21;
    }

    return new Tree(entries);
  }
}

/**
 * Commit object - stores commit information
 */
export class Commit extends GitObject {
  readonly type: ObjectType = 'commit';

  constructor(
    public readonly treeHash: string,
    public readonly parentHashes: string[],
    public readonly author: Author,
    public readonly committer: Author,
    public readonly message: string
  ) {
    super();
  }

  serialize(): Buffer {
    const lines: string[] = [];

    lines.push(`tree ${this.treeHash}`);
    for (const parent of this.parentHashes) {
      lines.push(`parent ${parent}`);
    }
    lines.push(`author ${formatAuthor(this.author)}`);
    lines.push(`committer ${formatAuthor(this.committer)}`);
    lines.push('');
    lines.push(this.message);

    return Buffer.from(lines.join('\n'));
  }

  static deserialize(data: Buffer): Commit {
    const text = data.toString('utf8');
    const lines = text.split('\n');

    let treeHash = '';
    const parentHashes: string[] = [];
    let author: Author | null = null;
    let committer: Author | null = null;
    let messageStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line === '') {
        messageStart = i + 1;
        break;
      }

      if (line.startsWith('tree ')) {
        treeHash = line.slice(5);
      } else if (line.startsWith('parent ')) {
        parentHashes.push(line.slice(7));
      } else if (line.startsWith('author ')) {
        author = parseAuthor(line.slice(7));
      } else if (line.startsWith('committer ')) {
        committer = parseAuthor(line.slice(10));
      }
    }

    const message = lines.slice(messageStart).join('\n');

    if (!treeHash || !author || !committer) {
      throw new Error('Invalid commit format');
    }

    return new Commit(treeHash, parentHashes, author, committer, message);
  }
}

/**
 * Tag object - stores annotated tag information
 */
export class Tag extends GitObject {
  readonly type: ObjectType = 'tag';

  constructor(
    public readonly objectHash: string,
    public readonly objectType: ObjectType,
    public readonly tagName: string,
    public readonly tagger: Author,
    public readonly message: string
  ) {
    super();
  }

  serialize(): Buffer {
    const lines: string[] = [];

    lines.push(`object ${this.objectHash}`);
    lines.push(`type ${this.objectType}`);
    lines.push(`tag ${this.tagName}`);
    lines.push(`tagger ${formatAuthor(this.tagger)}`);
    lines.push('');
    lines.push(this.message);

    return Buffer.from(lines.join('\n'));
  }

  static deserialize(data: Buffer): Tag {
    const text = data.toString('utf8');
    const lines = text.split('\n');

    let objectHash = '';
    let objectType: ObjectType = 'commit';
    let tagName = '';
    let tagger: Author | null = null;
    let messageStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line === '') {
        messageStart = i + 1;
        break;
      }

      if (line.startsWith('object ')) {
        objectHash = line.slice(7);
      } else if (line.startsWith('type ')) {
        objectType = line.slice(5) as ObjectType;
      } else if (line.startsWith('tag ')) {
        tagName = line.slice(4);
      } else if (line.startsWith('tagger ')) {
        tagger = parseAuthor(line.slice(7));
      }
    }

    const message = lines.slice(messageStart).join('\n');

    if (!objectHash || !tagName || !tagger) {
      throw new Error('Invalid tag format');
    }

    return new Tag(objectHash, objectType, tagName, tagger, message);
  }
}

/**
 * Format author for serialization
 */
function formatAuthor(author: Author): string {
  return `${author.name} <${author.email}> ${author.timestamp} ${author.timezone}`;
}

/**
 * Parse author string
 */
function parseAuthor(str: string): Author {
  // Format: "Name <email> timestamp timezone"
  const match = str.match(/^(.+?) <(.+?)> (\d+) ([+-]\d{4})$/);
  if (!match) {
    throw new Error(`Invalid author format: ${str}`);
  }

  return {
    name: match[1],
    email: match[2],
    timestamp: parseInt(match[3], 10),
    timezone: match[4],
  };
}
