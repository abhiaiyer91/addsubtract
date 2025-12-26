import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  GitPullRequest,
  GitMerge,
  X,
  MessageSquare,
  FileCode,
  GitCommit,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { DiffViewer, type DiffFile } from '@/components/diff/diff-viewer';
import { PrTimeline } from '@/components/pr/pr-timeline';
import { MergeButton } from '@/components/pr/merge-button';
import { Markdown } from '@/components/markdown/renderer';
import { RepoHeader } from './components/repo-header';
import { formatRelativeTime } from '@/lib/utils';
import { isAuthenticated } from '@/lib/auth';

// Mock pull request data
const mockPullRequest = {
  id: '1',
  number: 42,
  title: 'Add new authentication system with OAuth2 support',
  body: `## Summary

This PR adds a complete OAuth2 authentication system with support for:

- GitHub OAuth
- Google OAuth  
- Session management
- JWT tokens

## Changes

- Added \`/auth/login\` and \`/auth/callback\` routes
- Created OAuth provider abstraction
- Added session middleware
- Updated user model with OAuth fields

## Testing

- [x] Unit tests for OAuth providers
- [x] Integration tests for auth flow
- [x] Manual testing with GitHub OAuth

## Screenshots

N/A - Backend changes only
`,
  state: 'open' as const,
  author: { id: '1', username: 'johndoe', avatarUrl: null },
  sourceBranch: 'feature/oauth2',
  targetBranch: 'main',
  headSha: 'abc123def456',
  baseSha: '789ghi012jkl',
  isMergeable: true,
  isDraft: false,
  createdAt: new Date(Date.now() - 3600000),
  updatedAt: new Date(),
  labels: [
    { id: '1', name: 'enhancement', color: 'a2eeef', description: null, repoId: '1', createdAt: new Date() },
  ],
};

// Mock diff data
const mockDiff: DiffFile[] = [
  {
    path: 'src/auth/oauth.ts',
    status: 'added',
    additions: 45,
    deletions: 0,
    hunks: [
      {
        oldStart: 0,
        newStart: 1,
        oldLines: 0,
        newLines: 20,
        lines: [
          { type: 'add', content: "import { OAuth2Client } from 'google-auth-library';", newLineNumber: 1 },
          { type: 'add', content: '', newLineNumber: 2 },
          { type: 'add', content: 'export interface OAuthProvider {', newLineNumber: 3 },
          { type: 'add', content: '  getAuthUrl(): string;', newLineNumber: 4 },
          { type: 'add', content: '  getToken(code: string): Promise<string>;', newLineNumber: 5 },
          { type: 'add', content: '  getUser(token: string): Promise<User>;', newLineNumber: 6 },
          { type: 'add', content: '}', newLineNumber: 7 },
          { type: 'add', content: '', newLineNumber: 8 },
          { type: 'add', content: 'export class GitHubOAuth implements OAuthProvider {', newLineNumber: 9 },
          { type: 'add', content: '  // Implementation...', newLineNumber: 10 },
          { type: 'add', content: '}', newLineNumber: 11 },
        ],
      },
    ],
  },
  {
    path: 'src/routes/auth.ts',
    status: 'modified',
    additions: 25,
    deletions: 5,
    hunks: [
      {
        oldStart: 10,
        newStart: 10,
        oldLines: 10,
        newLines: 30,
        lines: [
          { type: 'context', content: "import { Router } from 'express';", oldLineNumber: 10, newLineNumber: 10 },
          { type: 'context', content: '', oldLineNumber: 11, newLineNumber: 11 },
          { type: 'remove', content: 'const router = Router();', oldLineNumber: 12 },
          { type: 'add', content: "import { GitHubOAuth } from '../auth/oauth';", newLineNumber: 12 },
          { type: 'add', content: '', newLineNumber: 13 },
          { type: 'add', content: 'const router = Router();', newLineNumber: 14 },
          { type: 'add', content: 'const github = new GitHubOAuth();', newLineNumber: 15 },
          { type: 'context', content: '', oldLineNumber: 13, newLineNumber: 16 },
          { type: 'remove', content: "router.get('/login', (req, res) => {", oldLineNumber: 14 },
          { type: 'remove', content: "  res.send('Login page');", oldLineNumber: 15 },
          { type: 'remove', content: '});', oldLineNumber: 16 },
          { type: 'add', content: "router.get('/login/github', (req, res) => {", newLineNumber: 17 },
          { type: 'add', content: '  res.redirect(github.getAuthUrl());', newLineNumber: 18 },
          { type: 'add', content: '});', newLineNumber: 19 },
        ],
      },
    ],
  },
];

