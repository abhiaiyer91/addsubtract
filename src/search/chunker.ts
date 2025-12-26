/**
 * Code Chunking for Semantic Search
 * 
 * Splits code into logical chunks (functions, classes, methods)
 * for better semantic search results.
 */

/**
 * A chunk of code with metadata
 */
export interface CodeChunk {
  /** The code content */
  content: string;
  /** Starting line number (1-indexed) */
  startLine: number;
  /** Ending line number (1-indexed) */
  endLine: number;
  /** Type of chunk */
  type: ChunkType;
  /** Name of the chunk (function name, class name, etc.) */
  name?: string;
  /** Parent chunk name (e.g., class name for a method) */
  parent?: string;
}

/**
 * Types of code chunks
 */
export type ChunkType = 
  | 'function'
  | 'class'
  | 'method'
  | 'interface'
  | 'type'
  | 'constant'
  | 'import'
  | 'export'
  | 'comment'
  | 'block';

/**
 * Options for chunking code
 */
export interface ChunkOptions {
  /** Maximum chunk size in characters */
  maxSize?: number;
  /** Minimum chunk size in characters */
  minSize?: number;
  /** Whether to include imports as a chunk */
  includeImports?: boolean;
  /** Whether to include comments as chunks */
  includeComments?: boolean;
  /** Overlap between chunks in characters */
  overlap?: number;
}

const DEFAULT_OPTIONS: Required<ChunkOptions> = {
  maxSize: 2000,
  minSize: 100,
  includeImports: false,
  includeComments: true,
  overlap: 50,
};

/**
 * Chunk code into logical pieces
 */
export function chunkCode(content: string, filePath: string, options: ChunkOptions = {}): CodeChunk[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  
  // Choose chunking strategy based on file type
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return chunkTypeScript(content, opts);
    
    case 'py':
      return chunkPython(content, opts);
    
    case 'go':
      return chunkGo(content, opts);
    
    case 'rs':
      return chunkRust(content, opts);
    
    case 'java':
    case 'kt':
    case 'scala':
      return chunkJavaLike(content, opts);
    
    case 'rb':
      return chunkRuby(content, opts);
    
    case 'c':
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'h':
    case 'hpp':
      return chunkCLike(content, opts);
    
    default:
      // Fallback to generic chunking
      return chunkGeneric(content, opts);
  }
}

/**
 * Chunk TypeScript/JavaScript code
 */
