// Block types for the Notion-like editor

export type BlockType =
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

export interface Block {
  id: string;
  type: BlockType;
  content: string;
  // For todo items
  checked?: boolean;
  // For callout blocks
  icon?: string;
  color?: 'default' | 'blue' | 'green' | 'yellow' | 'red' | 'purple';
  // For code blocks
  language?: string;
  // For toggle blocks
  children?: Block[];
  collapsed?: boolean;
  // For images
  url?: string;
  caption?: string;
  // For numbered lists - track the number
  listNumber?: number;
}

export interface BlockEditorValue {
  blocks: Block[];
  version: number;
}

// Command menu item
export interface SlashCommand {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  blockType: BlockType;
  keywords: string[];
  shortcut?: string;
}

// Block operations
export type BlockOperation =
  | { type: 'add'; block: Block; afterId?: string }
  | { type: 'update'; blockId: string; updates: Partial<Block> }
  | { type: 'delete'; blockId: string }
  | { type: 'move'; blockId: string; targetId: string; position: 'before' | 'after' }
  | { type: 'indent'; blockId: string }
  | { type: 'outdent'; blockId: string };

// Helper to create a new block
export function createBlock(type: BlockType, content = ''): Block {
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

// Generate unique block ID
export function generateBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Convert blocks to markdown for storage
export function blocksToMarkdown(blocks: Block[]): string {
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
        case 'toggle':
          const childContent = block.children
            ? blocksToMarkdown(block.children)
            : '';
          return `<details>\n<summary>${block.content}</summary>\n\n${childContent}\n</details>`;
        default:
          return block.content;
      }
    })
    .join('\n\n');
}

// Parse markdown to blocks
export function markdownToBlocks(markdown: string): Block[] {
  if (!markdown || !markdown.trim()) {
    return [createBlock('paragraph', '')];
  }

  const lines = markdown.split('\n');
  const blocks: Block[] = [];
  let i = 0;
  let listNumber = 1;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip empty lines between blocks
    if (!trimmed) {
      i++;
      listNumber = 1; // Reset list number on empty line
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

    // Numbered list
    const numberedMatch = trimmed.match(/^(\d+)\. /);
    if (numberedMatch) {
      const block = createBlock('numberedList', trimmed.slice(numberedMatch[0].length));
      block.listNumber = listNumber++;
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
    listNumber = 1; // Reset list number
  }

  // Ensure there's always at least one block
  if (blocks.length === 0) {
    blocks.push(createBlock('paragraph', ''));
  }

  return blocks;
}
