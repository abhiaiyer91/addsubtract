import { useState } from 'react';
import { Loader2, GitBranch, ArrowRight } from 'lucide-react';
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

interface Branch {
  name: string;
  sha: string;
  isDefault: boolean;
}

interface PRFormProps {
  branches: Branch[];
  defaultBranch: string;
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

export function PRForm({ branches, defaultBranch, onSubmit, isLoading, error }: PRFormProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sourceBranch, setSourceBranch] = useState('');
  const [targetBranch, setTargetBranch] = useState(defaultBranch);
  const [isDraft, setIsDraft] = useState(false);

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
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="Pull request title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Description</Label>
            <Textarea
              id="body"
              placeholder="Describe your changes..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Supports Markdown formatting
            </p>
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
