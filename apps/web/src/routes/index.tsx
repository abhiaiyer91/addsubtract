import { Link, Navigate } from 'react-router-dom';
import {
  GitBranch,
  Zap,
  Users,
  ArrowRight,
  Sparkles,
  GitPullRequest,
  CircleDot,
  Terminal,
  Code2,
  Layers,
  Bot,
  Check,
  ChevronRight,
  Command,
  Cpu,
  Globe,
  Lock,
  Rocket,
  Search,
  GitMerge,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isAuthenticated, getUser } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

export function HomePage() {
  const authenticated = isAuthenticated();
  const user = getUser();

  // Redirect authenticated users to their profile/dashboard
  if (authenticated && user?.username) {
    return <Navigate to={`/${user.username}`} replace />;
  }

  return <LandingView />;
}

// Animated typing effect for terminal
function TypeWriter({ text, delay = 50 }: { text: string; delay?: number }) {
  const [displayText, setDisplayText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setDisplayText(prev => prev + text[currentIndex]);
        setCurrentIndex(prev => prev + 1);
      }, delay);
      return () => clearTimeout(timeout);
    }
  }, [currentIndex, text, delay]);

  return (
    <span>
      {displayText}
      {currentIndex < text.length && (
        <span className="inline-block w-2 h-4 bg-emerald-500 ml-0.5 animate-pulse" />
      )}
    </span>
  );
}

// Animated gradient orb
function GradientOrb({ className }: { className?: string }) {
  return (
    <div className={cn(
      "absolute rounded-full blur-3xl opacity-20 animate-pulse",
      className
    )} />
  );
}

