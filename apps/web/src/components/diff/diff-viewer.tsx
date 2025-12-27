import { useState, useMemo, useCallback, useEffect } from 'react';
import { ChevronDown, ChevronRight, File, Plus, MessageSquare, Columns, AlignJustify, Sparkles, Loader2, Lightbulb, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Markdown } from '@/components/markdown/renderer';
import { trpc } from '@/lib/trpc';
import { CommentThread } from './comment-thread';
import { CommentForm } from './comment-form';
import { SplitDiff } from './split-diff';
import type { InlineCommentData } from './inline-comment';

export type DiffViewMode = 'unified' | 'split';

// Local storage key for diff view preference
const DIFF_VIEW_PREFERENCE_KEY = 'wit-diff-view-mode';

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface DiffHunk {
  oldStart: number;
  newStart: number;
  oldLines: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  oldPath?: string;
  status: 'added' | 'deleted' | 'modified' | 'renamed';
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

export interface DiffViewerProps {
  files?: DiffFile[];
  diff?: string; // Raw diff string
  prId?: string; // PR ID for AI explanations
  /** Comments for inline display, keyed by file path */
  comments?: Record<string, InlineCommentData[]>;
  /** Current user ID for edit/delete permissions */
  currentUserId?: string;
  /** Default view mode */
  defaultViewMode?: DiffViewMode;
  /** Called when adding a new comment */
  onAddComment?: (filePath: string, line: number, side: 'LEFT' | 'RIGHT', body: string) => void;
  /** Called when replying to a comment */
  onReplyComment?: (commentId: string, body: string) => void;
  /** Called when editing a comment */
  onEditComment?: (commentId: string, body: string) => void;
  /** Called when deleting a comment */
  onDeleteComment?: (commentId: string) => void;
  /** Called when resolving a comment thread */
  onResolveComment?: (commentId: string) => void;
  /** Called when unresolving a comment thread */
  onUnresolveComment?: (commentId: string) => void;
  /** Loading states */
  isAddingComment?: boolean;
  isEditingComment?: boolean;
  isDeletingComment?: boolean;
  isResolvingComment?: boolean;
}

// Parse a raw unified diff string into DiffFile[]
function parseDiff(diffText: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = diffText.split('\n');
  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLineNum = 0;
  let newLineNum = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // New file diff header: diff --git a/path b/path
    if (line.startsWith('diff --git')) {
      if (currentFile) {
        if (currentHunk) currentFile.hunks.push(currentHunk);
        files.push(currentFile);
      }
      const match = line.match(/diff --git a\/(.*) b\/(.*)/);
      currentFile = {
        path: match ? match[2] : 'unknown',
        oldPath: match ? match[1] : undefined,
        status: 'modified',
        additions: 0,
        deletions: 0,
        hunks: [],
      };
      currentHunk = null;
      continue;
    }

    if (!currentFile) continue;

    // File status indicators
    if (line.startsWith('new file mode')) {
      currentFile.status = 'added';
    } else if (line.startsWith('deleted file mode')) {
      currentFile.status = 'deleted';
    } else if (line.startsWith('rename from')) {
      currentFile.status = 'renamed';
    }

    // Hunk header: @@ -oldStart,oldLines +newStart,newLines @@
    if (line.startsWith('@@')) {
      if (currentHunk) currentFile.hunks.push(currentHunk);
      const match = line.match(/@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
      if (match) {
        oldLineNum = parseInt(match[1], 10);
        newLineNum = parseInt(match[3], 10);
        currentHunk = {
          oldStart: oldLineNum,
          newStart: newLineNum,
          oldLines: parseInt(match[2] || '1', 10),
          newLines: parseInt(match[4] || '1', 10),
          lines: [],
        };
      }
      continue;
    }

    // Skip --- and +++ lines
    if (line.startsWith('---') || line.startsWith('+++')) continue;
    if (line.startsWith('index ')) continue;

    // Diff content lines
    if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ') || line === '')) {
      const type: DiffLine['type'] = line.startsWith('+') ? 'add' : line.startsWith('-') ? 'remove' : 'context';
      const content = line.slice(1);

      const diffLine: DiffLine = {
        type,
        content,
      };

      if (type === 'add') {
        diffLine.newLineNumber = newLineNum++;
        currentFile.additions++;
      } else if (type === 'remove') {
        diffLine.oldLineNumber = oldLineNum++;
        currentFile.deletions++;
      } else {
        diffLine.oldLineNumber = oldLineNum++;
        diffLine.newLineNumber = newLineNum++;
      }

      currentHunk.lines.push(diffLine);
    }
  }

  // Don't forget the last file
  if (currentFile) {
    if (currentHunk) currentFile.hunks.push(currentHunk);
    files.push(currentFile);
  }

  return files;
}

