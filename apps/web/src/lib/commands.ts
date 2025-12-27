import {
  Plus,
  Settings,
  Bell,
  LogOut,
  Home,
  BookOpen,
  GitPullRequest,
  CircleDot,
  Keyboard,
  type LucideIcon,
} from 'lucide-react';

export interface Command {
  id: string;
  name: string;
  description?: string;
  icon: LucideIcon;
  shortcut?: string[];
  action: 'navigate' | 'function';
  path?: string;
  handler?: () => void | Promise<void>;
  keywords?: string[];
  requiresAuth?: boolean;
  requiresRepo?: boolean;
}

export interface CommandGroup {
  id: string;
  name: string;
  commands: Command[];
}

// Static commands that are always available
export const staticCommands: CommandGroup[] = [
  {
    id: 'navigation',
    name: 'Navigation',
    commands: [
      {
        id: 'go-home',
        name: 'Go to Dashboard',
        icon: Home,
        shortcut: ['alt', 'h'],
        action: 'navigate',
        path: '/',
        keywords: ['home', 'dashboard', 'main'],
      },
      {
        id: 'go-notifications',
        name: 'Go to Notifications',
        icon: Bell,
        shortcut: ['alt', 'n'],
        action: 'navigate',
        path: '/notifications',
        keywords: ['alerts', 'inbox'],
        requiresAuth: true,
      },
      {
        id: 'go-settings',
        name: 'Go to Settings',
        icon: Settings,
        shortcut: ['alt', 's'],
        action: 'navigate',
        path: '/settings',
        keywords: ['preferences', 'account', 'profile'],
        requiresAuth: true,
      },
    ],
  },
  {
    id: 'actions',
    name: 'Actions',
    commands: [
      {
        id: 'create-repository',
        name: 'Create Repository',
        description: 'Create a new repository',
        icon: Plus,
        action: 'navigate',
        path: '/new',
        keywords: ['new', 'repo', 'project'],
        requiresAuth: true,
      },
      {
        id: 'keyboard-shortcuts',
        name: 'Keyboard Shortcuts',
        description: 'View all keyboard shortcuts',
        icon: Keyboard,
        shortcut: ['?'],
        action: 'function',
        keywords: ['help', 'keys', 'hotkeys'],
      },
    ],
  },
];

// Commands that need repo context
export const repoCommands: CommandGroup[] = [
  {
    id: 'repo-navigation',
    name: 'Repository',
    commands: [
      {
        id: 'go-code',
        name: 'Go to Code',
        icon: BookOpen,
        shortcut: ['alt', 'c'],
        action: 'navigate',
        keywords: ['files', 'source', 'tree'],
        requiresRepo: true,
      },
      {
        id: 'go-issues',
        name: 'Go to Issues',
        icon: CircleDot,
        shortcut: ['alt', 'i'],
        action: 'navigate',
        keywords: ['bugs', 'tickets'],
        requiresRepo: true,
      },
      {
        id: 'go-pulls',
        name: 'Go to Pull Requests',
        icon: GitPullRequest,
        shortcut: ['alt', 'p'],
        action: 'navigate',
        keywords: ['pr', 'merge', 'review'],
        requiresRepo: true,
      },
    ],
  },
  {
    id: 'repo-actions',
    name: 'Create',
    commands: [
      {
        id: 'create-issue',
        name: 'Create Issue',
        description: 'Create a new issue in this repository',
        icon: CircleDot,
        action: 'navigate',
        keywords: ['new', 'bug', 'ticket'],
        requiresRepo: true,
        requiresAuth: true,
      },
      {
        id: 'create-pull-request',
        name: 'Create Pull Request',
        description: 'Create a new pull request',
        icon: GitPullRequest,
        action: 'navigate',
        keywords: ['new', 'pr', 'merge'],
        requiresRepo: true,
        requiresAuth: true,
      },
    ],
  },
];

// Account commands
export const accountCommands: CommandGroup = {
  id: 'account',
  name: 'Account',
  commands: [
    {
      id: 'sign-out',
      name: 'Sign Out',
      icon: LogOut,
      action: 'function',
      keywords: ['logout', 'exit'],
      requiresAuth: true,
    },
  ],
};

// Helper to format shortcut for display
export function formatShortcut(shortcut: string[]): string {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  
  return shortcut.map(key => {
    if (key === 'mod') return isMac ? '\u2318' : 'Ctrl';
    if (key === 'shift') return isMac ? '\u21E7' : 'Shift';
    if (key === 'alt') return isMac ? '\u2325' : 'Alt';
    if (key === 'enter') return '\u23CE';
    if (key === 'escape') return 'Esc';
    return key.toUpperCase();
  }).join(isMac ? '' : '+');
}

// Check if we're on Mac
export function isMac(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
}
