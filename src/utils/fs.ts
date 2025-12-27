import * as fs from 'fs';
import * as path from 'path';

/**
 * Default patterns that are always ignored
 */
const DEFAULT_IGNORE_PATTERNS = ['.wit/', '.git/', 'node_modules/'];

/**
 * Parse a .witignore or .gitignore file into patterns
 */
export function parseIgnoreFile(content: string): string[] {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#')); // Remove empty lines and comments
}

/**
 * Load ignore patterns from .gitignore and .witignore
 * Both files are loaded if they exist (patterns are combined)
 */
export function loadIgnorePatterns(workDir: string): string[] {
  const patterns = [...DEFAULT_IGNORE_PATTERNS];
  
  // Load both .gitignore and .witignore if they exist
  const ignoreFiles = ['.gitignore', '.witignore'];
  
  for (const ignoreFile of ignoreFiles) {
    const ignorePath = path.join(workDir, ignoreFile);
    if (fs.existsSync(ignorePath)) {
      const content = fs.readFileSync(ignorePath, 'utf8');
      patterns.push(...parseIgnoreFile(content));
    }
  }
  
  return patterns;
}

/**
 * Check if a path matches an ignore pattern
 */
export function matchesIgnorePattern(filePath: string, pattern: string): boolean {
  // Normalize the pattern
  const normalizedPattern = pattern.replace(/\\/g, '/');
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // Directory pattern (ends with /)
  if (normalizedPattern.endsWith('/')) {
    const dirName = normalizedPattern.slice(0, -1);
    // Match directory name anywhere in path
    return normalizedPath.split('/').includes(dirName);
  }
  
  // Glob pattern with *
  if (normalizedPattern.includes('*')) {
    const regex = new RegExp(
      '^' + normalizedPattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '{{GLOBSTAR}}')
        .replace(/\*/g, '[^/]*')
        .replace(/\{\{GLOBSTAR\}\}/g, '.*') + '$'
    );
    return regex.test(normalizedPath) || regex.test(path.basename(normalizedPath));
  }
  
  // Exact match or basename match
  return normalizedPath === normalizedPattern || 
         path.basename(normalizedPath) === normalizedPattern ||
         normalizedPath.endsWith('/' + normalizedPattern);
}

/**
 * Recursively create directories
 */
export function mkdirp(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Check if a path exists
 */
export function exists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Read file as buffer
 */
export function readFile(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}

/**
 * Read file as string
 */
export function readFileText(filePath: string): string {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Write buffer to file
 */
export function writeFile(filePath: string, data: Buffer | string): void {
  const dir = path.dirname(filePath);
  if (!exists(dir)) {
    mkdirp(dir);
  }
  fs.writeFileSync(filePath, data);
}

/**
 * Get all files in a directory recursively
 */
export function walkDir(dir: string, ignorePatterns: string[] = []): string[] {
  const results: string[] = [];
  
  function shouldIgnore(fullPath: string, name: string): boolean {
    const relativePath = path.relative(dir, fullPath);
    return ignorePatterns.some(pattern => {
      // Check directory name for directory patterns
      if (pattern.endsWith('/')) {
        const dirName = pattern.slice(0, -1);
        return name === dirName || relativePath.split(path.sep).includes(dirName);
      }
      // Use the full matching logic
      return matchesIgnorePattern(relativePath, pattern) || 
             matchesIgnorePattern(name, pattern);
    });
  }

  function walk(currentDir: string): void {
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      // Skip directories we can't read (permission denied, etc.)
      return;
    }
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (shouldIgnore(fullPath, entry.name)) continue;
      
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

/**
 * Get file stats
 */
export function stat(filePath: string): fs.Stats {
  return fs.statSync(filePath);
}

/**
 * Delete a file
 */
export function deleteFile(filePath: string): void {
  if (exists(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * List directory contents
 */
export function readDir(dirPath: string): string[] {
  return fs.readdirSync(dirPath);
}

/**
 * Check if path is a directory
 */
export function isDirectory(filePath: string): boolean {
  return exists(filePath) && fs.statSync(filePath).isDirectory();
}