// Mock timeline events
const mockTimeline = [
  {
    id: '1',
    type: 'comment' as const,
    author: { username: 'janesmith', avatarUrl: null },
    body: 'Looks good overall! Just a few minor comments on the OAuth implementation.',
    createdAt: new Date(Date.now() - 3600000 * 2),
  },
  {
    id: '2',
    type: 'commit' as const,
    author: { username: 'johndoe', avatarUrl: null },
    sha: 'abc123def456789',
    message: 'Address code review feedback',
    createdAt: new Date(Date.now() - 3600000),
  },
  {
    id: '3',
    type: 'review' as const,
    author: { username: 'janesmith', avatarUrl: null },
    reviewState: 'approved' as const,
    createdAt: new Date(Date.now() - 1800000),
  },
];

export function PullDetailPage() {
  const { owner, repo, number } = useParams<{
    owner: string;
    repo: string;
    number: string;
  }>();
  const [comment, setComment] = useState('');
  const authenticated = isAuthenticated();

  const prNumber = parseInt(number!, 10);

  // TODO: Fetch real data with tRPC
  const pr = { ...mockPullRequest, number: prNumber };
  const diff = mockDiff;
  const timeline = mockTimeline;

  const stateIcon = {
    open: <GitPullRequest className="h-5 w-5 text-green-500" />,
    merged: <GitMerge className="h-5 w-5 text-purple-500" />,
    closed: <X className="h-5 w-5 text-red-500" />,
  };

  const stateText = {
    open: 'Open',
    merged: 'Merged',
    closed: 'Closed',
  };

  const handleMerge = async (method: 'merge' | 'squash' | 'rebase') => {
    // TODO: Call tRPC mutation
    console.log('Merging with method:', method);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  };

  const handleComment = async () => {
    if (!comment.trim()) return;
    // TODO: Call tRPC mutation
    console.log('Adding comment:', comment);
    setComment('');
  };

  return (
    <div className="space-y-6">
      <RepoHeader owner={owner!} repo={repo!} />

      {/* PR Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          {pr.title}
          <span className="text-muted-foreground font-normal">#{pr.number}</span>
        </h1>

        <div className="flex items-center gap-3 mt-3">
          <Badge
            variant={pr.state === 'open' ? 'success' : pr.state === 'merged' ? 'purple' : 'secondary'}
            className="gap-1"
          >
            {stateIcon[pr.state]}
            {stateText[pr.state]}
          </Badge>

          <span className="text-muted-foreground">
            <Link to={`/${pr.author.username}`} className="font-medium hover:text-foreground">
              {pr.author.username}
            </Link>{' '}
            wants to merge{' '}
            <code className="px-1.5 py-0.5 bg-muted rounded font-mono text-sm">
              {pr.sourceBranch}
            </code>{' '}
            into{' '}
            <code className="px-1.5 py-0.5 bg-muted rounded font-mono text-sm">
              {pr.targetBranch}
            </code>
          </span>
        </div>

        <div className="flex items-center gap-2 mt-3">
          {pr.labels.map((label) => (
            <Badge
              key={label.id}
              variant="outline"
              style={{
                backgroundColor: `#${label.color}20`,
                borderColor: `#${label.color}`,
                color: `#${label.color}`,
              }}
            >
              {label.name}
            </Badge>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="conversation">
        <TabsList>
          <TabsTrigger value="conversation" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Conversation
          </TabsTrigger>
          <TabsTrigger value="commits" className="gap-2">
            <GitCommit className="h-4 w-4" />
            Commits
          </TabsTrigger>
          <TabsTrigger value="files" className="gap-2">
            <FileCode className="h-4 w-4" />
            Files changed
            <Badge variant="secondary">{diff.length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conversation" className="mt-6 space-y-6">
          {/* PR Description */}
          <Card>
            <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 border-b">
              <Avatar className="h-6 w-6">
                <AvatarImage src={pr.author.avatarUrl || undefined} />
                <AvatarFallback className="text-xs">
                  {pr.author.username.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium">{pr.author.username}</span>
              <span className="text-muted-foreground">opened this pull request</span>
              <span className="text-muted-foreground">
                {formatRelativeTime(pr.createdAt)}
              </span>
            </div>
            <CardContent className="p-4">
              <Markdown content={pr.body} />
            </CardContent>
          </Card>

          {/* Timeline */}
          <PrTimeline events={timeline} />

          {/* Merge section */}
          {pr.state === 'open' && authenticated && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    {pr.isMergeable ? (
                      <p className="text-green-500 font-medium">
                        ✓ This branch has no conflicts with the base branch
                      </p>
                    ) : (
                      <p className="text-red-500 font-medium">
                        ✗ This branch has conflicts that must be resolved
                      </p>
                    )}
                  </div>
                  <MergeButton
                    isMergeable={pr.isMergeable}
                    onMerge={handleMerge}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Comment form */}
          {authenticated && (
            <Card>
              <CardContent className="p-4 space-y-4">
                <Textarea
                  placeholder="Leave a comment..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                />
                <div className="flex justify-end">
                  <Button onClick={handleComment} disabled={!comment.trim()}>
                    Comment
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="commits" className="mt-6">
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              <GitCommit className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Commit list coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="files" className="mt-6">
          <DiffViewer files={diff} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
