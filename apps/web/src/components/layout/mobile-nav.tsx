import { Link, useLocation } from 'react-router-dom';
import { Home, Search, Bell, Plus, User, GitPullRequest } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { useSearchModalStore } from '@/components/search';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { useScrollDirection, useKeyboardOpen } from '@/hooks/use-mobile';

export function MobileBottomNav() {
  const location = useLocation();
  const { data: session } = useSession();
  const authenticated = !!session?.user;
  const { open: openSearch } = useSearchModalStore();
  const scrollDirection = useScrollDirection();
  const isKeyboardOpen = useKeyboardOpen();
  
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery(undefined, {
    enabled: authenticated,
  });

  // Don't show on certain pages
  const hiddenPaths = ['/login', '/register', '/forgot-password', '/reset-password'];
  if (hiddenPaths.some(path => location.pathname.startsWith(path))) {
    return null;
  }

  // Hide when keyboard is open (for better form UX)
  if (isKeyboardOpen) {
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

  // Check if we're on a PR or issue page (to show activity tab)
  const isPrOrIssuePage = location.pathname.includes('/pull/') || location.pathname.includes('/issue/');

  const navItemClass = (active: boolean) => cn(
    'flex flex-col items-center justify-center gap-0.5 flex-1 py-2 px-1 text-xs',
    'transition-all duration-200 no-tap-highlight touch-target',
    'active:scale-95 active:opacity-70',
    active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
  );

  return (
    <nav 
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 md:hidden",
        "bg-background/95 backdrop-blur-xl border-t border-border",
        "transition-transform duration-300 ease-out",
        // Hide on scroll down
        scrollDirection === 'down' && "translate-y-full"
      )}
    >
      {/* Safe area padding handled by inner content */}
      <div className="flex items-stretch h-14 safe-bottom">
        {/* Home */}
        <Link to={homeUrl} className={navItemClass(isActive(homeUrl))}>
          <Home className="h-5 w-5" strokeWidth={isActive(homeUrl) ? 2.5 : 2} />
          <span className="font-medium">Home</span>
        </Link>

        {/* Search */}
        <button 
          onClick={openSearch}
          className={navItemClass(false)}
        >
          <Search className="h-5 w-5" strokeWidth={2} />
          <span className="font-medium">Search</span>
        </button>

        {/* Create New - Center prominent button */}
        {authenticated && (
          <Link to="/new" className="flex items-center justify-center flex-1 py-2 px-1">
            <div className={cn(
              "flex items-center justify-center w-12 h-8 rounded-full",
              "bg-primary text-primary-foreground",
              "shadow-md transition-all duration-200",
              "active:scale-95 active:shadow-sm"
            )}>
              <Plus className="h-5 w-5" strokeWidth={2.5} />
            </div>
          </Link>
        )}

        {/* Notifications / Activity */}
        {authenticated ? (
          <Link 
            to={isPrOrIssuePage ? location.pathname : homeUrl} 
            className={navItemClass(false)}
          >
            <div className="relative">
              {isPrOrIssuePage ? (
                <GitPullRequest className="h-5 w-5" strokeWidth={2} />
              ) : (
                <Bell className="h-5 w-5" strokeWidth={2} />
              )}
              {unreadCount && unreadCount > 0 && !isPrOrIssuePage && (
                <span className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] bg-primary rounded-full text-[10px] flex items-center justify-center text-primary-foreground font-bold px-1 shadow-sm">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <span className="font-medium">{isPrOrIssuePage ? 'Activity' : 'Inbox'}</span>
          </Link>
        ) : (
          <Link to="/login" className={navItemClass(isActive('/login'))}>
            <User className="h-5 w-5" strokeWidth={2} />
            <span className="font-medium">Sign in</span>
          </Link>
        )}

        {/* Profile */}
        {authenticated && (
          <Link 
            to={`/${session?.user?.username}`} 
            className={navItemClass(location.pathname === `/${session?.user?.username}`)}
          >
            <User 
              className="h-5 w-5" 
              strokeWidth={location.pathname === `/${session?.user?.username}` ? 2.5 : 2} 
            />
            <span className="font-medium">Profile</span>
          </Link>
        )}
      </div>
    </nav>
  );
}
