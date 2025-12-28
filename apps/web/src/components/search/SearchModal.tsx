import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Code,
  BookOpen,
  CircleDot,
  GitPullRequest,
  Loader2,
  X,
  Clock,
  ArrowRight,
  User,
  Sparkles,
  FileCode,
  Star,
  Lock,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { trpc } from '@/lib/trpc';
import { useSession } from '@/lib/auth-client';
import { create } from 'zustand';

// ============ STORE ============

interface SearchModalState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useSearchModalStore = create<SearchModalState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((state) => ({ isOpen: !state.isOpen })),
}));

// ============ TYPES ============

type SearchType = 'all' | 'repos' | 'issues' | 'prs' | 'code';

interface SearchResultItem {
  id: string;
  type: 'repository' | 'issue' | 'pull_request' | 'code' | 'user';
  title: string;
  subtitle?: string;
  description?: string;
  url: string;
  icon?: React.ReactNode;
  metadata?: {
    state?: string;
    number?: number;
    owner?: string;
    repo?: string;
    isPrivate?: boolean;
    stars?: number;
    language?: string;
  };
}

// ============ HOOKS ============

const RECENT_SEARCHES_KEY = 'wit_recent_searches';
const MAX_RECENT_SEARCHES = 5;

function useRecentSearches() {
  const [searches, setSearches] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const addSearch = useCallback((query: string) => {
    if (!query.trim()) return;
    
    setSearches(prev => {
      const filtered = prev.filter(s => s !== query);
      const updated = [query, ...filtered].slice(0, MAX_RECENT_SEARCHES);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearSearches = useCallback(() => {
    setSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  }, []);

  return { searches, addSearch, clearSearches };
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// ============ MAIN COMPONENT ============

export function SearchModal() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { isOpen, close } = useSearchModalStore();
  
  const [query, setQuery] = useState('');
  const [activeType, setActiveType] = useState<SearchType>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  
  const debouncedQuery = useDebounce(query, 200);
  const { searches: recentSearches, addSearch, clearSearches } = useRecentSearches();

  // Fetch repositories - only when user is logged in
  const { data: repos, isLoading: reposLoading } = trpc.repos.list.useQuery(
    { owner: session?.user?.name || '' },
    { enabled: isOpen && !!session?.user?.name, staleTime: 60000 }
  );

  // Fetch search results when query changes
  const { data: searchResults, isLoading: searchLoading } = trpc.search.search.useQuery(
    { query: debouncedQuery, type: activeType === 'all' ? 'all' : activeType === 'repos' ? 'repositories' : activeType === 'prs' ? 'prs' : activeType, limit: 10 },
    { enabled: isOpen && debouncedQuery.length >= 2 }
  );

  // Fetch user's issues if authenticated
  const { data: userIssues } = trpc.issues.listByAuthor.useQuery(
    { authorId: session?.user?.id || '', state: 'open' },
    { enabled: isOpen && !!session?.user?.id && (activeType === 'all' || activeType === 'issues') && debouncedQuery.length >= 2 }
  );

  // Fetch user's PRs if authenticated
  const { data: userPrs } = trpc.pulls.listByAuthor.useQuery(
    { authorId: session?.user?.id || '', state: 'open' },
    { enabled: isOpen && !!session?.user?.id && (activeType === 'all' || activeType === 'prs') && debouncedQuery.length >= 2 }
  );

  const isLoading = reposLoading || searchLoading;

  // Build results list
  const results = useMemo((): SearchResultItem[] => {
    const items: SearchResultItem[] = [];
    const lowerQuery = debouncedQuery.toLowerCase();

    if (!debouncedQuery || debouncedQuery.length < 2) {
      // Show quick access items when no query
      const ownerName = session?.user?.name || '';
      if (repos && activeType === 'all' && ownerName) {
        repos.slice(0, 3).forEach(repo => {
          items.push({
            id: `repo-${repo.id}`,
            type: 'repository',
            title: repo.name,
            subtitle: ownerName,
            description: repo.description || undefined,
            url: `/${ownerName}/${repo.name}`,
            metadata: {
              owner: ownerName,
              isPrivate: repo.isPrivate,
            },
          });
        });
      }
      return items;
    }

    // Add search results from API
    if (searchResults?.results) {
      searchResults.results.forEach(result => {
        items.push({
          id: result.id,
          type: result.type,
          title: result.title,
          description: result.description,
          url: result.url,
          metadata: result.metadata,
        });
      });
    }

    // Filter local repos
    const ownerName = session?.user?.name || '';
    if (repos && ownerName && (activeType === 'all' || activeType === 'repos')) {
      const matchingRepos = repos
        .filter(repo => 
          repo.name.toLowerCase().includes(lowerQuery) ||
          repo.description?.toLowerCase().includes(lowerQuery) ||
          ownerName.toLowerCase().includes(lowerQuery)
        )
        .slice(0, activeType === 'repos' ? 10 : 5);

      matchingRepos.forEach(repo => {
        // Avoid duplicates
        if (!items.find(i => i.id === `repo-${repo.id}`)) {
          items.push({
            id: `repo-${repo.id}`,
            type: 'repository',
            title: `${ownerName}/${repo.name}`,
            description: repo.description || undefined,
            url: `/${ownerName}/${repo.name}`,
            metadata: {
              owner: ownerName,
              isPrivate: repo.isPrivate,
            },
          });
        }
      });
    }

    // Filter user issues
    if (userIssues && (activeType === 'all' || activeType === 'issues')) {
      const matchingIssues = userIssues
        .filter(issue => 
          issue.title.toLowerCase().includes(lowerQuery) ||
          issue.body?.toLowerCase().includes(lowerQuery)
        )
        .slice(0, activeType === 'issues' ? 10 : 3);

      matchingIssues.forEach(issue => {
        items.push({
          id: `issue-${issue.id}`,
          type: 'issue',
          title: issue.title,
          url: `/issues/${issue.number}`, // TODO: need repo context
          metadata: {
            state: issue.state,
            number: issue.number,
          },
        });
      });
    }

    // Filter user PRs
    if (userPrs && (activeType === 'all' || activeType === 'prs')) {
      const matchingPrs = userPrs
        .filter(pr => 
          pr.title.toLowerCase().includes(lowerQuery) ||
          pr.body?.toLowerCase().includes(lowerQuery)
        )
        .slice(0, activeType === 'prs' ? 10 : 3);

      matchingPrs.forEach(pr => {
        items.push({
          id: `pr-${pr.id}`,
          type: 'pull_request',
          title: pr.title,
          url: `/pulls/${pr.number}`, // TODO: need repo context
          metadata: {
            state: pr.state,
            number: pr.number,
          },
        });
      });
    }

    return items;
  }, [debouncedQuery, searchResults, repos, userIssues, userPrs, activeType, session?.user?.name]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveType('all');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedElement = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedElement?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        if (e.key === 'j' && !e.metaKey && !e.ctrlKey) {
          // Only handle j when not typing
          if (document.activeElement?.tagName === 'INPUT') return;
        }
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
      case 'k':
        if (e.key === 'k' && !e.metaKey && !e.ctrlKey) {
          if (document.activeElement?.tagName === 'INPUT') return;
        }
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) {
          handleSelect(results[selectedIndex]);
        } else if (query.trim()) {
          // Navigate to search page
          handleGoToSearchPage();
        }
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'Tab':
        e.preventDefault();
        // Cycle through search types
        const types: SearchType[] = ['all', 'repos', 'issues', 'prs', 'code'];
        const currentIndex = types.indexOf(activeType);
        const nextIndex = e.shiftKey 
          ? (currentIndex - 1 + types.length) % types.length
          : (currentIndex + 1) % types.length;
        setActiveType(types[nextIndex]);
        break;
    }
  }, [results, selectedIndex, query, activeType, close]);

  const handleSelect = useCallback((item: SearchResultItem) => {
    addSearch(query);
    close();
    navigate(item.url);
  }, [query, addSearch, close, navigate]);

  const handleGoToSearchPage = useCallback(() => {
    addSearch(query);
    close();
    navigate(`/search?q=${encodeURIComponent(query)}&type=${activeType}`);
  }, [query, activeType, addSearch, close, navigate]);

  const handleRecentSearch = useCallback((searchQuery: string) => {
    setQuery(searchQuery);
    inputRef.current?.focus();
  }, []);

  const getTypeIcon = (type: SearchResultItem['type']) => {
    switch (type) {
      case 'repository':
        return <BookOpen className="h-4 w-4" />;
      case 'issue':
        return <CircleDot className="h-4 w-4" />;
      case 'pull_request':
        return <GitPullRequest className="h-4 w-4" />;
      case 'code':
        return <FileCode className="h-4 w-4" />;
      case 'user':
        return <User className="h-4 w-4" />;
      default:
        return <Search className="h-4 w-4" />;
    }
  };

  const getTypeColor = (type: SearchResultItem['type']) => {
    switch (type) {
      case 'repository':
        return 'text-blue-500';
      case 'issue':
        return 'text-green-500';
      case 'pull_request':
        return 'text-purple-500';
      case 'code':
        return 'text-orange-500';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent 
        className="p-0 gap-0 max-w-2xl overflow-hidden bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        
        {/* Search Input */}
        <div className="flex items-center border-b border-border/40 px-4">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search repositories, issues, pull requests..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 h-14 px-3 bg-transparent border-0 outline-none text-base placeholder:text-muted-foreground/50"
          />
          {isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
          )}
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 hover:bg-muted/40 rounded transition-colors"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Type Filters */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-border/40 bg-muted/20">
          {[
            { type: 'all' as SearchType, label: 'All', icon: Search },
            { type: 'repos' as SearchType, label: 'Repos', icon: BookOpen },
            { type: 'issues' as SearchType, label: 'Issues', icon: CircleDot },
            { type: 'prs' as SearchType, label: 'PRs', icon: GitPullRequest },
            { type: 'code' as SearchType, label: 'Code', icon: Code },
          ].map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                activeType === type
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div 
          ref={listRef}
          className="max-h-[400px] overflow-y-auto overscroll-contain"
        >
          {/* Empty State / Recent Searches */}
          {!query && recentSearches.length > 0 && (
            <div className="p-3">
              <div className="flex items-center justify-between mb-2 px-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Recent Searches
                </span>
                <button
                  onClick={clearSearches}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear
                </button>
              </div>
              <div className="space-y-1">
                {recentSearches.map((search, index) => (
                  <button
                    key={index}
                    onClick={() => handleRecentSearch(search)}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-left hover:bg-muted/60 transition-colors group"
                  >
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 text-sm">{search}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions when no query */}
          {!query && results.length > 0 && (
            <div className="p-3">
              <div className="px-2 mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Quick Access
                </span>
              </div>
              <div className="space-y-1">
                {results.map((item, index) => (
                  <SearchResultRow
                    key={item.id}
                    item={item}
                    index={index}
                    isSelected={selectedIndex === index}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    getTypeIcon={getTypeIcon}
                    getTypeColor={getTypeColor}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Search Results */}
          {query && results.length > 0 && (
            <div className="p-3">
              <div className="px-2 mb-2">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Results
                </span>
              </div>
              <div className="space-y-1">
                {results.map((item, index) => (
                  <SearchResultRow
                    key={item.id}
                    item={item}
                    index={index}
                    isSelected={selectedIndex === index}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    getTypeIcon={getTypeIcon}
                    getTypeColor={getTypeColor}
                  />
                ))}
              </div>
            </div>
          )}

          {/* No Results */}
          {query && debouncedQuery.length >= 2 && !isLoading && results.length === 0 && (
            <div className="p-8 text-center">
              <Search className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground mb-2">No results for "{query}"</p>
              <button
                onClick={handleGoToSearchPage}
                className="text-sm text-primary hover:underline"
              >
                Search on full search page
              </button>
            </div>
          )}

          {/* Code Search Hint */}
          {activeType === 'code' && (
            <div className="p-4 mx-3 mb-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-start gap-3">
                <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium mb-1">AI-Powered Code Search</p>
                  <p className="text-xs text-muted-foreground">
                    Search by meaning, not just keywords. Try queries like "authentication handler" or "database connection".
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/40 bg-muted/30 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="kbd">
                <span className="text-[10px]">&#8593;&#8595;</span>
              </kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="kbd">
                <span className="text-[10px]">&#8629;</span>
              </kbd>
              <span>Select</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="kbd">Tab</kbd>
              <span>Filter</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="kbd">esc</kbd>
              <span>Close</span>
            </span>
          </div>
          {query && (
            <button
              onClick={handleGoToSearchPage}
              className="flex items-center gap-1.5 text-primary hover:underline"
            >
              <span>Full search</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ SUB-COMPONENTS ============

interface SearchResultRowProps {
  item: SearchResultItem;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  getTypeIcon: (type: SearchResultItem['type']) => React.ReactNode;
  getTypeColor: (type: SearchResultItem['type']) => string;
}

function SearchResultRow({
  item,
  index,
  isSelected,
  onClick,
  onMouseEnter,
  getTypeIcon,
  getTypeColor,
}: SearchResultRowProps) {
  return (
    <button
      data-index={index}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-all',
        isSelected 
          ? 'bg-primary/10 ring-1 ring-primary/20' 
          : 'hover:bg-muted/60'
      )}
    >
      {/* Icon */}
      <div className={cn(
        'flex items-center justify-center h-8 w-8 rounded-lg shrink-0',
        isSelected ? 'bg-primary/20' : 'bg-muted/60'
      )}>
        <span className={getTypeColor(item.type)}>
          {getTypeIcon(item.type)}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            'font-medium truncate',
            isSelected && 'text-primary'
          )}>
            {item.title}
          </span>
          {item.metadata?.isPrivate && (
            <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          {item.metadata?.number && (
            <span className="text-xs text-muted-foreground shrink-0">
              #{item.metadata.number}
            </span>
          )}
        </div>
        {(item.description || item.subtitle) && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {item.subtitle || item.description}
          </p>
        )}
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-2 shrink-0">
        {item.metadata?.state && (
          <Badge 
            variant={item.metadata.state === 'open' ? 'success' : 'secondary'}
            className="text-xs"
          >
            {item.metadata.state}
          </Badge>
        )}
        {item.metadata?.stars !== undefined && item.metadata.stars > 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Star className="h-3 w-3" />
            {item.metadata.stars}
          </span>
        )}
        <ArrowRight className={cn(
          'h-4 w-4 text-muted-foreground transition-opacity',
          isSelected ? 'opacity-100' : 'opacity-0'
        )} />
      </div>
    </button>
  );
}
