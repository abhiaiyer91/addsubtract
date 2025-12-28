import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Search,
  Code,
  BookOpen,
  CircleDot,
  GitPullRequest,
  Loader2,
  FileCode,
  Star,
  Lock,
  Sparkles,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/lib/trpc';

type SearchType = 'all' | 'code' | 'repositories' | 'issues' | 'prs';

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get('q') || '';
  const typeParam = (searchParams.get('type') as SearchType) || 'all';
  
  const [query, setQuery] = useState(queryParam);
  const [activeType, setActiveType] = useState<SearchType>(typeParam);

  // Search query
  const { data: searchResults, isLoading } = trpc.search.search.useQuery(
    { query: queryParam, type: activeType, limit: 50 },
    { enabled: !!queryParam }
  );

  // Check AI status for code search
  const { data: aiStatus } = trpc.ai.status.useQuery();

  // Update URL when search changes
  useEffect(() => {
    if (query !== queryParam) {
      setQuery(queryParam);
    }
  }, [queryParam]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      setSearchParams({ q: query, type: activeType });
    }
  };

  const handleTypeChange = (type: string) => {
    setActiveType(type as SearchType);
    if (queryParam) {
      setSearchParams({ q: queryParam, type });
    }
  };

  return (
    <div className="container max-w-4xl py-8">
      {/* Search form */}
      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search repositories, code, issues, and pull requests..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10 h-12 text-lg"
            />
          </div>
          <Button type="submit" size="lg">
            Search
          </Button>
        </div>
      </form>

      {/* Search type tabs */}
      <Tabs value={activeType} onValueChange={handleTypeChange} className="mb-6">
        <TabsList>
          <TabsTrigger value="all" className="gap-2">
            <Search className="h-4 w-4" />
            All
          </TabsTrigger>
          <TabsTrigger value="code" className="gap-2">
            <Code className="h-4 w-4" />
            Code
          </TabsTrigger>
          <TabsTrigger value="repositories" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Repositories
          </TabsTrigger>
          <TabsTrigger value="issues" className="gap-2">
            <CircleDot className="h-4 w-4" />
            Issues
          </TabsTrigger>
          <TabsTrigger value="prs" className="gap-2">
            <GitPullRequest className="h-4 w-4" />
            Pull Requests
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* AI Status Banner for Code Search */}
      {activeType === 'code' && queryParam && !aiStatus?.features?.semanticSearch && (
        <Alert className="mb-4 border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <Sparkles className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            <strong>Using text search.</strong> AI-powered semantic search finds code by meaning, not just keywords.
            {' '}
            <Link to="/settings/ai" className="underline hover:no-underline font-medium">
              Add an OpenAI API key
            </Link>
            {' '}to enable semantic search.
          </AlertDescription>
        </Alert>
      )}

      {/* Results */}
      {!queryParam ? (
        <EmptyState />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : searchResults?.results?.length === 0 ? (
        <NoResults query={queryParam} type={activeType} />
      ) : (
        <SearchResults results={searchResults?.results || []} activeType={activeType} aiStatus={aiStatus} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="p-12 text-center">
        <Search className="h-16 w-16 mx-auto mb-6 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold mb-2">Search wit</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Search for repositories, code, issues, and pull requests. 
          Use natural language for code search - find code by what it does, not just keywords.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
          <Badge variant="outline">Try: "authentication handler"</Badge>
          <Badge variant="outline">Try: "how do tests work"</Badge>
          <Badge variant="outline">Try: "error handling"</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function NoResults({ query, type }: { query: string; type: string }) {
  return (
    <Card>
      <CardContent className="p-8 text-center">
        <Search className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
        <h3 className="text-lg font-medium mb-2">No results found</h3>
        <p className="text-muted-foreground">
          No {type === 'all' ? 'results' : type} matching "{query}"
        </p>
      </CardContent>
    </Card>
  );
}

function SemanticSearchBadge({ enabled }: { enabled: boolean }) {
  if (enabled) {
    return (
      <div className="mb-4 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
        <Sparkles className="h-4 w-4" />
        <span>AI-powered semantic search is active</span>
      </div>
    );
  }
  return null;
}

interface SearchResult {
  type: 'code' | 'repository' | 'issue' | 'pull_request';
  id: string;
  title: string;
  description?: string;
  url: string;
  score?: number;
  metadata?: Record<string, any>;
}

function SearchResults({ results, activeType, aiStatus }: { results: SearchResult[]; activeType: SearchType; aiStatus: any }) {
  const codeResults = results.filter(r => r.type === 'code');
  const otherResults = results.filter(r => r.type !== 'code');
  
  return (
    <div className="space-y-3">
      {/* Show semantic search badge when viewing code results */}
      {activeType === 'code' && <SemanticSearchBadge enabled={aiStatus?.features?.semanticSearch} />}
      
      <p className="text-sm text-muted-foreground mb-4">
        {results.length} result{results.length !== 1 ? 's' : ''}
        {activeType === 'code' && !aiStatus?.features?.semanticSearch && (
          <span className="ml-2 text-amber-600">(text search)</span>
        )}
        {activeType === 'code' && aiStatus?.features?.semanticSearch && (
          <span className="ml-2 text-green-600">(semantic search)</span>
        )}
      </p>
      
      {/* Show code results first when on code tab */}
      {activeType === 'code' && codeResults.map((result) => (
        <SearchResultCard key={result.id} result={result} />
      ))}
      
      {/* Show other results */}
      {(activeType !== 'code' ? results : otherResults).map((result) => (
        <SearchResultCard key={result.id} result={result} />
      ))}
    </div>
  );
}

function SearchResultCard({ result }: { result: SearchResult }) {
  const getIcon = () => {
    switch (result.type) {
      case 'code':
        return <FileCode className="h-5 w-5 text-blue-500" />;
      case 'repository':
        return <BookOpen className="h-5 w-5 text-primary" />;
      case 'issue':
        return <CircleDot className="h-5 w-5 text-green-500" />;
      case 'pull_request':
        return <GitPullRequest className="h-5 w-5 text-purple-500" />;
      default:
        return <Search className="h-5 w-5" />;
    }
  };

  const getTypeLabel = () => {
    switch (result.type) {
      case 'code':
        return 'Code';
      case 'repository':
        return 'Repository';
      case 'issue':
        return 'Issue';
      case 'pull_request':
        return 'Pull Request';
      default:
        return result.type;
    }
  };

  return (
    <Card className="hover:border-primary/30 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{getIcon()}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Link 
                to={result.url}
                className="font-medium hover:text-primary hover:underline truncate"
              >
                {result.title}
              </Link>
              {result.metadata?.isPrivate && (
                <Lock className="h-3 w-3 text-muted-foreground" />
              )}
              {result.score && (
                <Badge variant="outline" className="text-xs">
                  {Math.round(result.score * 100)}% match
                </Badge>
              )}
            </div>
            
            {result.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                {result.description}
              </p>
            )}
            
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <Badge variant="secondary" className="text-xs">
                {getTypeLabel()}
              </Badge>
              
              {result.type === 'repository' && result.metadata && (
                <>
                  {result.metadata.language && (
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      {result.metadata.language}
                    </span>
                  )}
                  {result.metadata.stars > 0 && (
                    <span className="flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      {result.metadata.stars}
                    </span>
                  )}
                </>
              )}

              {(result.type === 'issue' || result.type === 'pull_request') && result.metadata && (
                <>
                  {result.metadata.repo && (
                    <span>{result.metadata.repo}</span>
                  )}
                  {result.metadata.state && (
                    <Badge 
                      variant={result.metadata.state === 'open' ? 'success' : 'secondary'}
                      className="text-xs"
                    >
                      {result.metadata.state}
                    </Badge>
                  )}
                </>
              )}

              {result.type === 'code' && result.metadata && (
                <>
                  {result.metadata.startLine && result.metadata.endLine && (
                    <span>Lines {result.metadata.startLine}-{result.metadata.endLine}</span>
                  )}
                  {result.metadata.language && (
                    <span>{result.metadata.language}</span>
                  )}
                </>
              )}
            </div>

            {/* Code snippet for code results */}
            {result.type === 'code' && result.metadata?.content && (
              <div className="mt-3 bg-muted/50 rounded-md p-3 overflow-x-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {result.metadata.content.slice(0, 500)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
