import { useState } from 'react';
import {
  MessageSquare,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  Trash2,
  FileCode,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useReview, type ReviewState } from './review-context';

export function ReviewPanel() {
  const {
    isReviewMode,
    cancelReview,
    pendingComments,
    removePendingComment,
    reviewState,
    setReviewState,
    reviewBody,
    setReviewBody,
    submitReview,
    isSubmitting,
  } = useReview();

  const [isExpanded, setIsExpanded] = useState(false);

  if (!isReviewMode) return null;

  const reviewOptions: { value: ReviewState; label: string; description: string; icon: React.ReactNode }[] = [
    {
      value: 'comment',
      label: 'Comment',
      description: 'Submit general feedback without approval',
      icon: <MessageSquare className="h-4 w-4" />,
    },
    {
      value: 'approve',
      label: 'Approve',
      description: 'Submit feedback and approve these changes',
      icon: <CheckCircle className="h-4 w-4 text-green-500" />,
    },
    {
      value: 'request_changes',
      label: 'Request changes',
      description: 'Submit feedback that must be addressed',
      icon: <XCircle className="h-4 w-4 text-red-500" />,
    },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t shadow-lg">
      {/* Collapsed view */}
      <div
        className="flex items-center justify-between px-6 py-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="font-medium">Review in progress</span>
          </div>

          <Badge variant="secondary">
            {pendingComments.length} pending {pendingComments.length === 1 ? 'comment' : 'comments'}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); cancelReview(); }}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={(e) => { e.stopPropagation(); setIsExpanded(true); }}
          >
            Finish review
          </Button>
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded view */}
      {isExpanded && (
        <div className="px-6 pb-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Pending comments list */}
          {pendingComments.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground">Pending comments</h3>
              <div className="space-y-2">
                {pendingComments.map((comment) => (
                  <Card key={comment.id} className="bg-muted/30">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                            <FileCode className="h-3 w-3" />
                            <span className="font-mono truncate">{comment.filePath}</span>
                            <span>line {comment.line}</span>
                          </div>
                          <p className="text-sm line-clamp-2">{comment.body}</p>
                          {comment.suggestion && (
                            <Badge variant="outline" className="mt-1 text-xs">
                              Has suggestion
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removePendingComment(comment.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Review summary */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Review summary (optional)</h3>
            <Textarea
              value={reviewBody}
              onChange={(e) => setReviewBody(e.target.value)}
              placeholder="Leave a summary of your review..."
              className="min-h-[100px]"
            />
          </div>

          {/* Review type selection */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">Submit review as</h3>
            <div className="grid gap-2">
              {reviewOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setReviewState(option.value)}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg border text-left transition-colors',
                    reviewState === option.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/50'
                  )}
                >
                  <div
                    className={cn(
                      'mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center',
                      reviewState === option.value
                        ? 'border-primary'
                        : 'border-muted-foreground/50'
                    )}
                  >
                    {reviewState === option.value && (
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {option.icon}
                      <span className="font-medium">{option.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {option.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Submit buttons */}
          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-muted-foreground">
              {pendingComments.length} {pendingComments.length === 1 ? 'comment' : 'comments'} will be submitted
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={cancelReview}>
                Cancel review
              </Button>
              <Button
                onClick={submitReview}
                disabled={isSubmitting}
                className={cn(
                  reviewState === 'approve' && 'bg-green-600 hover:bg-green-700',
                  reviewState === 'request_changes' && 'bg-red-600 hover:bg-red-700'
                )}
              >
                {isSubmitting ? 'Submitting...' : 'Submit review'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
