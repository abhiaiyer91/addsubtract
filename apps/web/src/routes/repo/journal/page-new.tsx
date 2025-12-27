import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  FileText,
  Smile,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RepoLayout } from '../components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/ui/use-toast';
import { BlockEditor } from '@/components/editor/block-editor';

// Common page icons
const COMMON_ICONS = [
  '📄', '📝', '📚', '📖', '🎯', '💡', '🔧', '⚙️', '🚀', '✨', '📌', '🎨',
  '💼', '📊', '📈', '🗂️', '📁', '🔍', '💻', '🌐', '🔒', '🔑', '⭐', '❤️',
  '🎉', '🎁', '🏆', '🎪', '🎭', '🎬', '🎮', '🎸', '🎹', '🎺', '🎻', '🥁',
];

export function NewJournalPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [searchParams] = useSearchParams();
  const parentId = searchParams.get('parent');
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { toast } = useToast();
  const authenticated = !!session?.user;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [icon, setIcon] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Focus title on mount
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const utils = trpc.useUtils();

  // Fetch repository data
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Create mutation
  const createMutation = trpc.journal.create.useMutation({
    onSuccess: async (page) => {
      // Invalidate queries before navigating so the page detail view has fresh data
      await Promise.all([
        utils.journal.tree.invalidate(),
        utils.journal.list.invalidate(),
      ]);
      toast({ title: 'Page created' });
      navigate(`/${owner}/${repo}/journal/${page.slug}`);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      setIsSaving(false);
    },
  });

  const handleSave = () => {
    if (!title.trim()) {
      toast({
        title: 'Title required',
        description: 'Please enter a title for the page',
        variant: 'destructive',
      });
      titleRef.current?.focus();
      return;
    }

    setIsSaving(true);
    createMutation.mutate({
      repoId: repoData!.repo.id,
      title: title.trim(),
      content: content.trim() || undefined,
      icon: icon || undefined,
      parentId: parentId || undefined,
    });
  };

  // Auto-resize textarea
  const autoResize = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    element.style.height = element.scrollHeight + 'px';
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTitle(e.target.value);
    autoResize(e.target);
  };

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
  }, []);

  const handleIconChange = (newIcon: string) => {
    setIcon(newIcon);
    setShowIconPicker(false);
  };

  if (!authenticated) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="flex min-h-[400px] items-center justify-center rounded-lg border bg-card">
          <div className="text-center p-6">
            <div className="text-5xl mb-4">🔒</div>
            <h2 className="text-xl font-medium mb-2">Sign in required</h2>
            <p className="text-muted-foreground mb-4">
              You need to sign in to create journal pages.
            </p>
            <Link to="/login">
              <Button>Sign in</Button>
            </Link>
          </div>
        </div>
      </RepoLayout>
    );
  }

  if (repoLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="rounded-lg border bg-card p-6">
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="h-10 w-10 rounded bg-muted/50 animate-pulse" />
            <div className="h-10 w-2/3 rounded bg-muted/50 animate-pulse" />
            <div className="h-24 rounded bg-muted/50 animate-pulse" />
          </div>
        </div>
      </RepoLayout>
    );
  }

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="rounded-lg border bg-card">
        {/* Header bar with actions */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>New page</span>
            {parentId && <span className="text-muted-foreground/60">/ subpage</span>}
          </div>
          <div className="flex items-center gap-2">
            <Link to={`/${owner}/${repo}/journal`}>
              <Button variant="ghost" size="sm">
                Cancel
              </Button>
            </Link>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Creating...' : 'Create page'}
            </Button>
          </div>
        </div>

        {/* Content area */}
        <div className="max-w-2xl mx-auto px-6 py-6">
          {/* Icon */}
          <div className="relative mb-4">
            {icon ? (
              <div className="relative inline-block group">
                <span
                  className="text-5xl cursor-pointer"
                  onClick={() => setShowIconPicker(true)}
                >
                  {icon}
                </span>
                <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setIcon('')}
                    className="p-1 bg-background border rounded shadow-sm hover:bg-muted"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowIconPicker(true)}
                className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground rounded hover:bg-muted transition-colors"
              >
                <Smile className="h-4 w-4" />
                Add icon
              </button>
            )}

            {/* Icon picker */}
            {showIconPicker && (
              <div className="absolute top-full left-0 z-50 mt-2 p-3 bg-popover border rounded-lg shadow-lg w-72">
                <div className="grid grid-cols-6 gap-1">
                  {COMMON_ICONS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleIconChange(emoji)}
                      className="p-2 text-2xl hover:bg-muted rounded transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowIconPicker(false)}
                  className="w-full mt-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  Close
                </button>
              </div>
            )}
          </div>

          {/* Title */}
          <textarea
            ref={titleRef}
            value={title}
            onChange={handleTitleChange}
            placeholder="Page title"
            className="w-full text-3xl font-bold bg-transparent border-0 outline-none resize-none placeholder:text-muted-foreground/50 mb-4"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
              }
            }}
          />

          {/* Content - Block Editor */}
          <div className="min-h-[200px]">
            <BlockEditor
              value={content}
              onChange={handleContentChange}
              placeholder="Start writing or type '/' for commands..."
              autoFocus={false}
            />
          </div>
        </div>
      </div>
    </RepoLayout>
  );
}

export default NewJournalPage;
