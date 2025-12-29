/**
 * Git Command Handler for SSH Server
 * 
 * Handles git-upload-pack and git-receive-pack commands over SSH.
 * Implements the Git pack protocol for clone, fetch, and push operations.
 */

import * as path from 'path';
import { EventEmitter } from 'events';
import { ParsedGitCommand, SSHSession } from './types';
import { Repository } from '../../core/repository';
import {
  pktLine,
  pktFlush,
  parsePktLines,
  RefAdvertisement,
  RefUpdate,
  SideBandChannel,
  NULL_HASH,
} from '../../core/protocol/types';
import { parsePackfile } from '../../core/protocol/packfile-parser';
import { createPackfile, PackableObject } from '../../core/protocol/packfile-writer';
import { exists, mkdirp } from '../../utils/fs';

/**
 * Channel interface for SSH streams
 */
interface SSHChannel extends EventEmitter {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  write(data: Buffer | string): boolean;
  end(data?: Buffer | string): void;
}

/**
 * Server capabilities advertised to clients
 */
const SERVER_CAPABILITIES = [
  'multi_ack',
  'thin-pack',
  'side-band',
  'side-band-64k',
  'ofs-delta',
  'shallow',
  'no-progress',
  'include-tag',
  'report-status',
  'delete-refs',
  'agent=wit-ssh-server/1.0',
];

/**
 * Git Command Handler
 * 
 * Processes git protocol commands over SSH channels.
 */
