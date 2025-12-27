import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  FileText,
  Edit3,
  Trash2,
  ArrowLeft,
  Clock,
  User,
  Eye,
  Archive,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { RepoLayout } from '../components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime, cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

// Status config
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  published: { label: 'Published', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  archived: { label: 'Archived', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
};

export function JournalPageDetail() {
  const { owner, repo, slug } = useParams<{ owner: string; repo: string; slug: string }>();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { toast } = useToast();
  const authenticated = !!session?.user;
  const utils = trpc.useUtils();

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

  // Mutations
  const publishMutation = trpc.journal.publish.useMutation({
    onSuccess: () => {
      utils.journal.getBySlug.invalidate();
      toast({ title: 'Page published' });
    },
  });

  const unpublishMutation = trpc.journal.unpublish.useMutation({
    onSuccess: () => {
      utils.journal.getBySlug.invalidate();
      toast({ title: 'Page unpublished' });
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

  const isLoading = repoLoading || pageLoading;

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="h-8 w-64 bg-muted rounded animate-pulse" />
          <div className="space-y-3">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-4 bg-muted rounded animate-pulse" style={{ width: `${80 - i * 5}%` }} />
            ))}
          </div>
        </div>
      </RepoLayout>
    );
  }

  if (!page) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
            <FileText className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-1">Page not found</h3>
          <p className="text-sm text-muted-foreground mb-4">
            The page you're looking for doesn't exist or has been deleted.
          </p>
          <Link to={`/${owner}/${repo}/journal`}>
            <Button variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Journal
            </Button>
          </Link>
        </div>
      </RepoLayout>
    );
  }

  const statusInfo = STATUS_CONFIG[page.status] || STATUS_CONFIG.draft;
  const canEdit = authenticated; // TODO: Check permissions properly

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="max-w-4xl mx-auto">
        {/* Navigation */}
        <div className="mb-6">
          <Link
            to={`/${owner}/${repo}/journal`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Journal
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8">
          {page.coverImage && (
            <div className="h-48 rounded-lg overflow-hidden mb-6">
              <img
                src={page.coverImage}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                {page.icon && <span className="text-4xl">{page.icon}</span>}
                <h1 className="text-3xl font-bold">{page.title}</h1>
              </div>

              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <Badge
                  variant="secondary"
                  className={cn('font-normal', statusInfo.color)}
                >
                  {statusInfo.label}
                </Badge>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Updated {formatRelativeTime(page.updatedAt)}
                </span>
                {page.publishedAt && (
                  <span className="flex items-center gap-1">
                    <Eye className="h-4 w-4" />
                    Published {formatRelativeTime(page.publishedAt)}
                  </span>
                )}
              </div>
            </div>

            {canEdit && (
              <div className="flex items-center gap-2">
                <Link to={`/${owner}/${repo}/journal/${slug}/edit`}>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Edit3 className="h-4 w-4" />
                    Edit
                  </Button>
                </Link>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      ...
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {page.status === 'draft' && (
                      <DropdownMenuItem
                        onClick={() => publishMutation.mutate({ pageId: page.id })}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Publish
                      </DropdownMenuItem>
                    )}
                    {page.status === 'published' && (
                      <DropdownMenuItem
                        onClick={() => unpublishMutation.mutate({ pageId: page.id })}
                      >
                        <Edit3 className="mr-2 h-4 w-4" />
                        Unpublish
                      </DropdownMenuItem>
                    )}
                    {page.status !== 'archived' && (
                      <DropdownMenuItem
                        onClick={() => archiveMutation.mutate({ pageId: page.id })}
                      >
                        <Archive className="mr-2 h-4 w-4" />
                        Archive
                      </DropdownMenuItem>
                    )}
                    <Link to={`/${owner}/${repo}/journal/${slug}/history`}>
                      <DropdownMenuItem>
                        <History className="mr-2 h-4 w-4" />
                        View History
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem
                          className="text-destructive"
                          onSelect={(e) => e.preventDefault()}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete page?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will permanently delete "{page.title}" and all its children.
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
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="prose dark:prose-invert max-w-none">
          {page.content ? (
            <div
              className="whitespace-pre-wrap"
              dangerouslySetInnerHTML={{
                __html: page.content.replace(/\n/g, '<br>'),
              }}
            />
          ) : (
            <p className="text-muted-foreground italic">
              This page is empty. Click Edit to add content.
            </p>
          )}
        </div>
      </div>
    </RepoLayout>
  );
}

export default JournalPageDetail;
