import { useState, useRef, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  FileText,
  Trash2,
  Clock,
  MessageSquare,
  Star,
  MoreHorizontal,
  ImagePlus,
  Smile,
  ChevronRight,
  History,
  Copy,
  Link as LinkIcon,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { RepoLayout } from '../components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime, cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

// Common page icons for the picker
const COMMON_ICONS = [
  '📄', '📝', '📚', '📖', '🎯', '💡', '🔧', '⚙️', '🚀', '✨', '📌', '🎨',
  '💼', '📊', '📈', '🗂️', '📁', '🔍', '💻', '🌐', '🔒', '🔑', '⭐', '❤️',
  '🎉', '🎁', '🏆', '🎪', '🎭', '🎬', '🎮', '🎸', '🎹', '🎺', '🎻', '🥁',
];

export function JournalPageDetail() {
  const { owner, repo, slug } = useParams<{ owner: string; repo: string; slug: string }>();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { toast } = useToast();
  const authenticated = !!session?.user;
  const utils = trpc.useUtils();

  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [editedTitle, setEditedTitle] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isHeaderHovered, setIsHeaderHovered] = useState(false);

  const titleRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Fetch repository data
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch page
  const { data: page, isLoading: pageLoading } = trpc.journal.getBySlug.useQuery(
    { repoId: repoData?.repo.id!, slug: slug! },
    { enabled: !!repoData?.repo.id && !!slug }
  );

  // Fetch page tree for sidebar
  const { data: tree } = trpc.journal.tree.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  );

  // Set initial content when page loads
  useEffect(() => {
    if (page) {
      setEditedContent(page.content || '');
      setEditedTitle(page.title || '');
    }
  }, [page]);

  // Mutations
  const updateMutation = trpc.journal.update.useMutation({
    onSuccess: () => {
      utils.journal.getBySlug.invalidate();
      utils.journal.tree.invalidate();
    },
  });

  const publishMutation = trpc.journal.publish.useMutation({
    onSuccess: () => {
      utils.journal.getBySlug.invalidate();
      toast({ title: 'Page published' });
    },
  });

  const archiveMutation = trpc.journal.archive.useMutation({
    onSuccess: () => {
      utils.journal.getBySlug.invalidate();
      toast({ title: 'Page archived' });
    },
  });

  const deleteMutation = trpc.journal.delete.useMutation({
    onSuccess: () => {
      toast({ title: 'Page deleted' });
      navigate(`/${owner}/${repo}/journal`);
    },
  });

  // Auto-resize textarea
  const autoResize = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    element.style.height = element.scrollHeight + 'px';
  };

  // Handle title change
  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedTitle(e.target.value);
    autoResize(e.target);
  };

  // Handle content change
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedContent(e.target.value);
    autoResize(e.target);
  };

  // Save changes on blur
  const handleTitleBlur = () => {
    if (page && editedTitle !== page.title) {
      updateMutation.mutate({
        pageId: page.id,
        title: editedTitle || 'Untitled',
      });
    }
  };

  const handleContentBlur = () => {
    if (page && editedContent !== (page.content || '')) {
      updateMutation.mutate({
        pageId: page.id,
        content: editedContent,
      });
    }
  };

  // Handle icon change
  const handleIconChange = (icon: string) => {
    if (page) {
      updateMutation.mutate({
        pageId: page.id,
        icon: icon || null,
      });
    }
    setShowIconPicker(false);
  };

  const isLoading = repoLoading || pageLoading;

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <JournalDetailLayout tree={tree || []} owner={owner!} repo={repo!} authenticated={authenticated} currentSlug={slug}>
          <div className="max-w-3xl mx-auto px-16 py-24">
            <div className="space-y-4">
              <div className="h-12 w-12 rounded bg-muted animate-pulse" />
              <div className="h-10 w-2/3 rounded bg-muted animate-pulse" />
              <div className="space-y-2 pt-8">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="h-5 rounded bg-muted/50 animate-pulse"
                    style={{ width: `${90 - i * 10}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </JournalDetailLayout>
      </RepoLayout>
    );
  }

  if (!page) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <JournalDetailLayout tree={tree || []} owner={owner!} repo={repo!} authenticated={authenticated} currentSlug={slug}>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-6xl mb-6">🔍</div>
              <h2 className="text-xl font-medium mb-2">Page not found</h2>
              <p className="text-muted-foreground mb-6">
                This page doesn't exist or has been deleted.
              </p>
              <Link to={`/${owner}/${repo}/journal`}>
                <Button variant="outline">Back to Journal</Button>
              </Link>
            </div>
          </div>
        </JournalDetailLayout>
      </RepoLayout>
    );
  }

  const canEdit = authenticated;

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <JournalDetailLayout
        tree={tree || []}
        owner={owner!}
        repo={repo!}
        authenticated={authenticated}
        currentSlug={slug}
      >
        <div className="flex-1 overflow-y-auto">
          {/* Cover image area */}
          {page.coverImage ? (
            <div className="h-48 relative group">
              <img
                src={page.coverImage}
                alt=""
                className="w-full h-full object-cover"
              />
              {canEdit && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button size="sm" variant="secondary">
                    Change cover
                  </Button>
                  <Button size="sm" variant="secondary">
                    Remove
                  </Button>
                </div>
              )}
            </div>
          ) : canEdit ? (
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
          ) : (
            <div className="h-12" />
          )}

          {/* Main content area */}
          <div className="max-w-3xl mx-auto px-16 pb-24">
            {/* Icon */}
            <div className="relative -mt-8 mb-4">
              {page.icon ? (
                <div className="relative inline-block group">
                  <span className="text-7xl cursor-pointer" onClick={() => canEdit && setShowIconPicker(true)}>
                    {page.icon}
                  </span>
                  {canEdit && (
                    <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleIconChange('')}
                        className="p-1 bg-background border rounded shadow-sm hover:bg-muted"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              ) : canEdit ? (
                <button
                  onClick={() => setShowIconPicker(true)}
                  className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground rounded hover:bg-muted transition-colors"
                >
                  <Smile className="h-4 w-4" />
                  Add icon
                </button>
              ) : null}

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
            {canEdit ? (
              <textarea
                ref={titleRef}
                value={editedTitle}
                onChange={handleTitleChange}
                onBlur={handleTitleBlur}
                placeholder="Untitled"
                className="w-full text-4xl font-bold bg-transparent border-0 outline-none resize-none placeholder:text-muted-foreground/50 mb-2"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    contentRef.current?.focus();
                  }
                }}
              />
            ) : (
              <h1 className="text-4xl font-bold mb-2">
                {page.title || 'Untitled'}
              </h1>
            )}

            {/* Meta info */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-8 pb-4 border-b">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {formatRelativeTime(page.updatedAt)}
              </span>
              {page.status !== 'draft' && (
                <span
                  className={cn(
                    'px-2 py-0.5 rounded-full text-xs font-medium',
                    page.status === 'published'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                  )}
                >
                  {page.status === 'published' ? 'Published' : 'Archived'}
                </span>
              )}

              {/* Actions */}
              {canEdit && (
                <div className="flex-1 flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem>
                        <Star className="mr-2 h-4 w-4" />
                        Add to favorites
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <LinkIcon className="mr-2 h-4 w-4" />
                        Copy link
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {page.status === 'draft' && (
                        <DropdownMenuItem
                          onClick={() => publishMutation.mutate({ pageId: page.id })}
                        >
                          <ArrowUpRight className="mr-2 h-4 w-4" />
                          Publish
                        </DropdownMenuItem>
                      )}
                      {page.status !== 'archived' && (
                        <DropdownMenuItem
                          onClick={() => archiveMutation.mutate({ pageId: page.id })}
                        >
                          <History className="mr-2 h-4 w-4" />
                          Archive
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setShowDeleteDialog(true)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>

            {/* Content */}
            {canEdit ? (
              <textarea
                ref={contentRef}
                value={editedContent}
                onChange={handleContentChange}
                onBlur={handleContentBlur}
                placeholder="Start writing, or press '/' for commands..."
                className="w-full min-h-[50vh] bg-transparent border-0 outline-none resize-none text-base leading-relaxed placeholder:text-muted-foreground/40"
              />
            ) : (
              <div className="prose dark:prose-invert max-w-none">
                {page.content ? (
                  <div className="whitespace-pre-wrap">{page.content}</div>
                ) : (
                  <p className="text-muted-foreground italic">
                    This page is empty.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Delete confirmation dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this page?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete "{page.title}" and all its subpages.
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteMutation.mutate({ pageId: page.id })}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </JournalDetailLayout>
    </RepoLayout>
  );
}

// Layout wrapper with sidebar
interface JournalDetailLayoutProps {
  children: React.ReactNode;
  tree: Array<{
    id: string;
    title: string;
    slug: string;
    status: string;
    icon?: string | null;
    children: any[];
  }>;
  owner: string;
  repo: string;
  authenticated: boolean;
  currentSlug?: string;
}

function JournalDetailLayout({
  children,
  tree,
  owner,
  repo,
  authenticated,
  currentSlug,
}: JournalDetailLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="flex h-[calc(100vh-200px)] -mx-6 -mt-6">
      {/* Sidebar */}
      <div className="w-64 border-r bg-muted/30 flex flex-col overflow-y-auto">
        <div className="p-2 flex-1">
          <div className="space-y-0.5">
            {tree.map((item) => (
              <SidebarItem
                key={item.id}
                item={item}
                owner={owner}
                repo={repo}
                level={0}
                currentSlug={currentSlug}
              />
            ))}
          </div>
        </div>

        {authenticated && (
          <div className="p-2 border-t">
            <button
              onClick={() => navigate(`/${owner}/${repo}/journal/new`)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
            >
              <FileText className="h-4 w-4" />
              New page
            </button>
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col bg-background">{children}</div>
    </div>
  );
}

// Sidebar item
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
  currentSlug?: string;
}

function SidebarItem({ item, owner, repo, level, currentSlug }: SidebarItemProps) {
  const [isOpen, setIsOpen] = useState(true);
  const hasChildren = item.children && item.children.length > 0;
  const isActive = item.slug === currentSlug;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 py-1 px-1 rounded-md transition-colors cursor-pointer',
          isActive ? 'bg-muted' : 'hover:bg-muted/70'
        )}
        style={{ paddingLeft: `${level * 12 + 4}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted-foreground/20"
          >
            {isOpen ? (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground rotate-90 transition-transform" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}

        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-sm">
          {item.icon || <FileText className="h-4 w-4 text-muted-foreground" />}
        </span>

        <Link
          to={`/${owner}/${repo}/journal/${item.slug}`}
          className={cn(
            'flex-1 truncate text-sm py-0.5',
            isActive ? 'text-foreground font-medium' : 'text-foreground/80'
          )}
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
              currentSlug={currentSlug}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default JournalPageDetail;
