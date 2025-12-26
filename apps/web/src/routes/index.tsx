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

  if (authenticated && user) {
    return <DashboardView username={user.username} />;
  }

  return <LandingView />;
}

function LandingView() {
  return (
    <div className="flex flex-col items-center">
      {/* Hero Section */}
      <section className="py-20 text-center max-w-4xl mx-auto">
        <div className="flex justify-center mb-6">
          <div className="p-4 rounded-full bg-primary/10">
            <GitBranch className="h-12 w-12 text-primary" />
          </div>
        </div>
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          The Modern Git Platform
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Wit is a powerful, TypeScript-native Git implementation with built-in
          collaboration tools. Host repositories, manage pull requests, and
          track issues—all in one place.
        </p>
        <div className="flex gap-4 justify-center">
          <Button size="lg" asChild>
            <Link to="/register">
              Get started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/explore">Explore repositories</Link>
          </Button>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 w-full">
        <h2 className="text-3xl font-bold text-center mb-12">
          Why choose Wit?
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <FeatureCard
            icon={<Zap className="h-8 w-8" />}
            title="Lightning Fast"
            description="Built with TypeScript and optimized for speed. Clone, push, and pull faster than ever."
          />
          <FeatureCard
            icon={<Shield className="h-8 w-8" />}
            title="Secure by Default"
            description="SHA-256 hashing and modern security practices keep your code safe."
          />
          <FeatureCard
            icon={<Users className="h-8 w-8" />}
            title="Collaboration First"
            description="Pull requests, code review, and issues designed for modern teams."
          />
        </div>
      </section>

      {/* Quick Start Section */}
      <section className="py-16 w-full">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Quick Start</CardTitle>
            <CardDescription>
              Get started with Wit in seconds
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted rounded-lg p-4 font-mono text-sm">
              <div className="text-muted-foreground mb-2"># Install Wit</div>
              <div>npm install -g wit</div>
            </div>
            <div className="bg-muted rounded-lg p-4 font-mono text-sm">
              <div className="text-muted-foreground mb-2"># Clone a repository</div>
              <div>wit clone https://wit.dev/user/repo.git</div>
            </div>
            <div className="bg-muted rounded-lg p-4 font-mono text-sm">
              <div className="text-muted-foreground mb-2"># Push your changes</div>
              <div>wit push origin main</div>
            </div>
          </CardContent>
        </Card>
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
    <div className="grid md:grid-cols-3 gap-8">
      {/* Left sidebar - Recent activity */}
      <div className="md:col-span-2 space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-4">Recent repositories</h2>
          {recentRepos.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <Code2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No repositories yet</p>
                <p className="text-sm mt-2">
                  Create your first repository to get started.
                </p>
                <Button className="mt-4" asChild>
                  <Link to="/new">Create repository</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {recentRepos.map((repo) => (
                <Card key={`${repo.owner}/${repo.name}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Code2 className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <Link
                          to={`/${repo.owner}/${repo.name}`}
                          className="font-medium hover:text-primary transition-colors"
                        >
                          {repo.owner}/{repo.name}
                        </Link>
                        {repo.description && (
                          <p className="text-sm text-muted-foreground">
                            {repo.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-4">Activity feed</h2>
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              <GitPullRequest className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No recent activity</p>
              <p className="text-sm mt-2">
                When you contribute to projects, your activity will show up here.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right sidebar */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link to="/new">
                <Code2 className="mr-2 h-4 w-4" />
                New repository
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link to="/pulls">
                <GitPullRequest className="mr-2 h-4 w-4" />
                Your pull requests
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Explore</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Discover interesting repositories and projects.
            </p>
            <Button variant="secondary" className="w-full" asChild>
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
    <Card>
      <CardHeader>
        <div className="p-2 w-fit rounded-lg bg-primary/10 text-primary mb-2">
          {icon}
        </div>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-base">{description}</CardDescription>
      </CardContent>
    </Card>
  );
}
