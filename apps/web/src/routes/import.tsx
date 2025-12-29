import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Github,
  ArrowRight,
  ExternalLink,
  Terminal,
  Link2,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { trpc } from '@/lib/trpc';
import { useSession, authClient } from '@/lib/auth-client';
import { toastSuccess, toastError } from '@/components/ui/use-toast';

interface TerminalLine {
  type: 'command' | 'output' | 'success' | 'error' | 'info';
  text: string;
}

// Terminal output component
function TerminalOutput({ lines, isRunning }: { lines: TerminalLine[]; isRunning: boolean }) {
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div className="rounded-lg border border-border bg-[#0d1117] overflow-hidden">
      {/* Terminal header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#161b22] border-b border-border">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
        </div>
        <div className="flex-1 text-center text-xs text-muted-foreground font-mono">
          wit import
        </div>
        <Terminal className="h-4 w-4 text-muted-foreground" />
      </div>
      
      {/* Terminal content */}
      <div 
        ref={terminalRef}
        className="p-4 font-mono text-sm h-[400px] overflow-y-auto"
      >
        {lines.map((line, i) => (
          <div key={i} className="leading-relaxed">
            {line.type === 'command' && (
              <div className="text-[#58a6ff]">
                <span className="text-[#7ee787]">$</span> {line.text}
              </div>
            )}
            {line.type === 'output' && (
              <div className="text-[#8b949e] pl-2">{line.text}</div>
            )}
            {line.type === 'success' && (
              <div className="text-[#7ee787] pl-2">✓ {line.text}</div>
            )}
            {line.type === 'error' && (
              <div className="text-[#f85149] pl-2">✗ {line.text}</div>
            )}
            {line.type === 'info' && (
              <div className="text-[#a371f7] pl-2">→ {line.text}</div>
            )}
          </div>
        ))}
        {isRunning && (
          <div className="text-[#8b949e] animate-pulse">▊</div>
        )}
      </div>
    </div>
  );
}

