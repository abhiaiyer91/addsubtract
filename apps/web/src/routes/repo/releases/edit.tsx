import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, Tag, ChevronLeft, Trash2, Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Loading } from '@/components/ui/loading';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RepoLayout } from '../components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

export function EditReleasePage() {
  const { owner, repo, id } = useParams<{ owner: string; repo: string; id: string }>();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  const [tagName, setTagName] = useState('');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [isPrerelease, setIsPrerelease] = useState(false);
  const [isDraft, setIsDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previousTag, setPreviousTag] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);

  const utils = trpc.useUtils();

  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Check if user has write permission (owner or collaborator with write access)
  const { data: permissionData, isLoading: permissionLoading } = trpc.collaborators.checkPermission.useQuery(
    { repoId: repoData?.repo.id!, permission: 'write' },
    { enabled: !!repoData?.repo.id && authenticated }
  );

  const { data: release, isLoading: releaseLoading } = trpc.releases.getById.useQuery(
    { id: id! },
    { enabled: !!id }
  );

  // Fetch existing tags for comparison dropdown
  const { data: tagsData } = trpc.repos.getTags.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Check if AI is available
  const { data: aiStatus } = trpc.ai.status.useQuery();
  const aiAvailable = aiStatus?.available ?? false;

  // Find the previous tag (the one before the current release tag)
  const defaultPreviousTag = useMemo(() => {
    if (!tagsData || tagsData.length === 0 || !release) return '';
    const currentIndex = tagsData.findIndex(t => t.name === release.tagName);
    if (currentIndex === -1 || currentIndex === tagsData.length - 1) {
      // Current tag not found or is the oldest tag
      return tagsData.length > 1 ? tagsData[1].name : '';
    }
    return tagsData[currentIndex + 1]?.name || '';
  }, [tagsData, release]);

  const updateRelease = trpc.releases.update.useMutation({
    onSuccess: (data) => {
      utils.releases.getById.invalidate({ id: id! });
      navigate(`/${owner}/${repo}/releases/tag/${data.tagName}`);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const deleteRelease = trpc.releases.delete.useMutation({
    onSuccess: () => {
      navigate(`/${owner}/${repo}/releases`);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const generateNotesMutation = trpc.releases.generateNotes.useMutation();

  // Populate form when release loads
  useEffect(() => {
    if (release) {
      setTagName(release.tagName);
      setName(release.name);
      setBody(release.body || '');
      setIsPrerelease(release.isPrerelease);
      setIsDraft(release.isDraft);
    }
  }, [release]);

  const handleGenerateNotes = async () => {
    if (!tagName.trim()) {
      setError('Please enter a tag name first');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Determine what ref to compare from
      const fromRef = previousTag || defaultPreviousTag || undefined;
      
      // First, get the commits between the refs
      const commitsResult = await trpc.repos.getCommitsBetween.query({
        owner: owner!,
        repo: repo!,
        fromRef,
        toRef: tagName.trim(),
        limit: 200,
      });

      if (commitsResult.commits.length === 0) {
        setError('No commits found for the specified range. Try selecting a different comparison tag.');
        setIsGenerating(false);
        return;
      }

      // Now generate the release notes
      const result = await generateNotesMutation.mutateAsync({
        version: tagName.trim(),
        previousVersion: fromRef,
        commits: commitsResult.commits,
        style: 'standard',
        includeStats: true,
        includeContributors: true,
      });

      // Update the form with generated content
      setName(result.title);
      setBody(result.body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate release notes');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!tagName.trim()) {
      setError('Tag name is required');
      return;
    }
    if (!name.trim()) {
      setError('Release title is required');
      return;
    }
    if (!id) return;

    updateRelease.mutate({
      id,
      tagName: tagName.trim(),
      name: name.trim(),
      body: body.trim() || undefined,
      isDraft,
      isPrerelease,
    });
  };

  const handleDelete = () => {
    if (!id) return;
    if (confirm('Are you sure you want to delete this release?')) {
      deleteRelease.mutate({ id });
    }
  };

  if (!authenticated) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Please sign in to edit releases.</p>
        </div>
      </RepoLayout>
    );
  }

  const isLoading = repoLoading || releaseLoading || permissionLoading;

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading release..." />
      </RepoLayout>
    );
  }

  if (!repoData?.repo || !release) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Release not found.</p>
          <Link to={`/${owner}/${repo}/releases`}>
            <Button variant="outline" className="mt-4">
              Back to releases
            </Button>
          </Link>
        </div>
      </RepoLayout>
    );
  }

  if (!permissionData?.hasPermission) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">You don't have permission to edit releases in this repository.</p>
          <Link to={`/${owner}/${repo}/releases`}>
            <Button variant="outline" className="mt-4">
              Back to releases
            </Button>
          </Link>
        </div>
      </RepoLayout>
    );
  }

  const canGenerate = aiAvailable && tagName.trim().length > 0;

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link
            to={`/${owner}/${repo}/releases`}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Releases
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link
            to={`/${owner}/${repo}/releases/tag/${release.tagName}`}
            className="text-muted-foreground hover:text-foreground"
          >
            {release.tagName}
          </Link>
          <span className="text-muted-foreground">/</span>
          <span>Edit</span>
        </div>

        <div>
          <h1 className="text-2xl font-bold">Edit release</h1>
          <p className="text-muted-foreground mt-1">
            Update the release information and notes.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Release details
              </CardTitle>
              <CardDescription>
                Update the release tag and notes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tagName">Tag version *</Label>
                  <Input
                    id="tagName"
                    placeholder="v1.0.0"
                    value={tagName}
                    onChange={(e) => setTagName(e.target.value)}
                  />
                </div>

                {tagsData && tagsData.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="previousTag">Compare with previous tag</Label>
                    <Select value={previousTag} onValueChange={setPreviousTag}>
                      <SelectTrigger>
                        <SelectValue placeholder={defaultPreviousTag || 'Select a tag'} />
                      </SelectTrigger>
                      <SelectContent>
                        {defaultPreviousTag && (
                          <SelectItem value="">Default ({defaultPreviousTag})</SelectItem>
                        )}
                        {tagsData
                          .filter(tag => tag.name !== tagName)
                          .map((tag) => (
                            <SelectItem key={tag.name} value={tag.name}>
                              {tag.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      For regenerating release notes.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Release title *</Label>
                <Input
                  id="name"
                  placeholder="Version 1.0.0"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="body">Describe this release</Label>
                  {aiAvailable && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateNotes}
                      disabled={!canGenerate || isGenerating}
                      className="gap-1.5"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          Regenerate with AI
                        </>
                      )}
                    </Button>
                  )}
                </div>
                <Textarea
                  id="body"
                  placeholder="## What's New&#10;- Feature A&#10;- Feature B&#10;&#10;## Bug Fixes&#10;- Fix #123"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  className="font-mono text-sm"
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Supports Markdown formatting.
                  </p>
                  {body && aiAvailable && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleGenerateNotes}
                      disabled={!canGenerate || isGenerating}
                      className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Regenerate
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="isPrerelease"
                    checked={isPrerelease}
                    onCheckedChange={(checked) => setIsPrerelease(!!checked)}
                  />
                  <div>
                    <Label htmlFor="isPrerelease" className="cursor-pointer">
                      This is a pre-release
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Mark as not ready for production.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="isDraft"
                    checked={isDraft}
                    onCheckedChange={(checked) => setIsDraft(!!checked)}
                  />
                  <div>
                    <Label htmlFor="isDraft" className="cursor-pointer">
                      Save as draft
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Draft releases are hidden until published.
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleDelete}
                  disabled={deleteRelease.isPending}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  {deleteRelease.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Delete release
                </Button>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate(`/${owner}/${repo}/releases/tag/${release.tagName}`)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateRelease.isPending}>
                    {updateRelease.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Save changes
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </RepoLayout>
  );
}