function chunkTypeScript(content: string, opts: Required<ChunkOptions>): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const lines = content.split('\n');
  
  // Regex patterns for TypeScript/JavaScript
  const patterns = {
    // Function declarations
    function: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
    // Arrow functions assigned to const/let/var
    arrowFunction: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(/,
    // Class declarations
    class: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/,
    // Interface declarations
    interface: /^(?:export\s+)?interface\s+(\w+)/,
    // Type declarations
    type: /^(?:export\s+)?type\s+(\w+)/,
    // Method inside class
    method: /^\s+(?:async\s+)?(?:static\s+)?(?:private\s+|protected\s+|public\s+)?(\w+)\s*\(/,
    // Import statements
    import: /^import\s+/,
    // Export statements
    export: /^export\s+(?:default\s+)?{/,
    // Block comments
    blockComment: /^\/\*\*/,
  };
  
  let currentChunk: Partial<CodeChunk> | null = null;
  let braceCount = 0;
  let inClass = false;
  let className = '';
  let importBlock: string[] = [];
  let importStartLine = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmedLine = line.trim();
    
    // Track brace depth
    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;
    
    // Collect imports into a single chunk
    if (patterns.import.test(trimmedLine) && opts.includeImports) {
      if (importBlock.length === 0) {
        importStartLine = lineNum;
      }
      importBlock.push(line);
      continue;
    } else if (importBlock.length > 0 && !patterns.import.test(trimmedLine)) {
      // End of import block
      if (importBlock.length > 0) {
        chunks.push({
          content: importBlock.join('\n'),
          startLine: importStartLine,
          endLine: lineNum - 1,
          type: 'import',
          name: 'imports',
        });
        importBlock = [];
      }
    }
    
    // Check for class start
    const classMatch = trimmedLine.match(patterns.class);
    if (classMatch && !currentChunk) {
      inClass = true;
      className = classMatch[1];
      currentChunk = {
        content: line,
        startLine: lineNum,
        type: 'class',
        name: className,
      };
      braceCount = openBraces - closeBraces;
      continue;
    }
    
    // Check for interface
    const interfaceMatch = trimmedLine.match(patterns.interface);
    if (interfaceMatch && !currentChunk) {
      currentChunk = {
        content: line,
        startLine: lineNum,
        type: 'interface',
        name: interfaceMatch[1],
      };
      braceCount = openBraces - closeBraces;
      continue;
    }
    
    // Check for type alias
    const typeMatch = trimmedLine.match(patterns.type);
    if (typeMatch && !currentChunk) {
      currentChunk = {
        content: line,
        startLine: lineNum,
        type: 'type',
        name: typeMatch[1],
      };
      braceCount = openBraces - closeBraces;
      // Type aliases might be single line
      if (braceCount === 0 && trimmedLine.includes('=')) {
        currentChunk.endLine = lineNum;
        chunks.push(currentChunk as CodeChunk);
        currentChunk = null;
      }
      continue;
    }
    
    // Check for function
    const functionMatch = trimmedLine.match(patterns.function);
    if (functionMatch && !currentChunk) {
      currentChunk = {
        content: line,
        startLine: lineNum,
        type: 'function',
        name: functionMatch[1],
      };
      braceCount = openBraces - closeBraces;
      continue;
    }
    
    // Check for arrow function
    const arrowMatch = trimmedLine.match(patterns.arrowFunction);
    if (arrowMatch && !currentChunk) {
      currentChunk = {
        content: line,
        startLine: lineNum,
        type: 'function',
        name: arrowMatch[1],
      };
      braceCount = openBraces - closeBraces;
      continue;
    }
    
    // If we're in a chunk, accumulate content
    if (currentChunk) {
      currentChunk.content += '\n' + line;
      braceCount += openBraces - closeBraces;
      
      // Check if chunk is complete
      if (braceCount === 0) {
        currentChunk.endLine = lineNum;
        
        // If chunk is too large, split it
        if (currentChunk.content!.length > opts.maxSize) {
          const subChunks = splitLargeChunk(currentChunk as CodeChunk, opts);
          chunks.push(...subChunks);
        } else if (currentChunk.content!.length >= opts.minSize) {
          chunks.push(currentChunk as CodeChunk);
        }
        
        // Reset class tracking if we just finished a class
        if (currentChunk.type === 'class') {
          inClass = false;
          className = '';
        }
        
        currentChunk = null;
      }
    }
  }
  
  // Handle any remaining chunk
  if (currentChunk) {
    currentChunk.endLine = lines.length;
    if (currentChunk.content!.length >= opts.minSize) {
      chunks.push(currentChunk as CodeChunk);
    }
  }
  
  // If no chunks were found, fall back to generic chunking
  if (chunks.length === 0) {
    return chunkGeneric(content, opts);
  }
  
  return chunks;
}

/**
 * Chunk Python code
 */
function chunkPython(content: string, opts: Required<ChunkOptions>): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const lines = content.split('\n');
  
  const patterns = {
    function: /^(?:async\s+)?def\s+(\w+)/,
    class: /^class\s+(\w+)/,
    method: /^\s+(?:async\s+)?def\s+(\w+)/,
  };
  
  let currentChunk: Partial<CodeChunk> | null = null;
  let currentIndent = 0;
  let inClass = false;
  let className = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmedLine = line.trim();
    
    // Skip empty lines and comments at top level
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      if (currentChunk) {
        currentChunk.content += '\n' + line;
      }
      continue;
    }
    
    // Calculate indentation
    const indent = line.length - line.trimStart().length;
    
    // Check for class
    const classMatch = trimmedLine.match(patterns.class);
    if (classMatch && indent === 0) {
      // Save previous chunk
      if (currentChunk) {
        currentChunk.endLine = lineNum - 1;
        if (currentChunk.content!.length >= opts.minSize) {
          chunks.push(currentChunk as CodeChunk);
        }
      }
      
      inClass = true;
      className = classMatch[1];
      currentChunk = {
        content: line,
        startLine: lineNum,
        type: 'class',
        name: className,
      };
      currentIndent = 0;
      continue;
    }
    
    // Check for function/method
    const funcMatch = trimmedLine.match(patterns.function) || 
                      trimmedLine.match(patterns.method);
    if (funcMatch) {
      const isMethod = indent > 0 && inClass;
      
      // Save previous chunk if starting a new top-level function
      if (!isMethod && currentChunk) {
        currentChunk.endLine = lineNum - 1;
        if (currentChunk.content!.length >= opts.minSize) {
          chunks.push(currentChunk as CodeChunk);
        }
        currentChunk = null;
      }
      
      if (!isMethod || !currentChunk) {
        currentChunk = {
          content: line,
          startLine: lineNum,
          type: isMethod ? 'method' : 'function',
          name: funcMatch[1],
          parent: isMethod ? className : undefined,
        };
        currentIndent = indent;
      } else {
        currentChunk.content += '\n' + line;
      }
      continue;
    }
    
    // Continue accumulating if in a chunk
    if (currentChunk) {
      // Check if we've dedented back to start
      if (indent <= currentIndent && trimmedLine && !trimmedLine.startsWith('#')) {
        // End current chunk
        currentChunk.endLine = lineNum - 1;
        if (currentChunk.content!.length >= opts.minSize) {
          chunks.push(currentChunk as CodeChunk);
        }
        currentChunk = null;
        inClass = false;
        className = '';
        i--; // Re-process this line
      } else {
        currentChunk.content += '\n' + line;
      }
    }
  }
  
  // Handle remaining chunk
  if (currentChunk) {
    currentChunk.endLine = lines.length;
    if (currentChunk.content!.length >= opts.minSize) {
      chunks.push(currentChunk as CodeChunk);
    }
  }
  
  if (chunks.length === 0) {
    return chunkGeneric(content, opts);
  }
  
  return chunks;
}