export function DiffViewer({
  files,
  diff,
  prId,
  comments = {},
  currentUserId,
  defaultViewMode,
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
}: DiffViewerProps) {
  // Initialize view mode from localStorage or default
  const [viewMode, setViewMode] = useState<DiffViewMode>(() => {
    if (defaultViewMode) return defaultViewMode;
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(DIFF_VIEW_PREFERENCE_KEY);
      if (saved === 'split' || saved === 'unified') return saved;
    }
    return 'unified';
  });

  // Save preference to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(DIFF_VIEW_PREFERENCE_KEY, viewMode);
    }
  }, [viewMode]);

  // Parse raw diff if provided
  const displayFiles = files || (diff ? parseDiff(diff) : []);

  // Check if AI is available
  const { data: aiStatus } = trpc.ai.status.useQuery();
  const aiAvailable = aiStatus?.available ?? false;

  if (displayFiles.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No changes to display
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with summary and view toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{displayFiles.length} file{displayFiles.length !== 1 ? 's' : ''} changed</span>
          <span className="text-green-500">
            +{displayFiles.reduce((acc, f) => acc + f.additions, 0)}
          </span>
          <span className="text-red-500">
            -{displayFiles.reduce((acc, f) => acc + f.deletions, 0)}
          </span>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === 'unified' ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => setViewMode('unified')}
                className="h-7 w-7"
              >
                <AlignJustify className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Unified view</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === 'split' ? 'secondary' : 'ghost'}
                size="icon-sm"
                onClick={() => setViewMode('split')}
                className="h-7 w-7"
              >
                <Columns className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Split view</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* File list */}
      {displayFiles.map((file) => (
        <DiffFileView
          key={file.path}
          viewMode={viewMode}
          file={file}
          prId={prId}
          aiAvailable={aiAvailable}
          comments={comments[file.path] || []}
          currentUserId={currentUserId}
          onAddComment={onAddComment}
          onReplyComment={onReplyComment}
          onEditComment={onEditComment}
          onDeleteComment={onDeleteComment}
          onResolveComment={onResolveComment}
          onUnresolveComment={onUnresolveComment}
          isAddingComment={isAddingComment}
          isEditingComment={isEditingComment}
          isDeletingComment={isDeletingComment}
          isResolvingComment={isResolvingComment}
        />
      ))}
    </div>
  );
}

