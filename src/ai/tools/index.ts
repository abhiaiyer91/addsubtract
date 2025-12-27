/**
 * wit AI Tools
 * 
 * These tools provide the AI agent with capabilities to interact with the git repository.
 */

// Git operation tools
export { getStatusTool } from './get-status.js';
export { getDiffTool } from './get-diff.js';
export { stageFilesTool } from './stage-files.js';
export { createCommitTool } from './create-commit.js';
export { getLogTool } from './get-log.js';
export { getBranchesTool } from './get-branches.js';
export { switchBranchTool } from './switch-branch.js';
export { getMergeConflictsTool } from './get-merge-conflicts.js';
export { resolveConflictTool } from './resolve-conflict.js';
export { undoTool } from './undo.js';
export { searchTool } from './search.js';
export { semanticSearchTool, indexRepositoryTool, getIndexStatusTool } from './semantic-search.js';
export { generatePRDescriptionTool, PR_DESCRIPTION_PROMPT } from './generate-pr-description.js';
export { reviewPRTool, CODE_REVIEW_PROMPT, formatReviewComment } from './review-pr.js';
export type { ReviewCategory } from './review-pr.js';

// Coding agent tools
export { readFileTool } from './read-file.js';
export { writeFileTool } from './write-file.js';
export { editFileTool } from './edit-file.js';
export { listDirectoryTool } from './list-directory.js';
export { runCommandTool } from './run-command.js';
export { createBranchTool } from './create-branch.js';
export { openPullRequestTool } from './open-pull-request.js';

import { getStatusTool } from './get-status.js';
import { getDiffTool } from './get-diff.js';
import { stageFilesTool } from './stage-files.js';
import { createCommitTool } from './create-commit.js';
import { getLogTool } from './get-log.js';
import { getBranchesTool } from './get-branches.js';
import { switchBranchTool } from './switch-branch.js';
import { getMergeConflictsTool } from './get-merge-conflicts.js';
import { resolveConflictTool } from './resolve-conflict.js';
import { undoTool } from './undo.js';
import { searchTool } from './search.js';
import { semanticSearchTool, indexRepositoryTool, getIndexStatusTool } from './semantic-search.js';
import { generatePRDescriptionTool } from './generate-pr-description.js';
import { reviewPRTool } from './review-pr.js';

// Coding agent tools imports
import { readFileTool } from './read-file.js';
import { writeFileTool } from './write-file.js';
import { editFileTool } from './edit-file.js';
import { listDirectoryTool } from './list-directory.js';
import { runCommandTool } from './run-command.js';
import { createBranchTool } from './create-branch.js';
import { openPullRequestTool } from './open-pull-request.js';

/**
 * All wit tools bundled together for easy registration with an agent
 */
export const witTools = {
  // Git operations
  getStatus: getStatusTool,
  getDiff: getDiffTool,
  stageFiles: stageFilesTool,
  createCommit: createCommitTool,
  getLog: getLogTool,
  getBranches: getBranchesTool,
  switchBranch: switchBranchTool,
  getMergeConflicts: getMergeConflictsTool,
  resolveConflict: resolveConflictTool,
  undo: undoTool,
  search: searchTool,
  semanticSearch: semanticSearchTool,
  indexRepository: indexRepositoryTool,
  getIndexStatus: getIndexStatusTool,
  generatePRDescription: generatePRDescriptionTool,
  reviewPR: reviewPRTool,
  
  // Coding agent tools
  readFile: readFileTool,
  writeFile: writeFileTool,
  editFile: editFileTool,
  listDirectory: listDirectoryTool,
  runCommand: runCommandTool,
  createBranch: createBranchTool,
  openPullRequest: openPullRequestTool,
};
