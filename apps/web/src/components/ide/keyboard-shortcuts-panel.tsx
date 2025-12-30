import { useState, useEffect } from 'react';
import {
  Keyboard,
  Sparkles,
  Navigation,
  Edit3,
  FileCode,
  Search,
  Layout,
  GitBranch,
  Bug,
  X,
  Command,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  getShortcutsByCategory,
  type ShortcutCategory,
  type KeyboardShortcut,
} from '@/lib/keyboard-shortcuts/ide-shortcuts';

const CATEGORY_CONFIG: Record<ShortcutCategory, { label: string; icon: React.ElementType; color: string }> = {
  ai: { label: 'AI Features', icon: Sparkles, color: 'text-purple-400' },
  navigation: { label: 'Navigation', icon: Navigation, color: 'text-blue-400' },
  editing: { label: 'Editing', icon: Edit3, color: 'text-emerald-400' },
  files: { label: 'Files', icon: FileCode, color: 'text-amber-400' },
  search: { label: 'Search', icon: Search, color: 'text-cyan-400' },
  panels: { label: 'Panels', icon: Layout, color: 'text-pink-400' },
  git: { label: 'Git', icon: GitBranch, color: 'text-orange-400' },
  debug: { label: 'Debug', icon: Bug, color: 'text-red-400' },
};

function ShortcutItem({ shortcut }: { shortcut: KeyboardShortcut }) {
  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-zinc-800/50">
      <span className="text-sm text-zinc-300">{shortcut.description}</span>
      <div className="flex items-center gap-1">
        {shortcut.keys.map((key, i) => (
          <kbd
            key={i}
            className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded bg-zinc-800 border border-zinc-700 text-xs font-mono text-zinc-300"
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  );
}

function CategorySection({ 
  category, 
  shortcuts 
}: { 
  category: ShortcutCategory; 
  shortcuts: KeyboardShortcut[] 
}) {
  const config = CATEGORY_CONFIG[category];
  const Icon = config.icon;

  if (shortcuts.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("h-4 w-4", config.color)} />
        <h3 className="text-sm font-medium text-zinc-200">{config.label}</h3>
        <span className="text-xs text-zinc-600">{shortcuts.length}</span>
      </div>
      <div className="space-y-0.5">
        {shortcuts.map((shortcut) => (
          <ShortcutItem key={shortcut.id} shortcut={shortcut} />
        ))}
      </div>
    </div>
  );
}

interface KeyboardShortcutsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsPanel({ isOpen, onClose }: KeyboardShortcutsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const shortcutsByCategory = getShortcutsByCategory();

  // Filter shortcuts based on search
  const filteredCategories = Object.entries(shortcutsByCategory).reduce(
    (acc, [category, shortcuts]) => {
      if (!searchQuery) {
        acc[category as ShortcutCategory] = shortcuts;
      } else {
        const filtered = shortcuts.filter(
          s => 
            s.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.keys.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()))
        );
        if (filtered.length > 0) {
          acc[category as ShortcutCategory] = filtered;
        }
      }
      return acc;
    },
    {} as Record<ShortcutCategory, KeyboardShortcut[]>
  );

  // Open with Cmd+/ or ?
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === '/' && (e.metaKey || e.ctrlKey)) || e.key === '?') {
        e.preventDefault();
        // Toggle would be handled by parent
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden p-0">
        <DialogHeader className="px-6 py-4 border-b border-zinc-800">
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Keyboard className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
              <p className="text-sm text-zinc-500">Master the keyboard for maximum productivity</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="px-6 py-3 border-b border-zinc-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search shortcuts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-600"
            />
          </div>
        </div>

        {/* Shortcuts list */}
        <ScrollArea className="flex-1 max-h-[50vh]">
          <div className="px-6 py-4">
            {/* AI shortcuts first - they're the most important! */}
            {filteredCategories.ai && (
              <CategorySection category="ai" shortcuts={filteredCategories.ai} />
            )}
            
            {/* Then the rest */}
            {(Object.keys(filteredCategories) as ShortcutCategory[])
              .filter(cat => cat !== 'ai')
              .map(category => (
                <CategorySection 
                  key={category} 
                  category={category} 
                  shortcuts={filteredCategories[category]} 
                />
              ))
            }

            {Object.keys(filteredCategories).length === 0 && (
              <div className="text-center py-8 text-zinc-500">
                No shortcuts found for "{searchQuery}"
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <Command className="h-3 w-3" />
                Press <kbd className="px-1 bg-zinc-800 rounded">?</kbd> anytime to show this panel
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Floating keyboard shortcut hint
 * Shows a single shortcut hint that fades out
 */
export function ShortcutHint({ 
  keys, 
  description, 
  onDismiss 
}: { 
  keys: string[]; 
  description: string; 
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in-0 slide-in-from-bottom-4">
      <div className="flex items-center gap-3 px-4 py-2 bg-zinc-900/95 backdrop-blur-md border border-zinc-800 rounded-full shadow-xl">
        <div className="flex items-center gap-1">
          {keys.map((key, i) => (
            <kbd
              key={i}
              className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded bg-zinc-800 border border-zinc-700 text-xs font-mono text-zinc-300"
            >
              {key}
            </kbd>
          ))}
        </div>
        <span className="text-sm text-zinc-400">{description}</span>
        <button onClick={onDismiss} className="text-zinc-600 hover:text-zinc-400">
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
