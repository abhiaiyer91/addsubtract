/**
 * AI-Powered Code Search
 * 
 * Semantic code search that understands intent, not just keywords.
 * Features:
 * - Natural language queries
 * - Code structure awareness
 * - Symbol search
 * - File content search
 * - AI-ranked results
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useDebounce } from 'use-debounce';
import { cn } from '@/lib/utils';
import {
  Search,
  FileCode,
  FileText,
  Folder,
  Code2,
  Hash,
  AtSign,
  Braces,
  Box,
  Zap,
  Filter,
  X,
  ChevronRight,
  Loader2,
  Sparkles,
  Clock,
  Star,
  Eye,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type SearchResultType = 
  | 'file'
  | 'symbol'
  | 'text'
  | 'semantic';

export type SymbolKind = 
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'constant'
  | 'method'
  | 'property'
  | 'enum';

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  description?: string;
  filePath: string;
  lineNumber?: number;
  columnNumber?: number;
  preview?: string;
  matchRanges?: { start: number; end: number }[];
  symbol?: {
    kind: SymbolKind;
    signature?: string;
    documentation?: string;
  };
  score: number;
  aiExplanation?: string;
}

export interface SearchFilters {
  fileTypes: string[];
  directories: string[];
  excludeTests: boolean;
  excludeGenerated: boolean;
  symbolKinds: SymbolKind[];
}

const DEFAULT_FILTERS: SearchFilters = {
  fileTypes: [],
  directories: [],
  excludeTests: false,
  excludeGenerated: false,
  symbolKinds: [],
};

const SYMBOL_ICONS: Record<SymbolKind, React.ReactNode> = {
  function: <Box className="h-3.5 w-3.5 text-purple-500" />,
  class: <Braces className="h-3.5 w-3.5 text-yellow-500" />,
  interface: <Code2 className="h-3.5 w-3.5 text-blue-500" />,
  type: <Hash className="h-3.5 w-3.5 text-cyan-500" />,
  variable: <AtSign className="h-3.5 w-3.5 text-green-500" />,
  constant: <Zap className="h-3.5 w-3.5 text-orange-500" />,
  method: <Box className="h-3.5 w-3.5 text-purple-400" />,
  property: <AtSign className="h-3.5 w-3.5 text-green-400" />,
  enum: <Hash className="h-3.5 w-3.5 text-pink-500" />,
};

interface AICodeSearchProps {
  onSearch: (query: string, filters: SearchFilters) => Promise<SearchResult[]>;
  onResultClick: (result: SearchResult) => void;
  onPreviewResult: (result: SearchResult) => void;
  recentSearches?: string[];
  className?: string;
}

export function AICodeSearch({
  onSearch,
  onResultClick,
  onPreviewResult,
  recentSearches = [],
  className,
}: AICodeSearchProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounce(query, 300);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'files' | 'symbols' | 'semantic'>('all');
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Perform search when query changes
  useEffect(() => {
    async function performSearch() {
      if (!debouncedQuery.trim()) {
        setResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const searchResults = await onSearch(debouncedQuery, filters);
        setResults(searchResults);
        setSelectedIndex(0);
      } catch (error) {
        console.error('Search failed:', error);
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }

    performSearch();
  }, [debouncedQuery, filters, onSearch]);

  // Filter results by tab
  const filteredResults = useMemo(() => {
    if (activeTab === 'all') return results;
    
    const typeMap: Record<string, SearchResultType[]> = {
      files: ['file'],
      symbols: ['symbol'],
      semantic: ['semantic'],
    };
    
    return results.filter(r => typeMap[activeTab]?.includes(r.type));
  }, [results, activeTab]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredResults.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filteredResults[selectedIndex]) {
          onResultClick(filteredResults[selectedIndex]);
        }
        break;
    }
  }, [filteredResults, selectedIndex, onResultClick]);

  // Keep selected item in view
  useEffect(() => {
    const element = resultsRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    if (element) {
      element.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const getResultIcon = (result: SearchResult) => {
    if (result.type === 'symbol' && result.symbol) {
      return SYMBOL_ICONS[result.symbol.kind];
    }
    if (result.type === 'file') {
      return <FileCode className="h-4 w-4 text-blue-500" />;
    }
    if (result.type === 'semantic') {
      return <Sparkles className="h-4 w-4 text-purple-500" />;
    }
    return <FileText className="h-4 w-4 text-muted-foreground" />;
  };

  const highlightMatches = (text: string, ranges?: { start: number; end: number }[]) => {
    if (!ranges || ranges.length === 0) return text;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    ranges.forEach((range, i) => {
      if (range.start > lastIndex) {
        parts.push(text.slice(lastIndex, range.start));
      }
      parts.push(
        <mark key={i} className="bg-yellow-500/30 text-foreground rounded px-0.5">
          {text.slice(range.start, range.end)}
        </mark>
      );
      lastIndex = range.end;
    });

    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts;
  };

  return (
    <div className={cn('flex flex-col border rounded-lg bg-background', className)}>
      {/* Search Header */}
      <div className="p-4 border-b space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search code, symbols, or ask a question..."
            className="pl-10 pr-20"
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {isSearching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    <Filter className={cn('h-4 w-4', showFilters && 'text-purple-500')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Filters</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {query && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setQuery('')}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs h-7 px-3">
              All
              {results.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[10px]">
                  {results.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="files" className="text-xs h-7 px-3">
              <FileCode className="h-3 w-3 mr-1" />
              Files
            </TabsTrigger>
            <TabsTrigger value="symbols" className="text-xs h-7 px-3">
              <Code2 className="h-3 w-3 mr-1" />
              Symbols
            </TabsTrigger>
            <TabsTrigger value="semantic" className="text-xs h-7 px-3">
              <Sparkles className="h-3 w-3 mr-1" />
              AI
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filters Panel */}
        {showFilters && (
          <div className="p-3 rounded-lg bg-muted/50 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">Filters</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setFilters(DEFAULT_FILTERS)}
              >
                Reset
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.excludeTests}
                  onChange={(e) => setFilters(f => ({ ...f, excludeTests: e.target.checked }))}
                  className="rounded border-muted-foreground"
                />
                <span className="text-xs">Exclude tests</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.excludeGenerated}
                  onChange={(e) => setFilters(f => ({ ...f, excludeGenerated: e.target.checked }))}
                  className="rounded border-muted-foreground"
                />
                <span className="text-xs">Exclude generated</span>
              </label>
            </div>
            <div className="flex flex-wrap gap-1">
              {(['function', 'class', 'interface', 'type'] as SymbolKind[]).map(kind => (
                <Badge
                  key={kind}
                  variant={filters.symbolKinds.includes(kind) ? 'default' : 'outline'}
                  className="cursor-pointer text-xs"
                  onClick={() => {
                    setFilters(f => ({
                      ...f,
                      symbolKinds: f.symbolKinds.includes(kind)
                        ? f.symbolKinds.filter(k => k !== kind)
                        : [...f.symbolKinds, kind],
                    }));
                  }}
                >
                  {SYMBOL_ICONS[kind]}
                  <span className="ml-1">{kind}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      <ScrollArea className="flex-1 max-h-[400px]" ref={resultsRef}>
        {filteredResults.length > 0 ? (
          <div className="py-2">
            {filteredResults.map((result, index) => (
              <button
                key={result.id}
                data-index={index}
                className={cn(
                  'w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors',
                  index === selectedIndex && 'bg-muted'
                )}
                onClick={() => onResultClick(result)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  {getResultIcon(result)}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{result.title}</span>
                    {result.symbol && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                        {result.symbol.kind}
                      </Badge>
                    )}
                    {result.type === 'semantic' && (
                      <Badge className="text-[10px] px-1.5 py-0 h-4 bg-purple-500">
                        AI
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{result.filePath}</span>
                    {result.lineNumber && (
                      <span className="shrink-0">:{result.lineNumber}</span>
                    )}
                  </div>
                  {result.preview && (
                    <div className="text-xs font-mono bg-muted/50 rounded px-2 py-1 truncate">
                      {highlightMatches(result.preview, result.matchRanges)}
                    </div>
                  )}
                  {result.aiExplanation && (
                    <div className="text-xs text-purple-400 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      {result.aiExplanation}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPreviewResult(result);
                          }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Preview</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                </div>
              </button>
            ))}
          </div>
        ) : query.trim() ? (
          <div className="py-12 text-center">
            {isSearching ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
                <p className="text-sm text-muted-foreground">Searching...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Search className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium">No results found</p>
                <p className="text-xs text-muted-foreground">
                  Try different keywords or ask a question
                </p>
              </div>
            )}
          </div>
        ) : (
          /* Empty state with recent searches */
          <div className="py-4">
            {recentSearches.length > 0 && (
              <div className="px-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Recent searches</span>
                </div>
                {recentSearches.map((search, i) => (
                  <button
                    key={i}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-left"
                    onClick={() => setQuery(search)}
                  >
                    <Search className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm">{search}</span>
                  </button>
                ))}
              </div>
            )}
            
            <div className="px-4 mt-4 space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                <span>Try asking</span>
              </div>
              {[
                'Where is user authentication handled?',
                'Functions that fetch data from API',
                'Components that use useState',
                'How does the payment flow work?',
              ].map((suggestion, i) => (
                <button
                  key={i}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-left group"
                  onClick={() => setQuery(suggestion)}
                >
                  <Zap className="h-3.5 w-3.5 text-purple-500 group-hover:text-purple-400" />
                  <span className="text-sm text-muted-foreground group-hover:text-foreground">
                    {suggestion}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-muted rounded">↑↓</kbd>
            Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-muted rounded">↵</kbd>
            Open
          </span>
        </div>
        {filteredResults.length > 0 && (
          <span>{filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Hook for code search
 */
export function useAICodeSearch() {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const addRecentSearch = useCallback((query: string) => {
    setRecentSearches(prev => {
      const filtered = prev.filter(s => s !== query);
      return [query, ...filtered].slice(0, 10);
    });
  }, []);

  return {
    isSearchOpen,
    openSearch: () => setIsSearchOpen(true),
    closeSearch: () => setIsSearchOpen(false),
    recentSearches,
    addRecentSearch,
  };
}
