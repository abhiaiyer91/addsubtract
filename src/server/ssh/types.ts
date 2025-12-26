/**
 * SSH Server Types
 * 
 * Types for SSH protocol support in wit Git operations.
 */

/**
 * SSH server configuration options
 */
export interface SSHServerOptions {
  /** SSH host keys for server identity */
  hostKeys: Buffer[];
  /** Port to listen on (default: 22) */
  port: number;
  /** Host to bind to (default: '0.0.0.0') */
  host?: string;
  /** Path to repository storage root */
  repoRoot: string;
  /** Whether to allow anonymous read access */
  allowAnonymousRead?: boolean;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Maximum concurrent connections */
  maxConnections?: number;
  /** Banner message shown on connect */
  banner?: string;
}

/**
 * SSH key types supported
 */
export type SSHKeyType = 'ssh-rsa' | 'ssh-ed25519' | 'ecdsa-sha2-nistp256' | 'ecdsa-sha2-nistp384' | 'ecdsa-sha2-nistp521';

/**
 * SSH key stored in the system
 */
export interface SSHKey {
  /** Unique identifier */
  id: string;
  /** User ID who owns this key */
  userId: string;
  /** Key title/name */
  title: string;
  /** Public key data (OpenSSH format) */
  publicKey: string;
  /** Key type */
  keyType: SSHKeyType;
  /** Key fingerprint (SHA256) */
  fingerprint: string;
  /** When the key was added */
  createdAt: Date;
  /** Last time the key was used */
  lastUsedAt?: Date;
  /** Whether the key is active */
  isActive: boolean;
}

/**
 * Authenticated session information
 */
export interface SSHSession {
  /** Session ID */
  sessionId: string;
  /** User ID */
  userId: string;
  /** Username */
  username: string;
  /** SSH key used for authentication */
  keyId?: string;
  /** Remote IP address */
  remoteAddress: string;
  /** Connection timestamp */
  connectedAt: Date;
  /** Repository being accessed (if any) */
  repository?: string;
  /** Current operation */
  operation?: 'upload-pack' | 'receive-pack';
}

/**
 * Git command parsed from SSH exec request
 */
export interface ParsedGitCommand {
  /** The git service (upload-pack or receive-pack) */
  service: 'git-upload-pack' | 'git-receive-pack';
  /** Repository path */
  repoPath: string;
  /** Original command string */
  rawCommand: string;
}

/**
 * SSH authentication context
 */
export interface SSHAuthContext {
  /** Client username */
  username: string;
  /** Authentication method attempted */
  method: 'publickey' | 'password' | 'keyboard-interactive' | 'none';
  /** For public key auth: the key being used */
  key?: {
    algo: string;
    data: Buffer;
    signature?: Buffer;
    blob?: Buffer;
  };
  /** Signature (for public key verification) */
  signature?: Buffer;
  /** Blob being signed */
  blob?: Buffer;
}

/**
 * Result of key verification
 */
export interface KeyVerificationResult {
  /** Whether the key is valid and authorized */
  authorized: boolean;
  /** The SSH key record if found */
  key?: SSHKey;
  /** Error message if not authorized */
  error?: string;
}

/**
 * SSH server events
 */
export interface SSHServerEvents {
  /** Emitted when a client connects */
  connection: (session: SSHSession) => void;
  /** Emitted when authentication succeeds */
  authenticated: (session: SSHSession) => void;
  /** Emitted when a git command starts */
  'git-command': (session: SSHSession, command: ParsedGitCommand) => void;
  /** Emitted when a git command completes */
  'git-complete': (session: SSHSession, command: ParsedGitCommand, success: boolean) => void;
  /** Emitted when a client disconnects */
  disconnect: (session: SSHSession) => void;
  /** Emitted on error */
  error: (error: Error, session?: SSHSession) => void;
}

/**
 * Repository access level
 */
export type AccessLevel = 'none' | 'read' | 'write' | 'admin';

/**
 * Repository access check result
 */
export interface AccessCheckResult {
  /** Whether access is granted */
  allowed: boolean;
  /** Access level granted */
  level: AccessLevel;
  /** Reason for denial (if not allowed) */
  reason?: string;
}

/**
 * SSH key storage interface
 * Implement this to provide custom key storage (database, file, etc.)
 */
