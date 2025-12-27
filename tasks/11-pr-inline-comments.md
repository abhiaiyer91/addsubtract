# Task: PR Inline Code Comments

## Objective
Enable line-by-line code comments on pull request diffs, allowing reviewers to leave feedback on specific lines of code.

## Context

### Current State
- PR page shows diff view (`apps/web/src/routes/repo/pull-request.tsx`)
- General PR comments exist
- No ability to comment on specific lines
- Review workflow incomplete without inline feedback

### Desired State
- Click on any line in diff to add comment
- Comment threads on specific lines
- Resolve/unresolve comment threads
- Outdated comments marked when code changes
- Suggestions with "Apply" button

## Technical Requirements

### 1. Database Schema (`src/db/schema.ts`)

```typescript
export const prReviewComments = pgTable('pr_review_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  pullRequestId: uuid('pull_request_id').notNull().references(() => pullRequests.id, { onDelete: 'cascade' }),
  reviewId: uuid('review_id').references(() => prReviews.id, { onDelete: 'set null' }),
  authorId: uuid('author_id').notNull().references(() => users.id),
  
  // Position info
  path: text('path').notNull(), // File path
  commitSha: text('commit_sha').notNull(), // Commit this comment was made on
  originalLine: integer('original_line'), // Line in base (for deletions)
  line: integer('line'), // Line in head (for additions)
  side: text('side').notNull().default('RIGHT'), // 'LEFT' (base) or 'RIGHT' (head)
  
  // Content
  body: text('body').notNull(),
  
  // Thread management
  inReplyToId: uuid('in_reply_to_id').references(() => prReviewComments.id),
  isResolved: boolean('is_resolved').default(false),
  resolvedById: uuid('resolved_by_id').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  
  // Suggestion
  suggestion: text('suggestion'), // Suggested code replacement
  suggestionApplied: boolean('suggestion_applied').default(false),
  
  // Outdated tracking
  isOutdated: boolean('is_outdated').default(false),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Index for fetching comments by PR and path
// CREATE INDEX idx_pr_review_comments_pr_path ON pr_review_comments(pull_request_id, path);
```

### 2. Review Comments Model (`src/db/models/pr-review-comments.ts`)

```typescript
import { db } from '../db';
import { prReviewComments } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export interface CreateReviewCommentInput {
  pullRequestId: string;
  reviewId?: string;
  authorId: string;
  path: string;
  commitSha: string;
  line?: number;
  originalLine?: number;
  side: 'LEFT' | 'RIGHT';
  body: string;
  inReplyToId?: string;
  suggestion?: string;
}

class PRReviewCommentsModel {
  async create(input: CreateReviewCommentInput) {
    const [comment] = await db.insert(prReviewComments).values(input).returning();
    return comment;
  }

  async findByPullRequest(pullRequestId: string) {
    return db
      .select()
      .from(prReviewComments)
      .where(eq(prReviewComments.pullRequestId, pullRequestId))
      .orderBy(prReviewComments.createdAt);
  }

  async findByPath(pullRequestId: string, path: string) {
    return db
      .select()
      .from(prReviewComments)
      .where(and(
        eq(prReviewComments.pullRequestId, pullRequestId),
        eq(prReviewComments.path, path)
      ))
      .orderBy(prReviewComments.line);
  }

  async resolve(commentId: string, userId: string) {
    return db.update(prReviewComments)
      .set({
        isResolved: true,
        resolvedById: userId,
        resolvedAt: new Date(),
      })
      .where(eq(prReviewComments.id, commentId))
      .returning();
  }

  async unresolve(commentId: string) {
    return db.update(prReviewComments)
      .set({
        isResolved: false,
        resolvedById: null,
        resolvedAt: null,
      })
      .where(eq(prReviewComments.id, commentId))
      .returning();
  }

  async markOutdated(pullRequestId: string, paths: string[]) {
    // Mark comments as outdated when the file changes
    return db.update(prReviewComments)
      .set({ isOutdated: true })
      .where(and(
        eq(prReviewComments.pullRequestId, pullRequestId),
        inArray(prReviewComments.path, paths)
      ));
  }

  async applySuggestion(commentId: string) {
    return db.update(prReviewComments)
      .set({ suggestionApplied: true })
      .where(eq(prReviewComments.id, commentId))
      .returning();
  }

  async getThreads(pullRequestId: string) {
    const comments = await this.findByPullRequest(pullRequestId);
    
    // Group into threads
    const threads = new Map<string, typeof comments>();
    for (const comment of comments) {
      const threadId = comment.inReplyToId || comment.id;
      if (!threads.has(threadId)) {
        threads.set(threadId, []);
      }
      threads.get(threadId)!.push(comment);
    }
    
    return Array.from(threads.values());
  }
}

export const prReviewCommentsModel = new PRReviewCommentsModel();
```

### 3. API Endpoints (`src/api/trpc/routers/pulls.ts`)