/**
 * Chunk Go code
 */
function chunkGo(content: string, opts: Required<ChunkOptions>): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const lines = content.split('\n');
  
  const patterns = {
    function: /^func\s+(\w+)/,
    method: /^func\s+\([^)]+\)\s+(\w+)/,
    type: /^type\s+(\w+)\s+(?:struct|interface)/,
  };
  
  let currentChunk: Partial<CodeChunk> | null = null;
  let braceCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmedLine = line.trim();
    
    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;
    
    // Check for type declaration
    const typeMatch = trimmedLine.match(patterns.type);
    if (typeMatch && !currentChunk) {
      currentChunk = {
        content: line,
        startLine: lineNum,
        type: 'type',
        name: typeMatch[1],
      };
      braceCount = openBraces - closeBraces;
      continue;
    }
    
    // Check for method
    const methodMatch = trimmedLine.match(patterns.method);
    if (methodMatch && !currentChunk) {
      currentChunk = {
        content: line,
        startLine: lineNum,
        type: 'method',
        name: methodMatch[1],
      };
      braceCount = openBraces - closeBraces;
      continue;
    }
    
    // Check for function
    const funcMatch = trimmedLine.match(patterns.function);
    if (funcMatch && !currentChunk) {
      currentChunk = {
        content: line,
        startLine: lineNum,
        type: 'function',
        name: funcMatch[1],
      };
      braceCount = openBraces - closeBraces;
      continue;
    }
    
    if (currentChunk) {
      currentChunk.content += '\n' + line;
      braceCount += openBraces - closeBraces;
      
      if (braceCount === 0) {
        currentChunk.endLine = lineNum;
        if (currentChunk.content!.length >= opts.minSize) {
          chunks.push(currentChunk as CodeChunk);
        }
        currentChunk = null;
      }
    }
  }
  
  if (currentChunk) {
    currentChunk.endLine = lines.length;
    if (currentChunk.content!.length >= opts.minSize) {
      chunks.push(currentChunk as CodeChunk);
    }
  }
  
  if (chunks.length === 0) {
    return chunkGeneric(content, opts);
  }
  
  return chunks;
}

/**
 * Chunk Rust code
 */
function chunkRust(content: string, opts: Required<ChunkOptions>): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const lines = content.split('\n');
  
  const patterns = {
    function: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/,
    struct: /^(?:pub\s+)?struct\s+(\w+)/,
    enum: /^(?:pub\s+)?enum\s+(\w+)/,
    impl: /^impl(?:<[^>]+>)?\s+(\w+)/,
    trait: /^(?:pub\s+)?trait\s+(\w+)/,
  };
  
  let currentChunk: Partial<CodeChunk> | null = null;
  let braceCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmedLine = line.trim();
    
    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;
    
    // Check for various Rust constructs
    for (const [type, pattern] of Object.entries(patterns)) {
      const match = trimmedLine.match(pattern);
      if (match && !currentChunk) {
        currentChunk = {
          content: line,
          startLine: lineNum,
          type: type === 'impl' || type === 'trait' ? 'class' : 
                type === 'struct' || type === 'enum' ? 'type' : 'function',
          name: match[1],
        };
        braceCount = openBraces - closeBraces;
        break;
      }
    }
    
    if (currentChunk && !Object.values(patterns).some(p => trimmedLine.match(p))) {
      currentChunk.content += '\n' + line;
      braceCount += openBraces - closeBraces;
      
      if (braceCount === 0) {
        currentChunk.endLine = lineNum;
        if (currentChunk.content!.length >= opts.minSize) {
          chunks.push(currentChunk as CodeChunk);
        }
        currentChunk = null;
      }
    }
  }
  
  if (currentChunk) {
    currentChunk.endLine = lines.length;
    if (currentChunk.content!.length >= opts.minSize) {
      chunks.push(currentChunk as CodeChunk);
    }
  }
  
  if (chunks.length === 0) {
    return chunkGeneric(content, opts);
  }
  
  return chunks;
}

/**
 * Chunk Java-like languages (Java, Kotlin, Scala)
 */
