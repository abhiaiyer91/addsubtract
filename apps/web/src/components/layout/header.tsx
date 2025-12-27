import { Link, useNavigate } from 'react-router-dom';
import {
  GitBranch,
  Search,
  Bell,
  Plus,
  ChevronDown,
  Settings,
  LogOut,
  User,
  BookOpen,
  Check,
  GitPullRequest,
  CircleDot,
  MessageSquare,
  AtSign,
  Menu,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { formatRelativeTime } from '@/lib/utils';

export function Header() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const user = session?.user;
  const authenticated = !!user;
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="container flex h-14 md:h-16 items-center justify-between px-4 md:px-6">
          {/* Left section - Logo + Nav */}
          <div className="flex items-center gap-4 md:gap-8">
            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-9 w-9"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>

            <Link to="/" className="flex items-center gap-2 group">
              <div className="p-1.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <GitBranch className="h-4 w-4 md:h-5 md:w-5 text-primary" />
              </div>
              <span className="font-bold text-lg md:text-xl tracking-tight">wit</span>
            </Link>

            {authenticated && (
              <nav className="hidden md:flex items-center gap-1">
                <Link
                  to="/explore"
                  className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-full transition-all duration-200"
                >
                  Explore
                </Link>
                <Link
                  to="/pulls"
                  className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-full transition-all duration-200"
                >
                  Pull requests
                </Link>
                <Link
                  to="/issues"
                  className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-full transition-all duration-200"
                >
                  Issues
                </Link>
              </nav>
            )}
          </div>

          {/* Center section - Search (hidden on mobile, visible on tablet+) */}
          <div className="hidden sm:flex flex-1 max-w-md mx-4">
            <form onSubmit={handleSearch} className="w-full">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search repositories..."
                  className="pl-8 w-full h-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </form>
          </div>

          {/* Right section - User actions */}
          <div className="flex items-center gap-1 md:gap-2">
            {/* Search button for mobile */}
            <Button variant="ghost" size="icon" className="sm:hidden h-9 w-9">
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
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Notifications */}
                <NotificationsDropdown />

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
            {/* Mobile search */}
            <form onSubmit={(e) => { handleSearch(e); setMobileMenuOpen(false); }} className="mb-6">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search repositories..."
                  className="pl-8 w-full"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </form>

            {/* Mobile navigation links */}
            <nav className="space-y-1">
              {authenticated && (
                <>
                  <Link
                    to="/explore"
                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-lg transition-all"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <BookOpen className="h-4 w-4" />
                    Explore
                  </Link>
                  <Link
                    to="/pulls"
                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-lg transition-all"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <GitPullRequest className="h-4 w-4" />
                    Pull requests
                  </Link>
                  <Link
                    to="/issues"
                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-lg transition-all"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <CircleDot className="h-4 w-4" />
                    Issues
                  </Link>
                  <Link
                    to="/new"
                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-lg transition-all"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Plus className="h-4 w-4" />
                    New repository
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

function NotificationsDropdown() {
  const navigate = useNavigate();
  const { data: unreadCount } = trpc.notifications.unreadCount.useQuery();
  const { data: notifications } = trpc.notifications.list.useQuery({ limit: 10 });
  const utils = trpc.useUtils();
  
  const markAsRead = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  const markAllAsRead = trpc.notifications.markAllAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'pr_review_requested':
      case 'pr_reviewed':
      case 'pr_merged':
        return <GitPullRequest className="h-4 w-4 text-purple-500" />;
      case 'pr_comment':
      case 'issue_comment':
        return <MessageSquare className="h-4 w-4 text-blue-500" />;
      case 'issue_assigned':
        return <CircleDot className="h-4 w-4 text-green-500" />;
      case 'mention':
        return <AtSign className="h-4 w-4 text-yellow-500" />;
      default:
        return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const handleNotificationClick = (notification: any) => {
    if (!notification.read) {
      markAsRead.mutate({ id: notification.id });
    }
    if (notification.url) {
      navigate(notification.url);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount && unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 bg-blue-500 rounded-full text-[10px] flex items-center justify-center text-white font-medium">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount && unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markAllAsRead.mutate()}
            >
              <Check className="h-3 w-3 mr-1" />
              Mark all read
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!notifications || notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No notifications
          </div>
        ) : (
          <>
            {notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`flex items-start gap-3 p-3 cursor-pointer ${!notification.read ? 'bg-muted/50' : ''}`}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="mt-0.5">
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${!notification.read ? 'font-medium' : ''}`}>
                    {notification.title}
                  </p>
                  {notification.actor && (
                    <p className="text-xs text-muted-foreground">
                      {notification.actor.name || notification.actor.username}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeTime(notification.createdAt)}
                  </p>
                </div>
                {!notification.read && (
                  <div className="h-2 w-2 bg-blue-500 rounded-full mt-1.5" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-center text-sm text-primary justify-center"
              onClick={() => navigate('/notifications')}
            >
              View all notifications
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
