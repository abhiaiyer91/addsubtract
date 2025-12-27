import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  FileText,
  Plus,
  Search,
  ChevronRight,
  FolderTree,
  List,
  Archive,
  Eye,
  Edit3,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { RepoLayout } from '../components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime, cn } from '@/lib/utils';

type ViewMode = 'list' | 'tree';

// Status config
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: 'pencil' },
  published: { label: 'Published', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', icon: 'eye' },
  archived: { label: 'Archived', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300', icon: 'archive' },
};

export function JournalPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const { data: session } = useSession();
  const authenticated = !!session?.user;

  // Fetch repository data to get the repo ID
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch journal pages (list view - root pages only)
  const { data: pages, isLoading: pagesLoading } = trpc.journal.list.useQuery(
    {
      repoId: repoData?.repo.id!,
      parentId: null, // Root pages only
      limit: 50,
    },
    { enabled: !!repoData?.repo.id && viewMode === 'list' }
  );

  // Fetch page tree (tree view)
  const { data: tree, isLoading: treeLoading } = trpc.journal.tree.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id && viewMode === 'tree' }
  );

  // Page count
  const { data: pageCount } = trpc.journal.count.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  );

  const isLoading = repoLoading || (viewMode === 'list' ? pagesLoading : treeLoading);

  // Filter pages by search query
  const filteredPages = (pages || []).filter((page) => {
    if (!searchQuery) return true;
    return page.title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-8 w-48 bg-muted rounded animate-pulse" />
            <div className="h-9 w-28 bg-muted rounded animate-pulse" />
          </div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 rounded-lg bg-muted/50 animate-pulse" />
            ))}
          </div>
        </div>
      </RepoLayout>
    );
  }

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Journal
              {pageCount !== undefined && (
                <Badge variant="secondary" className="text-xs">
                  {pageCount} pages
                </Badge>
              )}
            </h1>

            {/* View toggle */}
            <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors',
                  viewMode === 'list'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <List className="h-4 w-4" />
                <span>List</span>
              </button>
              <button
                onClick={() => setViewMode('tree')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors',
                  viewMode === 'tree'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <FolderTree className="h-4 w-4" />
                <span>Tree</span>
              </button>
            </div>
          </div>

          {authenticated && (
            <Link to={`/${owner}/${repo}/journal/new`}>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                New Page
              </Button>
            </Link>
          )}
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-3 pb-2 border-b">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search pages..."
              className="pl-9 h-9 bg-muted/50 border-0 focus-visible:bg-background focus-visible:ring-1"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {/* Content */}
        {viewMode === 'tree' ? (
          <TreeView tree={tree || []} owner={owner!} repo={repo!} authenticated={authenticated} />
        ) : (
          <ListView 
            pages={filteredPages} 
            owner={owner!} 
            repo={repo!} 
            authenticated={authenticated}
            searchQuery={searchQuery}
          />
        )}
      </div>
    </RepoLayout>
  );
}

// List View
interface ListViewProps {
  pages: Array<{
    id: string;
    title: string;
    slug: string;
    status: string;
    icon?: string | null;
    updatedAt: string | Date;
    authorId: string;
  }>;
  owner: string;
  repo: string;
  authenticated: boolean;
  searchQuery: string;
}

function ListView({ pages, owner, repo, authenticated, searchQuery }: ListViewProps) {
  if (pages.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-1">
          {searchQuery ? 'No pages found' : 'No journal pages yet'}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          {searchQuery
            ? 'Try a different search term'
            : 'Create your first page to start documenting your project'}
        </p>
        {authenticated && !searchQuery && (
          <Link to={`/${owner}/${repo}/journal/new`}>
            <Button>Create the first page</Button>
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="border rounded-lg divide-y">
      {pages.map((page) => (
        <PageRow key={page.id} page={page} owner={owner} repo={repo} />
      ))}
    </div>
  );
}

interface PageRowProps {
  page: {
    id: string;
    title: string;
    slug: string;
    status: string;
    icon?: string | null;
    updatedAt: string | Date;
  };
  owner: string;
  repo: string;
}

function PageRow({ page, owner, repo }: PageRowProps) {
  const statusInfo = STATUS_CONFIG[page.status] || STATUS_CONFIG.draft;

  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 transition-colors group">
      {/* Icon */}
      <div className="flex-shrink-0 text-2xl">
        {page.icon || <FileText className="h-5 w-5 text-muted-foreground" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to={`/${owner}/${repo}/journal/${page.slug}`}
            className="font-medium text-foreground hover:text-primary transition-colors"
          >
            {page.title}
          </Link>
          <Badge
            variant="secondary"
            className={cn('text-xs font-normal px-2 py-0', statusInfo.color)}
          >
            {statusInfo.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
          <span className="font-mono text-xs">{page.slug}</span>
          <span className="text-muted-foreground/50">·</span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(page.updatedAt)}
          </span>
        </div>
      </div>

      {/* Actions (visible on hover) */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Link to={`/${owner}/${repo}/journal/${page.slug}`}>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Eye className="h-4 w-4" />
          </Button>
        </Link>
        <Link to={`/${owner}/${repo}/journal/${page.slug}/edit`}>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Edit3 className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

// Tree View
interface TreeViewProps {
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
}

function TreeView({ tree, owner, repo, authenticated }: TreeViewProps) {
  if (tree.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
          <FolderTree className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-1">No journal pages yet</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Create your first page to start documenting your project
        </p>
        {authenticated && (
          <Link to={`/${owner}/${repo}/journal/new`}>
            <Button>Create the first page</Button>
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4">
      <TreeNode items={tree} owner={owner} repo={repo} level={0} />
    </div>
  );
}

interface TreeNodeProps {
  items: Array<{
    id: string;
    title: string;
    slug: string;
    status: string;
    icon?: string | null;
    children: any[];
  }>;
  owner: string;
  repo: string;
  level: number;
}

function TreeNode({ items, owner, repo, level }: TreeNodeProps) {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const hasChildren = item.children && item.children.length > 0;
        const statusInfo = STATUS_CONFIG[item.status] || STATUS_CONFIG.draft;

        return (
          <li key={item.id}>
            <div
              className={cn(
                'flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 transition-colors',
                level > 0 && 'ml-6'
              )}
            >
              {hasChildren && (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              {!hasChildren && <span className="w-4" />}
              
              <span className="text-lg">{item.icon || <FileText className="h-4 w-4 text-muted-foreground" />}</span>
              
              <Link
                to={`/${owner}/${repo}/journal/${item.slug}`}
                className="flex-1 hover:text-primary transition-colors"
              >
                {item.title}
              </Link>
              
              <Badge
                variant="secondary"
                className={cn('text-xs font-normal px-2 py-0', statusInfo.color)}
              >
                {statusInfo.label}
              </Badge>
            </div>
            
            {hasChildren && (
              <TreeNode 
                items={item.children} 
                owner={owner} 
                repo={repo} 
                level={level + 1} 
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default JournalPage;
