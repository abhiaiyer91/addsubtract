import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { TRPCProvider } from './lib/trpc';
import { Layout } from './components/layout';
import { Toaster } from './components/ui/toaster';
import { CommandPalette, ShortcutsModal } from './components/command';
import { SearchModal } from './components/search';
import { BranchSwitcher } from './components/branch';

// Routes
import { HomePage } from './routes/index';
import { LoginPage } from './routes/login';
import { RegisterPage } from './routes/register';
import { ForgotPasswordPage } from './routes/forgot-password';
import { TermsPage } from './routes/terms';
import { PrivacyPage } from './routes/privacy';
import { UserHomePage } from './routes/user-home';
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
import { ProjectsPage } from './routes/repo/projects';
import { ProjectDetailPage } from './routes/repo/project-detail';
import { CyclesPage } from './routes/repo/cycles';
import { CycleDetailPage } from './routes/repo/cycle-detail';
import { StacksPage } from './routes/repo/stacks';
import { StackDetailPage } from './routes/repo/stack-detail';
import { WorkflowsPage } from './routes/repo/workflows';
import { WorkflowEditor } from './routes/repo/workflow-editor';
import { WorkflowRunDetail } from './routes/repo/workflow-run-detail';
import { RepoSettingsPage } from './routes/repo/settings';
import { CollaboratorsPage } from './routes/repo/settings/collaborators';
import { BranchProtectionPage } from './routes/repo/settings/branches';
import { WebhooksPage } from './routes/repo/settings/webhooks';
import { RepoAISettingsPage } from './routes/repo/settings/ai';
import { TriageAgentSettingsPage } from './routes/repo/settings/triage';
import { ReleasesPage } from './routes/repo/releases';
import { NewReleasePage } from './routes/repo/releases/new';
import { ReleaseDetailPage } from './routes/repo/releases/detail';
import { EditReleasePage } from './routes/repo/releases/edit';
import { MilestonesPage } from './routes/repo/milestones';
import { JournalPage } from './routes/repo/journal';
import { JournalPageDetail } from './routes/repo/journal/page-detail';
import { NewJournalPage } from './routes/repo/journal/page-new';
import { SettingsPage } from './routes/settings';
import { SSHKeysPage } from './routes/settings/keys';
import { TokensPage } from './routes/settings/tokens';
import { NewRepoPage } from './routes/new';
import { NewOrgPage } from './routes/org/new';
import { OrgPage } from './routes/org';
import { OrgSettingsPage } from './routes/org/settings';
import { OrgMembersPage } from './routes/org/members';
import { OrgTeamsPage } from './routes/org/teams';
import { TeamDetailPage } from './routes/org/team-detail';
import { SearchPage } from './routes/search';
import { InboxPage } from './routes/inbox';

// Scroll to top on route change
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

export function App() {
  return (
    <TRPCProvider>
      <BrowserRouter>
        <ScrollToTop />
        {/* Global keyboard-first components */}
        <SearchModal />
        <CommandPalette />
        <ShortcutsModal />
        <BranchSwitcher />
        
        <Routes>
          <Route element={<Layout />}>
            {/* Public routes */}
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/keys" element={<SSHKeysPage />} />
            <Route path="/settings/tokens" element={<TokensPage />} />
            <Route path="/new" element={<NewRepoPage />} />
            <Route path="/orgs/new" element={<NewOrgPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/inbox" element={<InboxPage />} />

            {/* Organization routes */}
            <Route path="/org/:slug" element={<OrgPage />} />
            <Route path="/org/:slug/settings" element={<OrgSettingsPage />} />
            <Route path="/org/:slug/members" element={<OrgMembersPage />} />
            <Route path="/org/:slug/teams" element={<OrgTeamsPage />} />
            <Route path="/org/:slug/teams/:teamId" element={<TeamDetailPage />} />

            {/* User/Org profile - Unified dashboard */}
            <Route path="/:owner" element={<UserHomePage />} />

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

            {/* Projects (Linear-like) */}
            <Route path="/:owner/:repo/projects" element={<ProjectsPage />} />
            <Route path="/:owner/:repo/projects/:projectId" element={<ProjectDetailPage />} />

            {/* Cycles/Sprints (Linear-like) */}
            <Route path="/:owner/:repo/cycles" element={<CyclesPage />} />
            <Route path="/:owner/:repo/cycles/:cycleId" element={<CycleDetailPage />} />

            {/* Stacks */}
            <Route path="/:owner/:repo/stacks" element={<StacksPage />} />
            <Route path="/:owner/:repo/stacks/:stackName" element={<StackDetailPage />} />

            {/* Workflows / Actions */}
            <Route path="/:owner/:repo/actions" element={<WorkflowsPage />} />
            <Route path="/:owner/:repo/actions/new" element={<WorkflowEditor />} />
            <Route path="/:owner/:repo/actions/edit" element={<WorkflowEditor />} />
            <Route path="/:owner/:repo/actions/runs/:runId" element={<WorkflowRunDetail />} />

            {/* Releases */}
            <Route path="/:owner/:repo/releases" element={<ReleasesPage />} />
            <Route path="/:owner/:repo/releases/new" element={<NewReleasePage />} />
            <Route path="/:owner/:repo/releases/tag/:tag" element={<ReleaseDetailPage />} />
            <Route path="/:owner/:repo/releases/edit/:id" element={<EditReleasePage />} />

            {/* Milestones */}
            <Route path="/:owner/:repo/milestones" element={<MilestonesPage />} />

            {/* Journal (Notion-like docs) */}
            <Route path="/:owner/:repo/journal" element={<JournalPage />} />
            <Route path="/:owner/:repo/journal/new" element={<NewJournalPage />} />
            <Route path="/:owner/:repo/journal/:slug" element={<JournalPageDetail />} />

            {/* Repository settings */}
            <Route path="/:owner/:repo/settings" element={<RepoSettingsPage />} />
            <Route path="/:owner/:repo/settings/collaborators" element={<CollaboratorsPage />} />
            <Route path="/:owner/:repo/settings/branches" element={<BranchProtectionPage />} />
            <Route path="/:owner/:repo/settings/webhooks" element={<WebhooksPage />} />
            <Route path="/:owner/:repo/settings/ai" element={<RepoAISettingsPage />} />
            <Route path="/:owner/:repo/settings/triage" element={<TriageAgentSettingsPage />} />
          </Route>
        </Routes>
        <Toaster />
      </BrowserRouter>
    </TRPCProvider>
  );
}
