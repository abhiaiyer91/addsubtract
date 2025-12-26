import * as crypto from 'crypto';

/**
 * Supported hash algorithms
 * SHA-256 is the default for improved security over SHA-1
 */
export type HashAlgorithm = 'sha1' | 'sha256';

/**
 * Hash configuration
 */
interface HashConfig {
  algorithm: HashAlgorithm;
  digestLength: number;
}

const HASH_CONFIGS: Record<HashAlgorithm, HashConfig> = {
  sha1: { algorithm: 'sha1', digestLength: 40 },
  sha256: { algorithm: 'sha256', digestLength: 64 },
};

// Default to SHA-1 for Git interoperability
// Git servers (GitHub, GitLab, etc.) use SHA-1
// SHA-256 can be enabled for wit-to-wit repos if desired
let currentAlgorithm: HashAlgorithm = 'sha1';

/**
 * Set the hash algorithm for the repository
 */
export function setHashAlgorithm(algo: HashAlgorithm): void {
  currentAlgorithm = algo;
}

/**
 * Get the current hash algorithm
 */
export function getHashAlgorithm(): HashAlgorithm {
  return currentAlgorithm;
}

/**
 * Get the expected digest length for current algorithm (hex string length)
 */
export function getDigestLength(): number {
  return HASH_CONFIGS[currentAlgorithm].digestLength;
}

/**
 * Get the raw byte length for current algorithm
 * SHA-1 = 20 bytes, SHA-256 = 32 bytes
 */
export function getHashByteLength(): number {
  return HASH_CONFIGS[currentAlgorithm].digestLength / 2;
}

/**
 * Check if a string is a valid hash for the current algorithm
 */
export function isValidHash(hash: string): boolean {
  const length = getDigestLength();
  const regex = new RegExp(`^[0-9a-f]{${length}}$`);
  return regex.test(hash);
}

/**
 * Compute hash of data using the configured algorithm
 * Default is SHA-256 for improved security over Git's SHA-1
 */
export function computeHash(data: Buffer | string): string {
  return crypto.createHash(currentAlgorithm).update(data).digest('hex');
}

/**
 * Legacy SHA-1 function for compatibility
 * @deprecated Use computeHash() instead
 */
export function sha1(data: Buffer | string): string {
  return crypto.createHash('sha1').update(data).digest('hex');
}

/**
 * Compute hash for a Git object
 * Format: "{type} {size}\0{content}"
 */
export function hashObject(type: string, content: Buffer): string {
  const header = Buffer.from(`${type} ${content.length}\0`);
  const store = Buffer.concat([header, content]);
  return computeHash(store);
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

/**
 * Generate a short hash (first 7-8 characters) for display
 */
export function shortHash(hash: string, length: number = 8): string {
  return hash.slice(0, length);
}
