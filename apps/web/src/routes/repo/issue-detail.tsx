import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CircleDot, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Markdown } from '@/components/markdown/renderer';
import { LabelPicker } from '@/components/issue/label-picker';
import { RepoHeader } from './components/repo-header';
import { formatRelativeTime, formatDate } from '@/lib/utils';
import { isAuthenticated, getUser } from '@/lib/auth';
import type { Label } from '@/lib/api-types';

// Mock issue data
const mockIssue = {
  id: '1',
  number: 15,
  title: 'File upload fails for files larger than 10MB',
  body: `## Description

When trying to upload files larger than 10MB, the upload fails silently without any error message.

## Steps to Reproduce

1. Navigate to the upload page
2. Select a file larger than 10MB
3. Click "Upload"
4. Nothing happens

## Expected Behavior

The file should upload successfully, or if there's a size limit, it should be clearly communicated to the user.

## Environment

- Browser: Chrome 120
- OS: macOS 14.2
- App version: 2.0.1

## Additional Context

This started happening after the v2.0 release. Previous versions had a 100MB limit.
`,
  state: 'open' as const,
  author: {
    id: '1',
    username: 'johndoe',
    avatarUrl: null,
  },
  assignee: null,
  createdAt: new Date(Date.now() - 86400000),
  updatedAt: new Date(Date.now() - 3600000),
  closedAt: null,
  labels: [
    { id: '1', name: 'bug', color: 'd73a4a', description: null, repoId: '1', createdAt: new Date() },
    { id: '2', name: 'help wanted', color: '008672', description: null, repoId: '1', createdAt: new Date() },
  ],
};

// Mock comments
const mockComments = [
  {
    id: '1',
    body: 'I can confirm this issue. Also happening on Firefox.',
    userId: '2',
    user: {
      id: '2',
      username: 'janesmith',
      avatarUrl: null,
    },
    createdAt: new Date(Date.now() - 43200000),
    updatedAt: new Date(Date.now() - 43200000),
  },
  {
    id: '2',
    body: "I've identified the root cause. The file size validation was changed incorrectly in the v2.0 migration. Working on a fix now.",
    userId: '3',
    user: {
      id: '3',
      username: 'bobwilson',
      avatarUrl: null,
    },
    createdAt: new Date(Date.now() - 21600000),
    updatedAt: new Date(Date.now() - 21600000),
  },
];

// Mock available labels
const mockLabels: Label[] = [
  { id: '1', name: 'bug', color: 'd73a4a', description: "Something isn't working", repoId: '1', createdAt: new Date() },
  { id: '2', name: 'help wanted', color: '008672', description: 'Extra attention is needed', repoId: '1', createdAt: new Date() },
  { id: '3', name: 'enhancement', color: 'a2eeef', description: 'New feature or request', repoId: '1', createdAt: new Date() },
  { id: '4', name: 'documentation', color: '0075ca', description: 'Improvements or additions to documentation', repoId: '1', createdAt: new Date() },
  { id: '5', name: 'good first issue', color: '7057ff', description: 'Good for newcomers', repoId: '1', createdAt: new Date() },
];

export function IssueDetailPage() {
  const { owner, repo, number } = useParams<{
    owner: string;
    repo: string;
    number: string;
  }>();
  const [comment, setComment] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<Label[]>(mockIssue.labels);
  const authenticated = isAuthenticated();
  const currentUser = getUser();

  const issueNumber = parseInt(number!, 10);

  // TODO: Fetch real data with tRPC
  const issue = { ...mockIssue, number: issueNumber };
  const comments = mockComments;

  const handleComment = async () => {
    if (!comment.trim()) return;
    // TODO: Call tRPC mutation
    console.log('Adding comment:', comment);
    setComment('');
  };

  const handleCloseIssue = async () => {
    // TODO: Call tRPC mutation
    console.log('Closing issue');
  };

  const handleReopenIssue = async () => {
    // TODO: Call tRPC mutation
    console.log('Reopening issue');
  };

  return (
    <div className="space-y-6">
      <RepoHeader owner={owner!} repo={repo!} />

      {/* Issue header */}
      <div>
        <h1 className="text-2xl font-bold">
          {issue.title}
          <span className="text-muted-foreground font-normal ml-2">
            #{issue.number}
          </span>
        </h1>

        <div className="flex items-center gap-3 mt-3">
          <Badge
            variant={issue.state === 'open' ? 'success' : 'purple'}
            className="gap-1"
          >
            {issue.state === 'open' ? (
              <CircleDot className="h-3 w-3" />
            ) : (
              <CheckCircle2 className="h-3 w-3" />
            )}
            {issue.state === 'open' ? 'Open' : 'Closed'}
          </Badge>

          <span className="text-muted-foreground">
            <Link
              to={`/${issue.author.username}`}
              className="font-medium hover:text-foreground"
            >
              {issue.author.username}
            </Link>{' '}
            opened this issue {formatRelativeTime(issue.createdAt)} ·{' '}
            {comments.length} comments
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-6">
        {/* Main content */}
        <div className="md:col-span-3 space-y-4">
          {/* Issue body */}
          <Card>
            <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 border-b">
              <Avatar className="h-6 w-6">
                <AvatarImage src={issue.author.avatarUrl || undefined} />
                <AvatarFallback className="text-xs">
                  {issue.author.username.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium">{issue.author.username}</span>
              <span className="text-muted-foreground">
                commented {formatRelativeTime(issue.createdAt)}
              </span>
            </div>
            <CardContent className="p-4">
              <Markdown content={issue.body} />
            </CardContent>
          </Card>

          {/* Comments */}
          {comments.map((c) => (
            <Card key={c.id}>
              <div className="flex items-center gap-3 px-4 py-2 bg-muted/30 border-b">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={c.user.avatarUrl || undefined} />
                  <AvatarFallback className="text-xs">
                    {c.user.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium">{c.user.username}</span>
                <span className="text-muted-foreground">
                  commented {formatRelativeTime(c.createdAt)}
                </span>
              </div>
              <CardContent className="p-4">
                <Markdown content={c.body} />
              </CardContent>
            </Card>
          ))}

          {/* Add comment form */}
          {authenticated && (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {currentUser?.username?.slice(0, 2).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <Textarea
                      placeholder="Leave a comment..."
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={4}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  {issue.state === 'open' ? (
                    <Button variant="outline" onClick={handleCloseIssue}>
                      Close issue
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={handleReopenIssue}>
                      Reopen issue
                    </Button>
                  )}
                  <Button onClick={handleComment} disabled={!comment.trim()}>
                    Comment
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Labels */}
          <div>
            <LabelPicker
              availableLabels={mockLabels}
              selectedLabels={selectedLabels}
              onLabelsChange={setSelectedLabels}
            />
          </div>

          <Separator />

          {/* Assignee */}
          <div className="space-y-2">
            <span className="text-sm font-medium">Assignees</span>
            {issue.assignee ? (
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-xs">
                    {/* @ts-ignore */}
                    {issue.assignee.username?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {/* @ts-ignore */}
                <span>{issue.assignee.username}</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No one assigned</p>
            )}
          </div>

          <Separator />

          {/* Meta info */}
          <div className="space-y-2 text-sm text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">Created:</span>{' '}
              {formatDate(issue.createdAt)}
            </div>
            <div>
              <span className="font-medium text-foreground">Updated:</span>{' '}
              {formatRelativeTime(issue.updatedAt)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
