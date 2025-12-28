/**
 * AI Router
 * 
 * tRPC router for AI-powered features in the web UI.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import * as path from 'path';
import { router, protectedProcedure, publicProcedure } from '../trpc';
import { repoModel, prModel, collaboratorModel } from '../../../db/models';
import { resolveDiskPath, BareRepository } from '../../../server/storage/repos';
import { exists } from '../../../utils/fs';
import { generatePRDescriptionTool } from '../../../ai/tools/generate-pr-description';
import { getTsgitAgent, isAIAvailable } from '../../../ai/mastra';
import { diff, createHunks, formatUnifiedDiff, FileDiff } from '../../../core/diff';

/**
 * Flatten a tree into a map of path -> blob hash
 */
function flattenTree(repo: BareRepository, treeHash: string, prefix: string): Map<string, string> {
  const result = new Map<string, string>();
  const tree = repo.objects.readTree(treeHash);
  
  for (const entry of tree.entries) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    
    if (entry.mode === '40000') {
      const subTree = flattenTree(repo, entry.hash, fullPath);
      for (const [path, hash] of subTree) {
        result.set(path, hash);
      }
    } else {
      result.set(fullPath, entry.hash);
    }
  }
  
  return result;
}

/**
 * Get diff between two refs using wit's TS API
 */
function getDiffBetweenRefs(repoPath: string, baseSha: string, headSha: string): string {
  try {
    const repo = new BareRepository(repoPath);
    const fileDiffs: FileDiff[] = [];
    
    const baseCommit = repo.objects.readCommit(baseSha);
    const headCommit = repo.objects.readCommit(headSha);
    
    const baseFiles = flattenTree(repo, baseCommit.treeHash, '');
    const headFiles = flattenTree(repo, headCommit.treeHash, '');
    
    const allPaths = new Set([...baseFiles.keys(), ...headFiles.keys()]);
    
    for (const filePath of allPaths) {
      const baseHash = baseFiles.get(filePath);
      const headHash = headFiles.get(filePath);
      
      if (baseHash === headHash) continue;
      
      let oldContent = '';
      let newContent = '';
      
      if (baseHash) {
        const blob = repo.objects.readBlob(baseHash);
        oldContent = blob.content.toString('utf-8');
      }
      
      if (headHash) {
        const blob = repo.objects.readBlob(headHash);
        newContent = blob.content.toString('utf-8');
      }
      
      const diffLines = diff(oldContent, newContent);
      const hunks = createHunks(diffLines);
      
      fileDiffs.push({
        oldPath: filePath,
        newPath: filePath,
        hunks,
        isBinary: false,
        isNew: !baseHash,
        isDeleted: !headHash,
        isRename: false,
      });
    }
    
    return fileDiffs.map(formatUnifiedDiff).join('\n');
  } catch (error) {
    console.error('[ai.getDiff] Error:', error);
    return '';
  }
}

/**
 * Get commits between two refs using wit's TS API
 */
function getCommitsBetween(repoPath: string, baseSha: string, headSha: string): Array<{
  sha: string;
  message: string;
}> {
  try {
    const repo = new BareRepository(repoPath);
    const commits: Array<{ sha: string; message: string }> = [];
    
    // Walk commit history from head to base
    let currentHash: string | null = headSha;
    const baseSet = new Set<string>([baseSha]);
    
    while (currentHash && !baseSet.has(currentHash)) {
      try {
        const commit = repo.objects.readCommit(currentHash);
        commits.push({
          sha: currentHash,
          message: commit.message,
        });
        
        // Move to parent (first parent for linear history)
        currentHash = commit.parentHashes.length > 0 ? commit.parentHashes[0] : null;
      } catch {
        break;
      }
    }
    
    return commits;
  } catch (error) {
    console.error('[ai.getCommits] Error:', error);
    return [];
  }
}

/**
 * Get file diff for a specific file using wit's TS API
 */
function getFileDiff(repoPath: string, baseSha: string, headSha: string, filePath: string): string {
  try {
    const repo = new BareRepository(repoPath);
    
    const baseCommit = repo.objects.readCommit(baseSha);
    const headCommit = repo.objects.readCommit(headSha);
    
    const baseFiles = flattenTree(repo, baseCommit.treeHash, '');
    const headFiles = flattenTree(repo, headCommit.treeHash, '');
    
    const baseHash = baseFiles.get(filePath);
    const headHash = headFiles.get(filePath);
    
    if (baseHash === headHash) return '';
    
    let oldContent = '';
    let newContent = '';
    
    if (baseHash) {
      const blob = repo.objects.readBlob(baseHash);
      oldContent = blob.content.toString('utf-8');
    }
    
    if (headHash) {
      const blob = repo.objects.readBlob(headHash);
      newContent = blob.content.toString('utf-8');
    }
    
    const diffLines = diff(oldContent, newContent);
    const hunks = createHunks(diffLines);
    
    const fileDiff: FileDiff = {
      oldPath: filePath,
      newPath: filePath,
      hunks,
      isBinary: false,
      isNew: !baseHash,
      isDeleted: !headHash,
      isRename: false,
    };
    
    return formatUnifiedDiff(fileDiff);
  } catch (error) {
    console.error('[ai.getFileDiff] Error:', error);
    return '';
  }
}

