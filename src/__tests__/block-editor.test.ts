import { describe, it, expect } from 'vitest';

// Copy of BlockType and Block from apps/web/src/components/editor/block-editor/types.ts
type BlockType =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bulletList'
  | 'numberedList'
  | 'todoList'
  | 'quote'
  | 'callout'
  | 'code'
  | 'divider'
  | 'image'
  | 'toggle';

interface Block {
  id: string;
  type: BlockType;
  content: string;
  checked?: boolean;
  icon?: string;
  color?: 'default' | 'blue' | 'green' | 'yellow' | 'red' | 'purple';
  language?: string;
  children?: Block[];
  collapsed?: boolean;
  url?: string;
  caption?: string;
  listNumber?: number;
}

// Generate unique block ID
function generateBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Helper to create a new block
function createBlock(type: BlockType, content = ''): Block {
  return {
    id: generateBlockId(),
    type,
    content,
    ...(type === 'todoList' ? { checked: false } : {}),
    ...(type === 'callout' ? { icon: '💡', color: 'default' as const } : {}),
    ...(type === 'code' ? { language: 'typescript' } : {}),
    ...(type === 'toggle' ? { children: [], collapsed: false } : {}),
  };
}

// Convert blocks to markdown for storage
function blocksToMarkdown(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'paragraph':
          return block.content;
        case 'heading1':
          return `# ${block.content}`;
        case 'heading2':
          return `## ${block.content}`;
        case 'heading3':
          return `### ${block.content}`;
        case 'bulletList':
          return `- ${block.content}`;
        case 'numberedList':
          return `${block.listNumber || 1}. ${block.content}`;
        case 'todoList':
          return `- [${block.checked ? 'x' : ' '}] ${block.content}`;
        case 'quote':
          return `> ${block.content}`;
        case 'callout':
          return `> ${block.icon || '💡'} **Note:** ${block.content}`;
        case 'code':
          return `\`\`\`${block.language || ''}\n${block.content}\n\`\`\``;
        case 'divider':
          return '---';
        case 'image':
          return block.caption
            ? `![${block.caption}](${block.url})`
            : `![](${block.url})`;
        case 'toggle': {
          const childContent = block.children
            ? blocksToMarkdown(block.children)
            : '';
          return `<details>\n<summary>${block.content}</summary>\n\n${childContent}\n</details>`;
        }
        default:
          return block.content;
      }
    })
    .join('\n\n');
}

// Parse markdown to blocks
function markdownToBlocks(markdown: string): Block[] {
  if (!markdown || !markdown.trim()) {
    return [createBlock('paragraph', '')];
  }

  const lines = markdown.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines between blocks
    if (!trimmed) {
      i++;
      continue;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      blocks.push(createBlock('heading3', trimmed.slice(4)));
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push(createBlock('heading2', trimmed.slice(3)));
      i++;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      blocks.push(createBlock('heading1', trimmed.slice(2)));
      i++;
      continue;
    }

    // Todo items
    if (trimmed.match(/^- \[([ x])\] /)) {
      const checked = trimmed[3] === 'x';
      const content = trimmed.slice(6);
      const block = createBlock('todoList', content);
      block.checked = checked;
      blocks.push(block);
      i++;
      continue;
    }

    // Bullet list
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push(createBlock('bulletList', trimmed.slice(2)));
      i++;
      continue;
    }

    // Numbered list - determine list number based on previous block
    const numberedMatch = trimmed.match(/^(\d+)\. /);
    if (numberedMatch) {
      const block = createBlock('numberedList', trimmed.slice(numberedMatch[0].length));
      // Check if previous block is also a numbered list to continue numbering
      const prevBlock = blocks[blocks.length - 1];
      if (prevBlock?.type === 'numberedList' && prevBlock.listNumber) {
        block.listNumber = prevBlock.listNumber + 1;
      } else {
        block.listNumber = 1;
      }
      blocks.push(block);
      i++;
      continue;
    }

    // Quote
    if (trimmed.startsWith('> ')) {
      blocks.push(createBlock('quote', trimmed.slice(2)));
      i++;
      continue;
    }

    // Code block
    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3);
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      const block = createBlock('code', codeLines.join('\n'));
      block.language = language || 'text';
      blocks.push(block);
      i++; // Skip closing ```
      continue;
    }

    // Divider
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      blocks.push(createBlock('divider', ''));
      i++;
      continue;
    }

    // Image
    const imageMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imageMatch) {
      const block = createBlock('image', '');
      block.caption = imageMatch[1];
      block.url = imageMatch[2];
      blocks.push(block);
      i++;
      continue;
    }

    // Default to paragraph
    blocks.push(createBlock('paragraph', trimmed));
    i++;
  }

  // Ensure there's always at least one block
  if (blocks.length === 0) {
    blocks.push(createBlock('paragraph', ''));
  }

  return blocks;
}

