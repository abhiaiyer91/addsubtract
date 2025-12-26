import { useParams, Link } from 'react-router-dom';
import {
  Star,
  GitFork,
  Eye,
  Code,
  GitPullRequest,
  CircleDot,
  Settings,
  Copy,
  Check,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileTree, type TreeEntry } from '@/components/repo/file-tree';
import { SimpleBranchSelector } from '@/components/repo/branch-selector';
import { Markdown } from '@/components/markdown/renderer';
import { isAuthenticated } from '@/lib/auth';

// Mock data
const mockRepo = {
  id: '1',
  name: 'awesome-project',
  description: 'A modern TypeScript project with amazing features',
  isPrivate: false,
  defaultBranch: 'main',
  starsCount: 128,
  forksCount: 23,
  watchersCount: 45,
  openIssuesCount: 12,
  openPrsCount: 3,
};

const mockOwner = {
  username: 'johndoe',
  name: 'John Doe',
  avatarUrl: null,
};

const mockTree: TreeEntry[] = [
  { name: 'src', path: 'src', type: 'directory' },
  { name: 'tests', path: 'tests', type: 'directory' },
  { name: '.gitignore', path: '.gitignore', type: 'file', size: 245 },
  { name: 'package.json', path: 'package.json', type: 'file', size: 1024 },
  { name: 'README.md', path: 'README.md', type: 'file', size: 2048 },
  { name: 'tsconfig.json', path: 'tsconfig.json', type: 'file', size: 512 },
];

const mockReadme = `# Awesome Project

A modern TypeScript project with amazing features.

## Features

- 🚀 Fast and lightweight
- 📦 Easy to install
- 🔧 Highly configurable
- 🎨 Beautiful UI

## Installation

\`\`\`bash
npm install awesome-project
\`\`\`

## Usage

\`\`\`typescript
import { awesome } from 'awesome-project';

const result = awesome.doSomething();
console.log(result);
\`\`\`

## Contributing

Pull requests are welcome!

## License

MIT
`;

export function RepoPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [copied, setCopied] = useState(false);
  const authenticated = isAuthenticated();

  // TODO: Fetch real data with tRPC
  const repoData = { ...mockRepo, name: repo || mockRepo.name };
  const ownerData = { ...mockOwner, username: owner || mockOwner.username };
  const tree = mockTree;
  const readme = mockReadme;

  const cloneUrl = `https://wit.dev/${ownerData.username}/${repoData.name}.git`;

  const handleCopyCloneUrl = async () => {
    await navigator.clipboard.writeText(cloneUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Repository header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link
              to={`/${ownerData.username}`}
              className="text-xl text-primary hover:underline"
            >
              {ownerData.username}
            </Link>
            <span className="text-xl text-muted-foreground">/</span>
            <Link
              to={`/${ownerData.username}/${repoData.name}`}
              className="text-xl font-bold hover:underline"
            >
              {repoData.name}
            </Link>
            {repoData.isPrivate ? (
              <Badge variant="secondary">Private</Badge>
            ) : (
              <Badge variant="outline">Public</Badge>
            )}
          </div>
          {repoData.description && (
            <p className="text-muted-foreground">{repoData.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {authenticated && (
            <>
              <Button variant="outline" size="sm" className="gap-2">
                <Eye className="h-4 w-4" />
                Watch
                <Badge variant="secondary" className="ml-1">
                  {repoData.watchersCount}
                </Badge>
              </Button>
              <Button variant="outline" size="sm" className="gap-2">
                <GitFork className="h-4 w-4" />
                Fork
                <Badge variant="secondary" className="ml-1">
                  {repoData.forksCount}
                </Badge>
              </Button>
              <Button variant="outline" size="sm" className="gap-2">
                <Star className="h-4 w-4" />
                Star
                <Badge variant="secondary" className="ml-1">
                  {repoData.starsCount}
                </Badge>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Navigation tabs */}
      <Tabs defaultValue="code" className="w-full">
        <TabsList className="w-full justify-start h-auto p-0 bg-transparent border-b rounded-none">
          <TabsTrigger
            value="code"
            className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <Code className="h-4 w-4" />
            Code
          </TabsTrigger>
          <TabsTrigger
            value="issues"
            className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            asChild
          >
            <Link to={`/${owner}/${repo}/issues`}>
              <CircleDot className="h-4 w-4" />
              Issues
              <Badge variant="secondary">{repoData.openIssuesCount}</Badge>
            </Link>
          </TabsTrigger>
          <TabsTrigger
            value="pulls"
            className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
            asChild
          >
            <Link to={`/${owner}/${repo}/pulls`}>
              <GitPullRequest className="h-4 w-4" />
              Pull requests
              <Badge variant="secondary">{repoData.openPrsCount}</Badge>
            </Link>
          </TabsTrigger>
          {authenticated && (
            <TabsTrigger
              value="settings"
              className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              asChild
            >
              <Link to={`/${owner}/${repo}/settings`}>
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="code" className="mt-6 space-y-6">
          {/* Branch selector and actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <SimpleBranchSelector
                defaultBranch={repoData.defaultBranch}
                owner={ownerData.username}
                repo={repoData.name}
              />
              <Link
                to={`/${owner}/${repo}/branches`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                View all branches
              </Link>
            </div>

            {/* Clone button */}
            <div className="flex items-center gap-2">
              <div className="flex items-center border rounded-md">
                <code className="px-3 py-1.5 text-sm bg-muted rounded-l-md">
                  {cloneUrl}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-l-none border-l"
                  onClick={handleCopyCloneUrl}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* File tree */}
          <FileTree
            entries={tree}
            owner={ownerData.username}
            repo={repoData.name}
            currentRef={repoData.defaultBranch}
          />

          {/* README */}
          {readme && (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-muted/50 border-b">
                <span className="font-medium">README.md</span>
              </div>
              <div className="p-6">
                <Markdown content={readme} />
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
