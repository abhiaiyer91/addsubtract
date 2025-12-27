import { Link, Navigate } from 'react-router-dom';
import {
  GitBranch,
  Zap,
  Shield,
  Users,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isAuthenticated } from '@/lib/auth';

export function HomePage() {
  const authenticated = isAuthenticated();

  // Redirect authenticated users to inbox
  if (authenticated) {
    return <Navigate to="/inbox" replace />;
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
              <Link to="/login">Sign in</Link>
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