```typescript
// Add review comment
addReviewComment: protectedProcedure
  .input(z.object({
    pullRequestId: z.string().uuid(),
    path: z.string(),
    line: z.number().optional(),
    originalLine: z.number().optional(),
    side: z.enum(['LEFT', 'RIGHT']),
    body: z.string().min(1),
    inReplyToId: z.string().uuid().optional(),
    suggestion: z.string().optional(),
  }))
  .mutation(async ({ input, ctx }) => {
    const pr = await pullRequestModel.findById(input.pullRequestId);
    if (!pr) throw new TRPCError({ code: 'NOT_FOUND' });

    const comment = await prReviewCommentsModel.create({
      ...input,
      authorId: ctx.user.id,
      commitSha: pr.headSha,
    });

    // Emit event
    eventBus.emit('pr.comment.created', {
      pullRequest: pr,
      comment,
      author: ctx.user,
    });

    return comment;
  }),

// Get review comments
getReviewComments: publicProcedure
  .input(z.object({ pullRequestId: z.string().uuid() }))
  .query(async ({ input }) => {
    return prReviewCommentsModel.findByPullRequest(input.pullRequestId);
  }),

// Resolve comment thread
resolveThread: protectedProcedure
  .input(z.object({ commentId: z.string().uuid() }))
  .mutation(async ({ input, ctx }) => {
    return prReviewCommentsModel.resolve(input.commentId, ctx.user.id);
  }),

// Unresolve comment thread
unresolveThread: protectedProcedure
  .input(z.object({ commentId: z.string().uuid() }))
  .mutation(async ({ input }) => {
    return prReviewCommentsModel.unresolve(input.commentId);
  }),

// Apply suggestion
applySuggestion: protectedProcedure
  .input(z.object({ commentId: z.string().uuid() }))
  .mutation(async ({ input, ctx }) => {
    const [comment] = await db
      .select()
      .from(prReviewComments)
      .where(eq(prReviewComments.id, input.commentId));

    if (!comment?.suggestion) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No suggestion to apply' });
    }

    // Apply the suggestion by creating a commit
    const pr = await pullRequestModel.findById(comment.pullRequestId);
    // ... commit the change

    await prReviewCommentsModel.applySuggestion(input.commentId);
    return { success: true };
  }),
```

### 4. Diff Viewer with Comments (`apps/web/src/components/diff/inline-diff.tsx`)