function LandingView() {
  const [terminalStep, setTerminalStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTerminalStep(prev => (prev + 1) % 4);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center -mt-4 md:-mt-6 lg:-mt-8 -mb-4 md:-mb-6 lg:-mb-8 w-screen relative left-1/2 -translate-x-1/2 overflow-hidden bg-zinc-950">
      {/* Hero Section - extends down to overlap with product preview */}
      <section className="relative w-full pt-12 pb-32 overflow-hidden">
        {/* Background effects - these extend into the product preview */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(16,185,129,0.12)_0%,_transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(139,92,246,0.08)_0%,_transparent_40%)]" />
        <GradientOrb className="w-[600px] h-[600px] bg-emerald-500 -top-40 -right-40" />
        <GradientOrb className="w-[400px] h-[400px] bg-violet-500 top-60 -left-20" />
        
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
        
        <div className="container relative z-10 max-w-5xl mx-auto px-6">
          {/* Main headline */}
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-center mb-4 animate-fade-up" style={{ animationDelay: '100ms' }}>
            <span className="text-zinc-100">Code hosting that</span>
            <br />
            <span className="bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 bg-clip-text text-transparent">
              moves at your speed
            </span>
          </h1>
          
          {/* Subheadline */}
          <p className="text-base md:text-lg text-zinc-400 text-center mb-6 max-w-xl mx-auto leading-relaxed animate-fade-up" style={{ animationDelay: '200ms' }}>
            The modern Git platform with AI-powered reviews, built-in CI/CD, 
            and Linear-style project management.
          </p>
          
          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center animate-fade-up" style={{ animationDelay: '300ms' }}>
            <Button 
              size="lg" 
              asChild 
              className="h-11 px-6 text-sm bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all duration-300"
            >
              <Link to="/register" className="group">
                Start building
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
          </div>
          
          {/* Trust indicators */}
          <div className="flex items-center justify-center gap-4 mt-6 text-xs text-zinc-500 animate-fade-up" style={{ animationDelay: '400ms' }}>
            <div className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              Free for open source
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              No credit card
            </div>
            <div className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              Self-host available
            </div>
          </div>
        </div>
      </section>

      {/* Product Preview - pulls up into hero section */}
      <section className="relative w-full -mt-24 pb-12">
        <div className="container max-w-4xl mx-auto px-6">
          <div className="relative rounded-lg border border-zinc-800 bg-zinc-900/50 shadow-xl overflow-hidden animate-fade-up" style={{ animationDelay: '500ms' }}>
            {/* Window chrome */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900/80">
              <div className="flex gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-800/50 text-[10px] text-zinc-500">
                  <Lock className="h-2.5 w-2.5" />
                  wit.sh/acme/frontend
                </div>
              </div>
            </div>
            
            {/* Content preview */}
            <div className="grid md:grid-cols-2 divide-x divide-zinc-800">
              {/* Terminal side - fixed height to prevent layout shift during animation */}
              <div className="p-4 bg-zinc-950 min-h-[200px]">
                <div className="flex items-center gap-1.5 mb-2">
                  <Terminal className="h-3 w-3 text-zinc-500" />
                  <span className="text-xs text-zinc-500">Terminal</span>
                </div>
                <div className="font-mono text-xs space-y-2">
                  <div>
                    <span className="text-emerald-400">$</span>
                    <span className="text-zinc-300 ml-2">
                      {terminalStep >= 0 && <TypeWriter text="wit clone acme/frontend" delay={40} />}
                    </span>
                  </div>
                  {terminalStep >= 1 && (
                    <div className="text-zinc-500 animate-fade-up">
                      Cloning into 'frontend'...
                      <div className="mt-1 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: '100%' }} />
                        </div>
                        <span className="text-[10px]">Done!</span>
                      </div>
                    </div>
                  )}
                  {terminalStep >= 2 && (
                    <div className="animate-fade-up">
                      <span className="text-emerald-400">$</span>
                      <span className="text-zinc-300 ml-2">wit ai review</span>
                    </div>
                  )}
                  {terminalStep >= 3 && (
                    <div className="text-zinc-400 animate-fade-up space-y-0.5">
                      <div className="flex items-center gap-1.5 text-emerald-400">
                        <Check className="h-3 w-3" />
                        Analyzing 12 files...
                      </div>
                      <div className="flex items-center gap-1.5 text-yellow-400">
                        <Sparkles className="h-3 w-3" />
                        Found 3 suggestions
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* UI Preview side */}
              <div className="p-4 bg-zinc-900/30">
                <div className="flex items-center gap-1.5 mb-2">
                  <GitPullRequest className="h-3 w-3 text-zinc-500" />
                  <span className="text-xs text-zinc-500">Pull Request #142</span>
                  <span className="ml-auto px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px]">Open</span>
                </div>
                <div className="space-y-2">
                  <div>
                    <div className="text-xs font-medium text-zinc-200">feat: Add user authentication</div>
                    <div className="text-[10px] text-zinc-500">sarah opened 2 hours ago</div>
                  </div>
                  <div className="flex gap-1.5 text-[10px]">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">+248 -32</span>
                    <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">8 files</span>
                    <span className="px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 flex items-center gap-0.5">
                      <Bot className="h-2.5 w-2.5" />
                      AI
                    </span>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <Check className="h-2.5 w-2.5 text-emerald-400" />
                    </div>
                    <span className="text-[10px] text-zinc-400">All checks passed</span>
                    <Button size="sm" className="ml-auto h-6 text-[10px] px-2 bg-emerald-600 hover:bg-emerald-500">
                      Merge
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Bento Grid */}
      <section className="w-full pt-6 pb-10 relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(16,185,129,0.05)_0%,_transparent_70%)]" />
        
        <div className="container max-w-5xl mx-auto px-6 relative">
          <div className="text-center mb-6">
            <h2 className="text-2xl md:text-3xl font-bold text-zinc-100 mb-2">
              Everything you need to ship faster
            </h2>
            <p className="text-sm text-zinc-400 max-w-xl mx-auto">
              Git reimagined in TypeScript with AI woven into every workflow
            </p>
          </div>
          
          {/* Bento grid */}
          <div className="grid md:grid-cols-3 gap-3">
            {/* Large feature - Git hosting */}
            <div className="md:col-span-2 md:row-span-2 group">
              <div className="h-full p-5 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-all duration-300">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <GitBranch className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-zinc-100">Full Git Implementation</h3>
                    <p className="text-xs text-zinc-500">57+ commands, 100% TypeScript</p>
                  </div>
                </div>
                <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
                  A complete Git server and CLI built from scratch. Self-host your repos with HTTP and SSH access.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-lg bg-zinc-800/30 border border-zinc-800">
                    <Globe className="h-4 w-4 text-cyan-400 mb-1" />
                    <div className="text-xs font-medium text-zinc-200">HTTP & SSH</div>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-800/30 border border-zinc-800">
                    <Lock className="h-4 w-4 text-purple-400 mb-1" />
                    <div className="text-xs font-medium text-zinc-200">Branch protection</div>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-800/30 border border-zinc-800">
                    <GitMerge className="h-4 w-4 text-blue-400 mb-1" />
                    <div className="text-xs font-medium text-zinc-200">Merge queue</div>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-800/30 border border-zinc-800">
                    <Zap className="h-4 w-4 text-yellow-400 mb-1" />
                    <div className="text-xs font-medium text-zinc-200">Stacked diffs</div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Pull Requests */}
            <FeatureCard
              icon={<GitPullRequest className="h-5 w-5" />}
              iconColor="text-purple-400"
              iconBg="bg-purple-500/10"
              title="Pull Requests"
              description="Create, review, and merge PRs from CLI or web. Supports merge, squash, and rebase."
            />
            
            {/* Issues */}
            <FeatureCard
              icon={<CircleDot className="h-5 w-5" />}
              iconColor="text-green-400"
              iconBg="bg-green-500/10"
              title="Issues & Projects"
              description="Linear-style issue tracking with priorities, sub-issues, relations, and cycles."
            />
            
            {/* AI Search - Wide */}
            <div className="md:col-span-2 group">
              <div className="h-full p-4 rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-500/5 border border-violet-500/20 hover:border-violet-500/40 transition-all duration-300">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-violet-500/20">
                    <Search className="h-5 w-5 text-violet-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-zinc-100 mb-1">Semantic Code Search</h3>
                    <p className="text-zinc-400 text-xs leading-relaxed mb-3">
                      Search your codebase with natural language. Ask "where do we handle auth" and get answers.
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 text-xs">wit search</span>
                      <span className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 text-xs">Vector embeddings</span>
                      <span className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-300 text-xs">Interactive mode</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* AI Agent */}
            <FeatureCard
              icon={<Bot className="h-5 w-5" />}
              iconColor="text-orange-400"
              iconBg="bg-orange-500/10"
              title="Coding Agent"
              description="Interactive AI that can read, edit files, run commands, and open PRs for you."
            />
            
            {/* AI Commands - Wide */}
            <div className="md:col-span-3 group">
              <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-all duration-300">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-500/10">
                      <Sparkles className="h-5 w-5 text-cyan-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-zinc-100">AI-Powered Workflow</h3>
                      <p className="text-xs text-zinc-400">Generate commit messages, review code, explain changes, resolve conflicts</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="px-2 py-1 rounded bg-zinc-800 text-zinc-400">wit ai commit</span>
                    <span className="px-2 py-1 rounded bg-zinc-800 text-zinc-400">wit ai review</span>
                    <span className="px-2 py-1 rounded bg-zinc-800 text-zinc-400">wit ai resolve</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CLI Showcase - moved before Why Teams */}
      <section className="w-full py-12 relative border-t border-zinc-800/50">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(139,92,246,0.08)_0%,_transparent_60%)]" />
        
        <div className="container max-w-5xl mx-auto px-6 relative">
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-zinc-100 mb-4">
                A CLI you'll actually love
              </h2>
              <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                Powerful command-line interface that feels like Git, but better. 
                Create PRs, manage issues, and trigger workflows from your terminal.
              </p>
              <div className="space-y-3">
                <CLIFeature 
                  command="wit pr create"
                  description="Create pull requests from the command line"
                />
                <CLIFeature 
                  command="wit issue new"
                  description="File issues with labels and assignments"
                />
                <CLIFeature 
                  command="wit ai review"
                  description="Get AI feedback on your changes"
                />
                <CLIFeature 
                  command="wit up"
                  description="Start local dev server with hot reload"
                />
              </div>
            </div>
            
            {/* Terminal mockup */}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-violet-500/20 rounded-xl blur-2xl" />
              <div className="relative rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800">
                  <div className="flex gap-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                  </div>
                  <span className="ml-2 text-[10px] text-zinc-500">~/projects/my-app</span>
                </div>
                <div className="p-4 font-mono text-xs space-y-2">
                  <div>
                    <span className="text-emerald-400">❯</span>
                    <span className="text-zinc-300 ml-2">wit pr create --title "Add auth"</span>
                  </div>
                  <div className="text-zinc-500">Creating pull request...</div>
                  <div className="flex items-center gap-2 text-emerald-400">
                    <Check className="h-3 w-3" />
                    <span>Pull request #143 created</span>
                  </div>
                  <div className="pt-2 border-t border-zinc-800">
                    <span className="text-emerald-400">❯</span>
                    <span className="text-zinc-600 ml-2">_</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why wit Section */}
      <section className="w-full py-12 border-t border-zinc-800/50">
        <div className="container max-w-5xl mx-auto px-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-zinc-100 mb-2">
              Why teams choose wit
            </h2>
            <p className="text-sm text-zinc-400">
              Built for modern development workflows
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            <ReasonCard
              icon={<Command className="h-4 w-4" />}
              title="Keyboard-first"
              description="Navigate with shortcuts. Command palette and instant search."
            />
            <ReasonCard
              icon={<Rocket className="h-4 w-4" />}
              title="Blazing fast"
              description="Instant page loads, real-time updates, optimized Git."
            />
            <ReasonCard
              icon={<Layers className="h-4 w-4" />}
              title="Unified platform"
              description="Code, issues, projects, and CI/CD in one place."
            />
            <ReasonCard
              icon={<Code2 className="h-4 w-4" />}
              title="Developer experience"
              description="Thoughtful CLI, powerful API, and webhooks."
            />
            <ReasonCard
              icon={<Users className="h-4 w-4" />}
              title="Team collaboration"
              description="Real-time presence, @mentions, and notifications."
            />
            <ReasonCard
              icon={<Cpu className="h-4 w-4" />}
              title="Self-host ready"
              description="Run on your infrastructure with Docker."
            />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="w-full pt-16 pb-20 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(16,185,129,0.15)_0%,_transparent_60%)]" />
        <GradientOrb className="w-[600px] h-[600px] bg-emerald-500 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        
        <div className="container max-w-3xl mx-auto px-6 relative text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-zinc-100 mb-4">
            Ready to ship faster?
          </h2>
          <p className="text-base text-zinc-400 mb-8 max-w-lg mx-auto">
            Join thousands of developers building better software with wit.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button 
              size="lg" 
              asChild 
              className="h-11 px-8 text-sm bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 transition-all duration-300"
            >
              <Link to="/register" className="group">
                Get started for free
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              asChild 
              className="h-11 px-8 text-sm border-zinc-700 hover:border-zinc-600 bg-zinc-900/50 text-zinc-300 hover:text-white transition-all duration-300"
            >
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </section>

    </div>
  );
}

