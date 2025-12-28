/**
 * Search Router
 * 
 * tRPC router for search functionality including text-based and semantic code search.
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { repoModel, collaboratorModel, userModel, issueModel, prModel, userAiKeyModel } from '../../../db/models';
import { resolveDiskPath, BareRepository } from '../../../server/storage/repos';
import { exists } from '../../../utils/fs';
import { isAIAvailable } from '../../../ai/mastra';
import { generateEmbedding, detectLanguage, cosineSimilarity } from '../../../search/embeddings';

/**
 * Check if semantic search is available for a user
 * Requires OpenAI key (for embeddings) - either user's own or server-level
 */
async function canUseSemanticSearch(userId?: string): Promise<boolean> {
  // Check server-level OpenAI key first
  if (process.env.OPENAI_API_KEY) {
    return true;
  }
  
  // Check user-level OpenAI key
  if (userId) {
    const userKey = await userAiKeyModel.getDecryptedKey(userId, 'openai');
    if (userKey) {
      return true;
    }
  }
  
  return false;
}

/**
 * Code search result type
 */
interface CodeSearchResult {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
  matchLine?: number;
  language: string;
  repoId: string;
  repoName: string;
  repoOwner: string;
  score?: number;
}

/**
 * Walk a git tree and get all file paths with their blob hashes
 */
function walkTree(
  repo: BareRepository,
  treeHash: string,
  prefix: string = ''
): Array<{ path: string; hash: string; mode: string }> {
  const files: Array<{ path: string; hash: string; mode: string }> = [];
  
  try {
    const tree = repo.objects.readTree(treeHash);
    
    for (const entry of tree.entries) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      
      if (entry.mode === '40000') {
        // Directory - recurse
        files.push(...walkTree(repo, entry.hash, fullPath));
      } else {
        // File
        files.push({ path: fullPath, hash: entry.hash, mode: entry.mode });
      }
    }
  } catch {
    // Skip invalid trees
  }
  
  return files;
}

/**
 * Check if a file should be searched (skip binary/large files)
 */
function isSearchableFile(path: string): boolean {
  const skipExtensions = [
    '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp', '.bmp',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv',
    '.exe', '.dll', '.so', '.dylib',
    '.lock', '.map',
  ];
  
  const skipPaths = [
    'node_modules/', '.git/', '.wit/', 'dist/', 'build/', 
    'vendor/', '__pycache__/', '.next/', '.nuxt/',
    'coverage/', '.cache/',
  ];
  
  const lowerPath = path.toLowerCase();
  
  // Skip by extension
  for (const ext of skipExtensions) {
    if (lowerPath.endsWith(ext)) return false;
  }
  
  // Skip by path
  for (const skip of skipPaths) {
    if (lowerPath.includes(skip)) return false;
  }
  
  // Skip minified files
  if (lowerPath.endsWith('.min.js') || lowerPath.endsWith('.min.css')) {
    return false;
  }
  
  return true;
}

/**
 * Search for text pattern in a file's content
 * Returns matching lines with context
 */
function searchInContent(
  content: string,
  pattern: string,
  filePath: string,
  contextLines: number = 2
): Array<{ startLine: number; endLine: number; matchLine: number; snippet: string }> {
  const results: Array<{ startLine: number; endLine: number; matchLine: number; snippet: string }> = [];
  const lines = content.split('\n');
  const lowerPattern = pattern.toLowerCase();
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes(lowerPattern)) {
      const startLine = Math.max(0, i - contextLines);
      const endLine = Math.min(lines.length - 1, i + contextLines);
      const snippet = lines.slice(startLine, endLine + 1).join('\n');
      
      results.push({
        startLine: startLine + 1, // 1-indexed
        endLine: endLine + 1,
        matchLine: i + 1,
        snippet,
      });
      
      // Skip ahead to avoid overlapping results
      i = endLine;
    }
  }
  
  return results;
}

/**
 * Perform text-based code search across a repository
 */
async function textCodeSearch(
  repoId: string,
  diskPath: string,
  query: string,
  limit: number = 20
): Promise<CodeSearchResult[]> {
  const results: CodeSearchResult[] = [];
  
  try {
    const repo = new BareRepository(diskPath);
    
    // Get the default branch
    const head = repo.refs.getHead();
    let commitHash: string | null = null;
    
    if (head.isSymbolic) {
      commitHash = repo.refs.resolve(head.target);
    } else {
      commitHash = head.target;
    }
    
    if (!commitHash) {
      return results;
    }
    
    // Get the tree from the commit
    const commit = repo.objects.readCommit(commitHash);
    const files = walkTree(repo, commit.treeHash);
    
    // Get repo info for results
    const repoInfo = await repoModel.findById(repoId);
    if (!repoInfo) return results;
    
    const owner = await userModel.findById(repoInfo.ownerId);
    const ownerUsername = owner?.username || owner?.name || 'unknown';
    
    // Search through files
    for (const file of files) {
      if (results.length >= limit) break;
      if (!isSearchableFile(file.path)) continue;
      
      try {
        const blob = repo.objects.readBlob(file.hash);
        const content = blob.content.toString('utf-8');
        
        // Skip binary content
        if (content.includes('\0')) continue;
        
        // Skip very large files (> 500KB)
        if (content.length > 500 * 1024) continue;
        
        const matches = searchInContent(content, query, file.path);
        
        for (const match of matches) {
          if (results.length >= limit) break;
          
          results.push({
            path: file.path,
            content: match.snippet,
            startLine: match.startLine,
            endLine: match.endLine,
            matchLine: match.matchLine,
            language: detectLanguage(file.path),
            repoId,
            repoName: repoInfo.name,
            repoOwner: ownerUsername,
          });
        }
      } catch {
        // Skip files that can't be read
      }
    }
  } catch (error) {
    console.error('[search.textCodeSearch] Error:', error);
  }
  
  return results;
}

