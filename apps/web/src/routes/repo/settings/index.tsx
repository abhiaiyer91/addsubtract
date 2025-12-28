import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Loading } from '@/components/ui/loading';
import { RepoLayout } from '../components/repo-layout';
import { SettingsLayout } from './layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';

export function RepoSettingsPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const { data: repoData, isLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    defaultBranch: '',
    isPrivate: false,
  });

  // Update form when repo data loads
  useState(() => {
    if (repoData?.repo) {
      setFormData({
        name: repoData.repo.name,
        description: repoData.repo.description || '',
        defaultBranch: repoData.repo.defaultBranch,
        isPrivate: repoData.repo.isPrivate,
      });
    }
  });

  const updateRepo = trpc.repos.update.useMutation({
    onSuccess: (data) => {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      utils.repos.get.invalidate({ owner: owner!, repo: repo! });
      // If name changed, navigate to new URL
      if (data && data.name !== repo) {
        navigate(`/${owner}/${data.name}/settings`);
      }
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const deleteRepo = trpc.repos.delete.useMutation({
    onSuccess: () => {
      navigate(`/${owner}`);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!repoData?.repo.id) return;

    updateRepo.mutate({
      repoId: repoData.repo.id,
      name: formData.name !== repoData.repo.name ? formData.name : undefined,
      description: formData.description !== repoData.repo.description ? formData.description : undefined,
      defaultBranch: formData.defaultBranch !== repoData.repo.defaultBranch ? formData.defaultBranch : undefined,
      isPrivate: formData.isPrivate !== repoData.repo.isPrivate ? formData.isPrivate : undefined,
    });
  };

  const handleDelete = () => {
    if (!repoData?.repo.id) return;

    const confirmText = prompt(
      `This action cannot be undone. Type "${repo}" to confirm deletion:`
    );
    if (confirmText === repo) {
      deleteRepo.mutate({ repoId: repoData.repo.id });
    }
  };

  if (!authenticated) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Please sign in to access settings.</p>
        </div>
      </RepoLayout>
    );
  }

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <Loading text="Loading settings..." />
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

  // Update formData when repoData changes
  if (formData.name === '' && repoData.repo) {
    setFormData({
      name: repoData.repo.name,
      description: repoData.repo.description || '',
      defaultBranch: repoData.repo.defaultBranch,
      isPrivate: repoData.repo.isPrivate,
    });
  }

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <SettingsLayout>
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">General</h2>
            <p className="text-muted-foreground mt-1">
              Manage your repository settings.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Repository Details</CardTitle>
              <CardDescription>
                Update your repository information.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Repository name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="my-repo"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="A short description of your repository"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="defaultBranch">Default branch</Label>
                  <Input
                    id="defaultBranch"
                    value={formData.defaultBranch}
                    onChange={(e) => setFormData({ ...formData, defaultBranch: e.target.value })}
                    placeholder="main"
                  />
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label>Visibility</Label>
                  <div className="space-y-3">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="visibility"
                        checked={!formData.isPrivate}
                        onChange={() => setFormData({ ...formData, isPrivate: false })}
                        className="mt-1"
                      />
                      <div>
                        <span className="font-medium">Public</span>
                        <p className="text-sm text-muted-foreground">
                          Anyone on the internet can see this repository.
                        </p>
                      </div>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="radio"
                        name="visibility"
                        checked={formData.isPrivate}
                        onChange={() => setFormData({ ...formData, isPrivate: true })}
                        className="mt-1"
                      />
                      <div>
                        <span className="font-medium">Private</span>
                        <p className="text-sm text-muted-foreground">
                          Only you and collaborators can see this repository.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                    {error}
                  </div>
                )}

                <div className="flex items-center gap-4">
                  <Button type="submit" disabled={updateRepo.isPending}>
                    {updateRepo.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save changes
                  </Button>
                  {saveSuccess && (
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      <Check className="h-4 w-4" />
                      Saved successfully
                    </span>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-destructive">Danger zone</CardTitle>
              <CardDescription>
                Irreversible and destructive actions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between p-4 border border-destructive/50 rounded-lg">
                <div>
                  <div className="font-medium">Delete this repository</div>
                  <p className="text-sm text-muted-foreground">
                    Once you delete a repository, there is no going back.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleteRepo.isPending}
                >
                  {deleteRepo.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Delete repository
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </SettingsLayout>
    </RepoLayout>
  );
}
