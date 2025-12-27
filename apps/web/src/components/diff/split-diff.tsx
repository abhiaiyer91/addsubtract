import { useState, useCallback, useMemo } from 'react';
import { Plus, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CommentThread } from './comment-thread';
import { CommentForm } from './comment-form';
import type { DiffHunk, DiffLine } from './diff-viewer';
import type { InlineCommentData } from './inline-comment';

export interface SplitDiffProps {
  hunk: DiffHunk;
  filePath: string;
  commentsByLine: Record<string, { root: InlineCommentData; replies: InlineCommentData[] }>;
  currentUserId?: string;
  onAddComment?: (filePath: string, line: number, side: 'LEFT' | 'RIGHT', body: string) => void;
  onReplyComment?: (commentId: string, body: string) => void;
  onEditComment?: (commentId: string, body: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onResolveComment?: (commentId: string) => void;
  onUnresolveComment?: (commentId: string) => void;
  isAddingComment?: boolean;
  isEditingComment?: boolean;
  isDeletingComment?: boolean;
  isResolvingComment?: boolean;
}

interface SplitLine {
  left: DiffLine | null;
  right: DiffLine | null;
  leftLineNum: number | null;
  rightLineNum: number | null;
}

// Convert unified diff lines to split view format
function convertToSplitLines(lines: DiffLine[]): SplitLine[] {
  const result: SplitLine[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.type === 'context') {
      // Context lines appear on both sides
      result.push({
        left: line,
        right: line,
        leftLineNum: line.oldLineNumber || null,
        rightLineNum: line.newLineNumber || null,
      });
      i++;
    } else if (line.type === 'remove') {
      // Check if there's a corresponding add line
      const nextLine = lines[i + 1];
      if (nextLine?.type === 'add') {
        // Paired change
        result.push({
          left: line,
          right: nextLine,
          leftLineNum: line.oldLineNumber || null,
          rightLineNum: nextLine.newLineNumber || null,
        });
        i += 2;
      } else {
        // Only removal
        result.push({
          left: line,
          right: null,
          leftLineNum: line.oldLineNumber || null,
          rightLineNum: null,
        });
        i++;
      }
    } else if (line.type === 'add') {
      // Only addition (no preceding removal)
      result.push({
        left: null,
        right: line,
        leftLineNum: null,
        rightLineNum: line.newLineNumber || null,
      });
      i++;
    } else {
      i++;
    }
  }

  return result;
}

export function SplitDiff({
  hunk,
  filePath,
  commentsByLine,
  currentUserId,
  onAddComment,
  onReplyComment,
  onEditComment,
  onDeleteComment,
  onResolveComment,
  onUnresolveComment,
  isAddingComment,
  isEditingComment,
  isDeletingComment,
  isResolvingComment,
}: SplitDiffProps) {
  const [activeCommentLine, setActiveCommentLine] = useState<{
    line: number;
    side: 'LEFT' | 'RIGHT';
  } | null>(null);

  const splitLines = useMemo(() => convertToSplitLines(hunk.lines), [hunk.lines]);

  const handleAddCommentClick = useCallback(
    (line: number, side: 'LEFT' | 'RIGHT') => {
      setActiveCommentLine({ line, side });
    },
    []
  );

  const handleCommentSubmit = useCallback(
    (body: string) => {
      if (activeCommentLine && onAddComment) {
        onAddComment(filePath, activeCommentLine.line, activeCommentLine.side, body);
        setActiveCommentLine(null);
      }
    },
    [activeCommentLine, filePath, onAddComment]
  );

  const handleCommentCancel = useCallback(() => {
    setActiveCommentLine(null);
  }, []);

  const canComment = !!onAddComment;

  return (
    <>
      {/* Hunk header */}
      <tr className="bg-blue-500/10 text-blue-400">
        <td colSpan={4} className="px-4 py-1 text-xs">
          @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
        </td>
      </tr>

      {/* Split lines */}
      {splitLines.map((splitLine, idx) => {
        const leftCommentKey = splitLine.leftLineNum ? `LEFT-${splitLine.leftLineNum}` : null;
        const rightCommentKey = splitLine.rightLineNum ? `RIGHT-${splitLine.rightLineNum}` : null;
        const leftThread = leftCommentKey ? commentsByLine[leftCommentKey] : undefined;
        const rightThread = rightCommentKey ? commentsByLine[rightCommentKey] : undefined;

        const isLeftCommentFormOpen =
          activeCommentLine?.side === 'LEFT' &&
          activeCommentLine?.line === splitLine.leftLineNum;
        const isRightCommentFormOpen =
          activeCommentLine?.side === 'RIGHT' &&
          activeCommentLine?.line === splitLine.rightLineNum;

        return (
          <SplitLineRow
            key={idx}
            splitLine={splitLine}
            filePath={filePath}
            leftThread={leftThread}
            rightThread={rightThread}
            currentUserId={currentUserId}
            isLeftCommentFormOpen={isLeftCommentFormOpen}
            isRightCommentFormOpen={isRightCommentFormOpen}
            onAddCommentClick={handleAddCommentClick}
            onCommentSubmit={handleCommentSubmit}
            onCommentCancel={handleCommentCancel}
            onReplyComment={onReplyComment}
            onEditComment={onEditComment}
            onDeleteComment={onDeleteComment}
            onResolveComment={onResolveComment}
            onUnresolveComment={onUnresolveComment}
            isAddingComment={isAddingComment}
            isEditingComment={isEditingComment}
            isDeletingComment={isDeletingComment}
            isResolvingComment={isResolvingComment}
            canComment={canComment}
          />
        );
      })}
    </>
  );
}

