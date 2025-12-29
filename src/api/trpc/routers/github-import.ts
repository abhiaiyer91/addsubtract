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
import { execSync, spawn } from 'child_process';
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
} from '../../../db/models';
import { RepoManager } from '../../../server/storage/repos';
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

        // Check if repo already exists
        const existingRepo = await repoModel.findByOwnerAndName(ctx.user.id, repoName);
        if (existingRepo) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Repository '${repoName}' already exists. Choose a different name.`,
          });
        }

        // Get the username
        const username = ctx.user.username || ctx.user.id;
        const diskPath = `/repos/${username}/${repoName}.git`;

        // Clone the repository if importing repository data
        let cloneSuccess = false;
        if (options.import.repository) {
          const reposDir = process.env.REPOS_DIR || './repos';
          const absolutePath = path.isAbsolute(reposDir)
            ? path.join(reposDir, username, `${repoName}.git`)
            : path.join(process.cwd(), reposDir, username, `${repoName}.git`);

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
            result.errors.push(`Failed to clone repository: ${cloneError instanceof Error ? cloneError.message : 'Unknown error'}`);
          }
        }

        // Create the repository record
        const newRepo = await repoModel.create({
          name: repoName,
          description: input.description ?? data.repo.description ?? undefined,
          isPrivate: input.isPrivate,
          ownerId: ctx.user.id,
          ownerType: 'user',
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
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: error instanceof Error ? error.message : 'Import failed',
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
});
