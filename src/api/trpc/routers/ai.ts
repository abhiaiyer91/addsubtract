/**
 * AI Router
 * 
 * tRPC router for AI-powered features in the web UI.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, publicProcedure } from '../trpc';
import { repoModel, prModel, collaboratorModel } from '../../../db/models';
import { resolveDiskPath, BareRepository } from '../../../server/storage/repos';
import { exists } from '../../../utils/fs';
import { generatePRDescriptionTool } from '../../../ai/tools/generate-pr-description';
import { getTsgitAgent, isAIAvailable, isAIAvailableForRepo } from '../../../ai/mastra';
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
   * Check if AI features are available and get configuration status
   * Checks user keys if authenticated, otherwise just server keys
   */
  status: publicProcedure.query(async ({ ctx }) => {
    const hasServerOpenAI = !!process.env.OPENAI_API_KEY;
    const hasServerAnthropic = !!process.env.ANTHROPIC_API_KEY;
    const hasServerOpenRouter = !!process.env.OPENROUTER_API_KEY;
    const serverAvailable = hasServerOpenAI || hasServerAnthropic || hasServerOpenRouter;
    
    // If user is authenticated, check their personal keys too
    let hasUserOpenAI = false;
    let hasUserAnthropic = false;
    let hasUserOpenRouter = false;
    let userKeySource: 'user' | 'server' | null = null;
    
    if (ctx.user) {
      // Import here to avoid circular dependency
      const { userAiKeyModel } = await import('../../../db/models');
      const userOpenAIKey = await userAiKeyModel.getDecryptedKey(ctx.user.id, 'openai');
      const userAnthropicKey = await userAiKeyModel.getDecryptedKey(ctx.user.id, 'anthropic');
      const userOpenRouterKey = await userAiKeyModel.getDecryptedKey(ctx.user.id, 'openrouter');
      hasUserOpenAI = !!userOpenAIKey;
      hasUserAnthropic = !!userAnthropicKey;
      hasUserOpenRouter = !!userOpenRouterKey;
      
      if (hasUserOpenAI || hasUserAnthropic || hasUserOpenRouter) {
        userKeySource = 'user';
      } else if (serverAvailable) {
        userKeySource = 'server';
      }
    }
    
    const hasOpenAI = hasUserOpenAI || hasServerOpenAI;
    const hasAnthropic = hasUserAnthropic || hasServerAnthropic;
    const hasOpenRouter = hasUserOpenRouter || hasServerOpenRouter;
    const available = hasOpenAI || hasAnthropic || hasOpenRouter;
    
    return {
      available,
      providers: {
        openai: hasOpenAI,
        anthropic: hasAnthropic,
        openrouter: hasOpenRouter,
      },
      features: {
        semanticSearch: hasOpenAI || hasOpenRouter, // OpenRouter can also use OpenAI embeddings
        codeGeneration: available,
        prDescription: available,
        codeReview: available,
      },
      source: userKeySource,
      hasUserKeys: hasUserOpenAI || hasUserAnthropic || hasUserOpenRouter,
      hasServerKeys: serverAvailable,
      message: !available 
        ? 'AI features are not configured. Add an API key in Settings > AI to enable AI-powered features.'
        : undefined,
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
      const repo = await repoModel.findById(input.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check AI availability (server-level or repo-level keys)
      const aiAvailable = await isAIAvailableForRepo(input.repoId);
      if (!aiAvailable) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'AI features are not available. Please configure an AI provider.',
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

      // Check AI availability (server-level or repo-level keys)
      const aiAvailable = await isAIAvailableForRepo(pr.repoId);
      if (!aiAvailable) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'AI features are not available. Please configure an AI provider.',
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

      // Check AI availability (server-level or repo-level keys)
      const aiAvailable = await isAIAvailableForRepo(pr.repoId);
      if (!aiAvailable) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'AI features are not available. Please configure an AI provider.',
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
   * Generate a squash commit message from PR commits
   * Summarizes all commits in a PR into a single, well-formatted commit message
   */
  summarizeForSquash: protectedProcedure
    .input(z.object({
      prId: z.string().uuid(),
    }))
    .mutation(async ({ input, ctx }) => {
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

      // Check AI availability (server-level or repo-level keys)
      const aiAvailable = await isAIAvailableForRepo(pr.repoId);
      if (!aiAvailable) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'AI features are not available. Please configure an AI provider.',
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

      // Get commits between base and head
      const commits = getCommitsBetween(diskPath, pr.baseSha, pr.headSha);

      if (commits.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No commits found in this pull request',
        });
      }

      // Get the diff for context
      const diffContent = getDiffBetweenRefs(diskPath, pr.baseSha, pr.headSha);

      // Use the AI agent to summarize
      try {
        const agent = getTsgitAgent();
        const commitList = commits.map((c, i) => `${i + 1}. ${c.message}`).join('\n');
        
        const prompt = `You are helping create a squash commit message for a pull request. Analyze the commits and diff to create a clear, concise commit message.

## Pull Request
- Title: ${pr.title}
- Description: ${(pr as any).description || '(none)'}
- Source branch: ${pr.sourceBranch}
- Target branch: ${pr.targetBranch}

## Commits (${commits.length} total)
${commitList}

## Diff Summary (truncated)
\`\`\`diff
${diffContent.slice(0, 8000)}
\`\`\`

## Instructions
Generate a squash commit message following this format:
1. **Title line**: A clear, concise summary (max 72 chars) that describes the overall change
2. **Blank line**
3. **Body**: 
   - Briefly explain what changes were made and why
   - Use bullet points for multiple changes
   - Reference the PR number: (#${pr.number})
   
Keep it professional and informative. Focus on the "what" and "why", not the "how".

Respond with ONLY the commit message, no additional commentary.`;

        const response = await agent.generate(prompt);

        const message = response.text?.trim() || `${pr.title} (#${pr.number})`;

        return {
          title: message.split('\n')[0] || pr.title,
          body: message.split('\n').slice(2).join('\n').trim(),
          fullMessage: message,
          commitCount: commits.length,
        };
      } catch (error) {
        console.error('[ai.summarizeForSquash] Error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to generate squash commit message',
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
      const repo = await repoModel.findById(input.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check AI availability (server-level or repo-level keys)
      const aiAvailable = await isAIAvailableForRepo(input.repoId);
      if (!aiAvailable) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'AI features are not available. Please configure an AI provider.',
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
   * Chat with AI about a specific Pull Request
   */
  chatWithPR: protectedProcedure
    .input(z.object({
      prId: z.string().uuid(),
      message: z.string().min(1),
      conversationId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Get PR details first (needed to check repo-level AI keys)
      const pr = await prModel.findById(input.prId);
      if (!pr) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Pull request not found',
        });
      }

      // Get repo details
      const repo = await repoModel.findById(pr.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check AI availability (server-level or repo-level keys)
      const aiAvailable = await isAIAvailableForRepo(pr.repoId);
      if (!aiAvailable) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'AI features are not available. Please configure an AI provider.',
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

      // Get the repository path and compute the diff
      const repoPath = resolveDiskPath(repo.diskPath);
      if (!await exists(repoPath)) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository data not found on disk',
        });
      }

      // Get diff between base and head
      let diffContent = '';
      let commits: Array<{ sha: string; message: string }> = [];
      
      if (pr.baseSha && pr.headSha) {
        diffContent = getDiffBetweenRefs(repoPath, pr.baseSha, pr.headSha);
        commits = getCommitsBetween(repoPath, pr.baseSha, pr.headSha);
      }

      // Truncate diff if too long (keep first 50k chars)
      const maxDiffLength = 50000;
      if (diffContent.length > maxDiffLength) {
        diffContent = diffContent.substring(0, maxDiffLength) + '\n\n... (diff truncated for length)';
      }

      // Build context for the AI
      const prContext = `
## Pull Request: ${pr.title}

**Repository:** ${repo.name}
**PR Number:** #${pr.number}
**State:** ${pr.state}
**Source Branch:** ${pr.sourceBranch}
**Target Branch:** ${pr.targetBranch}

### Description
${pr.body || 'No description provided.'}

### Commits (${commits.length})
${commits.map(c => `- ${c.sha.substring(0, 7)}: ${c.message.split('\n')[0]}`).join('\n') || 'No commits available.'}

### Code Changes (Diff)
\`\`\`diff
${diffContent || 'No diff available.'}
\`\`\`
`;

      // Use the AI agent to respond
      try {
        const agent = getTsgitAgent();
        const prompt = `You are an AI code reviewer helping a developer understand a Pull Request in the repository "${repo.name}".

Here is the context about the PR:
${prContext}

Based on the PR information and code changes above, please answer the following question:

${input.message}

Be helpful, concise, and provide specific references to files and line numbers when relevant. If the question is about code changes, refer to the diff provided. If you need to explain code logic, use the context from the PR description and commits.`;

        const response = await agent.generate(prompt);

        // Extract any file references from the response
        const fileRefs = extractFileReferences(response.text || '');

        return {
          message: response.text || 'I could not generate a response.',
          fileReferences: fileRefs,
          conversationId: input.conversationId || crypto.randomUUID(),
        };
      } catch (error) {
        console.error('[ai.chatWithPR] Error:', error);
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
