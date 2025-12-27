/**
 * Enhanced error handling for wit
 * Provides structured, actionable error messages
 */

/**
 * Error codes for different types of errors
 */
export enum ErrorCode {
  // Repository errors
  NOT_A_REPOSITORY = 'NOT_A_REPOSITORY',
  REPOSITORY_EXISTS = 'REPOSITORY_EXISTS',
  REPOSITORY_CORRUPTED = 'REPOSITORY_CORRUPTED',

  // Object errors
  OBJECT_NOT_FOUND = 'OBJECT_NOT_FOUND',
  OBJECT_CORRUPTED = 'OBJECT_CORRUPTED',
  INVALID_OBJECT_TYPE = 'INVALID_OBJECT_TYPE',

  // Reference errors
  REF_NOT_FOUND = 'REF_NOT_FOUND',
  BRANCH_NOT_FOUND = 'BRANCH_NOT_FOUND',
  BRANCH_EXISTS = 'BRANCH_EXISTS',
  TAG_NOT_FOUND = 'TAG_NOT_FOUND',
  TAG_EXISTS = 'TAG_EXISTS',
  INVALID_REF = 'INVALID_REF',
  CANNOT_DELETE_CURRENT_BRANCH = 'CANNOT_DELETE_CURRENT_BRANCH',

  // Index/staging errors
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_NOT_STAGED = 'FILE_NOT_STAGED',
  NOTHING_TO_COMMIT = 'NOTHING_TO_COMMIT',
  INDEX_CORRUPTED = 'INDEX_CORRUPTED',

  // Merge/checkout errors
  MERGE_CONFLICT = 'MERGE_CONFLICT',
  UNCOMMITTED_CHANGES = 'UNCOMMITTED_CHANGES',
  CHECKOUT_CONFLICT = 'CHECKOUT_CONFLICT',
  DETACHED_HEAD = 'DETACHED_HEAD',

  // Scope errors
  SCOPE_VIOLATION = 'SCOPE_VIOLATION',
  PATH_OUTSIDE_SCOPE = 'PATH_OUTSIDE_SCOPE',

  // Large file errors
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  CHUNK_NOT_FOUND = 'CHUNK_NOT_FOUND',

  // Operation errors
  OPERATION_FAILED = 'OPERATION_FAILED',
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',
  NO_COMMITS_YET = 'NO_COMMITS_YET',

  // Hook errors
  HOOK_FAILED = 'HOOK_FAILED',
}

/**
 * Context information for errors
 */
export interface ErrorContext {
  [key: string]: unknown;
}

/**
 * Main error class for wit
 * Provides structured errors with suggestions and context
 */
export class TsgitError extends Error {
  public readonly code: ErrorCode;
  public readonly suggestions: string[];
  public readonly context: ErrorContext;

  constructor(
    message: string,
    code: ErrorCode,
    suggestions: string[] = [],
    context: ErrorContext = {}
  ) {
    super(message);
    this.name = 'TsgitError';
    this.code = code;
    this.suggestions = suggestions;
    this.context = context;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, TsgitError);
    }
  }

  /**
   * Format error for display
   * 
   * Output format:
   *   error: [Short, clear description]
   *   
   *   hint: [Actionable suggestions]
   *     [Command or action]
   *     [Alternative if applicable]
   */
  format(colors: boolean = true): string {
    const red = colors ? '\x1b[31m' : '';
    const yellow = colors ? '\x1b[33m' : '';
    const cyan = colors ? '\x1b[36m' : '';
    const dim = colors ? '\x1b[2m' : '';
    const reset = colors ? '\x1b[0m' : '';

    let output = `${red}error${reset}: ${this.message}\n`;

    // Add context if available (e.g., affected files)
    if (this.context.affectedFiles) {
      output += `${dim}  Affected: ${this.context.affectedFiles}${reset}\n`;
    }

    if (this.suggestions.length > 0) {
      output += `\n${yellow}hint${reset}:\n`;
      for (const suggestion of this.suggestions) {
        // Check if suggestion contains a command (has # or starts with wit/git)
        if (suggestion.includes('#') || suggestion.startsWith('wit ') || suggestion.startsWith('git ')) {
          output += `  ${cyan}${suggestion}${reset}\n`;
        } else {
          output += `  ${dim}${suggestion}${reset}\n`;
        }
      }
    }

    return output;
  }

  /**
   * Create error as JSON for programmatic use
   */
  toJSON(): object {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      suggestions: this.suggestions,
      context: this.context,
    };
  }
}

/**
 * Find similar strings using Levenshtein distance
 */
export function findSimilar(input: string, candidates: string[], maxDistance: number = 3): string[] {
  const results: { candidate: string; distance: number }[] = [];

  for (const candidate of candidates) {
    const distance = levenshteinDistance(input.toLowerCase(), candidate.toLowerCase());
    if (distance <= maxDistance) {
      results.push({ candidate, distance });
    }
  }

  return results
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)
    .map(r => r.candidate);
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Factory functions for common errors
 */
