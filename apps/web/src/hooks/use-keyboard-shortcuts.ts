import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  action: () => void;
  // Don't trigger when focused on input/textarea
  ignoreInputs?: boolean;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Check if we're in an input field
      const target = event.target as HTMLElement;
      const isInputField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      for (const shortcut of shortcuts) {
        // Skip if we're in an input and this shortcut ignores inputs
        if (isInputField && shortcut.ignoreInputs !== false) {
          continue;
        }

        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatch = shortcut.ctrl ? event.ctrlKey : !event.ctrlKey;
        const metaMatch = shortcut.meta ? event.metaKey : !event.metaKey;
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey;
        const altMatch = shortcut.alt ? event.altKey : !event.altKey;

        if (keyMatch && ctrlMatch && metaMatch && shiftMatch && altMatch) {
          event.preventDefault();
          shortcut.action();
          return;
        }
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

// Common PR page shortcuts
export function usePRShortcuts({
  onNavigateUp,
  onNavigateDown,
  onToggleFileExpand,
  onToggleViewed,
  onOpenReviewDialog,
  onFocusComment,
  onApprove,
  onRequestChanges,
}: {
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onToggleFileExpand?: () => void;
  onToggleViewed?: () => void;
  onOpenReviewDialog?: () => void;
  onFocusComment?: () => void;
  onApprove?: () => void;
  onRequestChanges?: () => void;
}) {
  const shortcuts: KeyboardShortcut[] = [];

  if (onNavigateUp) {
    shortcuts.push({
      key: 'k',
      description: 'Navigate to previous file',
      action: onNavigateUp,
      ignoreInputs: true,
    });
    shortcuts.push({
      key: 'ArrowUp',
      description: 'Navigate to previous file',
      action: onNavigateUp,
      ignoreInputs: true,
    });
  }

  if (onNavigateDown) {
    shortcuts.push({
      key: 'j',
      description: 'Navigate to next file',
      action: onNavigateDown,
      ignoreInputs: true,
    });
    shortcuts.push({
      key: 'ArrowDown',
      description: 'Navigate to next file',
      action: onNavigateDown,
      ignoreInputs: true,
    });
  }

  if (onToggleFileExpand) {
    shortcuts.push({
      key: 'x',
      description: 'Toggle file expand/collapse',
      action: onToggleFileExpand,
      ignoreInputs: true,
    });
  }

  if (onToggleViewed) {
    shortcuts.push({
      key: 'v',
      description: 'Toggle file as viewed',
      action: onToggleViewed,
      ignoreInputs: true,
    });
  }

  if (onOpenReviewDialog) {
    shortcuts.push({
      key: 'r',
      description: 'Open review dialog',
      action: onOpenReviewDialog,
      ignoreInputs: true,
    });
  }

  if (onFocusComment) {
    shortcuts.push({
      key: 'c',
      description: 'Focus comment input',
      action: onFocusComment,
      ignoreInputs: true,
    });
  }

  if (onApprove) {
    shortcuts.push({
      key: 'a',
      shift: true,
      description: 'Approve PR',
      action: onApprove,
      ignoreInputs: true,
    });
  }

  if (onRequestChanges) {
    shortcuts.push({
      key: 'd',
      shift: true,
      description: 'Request changes',
      action: onRequestChanges,
      ignoreInputs: true,
    });
  }

  // Escape to close dialogs/cancel
  shortcuts.push({
    key: 'Escape',
    description: 'Close dialog / Cancel',
    action: () => {
      // This will be handled by individual components
      document.dispatchEvent(new CustomEvent('shortcut:escape'));
    },
    ignoreInputs: false,
  });

  // Question mark for help
  shortcuts.push({
    key: '?',
    description: 'Show keyboard shortcuts',
    action: () => {
      document.dispatchEvent(new CustomEvent('shortcut:help'));
    },
    ignoreInputs: true,
  });

  useKeyboardShortcuts(shortcuts);

  return shortcuts;
}
