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

// Plumbing commands (low-level)
export { catFile } from './cat-file';
export { hashObjectCommand } from './hash-object';
export { lsFiles } from './ls-files';
export { lsTree } from './ls-tree';
