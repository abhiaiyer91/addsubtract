/**
 * Embedding Generation for Semantic Code Search
 *
 * Uses @mastra/rag and the AI SDK for generating embeddings from code.
 */

/**
 * Default embedding model
 */
const DEFAULT_MODEL = 'text-embedding-3-small';

/**
 * Embedding dimensions for text-embedding-3-small
 */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Error thrown when the 'ai' package is not available
 */
export class AIPackageNotAvailableError extends Error {
  constructor() {
    super(
      'Semantic search requires the \'ai\' package.\n\n' +
      'To install it, run:\n' +
      '  npm install ai @ai-sdk/openai\n\n' +
      'This is an optional dependency for AI-powered features.'
    );
    this.name = 'AIPackageNotAvailableError';
  }
}

/**
 * Check if the 'ai' package is available
 */
let _aiPackageAvailable: boolean | null = null;

export function isAIPackageAvailable(): boolean {
  if (_aiPackageAvailable !== null) {
    return _aiPackageAvailable;
  }

  try {
    require.resolve('ai');
    require.resolve('@ai-sdk/openai');
    _aiPackageAvailable = true;
  } catch {
    _aiPackageAvailable = false;
  }

  return _aiPackageAvailable;
}

/**
 * Lazy-loaded AI SDK modules
 */
let _embed: typeof import('ai').embed | null = null;
let _embedMany: typeof import('ai').embedMany | null = null;
let _openai: typeof import('@ai-sdk/openai').openai | null = null;

async function loadAIModules(): Promise<{
  embed: typeof import('ai').embed;
  embedMany: typeof import('ai').embedMany;
  openai: typeof import('@ai-sdk/openai').openai;
}> {
  if (_embed && _embedMany && _openai) {
    return { embed: _embed, embedMany: _embedMany, openai: _openai };
  }

  try {
    const [aiModule, openaiModule] = await Promise.all([
      import('ai'),
      import('@ai-sdk/openai'),
    ]);

    _embed = aiModule.embed;
    _embedMany = aiModule.embedMany;
    _openai = openaiModule.openai;

    return { embed: _embed, embedMany: _embedMany, openai: _openai };
  } catch (error) {
    throw new AIPackageNotAvailableError();
  }
}

/**
 * Context for code embedding generation
 */
export interface CodeContext {
  path: string;
  language: string;
  repoDescription?: string;
}

/**
 * Generate embedding for a single text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const { embed, openai } = await loadAIModules();

  const { embedding } = await embed({
    model: openai.embedding(DEFAULT_MODEL),
    value: text,
  });
  return embedding;
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const { embedMany, openai } = await loadAIModules();

  const { embeddings } = await embedMany({
    model: openai.embedding(DEFAULT_MODEL),
    values: texts,
  });
  return embeddings;
}

/**
 * Generate embedding for code with additional context
 * 
 * Including file path and language helps the embedding model
 * understand the context better.
 */
export async function generateCodeEmbedding(
  code: string,
  context: CodeContext
): Promise<number[]> {
  const text = formatCodeForEmbedding(code, context);
  return generateEmbedding(text);
}

/**
 * Generate embeddings for multiple code chunks with context
 */
export async function generateCodeEmbeddings(
  chunks: Array<{ code: string; context: CodeContext }>
): Promise<number[][]> {
  const texts = chunks.map(({ code, context }) => 
    formatCodeForEmbedding(code, context)
  );
  return generateEmbeddings(texts);
}

/**
 * Format code with context for embedding generation
 */
function formatCodeForEmbedding(code: string, context: CodeContext): string {
  const parts: string[] = [];
  
  parts.push(`File: ${context.path}`);
  parts.push(`Language: ${context.language}`);
  
  if (context.repoDescription) {
    parts.push(`Repository: ${context.repoDescription}`);
  }
  
  parts.push('');
  parts.push('Code:');
  parts.push(code);
  
  return parts.join('\n');
}

/**
 * Detect programming language from file path
 */
export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  
  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    'js': 'JavaScript',
    'jsx': 'JavaScript (React)',
    'ts': 'TypeScript',
    'tsx': 'TypeScript (React)',
    'mjs': 'JavaScript (ESM)',
    'cjs': 'JavaScript (CommonJS)',
    
    // Web
    'html': 'HTML',
    'htm': 'HTML',
    'css': 'CSS',
    'scss': 'SCSS',
    'sass': 'Sass',
    'less': 'Less',
    'vue': 'Vue',
    'svelte': 'Svelte',
    
    // Python
    'py': 'Python',
    'pyw': 'Python',
    'pyx': 'Cython',
    
    // Systems
    'c': 'C',
    'h': 'C Header',
    'cpp': 'C++',
    'cc': 'C++',
    'cxx': 'C++',
    'hpp': 'C++ Header',
    'rs': 'Rust',
    'go': 'Go',
    
    // JVM
    'java': 'Java',
    'kt': 'Kotlin',
    'kts': 'Kotlin Script',
    'scala': 'Scala',
    'groovy': 'Groovy',
    
    // .NET
    'cs': 'C#',
    'fs': 'F#',
    'vb': 'Visual Basic',
    
    // Ruby
    'rb': 'Ruby',
    'erb': 'ERB',
    
    // PHP
    'php': 'PHP',
    
    // Shell
    'sh': 'Shell',
    'bash': 'Bash',
    'zsh': 'Zsh',
    'fish': 'Fish',
    'ps1': 'PowerShell',
    
    // Data/Config
    'json': 'JSON',
    'yaml': 'YAML',
    'yml': 'YAML',
    'toml': 'TOML',
    'xml': 'XML',
    'ini': 'INI',
    
    // Documentation
    'md': 'Markdown',
    'mdx': 'MDX',
    'rst': 'reStructuredText',
    
    // SQL
    'sql': 'SQL',
    
    // Swift/Objective-C
    'swift': 'Swift',
    'm': 'Objective-C',
    'mm': 'Objective-C++',
    
    // Dart/Flutter
    'dart': 'Dart',
    
    // Elixir/Erlang
    'ex': 'Elixir',
    'exs': 'Elixir Script',
    'erl': 'Erlang',
    
    // Haskell
    'hs': 'Haskell',
    'lhs': 'Literate Haskell',
    
    // Lua
    'lua': 'Lua',
    
    // R
    'r': 'R',
    'R': 'R',
    
    // Julia
    'jl': 'Julia',
    
    // Zig
    'zig': 'Zig',
    
    // Nim
    'nim': 'Nim',
    
    // V
    'v': 'V',
    
    // OCaml
    'ml': 'OCaml',
    'mli': 'OCaml Interface',
    
    // Clojure
    'clj': 'Clojure',
    'cljs': 'ClojureScript',
    'cljc': 'Clojure Common',
    
    // Lisp
    'lisp': 'Common Lisp',
    'el': 'Emacs Lisp',
    'scm': 'Scheme',
    'rkt': 'Racket',
  };
  
  return languageMap[ext] || 'Unknown';
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  
  if (magnitude === 0) {
    return 0;
  }
  
  return dotProduct / magnitude;
}
