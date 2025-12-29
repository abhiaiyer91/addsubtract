// Porcelain commands (user-facing)
export { init, parseInitArgs, InitOptions } from './init';
export { add } from './add';
export { commit, commitWithOptions, handleCommit } from './commit';
export { status } from './status';
export { log } from './log';
export { branch } from './branch';
export { checkout } from './checkout';
export { diffCommand } from './diff';

// New improved commands
export { switchBranch, handleSwitch } from './switch';
export { restore, handleRestore } from './restore';
export { undo, history, handleUndo, handleHistory } from './undo';
export { merge, mergeAbort, mergeContinue, showConflicts, handleMerge } from './merge';
export { handleScope } from './scope';

// AI-powered commands
export { handleAI, handleAICommit, handleReview, handleExplain, handleResolve } from './ai';
export { handleAgent, AGENT_HELP } from './agent';
export { handleIntent, INTENT_HELP } from './intent';
export { handleDecision, DECISION_HELP } from './decision';
export { handlePatterns, PATTERNS_HELP } from './patterns';
// Quality of Life commands (new!)
export { amend, handleAmend } from './amend';
export { wip, handleWip } from './wip';
export { uncommit, handleUncommit } from './uncommit';
export { analyzeBranches, deleteBranches, handleCleanup } from './cleanup';
export { blame, handleBlame } from './blame';
export { collectStats, handleStats } from './stats';
export { fixup, handleFixup } from './fixup';
export { handleSnapshot, SnapshotManager } from './snapshot';

// History rewriting commands
export { handleCherryPick, CherryPickManager } from './cherry-pick';
export { handleRebase, RebaseManager } from './rebase';
export { handleRevert, RevertManager } from './revert';

// Plumbing commands (low-level)
export { catFile } from './cat-file';
export { hashObjectCommand } from './hash-object';
export { lsFiles } from './ls-files';
export { lsTree } from './ls-tree';

// Additional plumbing commands
export { revParse, handleRevParse } from './rev-parse';
export { updateRef, deleteRef, handleUpdateRef } from './update-ref';
export { readSymbolicRef, setSymbolicRef, deleteSymbolicRef, handleSymbolicRef } from './symbolic-ref';
export { forEachRef, formatRef, handleForEachRef } from './for-each-ref';
export { showRef, verifyRef, handleShowRef } from './show-ref';
export { fsck, handleFsck } from './fsck';

// New commands (bridging the gap with Git)
export { handleStash, StashManager } from './stash';
export { handleTag, createLightweightTag, createAnnotatedTag, listTags, deleteTag } from './tag';
export { handleReset, reset, resetFile, parseRevision } from './reset';
export { handleBisect, BisectManager } from './bisect';
export { handleClean, clean, getUntrackedItems } from './clean';
export { handleShow, show, showCommit, showFileAtCommit, showTag } from './show';

// Remote commands
export { handleRemote, listRemotes, addRemote, removeRemote, renameRemote, getRemoteUrl, setRemoteUrl } from './remote';
export { handleClone, handleCloneAsync, clone, cloneAsync, parseRepoUrl } from './clone';
export { handleFetch, fetch, fetchAsync } from './fetch';
export { handlePull, pull, pullAsync } from './pull';
export { handlePush, push, pushAsync } from './push';

// GitHub integration
export { handleGitHub, GitHubManager, getGitHubManager } from './github';

// Advanced features
export { handleReflog, ReflogManager, updateReflog } from './reflog';
export { handleGC, GarbageCollector } from './gc';

// Stacked diffs
export { handleStack, StackManager } from './stack';

// Server command
export { handleServe } from './serve';

// Command help system
export { COMMAND_HELP, formatCommandHelp, printCommandHelp, hasHelpFlag } from './command-help';

// Platform commands (CLI extensions)
export { handlePr, PR_HELP } from './pr';
export { handleIssue, ISSUE_HELP } from './issue';
export { handleDashboard, DASHBOARD_HELP } from './dashboard';

// Issue tracking (Linear-inspired) - cycle/sprint management
export { handleCycle, CYCLE_HELP } from './cycle';

// Project management (Linear-inspired)
export { handleProject, PROJECT_HELP } from './project';

// Platform management commands
export { handleUp, UP_HELP } from './up';
export { handleDown, DOWN_HELP } from './down';
export { handlePlatformStatus, STATUS_HELP } from './platform-status';

// Smart status - the killer wit command
export { handleSmartStatus } from './smart-status';

// Semantic search - the "holy shit" feature
export { handleSearch } from './search';

// Personal access tokens
export { handleToken } from './token';

// CodeRabbit review command
export { handleCodeReview, REVIEW_HELP } from './review';

// CI/CD commands
export { handleCI, CI_HELP } from './ci';

// Merge Queue commands
export { handleMergeQueue, MERGE_QUEUE_HELP } from './merge-queue';

// Journal commands (Notion-like docs)
export { handleJournal, JOURNAL_HELP } from './journal';

// Wrapped - Monthly activity insights (Spotify Wrapped-style)
export { handleWrapped } from './wrapped';

// Collaborator management
export {
  handleCollaborator,
  listCollaborators,
  addCollaborator,
  removeCollaborator,
  updateCollaboratorRole,
  showCollaborator,
  acceptInvitation,
  revokeInvitation,
  listInvitations,
  showActivityLog,
  showStats as showCollaboratorStats,
  listTeams,
  createTeam,
  deleteTeam,
  addTeamMember,
  removeTeamMember,
} from './collaborator';
