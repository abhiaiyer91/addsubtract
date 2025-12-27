import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, Tag, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Loading } from '@/components/ui/loading';
import { RepoLayout } from '../components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

export function NewReleasePage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  const [tagName, setTagName] = useState('');
  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [isPrerelease, setIsPrerelease] = useState(false);
  const [isDraft, setIsDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  const createRelease = trpc.releases.create.useMutation({
    onSuccess: (data) => {
      navigate(`/${owner}/${repo}/releases/tag/${data.tagName}`);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

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
    if (!repoData?.repo.id) return;

    createRelease.mutate({
      repoId: repoData.repo.id,
      tagName: tagName.trim(),
      name: name.trim(),
      body: body.trim() || undefined,
      isDraft,
      isPrerelease,
    });
  };

  if (!authenticated) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Please sign in to create releases.</p>
        </div>
      </RepoLayout>
    );
  }

  if (repoLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading..." />
      </RepoLayout>
    );
  }

  if (!repoData?.repo) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Repository not found.</p>
        </div>
      </RepoLayout>
    );
  }

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
          <span>New release</span>
        </div>

        <div>
          <h1 className="text-2xl font-bold">Create a new release</h1>
          <p className="text-muted-foreground mt-1">
            Releases are deployable software iterations you can package and make available.
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
                Create a new release with a tag and release notes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="tagName">Tag version *</Label>
                <Input
                  id="tagName"
                  placeholder="v1.0.0"
                  value={tagName}
                  onChange={(e) => setTagName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Choose an existing tag, or create a new tag on publish.
                </p>
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
                <Label htmlFor="body">Describe this release</Label>
                <Textarea
                  id="body"
                  placeholder="## What's New&#10;- Feature A&#10;- Feature B&#10;&#10;## Bug Fixes&#10;- Fix #123"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Supports Markdown formatting.
                </p>
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

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(`/${owner}/${repo}/releases`)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createRelease.isPending}>
                  {createRelease.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isDraft ? 'Save draft' : 'Publish release'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </RepoLayout>
  );
}
