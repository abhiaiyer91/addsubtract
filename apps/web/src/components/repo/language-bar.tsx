/**
 * Language Bar Component
 * 
 * Displays GitHub-style language breakdown with:
 * - Horizontal color bar showing proportions
 * - Legend with language names, colors, and percentages
 */

import { cn } from '@/lib/utils';

export interface LanguageStats {
  language: string;
  bytes: number;
  percentage: number;
  color: string;
}

interface LanguageBarProps {
  languages: LanguageStats[];
  className?: string;
  /** Show only the color bar, no legend */
  compact?: boolean;
  /** Maximum number of languages to show in legend (others grouped as "Other") */
  maxLanguages?: number;
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LanguageBar({ 
  languages, 
  className,
  compact = false,
  maxLanguages = 6,
}: LanguageBarProps) {
  if (!languages || languages.length === 0) {
    return null;
  }

  // Prepare display languages - group small languages as "Other" if needed
  let displayLanguages = languages;
  let otherPercentage = 0;
  let otherBytes = 0;

  if (languages.length > maxLanguages) {
    displayLanguages = languages.slice(0, maxLanguages - 1);
    const others = languages.slice(maxLanguages - 1);
    otherPercentage = others.reduce((sum, l) => sum + l.percentage, 0);
    otherBytes = others.reduce((sum, l) => sum + l.bytes, 0);
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Color bar */}
      <div 
        className="h-2 rounded-full overflow-hidden flex"
        role="img"
        aria-label="Language breakdown"
      >
        {languages.map((lang, index) => (
          <div
            key={lang.language}
            className={cn(
              'h-full transition-all',
              index === 0 && 'rounded-l-full',
              index === languages.length - 1 && 'rounded-r-full'
            )}
            style={{
              backgroundColor: lang.color,
              width: `${lang.percentage}%`,
            }}
            title={`${lang.language}: ${lang.percentage.toFixed(1)}%`}
          />
        ))}
      </div>

      {/* Legend */}
      {!compact && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {displayLanguages.map((lang) => (
            <div 
              key={lang.language} 
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: lang.color }}
              />
              <span className="font-medium text-foreground">{lang.language}</span>
              <span>{lang.percentage.toFixed(1)}%</span>
            </div>
          ))}
          {otherPercentage > 0 && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="w-3 h-3 rounded-full shrink-0 bg-muted-foreground/50"
              />
              <span className="font-medium text-foreground">Other</span>
              <span>{otherPercentage.toFixed(1)}%</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Single language dot indicator for compact displays (e.g., repo cards)
 */
interface LanguageDotProps {
  language: LanguageStats;
  showLabel?: boolean;
  className?: string;
}

export function LanguageDot({ language, showLabel = true, className }: LanguageDotProps) {
  return (
    <div className={cn('flex items-center gap-1.5 text-xs', className)}>
      <span
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: language.color }}
      />
      {showLabel && (
        <span className="text-muted-foreground">{language.language}</span>
      )}
    </div>
  );
}

/**
 * Detailed language list with byte counts
 */
interface LanguageListProps {
  languages: LanguageStats[];
  className?: string;
}

export function LanguageList({ languages, className }: LanguageListProps) {
  if (!languages || languages.length === 0) {
    return null;
  }

  return (
    <div className={cn('space-y-2', className)}>
      {languages.map((lang) => (
        <div key={lang.language} className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: lang.color }}
          />
          <span className="flex-1 font-medium text-sm">{lang.language}</span>
          <span className="text-xs text-muted-foreground">
            {lang.percentage.toFixed(1)}%
          </span>
          <span className="text-xs text-muted-foreground w-16 text-right">
            {formatBytes(lang.bytes)}
          </span>
        </div>
      ))}
    </div>
  );
}
