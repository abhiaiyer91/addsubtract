# Task: AI-Powered Code Review

## Objective
Integrate AI to automatically review pull requests, suggest improvements, identify bugs, and provide inline feedback.

## Context

### Current State
- AI Agent exists with multiple modes (`src/ai/agents/`)
- Triage agent can categorize issues
- No automated PR review capability
- Manual code review only

### Desired State
- AI automatically reviews PRs on creation/update
- Inline suggestions on code quality, bugs, security
- Summary of changes with risk assessment
- Configurable review rules per repository
- "AI Review" badge on PR

## Technical Requirements

### 1. Database Schema (`src/db/schema.ts`)

```typescript
export const aiReviews = pgTable('ai_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  pullRequestId: uuid('pull_request_id').notNull().references(() => pullRequests.id, { onDelete: 'cascade' }),
  commitSha: text('commit_sha').notNull(),
  
  // Review content
  summary: text('summary').notNull(),
  riskLevel: text('risk_level').notNull(), // 'low', 'medium', 'high', 'critical'
  
  // Metrics
  issuesFound: integer('issues_found').default(0),
  suggestionsCount: integer('suggestions_count').default(0),
  
  // Status
  status: text('status').notNull().default('pending'), // 'pending', 'completed', 'failed'
  errorMessage: text('error_message'),
  
  // Tokens/cost tracking
  tokensUsed: integer('tokens_used'),
  model: text('model'),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const aiReviewComments = pgTable('ai_review_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  aiReviewId: uuid('ai_review_id').notNull().references(() => aiReviews.id, { onDelete: 'cascade' }),
  
  // Position
  path: text('path').notNull(),
  line: integer('line'),
  endLine: integer('end_line'),
  
  // Content
  category: text('category').notNull(), // 'bug', 'security', 'performance', 'style', 'suggestion'
  severity: text('severity').notNull(), // 'info', 'warning', 'error'
  title: text('title').notNull(),
  body: text('body').notNull(),
  suggestion: text('suggestion'), // Code suggestion
  
  // User interaction
  isApplied: boolean('is_applied').default(false),
  isDismissed: boolean('is_dismissed').default(false),
  dismissedById: uuid('dismissed_by_id').references(() => users.id),
  
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### 2. AI Review Agent (`src/ai/agents/review-agent.ts`)

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { db } from '../../db';
import { aiReviews, aiReviewComments } from '../../db/schema';
import { diffService } from '../../core/diff';

const REVIEW_SYSTEM_PROMPT = `You are an expert code reviewer. Analyze the provided code changes and identify:

1. **Bugs**: Logic errors, null pointer issues, race conditions
2. **Security**: SQL injection, XSS, authentication issues, secrets exposure
3. **Performance**: N+1 queries, unnecessary loops, memory leaks
4. **Style**: Naming conventions, code organization, readability
5. **Suggestions**: Better approaches, modern patterns, simplifications

For each issue, provide:
- Category (bug, security, performance, style, suggestion)
- Severity (info, warning, error)
- File path and line number(s)
- Clear explanation
- Suggested fix (if applicable)

Also provide an overall summary and risk assessment (low, medium, high, critical).

