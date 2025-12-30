import { useState, useCallback, useRef, useEffect, KeyboardEvent } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { BlockItem } from './block-item';
import { SlashMenu } from './slash-menu';
import {
  Block,
  BlockType,
  createBlock,
  blocksToMarkdown,
  markdownToBlocks,
} from './types';

// Sortable wrapper for BlockItem
interface SortableBlockItemProps {
  block: Block;
  isSelected: boolean;
  isFocused: boolean;
  onUpdate: (updates: Partial<Block>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddBlockAfter: (type?: BlockType) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  onSlashCommand: (query: string, position: { top: number; left: number }) => void;
  onCloseSlashMenu: () => void;
  placeholder?: string;
}

function SortableBlockItem(props: SortableBlockItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <BlockItem
        {...props}
        isDragging={isDragging}
        dragHandleProps={listeners}
      />
    </div>
  );
}

interface BlockEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
}

export function BlockEditor({
  value,
  onChange,
  placeholder,
  className,
  readOnly = false,
  autoFocus = false,
}: BlockEditorProps) {
  // Parse initial value to blocks
  const [blocks, setBlocks] = useState<Block[]>(() =>
    markdownToBlocks(value)
  );
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(
    autoFocus ? blocks[0]?.id : null
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [slashMenu, setSlashMenu] = useState<{
    isOpen: boolean;
    query: string;
    position: { top: number; left: number };
    blockId: string;
  }>({
    isOpen: false,
    query: '',
    position: { top: 0, left: 0 },
    blockId: '',
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);
  // Use a ref to track the last value we processed to avoid sync loops
  const lastExternalValue = useRef<string>(value);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setBlocks((prev) => {
        const oldIndex = prev.findIndex((b) => b.id === active.id);
        const newIndex = prev.findIndex((b) => b.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  }, []);

  // Sync blocks to markdown on change
  useEffect(() => {
    // Skip on initial mount to avoid overwriting value
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const markdown = blocksToMarkdown(blocks);
    // Update the ref so we don't process our own changes
    lastExternalValue.current = markdown;
    onChange(markdown);
  }, [blocks, onChange]);

  // Update blocks when external value changes
  useEffect(() => {
    // Normalize both values by parsing and re-serializing to get canonical form
    // This avoids infinite loops from whitespace/formatting differences
    const canonicalValue = blocksToMarkdown(markdownToBlocks(value));
    const canonicalLast = blocksToMarkdown(markdownToBlocks(lastExternalValue.current));
    
    if (canonicalValue !== canonicalLast) {
      lastExternalValue.current = value;
      const newBlocks = markdownToBlocks(value);
      setBlocks(newBlocks);
    }
  }, [value]);

  // Compute list numbers - derived state, not stored
  // This creates a signature of numbered list positions to detect when we need to update
  const numberedListSignature = blocks
    .map((b, i) => (b.type === 'numberedList' ? i : -1))
    .filter((i) => i !== -1)
    .join(',');

  // Recalculate list numbers when numbered list structure changes
  useEffect(() => {
    setBlocks((prevBlocks) => {
      let hasChanges = false;
      let currentNumber = 1;
      const updatedBlocks = prevBlocks.map((block, index) => {
        if (block.type === 'numberedList') {
          // Check if previous block is also a numbered list
          const prevBlock = prevBlocks[index - 1];
          if (prevBlock?.type !== 'numberedList') {
            currentNumber = 1;
          }
          if (block.listNumber !== currentNumber) {
            hasChanges = true;
            return { ...block, listNumber: currentNumber++ };
          }
          currentNumber++;
        }
        return block;
      });

      // Only return new array if there were changes to avoid infinite loop
      return hasChanges ? updatedBlocks : prevBlocks;
    });
  }, [numberedListSignature]);

  // Find block index
  const findBlockIndex = useCallback(
    (blockId: string) => blocks.findIndex((b) => b.id === blockId),
    [blocks]
  );

  // Update a single block
  const updateBlock = useCallback((blockId: string, updates: Partial<Block>) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.id === blockId ? { ...block, ...updates } : block
      )
    );
  }, []);

  // Delete a block
  const deleteBlock = useCallback(
    (blockId: string) => {
      const index = findBlockIndex(blockId);
      if (index === -1) return;

      setBlocks((prev) => {
        const newBlocks = prev.filter((b) => b.id !== blockId);
        // Ensure there's always at least one block
        if (newBlocks.length === 0) {
          newBlocks.push(createBlock('paragraph', ''));
        }
        return newBlocks;
      });

      // Focus previous block or first block
      const newIndex = Math.max(0, index - 1);
      setTimeout(() => {
        setBlocks((currentBlocks) => {
          if (currentBlocks[newIndex]) {
            setFocusedBlockId(currentBlocks[newIndex].id);
          }
          return currentBlocks;
        });
      }, 0);
    },
    [findBlockIndex]
  );

  // Duplicate a block
  const duplicateBlock = useCallback(
    (blockId: string) => {
      const index = findBlockIndex(blockId);
      if (index === -1) return;

      const block = blocks[index];
      const newBlock = createBlock(block.type, block.content);
      // Copy other properties
      if (block.checked !== undefined) newBlock.checked = block.checked;
      if (block.icon) newBlock.icon = block.icon;
      if (block.color) newBlock.color = block.color;
      if (block.language) newBlock.language = block.language;

      setBlocks((prev) => {
        const newBlocks = [...prev];
        newBlocks.splice(index + 1, 0, newBlock);
        return newBlocks;
      });

      // Focus the new block
      setTimeout(() => setFocusedBlockId(newBlock.id), 0);
    },
    [blocks, findBlockIndex]
  );

  // Add a block after another
  const addBlockAfter = useCallback(
    (blockId: string, type: BlockType = 'paragraph') => {
      const index = findBlockIndex(blockId);
      if (index === -1) return;

      const newBlock = createBlock(type, '');
      setBlocks((prev) => {
        const newBlocks = [...prev];
        newBlocks.splice(index + 1, 0, newBlock);
        return newBlocks;
      });

      // Focus the new block
      setTimeout(() => setFocusedBlockId(newBlock.id), 0);
    },
    [findBlockIndex]
  );

  // Turn a block into another type
  const turnBlockInto = useCallback(
    (blockId: string, newType: BlockType) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block) return;

      const updates: Partial<Block> = { type: newType, content: '' };

      // Preserve content for compatible types
      if (newType !== 'divider' && newType !== 'image') {
        updates.content = block.content;
      }

      // Add type-specific defaults
      if (newType === 'todoList') updates.checked = false;
      if (newType === 'callout') {
        updates.icon = '💡';
        updates.color = 'default';
      }
      if (newType === 'code') updates.language = 'typescript';

      updateBlock(blockId, updates);
      setSlashMenu((prev) => ({ ...prev, isOpen: false }));
    },
    [blocks, updateBlock]
  );

  // Handle keyboard events for a block
  const handleBlockKeyDown = useCallback(
    (blockId: string, e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      const index = findBlockIndex(blockId);
      if (index === -1) return;

      const block = blocks[index];
      const target = e.target as HTMLTextAreaElement;
      const cursorPosition = target.selectionStart || 0;
      const content = block.content;

      // Close slash menu on Escape
      if (e.key === 'Escape' && slashMenu.isOpen) {
        e.preventDefault();
        setSlashMenu((prev) => ({ ...prev, isOpen: false }));
        // Clear the slash from content
        if (content.startsWith('/')) {
          updateBlock(blockId, { content: '' });
        }
        return;
      }

      // Handle Enter in slash menu
      if (e.key === 'Enter' && slashMenu.isOpen) {
        // Let slash menu handle it
        return;
      }

      // Handle Enter - create new block
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();

        // If on a list item with no content, convert to paragraph
        if (
          (block.type === 'bulletList' ||
            block.type === 'numberedList' ||
            block.type === 'todoList') &&
          content.trim() === ''
        ) {
          turnBlockInto(blockId, 'paragraph');
          return;
        }

        // Split content at cursor
        const beforeCursor = content.slice(0, cursorPosition);
        const afterCursor = content.slice(cursorPosition);

        // Update current block with content before cursor
        updateBlock(blockId, { content: beforeCursor });

        // Create new block with content after cursor (same type for lists)
        const newType =
          block.type === 'bulletList' ||
          block.type === 'numberedList' ||
          block.type === 'todoList'
            ? block.type
            : 'paragraph';

        const newBlock = createBlock(newType, afterCursor);
        if (newType === 'todoList') newBlock.checked = false;

        setBlocks((prev) => {
          const newBlocks = [...prev];
          newBlocks.splice(index + 1, 0, newBlock);
          return newBlocks;
        });

        // Focus new block
        setTimeout(() => setFocusedBlockId(newBlock.id), 0);
        return;
      }

      // Handle Backspace at start - merge with previous or delete
      if (e.key === 'Backspace' && cursorPosition === 0) {
        e.preventDefault();

        // If block is not a paragraph and empty, convert to paragraph
        if (block.type !== 'paragraph' && content === '') {
          turnBlockInto(blockId, 'paragraph');
          return;
        }

        // If first block or divider, just delete content
        if (index === 0 || block.type === 'divider') {
          if (content === '' && blocks.length > 1) {
            deleteBlock(blockId);
          }
          return;
        }

        // Merge with previous block
        const prevBlock = blocks[index - 1];
        if (
          prevBlock.type !== 'divider' &&
          prevBlock.type !== 'image'
        ) {
          const prevContent = prevBlock.content;
          updateBlock(prevBlock.id, {
            content: prevContent + content,
          });
          deleteBlock(blockId);

          // Set cursor position in merged block
          setTimeout(() => {
            setFocusedBlockId(prevBlock.id);
            // TODO: Set cursor position to end of original content
          }, 0);
        }
        return;
      }

      // Handle Arrow Up - move to previous block
      if (e.key === 'ArrowUp' && cursorPosition === 0) {
        e.preventDefault();
        if (index > 0) {
          setFocusedBlockId(blocks[index - 1].id);
        }
        return;
      }

      // Handle Arrow Down - move to next block
      if (e.key === 'ArrowDown') {
        const isLastLine =
          target.selectionEnd === content.length ||
          content.slice(target.selectionEnd).indexOf('\n') === -1;

        if (isLastLine && index < blocks.length - 1) {
          e.preventDefault();
          setFocusedBlockId(blocks[index + 1].id);
        }
        return;
      }

      // Handle Tab - indent (for lists, convert paragraph to list)
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        // For now, just insert spaces
        const beforeCursor = content.slice(0, cursorPosition);
        const afterCursor = content.slice(cursorPosition);
        updateBlock(blockId, { content: beforeCursor + '  ' + afterCursor });
        return;
      }

      // Markdown shortcuts at start of line
      if (cursorPosition === content.length && content.length > 0) {
        // Heading shortcuts
        if (content === '#') {
          e.preventDefault();
          turnBlockInto(blockId, 'heading1');
          updateBlock(blockId, { content: '' });
          return;
        }
        if (content === '##') {
          e.preventDefault();
          turnBlockInto(blockId, 'heading2');
          updateBlock(blockId, { content: '' });
          return;
        }
        if (content === '###') {
          e.preventDefault();
          turnBlockInto(blockId, 'heading3');
          updateBlock(blockId, { content: '' });
          return;
        }
        // Bullet list
        if (content === '-' || content === '*') {
          e.preventDefault();
          turnBlockInto(blockId, 'bulletList');
          updateBlock(blockId, { content: '' });
          return;
        }
        // Numbered list
        if (content === '1.') {
          e.preventDefault();
          turnBlockInto(blockId, 'numberedList');
          updateBlock(blockId, { content: '' });
          return;
        }
        // Todo
        if (content === '[]' || content === '[ ]') {
          e.preventDefault();
          turnBlockInto(blockId, 'todoList');
          updateBlock(blockId, { content: '' });
          return;
        }
        // Quote
        if (content === '>') {
          e.preventDefault();
          turnBlockInto(blockId, 'quote');
          updateBlock(blockId, { content: '' });
          return;
        }
        // Divider
        if (content === '---' || content === '***') {
          e.preventDefault();
          turnBlockInto(blockId, 'divider');
          updateBlock(blockId, { content: '' });
          // Add new paragraph after divider
          addBlockAfter(blockId);
          return;
        }
        // Code block
        if (content === '```') {
          e.preventDefault();
          turnBlockInto(blockId, 'code');
          updateBlock(blockId, { content: '' });
          return;
        }
      }
    },
    [
      blocks,
      findBlockIndex,
      slashMenu.isOpen,
      updateBlock,
      deleteBlock,
      turnBlockInto,
      addBlockAfter,
    ]
  );

  // Handle slash command selection
  const handleSlashSelect = useCallback(
    (blockType: BlockType) => {
      if (slashMenu.blockId) {
        turnBlockInto(slashMenu.blockId, blockType);
      }
    },
    [slashMenu.blockId, turnBlockInto]
  );

  // Handle click on empty area
  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      // Only if clicking on the container itself, not blocks
      if (e.target === containerRef.current) {
        // Focus the last block or create a new one
        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock && lastBlock.content === '') {
          setFocusedBlockId(lastBlock.id);
        } else {
          const newBlock = createBlock('paragraph', '');
          setBlocks((prev) => [...prev, newBlock]);
          setTimeout(() => setFocusedBlockId(newBlock.id), 0);
        }
      }
    },
    [blocks]
  );

  if (readOnly) {
    return (
      <div className={cn('prose dark:prose-invert max-w-none', className)}>
        {/* Render as read-only markdown */}
        {blocks.map((block) => (
          <div key={block.id} className="my-1">
            {/* Simplified read-only rendering */}
            {block.type === 'heading1' && (
              <h1 className="text-3xl font-bold">{block.content}</h1>
            )}
            {block.type === 'heading2' && (
              <h2 className="text-2xl font-semibold">{block.content}</h2>
            )}
            {block.type === 'heading3' && (
              <h3 className="text-xl font-medium">{block.content}</h3>
            )}
            {block.type === 'paragraph' && <p>{block.content}</p>}
            {block.type === 'bulletList' && (
              <div className="flex gap-2">
                <span>-</span>
                <span>{block.content}</span>
              </div>
            )}
            {block.type === 'quote' && (
              <blockquote className="border-l-4 pl-4 italic">
                {block.content}
              </blockquote>
            )}
            {block.type === 'divider' && <hr />}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn('min-h-[50vh] cursor-text', className)}
      onClick={handleContainerClick}
    >
      {/* Blocks */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={blocks.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-0.5">
            {blocks.map((block, index) => (
              <SortableBlockItem
                key={block.id}
                block={block}
                isSelected={selectedBlockId === block.id}
                isFocused={focusedBlockId === block.id}
                onUpdate={(updates) => updateBlock(block.id, updates)}
                onDelete={() => deleteBlock(block.id)}
                onDuplicate={() => duplicateBlock(block.id)}
                onAddBlockAfter={(type?: BlockType) => addBlockAfter(block.id, type)}
                onFocus={() => {
                  setFocusedBlockId(block.id);
                  setSelectedBlockId(block.id);
                }}
                onBlur={() => {
                  // Don't clear focus immediately - allow click handling
                }}
                onKeyDown={(e) => handleBlockKeyDown(block.id, e)}
                onSlashCommand={(query, position) =>
                  setSlashMenu({
                    isOpen: true,
                    query,
                    position,
                    blockId: block.id,
                  })
                }
                onCloseSlashMenu={() =>
                  setSlashMenu((prev) => ({ ...prev, isOpen: false }))
                }
                placeholder={index === 0 && blocks.length === 1 ? placeholder : undefined}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Slash command menu */}
      <SlashMenu
        isOpen={slashMenu.isOpen}
        query={slashMenu.query}
        position={slashMenu.position}
        onSelect={handleSlashSelect}
        onClose={() => setSlashMenu((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

// Re-export types and utilities
export type { Block, BlockType } from './types';
export { createBlock, blocksToMarkdown, markdownToBlocks } from './types';
