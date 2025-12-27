import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RepoLayout } from '../components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/ui/use-toast';

// Common page icons
const COMMON_ICONS = ['📄', '📝', '📚', '📖', '🎯', '💡', '🔧', '⚙️', '🚀', '✨', '📌', '🎨'];

export function NewJournalPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { toast } = useToast();
  const authenticated = !!session?.user;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [icon, setIcon] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);

  // Fetch repository data
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Create mutation
  const createMutation = trpc.journal.create.useMutation({
    onSuccess: (page) => {
      toast({ title: 'Page created' });
      navigate(`/${owner}/${repo}/journal/${page.slug}`);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast({
        title: 'Title required',
        description: 'Please enter a title for the page',
        variant: 'destructive',
      });
      return;
    }

    createMutation.mutate({
      repoId: repoData!.repo.id,
      title: title.trim(),
      content: content.trim() || undefined,
      icon: icon || undefined,
    });
  };

  if (!authenticated) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-1">Sign in required</h3>
          <p className="text-sm text-muted-foreground mb-4">
            You need to sign in to create journal pages.
          </p>
          <Link to="/login">
            <Button>Sign in</Button>
          </Link>
        </div>
      </RepoLayout>
    );
  }

  if (repoLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="h-8 w-48 bg-muted rounded animate-pulse" />
          <div className="space-y-4">
            <div className="h-10 bg-muted rounded animate-pulse" />
            <div className="h-48 bg-muted rounded animate-pulse" />
          </div>
        </div>
      </RepoLayout>
    );
  }

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="max-w-2xl mx-auto">
        {/* Navigation */}
        <div className="mb-6">
          <Link
            to={`/${owner}/${repo}/journal`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Journal
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Create New Page</h1>
          <p className="text-muted-foreground mt-1">
            Add documentation, notes, or any content to your repository's journal.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Icon + Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <div className="flex gap-2">
              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  className="w-12 h-10 text-xl p-0"
                  onClick={() => setShowIconPicker(!showIconPicker)}
                >
                  {icon || <Smile className="h-5 w-5 text-muted-foreground" />}
                </Button>
                
                {showIconPicker && (
                  <div className="absolute top-12 left-0 z-10 bg-popover border rounded-lg shadow-lg p-2 grid grid-cols-6 gap-1">
                    <button
                      type="button"
                      className="p-2 hover:bg-muted rounded text-center"
                      onClick={() => {
                        setIcon('');
                        setShowIconPicker(false);
                      }}
                    >
                      <span className="text-muted-foreground">-</span>
                    </button>
                    {COMMON_ICONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="p-2 hover:bg-muted rounded text-xl"
                        onClick={() => {
                          setIcon(emoji);
                          setShowIconPicker(false);
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              <Input
                id="title"
                placeholder="Page title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="flex-1"
                autoFocus
              />
            </div>
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label htmlFor="content">Content</Label>
            <Textarea
              id="content"
              placeholder="Write your content here... (Markdown supported)"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={15}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Tip: You can use Markdown for formatting.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <Link to={`/${owner}/${repo}/journal`}>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating...' : 'Create Page'}
            </Button>
          </div>
        </form>
      </div>
    </RepoLayout>
  );
}

export default NewJournalPage;