function chunkJavaLike(content: string, opts: Required<ChunkOptions>): CodeChunk[] {
  // Similar to TypeScript chunking but with Java-specific patterns
  return chunkTypeScript(content, opts);
}

/**
 * Chunk Ruby code
 */
function chunkRuby(content: string, opts: Required<ChunkOptions>): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const lines = content.split('\n');
  
  const patterns = {
    class: /^class\s+(\w+)/,
    module: /^module\s+(\w+)/,
    method: /^\s*def\s+(\w+)/,
  };
  
  let currentChunk: Partial<CodeChunk> | null = null;
  let endCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmedLine = line.trim();
    
    // Count block keywords
    const blockStart = /\b(class|module|def|do|if|unless|case|while|until|for|begin)\b/.test(trimmedLine);
    const blockEnd = trimmedLine === 'end' || trimmedLine.startsWith('end ');
    
    for (const [type, pattern] of Object.entries(patterns)) {
      const match = trimmedLine.match(pattern);
      if (match && !currentChunk) {
        currentChunk = {
          content: line,
          startLine: lineNum,
          type: type === 'method' ? 'function' : 'class',
          name: match[1],
        };
        endCount = 1;
        break;
      }
    }
    
    if (currentChunk && !Object.values(patterns).some(p => trimmedLine.match(p))) {
      currentChunk.content += '\n' + line;
      
      if (blockStart && !blockEnd) endCount++;
      if (blockEnd) endCount--;
      
      if (endCount === 0) {
        currentChunk.endLine = lineNum;
        if (currentChunk.content!.length >= opts.minSize) {
          chunks.push(currentChunk as CodeChunk);
        }
        currentChunk = null;
      }
    }
  }
  
  if (currentChunk) {
    currentChunk.endLine = lines.length;
    if (currentChunk.content!.length >= opts.minSize) {
      chunks.push(currentChunk as CodeChunk);
    }
  }
  
  if (chunks.length === 0) {
    return chunkGeneric(content, opts);
  }
  
  return chunks;
}

/**
 * Chunk C-like languages
 */
function chunkCLike(content: string, opts: Required<ChunkOptions>): CodeChunk[] {
  // Use TypeScript-style brace counting
  return chunkTypeScript(content, opts);
}

/**
 * Generic chunking for unknown file types
 * Splits by blank lines and size
 */
function chunkGeneric(content: string, opts: Required<ChunkOptions>): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const lines = content.split('\n');
  
  let currentChunk: Partial<CodeChunk> = {
    content: '',
    startLine: 1,
    type: 'block',
  };
  
  let consecutiveBlankLines = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    
    if (line.trim() === '') {
      consecutiveBlankLines++;
      
      // Split on double blank lines or when size exceeds max
      if (consecutiveBlankLines >= 2 || currentChunk.content!.length > opts.maxSize) {
        if (currentChunk.content!.trim().length >= opts.minSize) {
          currentChunk.endLine = lineNum - 1;
          chunks.push(currentChunk as CodeChunk);
        }
        currentChunk = {
          content: '',
          startLine: lineNum + 1,
          type: 'block',
        };
        consecutiveBlankLines = 0;
      } else {
        currentChunk.content += '\n' + line;
      }
    } else {
      consecutiveBlankLines = 0;
      currentChunk.content += (currentChunk.content ? '\n' : '') + line;
    }
  }
  
  // Add remaining content
  if (currentChunk.content!.trim().length >= opts.minSize) {
    currentChunk.endLine = lines.length;
    chunks.push(currentChunk as CodeChunk);
  }
  
  return chunks;
}

/**
 * Split a chunk that's too large into smaller pieces
 */
function splitLargeChunk(chunk: CodeChunk, opts: Required<ChunkOptions>): CodeChunk[] {
  const lines = chunk.content.split('\n');
  const chunks: CodeChunk[] = [];
  
  let currentContent = '';
  let startLine = chunk.startLine;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (currentContent.length + line.length > opts.maxSize && currentContent.length > 0) {
      // Add overlap from previous chunk
      const overlapLines = currentContent.split('\n').slice(-2).join('\n');
      
      chunks.push({
        content: currentContent,
        startLine,
        endLine: chunk.startLine + i - 1,
        type: chunk.type,
        name: chunk.name ? `${chunk.name} (part ${chunks.length + 1})` : undefined,
        parent: chunk.parent,
      });
      
      startLine = chunk.startLine + i;
      currentContent = overlapLines + '\n' + line;
    } else {
      currentContent += (currentContent ? '\n' : '') + line;
    }
  }
  
  if (currentContent.length >= opts.minSize) {
    chunks.push({
      content: currentContent,
      startLine,
      endLine: chunk.endLine,
      type: chunk.type,
      name: chunk.name ? `${chunk.name} (part ${chunks.length + 1})` : undefined,
      parent: chunk.parent,
    });
  }
  
  return chunks;
}
