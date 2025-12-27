import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Code2, Lock, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loading } from '@/components/ui/loading';
import { trpc } from '@/lib/trpc';
import { useSession } from '@/lib/auth-client';
import { toastSuccess, toastError } from '@/components/ui/use-toast';

export function NewRepoPage() {
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const user = session?.user;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createRepo = trpc.repos.create.useMutation({
    onSuccess: (repo) => {
      toastSuccess({
        title: 'Repository created',
        description: `${repo.name} has been created successfully.`,
      });
      navigate(`/${user?.username}/${repo.name}`);
    },
    onError: (err) => {
      setError(err.message);
      toastError({
        title: 'Failed to create repository',
        description: err.message,
      });
    },
  });

  if (isPending) {
    return <Loading text="Loading..." />;
  }

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">
              You need to be logged in to create a repository.
            </p>
            <Button className="mt-4" onClick={() => navigate('/login')}>
              Sign in
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Repository name is required');
      return;
    }

    createRepo.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      isPrivate,
    });
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Create a new repository</h1>
        <p className="text-muted-foreground mt-2">
          A repository contains all project files, including the revision history.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Code2 className="h-5 w-5" />
              Repository details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Owner / Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Repository name *</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{user.username} /</span>
                <Input
                  id="name"
                  placeholder="my-awesome-project"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1"
                  pattern="^[a-zA-Z0-9._-]+$"
                  title="Repository name can only contain alphanumeric characters, dots, hyphens, and underscores"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Great repository names are short and memorable.
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="A short description of your project"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Visibility */}
            <div className="space-y-3">
              <Label>Visibility</Label>
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="visibility"
                    checked={!isPrivate}
                    onChange={() => setIsPrivate(false)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      <span className="font-medium">Public</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Anyone on the internet can see this repository. You choose who can commit.
                    </p>
                  </div>
                </label>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="visibility"
                    checked={isPrivate}
                    onChange={() => setIsPrivate(true)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4" />
                      <span className="font-medium">Private</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      You choose who can see and commit to this repository.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            {/* Submit */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(-1)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createRepo.isPending}>
                {createRepo.isPending ? 'Creating...' : 'Create repository'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
