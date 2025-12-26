/**
 * SSH Key Management
 * 
 * Provides comprehensive SSH key management including:
 * - Key parsing and validation
 * - Key CRUD operations
 * - Fingerprint calculation
 * - File-based and in-memory storage
 */

import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { SSHKey, SSHKeyType, SSHKeyStore, AccessCheckResult } from './types';

/**
 * SSH Key Manager
 * 
 * Manages SSH keys for authentication with persistent storage.
 */
export class SSHKeyManager implements SSHKeyStore {
  private keys: Map<string, SSHKey> = new Map();
  private fingerprintIndex: Map<string, string> = new Map();
  private userIndex: Map<string, Set<string>> = new Map();
  private storagePath?: string;
  private accessControl?: AccessControlProvider;

  constructor(options?: { storagePath?: string; accessControl?: AccessControlProvider }) {
    this.storagePath = options?.storagePath;
    this.accessControl = options?.accessControl;
    
    if (this.storagePath) {
      this.loadFromDisk();
    }
  }

  /**
   * Parse and validate an SSH public key
   */
  static parsePublicKey(publicKey: string): {
    type: SSHKeyType;
    data: Buffer;
    comment?: string;
    fingerprint: string;
  } {
    const trimmed = publicKey.trim();
    const parts = trimmed.split(/\s+/);

    if (parts.length < 2) {
      throw new Error('Invalid SSH public key format');
    }

    const type = parts[0] as SSHKeyType;
    const validTypes: SSHKeyType[] = [
      'ssh-rsa',
      'ssh-ed25519',
      'ecdsa-sha2-nistp256',
      'ecdsa-sha2-nistp384',
      'ecdsa-sha2-nistp521',
    ];

    if (!validTypes.includes(type)) {
      throw new Error(`Unsupported key type: ${type}`);
    }

    let data: Buffer;
    try {
      data = Buffer.from(parts[1], 'base64');
    } catch {
      throw new Error('Invalid base64 key data');
    }

    // Validate key data structure
    if (data.length < 20) {
      throw new Error('Key data too short');
    }

    // Verify the key type in the data matches the declared type
    const keyTypeInData = readString(data, 0);
    if (keyTypeInData.value !== type) {
      throw new Error(`Key type mismatch: declared ${type}, got ${keyTypeInData.value}`);
    }

    const comment = parts.length > 2 ? parts.slice(2).join(' ') : undefined;
    const fingerprint = SSHKeyManager.calculateFingerprint(data);

    return { type, data, comment, fingerprint };
  }

  /**
   * Calculate SHA256 fingerprint of key data
   */
  static calculateFingerprint(keyData: Buffer): string {
    const hash = crypto.createHash('sha256').update(keyData).digest('base64');
    return `SHA256:${hash.replace(/=+$/, '')}`;
  }

  /**
   * Calculate MD5 fingerprint (legacy format)
   */
  static calculateMD5Fingerprint(keyData: Buffer): string {
    const hash = crypto.createHash('md5').update(keyData).digest('hex');
    return hash.match(/.{2}/g)?.join(':') || '';
  }

  /**
   * Format a fingerprint for display
   */
  static formatFingerprint(fingerprint: string): string {
    return fingerprint;
  }

  /**
   * Find a key by its fingerprint
   */
  async findByFingerprint(fingerprint: string): Promise<SSHKey | null> {
    const keyId = this.fingerprintIndex.get(fingerprint);
    if (!keyId) return null;
    return this.keys.get(keyId) || null;
  }

  /**
   * Find all keys for a user
   */
  async findByUserId(userId: string): Promise<SSHKey[]> {
    const keyIds = this.userIndex.get(userId);
    if (!keyIds) return [];
    return Array.from(keyIds)
      .map(id => this.keys.get(id))
      .filter((k): k is SSHKey => k !== undefined);
  }

  /**
   * Find a key by ID
   */
  async findById(keyId: string): Promise<SSHKey | null> {
    return this.keys.get(keyId) || null;
  }

  /**
   * Add a new SSH key
   */
  async addKey(keyData: Omit<SSHKey, 'id' | 'createdAt' | 'fingerprint'>): Promise<SSHKey> {
    // Parse and validate the key
    const parsed = SSHKeyManager.parsePublicKey(keyData.publicKey);

    // Check for duplicate fingerprint
    const existing = await this.findByFingerprint(parsed.fingerprint);
    if (existing) {
      throw new Error('This SSH key has already been added');
    }

    const id = this.generateId();
    const key: SSHKey = {
      ...keyData,
      id,
      keyType: parsed.type,
      fingerprint: parsed.fingerprint,
      createdAt: new Date(),
    };

    this.keys.set(id, key);
    this.fingerprintIndex.set(parsed.fingerprint, id);

    let userKeys = this.userIndex.get(key.userId);
    if (!userKeys) {
      userKeys = new Set();
      this.userIndex.set(key.userId, userKeys);
    }
    userKeys.add(id);

    await this.saveToDisk();

    return key;
  }

