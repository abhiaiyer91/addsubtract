/**
 * Snapshot Command
 * Create a quick checkpoint without a full commit
 * 
 * Perfect for "save game" before risky operations
 */

import { Repository } from '../core/repository';
import { TsgitError, ErrorCode } from '../core/errors';
import * as path from 'path';
import * as fs from 'fs';
import { colors } from '../utils/colors';

export interface Snapshot {
  id: string;
  timestamp: number;
  name?: string;
  description?: string;
  branch: string | null;
  head: string | null;
  files: Map<string, string>;  // path -> content hash
}

/**
 * Snapshots manager
 */
export class SnapshotManager {
  private snapshotsDir: string;
  private snapshotsFile: string;
  private snapshots: Map<string, Snapshot> = new Map();
  
  constructor(gitDir: string, private workDir: string) {
    this.snapshotsDir = path.join(gitDir, 'snapshots');
    this.snapshotsFile = path.join(gitDir, 'snapshots.json');
    this.load();
  }
  
  private load(): void {
    if (fs.existsSync(this.snapshotsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.snapshotsFile, 'utf8'));
        for (const snap of data.snapshots || []) {
          this.snapshots.set(snap.id, {
            ...snap,
            files: new Map(Object.entries(snap.files || {})),
          });
        }
      } catch {
        // Start fresh
      }
    }
  }
  
  private save(): void {
    const data = {
      version: 1,
      snapshots: Array.from(this.snapshots.values()).map(snap => ({
        ...snap,
        files: Object.fromEntries(snap.files),
      })),
    };
    fs.writeFileSync(this.snapshotsFile, JSON.stringify(data, null, 2));
  }
  
  /**
   * Create a new snapshot
   */
  create(name?: string, description?: string): Snapshot {
    const repo = Repository.find(this.workDir);
    
    // Generate unique ID
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    
    // Capture current state
    const files = new Map<string, string>();
    
    // Walk working directory
    const walkDir = (dir: string): void => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(this.workDir, fullPath);
        
        if (entry.isDirectory()) {
          if (['node_modules', '.wit', '.git'].includes(entry.name)) continue;
          walkDir(fullPath);
        } else if (entry.isFile()) {
          try {
            const content = fs.readFileSync(fullPath);
            const hash = repo.objects.writeBlob(content);
            files.set(relativePath, hash);
          } catch {
            // Skip files we can't read
          }
        }
      }
    };
    
    walkDir(this.workDir);
    
    const snapshot: Snapshot = {
      id,
      timestamp: Date.now(),
      name: name || `snapshot-${id}`,
      description,
      branch: repo.refs.getCurrentBranch(),
      head: repo.refs.resolve('HEAD'),
      files,
    };
    
    this.snapshots.set(id, snapshot);
    this.save();
    
    // Record in journal
    repo.journal.record(
      'snapshot-create',
      [id],
      `Created snapshot "${snapshot.name}"`,
      {
        head: snapshot.head || '',
        branch: snapshot.branch,
        indexHash: '',
      },
      {
        head: snapshot.head || '',
        branch: snapshot.branch,
        indexHash: '',
      }
    );
    
    return snapshot;
  }
  
  /**
   * Restore a snapshot
   */
  restore(id: string): void {
    const snapshot = this.snapshots.get(id);
    if (!snapshot) {
      throw new TsgitError(
        `Snapshot not found: ${id}`,
        ErrorCode.OBJECT_NOT_FOUND,
        ['wit snapshot list    # Show available snapshots']
      );
    }
    
    const repo = Repository.find(this.workDir);
    
    // Restore files
    for (const [filePath, hash] of snapshot.files) {
      const fullPath = path.join(this.workDir, filePath);
      
      // Ensure directory exists
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Read blob and write file
      const blob = repo.objects.readBlob(hash);
      fs.writeFileSync(fullPath, blob.content);
    }
    
    // Record in journal
    repo.journal.record(
      'snapshot-restore',
      [id],
      `Restored snapshot "${snapshot.name}"`,
      {
        head: repo.refs.resolve('HEAD') || '',
        branch: repo.refs.getCurrentBranch(),
        indexHash: '',
      },
      {
        head: repo.refs.resolve('HEAD') || '',
        branch: repo.refs.getCurrentBranch(),
        indexHash: '',
      }
    );
  }
  
  /**
   * List all snapshots
   */
  list(): Snapshot[] {
    return Array.from(this.snapshots.values())
      .sort((a, b) => b.timestamp - a.timestamp);
  }
  
  /**
   * Delete a snapshot
   */
  delete(id: string): void {
    if (!this.snapshots.has(id)) {
      throw new TsgitError(
        `Snapshot not found: ${id}`,
        ErrorCode.OBJECT_NOT_FOUND,
        ['wit snapshot list    # Show available snapshots']
      );
    }
    
    this.snapshots.delete(id);
    this.save();
  }
  
  /**
   * Get snapshot by ID or name
   */
  get(idOrName: string): Snapshot | undefined {
    // Try ID first
    if (this.snapshots.has(idOrName)) {
      return this.snapshots.get(idOrName);
    }
    
    // Try by name
    for (const snap of this.snapshots.values()) {
      if (snap.name === idOrName) {
        return snap;
      }
    }
    
    return undefined;
  }
}