interface DiffFileViewProps {
  file: DiffFile;
  prId?: string;
  aiAvailable?: boolean;
  comments: InlineCommentData[];
  currentUserId?: string;
  viewMode: DiffViewMode;
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

function DiffFileView({
  file,
  prId,
  aiAvailable,
  comments,
  currentUserId,
  viewMode,
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
}: DiffFileViewProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showExplanation, setShowExplanation] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);

  // AI explanation mutation
  const explainMutation = trpc.ai.explainFileDiff.useMutation({
    onSuccess: (data) => {
      setExplanation(data.explanation);
      setShowExplanation(true);
    },
  });

  const handleExplainClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (explanation) {
      // Toggle visibility if we already have an explanation
      setShowExplanation(!showExplanation);
    } else if (prId) {
      // Fetch new explanation
      explainMutation.mutate({ prId, filePath: file.path });
    }
  }, [explanation, showExplanation, prId, file.path, explainMutation]);

  // Group comments by line (only root comments, not replies)
  const commentsByLine = useMemo(() => {
    const grouped: Record<string, { root: InlineCommentData; replies: InlineCommentData[] }> = {};

    // First, find all root comments (no replyToId)
    const rootComments = comments.filter((c) => !c.replyToId && c.line !== null);
    const repliesMap = new Map<string, InlineCommentData[]>();

    // Group replies by their parent
    comments.forEach((c) => {
      if (c.replyToId) {
        const existing = repliesMap.get(c.replyToId) || [];
        existing.push(c);
        repliesMap.set(c.replyToId, existing);
      }
    });

    rootComments.forEach((root) => {
      const key = `${root.side || 'RIGHT'}-${root.line}`;
      grouped[key] = {
        root,
        replies: repliesMap.get(root.id) || [],
      };
    });

    return grouped;
  }, [comments]);

  const commentCount = Object.keys(commentsByLine).length;

  const statusColors = {
    added: 'text-green-500 bg-green-500/10',
    deleted: 'text-red-500 bg-red-500/10',
    modified: 'text-yellow-500 bg-yellow-500/10',
    renamed: 'text-blue-500 bg-blue-500/10',
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* File header */}
      <div
        className="flex items-center gap-3 px-4 py-2 bg-muted/50 border-b cursor-pointer hover:bg-muted/70"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Button variant="ghost" size="icon" className="h-6 w-6 p-0">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
        <File className="h-4 w-4 text-muted-foreground" />
        <span className="font-mono text-sm flex-1">
          {file.oldPath && file.oldPath !== file.path ? (
            <>
              <span className="text-muted-foreground">{file.oldPath}</span>
              <span className="mx-2">-&gt;</span>
              <span>{file.path}</span>
            </>
          ) : (
            file.path
          )}
        </span>

        {commentCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            {commentCount}
          </span>
        )}
        
        {/* AI Explain button */}
        {aiAvailable && prId && (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 px-2 gap-1 text-xs",
              showExplanation && explanation && "bg-primary/10 text-primary"
            )}
            onClick={handleExplainClick}
            disabled={explainMutation.isPending}
          >
            {explainMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {explanation ? (showExplanation ? 'Hide' : 'Show') : 'Explain'}
          </Button>
        )}

        <Badge variant="outline" className={cn('text-xs', statusColors[file.status])}>
          {file.status}
        </Badge>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-green-500">+{file.additions}</span>
          <span className="text-red-500">-{file.deletions}</span>
        </div>
      </div>

      {/* AI Explanation panel */}
      {showExplanation && explanation && (
        <div className="border-b bg-primary/5">
          <div className="flex items-start gap-3 p-4">
            <Lightbulb className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-primary">AI Explanation</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowExplanation(false);
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <Markdown content={explanation} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {explainMutation.isError && (
        <div className="border-b bg-destructive/5 px-4 py-2">
          <p className="text-sm text-destructive">
            Failed to generate explanation. Please try again.
          </p>
        </div>
      )}

      {/* File content */}
      {isExpanded && (
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-sm">
            <tbody>
              {file.hunks.map((hunk, hunkIndex) => (
                viewMode === 'split' ? (
                  <SplitDiff
                    key={hunkIndex}
                    hunk={hunk}
                    filePath={file.path}
                    commentsByLine={commentsByLine}
                    currentUserId={currentUserId}
                    onAddComment={onAddComment}
                    onReplyComment={onReplyComment}
                    onEditComment={onEditComment}
                    onDeleteComment={onDeleteComment}
                    onResolveComment={onResolveComment}
                    onUnresolveComment={onUnresolveComment}
                    isAddingComment={isAddingComment}
                    isEditingComment={isEditingComment}
                    isDeletingComment={isDeletingComment}
                    isResolvingComment={isResolvingComment}
                  />
                ) : (
                  <HunkView
                    key={hunkIndex}
                    hunk={hunk}
                    filePath={file.path}
                    commentsByLine={commentsByLine}
                    currentUserId={currentUserId}
                    onAddComment={onAddComment}
                    onReplyComment={onReplyComment}
                    onEditComment={onEditComment}
                    onDeleteComment={onDeleteComment}
                    onResolveComment={onResolveComment}
                    onUnresolveComment={onUnresolveComment}
                    isAddingComment={isAddingComment}
                    isEditingComment={isEditingComment}
                    isDeletingComment={isDeletingComment}
                    isResolvingComment={isResolvingComment}
                  />
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface HunkViewProps {
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

function HunkView({
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
}: HunkViewProps) {
  // Track which line has an active comment form
  const [activeCommentLine, setActiveCommentLine] = useState<{
    line: number;
    side: 'LEFT' | 'RIGHT';
  } | null>(null);

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

  return (
    <>
      {/* Hunk header */}
      <tr className="bg-blue-500/10 text-blue-400">
        <td colSpan={4} className="px-4 py-1 text-xs">
          @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
        </td>
      </tr>

      {/* Lines */}
      {hunk.lines.map((line, lineIndex) => {
        const lineNum = line.type === 'remove' ? line.oldLineNumber : line.newLineNumber;
        const side: 'LEFT' | 'RIGHT' = line.type === 'remove' ? 'LEFT' : 'RIGHT';
        const commentKey = `${side}-${lineNum}`;
        const threadData = commentsByLine[commentKey];
        const isCommentFormOpen =
          activeCommentLine?.line === lineNum && activeCommentLine?.side === side;

        return (
          <DiffLineRow
            key={lineIndex}
            line={line}
            lineIndex={lineIndex}
            filePath={filePath}
            threadData={threadData}
            currentUserId={currentUserId}
            isCommentFormOpen={isCommentFormOpen}
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
            canComment={!!onAddComment}
          />
        );
      })}
    </>
  );
}

interface DiffLineRowProps {
  line: DiffLine;
  lineIndex: number;
  filePath: string;
  threadData?: { root: InlineCommentData; replies: InlineCommentData[] };
  currentUserId?: string;
  isCommentFormOpen: boolean;
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

function DiffLineRow({
  line,
  lineIndex,
  filePath,
  threadData,
  currentUserId,
  isCommentFormOpen,
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
}: DiffLineRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const lineNum = line.type === 'remove' ? line.oldLineNumber : line.newLineNumber;
  const side: 'LEFT' | 'RIGHT' = line.type === 'remove' ? 'LEFT' : 'RIGHT';

  return (
    <>
      <tr
        key={lineIndex}
        className={cn(
          'group hover:bg-muted/30',
          line.type === 'add' && 'bg-green-500/10',
          line.type === 'remove' && 'bg-red-500/10'
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Comment trigger button */}
        <td className="w-8 px-1 py-0.5 text-center select-none border-r border-border bg-inherit">
          {canComment && lineNum && isHovered && !isCommentFormOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="w-5 h-5 flex items-center justify-center rounded bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                  onClick={() => onAddCommentClick(lineNum, side)}
                >
                  <Plus className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>Add comment on line {lineNum}</p>
              </TooltipContent>
            </Tooltip>
          )}
          {threadData && !isHovered && (
            <MessageSquare className="h-3 w-3 text-primary mx-auto" />
          )}
        </td>

        {/* Old line number */}
        <td className="w-12 px-2 py-0.5 text-right text-muted-foreground select-none border-r border-border sticky left-0 bg-inherit">
          {line.oldLineNumber || ''}
        </td>

        {/* New line number */}
        <td className="w-12 px-2 py-0.5 text-right text-muted-foreground select-none border-r border-border sticky left-12 bg-inherit">
          {line.newLineNumber || ''}
        </td>

        {/* Content */}
        <td className="px-4 py-0.5 whitespace-pre">
          <span
            className={cn(
              'mr-2 inline-block w-3',
              line.type === 'add' && 'text-green-400',
              line.type === 'remove' && 'text-red-400'
            )}
          >
            {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
          </span>
          {line.content}
        </td>
      </tr>

      {/* Inline comment form */}
      {isCommentFormOpen && (
        <tr>
          <td colSpan={4} className="p-3 bg-muted/30">
            <CommentForm
              onSubmit={onCommentSubmit}
              onCancel={onCommentCancel}
              placeholder={`Comment on line ${lineNum}...`}
              isLoading={isAddingComment}
              autoFocus
            />
          </td>
        </tr>
      )}

      {/* Existing comment thread */}
      {threadData && !isCommentFormOpen && (
        <tr>
          <td colSpan={4} className="p-3 bg-muted/20">
            <CommentThread
              rootComment={threadData.root}
              replies={threadData.replies}
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
              lineRange={threadData.root.line || undefined}
            />
          </td>
        </tr>
      )}
    </>
  );
}
