import { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  MessageSquare,
  ChevronDown,
  Loader2,
  FileEdit,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type ReviewState = 'approved' | 'changes_requested' | 'commented';

interface ReviewButtonProps {
  onSubmit: (state: ReviewState, body: string) => Promise<void>;
  pendingCommentsCount?: number;
  isAuthor?: boolean;
  disabled?: boolean;
}

export function ReviewButton({
  onSubmit,
  pendingCommentsCount = 0,
  isAuthor = false,
  disabled = false,
}: ReviewButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [reviewState, setReviewState] = useState<ReviewState>(
    isAuthor ? 'commented' : 'approved'
  );
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit(reviewState, body);
      setBody('');
      setIsOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const reviewOptions = [
    {
      value: 'approved' as const,
      label: 'Approve',
      description: 'Submit feedback and approve merging these changes.',
      icon: <CheckCircle className="h-4 w-4 text-green-500" />,
      disabled: isAuthor,
    },
    {
      value: 'changes_requested' as const,
      label: 'Request changes',
      description: 'Submit feedback that must be addressed before merging.',
      icon: <XCircle className="h-4 w-4 text-red-500" />,
      disabled: isAuthor,
    },
    {
      value: 'commented' as const,
      label: 'Comment',
      description: 'Submit general feedback without explicit approval.',
      icon: <MessageSquare className="h-4 w-4 text-muted-foreground" />,
      disabled: false,
    },
  ];

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="gap-2"
          disabled={disabled}
        >
          <FileEdit className="h-4 w-4" />
          Finish your review
          {pendingCommentsCount > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {pendingCommentsCount}
            </Badge>
          )}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[400px] p-4" sideOffset={8}>
        <div className="space-y-4">
          {/* Review body */}
          <div>
            <Label htmlFor="review-body" className="text-sm font-medium mb-2 block">
              Review summary
            </Label>
            <Textarea
              id="review-body"
              placeholder="Leave a comment (optional)"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Review type selection */}
          <RadioGroup
            value={reviewState}
            onValueChange={(value) => setReviewState(value as ReviewState)}
            className="space-y-2"
          >
            {reviewOptions.map((option) => (
              <div key={option.value}>
                <Label
                  htmlFor={`review-${option.value}`}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                    reviewState === option.value
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent hover:bg-muted/50',
                    option.disabled && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <RadioGroupItem
                    value={option.value}
                    id={`review-${option.value}`}
                    disabled={option.disabled}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {option.icon}
                      <span className="font-medium">{option.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {option.description}
                    </p>
                    {option.disabled && (
                      <p className="text-xs text-orange-500 mt-1">
                        Authors cannot approve or request changes on their own PRs
                      </p>
                    )}
                  </div>
                </Label>
              </div>
            ))}
          </RadioGroup>

          {/* Pending comments indicator */}
          {pendingCommentsCount > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 p-2 rounded">
              <MessageSquare className="h-4 w-4" />
              <span>
                {pendingCommentsCount} pending comment
                {pendingCommentsCount > 1 ? 's' : ''} will be submitted
              </span>
            </div>
          )}

          {/* Submit button */}
          <div className="flex justify-end">
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className={cn(
                'gap-2',
                reviewState === 'approved' && 'bg-green-600 hover:bg-green-700',
                reviewState === 'changes_requested' && 'bg-red-600 hover:bg-red-700'
              )}
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                reviewOptions.find((o) => o.value === reviewState)?.icon
              )}
              Submit review
            </Button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