export interface SSHKeyStore {
  /** Find a key by its fingerprint */
  findByFingerprint(fingerprint: string): Promise<SSHKey | null>;
  
  /** Find all keys for a user */
  findByUserId(userId: string): Promise<SSHKey[]>;
  
  /** Add a new key */
  addKey(key: Omit<SSHKey, 'id' | 'createdAt' | 'fingerprint'>): Promise<SSHKey>;
  
  /** Remove a key */
  removeKey(keyId: string): Promise<boolean>;
  
  /** Update last used timestamp */
  updateLastUsed(keyId: string): Promise<void>;
  
  /** Deactivate a key */
  deactivateKey(keyId: string): Promise<void>;
  
  /** Check if a user has access to a repository */
  checkAccess(userId: string, repoPath: string, operation: 'read' | 'write'): Promise<AccessCheckResult>;
}

/**
 * Default in-memory key store implementation
 */
export class InMemoryKeyStore implements SSHKeyStore {
  private keys: Map<string, SSHKey> = new Map();
  private fingerprintIndex: Map<string, string> = new Map(); // fingerprint -> keyId
  private userIndex: Map<string, Set<string>> = new Map(); // userId -> Set<keyId>
  
  async findByFingerprint(fingerprint: string): Promise<SSHKey | null> {
    const keyId = this.fingerprintIndex.get(fingerprint);
    if (!keyId) return null;
    return this.keys.get(keyId) || null;
  }
  
  async findByUserId(userId: string): Promise<SSHKey[]> {
    const keyIds = this.userIndex.get(userId);
    if (!keyIds) return [];
    return Array.from(keyIds)
      .map(id => this.keys.get(id))
      .filter((k): k is SSHKey => k !== undefined);
  }
  
  async addKey(keyData: Omit<SSHKey, 'id' | 'createdAt' | 'fingerprint'>): Promise<SSHKey> {
    const id = this.generateId();
    const fingerprint = this.calculateFingerprint(keyData.publicKey);
    
    const key: SSHKey = {
      ...keyData,
      id,
      fingerprint,
      createdAt: new Date(),
    };
    
    this.keys.set(id, key);
    this.fingerprintIndex.set(fingerprint, id);
    
    let userKeys = this.userIndex.get(key.userId);
    if (!userKeys) {
      userKeys = new Set();
      this.userIndex.set(key.userId, userKeys);
    }
    userKeys.add(id);
    
    return key;
  }
  
  async removeKey(keyId: string): Promise<boolean> {
    const key = this.keys.get(keyId);
    if (!key) return false;
    
    this.keys.delete(keyId);
    this.fingerprintIndex.delete(key.fingerprint);
    
    const userKeys = this.userIndex.get(key.userId);
    if (userKeys) {
      userKeys.delete(keyId);
    }
    
    return true;
  }
  
  async updateLastUsed(keyId: string): Promise<void> {
    const key = this.keys.get(keyId);
    if (key) {
      key.lastUsedAt = new Date();
    }
  }
  
  async deactivateKey(keyId: string): Promise<void> {
    const key = this.keys.get(keyId);
    if (key) {
      key.isActive = false;
    }
  }
  
  async checkAccess(userId: string, _repoPath: string, _operation: 'read' | 'write'): Promise<AccessCheckResult> {
    // Default implementation: allow all access for authenticated users
    // Override this for more sophisticated access control
    return {
      allowed: true,
      level: 'write',
    };
  }
  
  private generateId(): string {
    return `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private calculateFingerprint(publicKey: string): string {
    // Parse OpenSSH public key format
    const parts = publicKey.trim().split(' ');
    if (parts.length < 2) {
      throw new Error('Invalid public key format');
    }
    
    const keyData = Buffer.from(parts[1], 'base64');
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(keyData).digest('base64');
    
    return `SHA256:${hash.replace(/=+$/, '')}`;
  }
}

/**
 * SSH connection statistics
 */
export interface SSHServerStats {
  /** Total connections since start */
  totalConnections: number;
  /** Currently active connections */
  activeConnections: number;
  /** Total git operations */
  gitOperations: {
    uploadPack: number;
    receivePack: number;
  };
  /** Failed authentication attempts */
  failedAuths: number;
  /** Server uptime in seconds */
  uptime: number;
}
