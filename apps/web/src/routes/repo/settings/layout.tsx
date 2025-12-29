import { Link, useLocation, useParams } from 'react-router-dom';
import { Settings, Users, Shield, Webhook, Bot, Package, Container } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SettingsLayoutProps {
  children: React.ReactNode;
}

const settingsNav = [
  { path: '', label: 'General', icon: Settings },
  { path: '/collaborators', label: 'Collaborators', icon: Users },
  { path: '/branches', label: 'Branches', icon: Shield },
  { path: '/webhooks', label: 'Webhooks', icon: Webhook },
  { path: '/package', label: 'Package Registry', icon: Package },
  { path: '/agents', label: 'Agents', icon: Bot },
  { path: '/sandbox', label: 'Sandbox', icon: Container },
];

export function SettingsLayout({ children }: SettingsLayoutProps) {
  const { owner, repo } = useParams<{ owner: string; repo: string }>();
  const location = useLocation();
  const basePath = `/${owner}/${repo}/settings`;

  const isActive = (path: string) => {
    if (path === '') {
      return location.pathname === basePath;
    }
    return location.pathname === `${basePath}${path}`;
  };

  return (
    <div className="flex gap-8">
      {/* Sidebar navigation */}
      <nav className="w-56 flex-shrink-0">
        <div className="sticky top-4 space-y-1">
          {settingsNav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={`${basePath}${item.path}`}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive(item.path)
                    ? 'bg-muted text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Main content */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