Respond in JSON format:
{
  "summary": "Brief overview of the changes and overall assessment",
  "riskLevel": "low|medium|high|critical",
  "comments": [
    {
      "path": "src/example.ts",
      "line": 42,
      "endLine": 45,
      "category": "bug|security|performance|style|suggestion",
      "severity": "info|warning|error",
      "title": "Brief title",
      "body": "Detailed explanation",
      "suggestion": "Optional code suggestion"
    }
  ]
}`;

export interface ReviewResult {
  summary: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  comments: Array<{
    path: string;
    line?: number;
    endLine?: number;
    category: string;
    severity: string;
    title: string;
    body: string;
    suggestion?: string;
  }>;
}

export class AIReviewAgent {
  private client: Anthropic;
  private model: string;

  constructor(apiKey: string, model = 'claude-sonnet-4-20250514') {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async reviewPullRequest(pr: {
    id: string;
    headSha: string;
    baseSha: string;
    repoPath: string;
  }): Promise<{ reviewId: string }> {
    // Create review record
    const [review] = await db.insert(aiReviews).values({
      pullRequestId: pr.id,
      commitSha: pr.headSha,
      summary: '',
      riskLevel: 'low',
      status: 'pending',
      model: this.model,
    }).returning();

    try {
      // Get diff
      const diff = await diffService.getDiff(pr.repoPath, pr.baseSha, pr.headSha);
      
      // Get changed files content
      const changedFiles = await this.getChangedFilesContent(pr.repoPath, pr.headSha, diff);

      // Build prompt
      const prompt = this.buildPrompt(diff, changedFiles);

      // Call AI
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        system: REVIEW_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });

      // Parse response
      const content = response.content[0];
      if (content.type !== 'text') throw new Error('Unexpected response type');
      
      const result = JSON.parse(content.text) as ReviewResult;

      // Update review
      await db.update(aiReviews)
        .set({
          summary: result.summary,
          riskLevel: result.riskLevel,
          issuesFound: result.comments.filter(c => c.severity === 'error').length,
          suggestionsCount: result.comments.length,
          status: 'completed',
          tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
          completedAt: new Date(),
        })
        .where(eq(aiReviews.id, review.id));

      // Create comments
      if (result.comments.length > 0) {
        await db.insert(aiReviewComments).values(
          result.comments.map(comment => ({
            aiReviewId: review.id,
            path: comment.path,
            line: comment.line,
            endLine: comment.endLine,
            category: comment.category,
            severity: comment.severity,
            title: comment.title,
            body: comment.body,
            suggestion: comment.suggestion,
          }))
        );
      }

      return { reviewId: review.id };
    } catch (error) {
      await db.update(aiReviews)
        .set({
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        })
        .where(eq(aiReviews.id, review.id));
      
      throw error;
    }
  }

  private buildPrompt(diff: string, files: Map<string, string>): string {
    let prompt = '## Code Changes (Diff)\n\n```diff\n' + diff + '\n```\n\n';
    
    prompt += '## Full File Contents\n\n';
    for (const [path, content] of files) {
      prompt += `### ${path}\n\`\`\`\n${content}\n\`\`\`\n\n`;
    }
    
    return prompt;
  }

  private async getChangedFilesContent(
    repoPath: string, 
    sha: string, 
    diff: string
  ): Promise<Map<string, string>> {
    // Parse diff to get file paths
    const files = new Map<string, string>();
    const pathRegex = /^\+\+\+ b\/(.+)$/gm;
    let match;
    
    while ((match = pathRegex.exec(diff)) !== null) {
      const path = match[1];
      try {
        const content = await git.readFile(repoPath, sha, path);
        files.set(path, content);
      } catch {
        // File might be deleted
      }
    }
    
    return files;
  }
}
```

### 3. Event Handler (`src/events/handlers/ai-review.ts`)

```typescript
import { eventBus } from '../bus';
import { AIReviewAgent } from '../../ai/agents/review-agent';
import { repoModel } from '../../db/models/repository';
import { getAIConfig } from '../../core/ai-config';

eventBus.on('pr.created', async (event) => {
  await triggerAIReview(event.pullRequest);
});

eventBus.on('pr.updated', async (event) => {
  await triggerAIReview(event.pullRequest);
});

async function triggerAIReview(pr: PullRequest) {
  // Check if AI review is enabled for this repo
  const config = await getAIConfig(pr.repoId);
  if (!config.aiReviewEnabled) return;

  const repo = await repoModel.findById(pr.repoId);
  if (!repo) return;

  try {
    const agent = new AIReviewAgent(config.apiKey, config.model);
    await agent.reviewPullRequest({
      id: pr.id,
      headSha: pr.headSha,
      baseSha: pr.baseSha,
      repoPath: repo.diskPath,
    });

    // Emit completion event
    eventBus.emit('ai.review.completed', { pullRequestId: pr.id });
  } catch (error) {
    console.error('[AI Review] Failed:', error);
  }
}
```

### 4. API Endpoints (`src/api/trpc/routers/ai-review.ts`)

```typescript
import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../trpc';
import { aiReviews, aiReviewComments } from '../../db/schema';
import { eq } from 'drizzle-orm';