/**
 * CLI handler for snapshot
 */
export function handleSnapshot(args: string[]): void {
  const subcommand = args[0] || 'create';
  
  try {
    const repo = Repository.find();
    const manager = new SnapshotManager(repo.gitDir, repo.workDir);
    
    switch (subcommand) {
      case 'create':
      case 'save': {
        const name = args[1];
        const description = args.slice(2).join(' ') || undefined;
        
        const snapshot = manager.create(name, description);
        console.log(colors.green('✓') + ` Created snapshot: ${colors.cyan(snapshot.name || snapshot.id)}`);
        console.log(colors.dim(`  ID: ${snapshot.id}`));
        console.log(colors.dim(`  Files: ${snapshot.files.size}`));
        console.log(colors.dim(`  Restore with: wit snapshot restore ${snapshot.id}`));
        break;
      }
      
      case 'restore':
      case 'load': {
        const id = args[1];
        if (!id) {
          console.error(colors.red('error: ') + 'Snapshot ID required');
          console.error(colors.dim('Usage: wit snapshot restore <id>'));
          process.exit(1);
        }
        
        const snapshot = manager.get(id);
        if (!snapshot) {
          console.error(colors.red('error: ') + `Snapshot not found: ${id}`);
          process.exit(1);
        }
        
        manager.restore(snapshot.id);
        console.log(colors.green('✓') + ` Restored snapshot: ${colors.cyan(snapshot.name || snapshot.id)}`);
        console.log(colors.dim(`  ${snapshot.files.size} files restored`));
        break;
      }
      
      case 'list':
      case 'ls': {
        const snapshots = manager.list();
        
        if (snapshots.length === 0) {
          console.log(colors.dim('No snapshots yet'));
          console.log(colors.dim('  wit snapshot create [name]    # Create one'));
          return;
        }
        
        console.log(colors.bold('Snapshots:\n'));
        
        for (const snap of snapshots) {
          const date = new Date(snap.timestamp);
          const age = formatAge(date);
          
          console.log(
            colors.cyan(snap.name || snap.id) + ' ' +
            colors.dim(`(${snap.id})`)
          );
          console.log(
            colors.dim(`  Created: ${age} • `) +
            colors.dim(`${snap.files.size} files • `) +
            colors.dim(`Branch: ${snap.branch || 'detached'}`)
          );
          if (snap.description) {
            console.log(colors.dim(`  ${snap.description}`));
          }
          console.log();
        }
        break;
      }
      
      case 'delete':
      case 'rm': {
        const id = args[1];
        if (!id) {
          console.error(colors.red('error: ') + 'Snapshot ID required');
          process.exit(1);
        }
        
        const snapshot = manager.get(id);
        if (!snapshot) {
          console.error(colors.red('error: ') + `Snapshot not found: ${id}`);
          process.exit(1);
        }
        
        manager.delete(snapshot.id);
        console.log(colors.green('✓') + ` Deleted snapshot: ${colors.cyan(snapshot.name || snapshot.id)}`);
        break;
      }
      
      default:
        console.error(colors.red('error: ') + `Unknown subcommand: ${subcommand}`);
        console.log();
        console.log('Usage:');
        console.log('  wit snapshot create [name]   Create a snapshot');
        console.log('  wit snapshot list            List all snapshots');
        console.log('  wit snapshot restore <id>    Restore a snapshot');
        console.log('  wit snapshot delete <id>     Delete a snapshot');
        process.exit(1);
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

function formatAge(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
