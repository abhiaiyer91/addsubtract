/**
 * Planning Dashboard Component
 * 
 * A comprehensive dashboard for the agent planning workflow system.
 * Features:
 * - Session overview with status cards
 * - Quick start templates
 * - Configuration wizard
 * - Real-time execution monitoring
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Loader2,
  Target,
  Clock,
  CheckCircle2,
  XCircle,
  Play,
  Sparkles,
  Zap,
  GitBranch,
  Settings2,
  Layers,
  ArrowRight,
  Rocket,
  Code2,
  FileCode,
  Bug,
  Paintbrush,
  TestTube,
  RefreshCw,
  ChevronRight,
  Cpu,
  Users,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

// ============ TYPES ============

type SessionStatus = 'planning' | 'ready' | 'executing' | 'completed' | 'failed' | 'cancelled';

interface Template {
  id: string;
  title: string;
  description: string;
  prompt: string;
  icon: React.ElementType;
  color: string;
  category: 'feature' | 'refactor' | 'fix' | 'test';
}

// ============ CONSTANTS ============

const TEMPLATES: Template[] = [
  {
    id: 'feature',
    title: 'New Feature',
    description: 'Build a new feature from scratch',
    prompt: 'I want to add a new feature that...',
    icon: Sparkles,
    color: 'from-violet-500 to-purple-600',
    category: 'feature',
  },
  {
    id: 'api',
    title: 'API Endpoint',
    description: 'Create REST or GraphQL endpoints',
    prompt: 'Create an API endpoint that...',
    icon: Code2,
    color: 'from-blue-500 to-cyan-500',
    category: 'feature',
  },
  {
    id: 'component',
    title: 'UI Component',
    description: 'Build a React/Vue/Svelte component',
    prompt: 'Create a reusable component for...',
    icon: Paintbrush,
    color: 'from-pink-500 to-rose-500',
    category: 'feature',
  },
  {
    id: 'refactor',
    title: 'Refactor Code',
    description: 'Improve existing code structure',
    prompt: 'Refactor the code to improve...',
    icon: RefreshCw,
    color: 'from-amber-500 to-orange-500',
    category: 'refactor',
  },
  {
    id: 'bugfix',
    title: 'Fix Bug',
    description: 'Diagnose and fix issues',
    prompt: 'Fix the bug where...',
    icon: Bug,
    color: 'from-red-500 to-rose-600',
    category: 'fix',
  },
  {
    id: 'tests',
    title: 'Add Tests',
    description: 'Write unit or integration tests',
    prompt: 'Add comprehensive tests for...',
    icon: TestTube,
    color: 'from-emerald-500 to-green-600',
    category: 'test',
  },
];

const STATUS_CONFIG: Record<SessionStatus, { 
  icon: React.ElementType; 
  label: string; 
  color: string; 
  bgColor: string;
  borderColor: string;
}> = {
  planning: { 
    icon: Target, 
    label: 'Planning', 
    color: 'text-blue-400', 
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/20',
  },
  ready: { 
    icon: Zap, 
    label: 'Ready', 
    color: 'text-green-400', 
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
  },
  executing: { 
    icon: Loader2, 
    label: 'Executing', 
    color: 'text-yellow-400', 
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/20',
  },
  completed: { 
    icon: CheckCircle2, 
    label: 'Completed', 
    color: 'text-emerald-400', 
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/20',
  },
  failed: { 
    icon: XCircle, 
    label: 'Failed', 
    color: 'text-red-400', 
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
  },
  cancelled: { 
    icon: XCircle, 
    label: 'Cancelled', 
    color: 'text-zinc-400', 
    bgColor: 'bg-zinc-500/10',
    borderColor: 'border-zinc-500/20',
  },
};

// ============ COMPONENTS ============

/**
 * Template card for quick start
 */
function TemplateCard({ 
  template, 
  onSelect 
}: { 
  template: Template; 
  onSelect: (template: Template) => void;
}) {
  const Icon = template.icon;
  
  return (
    <button
      onClick={() => onSelect(template)}
      className={cn(
        'group relative p-4 rounded-xl border border-zinc-800 bg-zinc-900/50',
        'hover:bg-zinc-900/80 hover:border-zinc-700 transition-all text-left',
        'focus:outline-none focus:ring-2 focus:ring-blue-500/50'
      )}
    >
      <div className={cn(
        'w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center mb-3',
        template.color
      )}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <h3 className="text-sm font-medium text-zinc-200 mb-1">{template.title}</h3>
      <p className="text-xs text-zinc-500">{template.description}</p>
      <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  );
}

