import { useState } from 'react';
import {
  Bot,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  Shield,
  FileCode,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn, formatRelativeTime } from '@/lib/utils';

interface AIReviewIssue {
  severity: 'error' | 'warning' | 'info';
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
  category?: string;
}

interface AIReviewData {
  id: string;
  type: 'review' | 'comment';
  body: string | null;
  state: string | null;
  createdAt: Date;
}

interface AiReviewCardProps {
  data: AIReviewData | null | undefined;
  isLoading: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
  authenticated: boolean;
  className?: string;
}

// Parse the markdown body to extract structured data
function parseReviewBody(body: string | null): {
  title: string;
  summary: string;
  score: number | null;
  securityConcerns: string[];
  errors: AIReviewIssue[];
  warnings: AIReviewIssue[];
  suggestions: AIReviewIssue[];
  recommendations: string[];
  isCodeRabbit: boolean;
} {
  if (!body) {
    return {
      title: 'AI Review',
      summary: '',
      score: null,
      securityConcerns: [],
      errors: [],
      warnings: [],
      suggestions: [],
      recommendations: [],
      isCodeRabbit: false,
    };
  }

  const lines = body.split('\n');
  let title = 'AI Review';
  let summary = '';
  let score: number | null = null;
  const securityConcerns: string[] = [];
  const errors: AIReviewIssue[] = [];
  const warnings: AIReviewIssue[] = [];
  const suggestions: AIReviewIssue[] = [];
  const recommendations: string[] = [];
  let currentSection = '';
  const isCodeRabbit = body.includes('CodeRabbit');

  for (const line of lines) {
    const trimmed = line.trim();

    // Parse title
    if (trimmed.startsWith('## AI Review:')) {
      title = trimmed.replace('## ', '');
      continue;
    }

    // Parse score
    const scoreMatch = trimmed.match(/\*\*Score:\*\*\s*(\d+)\/10/);
    if (scoreMatch) {
      score = parseInt(scoreMatch[1], 10);
      continue;
    }

    // Detect sections
    if (trimmed.startsWith('### Security Concerns')) {
      currentSection = 'security';
      continue;
    }
    if (trimmed.startsWith('### Errors')) {
      currentSection = 'errors';
      continue;
    }
    if (trimmed.startsWith('### Warnings')) {
      currentSection = 'warnings';
      continue;
    }
    if (trimmed.startsWith('### Suggestions')) {
      currentSection = 'suggestions';
      continue;
    }
    if (trimmed.startsWith('### General Recommendations')) {
      currentSection = 'recommendations';
      continue;
    }
    if (trimmed.startsWith('---')) {
      currentSection = '';
      continue;
    }
    if (trimmed.startsWith('*Powered by') || trimmed.startsWith('*This review')) {
      continue;
    }

    // Parse list items
    if (trimmed.startsWith('- ') && currentSection) {
      const content = trimmed.slice(2);

      if (currentSection === 'security') {
        securityConcerns.push(content);
      } else if (currentSection === 'recommendations') {
        recommendations.push(content);
      } else if (currentSection === 'errors' || currentSection === 'warnings' || currentSection === 'suggestions') {
        // Parse issue format: **file:line**: message
        const issueMatch = content.match(/\*\*([^*]+)\*\*:\s*(.+)/);
        if (issueMatch) {
          const [, fileLocation, message] = issueMatch;
          const [file, lineStr] = fileLocation.split(':');
          const issue: AIReviewIssue = {
            severity: currentSection === 'errors' ? 'error' : currentSection === 'warnings' ? 'warning' : 'info',
            file: file || fileLocation,
            line: lineStr ? parseInt(lineStr, 10) : undefined,
            message,
          };

          if (currentSection === 'errors') errors.push(issue);
          else if (currentSection === 'warnings') warnings.push(issue);
          else suggestions.push(issue);
        }
      }
    }

    // Parse suggestion lines (indented with *Suggestion:*)
    if (trimmed.startsWith('- *Suggestion:*')) {
      const suggestion = trimmed.replace('- *Suggestion:*', '').trim();
      const targetArray = currentSection === 'errors' ? errors : currentSection === 'warnings' ? warnings : suggestions;
      if (targetArray.length > 0) {
        targetArray[targetArray.length - 1].suggestion = suggestion;
      }
    }

    // Capture summary (non-section text after title)
    if (!currentSection && trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('**Score') && !trimmed.startsWith('*')) {
      if (!summary) {
        summary = trimmed;
      }
    }
  }

  return {
    title,
    summary,
    score,
    securityConcerns,
    errors,
    warnings,
    suggestions,
    recommendations,
    isCodeRabbit,
  };
}

function IssueItem({ issue, onFileClick }: { issue: AIReviewIssue; onFileClick?: (file: string, line?: number) => void }) {
  const Icon = issue.severity === 'error' ? AlertCircle : issue.severity === 'warning' ? AlertTriangle : Info;
  const colorClass = issue.severity === 'error' 
    ? 'text-destructive' 
    : issue.severity === 'warning' 
    ? 'text-yellow-500' 
    : 'text-blue-500';

  return (
    <div className="flex gap-2 py-2 border-b last:border-0">
      <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', colorClass)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onFileClick?.(issue.file, issue.line)}
            className="text-xs font-mono text-primary hover:underline flex items-center gap-1"
          >
            <FileCode className="h-3 w-3" />
            {issue.file}{issue.line ? `:${issue.line}` : ''}
          </button>
          {issue.category && (
            <Badge variant="outline" className="text-[10px] px-1 py-0">
              {issue.category}
            </Badge>
          )}
        </div>
        <p className="text-sm mt-1">{issue.message}</p>
        {issue.suggestion && (
          <p className="text-xs text-muted-foreground mt-1 italic">
            Suggestion: {issue.suggestion}
          </p>
        )}
      </div>
    </div>
  );
}

