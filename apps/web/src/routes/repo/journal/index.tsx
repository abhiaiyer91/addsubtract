import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  FileText,
  Plus,
  Search,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Trash2,
  Copy,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RepoLayout } from '../components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

export function JournalPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  // Fetch repository data to get the repo ID
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch page tree
  const { data: tree, isLoading: treeLoading } = trpc.journal.tree.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  );

  const isLoading = repoLoading || treeLoading;

  // Filter pages by search query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filterTree = (items: any[] | undefined): any[] | undefined => {
    if (!searchQuery || !items) return items;
    return items
      .map((item) => ({
        ...item,
        children: filterTree(item.children),
      }))
      .filter(
        (item) =>
          item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (item.children && item.children.length > 0)
      );
  };

  const filteredTree = filterTree(tree as any[] | undefined) || [];

  const handleNewPage = () => {
    navigate(`/${owner}/${repo}/journal/new`);
  };

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="flex min-h-[400px] rounded-lg border bg-card overflow-hidden">
          {/* Sidebar skeleton */}
          <div className="w-60 border-r p-3 space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-7 rounded bg-muted/50 animate-pulse" />
            ))}
          </div>
          {/* Main content skeleton */}
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-muted/50 mx-auto animate-pulse" />
              <div className="h-6 w-48 bg-muted/50 rounded mx-auto animate-pulse" />
            </div>
          </div>
        </div>
      </RepoLayout>
    );
  }

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="flex min-h-[500px] rounded-lg border bg-card overflow-hidden">
        {/* Sidebar */}
        <div className="w-60 border-r bg-muted/20 flex flex-col">
          {/* Header with search and new button */}
          <div className="p-3 border-b flex items-center gap-2">
            <div
              className={cn(
                'flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md transition-all cursor-text',
                isSearching
                  ? 'bg-background ring-1 ring-ring'
                  : 'hover:bg-muted/50'
              )}
              onClick={() => setIsSearching(true)}
            >
              <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              {isSearching ? (
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onBlur={() => !searchQuery && setIsSearching(false)}
                  className="h-6 p-0 border-0 bg-transparent focus-visible:ring-0 text-sm"
                  autoFocus
                />
              ) : (
                <span className="text-sm text-muted-foreground">Search</span>
              )}
            </div>
            {authenticated && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 flex-shrink-0"
                onClick={handleNewPage}
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Page tree */}
          <div className="flex-1 overflow-y-auto p-2">
            <div className="space-y-0.5">
              {filteredTree && filteredTree.length > 0 ? (
                filteredTree.map((item) => (
                  <PageTreeItem
                    key={item.id}
                    item={item}
                    owner={owner!}
                    repo={repo!}
                    level={0}
                    authenticated={authenticated}
                  />
                ))
              ) : searchQuery ? (
                <div className="px-2 py-6 text-center">
                  <p className="text-sm text-muted-foreground">No results</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex items-center justify-center bg-background p-6">
          <EmptyStateContent
            owner={owner!}
            repo={repo!}
            authenticated={authenticated}
            hasPages={(tree?.length || 0) > 0}
            onNewPage={handleNewPage}
          />
        </div>
      </div>
    </RepoLayout>
  );
}

// Page tree item component
interface PageTreeItemProps {
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
  authenticated: boolean;
}

function PageTreeItem({ item, owner, repo, level, authenticated }: PageTreeItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const hasChildren = item.children && item.children.length > 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div
        className="group relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          className={cn(
            'flex items-center gap-1 py-1 px-1 rounded-md transition-colors',
            'hover:bg-muted/70'
          )}
          style={{ paddingLeft: `${level * 12 + 4}px` }}
        >
          {/* Expand/collapse button */}
          <CollapsibleTrigger asChild>
            <button
              className={cn(
                'h-5 w-5 flex items-center justify-center rounded hover:bg-muted transition-colors',
                !hasChildren && 'invisible'
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
          </CollapsibleTrigger>

          {/* Page icon */}
          <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-base">
            {item.icon || (
              <FileText className="h-4 w-4 text-muted-foreground" />
            )}
          </span>

          {/* Page title */}
          <Link
            to={`/${owner}/${repo}/journal/${item.slug}`}
            className="flex-1 truncate text-sm py-0.5 text-foreground/90 hover:text-foreground"
          >
            {item.title || 'Untitled'}
          </Link>

          {/* Hover actions */}
          {isHovered && authenticated && (
            <div className="flex items-center gap-0.5">
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link to={`/${owner}/${repo}/journal/new?parent=${item.id}`}>
                      <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted-foreground/20">
                        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    Add subpage
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted-foreground/20">
                    <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuItem>
                    <Star className="mr-2 h-4 w-4" />
                    Add to favorites
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && (
        <CollapsibleContent>
          {item.children.map((child: any) => (
            <PageTreeItem
              key={child.id}
              item={child}
              owner={owner}
              repo={repo}
              level={level + 1}
              authenticated={authenticated}
            />
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

// Empty state component
interface EmptyStateContentProps {
  owner: string;
  repo: string;
  authenticated: boolean;
  hasPages: boolean;
  onNewPage: () => void;
}

function EmptyStateContent({
  owner: _owner,
  repo: _repo,
  authenticated,
  hasPages,
  onNewPage,
}: EmptyStateContentProps) {
  if (hasPages) {
    return (
      <div className="text-center max-w-md px-4">
        <div className="text-6xl mb-6">📄</div>
        <h2 className="text-xl font-medium text-foreground/90 mb-2">
          Select a page
        </h2>
        <p className="text-muted-foreground">
          Choose a page from the sidebar, or{' '}
          {authenticated && (
            <button
              onClick={onNewPage}
              className="text-primary hover:underline"
            >
              create a new one
            </button>
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="text-center max-w-md px-4">
      <div className="text-6xl mb-6">📝</div>
      <h2 className="text-xl font-medium text-foreground/90 mb-2">
        Start writing
      </h2>
      <p className="text-muted-foreground mb-6">
        Journal is where your team documents everything. Create your first page
        to get started.
      </p>
      {authenticated && (
        <Button onClick={onNewPage} className="gap-2">
          <Plus className="h-4 w-4" />
          Create a page
        </Button>
      )}
    </div>
  );
}

export default JournalPage;