interface SplitLineRowProps {
  splitLine: SplitLine;
  filePath: string;
  leftThread?: { root: InlineCommentData; replies: InlineCommentData[] };
  rightThread?: { root: InlineCommentData; replies: InlineCommentData[] };
  currentUserId?: string;
  isLeftCommentFormOpen: boolean;
  isRightCommentFormOpen: boolean;
  onAddCommentClick: (line: number, side: 'LEFT' | 'RIGHT') => void;
  onCommentSubmit: (body: string) => void;
  onCommentCancel: () => void;
  onReplyComment?: (commentId: string, body: string) => void;
  onEditComment?: (commentId: string, body: string) => void;
  onDeleteComment?: (commentId: string) => void;
  onResolveComment?: (commentId: string) => void;
  onUnresolveComment?: (commentId: string) => void;
  isAddingComment?: boolean;
  isEditingComment?: boolean;
  isDeletingComment?: boolean;
  isResolvingComment?: boolean;
  canComment: boolean;
}

function SplitLineRow({
  splitLine,
  filePath,
  leftThread,
  rightThread,
  currentUserId,
  isLeftCommentFormOpen,
  isRightCommentFormOpen,
  onAddCommentClick,
  onCommentSubmit,
  onCommentCancel,
  onReplyComment,
  onEditComment,
  onDeleteComment,
  onResolveComment,
  onUnresolveComment,
  isAddingComment,
  isEditingComment,
  isDeletingComment,
  isResolvingComment,
  canComment,
}: SplitLineRowProps) {
  const [isLeftHovered, setIsLeftHovered] = useState(false);
  const [isRightHovered, setIsRightHovered] = useState(false);

  const leftBg =
    splitLine.left?.type === 'remove'
      ? 'bg-red-500/10'
      : splitLine.left?.type === 'add'
      ? 'bg-green-500/10'
      : '';

  const rightBg =
    splitLine.right?.type === 'add'
      ? 'bg-green-500/10'
      : splitLine.right?.type === 'remove'
      ? 'bg-red-500/10'
      : '';

  return (
    <>
      <tr className="group">
        {/* Left side (OLD) */}
        <td
          className={cn(
            'w-8 px-1 py-0.5 text-center select-none border-r border-border',
            leftBg
          )}
          onMouseEnter={() => setIsLeftHovered(true)}
          onMouseLeave={() => setIsLeftHovered(false)}
        >
          {canComment && splitLine.leftLineNum && isLeftHovered && !isLeftCommentFormOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="w-5 h-5 flex items-center justify-center rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                  onClick={() => onAddCommentClick(splitLine.leftLineNum!, 'LEFT')}
                >
                  <Plus className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>Add comment</p>
              </TooltipContent>
            </Tooltip>
          )}
          {leftThread && !isLeftHovered && (
            <MessageSquare className="h-3 w-3 text-primary mx-auto" />
          )}
        </td>

        <td
          className={cn(
            'w-12 px-2 py-0.5 text-right text-muted-foreground select-none border-r border-border',
            leftBg
          )}
        >
          {splitLine.leftLineNum || ''}
        </td>

        <td
          className={cn('w-1/2 px-4 py-0.5 whitespace-pre border-r border-border', leftBg)}
          onMouseEnter={() => setIsLeftHovered(true)}
          onMouseLeave={() => setIsLeftHovered(false)}
        >
          {splitLine.left && (
            <>
              <span
                className={cn(
                  'mr-2 inline-block w-3',
                  splitLine.left.type === 'remove' && 'text-red-400'
                )}
              >
                {splitLine.left.type === 'remove' ? '-' : ' '}
              </span>
              {splitLine.left.content}
            </>
          )}
        </td>

        {/* Right side (NEW) */}
        <td
          className={cn('w-8 px-1 py-0.5 text-center select-none border-r border-border', rightBg)}
          onMouseEnter={() => setIsRightHovered(true)}
          onMouseLeave={() => setIsRightHovered(false)}
        >
          {canComment && splitLine.rightLineNum && isRightHovered && !isRightCommentFormOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="w-5 h-5 flex items-center justify-center rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                  onClick={() => onAddCommentClick(splitLine.rightLineNum!, 'RIGHT')}
                >
                  <Plus className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>Add comment</p>
              </TooltipContent>
            </Tooltip>
          )}
          {rightThread && !isRightHovered && (
            <MessageSquare className="h-3 w-3 text-primary mx-auto" />
          )}
        </td>

        <td
          className={cn(
            'w-12 px-2 py-0.5 text-right text-muted-foreground select-none border-r border-border',
            rightBg
          )}
        >
          {splitLine.rightLineNum || ''}
        </td>

        <td
          className={cn('w-1/2 px-4 py-0.5 whitespace-pre', rightBg)}
          onMouseEnter={() => setIsRightHovered(true)}
          onMouseLeave={() => setIsRightHovered(false)}
        >
          {splitLine.right && (
            <>
              <span
                className={cn(
                  'mr-2 inline-block w-3',
                  splitLine.right.type === 'add' && 'text-green-400'
                )}
              >
                {splitLine.right.type === 'add' ? '+' : ' '}
              </span>
              {splitLine.right.content}
            </>
          )}
        </td>
      </tr>

      {/* Left comment form/thread */}
      {(isLeftCommentFormOpen || leftThread) && (
        <tr>
          <td colSpan={3} className="p-3 bg-muted/20">
            {isLeftCommentFormOpen ? (
              <CommentForm
                onSubmit={onCommentSubmit}
                onCancel={onCommentCancel}
                placeholder={`Comment on line ${splitLine.leftLineNum} (old)...`}
                isLoading={isAddingComment}
                autoFocus
              />
            ) : leftThread ? (
              <CommentThread
                rootComment={leftThread.root}
                replies={leftThread.replies}
                currentUserId={currentUserId}
                onReply={onReplyComment}
                onEdit={onEditComment}
                onDelete={onDeleteComment}
                onResolve={onResolveComment}
                onUnresolve={onUnresolveComment}
                isReplying={isAddingComment}
                isEditing={isEditingComment}
                isDeleting={isDeletingComment}
                isResolving={isResolvingComment}
                filePath={filePath}
                lineRange={leftThread.root.line || undefined}
              />
            ) : null}
          </td>
          <td colSpan={3} className="bg-muted/20" />
        </tr>
      )}

      {/* Right comment form/thread */}
      {(isRightCommentFormOpen || rightThread) && !isLeftCommentFormOpen && !leftThread && (
        <tr>
          <td colSpan={3} className="bg-muted/20" />
          <td colSpan={3} className="p-3 bg-muted/20">
            {isRightCommentFormOpen ? (
              <CommentForm
                onSubmit={onCommentSubmit}
                onCancel={onCommentCancel}
                placeholder={`Comment on line ${splitLine.rightLineNum} (new)...`}
                isLoading={isAddingComment}
                autoFocus
              />
            ) : rightThread ? (
              <CommentThread
                rootComment={rightThread.root}
                replies={rightThread.replies}
                currentUserId={currentUserId}
                onReply={onReplyComment}
                onEdit={onEditComment}
                onDelete={onDeleteComment}
                onResolve={onResolveComment}
                onUnresolve={onUnresolveComment}
                isReplying={isAddingComment}
                isEditing={isEditingComment}
                isDeleting={isDeletingComment}
                isResolving={isResolvingComment}
                filePath={filePath}
                lineRange={rightThread.root.line || undefined}
              />
            ) : null}
          </td>
        </tr>
      )}
    </>
  );
}
