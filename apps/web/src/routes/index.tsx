import { Link } from 'react-router-dom';
import {
  GitBranch,
  Zap,
  Shield,
  Users,
  Code2,
  GitPullRequest,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isAuthenticated, getUser } from '@/lib/auth';
import { trpc } from '@/lib/trpc';
import { Loading } from '@/components/ui/loading';

export function HomePage() {
  const authenticated = isAuthenticated();
  const user = getUser();

  if (authenticated && user && user.username) {
    return <DashboardView username={user.username} />;
  }

  return <LandingView />;
}

function LandingView() {
  return (
    <div className="flex flex-col items-center -mt-16">
      {/* Hero Section with gradient background */}
      <section className="relative w-full pt-32 pb-24 overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-hero pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(16,185,129,0.08)_0%,_transparent_60%)] pointer-events-none" />
        
        <div className="container relative z-10 text-center max-w-4xl mx-auto">
          <div className="flex justify-center mb-8 animate-fade-up">
            <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 shadow-glow">
              <GitBranch className="h-10 w-10 text-primary" />
            </div>
          </div>
          
          <h1 className="text-hero md:text-hero-lg font-bold tracking-tight mb-6 animate-fade-up" style={{ animationDelay: '100ms' }}>
            The next generation{' '}
            <br className="hidden sm:block" />
            <span className="gradient-text">of code hosting.</span>
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed animate-fade-up" style={{ animationDelay: '200ms' }}>
            Wit is a modern Git platform built from scratch in TypeScript.
            Host repositories, manage pull requests, and ship code faster.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-up" style={{ animationDelay: '300ms' }}>
            <Button size="xl" asChild>
              <Link to="/register">
                Get started for free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="xl" variant="outline" asChild>
              <Link to="/explore">Explore repositories</Link>
            </Button>
          </div>
          
          <p className="text-sm text-muted-foreground mt-6 animate-fade-up" style={{ animationDelay: '400ms' }}>
            Free for open source. No credit card required.
          </p>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 w-full">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="section-heading mb-4">
              Everything you need to ship faster
            </h2>
            <p className="section-subheading mx-auto">
              One end-to-end platform to simplify and accelerate your workflow
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Zap className="h-6 w-6" />}
              title="Lightning Fast"
              description="Built with TypeScript and optimized for speed. Clone, push, and pull faster than ever."
            />
            <FeatureCard
              icon={<Shield className="h-6 w-6" />}
              title="Secure by Default"
              description="SHA-256 hashing and modern security practices keep your code safe."
            />
            <FeatureCard
              icon={<Users className="h-6 w-6" />}
              title="Collaboration First"
              description="Pull requests, code review, and issues designed for modern teams."
            />
          </div>
        </div>
      </section>

      {/* Quick Start Section */}
      <section className="py-24 w-full border-t border-border/40">
        <div className="container">
          <Card className="max-w-2xl mx-auto overflow-hidden">
            <CardHeader className="border-b border-border/40 bg-muted/20">
              <CardTitle className="text-xl">Quick Start</CardTitle>
              <CardDescription>
                Get started with Wit in seconds
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="bg-muted/30 rounded-xl p-4 font-mono text-sm border border-border/40">
                <div className="text-muted-foreground mb-2 text-xs uppercase tracking-wider"># Install Wit</div>
                <div className="text-primary">npm install -g wit</div>
              </div>
              <div className="bg-muted/30 rounded-xl p-4 font-mono text-sm border border-border/40">
                <div className="text-muted-foreground mb-2 text-xs uppercase tracking-wider"># Clone a repository</div>
                <div className="text-primary">wit clone https://wit.dev/user/repo.git</div>
              </div>
              <div className="bg-muted/30 rounded-xl p-4 font-mono text-sm border border-border/40">
                <div className="text-muted-foreground mb-2 text-xs uppercase tracking-wider"># Push your changes</div>
                <div className="text-primary">wit push origin main</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 w-full relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-glow pointer-events-none" />
        <div className="container relative z-10 text-center">
          <h2 className="section-heading mb-4">
            Built for the world's fastest teams
          </h2>
          <p className="section-subheading mx-auto mb-10">
            Join developers who are shipping code faster with Wit
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="xl" asChild>
              <Link to="/register">
                Start free trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="xl" variant="outline" asChild>
              <Link to="/contact">Request a demo</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function DashboardView({ username }: { username: string }) {
  // Fetch real repositories from tRPC
  const { data: reposData, isLoading } = trpc.repos.list.useQuery(
    { owner: username },
    { enabled: !!username }
  );

  const recentRepos = reposData?.map(repo => ({
    owner: username,
    name: repo.name,
    description: repo.description,
    updatedAt: repo.updatedAt,
  })) || [];

  if (isLoading) {
    return (
      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <Loading />
        </div>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-3 gap-8 py-8">
      {/* Left sidebar - Recent activity */}
      <div className="md:col-span-2 space-y-8">
        <div>
          <h2 className="text-xl font-semibold mb-5 flex items-center gap-2">
            <Code2 className="h-5 w-5 text-primary" />
            Recent repositories
          </h2>
          {recentRepos.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-muted-foreground">
                <div className="p-4 rounded-2xl bg-muted/30 w-fit mx-auto mb-4">
                  <Code2 className="h-10 w-10 text-muted-foreground/50" />
                </div>
                <p className="font-medium text-foreground mb-1">No repositories yet</p>
                <p className="text-sm mb-6">
                  Create your first repository to get started.
                </p>
                <Button asChild>
                  <Link to="/new">
                    Create repository
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {recentRepos.map((repo) => (
                <Card key={`${repo.owner}/${repo.name}`} className="hover:border-primary/30">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-4">
                      <div className="p-2.5 rounded-xl bg-muted/50">
                        <Code2 className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link
                          to={`/${repo.owner}/${repo.name}`}
                          className="font-medium hover:text-primary transition-colors block truncate"
                        >
                          {repo.owner}/{repo.name}
                        </Link>
                        {repo.description && (
                          <p className="text-sm text-muted-foreground truncate mt-0.5">
                            {repo.description}
                          </p>
                        )}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-5 flex items-center gap-2">
            <GitPullRequest className="h-5 w-5 text-primary" />
            Activity feed
          </h2>
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground">
              <div className="p-4 rounded-2xl bg-muted/30 w-fit mx-auto mb-4">
                <GitPullRequest className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <p className="font-medium text-foreground mb-1">No recent activity</p>
              <p className="text-sm">
                When you contribute to projects, your activity will show up here.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right sidebar */}
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start rounded-xl" asChild>
              <Link to="/new">
                <Code2 className="mr-3 h-4 w-4 text-primary" />
                New repository
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-start rounded-xl" asChild>
              <Link to="/pulls">
                <GitPullRequest className="mr-3 h-4 w-4 text-primary" />
                Your pull requests
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Explore</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Discover interesting repositories and projects.
            </p>
            <Button variant="secondary" className="w-full rounded-xl" asChild>
              <Link to="/explore">Browse repositories</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="feature-card group">
      <div className="p-3 w-fit rounded-xl bg-primary/10 text-primary mb-4 transition-all duration-300 group-hover:bg-primary/20 group-hover:shadow-glow-sm">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
