import { PlayCircle, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useReviewOptional } from './review-context';

interface StartReviewButtonProps {
  /** Whether the user is authenticated */
  isAuthenticated?: boolean;
}

export function StartReviewButton({ isAuthenticated = false }: StartReviewButtonProps) {
  const review = useReviewOptional();

  if (!isAuthenticated || !review) {
    return null;
  }

  if (review.isReviewMode) {
    return (
      <Button variant="secondary" size="sm" className="gap-2">
        <Edit className="h-4 w-4" />
        Reviewing
        {review.pendingComments.length > 0 && (
          <Badge variant="default" className="ml-1">
            {review.pendingComments.length}
          </Badge>
        )}
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={review.startReview} className="gap-2">
      <PlayCircle className="h-4 w-4" />
      Start review
    </Button>
  );
}
