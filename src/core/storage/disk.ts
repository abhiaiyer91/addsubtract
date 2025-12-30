/**
 * Disk Storage Backend
 * 
 * Stores repositories as bare git repositories on the local filesystem.
 * This is the default storage backend for local development.
 * 
 * Directory structure:
 *   {projectsDir}/
 *     {owner}/
 *       {repo}.git/
 *         HEAD
 *         config
 *         objects/
 *         refs/
 */

import * as path from 'path';
import * as fs from 'fs';
import { compress, decompress } from '../../utils/compression';
import { createObjectBuffer, parseObjectBuffer } from '../../utils/hash';
import { exists, mkdirp, readFile, writeFile, readDir, isDirectory } from '../../utils/fs';
import type {
  StorageBackend,
  StorageRepoInfo,
  StorageObject,
  StorageRef,
  CreateRepoOptions,
  StorageConfig,
} from './types';
import type { ObjectType } from '../types';

/**
 * Disk-based storage backend
 */
export class DiskStorage implements StorageBackend {
  readonly type = 'disk' as const;
  private projectsDir: string;

  constructor(config: StorageConfig['disk']) {
    if (!config?.projectsDir) {
      throw new Error('DiskStorage requires projectsDir configuration');
    }
    this.projectsDir = path.resolve(config.projectsDir);
    
    // Ensure projects directory exists
    mkdirp(this.projectsDir);
  }

  // === Repository Operations ===

  async createRepo(owner: string, name: string, options: CreateRepoOptions = {}): Promise<StorageRepoInfo> {
    const repoPath = this.buildRepoPath(owner, name);
    const defaultBranch = options.defaultBranch || 'main';

    if (await this.repoExists(owner, name)) {
      throw new Error(`Repository already exists: ${owner}/${name}`);
    }

    // Create directory structure
    mkdirp(path.join(repoPath, 'objects'));
    mkdirp(path.join(repoPath, 'refs', 'heads'));
    mkdirp(path.join(repoPath, 'refs', 'tags'));
    mkdirp(path.join(repoPath, 'info'));

    // Write HEAD pointing to default branch
    fs.writeFileSync(
      path.join(repoPath, 'HEAD'),
      `ref: refs/heads/${defaultBranch}\n`
    );

    // Write config
    const config = `[core]
    repositoryformatversion = 0
    filemode = true
    bare = true
[wit]
    hashAlgorithm = sha1
`;
    fs.writeFileSync(path.join(repoPath, 'config'), config);

    // Write description
    const description = options.description || `${owner}/${name} repository`;
    fs.writeFileSync(path.join(repoPath, 'description'), description + '\n');

    return {
      owner,
      name,
      path: repoPath,
      bare: true,
      defaultBranch,
      createdAt: new Date(),
    };
  }

  async repoExists(owner: string, name: string): Promise<boolean> {
    const repoPath = this.buildRepoPath(owner, name);
    return exists(repoPath) && exists(path.join(repoPath, 'objects'));
  }

  async getRepo(owner: string, name: string): Promise<StorageRepoInfo | null> {
    if (!await this.repoExists(owner, name)) {
      return null;
    }

    const repoPath = this.buildRepoPath(owner, name);
    const stats = fs.statSync(repoPath);

    // Read default branch from HEAD
    let defaultBranch = 'main';
    const headPath = path.join(repoPath, 'HEAD');
    if (exists(headPath)) {
      const headContent = fs.readFileSync(headPath, 'utf-8').trim();
      const match = headContent.match(/^ref: refs\/heads\/(.+)$/);
      if (match) {
        defaultBranch = match[1];
      }
    }

    return {
      owner,
      name,
      path: repoPath,
      bare: true,
      defaultBranch,
      createdAt: stats.birthtime,
    };
  }

  async listRepos(owner: string): Promise<StorageRepoInfo[]> {
    const ownerDir = path.join(this.projectsDir, owner);
    if (!exists(ownerDir)) {
      return [];
    }

    const repos: StorageRepoInfo[] = [];
    const entries = readDir(ownerDir);

    for (const entry of entries) {
      if (entry.endsWith('.git')) {
        const name = entry.replace(/\.git$/, '');
        const repo = await this.getRepo(owner, name);
        if (repo) {
          repos.push(repo);
        }
      }
    }

    return repos;
  }

