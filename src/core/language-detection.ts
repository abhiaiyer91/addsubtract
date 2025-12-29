/**
 * Language Detection Service
 * 
 * Detects programming languages in repositories and provides
 * GitHub-style language statistics with colors.
 */

export interface LanguageInfo {
  name: string;
  color: string;
}

export interface LanguageStats {
  language: string;
  bytes: number;
  percentage: number;
  color: string;
}

/**
 * Language map with GitHub-style colors
 * Colors sourced from https://github.com/github/linguist
 */
export const LANGUAGE_MAP: Record<string, LanguageInfo> = {
  // JavaScript/TypeScript
  '.ts': { name: 'TypeScript', color: '#3178c6' },
  '.tsx': { name: 'TypeScript', color: '#3178c6' },
  '.js': { name: 'JavaScript', color: '#f1e05a' },
  '.jsx': { name: 'JavaScript', color: '#f1e05a' },
  '.mjs': { name: 'JavaScript', color: '#f1e05a' },
  '.cjs': { name: 'JavaScript', color: '#f1e05a' },
  
  // Python
  '.py': { name: 'Python', color: '#3572A5' },
  '.pyw': { name: 'Python', color: '#3572A5' },
  '.pyx': { name: 'Python', color: '#3572A5' },
  
  // Ruby
  '.rb': { name: 'Ruby', color: '#701516' },
  '.rake': { name: 'Ruby', color: '#701516' },
  '.gemspec': { name: 'Ruby', color: '#701516' },
  
  // Go
  '.go': { name: 'Go', color: '#00ADD8' },
  
  // Rust
  '.rs': { name: 'Rust', color: '#dea584' },
  
  // Java
  '.java': { name: 'Java', color: '#b07219' },
  
  // C/C++
  '.c': { name: 'C', color: '#555555' },
  '.h': { name: 'C', color: '#555555' },
  '.cpp': { name: 'C++', color: '#f34b7d' },
  '.cc': { name: 'C++', color: '#f34b7d' },
  '.cxx': { name: 'C++', color: '#f34b7d' },
  '.hpp': { name: 'C++', color: '#f34b7d' },
  '.hxx': { name: 'C++', color: '#f34b7d' },
  
  // C#
  '.cs': { name: 'C#', color: '#178600' },
  
  // PHP
  '.php': { name: 'PHP', color: '#4F5D95' },
  
  // Swift
  '.swift': { name: 'Swift', color: '#F05138' },
  
  // Kotlin
  '.kt': { name: 'Kotlin', color: '#A97BFF' },
  '.kts': { name: 'Kotlin', color: '#A97BFF' },
  
  // Scala
  '.scala': { name: 'Scala', color: '#c22d40' },
  
  // Dart
  '.dart': { name: 'Dart', color: '#00B4AB' },
  
  // Elixir
  '.ex': { name: 'Elixir', color: '#6e4a7e' },
  '.exs': { name: 'Elixir', color: '#6e4a7e' },
  
  // Erlang
  '.erl': { name: 'Erlang', color: '#B83998' },
  
  // Haskell
  '.hs': { name: 'Haskell', color: '#5e5086' },
  
  // Clojure
  '.clj': { name: 'Clojure', color: '#db5855' },
  '.cljs': { name: 'Clojure', color: '#db5855' },
  '.cljc': { name: 'Clojure', color: '#db5855' },
  
  // F#
  '.fs': { name: 'F#', color: '#b845fc' },
  '.fsx': { name: 'F#', color: '#b845fc' },
  
  // OCaml
  '.ml': { name: 'OCaml', color: '#3be133' },
  '.mli': { name: 'OCaml', color: '#3be133' },
  
  // Lua
  '.lua': { name: 'Lua', color: '#000080' },
  
  // Perl
  '.pl': { name: 'Perl', color: '#0298c3' },
  '.pm': { name: 'Perl', color: '#0298c3' },
  
  // R
  '.r': { name: 'R', color: '#198CE7' },
  '.R': { name: 'R', color: '#198CE7' },
  
  // Julia
  '.jl': { name: 'Julia', color: '#a270ba' },
  
  // Web
  '.html': { name: 'HTML', color: '#e34c26' },
  '.htm': { name: 'HTML', color: '#e34c26' },
  '.css': { name: 'CSS', color: '#563d7c' },
  '.scss': { name: 'SCSS', color: '#c6538c' },
  '.sass': { name: 'Sass', color: '#a53b70' },
  '.less': { name: 'Less', color: '#1d365d' },
  '.vue': { name: 'Vue', color: '#41b883' },
  '.svelte': { name: 'Svelte', color: '#ff3e00' },
  
  // Data formats
  '.json': { name: 'JSON', color: '#292929' },
  '.yaml': { name: 'YAML', color: '#cb171e' },
  '.yml': { name: 'YAML', color: '#cb171e' },
  '.toml': { name: 'TOML', color: '#9c4221' },
  '.xml': { name: 'XML', color: '#0060ac' },
  
  // Markdown/Docs
  '.md': { name: 'Markdown', color: '#083fa1' },
  '.mdx': { name: 'MDX', color: '#fcb32c' },
  '.rst': { name: 'reStructuredText', color: '#141414' },
  
  // Shell
  '.sh': { name: 'Shell', color: '#89e051' },
  '.bash': { name: 'Shell', color: '#89e051' },
  '.zsh': { name: 'Shell', color: '#89e051' },
  '.fish': { name: 'Shell', color: '#89e051' },
  '.ps1': { name: 'PowerShell', color: '#012456' },
  
  // Database
  '.sql': { name: 'SQL', color: '#e38c00' },
  
  // Config
  '.dockerfile': { name: 'Dockerfile', color: '#384d54' },
  '.tf': { name: 'HCL', color: '#844fba' },
  '.hcl': { name: 'HCL', color: '#844fba' },
  
  // Zig
  '.zig': { name: 'Zig', color: '#ec915c' },
  
  // Nim
  '.nim': { name: 'Nim', color: '#ffc200' },
  
  // V
  '.v': { name: 'V', color: '#4f87c4' },
  
  // Assembly
  '.asm': { name: 'Assembly', color: '#6E4C13' },
  '.s': { name: 'Assembly', color: '#6E4C13' },
  
  // Objective-C
  '.m': { name: 'Objective-C', color: '#438eff' },
  '.mm': { name: 'Objective-C++', color: '#6866fb' },
  
  // GraphQL
  '.graphql': { name: 'GraphQL', color: '#e10098' },
  '.gql': { name: 'GraphQL', color: '#e10098' },
  
  // Solidity
  '.sol': { name: 'Solidity', color: '#AA6746' },
  
  // Move
  '.move': { name: 'Move', color: '#4a137a' },
};

