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

// Quality of Life commands (new!)
export { amend, handleAmend } from './amend';
export { wip, handleWip } from './wip';
export { uncommit, handleUncommit } from './uncommit';
export { analyzeBranches, deleteBranches, handleCleanup } from './cleanup';
export { blame, handleBlame } from './blame';
export { collectStats, handleStats } from './stats';
export { fixup, handleFixup } from './fixup';
export { handleSnapshot, SnapshotManager } from './snapshot';

// History Rewriting commands
export { reset, handleReset } from './reset';
export { cherryPick, cherryPickContinue, cherryPickAbort, handleCherryPick } from './cherry-pick';
export { rebase, rebaseContinue, rebaseAbort, rebaseSkip, handleRebase } from './rebase';

// Plumbing commands (low-level)
export { catFile } from './cat-file';
export { hashObjectCommand } from './hash-object';
export { lsFiles } from './ls-files';
export { lsTree } from './ls-tree';