  async deleteRepo(owner: string, name: string): Promise<void> {
    const repoPath = this.buildRepoPath(owner, name);
    if (exists(repoPath)) {
      fs.rmSync(repoPath, { recursive: true, force: true });
    }
  }

  async forkRepo(
    sourceOwner: string,
    sourceName: string,
    targetOwner: string,
    targetName: string
  ): Promise<StorageRepoInfo> {
    const sourcePath = this.buildRepoPath(sourceOwner, sourceName);
    const targetPath = this.buildRepoPath(targetOwner, targetName);

    if (!await this.repoExists(sourceOwner, sourceName)) {
      throw new Error(`Source repository not found: ${sourceOwner}/${sourceName}`);
    }

    if (await this.repoExists(targetOwner, targetName)) {
      throw new Error(`Target repository already exists: ${targetOwner}/${targetName}`);
    }

    // Create target directory
    mkdirp(path.dirname(targetPath));

    // Copy entire repository
    this.copyDir(sourcePath, targetPath);

    // Get repo info
    const repo = await this.getRepo(targetOwner, targetName);
    if (!repo) {
      throw new Error('Failed to fork repository');
    }

    return repo;
  }

  // === Object Operations ===

  async writeObject(owner: string, name: string, object: StorageObject): Promise<string> {
    const repoPath = this.buildRepoPath(owner, name);
    const objectsDir = path.join(repoPath, 'objects');
    
    const dir = object.hash.slice(0, 2);
    const file = object.hash.slice(2);
    const objectPath = path.join(objectsDir, dir, file);

    if (!exists(objectPath)) {
      mkdirp(path.join(objectsDir, dir));
      const buffer = createObjectBuffer(object.type, object.data);
      const compressed = compress(buffer);
      writeFile(objectPath, compressed);
    }

    return object.hash;
  }

  async readObject(owner: string, name: string, hash: string): Promise<StorageObject | null> {
    const repoPath = this.buildRepoPath(owner, name);
    const objectPath = this.buildObjectPath(repoPath, hash);

    if (!exists(objectPath)) {
      return null;
    }

    const compressed = readFile(objectPath);
    const data = decompress(compressed);
    const { type, content } = parseObjectBuffer(data);

    return {
      type: type as ObjectType,
      data: content,
      hash,
    };
  }

  async hasObject(owner: string, name: string, hash: string): Promise<boolean> {
    const repoPath = this.buildRepoPath(owner, name);
    const objectPath = this.buildObjectPath(repoPath, hash);
    return exists(objectPath);
  }

  async listObjects(owner: string, name: string): Promise<string[]> {
    const repoPath = this.buildRepoPath(owner, name);
    const objectsDir = path.join(repoPath, 'objects');
    const objects: string[] = [];

    if (!exists(objectsDir)) {
      return objects;
    }

    const dirs = readDir(objectsDir);
    for (const dir of dirs) {
      if (dir.length !== 2) continue;

      const dirPath = path.join(objectsDir, dir);
      if (!isDirectory(dirPath)) continue;

      const files = readDir(dirPath);
      for (const file of files) {
        objects.push(dir + file);
      }
    }

    return objects;
  }

  // === Reference Operations ===

  async getRef(owner: string, name: string, refName: string): Promise<StorageRef | null> {
    const repoPath = this.buildRepoPath(owner, name);
    
    // Handle HEAD specially
    if (refName === 'HEAD') {
      const headPath = path.join(repoPath, 'HEAD');
      if (!exists(headPath)) return null;
      
      const content = fs.readFileSync(headPath, 'utf-8').trim();
      const symMatch = content.match(/^ref: (.+)$/);
      if (symMatch) {
        return { name: 'HEAD', hash: '', symbolic: symMatch[1] };
      }
      return { name: 'HEAD', hash: content };
    }

    // Handle refs/heads/... and refs/tags/...
    const refPath = path.join(repoPath, refName);
    if (!exists(refPath)) {
      // Try with refs/ prefix
      const altPath = path.join(repoPath, 'refs', 'heads', refName);
      if (exists(altPath)) {
        const hash = fs.readFileSync(altPath, 'utf-8').trim();
        return { name: refName, hash };
      }
      return null;
    }

    const hash = fs.readFileSync(refPath, 'utf-8').trim();
    return { name: refName, hash };
  }

