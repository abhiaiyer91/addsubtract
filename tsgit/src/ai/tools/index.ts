/**
 * tsgit AI Tools
 * 
 * These tools provide the AI agent with capabilities to interact with the git repository.
 */

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

/**
 * All tsgit tools bundled together for easy registration with an agent
 */
export const tsgitTools = {
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
};