function IssueSection({ 
  title, 
  issues, 
  icon: Icon,
  defaultOpen = false,
  onFileClick,
}: { 
  title: string; 
  issues: AIReviewIssue[]; 
  icon: React.ElementType;
  defaultOpen?: boolean;
  onFileClick?: (file: string, line?: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (issues.length === 0) return null;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button className="flex items-center justify-between w-full py-2 hover:bg-muted/50 rounded px-2 -mx-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            <span className="font-medium text-sm">{title}</span>
            <Badge variant="secondary" className="text-xs">
              {issues.length}
            </Badge>
          </div>
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-6 mt-1">
          {issues.map((issue, idx) => (
            <IssueItem key={idx} issue={issue} onFileClick={onFileClick} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AiReviewCard({
  data,
  isLoading,
  onRefresh,
  isRefreshing,
  authenticated,
  className,
}: AiReviewCardProps) {
  const parsed = parseReviewBody(data?.body || null);
  const hasIssues = parsed.errors.length > 0 || parsed.warnings.length > 0 || parsed.suggestions.length > 0;
  const isApproved = parsed.title.includes('Approved');
  
  // Score color
  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-muted-foreground';
    if (score >= 8) return 'text-green-500';
    if (score >= 5) return 'text-yellow-500';
    return 'text-destructive';
  };

  const handleFileClick = (file: string, line?: number) => {
    // TODO: Navigate to file in diff viewer
    console.log('Navigate to:', file, line);
  };

  return (
    <Card className={cn('overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/30 border-b">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10">
              <Bot className="h-4 w-4 text-primary" />
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">
                {parsed.isCodeRabbit ? 'CodeRabbit' : 'AI Review'}
              </span>
              {data?.state && (
                <Badge 
                  variant={isApproved ? 'success' : 'warning'} 
                  className="text-xs"
                >
                  {isApproved ? 'Approved' : 'Changes Requested'}
                </Badge>
              )}
            </div>
            {data?.createdAt && (
              <span className="text-xs text-muted-foreground">
                reviewed {formatRelativeTime(new Date(data.createdAt))}
              </span>
            )}
          </div>
        </div>
        {authenticated && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="gap-2"
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Re-run
          </Button>
        )}
      </div>

      <CardContent className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data?.body ? (
          <div className="space-y-4">
            {/* Summary and Score */}
            <div className="flex items-start justify-between gap-4">
              <p className="text-sm text-muted-foreground flex-1">
                {parsed.summary}
              </p>
              {parsed.score !== null && (
                <div className="text-right shrink-0">
                  <div className={cn('text-2xl font-bold', getScoreColor(parsed.score))}>
                    {parsed.score}/10
                  </div>
                  <div className="text-xs text-muted-foreground">Score</div>
                </div>
              )}
            </div>

            {/* Security Concerns */}
            {parsed.securityConcerns.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <div className="flex items-center gap-2 text-destructive mb-2">
                  <Shield className="h-4 w-4" />
                  <span className="font-medium text-sm">Security Concerns</span>
                </div>
                <ul className="space-y-1">
                  {parsed.securityConcerns.map((concern, idx) => (
                    <li key={idx} className="text-sm text-destructive/90 flex items-start gap-2">
                      <span className="text-destructive mt-1.5">-</span>
                      {concern}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Issue Sections */}
            {hasIssues && (
              <div className="space-y-1 border rounded-lg p-3">
                <IssueSection
                  title="Errors"
                  issues={parsed.errors}
                  icon={AlertCircle}
                  defaultOpen={true}
                  onFileClick={handleFileClick}
                />
                <IssueSection
                  title="Warnings"
                  issues={parsed.warnings}
                  icon={AlertTriangle}
                  defaultOpen={parsed.errors.length === 0}
                  onFileClick={handleFileClick}
                />
                <IssueSection
                  title="Suggestions"
                  issues={parsed.suggestions}
                  icon={Info}
                  onFileClick={handleFileClick}
                />
              </div>
            )}

            {/* Recommendations */}
            {parsed.recommendations.length > 0 && (
              <div className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span className="font-medium text-sm">Recommendations</span>
                </div>
                <ul className="space-y-1">
                  {parsed.recommendations.map((rec, idx) => (
                    <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-0.5">-</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* No issues found */}
            {!hasIssues && parsed.securityConcerns.length === 0 && (
              <div className="flex items-center gap-2 text-green-600 bg-green-500/10 rounded-lg p-3">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">No issues found! Your code looks great.</span>
              </div>
            )}

            {/* Footer */}
            {parsed.isCodeRabbit && (
              <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground pt-2 border-t">
                <span>Powered by</span>
                <a 
                  href="https://coderabbit.ai" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  CodeRabbit
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <Bot className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground mb-3">
              {authenticated 
                ? 'No AI review yet. Run a review to get automated feedback on your code.'
                : 'Sign in to run AI code review'}
            </p>
            {authenticated && (
              <Button onClick={onRefresh} disabled={isRefreshing}>
                {isRefreshing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Running review...
                  </>
                ) : (
                  <>
                    <Bot className="h-4 w-4 mr-2" />
                    Run AI Review
                  </>
                )}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
