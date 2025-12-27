import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  FileText,
  Smile,
  ImagePlus,
  Trash2,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RepoLayout } from '../components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
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
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const titleRef = useRef<HTMLTextAreaElement>(null);

  // Focus title on mount
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Fetch repository data
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch page tree for sidebar
  const { data: tree } = trpc.journal.tree.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
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
        <div className="flex h-[calc(100vh-200px)] items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-6">🔒</div>
            <h2 className="text-xl font-medium mb-2">Sign in required</h2>
            <p className="text-muted-foreground mb-6">
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
        <div className="flex h-[calc(100vh-200px)] -mx-6 -mt-6">
          <div className="w-64 border-r bg-muted/30 p-2 space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-7 rounded bg-muted/50 animate-pulse" />
            ))}
          </div>
          <div className="flex-1 flex items-center justify-center">
            <div className="w-16 h-16 rounded bg-muted/50 animate-pulse" />
          </div>
        </div>
      </RepoLayout>
    );
  }

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="flex h-[calc(100vh-200px)] -mx-6 -mt-6">
        {/* Sidebar */}
        <div className="w-64 border-r bg-muted/30 flex flex-col overflow-y-auto">
          <div className="p-2 flex-1">
            <div className="space-y-0.5">
              {(tree || []).map((item) => (
                <SidebarItem
                  key={item.id}
                  item={item}
                  owner={owner!}
                  repo={repo!}
                  level={0}
                />
              ))}
              {/* New page indicator */}
              <div
                className="flex items-center gap-1 py-1 px-1 rounded-md bg-primary/10"
                style={{ paddingLeft: '4px' }}
              >
                <span className="w-5" />
                <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-sm">
                  {icon || <FileText className="h-4 w-4 text-primary" />}
                </span>
                <span className="flex-1 truncate text-sm text-primary font-medium">
                  {title || 'Untitled'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col bg-background overflow-y-auto">
          {/* Cover area (hover to show add cover button) */}
          <div
            className="h-12 group relative"
            onMouseEnter={() => setIsHeaderHovered(true)}
            onMouseLeave={() => setIsHeaderHovered(false)}
          >
            {isHeaderHovered && (
              <div className="absolute top-4 left-16 flex items-center gap-2 text-sm text-muted-foreground">
                <button className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted transition-colors">
                  <ImagePlus className="h-4 w-4" />
                  Add cover
                </button>
              </div>
            )}
          </div>

          {/* Content area */}
          <div className="max-w-3xl mx-auto px-16 pb-24 flex-1">
            {/* Icon */}
            <div className="relative mb-4">
              {icon ? (
                <div className="relative inline-block group">
                  <span
                    className="text-7xl cursor-pointer"
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
              placeholder="Untitled"
              className="w-full text-4xl font-bold bg-transparent border-0 outline-none resize-none placeholder:text-muted-foreground/50 mb-4"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  // Focus will move to block editor naturally
                }
              }}
            />

            {/* Content - Block Editor */}
            <BlockEditor
              value={content}
              onChange={handleContentChange}
              placeholder="Type '/' for commands..."
              autoFocus={false}
            />

            {/* Save bar */}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 bg-background border rounded-lg shadow-lg">
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
        </div>
      </div>
    </RepoLayout>
  );
}

// Sidebar item (simplified version)
interface SidebarItemProps {
  item: {
    id: string;
    title: string;
    slug: string;
    status: string;
    icon?: string | null;
    children: any[];
  };
  owner: string;
  repo: string;
  level: number;
}

function SidebarItem({ item, owner, repo, level }: SidebarItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = item.children && item.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 px-1 rounded-md hover:bg-muted/70 transition-colors"
        style={{ paddingLeft: `${level * 12 + 4}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted-foreground/20"
          >
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 text-muted-foreground transition-transform',
                isOpen && 'rotate-90'
              )}
            />
          </button>
        ) : (
          <span className="w-5" />
        )}

        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-sm">
          {item.icon || <FileText className="h-4 w-4 text-muted-foreground" />}
        </span>

        <Link
          to={`/${owner}/${repo}/journal/${item.slug}`}
          className="flex-1 truncate text-sm text-foreground/80 py-0.5"
        >
          {item.title || 'Untitled'}
        </Link>
      </div>

      {hasChildren && isOpen && (
        <div>
          {item.children.map((child: any) => (
            <SidebarItem
              key={child.id}
              item={child}
              owner={owner}
              repo={repo}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default NewJournalPage;
