import React, { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight, File, MessageSquare, Columns, AlignJustify, Sparkles, Loader2, Lightbulb, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Markdown } from '@/components/markdown/renderer';
import { trpc } from '@/lib/trpc';
import {
  InlineComment,
  InlineCommentThread,
  AddCommentForm,
} from './inline-comment';

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
  comments?: InlineComment[];
  onAddComment?: (path: string, line: number, side: 'LEFT' | 'RIGHT', body: string) => Promise<void>;
  onReplyToComment?: (commentId: string, body: string) => Promise<void>;
  viewMode?: 'unified' | 'split';
  onViewModeChange?: (mode: 'unified' | 'split') => void;
  viewedFiles?: Set<string>;
  onToggleViewed?: (path: string) => void;
  showViewedToggle?: boolean;
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
  comments = [],
  onAddComment,
  onReplyToComment,
  viewMode = 'unified',
  onViewModeChange,
  viewedFiles = new Set(),
  onToggleViewed,
  showViewedToggle = false,
}: DiffViewerProps) {
  // Parse raw diff if provided
  const displayFiles = files || (diff ? parseDiff(diff) : []);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(
    new Set(displayFiles.map((f) => f.path))
  );

  // Check if AI is available
  const { data: aiStatus } = trpc.ai.status.useQuery();
  const aiAvailable = aiStatus?.available ?? false;

  // Group comments by file path
  const commentsByFile = useMemo(() => {
    const grouped: Record<string, InlineComment[]> = {};
    for (const comment of comments) {
      if (!grouped[comment.path]) {
        grouped[comment.path] = [];
      }
      grouped[comment.path].push(comment);
    }
    return grouped;
  }, [comments]);

  const toggleFile = (path: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFiles(newExpanded);
  };

  if (displayFiles.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No changes to display
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with controls */}
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

        {onViewModeChange && (
          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
            <Button
              variant={viewMode === 'unified' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 gap-1"
              onClick={() => onViewModeChange('unified')}
            >
              <AlignJustify className="h-3 w-3" />
              <span className="text-xs">Unified</span>
            </Button>
            <Button
              variant={viewMode === 'split' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-7 px-2 gap-1"
              onClick={() => onViewModeChange('split')}
            >
              <Columns className="h-3 w-3" />
              <span className="text-xs">Split</span>
            </Button>
          </div>
        )}
      </div>

      {/* File list */}
      {displayFiles.map((file) => (
        <DiffFileView
          key={file.path}
          file={file}
          prId={prId}
          aiAvailable={aiAvailable}
          isExpanded={expandedFiles.has(file.path)}
          onToggle={() => toggleFile(file.path)}
          comments={commentsByFile[file.path] || []}
          onAddComment={onAddComment}
          onReplyToComment={onReplyToComment}
          isViewed={viewedFiles.has(file.path)}
          onToggleViewed={onToggleViewed}
          showViewedToggle={showViewedToggle}
          viewMode={viewMode}
        />
      ))}
    </div>
  );
}

interface DiffFileViewProps {
  file: DiffFile;
  prId?: string;
  aiAvailable?: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  comments: InlineComment[];
  onAddComment?: (path: string, line: number, side: 'LEFT' | 'RIGHT', body: string) => Promise<void>;
  onReplyToComment?: (commentId: string, body: string) => Promise<void>;
  isViewed?: boolean;
  onToggleViewed?: (path: string) => void;
  showViewedToggle?: boolean;
  viewMode: 'unified' | 'split';
}

function DiffFileView({
  file,
  prId,
  aiAvailable,
  isExpanded,
  onToggle,
  comments,
  onAddComment,
  onReplyToComment,
  isViewed = false,
  onToggleViewed,
  showViewedToggle = false,
  viewMode,
}: DiffFileViewProps) {
  const [addingCommentAt, setAddingCommentAt] = useState<{
    line: number;
    side: 'LEFT' | 'RIGHT';
  } | null>(null);
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

  const statusColors = {
    added: 'text-green-500 bg-green-500/10',
    deleted: 'text-red-500 bg-red-500/10',
    modified: 'text-yellow-500 bg-yellow-500/10',
    renamed: 'text-blue-500 bg-blue-500/10',
  };

  // Group comments by line
  const commentsByLine = useMemo(() => {
    const grouped: Record<string, InlineComment[]> = {};
    for (const comment of comments) {
      const key = `${comment.line}-${comment.side}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(comment);
    }
    return grouped;
  }, [comments]);

  const handleAddComment = async (body: string) => {
    if (!addingCommentAt || !onAddComment) return;
    await onAddComment(file.path, addingCommentAt.line, addingCommentAt.side, body);
    setAddingCommentAt(null);
  };

  const commentCount = comments.length;

  return (
    <div className={cn('border rounded-lg overflow-hidden', isViewed && 'opacity-60')}>
      {/* File header */}
      <div
        className="flex items-center gap-3 px-4 py-2 bg-muted/50 border-b cursor-pointer hover:bg-muted/70"
        onClick={onToggle}
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
              <span className="mx-2">→</span>
              <span>{file.path}</span>
            </>
          ) : (
            file.path
          )}
        </span>

        {/* Comment indicator */}
        {commentCount > 0 && (
          <Badge variant="outline" className="gap-1">
            <MessageSquare className="h-3 w-3" />
            {commentCount}
          </Badge>
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

        {/* Viewed toggle */}
        {showViewedToggle && onToggleViewed && (
          <div
            className="flex items-center gap-1.5"
            onClick={(e) => {
              e.stopPropagation();
              onToggleViewed(file.path);
            }}
          >
            <Checkbox
              checked={isViewed}
              className="h-4 w-4"
            />
            <span className="text-xs text-muted-foreground">Viewed</span>
          </div>
        )}
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
                <HunkView
                  key={hunkIndex}
                  hunk={hunk}
                  commentsByLine={commentsByLine}
                  addingCommentAt={addingCommentAt}
                  onStartAddComment={(line, side) => setAddingCommentAt({ line, side })}
                  onCancelAddComment={() => setAddingCommentAt(null)}
                  onAddComment={handleAddComment}
                  onReplyToComment={onReplyToComment}
                  canComment={!!onAddComment}
                  viewMode={viewMode}
                />
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
  commentsByLine: Record<string, InlineComment[]>;
  addingCommentAt: { line: number; side: 'LEFT' | 'RIGHT' } | null;
  onStartAddComment: (line: number, side: 'LEFT' | 'RIGHT') => void;
  onCancelAddComment: () => void;
  onAddComment: (body: string) => Promise<void>;
  onReplyToComment?: (commentId: string, body: string) => Promise<void>;
  canComment: boolean;
  viewMode: 'unified' | 'split';
}

function HunkView({
  hunk,
  commentsByLine,
  addingCommentAt,
  onStartAddComment,
  onCancelAddComment,
  onAddComment,
  onReplyToComment,
  canComment,
  viewMode,
}: HunkViewProps) {
  return (
    <>
      {/* Hunk header */}
      <tr className="bg-blue-500/10 text-blue-400">
        <td colSpan={viewMode === 'split' ? 4 : 3} className="px-4 py-1 text-xs">
          @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
        </td>
      </tr>

      {/* Lines */}
      {hunk.lines.map((line, lineIndex) => {
        const lineNumber = line.type === 'remove' ? line.oldLineNumber : line.newLineNumber;
        const side = line.type === 'remove' ? 'LEFT' : 'RIGHT';
        const commentKey = `${lineNumber}-${side}`;
        const lineComments = commentsByLine[commentKey] || [];
        const isAddingHere =
          addingCommentAt?.line === lineNumber && addingCommentAt?.side === side;

        return (
          <React.Fragment key={lineIndex}>
            <tr
              className={cn(
                'hover:bg-muted/30 group relative',
                line.type === 'add' && 'bg-green-500/10',
                line.type === 'remove' && 'bg-red-500/10'
              )}
            >
              {/* Old line number */}
              <td className="w-12 px-2 py-0.5 text-right text-muted-foreground select-none border-r border-border sticky left-0 bg-inherit">
                {line.oldLineNumber || ''}
              </td>

              {/* New line number */}
              <td className="w-12 px-2 py-0.5 text-right text-muted-foreground select-none border-r border-border sticky left-12 bg-inherit">
                {line.newLineNumber || ''}
              </td>

              {/* Content */}
              <td className="px-4 py-0.5 whitespace-pre relative">
                {/* Add comment button */}
                {canComment && !isAddingHere && (
                  <button
                    onClick={() => onStartAddComment(lineNumber!, side)}
                    className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 flex items-center justify-center bg-primary text-primary-foreground rounded-full opacity-0 group-hover:opacity-100 hover:scale-110 transition-all duration-150 shadow-sm z-10"
                    title="Add comment"
                  >
                    <MessageSquare className="h-3 w-3" />
                  </button>
                )}
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

            {/* Inline comments */}
            {lineComments.length > 0 && (
              <tr>
                <td colSpan={3} className="p-0">
                  <InlineCommentThread
                    comments={lineComments}
                    onAddReply={
                      onReplyToComment
                        ? (body) => onReplyToComment(lineComments[0].id, body)
                        : undefined
                    }
                  />
                </td>
              </tr>
            )}

            {/* Add comment form */}
            {isAddingHere && (
              <tr>
                <td colSpan={3} className="p-0">
                  <AddCommentForm
                    onSubmit={onAddComment}
                    onCancel={onCancelAddComment}
                    side={side}
                    line={lineNumber!}
                  />
                </td>
              </tr>
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}