export class GitCommandHandler {
  private repoRoot: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
  }

  /**
   * Handle a git command
   */
  async handleCommand(
    command: ParsedGitCommand,
    channel: SSHChannel,
    session: SSHSession
  ): Promise<boolean> {
    const repoPath = path.join(this.repoRoot, command.repoPath);

    // Check if repository exists
    if (!exists(repoPath) && !exists(path.join(repoPath, '.wit'))) {
      await this.sendError(channel, `Repository not found: ${command.repoPath}`);
      return false;
    }

    try {
      if (command.service === 'git-upload-pack') {
        return await this.handleUploadPack(repoPath, channel, session);
      } else if (command.service === 'git-receive-pack') {
        return await this.handleReceivePack(repoPath, channel, session);
      }
      
      await this.sendError(channel, `Unknown command: ${command.service}`);
      return false;
    } catch (err) {
      const error = err as Error;
      console.error(`Git command error: ${error.message}`);
      await this.sendError(channel, error.message);
      return false;
    }
  }

  /**
   * Handle git-upload-pack (fetch/clone)
   */
  private async handleUploadPack(
    repoPath: string,
    channel: SSHChannel,
    _session: SSHSession
  ): Promise<boolean> {
    const repo = new Repository(repoPath);

    if (!repo.isValid()) {
      await this.sendError(channel, 'Not a valid repository');
      return false;
    }

    // Send ref advertisement
    const refs = await this.advertiseRefs(repo, 'upload-pack');
    await this.sendRefAdvertisement(channel, refs, 'upload-pack');

    // Read client wants and haves
    const clientRequest = await this.readClientRequest(channel);
    
    if (!clientRequest.wants.length) {
      // Client doesn't want anything
      return true;
    }

    // Negotiate and send pack
    return await this.sendPack(repo, channel, clientRequest.wants, clientRequest.haves);
  }

  /**
   * Handle git-receive-pack (push)
   */
  private async handleReceivePack(
    repoPath: string,
    channel: SSHChannel,
    _session: SSHSession
  ): Promise<boolean> {
    // Create repository if it doesn't exist
    let repo: Repository;
    if (!exists(path.join(repoPath, '.wit'))) {
      mkdirp(repoPath);
      repo = Repository.init(repoPath);
    } else {
      repo = new Repository(repoPath);
    }

    if (!repo.isValid()) {
      await this.sendError(channel, 'Not a valid repository');
      return false;
    }

    // Send ref advertisement
    const refs = await this.advertiseRefs(repo, 'receive-pack');
    await this.sendRefAdvertisement(channel, refs, 'receive-pack');

    // Read commands and pack from client
    const { commands, packData } = await this.readPushRequest(channel);

    if (!commands.length) {
      // No updates requested
      return true;
    }

    // Process the pack file
    if (packData.length > 0) {
      const parseResult = parsePackfile(packData);
      for (const obj of parseResult.objects) {
        await this.storeObject(repo, obj);
      }
    }

    // Apply ref updates
    const results = await this.applyRefUpdates(repo, commands);

    // Send status report
    await this.sendPushStatus(channel, results);

    return results.every(r => r.status === 'ok');
  }

  /**
   * Get refs to advertise
   */
  private async advertiseRefs(
    repo: Repository,
    _service: 'upload-pack' | 'receive-pack'
  ): Promise<RefAdvertisement> {
    const refs: { hash: string; name: string; peeled?: string }[] = [];

    // Get HEAD
    const head = repo.refs.getHead();
    const headHash = repo.refs.resolve('HEAD');
    
    if (headHash) {
      refs.push({ hash: headHash, name: 'HEAD' });
    }

    // Get branches
    const branches = repo.refs.listBranches();
    for (const branch of branches) {
      const hash = repo.refs.resolve(`refs/heads/${branch}`);
      if (hash) {
        refs.push({ hash, name: `refs/heads/${branch}` });
      }
    }

    // Get tags
    const tags = repo.refs.listTags();
    for (const tag of tags) {
      const hash = repo.refs.resolve(`refs/tags/${tag}`);
      if (hash) {
        refs.push({ hash, name: `refs/tags/${tag}` });
        
        // Check if it's an annotated tag (has peeled ref)
        const peeled = repo.refs.resolve(`refs/tags/${tag}^{}`);
        if (peeled && peeled !== hash) {
          refs[refs.length - 1].peeled = peeled;
        }
      }
    }

    // Build capabilities object
    const capabilities: Record<string, boolean | string> = {};
    for (const cap of SERVER_CAPABILITIES) {
      const [name, value] = cap.split('=');
      capabilities[name] = value || true;
    }

    // Add symref capability for HEAD
    if (head.isSymbolic && headHash) {
      capabilities['symref'] = `HEAD:${head.target}`;
    }

    return {
      refs,
      capabilities,
      head: headHash || undefined,
    };
  }

  /**
   * Send ref advertisement
   */
  private async sendRefAdvertisement(
    channel: SSHChannel,
    advertisement: RefAdvertisement,
    _service: 'upload-pack' | 'receive-pack'
  ): Promise<void> {
    const parts: Buffer[] = [];

    // Service announcement (not needed for SSH, but some clients expect it)
    // For SSH we go straight to refs

    if (advertisement.refs.length === 0) {
      // Empty repository - send capabilities with null ref
      const capsStr = SERVER_CAPABILITIES.join(' ');
      const line = `${NULL_HASH} capabilities^{}\0${capsStr}\n`;
      parts.push(pktLine(line));
    } else {
      // First ref with capabilities
      const firstRef = advertisement.refs[0];
      const capsStr = SERVER_CAPABILITIES.join(' ');
      const line = `${firstRef.hash} ${firstRef.name}\0${capsStr}\n`;
      parts.push(pktLine(line));

      // Remaining refs
      for (let i = 1; i < advertisement.refs.length; i++) {
        const ref = advertisement.refs[i];
        parts.push(pktLine(`${ref.hash} ${ref.name}\n`));
        
        // Add peeled ref if present
        if (ref.peeled) {
          parts.push(pktLine(`${ref.peeled} ${ref.name}^{}\n`));
        }
      }
    }

    // Flush packet to end advertisement
    parts.push(pktFlush());

    channel.write(Buffer.concat(parts));
  }

  /**
   * Read client fetch request (wants and haves)
   */
  private async readClientRequest(
    channel: SSHChannel
  ): Promise<{ wants: string[]; haves: string[]; shallow?: string[]; depth?: number }> {
    return new Promise((resolve) => {
      const wants: string[] = [];
      const haves: string[] = [];
      const shallow: string[] = [];
      let depth: number | undefined;
      let buffer = Buffer.alloc(0);
      let seenDone = false;

      const processData = (data: Buffer) => {
        buffer = Buffer.concat([buffer, data]);
        const result = parsePktLines(buffer);
        buffer = Buffer.from(result.remainder);
        const lines = result.lines;

        for (const line of lines) {
          if (line.length === 0) {
            // Flush packet - end of section
            continue;
          }

          const lineStr = line.toString('utf8').trim();

          if (lineStr.startsWith('want ')) {
            const hash = lineStr.slice(5).split(' ')[0];
            wants.push(hash);
          } else if (lineStr.startsWith('have ')) {
            haves.push(lineStr.slice(5));
          } else if (lineStr.startsWith('shallow ')) {
            shallow.push(lineStr.slice(8));
          } else if (lineStr.startsWith('deepen ')) {
            depth = parseInt(lineStr.slice(7), 10);
          } else if (lineStr === 'done') {
            seenDone = true;
          }
        }

        // Check if we're done reading
        if (seenDone || (wants.length > 0 && buffer.length === 0)) {
          channel.stdin.removeListener('data', processData);
          resolve({ wants, haves, shallow, depth });
        }
      };

      channel.stdin.on('data', processData);

      // Handle end of stream
      channel.stdin.on('end', () => {
        resolve({ wants, haves, shallow, depth });
      });
    });
  }

  /**
   * Send pack file to client
   */
  private async sendPack(
    repo: Repository,
    channel: SSHChannel,
    wants: string[],
    haves: string[]
  ): Promise<boolean> {
    try {
      // Send NAK to indicate we're ready to send pack
      channel.write(pktLine('NAK\n'));

      // Collect objects to send
      const objects = await this.collectObjects(repo, wants, haves);

      if (objects.length === 0) {
        // Nothing to send - send empty pack
        channel.write(pktFlush());
        return true;
      }

      // Create pack file
      const pack = createPackfile(objects);

      // Send pack data via side-band
      await this.sendPackWithSideband(channel, pack);

      return true;
    } catch (err) {
      const error = err as Error;
      await this.sendError(channel, `Pack creation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Collect objects needed for a fetch
   */
  private async collectObjects(
    repo: Repository,
    wants: string[],
    haves: string[]
  ): Promise<PackableObject[]> {
    const objects: PackableObject[] = [];
    const seen = new Set<string>(haves);
    const toVisit = [...wants];

    while (toVisit.length > 0) {
      const hash = toVisit.pop()!;
      
      if (seen.has(hash)) {
        continue;
      }
      seen.add(hash);

      try {
        const { type, content: data } = repo.objects.readRawObject(hash);
        
        objects.push({
          type,
          data,
          hash,
        });

        // Add referenced objects
        if (type === 'commit') {
          const commit = repo.objects.readCommit(hash);
          toVisit.push(commit.treeHash);
          for (const parent of commit.parentHashes) {
            toVisit.push(parent);
          }
        } else if (type === 'tree') {
          const tree = repo.objects.readTree(hash);
          for (const entry of tree.entries) {
            toVisit.push(entry.hash);
          }
        }
      } catch (_err) {
        // Object not found, skip
        console.warn(`Object not found: ${hash}`);
      }
    }

    return objects;
  }

  /**
   * Send pack data with side-band multiplexing
   */
  private async sendPackWithSideband(channel: SSHChannel, pack: Buffer): Promise<void> {
    const CHUNK_SIZE = 65515; // Max side-band-64k payload

    let offset = 0;
    while (offset < pack.length) {
      const chunk = pack.slice(offset, offset + CHUNK_SIZE);
      const payload = Buffer.concat([Buffer.from([SideBandChannel.PACK_DATA]), chunk]);
      channel.write(pktLine(payload));
      offset += CHUNK_SIZE;
    }

    // Send completion
    channel.write(pktFlush());
  }

  /**
   * Read push request (commands and pack)
   */
  private async readPushRequest(
    channel: SSHChannel
  ): Promise<{ commands: RefUpdate[]; packData: Buffer }> {
    return new Promise((resolve) => {
      const commands: RefUpdate[] = [];
      let buffer = Buffer.alloc(0);
      let readingCommands = true;
      let packData = Buffer.alloc(0);

      const processData = (data: Buffer) => {
        buffer = Buffer.concat([buffer, data]);

        if (readingCommands) {
          const result = parsePktLines(buffer);
          buffer = Buffer.from(result.remainder);
          const lines = result.lines;

          for (const line of lines) {
            if (line.length === 0) {
              // Flush packet - end of commands, start of pack
              readingCommands = false;
              packData = buffer;
              buffer = Buffer.alloc(0);
              break;
            }

            const lineStr = line.toString('utf8').trim();
            const match = lineStr.match(/^([0-9a-f]{40,64}) ([0-9a-f]{40,64}) (.+)$/);
            
            if (match) {
              commands.push({
                oldHash: match[1],
                newHash: match[2],
                name: match[3].split('\0')[0], // Remove capabilities from first line
              });
            }
          }
        } else {
          // Reading pack data
          packData = Buffer.concat([packData, buffer]);
          buffer = Buffer.alloc(0);
        }
      };

      channel.stdin.on('data', processData);

      channel.stdin.on('end', () => {
        if (buffer.length > 0 && !readingCommands) {
          packData = Buffer.concat([packData, buffer]);
        }
        resolve({ commands, packData });
      });
    });
  }

  /**
   * Store an object in the repository
   */
  private async storeObject(repo: Repository, obj: { type: string; data: Buffer; hash?: string }): Promise<void> {
    const type = obj.type as 'blob' | 'tree' | 'commit' | 'tag';
    repo.objects.writeRawObject(type, obj.data, obj.hash);
  }

  /**
   * Apply ref updates from push
   */
  private async applyRefUpdates(
    repo: Repository,
    commands: RefUpdate[]
  ): Promise<{ ref: string; status: 'ok' | 'ng'; message?: string }[]> {
    const results: { ref: string; status: 'ok' | 'ng'; message?: string }[] = [];

    for (const cmd of commands) {
      try {
        const isCreate = cmd.oldHash === NULL_HASH;
        const isDelete = cmd.newHash === NULL_HASH;

        if (cmd.name.startsWith('refs/heads/')) {
          const branch = cmd.name.replace('refs/heads/', '');
          
          if (isDelete) {
            repo.refs.deleteBranch(branch);
          } else if (isCreate) {
            repo.refs.createBranch(branch, cmd.newHash);
          } else {
            // Verify old hash matches
            const currentHash = repo.refs.resolve(cmd.name);
            if (currentHash !== cmd.oldHash && !cmd.force) {
              results.push({
                ref: cmd.name,
                status: 'ng',
                message: 'non-fast-forward',
              });
              continue;
            }
            repo.refs.updateBranch(branch, cmd.newHash);
          }
        } else if (cmd.name.startsWith('refs/tags/')) {
          const tag = cmd.name.replace('refs/tags/', '');
          
          if (isDelete) {
            repo.refs.deleteTag(tag);
          } else {
            repo.refs.createTag(tag, cmd.newHash);
          }
        } else {
          results.push({
            ref: cmd.name,
            status: 'ng',
            message: 'unsupported ref',
          });
          continue;
        }

        results.push({ ref: cmd.name, status: 'ok' });
      } catch (err) {
        const error = err as Error;
        results.push({
          ref: cmd.name,
          status: 'ng',
          message: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Send push status report
   */
  private async sendPushStatus(
    channel: SSHChannel,
    results: { ref: string; status: 'ok' | 'ng'; message?: string }[]
  ): Promise<void> {
    const parts: Buffer[] = [];

    // Unpack status
    parts.push(pktLine('unpack ok\n'));

    // Ref results
    for (const result of results) {
      if (result.status === 'ok') {
        parts.push(pktLine(`ok ${result.ref}\n`));
      } else {
        parts.push(pktLine(`ng ${result.ref} ${result.message || 'failed'}\n`));
      }
    }

    // Flush
    parts.push(pktFlush());

    channel.write(Buffer.concat(parts));
  }

  /**
   * Send error message to client
   */
  private async sendError(channel: SSHChannel, message: string): Promise<void> {
    const errorPkt = Buffer.concat([
      Buffer.from([SideBandChannel.ERROR]),
      Buffer.from(`ERROR: ${message}\n`),
    ]);
    channel.write(pktLine(errorPkt));
    channel.write(pktFlush());
  }
}

/**
 * Create a new repository for SSH server hosting
 */
export function createBareRepository(repoPath: string): Repository {
  mkdirp(repoPath);
  return Repository.init(repoPath);
}
