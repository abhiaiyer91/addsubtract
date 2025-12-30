/**
 * GitHub Import Router
 * 
 * Provides API endpoints for importing repositories from GitHub to wit.
 * Supports importing:
 * - Repository (git data)
 * - Issues with comments
 * - Pull Requests with comments
 * - Labels
 * - Milestones
 * - Releases
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import * as path from 'path';
import { execSync } from 'child_process';
import { router, protectedProcedure } from '../trpc';
import {
  repoModel,
  labelModel,
  milestoneModel,
  issueModel,
  issueCommentModel,
  issueLabelModel,
  prModel,
  prCommentModel,
  prLabelModel,
  releaseModel,
  activityHelpers,
  orgModel,
  orgMemberModel,
} from '../../../db/models';
import '../../../server/storage/repos';
import {
  fetchGitHubData,
  parseGitHubRepo,
  validateImportOptions,
  getAuthenticatedCloneUrl,
  mapIssueState,
  mapIssueStatus,
  mapPRState,
  GitHubImportResult,
  GitHubImportOptions,
} from '../../../core/github-import';
import { getGitHubToken } from '../../../core/github';
import { exists, mkdirp } from '../../../utils/fs';

export const githubImportRouter = router({
  /**
   * Preview what will be imported from a GitHub repository
   */
  preview: protectedProcedure
    .input(
      z.object({
        repo: z.string().min(1, 'Repository is required'),
        token: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const parsed = parseGitHubRepo(input.repo);
      if (!parsed) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invalid repository format: ${input.repo}. Use owner/repo or GitHub URL.`,
        });
      }

      try {
        // Fetch just the repo info to preview
        const data = await fetchGitHubData({
          repo: input.repo,
          token: input.token,
          import: {
            repository: true,
            issues: true,
            pullRequests: true,
            labels: true,
            milestones: true,
            releases: true,
          },
        });

        return {
          repository: {
            name: data.repo.name,
            fullName: data.repo.full_name,
            description: data.repo.description,
            private: data.repo.private,
            defaultBranch: data.repo.default_branch,
            stars: data.repo.stargazers_count,
            forks: data.repo.forks_count,
          },
          counts: {
            labels: data.labels.length,
            milestones: data.milestones.length,
            issues: data.issues.length,
            pullRequests: data.pullRequests.length,
            releases: data.releases.length,
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Failed to fetch repository info',
        });
      }
    }),

  /**
   * Import a repository from GitHub
   */
  import: protectedProcedure
    .input(
      z.object({
        repo: z.string().min(1, 'Repository is required'),
        token: z.string().optional(),
        name: z.string().optional(), // Custom name for the imported repo
        description: z.string().optional(),
        orgId: z.string().uuid().optional(), // Organization to import into (uses personal account if not provided)
        isPrivate: z.boolean().default(false),
        import: z.object({
          repository: z.boolean().default(true),
          issues: z.boolean().default(true),
          pullRequests: z.boolean().default(true),
          labels: z.boolean().default(true),
          milestones: z.boolean().default(true),
          releases: z.boolean().default(true),
        }).default({}),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Validate input
      const options: GitHubImportOptions = {
        repo: input.repo,
        token: input.token,
        import: {
          repository: input.import.repository ?? true,
          issues: input.import.issues ?? true,
          pullRequests: input.import.pullRequests ?? true,
          labels: input.import.labels ?? true,
          milestones: input.import.milestones ?? true,
          releases: input.import.releases ?? true,
        },
      };

      const validation = validateImportOptions(options);
      if (!validation.valid) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: validation.errors.join('; '),
        });
      }

      const parsed = parseGitHubRepo(input.repo);
      if (!parsed) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid repository format',
        });
      }

      const result: GitHubImportResult = {
        repository: null,
        labels: { imported: 0, items: [] },
        milestones: { imported: 0, items: [] },
        issues: { imported: 0, items: [] },
        pullRequests: { imported: 0, items: [] },
        releases: { imported: 0, items: [] },
        errors: [],
        idMap: {
          issues: new Map(),
          pullRequests: new Map(),
          milestones: new Map(),
          labels: new Map(),
        },
      };

      try {
        // Fetch all GitHub data
        console.log(`[GitHub Import] Starting import for ${input.repo}`);
        console.log(`[GitHub Import] Options:`, JSON.stringify(options.import, null, 2));
        const data = await fetchGitHubData(options);
        console.log(`[GitHub Import] Data fetched successfully:`, {
          labels: data.labels.length,
          milestones: data.milestones.length,
          issues: data.issues.length,
          pullRequests: data.pullRequests.length,
          releases: data.releases.length,
        });

        // Determine the repo name to use
        const repoName = input.name || data.repo.name;

        // Determine owner (user or org)
        let ownerId = ctx.user.id;
        let ownerType: 'user' | 'organization' = 'user';
        let ownerName = ctx.user.username || ctx.user.id;

        if (input.orgId) {
          // Importing to an organization
          const org = await orgModel.findById(input.orgId);
          if (!org) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: 'Organization not found',
            });
          }

          // Check if user has permission to create repos in this org (at least admin role)
          const hasPermission = await orgMemberModel.hasRole(input.orgId, ctx.user.id, 'admin');
          if (!hasPermission) {
            throw new TRPCError({
              code: 'FORBIDDEN',
              message: 'You do not have permission to create repositories in this organization',
            });
          }

          ownerId = org.id;
          ownerType = 'organization';
          ownerName = org.name;
        }

        // Check if repo already exists
        const existingRepo = await repoModel.findByOwnerAndName(ownerId, repoName);
        if (existingRepo) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Repository '${repoName}' already exists. Choose a different name.`,
          });
        }

        const diskPath = `/repos/${ownerName}/${repoName}.git`;

        // Clone the repository if importing repository data
        let cloneSuccess = false;
        if (options.import.repository) {
          const reposDir = process.env.REPOS_DIR || './repos';
          const absolutePath = path.isAbsolute(reposDir)
            ? path.join(reposDir, ownerName, `${repoName}.git`)
            : path.join(process.cwd(), reposDir, ownerName, `${repoName}.git`);

          // Create parent directory
          mkdirp(path.dirname(absolutePath));

          // Get authenticated clone URL
          const token = input.token || await getGitHubToken();
          const cloneUrl = getAuthenticatedCloneUrl(data.repo.clone_url, token);

          try {
            // Clone as a bare repository
            execSync(`git clone --bare "${cloneUrl}" "${absolutePath}"`, {
              stdio: 'pipe',
              timeout: 300000, // 5 minute timeout
            });
            cloneSuccess = true;
          } catch (cloneError) {
            const errorMessage = cloneError instanceof Error ? cloneError.message : 'Unknown error';
            result.errors.push(`Failed to clone repository: ${errorMessage}`);
            // Don't create DB record if clone failed - the repo won't be visible without files
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: `Failed to clone repository from GitHub: ${errorMessage}. Please try again.`,
            });
          }
        }

        // Create the repository record (only if clone succeeded or we're not importing repository data)
        const newRepo = await repoModel.create({
          name: repoName,
          description: input.description ?? data.repo.description ?? undefined,
          isPrivate: input.isPrivate,
          ownerId,
          ownerType,
          diskPath,
          defaultBranch: data.repo.default_branch,
        });

        result.repository = {
          imported: cloneSuccess,
          name: repoName,
          cloneUrl: data.repo.clone_url,
        };

        // Import labels
        if (options.import.labels && data.labels.length > 0) {
          for (const label of data.labels) {
            try {
              const newLabel = await labelModel.create({
                repoId: newRepo.id,
                name: label.name,
                color: label.color,
                description: label.description ?? undefined,
              });
              result.idMap.labels.set(label.name, newLabel.id);
              result.labels.items.push({ name: label.name, color: label.color });
              result.labels.imported++;
            } catch (error) {
              result.errors.push(`Failed to import label '${label.name}': ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        } else {
          // Create default labels if not importing
          await labelModel.createDefaults(newRepo.id);
        }

        // Import milestones
        if (options.import.milestones && data.milestones.length > 0) {
          for (const milestone of data.milestones) {
            try {
              const newMilestone = await milestoneModel.create({
                repoId: newRepo.id,
                title: milestone.title,
                description: milestone.description ?? undefined,
                state: milestone.state,
                dueDate: milestone.due_on ? new Date(milestone.due_on) : undefined,
                closedAt: milestone.closed_at ? new Date(milestone.closed_at) : undefined,
              });
              result.idMap.milestones.set(milestone.number, newMilestone.id);
              result.milestones.items.push({ title: milestone.title, number: milestone.number });
              result.milestones.imported++;
            } catch (error) {
              result.errors.push(`Failed to import milestone '${milestone.title}': ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        }

        // Import issues
        if (options.import.issues && data.issues.length > 0) {
          // Sort issues by number to maintain order
          const sortedIssues = [...data.issues].sort((a, b) => a.number - b.number);

          for (const issue of sortedIssues) {
            try {
              // Get milestone ID if present
              const milestoneId = issue.milestone 
                ? result.idMap.milestones.get(issue.milestone.number) 
                : undefined;

              // Create the issue
              const newIssue = await issueModel.create({
                repoId: newRepo.id,
                title: issue.title,
                body: issue.body ?? undefined,
                state: mapIssueState(issue.state),
                status: mapIssueStatus(issue.state),
                authorId: ctx.user.id, // We don't have GitHub users in wit
                milestoneId,
                closedAt: issue.closed_at ? new Date(issue.closed_at) : undefined,
              });

              result.idMap.issues.set(issue.number, newIssue.id);
              result.issues.items.push({ number: issue.number, title: issue.title });
              result.issues.imported++;

              // Apply labels
              if (issue.labels.length > 0) {
                for (const label of issue.labels) {
                  const labelId = result.idMap.labels.get(label.name);
                  if (labelId) {
                    try {
                      await issueLabelModel.add(newIssue.id, labelId);
                    } catch {
                      // Label might already be applied
                    }
                  }
                }
              }

              // Import comments
              const comments = data.issueComments.get(issue.number) || [];
              for (const comment of comments) {
                try {
                  await issueCommentModel.create({
                    issueId: newIssue.id,
                    userId: ctx.user.id, // We don't have GitHub users in wit
                    body: `*Originally posted by @${comment.user.login} on ${new Date(comment.created_at).toLocaleDateString()}*\n\n${comment.body}`,
                  });
                } catch {
                  // Continue if comment fails
                }
              }
            } catch (error) {
              result.errors.push(`Failed to import issue #${issue.number}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        }

        // Import pull requests
        if (options.import.pullRequests && data.pullRequests.length > 0) {
          // Sort PRs by number to maintain order
          const sortedPRs = [...data.pullRequests].sort((a, b) => a.number - b.number);

          for (const pr of sortedPRs) {
            try {
              // Get milestone ID if present
              const milestoneId = pr.milestone 
                ? result.idMap.milestones.get(pr.milestone.number) 
                : undefined;

              // Create the PR
              const newPR = await prModel.create({
                repoId: newRepo.id,
                title: pr.title,
                body: pr.body ?? undefined,
                state: mapPRState(pr),
                sourceBranch: pr.head.ref,
                targetBranch: pr.base.ref,
                headSha: pr.head.sha,
                baseSha: pr.base.sha,
                authorId: ctx.user.id,
                milestoneId,
                isDraft: pr.draft,
                mergedAt: pr.merged_at ? new Date(pr.merged_at) : undefined,
                closedAt: pr.closed_at ? new Date(pr.closed_at) : undefined,
              });

              result.idMap.pullRequests.set(pr.number, newPR.id);
              result.pullRequests.items.push({ number: pr.number, title: pr.title });
              result.pullRequests.imported++;

              // Apply labels
              if (pr.labels.length > 0) {
                for (const label of pr.labels) {
                  const labelId = result.idMap.labels.get(label.name);
                  if (labelId) {
                    try {
                      await prLabelModel.add(newPR.id, labelId);
                    } catch {
                      // Label might already be applied
                    }
                  }
                }
              }

              // Import comments
              const comments = data.prComments.get(pr.number) || [];
              for (const comment of comments) {
                try {
                  await prCommentModel.create({
                    prId: newPR.id,
                    userId: ctx.user.id,
                    body: `*Originally posted by @${comment.user.login} on ${new Date(comment.created_at).toLocaleDateString()}*\n\n${comment.body}`,
                  });
                } catch {
                  // Continue if comment fails
                }
              }
            } catch (error) {
              result.errors.push(`Failed to import PR #${pr.number}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        }

        // Import releases
        if (options.import.releases && data.releases.length > 0) {
          for (const release of data.releases) {
            try {
              await releaseModel.create({
                repoId: newRepo.id,
                tagName: release.tag_name,
                name: release.name || release.tag_name,
                body: release.body ?? undefined,
                isDraft: release.draft,
                isPrerelease: release.prerelease,
                authorId: ctx.user.id,
                publishedAt: release.published_at ? new Date(release.published_at) : undefined,
              });

              result.releases.items.push({ tagName: release.tag_name, name: release.name });
              result.releases.imported++;
            } catch (error) {
              result.errors.push(`Failed to import release '${release.tag_name}': ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        }

        // Log activity
        await activityHelpers.logRepoCreated(ctx.user.id, newRepo.id);

        return {
          success: true,
          repoId: newRepo.id,
          repoName: repoName,
          summary: {
            repository: result.repository,
            labelsImported: result.labels.imported,
            milestonesImported: result.milestones.imported,
            issuesImported: result.issues.imported,
            pullRequestsImported: result.pullRequests.imported,
            releasesImported: result.releases.imported,
          },
          errors: result.errors,
        };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        // Clean up error message (remove HTML if present)
        let message = error instanceof Error ? error.message : 'Import failed';
        if (message.includes('<!DOCTYPE') || message.includes('<html')) {
          message = 'GitHub is temporarily unavailable. Please try again in a few minutes.';
        }
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message,
        });
      }
    }),

  /**
   * Check if a GitHub repository is accessible
   */
  checkAccess: protectedProcedure
    .input(
      z.object({
        repo: z.string().min(1),
        token: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const parsed = parseGitHubRepo(input.repo);
      if (!parsed) {
        return {
          accessible: false,
          error: 'Invalid repository format',
        };
      }

      try {
        const data = await fetchGitHubData({
          repo: input.repo,
          token: input.token,
          import: {
            repository: true,
            issues: false,
            pullRequests: false,
            labels: false,
            milestones: false,
            releases: false,
          },
        });

        return {
          accessible: true,
          private: data.repo.private,
          name: data.repo.name,
          fullName: data.repo.full_name,
        };
      } catch (error) {
        return {
          accessible: false,
          error: error instanceof Error ? error.message : 'Failed to access repository',
        };
      }
    }),

  /**
   * Re-sync/re-clone a repository from GitHub
   * This is useful when the initial import failed or the repository data is corrupted
   */
  resync: protectedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        githubRepo: z.string().min(1, 'GitHub repository is required'),
        token: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Find the existing repository
      const repo = await repoModel.findById(input.repoId);
      if (!repo) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found',
        });
      }

      // Check ownership or org permission
      let hasPermission = repo.ownerId === ctx.user.id;
      
      if (!hasPermission && repo.ownerType === 'organization') {
        // Check if user has admin permission in the org
        hasPermission = await orgMemberModel.hasRole(repo.ownerId, ctx.user.id, 'admin');
      }
      
      if (!hasPermission) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to resync this repository',
        });
      }

      const parsed = parseGitHubRepo(input.githubRepo);
      if (!parsed) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Invalid GitHub repository format',
        });
      }

      try {
        // Fetch GitHub repo info to get clone URL
        const storedToken = await getGitHubToken();
        const token = input.token || storedToken || null;
        const data = await fetchGitHubData({
          repo: input.githubRepo,
          token: token ?? undefined,
          import: {
            repository: true,
            issues: false,
            pullRequests: false,
            labels: false,
            milestones: false,
            releases: false,
          },
        });

        // Resolve the disk path
        const reposDir = process.env.REPOS_DIR || './repos';
        const relativePath = repo.diskPath.replace(/^\/repos\//, '');
        const absolutePath = path.isAbsolute(reposDir)
          ? path.join(reposDir, relativePath)
          : path.join(process.cwd(), reposDir, relativePath);

        console.log(`[GitHub Resync] Path resolution:`, {
          diskPath: repo.diskPath,
          reposDir,
          relativePath,
          absolutePath,
          cwd: process.cwd(),
        });

        // Remove existing repository directory if it exists
        if (await exists(absolutePath)) {
          console.log(`[GitHub Resync] Removing existing directory: ${absolutePath}`);
          execSync(`rm -rf "${absolutePath}"`, { stdio: 'pipe' });
        }

        // Create parent directory
        mkdirp(path.dirname(absolutePath));

        // Get authenticated clone URL
        const cloneUrl = getAuthenticatedCloneUrl(data.repo.clone_url, token);

        // Clone as a bare repository
        console.log(`[GitHub Resync] Cloning ${data.repo.full_name} to ${absolutePath}`);
        try {
          execSync(`git clone --bare "${cloneUrl}" "${absolutePath}"`, {
            stdio: 'pipe',
            timeout: 300000, // 5 minute timeout
          });
          
          // Verify the clone was successful
          const objectsPath = path.join(absolutePath, 'objects');
          const refsPath = path.join(absolutePath, 'refs');
          const headPath = path.join(absolutePath, 'HEAD');
          const cloneExists = await exists(absolutePath);
          const objectsExist = await exists(objectsPath);
          const refsExist = await exists(refsPath);
          const headExists = await exists(headPath);
          
          // List files in the cloned directory for debugging
          let dirContents: string[] = [];
          try {
            const { readdirSync } = await import('fs');
            dirContents = readdirSync(absolutePath);
          } catch {
            dirContents = ['(could not list directory)'];
          }
          
          console.log(`[GitHub Resync] Clone verification:`, { 
            absolutePath, 
            cloneExists, 
            objectsExist,
            refsExist,
            headExists,
            dirContents,
          });
          
          if (!objectsExist) {
            throw new Error(`Clone completed but objects directory not found. Directory contents: ${dirContents.join(', ')}`);
          }
        } catch (cloneError) {
          const cloneMsg = cloneError instanceof Error ? cloneError.message : 'Unknown error';
          console.error(`[GitHub Resync] Clone failed:`, cloneMsg);
          throw cloneError;
        }

        // Update the repository's default branch if it changed
        if (data.repo.default_branch !== repo.defaultBranch) {
          await repoModel.update(repo.id, { defaultBranch: data.repo.default_branch });
        }

        // Recalculate open issues and PRs counts
        const counts = await repoModel.recalculateCounts(repo.id);
        console.log(`[GitHub Resync] Recalculated counts: ${counts.openIssuesCount} open issues, ${counts.openPrsCount} open PRs`);

        console.log(`[GitHub Resync] Successfully resynced ${repo.name}`);

        return {
          success: true,
          message: 'Repository resynced successfully',
          defaultBranch: data.repo.default_branch,
          ...counts,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[GitHub Resync] Error:`, error);
        
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to resync repository: ${errorMessage}`,
        });
      }
    }),
});