/**
 * Stats card for dashboard overview
 */
function StatsCard({ 
  title, 
  value, 
  icon: Icon, 
  trend, 
  color 
}: { 
  title: string; 
  value: number; 
  icon: React.ElementType;
  trend?: number;
  color: string;
}) {
  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-zinc-500 mb-1">{title}</p>
            <p className="text-2xl font-bold text-zinc-100">{value}</p>
            {trend !== undefined && (
              <div className="flex items-center gap-1 mt-1">
                <TrendingUp className={cn('h-3 w-3', trend >= 0 ? 'text-green-400' : 'text-red-400')} />
                <span className={cn('text-xs', trend >= 0 ? 'text-green-400' : 'text-red-400')}>
                  {trend >= 0 ? '+' : ''}{trend}%
                </span>
              </div>
            )}
          </div>
          <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', color)}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Session preview card
 */
function SessionCard({ 
  session, 
  owner, 
  repoName,
  onOpen 
}: { 
  session: any;
  owner: string;
  repoName: string;
  onOpen: (id: string) => void;
}) {
  const config = STATUS_CONFIG[session.status as SessionStatus];
  const StatusIcon = config.icon;
  
  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <Card 
      className={cn(
        'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-all cursor-pointer group',
        session.status === 'executing' && 'border-yellow-500/30'
      )}
      onClick={() => onOpen(session.id)}
    >
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
            config.bgColor, config.borderColor, 'border'
          )}>
            <StatusIcon className={cn(
              'h-5 w-5', 
              config.color,
              session.status === 'executing' && 'animate-spin'
            )} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-medium text-zinc-200 truncate">
                {session.title || 'Untitled Session'}
              </h3>
              <Badge variant="secondary" className={cn('text-xs', config.bgColor, config.color)}>
                {config.label}
              </Badge>
            </div>
            <p className="text-xs text-zinc-500 line-clamp-1 mb-2">
              {session.planningPrompt}
            </p>
            <div className="flex items-center gap-3 text-xs text-zinc-600">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDate(session.createdAt)}
              </span>
              <span className="flex items-center gap-1">
                <Layers className="h-3 w-3" />
                {session.iterationCount} iterations
              </span>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        
        {session.status === 'executing' && (
          <div className="mt-3 pt-3 border-t border-zinc-800">
            <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
              <span>Progress</span>
              <span>Running...</span>
            </div>
            <Progress value={30} className="h-1" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * New session wizard
 */
function NewSessionWizard({ 
  open, 
  onOpenChange, 
  repoId,
  owner,
  repoName,
  onCreated,
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  repoId: string;
  owner: string;
  repoName: string;
  onCreated: (sessionId: string) => void;
}) {
  const [step, setStep] = useState<'template' | 'configure' | 'review'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [baseBranch, setBaseBranch] = useState('main');
  const [maxConcurrency, setMaxConcurrency] = useState(3);
  
  const createSession = trpc.planningWorkflow.createSession.useMutation({
    onSuccess: (session) => {
      onOpenChange(false);
      onCreated(session.id);
    },
  });
  
  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template);
    setPrompt(template.prompt);
    setTitle('');
    setStep('configure');
  };
  
  const handleCreate = () => {
    createSession.mutate({
      repoId,
      planningPrompt: prompt,
      title: title || prompt.slice(0, 50),
      baseBranch,
      maxConcurrency,
    });
  };
  
  const resetWizard = () => {
    setStep('template');
    setSelectedTemplate(null);
    setTitle('');
    setPrompt('');
    setBaseBranch('main');
    setMaxConcurrency(3);
  };
  
  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetWizard();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Rocket className="h-4 w-4 text-white" />
            </div>
            {step === 'template' && 'Start a Planning Session'}
            {step === 'configure' && 'Configure Your Task'}
            {step === 'review' && 'Review & Start'}
          </DialogTitle>
          <DialogDescription>
            {step === 'template' && 'Choose a template or start from scratch'}
            {step === 'configure' && 'Describe what you want to build'}
            {step === 'review' && 'Review your configuration before starting'}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 overflow-y-auto py-4">
          {step === 'template' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {TEMPLATES.map((template) => (
                  <TemplateCard 
                    key={template.id} 
                    template={template} 
                    onSelect={handleTemplateSelect} 
                  />
                ))}
              </div>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-zinc-800" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-zinc-950 px-2 text-zinc-500">or</span>
                </div>
              </div>
              
              <button
                onClick={() => {
                  setSelectedTemplate(null);
                  setStep('configure');
                }}
                className={cn(
                  'w-full p-4 rounded-xl border-2 border-dashed border-zinc-800',
                  'hover:border-zinc-700 hover:bg-zinc-900/50 transition-all text-center',
                  'focus:outline-none focus:ring-2 focus:ring-blue-500/50'
                )}
              >
                <Plus className="h-6 w-6 text-zinc-600 mx-auto mb-2" />
                <p className="text-sm text-zinc-400">Start from scratch</p>
              </button>
            </div>
          )}
          
          {step === 'configure' && (
            <div className="space-y-6">
              <div>
                <Label className="text-zinc-400">Title (optional)</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Add user authentication"
                  className="mt-1.5"
                />
              </div>
              
              <div>
                <Label className="text-zinc-400">What do you want to build?</Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe your task in detail. Include requirements, constraints, and any specific implementation details..."
                  className="mt-1.5 min-h-[180px]"
                />
                <p className="text-xs text-zinc-600 mt-1.5">
                  Be specific about your requirements. The planning agent will analyze your codebase and propose a plan.
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-zinc-400">Base Branch</Label>
                  <Select value={baseBranch} onValueChange={setBaseBranch}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="main">main</SelectItem>
                      <SelectItem value="master">master</SelectItem>
                      <SelectItem value="develop">develop</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label className="text-zinc-400">
                    Parallel Agents: {maxConcurrency}
                  </Label>
                  <div className="mt-3 px-1">
                    <Slider
                      value={[maxConcurrency]}
                      onValueChange={([val]) => setMaxConcurrency(val)}
                      min={1}
                      max={10}
                      step={1}
                    />
                  </div>
                  <p className="text-xs text-zinc-600 mt-1.5">
                    More agents = faster execution, but requires good task isolation
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {step === 'review' && (
            <div className="space-y-6">
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Task Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-zinc-500">Title</p>
                    <p className="text-sm text-zinc-200">{title || prompt.slice(0, 50)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Description</p>
                    <p className="text-sm text-zinc-300 whitespace-pre-wrap">{prompt}</p>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Configuration</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-4 w-4 text-zinc-500" />
                      <div>
                        <p className="text-xs text-zinc-500">Base Branch</p>
                        <p className="text-sm text-zinc-200">{baseBranch}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Cpu className="h-4 w-4 text-zinc-500" />
                      <div>
                        <p className="text-xs text-zinc-500">Parallel Agents</p>
                        <p className="text-sm text-zinc-200">{maxConcurrency}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Sparkles className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-blue-300 font-medium">What happens next?</p>
                  <p className="text-xs text-blue-300/70 mt-1">
                    The planning agent will analyze your codebase, understand the structure, and propose a detailed implementation plan. You can iterate on the plan before executing.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <DialogFooter className="border-t border-zinc-800 pt-4">
          {step !== 'template' && (
            <Button
              variant="outline"
              onClick={() => setStep(step === 'review' ? 'configure' : 'template')}
            >
              Back
            </Button>
          )}
          <div className="flex-1" />
          {step === 'template' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          {step === 'configure' && (
            <Button
              onClick={() => setStep('review')}
              disabled={!prompt.trim()}
              className="gap-2"
            >
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {step === 'review' && (
            <Button
              onClick={handleCreate}
              disabled={createSession.isPending}
              className="gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
            >
              {createSession.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Start Planning
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ MAIN COMPONENT ============

interface PlanningDashboardProps {
  repoId: string;
  owner: string;
  repoName: string;
}

export function PlanningDashboard({ repoId, owner, repoName }: PlanningDashboardProps) {
  const navigate = useNavigate();
  const [showNewSession, setShowNewSession] = useState(false);
  
  const { data: sessions, isLoading } = trpc.planningWorkflow.listSessionsByRepo.useQuery({
    repoId,
    limit: 50,
  });
  
  const handleOpenSession = (sessionId: string) => {
    navigate(`/${owner}/${repoName}/planning/${sessionId}`);
  };
  
  const handleSessionCreated = (sessionId: string) => {
    navigate(`/${owner}/${repoName}/planning/${sessionId}`);
  };
  
  // Calculate stats
  const stats = {
    total: sessions?.length || 0,
    active: sessions?.filter(s => s.status === 'planning' || s.status === 'executing').length || 0,
    completed: sessions?.filter(s => s.status === 'completed').length || 0,
    failed: sessions?.filter(s => s.status === 'failed').length || 0,
  };
  
  const activeSessions = sessions?.filter(s => 
    s.status === 'planning' || s.status === 'executing' || s.status === 'ready'
  ) || [];
  
  const recentSessions = sessions?.filter(s => 
    s.status === 'completed' || s.status === 'failed' || s.status === 'cancelled'
  ).slice(0, 5) || [];
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }
  
  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <Target className="h-5 w-5 text-white" />
            </div>
            Planning Workflows
          </h1>
          <p className="text-zinc-500 mt-1">
            Plan complex tasks with AI and execute them with parallel coding agents
          </p>
        </div>
        <Button onClick={() => setShowNewSession(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Session
        </Button>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatsCard 
          title="Total Sessions" 
          value={stats.total} 
          icon={Layers}
          color="bg-blue-500"
        />
        <StatsCard 
          title="Active" 
          value={stats.active} 
          icon={Zap}
          color="bg-yellow-500"
        />
        <StatsCard 
          title="Completed" 
          value={stats.completed} 
          icon={CheckCircle2}
          color="bg-emerald-500"
        />
        <StatsCard 
          title="Failed" 
          value={stats.failed} 
          icon={XCircle}
          color="bg-red-500"
        />
      </div>
      
      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-zinc-200 mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-400" />
            Active Sessions
          </h2>
          <div className="grid gap-3">
            {activeSessions.map((session) => (
              <SessionCard 
                key={session.id} 
                session={session}
                owner={owner}
                repoName={repoName}
                onOpen={handleOpenSession}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Quick Start (shown when no active sessions) */}
      {activeSessions.length === 0 && (
        <Card className="bg-gradient-to-br from-zinc-900/80 to-zinc-900/50 border-zinc-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-yellow-400" />
              Quick Start
            </CardTitle>
            <CardDescription>
              Choose a template to get started quickly
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {TEMPLATES.slice(0, 3).map((template) => (
                <TemplateCard 
                  key={template.id} 
                  template={template} 
                  onSelect={() => {
                    setShowNewSession(true);
                  }}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Recent Sessions */}
      {recentSessions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-zinc-200 mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-zinc-400" />
            Recent Sessions
          </h2>
          <div className="grid gap-3">
            {recentSessions.map((session) => (
              <SessionCard 
                key={session.id} 
                session={session}
                owner={owner}
                repoName={repoName}
                onOpen={handleOpenSession}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Empty State */}
      {!sessions || sessions.length === 0 && (
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="py-16">
            <div className="text-center max-w-md mx-auto">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-500/20">
                <Target className="h-10 w-10 text-white" />
              </div>
              <h2 className="text-xl font-semibold text-zinc-100 mb-2">
                No Planning Sessions Yet
              </h2>
              <p className="text-zinc-500 mb-8">
                Create your first planning session to break down complex tasks and execute them with parallel coding agents.
              </p>
              <Button 
                onClick={() => setShowNewSession(true)} 
                className="gap-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
                size="lg"
              >
                <Rocket className="h-5 w-5" />
                Create Your First Session
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* New Session Wizard */}
      <NewSessionWizard
        open={showNewSession}
        onOpenChange={setShowNewSession}
        repoId={repoId}
        owner={owner}
        repoName={repoName}
        onCreated={handleSessionCreated}
      />
    </div>
  );
}