  /**
   * Remove a key
   */
  async removeKey(keyId: string): Promise<boolean> {
    const key = this.keys.get(keyId);
    if (!key) return false;

    this.keys.delete(keyId);
    this.fingerprintIndex.delete(key.fingerprint);

    const userKeys = this.userIndex.get(key.userId);
    if (userKeys) {
      userKeys.delete(keyId);
      if (userKeys.size === 0) {
        this.userIndex.delete(key.userId);
      }
    }

    await this.saveToDisk();

    return true;
  }

  /**
   * Update last used timestamp
   */
  async updateLastUsed(keyId: string): Promise<void> {
    const key = this.keys.get(keyId);
    if (key) {
      key.lastUsedAt = new Date();
      await this.saveToDisk();
    }
  }

  /**
   * Deactivate a key
   */
  async deactivateKey(keyId: string): Promise<void> {
    const key = this.keys.get(keyId);
    if (key) {
      key.isActive = false;
      await this.saveToDisk();
    }
  }

  /**
   * Activate a key
   */
  async activateKey(keyId: string): Promise<void> {
    const key = this.keys.get(keyId);
    if (key) {
      key.isActive = true;
      await this.saveToDisk();
    }
  }

  /**
   * Update key title
   */
  async updateKeyTitle(keyId: string, title: string): Promise<void> {
    const key = this.keys.get(keyId);
    if (key) {
      key.title = title;
      await this.saveToDisk();
    }
  }

  /**
   * Check if a user has access to a repository
   */
  async checkAccess(userId: string, repoPath: string, operation: 'read' | 'write'): Promise<AccessCheckResult> {
    if (this.accessControl) {
      return this.accessControl.checkAccess(userId, repoPath, operation);
    }

    // Default: allow all access for authenticated users
    return {
      allowed: true,
      level: 'write',
    };
  }

  /**
   * Get all keys (admin function)
   */
  async getAllKeys(): Promise<SSHKey[]> {
    return Array.from(this.keys.values());
  }

  /**
   * Get key count
   */
  getKeyCount(): number {
    return this.keys.size;
  }

  /**
   * Get user count
   */
  getUserCount(): number {
    return this.userIndex.size;
  }

  /**
   * Export keys to authorized_keys format
   */
  async exportAuthorizedKeys(userId: string): Promise<string> {
    const keys = await this.findByUserId(userId);
    return keys
      .filter(k => k.isActive)
      .map(k => k.publicKey)
      .join('\n');
  }

  /**
   * Import keys from authorized_keys format
   */
  async importAuthorizedKeys(userId: string, content: string): Promise<SSHKey[]> {
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
    const imported: SSHKey[] = [];

    for (const line of lines) {
      try {
        const key = await this.addKey({
          userId,
          title: `Imported key`,
          publicKey: line.trim(),
          keyType: 'ssh-rsa', // Will be updated by addKey
          isActive: true,
        });
        imported.push(key);
      } catch (err) {
        // Skip invalid or duplicate keys
        console.warn(`Skipping key: ${(err as Error).message}`);
      }
    }

    return imported;
  }

