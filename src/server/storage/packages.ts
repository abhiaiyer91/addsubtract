/**
 * Package Storage Manager
 *
 * Handles storage and retrieval of npm package tarballs.
 * Supports filesystem storage with optional S3-compatible backends.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Readable } from 'stream';

export interface PackageStorageOptions {
  /** Base directory for package storage */
  storageDir: string;
  /** Base URL for serving packages (e.g., "http://localhost:3000/api/packages") */
  baseUrl: string;
}

export interface StoredPackage {
  /** Full path to the tarball */
  path: string;
  /** Public URL to download the tarball */
  url: string;
  /** SHA512 hash of the tarball */
  sha512: string;
  /** Size in bytes */
  size: number;
}

/**
 * Package Storage Manager
 * 
 * Directory structure:
 * {storageDir}/
 *   @scope/
 *     package-name/
 *       1.0.0.tgz
 *       1.0.1.tgz
 *   unscoped-package/
 *     1.0.0.tgz
 */
export class PackageStorage {
  private storageDir: string;
  private baseUrl: string;

  constructor(options: PackageStorageOptions) {
    this.storageDir = options.storageDir;
    this.baseUrl = options.baseUrl.replace(/\/$/, ''); // Remove trailing slash

    // Ensure storage directory exists
    fs.mkdirSync(this.storageDir, { recursive: true });
  }

  /**
   * Get the directory path for a package
   */
  private getPackageDir(scope: string | null, name: string): string {
    if (scope) {
      return path.join(this.storageDir, `@${scope}`, name);
    }
    return path.join(this.storageDir, name);
  }

  /**
   * Get the filename for a version tarball
   */
  private getTarballFilename(version: string): string {
    return `${version}.tgz`;
  }

  /**
   * Get the full path to a tarball
   */
  getTarballPath(scope: string | null, name: string, version: string): string {
    const dir = this.getPackageDir(scope, name);
    return path.join(dir, this.getTarballFilename(version));
  }

  /**
   * Get the public URL for a tarball
   */
  getTarballUrl(scope: string | null, name: string, version: string): string {
    const fullName = scope ? `@${scope}/${name}` : name;
    // URL encode the package name for scoped packages
    const encodedName = encodeURIComponent(fullName).replace('%40', '@').replace('%2F', '/');
    return `${this.baseUrl}/${encodedName}/-/${name}-${version}.tgz`;
  }

  /**
   * Store a package tarball
   */
  async store(
    scope: string | null,
    name: string,
    version: string,
    data: Buffer | Readable
  ): Promise<StoredPackage> {
    const dir = this.getPackageDir(scope, name);
    const tarballPath = this.getTarballPath(scope, name, version);

    // Ensure package directory exists
    fs.mkdirSync(dir, { recursive: true });

    // Convert Readable to Buffer if needed
    let buffer: Buffer;
    if (Buffer.isBuffer(data)) {
      buffer = data;
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of data) {
        chunks.push(Buffer.from(chunk));
      }
      buffer = Buffer.concat(chunks);
    }

    // Calculate SHA512 hash
    const sha512 = crypto.createHash('sha512').update(buffer).digest('base64');

    // Write to disk
    fs.writeFileSync(tarballPath, buffer);

