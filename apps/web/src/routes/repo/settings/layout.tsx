import { Link, useLocation, useParams } from 'react-router-dom';
import { Settings, Users, Shield, Webhook, Bot, Package, Container, HardDrive } from 'lucide-react';
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
  { path: '/storage', label: 'Storage', icon: HardDrive },
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
    <div className="flex flex-col lg:flex-row lg:gap-8 -mt-2">
      {/* Mobile navigation - horizontal scrollable */}
      <nav className="lg:hidden mb-4 -mx-4 px-4 overflow-x-auto">
        <div className="flex gap-1 pb-2">
          {settingsNav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={`${basePath}${item.path}`}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap',
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

      {/* Desktop sidebar navigation */}
      <nav className="hidden lg:block w-56 flex-shrink-0">
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