/**
 * Files/directories to ignore when calculating language stats
 */
export const IGNORED_PATHS = new Set([
  'node_modules',
  'vendor',
  'dist',
  'build',
  '.git',
  '.wit',
  '.svn',
  '.hg',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  'coverage',
  '.coverage',
  '.nyc_output',
  'target', // Rust/Java build output
  'out',
  'bin',
  'obj',
  '.next',
  '.nuxt',
  '.output',
  'venv',
  '.venv',
  'env',
  '.env',
  'packages', // Often contains dependencies
]);

/**
 * Files to ignore (common generated/config files)
 */
export const IGNORED_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'composer.lock',
  'Gemfile.lock',
  'Cargo.lock',
  'poetry.lock',
  'go.sum',
]);

/**
 * Detect language from file extension
 */
export function detectLanguage(filename: string): LanguageInfo | null {
  // Handle special filenames
  const lowerName = filename.toLowerCase();
  if (lowerName === 'dockerfile' || lowerName.startsWith('dockerfile.')) {
    return LANGUAGE_MAP['.dockerfile'];
  }
  
  // Get extension
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return null;
  
  const ext = filename.slice(lastDot).toLowerCase();
  return LANGUAGE_MAP[ext] || null;
}

/**
 * Check if a path should be ignored
 */
export function shouldIgnorePath(pathPart: string): boolean {
  return IGNORED_PATHS.has(pathPart);
}

/**
 * Check if a file should be ignored
 */
export function shouldIgnoreFile(filename: string): boolean {
  return IGNORED_FILES.has(filename);
}

/**
 * Calculate language statistics from file data
 */
export function calculateLanguageStats(
  files: Array<{ path: string; size: number }>
): LanguageStats[] {
  const languageBytes = new Map<string, { bytes: number; color: string }>();
  let totalBytes = 0;
  
  for (const file of files) {
    // Skip ignored files
    const filename = file.path.split('/').pop() || '';
    if (shouldIgnoreFile(filename)) continue;
    
    // Skip ignored paths
    const pathParts = file.path.split('/');
    if (pathParts.some(part => shouldIgnorePath(part))) continue;
    
    // Detect language
    const lang = detectLanguage(filename);
    if (!lang) continue;
    
    // Accumulate bytes
    const current = languageBytes.get(lang.name) || { bytes: 0, color: lang.color };
    current.bytes += file.size;
    languageBytes.set(lang.name, current);
    totalBytes += file.size;
  }
  
  // Convert to sorted array with percentages
  const stats: LanguageStats[] = Array.from(languageBytes.entries())
    .map(([language, data]) => ({
      language,
      bytes: data.bytes,
      percentage: totalBytes > 0 ? (data.bytes / totalBytes) * 100 : 0,
      color: data.color,
    }))
    .sort((a, b) => b.bytes - a.bytes);
  
  return stats;
}

/**
 * Get the primary language (most bytes) from stats
 */
export function getPrimaryLanguage(stats: LanguageStats[]): LanguageStats | null {
  return stats.length > 0 ? stats[0] : null;
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
