/**
 * useCompletion Hook
 *
 * React hook for AI-powered code completion in the IDE.
 * Provides completion state and methods for the Monaco editor.
 */

import { useCallback, useRef, useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { completionService, shouldTriggerCompletion, getLanguageFromPath } from '@/lib/completion-service';

interface UseCompletionOptions {
  enabled?: boolean;
}

interface UseCompletionReturn {
  isEnabled: boolean;
  setEnabled: (enabled: boolean) => void;
  isLoading: boolean;
  getCompletion: (
    prefix: string,
    suffix: string,
    filePath: string,
    cursorPosition: { lineNumber: number; column: number }
  ) => Promise<string | null>;
  cancelCompletion: () => void;
}

// Type for completion mutation
type CompletionMutation = {
  mutateAsync: (params: {
    prefix: string;
    suffix: string;
    filePath: string;
    language: string;
    maxTokens?: number;
  }) => Promise<{ completion: string; cached: boolean }>;
};

/**
 * Hook for managing AI code completions
 */
export function useCompletion(options: UseCompletionOptions = {}): UseCompletionReturn {
  const { enabled = true } = options;
  const [isEnabled, setIsEnabledState] = useState(enabled);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // tRPC mutation for getting completions (using any to bypass type check during development)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const completionMutation = (trpc as any).completion?.getCompletion?.useMutation?.() as CompletionMutation | undefined;

  // Set up the completion callback
  useEffect(() => {
    completionService.setEnabled(isEnabled);

    if (completionMutation) {
      completionService.setCompletionCallback(async (prefix, suffix, filePath, language) => {
        try {
          setIsLoading(true);
          const result = await completionMutation.mutateAsync({
            prefix,
            suffix,
            filePath,
            language,
            maxTokens: 150,
          });
          return result.completion || null;
        } catch (error) {
          console.error('Completion error:', error);
          return null;
        } finally {
          setIsLoading(false);
        }
      });
    }
  }, [isEnabled, completionMutation]);

  // Enable/disable completions
  const setEnabled = useCallback((value: boolean) => {
    setIsEnabledState(value);
    completionService.setEnabled(value);
  }, []);

  // Get completion for a position
  const getCompletion = useCallback(
    async (
      prefix: string,
      suffix: string,
      filePath: string,
      cursorPosition: { lineNumber: number; column: number }
    ): Promise<string | null> => {
      if (!isEnabled) {
        return null;
      }

      const language = getLanguageFromPath(filePath);

      // Check if we should trigger completion
      if (!shouldTriggerCompletion(prefix, suffix, 'automatic')) {
        return null;
      }

      // Cancel any previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        setIsLoading(true);
        const result = await completionService.requestCompletion(
          prefix,
          suffix,
          filePath,
          language,
          cursorPosition
        );
        return result?.text || null;
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('Completion error:', error);
        }
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [isEnabled]
  );

  // Cancel pending completion
  const cancelCompletion = useCallback(() => {
    completionService.cancelPending();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cancelCompletion();
    };
  }, [cancelCompletion]);

  return {
    isEnabled,
    setEnabled,
    isLoading,
    getCompletion,
    cancelCompletion,
  };
}

/**
 * Lightweight hook for just the completion mutation (for use in Monaco provider)
 */
export function useCompletionMutation() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutation = (trpc as any).completion?.getCompletion?.useMutation?.() as CompletionMutation | undefined;
  return mutation;
}