describe('Block Editor - markdownToBlocks', () => {
  it('should parse empty string to empty paragraph', () => {
    const blocks = markdownToBlocks('');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('paragraph');
    expect(blocks[0].content).toBe('');
  });

  it('should parse simple paragraph', () => {
    const blocks = markdownToBlocks('Hello world');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('paragraph');
    expect(blocks[0].content).toBe('Hello world');
  });

  it('should parse headings', () => {
    const markdown = `# Heading 1

## Heading 2

### Heading 3`;
    const blocks = markdownToBlocks(markdown);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe('heading1');
    expect(blocks[0].content).toBe('Heading 1');
    expect(blocks[1].type).toBe('heading2');
    expect(blocks[1].content).toBe('Heading 2');
    expect(blocks[2].type).toBe('heading3');
    expect(blocks[2].content).toBe('Heading 3');
  });

  it('should parse bullet list', () => {
    const markdown = `- Item 1
- Item 2
- Item 3`;
    const blocks = markdownToBlocks(markdown);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe('bulletList');
    expect(blocks[0].content).toBe('Item 1');
  });

  it('should parse numbered list', () => {
    const markdown = `1. First
2. Second
3. Third`;
    const blocks = markdownToBlocks(markdown);
    expect(blocks).toHaveLength(3);
    expect(blocks[0].type).toBe('numberedList');
    expect(blocks[0].content).toBe('First');
    expect(blocks[0].listNumber).toBe(1);
  });

  it('should parse todo list', () => {
    const markdown = `- [ ] Unchecked
- [x] Checked`;
    const blocks = markdownToBlocks(markdown);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('todoList');
    expect(blocks[0].checked).toBe(false);
    expect(blocks[1].checked).toBe(true);
  });

  it('should parse code blocks', () => {
    const markdown = `\`\`\`typescript
const x = 1;
\`\`\``;
    const blocks = markdownToBlocks(markdown);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('code');
    expect(blocks[0].content).toBe('const x = 1;');
    expect(blocks[0].language).toBe('typescript');
  });

  it('should parse quote', () => {
    const markdown = `> This is a quote`;
    const blocks = markdownToBlocks(markdown);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('quote');
    expect(blocks[0].content).toBe('This is a quote');
  });

  it('should parse divider', () => {
    const markdown = `---`;
    const blocks = markdownToBlocks(markdown);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('divider');
  });

  it('should parse complex document', () => {
    const markdown = `# Welcome

This is a paragraph with some text.

## Features

- Feature 1
- Feature 2
- Feature 3

### Code Example

\`\`\`javascript
console.log('hello');
\`\`\`

> A nice quote

---

That's all folks!`;

    const blocks = markdownToBlocks(markdown);
    expect(blocks.length).toBeGreaterThan(5);
    expect(blocks[0].type).toBe('heading1');
    expect(blocks[0].content).toBe('Welcome');
  });
});

describe('Block Editor - blocksToMarkdown', () => {
  it('should convert empty paragraph to empty string', () => {
    const blocks = [createBlock('paragraph', '')];
    const markdown = blocksToMarkdown(blocks);
    expect(markdown).toBe('');
  });

  it('should convert paragraph', () => {
    const blocks = [createBlock('paragraph', 'Hello world')];
    const markdown = blocksToMarkdown(blocks);
    expect(markdown).toBe('Hello world');
  });

  it('should convert headings', () => {
    const blocks = [
      createBlock('heading1', 'H1'),
      createBlock('heading2', 'H2'),
      createBlock('heading3', 'H3'),
    ];
    const markdown = blocksToMarkdown(blocks);
    expect(markdown).toBe('# H1\n\n## H2\n\n### H3');
  });
});

