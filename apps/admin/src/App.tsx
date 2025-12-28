import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TRPCProvider } from './lib/trpc';
import { Layout } from './components/layout';
import { DashboardPage } from './routes/dashboard';
import { UsersPage } from './routes/users';
import { UserDetailPage } from './routes/user-detail';
import { RepositoriesPage } from './routes/repositories';
import { AuditLogsPage } from './routes/audit-logs';
import { FeatureFlagsPage } from './routes/feature-flags';
import { SettingsPage } from './routes/settings';
import { HealthPage } from './routes/health';
import { LoginPage } from './routes/login';
import { AuthGuard } from './components/auth-guard';

export function App() {
  return (
    <TRPCProvider>
      <BrowserRouter>
        <Routes>
          {/* Login route (no auth required) */}
          <Route path="/login" element={<LoginPage />} />
          
          {/* Protected routes */}
          <Route element={<AuthGuard><Layout /></AuthGuard>}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/users/:userId" element={<UserDetailPage />} />
            <Route path="/repositories" element={<RepositoriesPage />} />
            <Route path="/audit-logs" element={<AuditLogsPage />} />
            <Route path="/feature-flags" element={<FeatureFlagsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/health" element={<HealthPage />} />
          </Route>
          
          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </TRPCProvider>
  );
}