function FeatureCard({
  icon,
  iconColor,
  iconBg,
  title,
  description,
}: {
  icon: React.ReactNode;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
}) {
  return (
    <div className="group p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-all duration-300">
      <div className={cn("p-2 rounded-lg w-fit mb-2", iconBg)}>
        <div className={iconColor}>{icon}</div>
      </div>
      <h3 className="text-sm font-semibold text-zinc-100 mb-1">{title}</h3>
      <p className="text-xs text-zinc-400 leading-relaxed">{description}</p>
    </div>
  );
}

function ReasonCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="group">
      <div className="p-2 rounded-lg bg-zinc-800/50 w-fit mb-2 text-emerald-400 group-hover:bg-emerald-500/10 transition-all duration-300">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-zinc-100 mb-1">{title}</h3>
      <p className="text-xs text-zinc-400 leading-relaxed">{description}</p>
    </div>
  );
}

function CLIFeature({ command, description }: { command: string; description: string }) {
  return (
    <div className="flex items-start gap-2">
      <ChevronRight className="h-3.5 w-3.5 text-emerald-500 mt-0.5" />
      <div>
        <code className="text-xs font-mono text-emerald-400">{command}</code>
        <p className="text-xs text-zinc-500">{description}</p>
      </div>
    </div>
  );
}