export const aiReviewRouter = router({
  // Get AI review for a PR
  getForPR: publicProcedure
    .input(z.object({ pullRequestId: z.string().uuid() }))
    .query(async ({ input }) => {
      const [review] = await db
        .select()
        .from(aiReviews)
        .where(eq(aiReviews.pullRequestId, input.pullRequestId))
        .orderBy(desc(aiReviews.createdAt))
        .limit(1);
      
      if (!review) return null;
      
      const comments = await db
        .select()
        .from(aiReviewComments)
        .where(eq(aiReviewComments.aiReviewId, review.id));
      
      return { ...review, comments };
    }),

  // Trigger manual review
  trigger: protectedProcedure
    .input(z.object({ pullRequestId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const pr = await pullRequestModel.findById(input.pullRequestId);
      if (!pr) throw new TRPCError({ code: 'NOT_FOUND' });

      // Trigger review asynchronously
      triggerAIReview(pr);
      
      return { status: 'triggered' };
    }),

  // Dismiss a comment
  dismissComment: protectedProcedure
    .input(z.object({ commentId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      await db.update(aiReviewComments)
        .set({
          isDismissed: true,
          dismissedById: ctx.user.id,
        })
        .where(eq(aiReviewComments.id, input.commentId));
      
      return { success: true };
    }),

  // Apply suggestion
  applySuggestion: protectedProcedure
    .input(z.object({ commentId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      // Get comment
      const [comment] = await db
        .select()
        .from(aiReviewComments)
        .where(eq(aiReviewComments.id, input.commentId));
      
      if (!comment?.suggestion) {
        throw new TRPCError({ code: 'BAD_REQUEST' });
      }

      // Apply the suggestion (create commit)
      // ...

      await db.update(aiReviewComments)
        .set({ isApplied: true })
        .where(eq(aiReviewComments.id, input.commentId));
      
      return { success: true };
    }),
});
```

### 5. Web UI (`apps/web/src/components/pr/ai-review-panel.tsx`)

```tsx
import { Bot, AlertTriangle, Info, AlertCircle, CheckCircle, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

const RISK_COLORS = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const SEVERITY_ICONS = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
};

const CATEGORY_COLORS = {
  bug: 'bg-red-100 text-red-700',
  security: 'bg-purple-100 text-purple-700',
  performance: 'bg-orange-100 text-orange-700',
  style: 'bg-blue-100 text-blue-700',
  suggestion: 'bg-green-100 text-green-700',
};

interface AIReviewPanelProps {
  pullRequestId: string;
}

export function AIReviewPanel({ pullRequestId }: AIReviewPanelProps) {
  const { data: review, isLoading } = trpc.aiReview.getForPR.useQuery({ pullRequestId });
  const utils = trpc.useUtils();

  const triggerMutation = trpc.aiReview.trigger.useMutation({
    onSuccess: () => utils.aiReview.getForPR.invalidate({ pullRequestId }),
  });

  const dismissMutation = trpc.aiReview.dismissComment.useMutation({
    onSuccess: () => utils.aiReview.getForPR.invalidate({ pullRequestId }),
  });

  if (isLoading) {
    return <div className="p-4 text-muted-foreground">Loading AI review...</div>;
  }

  if (!review) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground mb-4">No AI review yet</p>
          <Button onClick={() => triggerMutation.mutate({ pullRequestId })}>
            <Sparkles className="h-4 w-4 mr-2" />
            Request AI Review
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (review.status === 'pending') {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p>AI review in progress...</p>
        </CardContent>
      </Card>
    );
  }

  if (review.status === 'failed') {
    return (
      <Card className="border-red-200">
        <CardContent className="p-6">
          <p className="text-red-600">AI review failed: {review.errorMessage}</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => triggerMutation.mutate({ pullRequestId })}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const activeComments = review.comments.filter(c => !c.isDismissed);
  const groupedComments = activeComments.reduce((acc, comment) => {
    if (!acc[comment.path]) acc[comment.path] = [];
    acc[comment.path].push(comment);
    return acc;
  }, {} as Record<string, typeof activeComments>);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Review
          </CardTitle>
          <Badge className={cn(RISK_COLORS[review.riskLevel as keyof typeof RISK_COLORS])}>
            {review.riskLevel} risk
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="p-3 bg-muted/50 rounded-lg">
          <p className="text-sm">{review.summary}</p>
        </div>

        {/* Stats */}
        <div className="flex gap-4 text-sm">
          <span>{review.issuesFound} issues</span>
          <span>{review.suggestionsCount} suggestions</span>
          <span className="text-muted-foreground">{review.tokensUsed} tokens</span>
        </div>

        {/* Comments by file */}
        {Object.entries(groupedComments).map(([path, comments]) => (
          <div key={path} className="border rounded-lg">
            <div className="px-3 py-2 bg-muted/30 border-b font-mono text-sm">
              {path}
            </div>
            <div className="divide-y">
              {comments.map((comment) => {
                const SeverityIcon = SEVERITY_ICONS[comment.severity as keyof typeof SEVERITY_ICONS];
                return (
                  <div key={comment.id} className="p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <SeverityIcon className={cn(
                          'h-4 w-4',
                          comment.severity === 'error' && 'text-red-500',
                          comment.severity === 'warning' && 'text-yellow-500',
                          comment.severity === 'info' && 'text-blue-500'
                        )} />
                        <Badge className={cn('text-xs', CATEGORY_COLORS[comment.category as keyof typeof CATEGORY_COLORS])}>
                          {comment.category}
                        </Badge>
                        {comment.line && (
                          <span className="text-xs text-muted-foreground">
                            Line {comment.line}{comment.endLine ? `-${comment.endLine}` : ''}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => dismissMutation.mutate({ commentId: comment.id })}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="font-medium mt-1">{comment.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{comment.body}</p>
                    {comment.suggestion && (
                      <div className="mt-2 p-2 bg-green-50 dark:bg-green-950/30 rounded border">
                        <pre className="text-xs font-mono">{comment.suggestion}</pre>
                        <Button size="sm" variant="outline" className="mt-2">
                          Apply suggestion
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

### 6. Repository Settings (`apps/web/src/routes/repo/settings/ai.tsx`)

Add AI review configuration:

```tsx
// Add to existing AI settings
<Card>
  <CardHeader>
    <CardTitle>AI Code Review</CardTitle>
    <CardDescription>
      Automatically review pull requests with AI
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="flex items-center justify-between">
      <Label>Enable AI Review</Label>
      <Switch
        checked={settings.aiReviewEnabled}
        onCheckedChange={(v) => updateSettings({ aiReviewEnabled: v })}
      />
    </div>
    
    <div>
      <Label>Review on</Label>
      <div className="space-y-2 mt-2">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={settings.reviewOnCreate} />
          PR creation
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={settings.reviewOnUpdate} />
          PR updates
        </label>
      </div>
    </div>
    
    <div>
      <Label>Focus areas</Label>
      <div className="space-y-2 mt-2">
        {['bugs', 'security', 'performance', 'style'].map((area) => (
          <label key={area} className="flex items-center gap-2">
            <input type="checkbox" checked={settings.focusAreas.includes(area)} />
            {area.charAt(0).toUpperCase() + area.slice(1)}
          </label>
        ))}
      </div>
    </div>
  </CardContent>
</Card>
```

## Files to Create/Modify
- `src/db/schema.ts` - Add aiReviews, aiReviewComments tables
- `src/ai/agents/review-agent.ts` - New file
- `src/events/handlers/ai-review.ts` - New file
- `src/api/trpc/routers/ai-review.ts` - New file
- `src/api/trpc/routers/index.ts` - Register router
- `apps/web/src/components/pr/ai-review-panel.tsx` - New file
- `apps/web/src/routes/repo/pull-request.tsx` - Add AIReviewPanel
- `apps/web/src/routes/repo/settings/ai.tsx` - Add review settings

## Testing
1. Enable AI review in repo settings
2. Create a PR with code issues
3. Verify AI review triggers automatically
4. Check summary and risk assessment
5. View inline comments by file
6. Dismiss a comment
7. Apply a suggestion
8. Trigger manual re-review

## Success Criteria
- [ ] AI review triggers on PR create/update
- [ ] Summary with risk assessment displayed
- [ ] Comments grouped by file
- [ ] Category and severity badges
- [ ] Dismiss comments
- [ ] Apply code suggestions
- [ ] Configurable per repository
- [ ] Token usage tracked
