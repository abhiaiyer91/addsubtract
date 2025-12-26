import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { IssueForm } from '@/components/issue/issue-form';
import { RepoHeader } from './components/repo-header';
import { isAuthenticated } from '@/lib/auth';

export function NewIssuePage() {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const authenticated = isAuthenticated();

  const handleSubmit = async (data: { title: string; body: string }) => {
    setIsLoading(true);
    try {
      // TODO: Call tRPC mutation
      console.log('Creating issue:', data);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Mock: redirect to the new issue
      navigate(`/${owner}/${repo}/issues/16`);
    } catch (error) {
      console.error('Failed to create issue:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="space-y-6">
        <RepoHeader owner={owner!} repo={repo!} />
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">Please sign in to create an issue.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RepoHeader owner={owner!} repo={repo!} />
      <div className="max-w-3xl">
        <IssueForm onSubmit={handleSubmit} isLoading={isLoading} />
      </div>
    </div>
  );
}
