import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  GitBranch,
  Search,
  Inbox,
  Plus,
  ChevronDown,
  Settings,
  LogOut,
  User,
  BookOpen,
  Menu,
  X,
  Building2,
  Flame,
  Trophy,
  Github,
  Heart,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useSession, signOut } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc';
import { useSearchModalStore } from '@/components/search';
import { isMac } from '@/lib/commands';
import { useLockBodyScroll, useScrollDirection } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: session } = useSession();
  const user = session?.user;
  const authenticated = !!user;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { open: openSearch } = useSearchModalStore();
  const scrollDirection = useScrollDirection();

  // Lock body scroll when mobile menu is open
  useLockBodyScroll(mobileMenuOpen);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await signOut();
    setMobileMenuOpen(false);
    navigate('/');
  };

  return (
    <>
      <header 
        className={cn(
          "sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl transition-transform duration-300",
          // Hide header on scroll down on mobile (only when menu is closed)
          scrollDirection === 'down' && !mobileMenuOpen && "md:translate-y-0 -translate-y-full"
        )}
      >
        <div className="container flex h-14 md:h-16 items-center px-4 md:px-6">
          {/* Left section - Logo */}
          <div className="flex items-center gap-3 md:gap-4 flex-1">
            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-9 w-9"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>

            <Link to={authenticated && user?.username ? `/${user.username}` : "/"} className="flex items-center gap-2 group flex-shrink-0">
              <div className="p-1.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <GitBranch className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              </div>
              <span className="font-bold text-lg md:text-xl tracking-tight">wit</span>
            </Link>

            {/* Leaderboard link */}
            <Link
              to="/leaderboard"
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-lg transition-all"
            >
              <Trophy className="h-4 w-4" />
              <span>Leaderboard</span>
            </Link>

            {/* Contribute link */}
            <Link
              to="/contribute"
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-lg transition-all"
            >
              <Heart className="h-4 w-4" />
              <span>Contribute</span>
            </Link>
          </div>

          {/* Center section - Search bar */}
          <div className="hidden sm:flex flex-1 justify-center">
            <button
              onClick={openSearch}
              className="flex h-10 w-full max-w-md items-center gap-2 rounded-full border border-border/40 bg-muted/20 px-4 py-2 text-sm transition-all duration-300 hover:border-muted-foreground/30 hover:bg-muted/30 focus:border-primary/50 focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <Search className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left text-muted-foreground/50">
                Search repositories, issues, PRs...
              </span>
              <kbd className="kbd hidden sm:inline-flex">
                {isMac() ? '\u2318' : 'Ctrl'}
              </kbd>
              <kbd className="kbd hidden sm:inline-flex">K</kbd>
            </button>
          </div>

          {/* Right section - User actions */}
          <div className="flex items-center gap-1 md:gap-2 flex-1 justify-end">
            {/* Search button for mobile - opens search modal */}
            <Button 
              variant="ghost" 
              size="icon" 
              className="sm:hidden h-9 w-9"
              onClick={openSearch}
            >
              <Search className="h-4 w-4" />
            </Button>

            {authenticated ? (
              <>
                {/* Create new dropdown - hidden on mobile */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="hidden md:flex gap-1 h-9">
                      <Plus className="h-4 w-4" />
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={() => navigate('/new')}>
                      <BookOpen className="mr-2 h-4 w-4" />
                      New repository
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/import')}>
                      <Github className="mr-2 h-4 w-4" />
                      Import from GitHub
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate('/orgs/new')}>
                      <Building2 className="mr-2 h-4 w-4" />
                      New organization
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Organization Switcher */}
                <OrganizationSwitcher />

                {/* Inbox button */}
                <InboxButton />

                {/* User menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 md:gap-2 rounded-full h-9 px-2"
                    >
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={user?.image || undefined} />
                        <AvatarFallback className="text-xs">
                          {user?.username?.slice(0, 2).toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <ChevronDown className="h-3 w-3 hidden md:block" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium">{user?.name || user?.username}</p>
                        <p className="text-xs text-muted-foreground">
                          @{user?.username}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate(`/${user?.username}`)}>
                      <User className="mr-2 h-4 w-4" />
                      Your profile
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate(`/${user?.username}/wrapped`)}>
                      <Flame className="mr-2 h-4 w-4" />
                      Your Wrapped
                    </DropdownMenuItem>
                    {/* Mobile-only: New repository option */}
                    <DropdownMenuItem onClick={() => navigate('/new')} className="md:hidden">
                      <Plus className="mr-2 h-4 w-4" />
                      New repository
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate('/settings')}>
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-red-500">
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" className="h-9 text-sm" onClick={() => navigate('/login')}>
                  Sign in
                </Button>
                <Button size="sm" className="h-9 text-sm hidden sm:flex" onClick={() => navigate('/register')}>
                  Sign up
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Mobile navigation menu - full-screen overlay */}
      <div 
        className={cn(
          "fixed inset-0 z-40 md:hidden transition-all duration-300",
          mobileMenuOpen 
            ? "opacity-100 pointer-events-auto" 
            : "opacity-0 pointer-events-none"
        )}
      >
        {/* Backdrop */}
        <div 
          className={cn(
            "absolute inset-0 bg-background/95 backdrop-blur-md transition-opacity duration-300",
            mobileMenuOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setMobileMenuOpen(false)}
        />
        
        {/* Menu panel - slide from left */}
        <div 
          className={cn(
            "absolute inset-y-0 left-0 w-full max-w-sm bg-background border-r border-border/50 shadow-2xl",
            "flex flex-col transition-transform duration-300 ease-out",
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          {/* Header with close button */}
          <div className="flex items-center justify-between px-4 h-14 border-b border-border/40">
            <Link to={authenticated && user?.username ? `/${user.username}` : "/"} className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <GitBranch className="h-4 w-4 text-primary" />
              </div>
              <span className="font-bold text-lg">wit</span>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 touch-target"
              onClick={() => setMobileMenuOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* User profile section (if authenticated) */}
          {authenticated && (
            <div className="px-4 py-4 border-b border-border/40 bg-muted/20">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={user?.image || undefined} />
                  <AvatarFallback className="text-base">
                    {user?.username?.slice(0, 2).toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{user?.name || user?.username}</p>
                  <p className="text-sm text-muted-foreground truncate">@{user?.username}</p>
                </div>
              </div>
            </div>
          )}

          {/* Mobile search - opens search modal */}
          <div className="px-4 py-3">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                openSearch();
              }}
              className="flex h-11 w-full items-center gap-3 rounded-xl border border-border/40 bg-muted/30 px-4 text-sm touch-target no-tap-highlight active:bg-muted/50 transition-colors"
            >
              <Search className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left text-muted-foreground">
                Search...
              </span>
            </button>
          </div>

          {/* Mobile navigation links */}
          <nav className="flex-1 overflow-y-auto scroll-touch px-2 py-2">
            {/* Quick actions for authenticated users */}
            {authenticated && (
              <div className="mb-4">
                <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Quick Actions
                </p>
                <Link
                  to={user?.username ? `/${user.username}` : '/'}
                  className="flex items-center gap-3 px-3 py-3 text-sm hover:bg-muted/40 rounded-xl transition-all touch-target no-tap-highlight active:bg-muted/60"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Inbox className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">Home</span>
                </Link>
                <Link
                  to="/new"
                  className="flex items-center gap-3 px-3 py-3 text-sm hover:bg-muted/40 rounded-xl transition-all touch-target no-tap-highlight active:bg-muted/60"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Plus className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">New repository</span>
                </Link>
                <Link
                  to="/import"
                  className="flex items-center gap-3 px-3 py-3 text-sm hover:bg-muted/40 rounded-xl transition-all touch-target no-tap-highlight active:bg-muted/60"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Github className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">Import from GitHub</span>
                </Link>
              </div>
            )}

            {/* Explore section */}
            <div className="mb-4">
              <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Explore
              </p>
              <Link
                to="/leaderboard"
                className="flex items-center gap-3 px-3 py-3 text-sm hover:bg-muted/40 rounded-xl transition-all touch-target no-tap-highlight active:bg-muted/60"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Trophy className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Leaderboard</span>
              </Link>
              <Link
                to="/contribute"
                className="flex items-center gap-3 px-3 py-3 text-sm hover:bg-muted/40 rounded-xl transition-all touch-target no-tap-highlight active:bg-muted/60"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Heart className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Contribute</span>
              </Link>
            </div>

            {/* Account section */}
            {authenticated && (
              <div className="mb-4">
                <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Account
                </p>
                <Link
                  to={`/${user?.username}`}
                  className="flex items-center gap-3 px-3 py-3 text-sm hover:bg-muted/40 rounded-xl transition-all touch-target no-tap-highlight active:bg-muted/60"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <User className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">Your profile</span>
                </Link>
                <Link
                  to={`/${user?.username}/wrapped`}
                  className="flex items-center gap-3 px-3 py-3 text-sm hover:bg-muted/40 rounded-xl transition-all touch-target no-tap-highlight active:bg-muted/60"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Flame className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">Your Wrapped</span>
                </Link>
                <Link
                  to="/orgs/new"
                  className="flex items-center gap-3 px-3 py-3 text-sm hover:bg-muted/40 rounded-xl transition-all touch-target no-tap-highlight active:bg-muted/60"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">New organization</span>
                </Link>
                <Link
                  to="/settings"
                  className="flex items-center gap-3 px-3 py-3 text-sm hover:bg-muted/40 rounded-xl transition-all touch-target no-tap-highlight active:bg-muted/60"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Settings className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium">Settings</span>
                </Link>
              </div>
            )}
          </nav>

          {/* Footer actions */}
          <div className="border-t border-border/40 p-4 safe-bottom">
            {authenticated ? (
              <Button
                variant="outline"
                className="w-full h-11 touch-target text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign out
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <Button
                  className="w-full h-11 touch-target"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate('/register');
                  }}
                >
                  Sign up
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-11 touch-target"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate('/login');
                  }}
                >
                  Sign in
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function OrganizationSwitcher() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { data: userOrgs } = trpc.organizations.listForUser.useQuery(undefined, {
    enabled: !!session?.user,
  });

  if (!userOrgs || userOrgs.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="hidden md:flex gap-1 h-9">
          <Building2 className="h-4 w-4" />
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Switch context</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate(`/${session?.user?.username}`)}>
          <User className="mr-2 h-4 w-4" />
          <div className="flex flex-col">
            <span className="font-medium">{session?.user?.name || session?.user?.username}</span>
            <span className="text-xs text-muted-foreground">Personal account</span>
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">Organizations</DropdownMenuLabel>
        {userOrgs.map((membership) => (
          <DropdownMenuItem
            key={membership.orgId}
            onClick={() => navigate(`/org/${membership.org.name}`)}
          >
            <Building2 className="mr-2 h-4 w-4" />
            <div className="flex flex-col">
              <span className="font-medium">{membership.org.displayName || membership.org.name}</span>
              <span className="text-xs text-muted-foreground capitalize">{membership.role}</span>
            </div>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/org/new')}>
          <Plus className="mr-2 h-4 w-4" />
          Create organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function InboxButton() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery();

  // Link to user's home dashboard
  const homeUrl = session?.user?.username ? `/${session.user.username}` : '/';

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      className="relative h-9 w-9"
      onClick={() => navigate(homeUrl)}
      title="Home"
    >
      <Inbox className="h-4 w-4" />
      {unreadCount && unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 h-4 w-4 bg-blue-500 rounded-full text-[10px] flex items-center justify-center text-white font-medium">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </Button>
  );
}
