import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Heart,
  HandHeart,
  Sparkles,
  CircleDot,
  GitFork,
  Search,
  Tag,
  Signal,
  AlertCircle,
  ChevronDown,
  Users,
  ExternalLink,
  BookOpen,
  TestTube,
  MessageSquare,
  Wrench,
  Rocket,
  Code,
  FileText,
  Bug,
  Zap,
  CheckCircle2,
  Circle,
  Github,
  Copy,
  Check,
  Terminal,
  Bot,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime, cn } from '@/lib/utils';

// Priority config
const PRIORITY_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  urgent: { label: 'Urgent', icon: <AlertCircle className="h-3 w-3" />, color: 'text-red-500' },
  high: { label: 'High', icon: <Signal className="h-3 w-3" />, color: 'text-orange-500' },
  medium: { label: 'Medium', icon: <Signal className="h-3 w-3" />, color: 'text-yellow-500' },
  low: { label: 'Low', icon: <Signal className="h-3 w-3" />, color: 'text-blue-500' },
  none: { label: 'No priority', icon: <Signal className="h-3 w-3" />, color: 'text-muted-foreground' },
};

type LabelFilter = 'all' | 'help-wanted' | 'good-first-issue';

function ContributeSkeleton() {
  return (
    <div className="container max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function ContributePage() {
  const [activeTab, setActiveTab] = useState<'wit' | 'repos'>('wit');
  const [searchQuery, setSearchQuery] = useState('');
  const [labelFilter, setLabelFilter] = useState<LabelFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<string | undefined>();

  const { data: summary, isLoading: summaryLoading } = trpc.issues.contributionSummary.useQuery();
  const { data: issues, isLoading: issuesLoading } = trpc.issues.listContributionIssues.useQuery({
    labelFilter,
    priority: priorityFilter as any,
    limit: 50,
  });

  const isLoading = summaryLoading || issuesLoading;

  // Filter issues by search query
  const filteredIssues = issues?.filter((item) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.issue.title.toLowerCase().includes(q) ||
      item.repo.name.toLowerCase().includes(q) ||
      `#${item.issue.number}`.includes(q)
    );
  });

  if (isLoading) {
    return <ContributeSkeleton />;
  }

  return (
    <div className="container max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-8">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500/20 to-purple-500/20">
            <Heart className="h-8 w-8 text-pink-500" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Contribute</h1>
            <p className="text-muted-foreground">
              Open source is at the heart of Wit. Find ways to contribute!
            </p>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'wit' | 'repos')} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="wit" className="gap-2">
            <Rocket className="h-4 w-4" />
            Contribute to Wit
          </TabsTrigger>
          <TabsTrigger value="repos" className="gap-2">
            <HandHeart className="h-4 w-4" />
            Help Repositories
          </TabsTrigger>
        </TabsList>

        {/* Contribute to Wit Tab */}
        <TabsContent value="wit" className="mt-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20">
              <Rocket className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">Help Build the Future of Git</h2>
              <p className="text-muted-foreground text-sm">
                Contribute directly to Wit. Here's what we need help with from our roadmap.
              </p>
            </div>
          </div>

        {/* Phase Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Phase 1: Stability & Polish */}
          <Card className="border-red-500/20 hover:border-red-500/40 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-red-500/10">
                  <Bug className="h-4 w-4 text-red-500" />
                </div>
                <CardTitle className="text-base">Phase 1: Stability & Polish</CardTitle>
                <Badge variant="secondary" className="ml-auto text-xs bg-red-500/10 text-red-500">
                  Current
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Make wit rock-solid for daily use
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <RoadmapItem 
                title="Fix integration test failures" 
                priority="P0" 
                status="in_progress"
                description="Get all tests passing - great for learning the codebase"
              />
              <RoadmapItem 
                title="ESM/CommonJS configuration cleanup" 
                priority="P1" 
                status="todo"
                description="Help make the build system more robust"
              />
              <RoadmapItem 
                title="Error message audit" 
                priority="P1" 
                status="todo"
                description="Make error messages helpful with suggestions"
              />
            </CardContent>
          </Card>

          {/* Phase 2: Documentation & Onboarding */}
          <Card className="border-blue-500/20 hover:border-blue-500/40 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-blue-500/10">
                  <BookOpen className="h-4 w-4 text-blue-500" />
                </div>
                <CardTitle className="text-base">Phase 2: Documentation</CardTitle>
                <Badge variant="secondary" className="ml-auto text-xs bg-blue-500/10 text-blue-500">
                  Next
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Make it easy for anyone to try wit
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <RoadmapItem 
                title="Command reference documentation" 
                priority="P0" 
                status="todo"
                description="Document all 72+ CLI commands"
              />
              <RoadmapItem 
                title="'5 minutes to wow' tutorial" 
                priority="P0" 
                status="todo"
                description="Quick start guide for new users"
              />
              <RoadmapItem 
                title="Installation one-liner" 
                priority="P0" 
                status="todo"
                description="Simple install script like nvm or rustup"
              />
              <RoadmapItem 
                title="Demo video" 
                priority="P1" 
                status="todo"
                description="Show off wit's AI features"
              />
            </CardContent>
          </Card>

          {/* Good First Issues */}
          <Card className="border-green-500/20 hover:border-green-500/40 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-green-500/10">
                  <Sparkles className="h-4 w-4 text-green-500" />
                </div>
                <CardTitle className="text-base">Good First Contributions</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Perfect for getting started
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <RoadmapItem 
                title="Add missing TypeScript types" 
                priority="Easy" 
                status="todo"
                description="Help improve type safety"
              />
              <RoadmapItem 
                title="Write tests for untested functions" 
                priority="Easy" 
                status="todo"
                description="Increase test coverage"
              />
              <RoadmapItem 
                title="Improve CLI help text" 
                priority="Easy" 
                status="todo"
                description="Make --help output more helpful"
              />
              <RoadmapItem 
                title="Add code comments" 
                priority="Easy" 
                status="todo"
                description="Help document complex functions"
              />
            </CardContent>
          </Card>

          {/* Advanced Contributions */}
          <Card className="border-purple-500/20 hover:border-purple-500/40 transition-colors">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-md bg-purple-500/10">
                  <Zap className="h-4 w-4 text-purple-500" />
                </div>
                <CardTitle className="text-base">Advanced Contributions</CardTitle>
              </div>
              <CardDescription className="text-xs">
                For experienced contributors
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <RoadmapItem 
                title="Improve semantic search" 
                priority="P1" 
                status="todo"
                description="Enhance AI-powered code search"
              />
              <RoadmapItem 
                title="Add new AI tools" 
                priority="P2" 
                status="todo"
                description="Expand the AI agent capabilities"
              />
              <RoadmapItem 
                title="Performance optimization" 
                priority="P2" 
                status="todo"
                description="Make large repo operations faster"
              />
              <RoadmapItem 
                title="CI/CD integration" 
                priority="P1" 
                status="partial"
                description="Improve GitHub Actions compatibility"
              />
            </CardContent>
          </Card>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="bg-muted/30">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">72+</div>
              <div className="text-xs text-muted-foreground">CLI Commands</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">28</div>
              <div className="text-xs text-muted-foreground">AI Tools</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">35</div>
              <div className="text-xs text-muted-foreground">API Routers</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">37</div>
              <div className="text-xs text-muted-foreground">DB Models</div>
            </CardContent>
          </Card>
        </div>

        {/* AI-Powered Contribution Prompts */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20">
              <Bot className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-bold">AI-Powered Contributions</h2>
              <p className="text-muted-foreground text-sm">
                Copy a prompt, paste it into your AI coding agent, and open a PR!
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <CopyablePrompt
              title="Add tests for untested functions"
              category="Good First Issue"
              categoryColor="green"
              prompt={`I'm contributing to wit, an AI-native Git platform. Please help me add tests for functions that don't have test coverage.

1. First, explore the codebase to understand the testing patterns:
   - Look at existing tests in src/__tests__/ and tests/integration/
   - Understand the test framework (vitest) and patterns used

2. Find functions in src/core/ or src/commands/ that lack test coverage

3. Write comprehensive tests following the existing patterns:
   - Use describe/it blocks
   - Test happy paths and edge cases
   - Mock external dependencies appropriately

4. Run the tests with: npm test

5. Create a commit with a clear message describing which functions you tested

The codebase uses TypeScript strict mode and vitest for testing.`}
            />
            
            <CopyablePrompt
              title="Improve CLI help text"
              category="Good First Issue"
              categoryColor="green"
              prompt={`I'm contributing to wit, an AI-native Git platform. Please help me improve the CLI help text to be more helpful and user-friendly.

1. Explore the commands in src/commands/ - each file is a CLI command

2. For each command, review the --help output and improve it:
   - Add clear descriptions
   - Include useful examples
   - Explain all options
   - Add tips where helpful

3. Look at how yargs is configured in each command file

4. Focus on commands like: init, commit, branch, merge, pr, issue, agent, search

5. Test your changes by running: npm run build && ./bin/wit.js <command> --help

6. Create a commit describing which commands you improved

Make the help text friendly - wit's philosophy is "Git that doesn't hate you".`}
            />
            
            <CopyablePrompt
              title="Add TypeScript type improvements"
              category="Good First Issue"
              categoryColor="green"
              prompt={`I'm contributing to wit, an AI-native Git platform. Please help me improve TypeScript types throughout the codebase.

1. The project uses TypeScript strict mode - check tsconfig.json

2. Look for opportunities to improve types:
   - Replace 'any' types with proper types
   - Add missing return type annotations
   - Improve interface definitions
   - Add JSDoc comments for complex types

3. Focus on these areas:
   - src/core/ - core Git implementation
   - src/ai/tools/ - AI tool definitions
   - src/api/trpc/ - tRPC routers

4. Run type checking with: npm run build

5. Make sure all tests still pass: npm test

6. Create focused commits for each improvement area

The goal is to make the codebase easier to understand and prevent runtime errors.`}
            />
            
            <CopyablePrompt
              title="Fix integration test failures"
              category="High Priority"
              categoryColor="red"
              prompt={`I'm contributing to wit, an AI-native Git platform. Please help me fix failing integration tests.

1. First, run the tests to see which ones are failing:
   npm test

2. Look at the test files in:
   - tests/integration/ - integration tests
   - src/__tests__/ - unit tests

3. For each failing test:
   - Understand what the test is trying to verify
   - Read the relevant source code in src/
   - Determine if the issue is in the test or the implementation
   - Fix the issue

4. Common areas that may need fixes:
   - PR flow tests
   - Issue management tests
   - Git operations tests

5. Run tests after each fix to verify: npm test

6. Create commits for each test fix with clear descriptions

Focus on getting all tests green - this is a P0 priority for the project.`}
            />
            
            <CopyablePrompt
              title="Improve error messages"
              category="High Priority"
              categoryColor="orange"
              prompt={`I'm contributing to wit, an AI-native Git platform. Please help me improve error messages to be more helpful.

1. Search the codebase for error handling patterns:
   - throw new Error(...)
   - console.error(...)
   - Error classes

2. For each error message, improve it to:
   - Clearly explain what went wrong
   - Suggest how to fix it
   - Provide relevant context

3. Example of a good error message:
   Before: "Invalid branch"
   After: "Branch 'feature/xyz' does not exist. Run 'wit branch' to see available branches, or 'wit branch feature/xyz' to create it."

4. Focus on user-facing commands in src/commands/

5. Test error scenarios manually to verify improvements

6. Create commits describing which error messages you improved

wit's philosophy is "Git that doesn't hate you" - errors should help, not frustrate.`}
            />
            
            <CopyablePrompt
              title="Document CLI commands"
              category="Documentation"
              categoryColor="blue"
              prompt={`I'm contributing to wit, an AI-native Git platform. Please help me create documentation for CLI commands.

1. Look at the existing docs structure in docs/commands/

2. For each undocumented command in src/commands/:
   - Create or update a .mdx file in docs/commands/
   - Include: description, usage, options, examples
   - Follow the existing documentation style

3. Commands to document (check which are missing):
   - agent.ts - AI agent commands
   - search.ts - Semantic search
   - stack.ts - Stacked diffs
   - cycle.ts - Sprint/cycle management
   - journal.ts - Documentation system
   - wrapped.ts - Activity insights

4. Each doc should include:
   - Clear description of what the command does
   - All available options/flags
   - Real-world usage examples
   - Tips and best practices

5. Create commits for each command documented

The docs use MDX format - check docs/mint.json for navigation structure.`}
            />

            <CopyablePrompt
              title="Add new AI tool"
              category="Advanced"
              categoryColor="purple"
              prompt={`I'm contributing to wit, an AI-native Git platform. Please help me add a new AI tool for the coding agents.

1. Study existing AI tools in src/ai/tools/:
   - Look at the tool definitions and patterns
   - Understand how tools integrate with the agent system
   - Check src/ai/agent.ts for agent implementation

2. Choose a new tool to implement. Ideas:
   - findReferences - Find all references to a symbol
   - explainCode - Explain what a code block does
   - generateTests - Generate tests for a function
   - refactorCode - Suggest refactoring improvements
   - findSimilar - Find similar code patterns

3. Create the tool following the existing patterns:
   - Define input/output types
   - Implement the tool function
   - Add to the tool registry
   - Write tests

4. The tool system uses Mastra - see src/ai/services/mastra.ts

5. Test your tool by running the agent: wit agent

6. Create a commit describing the new tool and its purpose

AI tools should feel like having a helpful colleague, not just automation.`}
            />

            <CopyablePrompt
              title="Improve semantic search"
              category="Advanced"
              categoryColor="purple"
              prompt={`I'm contributing to wit, an AI-native Git platform. Please help me improve the semantic code search feature.

1. Study the current implementation in src/search/:
   - chunker.ts - How code is chunked for embedding
   - embeddings.ts - Embedding generation
   - vector-store.ts - Vector storage and search
   - semantic.ts - Main semantic search logic

2. Areas for improvement:
   - Better code chunking (respect function/class boundaries)
   - Improved relevance ranking
   - Support for more languages
   - Hybrid search (combine keyword + semantic)
   - Performance optimization for large repos

3. Test with: wit search "your query here"

4. The search should understand intent:
   - "where do we handle authentication" should find auth code
   - "how are errors logged" should find logging code

5. Run tests: npm test

6. Create commits describing your improvements

The goal: when you ask wit a question about code, it should find the right answer.`}
            />
          </div>
        </div>

        {/* Code Philosophy */}
        <Card className="bg-muted/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Code className="h-4 w-4" />
              Code Philosophy
            </CardTitle>
            <CardDescription className="text-xs">
              How we build wit
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>TypeScript strict mode</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Tests for new functionality</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>Helpful error messages with suggestions</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>CLI output should be beautiful</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>AI should feel like a colleague</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <span>We only accept AI-generated contributions</span>
              </div>
            </div>
          </CardContent>
        </Card>

          {/* CTA */}
          <Card className="bg-gradient-to-r from-primary/5 via-purple-500/5 to-pink-500/5 border-primary/20">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <div className="p-3 rounded-full bg-primary/10">
                  <GitFork className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <h3 className="text-lg font-semibold">Ready to contribute to Wit?</h3>
                  <p className="text-muted-foreground text-sm">
                    Fork the repository, pick an issue, and submit your first pull request!
                  </p>
                </div>
                <div className="flex gap-2">
                  <a 
                    href="https://github.com/abhiaiyer91/wit" 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <Button className="gap-2">
                      <Github className="h-4 w-4" />
                      View on GitHub
                    </Button>
                  </a>
                  <a 
                    href="https://github.com/abhiaiyer91/wit/blob/main/CONTRIBUTING.md" 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" className="gap-2">
                      <FileText className="h-4 w-4" />
                      Contributing Guide
                    </Button>
                  </a>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Help Repositories Tab */}
        <TabsContent value="repos" className="mt-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="hover:border-primary/50 transition-colors cursor-pointer" onClick={() => setLabelFilter('all')}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{summary?.total ?? 0}</div>
                    <div className="text-sm text-muted-foreground">Total Open Tasks</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card 
              className={cn(
                "hover:border-green-500/50 transition-colors cursor-pointer",
                labelFilter === 'help-wanted' && "border-green-500/50 bg-green-500/5"
              )}
              onClick={() => setLabelFilter('help-wanted')}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <HandHeart className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{summary?.helpWanted ?? 0}</div>
                    <div className="text-sm text-muted-foreground">Help Wanted</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card 
              className={cn(
                "hover:border-purple-500/50 transition-colors cursor-pointer",
                labelFilter === 'good-first-issue' && "border-purple-500/50 bg-purple-500/5"
              )}
              onClick={() => setLabelFilter('good-first-issue')}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Sparkles className="h-5 w-5 text-purple-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{summary?.goodFirstIssue ?? 0}</div>
                    <div className="text-sm text-muted-foreground">Good First Issues</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 max-w-sm w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search issues..."
                className="pl-9 h-9 bg-muted/50 border-0 focus-visible:bg-background focus-visible:ring-1"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <Tabs value={labelFilter} onValueChange={(v) => setLabelFilter(v as LabelFilter)}>
                <TabsList>
                  <TabsTrigger value="all" className="text-xs sm:text-sm">All</TabsTrigger>
                  <TabsTrigger value="help-wanted" className="text-xs sm:text-sm">Help Wanted</TabsTrigger>
                  <TabsTrigger value="good-first-issue" className="text-xs sm:text-sm">Good First Issue</TabsTrigger>
                </TabsList>
              </Tabs>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Signal className="h-4 w-4" />
                    <span className="hidden sm:inline">Priority</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setPriorityFilter(undefined)}>
                    All Priorities
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setPriorityFilter('urgent')}>
                    <AlertCircle className="h-4 w-4 mr-2 text-red-500" />
                    Urgent
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPriorityFilter('high')}>
                    <Signal className="h-4 w-4 mr-2 text-orange-500" />
                    High
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPriorityFilter('medium')}>
                    <Signal className="h-4 w-4 mr-2 text-yellow-500" />
                    Medium
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPriorityFilter('low')}>
                    <Signal className="h-4 w-4 mr-2 text-blue-500" />
                    Low
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Issues List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CircleDot className="h-5 w-5 text-green-500" />
                Open Tasks
              </CardTitle>
              <CardDescription>
                {filteredIssues?.length ?? 0} issue{(filteredIssues?.length ?? 0) !== 1 ? 's' : ''} available for contribution
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!filteredIssues || filteredIssues.length === 0 ? (
                <div className="text-center py-12">
                  <Heart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No issues found</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    {searchQuery
                      ? 'Try a different search term'
                      : 'No contribution-worthy issues are available right now. Check back later or create issues with "help wanted" or "good first issue" labels!'}
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {filteredIssues.map((item) => (
                    <IssueCard key={item.issue.id} item={item} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Roadmap item component
interface RoadmapItemProps {
  title: string;
  priority: string;
  status: 'todo' | 'in_progress' | 'partial' | 'done';
  description: string;
}

function RoadmapItem({ title, priority, status, description }: RoadmapItemProps) {
  const statusConfig = {
    todo: { icon: Circle, color: 'text-muted-foreground' },
    in_progress: { icon: CircleDot, color: 'text-yellow-500' },
    partial: { icon: CircleDot, color: 'text-blue-500' },
    done: { icon: CheckCircle2, color: 'text-green-500' },
  };

  const priorityConfig: Record<string, { color: string; bg: string }> = {
    P0: { color: 'text-red-500', bg: 'bg-red-500/10' },
    P1: { color: 'text-orange-500', bg: 'bg-orange-500/10' },
    P2: { color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
    Easy: { color: 'text-green-500', bg: 'bg-green-500/10' },
  };

  const StatusIcon = statusConfig[status].icon;
  const priorityStyle = priorityConfig[priority] || { color: 'text-muted-foreground', bg: 'bg-muted' };

  return (
    <div className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
      <StatusIcon className={cn('h-4 w-4 mt-0.5 flex-shrink-0', statusConfig[status].color)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{title}</span>
          <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0', priorityStyle.bg, priorityStyle.color)}>
            {priority}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

interface IssueCardProps {
  item: {
    issue: {
      id: string;
      number: number;
      title: string;
      body?: string | null;
      state: string;
      priority: string;
      createdAt: Date | string;
    };
    repo: {
      id: string;
      name: string;
      ownerUsername: string | null;
    };
    author: {
      id: string;
      name: string;
      username: string | null;
      avatarUrl: string | null;
    } | null;
    labels: Array<{ id: string; name: string; color: string }>;
  };
}

function IssueCard({ item }: IssueCardProps) {
  const { issue, repo, author, labels } = item;
  const priorityInfo = PRIORITY_CONFIG[issue.priority || 'none'];
  const repoPath = repo.ownerUsername ? `/${repo.ownerUsername}/${repo.name}` : '#';
  const issuePath = repo.ownerUsername 
    ? `/${repo.ownerUsername}/${repo.name}/issues/${issue.number}` 
    : '#';

  return (
    <div className="py-4 hover:bg-muted/30 transition-colors -mx-6 px-6">
      <div className="flex items-start gap-4">
        {/* Priority indicator */}
        <div className={cn('flex-shrink-0 mt-1', priorityInfo.color)} title={priorityInfo.label}>
          {priorityInfo.icon}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Repository */}
          <Link
            to={repoPath}
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            {repo.ownerUsername}/{repo.name}
          </Link>

          {/* Title */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to={issuePath}
              className="font-medium text-foreground hover:text-primary transition-colors"
            >
              {issue.title}
            </Link>
          </div>

          {/* Labels */}
          <div className="flex items-center gap-2 flex-wrap">
            {labels.map((label) => (
              <Badge
                key={label.id}
                variant="secondary"
                className="text-xs font-normal px-2 py-0"
                style={{
                  backgroundColor: `#${label.color}20`,
                  color: `#${label.color}`,
                  borderColor: `#${label.color}40`,
                }}
              >
                <Tag className="h-3 w-3 mr-1" />
                {label.name}
              </Badge>
            ))}
          </div>

          {/* Meta */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-mono">#{issue.number}</span>
            <span className="text-muted-foreground/50">-</span>
            <span>opened {formatRelativeTime(issue.createdAt)}</span>
            {author?.username && (
              <>
                <span className="text-muted-foreground/50">by</span>
                <Link
                  to={`/${author.username}`}
                  className="hover:text-foreground transition-colors flex items-center gap-1"
                >
                  {author.avatarUrl && (
                    <img
                      src={author.avatarUrl}
                      alt={author.username}
                      className="h-4 w-4 rounded-full"
                    />
                  )}
                  {author.username}
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Action */}
        <Link to={issuePath} className="flex-shrink-0">
          <Button variant="outline" size="sm">
            View Issue
          </Button>
        </Link>
      </div>
    </div>
  );
}

// Copyable prompt component for AI contributions
interface CopyablePromptProps {
  title: string;
  category: string;
  categoryColor: 'green' | 'blue' | 'purple' | 'red' | 'orange';
  prompt: string;
}

function CopyablePrompt({ title, category, categoryColor, prompt }: CopyablePromptProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const colorConfig = {
    green: { bg: 'bg-green-500/10', text: 'text-green-500', border: 'border-green-500/20 hover:border-green-500/40' },
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/20 hover:border-blue-500/40' },
    purple: { bg: 'bg-purple-500/10', text: 'text-purple-500', border: 'border-purple-500/20 hover:border-purple-500/40' },
    red: { bg: 'bg-red-500/10', text: 'text-red-500', border: 'border-red-500/20 hover:border-red-500/40' },
    orange: { bg: 'bg-orange-500/10', text: 'text-orange-500', border: 'border-orange-500/20 hover:border-orange-500/40' },
  };

  const colors = colorConfig[categoryColor];

  const handleCopy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className={cn('transition-colors', colors.border)}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{title}</span>
              <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0', colors.bg, colors.text)}>
                {category}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Copy this prompt and paste it into your AI coding agent (Claude, Cursor, Copilot, etc.)
            </p>
            
            {expanded && (
              <div className="mt-3 p-3 rounded-md bg-muted/50 border border-border">
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                  {prompt}
                </pre>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="text-xs"
            >
              {expanded ? 'Hide' : 'Preview'}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleCopy}
              className="gap-1.5"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy Prompt
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
