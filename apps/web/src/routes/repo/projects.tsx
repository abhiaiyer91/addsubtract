import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  FolderKanban,
  Plus,
  Search,
  MoreHorizontal,
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  Target,
  TrendingUp,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RepoLayout } from './components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime, cn } from '@/lib/utils';
import { toastSuccess, toastError } from '@/components/ui/use-toast';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  backlog: { label: 'Backlog', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: <Clock className="h-3 w-3" /> },
  planned: { label: 'Planned', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', icon: <Calendar className="h-3 w-3" /> },
  in_progress: { label: 'In Progress', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300', icon: <TrendingUp className="h-3 w-3" /> },
  paused: { label: 'Paused', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300', icon: <AlertCircle className="h-3 w-3" /> },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', icon: <CheckCircle2 className="h-3 w-3" /> },
  canceled: { label: 'Canceled', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', icon: <AlertCircle className="h-3 w-3" /> },
};

const HEALTH_CONFIG: Record<string, { label: string; color: string }> = {
  on_track: { label: 'On Track', color: 'text-green-500' },
  at_risk: { label: 'At Risk', color: 'text-yellow-500' },
  off_track: { label: 'Off Track', color: 'text-red-500' },
};

export function ProjectsPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '', status: 'backlog' });
  const { data: session } = useSession();
  const authenticated = !!session?.user;
  const utils = trpc.useUtils();

  // Fetch repository data
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch projects
  const { data: projects, isLoading: projectsLoading } = trpc.projects.list.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  );

  // Create project mutation
  const createMutation = trpc.projects.create.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate({ repoId: repoData?.repo.id! });
      setShowCreateDialog(false);
      setNewProject({ name: '', description: '', status: 'backlog' });
      toastSuccess({ title: 'Project created successfully' });
    },
    onError: (error) => {
      toastError({ title: 'Failed to create project', description: error.message });
    },
  });

  const isLoading = repoLoading || projectsLoading;

  // Filter projects by search
  const filteredProjects = projects?.filter((project) => {
    if (!searchQuery) return true;
    return project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
           project.description?.toLowerCase().includes(searchQuery.toLowerCase());
  }) || [];

  const handleCreateProject = () => {
    if (!repoData?.repo.id || !newProject.name.trim()) return;
    createMutation.mutate({
      repoId: repoData.repo.id,
      name: newProject.name.trim(),
      description: newProject.description.trim() || undefined,
      status: newProject.status as any,
    });
  };

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-8 w-32 bg-muted rounded animate-pulse" />
            <div className="h-9 w-28 bg-muted rounded animate-pulse" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
      </RepoLayout>
    );
  }

  return (
    <RepoLayout owner={owner!} repo={repo!}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <FolderKanban className="h-5 w-5" />
              Projects
            </h1>
            <Badge variant="secondary">{projects?.length || 0}</Badge>
          </div>
          {authenticated && (
            <Button size="sm" className="gap-2" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4" />
              New Project
            </Button>
          )}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            className="pl-9 h-9 bg-muted/50 border-0 focus-visible:bg-background focus-visible:ring-1"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Projects Grid */}
        {filteredProjects.length === 0 ? (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
              <FolderKanban className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">No projects yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Projects help you organize and track groups of related issues
            </p>
            {authenticated && (
              <Button onClick={() => setShowCreateDialog(true)}>Create the first project</Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                owner={owner!}
                repo={repo!}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Project Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
            <DialogDescription>
              Projects help you organize related issues and track progress towards goals.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Q1 Features, Mobile App, etc."
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="Describe the project goals and scope..."
                value={newProject.description}
                onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={newProject.status}
                onValueChange={(value) => setNewProject({ ...newProject, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="backlog">Backlog</SelectItem>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={!newProject.name.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RepoLayout>
  );
}

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    description?: string | null;
    status: string;
    icon?: string | null;
    color?: string | null;
    startDate?: Date | null;
    targetDate?: Date | null;
    completedAt?: Date | null;
    createdAt: Date;
  };
  owner: string;
  repo: string;
}

function ProjectCard({ project, owner, repo }: ProjectCardProps) {
  const statusConfig = STATUS_CONFIG[project.status] || STATUS_CONFIG.backlog;
  
  // Fetch progress
  const { data: progress } = trpc.projects.getProgress.useQuery(
    { projectId: project.id },
    { staleTime: 30000 }
  );

  const progressPercent = progress
    ? Math.round((progress.completedIssues / Math.max(progress.totalIssues, 1)) * 100)
    : 0;

  return (
    <Link
      to={`/${owner}/${repo}/projects/${project.id}`}
      className="block p-4 border rounded-lg hover:border-primary/50 hover:bg-muted/30 transition-colors group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {project.icon && <span className="text-lg">{project.icon}</span>}
          <h3 className="font-medium group-hover:text-primary transition-colors">
            {project.name}
          </h3>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Edit</DropdownMenuItem>
            <DropdownMenuItem>Archive</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {project.description && (
        <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
          {project.description}
        </p>
      )}

      {/* Status badge */}
      <div className="flex items-center gap-2 mb-3">
        <Badge variant="secondary" className={cn('text-xs gap-1', statusConfig.color)}>
          {statusConfig.icon}
          {statusConfig.label}
        </Badge>
      </div>

      {/* Progress bar */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progress</span>
          <span>{progressPercent}%</span>
        </div>
        <Progress value={progressPercent} className="h-1.5" />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {progress && (
          <>
            <span className="flex items-center gap-1">
              <Target className="h-3 w-3" />
              {progress.completedIssues}/{progress.totalIssues} issues
            </span>
          </>
        )}
        {project.targetDate && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatRelativeTime(project.targetDate)}
          </span>
        )}
      </div>
    </Link>
  );
}
