import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  RefreshCw,
  Plus,
  Search,
  Calendar,
  CheckCircle2,
  Clock,
  Target,
  TrendingUp,
  AlertTriangle,
  CircleDot,
  ArrowRight,
  BarChart3,
  Play,
  Pause,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DatePicker } from '@/components/ui/date-picker';
import { RepoLayout } from './components/repo-layout';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime, cn } from '@/lib/utils';
import { toastSuccess, toastError } from '@/components/ui/use-toast';

export function CyclesPage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newCycle, setNewCycle] = useState<{ 
    name: string; 
    startDate: Date | undefined; 
    endDate: Date | undefined;
  }>({ 
    name: '', 
    startDate: undefined, 
    endDate: undefined,
  });
  const { data: session } = useSession();
  const authenticated = !!session?.user;
  const utils = trpc.useUtils();

  // Fetch repository data
  const { data: repoData, isLoading: repoLoading } = trpc.repos.get.useQuery(
    { owner: owner!, repo: repo! },
    { enabled: !!owner && !!repo }
  );

  // Fetch cycles
  const { data: cycles, isLoading: cyclesLoading } = trpc.cycles.list.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  );

  // Fetch current cycle
  const { data: currentCycle } = trpc.cycles.getCurrent.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  );

  // Fetch upcoming cycles
  const { data: upcomingCycle } = trpc.cycles.getUpcoming.useQuery(
    { repoId: repoData?.repo.id! },
    { enabled: !!repoData?.repo.id }
  );

  // Create cycle mutation
  const createMutation = trpc.cycles.create.useMutation({
    onSuccess: () => {
      utils.cycles.list.invalidate({ repoId: repoData?.repo.id! });
      utils.cycles.getCurrent.invalidate({ repoId: repoData?.repo.id! });
      setShowCreateDialog(false);
      setNewCycle({ name: '', startDate: undefined, endDate: undefined });
      toastSuccess({ title: 'Cycle created successfully' });
    },
    onError: (error) => {
      toastError({ title: 'Failed to create cycle', description: error.message });
    },
  });

  const isLoading = repoLoading || cyclesLoading;

  const handleCreateCycle = () => {
    if (!repoData?.repo.id || !newCycle.name.trim() || !newCycle.startDate || !newCycle.endDate) return;
    createMutation.mutate({
      repoId: repoData.repo.id,
      name: newCycle.name.trim(),
      startDate: newCycle.startDate.toISOString().split('T')[0],
      endDate: newCycle.endDate.toISOString().split('T')[0],
    });
  };

  // Separate active, upcoming, and completed cycles
  const now = new Date();
  const activeCycles = cycles?.filter(c => 
    new Date(c.startDate) <= now && new Date(c.endDate) >= now
  ) || [];
  const pastCycles = cycles?.filter(c => new Date(c.endDate) < now) || [];
  const futureCycles = cycles?.filter(c => new Date(c.startDate) > now) || [];

  if (isLoading) {
    return (
      <RepoLayout owner={owner!} repo={repo!}>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="h-8 w-32 bg-muted rounded animate-pulse" />
            <div className="h-9 w-28 bg-muted rounded animate-pulse" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[...Array(4)].map((_, i) => (
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
              <RefreshCw className="h-5 w-5" />
              Cycles
            </h1>
            <Badge variant="secondary">{cycles?.length || 0}</Badge>
          </div>
          {authenticated && (
            <Button size="sm" className="gap-2" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4" />
              New Cycle
            </Button>
          )}
        </div>

        {/* Current Cycle Highlight */}
        {currentCycle && (
          <CurrentCycleCard 
            cycle={currentCycle} 
            owner={owner!} 
            repo={repo!} 
          />
        )}

        {/* Tabs for different cycle states */}
        <Tabs defaultValue="active" className="w-full">
          <TabsList>
            <TabsTrigger value="active" className="gap-2">
              <Play className="h-4 w-4" />
              Active
              <Badge variant="secondary" className="ml-1 h-5">
                {activeCycles.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="upcoming" className="gap-2">
              <Calendar className="h-4 w-4" />
              Upcoming
              <Badge variant="secondary" className="ml-1 h-5">
                {futureCycles.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Completed
              <Badge variant="secondary" className="ml-1 h-5">
                {pastCycles.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4">
            {activeCycles.length === 0 ? (
              <EmptyState
                icon={<Play className="h-8 w-8" />}
                title="No active cycles"
                description="Create a cycle to start tracking sprint progress"
                action={authenticated ? (
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Cycle
                  </Button>
                ) : undefined}
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {activeCycles.map((cycle) => (
                  <CycleCard key={cycle.id} cycle={cycle} owner={owner!} repo={repo!} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="upcoming" className="mt-4">
            {futureCycles.length === 0 ? (
              <EmptyState
                icon={<Calendar className="h-8 w-8" />}
                title="No upcoming cycles"
                description="Plan ahead by creating future cycles"
                action={authenticated ? (
                  <Button onClick={() => setShowCreateDialog(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Cycle
                  </Button>
                ) : undefined}
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {futureCycles.map((cycle) => (
                  <CycleCard key={cycle.id} cycle={cycle} owner={owner!} repo={repo!} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-4">
            {pastCycles.length === 0 ? (
              <EmptyState
                icon={<CheckCircle2 className="h-8 w-8" />}
                title="No completed cycles"
                description="Completed cycles will appear here"
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {pastCycles.map((cycle) => (
                  <CycleCard key={cycle.id} cycle={cycle} owner={owner!} repo={repo!} isCompleted />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Cycle Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Cycle</DialogTitle>
            <DialogDescription>
              Cycles help you organize work into time-boxed sprints.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Sprint 1, Q1 Week 3, etc."
                value={newCycle.name}
                onChange={(e) => setNewCycle({ ...newCycle, name: e.target.value })}
              />
            </div>
            <div className="grid gap-4 grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <DatePicker
                  date={newCycle.startDate}
                  onDateChange={(date) => setNewCycle({ ...newCycle, startDate: date })}
                  placeholder="Select start date"
                  toDate={newCycle.endDate}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date</Label>
                <DatePicker
                  date={newCycle.endDate}
                  onDateChange={(date) => setNewCycle({ ...newCycle, endDate: date })}
                  placeholder="Select end date"
                  fromDate={newCycle.startDate}
                  className="w-full"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateCycle}
              disabled={!newCycle.name.trim() || !newCycle.startDate || !newCycle.endDate || createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Cycle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RepoLayout>
  );
}

function EmptyState({ icon, title, description, action }: { 
  icon: React.ReactNode; 
  title: string; 
  description: string; 
  action?: React.ReactNode;
}) {
  return (
    <div className="text-center py-16 border rounded-lg">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4 text-muted-foreground">
        {icon}
      </div>
      <h3 className="text-lg font-medium mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4">{description}</p>
      {action}
    </div>
  );
}

interface CurrentCycleCardProps {
  cycle: {
    id: string;
    name: string;
    number: number;
    startDate: Date | string;
    endDate: Date | string;
  };
  owner: string;
  repo: string;
}

function CurrentCycleCard({ cycle, owner, repo }: CurrentCycleCardProps) {
  // Fetch progress
  const { data: progress } = trpc.cycles.getProgress.useQuery(
    { cycleId: cycle.id },
    { staleTime: 30000 }
  );

  const startDate = new Date(cycle.startDate);
  const endDate = new Date(cycle.endDate);
  const now = new Date();
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysElapsed = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const timeProgressPercent = Math.min(100, Math.round((daysElapsed / totalDays) * 100));

  const issueProgressPercent = progress
    ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100)
    : 0;

  return (
    <div className="p-6 border-2 border-primary/50 rounded-lg bg-primary/5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-primary mb-1">
            <Play className="h-4 w-4" />
            Current Cycle
          </div>
          <Link 
            to={`/${owner}/${repo}/cycles/${cycle.id}`}
            className="text-xl font-bold hover:text-primary transition-colors"
          >
            {cycle.name}
          </Link>
        </div>
        <Badge variant="default" className="bg-primary">
          {daysRemaining} days left
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Time Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Time Progress</span>
            <span className="font-medium">{timeProgressPercent}%</span>
          </div>
          <Progress value={timeProgressPercent} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{startDate.toLocaleDateString()}</span>
            <span>{endDate.toLocaleDateString()}</span>
          </div>
        </div>

        {/* Issue Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Issue Progress</span>
            <span className="font-medium">{issueProgressPercent}%</span>
          </div>
          <Progress value={issueProgressPercent} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress?.completed || 0} completed</span>
            <span>{progress?.total || 0} total</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-6 mt-4 pt-4 border-t text-sm">
        <div className="flex items-center gap-2">
          <CircleDot className="h-4 w-4 text-yellow-500" />
          <span>{progress?.inProgress || 0} in progress</span>
        </div>
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-blue-500" />
          <span>{progress?.todo || 0} todo</span>
        </div>
        <Link 
          to={`/${owner}/${repo}/cycles/${cycle.id}`}
          className="ml-auto text-primary hover:underline flex items-center gap-1"
        >
          View Details
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

interface CycleCardProps {
  cycle: {
    id: string;
    name: string;
    number: number;
    startDate: Date | string;
    endDate: Date | string;
  };
  owner: string;
  repo: string;
  isCompleted?: boolean;
}

function CycleCard({ cycle, owner, repo, isCompleted }: CycleCardProps) {
  // Fetch progress
  const { data: progress } = trpc.cycles.getProgress.useQuery(
    { cycleId: cycle.id },
    { staleTime: 30000 }
  );

  const startDate = new Date(cycle.startDate);
  const endDate = new Date(cycle.endDate);
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  const progressPercent = progress
    ? Math.round((progress.completed / Math.max(progress.total, 1)) * 100)
    : 0;

  return (
    <Link
      to={`/${owner}/${repo}/cycles/${cycle.id}`}
      className={cn(
        "block p-4 border rounded-lg hover:border-primary/50 hover:bg-muted/30 transition-colors group",
        isCompleted && "opacity-75"
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-medium group-hover:text-primary transition-colors">
            {cycle.name}
          </h3>
          <div className="text-sm text-muted-foreground">
            {totalDays} days
          </div>
        </div>
        {isCompleted ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : (
          <Badge variant="outline">#{cycle.number}</Badge>
        )}
      </div>

      {/* Dates */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
        <Calendar className="h-3 w-3" />
        <span>{startDate.toLocaleDateString()}</span>
        <ArrowRight className="h-3 w-3" />
        <span>{endDate.toLocaleDateString()}</span>
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progress</span>
          <span>{progress?.completed || 0}/{progress?.total || 0} issues</span>
        </div>
        <Progress value={progressPercent} className="h-1.5" />
      </div>
    </Link>
  );
}