describe('Block Editor - roundtrip', () => {
  it('should maintain content through parse/serialize cycle', () => {
    const original = `# Title

This is some content.

- Item 1
- Item 2

> A quote`;

    const blocks = markdownToBlocks(original);
    const result = blocksToMarkdown(blocks);
    
    // Parse both to compare structure (ignoring whitespace differences)
    const originalBlocks = markdownToBlocks(original);
    const resultBlocks = markdownToBlocks(result);
    
    expect(resultBlocks.length).toBe(originalBlocks.length);
    for (let i = 0; i < originalBlocks.length; i++) {
      expect(resultBlocks[i].type).toBe(originalBlocks[i].type);
      expect(resultBlocks[i].content).toBe(originalBlocks[i].content);
    }
  });

  it('should handle content with special characters', () => {
    const original = `This has special chars: <>&"'`;
    const blocks = markdownToBlocks(original);
    const result = blocksToMarkdown(blocks);
    const resultBlocks = markdownToBlocks(result);
    
    expect(resultBlocks[0].content).toBe(original);
  });

  it('should handle multi-line code blocks', () => {
    const original = `\`\`\`typescript
function test() {
  return 1;
}
\`\`\``;
    
    const blocks = markdownToBlocks(original);
    expect(blocks[0].type).toBe('code');
    expect(blocks[0].content).toContain('function test()');
    
    const result = blocksToMarkdown(blocks);
    expect(result).toContain('function test()');
  });

  it('should handle content that could cause infinite loops', () => {
    // Test various edge cases that might trigger infinite re-renders
    const testCases = [
      'Simple text',
      '# Heading\n\nParagraph',
      '- List item\n- Another item',
      '```\ncode\n```',
      '> Quote with > inside',
      'Text with\n\n\nmultiple\n\n\nnewlines',
      '1. Item\n2. Item\n3. Item',
      '- [ ] Todo\n- [x] Done',
    ];

    for (const testCase of testCases) {
      const blocks1 = markdownToBlocks(testCase);
      const md1 = blocksToMarkdown(blocks1);
      const blocks2 = markdownToBlocks(md1);
      const md2 = blocksToMarkdown(blocks2);
      
      // After 2 cycles, should stabilize
      expect(md2).toBe(md1);
    }
  });

  it('should produce canonical form quickly', () => {
    // This tests the specific condition in the BlockEditor useEffect
    // that compares canonicalValue !== canonicalLast
    const value = `# My Journal Entry

This is my first paragraph.

## Section 1

Some content here.

- Point 1
- Point 2
- Point 3`;

    const canonicalValue = blocksToMarkdown(markdownToBlocks(value));
    const canonicalLast = blocksToMarkdown(markdownToBlocks(canonicalValue));
    
    // These should be equal after one cycle
    expect(canonicalValue).toBe(canonicalLast);
  });
});

describe('Block Editor - potential crash cases', () => {
  it('should handle undefined/null gracefully', () => {
    expect(() => markdownToBlocks(undefined as any)).not.toThrow();
    expect(() => markdownToBlocks(null as any)).not.toThrow();
    expect(() => markdownToBlocks('')).not.toThrow();
  });

  it('should handle malformed markdown', () => {
    const malformed = [
      '``` unclosed code block',
      '# ',  // empty heading
      '- ',  // empty list item
      '> ',  // empty quote
      '![]()',  // empty image
      '![]',  // malformed image
    ];

    for (const md of malformed) {
      expect(() => markdownToBlocks(md)).not.toThrow();
    }
  });

  it('should handle very long content', () => {
    const longContent = 'x'.repeat(10000);
    expect(() => markdownToBlocks(longContent)).not.toThrow();
    
    const blocks = markdownToBlocks(longContent);
    expect(blocks[0].content).toBe(longContent);
  });

  it('should handle deeply nested content', () => {
    // Many consecutive items
    const manyItems = Array(100).fill('- Item').join('\n');
    expect(() => markdownToBlocks(manyItems)).not.toThrow();
    
    const blocks = markdownToBlocks(manyItems);
    expect(blocks.length).toBe(100);
  });
});