    return {
      path: tarballPath,
      url: this.getTarballUrl(scope, name, version),
      sha512,
      size: buffer.length,
    };
  }

  /**
   * Store a package tarball from base64-encoded data
   * (npm publish sends attachments as base64)
   */
  async storeBase64(
    scope: string | null,
    name: string,
    version: string,
    base64Data: string
  ): Promise<StoredPackage> {
    const buffer = Buffer.from(base64Data, 'base64');
    return this.store(scope, name, version, buffer);
  }

  /**
   * Retrieve a package tarball
   */
  async retrieve(scope: string | null, name: string, version: string): Promise<Buffer | null> {
    const tarballPath = this.getTarballPath(scope, name, version);

    if (!fs.existsSync(tarballPath)) {
      return null;
    }

    return fs.readFileSync(tarballPath);
  }

  /**
   * Create a readable stream for a tarball
   */
  createReadStream(scope: string | null, name: string, version: string): fs.ReadStream | null {
    const tarballPath = this.getTarballPath(scope, name, version);

    if (!fs.existsSync(tarballPath)) {
      return null;
    }

    return fs.createReadStream(tarballPath);
  }

  /**
   * Check if a tarball exists
   */
  exists(scope: string | null, name: string, version: string): boolean {
    const tarballPath = this.getTarballPath(scope, name, version);
    return fs.existsSync(tarballPath);
  }

  /**
   * Get tarball metadata
   */
  getMetadata(scope: string | null, name: string, version: string): {
    size: number;
    sha512: string;
  } | null {
    const tarballPath = this.getTarballPath(scope, name, version);

    if (!fs.existsSync(tarballPath)) {
      return null;
    }

    const buffer = fs.readFileSync(tarballPath);
    const sha512 = crypto.createHash('sha512').update(buffer).digest('base64');

    return {
      size: buffer.length,
      sha512,
    };
  }

  /**
   * Delete a package tarball
   */
  async delete(scope: string | null, name: string, version: string): Promise<boolean> {
    const tarballPath = this.getTarballPath(scope, name, version);

    if (!fs.existsSync(tarballPath)) {
      return false;
    }

    fs.unlinkSync(tarballPath);

    // Try to clean up empty directories
    const dir = this.getPackageDir(scope, name);
    try {
      const files = fs.readdirSync(dir);
      if (files.length === 0) {
        fs.rmdirSync(dir);
        
        // Clean up scope directory if empty
        if (scope) {
          const scopeDir = path.join(this.storageDir, `@${scope}`);
          const scopeFiles = fs.readdirSync(scopeDir);
          if (scopeFiles.length === 0) {
            fs.rmdirSync(scopeDir);
          }
        }
      }
    } catch {
      // Ignore errors during cleanup
    }

    return true;
  }

  /**
   * Delete all tarballs for a package
   */
  async deleteAll(scope: string | null, name: string): Promise<number> {
    const dir = this.getPackageDir(scope, name);

    if (!fs.existsSync(dir)) {
      return 0;
    }

    const files = fs.readdirSync(dir);
    let count = 0;

    for (const file of files) {
      if (file.endsWith('.tgz')) {
        fs.unlinkSync(path.join(dir, file));
        count++;
      }
    }

    // Clean up directories
    try {
      fs.rmdirSync(dir);
      if (scope) {
        const scopeDir = path.join(this.storageDir, `@${scope}`);
        const scopeFiles = fs.readdirSync(scopeDir);
        if (scopeFiles.length === 0) {
          fs.rmdirSync(scopeDir);
        }
      }
    } catch {
      // Ignore errors during cleanup
    }

    return count;
  }

  /**
   * List all versions stored for a package
   */
  listVersions(scope: string | null, name: string): string[] {
    const dir = this.getPackageDir(scope, name);

    if (!fs.existsSync(dir)) {
      return [];
    }

    const files = fs.readdirSync(dir);
    return files
      .filter(f => f.endsWith('.tgz'))
      .map(f => f.replace('.tgz', ''));
  }

  /**
   * Get storage statistics
   */
  getStats(): { totalPackages: number; totalSize: number } {
    let totalPackages = 0;
    let totalSize = 0;

    const walkDir = (dir: string) => {
      if (!fs.existsSync(dir)) return;

      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.name.endsWith('.tgz')) {
          totalPackages++;
          totalSize += fs.statSync(fullPath).size;
        }
      }
    };

    walkDir(this.storageDir);

    return { totalPackages, totalSize };
  }
}

/**
 * Create a package storage instance from environment variables
 */
export function createPackageStorage(baseUrl: string): PackageStorage {
  const storageDir = process.env.PACKAGE_STORAGE_DIR || 
    path.join(process.env.DATA_DIR || './data', 'packages');

  return new PackageStorage({
    storageDir,
    baseUrl,
  });
}
