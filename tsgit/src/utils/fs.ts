import * as fs from 'fs';
import * as path from 'path';

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
  
  function shouldIgnore(name: string): boolean {
    return ignorePatterns.some(pattern => {
      if (pattern.endsWith('/')) {
        return name === pattern.slice(0, -1);
      }
      return name === pattern || name.startsWith(pattern);
    });
  }

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (shouldIgnore(entry.name)) continue;
      
      const fullPath = path.join(currentDir, entry.name);
      
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