export function ImportPage() {
  const navigate = useNavigate();
  const { data: session, isPending: sessionLoading } = useSession();
  const user = session?.user;

  const [repoUrl, setRepoUrl] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [step, setStep] = useState<'input' | 'terminal' | 'complete'>('input');
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importedRepoName, setImportedRepoName] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Check if user has GitHub connected
  // @ts-expect-error - Type generation may be stale  
  const { data: githubConnection, refetch: refetchGithub } = trpc.auth.getGitHubToken.useQuery();

  // Helper to add terminal lines
  const addLine = (line: TerminalLine) => {
    setTerminalLines(prev => [...prev, line]);
  };

  // Helper to simulate typing delay
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Import mutation
  // @ts-expect-error - Type generation may be stale
  const importMutation = trpc.githubImport.import.useMutation();

  const handleStartImport = async () => {
    if (!repoUrl.trim()) {
      toastError({
        title: 'Repository required',
        description: 'Please enter a GitHub repository URL or owner/repo.',
      });
      return;
    }

    // Switch to terminal view
    setStep('terminal');
    setTerminalLines([]);
    setIsImporting(true);

    // Parse repo URL
    const repoMatch = repoUrl.match(/(?:github\.com\/)?([^\/]+\/[^\/]+?)(?:\.git)?$/);
    const repoFullName = repoMatch ? repoMatch[1] : repoUrl;

    // Simulate terminal output
    addLine({ type: 'command', text: `wit import github ${repoFullName}` });
    await delay(300);
    
    addLine({ type: 'output', text: '' });
    addLine({ type: 'info', text: `Connecting to GitHub...` });
    await delay(500);

    addLine({ type: 'output', text: `Fetching repository info for ${repoFullName}` });
    await delay(400);

    try {
      // Actually start the import
      addLine({ type: 'output', text: '' });
      addLine({ type: 'command', text: `git clone --bare https://github.com/${repoFullName}.git` });
      await delay(300);
      
      addLine({ type: 'output', text: 'Cloning into bare repository...' });
      addLine({ type: 'output', text: 'remote: Enumerating objects...' });
      await delay(200);
      addLine({ type: 'output', text: 'remote: Counting objects...' });
      await delay(200);
      addLine({ type: 'output', text: 'remote: Compressing objects...' });
      await delay(300);
      addLine({ type: 'output', text: 'Receiving objects...' });
      await delay(400);
      addLine({ type: 'output', text: 'Resolving deltas...' });
      await delay(300);

      // Determine which token to use: manual input > connected account
      const tokenToUse = githubToken || githubConnection?.token || undefined;
      
      if (!tokenToUse) {
        addLine({ type: 'error', text: 'No GitHub token available' });
        addLine({ type: 'info', text: 'Please connect your GitHub account or provide a personal access token.' });
        setIsImporting(false);
        return;
      }
      
      // Do the actual import (with 5 minute timeout)
      addLine({ type: 'info', text: 'Fetching repository data from GitHub...' });
      
      const importPromise = importMutation.mutateAsync({
        repo: repoUrl,
        token: tokenToUse,
        import: {
          repository: true,
          issues: true,
          pullRequests: true,
          labels: true,
          milestones: true,
          releases: true,
        },
      });
      
      // Add a timeout of 5 minutes
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Import timed out after 5 minutes. The repository may be too large or GitHub may be rate limiting requests. Try adding a GitHub token.')), 5 * 60 * 1000);
      });
      
      const result = await Promise.race([importPromise, timeoutPromise]);

      addLine({ type: 'success', text: 'Repository cloned successfully' });
      await delay(200);

      addLine({ type: 'output', text: '' });
      addLine({ type: 'command', text: `wit import --issues --prs --labels` });
      await delay(300);

      if (result.summary.labelsImported > 0) {
        addLine({ type: 'output', text: `Importing ${result.summary.labelsImported} labels...` });
        await delay(200);
        addLine({ type: 'success', text: `Imported ${result.summary.labelsImported} labels` });
      }

      if (result.summary.milestonesImported > 0) {
        addLine({ type: 'output', text: `Importing ${result.summary.milestonesImported} milestones...` });
        await delay(200);
        addLine({ type: 'success', text: `Imported ${result.summary.milestonesImported} milestones` });
      }

      if (result.summary.issuesImported > 0) {
        addLine({ type: 'output', text: `Importing ${result.summary.issuesImported} issues...` });
        await delay(300);
        addLine({ type: 'success', text: `Imported ${result.summary.issuesImported} issues` });
      }

      if (result.summary.pullRequestsImported > 0) {
        addLine({ type: 'output', text: `Importing ${result.summary.pullRequestsImported} pull requests...` });
        await delay(300);
        addLine({ type: 'success', text: `Imported ${result.summary.pullRequestsImported} pull requests` });
      }

      if (result.summary.releasesImported > 0) {
        addLine({ type: 'output', text: `Importing ${result.summary.releasesImported} releases...` });
        await delay(200);
        addLine({ type: 'success', text: `Imported ${result.summary.releasesImported} releases` });
      }

      // Show any warnings
      if (result.errors && result.errors.length > 0) {
        addLine({ type: 'output', text: '' });
        result.errors.slice(0, 5).forEach((err: string) => {
          addLine({ type: 'error', text: `Warning: ${err}` });
        });
        if (result.errors.length > 5) {
          addLine({ type: 'output', text: `  ... and ${result.errors.length - 5} more warnings` });
        }
      }

      addLine({ type: 'output', text: '' });
      addLine({ type: 'success', text: 'Import complete!' });
      addLine({ type: 'output', text: '' });
      addLine({ type: 'info', text: `Repository available at: /${user?.username}/${result.repoName}` });

      setImportedRepoName(result.repoName);
      setIsImporting(false);
      setStep('complete');

      toastSuccess({
        title: 'Import successful!',
        description: `${result.repoName} has been imported.`,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLine({ type: 'output', text: '' });
      addLine({ type: 'error', text: `Error: ${errorMessage}` });
      addLine({ type: 'output', text: '' });
      addLine({ type: 'info', text: 'Import failed. Please check the repository URL and try again.' });
      setIsImporting(false);
      
      toastError({
        title: 'Import failed',
        description: errorMessage,
      });
    }
  };

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
                  onKeyDown={(e) => e.key === 'Enter' && handleStartImport()}
                  className="flex-1"
                />
                <Button
                  onClick={handleStartImport}
                  disabled={!repoUrl.trim() || (!githubConnection?.connected && !githubToken)}
                  title={!githubConnection?.connected && !githubToken ? 'Connect GitHub or provide a token first' : undefined}
                >
                  Import
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Examples: facebook/react, https://github.com/vercel/next.js
              </p>
            </div>

            <div className="pt-4 border-t space-y-4">
              {/* GitHub Connection Status */}
              {githubConnection?.connected ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-sm font-medium text-green-600">GitHub Connected</p>
                      <p className="text-xs text-muted-foreground">@{githubConnection.username}</p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowToken(!showToken)}
                  >
                    Use different token
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-2">
                      <Link2 className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Connect GitHub</p>
                        <p className="text-xs text-muted-foreground">Required to import repositories</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={isConnecting}
                      onClick={async () => {
                        setIsConnecting(true);
                        try {
                          await authClient.signIn.social({
                            provider: 'github',
                            callbackURL: window.location.href,
                          });
                        } catch (error) {
                          console.error('GitHub connect error:', error);
                          toastError({
                            title: 'Connection failed',
                            description: 'Could not connect to GitHub. Try using a personal access token instead.',
                          });
                          setIsConnecting(false);
                          setShowToken(true);
                        }
                      }}
                    >
                      {isConnecting ? 'Connecting...' : 'Connect GitHub'}
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">or</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="w-full"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? 'Hide token input' : 'Use Personal Access Token instead'}
                  </Button>
                </div>
              )}
              
              {/* Manual token input (shown when requested or as fallback) */}
              {showToken && (
                <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                  <Label htmlFor="github-token" className="text-sm">Personal Access Token</Label>
                  <Input
                    id="github-token"
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxx"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Token needs <code className="px-1 py-0.5 bg-muted rounded">repo</code> scope for private repos.
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href="https://github.com/settings/tokens/new?scopes=repo"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Github className="mr-2 h-4 w-4" />
                      Generate Token
                      <ExternalLink className="ml-2 h-3 w-3" />
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Terminal View */}
      {(step === 'terminal' || step === 'complete') && (
        <div className="space-y-6">
          <TerminalOutput lines={terminalLines} isRunning={isImporting} />
          
          {step === 'complete' && importedRepoName && (
            <div className="flex justify-between">
              <Button 
                variant="outline" 
                onClick={() => {
                  setStep('input');
                  setRepoUrl('');
                  setTerminalLines([]);
                  setImportedRepoName(null);
                }}
              >
                Import Another
              </Button>
              <Button onClick={() => navigate(`/${user?.username}/${importedRepoName}`)}>
                View Repository
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {step === 'terminal' && !isImporting && !importedRepoName && (
            <div className="flex justify-start">
              <Button 
                variant="outline" 
                onClick={() => {
                  setStep('input');
                  setTerminalLines([]);
                }}
              >
                Back
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