export const aiRouter = router({
  /**
   * Check if AI features are available
   */
  status: publicProcedure.query(() => {
    return {
      available: isAIAvailable(),
    };
  }),

  /**
   * Generate PR title and description using AI
   */
  generatePRDescription: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      sourceBranch: z.string(),
      targetBranch: z.string(),
      headSha: z.string(),
      baseSha: z.string(),
      existingTitle: z.string().optional(),
      existingDescription: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Check AI availability
      if (!isAIAvailable()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'AI features are not available. Please configure an AI provider.',
        });
      }

      const repo = await repoModel.findById(input.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check if user has read access
      const isOwner = repo.ownerId === ctx.user.id;
      const hasAccess = isOwner || 
        (await collaboratorModel.hasPermission(input.repoId, ctx.user.id, 'read'));

      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this repository',
        });
      }

      // Resolve disk path
      const diskPath = resolveDiskPath(repo.diskPath);

      if (!exists(diskPath)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found on disk',
        });
      }

      // Get diff and commits
      const diff = getDiffBetweenRefs(diskPath, input.baseSha, input.headSha);
      const commits = getCommitsBetween(diskPath, input.baseSha, input.headSha);

      if (!diff && commits.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No changes found between the selected branches',
        });
      }

      // Use the generate PR description tool directly
      try {
        const result = await generatePRDescriptionTool.execute({
          diff: diff || '',
          commits,
          title: input.existingTitle,
          existingDescription: input.existingDescription,
        }) as any;

        return {
          title: result.title,
          description: result.description,
          labels: result.labels,
          summary: result.summary,
          changes: result.changes,
        };
      } catch (error) {
        console.error('[ai.generatePRDescription] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate PR description',
        });
      }
    }),

  /**
   * Explain a file diff using AI
   */
  explainFileDiff: protectedProcedure
    .input(z.object({
      prId: z.string().uuid(),
      filePath: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Check AI availability
      if (!isAIAvailable()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'AI features are not available. Please configure an AI provider.',
        });
      }

      const pr = await prModel.findById(input.prId);
      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      const repo = await repoModel.findById(pr.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check if user has read access
      const isOwner = repo.ownerId === ctx.user.id;
      const hasAccess = isOwner || 
        (await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'read'));

      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this repository',
        });
      }

      // Resolve disk path
      const diskPath = resolveDiskPath(repo.diskPath);

      if (!exists(diskPath)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found on disk',
        });
      }

      // Get the diff for this specific file
      const fileDiff = getFileDiff(diskPath, pr.baseSha, pr.headSha, input.filePath);

      if (!fileDiff) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No changes found for this file',
        });
      }

      // Use the AI agent to explain the diff
      try {
        const agent = getTsgitAgent();
        const prompt = `Analyze this file diff and provide a clear, concise explanation of what changed and why these changes might have been made. Focus on the purpose and impact of the changes.

File: ${input.filePath}

Diff:
\`\`\`diff
${fileDiff.slice(0, 10000)}
\`\`\`

Please provide:
1. A brief summary of what changed (1-2 sentences)
2. Key changes explained with context
3. Any potential impacts or considerations

Keep the explanation clear and helpful for code reviewers.`;

        const response = await agent.generate(prompt);

        return {
          filePath: input.filePath,
          explanation: response.text || 'Unable to generate explanation',
        };
      } catch (error) {
        console.error('[ai.explainFileDiff] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate explanation',
        });
      }
    }),

  /**
   * Get AI-suggested conflict resolution
   */
  suggestConflictResolution: protectedProcedure
    .input(z.object({
      prId: z.string().uuid(),
      filePath: z.string(),
      oursContent: z.string(),
      theirsContent: z.string(),
      baseContent: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Check AI availability
      if (!isAIAvailable()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'AI features are not available. Please configure an AI provider.',
        });
      }

      const pr = await prModel.findById(input.prId);
      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      const repo = await repoModel.findById(pr.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check if user has write access
      const isOwner = repo.ownerId === ctx.user.id;
      const canWrite = isOwner || 
        (await collaboratorModel.hasPermission(pr.repoId, ctx.user.id, 'write'));

      if (!canWrite) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to resolve conflicts',
        });
      }

      // Use the AI agent to suggest resolution
      try {
        const agent = getTsgitAgent();
        const prompt = `Help me resolve this merge conflict. Analyze both versions and suggest the best resolution that preserves the intent of both changes.

File: ${input.filePath}

=== BASE (common ancestor) ===
${input.baseContent || '(not available)'}

=== OURS (target branch: ${pr.targetBranch}) ===
${input.oursContent}

=== THEIRS (source branch: ${pr.sourceBranch}) ===
${input.theirsContent}

Please provide:
1. A suggested resolution that combines both changes appropriately
2. An explanation of why this resolution makes sense
3. Any potential issues to watch out for

Respond in this format:
RESOLUTION:
<the resolved code>

EXPLANATION:
<why this resolution was chosen>`;

        const response = await agent.generate(prompt);

        // Parse the response to extract resolution and explanation
        const text = response.text || '';
        const resolutionMatch = text.match(/RESOLUTION:\n?([\s\S]*?)(?=\nEXPLANATION:|$)/i);
        const explanationMatch = text.match(/EXPLANATION:\n?([\s\S]*?)$/i);

        return {
          filePath: input.filePath,
          suggestedResolution: resolutionMatch?.[1]?.trim() || input.oursContent,
          explanation: explanationMatch?.[1]?.trim() || 'AI suggested combining both changes.',
        };
      } catch (error) {
        console.error('[ai.suggestConflictResolution] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate conflict resolution suggestion',
        });
      }
    }),

  /**
   * Chat with AI about the repository
   */
  chat: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      message: z.string().min(1),
      conversationId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Check AI availability
      if (!isAIAvailable()) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'AI features are not available. Please configure an AI provider.',
        });
      }

      const repo = await repoModel.findById(input.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check if user has read access
      const isOwner = repo.ownerId === ctx.user.id;
      const hasAccess = isOwner || 
        (await collaboratorModel.hasPermission(input.repoId, ctx.user.id, 'read'));

      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this repository',
        });
      }

      // Use the AI agent to respond
      try {
        const agent = getTsgitAgent();
        const prompt = `You are helping a developer understand and work with the repository "${repo.name}". ${repo.description ? `Repository description: ${repo.description}` : ''} You have access to tools that can search the codebase and analyze code. Be helpful, concise, and provide code references when possible.

User question: ${input.message}`;

        const response = await agent.generate(prompt);

        // Extract any file references from the response
        const fileRefs = extractFileReferences(response.text || '');

        return {
          message: response.text || 'I could not generate a response.',
          fileReferences: fileRefs,
          conversationId: input.conversationId || crypto.randomUUID(),
        };
      } catch (error) {
        console.error('[ai.chat] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate response',
        });
      }
    }),

  /**
   * Semantic code search
   */
  semanticSearch: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      query: z.string().min(1),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ input, ctx }) => {
      const repo = await repoModel.findById(input.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check if user has read access
      const isOwner = repo.ownerId === ctx.user.id;
      const hasAccess = isOwner || 
        (await collaboratorModel.hasPermission(input.repoId, ctx.user.id, 'read'));

      if (!hasAccess) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this repository',
        });
      }

      // Note: In a full implementation, this would use the SemanticSearch class
      // For now, we return a placeholder indicating the feature needs repository indexing
      return {
        results: [],
        query: input.query,
        message: 'Semantic search requires repository indexing. Run `wit index` in your repository to enable this feature.',
      };
    }),
});

/**
 * Extract file references from AI response text
 */
function extractFileReferences(text: string): Array<{ path: string; line?: number }> {
  const refs: Array<{ path: string; line?: number }> = [];
  
  // Match patterns like `src/file.ts`, `src/file.ts:123`, or file.ts:45
  const patterns = [
    /`([a-zA-Z0-9_\-./]+\.[a-zA-Z]+):(\d+)`/g,
    /`([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)`/g,
    /\b([a-zA-Z0-9_\-./]+\.(ts|tsx|js|jsx|py|go|rs|java|cpp|c|h|hpp|rb|php|vue|svelte)):(\d+)\b/g,
  ];

  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const path = match[1];
      const line = match[2] ? parseInt(match[2], 10) : undefined;
      if (!refs.some(r => r.path === path && r.line === line)) {
        refs.push({ path, line });
      }
    }
  }

  return refs;
}
