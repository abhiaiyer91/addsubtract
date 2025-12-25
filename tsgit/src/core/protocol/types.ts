import { ObjectType } from '../types';

/**
 * Capabilities advertised by Git servers/clients
 */
export interface Capabilities {
  // Common capabilities
  'multi_ack'?: boolean;
  'multi_ack_detailed'?: boolean;
  'no-done'?: boolean;
  'thin-pack'?: boolean;
  'side-band'?: boolean;
  'side-band-64k'?: boolean;
  'ofs-delta'?: boolean;
  'shallow'?: boolean;
  'deepen-since'?: boolean;
  'deepen-not'?: boolean;
  'deepen-relative'?: boolean;
  'no-progress'?: boolean;
  'include-tag'?: boolean;
  'report-status'?: boolean;
  'report-status-v2'?: boolean;
  'delete-refs'?: boolean;
  'quiet'?: boolean;
  'atomic'?: boolean;
  'push-options'?: boolean;
  'allow-tip-sha1-in-want'?: boolean;
  'allow-reachable-sha1-in-want'?: boolean;
  'push-cert'?: string;
  'filter'?: boolean;
  'object-format'?: string; // sha1, sha256, etc.
  'agent'?: string;
  'symref'?: string; // e.g., "HEAD:refs/heads/main"
  [key: string]: boolean | string | undefined;
}

/**
 * Reference information from server
 */
export interface RefInfo {
  hash: string;
  name: string;
  peeled?: string; // For annotated tags, the dereferenced commit hash
}

/**
 * Result of ref advertisement discovery
 */
export interface RefAdvertisement {
  refs: RefInfo[];
  capabilities: Capabilities;
  head?: string; // The hash that HEAD points to
  version?: number; // Protocol version (1 or 2)
}

/**
 * Reference update for push operations
 */
export interface RefUpdate {
  name: string;
  oldHash: string; // Use '0000...' for create
  newHash: string; // Use '0000...' for delete
  force?: boolean;
}

/**
 * Result of a push operation
 */
export interface PushResult {
  ok: boolean;
  refResults: RefUpdateResult[];
  serverMessages?: string[];
}

/**
 * Result of a single ref update
 */
export interface RefUpdateResult {
  refName: string;
  status: 'ok' | 'ng' | 'up-to-date';
  message?: string;
}

/**
 * Object entry in a pack file
 */
export interface PackObject {
  type: ObjectType;
  size: number;
  data: Buffer;
  hash?: string;
  offset?: number;
}

/**
 * Delta object (OFS_DELTA or REF_DELTA)
 */
export interface DeltaObject {
  type: 'ofs_delta' | 'ref_delta';
  baseOffset?: number; // For OFS_DELTA
  baseHash?: string;   // For REF_DELTA
  deltaData: Buffer;
}

/**
 * Pack file header
 */
export interface PackHeader {
  signature: string; // 'PACK'
  version: number;   // 2 or 3
  objectCount: number;
}

/**
 * Pack file index entry
 */
export interface PackIndexEntry {
  hash: string;
  offset: number;
  crc32?: number;
}

/**
 * Progress information during fetch/push
 */
export interface ProgressInfo {
  phase: 'counting' | 'compressing' | 'receiving' | 'resolving' | 'writing';
  current: number;
  total: number;
  message?: string;
}

/**
 * Progress callback type
 */
export type ProgressCallback = (info: ProgressInfo) => void;

/**
 * HTTP request options
 */
export interface HttpRequestOptions {
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  body?: Buffer;
  timeout?: number;
}

/**
 * HTTP response
 */
export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: Buffer;
}

/**
 * Credentials for authentication
 */
export interface Credentials {
  username: string;
  password: string; // Can be a token
  type: 'basic' | 'bearer';
}

/**
 * Fetch options
 */
export interface FetchOptions {
  depth?: number;      // For shallow clones
  deepen?: number;     // Deepen by N commits
  since?: Date;        // Deepen since date
  exclude?: string[];  // Branches to exclude
  progress?: ProgressCallback;
  credentials?: Credentials;
}

/**
 * Push options
 */
export interface PushOptions {
  force?: boolean;
  atomic?: boolean;
  dryRun?: boolean;
  quiet?: boolean;
  progress?: ProgressCallback;
  credentials?: Credentials;
  pushOptions?: string[];
}

/**
 * The NULL hash for creating/deleting refs
 */
export const NULL_HASH = '0000000000000000000000000000000000000000';

/**
 * Pack object types (numeric identifiers)
 */
export enum PackObjectType {
  COMMIT = 1,
  TREE = 2,
  BLOB = 3,
  TAG = 4,
  OFS_DELTA = 6,
  REF_DELTA = 7,
}

/**
 * Convert pack object type to ObjectType
 */
export function packTypeToObjectType(packType: PackObjectType): ObjectType | null {
  switch (packType) {
    case PackObjectType.COMMIT: return 'commit';
    case PackObjectType.TREE: return 'tree';
    case PackObjectType.BLOB: return 'blob';
    case PackObjectType.TAG: return 'tag';
    default: return null;
  }
}

/**
 * Convert ObjectType to pack object type
 */
export function objectTypeToPackType(type: ObjectType): PackObjectType {
  switch (type) {
    case 'commit': return PackObjectType.COMMIT;
    case 'tree': return PackObjectType.TREE;
    case 'blob': return PackObjectType.BLOB;
    case 'tag': return PackObjectType.TAG;
    default:
      throw new Error(`Unknown object type: ${type}`);
  }
}

/**
 * Side-band channel identifiers
 */
export enum SideBandChannel {
  PACK_DATA = 1,
  PROGRESS = 2,
  ERROR = 3,
}

/**
 * PKT-LINE special values
 */
export const PKT_FLUSH = '0000';
export const PKT_DELIM = '0001';
export const PKT_RESPONSE_END = '0002';

/**
 * Encode a line in pkt-line format
 */
export function pktLine(data: string | Buffer): Buffer {
  const content = typeof data === 'string' ? Buffer.from(data) : data;
  const length = content.length + 4;
  const header = length.toString(16).padStart(4, '0');
  return Buffer.concat([Buffer.from(header), content]);
}

/**
 * Create a flush-pkt
 */
export function pktFlush(): Buffer {
  return Buffer.from(PKT_FLUSH);
}

/**
 * Parse pkt-lines from a buffer
 */
export function parsePktLines(data: Buffer): { lines: Buffer[]; remainder: Buffer } {
  const lines: Buffer[] = [];
  let offset = 0;

  while (offset + 4 <= data.length) {
    const lengthStr = data.slice(offset, offset + 4).toString('ascii');
    
    // Check for flush packet
    if (lengthStr === PKT_FLUSH) {
      lines.push(Buffer.alloc(0)); // Empty buffer indicates flush
      offset += 4;
      continue;
    }

    // Check for delimiter packet
    if (lengthStr === PKT_DELIM) {
      lines.push(Buffer.from(PKT_DELIM));
      offset += 4;
      continue;
    }

    const length = parseInt(lengthStr, 16);
    if (isNaN(length) || length < 4) {
      break;
    }

    if (offset + length > data.length) {
      // Incomplete packet
      break;
    }

    // Get the content (excluding the 4-byte length prefix)
    const content = data.slice(offset + 4, offset + length);
    lines.push(content);
    offset += length;
  }

  return {
    lines,
    remainder: data.slice(offset),
  };
}