  /**
   * Generate a unique key ID
   */
  private generateId(): string {
    return `key_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Load keys from disk
   */
  private loadFromDisk(): void {
    if (!this.storagePath) return;

    const keysFile = path.join(this.storagePath, 'ssh_keys.json');
    
    if (!fs.existsSync(keysFile)) {
      // Create directory and empty file
      fs.mkdirSync(this.storagePath, { recursive: true });
      fs.writeFileSync(keysFile, JSON.stringify({ keys: [] }, null, 2));
      return;
    }

    try {
      const content = fs.readFileSync(keysFile, 'utf-8');
      const data = JSON.parse(content);

      for (const keyData of data.keys || []) {
        const key: SSHKey = {
          ...keyData,
          createdAt: new Date(keyData.createdAt),
          lastUsedAt: keyData.lastUsedAt ? new Date(keyData.lastUsedAt) : undefined,
        };

        this.keys.set(key.id, key);
        this.fingerprintIndex.set(key.fingerprint, key.id);

        let userKeys = this.userIndex.get(key.userId);
        if (!userKeys) {
          userKeys = new Set();
          this.userIndex.set(key.userId, userKeys);
        }
        userKeys.add(key.id);
      }
    } catch (err) {
      console.error('Failed to load SSH keys:', err);
    }
  }

  /**
   * Save keys to disk
   */
  private async saveToDisk(): Promise<void> {
    if (!this.storagePath) return;

    const keysFile = path.join(this.storagePath, 'ssh_keys.json');
    const keys = Array.from(this.keys.values()).map(key => ({
      ...key,
      createdAt: key.createdAt.toISOString(),
      lastUsedAt: key.lastUsedAt?.toISOString(),
    }));

    fs.mkdirSync(this.storagePath, { recursive: true });
    fs.writeFileSync(keysFile, JSON.stringify({ keys }, null, 2));
  }
}

/**
 * Access control provider interface
 */
export interface AccessControlProvider {
  checkAccess(userId: string, repoPath: string, operation: 'read' | 'write'): Promise<AccessCheckResult>;
}

/**
 * Simple file-based access control
 */
export class FileBasedAccessControl implements AccessControlProvider {
  private configPath: string;

  constructor(configPath: string) {
    this.configPath = configPath;
  }

  async checkAccess(userId: string, repoPath: string, operation: 'read' | 'write'): Promise<AccessCheckResult> {
    try {
      const configFile = path.join(this.configPath, 'access.json');
      
      if (!fs.existsSync(configFile)) {
        // Default: allow all
        return { allowed: true, level: 'write' };
      }

      const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));

      // Check user-specific rules first
      const userRules = config.users?.[userId] || {};
      const repoRule = userRules[repoPath] || userRules['*'];

      if (repoRule) {
        const level = repoRule.level || 'none';
        const allowed = this.checkLevel(level, operation);
        return { allowed, level };
      }

      // Check group rules
      const userGroups = config.userGroups?.[userId] || [];
      for (const group of userGroups) {
        const groupRules = config.groups?.[group] || {};
        const groupRule = groupRules[repoPath] || groupRules['*'];
        
        if (groupRule) {
          const level = groupRule.level || 'none';
          const allowed = this.checkLevel(level, operation);
          return { allowed, level };
        }
      }

      // Check default rules
      const defaultRule = config.defaults?.[repoPath] || config.defaults?.['*'];
      if (defaultRule) {
        const level = defaultRule.level || 'none';
        const allowed = this.checkLevel(level, operation);
        return { allowed, level };
      }

      // No matching rule - deny by default
      return { allowed: false, level: 'none', reason: 'No matching access rule' };
    } catch (err) {
      console.error('Access control error:', err);
      return { allowed: false, level: 'none', reason: 'Access control error' };
    }
  }

  private checkLevel(level: string, operation: 'read' | 'write'): boolean {
    switch (level) {
      case 'admin':
      case 'write':
        return true;
      case 'read':
        return operation === 'read';
      default:
        return false;
    }
  }
}

/**
 * Helper function to read a length-prefixed string from SSH key data
 */
function readString(buffer: Buffer, offset: number): { value: string; nextOffset: number } {
  if (offset + 4 > buffer.length) {
    throw new Error('Buffer too short for string length');
  }

  const length = buffer.readUInt32BE(offset);
  const end = offset + 4 + length;

  if (end > buffer.length) {
    throw new Error('Buffer too short for string data');
  }

  return {
    value: buffer.slice(offset + 4, end).toString('utf-8'),
    nextOffset: end,
  };
}

/**
 * Validate SSH key format
 */
export function validateSSHKey(publicKey: string): { valid: boolean; error?: string } {
  try {
    SSHKeyManager.parsePublicKey(publicKey);
    return { valid: true };
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}

/**
 * Generate a new SSH key pair
 */
export async function generateSSHKeyPair(
  type: 'rsa' | 'ed25519' = 'ed25519',
  comment?: string
): Promise<{ publicKey: string; privateKey: string }> {
  return new Promise((resolve, reject) => {
    if (type === 'ed25519') {
      crypto.generateKeyPair('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      }, (err, publicKey, privateKey) => {
        if (err) return reject(err);
        
        // Convert PEM to OpenSSH format
        const sshPublicKey = convertToOpenSSHFormat(publicKey, 'ssh-ed25519', comment);
        resolve({ publicKey: sshPublicKey, privateKey });
      });
    } else {
      crypto.generateKeyPair('rsa', {
        modulusLength: 4096,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      }, (err, publicKey, privateKey) => {
        if (err) return reject(err);
        
        // Convert PEM to OpenSSH format
        const sshPublicKey = convertToOpenSSHFormat(publicKey, 'ssh-rsa', comment);
        resolve({ publicKey: sshPublicKey, privateKey });
      });
    }
  });
}

/**
 * Convert PEM public key to OpenSSH format
 * Note: This is a simplified implementation
 */
function convertToOpenSSHFormat(pemKey: string, keyType: string, comment?: string): string {
  // Extract the base64 data from PEM
  const lines = pemKey.split('\n');
  const base64Data = lines
    .filter(line => !line.startsWith('-----'))
    .join('');

  const commentPart = comment ? ` ${comment}` : '';
  return `${keyType} ${base64Data}${commentPart}`;
}
