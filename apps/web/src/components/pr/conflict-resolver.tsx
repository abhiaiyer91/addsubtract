import { useState, useCallback } from 'react';
import {
  GitMerge,
  AlertTriangle,
  Check,
  X,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Copy,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';

interface ConflictInfo {
  filePath: string;
  oursContent: string;
  theirsContent: string;
  baseContent: string | null;
  conflictMarkers: string;
}

interface ConflictResolverProps {
  prId: string;
  conflicts: ConflictInfo[];
  sourceBranch: string;
  targetBranch: string;
  onResolved?: () => void;
}

type ResolutionChoice = 'ours' | 'theirs' | 'ai' | 'manual';

interface FileResolution {
  choice: ResolutionChoice;
  content: string;
}

export function ConflictResolver({
  prId,
  conflicts,
  sourceBranch,
  targetBranch,
  onResolved,
}: ConflictResolverProps) {
  const [resolutions, setResolutions] = useState<Record<string, FileResolution>>({});
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set(conflicts.map(c => c.filePath)));
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, { content: string; explanation: string }>>({});

  // Check if AI is available
  const { data: aiStatus } = trpc.ai.status.useQuery();
  const aiAvailable = aiStatus?.available ?? false;

  // AI suggestion mutation
  const suggestMutation = trpc.ai.suggestConflictResolution.useMutation();

  const toggleFile = useCallback((filePath: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  const setResolution = useCallback((filePath: string, choice: ResolutionChoice, content: string) => {
    setResolutions(prev => ({
      ...prev,
      [filePath]: { choice, content },
    }));
  }, []);

  const handleGetAISuggestion = useCallback(async (conflict: ConflictInfo) => {
    if (!aiAvailable) return;

    try {
      const result = await suggestMutation.mutateAsync({
        prId,
        filePath: conflict.filePath,
        oursContent: conflict.oursContent,
        theirsContent: conflict.theirsContent,
        baseContent: conflict.baseContent || undefined,
      });

      setAiSuggestions(prev => ({
        ...prev,
        [conflict.filePath]: {
          content: result.suggestedResolution,
          explanation: result.explanation,
        },
      }));

      // Auto-select AI suggestion
      setResolution(conflict.filePath, 'ai', result.suggestedResolution);
    } catch (error) {
      console.error('Failed to get AI suggestion:', error);
    }
  }, [prId, aiAvailable, suggestMutation, setResolution]);

  const handleApplyAllAI = useCallback(async () => {
    for (const conflict of conflicts) {
      if (!aiSuggestions[conflict.filePath]) {
        await handleGetAISuggestion(conflict);
      } else {
        setResolution(conflict.filePath, 'ai', aiSuggestions[conflict.filePath].content);
      }
    }
  }, [conflicts, aiSuggestions, handleGetAISuggestion, setResolution]);

  const resolvedCount = Object.keys(resolutions).length;
  const allResolved = resolvedCount === conflicts.length;

  if (conflicts.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <p className="text-lg font-medium">No conflicts detected</p>
          <p className="text-muted-foreground">This pull request can be merged without conflicts.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Resolve Merge Conflicts</CardTitle>
                <CardDescription>
                  {conflicts.length} file{conflicts.length !== 1 ? 's' : ''} with conflicts
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {aiAvailable && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleApplyAllAI}
                  disabled={suggestMutation.isPending}
                  className="gap-2"
                >
                  {suggestMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Apply All AI Suggestions
                </Button>
              )}
              <Badge variant={allResolved ? 'success' : 'secondary'}>
                {resolvedCount}/{conflicts.length} resolved
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Branch info */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground px-1">
        <code className="px-2 py-1 bg-muted rounded">{targetBranch}</code>
        <ArrowRight className="h-4 w-4" />
        <code className="px-2 py-1 bg-muted rounded">{sourceBranch}</code>
      </div>

      {/* Conflict files */}
      <div className="space-y-3">
        {conflicts.map((conflict) => (
          <ConflictFileCard
            key={conflict.filePath}
            conflict={conflict}
            resolution={resolutions[conflict.filePath]}
            aiSuggestion={aiSuggestions[conflict.filePath]}
            isExpanded={expandedFiles.has(conflict.filePath)}
            aiAvailable={aiAvailable}
            isLoadingAI={suggestMutation.isPending}
            targetBranch={targetBranch}
            sourceBranch={sourceBranch}
            onToggle={() => toggleFile(conflict.filePath)}
            onResolve={(choice, content) => setResolution(conflict.filePath, choice, content)}
            onRequestAI={() => handleGetAISuggestion(conflict)}
          />
        ))}
      </div>

      {/* Actions */}
      {allResolved && (
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Check className="h-5 w-5 text-green-500" />
                <span className="font-medium">All conflicts resolved</span>
              </div>
              <Button onClick={onResolved} className="gap-2">
                <GitMerge className="h-4 w-4" />
                Continue to Merge
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface ConflictFileCardProps {
  conflict: ConflictInfo;
  resolution?: FileResolution;
  aiSuggestion?: { content: string; explanation: string };
  isExpanded: boolean;
  aiAvailable: boolean;
  isLoadingAI: boolean;
  targetBranch: string;
  sourceBranch: string;
  onToggle: () => void;
  onResolve: (choice: ResolutionChoice, content: string) => void;
  onRequestAI: () => void;
}

function ConflictFileCard({
  conflict,
  resolution,
  aiSuggestion,
  isExpanded,
  aiAvailable,
  isLoadingAI,
  targetBranch,
  sourceBranch,
  onToggle,
  onResolve,
  onRequestAI,
}: ConflictFileCardProps) {
  const [manualContent, setManualContent] = useState(conflict.conflictMarkers);

  const isResolved = !!resolution;

  return (
    <Card className={cn(isResolved && 'border-green-500/30')}>
      {/* File header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/50"
        onClick={onToggle}
      >
        <Button variant="ghost" size="icon" className="h-6 w-6 p-0">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
        <span className="font-mono text-sm flex-1">{conflict.filePath}</span>
        {isResolved && (
          <Badge variant="success" className="gap-1">
            <Check className="h-3 w-3" />
            {resolution.choice === 'ai' ? 'AI' : resolution.choice === 'manual' ? 'Manual' : resolution.choice === 'ours' ? targetBranch : sourceBranch}
          </Badge>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <CardContent className="pt-0 space-y-4">
          {/* Three-way view */}
          <Tabs defaultValue="comparison">
            <TabsList>
              <TabsTrigger value="comparison">Comparison</TabsTrigger>
              <TabsTrigger value="base" disabled={!conflict.baseContent}>Base</TabsTrigger>
              <TabsTrigger value="ours">{targetBranch}</TabsTrigger>
              <TabsTrigger value="theirs">{sourceBranch}</TabsTrigger>
              {aiSuggestion && <TabsTrigger value="ai">AI Suggestion</TabsTrigger>}
            </TabsList>

            <TabsContent value="comparison" className="mt-4">
              <div className="grid grid-cols-3 gap-2">
                {/* Base */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">BASE</div>
                  <div className="bg-muted/50 rounded-md p-3 font-mono text-xs overflow-auto max-h-64">
                    <pre className="whitespace-pre-wrap">{conflict.baseContent || '(no common ancestor)'}</pre>
                  </div>
                </div>
                {/* Ours */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">{targetBranch.toUpperCase()}</div>
                  <div className="bg-blue-500/5 border border-blue-500/20 rounded-md p-3 font-mono text-xs overflow-auto max-h-64">
                    <pre className="whitespace-pre-wrap">{conflict.oursContent}</pre>
                  </div>
                </div>
                {/* Theirs */}
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground">{sourceBranch.toUpperCase()}</div>
                  <div className="bg-purple-500/5 border border-purple-500/20 rounded-md p-3 font-mono text-xs overflow-auto max-h-64">
                    <pre className="whitespace-pre-wrap">{conflict.theirsContent}</pre>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="base" className="mt-4">
              <CodeBlock content={conflict.baseContent || ''} />
            </TabsContent>

            <TabsContent value="ours" className="mt-4">
              <CodeBlock content={conflict.oursContent} />
            </TabsContent>

            <TabsContent value="theirs" className="mt-4">
              <CodeBlock content={conflict.theirsContent} />
            </TabsContent>

            {aiSuggestion && (
              <TabsContent value="ai" className="mt-4 space-y-3">
                <div className="bg-primary/5 border border-primary/20 rounded-md p-3">
                  <div className="flex items-center gap-2 mb-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI Explanation
                  </div>
                  <p className="text-sm text-muted-foreground">{aiSuggestion.explanation}</p>
                </div>
                <CodeBlock content={aiSuggestion.content} />
              </TabsContent>
            )}
          </Tabs>

          {/* AI Suggestion */}
          {aiAvailable && !aiSuggestion && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onRequestAI();
              }}
              disabled={isLoadingAI}
              className="gap-2"
            >
              {isLoadingAI ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Get AI Suggestion
            </Button>
          )}

          {/* Resolution actions */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            {aiSuggestion && (
              <Button
                variant={resolution?.choice === 'ai' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onResolve('ai', aiSuggestion.content)}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Accept AI
              </Button>
            )}
            <Button
              variant={resolution?.choice === 'ours' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onResolve('ours', conflict.oursContent)}
              className="gap-2"
            >
              Use {targetBranch}
            </Button>
            <Button
              variant={resolution?.choice === 'theirs' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onResolve('theirs', conflict.theirsContent)}
              className="gap-2"
            >
              Use {sourceBranch}
            </Button>
            <Button
              variant={resolution?.choice === 'manual' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onResolve('manual', manualContent)}
              className="gap-2"
            >
              Edit Manually
            </Button>
          </div>

          {/* Manual edit area */}
          {resolution?.choice === 'manual' && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Manual Resolution</div>
              <Textarea
                value={manualContent}
                onChange={(e) => {
                  setManualContent(e.target.value);
                  onResolve('manual', e.target.value);
                }}
                className="font-mono text-xs min-h-[200px]"
              />
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function CodeBlock({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </Button>
      <div className="bg-muted/50 rounded-md p-3 font-mono text-xs overflow-auto max-h-80">
        <pre className="whitespace-pre-wrap">{content}</pre>
      </div>
    </div>
  );
}
