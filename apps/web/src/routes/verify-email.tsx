import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GitBranch, Loader2, CheckCircle, XCircle, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { authClient, useSession } from '@/lib/auth-client';

type VerificationState = 'verifying' | 'success' | 'error' | 'resend';

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { data: session } = useSession();
  
  const [state, setState] = useState<VerificationState>(token ? 'verifying' : 'resend');
  const [error, setError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  // Verify the token on mount
  useEffect(() => {
    if (token) {
      verifyEmail();
    }
  }, [token]);

  const verifyEmail = async () => {
    if (!token) return;
    
    setState('verifying');
    setError(null);

    try {
      const result = await authClient.verifyEmail({
        token,
      });
      
      if (result.error) {
        setError(result.error.message || 'Failed to verify email. The link may have expired.');
        setState('error');
        return;
      }
      
      setState('success');
      
      // Redirect to home after 3 seconds
      setTimeout(() => {
        navigate('/');
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setState('error');
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    setError(null);
    setResendSuccess(false);

    try {
      const result = await authClient.sendVerificationEmail({
        email: session?.user?.email || '',
        callbackURL: `${window.location.origin}/verify-email`,
      });
      
      if (result.error) {
        setError(result.error.message || 'Failed to resend verification email');
        setIsResending(false);
        return;
      }
      
      setResendSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 -mt-20">
      <div className="w-full max-w-md">
        <Card>
          {state === 'verifying' && (
            <CardHeader className="space-y-4">
              <div className="flex justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
              <div className="text-center space-y-2">
                <CardTitle className="text-2xl">Verifying your email</CardTitle>
                <CardDescription>
                  Please wait while we verify your email address...
                </CardDescription>
              </div>
            </CardHeader>
          )}

          {state === 'success' && (
            <>
              <CardHeader className="space-y-4">
                <div className="flex justify-center">
                  <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/20">
                    <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <CardTitle className="text-2xl">Email verified</CardTitle>
                  <CardDescription>
                    Your email has been verified successfully. You'll be redirected shortly.
                  </CardDescription>
                </div>
              </CardHeader>
              <CardFooter>
                <Button asChild className="w-full">
                  <Link to="/">
                    Continue to wit
                  </Link>
                </Button>
              </CardFooter>
            </>
          )}

          {state === 'error' && (
            <>
              <CardHeader className="space-y-4">
                <div className="flex justify-center">
                  <div className="p-3 rounded-full bg-destructive/10">
                    <XCircle className="h-8 w-8 text-destructive" />
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <CardTitle className="text-2xl">Verification failed</CardTitle>
                  <CardDescription>
                    {error || 'The verification link is invalid or has expired.'}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {session?.user && !session.user.emailVerified && (
                  <Button 
                    onClick={handleResend} 
                    className="w-full" 
                    disabled={isResending}
                    variant="outline"
                  >
                    {isResending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Request new verification email
                  </Button>
                )}
              </CardContent>
              <CardFooter>
                <Button asChild variant="ghost" className="w-full">
                  <Link to="/login">
                    Back to login
                  </Link>
                </Button>
              </CardFooter>
            </>
          )}

          {state === 'resend' && (
            <>
              <CardHeader className="space-y-4">
                <div className="flex justify-center">
                  <Link to="/">
                    <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
                      <GitBranch className="h-8 w-8 text-primary" />
                    </div>
                  </Link>
                </div>
                <div className="text-center space-y-2">
                  <CardTitle className="text-2xl">Verify your email</CardTitle>
                  <CardDescription>
                    {session?.user?.email 
                      ? `We'll send a verification link to ${session.user.email}`
                      : 'Please sign in to verify your email'
                    }
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && (
                  <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md">
                    {error}
                  </div>
                )}
                {resendSuccess && (
                  <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm p-3 rounded-md flex items-start gap-2">
                    <Mail className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>Verification email sent! Check your inbox.</span>
                  </div>
                )}
                {session?.user && !session.user.emailVerified && (
                  <Button 
                    onClick={handleResend} 
                    className="w-full" 
                    disabled={isResending || resendSuccess}
                  >
                    {isResending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {resendSuccess ? 'Email sent' : 'Send verification email'}
                  </Button>
                )}
                {session?.user?.emailVerified && (
                  <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm p-3 rounded-md flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    <span>Your email is already verified</span>
                  </div>
                )}
              </CardContent>
              <CardFooter>
                <Button asChild variant="ghost" className="w-full">
                  <Link to="/">
                    Back to home
                  </Link>
                </Button>
              </CardFooter>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
