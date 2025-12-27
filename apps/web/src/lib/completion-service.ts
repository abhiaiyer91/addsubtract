/**
 * Code Completion Service
 *
 * Client-side service for managing AI code completions.
 * Handles debouncing, caching, and request cancellation.
 */

// Completion request state
interface CompletionRequest {
  id: string;
  prefix: string;
  suffix: string;
  filePath: string;
  language: string;
  timestamp: number;
  abortController: AbortController;
}

// Completion result
export interface CompletionResult {
  text: string;
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
}

// Service configuration
interface CompletionServiceConfig {
  debounceMs?: number;
  maxCacheSize?: number;
  cacheTtlMs?: number;
  enabled?: boolean;
}

/**
 * Completion service for managing AI code completions
 */
export class CompletionService {
  private config: Required<CompletionServiceConfig>;
  private pendingRequest: CompletionRequest | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private cache = new Map<string, { result: string; timestamp: number }>();
  private completionCallback: ((prefix: string, suffix: string, filePath: string, language: string) => Promise<string | null>) | null = null;

  constructor(config: CompletionServiceConfig = {}) {
    this.config = {
      debounceMs: config.debounceMs ?? 300,
      maxCacheSize: config.maxCacheSize ?? 100,
      cacheTtlMs: config.cacheTtlMs ?? 30000, // 30 seconds
      enabled: config.enabled ?? true,
    };
  }

  /**
   * Set the completion callback that will be called to fetch completions
   */
  setCompletionCallback(
    callback: (prefix: string, suffix: string, filePath: string, language: string) => Promise<string | null>
  ) {
    this.completionCallback = callback;
  }

  /**
   * Enable or disable completions
   */
  setEnabled(enabled: boolean) {
    this.config.enabled = enabled;
    if (!enabled) {
      this.cancelPending();
    }
  }

  /**
   * Check if completions are enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Generate cache key for a completion request
   */
  private getCacheKey(prefix: string, suffix: string, filePath: string): string {
    // Use last 150 chars of prefix for cache key
    const prefixKey = prefix.slice(-150);
    const suffixKey = suffix.slice(0, 50);
    return `${filePath}:${prefixKey}:${suffixKey}`;
  }

  /**
   * Check cache for a completion
   */
  private checkCache(prefix: string, suffix: string, filePath: string): string | null {
    const key = this.getCacheKey(prefix, suffix, filePath);
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < this.config.cacheTtlMs) {
      return cached.result;
    }

    if (cached) {
      this.cache.delete(key);
    }

    return null;
  }

  /**
   * Add a result to the cache
   */
  private addToCache(prefix: string, suffix: string, filePath: string, result: string) {
    const key = this.getCacheKey(prefix, suffix, filePath);
    this.cache.set(key, { result, timestamp: Date.now() });

    // Clean up old entries if cache is too large
    if (this.cache.size > this.config.maxCacheSize) {
      const now = Date.now();
      for (const [k, v] of this.cache) {
        if (now - v.timestamp > this.config.cacheTtlMs) {
          this.cache.delete(k);
        }
      }

      // If still too large, remove oldest entries
      if (this.cache.size > this.config.maxCacheSize) {
        const entries = Array.from(this.cache.entries());
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
        const toRemove = entries.slice(0, entries.length - this.config.maxCacheSize);
        for (const [k] of toRemove) {
          this.cache.delete(k);
        }
      }
    }
  }

  /**
   * Cancel any pending completion request
   */
  cancelPending() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.pendingRequest) {
      this.pendingRequest.abortController.abort();
      this.pendingRequest = null;
    }
  }

  /**
   * Request a completion with debouncing
   */
  async requestCompletion(
    prefix: string,
    suffix: string,
    filePath: string,
    language: string,
    cursorPosition: { lineNumber: number; column: number }
  ): Promise<CompletionResult | null> {
    if (!this.config.enabled || !this.completionCallback) {
      return null;
    }

    // Don't complete if prefix is too short
    if (prefix.length < 10) {
      return null;
    }

    // Check cache first
    const cached = this.checkCache(prefix, suffix, filePath);
    if (cached) {
      return {
        text: cached,
        range: {
          startLineNumber: cursorPosition.lineNumber,
          startColumn: cursorPosition.column,
          endLineNumber: cursorPosition.lineNumber,
          endColumn: cursorPosition.column,
        },
      };
    }

    // Cancel any pending request
    this.cancelPending();

    return new Promise((resolve) => {
      this.debounceTimer = setTimeout(async () => {
        const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const abortController = new AbortController();

        this.pendingRequest = {
          id: requestId,
          prefix,
          suffix,
          filePath,
          language,
          timestamp: Date.now(),
          abortController,
        };

        try {
          const result = await this.completionCallback!(prefix, suffix, filePath, language);

          // Only use result if this request wasn't cancelled
          if (this.pendingRequest?.id === requestId && result) {
            this.addToCache(prefix, suffix, filePath, result);
            resolve({
              text: result,
              range: {
                startLineNumber: cursorPosition.lineNumber,
                startColumn: cursorPosition.column,
                endLineNumber: cursorPosition.lineNumber,
                endColumn: cursorPosition.column,
              },
            });
          } else {
            resolve(null);
          }
        } catch (error) {
          if ((error as Error).name !== 'AbortError') {
            console.error('Completion error:', error);
          }
          resolve(null);
        } finally {
          if (this.pendingRequest?.id === requestId) {
            this.pendingRequest = null;
          }
        }
      }, this.config.debounceMs);
    });
  }

  /**
   * Clear the cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Singleton instance
export const completionService = new CompletionService();

/**
 * Determine if completion should be triggered based on context
 */
export function shouldTriggerCompletion(
  prefix: string,
  _suffix: string,
  triggerKind: 'automatic' | 'explicit'
): boolean {
  // Always complete on explicit trigger (Tab or Ctrl+Space)
  if (triggerKind === 'explicit') {
    return true;
  }

  // Don't complete if prefix is too short
  if (prefix.length < 10) {
    return false;
  }

  const lastLine = prefix.split('\n').pop() || '';
  const trimmedLastLine = lastLine.trimStart();

  // Don't complete in comments
  if (trimmedLastLine.startsWith('//') || trimmedLastLine.startsWith('#') || trimmedLastLine.startsWith('*')) {
    return false;
  }

  // Don't complete in string literals (simple heuristic)
  const quoteCount = (lastLine.match(/['"]/g) || []).length;
  if (quoteCount % 2 === 1) {
    return false;
  }

  // Trigger after certain characters
  const triggerChars = ['.', '(', '{', '[', ',', ':', '=', ' ', '\n'];
  const lastChar = prefix.slice(-1);
  if (triggerChars.includes(lastChar)) {
    return true;
  }

  // Trigger if on a new line with some code
  if (lastChar === '\n' || (lastLine.length > 0 && trimmedLastLine.length > 3)) {
    return true;
  }

  return false;
}

/**
 * Get language from file path
 */
export function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    php: 'php',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
    md: 'markdown',
    sql: 'sql',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    dockerfile: 'dockerfile',
    toml: 'toml',
    ini: 'ini',
    vue: 'vue',
    svelte: 'svelte',
  };
  return langMap[ext] || 'plaintext';
}