export const Errors = {
  notARepository(path: string): TsgitError {
    return new TsgitError(
      `Not a wit repository (or any parent up to root): ${path}`,
      ErrorCode.NOT_A_REPOSITORY,
      [
        'wit init    # Initialize a new repository here',
        'cd <repo>     # Navigate to an existing repository',
      ],
      { path }
    );
  },

  repositoryExists(path: string): TsgitError {
    return new TsgitError(
      `Repository already exists at ${path}`,
      ErrorCode.REPOSITORY_EXISTS,
      [
        'cd .wit && ls    # Explore existing repository',
      ],
      { path }
    );
  },

  objectNotFound(hash: string): TsgitError {
    return new TsgitError(
      `Object not found: ${hash}`,
      ErrorCode.OBJECT_NOT_FOUND,
      [
        'wit log    # View existing commits',
        'wit branch # List available branches',
      ],
      { hash }
    );
  },

  branchNotFound(name: string, existingBranches: string[]): TsgitError {
    const similar = findSimilar(name, existingBranches);
    const suggestions: string[] = [];

    if (similar.length > 0) {
      suggestions.push(...similar.map(b => `wit checkout ${b}`));
    }
    suggestions.push(`wit checkout -b ${name}    # Create new branch`);
    suggestions.push('wit branch                 # List all branches');

    return new TsgitError(
      `Branch '${name}' not found`,
      ErrorCode.BRANCH_NOT_FOUND,
      suggestions,
      { branch: name, similarBranches: similar }
    );
  },

  branchExists(name: string): TsgitError {
    return new TsgitError(
      `Branch '${name}' already exists`,
      ErrorCode.BRANCH_EXISTS,
      [
        `wit checkout ${name}    # Switch to existing branch`,
        `wit branch -d ${name} && wit branch ${name}    # Recreate branch`,
      ],
      { branch: name }
    );
  },

  cannotDeleteCurrentBranch(name: string): TsgitError {
    return new TsgitError(
      `Cannot delete the current branch '${name}'`,
      ErrorCode.CANNOT_DELETE_CURRENT_BRANCH,
      [
        'wit checkout <other-branch>    # Switch to another branch first',
        'wit checkout main              # Switch to main branch',
      ],
      { branch: name }
    );
  },

  fileNotFound(filePath: string, cwd?: string): TsgitError {
    const suggestions: string[] = [
      'ls                    # Check files in current directory',
      'wit status            # See tracked and untracked files',
    ];
    
    // Add helpful context about where we looked
    const context: ErrorContext = { path: filePath };
    if (cwd) {
      context.cwd = cwd;
    }

    return new TsgitError(
      `File not found: ${filePath}`,
      ErrorCode.FILE_NOT_FOUND,
      suggestions,
      context
    );
  },

  fileNotInRepository(filePath: string): TsgitError {
    return new TsgitError(
      `File '${filePath}' is not in the repository`,
      ErrorCode.FILE_NOT_FOUND,
      [
        `wit add ${filePath}    # Add file to tracking`,
        'wit status             # Check repository status',
      ],
      { path: filePath }
    );
  },

  nothingToCommit(): TsgitError {
    return new TsgitError(
      'Nothing to commit, working tree clean',
      ErrorCode.NOTHING_TO_COMMIT,
      [
        'wit status    # Check repository status',
        'wit add <file>    # Stage files first',
      ]
    );
  },

  uncommittedChanges(files: string[]): TsgitError {
    const fileList = files.length <= 5 
      ? files.join(', ') 
      : `${files.slice(0, 5).join(', ')} and ${files.length - 5} more`;
    
    return new TsgitError(
      `You have uncommitted changes that would be overwritten`,
      ErrorCode.UNCOMMITTED_CHANGES,
      [
        'wit stash              # Stash your changes',
        'wit commit -m "WIP"    # Commit your changes',
        'wit checkout --force   # Discard changes (dangerous)',
      ],
      { files, affectedFiles: fileList }
    );
  },

  noCommitsYet(): TsgitError {
    return new TsgitError(
      'No commits yet in this repository',
      ErrorCode.NO_COMMITS_YET,
      [
        'wit add .                       # Stage all files',
        'wit commit -m "Initial commit"  # Create first commit',
      ]
    );
  },

  mergeConflict(files: string[]): TsgitError {
    const fileList = files.slice(0, 5);
    const moreCount = files.length > 5 ? ` (+${files.length - 5} more)` : '';

    return new TsgitError(
      `Merge conflict in ${files.length} file(s): ${fileList.join(', ')}${moreCount}`,
      ErrorCode.MERGE_CONFLICT,
      [
        'wit status              # See conflicting files',
        'wit diff                # View conflicts',
        'wit add <file>          # Mark file as resolved after fixing',
        'wit merge --abort       # Abort the merge',
      ],
      { files }
    );
  },

  invalidArgument(arg: string, expected: string): TsgitError {
    return new TsgitError(
      `Invalid argument: ${arg}. Expected: ${expected}`,
      ErrorCode.INVALID_ARGUMENT,
      [],
      { argument: arg, expected }
    );
  },

  scopeViolation(path: string, scope: string[]): TsgitError {
    return new TsgitError(
      `Path '${path}' is outside the repository scope`,
      ErrorCode.SCOPE_VIOLATION,
      [
        'wit scope show    # View current scope',
        'wit scope add <path>    # Add path to scope',
      ],
      { path, scope }
    );
  },

  // Network and authentication errors
  networkError(url: string, details?: string): TsgitError {
    return new TsgitError(
      `Failed to connect to '${url}'${details ? `: ${details}` : ''}`,
      ErrorCode.OPERATION_FAILED,
      [
        'Check your internet connection',
        'Verify the URL is correct',
        'Try again in a few moments',
      ],
      { url, details }
    );
  },

  authenticationFailed(remote: string): TsgitError {
    return new TsgitError(
      `Authentication failed for '${remote}'`,
      ErrorCode.OPERATION_FAILED,
      [
        'wit github login        # Login to GitHub',
        'wit token create <name> # Create a personal access token',
        'Check your credentials are correct',
      ],
      { remote }
    );
  },

  remoteNotFound(name: string, availableRemotes?: string[]): TsgitError {
    const suggestions: string[] = [];
    
    if (availableRemotes && availableRemotes.length > 0) {
      suggestions.push(`Available remotes: ${availableRemotes.join(', ')}`);
    }
    suggestions.push(`wit remote add ${name} <url>    # Add the remote`);
    suggestions.push('wit remote -v                   # List all remotes');

    return new TsgitError(
      `Remote '${name}' not found`,
      ErrorCode.REF_NOT_FOUND,
      suggestions,
      { remote: name, availableRemotes }
    );
  },

  pushRejected(branch: string, reason?: string): TsgitError {
    return new TsgitError(
      `Push rejected for '${branch}'${reason ? `: ${reason}` : ''}`,
      ErrorCode.OPERATION_FAILED,
      [
        'wit pull                # Fetch and integrate remote changes first',
        'wit push --force        # Force push (overwrites remote, use carefully)',
        'wit push --force-with-lease  # Safe force push',
      ],
      { branch, reason }
    );
  },

  pullConflicts(files: string[]): TsgitError {
    return new TsgitError(
      `Pull resulted in merge conflicts`,
      ErrorCode.MERGE_CONFLICT,
      [
        'wit status              # See conflicting files',
        'wit diff                # View conflicts',
        'wit add <file>          # Mark resolved after fixing',
        'wit commit              # Complete the merge',
        'wit merge --abort       # Abort and return to previous state',
      ],
      { files }
    );
  },

  tagNotFound(name: string, availableTags?: string[]): TsgitError {
    const similar = availableTags ? findSimilar(name, availableTags) : [];
    const suggestions: string[] = [];

    if (similar.length > 0) {
      suggestions.push(`Did you mean: ${similar.join(', ')}?`);
    }
    suggestions.push(`wit tag ${name}    # Create this tag`);
    suggestions.push('wit tag           # List all tags');

    return new TsgitError(
      `Tag '${name}' not found`,
      ErrorCode.TAG_NOT_FOUND,
      suggestions,
      { tag: name, similarTags: similar }
    );
  },

  tagExists(name: string): TsgitError {
    return new TsgitError(
      `Tag '${name}' already exists`,
      ErrorCode.TAG_EXISTS,
      [
        `wit tag -d ${name}    # Delete existing tag`,
        `wit show ${name}      # View existing tag`,
      ],
      { tag: name }
    );
  },

  checkoutConflict(files: string[]): TsgitError {
    const fileList = files.slice(0, 5);
    const moreCount = files.length > 5 ? ` (+${files.length - 5} more)` : '';

    return new TsgitError(
      `Your local changes would be overwritten: ${fileList.join(', ')}${moreCount}`,
      ErrorCode.CHECKOUT_CONFLICT,
      [
        'wit stash              # Stash changes first',
        'wit commit -m "WIP"    # Commit changes first',
        'wit checkout --force   # Discard changes (destructive)',
      ],
      { files }
    );
  },

  detachedHead(commit: string): TsgitError {
    return new TsgitError(
      `HEAD is detached at ${commit.slice(0, 8)}`,
      ErrorCode.DETACHED_HEAD,
      [
        'wit checkout -b <branch>    # Create a branch from here',
        'wit checkout main           # Return to a branch',
      ],
      { commit }
    );
  },

  directoryNotEmpty(path: string): TsgitError {
    return new TsgitError(
      `Directory '${path}' is not empty`,
      ErrorCode.OPERATION_FAILED,
      [
        `rm -rf ${path}              # Remove directory (destructive)`,
        `wit clone <url> ${path}-new # Use a different name`,
      ],
      { path }
    );
  },

  hookFailed(hookName: string, output?: string): TsgitError {
    return new TsgitError(
      `${hookName} hook failed`,
      ErrorCode.HOOK_FAILED,
      [
        output ? output.trim() : 'Check the hook output for details',
        '--no-verify             # Bypass hooks (if applicable)',
      ],
      { hook: hookName, output }
    );
  },
};
