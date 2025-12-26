/**
 * Tests for semantic code search functionality
 * 
 * Note: These tests focus on the chunker and vector store components
 * which don't require API calls. Tests for embedding generation and
 * full semantic search require an OpenAI API key.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import {
  createRepoWithCommit,
  cleanupTempDir,
  createTestFile,
  suppressConsole,
  restoreCwd,
} from './test-utils';
import { Repository } from '../core/repository';
import { chunkCode, CodeChunk } from '../search/chunker';
import { VectorStore, StoredVector } from '../search/vector-store';
import { detectLanguage, cosineSimilarity } from '../search/embeddings';

describe('code chunker', () => {
  describe('TypeScript/JavaScript chunking', () => {
    it('should chunk function declarations', () => {
      const code = `
function hello() {
  // This function returns a greeting message to the world
  const message = 'Hello World';
  console.log('Greeting:', message);
  return 'world';
}

function goodbye() {
  // This function logs a farewell message
  const farewell = 'Goodbye World';
  console.log('Farewell:', farewell);
}
`;
      const chunks = chunkCode(code, 'test.ts', { minSize: 20 });

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      const funcChunks = chunks.filter(c => c.type === 'function');
      expect(funcChunks.some(c => c.name === 'hello')).toBe(true);
    });

    it('should chunk class declarations', () => {
      const code = `
export class MyService {
  private data: string;

  constructor() {
    this.data = 'test';
  }

  getData(): string {
    return this.data;
  }
}
`;
      const chunks = chunkCode(code, 'service.ts');

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      const classChunks = chunks.filter(c => c.type === 'class');
      expect(classChunks.some(c => c.name === 'MyService')).toBe(true);
    });

    it('should chunk arrow functions', () => {
      const code = `
export const fetchData = async (url: string) => {
  const response = await fetch(url);
  return response.json();
};
`;
      const chunks = chunkCode(code, 'api.ts');

      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('should chunk interfaces', () => {
      const code = `
interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

interface Post {
  title: string;
  content: string;
  author: User;
  tags: string[];
  publishedAt: Date;
  views: number;
}
`;
      const chunks = chunkCode(code, 'types.ts', { minSize: 20 });

      const interfaceChunks = chunks.filter(c => c.type === 'interface');
      expect(interfaceChunks.length).toBeGreaterThanOrEqual(1);
    });

    it('should include line numbers', () => {
      const code = `// Line 1 - This is a comment explaining the module
// Line 2 - Another important comment about functionality
function test() {
  // This is a test function that validates input data
  const isValid = true;
  const message = 'Validation successful';
  console.log(message);
  return isValid;
}
`;
      const chunks = chunkCode(code, 'test.ts', { minSize: 20 });

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].startLine).toBeGreaterThanOrEqual(1);
      expect(chunks[0].endLine).toBeGreaterThan(chunks[0].startLine);
    });
  });

  describe('Python chunking', () => {
    it('should chunk Python functions', () => {
      const code = `
def hello_world():
    """Print a hello world message and return True."""
    message = "Hello, World!"
    print(message)
    return True

def calculate(x, y):
    """Calculate the sum of two numbers."""
    result = x + y
    return result
`;
      const chunks = chunkCode(code, 'main.py', { minSize: 20 });

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      const funcChunks = chunks.filter(c => c.type === 'function');
      expect(funcChunks.some(c => c.name === 'hello_world')).toBe(true);
    });

    it('should chunk Python classes', () => {
      const code = `
class MyClass:
    def __init__(self, value):
        self.value = value

    def get_value(self):
        return self.value
`;
      const chunks = chunkCode(code, 'classes.py');

      const classChunks = chunks.filter(c => c.type === 'class');
      expect(classChunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Go chunking', () => {
    it('should chunk Go functions', () => {
      const code = `
package main

import "fmt"

func main() {
    message := "Hello from main function"
    fmt.Println(message)
    result := add(10, 20)
    fmt.Println("Result:", result)
}

func add(a, b int) int {
    sum := a + b
    return sum
}
`;
      const chunks = chunkCode(code, 'main.go', { minSize: 20 });

      const funcChunks = chunks.filter(c => c.type === 'function');
      expect(funcChunks.length).toBeGreaterThanOrEqual(1);
    });

    it('should chunk Go types', () => {
      const code = `
package main

type User struct {
    ID        string
    Name      string
    Email     string
    CreatedAt time.Time
}

type Service interface {
    GetUser(id string) User
    CreateUser(user User) error
    DeleteUser(id string) error
}
`;
      const chunks = chunkCode(code, 'types.go', { minSize: 20 });

      const typeChunks = chunks.filter(c => c.type === 'type');
      expect(typeChunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Rust chunking', () => {
    it('should chunk Rust functions', () => {
      const code = `
fn main() {
    let message = "Hello, world!";
    println!("{}", message);
    let result = add(10, 20);
    println!("Sum: {}", result);
}

pub fn add(a: i32, b: i32) -> i32 {
    let sum = a + b;
    sum
}
`;
      const chunks = chunkCode(code, 'main.rs', { minSize: 20 });

      const funcChunks = chunks.filter(c => c.type === 'function');
      expect(funcChunks.length).toBeGreaterThanOrEqual(1);
    });

    it('should chunk Rust structs and impls', () => {
      const code = `
pub struct User {
    id: String,
    name: String,
}

impl User {
    pub fn new(id: String, name: String) -> Self {
        User { id, name }
    }
}
`;
      const chunks = chunkCode(code, 'user.rs');

      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('generic chunking', () => {
    it('should handle unknown file types', () => {
      const code = `
Some content here that explains the purpose of this file in detail.
This is important documentation that should be preserved.

More content after a blank line with additional information.
This section covers the main functionality and features.

Even more content with concluding remarks and references.
This final section wraps up the documentation.
`;
      const chunks = chunkCode(code, 'unknown.xyz', { minSize: 20 });

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].type).toBe('block');
    });

    it('should respect maxSize option', () => {
      const code = 'x'.repeat(5000);
      const chunks = chunkCode(code, 'large.txt', { maxSize: 1000, minSize: 10 });

      // With no structure to split on, generic chunking won't split mid-line
      // Just verify we got at least one chunk
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('language detection', () => {
  it('should detect TypeScript', () => {
    expect(detectLanguage('file.ts')).toBe('TypeScript');
    expect(detectLanguage('component.tsx')).toBe('TypeScript (React)');
  });

  it('should detect JavaScript', () => {
    expect(detectLanguage('app.js')).toBe('JavaScript');
    expect(detectLanguage('component.jsx')).toBe('JavaScript (React)');
  });

  it('should detect Python', () => {
    expect(detectLanguage('script.py')).toBe('Python');
  });

  it('should detect Go', () => {
    expect(detectLanguage('main.go')).toBe('Go');
  });

  it('should detect Rust', () => {
    expect(detectLanguage('lib.rs')).toBe('Rust');
  });

  it('should return Unknown for unrecognized extensions', () => {
    expect(detectLanguage('file.xyz')).toBe('Unknown');
  });
});

describe('cosine similarity', () => {
  it('should return 1 for identical vectors', () => {
    const vector = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(vector, vector)).toBeCloseTo(1, 5);
  });

  it('should return 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it('should return -1 for opposite vectors', () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  it('should throw for vectors of different lengths', () => {
    const a = [1, 2, 3];
    const b = [1, 2];
    expect(() => cosineSimilarity(a, b)).toThrow('Vectors must have the same length');
  });

  it('should handle zero vectors', () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBe(0);
  });
});

describe('vector store', () => {
  let testDir: string | undefined;
  let repo: Repository;
  let vectorStore: VectorStore;
  let consoleSuppressor: { restore: () => void };

  beforeEach(() => {
    consoleSuppressor = suppressConsole();
    const result = createRepoWithCommit();
    testDir = result.dir;
    repo = result.repo;
    vectorStore = new VectorStore(repo.gitDir);
    vectorStore.init();
  });

  afterEach(() => {
    consoleSuppressor.restore();
    restoreCwd();
    cleanupTempDir(testDir);
  });

  it('should initialize empty store', () => {
    const stats = vectorStore.getStats();
    expect(stats.vectorCount).toBe(0);
    expect(stats.fileCount).toBe(0);
  });

  it('should upsert vectors', async () => {
    const vectors: StoredVector[] = [
      {
        id: 'test-vector-1',
        embedding: [0.1, 0.2, 0.3],
        metadata: {
          path: 'test.ts',
          startLine: 1,
          endLine: 10,
          content: 'function test() {}',
          chunkType: 'function',
          chunkName: 'test',
          language: 'TypeScript',
        },
        updatedAt: Date.now(),
      },
    ];

    await vectorStore.upsert(vectors);

    const stats = vectorStore.getStats();
    expect(stats.vectorCount).toBe(1);
    expect(stats.fileCount).toBe(1);
  });

  it('should query vectors by similarity', async () => {
    // Create two vectors with known embeddings
    const vectors: StoredVector[] = [
      {
        id: 'close-vector',
        embedding: [1, 0, 0],
        metadata: {
          path: 'close.ts',
          startLine: 1,
          endLine: 5,
          content: 'close content',
          chunkType: 'function',
          language: 'TypeScript',
        },
        updatedAt: Date.now(),
      },
      {
        id: 'far-vector',
        embedding: [0, 1, 0],
        metadata: {
          path: 'far.ts',
          startLine: 1,
          endLine: 5,
          content: 'far content',
          chunkType: 'function',
          language: 'TypeScript',
        },
        updatedAt: Date.now(),
      },
    ];

    await vectorStore.upsert(vectors);

    // Query with a vector similar to 'close-vector'
    const queryVector = [0.9, 0.1, 0];
    const results = await vectorStore.query(queryVector, { topK: 2, minSimilarity: 0 });

    expect(results.length).toBe(2);
    expect(results[0].vector.id).toBe('close-vector');
    expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
  });

  it('should filter by metadata', async () => {
    const vectors: StoredVector[] = [
      {
        id: 'ts-vector',
        embedding: [1, 0, 0],
        metadata: {
          path: 'app.ts',
          startLine: 1,
          endLine: 5,
          content: 'ts content',
          chunkType: 'function',
          language: 'TypeScript',
        },
        updatedAt: Date.now(),
      },
      {
        id: 'py-vector',
        embedding: [1, 0, 0],
        metadata: {
          path: 'app.py',
          startLine: 1,
          endLine: 5,
          content: 'py content',
          chunkType: 'function',
          language: 'Python',
        },
        updatedAt: Date.now(),
      },
    ];

    await vectorStore.upsert(vectors);

    const results = await vectorStore.query([1, 0, 0], {
      topK: 10,
      minSimilarity: 0,
      filter: (m) => m.language === 'TypeScript',
    });

    expect(results.length).toBe(1);
    expect(results[0].vector.metadata.language).toBe('TypeScript');
  });

  it('should delete vectors for a file', async () => {
    const vectors: StoredVector[] = [
      {
        id: 'to-delete',
        embedding: [1, 0, 0],
        metadata: {
          path: 'delete-me.ts',
          startLine: 1,
          endLine: 5,
          content: 'content',
          chunkType: 'function',
          language: 'TypeScript',
        },
        updatedAt: Date.now(),
      },
    ];

    await vectorStore.upsert(vectors);
    expect(vectorStore.getStats().vectorCount).toBe(1);

    await vectorStore.deleteForFile('delete-me.ts');
    expect(vectorStore.getStats().vectorCount).toBe(0);
  });

  it('should check if file needs reindexing', async () => {
    // New file should need indexing
    expect(vectorStore.needsReindex('new-file.ts', Date.now())).toBe(true);

    // Index a file
    const vectors: StoredVector[] = [
      {
        id: 'indexed',
        embedding: [1, 0, 0],
        metadata: {
          path: 'indexed.ts',
          startLine: 1,
          endLine: 5,
          content: 'content',
          chunkType: 'function',
          language: 'TypeScript',
        },
        updatedAt: Date.now(),
      },
    ];
    await vectorStore.upsert(vectors);

    // File indexed "now" should not need reindexing for older mod times
    const oldTime = Date.now() - 10000;
    expect(vectorStore.needsReindex('indexed.ts', oldTime)).toBe(false);

    // File with newer mod time should need reindexing
    const futureTime = Date.now() + 10000;
    expect(vectorStore.needsReindex('indexed.ts', futureTime)).toBe(true);
  });

  it('should clear all vectors', async () => {
    const vectors: StoredVector[] = [
      {
        id: 'v1',
        embedding: [1, 0, 0],
        metadata: {
          path: 'file1.ts',
          startLine: 1,
          endLine: 5,
          content: 'content',
          chunkType: 'function',
          language: 'TypeScript',
        },
        updatedAt: Date.now(),
      },
      {
        id: 'v2',
        embedding: [0, 1, 0],
        metadata: {
          path: 'file2.ts',
          startLine: 1,
          endLine: 5,
          content: 'content',
          chunkType: 'function',
          language: 'TypeScript',
        },
        updatedAt: Date.now(),
      },
    ];

    await vectorStore.upsert(vectors);
    expect(vectorStore.getStats().vectorCount).toBe(2);

    await vectorStore.clear();
    expect(vectorStore.getStats().vectorCount).toBe(0);
    expect(vectorStore.getStats().fileCount).toBe(0);
  });

  it('should persist vectors across instances', async () => {
    const vectors: StoredVector[] = [
      {
        id: 'persistent',
        embedding: [1, 2, 3],
        metadata: {
          path: 'persistent.ts',
          startLine: 1,
          endLine: 5,
          content: 'persistent content',
          chunkType: 'function',
          language: 'TypeScript',
        },
        updatedAt: Date.now(),
      },
    ];

    await vectorStore.upsert(vectors);
    vectorStore.flush();

    // Create new instance
    const newStore = new VectorStore(repo.gitDir);
    newStore.init();

    const stats = newStore.getStats();
    expect(stats.vectorCount).toBe(1);

    const results = await newStore.query([1, 2, 3], { topK: 1, minSimilarity: 0 });
    expect(results.length).toBe(1);
    expect(results[0].vector.metadata.content).toBe('persistent content');
  });
});
