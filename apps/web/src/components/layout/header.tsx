import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

export function Header() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const user = session?.user;
  const authenticated = !!user;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { open: openSearch } = useSearchModalStore();

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
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
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => navigate('/new')}>
                      <BookOpen className="mr-2 h-4 w-4" />
                      New repository
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
                    <DropdownMenuItem onClick={() => navigate(`/${user?.username}?tab=repositories`)}>
                      <BookOpen className="mr-2 h-4 w-4" />
                      Your repositories
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

      {/* Mobile navigation menu */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-background/80 backdrop-blur-sm" 
            onClick={() => setMobileMenuOpen(false)}
          />
          
          {/* Menu panel */}
          <div className="fixed inset-y-0 left-0 w-72 bg-background border-r border-border p-4 pt-20 animate-slide-in-right">
            {/* Mobile search - opens search modal */}
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                openSearch();
              }}
              className="flex h-10 w-full items-center gap-2 rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-sm mb-6"
            >
              <Search className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left text-muted-foreground/50">
                Search...
              </span>
            </button>

            {/* Mobile navigation links */}
            <nav className="space-y-1">
              {authenticated && (
                <>
                  <Link
                    to={user?.username ? `/${user.username}` : '/'}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-lg transition-all"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Inbox className="h-4 w-4" />
                    Home
                  </Link>
                  <Link
                    to="/new"
                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-lg transition-all"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Plus className="h-4 w-4" />
                    New repository
                  </Link>
                  <Link
                    to="/orgs/new"
                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-lg transition-all"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Building2 className="h-4 w-4" />
                    New organization
                  </Link>
                </>
              )}
              {!authenticated && (
                <>
                  <Link
                    to="/login"
                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-lg transition-all"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/register"
                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-primary font-medium hover:bg-primary/10 rounded-lg transition-all"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Sign up
                  </Link>
                </>
              )}
            </nav>
          </div>
        </div>
      )}
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
        <DropdownMenuItem onClick={() => navigate('/orgs/new')}>
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