  async setRef(owner: string, name: string, refName: string, hash: string): Promise<void> {
    const repoPath = this.buildRepoPath(owner, name);
    
    let refPath: string;
    if (refName === 'HEAD') {
      refPath = path.join(repoPath, 'HEAD');
    } else if (refName.startsWith('refs/')) {
      refPath = path.join(repoPath, refName);
    } else {
      refPath = path.join(repoPath, 'refs', 'heads', refName);
    }

    mkdirp(path.dirname(refPath));
    fs.writeFileSync(refPath, hash + '\n');
  }

  async setSymbolicRef(owner: string, name: string, refName: string, target: string): Promise<void> {
    const repoPath = this.buildRepoPath(owner, name);
    const refPath = path.join(repoPath, refName);
    
    mkdirp(path.dirname(refPath));
    fs.writeFileSync(refPath, `ref: ${target}\n`);
  }

  async deleteRef(owner: string, name: string, refName: string): Promise<void> {
    const repoPath = this.buildRepoPath(owner, name);
    
    let refPath: string;
    if (refName.startsWith('refs/')) {
      refPath = path.join(repoPath, refName);
    } else {
      refPath = path.join(repoPath, 'refs', 'heads', refName);
    }

    if (exists(refPath)) {
      fs.unlinkSync(refPath);
    }
  }

  async listRefs(owner: string, name: string): Promise<StorageRef[]> {
    const refs: StorageRef[] = [];
    
    // Get HEAD
    const head = await this.getRef(owner, name, 'HEAD');
    if (head) refs.push(head);

    // Get branches
    const branches = await this.listBranches(owner, name);
    for (const branch of branches) {
      const ref = await this.getRef(owner, name, `refs/heads/${branch}`);
      if (ref) refs.push(ref);
    }

    // Get tags
    const tags = await this.listTags(owner, name);
    for (const tag of tags) {
      const ref = await this.getRef(owner, name, `refs/tags/${tag}`);
      if (ref) refs.push(ref);
    }

    return refs;
  }

  async listBranches(owner: string, name: string): Promise<string[]> {
    const repoPath = this.buildRepoPath(owner, name);
    const headsDir = path.join(repoPath, 'refs', 'heads');
    
    if (!exists(headsDir)) {
      return [];
    }

    return this.listRefsRecursive(headsDir, '');
  }

  async listTags(owner: string, name: string): Promise<string[]> {
    const repoPath = this.buildRepoPath(owner, name);
    const tagsDir = path.join(repoPath, 'refs', 'tags');
    
    if (!exists(tagsDir)) {
      return [];
    }

    return this.listRefsRecursive(tagsDir, '');
  }

  // === Utility ===

  getRepoPath(owner: string, name: string): string {
    return this.buildRepoPath(owner, name);
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Check if projects directory is accessible
      fs.accessSync(this.projectsDir, fs.constants.R_OK | fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  // === Private Helpers ===

  private buildRepoPath(owner: string, name: string): string {
    const repoName = name.endsWith('.git') ? name : `${name}.git`;
    return path.join(this.projectsDir, owner, repoName);
  }

  private buildObjectPath(repoPath: string, hash: string): string {
    return path.join(repoPath, 'objects', hash.slice(0, 2), hash.slice(2));
  }

  private listRefsRecursive(dir: string, prefix: string): string[] {
    const refs: string[] = [];
    const entries = readDir(dir);

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const refName = prefix ? `${prefix}/${entry}` : entry;

      if (isDirectory(fullPath)) {
        refs.push(...this.listRefsRecursive(fullPath, refName));
      } else {
        refs.push(refName);
      }
    }

    return refs;
  }

  private copyDir(src: string, dest: string): void {
    mkdirp(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}
