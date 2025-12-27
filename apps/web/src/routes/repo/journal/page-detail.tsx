import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  FileText,
  Trash2,
  Clock,
  Star,
  MoreHorizontal,
  Smile,
  History,
  Copy,
  Link as LinkIcon,
  ArrowUpRight,
  Share2,
  MessageCircle,
  ChevronDown,
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
import { RepoLayout } from '../components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime, cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { BlockEditor } from '@/components/editor/block-editor';

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

  const [editedContent, setEditedContent] = useState('');
  const [editedTitle, setEditedTitle] = useState('');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [pendingContent, setPendingContent] = useState<string | null>(null);

  const titleRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  // Mutations - declare before using in callbacks
  const updateMutation = trpc.journal.update.useMutation({
    onSuccess: () => {
      setPendingContent(null);
      utils.journal.getBySlug.invalidate();
      utils.journal.tree.invalidate();
    },
    onError: () => {
      setPendingContent(null);
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

  // Set initial content when page loads
  useEffect(() => {
    if (page) {
      setEditedContent(page.content || '');
      setEditedTitle(page.title || '');
      setPendingContent(null);
    }
  }, [page]);

  // Auto-save content with debounce
  const handleContentChange = useCallback(
    (newContent: string) => {
      setEditedContent(newContent);
      setPendingContent(newContent);

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new timeout for auto-save
      saveTimeoutRef.current = setTimeout(() => {
        if (page && newContent !== (page.content || '')) {
          updateMutation.mutate({
            pageId: page.id,
            content: newContent,
          });
          setPendingContent(null);
        }
      }, 1000); // Save after 1 second of inactivity
    },
    [page, updateMutation]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

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



  // Save changes on blur
  const handleTitleBlur = () => {
    if (page && editedTitle !== page.title) {
      updateMutation.mutate({
        pageId: page.id,
        title: editedTitle || 'Untitled',
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
          <div className="max-w-2xl mx-auto px-6 py-8">
            <div className="space-y-4">
              <div className="h-10 w-10 rounded bg-muted animate-pulse" />
              <div className="h-8 w-2/3 rounded bg-muted animate-pulse" />
              <div className="space-y-2 pt-4">
                {[...Array(4)].map((_, i) => (
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
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <div className="text-5xl mb-4">🔍</div>
              <h2 className="text-xl font-medium mb-2">Page not found</h2>
              <p className="text-muted-foreground mb-4">
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
          {page.coverImage && (
            <div className="h-32 relative group">
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
          )}

          {/* Main content area */}
          <div className="max-w-2xl mx-auto px-6 py-6">
            {/* Icon */}
            <div className="relative mb-4">
              {page.icon ? (
                <div className="relative inline-block group">
                  <span className="text-5xl cursor-pointer" onClick={() => canEdit && setShowIconPicker(true)}>
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
                className="w-full text-3xl font-bold bg-transparent border-0 outline-none resize-none placeholder:text-muted-foreground/50 mb-2"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                  }
                }}
              />
            ) : (
              <h1 className="text-3xl font-bold mb-2">
                {page.title || 'Untitled'}
              </h1>
            )}

            {/* Page properties bar */}
            <div className="flex items-center justify-between py-3 mb-6 group">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {/* Status badge */}
                {page.status === 'draft' && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                    Draft
                  </span>
                )}
                {page.status === 'published' && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    Published
                  </span>
                )}
                {page.status === 'archived' && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                    Archived
                  </span>
                )}

                {/* Last edited */}
                <span className="flex items-center gap-1.5 opacity-70">
                  <Clock className="h-3.5 w-3.5" />
                  Edited {formatRelativeTime(page.updatedAt)}
                </span>
              </div>

              {/* Right side actions - subtle until hovered */}
              {canEdit && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <Share2 className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Share</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <MessageCircle className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Comments</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <History className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">History</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <Star className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Add to favorites</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
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
                          Move to archive
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

            {/* Content - Block Editor */}
            <BlockEditor
              value={editedContent}
              onChange={handleContentChange}
              placeholder="Start writing or type '/' for commands..."
              readOnly={!canEdit}
              autoFocus={false}
            />
            
            {/* Save indicator */}
            {pendingContent !== null && (
              <div className="text-xs text-muted-foreground mt-2">
                Saving...
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
    <div className="flex min-h-[500px] rounded-lg border bg-card overflow-hidden">
      {/* Sidebar */}
      <div className="w-56 border-r bg-muted/20 flex flex-col flex-shrink-0">
        {/* Sidebar header */}
        <div className="px-3 py-2 border-b flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
            <FileText className="h-4 w-4" />
            <span>Pages</span>
          </div>
          {authenticated && (
            <button
              onClick={() => navigate(`/${owner}/${repo}/journal/new`)}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="text-lg leading-none">+</span>
            </button>
          )}
        </div>

        {/* Page tree */}
        <div className="flex-1 overflow-y-auto py-2 px-1">
          <div className="space-y-0.5">
            {tree.length === 0 ? (
              <div className="px-3 py-6 text-center">
                <p className="text-xs text-muted-foreground">No pages yet</p>
              </div>
            ) : (
              tree.map((item) => (
                <SidebarItem
                  key={item.id}
                  item={item}
                  owner={owner}
                  repo={repo}
                  level={0}
                  currentSlug={currentSlug}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col bg-background overflow-hidden">{children}</div>
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
  const [isHovered, setIsHovered] = useState(false);
  const navigate = useNavigate();
  const hasChildren = item.children && item.children.length > 0;
  const isActive = item.slug === currentSlug;

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-0.5 py-[3px] px-1 rounded-md transition-colors cursor-pointer',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-foreground/70 hover:bg-muted hover:text-foreground'
        )}
        style={{ paddingLeft: `${level * 16 + 4}px` }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Expand/collapse toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className={cn(
            'h-5 w-5 flex items-center justify-center rounded hover:bg-muted-foreground/10 transition-colors',
            !hasChildren && 'opacity-0 pointer-events-none'
          )}
        >
          <ChevronDown
            className={cn(
              'h-3 w-3 text-muted-foreground transition-transform duration-150',
              !isOpen && '-rotate-90'
            )}
          />
        </button>

        {/* Page icon */}
        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
          {item.icon ? (
            <span className="text-sm">{item.icon}</span>
          ) : (
            <FileText className={cn(
              'h-4 w-4',
              isActive ? 'text-primary' : 'text-muted-foreground'
            )} />
          )}
        </span>

        {/* Page title */}
        <Link
          to={`/${owner}/${repo}/journal/${item.slug}`}
          className={cn(
            'flex-1 truncate text-[13px] py-0.5 pl-1',
            isActive && 'font-medium'
          )}
        >
          {item.title || 'Untitled'}
        </Link>

        {/* Quick add button - visible on hover */}
        {isHovered && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/${owner}/${repo}/journal/new?parent=${item.id}`);
            }}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted-foreground/10 opacity-50 hover:opacity-100"
          >
            <span className="text-xs font-medium">+</span>
          </button>
        )}
      </div>

      {/* Children */}
      {hasChildren && isOpen && (
        <div className="relative">
          {/* Indent guide line */}
          <div
            className="absolute left-0 top-0 bottom-0 w-px bg-muted"
            style={{ marginLeft: `${level * 16 + 14}px` }}
          />
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