export const searchRouter = router({
  /**
   * Universal search across all types
   */
  search: publicProcedure
    .input(z.object({
      query: z.string().min(1),
      type: z.enum(['all', 'code', 'repositories', 'issues', 'prs']).default('all'),
      repoId: z.string().uuid().optional(),
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      const results: Array<{
        type: 'code' | 'repository' | 'issue' | 'pull_request';
        id: string;
        title: string;
        description?: string;
        url: string;
        score?: number;
        metadata?: Record<string, any>;
      }> = [];

      const limitPerType = input.type === 'all' ? Math.ceil(input.limit / 3) : input.limit;

      // Search repositories
      if (input.type === 'all' || input.type === 'repositories') {
        const repos = await repoModel.search(input.query, limitPerType);

        for (const repo of repos) {
          // Get owner info for full URL
          const owner = await userModel.findById(repo.ownerId);
          const ownerUsername = owner?.username || owner?.name || 'unknown';
          
          results.push({
            type: 'repository',
            id: repo.id,
            title: `${ownerUsername}/${repo.name}`,
            description: repo.description || undefined,
            url: `/${ownerUsername}/${repo.name}`,
            metadata: {
              stars: repo.starsCount,
              isPrivate: repo.isPrivate,
              owner: ownerUsername,
            },
          });
        }
      }

      // Search issues
      if (input.type === 'all' || input.type === 'issues') {
        try {
          const issues = await issueModel.search(input.query, {
            limit: limitPerType,
            repoId: input.repoId,
          });

          for (const issue of issues) {
            // Get repo info for URL
            const repo = await repoModel.findById(issue.repoId);
            if (repo) {
              const owner = await userModel.findById(repo.ownerId);
              const ownerUsername = owner?.username || owner?.name || 'unknown';
              
              results.push({
                type: 'issue',
                id: issue.id,
                title: issue.title,
                description: issue.body?.substring(0, 200) || undefined,
                url: `/${ownerUsername}/${repo.name}/issues/${issue.number}`,
                metadata: {
                  state: issue.state,
                  number: issue.number,
                  repo: `${ownerUsername}/${repo.name}`,
                  status: issue.status,
                  priority: issue.priority,
                },
              });
            }
          }
        } catch (e) {
          // Issue search not yet implemented, skip
        }
      }

      // Search pull requests
      if (input.type === 'all' || input.type === 'prs') {
        try {
          const prs = await prModel.search(input.query, {
            limit: limitPerType,
            repoId: input.repoId,
          });

          for (const pr of prs) {
            // Get repo info for URL
            const repo = await repoModel.findById(pr.repoId);
            if (repo) {
              const owner = await userModel.findById(repo.ownerId);
              const ownerUsername = owner?.username || owner?.name || 'unknown';
              
              results.push({
                type: 'pull_request',
                id: pr.id,
                title: pr.title,
                description: pr.body?.substring(0, 200) || undefined,
                url: `/${ownerUsername}/${repo.name}/pull/${pr.number}`,
                metadata: {
                  state: pr.state,
                  number: pr.number,
                  repo: `${ownerUsername}/${repo.name}`,
                  sourceBranch: pr.sourceBranch,
                  targetBranch: pr.targetBranch,
                  isDraft: pr.isDraft,
                },
              });
            }
          }
        } catch (e) {
          // PR search not yet implemented, skip
        }
      }

      // Code search - search across all accessible repositories
      if (input.type === 'all' || input.type === 'code') {
        try {
          // Get accessible repositories
          let repos: Awaited<ReturnType<typeof repoModel.search>> = [];
          
          if (input.repoId) {
            // Search in specific repo
            const repo = await repoModel.findById(input.repoId);
            if (repo) repos = [repo];
          } else {
            // Search across public repos (or user's accessible repos)
            repos = await repoModel.search('', 10); // Get recent repos
          }
          
          for (const repo of repos) {
            if (results.length >= limitPerType) break;
            
            // Resolve disk path and check access
            const diskPath = resolveDiskPath(repo.diskPath);
            if (!exists(diskPath)) continue;
            
            // Check if user has access (for private repos)
            if (repo.isPrivate) {
              if (!ctx.user) continue;
              const isOwner = repo.ownerId === ctx.user.id;
              const hasAccess = isOwner || 
                (await collaboratorModel.hasPermission(repo.id, ctx.user.id, 'read'));
              if (!hasAccess) continue;
            }
            
            // Perform text search
            const codeResults = await textCodeSearch(
              repo.id,
              diskPath,
              input.query,
              limitPerType - results.length
            );
            
            for (const codeResult of codeResults) {
              results.push({
                type: 'code',
                id: `${codeResult.repoId}:${codeResult.path}:${codeResult.startLine}`,
                title: codeResult.path,
                description: codeResult.content.substring(0, 200),
                url: `/${codeResult.repoOwner}/${codeResult.repoName}/blob/main/${codeResult.path}#L${codeResult.startLine}`,
                score: codeResult.score,
                metadata: {
                  path: codeResult.path,
                  startLine: codeResult.startLine,
                  endLine: codeResult.endLine,
                  matchLine: codeResult.matchLine,
                  language: codeResult.language,
                  content: codeResult.content,
                  repo: `${codeResult.repoOwner}/${codeResult.repoName}`,
                },
              });
            }
          }
        } catch (error) {
          console.error('[search.codeSearch] Error:', error);
        }
      }

      return {
        results,
        query: input.query,
        type: input.type,
        total: results.length,
      };
    }),

  /**
   * Code search within a repository
   * Supports both text-based search (always available) and semantic search (requires AI)
   */
  codeSearch: protectedProcedure
    .input(z.object({
      repoId: z.string().uuid(),
      query: z.string().min(1),
      limit: z.number().min(1).max(50).default(10),
      language: z.string().optional(),
      mode: z.enum(['text', 'semantic', 'auto']).default('auto'),
    }))
    .query(async ({ input, ctx }) => {
      const repo = await repoModel.findById(input.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check access
      const isOwner = repo.ownerId === ctx.user.id;
      const hasAccess = isOwner || 
        !repo.isPrivate || 
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

      const semanticAvailable = await canUseSemanticSearch(ctx.user.id);
      const useSemanticSearch = input.mode === 'semantic' || 
        (input.mode === 'auto' && semanticAvailable);
      
      // Get owner info
      const owner = await userModel.findById(repo.ownerId);
      const ownerUsername = owner?.username || owner?.name || 'unknown';

      // Perform text-based search (always works)
      const textResults = await textCodeSearch(
        input.repoId,
        diskPath,
        input.query,
        input.limit
      );

      // Filter by language if specified
      let filteredResults = textResults;
      if (input.language) {
        filteredResults = textResults.filter(r => 
          r.language.toLowerCase().includes(input.language!.toLowerCase())
        );
      }

      // If semantic search is requested and AI is available, enhance with semantic ranking
      if (useSemanticSearch && semanticAvailable && filteredResults.length > 0) {
        try {
          // Generate query embedding
          const queryEmbedding = await generateEmbedding(input.query);
          
          // Generate embeddings for each result and compute similarity
          const resultsWithScores = await Promise.all(
            filteredResults.map(async (result) => {
              try {
                const contentEmbedding = await generateEmbedding(
                  `File: ${result.path}\nLanguage: ${result.language}\n\nCode:\n${result.content}`
                );
                const score = cosineSimilarity(queryEmbedding, contentEmbedding);
                return { ...result, score };
              } catch {
                return { ...result, score: 0 };
              }
            })
          );
          
          // Sort by semantic similarity
          filteredResults = resultsWithScores.sort((a, b) => (b.score || 0) - (a.score || 0));
        } catch (error) {
          console.error('[search.codeSearch] Semantic ranking failed:', error);
          // Fall back to text results without semantic ranking
        }
      }

      return {
        results: filteredResults.map(r => ({
          path: r.path,
          content: r.content,
          startLine: r.startLine,
          endLine: r.endLine,
          matchLine: r.matchLine,
          language: r.language,
          score: r.score,
          url: `/${ownerUsername}/${repo.name}/blob/main/${r.path}#L${r.startLine}`,
        })),
        query: input.query,
        repoId: input.repoId,
        mode: useSemanticSearch ? 'semantic' : 'text',
        aiAvailable: semanticAvailable,
        message: !semanticAvailable 
          ? 'Text search results. Add an OpenAI API key in Settings > AI for semantic code search.'
          : undefined,
      };
    }),

  /**
   * Quick search suggestions (autocomplete)
   */
  suggestions: publicProcedure
    .input(z.object({
      query: z.string().min(1),
      limit: z.number().min(1).max(10).default(5),
    }))
    .query(async ({ input, ctx }) => {
      const suggestions: Array<{
        type: 'repository' | 'user' | 'issue' | 'pull_request';
        text: string;
        url: string;
      }> = [];

      // Get repository suggestions
      const repos = await repoModel.search(input.query, input.limit);

      for (const repo of repos.slice(0, 3)) {
        // Get owner info for the URL
        const owner = await userModel.findById(repo.ownerId);
        const ownerUsername = owner?.username || owner?.name || 'unknown';
        suggestions.push({
          type: 'repository',
          text: `${ownerUsername}/${repo.name}`,
          url: `/${ownerUsername}/${repo.name}`,
        });
      }

      return { suggestions };
    }),
});
