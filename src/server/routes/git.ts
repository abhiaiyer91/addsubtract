import { Hono } from 'hono';
import { RepoManager, BareRepository } from '../storage/repos';
import {
  pktLine,
  pktFlush,
  parsePktLines,
  NULL_HASH,
} from '../../core/protocol/types';
import { serializeCapabilities } from '../../core/protocol/refs-discovery';
import { createPackfile, PackableObject } from '../../core/protocol/packfile-writer';
import { parsePackfile } from '../../core/protocol/packfile-parser';
import { ObjectType } from '../../core/types';
import { repoModel, userModel, activityModel } from '../../db/models';
import { isConnected } from '../../db';
import { gitAuthMiddleware } from '../middleware/auth';
import { computeLanguageStats } from '../../api/trpc/routers/repos';

/**
 * Git Smart HTTP server routes
 */
export function createGitRoutes(repoManager: RepoManager): Hono {
  const app = new Hono();

  // Apply auth middleware to all git routes
  app.use('*', gitAuthMiddleware);

  // Skip git routes for /api/* paths - they should be handled by other routers
  app.use('*', async (c, next) => {
    const path = c.req.path;
    if (path.startsWith('/api/')) {
      // Let 404 handler deal with unmatched /api/* routes
      return c.notFound();
    }
    return next();
  });

  /**
   * GET /:owner/:repo/info/refs
   * Ref discovery for clone/fetch (upload-pack) or push (receive-pack)
   */
  app.get('/:owner/:repo/info/refs', async (c) => {
    const { owner, repo } = c.req.param();
    const service = c.req.query('service');

    console.log(`[server] info/refs: ${owner}/${repo} service=${service}`);

    if (!service) {
      return c.text('Smart HTTP only - service parameter required', 400);
    }

    // Validate service
    if (service !== 'git-upload-pack' && service !== 'git-receive-pack') {
      return c.text(`Unknown service: ${service}`, 400);
    }

    // Get or create repository
    const repository = repoManager.getRepo(owner, repo, true);
    if (!repository) {
      return c.text('Repository not found', 404);
    }

    // Build response
    const response = buildRefAdvertisement(repository, service);

    // Return binary response with correct content type
    // Convert Buffer to Uint8Array for Response compatibility
    return new Response(new Uint8Array(response), {
      status: 200,
      headers: {
        'Content-Type': `application/x-${service}-advertisement`,
        'Cache-Control': 'no-cache',
      },
    });
  });

  /**
   * POST /:owner/:repo/git-upload-pack
   * Handle clone/fetch requests
   */
  app.post('/:owner/:repo/git-upload-pack', async (c) => {
    const { owner, repo } = c.req.param();
    console.log(`[server] upload-pack: ${owner}/${repo}`);

    const repository = repoManager.getRepo(owner, repo, false);
    if (!repository) {
      return c.text('Repository not found', 404);
    }

    try {
      const body = await c.req.arrayBuffer();
      const requestBuffer = Buffer.from(body);

      // Parse the request
      const { wants, haves, capabilities } = parseUploadPackRequest(requestBuffer);

      console.log(`[server] upload-pack wants: ${wants.length}, haves: ${haves.length}`);

      if (wants.length === 0) {
        return c.text('No refs requested', 400);
      }

      // Build and send packfile
      const response = buildUploadPackResponse(repository, wants, haves, capabilities);

      // Log clone/fetch activity (only if it's a full clone with no haves)
      if (haves.length === 0) {
        await logCloneActivity(owner, repo, c);
      }

      // Convert Buffer to Uint8Array for Response compatibility
      return new Response(new Uint8Array(response), {
        status: 200,
        headers: {
          'Content-Type': 'application/x-git-upload-pack-result',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error) {
      console.error('[server] upload-pack error:', error);
      return c.text(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  });

  /**
   * POST /:owner/:repo/git-receive-pack
   * Handle push requests
   */
  app.post('/:owner/:repo/git-receive-pack', async (c) => {
    const { owner, repo } = c.req.param();
    console.log(`[server] receive-pack: ${owner}/${repo}`);

    const repository = repoManager.getRepo(owner, repo, true);
    if (!repository) {
      return c.text('Repository not found', 404);
    }

    try {
      const body = await c.req.arrayBuffer();
      const requestBuffer = Buffer.from(body);

      // Parse the request
      const { commands, packData, capabilities } = parseReceivePackRequest(requestBuffer);

      console.log(`[server] receive-pack commands: ${commands.length}, pack size: ${packData.length}`);

      // Process the push
      const result = processReceivePack(repository, commands, packData, capabilities);

      // After successful push, update database
      await handleDatabaseIntegration(owner, repo, repository.gitDir, commands, c);

      // Convert Buffer to Uint8Array for Response compatibility
      return new Response(new Uint8Array(result), {
        status: 200,
        headers: {
          'Content-Type': 'application/x-git-receive-pack-result',
          'Cache-Control': 'no-cache',
        },
      });
    } catch (error) {
      console.error('[server] receive-pack error:', error);
      return c.text(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 500);
    }
  });

  return app;
}

/**
 * Build ref advertisement response
 */
function buildRefAdvertisement(repo: BareRepository, service: string): Buffer {
  const parts: Buffer[] = [];

  // Service line (required for smart HTTP)
  parts.push(pktLine(`# service=${service}\n`));
  parts.push(pktFlush());

  // Get all refs
  const branches = repo.refs.listBranches();
  const tags = repo.refs.listTags();

  // Server capabilities
  const capabilities = {
    'report-status': true,
    'delete-refs': true,
    'ofs-delta': true,
    'side-band-64k': true,
    'no-progress': true,
    'shallow': true,
    'agent': 'wit-server/2.0',
  };

  const capString = serializeCapabilities(capabilities);

  let firstRef = true;

  // Add HEAD if it resolves
  const headHash = repo.refs.resolve('HEAD');
  if (headHash) {
    if (firstRef) {
      parts.push(pktLine(`${headHash} HEAD\0${capString}\n`));
      firstRef = false;
    } else {
      parts.push(pktLine(`${headHash} HEAD\n`));
    }
  }

  // Add branches
  for (const branch of branches) {
    const hash = repo.refs.resolve(branch);
    if (hash) {
      const refName = `refs/heads/${branch}`;
      if (firstRef) {
        parts.push(pktLine(`${hash} ${refName}\0${capString}\n`));
        firstRef = false;
      } else {
        parts.push(pktLine(`${hash} ${refName}\n`));
      }
    }
  }

  // Add tags
  for (const tag of tags) {
    const hash = repo.refs.resolve(tag);
    if (hash) {
      const refName = `refs/tags/${tag}`;
      if (firstRef) {
        parts.push(pktLine(`${hash} ${refName}\0${capString}\n`));
        firstRef = false;
      } else {
        parts.push(pktLine(`${hash} ${refName}\n`));
      }
    }
  }

  // If no refs, send a zero-id with capabilities
  if (firstRef) {
    parts.push(pktLine(`${NULL_HASH} capabilities^{}\0${capString}\n`));
  }

  parts.push(pktFlush());

  return Buffer.concat(parts);
}

/**
 * Parse upload-pack request (wants/haves)
 */
interface UploadPackRequest {
  wants: string[];
  haves: string[];
  capabilities: Set<string>;
  depth?: number;
  done: boolean;
}

function parseUploadPackRequest(data: Buffer): UploadPackRequest {
  const { lines } = parsePktLines(data);
  const wants: string[] = [];
  const haves: string[] = [];
  const capabilities = new Set<string>();
  let depth: number | undefined;
  let done = false;

  for (const line of lines) {
    if (line.length === 0) {
      // Flush packet
      continue;
    }

    const lineStr = line.toString('utf8').trim();

    if (lineStr.startsWith('want ')) {
      // Parse want line: "want <sha> [capabilities...]"
      const parts = lineStr.slice(5).split(' ');
      const sha = parts[0];
      wants.push(sha);

      // Parse capabilities from first want line
      if (wants.length === 1 && parts.length > 1) {
        for (let i = 1; i < parts.length; i++) {
          capabilities.add(parts[i]);
        }
      }
    } else if (lineStr.startsWith('have ')) {
      const sha = lineStr.slice(5).trim();
      haves.push(sha);
    } else if (lineStr.startsWith('deepen ')) {
      depth = parseInt(lineStr.slice(7), 10);
    } else if (lineStr === 'done') {
      done = true;
    }
  }

  return { wants, haves, capabilities, depth, done };
}

/**
 * Build upload-pack response (packfile with objects)
 */
function buildUploadPackResponse(
  repo: BareRepository,
  wants: string[],
  haves: string[],
  capabilities: Set<string>
): Buffer {
  const parts: Buffer[] = [];
  const useSideBand = capabilities.has('side-band-64k') || capabilities.has('side-band');

  // Send NAK or ACK
  if (haves.length === 0) {
    parts.push(pktLine('NAK\n'));
  } else {
    // Check which haves we have
    let foundCommon = false;
    for (const have of haves) {
      if (repo.objects.hasObject(have)) {
        parts.push(pktLine(`ACK ${have}\n`));
        foundCommon = true;
        break;
      }
    }
    if (!foundCommon) {
      parts.push(pktLine('NAK\n'));
    }
  }

  // Collect objects to send
  const objectsToSend = collectObjectsToSend(repo, wants, haves);
  
  if (objectsToSend.length > 0) {
    // Create packfile
    const packfile = createPackfile(objectsToSend, { useDelta: false });

    if (useSideBand) {
      // Send packfile using sideband
      const chunkSize = 65515; // Max sideband-64k chunk size
      for (let i = 0; i < packfile.length; i += chunkSize) {
        const chunk = packfile.slice(i, Math.min(i + chunkSize, packfile.length));
        // Channel 1 = pack data
        const sidebandData = Buffer.concat([Buffer.from([1]), chunk]);
        parts.push(pktLine(sidebandData));
      }
      parts.push(pktFlush());
    } else {
      // Send packfile directly
      parts.push(packfile);
    }
  } else {
    parts.push(pktFlush());
  }

  return Buffer.concat(parts);
}

/**
 * Collect all objects that need to be sent
 */
function collectObjectsToSend(
  repo: BareRepository,
  wants: string[],
  haves: string[]
): PackableObject[] {
  const havesSet = new Set(haves);
  const toSend: PackableObject[] = [];
  const seen = new Set<string>();

  // Walk from each want, collecting objects until we hit a have
  const queue: string[] = [...wants];

  while (queue.length > 0) {
    const hash = queue.shift()!;

    if (seen.has(hash) || havesSet.has(hash)) {
      continue;
    }
    seen.add(hash);

    // Read the object
    try {
      const { type, content } = repo.objects.readRawObject(hash);
      toSend.push({ type, data: content, hash });

      // If it's a commit, add its tree and parents to the queue
      if (type === 'commit') {
        const commit = repo.objects.readCommit(hash);
        queue.push(commit.treeHash);
        for (const parentHash of commit.parentHashes) {
          queue.push(parentHash);
        }
      }
      // If it's a tree, add its entries to the queue
      else if (type === 'tree') {
        const tree = repo.objects.readTree(hash);
        for (const entry of tree.entries) {
          queue.push(entry.hash);
        }
      }
    } catch {
      // Object not found - skip
      console.warn(`[server] Object not found: ${hash}`);
    }
  }

  console.log(`[server] Sending ${toSend.length} objects`);
  return toSend;
}

/**
 * Parse receive-pack request (commands and packfile)
 */
interface ReceivePackRequest {
  commands: RefCommand[];
  packData: Buffer;
  capabilities: Set<string>;
}

interface RefCommand {
  oldHash: string;
  newHash: string;
  refName: string;
}

function parseReceivePackRequest(data: Buffer): ReceivePackRequest {
  const commands: RefCommand[] = [];
  const capabilities = new Set<string>();
  let packStart = 0;

  // Find where pack data starts (look for 'PACK' signature)
  const packSignature = Buffer.from('PACK');
  for (let i = 0; i < data.length - 4; i++) {
    if (data.slice(i, i + 4).equals(packSignature)) {
      packStart = i;
      break;
    }
  }

  // Parse command lines before pack data
  const commandData = data.slice(0, packStart);
  const { lines } = parsePktLines(commandData);

  for (const line of lines) {
    if (line.length === 0) {
      // Flush packet
      continue;
    }

    const lineStr = line.toString('utf8');

    // Parse command line: "<old-sha> <new-sha> <refname>\0<capabilities>"
    const nullIndex = lineStr.indexOf('\0');
    const commandPart = nullIndex !== -1 ? lineStr.slice(0, nullIndex) : lineStr;
    const capPart = nullIndex !== -1 ? lineStr.slice(nullIndex + 1) : '';

    const parts = commandPart.trim().split(' ');
    if (parts.length >= 3) {
      const [oldHash, newHash, refName] = parts;
      commands.push({ oldHash, newHash, refName });
    }

    // Parse capabilities from first line
    if (commands.length === 1 && capPart) {
      for (const cap of capPart.trim().split(' ')) {
        if (cap) {
          capabilities.add(cap);
        }
      }
    }
  }

  // Extract pack data
  const packData = packStart > 0 ? data.slice(packStart) : Buffer.alloc(0);

  return { commands, packData, capabilities };
}

/**
 * Process receive-pack request
 */
function processReceivePack(
  repo: BareRepository,
  commands: RefCommand[],
  packData: Buffer,
  capabilities: Set<string>
): Buffer {
  const parts: Buffer[] = [];
  const useSideBand = capabilities.has('side-band-64k') || capabilities.has('side-band');
  const results: { ref: string; ok: boolean; message?: string }[] = [];

  // Unpack objects if pack data is provided
  let unpackOk = true;
  let unpackMessage = 'ok';

  if (packData.length > 0) {
    try {
      const parsed = parsePackfile(packData);
      console.log(`[server] Unpacked ${parsed.objects.length} objects`);

      // Store all objects
      for (const obj of parsed.objects) {
        repo.objects.writeRawObject(obj.type as ObjectType, obj.data, obj.hash);
      }
    } catch (error) {
      unpackOk = false;
      unpackMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[server] Unpack error:', error);
    }
  }

  // Process ref updates
  if (unpackOk) {
    for (const cmd of commands) {
      try {
        processRefCommand(repo, cmd);
        results.push({ ref: cmd.refName, ok: true });
        console.log(`[server] Updated ref: ${cmd.refName} -> ${cmd.newHash}`);
      } catch (error) {
        results.push({
          ref: cmd.refName,
          ok: false,
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        console.error(`[server] Failed to update ref ${cmd.refName}:`, error);
      }
    }
  } else {
    // All refs fail if unpack failed
    for (const cmd of commands) {
      results.push({ ref: cmd.refName, ok: false, message: 'unpack failed' });
    }
  }

  // Build response
  if (useSideBand) {
    // Send status via sideband channel 1
    const statusParts: Buffer[] = [];

    // Unpack status
    statusParts.push(pktLine(`unpack ${unpackMessage}\n`));

    // Ref statuses
    for (const result of results) {
      if (result.ok) {
        statusParts.push(pktLine(`ok ${result.ref}\n`));
      } else {
        statusParts.push(pktLine(`ng ${result.ref} ${result.message || 'failed'}\n`));
      }
    }
    statusParts.push(pktFlush());

    const statusData = Buffer.concat(statusParts);

    // Wrap in sideband
    const sidebandData = Buffer.concat([Buffer.from([1]), statusData]);
    parts.push(pktLine(sidebandData));
    parts.push(pktFlush());
  } else {
    // Send status directly
    parts.push(pktLine(`unpack ${unpackMessage}\n`));

    for (const result of results) {
      if (result.ok) {
        parts.push(pktLine(`ok ${result.ref}\n`));
      } else {
        parts.push(pktLine(`ng ${result.ref} ${result.message || 'failed'}\n`));
      }
    }
    parts.push(pktFlush());
  }

  return Buffer.concat(parts);
}

/**
 * Log clone activity to the database
 */
async function logCloneActivity(
  owner: string,
  repo: string,
  c: any
): Promise<void> {
  // Skip if database is not connected
  if (!(await isConnected())) {
    return;
  }

  try {
    const repoName = repo.replace(/\.(git|wit)$/, '');
    const dbRepoResult = await repoModel.findByPath(owner, repoName);

    if (!dbRepoResult) {
      return;
    }

    const authenticatedUser = c.get('user');
    
    // Only log if we have an authenticated user
    if (authenticatedUser) {
      // Note: We could add a 'clone' activity type, but for now we'll skip
      // since it's not in the defined ActivityType enum
      console.log(`[server] Clone by ${authenticatedUser.username}: ${owner}/${repoName}`);
    }
  } catch (error) {
    // Log error but don't fail the clone
    console.error('[server] Clone activity logging error:', error);
  }
}

/**
 * Handle database integration after a successful push
 */
async function handleDatabaseIntegration(
  owner: string,
  repo: string,
  diskPath: string,
  commands: RefCommand[],
  c: any
): Promise<void> {
  // Skip if database is not connected
  if (!(await isConnected())) {
    return;
  }

  try {
    const repoName = repo.replace(/\.(git|wit)$/, '');

    // Get or create repository in database
    const dbRepoResult = await repoModel.findByPath(owner, repoName);
    let dbRepo = dbRepoResult?.repo;
    let dbUser = dbRepoResult?.owner && 'username' in dbRepoResult.owner ? dbRepoResult.owner : null;

    if (!dbRepo) {
      // Find user by username
      const user = await userModel.findByUsername(owner);

      if (user) {
        dbRepo = await repoModel.create({
          ownerId: user.id,
          ownerType: 'user',
          name: repoName,
          diskPath,
          defaultBranch: 'main',
          isPrivate: false,
        });
        // Map legacy user to owner type
        dbUser = {
          id: user.id,
          name: user.name ?? '',
          email: user.email,
          username: user.username,
          image: null,
          avatarUrl: user.avatarUrl,
        };
        console.log(`[server] Created database record for ${owner}/${repoName}`);
      } else {
        // Create placeholder user if not exists
        const newUser = await userModel.create({
          username: owner,
          email: `${owner}@placeholder.local`,
          name: owner,
        });

        dbRepo = await repoModel.create({
          ownerId: newUser.id,
          ownerType: 'user',
          name: repoName,
          diskPath,
          defaultBranch: 'main',
          isPrivate: false,
        });
        // Map legacy user to owner type
        dbUser = {
          id: newUser.id,
          name: newUser.name ?? '',
          email: newUser.email,
          username: newUser.username,
          image: null,
          avatarUrl: newUser.avatarUrl,
        };
        console.log(`[server] Created placeholder user and database record for ${owner}/${repoName}`);
      }
    }

    // Update pushed_at timestamp and language stats
    if (dbRepo) {
      await repoModel.updatePushedAt(dbRepo.id);
      
      // Update language stats in the background (fire and forget)
      // This makes future getLanguages calls fast by caching the result
      computeLanguageStats(diskPath, dbRepo.defaultBranch)
        .then(stats => {
          if (stats.length > 0) {
            return repoModel.updateLanguageStats(dbRepo.id, stats);
          }
        })
        .then(() => {
          console.log(`[server] Updated language stats for ${owner}/${repoName}`);
        })
        .catch(err => {
          console.error(`[server] Failed to update language stats for ${owner}/${repoName}:`, err);
        });
    }

    // Log activity if we have both repo and user
    // Try to get authenticated user from context, fallback to owner
    const authenticatedUser = c.get('user');
    const actorId = authenticatedUser?.id || dbUser?.id;

    if (dbRepo && actorId && commands.length > 0) {
      // Get the first command's ref info for activity logging
      const firstCommand = commands[0];
      const refName = firstCommand.refName;
      const branch = refName.startsWith('refs/heads/') ? refName.slice(11) : refName;

      await activityModel.create({
        actorId,
        repoId: dbRepo.id,
        type: 'push',
        payload: {
          branch,
          commits: commands.map(cmd => ({
            sha: cmd.newHash,
            message: `${cmd.oldHash.slice(0, 7)}..${cmd.newHash.slice(0, 7)}`,
          })),
        },
      });

      console.log(`[server] Logged push activity for ${owner}/${repoName}`);
    }
  } catch (error) {
    // Log error but don't fail the push
    console.error('[server] Database integration error:', error);
  }
}

/**
 * Process a single ref update command
 */
function processRefCommand(repo: BareRepository, cmd: RefCommand): void {
  const { oldHash, newHash, refName } = cmd;

  // Validate ref name
  if (!refName.startsWith('refs/')) {
    throw new Error(`Invalid ref name: ${refName}`);
  }

  // Check if this is a delete
  if (newHash === NULL_HASH) {
    // Delete the ref
    if (refName.startsWith('refs/heads/')) {
      const branchName = refName.slice(11);
      if (repo.refs.branchExists(branchName)) {
        repo.refs.deleteBranch(branchName);
      }
    } else if (refName.startsWith('refs/tags/')) {
      const tagName = refName.slice(10);
      if (repo.refs.tagExists(tagName)) {
        repo.refs.deleteTag(tagName);
      }
    }
    return;
  }

  // Verify the new object exists
  if (!repo.objects.hasObject(newHash)) {
    throw new Error(`Object not found: ${newHash}`);
  }

  // Check old hash if not creating
  if (oldHash !== NULL_HASH) {
    const currentHash = repo.refs.resolve(refName);
    if (currentHash !== oldHash) {
      throw new Error(`Ref ${refName} is at ${currentHash}, expected ${oldHash}`);
    }
  }

  // Update the ref
  if (refName.startsWith('refs/heads/')) {
    const branchName = refName.slice(11);
    if (oldHash === NULL_HASH) {
      repo.refs.createBranch(branchName, newHash);
    } else {
      repo.refs.updateBranch(branchName, newHash);
    }
  } else if (refName.startsWith('refs/tags/')) {
    const tagName = refName.slice(10);
    if (oldHash === NULL_HASH) {
      repo.refs.createTag(tagName, newHash);
    } else {
      // Tags are typically immutable, but we'll allow updates
      repo.refs.deleteTag(tagName);
      repo.refs.createTag(tagName, newHash);
    }
  } else {
    // Generic ref update (write directly)
    const fs = require('fs');
    const path = require('path');
    const refPath = path.join(repo.gitDir, refName);
    const refDir = path.dirname(refPath);
    
    if (!fs.existsSync(refDir)) {
      fs.mkdirSync(refDir, { recursive: true });
    }
    fs.writeFileSync(refPath, newHash + '\n');
  }
}
