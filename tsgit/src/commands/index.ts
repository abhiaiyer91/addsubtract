// Porcelain commands (user-facing)
export { init } from './init';
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
// Quality of Life commands (new!)
export { amend, handleAmend } from './amend';
export { wip, handleWip } from './wip';
export { uncommit, handleUncommit } from './uncommit';
export { analyzeBranches, deleteBranches, handleCleanup } from './cleanup';
export { blame, handleBlame } from './blame';
export { collectStats, handleStats } from './stats';
export { fixup, handleFixup } from './fixup';
export { handleSnapshot, SnapshotManager } from './snapshot';

// Plumbing commands (low-level)
export { catFile } from './cat-file';
export { hashObjectCommand } from './hash-object';
export { lsFiles } from './ls-files';
export { lsTree } from './ls-tree';

// New commands (bridging the gap with Git)
export { handleStash, StashManager } from './stash';
export { handleTag, createLightweightTag, createAnnotatedTag, listTags, deleteTag } from './tag';
export { handleReset, reset, resetFile, parseRevision } from './reset';

// Advanced features
export { handleReflog, ReflogManager, updateReflog } from './reflog';
export { handleGC, GarbageCollector } from './gc';
