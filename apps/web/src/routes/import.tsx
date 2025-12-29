import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Github,
  Lock,
  Globe,
  Tag,
  GitPullRequest,
  CircleDot,
  Milestone,
  Package,
  ArrowRight,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Loading } from '@/components/ui/loading';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { trpc } from '@/lib/trpc';
import { useSession } from '@/lib/auth-client';
import { toastSuccess, toastError } from '@/components/ui/use-toast';

interface ImportOptions {
  repository: boolean;
  issues: boolean;
  pullRequests: boolean;
  labels: boolean;
  milestones: boolean;
  releases: boolean;
}

export function ImportPage() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionLoading } = useSession();
  const user = session?.user;

  const [repoUrl, setRepoUrl] = useState('');
  const [customName, setCustomName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    repository: true,
    issues: true,
    pullRequests: true,
    labels: true,
    milestones: true,
    releases: true,
  });
  const [step, setStep] = useState<'input' | 'preview' | 'importing' | 'complete'>('input');
  const [importProgress, setImportProgress] = useState(0);

  // Preview query
  const previewQuery = trpc.githubImport.preview.useQuery(
    { repo: repoUrl },
    { 
      enabled: false,
      retry: false,
    }
  );

  // Import mutation
  const importMutation = trpc.githubImport.import.useMutation({
    onSuccess: (result) => {
      setStep('complete');
      toastSuccess({
        title: 'Import successful!',
        description: `${result.repoName} has been imported with ${result.summary.issuesImported} issues and ${result.summary.pullRequestsImported} PRs.`,
      });
    },
    onError: (error) => {
      toastError({
        title: 'Import failed',
        description: error.message,
      });
      setStep('preview');
    },
  });

  if (sessionLoading) {
    return <Loading text="Loading..." />;
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">
              You need to be logged in to import a repository.
            </p>
            <Button className="mt-4" onClick={() => navigate('/login')}>
              Sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handlePreview = async () => {
    if (!repoUrl.trim()) {
      toastError({
        title: 'Repository required',
        description: 'Please enter a GitHub repository URL or owner/repo.',
      });
      return;
    }

    const result = await previewQuery.refetch();
    if (result.data) {
      setStep('preview');
    }
  };

  const handleImport = () => {
    setStep('importing');
    setImportProgress(0);

    // Simulate progress (actual progress would come from server-sent events in a real implementation)
    const interval = setInterval(() => {
      setImportProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          return prev;
        }
        return prev + 10;
      });
    }, 500);

    importMutation.mutate({
      repo: repoUrl,
      name: customName || undefined,
      isPrivate,
      import: importOptions,
    });
  };

  const toggleOption = (key: keyof ImportOptions) => {
    setImportOptions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const preview = previewQuery.data;

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Github className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">Import from GitHub</h1>
        </div>
        <p className="text-muted-foreground">
          Migrate your repository from GitHub to wit, including issues, pull requests, and more.
        </p>
      </div>

      {/* Step 1: Input */}
      {step === 'input' && (
        <Card>
          <CardHeader>
            <CardTitle>Enter GitHub Repository</CardTitle>
            <CardDescription>
              Paste a GitHub URL or enter the repository in owner/repo format.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="repo">GitHub Repository *</Label>
              <div className="flex gap-2">
                <Input
                  id="repo"
                  placeholder="owner/repo or https://github.com/owner/repo"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={handlePreview}
                  disabled={!repoUrl.trim() || previewQuery.isFetching}
                >
                  {previewQuery.isFetching ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Examples: facebook/react, https://github.com/vercel/next.js
              </p>
            </div>

            {previewQuery.error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {previewQuery.error.message}
                </AlertDescription>
              </Alert>
            )}

            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-3">
                Need to import a private repository?
              </p>
              <Button variant="outline" size="sm" asChild>
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="mr-2 h-4 w-4" />
                  Generate GitHub Token
                  <ExternalLink className="ml-2 h-3 w-3" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && preview && (
        <div className="space-y-6">
          {/* Repository Info */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {preview.repository.fullName}
                    {preview.repository.private ? (
                      <Badge variant="secondary" className="gap-1">
                        <Lock className="h-3 w-3" />
                        Private
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <Globe className="h-3 w-3" />
                        Public
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {preview.repository.description || 'No description'}
                  </CardDescription>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <div>⭐ {preview.repository.stars.toLocaleString()}</div>
                  <div>🍴 {preview.repository.forks.toLocaleString()}</div>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* What will be imported */}
          <Card>
            <CardHeader>
              <CardTitle>What to import</CardTitle>
              <CardDescription>
                Select the data you want to import from GitHub.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors">
                  <Checkbox
                    checked={importOptions.repository}
                    onCheckedChange={() => toggleOption('repository')}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      Git Repository
                    </div>
                    <p className="text-xs text-muted-foreground">Commits, branches, tags</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors">
                  <Checkbox
                    checked={importOptions.issues}
                    onCheckedChange={() => toggleOption('issues')}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <CircleDot className="h-4 w-4 text-muted-foreground" />
                      Issues
                    </div>
                    <p className="text-xs text-muted-foreground">{preview.counts.issues} issues</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors">
                  <Checkbox
                    checked={importOptions.pullRequests}
                    onCheckedChange={() => toggleOption('pullRequests')}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <GitPullRequest className="h-4 w-4 text-muted-foreground" />
                      Pull Requests
                    </div>
                    <p className="text-xs text-muted-foreground">{preview.counts.pullRequests} PRs</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors">
                  <Checkbox
                    checked={importOptions.labels}
                    onCheckedChange={() => toggleOption('labels')}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      Labels
                    </div>
                    <p className="text-xs text-muted-foreground">{preview.counts.labels} labels</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors">
                  <Checkbox
                    checked={importOptions.milestones}
                    onCheckedChange={() => toggleOption('milestones')}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Milestone className="h-4 w-4 text-muted-foreground" />
                      Milestones
                    </div>
                    <p className="text-xs text-muted-foreground">{preview.counts.milestones} milestones</p>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors">
                  <Checkbox
                    checked={importOptions.releases}
                    onCheckedChange={() => toggleOption('releases')}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      Releases
                    </div>
                    <p className="text-xs text-muted-foreground">{preview.counts.releases} releases</p>
                  </div>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Import Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Import Settings</CardTitle>
              <CardDescription>
                Customize how the repository will be imported.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Repository Name</Label>
                <Input
                  id="name"
                  placeholder={preview.repository.name}
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave blank to use "{preview.repository.name}"
                </p>
              </div>

              <div className="space-y-3">
                <Label>Visibility</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      checked={!isPrivate}
                      onChange={() => setIsPrivate(false)}
                    />
                    <Globe className="h-4 w-4" />
                    <span>Public</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="visibility"
                      checked={isPrivate}
                      onChange={() => setIsPrivate(true)}
                    />
                    <Lock className="h-4 w-4" />
                    <span>Private</span>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('input')}>
              Back
            </Button>
            <Button onClick={handleImport} className="gap-2">
              <Github className="h-4 w-4" />
              Start Import
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Importing */}
      {step === 'importing' && (
        <Card>
          <CardContent className="p-8 text-center space-y-6">
            <div className="flex justify-center">
              <div className="p-4 rounded-full bg-primary/10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-2">Importing from GitHub...</h2>
              <p className="text-muted-foreground">
                This may take a few minutes for large repositories.
              </p>
            </div>
            <div className="max-w-md mx-auto space-y-2">
              <Progress value={importProgress} />
              <p className="text-sm text-muted-foreground">
                {importProgress < 30 && 'Cloning repository...'}
                {importProgress >= 30 && importProgress < 60 && 'Importing issues and PRs...'}
                {importProgress >= 60 && importProgress < 90 && 'Importing labels and milestones...'}
                {importProgress >= 90 && 'Finalizing import...'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Complete */}
      {step === 'complete' && importMutation.data && (
        <Card>
          <CardContent className="p-8 text-center space-y-6">
            <div className="flex justify-center">
              <div className="p-4 rounded-full bg-green-500/10">
                <Check className="h-8 w-8 text-green-500" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-semibold mb-2">Import Complete!</h2>
              <p className="text-muted-foreground">
                Your repository has been successfully imported to wit.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto text-center">
              {importMutation.data.summary.issuesImported > 0 && (
                <div className="p-3 rounded-lg bg-muted">
                  <div className="text-2xl font-bold">{importMutation.data.summary.issuesImported}</div>
                  <div className="text-xs text-muted-foreground">Issues</div>
                </div>
              )}
              {importMutation.data.summary.pullRequestsImported > 0 && (
                <div className="p-3 rounded-lg bg-muted">
                  <div className="text-2xl font-bold">{importMutation.data.summary.pullRequestsImported}</div>
                  <div className="text-xs text-muted-foreground">PRs</div>
                </div>
              )}
              {importMutation.data.summary.releasesImported > 0 && (
                <div className="p-3 rounded-lg bg-muted">
                  <div className="text-2xl font-bold">{importMutation.data.summary.releasesImported}</div>
                  <div className="text-xs text-muted-foreground">Releases</div>
                </div>
              )}
            </div>

            {importMutation.data.errors.length > 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {importMutation.data.errors.length} warnings during import.
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm">Show details</summary>
                    <ul className="mt-2 text-xs text-left space-y-1">
                      {importMutation.data.errors.map((err, i) => (
                        <li key={i}>• {err}</li>
                      ))}
                    </ul>
                  </details>
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => navigate('/new')}>
                Import Another
              </Button>
              <Button onClick={() => navigate(`/${user?.username}/${importMutation.data?.repoName}`)}>
                View Repository
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