```tsx
import { useState } from 'react';
import { Plus, MessageSquare, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

interface DiffLine {
  type: 'add' | 'delete' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

interface Comment {
  id: string;
  line: number;
  side: 'LEFT' | 'RIGHT';
  body: string;
  author: { username: string; avatarUrl?: string };
  isResolved: boolean;
  suggestion?: string;
  replies: Comment[];
}

interface InlineDiffProps {
  pullRequestId: string;
  path: string;
  lines: DiffLine[];
  comments: Comment[];
}

export function InlineDiff({ pullRequestId, path, lines, comments }: InlineDiffProps) {
  const [activeCommentLine, setActiveCommentLine] = useState<{ line: number; side: 'LEFT' | 'RIGHT' } | null>(null);
  const [commentText, setCommentText] = useState('');
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [suggestionText, setSuggestionText] = useState('');

  const utils = trpc.useUtils();
  
  const addCommentMutation = trpc.pulls.addReviewComment.useMutation({
    onSuccess: () => {
      utils.pulls.getReviewComments.invalidate({ pullRequestId });
      setActiveCommentLine(null);
      setCommentText('');
      setSuggestionText('');
    },
  });

  const resolveThreadMutation = trpc.pulls.resolveThread.useMutation({
    onSuccess: () => utils.pulls.getReviewComments.invalidate({ pullRequestId }),
  });

  // Group comments by line
  const commentsByLine = comments.reduce((acc, comment) => {
    const key = `${comment.side}-${comment.line}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(comment);
    return acc;
  }, {} as Record<string, Comment[]>);

  const handleAddComment = () => {
    if (!activeCommentLine || !commentText.trim()) return;
    
    addCommentMutation.mutate({
      pullRequestId,
      path,
      line: activeCommentLine.side === 'RIGHT' ? activeCommentLine.line : undefined,
      originalLine: activeCommentLine.side === 'LEFT' ? activeCommentLine.line : undefined,
      side: activeCommentLine.side,
      body: commentText,
      suggestion: showSuggestion ? suggestionText : undefined,
    });
  };

  return (
    <div className="font-mono text-sm border rounded-lg overflow-hidden">
      {lines.map((line, index) => {
        const lineNumber = line.type === 'delete' ? line.oldLineNumber : line.newLineNumber;
        const side = line.type === 'delete' ? 'LEFT' : 'RIGHT';
        const lineComments = commentsByLine[`${side}-${lineNumber}`] || [];
        const isActiveComment = activeCommentLine?.line === lineNumber && activeCommentLine?.side === side;

        return (
          <div key={index}>
            {/* Diff line */}
            <div
              className={cn(
                'group flex hover:bg-accent/30',
                line.type === 'add' && 'bg-green-50 dark:bg-green-950/30',
                line.type === 'delete' && 'bg-red-50 dark:bg-red-950/30'
              )}
            >
              {/* Line numbers */}
              <div className="w-12 text-right pr-2 text-muted-foreground select-none border-r">
                {line.oldLineNumber || ''}
              </div>
              <div className="w-12 text-right pr-2 text-muted-foreground select-none border-r">
                {line.newLineNumber || ''}
              </div>
              
              {/* Add comment button */}
              <div className="w-8 flex items-center justify-center">
                <button
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-blue-100 rounded"
                  onClick={() => setActiveCommentLine({ line: lineNumber!, side })}
                >
                  <Plus className="h-3 w-3 text-blue-600" />
                </button>
              </div>
              
              {/* Code content */}
              <div className="flex-1 px-2 whitespace-pre">
                <span className={cn(
                  'inline-block w-4',
                  line.type === 'add' && 'text-green-600',
                  line.type === 'delete' && 'text-red-600'
                )}>
                  {line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' '}
                </span>
                {line.content}
              </div>
            </div>

            {/* Existing comments */}
            {lineComments.length > 0 && (
              <div className="border-y bg-muted/30 p-4 space-y-3">
                {lineComments.map((comment) => (
                  <CommentThread
                    key={comment.id}
                    comment={comment}
                    onResolve={() => resolveThreadMutation.mutate({ commentId: comment.id })}
                    pullRequestId={pullRequestId}
                    path={path}
                  />
                ))}
              </div>
            )}

            {/* New comment form */}
            {isActiveComment && (
              <div className="border-y bg-muted/30 p-4">
                <Textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment..."
                  rows={3}
                  className="mb-2"
                />
                
                {showSuggestion && (
                  <div className="mb-2">
                    <label className="text-xs text-muted-foreground">Suggestion:</label>
                    <Textarea
                      value={suggestionText}
                      onChange={(e) => setSuggestionText(e.target.value)}
                      placeholder="Suggested code..."
                      rows={3}
                      className="font-mono"
                    />
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowSuggestion(!showSuggestion)}
                  >
                    {showSuggestion ? 'Remove suggestion' : 'Add suggestion'}
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveCommentLine(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAddComment}
                      disabled={!commentText.trim()}
                    >
                      Add comment
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CommentThread({ comment, onResolve, pullRequestId, path }: {
  comment: Comment;
  onResolve: () => void;
  pullRequestId: string;
  path: string;
}) {
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);

  return (
    <div className={cn('space-y-2', comment.isResolved && 'opacity-60')}>
      <div className="flex items-start gap-2">
        <Avatar className="h-6 w-6">
          <AvatarImage src={comment.author.avatarUrl} />
          <AvatarFallback>{comment.author.username[0]}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{comment.author.username}</span>
            {comment.isResolved && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <Check className="h-3 w-3" /> Resolved
              </span>
            )}
          </div>
          <p className="text-sm mt-1">{comment.body}</p>
          
          {comment.suggestion && (
            <div className="mt-2 border rounded bg-green-50 dark:bg-green-950/30 p-2">
              <pre className="text-xs font-mono">{comment.suggestion}</pre>
              <Button size="sm" variant="outline" className="mt-2">
                Apply suggestion
              </Button>
            </div>
          )}
        </div>
        
        {!comment.isResolved && (
          <Button variant="ghost" size="sm" onClick={onResolve}>
            <Check className="h-4 w-4" />
          </Button>
        )}
      </div>
      
      {/* Replies */}
      {comment.replies?.map((reply) => (
        <div key={reply.id} className="ml-8 flex items-start gap-2">
          <Avatar className="h-5 w-5">
            <AvatarImage src={reply.author.avatarUrl} />
            <AvatarFallback>{reply.author.username[0]}</AvatarFallback>
          </Avatar>
          <div>
            <span className="font-medium text-sm">{reply.author.username}</span>
            <p className="text-sm">{reply.body}</p>
          </div>
        </div>
      ))}
      
      {/* Reply form */}
      {showReply ? (
        <div className="ml-8">
          <Textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Reply..."
            rows={2}
            className="mb-2"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setShowReply(false)}>
              Cancel
            </Button>
            <Button size="sm">Reply</Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="ml-8"
          onClick={() => setShowReply(true)}
        >
          Reply
        </Button>
      )}
    </div>
  );
}
```

## Files to Create/Modify
- `src/db/schema.ts` - Add prReviewComments table
- `src/db/models/pr-review-comments.ts` - New file
- `src/db/models/index.ts` - Export new model
- `src/api/trpc/routers/pulls.ts` - Add comment endpoints
- `apps/web/src/components/diff/inline-diff.tsx` - New file
- `apps/web/src/routes/repo/pull-request.tsx` - Use InlineDiff

## Testing
1. Open a PR with code changes
2. Hover over a line, click + button
3. Add a comment, verify it appears
4. Reply to a comment
5. Resolve a thread
6. Add a suggestion, click Apply
7. Verify outdated comments marked after push

## Success Criteria
- [ ] Add comment button appears on line hover
- [ ] Comments display inline in diff
- [ ] Reply to existing comments
- [ ] Resolve/unresolve threads
- [ ] Suggestions with Apply button
- [ ] Outdated comments marked
- [ ] Comments linked to specific commit
- [ ] Notifications for new comments
