import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GitBranch, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { login as authLogin } from '@/lib/auth';
import { trpc } from '@/lib/trpc';

export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    usernameOrEmail: '',
    password: '',
  });

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      // Store token and user info
      authLogin(
        {
          id: data.user.id,
          username: data.user.username,
          email: data.user.email,
          name: data.user.name || null,
          avatarUrl: data.user.avatarUrl || null,
        },
        data.sessionId
      );
      navigate('/');
    },
    onError: (err) => {
      setError(err.message || 'Invalid username or password');
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    loginMutation.mutate({
      usernameOrEmail: formData.usernameOrEmail,
      password: formData.password,
    });
  };

  const isLoading = loginMutation.isPending;

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <GitBranch className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-2xl">Sign in to Wit</CardTitle>
          <CardDescription>
            Enter your credentials to access your account
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="usernameOrEmail">Username or email</Label>
              <Input
                id="usernameOrEmail"
                type="text"
                placeholder="you@example.com"
                value={formData.usernameOrEmail}
                onChange={(e) =>
                  setFormData({ ...formData, usernameOrEmail: e.target.value })
                }
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  to="/forgot-password"
                  className="text-sm text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                required
                disabled={isLoading}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              Don't have an account?{' '}
              <Link to="/register" className="text-primary hover:underline">
                Sign up
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
