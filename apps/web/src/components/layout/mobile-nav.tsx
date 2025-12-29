import { Link, useLocation } from 'react-router-dom';
import { Home, Search, Bell, Plus, User } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { useSearchModalStore } from '@/components/search';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';

export function MobileBottomNav() {
  const location = useLocation();
  const { data: session } = useSession();
  const authenticated = !!session?.user;
  const { open: openSearch } = useSearchModalStore();
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(undefined, {
    enabled: authenticated,
  });

  // Don't show on certain pages
  const hiddenPaths = ['/login', '/register', '/forgot-password', '/reset-password'];
  if (hiddenPaths.some(path => location.pathname.startsWith(path))) {
    return null;
  }

  const homeUrl = authenticated && session?.user?.username 
    ? `/${session.user.username}` 
    : '/';

  const isActive = (path: string) => {
    if (path === homeUrl) {
      return location.pathname === path || location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  const navItemClass = (active: boolean) => cn(
    'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 px-1 text-xs transition-colors no-tap-highlight',
    active ? 'text-primary' : 'text-muted-foreground'
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-xl border-t border-border safe-bottom">
      <div className="flex items-stretch h-14">
        {/* Home */}
        <Link to={homeUrl} className={navItemClass(isActive(homeUrl))}>
          <Home className="h-5 w-5" />
          <span>Home</span>
        </Link>

        {/* Search */}
        <button 
          onClick={openSearch}
          className={navItemClass(false)}
        >
          <Search className="h-5 w-5" />
          <span>Search</span>
        </button>

        {/* Create New */}
        {authenticated && (
          <Link to="/new" className={navItemClass(isActive('/new'))}>
            <div className="relative">
              <Plus className="h-5 w-5" />
            </div>
            <span>New</span>
          </Link>
        )}

        {/* Notifications / Inbox */}
        {authenticated ? (
          <Link to={homeUrl} className={navItemClass(false)}>
            <div className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount && unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-[16px] bg-blue-500 rounded-full text-[10px] flex items-center justify-center text-white font-medium px-1">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <span>Inbox</span>
          </Link>
        ) : (
          <Link to="/login" className={navItemClass(isActive('/login'))}>
            <User className="h-5 w-5" />
            <span>Sign in</span>
          </Link>
        )}

        {/* Profile */}
        {authenticated && (
          <Link 
            to={`/${session?.user?.username}`} 
            className={navItemClass(location.pathname === `/${session?.user?.username}`)}
          >
            <User className="h-5 w-5" />
            <span>Profile</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
