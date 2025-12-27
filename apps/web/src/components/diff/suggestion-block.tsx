import { useState } from 'react';
import { Check, Lightbulb, Copy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SuggestionBlockProps {
  /** The original code (what will be replaced) */
  originalCode: string;
  /** The suggested code (what will replace the original) */
  suggestedCode: string;
  /** Called when the suggestion is applied */
  onApply?: () => void;
  /** Called when the suggestion is dismissed */
  onDismiss?: () => void;
  /** Whether this suggestion has been applied */
  isApplied?: boolean;
  /** Commit SHA where the suggestion was applied */
  appliedCommitSha?: string;
  /** Whether the apply action is in progress */
  isApplying?: boolean;
  /** Whether the current user can apply the suggestion (PR author only) */
  canApply?: boolean;
  /** Additional class name */
  className?: string;
}

export function SuggestionBlock({
  originalCode,
  suggestedCode,
  onApply,
  onDismiss,
  isApplied = false,
  appliedCommitSha,
  isApplying = false,
  canApply = false,
  className,
}: SuggestionBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(suggestedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const originalLines = originalCode.split('\n');
  const suggestedLines = suggestedCode.split('\n');

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden',
        isApplied
          ? 'border-green-500/30 bg-green-500/5'
          : 'border-primary/30 bg-primary/5',
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 border-b',
          isApplied
            ? 'bg-green-500/10 border-green-500/30'
            : 'bg-primary/10 border-primary/30'
        )}
      >
        <Lightbulb
          className={cn(
            'h-4 w-4',
            isApplied ? 'text-green-500' : 'text-primary'
          )}
        />
        <span className="text-sm font-medium">
          {isApplied ? 'Suggestion applied' : 'Suggested change'}
        </span>
        {isApplied && appliedCommitSha && (
          <code className="ml-auto text-xs text-muted-foreground font-mono">
            Applied in {appliedCommitSha.slice(0, 7)}
          </code>
        )}
      </div>

      {/* Diff view */}
      <div className="overflow-x-auto font-mono text-sm">
        {/* Removed lines */}
        {originalLines.map((line, idx) => (
          <div
            key={`old-${idx}`}
            className="flex items-stretch bg-red-500/10"
          >
            <span className="w-8 px-2 py-0.5 text-right text-red-400 select-none border-r border-border/50">
              -
            </span>
            <span className="flex-1 px-3 py-0.5 text-red-400 whitespace-pre">
              {line}
            </span>
          </div>
        ))}

        {/* Added lines */}
        {suggestedLines.map((line, idx) => (
          <div
            key={`new-${idx}`}
            className="flex items-stretch bg-green-500/10"
          >
            <span className="w-8 px-2 py-0.5 text-right text-green-400 select-none border-r border-border/50">
              +
            </span>
            <span className="flex-1 px-3 py-0.5 text-green-400 whitespace-pre">
              {line}
            </span>
          </div>
        ))}
      </div>

      {/* Actions */}
      {!isApplied && (
        <div className="flex items-center justify-end gap-2 px-3 py-2 bg-muted/30 border-t border-border/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="text-muted-foreground"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 mr-1" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </>
            )}
          </Button>

          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="text-muted-foreground"
            >
              <X className="h-4 w-4 mr-1" />
              Dismiss
            </Button>
          )}

          {canApply && onApply && (
            <Button
              size="sm"
              onClick={onApply}
              disabled={isApplying}
              className="bg-primary/90 hover:bg-primary"
            >
              <Check className="h-4 w-4 mr-1" />
              {isApplying ? 'Applying...' : 'Apply suggestion'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
