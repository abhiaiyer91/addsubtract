import { useState, useEffect } from 'react';
import { Loader2, GitBranch, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { trpc } from '@/lib/trpc';

interface Branch {
  name: string;
  sha: string;
  isDefault: boolean;
}

interface PRFormProps {
  branches: Branch[];
  defaultBranch: string;
  repoId?: string;
  onSubmit: (data: {
    title: string;
    body: string;
    sourceBranch: string;
    targetBranch: string;
    isDraft: boolean;
  }) => Promise<void> | void;
  isLoading?: boolean;
  error?: string | null;
}

export function PRForm({ branches, defaultBranch, repoId, onSubmit, isLoading, error }: PRFormProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sourceBranch, setSourceBranch] = useState('');
  const [targetBranch, setTargetBranch] = useState(defaultBranch);
  const [isDraft, setIsDraft] = useState(false);

  // AI generation mutation
  const generateMutation = trpc.ai.generatePRDescription.useMutation();

  // Check if AI is available
  const { data: aiStatus } = trpc.ai.status.useQuery();
  const aiAvailable = aiStatus?.available ?? false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({ title, body, sourceBranch, targetBranch, isDraft });
  };

  // Filter out the target branch from source options
  const sourceBranches = branches.filter(b => b.name !== targetBranch);
  const targetBranches = branches.filter(b => b.name !== sourceBranch);

  // Find the selected branches to get their SHAs
  const selectedSource = branches.find(b => b.name === sourceBranch);
  const selectedTarget = branches.find(b => b.name === targetBranch);

  const canSubmit = title.trim() && sourceBranch && targetBranch && sourceBranch !== targetBranch;

  // Can generate if we have both branches selected and a repoId
  const canGenerate = repoId && selectedSource && selectedTarget && sourceBranch !== targetBranch;

  const handleGenerateWithAI = async (generateBoth: boolean = true) => {
    if (!canGenerate || !repoId || !selectedSource || !selectedTarget) return;

    try {
      const result = await generateMutation.mutateAsync({
        repoId,
        sourceBranch,
        targetBranch,
        headSha: selectedSource.sha,
        baseSha: selectedTarget.sha,
        existingTitle: generateBoth ? undefined : title,
        existingDescription: generateBoth ? undefined : body,
      });

      if (generateBoth || !title) {
        setTitle(result.title);
      }
      setBody(result.description);
    } catch (err) {
      console.error('Failed to generate PR description:', err);
    }
  };

  // Keyboard shortcut: Cmd+Shift+G to generate
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'g') {
        e.preventDefault();
        if (canGenerate && aiAvailable) {
          handleGenerateWithAI(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canGenerate, aiAvailable, repoId, selectedSource, selectedTarget, sourceBranch, targetBranch]);

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader>
          <CardTitle>Open a pull request</CardTitle>
          <CardDescription>
            Create a pull request to merge your changes into the target branch
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
              {error}
            </div>
          )}

          {/* Branch selection */}
          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="target-branch">Base branch</Label>
              <Select value={targetBranch} onValueChange={setTargetBranch} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder="Select base branch">
                    <span className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4" />
                      {targetBranch || 'Select branch'}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {targetBranches.map((branch) => (
                    <SelectItem key={branch.name} value={branch.name}>
                      <span className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4" />
                        {branch.name}
                        {branch.isDefault && (
                          <span className="text-xs text-muted-foreground">(default)</span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ArrowRight className="h-5 w-5 text-muted-foreground mt-6" />

            <div className="flex-1 space-y-2">
              <Label htmlFor="source-branch">Compare branch</Label>
              <Select value={sourceBranch} onValueChange={setSourceBranch} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder="Select compare branch">
                    <span className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4" />
                      {sourceBranch || 'Select branch'}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {sourceBranches.map((branch) => (
                    <SelectItem key={branch.name} value={branch.name}>
                      <span className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4" />
                        {branch.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Show commit info if branches are selected */}
          {selectedSource && selectedTarget && (
            <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
              Comparing <code className="bg-muted px-1 rounded">{selectedSource.sha.slice(0, 7)}</code> on{' '}
              <code className="bg-muted px-1 rounded">{sourceBranch}</code> with{' '}
              <code className="bg-muted px-1 rounded">{selectedTarget.sha.slice(0, 7)}</code> on{' '}
              <code className="bg-muted px-1 rounded">{targetBranch}</code>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="title">Title</Label>
              {aiAvailable && canGenerate && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs gap-1"
                        onClick={() => handleGenerateWithAI(true)}
                        disabled={isLoading || generateMutation.isPending}
                      >
                        {generateMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        Generate with AI
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Generate title and description from changes (Cmd+Shift+G)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <Input
              id="title"
              placeholder="Pull request title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={isLoading || generateMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="body">Description</Label>
              {aiAvailable && canGenerate && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs gap-1"
                        onClick={() => handleGenerateWithAI(false)}
                        disabled={isLoading || generateMutation.isPending}
                      >
                        {generateMutation.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Sparkles className="h-3 w-3" />
                        )}
                        Generate description
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Generate description from changes (keeps existing title)</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <Textarea
              id="body"
              placeholder="Describe your changes..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              disabled={isLoading || generateMutation.isPending}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Supports Markdown formatting
              </p>
              {generateMutation.isError && (
                <p className="text-xs text-destructive">
                  Failed to generate. Please try again.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="draft"
              checked={isDraft}
              onCheckedChange={(checked) => setIsDraft(checked === true)}
              disabled={isLoading}
            />
            <Label htmlFor="draft" className="font-normal">
              Create as draft pull request
            </Label>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || !canSubmit}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isDraft ? 'Create draft pull request' : 'Create pull request'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
