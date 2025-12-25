import * as crypto from 'crypto';

/**
 * Compute SHA-1 hash of data (just like Git does)
 */
export function sha1(data: Buffer | string): string {
  return crypto.createHash('sha1').update(data).digest('hex');
}

/**
 * Compute hash for a Git object
 * Git hashes: "{type} {size}\0{content}"
 */
export function hashObject(type: string, content: Buffer): string {
  const header = Buffer.from(`${type} ${content.length}\0`);
  const store = Buffer.concat([header, content]);
  return sha1(store);
}

/**
 * Create the full storable format for a Git object
 */
export function createObjectBuffer(type: string, content: Buffer): Buffer {
  const header = Buffer.from(`${type} ${content.length}\0`);
  return Buffer.concat([header, content]);
}

/**
 * Parse a stored Git object back into type and content
 */
export function parseObjectBuffer(data: Buffer): { type: string; content: Buffer } {
  const nullIndex = data.indexOf(0);
  if (nullIndex === -1) {
    throw new Error('Invalid object format: no null byte found');
  }

  const header = data.slice(0, nullIndex).toString('utf8');
  const spaceIndex = header.indexOf(' ');
  if (spaceIndex === -1) {
    throw new Error('Invalid object header: no space found');
  }

  const type = header.slice(0, spaceIndex);
  const size = parseInt(header.slice(spaceIndex + 1), 10);
  const content = data.slice(nullIndex + 1);

  if (content.length !== size) {
    throw new Error(`Size mismatch: expected ${size}, got ${content.length}`);
  }

  return { type, content };
}
