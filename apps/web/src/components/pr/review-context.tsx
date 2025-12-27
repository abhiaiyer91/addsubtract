import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface PendingComment {
  id: string;
  filePath: string;
  line: number;
  side: 'LEFT' | 'RIGHT';
  body: string;
  suggestion?: string;
}

export type ReviewState = 'comment' | 'approve' | 'request_changes';

interface ReviewContextValue {
  /** Whether the user is in review mode */
  isReviewMode: boolean;
  /** Start review mode */
  startReview: () => void;
  /** Cancel review mode (discards pending comments) */
  cancelReview: () => void;
  /** Add a pending comment */
  addPendingComment: (comment: Omit<PendingComment, 'id'>) => void;
  /** Remove a pending comment */
  removePendingComment: (id: string) => void;
  /** Update a pending comment */
  updatePendingComment: (id: string, updates: Partial<PendingComment>) => void;
  /** Get all pending comments */
  pendingComments: PendingComment[];
  /** Selected review state */
  reviewState: ReviewState;
  /** Set review state */
  setReviewState: (state: ReviewState) => void;
  /** Review summary body */
  reviewBody: string;
  /** Set review body */
  setReviewBody: (body: string) => void;
  /** Submit the review */
  submitReview: () => void;
  /** Whether the review is being submitted */
  isSubmitting: boolean;
}

const ReviewContext = createContext<ReviewContextValue | null>(null);

interface ReviewProviderProps {
  children: ReactNode;
  /** Called when review is submitted */
  onSubmit: (data: {
    state: ReviewState;
    body: string;
    comments: PendingComment[];
  }) => Promise<void>;
}

export function ReviewProvider({ children, onSubmit }: ReviewProviderProps) {
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [pendingComments, setPendingComments] = useState<PendingComment[]>([]);
  const [reviewState, setReviewState] = useState<ReviewState>('comment');
  const [reviewBody, setReviewBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const startReview = useCallback(() => {
    setIsReviewMode(true);
  }, []);

  const cancelReview = useCallback(() => {
    setIsReviewMode(false);
    setPendingComments([]);
    setReviewState('comment');
    setReviewBody('');
  }, []);

  const addPendingComment = useCallback((comment: Omit<PendingComment, 'id'>) => {
    const id = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setPendingComments((prev) => [...prev, { ...comment, id }]);
  }, []);

  const removePendingComment = useCallback((id: string) => {
    setPendingComments((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const updatePendingComment = useCallback((id: string, updates: Partial<PendingComment>) => {
    setPendingComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  }, []);

  const submitReview = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        state: reviewState,
        body: reviewBody,
        comments: pendingComments,
      });
      // Reset after successful submission
      setIsReviewMode(false);
      setPendingComments([]);
      setReviewState('comment');
      setReviewBody('');
    } finally {
      setIsSubmitting(false);
    }
  }, [onSubmit, reviewState, reviewBody, pendingComments]);

  return (
    <ReviewContext.Provider
      value={{
        isReviewMode,
        startReview,
        cancelReview,
        addPendingComment,
        removePendingComment,
        updatePendingComment,
        pendingComments,
        reviewState,
        setReviewState,
        reviewBody,
        setReviewBody,
        submitReview,
        isSubmitting,
      }}
    >
      {children}
    </ReviewContext.Provider>
  );
}

export function useReview() {
  const context = useContext(ReviewContext);
  if (!context) {
    throw new Error('useReview must be used within a ReviewProvider');
  }
  return context;
}

export function useReviewOptional() {
  return useContext(ReviewContext);
}
