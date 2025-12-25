/**
 * Git Protocol Implementation
 * 
 * This module provides the core protocol implementation for Git remote operations:
 * - Smart HTTP protocol for fetch and push
 * - Pack file parsing and creation
 * - Ref advertisement parsing
 * 
 * The implementation follows the Git protocol documentation:
 * https://git-scm.com/docs/protocol-v2
 * https://git-scm.com/docs/pack-protocol
 */

// Types
export {
  // Core types
  Capabilities,
  RefInfo,
  RefAdvertisement,
  RefUpdate,
  PushResult,
  RefUpdateResult,
  PackObject,
  DeltaObject,
  PackHeader,
  PackIndexEntry,
  ProgressInfo,
  ProgressCallback,
  HttpRequestOptions,
  HttpResponse,
  Credentials,
  FetchOptions,
  PushOptions,
  
  // Constants
  NULL_HASH,
  PackObjectType,
  SideBandChannel,
  PKT_FLUSH,
  PKT_DELIM,
  PKT_RESPONSE_END,
  
  // Functions
  packTypeToObjectType,
  objectTypeToPackType,
  pktLine,
  pktFlush,
  parsePktLines,
} from './types';

// Refs discovery
export {
  parseCapabilities,
  serializeCapabilities,
  parseRefAdvertisement,
  resolveHead,
  filterRefsByPattern,
  ParsedRefspec,
  parseRefspec,
  applyFetchRefspec,
  getBranches,
  getTags,
  hasCapability,
  getObjectFormat,
} from './refs-discovery';

// Pack file utilities
export {
  PACK_SIGNATURE,
  readVariableInt,
  writeVariableInt,
  readPackObjectHeader,
  writePackObjectHeader,
  readOfsOffset,
  writeOfsOffset,
  parsePackHeader,
  writePackHeader,
  calculatePackChecksum,
  verifyPackChecksum,
  applyDelta,
  createDelta,
} from './pack';

// Pack file parsing
export {
  ParsedPack,
  ParsedObject,
  PackfileParser,
  parsePackfile,
  iteratePackObjects,
} from './packfile-parser';

// Pack file writing
export {
  PackableObject,
  PackWriterOptions,
  PackfileWriter,
  createPackfile,
  createThinPackfile,
  countPackObjects,
} from './packfile-writer';

// Smart HTTP client
export {
  SmartHttpClient,
  createRefUpdate,
  deleteRefUpdate,
  updateRefUpdate,
  parseRemoteUrl,
  normalizeRepoUrl,
} from './smart-http';
