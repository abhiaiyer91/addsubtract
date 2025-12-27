import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { TRPCProvider } from './lib/trpc';
import { Layout } from './components/layout';
import { Toaster } from './components/ui/toaster';
import { CommandPalette, ShortcutsModal } from './components/command';
import { BranchSwitcher } from './components/branch';

// Routes
import { HomePage } from './routes/index';
import { LoginPage } from './routes/login';
import { RegisterPage } from './routes/register';
import { OwnerPage } from './routes/owner';
import { RepoPage } from './routes/repo';
import { TreePage } from './routes/repo/tree';
import { BlobPage } from './routes/repo/blob';
import { CommitsPage } from './routes/repo/commits';
import { CommitDetailPage } from './routes/repo/commit-detail';
import { BranchesPage } from './routes/repo/branches';
import { PullsPage } from './routes/repo/pulls';
import { PullDetailPage } from './routes/repo/pull-detail';
import { NewPullPage } from './routes/repo/pull-new';
import { IssuesPage } from './routes/repo/issues';
import { IssueDetailPage } from './routes/repo/issue-detail';
import { NewIssuePage } from './routes/repo/issue-new';
import { StacksPage } from './routes/repo/stacks';
import { StackDetailPage } from './routes/repo/stack-detail';
import { WorkflowsPage } from './routes/repo/workflows';
import { SettingsPage } from './routes/settings';
import { NewRepoPage } from './routes/new';
import { SearchPage } from './routes/search';

export function App() {
  return (
    <TRPCProvider>
      <BrowserRouter>
        {/* Global keyboard-first components */}
        <CommandPalette />
        <ShortcutsModal />
        <BranchSwitcher />
        
        <Routes>
          <Route element={<Layout />}>
            {/* Public routes */}
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/new" element={<NewRepoPage />} />
            <Route path="/search" element={<SearchPage />} />

            {/* User/Org profile */}
            <Route path="/:owner" element={<OwnerPage />} />

            {/* Repository routes */}
            <Route path="/:owner/:repo" element={<RepoPage />} />
            <Route path="/:owner/:repo/tree/:ref/*" element={<TreePage />} />
            <Route path="/:owner/:repo/blob/:ref/*" element={<BlobPage />} />
            <Route path="/:owner/:repo/commits" element={<CommitsPage />} />
            <Route path="/:owner/:repo/commits/:ref" element={<CommitsPage />} />
            <Route path="/:owner/:repo/commit/:sha" element={<CommitDetailPage />} />
            <Route path="/:owner/:repo/branches" element={<BranchesPage />} />

            {/* Pull requests */}
            <Route path="/:owner/:repo/pulls" element={<PullsPage />} />
            <Route path="/:owner/:repo/pulls/new" element={<NewPullPage />} />
            <Route path="/:owner/:repo/pull/:number" element={<PullDetailPage />} />

            {/* Issues */}
            <Route path="/:owner/:repo/issues" element={<IssuesPage />} />
            <Route path="/:owner/:repo/issues/new" element={<NewIssuePage />} />
            <Route path="/:owner/:repo/issues/:number" element={<IssueDetailPage />} />

            {/* Stacks */}
            <Route path="/:owner/:repo/stacks" element={<StacksPage />} />
            <Route path="/:owner/:repo/stacks/:stackName" element={<StackDetailPage />} />

            {/* Workflows / Actions */}
            <Route path="/:owner/:repo/actions" element={<WorkflowsPage />} />
          </Route>
        </Routes>
        <Toaster />
      </BrowserRouter>
    </TRPCProvider>
  );
}
